const GHL_V1_BASE = "https://rest.gohighlevel.com/v1"
const GHL_V2_BASE = "https://services.leadconnectorhq.com"

function getV1Key() {
  return process.env.GHL_API_V1_KEY!
}

function getPIT() {
  return process.env.GHL_PIT!
}

export async function ghlFetchV1<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GHL_V1_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getV1Key()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GHL API v1 ${res.status}: ${text}`)
  }

  return res.json()
}

export async function ghlFetchV2<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GHL_V2_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getPIT()}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GHL API v2 ${res.status}: ${text}`)
  }

  return res.json()
}
