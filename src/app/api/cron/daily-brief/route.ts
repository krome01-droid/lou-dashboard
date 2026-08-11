import Anthropic from "@anthropic-ai/sdk"
import { listAllPosts, listAllPages, type WPPost } from "@/lib/wordpress/client"
import { getSummary, getTopKeywords, getTopPages } from "@/lib/google/search-console"
import { execute, query } from "@/lib/db/connection"

// Caps keep the prompt bounded as the catalogue grows. Every truncated list
// reports its real total so the model never mistakes a sample for the whole.
const CAP_LIST = 25
const CAP_KEYWORDS = 30
const CAP_PAGES = 15
const CAP_PAIRS = 15
const CAP_FAMILIES = 25
const CAP_HISTORY = 10
const PAIR_SCAN_LIMIT = 500

interface LinkStats {
  slug: string
  title: string
  type: "post" | "page"
  date: string
  modified: string
  wordCount: number
  outgoingInternal: number
  incomingInternal: number
}

function analyzeContent(
  items: { post: WPPost; type: "post" | "page" }[],
  siteHost: string,
): LinkStats[] {
  // Build slug → incoming-count map by parsing every item's HTML for hrefs targeting siteHost
  const incomingBySlug = new Map<string, number>()
  const stats: Omit<LinkStats, "incomingInternal">[] = []

  const hrefRe = /href=["']([^"']+)["']/gi

  for (const { post, type } of items) {
    const html = post.content?.rendered ?? ""
    const text = html.replace(/<[^>]+>/g, " ")
    const wordCount = text.split(/\s+/).filter(Boolean).length

    let outgoingInternal = 0
    let m: RegExpExecArray | null
    while ((m = hrefRe.exec(html)) !== null) {
      const href = m[1]
      if (!href.includes(siteHost)) continue
      outgoingInternal++
      // Extract slug from URL path (last non-empty segment)
      try {
        const u = new URL(href, `https://${siteHost}`)
        const segments = u.pathname.split("/").filter(Boolean)
        const targetSlug = segments[segments.length - 1]
        if (targetSlug) {
          incomingBySlug.set(targetSlug, (incomingBySlug.get(targetSlug) ?? 0) + 1)
        }
      } catch {
        // ignore malformed URLs
      }
    }

    stats.push({
      slug: post.slug,
      title: post.title.rendered,
      type,
      date: post.date,
      modified: post.modified ?? post.date,
      wordCount,
      outgoingInternal,
    })
  }

  return stats.map((s) => ({ ...s, incomingInternal: incomingBySlug.get(s.slug) ?? 0 }))
}

/**
 * Structural signature of a slug: first two + last two tokens, with the
 * variable middle collapsed. "auto-ecole-merignac-guide-complet" and
 * "auto-ecole-langon-guide-complet" both map to "auto-ecole-…-guide-complet",
 * which surfaces how large each editorial series already is.
 */
function slugFamily(slug: string): string {
  const tokens = slug.split("-").filter(Boolean)
  if (tokens.length <= 4) return slug
  return `${tokens.slice(0, 2).join("-")}-…-${tokens.slice(-2).join("-")}`
}

/** Jaccard similarity on slug tokens — used to surface cannibalisation candidates. */
function slugSimilarity(a: string, b: string): number {
  const sa = new Set(a.split("-").filter(Boolean))
  const sb = new Set(b.split("-").filter(Boolean))
  let shared = 0
  for (const t of sa) if (sb.has(t)) shared++
  const union = sa.size + sb.size - shared
  return union === 0 ? 0 : shared / union
}

