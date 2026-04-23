import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { streamChatWithTools } from "@/lib/ai/anthropic-client"
import { z } from "zod"

// Allow up to 5 minutes — needed for Kie.ai image generation (GPT-4o takes 60-120s)
export const maxDuration = 300

const attachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  data: z.string(), // base64
})

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      attachments: z.array(attachmentSchema).optional(),
    }),
  ),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "Requête invalide", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const stream = streamChatWithTools(parsed.data.messages)

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
