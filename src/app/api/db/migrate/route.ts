import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { runMigrations } from "@/lib/db/migrate"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const results = await runMigrations()
  return Response.json({ results })
}
