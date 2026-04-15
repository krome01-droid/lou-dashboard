import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getConnectedAccounts } from "@/lib/ghl/social-planner"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  try {
    const accounts = await getConnectedAccounts()
    return Response.json(accounts)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur récupération comptes" },
      { status: 500 },
    )
  }
}
