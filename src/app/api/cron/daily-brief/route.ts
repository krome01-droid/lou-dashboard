import Anthropic from "@anthropic-ai/sdk"
import { listAllPosts, listAllPages, type WPPost } from "@/lib/wordpress/client"
import { execute, query } from "@/lib/db/connection"

interface LinkStats {
  slug: string
  title: string
  type: "post" | "page"
  date: string
  wordCount: number
  outgoingInternal: number
  incomingInternal: number
}

function analyzeContent(items: { post: WPPost; type: "post" | "page" }[], siteHost: string): LinkStats[] {
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
      wordCount,
      outgoingInternal,
    })
  }

  return stats.map((s) => ({ ...s, incomingInternal: incomingBySlug.get(s.slug) ?? 0 }))
}

const MAX_LIST = 25

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get("dry_run") === "1"

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const today = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Paris",
    })

    const siteHost = (process.env.WP_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")

    // Full inventory: all posts + all pages, paginated
    const [posts, pages, recentBriefs, seoReports] = await Promise.all([
      listAllPosts().catch(() => [] as WPPost[]),
      listAllPages().catch(() => [] as WPPost[]),
      query<{ content_markdown: string; meta_json: string; created_at: string }>(
        `SELECT content_markdown, meta_json, created_at
         FROM wp_lou_content_log
         WHERE type = 'brief' AND created_by = 'lou-cron'
         ORDER BY created_at DESC LIMIT 5`,
      ).catch(() => []),
      query<{ data_json: string; created_at: string }>(
        `SELECT data_json, created_at FROM wp_lou_seo_reports ORDER BY created_at DESC LIMIT 1`,
      ).catch(() => []),
    ])

    // Compute link/word metrics across the whole site
    const allItems = [
      ...posts.map((p) => ({ post: p, type: "post" as const })),
      ...pages.map((p) => ({ post: p, type: "page" as const })),
    ]
    const stats = analyzeContent(allItems, siteHost)

    // Recent (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentStats = stats.filter((s) => new Date(s.date) >= weekAgo)

    // Find weak spots — capped at MAX_LIST to keep prompt size bounded as the site grows
    const orphansAll = stats.filter((s) => s.incomingInternal === 0)
    const linkPoorAll = stats
      .filter((s) => s.outgoingInternal < 3)
      .sort((a, b) => b.wordCount - a.wordCount)
    const thinAll = stats.filter((s) => s.wordCount < 400)
    const recentOrphansAll = recentStats.filter((s) => s.incomingInternal === 0)

    const orphans = orphansAll.slice(0, MAX_LIST)
    const linkPoor = linkPoorAll.slice(0, MAX_LIST)
    const thin = thinAll.slice(0, MAX_LIST)
    const recentOrphans = recentOrphansAll.slice(0, MAX_LIST)

    // Previous brief actions (avoid repeating verbatim)
    const previousActions: string[] = []
    for (const b of recentBriefs) {
      try {
        const meta = JSON.parse(b.meta_json) as { actions?: { title: string }[] }
        for (const a of meta.actions ?? []) previousActions.push(a.title)
      } catch {
        // fall back to scanning markdown
        const matches = b.content_markdown.match(/\*\*([^*]+)\*\*/g) ?? []
        previousActions.push(...matches.map((m) => m.replace(/\*\*/g, "").trim()))
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

    const totalPosts = posts.length
    const totalPages = pages.length
    const seoScore =
      lastSeoData?.score ?? Math.min(100, 40 + totalPosts * 0.3 + recentStats.length * 5)

    const fmt = (s: LinkStats) =>
      `${s.slug} (${s.type}, ${s.wordCount}w, in:${s.incomingInternal} out:${s.outgoingInternal})`

    const prompt = `Tu es LOU, l'agent IA d'AutoEcoleMagazine.fr — comparateur d'auto-écoles en France.

Date du jour : ${today}

## Inventaire complet (vérifié, pas une estimation)

- Articles publiés : ${totalPosts}
- Pages publiées : ${totalPages}
- Publiés cette semaine : ${recentStats.length}
- Score SEO : ${Math.round(seoScore)}/100

## Maillage interne — données réelles

**Pages orphelines (0 lien entrant) — ${orphans.length}/${orphansAll.length} affichées :**
${orphans.map(fmt).join("\n") || "aucune"}

**Pages récentes orphelines (cette semaine, 0 lien entrant) — ${recentOrphans.length}/${recentOrphansAll.length} :**
${recentOrphans.map(fmt).join("\n") || "aucune"}

**Pages pauvres en liens sortants (<3) — ${linkPoor.length}/${linkPoorAll.length}, triées par taille :**
${linkPoor.map(fmt).join("\n") || "aucune"}

**Pages thin content (<400 mots) — ${thin.length}/${thinAll.length} :**
${thin.map(fmt).join("\n") || "aucune"}

## Briefs précédents — actions DÉJÀ proposées (NE PAS RÉPÉTER)

${previousActions.length ? previousActions.map((a) => `- ${a}`).join("\n") : "aucun brief précédent"}

## Mission

Génère le brief du jour pour Laurent. Règles strictes :

1. **Cite des slugs précis** issus de l'inventaire ci-dessus. Pas de généralités.
2. **N'invente aucune métrique** non listée ici.
3. **Ne propose PAS** d'action déjà listée dans "Briefs précédents". Soit tu proposes une suite/évolution explicite ("relancer X car…"), soit du neuf.
4. Si l'inventaire montre que le site est sain (peu d'orphelins, etc.), dis-le et propose des actions de croissance, pas de correction.
5. Direct, concret, sans blabla.

Réponds en JSON strict :
{
  "date": string,
  "site_status": string,
  "actions": [{ "title": string, "description": string, "impact": "fort"|"moyen"|"faible", "time_needed": string, "target_slugs": string[] }],
  "article_idea": { "title": string, "keywords": string[], "why": string, "estimated_traffic": string },
  "alert": string,
  "weekly_goal": string,
  "score": number
}`

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text : ""

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("Pas de JSON dans la réponse")
    const brief = JSON.parse(jsonMatch[0]) as {
      date: string
      site_status: string
      actions: {
        title: string
        description: string
        impact: string
        time_needed: string
        target_slugs?: string[]
      }[]
      article_idea: { title: string; keywords: string[]; why: string; estimated_traffic: string }
      alert: string
      weekly_goal: string
      score: number
    }

    if (!dryRun) await execute(
      `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
       VALUES (?, 'brief', 'published', ?, ?, 'lou-cron')`,
      [
        `Brief matinal — ${today}`,
        `## ${today}\n\n**État du site :** ${brief.site_status}\n\n**Actions prioritaires :**\n${brief.actions
          .map(
            (a) =>
              `- [${a.impact.toUpperCase()}] **${a.title}** (${a.time_needed}): ${a.description}${a.target_slugs?.length ? ` — cibles : ${a.target_slugs.join(", ")}` : ""}`,
          )
          .join("\n")}\n\n**Idée d'article :** ${brief.article_idea.title}\nMots-clés : ${brief.article_idea.keywords.join(", ")}\n${brief.article_idea.why}\n\n**Alerte :** ${brief.alert}\n\n**Objectif semaine :** ${brief.weekly_goal}`,
        JSON.stringify({
          source: "cron_daily_brief",
          score: brief.score,
          article_idea: brief.article_idea,
          actions: brief.actions,
          inventory: {
            posts: totalPosts,
            pages: totalPages,
            orphans: orphans.length,
            recent_orphans: recentOrphans.length,
            link_poor: linkPoor.length,
            thin: thin.length,
          },
        }),
      ],
    )

    return Response.json({
      status: "ok",
      dry_run: dryRun,
      date: today,
      score: brief.score,
      site_status: brief.site_status,
      actions: brief.actions,
      article_idea: brief.article_idea,
      alert: brief.alert,
      weekly_goal: brief.weekly_goal,
      inventory: {
        posts: totalPosts,
        pages: totalPages,
        recent: recentStats.length,
        orphans: orphansAll.length,
        recent_orphans: recentOrphansAll.length,
        link_poor: linkPoorAll.length,
        thin: thinAll.length,
      },
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur daily-brief" },
      { status: 500 },
    )
  }
}
