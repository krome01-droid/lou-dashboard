import Anthropic from "@anthropic-ai/sdk"
import { listPosts, listCategories, type WPPost } from "@/lib/wordpress/client"
import {
  fetchCatalogue,
  formatPost,
  requestImage,
  submitPost,
  isCromeConfigured,
  type SubmitResult,
} from "@/lib/crome/client"
import { execute } from "@/lib/db/connection"
import { enregistrerPublication, getPublicationsRecentes } from "@/lib/db/publications"
import {
  choisirSujet,
  combinaisonsRecentes,
  menu,
  visuelValide,
  type Candidat,
} from "@/lib/social/rotation"

/**
 * La publication sociale de LOU : proposer, jamais publier.
 *
 * Un passage = un post. Le palier plafonne les publications machine à 2 par
 * jour : en produire davantage n'empilerait que des refus de quota, ou
 * noierait la file de validation d'Armel.
 *
 * LOU ne choisit pas ses canaux : `platforms` est omis côté client, et le hub
 * route vers les comptes réellement connectés pour autoecolemagazine.fr. C'est
 * lui qui détient la carte des intégrations, pas l'agent.
 *
 * ── Ce qui a changé le 16/09/2026, et pourquoi ───────────────────────────────
 * La tâche ne connaissait qu'un registre — les articles des 30 derniers jours,
 * avec une garde par article relue dans `wp_lou_social_posts`. Elle ne se
 * répétait donc pas ; elle se taisait dès que la rédaction s'arrêtait : rien
 * du 28/08 au 09/09. Le magazine a pourtant un second registre, celui que ses
 * lecteurs cherchent : les guides des auto-écoles d'une ville.
 *
 * Transposé de MAYA (commit 830cdaf), avec les registres du magazine :
 *
 *   1. **Deux registres.** Les articles éditoriaux et les guides de ville —
 *      la catégorie `villes`, plus tout article dont le slug commence par
 *      `auto-ecoles-` (Strasbourg et Toulouse sont rangés en « Actualités »,
 *      les petites villes en « Guides »). `lib/social/rotation` tient la part
 *      de chacun et écarte ce qui vient de partir, sur la foi de
 *      `wp_lou_publications`.
 *   2. **Le visuel se choisit en entier.** Scène, lumière, style et lieu, en
 *      évitant ce que les derniers posts ont montré. Un axe hors catalogue est
 *      laissé vide et le studio le tire au sort. L'image de l'article n'est
 *      plus reprise : c'est une couverture 3:2, et un post de fil se lit en
 *      4:5.
 *
 * Ce que la tâche NE fait toujours pas : publier sans matière. Si aucun
 * registre ne fournit de sujet, elle ne publie rien.
 */

const AGENT_LABEL = "LOU"
const MODEL = "claude-sonnet-4-6"

/** Articles éditoriaux gardés en rotation. Au-delà, un article n'est plus une
 *  actualité — les guides de ville, eux, n'expirent pas. */
const ARTICLES_MAX = 40

export const maxDuration = 300

/** Un guide de ville se reconnaît à son slug quand sa catégorie ne le dit pas. */
function slugDeVille(slug: string): boolean {
  return /^auto-e?coles-/.test(slug)
}

/**
 * Le résumé de l'article — la seule matière que le modèle a le droit
 * d'utiliser. Sans lui, il n'a qu'un titre et comble les trous.
 */
