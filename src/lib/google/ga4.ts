import { getAccessToken } from "./auth"

const GA4_API = "https://analyticsdata.googleapis.com/v1beta"

function getPropertyId(): string {
  return process.env.GA4_PROPERTY_ID ?? ""
}

function periodToDates(period: string): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()

  switch (period) {
    case "7d":
      start.setDate(end.getDate() - 7)
      break
    case "90d":
      start.setDate(end.getDate() - 90)
      break
    default: // 30d
      start.setDate(end.getDate() - 30)
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  }
}

async function runReport(body: unknown): Promise<unknown> {
  const token = await getAccessToken()
  if (!token) throw new Error("Google auth non configuree")

  const propertyId = getPropertyId()
  if (!propertyId) throw new Error("GA4_PROPERTY_ID non configure")

  const res = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GA4 API ${res.status}: ${text}`)
  }

  return res.json()
}

interface GA4Row {
  dimensionValues?: { value: string }[]
  metricValues?: { value: string }[]
}

interface GA4Report {
  rows?: GA4Row[]
  totals?: GA4Row[]
  rowCount?: number
}

export async function getSessions(period: string) {
  const { startDate, endDate } = periodToDates(period)

  const report = (await runReport({
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "totalUsers" },
      { name: "averageSessionDuration" },
      { name: "bounceRate" },
    ],
  })) as GA4Report

  const row = report.rows?.[0]
  if (!row?.metricValues) return null

  const [sessions, pageviews, users, avgDuration, bounceRate] = row.metricValues.map(
    (v) => v.value,
  )

  const durationSec = Math.round(parseFloat(avgDuration))
  const min = Math.floor(durationSec / 60)
  const sec = durationSec % 60

  return {
    sessions: parseInt(sessions),
    pageviews: parseInt(pageviews),
    users: parseInt(users),
    avgDuration: `${min}:${String(sec).padStart(2, "0")}`,
    bounceRate: Math.round(parseFloat(bounceRate) * 100),
  }
}

export async function getTopPages(period: string, limit = 10) {
  const { startDate, endDate } = periodToDates(period)

  const report = (await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  })) as GA4Report

  return (report.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? "",
    views: parseInt(row.metricValues?.[0]?.value ?? "0"),
    avgTime: (() => {
      const sec = Math.round(parseFloat(row.metricValues?.[1]?.value ?? "0"))
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
    })(),
  }))
}

export async function getTrafficSources(period: string) {
  const { startDate, endDate } = periodToDates(period)

  const report = (await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 8,
  })) as GA4Report

  const rows = report.rows ?? []
  const total = rows.reduce(
    (sum, r) => sum + parseInt(r.metricValues?.[0]?.value ?? "0"),
    0,
  )

  return rows.map((row) => {
    const sessions = parseInt(row.metricValues?.[0]?.value ?? "0")
    return {
      source: row.dimensionValues?.[0]?.value ?? "Autre",
      sessions,
      percentage: total > 0 ? Math.round((sessions / total) * 100) : 0,
    }
  })
}

export async function getDevices(period: string) {
  const { startDate, endDate } = periodToDates(period)

  const report = (await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }],
  })) as GA4Report

  const rows = report.rows ?? []
  const total = rows.reduce(
    (sum, r) => sum + parseInt(r.metricValues?.[0]?.value ?? "0"),
    0,
  )

  return rows.map((row) => ({
    device: row.dimensionValues?.[0]?.value ?? "Autre",
    percentage: total > 0
      ? Math.round((parseInt(row.metricValues?.[0]?.value ?? "0") / total) * 100)
      : 0,
  }))
}

export async function getDailyVisits(period: string) {
  const { startDate, endDate } = periodToDates(period)

  const report = (await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
  })) as GA4Report

  return (report.rows ?? []).map((row) => {
    const dateStr = row.dimensionValues?.[0]?.value ?? ""
    const formatted = dateStr.length === 8
      ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      : dateStr
    return {
      date: formatted,
      sessions: parseInt(row.metricValues?.[0]?.value ?? "0"),
    }
  })
}
