import { getAccessToken } from "./auth"

const SC_API = "https://www.googleapis.com/webmasters/v3"

function getSiteUrl(): string {
  return process.env.SEARCH_CONSOLE_SITE_URL ?? "https://autoecolemagazine.fr"
}

interface SCRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface SCResponse {
  rows?: SCRow[]
}

async function querySearchConsole(body: unknown): Promise<SCResponse> {
  const token = await getAccessToken()
  if (!token) throw new Error("Google auth non configuree")

  const siteUrl = encodeURIComponent(getSiteUrl())

  const res = await fetch(
    `${SC_API}/sites/${siteUrl}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Search Console API ${res.status}: ${text}`)
  }

  return res.json()
}

export async function getTopKeywords(limit = 20) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 28)

  // Get current period
  const current = await querySearchConsole({
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    dimensions: ["query"],
    rowLimit: limit,
    dataState: "all",
  })

  // Get previous period for trend
  const prevEnd = new Date(startDate)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - 28)

  let previous: SCResponse = {}
  try {
    previous = await querySearchConsole({
      startDate: prevStart.toISOString().split("T")[0],
      endDate: prevEnd.toISOString().split("T")[0],
      dimensions: ["query"],
      rowLimit: 50,
      dataState: "all",
    })
  } catch {
    // Previous period may fail
  }

  const prevMap = new Map(
    (previous.rows ?? []).map((r) => [r.keys[0], r.position]),
  )

  return (current.rows ?? []).map((row) => {
    const keyword = row.keys[0]
    const prevPosition = prevMap.get(keyword)
    let trend: "up" | "down" | "stable" = "stable"
    if (prevPosition !== undefined) {
      if (row.position < prevPosition - 1) trend = "up"
      else if (row.position > prevPosition + 1) trend = "down"
    }

    return {
      keyword,
      position: Math.round(row.position),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Math.round(row.ctr * 1000) / 10,
      trend,
    }
  })
}

export async function getTopPages(limit = 10) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 28)

  const response = await querySearchConsole({
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    dimensions: ["page"],
    rowLimit: limit,
    dataState: "all",
  })

  const siteOrigin = process.env.WP_URL ?? "https://autoecolemagazine.fr"
  return (response.rows ?? []).map((row) => ({
    page: row.keys[0].replace(siteOrigin, ""),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 1000) / 10,
    position: Math.round(row.position),
  }))
}

export async function getSummary() {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 28)

  const response = await querySearchConsole({
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    dataState: "all",
  })

  const row = response.rows?.[0]
  return {
    totalClicks: row?.clicks ?? 0,
    totalImpressions: row?.impressions ?? 0,
    avgCtr: row ? Math.round(row.ctr * 1000) / 10 : 0,
    avgPosition: row ? Math.round(row.position * 10) / 10 : 0,
  }
}
