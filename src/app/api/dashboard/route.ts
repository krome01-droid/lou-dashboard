import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { listPosts } from "@/lib/wordpress/client"
import { query } from "@/lib/db/connection"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0]

  try {
    // Fetch all published posts
    const allPosts = await listPosts({ per_page: 100, status: "publish" })
    const totalArticles = allPosts.length

    // Count articles this month
    const thisMonthArticles = allPosts.filter(
      (p) => p.date >= firstDayOfMonth,
    ).length

    // Fetch recent activity from DB
    let recentActivity: { title: string; type: string; status: string; created_at: string }[] = []
    try {
      recentActivity = await query<{
        title: string
        type: string
        status: string
        created_at: string
      }>(
        "SELECT title, type, status, created_at FROM wp_lou_content_log ORDER BY created_at DESC LIMIT 5",
      )
    } catch {
      // DB may not be migrated yet
    }

    // Fetch upcoming calendar events
    let upcomingEvents: { title: string; content_type: string; planned_date: string }[] = []
    try {
      upcomingEvents = await query<{
        title: string
        content_type: string
        planned_date: string
      }>(
        "SELECT title, content_type, planned_date FROM wp_lou_editorial_calendar WHERE planned_date >= CURDATE() ORDER BY planned_date ASC LIMIT 5",
      )
    } catch {
      // DB may not be migrated yet
    }

    // Fetch latest SEO score from automated reports
    let latestSeoScore: number | null = null
    try {
      const seoRows = await query<{ data_json: string }>(
        "SELECT data_json FROM wp_lou_seo_reports ORDER BY created_at DESC LIMIT 1",
      )
      if (seoRows.length > 0) {
        const parsed = JSON.parse(seoRows[0].data_json ?? "{}")
        if (typeof parsed?.score === "number") latestSeoScore = parsed.score
      }
    } catch {
      // DB may not be migrated yet
    }

    return Response.json({
      totalArticles,
      thisMonthArticles,
      recentActivity,
      upcomingEvents,
      latestSeoScore,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}
