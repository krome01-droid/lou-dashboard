import crypto from "crypto"

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
]

let cachedToken: { token: string; expires: number } | null = null

// ─── OAuth2 Client Flow (preferred) ────────────────────────────────

function getClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID
}

function getClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET
}

function getRefreshToken(): string | undefined {
  return process.env.GOOGLE_REFRESH_TOKEN
}

export function getOAuthAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: getClientId()!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId()!,
      client_secret: getClientSecret()!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token exchange failed: ${text}`)
  }

  return res.json()
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken || !getClientId() || !getClientSecret()) return null

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId()!,
      client_secret: getClientSecret()!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) return null

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }

  return data.access_token
}

// ─── Service Account Flow (fallback) ───────────────────────────────

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

function getServiceAccount(): ServiceAccountKey | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    try {
      return JSON.parse(Buffer.from(json, "base64").toString("utf-8"))
    } catch {
      return null
    }
  }
}

function createJWT(sa: ServiceAccountKey, scopes: string[]): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: sa.client_email,
    scope: scopes.join(" "),
    aud: sa.token_uri || GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url")

  const unsigned = `${encode(header)}.${encode(payload)}`
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(unsigned)
  const signature = sign.sign(sa.private_key, "base64url")

  return `${unsigned}.${signature}`
}

async function getServiceAccountToken(): Promise<string | null> {
  const sa = getServiceAccount()
  if (!sa) return null

  const jwt = createJWT(sa, SCOPES)

  const res = await fetch(sa.token_uri || GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  if (!res.ok) return null

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }

  return data.access_token
}

// ─── Public API ────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  // Check cache first
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.token
  }

  // Try OAuth2 refresh token first (preferred)
  const oauthToken = await refreshAccessToken()
  if (oauthToken) return oauthToken

  // Fallback to service account
  const saToken = await getServiceAccountToken()
  if (saToken) return saToken

  return null
}

export function isGoogleConfigured(): boolean {
  // OAuth2 configured = has client ID + refresh token
  const oauthReady = !!(getClientId() && getClientSecret() && getRefreshToken())
  // Service account configured
  const saReady = !!getServiceAccount()

  return oauthReady || saReady
}

export function isOAuthConfigured(): boolean {
  return !!(getClientId() && getClientSecret())
}

export function isOAuthConnected(): boolean {
  return !!(getClientId() && getClientSecret() && getRefreshToken())
}
