import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { listPosts } from "@/lib/wordpress/client"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)

  try {
    const posts = await listPosts({
      search: searchParams.get("search") ?? undefined,
      per_page: parseInt(searchParams.get("per_page") ?? "10", 10),
      status: searchParams.get("status") ?? "publish",
    })

    return Response.json(
      posts.map((p) => ({
        id: p.id,
        title: p.title.rendered,
        slug: p.slug,
        status: p.status,
        link: p.link,
        date: p.date,
      })),
    )
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}
