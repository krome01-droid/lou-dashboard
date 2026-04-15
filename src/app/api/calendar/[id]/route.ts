import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { execute } from "@/lib/db/connection"
import { z } from "zod"

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content_type: z.enum(["article", "newsletter", "social_campaign", "email_sequence", "other"]).optional(),
  planned_date: z.string().optional(),
  status: z.enum(["idea", "planned", "in_progress", "review", "published", "cancelled"]).optional(),
  notes: z.string().optional(),
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

  const data = parsed.data
  const sets: string[] = []
  const values: (string | number | null)[] = []

  if (data.title !== undefined) { sets.push("title = ?"); values.push(data.title) }
  if (data.content_type !== undefined) { sets.push("content_type = ?"); values.push(data.content_type) }
  if (data.planned_date !== undefined) { sets.push("planned_date = ?"); values.push(data.planned_date) }
  if (data.status !== undefined) { sets.push("status = ?"); values.push(data.status) }
  if (data.notes !== undefined) { sets.push("notes = ?"); values.push(data.notes || null) }

  if (sets.length === 0) {
    return Response.json({ error: "Aucun champ a mettre a jour" }, { status: 400 })
  }

  values.push(Number(id))

  try {
    await execute(
      `UPDATE wp_lou_editorial_calendar SET ${sets.join(", ")} WHERE id = ?`,
      values,
    )
    return Response.json({ success: true })
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
    await execute("DELETE FROM wp_lou_editorial_calendar WHERE id = ?", [Number(id)])
    return Response.json({ success: true })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}
