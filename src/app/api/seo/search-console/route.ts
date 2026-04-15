import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { isGoogleConfigured } from "@/lib/google/auth"
import { getTopKeywords, getTopPages, getSummary } from "@/lib/google/search-console"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  if (!isGoogleConfigured()) {
    return Response.json({ configured: false, message: "Search Console non configure" })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") ?? "keywords"

  try {
    switch (type) {
      case "keywords": {
        const keywords = await getTopKeywords(20)
        return Response.json({ configured: true, type, keywords })
      }
      case "pages": {
        const pages = await getTopPages(10)
        return Response.json({ configured: true, type, pages })
      }
      case "summary": {
        const summary = await getSummary()
        return Response.json({ configured: true, type, ...summary })
      }
      default:
        return Response.json({ error: "Type invalide" }, { status: 400 })
    }
  } catch (err) {
    return Response.json(
      { configured: true, error: err instanceof Error ? err.message : "Erreur Search Console" },
      { status: 500 },
    )
  }
}
