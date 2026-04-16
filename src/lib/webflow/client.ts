/**
 * Webflow Content API v2 — Client
 * Doc : https://developers.webflow.com/v2.0/reference/
 *
 * Variables d'environnement requises :
 *   WF_API_KEY        — clé API Webflow (Bearer token)
 *   WF_SITE_ID        — ID du site Webflow
 *   WF_COLLECTION_ID  — ID de la collection principale (articles/blog)
 */

const BASE_URL = "https://api.webflow.com/v2"

function apiKey() {
  const key = process.env.WF_API_KEY
  if (!key) throw new Error("WF_API_KEY manquant — configurer dans .env.local")
  return key
}

async function wfFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  })

  const body = await res.json()

  if (!res.ok) {
    throw new Error(`Webflow API ${res.status}: ${JSON.stringify(body)}`)
  }

  return body as T
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebflowItem {
  id: string
  fieldData: Record<string, unknown>
  cmsLocaleId?: string
  lastPublished?: string
  lastUpdated?: string
  createdOn?: string
  isArchived?: boolean
  isDraft?: boolean
}

export interface WebflowItemsResponse {
  items: WebflowItem[]
  pagination: { limit: number; offset: number; total: number }
}

// ─── Markdown → Webflow Rich Text ────────────────────────────────────────────
// Conversion simplifiée : chaque paragraphe devient un nœud "paragraph".
// Pour un rendu riche, utiliser un parser Markdown complet (remark, unified).

export function markdownToWebflowRichText(markdown: string): object {
  const lines = markdown.split("\n")
  const children: object[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const tagMap: Record<number, string> = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" }
      children.push({
        type: tagMap[level],
        children: [{ type: "text", text: headingMatch[2] }],
      })
      continue
    }

    // List items
    if (/^[-*]\s+/.test(trimmed)) {
      children.push({
        type: "list",
        tag: "ul",
        children: [
          {
            type: "listitem",
            children: [{ type: "text", text: trimmed.replace(/^[-*]\s+/, "") }],
          },
        ],
      })
      continue
    }

    // Paragraph (default)
    // Handle inline bold/italic minimally
    children.push({
      type: "paragraph",
      children: [{ type: "text", text: trimmed }],
    })
  }

  return { type: "root", children }
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Créer un item dans une collection Webflow.
 * fields : objet clé/valeur correspondant aux champs de la collection.
 */
export async function createItem(
  collectionId: string,
  fields: Record<string, unknown>,
  isDraft = true,
): Promise<WebflowItem> {
  const res = await wfFetch<{ id: string; fieldData: Record<string, unknown> }>(
    `/collections/${collectionId}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        isArchived: false,
        isDraft,
        fieldData: fields,
      }),
    },
  )

  return res as WebflowItem
}

/**
 * Mettre à jour un item existant dans une collection.
 */
export async function updateItem(
  collectionId: string,
  itemId: string,
  fields: Partial<Record<string, unknown>>,
): Promise<WebflowItem> {
  const res = await wfFetch<WebflowItem>(`/collections/${collectionId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ fieldData: fields }),
  })

  return res
}

/**
 * Lister / rechercher des items dans une collection.
 */
export async function listItems(
  collectionId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<WebflowItemsResponse> {
  const params = new URLSearchParams()
  if (options.limit) params.set("limit", String(options.limit))
  if (options.offset) params.set("offset", String(options.offset))

  return wfFetch<WebflowItemsResponse>(
    `/collections/${collectionId}/items?${params.toString()}`,
  )
}

/**
 * Publier un ou plusieurs items (passer de draft → live).
 */
export async function publishItem(
  collectionId: string,
  itemId: string,
): Promise<{ publishedItemIds: string[] }> {
  return wfFetch(`/collections/${collectionId}/items/publish`, {
    method: "POST",
    body: JSON.stringify({ itemIds: [itemId] }),
  })
}
