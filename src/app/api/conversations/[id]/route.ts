import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { query, execute } from "@/lib/db/connection"

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
    const rows = await query<{
      id: number
      title: string | null
      messages_json: string
      created_at: string
      updated_at: string
    }>("SELECT * FROM wp_lou_conversations WHERE id = ?", [Number(id)])

    if (rows.length === 0) {
      return Response.json({ error: "Conversation introuvable" }, { status: 404 })
    }

    const conv = rows[0]
    return Response.json({
      ...conv,
      messages: JSON.parse(conv.messages_json),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const { id } = await params

  try {
    await execute("DELETE FROM wp_lou_conversations WHERE id = ?", [Number(id)])
    return Response.json({ success: true })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}
