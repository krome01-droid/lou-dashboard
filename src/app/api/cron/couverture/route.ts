import { getPostBySlug, updatePost, uploadMedia } from "@/lib/wordpress/client"
import {
  requestImage,
  attendreImage,
  fetchCatalogue,
  formatArticle,
  isCromeConfigured,
} from "@/lib/crome/client"

// Refaire la couverture d'un article déjà en ligne.
//
// Née le 21/09/2026 : deux articles d'autoecolemagazine.fr (18 et 19/09)
// portaient une vignette avec un tiers droit laissé blanc, et la seconde était
// même l'image que le studio avait refusée — corrigé côté studio, mais les
// articles publiés gardaient leur défaut. Il n'existait aucun moyen de
// remplacer une vignette sans les identifiants WordPress, que seule LOU tient.
//
// Ce n'est pas une tâche de cron : elle ne figure pas dans la crontab et ne
// s'exécute que sur demande, avec le secret des tâches, comme les autres.
//
//   ?slug=<slug>              l'article, obligatoire
//   &scene=<clé>              scène du catalogue ; sinon le studio prend son défaut
//   &image_url=<url>          réutiliser une image que le studio a déjà, au lieu
//                             d'en générer une — uniquement depuis son Storage

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Seule origine acceptée pour une image fournie : le Storage du studio. */
const STORAGE_STUDIO = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/generations\//

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const slug = params.get("slug")?.trim()
  const scene = params.get("scene")?.trim() || undefined
  const imageFournie = params.get("image_url")?.trim() || undefined

  if (!slug) return Response.json({ status: "error", error: "slug requis" }, { status: 400 })
  if (imageFournie && !STORAGE_STUDIO.test(imageFournie)) {
    return Response.json(
      { status: "error", error: "image_url doit pointer sur le Storage du studio" },
      { status: 400 },
    )
  }

  try {
    const post = await getPostBySlug(slug)
    if (!post) return Response.json({ status: "error", error: "article introuvable", slug }, { status: 404 })

    let imageUrl = imageFournie ?? null
    let visuel: Record<string, string | null> = {}

    if (!imageUrl) {
      if (!isCromeConfigured()) {
        return Response.json(
          { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
          { status: 500 },
        )
      }
      const catalogue = await fetchCatalogue()
      if (scene && !catalogue.scenes.some((s) => s.key === scene)) {
        return Response.json(
          { status: "error", error: "scène inconnue", scene, scenes: catalogue.scenes.map((s) => s.key) },
          { status: 400 },
        )
      }
      // Même demande que la rédaction : scène et format fixés, le reste tiré au
      // sort par le studio parmi ce que la scène accepte.
      let media = await requestImage({
        scene,
        format: formatArticle(catalogue.formats),
        destination: "couverture_article",
      })
      if (!media.image_url && media.generation_id && media.status !== "error") {
        media = await attendreImage(media.generation_id)
      }
      if (!media.image_url) {
        return Response.json(
          { status: "error", error: media.error ?? media.reason ?? `studio : ${media.status ?? "sans réponse"}` },
          { status: 502 },
        )
      }
      imageUrl = media.image_url
      visuel = {
        scene: media.scene ?? scene ?? null,
        light: media.light ?? null,
        style: media.style ?? null,
        place: media.place ?? null,
      }
    }

    // Un nom de fichier neuf à chaque fois : WordPress garde l'ancien média, et
    // un nom identique lui ferait suffixer le nouveau, ce qui trompe à la lecture.
    const extension = imageUrl.toLowerCase().includes(".png") ? "png" : "jpg"
    const horodatage = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const mediaId = await uploadMedia(imageUrl, `${slug}-couverture-${horodatage}.${extension}`)
    if (!mediaId) {
      return Response.json(
        { status: "error", error: "médiathèque WordPress : téléversement refusé", image_url: imageUrl },
        { status: 502 },
      )
    }

    const ancienne = post.featured_media
    await updatePost(post.id, { featured_media: mediaId })

    return Response.json({
      status: "ok",
      slug,
      post_id: post.id,
      lien: post.link,
      ancienne_couverture: ancienne || null,
      nouvelle_couverture: mediaId,
      image_url: imageUrl,
      source: imageFournie ? "image fournie" : "studio",
      ...visuel,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[cron/couverture]", message)
    return Response.json({ status: "error", error: message }, { status: 500 })
  }
}
