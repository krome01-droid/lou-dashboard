import {
  listAllPosts,
  createPost,
  uploadMedia,
  findOrCreateCategory,
  type WPPost,
} from "@/lib/wordpress/client"
import {
  requestArticle,
  requestImage,
  attendreImage,
  fetchCatalogue,
  formatArticle,
  isCromeConfigured,
  type ArticleRedige,
} from "@/lib/crome/client"
import { getTopKeywords } from "@/lib/google/search-console"
import { query, execute } from "@/lib/db/connection"

// Rédaction d'un article SEO/GEO, puis dépôt sur autoecolemagazine.fr.
//
// Jumelle de la tâche du même nom chez ANGÈLE, et volontairement construite à
// l'identique : CROME OS rédige (règles SEO/GEO, profil éditorial de la marque,
// clé Anthropic) et rend un verdict ; LOU dépose sur WordPress avec ses propres
// identifiants. Le hub n'a aucun accès au site.
//
// Ce que le hub sait de cette marque et que LOU n'a pas à répéter : c'est un
// MÉDIA, pas une auto-école. Le ton est journalistique, jamais promotionnel, et
// le profil éditorial du hub interdit de se présenter comme une auto-école ou de
// promettre un résultat à l'examen. Écrire ces règles ici aussi créerait deux
// vérités qui divergeraient à la première correction.
//
// ── La publication directe, et sa seule exception ────────────────────────────
// Les articles partent publiés. Le hub retient l'article — et lui seul — quand
// le rédacteur a signalé une affirmation « bloquante » (montant, délai, texte de
// loi, éligibilité) ou trop de points mineurs. Dans ce cas il est déposé en
// brouillon, et c'est le HUB qui alerte par Telegram : LOU n'a pas de canal à
// elle (ses envois passent par GoHighLevel, destinés aux abonnés, pas à Armel).

/** Longueur visée. En deçà, un article se fait mal citer ; au-delà, il se dilue. */
const LONGUEUR = 1300

/** La catégorie où atterrissent les articles écrits par la machine. */
const CATEGORIE = "Actualités"

/**
 * Nombre d'idées de veille examinées pour en retenir une. Les « high » passent
 * devant les « medium », et à priorité égale la plus récente gagne.
 */
const IDEES_EXAMINEES = 20

interface IdeeVeille {
  id: number
  titre: string
  angle: string
  sourcePrimaire: string | null
  priorite: string
}

/** L'angle est le premier paragraphe, entre l'en-tête et la rubrique suivante. */
function extraireAngle(markdown: string): string {
  const apres = markdown.replace(/^\s*\*\*[^*]*\*\*\s*/, "")
  const fin = apres.search(/\n\s*\*\*/)
  return (fin === -1 ? apres : apres.slice(0, fin)).trim()
}

