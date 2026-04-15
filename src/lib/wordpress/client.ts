const WP_URL = () => process.env.WP_URL!
const WP_AUTH = () =>
  Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString("base64")

async function wpFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WP_URL()}/wp-json/wp/v2${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${WP_AUTH()}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WordPress API ${res.status}: ${text}`)
  }

  return res.json()
}

// --- Posts ---

export interface WPPost {
  id: number
  title: { rendered: string }
  content: { rendered: string }
  slug: string
  status: string
  link: string
  date: string
  categories: number[]
  tags: number[]
}

export interface CreatePostInput {
  title: string
  content: string
  slug?: string
  status?: "draft" | "publish"
  categories?: number[]
  tags?: number[]
  featured_media?: number
  meta?: Record<string, string | null>
}

export async function createPost(input: CreatePostInput): Promise<WPPost> {
  return wpFetch<WPPost>("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export async function updatePost(id: number, input: Partial<CreatePostInput>): Promise<WPPost> {
  return wpFetch<WPPost>(`/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export async function getPost(id: number): Promise<WPPost> {
  return wpFetch<WPPost>(`/posts/${id}`)
}

export async function listPosts(params: {
  search?: string
  per_page?: number
  status?: string
  page?: number
}): Promise<WPPost[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set("search", params.search)
  qs.set("per_page", String(params.per_page ?? 10))
  if (params.status) qs.set("status", params.status)
  if (params.page) qs.set("page", String(params.page))

  return wpFetch<WPPost[]>(`/posts?${qs}`)
}

// --- Media ---

export async function uploadMedia(
  imageUrl: string,
  filename: string,
): Promise<number | null> {
  try {
    let buffer: ArrayBuffer
    let contentType = "image/jpeg"

    if (imageUrl.startsWith("data:")) {
      // Handle base64 data URL (from image generation)
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return null
      contentType = match[1]
      buffer = Buffer.from(match[2], "base64").buffer
    } else {
      // Handle HTTP URL
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) return null
      buffer = await imgRes.arrayBuffer()
      contentType = imgRes.headers.get("content-type") || "image/jpeg"
    }

    const res = await fetch(`${WP_URL()}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${WP_AUTH()}`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentType,
      },
      body: buffer,
    })

    if (!res.ok) return null
    const data = (await res.json()) as { id: number }
    return data.id
  } catch {
    return null
  }
}

/**
 * Fetch the source URL of a WordPress media item by its ID.
 */
export async function getMediaUrl(mediaId: number): Promise<string | null> {
  try {
    const res = await fetch(`${WP_URL()}/wp-json/wp/v2/media/${mediaId}`, {
      headers: { Authorization: `Basic ${WP_AUTH()}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { source_url?: string }
    return data.source_url ?? null
  } catch {
    return null
  }
}

// --- Categories ---

interface WPTerm {
  id: number
  name: string
  slug: string
}

export async function listCategories(): Promise<WPTerm[]> {
  return wpFetch<WPTerm[]>("/categories?per_page=100")
}

export async function findOrCreateCategory(name: string): Promise<number> {
  const cats = await listCategories()
  const existing = cats.find(
    (c) => c.slug === name.toLowerCase().replace(/\s+/g, "-"),
  )
  if (existing) return existing.id

  const created = await wpFetch<WPTerm>("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  return created.id
}
