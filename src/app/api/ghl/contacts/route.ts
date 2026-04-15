import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { getAllContacts } from "@/lib/ghl/contacts"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  try {
    const contacts = await getAllContacts()
    return Response.json({ total: contacts.length, contacts })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur GHL" },
      { status: 500 },
    )
  }
}
