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

async function wpFetchWithHeaders<T>(
  path: string,
): Promise<{ data: T; totalPages: number; totalItems: number }> {
  const res = await fetch(`${WP_URL()}/wp-json/wp/v2${path}`, {
    headers: { Authorization: `Basic ${WP_AUTH()}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WordPress API ${res.status}: ${text}`)
  }

  return {
    data: await res.json(),
    totalPages: Number(res.headers.get("X-WP-TotalPages") ?? 1),
    totalItems: Number(res.headers.get("X-WP-Total") ?? 0),
  }
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

// --- Full site content audit ---

export interface WPPostSummary {
  id: number
  title: string
  slug: string
  status: string
  link: string
  date: string
  modified: string
  categories: number[]
  excerpt: string
  word_count?: number
}

export interface SiteContentAudit {
  total: number
  byStatus: Record<string, number>
  byCategory: Record<string, { name: string; count: number }>
  articles: WPPostSummary[]
  oldArticles: WPPostSummary[]
  recentArticles: WPPostSummary[]
}

export async function getAllPostsAudit(): Promise<SiteContentAudit> {
  const PER_PAGE = 100

  // First page to get total
  const first = await wpFetchWithHeaders<WPPostRaw[]>(
    `/posts?per_page=${PER_PAGE}&page=1&status=any&_fields=id,title,slug,status,link,date,modified,categories,excerpt`,
  )

  const allPosts: WPPostRaw[] = [...first.data]

  // Fetch remaining pages in parallel
  if (first.totalPages > 1) {
    const pageNums = Array.from({ length: first.totalPages - 1 }, (_, i) => i + 2)
    const pages = await Promise.all(
      pageNums.map((p) =>
        wpFetchWithHeaders<WPPostRaw[]>(
          `/posts?per_page=${PER_PAGE}&page=${p}&status=any&_fields=id,title,slug,status,link,date,modified,categories,excerpt`,
        ).then((r) => r.data),
      ),
    )
    allPosts.push(...pages.flat())
  }

  // Fetch category map
  const cats = await listCategories()
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))

  // Aggregate by status
  const byStatus: Record<string, number> = {}
  const byCategoryCount: Record<number, number> = {}

  for (const p of allPosts) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
    for (const catId of p.categories ?? []) {
      byCategoryCount[catId] = (byCategoryCount[catId] ?? 0) + 1
    }
  }

  const byCategory: Record<string, { name: string; count: number }> = {}
  for (const [catId, count] of Object.entries(byCategoryCount)) {
    const name = catMap[Number(catId)] ?? `Catégorie #${catId}`
    byCategory[catId] = { name, count }
  }

  const cutoff18months = new Date()
  cutoff18months.setMonth(cutoff18months.getMonth() - 18)

  const cutoff30days = new Date()
  cutoff30days.setDate(cutoff30days.getDate() - 30)

  const toSummary = (p: WPPostRaw): WPPostSummary => ({
    id: p.id,
    title: typeof p.title === "string" ? p.title : (p.title?.rendered ?? ""),
    slug: p.slug,
    status: p.status,
    link: p.link,
    date: p.date,
    modified: p.modified,
    categories: p.categories ?? [],
    excerpt: (typeof p.excerpt === "string" ? p.excerpt : (p.excerpt?.rendered ?? "")).replace(/<[^>]*>/g, "").slice(0, 120),
  })

  const published = allPosts.filter((p) => p.status === "publish")

  return {
    total: allPosts.length,
    byStatus,
    byCategory,
    articles: published.slice(0, 50).map(toSummary),
    oldArticles: published
      .filter((p) => new Date(p.modified) < cutoff18months)
      .slice(0, 30)
      .map(toSummary),
    recentArticles: published
      .filter((p) => new Date(p.date) >= cutoff30days)
      .slice(0, 20)
      .map(toSummary),
  }
}

interface WPPostRaw {
  id: number
  title: { rendered: string } | string
  slug: string
  status: string
  link: string
  date: string
  modified: string
  categories: number[]
  excerpt: { rendered: string } | string
}
