import Anthropic from "@anthropic-ai/sdk"
import { listPosts } from "@/lib/wordpress/client"
import { execute, query } from "@/lib/db/connection"

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const today = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Paris",
    })

    // Gather site data in parallel
    const [posts, recentConversations, seoReports] = await Promise.all([
      listPosts({ per_page: 50, status: "publish" }).catch(() => []),
      query<{ title: string; created_at: string }>(
        `SELECT title, created_at FROM wp_lou_conversations ORDER BY created_at DESC LIMIT 5`,
      ).catch(() => []),
      query<{ summary: string; data_json: string; created_at: string }>(
        `SELECT summary, data_json, created_at FROM wp_lou_seo_reports ORDER BY created_at DESC LIMIT 1`,
      ).catch(() => []),
    ])

    // Recent articles (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentPosts = posts.filter((p) => p.date >= sevenDaysAgo)
    const totalPosts = posts.length

    // Compute simple SEO score from article count and frequency
    const avgPerWeek = recentPosts.length
    const lastSeoData = seoReports[0]
      ? (() => {
          try {
            return JSON.parse(seoReports[0].data_json)
          } catch {
            return null
          }
        })()
      : null

    const seoScore = lastSeoData?.score ?? Math.min(100, 40 + totalPosts * 0.3 + avgPerWeek * 5)

    // Build context for Claude
    const recentPostsList = recentPosts
      .slice(0, 10)
      .map((p) => `- "${p.title.rendered}"`)
      .join("\n")

    const allPostSlugs = posts
      .slice(0, 30)
      .map((p) => p.slug)
      .join(", ")

    const prompt = `Tu es LOU, l'agent IA d'AutoEcoleMagazine.fr — le premier comparateur de 9814 auto-écoles en France.

Date du jour : ${today}

## Données du site

**Articles publiés :** ${totalPosts} au total
**Publiés cette semaine :** ${recentPosts.length}
**Score SEO estimé :** ${Math.round(seoScore)}/100

**Articles récents :**
${recentPostsList || "Aucun article cette semaine"}

**Slugs couverts (échantillon) :** ${allPostSlugs}

## Mission du brief matinal

Génère un rapport quotidien concis et actionnable pour Laurent (gestionnaire du site). Ce rapport doit :

1. **État du site** — 2-3 phrases sur la santé actuelle du contenu et du SEO
2. **Opportunités du jour** — 3 actions concrètes prioritaires (avec impact estimé : fort/moyen/faible)
3. **Idée d'article** — 1 sujet à fort potentiel SEO, avec titre proposé et mots-clés cibles
4. **Alerte** — 1 point de vigilance ou risque à surveiller
5. **Objectif de la semaine** — 1 objectif mesurable à atteindre avant vendredi

Sois direct, concret, sans blabla. Pense comme un consultant SEO/content qui facture 500€/h.

Réponds en JSON :
{
  "date": string,
  "site_status": string,
  "actions": [{ "title": string, "description": string, "impact": "fort"|"moyen"|"faible", "time_needed": string }],
  "article_idea": { "title": string, "keywords": string[], "why": string, "estimated_traffic": string },
  "alert": string,
  "weekly_goal": string,
  "score": number
}`

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text : ""

    let brief: {
      date: string
      site_status: string
      actions: { title: string; description: string; impact: string; time_needed: string }[]
      article_idea: { title: string; keywords: string[]; why: string; estimated_traffic: string }
      alert: string
      weekly_goal: string
      score: number
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("Pas de JSON dans la réponse")
    brief = JSON.parse(jsonMatch[0])

    // Save to content_log as daily brief
    await execute(
      `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
       VALUES (?, 'brief', 'published', ?, ?, 'lou-cron')`,
      [
        `Brief matinal — ${today}`,
        `## ${today}\n\n**État du site :** ${brief.site_status}\n\n**Actions prioritaires :**\n${brief.actions.map((a) => `- [${a.impact.toUpperCase()}] **${a.title}** (${a.time_needed}): ${a.description}`).join("\n")}\n\n**Idée d'article :** ${brief.article_idea.title}\nMots-clés : ${brief.article_idea.keywords.join(", ")}\n${brief.article_idea.why}\n\n**Alerte :** ${brief.alert}\n\n**Objectif semaine :** ${brief.weekly_goal}`,
        JSON.stringify({
          source: "cron_daily_brief",
          score: brief.score,
          article_idea: brief.article_idea,
          actions_count: brief.actions.length,
        }),
      ],
    )

    return Response.json({
      status: "ok",
      date: today,
      score: brief.score,
      site_status: brief.site_status,
      actions: brief.actions,
      article_idea: brief.article_idea,
      alert: brief.alert,
      weekly_goal: brief.weekly_goal,
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur daily-brief" },
      { status: 500 },
    )
  }
}
