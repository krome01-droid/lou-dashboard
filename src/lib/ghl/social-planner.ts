import { ghlFetchV2 } from "./client"

export interface SocialPostInput {
  platform: string
  text: string
  hashtags?: string[]
  scheduled_at: string
  link_url?: string
  media_url?: string
}

export interface GHLSocialAccount {
  id: string          // compound key: {oauthId}_{locationId}_{originId}_{type}
  profileId?: string  // MongoDB ObjectId
  oauthId?: string
  name: string
  platform: string    // "facebook", "instagram", "linkedin", "tiktok", "youtube", "threads"
  type: string        // "page", "profile", "business"
  avatar?: string
  isExpired?: boolean
  originId?: string
}

interface AccountsResponse {
  results?: {
    accounts?: GHLSocialAccount[]
  }
}

interface UserResponse {
  id?: string
  _id?: string
  email?: string
}

// In-memory caches
let accountsCache: GHLSocialAccount[] | null = null
let accountsCacheTime = 0
let userIdCache: string | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch connected social media accounts from GHL.
 * Endpoint: GET /social-media-posting/{locationId}/accounts
 */
export async function getConnectedAccounts(): Promise<GHLSocialAccount[]> {
  const locationId = process.env.GHL_LOCATION_ID
  if (!locationId) throw new Error("GHL_LOCATION_ID non configuré")

  if (accountsCache && Date.now() - accountsCacheTime < CACHE_TTL) {
    return accountsCache
  }

  const data = await ghlFetchV2<AccountsResponse>(
    `/social-media-posting/${locationId}/accounts`,
  )

  accountsCache = (data.results?.accounts ?? []).filter((a) => !a.isExpired)
  accountsCacheTime = Date.now()
  return accountsCache
}

/**
 * Fetch the GHL user ID for this location.
 * Priority: env var GHL_USER_ID → search users for location → first user found
 */
async function getCurrentUserId(): Promise<string> {
  // 1. Env var (fastest, set manually in Vercel)
  if (process.env.GHL_USER_ID) return process.env.GHL_USER_ID

  if (userIdCache) return userIdCache

  const locationId = process.env.GHL_LOCATION_ID!

  // 2. Search users for this location
  const data = await ghlFetchV2<{ users?: UserResponse[]; user?: UserResponse }>(
    `/users/search?locationId=${locationId}&limit=1`,
  )

  const users = data.users ?? (data.user ? [data.user] : [])
  const userId = users[0]?.id ?? users[0]?._id
  if (!userId) throw new Error("Impossible de récupérer le userId GHL — ajoutez GHL_USER_ID dans les variables d'environnement Vercel")

  userIdCache = userId
  return userId
}

/** Infer GHL media type from URL extension. Defaults to "jpeg". */
function inferMediaType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    jpg: "jpeg", jpeg: "jpeg", png: "png",
    gif: "gif", webp: "webp", mp4: "video", mov: "video",
  }
  return map[ext] ?? "jpeg"
}

/**
 * Schedule a social media post via GHL Social Planner API v2.
 * Endpoint: POST /social-media-posting/{locationId}/posts
 *
 * Required: accountIds (array of account compound IDs), userId, scheduledAt, postType, summary, media
 */
export async function scheduleSocialPost(input: SocialPostInput) {
  const locationId = process.env.GHL_LOCATION_ID
  if (!locationId) throw new Error("GHL_LOCATION_ID non configuré")

  // Fetch accounts and userId in parallel
  const [allAccounts, userId] = await Promise.all([
    getConnectedAccounts(),
    getCurrentUserId(),
  ])

  const platformAccounts = allAccounts.filter(
    (a) => a.platform.toLowerCase() === input.platform.toLowerCase(),
  )

  // Instagram and TikTok require media
  const MEDIA_REQUIRED = ["instagram", "tiktok"]
  if (MEDIA_REQUIRED.includes(input.platform.toLowerCase()) && !input.media_url) {
    throw new Error(
      `${input.platform} requiert une image ou vidéo. Utilisez d'abord generate_image pour créer une image, puis relancez schedule_social en passant l'URL dans media_url.`,
    )
  }

  if (platformAccounts.length === 0) {
    const available = allAccounts.map((a) => `${a.platform}:${a.name}`).join(", ")
    throw new Error(
      `Aucun compte ${input.platform} trouvé (total: ${allAccounts.length}, disponibles: ${available || "aucun"})`,
    )
  }

  const caption = input.hashtags?.length
    ? `${input.text}\n\n${input.hashtags.map((h) => `#${h}`).join(" ")}`
    : input.text

  const finalCaption = input.link_url ? `${caption}\n\n${input.link_url}` : caption

  const payload: Record<string, unknown> = {
    accountIds: platformAccounts.map((a) => a.id),
    userId,
    type: "post",          // was "postType" — GHL expects "type"
    scheduleDate: input.scheduled_at,  // was "scheduledAt" — GHL expects "scheduleDate"
    summary: finalCaption,
    media: input.media_url
      ? [{ url: input.media_url, type: inferMediaType(input.media_url) }]
      : [],
  }

  return ghlFetchV2(`/social-media-posting/${locationId}/posts`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function listScheduledPosts() {
  const locationId = process.env.GHL_LOCATION_ID
  if (!locationId) throw new Error("GHL_LOCATION_ID non configuré")

  return ghlFetchV2(`/social-media-posting/${locationId}/posts/list`, {
    method: "POST",
    body: JSON.stringify({
      type: "scheduled",
      limit: 20,
    }),
  })
}
