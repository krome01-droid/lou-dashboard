import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getOAuthAuthorizeUrl, isOAuthConfigured, isOAuthConnected } from "@/lib/google/auth"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action")

  if (action === "authorize") {
    if (!isOAuthConfigured()) {
      return Response.json(
        { error: "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET non configures" },
        { status: 400 },
      )
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://agent.autoecolemagazine.fr/admin-lou"
    const redirectUri = `${baseUrl}/api/google/callback`
    const authUrl = getOAuthAuthorizeUrl(redirectUri)

    return Response.json({ authUrl })
  }

  return Response.json({
    configured: isOAuthConfigured(),
    connected: isOAuthConnected(),
    hasGA4PropertyId: !!process.env.GA4_PROPERTY_ID,
  })
}
