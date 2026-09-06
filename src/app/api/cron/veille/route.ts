import Anthropic from "@anthropic-ai/sdk"
import { execute } from "@/lib/db/connection"

/**
 * Veille éditoriale d'AutoEcoleMagazine.fr.
 *
 * Corrigé le 05/09/2026 après constat : sur les 163 idées produites depuis le
 * 4 mai, l'écrasante majorité portait sur l'automobile généraliste — « 831 000
 * km avec la même Mercedes », « Mini Cooper bientôt en propulsion » — et non
 * sur le permis, la sécurité routière ou la mobilité.
 *
 * Deux causes, toutes deux dans l'ENTRÉE :
 *
 * 1. `auto-moto.com` (magazine d'essais autos) publiait ~50 items frais par
 *    passage quand securite-routiere.gouv.fr, muet depuis le 13 juillet, était
 *    éliminé par la fenêtre de 7 jours. Le `slice(0, 10)` s'appliquait à la
 *    liste CONCATÉNÉE : les dix items envoyés au modèle étaient donc les dix
 *    premiers d'auto-moto, et Le Monde n'atteignait jamais le modèle.
 * 2. Aucun des flux ne visait le permis ou l'auto-école.
 *
 * D'où : chaque flux a désormais sa propre fenêtre de fraîcheur et son propre
 * QUOTA — un flux bavard ne peut plus évincer les autres — et la liste vise le
 * périmètre éditorial réel. Les recherches Google News rendent une centaine
 * d'items ciblés par requête, là où les flux maison sont soit lents, soit hors
 * sujet.
 */

interface Flux {
  nom: string
  url: string
  /**
   * Fenêtre de fraîcheur PROPRE au flux, en jours. Les sources
   * institutionnelles publient quelques fois par trimestre : à 7 jours elles
   * ne passaient jamais. Ne pas monter au-delà de ~14 tant que la
   * déduplication entre passages n'existe pas (elle demande une table dédiée) :
   * une fenêtre plus large représenterait les mêmes items chaque matin.
   */
  fenetreJours: number
  /** Nombre maximum d'items que ce flux peut placer devant le modèle. */
  quota: number
}

const FLUX: Flux[] = [
  // --- Institutionnel : rare, mais c'est la source primaire ---------------
  {
    nom: "Sécurité routière (gouv)",
    url: "https://www.securite-routiere.gouv.fr/rss.xml",
    fenetreJours: 14,
    quota: 6,
  },
  {
    nom: "Prévention routière",
    url: "https://www.preventionroutiere.asso.fr/feed/",
    fenetreJours: 14,
    quota: 4,
  },

  // --- Google News : recherches ciblées sur le périmètre éditorial --------
  // `when:7d` filtre côté Google, donc la fenêtre locale n'est qu'un garde-fou.
  {
    nom: "GN — permis de conduire",
    url: "https://news.google.com/rss/search?q=%22permis+de+conduire%22+when%3A7d&hl=fr&gl=FR&ceid=FR:fr",
    fenetreJours: 8,
    quota: 8,
  },
  {
    nom: "GN — sécurité routière",
    url: "https://news.google.com/rss/search?q=%22s%C3%A9curit%C3%A9+routi%C3%A8re%22+when%3A7d&hl=fr&gl=FR&ceid=FR:fr",
    fenetreJours: 8,
    quota: 8,
  },
  {
    nom: "GN — auto-école",
    url: "https://news.google.com/rss/search?q=%22auto-%C3%A9cole%22+when%3A7d&hl=fr&gl=FR&ceid=FR:fr",
    fenetreJours: 8,
    quota: 6,
  },
  {
    nom: "GN — code de la route",
    url: "https://news.google.com/rss/search?q=%22code+de+la+route%22+when%3A7d&hl=fr&gl=FR&ceid=FR:fr",
    fenetreJours: 8,
    quota: 5,
  },
  {
    nom: "GN — ZFE / mobilité",
    url: "https://news.google.com/rss/search?q=(%22ZFE%22+OR+%22zone+%C3%A0+faibles+%C3%A9missions%22)+when%3A7d&hl=fr&gl=FR&ceid=FR:fr",
    fenetreJours: 8,
    quota: 4,
  },

  // --- Presse ------------------------------------------------------------
  {
    nom: "Le Monde — sécurité routière",
    url: "https://www.lemonde.fr/securite-routiere/rss_full.xml",
    // Rubrique peu alimentee : au test du 05/09 son item le plus recent datait
    // du 26/08. A 8 jours elle ne rendait jamais rien.
    fenetreJours: 14,
    quota: 6,
  },
]

