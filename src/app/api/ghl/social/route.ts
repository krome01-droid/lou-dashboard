import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { scheduleSocialPost } from "@/lib/ghl/social-planner"
import { execute, query } from "@/lib/db/connection"
import { z } from "zod"

const socialSchema = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin"]),
  text: z.string().min(1),
  hashtags: z.array(z.string()).optional(),
  scheduled_at: z.string(),
  link_url: z.string().optional(),
  media_url: z.string().optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = socialSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 })
  }

  try {
    const result = await scheduleSocialPost(parsed.data)

    // Log to social_posts
    try {
      await execute(
        `INSERT INTO wp_lou_social_posts (platform, scheduled_at, status, caption)
         VALUES (?, ?, 'scheduled', ?)`,
        [parsed.data.platform, parsed.data.scheduled_at, parsed.data.text],
      )
    } catch {
      // DB logging failure should not block scheduling
    }

    return Response.json({ success: true, result })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur programmation" },
      { status: 500 },
    )
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  // Fetch scheduled posts from our DB
  try {
    const posts = await query<{
      id: number
      platform: string
      scheduled_at: string | null
      published_at: string | null
      status: string
      caption: string | null
    }>(
      "SELECT id, platform, scheduled_at, published_at, status, caption FROM wp_lou_social_posts ORDER BY scheduled_at DESC LIMIT 20",
    )
    return Response.json(posts)
  } catch {
    // DB may not be migrated — return empty
    return Response.json([])
  }
}
