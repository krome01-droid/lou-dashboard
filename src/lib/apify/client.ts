const APIFY_BASE = "https://api.apify.com/v2"

function getToken(): string {
  return process.env.APIFY_API_TOKEN ?? ""
}

// ─── Generic runner ───────────────────────────────────────────────

async function apifyRunSync<T>(
  actorId: string,
  input: Record<string, unknown>,
  timeoutMs = 45000,
): Promise<T[]> {
  const token = getToken()
  if (!token) throw new Error("APIFY_API_TOKEN non configuré")

  const actorEncoded = encodeURIComponent(actorId)
  const timeoutSec = Math.round(timeoutMs / 1000)

  const res = await fetch(
    `${APIFY_BASE}/acts/${actorEncoded}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSec}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apify ${actorId} erreur ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

// ─── SERP Scraper ─────────────────────────────────────────────────

interface SerpOrganicResult {
  title?: string
  url?: string
  description?: string
  position?: number
}

interface SerpRawItem {
  organicResults?: SerpOrganicResult[]
  peopleAlsoAsk?: { question?: string }[]
  relatedSearches?: { query?: string }[]
  searchQuery?: { term?: string }
}

export interface SerpResult {
  query: string
  country: string
  organic_results: { position: number; title: string; url: string; description: string }[]
  people_also_ask: string[]
  related_searches: string[]
  total_results: number
}

export async function searchGoogleSerp(
  query: string,
  countryCode = "fr",
  maxResults = 10,
): Promise<SerpResult> {
  const items = await apifyRunSync<SerpRawItem>("apify/google-search-scraper", {
    queries: query,
    countryCode,
    maxPagesPerQuery: 1,
    resultsPerPage: Math.min(maxResults, 20),
    languageCode: "fr",
    mobileResults: false,
  })

  const item = items[0]
  if (!item) {
    return {
      query,
      country: countryCode,
      organic_results: [],
      people_also_ask: [],
      related_searches: [],
      total_results: 0,
    }
  }

  const organic = (item.organicResults ?? [])
    .slice(0, maxResults)
    .map((r, i) => ({
      position: r.position ?? i + 1,
      title: r.title ?? "",
      url: r.url ?? "",
      description: (r.description ?? "").slice(0, 300),
    }))

  const paa = (item.peopleAlsoAsk ?? [])
    .map((p) => p.question ?? "")
    .filter(Boolean)
    .slice(0, 8)

  const related = (item.relatedSearches ?? [])
    .map((r) => r.query ?? "")
    .filter(Boolean)
    .slice(0, 8)

  return {
    query: item.searchQuery?.term ?? query,
    country: countryCode,
    organic_results: organic,
    people_also_ask: paa,
    related_searches: related,
    total_results: organic.length,
  }
}

// ─── Webpage Content Scraper ──────────────────────────────────────

interface CrawlerRawItem {
  url?: string
  title?: string
  text?: string
  markdown?: string
}

export interface WebpageResult {
  url: string
  title: string
  content: string
  content_length: number
  truncated: boolean
}

export async function scrapeWebpage(
  url: string,
  maxChars = 3000,
): Promise<WebpageResult> {
  const items = await apifyRunSync<CrawlerRawItem>("apify/website-content-crawler", {
    startUrls: [{ url }],
    maxCrawlPages: 1,
    crawlerType: "cheerio",
  })

  const item = items[0]
  if (!item) {
    throw new Error(`Aucun contenu extrait de ${url}`)
  }

  const rawContent = item.text || item.markdown || ""
  const truncated = rawContent.length > maxChars
  const content = truncated
    ? rawContent.slice(0, maxChars) + "\n\n[... contenu tronqué]"
    : rawContent

  return {
    url: item.url ?? url,
    title: item.title ?? "",
    content,
    content_length: rawContent.length,
    truncated,
  }
}