function resume(html: string, max = 500): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // `?review_only=1` : tout se déroule normalement, mais le post s'arrête en
  // file de validation. Le cron ne le passe jamais — c'est un outil de
  // vérification humaine, pas un réglage de production.
  const reviewOnly = new URL(req.url).searchParams.get("review_only") === "1"

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ status: "error", error: "ANTHROPIC_API_KEY manquant" }, { status: 500 })
    }
    if (!isCromeConfigured()) {
      return Response.json(
        { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
        { status: 500 },
      )
    }

    // La catégorie `villes` se résout par son slug, pas par un id figé : un id
    // recopié d'un site à l'autre est exactement le genre de chose qui se
    // périme sans prévenir.
    const categories = await listCategories().catch(() => [])
    const idVilles = categories.find((c) => c.slug === "villes")?.id

    const [recents, guides, historique, catalogue] = await Promise.all([
      listPosts({ per_page: ARTICLES_MAX, status: "publish", orderby: "date", order: "desc" }).catch(
        (e) => {
          console.warn("[cron/social-auto] articles indisponibles:", e instanceof Error ? e.message : e)
          return [] as WPPost[]
        },
      ),
      idVilles
        ? listPosts({
            per_page: 100,
            status: "publish",
            categories: [idVilles],
            orderby: "date",
            order: "desc",
          }).catch((e) => {
            console.warn("[cron/social-auto] guides indisponibles:", e instanceof Error ? e.message : e)
            return [] as WPPost[]
          })
        : Promise.resolve([] as WPPost[]),
      getPublicationsRecentes(40),
      fetchCatalogue(),
    ])

    // ── Les candidats ────────────────────────────────────────────────────────
    //
    // L'ordre d'arrivée sert de départage entre deux sujets jamais promus : le
    // tri de la rotation est stable, et chaque registre est trié du plus
    // récent au plus ancien. Un même article ne figure qu'une fois : un guide
    // de ville récent est un guide, pas un article.
    const candidats: Candidat[] = []
    const vus = new Set<string>()
    for (const p of [...recents, ...guides].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (p.status !== "publish" || !p.slug || vus.has(p.slug)) continue
      vus.add(p.slug)
      const ville = (idVilles != null && p.categories.includes(idVilles)) || slugDeVille(p.slug)
      const titre = resume(p.title.rendered, 200)
      candidats.push({
        angle: ville ? "ville" : "article",
        sujet: p.slug,
        titre,
        lien: p.link,
        matiere: [
          ville ? `Guide des auto-écoles d'une ville : ${titre}` : `Article du magazine : ${titre}`,
          p.excerpt?.rendered ? `Résumé : ${resume(p.excerpt.rendered)}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      })
    }

    const choix = choisirSujet(candidats, historique)
    if (!choix) {
      return Response.json({ status: "ok", message: "Aucun article disponible à promouvoir", submitted: 0 })
    }

    // Le catalogue vient du studio : LOU choisit parmi ce qui existe, elle
    // n'invente pas. Injoignable, les listes sont vides et le studio applique
    // ses propres tirages.
    const scenesDuMenu = catalogue.scenes.length
      ? catalogue.scenes
          .map(
            (s) =>
              `- ${s.key} : ${s.depicts}` +
              (s.places?.length ? ` [lieux possibles : ${s.places.join(", ")}]` : ""),
          )
          .join("\n")
      : "(catalogue indisponible — omets les champs de visuel)"

    const aEviter = combinaisonsRecentes(historique)

    const consigneRegistre =
      choix.angle === "ville"
        ? `Tu présentes le guide des auto-écoles d'une ville. La ville vient du
titre ; tu ne cites aucune auto-école par son nom, aucun tarif, aucun taux de
réussite, aucun nombre d'établissements — tu invites à consulter le guide.`
        : `Tu donnes envie de lire UN article du magazine.`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Tu es ${AGENT_LABEL}, community manager d'Auto-école Magazine (autoecolemagazine.fr).

Matière (ta seule source) :
${choix.matiere}

${consigneRegistre}

Rédige 1 post social publiable tel quel sur une page professionnelle (Facebook
ou LinkedIn — écris donc un texte qui fonctionne sur les deux : pas de « lien
en bio », pas de format propre à un réseau).

N'écris pas le lien dans ton texte : il sera ajouté juste en dessous.

Choisis aussi le visuel, en quatre axes.

SCÈNES (ce que montre l'image) :
${scenesDuMenu}

LUMIÈRES :
${menu(catalogue.lights)}

STYLES :
${menu(catalogue.styles)}

LIEUX :
${menu(catalogue.places)}

Format JSON :
{ "contenu": string, "hashtags": string[], "scene": string, "lumiere": string, "style": string, "lieu": string }

Chaque valeur de visuel doit être exactement l'une des clés ci-dessus. Le lieu
doit figurer parmi les « lieux possibles » de la scène retenue quand la scène en
indique : il est ajouté devant le décor de la scène, donc une salle de code sur
une rocade se contredit.
${
  aEviter
    ? `
NE REPRENDS PAS LE VISUEL DES DERNIERS POSTS. Voici ce qui vient d'être publié :
${aEviter}

Choisis autre chose — au minimum une lumière ET un style différents du dernier.
Une page dont toutes les images se ressemblent se repère comme automatique.
Reste juste par rapport au sujet : un visuel hors sujet serait pire qu'un visuel
déjà vu.`
    : ""
}

RÈGLE ABSOLUE — ce que tu n'as pas le droit d'affirmer.
Ta seule source est la matière ci-dessus. Tout le reste, tu ne le sais pas.
N'écris donc jamais :
- de chiffres, statistiques, pourcentages, tarifs ou délais qui ne figurent pas
  dans la matière,
- de villes autres que celle de la matière, de zones de couverture ou de nombre
  d'auto-écoles,
- de dates, d'échéances ou de changements de réglementation,
- de noms de partenaires, de clients, d'entreprises ou d'auto-écoles.
Un post d'un agent voisin a déjà annoncé « Déjà actif à Strasbourg, Rennes,
Lille » : c'était faux, inventé de toutes pièces, et il a fallu l'intercepter
avant publication. Une seule affirmation fausse sur une page publique coûte
plus cher que dix posts réussis ne rapportent. Dans le doute, reste sur ce que
la matière dit et invite à lire.

Ton engageant et accessible. Cible : 17-25 ans. 100 à 200 caractères hors
hashtags. 3 à 5 hashtags maximum, en français, sans mélange franglais. Au plus
un émoji, ou aucun.`,
        },
      ],
    })

    const texte = response.content[0].type === "text" ? response.content[0].text : ""
    let redige: {
      contenu?: string
      hashtags?: string[]
      scene?: string
      lumiere?: string
      style?: string
      lieu?: string
    } | null = null
    try {
      const bloc = texte.match(/\{[\s\S]*\}/)
      if (bloc) redige = JSON.parse(bloc[0])
    } catch {
      redige = null
    }
    if (!redige?.contenu) {
      return Response.json({ status: "error", error: "Réponse IA non parsable" }, { status: 502 })
    }

    // Le hub n'ajoute aucun lien : il doit vivre dans le texte, sinon la page
    // qu'on promeut devient inatteignable depuis le post.
    const hashtags = (redige.hashtags ?? [])
      .map((h) => "#" + String(h).replace(/^#+/, "").trim())
      .filter((h) => h.length > 1)
    const contenu = [redige.contenu.trim(), choix.lien, hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n")

    // Une clé hors catalogue serait refusée par le studio, et un lieu que la
    // scène n'accepte pas produirait une image qui se contredit. Un axe écarté
    // n'est pas remplacé par un défaut : laissé vide, le studio le tire au sort.
    const visuel = visuelValide(redige, catalogue)

    const media = await requestImage({
      ...visuel,
      format: formatPost(catalogue.formats),
      // Le cadrage d'un post de fil : sujet unique, lisible en tout petit.
      destination: "post_social",
    })
    const imageUrl = media.image_url ?? null
    if (!imageUrl) {
      console.warn("[cron/social-auto] pas de visuel:", media.error ?? media.reason ?? "inconnu")
    }

    // CROME OS décide et publie.
    const resultat: SubmitResult = await submitPost(contenu, imageUrl ? [imageUrl] : [], reviewOnly)

    const visuelRetenu = {
      scene: media.scene ?? visuel.scene ?? null,
      lumiere: media.light ?? visuel.light ?? null,
      style: media.style ?? visuel.style ?? null,
      lieu: media.place ?? visuel.place ?? null,
    }

    // Trace locale, pour le calendrier du dashboard — même quand CROME OS
    // refuse ou est injoignable, le texte rédigé ne doit pas être perdu.
    const statut = resultat.published ? "published" : resultat.error ? "error" : "pending_review"
    try {
      await execute(
        `INSERT INTO wp_lou_social_posts (platform, scheduled_at, status, caption, media_urls)
         VALUES ('social', NULL, ?, ?, ?)`,
        [
          statut,
          contenu,
          JSON.stringify({
            angle: choix.angle,
            sujet: choix.sujet,
            link: choix.lien,
            media: imageUrl,
            media_source: imageUrl ? "studio" : null,
            crome_post_id: resultat.post_id ?? null,
          }),
        ],
      )
    } catch (e) {
      console.error("[cron/social-auto] copie locale:", e instanceof Error ? e.message : e)
    }

    if (resultat.error) {
      console.error("[cron/social-auto] soumission CROME OS:", resultat.error)
      return Response.json(
        { status: "error", step: "crome_submit", error: resultat.error, angle: choix.angle, sujet: choix.sujet },
        { status: 502 },
      )
    }

    // Le sujet est consommé dès qu'il est SOUMIS, pas seulement s'il est publié :
    // retenu pour quota ou mis en file de validation, il a quand même servi, et
    // le reproposer au passage suivant recréerait la répétition.
    //
    // Les axes consignés sont ceux que le studio a réellement retenus : quand
    // LOU en laisse un vide, c'est le studio qui tire, et sans son retour la
    // mémoire ne saurait pas ce qui vient d'être montré.
    await enregistrerPublication({
      angle: choix.angle,
      sujet: choix.sujet,
      titre: choix.titre,
      lien: choix.lien,
      ...visuelRetenu,
      post_id: resultat.post_id ?? null,
    })

    return Response.json({
      status: "ok",
      submitted: 1,
      angle: choix.angle,
      sujet: choix.sujet,
      titre: choix.titre,
      lien: choix.lien,
      post_id: resultat.post_id,
      published: resultat.published ?? false,
      duplicate: resultat.duplicate ?? false,
      // Le motif quand rien n'est parti : quota, fenêtre calme, palier…
      reason: resultat.reason,
      review_only: reviewOnly,
      visuel: visuelRetenu,
      image_url: imageUrl,
      // Distinct de `null` sans explication : dire pourquoi il n'y a pas d'image.
      image_error: imageUrl ? undefined : (media.error ?? media.reason),
    })
  } catch (err) {
    console.error("[cron/social-auto]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur social auto" },
      { status: 500 },
    )
  }
}
