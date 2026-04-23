/**
 * Kie.ai API client for image generation (GPT-4o Image / Nano Banana).
 *
 * Kie.ai is asynchronous: POST to create a task, then poll for results.
 * Docs: https://docs.kie.ai/4o-image-api/generate-4-o-image
 */

const KIE_BASE = "https://api.kie.ai/api/v1"

function getApiKey(): string {
  return process.env.KIE_API_KEY ?? ""
}

/**
 * Master prompt for consistent image style across all Lou-generated images.
 * Lou appends contextual scene descriptions to this base.
 */
export const IMAGE_STYLE_PROMPT = `[QUALITY]
ultra-realistic, 8K resolution, ultra-sharp focus on subjects, professional DSLR camera quality, Canon 5D Mark IV style, 35mm or 50mm prime lens, shallow depth of field with smooth bokeh background
[FORMAT]
wide 16:9 landscape, full bleed photography, no black bars, no letterboxing, fills entire frame edge to edge
[STYLE]
editorial photography style, photojournalistic, authentic candid moment, French driving school professional communication
[LIGHTING]
bright natural midday light, clean shadows, clear sky, balanced exposure
[MOOD]
professional, trustworthy, warm, accessible, French, modern, human, optimistic
[COLOR PALETTE]
navy blue, clean white, warm gold highlights, natural skin tones, French architecture tones
[NEGATIVE]
avoid: cartoon, illustration, painting, anime, oversaturated colors, fake plastic smiles, generic stock photo aesthetics, blurry foreground, distorted anatomy, extra fingers, non-French architecture, right-hand traffic, text overlaid on image, watermark, logo, border, frame`

export interface GeneratedImage {
  url: string
  taskId: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Create an image generation task on Kie.ai.
 */
async function createTask(prompt: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error("KIE_API_KEY non configuré")

  const res = await fetch(`${KIE_BASE}/gpt4o-image/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      size: "3:2",
      isEnhance: false,
      enableFallback: true,
      fallbackModel: "FLUX_MAX",
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kie.ai ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  if (data.code !== 200) {
    throw new Error(`Kie.ai erreur: ${data.msg ?? "inconnu"}`)
  }

  const taskId = data.data?.taskId
  if (!taskId) throw new Error("Kie.ai: pas de taskId retourné")

  return taskId
}

/**
 * Poll task status until complete or timeout.
 */
async function pollTask(taskId: string, timeoutMs = 45000): Promise<string[]> {
  const apiKey = getApiKey()
  const deadline = Date.now() + timeoutMs
  let poll = 0

  while (Date.now() < deadline) {
    // First 3 polls: 2s interval; then 4s to reduce pressure
    await sleep(poll < 3 ? 2000 : 4000)
    poll++

    try {
      const res = await fetch(
        `${KIE_BASE}/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        },
      )

      if (!res.ok) continue

      const data = await res.json()
      const task = data.data

      if (!task) continue

      if (task.status === "SUCCESS" && task.response?.resultUrls?.length > 0) {
        return task.response.resultUrls
      }

      if (task.status === "CREATE_TASK_FAILED" || task.status === "GENERATE_FAILED") {
        throw new Error(`Kie.ai génération échouée: ${task.errorMessage ?? task.status}`)
      }
    } catch (err) {
      // AbortError = poll fetch timed out, try next poll
      if ((err as Error).name === "AbortError") continue
      throw err
    }
  }

  throw new Error("Kie.ai: timeout — la génération prend trop de temps")
}

/**
 * Generate an image via Kie.ai.
 *
 * @param contextPrompt - Scene description from Lou
 * @returns Object with the hosted image URL and taskId
 */
export async function generateImage(contextPrompt: string): Promise<GeneratedImage> {
  const fullPrompt = `${contextPrompt}\n\n${IMAGE_STYLE_PROMPT}`

  const taskId = await createTask(fullPrompt)
  const urls = await pollTask(taskId)

  return {
    url: urls[0],
    taskId,
  }
}