function findSimilarPairs(stats: LinkStats[], threshold = 0.6) {
  const scope = stats.slice(0, PAIR_SCAN_LIMIT)
  const pairs: { a: string; b: string; score: number }[] = []
  for (let i = 0; i < scope.length; i++) {
    for (let j = i + 1; j < scope.length; j++) {
      const score = slugSimilarity(scope[i].slug, scope[j].slug)
      if (score >= threshold) {
        pairs.push({ a: scope[i].slug, b: scope[j].slug, score: Math.round(score * 100) })
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score)
}

/** Render a capped list, always disclosing how many entries were hidden. */
function capped(lines: string[], cap = CAP_LIST): string {
  if (lines.length === 0) return "aucune"
  const shown = lines.slice(0, cap)
  const hidden = lines.length - shown.length
  return shown.join("\n") + (hidden > 0 ? `\n… et ${hidden} autre(s) non listée(s)` : "")
}

interface BriefMeta {
  score?: number
  actions?: { title: string; description?: string; target_slugs?: string[] }[]
  article_idea?: { title?: string }
  alert?: string
  weekly_goal?: string
  inventory?: Record<string, number>
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get("dry_run") === "1"

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const now = new Date()
    const today = now.toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Paris",
    })

    const siteHost = (process.env.WP_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")

    // Full inventory + real search performance + brief history, in parallel.
    // Search Console is optional: if Google auth isn't wired up the brief still
    // runs, but the prompt then forbids any traffic/volume claim.
    const [posts, pages, recentBriefs, seoReports, scSummary, scKeywords, scPages] =
      await Promise.all([
        listAllPosts().catch(() => [] as WPPost[]),
        listAllPages().catch(() => [] as WPPost[]),
        query<{ content_markdown: string; meta_json: string; created_at: string }>(
          `SELECT content_markdown, meta_json, created_at
           FROM wp_lou_content_log
           WHERE type = 'brief' AND created_by = 'lou-cron'
           ORDER BY created_at DESC LIMIT ${CAP_HISTORY}`,
        ).catch(() => []),
        query<{ data_json: string; created_at: string }>(
          `SELECT data_json, created_at FROM wp_lou_seo_reports ORDER BY created_at DESC LIMIT 1`,
        ).catch(() => []),
        getSummary().catch(() => null),
        getTopKeywords(CAP_KEYWORDS).catch(() => null),
        getTopPages(CAP_PAGES).catch(() => null),
      ])

    const hasSearchData = scSummary !== null && scKeywords !== null

    // --- Content graph ---------------------------------------------------
    const allItems = [
      ...posts.map((p) => ({ post: p, type: "post" as const })),
      ...pages.map((p) => ({ post: p, type: "page" as const })),
    ]
    const stats = analyzeContent(allItems, siteHost)

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recentStats = stats.filter((s) => new Date(s.date) >= weekAgo)

    const orphans = stats.filter((s) => s.incomingInternal === 0)
    const linkPoor = stats
      .filter((s) => s.outgoingInternal < 3)
      .sort((a, b) => b.wordCount - a.wordCount)
    const thin = stats.filter((s) => s.wordCount < 400)
    const recentOrphans = recentStats.filter((s) => s.incomingInternal === 0)

    // Slugs advertising a past year — a defect that is objectively fixed or not,
    // so the model can no longer re-raise it once it's gone.
    const currentYear = now.getFullYear()
    const datedSlugs = stats.filter((s) => {
      const m = s.slug.match(/(20\d{2})/)
      return m !== null && Number(m[1]) < currentYear
    })

    // Published over 6 months ago and never touched since.
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const staleContent = stats
      .filter((s) => new Date(s.modified) < sixMonthsAgo)
      .sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime())

    // Editorial series already in production.
    const familyCounts = new Map<string, number>()
    for (const s of stats) {
      const f = slugFamily(s.slug)
      familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1)
    }
    const families = [...familyCounts.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])

    const similarPairs = findSimilarPairs(stats)

    // Publishing cadence over the last 4 weeks.
    const cadence = [0, 1, 2, 3].map((w) => {
      const end = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000)
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
      const count = stats.filter((s) => {
        const d = new Date(s.date)
        return d >= start && d < end
      }).length
      return `S-${w} : ${count} publication(s)`
    })

    // --- Brief history ---------------------------------------------------
    const history: string[] = []
    const previousIdeas: string[] = []
    const previousGoals: string[] = []
    let lastInventory: Record<string, number> | null = null

    recentBriefs.forEach((b, idx) => {
      const when = new Date(b.created_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      })
      let meta: BriefMeta | null = null
      try {
        meta = JSON.parse(b.meta_json) as BriefMeta
      } catch {
        meta = null
      }

      if (idx === 0 && meta?.inventory) lastInventory = meta.inventory

      if (meta?.actions?.length) {
        for (const a of meta.actions) {
          const targets = a.target_slugs?.length ? ` [cibles : ${a.target_slugs.join(", ")}]` : ""
          history.push(`- ${when} — ACTION : ${a.title}${targets}`)
        }
      } else {
        // Older briefs stored only markdown — recover the bolded action titles.
        const matches = b.content_markdown?.match(/\*\*([^*]+)\*\*/g) ?? []
        for (const m of matches) history.push(`- ${when} — ACTION : ${m.replace(/\*\*/g, "").trim()}`)
      }

      if (meta?.article_idea?.title) {
        previousIdeas.push(`- ${when} — ${meta.article_idea.title}`)
      }
      if (meta?.weekly_goal) {
        previousGoals.push(`- ${when} — ${meta.weekly_goal}`)
      }
    })

    // Movement since the previous brief: proof of what actually got done.
    const currentInventory = {
      posts: posts.length,
      pages: pages.length,
      orphans: orphans.length,
      recent_orphans: recentOrphans.length,
      link_poor: linkPoor.length,
      thin: thin.length,
      dated_slugs: datedSlugs.length,
      stale: staleContent.length,
    }

    const deltaLines: string[] = []
    if (lastInventory) {
      const prev: Record<string, number> = lastInventory
      for (const [key, value] of Object.entries(currentInventory)) {
        const before = prev[key]
        if (before === undefined) continue
        const diff = value - before
        const arrow = diff === 0 ? "=" : diff > 0 ? `+${diff}` : String(diff)
        deltaLines.push(`- ${key} : ${before} → ${value} (${arrow})`)
      }
    }

    const lastSeoData = seoReports[0]
      ? (() => {
          try {
            return JSON.parse(seoReports[0].data_json)
          } catch {
            return null
          }
        })()
      : null

    const seoScore =
      lastSeoData?.score ?? Math.min(100, 40 + posts.length * 0.3 + recentStats.length * 5)

    const fmt = (s: LinkStats) =>
      `${s.slug} (${s.type}, ${s.wordCount}w, in:${s.incomingInternal} out:${s.outgoingInternal})`

    const searchBlock = hasSearchData
      ? `**Global 28 derniers jours :** ${scSummary.totalClicks} clics · ${scSummary.totalImpressions} impressions · CTR ${scSummary.avgCtr}% · position moyenne ${scSummary.avgPosition}

**Requêtes réelles (${scKeywords.length}) — position / clics / impressions / CTR / tendance :**
${
  scKeywords
    .map(
      (k) =>
        `- "${k.keyword}" — pos ${k.position}, ${k.clicks} clics, ${k.impressions} impr., CTR ${k.ctr}%, ${k.trend}`,
    )
    .join("\n") || "aucune"
}

**Pages les plus performantes (${scPages?.length ?? 0}) :**
${
  (scPages ?? [])
    .map(
      (p) =>
        `- ${p.page} — ${p.clicks} clics, ${p.impressions} impr., CTR ${p.ctr}%, pos ${p.position}`,
    )
    .join("\n") || "aucune"
}`
      : `⚠️ Search Console indisponible sur ce run — AUCUNE donnée de trafic, de position ou de volume de recherche n'est accessible aujourd'hui.`

    const prompt = `Tu es LOU, l'agent IA d'AutoEcoleMagazine.fr — comparateur d'auto-écoles en France.

Date du jour : ${today}

Tu produis un brief quotidien pour Laurent. Ce brief est le ${recentBriefs.length + 1}ᵉ d'une série : Laurent lit les précédents et se plaint quand tu reproposes ce qui a déjà été fait ou décidé. Ton travail n'est donc PAS de redécouvrir le site chaque matin, mais de constater ce qui a bougé depuis hier et de proposer le coup d'après.

═══════════════════════════════════════
BLOC 1 — INVENTAIRE VÉRIFIÉ
═══════════════════════════════════════
Ces chiffres sont calculés par scan complet du site (tous les articles et toutes les pages, contenu HTML parsé). Ils sont exacts.

- Articles publiés : ${posts.length}
- Pages publiées : ${pages.length}
- Publiés cette semaine : ${recentStats.length}
- Score SEO de référence : ${Math.round(seoScore)}/100

**Cadence de publication :**
${cadence.join("\n")}

**Pages orphelines (0 lien entrant) — total ${orphans.length} :**
${capped(orphans.map(fmt))}

**Pages récentes orphelines (publiées cette semaine, 0 lien entrant) — total ${recentOrphans.length} :**
${capped(recentOrphans.map(fmt))}

**Pages pauvres en liens sortants (<3), triées par taille — total ${linkPoor.length} :**
${capped(linkPoor.map(fmt))}

**Thin content (<400 mots) — total ${thin.length} :**
${capped(thin.map(fmt))}

**Slugs affichant une année révolue (< ${currentYear}) — total ${datedSlugs.length} :**
${capped(datedSlugs.map((s) => s.slug))}

**Contenu jamais mis à jour depuis 6 mois — total ${staleContent.length} :**
${capped(staleContent.map((s) => `${s.slug} (modifié le ${s.modified.split("T")[0]})`))}

**Séries éditoriales déjà en production (motif de slug → nombre) :**
${capped(
  families.map(([f, n]) => `${f} → ${n} page(s)`),
  CAP_FAMILIES,
)}

**Paires de slugs très proches (cannibalisation potentielle, similarité ≥60%) — total ${similarPairs.length} :**
${capped(
  similarPairs.map((p) => `${p.a} ↔ ${p.b} (${p.score}%)`),
  CAP_PAIRS,
)}

═══════════════════════════════════════
BLOC 2 — PERFORMANCE RÉELLE (Search Console)
═══════════════════════════════════════
${searchBlock}

═══════════════════════════════════════
BLOC 3 — CE QUI A BOUGÉ DEPUIS LE BRIEF PRÉCÉDENT
═══════════════════════════════════════
${
  deltaLines.length
    ? deltaLines.join("\n")
    : "Aucun instantané précédent disponible — c'est le premier brief mesurable."
}

═══════════════════════════════════════
BLOC 4 — HISTORIQUE : DÉJÀ PROPOSÉ, INTERDIT DE REPROPOSER
═══════════════════════════════════════
**Actions déjà proposées (${recentBriefs.length} derniers briefs) :**
${history.length ? history.join("\n") : "aucune"}

**Idées d'articles déjà proposées :**
${previousIdeas.length ? previousIdeas.join("\n") : "aucune"}

**Objectifs hebdo déjà fixés :**
${previousGoals.length ? previousGoals.join("\n") : "aucun"}

═══════════════════════════════════════
MISSION
═══════════════════════════════════════

Procède dans cet ordre.

**Étape 1 — Suivi.** Pour chaque action du BLOC 4, croise-la avec les BLOCS 1 et 3 et classe-la :
- \`fait\` : la donnée prouve que c'est réglé (ex. l'action visait les slugs 2024 et le BLOC 1 en compte désormais 0).
- \`en_cours\` : le compteur correspondant a baissé sans atteindre zéro.
- \`non_fait\` : aucun mouvement dans les données.
Cite le chiffre qui justifie ton classement. Si aucune donnée du brief ne permet de trancher, dis-le franchement (\`indeterminable\`) au lieu de deviner.

**Étape 2 — Actions du jour.** Propose 3 actions. Contraintes non négociables :
- Aucune action classée \`fait\` ne peut réapparaître.
- Une action \`non_fait\` ne peut être reprise que si tu expliques pourquoi elle a échoué et ce que tu changes dans l'approche. Sinon, propose autre chose.
- Chaque action doit citer, dans son champ \`evidence\`, la ligne exacte du BLOC 1 ou 2 qui la déclenche (slug précis, chiffre précis). Une action sans preuve chiffrée dans les blocs ci-dessus est interdite.
- \`target_slugs\` doit contenir des slugs qui apparaissent réellement dans les blocs ci-dessus.

**Étape 3 — Idée d'article.** Une seule, absente de la liste des idées déjà proposées.
${
  hasSearchData
    ? `Appuie-la sur une requête du BLOC 2 : soit une requête à fortes impressions et faible CTR, soit une requête en position 5-20 où un contenu dédié ferait gagner des places. Cite la requête et ses chiffres réels.`
    : `Search Console est indisponible : tu n'as AUCUN chiffre de volume ou de position. Renseigne \`estimated_traffic\` avec la valeur exacte "inconnu — Search Console indisponible" et justifie l'idée uniquement par les trous de couverture visibles dans le BLOC 1.`
}

**Étape 4 — Alerte.** Un seul risque, obligatoirement adossé à une anomalie chiffrée des blocs. Si les blocs ne montrent aucune anomalie sérieuse, écris exactement "Aucune alerte : les indicateurs sont sains." — ne fabrique pas un risque pour remplir la case.

**Étape 5 — Objectif de la semaine.** Mesurable, vérifiable par les compteurs du BLOC 1 la semaine prochaine (ex. "orphelines : ${orphans.length} → ${Math.max(0, orphans.length - 5)}"). Différent des objectifs déjà fixés.

**Règles absolues :**
1. N'invente JAMAIS un volume de recherche, un nombre de visites, une position ou un CTR. Ces chiffres ne peuvent venir que du BLOC 2. ${hasSearchData ? "" : "Le BLOC 2 est vide aujourd'hui : donc aucun chiffre de trafic ne doit apparaître dans ta réponse."}
2. N'invente jamais un slug. Tous les slugs cités doivent figurer dans les blocs.
3. Si le site est sain, dis-le et bascule sur des actions de croissance — ne fabrique pas du travail correctif.
4. Direct, concret, zéro remplissage. Chaque phrase doit apporter une information que Laurent n'a pas déjà.

Rends ton analyse via l'outil \`rendre_brief\`. Reste concis : 2 phrases max par description.`

    // Structured output via forced tool use. The previous version asked for raw
    // JSON in the text block and regex-extracted it, which broke as soon as the
    // answer grew (unbalanced braces on truncation, quotes inside strings).
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      tools: [
        {
          name: "rendre_brief",
          description: "Enregistre le brief matinal structuré.",
          input_schema: {
            type: "object",
            properties: {
              site_status: {
                type: "string",
                description: "2-3 phrases sur l'état réel du site, chiffres à l'appui.",
              },
              previous_actions_review: {
                type: "array",
                description: "Suivi de chaque action des briefs précédents.",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["fait", "en_cours", "non_fait", "indeterminable"],
                    },
                    evidence: {
                      type: "string",
                      description: "Le chiffre ou slug qui justifie ce classement.",
                    },
                  },
                  required: ["action", "status", "evidence"],
                },
              },
              actions: {
                type: "array",
                description: "Exactement 3 actions du jour.",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    impact: { type: "string", enum: ["fort", "moyen", "faible"] },
                    time_needed: { type: "string" },
                    target_slugs: { type: "array", items: { type: "string" } },
                    evidence: {
                      type: "string",
                      description: "Ligne exacte du BLOC 1 ou 2 qui déclenche l'action.",
                    },
                  },
                  required: ["title", "description", "impact", "time_needed", "evidence"],
                },
              },
              article_idea: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                  why: { type: "string" },
                  estimated_traffic: { type: "string" },
                },
                required: ["title", "keywords", "why", "estimated_traffic"],
              },
              alert: { type: "string" },
              weekly_goal: { type: "string" },
              score: { type: "number", description: "Score global sur 100." },
            },
            required: [
              "site_status",
              "previous_actions_review",
              "actions",
              "article_idea",
              "alert",
              "weekly_goal",
              "score",
            ],
          },
        },
      ],
      tool_choice: { type: "tool", name: "rendre_brief" },
      messages: [{ role: "user", content: prompt }],
    })

    const toolUse = response.content.find((c) => c.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`Réponse sans tool_use (stop_reason: ${response.stop_reason})`)
    }
    const brief = toolUse.input as {
      site_status: string
      previous_actions_review?: { action: string; status: string; evidence: string }[]
      actions: {
        title: string
        description: string
        impact: string
        time_needed: string
        target_slugs?: string[]
        evidence?: string
      }[]
      article_idea: { title: string; keywords: string[]; why: string; estimated_traffic: string }
      alert: string
      weekly_goal: string
      score: number
    }

    const review = brief.previous_actions_review ?? []
    const reviewSection = review.length
      ? `\n\n**Suivi des actions précédentes :**\n${review
          .map((r) => `- [${r.status}] ${r.action} — ${r.evidence}`)
          .join("\n")}`
      : ""

    const markdown = `## ${today}

**État du site :** ${brief.site_status}${reviewSection}

**Actions prioritaires :**
${brief.actions
  .map(
    (a) =>
      `- [${a.impact.toUpperCase()}] **${a.title}** (${a.time_needed}) : ${a.description}${
        a.target_slugs?.length ? `\n  - Cibles : ${a.target_slugs.join(", ")}` : ""
      }${a.evidence ? `\n  - Preuve : ${a.evidence}` : ""}`,
  )
  .join("\n")}

**Idée d'article :** ${brief.article_idea.title}
- Mots-clés : ${brief.article_idea.keywords.join(", ")}
- Trafic estimé : ${brief.article_idea.estimated_traffic}
- ${brief.article_idea.why}

**Alerte :** ${brief.alert}

**Objectif semaine :** ${brief.weekly_goal}`

    if (!dryRun)
      await execute(
        `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
       VALUES (?, 'brief', 'published', ?, ?, 'lou-cron')`,
        [
          `Brief matinal — ${today}`,
          markdown,
          JSON.stringify({
            source: "cron_daily_brief",
            score: brief.score,
            article_idea: brief.article_idea,
            actions: brief.actions,
            previous_actions_review: review,
            alert: brief.alert,
            weekly_goal: brief.weekly_goal,
            search_console: hasSearchData,
            inventory: currentInventory,
          }),
        ],
      )

    return Response.json({
      status: "ok",
      dry_run: dryRun,
      date: today,
      score: brief.score,
      site_status: brief.site_status,
      previous_actions_review: review,
      actions: brief.actions,
      article_idea: brief.article_idea,
      alert: brief.alert,
      weekly_goal: brief.weekly_goal,
      search_console: hasSearchData,
      inventory: { ...currentInventory, recent: recentStats.length },
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur daily-brief" },
      { status: 500 },
    )
  }
}
