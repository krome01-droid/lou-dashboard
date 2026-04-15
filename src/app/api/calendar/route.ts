import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { query, execute } from "@/lib/db/connection"
import { z } from "zod"

const eventSchema = z.object({
  title: z.string().min(1),
  content_type: z.enum(["article", "newsletter", "social_campaign", "email_sequence", "other"]),
  planned_date: z.string(),
  status: z.enum(["idea", "planned", "in_progress", "review", "published", "cancelled"]).default("planned"),
  notes: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") // format: YYYY-MM
  const status = searchParams.get("status")

  let sql = "SELECT * FROM wp_lou_editorial_calendar WHERE 1=1"
  const params: (string | number)[] = []

  if (month) {
    sql += " AND DATE_FORMAT(planned_date, '%Y-%m') = ?"
    params.push(month)
  }

  if (status) {
    sql += " AND status = ?"
    params.push(status)
  }

  sql += " ORDER BY planned_date ASC"

  try {
    const events = await query<{
      id: number
      title: string
      content_type: string
      planned_date: string
      status: string
      notes: string | null
      created_at: string
    }>(sql, params)

    return Response.json(events)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Donnees invalides", details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const result = await execute(
      `INSERT INTO wp_lou_editorial_calendar (title, content_type, planned_date, status, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [data.title, data.content_type, data.planned_date, data.status, data.notes || null],
    )

    return Response.json({
      success: true,
      id: result.insertId,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur creation" },
      { status: 500 },
    )
  }
}