function metaObjet(v: unknown): Record<string, unknown> {
  if (!v) return {}
  if (typeof v === "object") return v as Record<string, unknown>
  try {
    return JSON.parse(String(v)) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * La prochaine idée de veille non encore traitée.
 *
 * Le marquage passe par `meta_json` et NON par `status` : cette colonne est un
 * ENUM('draft','review','published','scheduled','failed') et une valeur hors
 * liste serait refusée — ou vidée en silence hors mode strict. Même piège que
 * les CHECK de la table sociale de STAN.
 */
async function prochaineIdeeVeille(): Promise<IdeeVeille | null> {
  let lignes: { id: number; title: string; content_markdown: string; meta_json: unknown }[]
  try {
    lignes = await query(
      `SELECT id, title, content_markdown, meta_json
       FROM wp_lou_content_log
       WHERE created_by = 'lou-veille'
         AND JSON_EXTRACT(meta_json, '$.traite_le') IS NULL
       ORDER BY created_at DESC
       LIMIT ${IDEES_EXAMINEES}`,
    )
  } catch (e) {
    console.warn(
      "[cron/redaction-seo] veille illisible:",
      e instanceof Error ? e.message.slice(0, 200) : e,
    )
    return null
  }

  const rang = (p: string) => (p === "high" ? 0 : p === "medium" ? 1 : 2)
  const idees = lignes.map((l) => {
    const meta = metaObjet(l.meta_json)
    return {
      id: Number(l.id),
      titre: l.title,
      angle: extraireAngle(l.content_markdown ?? ""),
      sourcePrimaire: (meta.source_primaire as string) ?? null,
      priorite: (meta.priority as string) ?? "low",
    }
  })
  // `sort` est stable : à priorité égale, l'ordre par date reste celui du SELECT.
  idees.sort((a, b) => rang(a.priorite) - rang(b.priorite))
  return idees.find((i) => i.angle.length > 0) ?? null
}

/** Marque l'idée comme traitée. Appelé APRÈS le dépôt : un échec doit pouvoir rejouer. */
async function marquerIdeeTraitee(id: number): Promise<void> {
  try {
    await execute(
      `UPDATE wp_lou_content_log
       SET meta_json = JSON_SET(COALESCE(meta_json, '{}'), '$.traite_le', ?)
       WHERE id = ?`,
      [new Date().toISOString(), id],
    )
  } catch (e) {
    // Non bloquant, mais bruyant : sans ce marquage la même idée reviendra au
    // prochain passage, et l'article serait écrit deux fois.
    console.error(
      "[cron/redaction-seo] marquage de l'idée de veille échoué:",
      e instanceof Error ? e.message.slice(0, 200) : e,
    )
  }
}

/**
 * La consigne qui accompagne une idée de veille.
 *
 * Le hub n'a AUCUN accès au web : il ne peut pas lire l'article de presse d'où
 * vient le signal, et l'événement est postérieur à ce qu'il connaît. Lui donner
 * un titre d'actualité sans garde-fou, c'est lui demander d'inventer la date
 * d'entrée en vigueur, le montant et le numéro du texte.
 */
function consigneVeille(i: IdeeVeille): string {
  return [
    "Cet article part d'un SIGNAL DE VEILLE, et non d'une source que tu aurais lue : tu n'as aucun accès au web, et l'événement est vraisemblablement postérieur à ce que tu connais.",
    "",
    `Titre de presse repéré : ${i.titre}`,
    `Angle proposé par la veille : ${i.angle}`,
    i.sourcePrimaire ? `Source primaire que le lecteur devra consulter : ${i.sourcePrimaire}` : "",
    "",
    "N'affirme AUCUN détail de cet événement qui ne figure pas ci-dessus : ni date d'entrée en vigueur, ni montant, ni numéro ou intitulé de texte, ni chiffre. Traite le sujet de fond que ce signal ouvre — l'état du droit, ce qui est stable, ce que le lecteur doit vérifier lui-même et où. Toute affirmation engageante que tu conserverais malgré tout doit partir dans « verifications ».",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * La zone où un mot-clé mérite un article : le site apparaît déjà dessus mais
 * hors des premiers résultats. Écrire sur une requête où l'on est 15e rapporte
 * davantage qu'inventer un sujet sur lequel on n'existe pas.
 */
const POSITION_MIN = 6
const POSITION_MAX = 40
/** En dessous, l'échantillon est trop petit pour dire quoi que ce soit. */
const IMPRESSIONS_MIN = 25

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Retire les balises d'un titre WordPress rendu, entités comprises. */
function texteNu(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/**
 * Assemble le HTML déposé dans WordPress.
 *
 * L'ordre n'est pas cosmétique : la réponse directe est en tête parce que c'est
 * le passage qu'un moteur de réponse lèvera tel quel. Placée après le chapô,
 * elle perdrait cette fonction.
 */
function assembler(a: ArticleRedige, jsonld: unknown[]): string {
  const morceaux: string[] = [
    `<p class="reponse-directe"><strong>${echapper(a.reponse_directe)}</strong></p>`,
    `<p>${echapper(a.chapo)}</p>`,
    a.corps_html,
  ]

  if (a.points_cles?.length) {
    morceaux.push(
      "<h2>À retenir</h2>",
      `<ul>${a.points_cles.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>`,
    )
  }

  if (a.faq?.length) {
    morceaux.push("<h2>Questions fréquentes</h2>")
    for (const q of a.faq) {
      morceaux.push(`<h3>${echapper(q.question)}</h3>`, `<p>${echapper(q.reponse)}</p>`)
    }
  }

  if (jsonld?.length) {
    // `<` échappé : sans cela, un `</script>` présent dans une réponse de FAQ
    // fermerait la balise et laisserait du JSON en clair dans la page.
    morceaux.push(
      `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>`,
    )
  }

  return morceaux.join("\n\n")
}

/**
 * Choisit le mot-clé à viser à partir de la Search Console.
 *
 * Le diagnostic est rendu avec le choix : sans lui, la sélection stratégique se
 * dégrade en choix libre sans que rien ne le signale, et on croit qu'elle
 * fonctionne.
 */
async function choisirMotCle(
  titres: string[],
): Promise<{ motCle: string | null; diagnostic: string }> {
  let mots: Awaited<ReturnType<typeof getTopKeywords>>
  try {
    mots = await getTopKeywords(200)
  } catch (e) {
    const raison = e instanceof Error ? e.message.slice(0, 200) : "injoignable"
    console.warn("[cron/redaction-seo] Search Console indisponible:", raison)
    return { motCle: null, diagnostic: `Search Console injoignable : ${raison}` }
  }

  const normalises = titres.map((t) => t.toLowerCase())
  const retenus = mots.filter(
    (m) =>
      m.position >= POSITION_MIN &&
      m.position <= POSITION_MAX &&
      m.impressions >= IMPRESSIONS_MIN &&
      // Une requête de marque ne se travaille pas par un article.
      !/auto[- ]?école magazine|autoecolemagazine/i.test(m.keyword) &&
      !normalises.some((t) => t.includes(m.keyword.toLowerCase())),
  )
  const candidat = [...retenus].sort((a, b) => b.impressions - a.impressions)[0]

  if (!candidat) {
    return {
      motCle: null,
      diagnostic: `${mots.length} requêtes remontées, aucune entre la ${POSITION_MIN}e et la ${POSITION_MAX}e place avec ${IMPRESSIONS_MIN}+ impressions et non déjà traitée.`,
    }
  }
  return {
    motCle: candidat.keyword,
    diagnostic: `${retenus.length} requêtes éligibles sur ${mots.length} ; retenue : position ${candidat.position}, ${candidat.impressions} impressions.`,
  }
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  // `?dry_run=1` : tout se déroule, rien n'est déposé sur WordPress. C'est
  // l'outil de vérification, jamais un réglage du cron.
  const dryRun = params.get("dry_run") === "1"
  const sujetImpose = params.get("sujet") ?? undefined
  const motCleImpose = params.get("mot_cle") ?? undefined
  const forcerRelecture = params.get("relire") === "1"
  // `?source=veille` : partir de la meilleure idée de veille non traitée plutôt
  // que de la Search Console. C'est l'autre voie éditoriale — l'actualité —
  // là où la Search Console sert le fond. Si aucune idée n'est disponible, on
  // retombe silencieusement sur la Search Console : un passage doit toujours
  // produire un article.
  const sourceVeille = params.get("source") === "veille"

  try {
    if (!isCromeConfigured()) {
      return Response.json(
        { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
        { status: 500 },
      )
    }

    // Les titres déjà en ligne servent deux fois : le hub s'en sert pour ne pas
    // réécrire l'existant (deux articles proches se cannibalisent et perdent
    // leur classement TOUS LES DEUX), et le choix du mot-clé pour écarter ce qui
    // est déjà traité.
    // « publish,draft » et non « publish » : un article retenu pour relecture
    // reste en brouillon, parfois des jours. L'omettre a fait réécrire deux fois
    // le même titre à deux passages d'affilée — exactement la cannibalisation
    // que cette liste sert à éviter.
    const existants = await listAllPosts("publish,draft").catch(() => [] as WPPost[])
    const titres = existants.map((p) => texteNu(p.title.rendered)).slice(0, 200)

    // L'angle vient, par ordre de priorité : du paramètre, de la veille, puis
    // de la Search Console.
    const idee =
      sourceVeille && !sujetImpose && !motCleImpose ? await prochaineIdeeVeille() : null
    const sujet = sujetImpose ?? (idee ? `${idee.titre}` : undefined)
    const note = idee ? consigneVeille(idee) : undefined

    // Un mot-clé, un sujet imposé ou une idée de veille court-circuitent la
    // Search Console : l'angle est déjà décidé.
    const choix =
      motCleImpose || sujet
        ? {
            motCle: null,
            diagnostic: idee
              ? `idée de veille #${idee.id} (priorité ${idee.priorite})`
              : "angle imposé par l'appelant",
          }
        : await choisirMotCle(titres)
    const motCle = motCleImpose ?? choix.motCle ?? undefined

    // Le catalogue du studio se lit AVANT la rédaction, et son résultat sert
    // deux fois : le rédacteur choisit la scène qui montre ce dont il parle, et
    // l'illustration réclame ensuite un format que la marque possède vraiment.
    // Lu après, comme il l'était, `scene_visuel` ne pouvait que revenir vide et
    // chaque article de la marque recevait la même scène par défaut.
    const { scenes, formats } = await fetchCatalogue()

    const rendu = await requestArticle({
      sujet,
      note,
      mot_cle: motCle,
      // Le hub plafonne à 60 : on lui donne les plus récents, pas les 200.
      titres_existants: titres.slice(0, 60),
      longueur: LONGUEUR,
      forcer_relecture: forcerRelecture,
      scenes,
    })

    if (rendu.error || !rendu.article || !rendu.publication) {
      console.error("[cron/redaction-seo] rédaction:", rendu.error ?? rendu.reason)
      return Response.json(
        { status: "error", step: "crome_redaction", error: rendu.error ?? rendu.reason },
        { status: 502 },
      )
    }

    const article = rendu.article
    const verdict = rendu.publication
    const statut: "publish" | "draft" =
      verdict.statut_conseille === "publier" ? "publish" : "draft"

    // Le visuel. Non bloquant : un article sans vignette reste un article, et la
    // rédaction a déjà coûté plusieurs minutes de modèle.
    let imageUrl: string | null = null
    let mediaId: number | undefined
    let imageErreur: string | undefined
    if (!dryRun) {
      const scene = scenes.some((s) => s.key === article.scene_visuel)
        ? article.scene_visuel
        : undefined
      // 3:2 est le format « Blog/Article » — un 1:1 serait rogné en vignette et
      // un 9:16 illisible en tête d'article. Mais on ne le demande que si la
      // marque l'a : c'est en réclamant un 3:2 que cette marque n'avait pas que
      // le premier article de LOU est sorti sans vignette.
      let media = await requestImage(scene, formatArticle(formats))
      // L'attente du studio est bornée à 45 s et le 3:2 la dépasse presque
      // toujours : sans cette reprise, l'image aboutissait quelques secondes
      // après qu'on l'ait déclarée perdue.
      if (!media.image_url && media.generation_id && media.status !== "error") {
        media = await attendreImage(media.generation_id)
      }
      if (media.image_url) {
        imageUrl = media.image_url
        const extension = media.image_url.toLowerCase().includes(".png") ? "png" : "jpg"
        const id = await uploadMedia(media.image_url, `${article.slug}.${extension}`)
        if (id) mediaId = id
        else imageErreur = "médiathèque WordPress : téléversement refusé"
      } else {
        imageErreur = media.error ?? media.reason ?? `studio : ${media.status ?? "sans réponse"}`
      }
      if (imageErreur) console.warn("[cron/redaction-seo] pas de vignette:", imageErreur)
    }

    const contenu = assembler(article, rendu.jsonld ?? [])

    if (dryRun) {
      return Response.json({
        status: "ok",
        dry_run: true,
        publie: false,
        titre: article.titre,
        slug: article.slug,
        mot_cle: article.mot_cle_principal,
        mot_cle_source: motCleImpose ? "paramètre" : motCle ? "search-console" : "moteur",
        mot_cle_diagnostic: choix.diagnostic,
        angle_source: idee ? "veille" : sujetImpose ? "paramètre" : motCle ? "search-console" : "moteur",
        veille_id: idee?.id ?? null,
        statut_conseille: verdict.statut_conseille,
        // La scène retenue par le rédacteur. Vide = scène par défaut de la marque :
        // c'est le signal que le catalogue n'a pas été lu ou qu'aucune scène ne
        // collait, et non un détail cosmétique.
        scene: article.scene_visuel || null,
        motif: verdict.motif,
        bloquants: verdict.bloquants,
        mineurs: verdict.mineurs,
        longueur_html: contenu.length,
        nb_faq: article.faq?.length ?? 0,
      })
    }

    // Une catégorie absente ne doit pas coûter l'article : on dépose sans.
    const categorie = await findOrCreateCategory(CATEGORIE).catch(() => null)

    const depose = await createPost({
      title: article.titre,
      slug: article.slug,
      content: contenu,
      excerpt: article.meta_description,
      status: statut,
      ...(categorie ? { categories: [categorie] } : {}),
      ...(mediaId ? { featured_media: mediaId } : {}),
    })

    // L'idée n'est marquée qu'ici, une fois l'article réellement déposé : un
    // échec en amont doit pouvoir rejouer la même idée au passage suivant.
    if (idee) await marquerIdeeTraitee(idee.id)

    // WordPress retire les balises `<script>` pour les comptes sans le droit
    // `unfiltered_html`. Le dire plutôt que laisser croire aux données
    // structurées : une FAQ non balisée ne remonte pas dans les aperçus IA.
    const jsonldConserve = (depose.content?.rendered ?? "").includes("application/ld+json")

    // Le hub a déjà alerté (ou non) au moment du verdict. On rapporte ce qu'il
    // dit, pour qu'un « retenu » sans alerte partie se voie.
    const alerte =
      statut === "publish"
        ? "sans objet (article publié)"
        : rendu.alerte?.envoyee
          ? "Telegram, envoyée par le hub"
          : `NON ENVOYÉE — ${rendu.alerte?.erreur ?? "le hub n'a pas alerté"}`
    if (statut === "draft" && !rendu.alerte?.envoyee) {
      console.error("[cron/redaction-seo] brouillon retenu sans alerte :", rendu.alerte?.erreur)
    }

    return Response.json({
      status: "ok",
      publie: statut === "publish",
      wp_id: depose.id,
      url: depose.link,
      titre: article.titre,
      mot_cle: article.mot_cle_principal,
      mot_cle_source: motCleImpose ? "paramètre" : motCle ? "search-console" : "moteur",
      mot_cle_diagnostic: choix.diagnostic,
      angle_source: idee ? "veille" : sujetImpose ? "paramètre" : motCle ? "search-console" : "moteur",
      veille_id: idee?.id ?? null,
      statut_conseille: verdict.statut_conseille,
      // La scène retenue par le rédacteur. Vide = scène par défaut de la marque :
      // c'est le signal que le catalogue n'a pas été lu ou qu'aucune scène ne
      // collait, et non un détail cosmétique.
      scene: article.scene_visuel || null,
      motif: verdict.motif,
      bloquants: verdict.bloquants,
      mineurs: verdict.mineurs,
      jsonld_conserve: jsonldConserve,
      image_url: imageUrl,
      // Distinct d'un `null` muet : dire pourquoi il n'y a pas de vignette.
      image_error: mediaId ? undefined : imageErreur,
      alerte_relecture: alerte,
    })
  } catch (err) {
    console.error("[cron/redaction-seo]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur rédaction" },
      { status: 500 },
    )
  }
}
