import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { createPost, findOrCreateCategory } from "@/lib/wordpress/client"
import { execute } from "@/lib/db/connection"
import { marked } from "marked"
import { z } from "zod"

const publishSchema = z.object({
  title: z.string(),
  content_markdown: z.string(),
  slug: z.string(),
  category: z.string(),
  tags: z.array(z.string()).optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  target_keyword: z.string(),
  status: z.enum(["draft", "publish"]).default("draft"),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = publishSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const categoryId = await findOrCreateCategory(data.category)
    const htmlContent = await marked.parse(data.content_markdown)

    const post = await createPost({
      title: data.title,
      content: htmlContent,
      slug: data.slug,
      status: data.status,
      categories: [categoryId],
      meta: {
        _yoast_wpseo_title: data.meta_title ?? null,
        _yoast_wpseo_metadesc: data.meta_description ?? null,
        _yoast_wpseo_focuskw: data.target_keyword,
      },
    })

    // Log to content_log
    try {
      await execute(
        `INSERT INTO wp_lou_content_log (title, type, status, wp_post_id, wp_url, meta_json, created_by)
         VALUES (?, 'article', ?, ?, ?, ?, 'lou')`,
        [
          data.title,
          data.status === "publish" ? "published" : "draft",
          post.id,
          post.link,
          JSON.stringify({ category: data.category, target_keyword: data.target_keyword }),
        ],
      )
    } catch {
      // DB logging failure should not block publication
    }

    return Response.json({
      success: true,
      post_id: post.id,
      url: post.link,
      status: data.status,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur publication" },
      { status: 500 },
    )
  }
}
