import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { sendPreviewEmail, sendBulkEmail } from "@/lib/ghl/email"
import { z } from "zod"

const emailSchema = z.object({
  subject: z.string().min(1),
  html_content: z.string().min(1),
  mode: z.enum(["preview", "send_all"]),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = emailSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 })
  }

  const { subject, html_content, mode } = parsed.data

  try {
    if (mode === "preview") {
      const result = await sendPreviewEmail(subject, html_content)
      return Response.json(result)
    }

    const result = await sendBulkEmail(subject, html_content)
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur envoi" },
      { status: 500 },
    )
  }
}
