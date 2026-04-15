import Anthropic from "@anthropic-ai/sdk"
import { listPosts } from "@/lib/wordpress/client"
import { scheduleSocialPost } from "@/lib/ghl/social-planner"
import { execute, query } from "@/lib/db/connection"

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get recent published articles (last 7 days)
    const posts = await listPosts({ per_page: 10, status: "publish" })
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentPosts = posts.filter((p) => p.date >= sevenDaysAgo)

    if (recentPosts.length === 0) {
      return Response.json({ status: "ok", message: "Aucun article recent a promouvoir", scheduled: 0 })
    }

    // Check which articles already have social posts in our DB
    let existingPostIds: number[] = []
    try {
      const rows = await query<{ wp_post_id: number }>(
        "SELECT DISTINCT CAST(JSON_EXTRACT(meta_json, '$.wp_post_id') AS UNSIGNED) as wp_post_id FROM wp_lou_social_posts WHERE created_at >= ?",
        [sevenDaysAgo],
      )
      existingPostIds = rows.map((r) => r.wp_post_id).filter(Boolean)
    } catch {
      // DB may not be migrated
    }

    // Filter articles without social posts
    const articlesToPromote = recentPosts
      .filter((p) => !existingPostIds.includes(p.id))
      .slice(0, 3) // Max 3 per run

    if (articlesToPromote.length === 0) {
      return Response.json({ status: "ok", message: "Tous les articles recents ont deja des posts", scheduled: 0 })
    }

    // Generate social posts with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const articlesText = articlesToPromote
      .map((p, i) => `${i + 1}. "${p.title.rendered}" — ${p.link}`)
      .join("\n")

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Tu es LOU, community manager pour AutoEcoleMagazine.fr.

Genere des posts Facebook pour promouvoir ces articles. Chaque post doit :
- Accrocher avec une question ou un chiffre
- Etre engageant et accessible (cible : 17-25 ans)
- Inclure 3-5 hashtags pertinents
- Faire 100-200 caracteres (hors hashtags)
- NE PAS inclure le lien (il sera ajoute automatiquement)

Articles :
${articlesText}

Reponds en JSON : { "posts": [{ "article_index": number, "text": string, "hashtags": ["tag1", "tag2"] }] }`,
        },
      ],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text : ""

    let socialPosts: { article_index: number; text: string; hashtags: string[] }[] = []
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        socialPosts = parsed.posts ?? []
      }
    } catch {
      return Response.json({ status: "error", error: "Impossible de parser la reponse Claude" }, { status: 500 })
    }

    // Schedule posts for today at different times
    let scheduled = 0
    const baseHour = 12 // noon

    for (const post of socialPosts) {
      const article = articlesToPromote[post.article_index - 1]
      if (!article) continue

      const scheduleTime = new Date()
      scheduleTime.setHours(baseHour + scheduled * 3, 0, 0, 0) // Space 3h apart
      if (scheduleTime < new Date()) {
        scheduleTime.setDate(scheduleTime.getDate() + 1) // Tomorrow if time has passed
      }

      try {
        await scheduleSocialPost({
          platform: "facebook",
          text: post.text,
          hashtags: post.hashtags,
          scheduled_at: scheduleTime.toISOString(),
          link_url: article.link,
        })

        // Log to DB
        try {
          await execute(
            `INSERT INTO wp_lou_social_posts (platform, scheduled_at, status, caption, media_urls)
             VALUES ('facebook', ?, 'scheduled', ?, ?)`,
            [
              scheduleTime.toISOString().slice(0, 19).replace("T", " "),
              `${post.text}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}`,
              JSON.stringify({ link: article.link, wp_post_id: article.id }),
            ],
          )
        } catch {
          // DB logging failure doesn't block scheduling
        }

        scheduled++
      } catch {
        // GHL API may fail — continue with next post
      }
    }

    return Response.json({
      status: "ok",
      articles_found: recentPosts.length,
      articles_promoted: articlesToPromote.length,
      posts_scheduled: scheduled,
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur social auto" },
      { status: 500 },
    )
  }
}
