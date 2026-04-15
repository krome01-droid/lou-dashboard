import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getPost, updatePost } from "@/lib/wordpress/client"
import { z } from "zod"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const { id } = await params

  try {
    const post = await getPost(Number(id))
    return Response.json({
      id: post.id,
      title: post.title.rendered,
      content: post.content.rendered,
      slug: post.slug,
      status: post.status,
      link: post.link,
      date: post.date,
      categories: post.categories,
      tags: post.tags,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}

const updateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  status: z.enum(["draft", "publish"]).optional(),
  slug: z.string().optional(),
})

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Donnees invalides" }, { status: 400 })
  }

  try {
    const post = await updatePost(Number(id), parsed.data)
    return Response.json({
      success: true,
      id: post.id,
      title: post.title.rendered,
      status: post.status,
      link: post.link,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}
