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
      max_tokens: 4000,
      tools: [OUTIL_RAPPORT],
      tool_choice: { type: "tool", name: "rendre_rapport_seo" },
      messages: [
        {
          role: "user",
          content: `Tu es LOU, expert SEO pour AutoEcoleMagazine.fr (comparateur de 9800+ auto-ecoles).

Analyse ces articles et genere un rapport SEO hebdomadaire :

Total articles publies : ${totalPosts}
Nouveaux cette semaine : ${newThisWeek}

Articles (20 derniers) :
${postsSummary}

Rends le rapport en appelant l'outil rendre_rapport_seo, et rien d'autre. C'est une note hebdomadaire : trois forces, trois faiblesses, cinq recommandations et cinq idees d'articles au plus, UNE phrase par element.`,
        },
      ],
    })

    // Rapport rendu par outil forcé, comme la veille. Le JSON libre plafonné à
    // 1500 tokens était coupé en plein objet et la route ne disait que
    // « Impossible de générer le rapport » (27/09/2026), sans la cause. Les
    // listes sont bornées dans le schéma ; une coupure est désormais nommée.
    if (response.stop_reason === "max_tokens") {
      return Response.json(
        {
          status: "error",
          error: `Rapport coupé à max_tokens (${response.usage.output_tokens} tokens produits)`,
        },
        { status: 502 },
      )
    }
    const toolUse = response.content.find((c) => c.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json(
        { status: "error", error: `Réponse sans tool_use (stop_reason: ${response.stop_reason})` },
        { status: 502 },
      )
    }
    const report = toolUse.input as {
      score: number
      strengths: string[]
      weaknesses: string[]
      recommendations: string[]
      article_ideas: { title: string; keyword: string; estimated_volume: string }[]
      summary: string
    }

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

const OUTIL_RAPPORT: Anthropic.Tool = {
  name: "rendre_rapport_seo",
  description: "Enregistre le rapport SEO hebdomadaire.",
  input_schema: {
    type: "object",
    properties: {
      score: {
        type: "number",
        description: "Score SEO estimé sur 100 : couverture thématique, fréquence de publication, qualité des titres/slugs, longueur des contenus.",
      },
      strengths: { type: "array", maxItems: 3, description: "Trois forces au plus, UNE phrase chacune.", items: { type: "string" } },
      weaknesses: { type: "array", maxItems: 3, description: "Trois faiblesses au plus, UNE phrase chacune.", items: { type: "string" } },
      recommendations: {
        type: "array",
        maxItems: 5,
        description: "Cinq recommandations concrètes au plus pour la semaine prochaine, UNE phrase chacune.",
        items: { type: "string" },
      },
      article_ideas: {
        type: "array",
        maxItems: 5,
        description: "Cinq idées d'articles à fort potentiel SEO au plus.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            keyword: { type: "string" },
            estimated_volume: { type: "string" },
          },
          required: ["title", "keyword", "estimated_volume"],
        },
      },
      summary: { type: "string", description: "Deux ou trois phrases." },
    },
    required: ["score", "strengths", "weaknesses", "recommendations", "article_ideas", "summary"],
  },
}
