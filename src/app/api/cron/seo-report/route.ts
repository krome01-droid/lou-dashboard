import Anthropic from "@anthropic-ai/sdk"
import { listPosts } from "@/lib/wordpress/client"
import { execute } from "@/lib/db/connection"

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get all published posts for SEO analysis
    const posts = await listPosts({ per_page: 50, status: "publish" })
    const totalPosts = posts.length

    // Basic SEO metrics from content
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const newThisWeek = posts.filter((p) => p.date >= sevenDaysAgo).length

    // Analyze content quality with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const postsSummary = posts
      .slice(0, 20)
      .map((p) => {
        const contentLength = p.content.rendered.replace(/<[^>]*>/g, "").length
        return `- "${p.title.rendered}" (${contentLength} chars) — /${p.slug}`
      })
      .join("\n")

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Tu es LOU, expert SEO pour AutoEcoleMagazine.fr (comparateur de 9800+ auto-ecoles).

Analyse ces articles et genere un rapport SEO hebdomadaire :

Total articles publies : ${totalPosts}
Nouveaux cette semaine : ${newThisWeek}

Articles (20 derniers) :
${postsSummary}

Genere un rapport avec :
1. Score SEO estime (0-100) base sur la couverture thematique, la frequence de publication, et la qualite des titres/slugs
2. Top 3 forces
3. Top 3 faiblesses
4. 5 recommandations concretes pour la semaine prochaine
5. Idees d'articles a fort potentiel SEO

Reponds en JSON : {
  "score": number,
  "strengths": [string],
  "weaknesses": [string],
  "recommendations": [string],
  "article_ideas": [{ "title": string, "keyword": string, "estimated_volume": string }],
  "summary": string
}`,
        },
      ],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text : ""

    let report: {
      score: number
      strengths: string[]
      weaknesses: string[]
      recommendations: string[]
      article_ideas: { title: string; keyword: string; estimated_volume: string }[]
      summary: string
    }

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON")
      report = JSON.parse(jsonMatch[0])
    } catch {
      return Response.json({ status: "error", error: "Impossible de generer le rapport" }, { status: 500 })
    }

    // Save report to DB
    const periodEnd = new Date()
    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    try {
      await execute(
        `INSERT INTO wp_lou_seo_reports (report_type, period_start, period_end, data_json, summary)
         VALUES ('weekly', ?, ?, ?, ?)`,
        [
          periodStart.toISOString().split("T")[0],
          periodEnd.toISOString().split("T")[0],
          JSON.stringify({
            score: report.score,
            total_posts: totalPosts,
            new_this_week: newThisWeek,
            strengths: report.strengths,
            weaknesses: report.weaknesses,
            recommendations: report.recommendations,
            article_ideas: report.article_ideas,
          }),
          report.summary,
        ],
      )
    } catch {
      // DB may not be migrated
    }

    return Response.json({
      status: "ok",
      score: report.score,
      total_posts: totalPosts,
      new_this_week: newThisWeek,
      recommendations: report.recommendations.length,
      article_ideas: report.article_ideas.length,
      summary: report.summary,
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur SEO report" },
      { status: 500 },
    )
  }
}
