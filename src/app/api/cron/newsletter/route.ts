import Anthropic from "@anthropic-ai/sdk"
import { listPosts } from "@/lib/wordpress/client"
import { sendBulkEmail } from "@/lib/ghl/email"
import { execute } from "@/lib/db/connection"

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get articles from last 7 days
    const posts = await listPosts({ per_page: 20, status: "publish" })
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const weeklyPosts = posts.filter((p) => p.date >= sevenDaysAgo)

    if (weeklyPosts.length === 0) {
      return Response.json({ status: "ok", message: "Aucun article cette semaine, newsletter non envoyee", sent: 0 })
    }

    // Generate newsletter HTML with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const articlesText = weeklyPosts
      .map((p) => `- "${p.title.rendered}" — ${p.link}`)
      .join("\n")

    const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Tu es LOU, redacteur de la newsletter hebdomadaire d'AutoEcoleMagazine.fr.

Genere le CONTENU (pas le HTML complet, juste le corps) d'une newsletter digest avec :
- Un titre accrocheur pour cette semaine
- Un court edito (2-3 phrases) sur l'actualite auto-ecole
- La liste des articles de la semaine avec un resume d'une phrase pour chacun
- Un CTA vers le site

Date : ${today}
Articles de la semaine :
${articlesText}

Reponds en JSON : { "subject": string, "edito": string, "articles": [{ "title": string, "summary": string, "url": string }], "cta_text": string }`,
        },
      ],
    })

    const responseText = response.content[0].type === "text" ? response.content[0].text : ""

    let newsletter: { subject: string; edito: string; articles: { title: string; summary: string; url: string }[]; cta_text: string }
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON")
      newsletter = JSON.parse(jsonMatch[0])
    } catch {
      return Response.json({ status: "error", error: "Impossible de generer le contenu newsletter" }, { status: 500 })
    }

    // Build HTML email
    const articleRows = newsletter.articles
      .map(
        (a) => `
        <tr>
          <td style="padding: 16px 20px; border-bottom: 1px solid #eeeeee;">
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-family: Arial, sans-serif;">
              <a href="${a.url}" style="color: #e31e44; text-decoration: none;">${a.title}</a>
            </h3>
            <p style="margin: 0; font-size: 14px; color: #666666; font-family: Arial, sans-serif; line-height: 1.5;">${a.summary}</p>
          </td>
        </tr>`,
      )
      .join("")

    const html = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <div style="padding: 28px 40px; border-bottom: 3px solid #e31e44; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-family: Impact, Arial, sans-serif; text-transform: uppercase;">
            <span style="color: #e31e44; font-style: italic;">AUTO-ECOLE</span><span style="color: #1a1c1c; font-style: italic;">MAGAZINE</span>
          </h1>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 2px;">Newsletter Hebdomadaire</p>
        </div>

        <div style="padding: 30px 40px;">
          <p style="font-size: 16px; line-height: 1.6; color: #474747; margin: 0 0 20px 0;">
            Bonjour {{contact.first_name}},
          </p>
          <p style="font-size: 16px; line-height: 1.6; color: #474747; margin: 0 0 25px 0;">
            ${newsletter.edito}
          </p>

          <h2 style="color: #ba0031; font-size: 18px; margin: 0 0 16px 0;">Les articles de la semaine</h2>
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
            ${articleRows}
          </table>

          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="https://autoecolemagazine.fr" style="display: inline-block; background-color: #e31e44; color: #ffffff; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 36px; border-radius: 8px;">${newsletter.cta_text}</a>
              </td>
            </tr>
          </table>
        </div>

        <div style="padding: 20px 40px; background-color: #1a1c1c; text-align: center;">
          <p style="font-size: 12px; color: #999999; margin: 0; font-family: Arial, sans-serif;">
            Auto-Ecole Magazine — Le comparateur d'auto-ecoles en France
          </p>
        </div>
      </div>`

    // Send newsletter
    const result = await sendBulkEmail(newsletter.subject, html)

    // Log to DB
    try {
      await execute(
        `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
         VALUES (?, 'newsletter', 'published', ?, ?, 'lou-newsletter')`,
        [
          newsletter.subject,
          newsletter.edito,
          JSON.stringify({
            total: result.total,
            success: result.success,
            errors: result.errors.length,
            articles_count: weeklyPosts.length,
          }),
        ],
      )
    } catch {
      // DB logging failure doesn't block
    }

    return Response.json({
      status: "ok",
      subject: newsletter.subject,
      articles_count: weeklyPosts.length,
      sent: result.success,
      total: result.total,
      errors: result.errors.length,
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur newsletter" },
      { status: 500 },
    )
  }
}
