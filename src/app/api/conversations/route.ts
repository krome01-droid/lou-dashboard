import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { query, execute } from "@/lib/db/connection"
import { runMigrations } from "@/lib/db/migrate"

// A Promise stored at module level so concurrent requests in the same serverless
// instance share one migration run. Resets to null on failure so the next cold
// start retries automatically.
let migrationPromise: Promise<void> | null = null

async function ensureTables() {
  if (!migrationPromise) {
    migrationPromise = runMigrations()
      .then(() => undefined)
      .catch(() => {
        migrationPromise = null // allow retry on next request
      })
  }
  await migrationPromise
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  await ensureTables()

  try {
    const conversations = await query<{
      id: number
      title: string | null
      created_at: string
      updated_at: string
    }>(
      "SELECT id, title, created_at, updated_at FROM wp_lou_conversations ORDER BY updated_at DESC LIMIT 30",
    )
    return Response.json(conversations)
  } catch {
    return Response.json([])
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  const body = await req.json()
  const { id, title, messages } = body as {
    id?: number
    title?: string
    messages: unknown[]
  }

  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: "Messages requis" }, { status: 400 })
  }

  await ensureTables()

  const messagesJson = JSON.stringify(messages)

  try {
    if (id) {
      await execute(
        "UPDATE wp_lou_conversations SET title = ?, messages_json = ? WHERE id = ?",
        [title || null, messagesJson, id],
      )
      return Response.json({ success: true, id })
    } else {
      const result = await execute(
        "INSERT INTO wp_lou_conversations (title, messages_json) VALUES (?, ?)",
        [title || null, messagesJson],
      )
      return Response.json({ success: true, id: result.insertId })
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur sauvegarde" },
      { status: 500 },
    )
  }
}
