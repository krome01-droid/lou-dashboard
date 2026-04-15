import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { uploadMedia } from "@/lib/wordpress/client"
import { z } from "zod"

const mediaSchema = z.object({
  image_url: z.string().url(),
  filename: z.string(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = mediaSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 })
  }

  const mediaId = await uploadMedia(parsed.data.image_url, parsed.data.filename)
  if (!mediaId) {
    return Response.json({ error: "Échec upload" }, { status: 500 })
  }

  return Response.json({ success: true, media_id: mediaId })
}
