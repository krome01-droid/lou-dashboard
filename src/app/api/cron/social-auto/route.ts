import Anthropic from "@anthropic-ai/sdk"
import { listPosts, getMediaUrl } from "@/lib/wordpress/client"
import { fetchScenes, requestImage, submitPost, isCromeConfigured, type SubmitResult } from "@/lib/crome/client"
import { execute, query } from "@/lib/db/connection"

// Promotion d'un article, puis soumission à CROME OS.
//
// Cette tâche programmait jusqu'ici directement dans GoHighLevel : LOU décidait
// seule de ce qui partait, à quelle heure, sur quel réseau, sans quota ni
// relecture, et l'écosystème n'en gardait aucune trace. Elle propose désormais
// à CROME OS, qui décide (palier d'autonomie, quota, fenêtre calme, canaux
// réellement branchés) et publie via Postiz.
//
// LOU ne choisit pas ses canaux : `platforms` est omis côté client, et le hub
// route vers les comptes réellement connectés pour autoecolemagazine.fr. C'est
// lui qui détient la carte des intégrations, pas l'agent.
//
// Un seul article par passage. Le palier plafonne les publications machine à
// 2 par jour : en produire davantage n'empilerait que des refus de quota, ou
// noierait la file de validation d'Armel.

const AGENT_LABEL = "LOU"
const MAX_AGE_DAYS = 30

/** `datetime` MySQL : un ISO 8601 avec son « T » et son « Z » ne se compare pas. */
function toMysqlDatetime(iso: string): string {
  return iso.slice(0, 19).replace("T", " ")
}

/**
 * Le résumé de l'article — la seule matière que le modèle a le droit
 * d'utiliser. Sans lui, il n'a qu'un titre et comble les trous.
 */
function resume(html: string, max = 500): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|quot|#\d+|[a-z]+);/gi, " ")
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

    const since = new Date(Date.now() - MAX_AGE_DAYS * 24 * 3600_000).toISOString()

    // 1. Tenter les articles publiés dans les 30 derniers jours.
    let posts = await listPosts({
      per_page: 30,
      status: "publish",
      after: since,
      orderby: "date",
      order: "desc",
    })
    let sourceWindow: "30j" | "recycle" = "30j"

    // 2. Fallback : recycler les 30 derniers articles publiés si la production est en pause.
    if (posts.length === 0) {
      posts = await listPosts({ per_page: 30, status: "publish", orderby: "date", order: "desc" })
      sourceWindow = "recycle"
    }

    if (posts.length === 0) {
      return Response.json({ status: "ok", message: "Aucun article disponible à promouvoir", submitted: 0 })
    }

    const recents = posts
      .filter((p) => p.date >= since)
      .sort((a, b) => (a.date < b.date ? 1 : -1))

    // Articles déjà promus cette fenêtre. L'ancienne requête lisait une colonne
    // `meta_json` qui n'existe pas dans `wp_lou_social_posts` : elle levait à
    // chaque passage, l'erreur était avalée, et LOU repromouvait indéfiniment
    // les mêmes articles. On relit donc la colonne réellement écrite.
    const promus = new Set<number>()
    try {
      const rows = await query<{ media_urls: string | null }>(
        "SELECT media_urls FROM wp_lou_social_posts WHERE created_at >= ?",
        [toMysqlDatetime(since)],
      )
      for (const row of rows) {
        if (!row.media_urls) continue
        try {
          const meta = JSON.parse(row.media_urls) as { wp_post_id?: number; crome_post_id?: string | null }
          // Promu veut dire « CROME OS l'a accepté », pas « on a essayé ». Sans
          // cette condition, une semaine de hub injoignable consommerait tous
          // les articles récents sans qu'aucun ne soit jamais publié.
          if (meta?.wp_post_id && meta.crome_post_id) promus.add(meta.wp_post_id)
        } catch {
          // Ligne écrite avant ce format : elle ne dédoublonne rien, tant pis.
        }
      }
    } catch (e) {
      // Base injoignable : mieux vaut risquer un doublon que ne rien publier.
      // CROME OS refuse de toute façon un texte identique dans les 24 h.
      console.warn("[cron/social-auto] déduplication indisponible:", e instanceof Error ? e.message : e)
    }

    let article = recents.find((p) => !promus.has(p.id))

    // Si tous les articles récents ont déjà été promus, recycler le plus récent
    // pour éviter un canal à 0 publication quand la production est en pause.
    if (!article && posts.length > 0) {
      article = posts
        .filter((p) => !promus.has(p.id))
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    }

    if (!article) {
      return Response.json({
        status: "ok",
        message: "Tous les articles disponibles ont déjà été promus",
        submitted: 0,
      })
    }

    // Le catalogue vient du studio : LOU choisit une scène existante, elle n'en
    // invente pas. Injoignable, la liste est vide et la scène par défaut
    // s'appliquera.
    const scenes = await fetchScenes()
    const menuScenes = scenes.length
      ? scenes.map((s) => `- ${s.key} : ${s.depicts}`).join("\n")
      : "(catalogue indisponible — omets le champ scene)"

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Tu es ${AGENT_LABEL}, community manager d'Auto-école Magazine (autoecolemagazine.fr).

Article à promouvoir :
Titre : "${article.title.rendered}"
Résumé : ${resume(article.content.rendered) || "(non disponible)"}

