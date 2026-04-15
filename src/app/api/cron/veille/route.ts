import Anthropic from "@anthropic-ai/sdk"
import { execute } from "@/lib/db/connection"

const RSS_FEEDS = [
  "https://www.securite-routiere.gouv.fr/les-medias/nos-publications/feed",
  "https://www.service-public.fr/particuliers/vosdroits/rss/N19473",
]

interface FeedItem {
  title: string
  link: string
  description: string
  pubDate: string
}

async function fetchRSS(url: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const xml = await res.text()

    const items: FeedItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xml)) !== null) {
      const content = match[1]
      const title = content.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] ?? ""
      const link = content.match(/<link>(.*?)<\/link>/)?.[1] ?? ""
      const desc = content.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/)?.[1] ?? ""
      const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? ""

      items.push({ title, link, description: desc.slice(0, 500), pubDate })
    }

    return items
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Fetch all feeds in parallel
    const feedResults = await Promise.all(RSS_FEEDS.map(fetchRSS))
    const allItems = feedResults.flat()

    // Filter items from last 48h
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    const recentItems = allItems.filter((item) => {
      if (!item.pubDate) return true // include if no date
      const itemDate = new Date(item.pubDate).getTime()
      return itemDate > cutoff
    })

    if (recentItems.length === 0) {
      return Response.json({ status: "ok", message: "Aucune actualite recente", items: 0 })
    }

    // Analyze with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const itemsSummary = recentItems
      .slice(0, 10) // limit to avoid timeout
      .map((i, idx) => `${idx + 1}. ${i.title}\n   ${i.description}\n   ${i.link}`)
      .join("\n\n")

    const analysis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Tu es LOU, veilleur pour AutoEcoleMagazine.fr (comparateur auto-ecoles).

Analyse ces actualites recentes et identifie celles qui sont pertinentes pour notre audience (futurs conducteurs, parents, gerants d'auto-ecoles).

Pour chaque actualite pertinente, donne :
- Un titre court
- Pourquoi c'est pertinent pour nous
- Une idee d'article a rediger

Actualites :
${itemsSummary}

Reponds en JSON : { "alerts": [{ "title": string, "relevance": string, "article_idea": string, "source_url": string, "priority": "high"|"medium"|"low" }] }`,
        },
      ],
    })

    const responseText = analysis.content[0].type === "text" ? analysis.content[0].text : ""

    // Try to parse JSON from response
    let alerts: { title: string; relevance: string; article_idea: string; source_url: string; priority: string }[] = []
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        alerts = parsed.alerts ?? []
      }
    } catch {
      // If parsing fails, store raw analysis
    }

    // Save high-priority alerts to content_log as article ideas
    let saved = 0
    for (const alert of alerts.filter((a) => a.priority === "high" || a.priority === "medium")) {
      try {
        await execute(
          `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
           VALUES (?, 'article', 'draft', ?, ?, 'lou-veille')`,
          [
            alert.title,
            `**Idee d'article (veille auto):**\n\n${alert.article_idea}\n\n**Source:** ${alert.source_url}\n\n**Pertinence:** ${alert.relevance}`,
            JSON.stringify({ source: "cron_veille", priority: alert.priority }),
          ],
        )
        saved++
      } catch {
        // DB may not be migrated yet
      }
    }

    return Response.json({
      status: "ok",
      feeds_scanned: RSS_FEEDS.length,
      items_found: recentItems.length,
      alerts: alerts.length,
      saved_to_log: saved,
    })
  } catch (err) {
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur veille" },
      { status: 500 },
    )
  }
}