/** Plafond global envoyé au modèle, indépendamment de la somme des quotas. */
const MAX_ITEMS_MODELE = 40

interface FeedItem {
  flux: string
  title: string
  link: string
  description: string
  pubDate: string
  /** Millisecondes epoch, ou null si le flux ne date pas ses items. */
  date: number | null
}

interface DiagnosticFlux {
  flux: string
  http: number | null
  bruts: number
  retenus: number
  dernier: string | null
  erreur?: string
}

const ENTITES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
}

/**
 * Les titres Google News arrivent avec des entités numériques (`&#39;`) : sans
 * décodage, le modèle lit « l&#39;auto-école » et le titre de l'idée d'article
 * part tel quel en base.
 */
function decodeEntites(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (e) => ENTITES[e.toLowerCase()] ?? e)
}

/**
 * Les descriptions Google News contiennent du HTML ECHAPPE (`&lt;a href=...`).
 * Il faut donc decoder AVANT de retirer les balises : l'ordre inverse laissait
 * passer les balises, qui reapparaissaient en clair une fois decodees et
 * remplissaient le prompt d'URLs de redirection.
 *
 * Un seul decodage, et il a lieu en premier : redecoder ensuite transformerait
 * un `&amp;lt;` litteral en `<`.
 */
function sansBalises(s: string): string {
  return decodeEntites(s)
    .replace(/<[^>]*>/g, " ")
    // Google News echappe DEUX fois : un seul decodage laisse `&nbsp;` derriere
    // les balises retirees. On ne retraite que celui-la, plutot que de redecoder
    // tout le texte — un seul `&amp;lt;` litteral deviendrait alors un `<`.
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Vrai quand la description ne fait que repeter le titre — c'est le cas de
 * toutes les descriptions Google News, qui sont un lien vers l'article suivi du
 * nom du media. La garder doublait la taille du prompt sans rien apprendre au
 * modele.
 */
function redondante(description: string, titre: string): boolean {
  const d = cleTitre(description)
  const t = cleTitre(titre)
  return d.length === 0 || t.length === 0 || d.startsWith(t) || t.startsWith(d)
}

/**
 * Clé de déduplication DANS un même passage. Les recherches Google News se
 * recouvrent largement — « Ce qui change au 1er septembre » remonte à la fois
 * sur « permis de conduire » et sur « sécurité routière ». Les URLs Google
 * étant des redirections uniques par requête, la déduplication se fait sur le
 * titre, dont on retire le suffixe « - Nom du média ».
 */
function cleTitre(titre: string): string {
  return titre
    .replace(/\s+-\s+[^-]{2,40}$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

async function lireFlux(
  flux: Flux,
): Promise<{ items: FeedItem[]; diag: DiagnosticFlux }> {
  const diag: DiagnosticFlux = {
    flux: flux.nom,
    http: null,
    bruts: 0,
    retenus: 0,
    dernier: null,
  }

  let xml: string
  try {
    const res = await fetch(flux.url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "LouVeille/1.0 (+https://autoecolemagazine.fr)" },
    })
    diag.http = res.status
    if (!res.ok) return { items: [], diag }
    xml = await res.text()
  } catch (e) {
    diag.erreur = e instanceof Error ? e.message.slice(0, 120) : "injoignable"
    return { items: [], diag }
  }

  const items: FeedItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const contenu = match[1]
    const titre = contenu.match(
      /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
    )?.[1]
    const lien = contenu.match(/<link>([\s\S]*?)<\/link>/)?.[1]
    const desc = contenu.match(
      /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/,
    )?.[1]
    const pubDate = contenu.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ""

    if (!titre) continue

    const t = new Date(pubDate).getTime()
    const titrePropre = sansBalises(titre)
    const descPropre = sansBalises(desc ?? "").slice(0, 300)
    items.push({
      flux: flux.nom,
      title: titrePropre,
      link: (lien ?? "").trim(),
      description: redondante(descPropre, titrePropre) ? "" : descPropre,
      pubDate,
      date: Number.isFinite(t) ? t : null,
    })
  }

  diag.bruts = items.length

  const seuil = Date.now() - flux.fenetreJours * 24 * 60 * 60 * 1000
  const frais = items
    .filter((i) => i.date === null || i.date > seuil)
    // Le plus récent d'abord : le quota doit garder le neuf, pas l'ordre du flux.
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))

  const retenus = frais.slice(0, flux.quota)
  diag.retenus = retenus.length

  const plusRecent = items.reduce<number | null>(
    (max, i) => (i.date !== null && (max === null || i.date > max) ? i.date : max),
    null,
  )
  diag.dernier = plusRecent === null ? null : new Date(plusRecent).toISOString()

  return { items: retenus, diag }
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // `?dry_run=1` : la veille tourne et rend son analyse, rien n'est écrit en
  // base. C'est l'outil de vérification après un changement de flux.
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1"

  try {
    const resultats = await Promise.all(FLUX.map(lireFlux))
    const diagnostics = resultats.map((r) => r.diag)

    // Déduplication inter-flux, puis plafond global.
    const vus = new Set<string>()
    const items: FeedItem[] = []
    for (const item of resultats.flatMap((r) => r.items)) {
      const cle = cleTitre(item.title)
      if (!cle || vus.has(cle)) continue
      vus.add(cle)
      items.push(item)
      if (items.length >= MAX_ITEMS_MODELE) break
    }

    if (items.length === 0) {
      return Response.json({
        status: "ok",
        message: "Aucune actualite recente",
        flux: diagnostics,
        items: 0,
      })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const liste = items
      .map(
        (i, idx) =>
          `${idx + 1}. [${i.flux}] ${i.title}` +
          (i.description ? `\n   ${i.description}` : "") +
          `\n   ${i.link}`,
      )
      .join("\n\n")

    const analyse = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Tu es LOU, veilleur pour AutoEcoleMagazine.fr, magazine d'information sur le permis de conduire, la securite routiere et la mobilite. Audience : candidats au permis, parents, moniteurs, gerants d'auto-ecole.

Analyse ces actualites et retiens SEULEMENT celles qui meritent un article.

Priorite haute : changement de reglementation, de tarif, de delai ou de procedure ; decision de justice qui fait jurisprudence ; chiffres officiels (accidentalite, taux de reussite, delais d'examen) ; reforme de la formation ou de l'examen ; ZFE et regles de circulation.

A ECARTER : les faits divers sans portee generale (un exces de vitesse, un accident local, une interpellation), l'actualite automobile de produit (essais, nouveaux modeles, motorisations), et l'actualite etrangere sans effet en France. Mieux vaut rendre deux alertes utiles que dix remplissages.

Pour chaque actualite retenue, indique dans "source_primaire" le document ou l'institution a consulter pour ecrire l'article (decret, arrete, communique, rapport, etude) — l'item de veille est un signal, jamais la matiere de l'article.

Actualites :
${liste}

Reponds en JSON : { "alerts": [{ "title": string, "relevance": string, "article_idea": string, "source_primaire": string, "source_url": string, "priority": "high"|"medium"|"low" }] }`,
        },
      ],
    })

    const texte = analyse.content[0].type === "text" ? analyse.content[0].text : ""

    let alerts: {
      title: string
      relevance: string
      article_idea: string
      source_primaire?: string
      source_url: string
      priority: string
    }[] = []
    try {
      const json = texte.match(/\{[\s\S]*\}/)
      if (json) alerts = JSON.parse(json[0]).alerts ?? []
    } catch {
      console.warn("[cron/veille] reponse du modele non parsable")
    }

    const aGarder = alerts.filter(
      (a) => a.priority === "high" || a.priority === "medium",
    )

    if (dryRun) {
      return Response.json({
        status: "ok",
        dry_run: true,
        flux: diagnostics,
        items_analyses: items.length,
        alerts: aGarder,
      })
    }

    let saved = 0
    for (const alert of aGarder) {
      try {
        await execute(
          `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
           VALUES (?, 'article', 'draft', ?, ?, 'lou-veille')`,
          [
            alert.title,
            `**Idee d'article (veille auto):**\n\n${alert.article_idea}\n\n**Source primaire a consulter:** ${alert.source_primaire ?? "non precisee"}\n\n**Signal:** ${alert.source_url}\n\n**Pertinence:** ${alert.relevance}`,
            JSON.stringify({
              source: "cron_veille",
              priority: alert.priority,
              source_url: alert.source_url,
              source_primaire: alert.source_primaire ?? null,
            }),
          ],
        )
        saved++
      } catch (e) {
        // Journalisé, pas avalé : l'écriture fonctionne depuis mai, un échec
        // ici est un vrai incident et non « la base n'est pas encore migrée ».
        console.error(
          "[cron/veille] insertion refusee:",
          e instanceof Error ? e.message.slice(0, 200) : e,
        )
      }
    }

    return Response.json({
      status: "ok",
      flux: diagnostics,
      items_analyses: items.length,
      alerts: alerts.length,
      retenues: aGarder.length,
      saved_to_log: saved,
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur veille" },
      { status: 500 },
    )
  }
}