Rédige 1 post social qui donne envie de lire cet article, publiable tel quel
sur une page professionnelle (Facebook ou LinkedIn — écris donc un texte qui
fonctionne sur les deux : pas de « lien en bio », pas de format propre à un
réseau).

N'écris pas le lien dans ton texte : il sera ajouté juste en dessous.

Choisis aussi le visuel qui accompagnera ce texte, parmi ces scènes :
${menuScenes}

Format JSON :
{ "contenu": string, "hashtags": string[], "scene": string }

Le champ "scene" doit être exactement l'une des clés ci-dessus, celle dont
l'image illustre le mieux ton texte.

RÈGLE ABSOLUE — ce que tu n'as pas le droit d'affirmer.
Ta seule source est le titre et le résumé ci-dessus. Tout le reste, tu ne le
sais pas. N'écris donc jamais :
- de chiffres, statistiques, pourcentages, tarifs ou délais qui ne figurent pas
  dans le résumé,
- de villes, de zones de couverture ou de nombre d'auto-écoles,
- de dates, d'échéances ou de changements de réglementation,
- de noms de partenaires, de clients ou d'entreprises.
Un post d'un agent voisin a déjà annoncé « Déjà actif à Strasbourg, Rennes,
Lille » : c'était faux, inventé de toutes pièces, et il a fallu l'intercepter
avant publication. Une seule affirmation fausse sur une page publique coûte
plus cher que dix posts réussis ne rapportent. Dans le doute, reste sur ce que
l'article dit et invite à le lire.

Ton engageant et accessible. Cible : 17-25 ans. 100 à 200 caractères hors
hashtags. 3 à 5 hashtags maximum, en français, sans mélange franglais.`,
        },
      ],
    })

    const texte = response.content[0].type === "text" ? response.content[0].text : ""
    let redige: { contenu?: string; hashtags?: string[]; scene?: string } | null = null
    try {
      const bloc = texte.match(/\{[\s\S]*\}/)
      if (bloc) redige = JSON.parse(bloc[0])
    } catch {
      redige = null
    }
    if (!redige?.contenu) {
      return Response.json({ status: "error", error: "Réponse IA non parsable" }, { status: 502 })
    }

    // Le hub n'ajoute aucun lien : il doit vivre dans le texte, sinon l'article
    // qu'on promeut devient inatteignable depuis le post.
    const hashtags = (redige.hashtags ?? [])
      .map((h) => "#" + String(h).replace(/^#+/, "").trim())
      .filter((h) => h.length > 1)
    const contenu = [redige.contenu.trim(), article.link, hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n")

    // Une scène hors catalogue serait refusée par le studio : on préfère laisser
    // la valeur par défaut s'appliquer plutôt que perdre le visuel.
    const choisie = redige.scene
    const scene = scenes.some((s) => s.key === choisie) ? choisie : undefined

    // L'image de l'article d'abord : elle montre le sujet réel, elle est déjà
    // payée et déjà validée. Le studio n'intervient que si l'article n'en a pas.
    let imageUrl: string | null = null
    let imageOrigine: "article" | "studio" | null = null
    let imageErreur: string | undefined

    if (article.featured_media) {
      imageUrl = (await getMediaUrl(article.featured_media).catch(() => null)) ?? null
      if (imageUrl) imageOrigine = "article"
    }
    if (!imageUrl) {
      const media = await requestImage(scene)
      if (media.image_url) {
        imageUrl = media.image_url
        imageOrigine = "studio"
      } else {
        imageErreur = media.error ?? media.reason ?? "inconnu"
        console.warn("[cron/social-auto] pas de visuel:", imageErreur)
      }
    }

    // CROME OS décide et publie.
    const resultat: SubmitResult = await submitPost(contenu, imageUrl ? [imageUrl] : [], reviewOnly)

    // Trace locale — même quand CROME OS refuse ou est injoignable, le texte
    // rédigé ne doit pas être perdu, et l'article doit compter comme promu pour
    // que le prochain passage en choisisse un autre. Le statut dit ce qui s'est
    // réellement passé, plutôt que « scheduled » quoi qu'il arrive.
    const statut = resultat.published
      ? "published"
      : resultat.error
        ? "error"
        : "pending_review"
    try {
      await execute(
        `INSERT INTO wp_lou_social_posts (platform, scheduled_at, status, caption, media_urls)
         VALUES ('social', NULL, ?, ?, ?)`,
        [
          statut,
          contenu,
          JSON.stringify({
            wp_post_id: article.id,
            link: article.link,
            media: imageUrl,
            media_source: imageOrigine,
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
        { status: "error", step: "crome_submit", error: resultat.error, wp_post_id: article.id },
        { status: 502 },
      )
    }

    return Response.json({
      status: "ok",
      source: sourceWindow,
      submitted: 1,
      wp_post_id: article.id,
      post_id: resultat.post_id,
      published: resultat.published ?? false,
      duplicate: resultat.duplicate ?? false,
      reason: resultat.reason,
      review_only: reviewOnly,
      scene: scene ?? null,
      image_url: imageUrl,
      image_source: imageOrigine,
      image_error: imageUrl ? undefined : imageErreur,
    })
  } catch (err) {
    console.error("[cron/social-auto]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur social auto" },
      { status: 500 },
    )
  }
}
