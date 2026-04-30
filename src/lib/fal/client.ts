/**
 * Fal.ai API client for image generation — fallback when Kie.ai is unavailable.
 * Uses fal-ai/flux-pro via the async queue API.
 * Docs: https://fal.ai/docs/rest-api
 */

const FAL_QUEUE_BASE = "https://queue.fal.run"
const FAL_MODEL = "fal-ai/flux-pro"

function getApiKey(): string {
  return process.env.FAL_API_KEY ?? ""
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface FalQueueResponse {
  request_id: string
  status: string
  response_url: string
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
  logs?: Array<{ message: string }>
}

interface FalResultResponse {
  images?: Array<{ url: string; content_type: string }>
  error?: string
}

/**
 * Submit image generation task to fal.ai queue.
 */
async function submitTask(prompt: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error("FAL_API_KEY non configuré")

  const res = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "landscape_16_9",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      safety_tolerance: "2",
      output_format: "jpeg",
    }),
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fal.ai ${res.status}: ${text.slice(0, 300)}`)
  }

  const data: FalQueueResponse = await res.json()
  if (!data.request_id) throw new Error("Fal.ai: pas de request_id retourné")

  return data.request_id
}

/**
 * Poll fal.ai queue until image is ready or timeout.
 */
async function pollResult(requestId: string, timeoutMs = 110000): Promise<string> {
  const apiKey = getApiKey()
  const deadline = Date.now() + timeoutMs
  let poll = 0

  while (Date.now() < deadline) {
    await sleep(poll < 4 ? 4000 : 6000)
    poll++

    try {
      const statusRes = await fetch(
        `${FAL_QUEUE_BASE}/${FAL_MODEL}/requests/${requestId}/status`,
        {
          headers: { Authorization: `Key ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        },
      )

      if (!statusRes.ok) continue

      const status: FalStatusResponse = await statusRes.json()

      if (status.status === "COMPLETED") {
        const resultRes = await fetch(
          `${FAL_QUEUE_BASE}/${FAL_MODEL}/requests/${requestId}`,
          {
            headers: { Authorization: `Key ${apiKey}` },
            signal: AbortSignal.timeout(8000),
          },
        )
        if (!resultRes.ok) throw new Error(`Fal.ai résultat ${resultRes.status}`)

        const result: FalResultResponse = await resultRes.json()
        const imageUrl = result.images?.[0]?.url
        if (!imageUrl) throw new Error("Fal.ai: aucune image dans la réponse")
        return imageUrl
      }

      if (status.status === "FAILED") {
        throw new Error("Fal.ai: génération échouée")
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") continue
      throw err
    }
  }

  throw new Error("Fal.ai: timeout — la génération prend trop de temps")
}

/**
 * Generate an image via fal.ai (flux-pro).
 * Returns the hosted image URL and the request ID.
 */
export async function generateImageFal(
  prompt: string,
): Promise<{ url: string; requestId: string }> {
  const requestId = await submitTask(prompt)
  const url = await pollResult(requestId)
  return { url, requestId }
}
