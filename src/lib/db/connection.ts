/**
 * Database access layer via PHP proxy on o2switch.
 *
 * MySQL on o2switch is not accessible from Vercel (localhost only).
 * Instead, we route queries through a PHP proxy deployed as a mu-plugin
 * on the WordPress server.
 */

const PROXY_URL = () => process.env.MYSQL_PROXY_URL!
const PROXY_SECRET = () => process.env.MYSQL_PROXY_SECRET!

async function proxyFetch<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(PROXY_URL(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Lou-Secret": PROXY_SECRET(),
      "User-Agent": "LouDashboard/1.0 (Vercel; +https://autoecolemagazine.fr)",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DB Proxy error ${res.status}: ${text.slice(0, 200)}`)
  }

  // Guard against HTML responses (WAF blocks, redirects, 404 pages)
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    const text = await res.text()
    throw new Error(`DB Proxy: réponse non-JSON (${contentType}): ${text.slice(0, 150)}`)
  }

  return res.json()
}

interface QueryResult {
  success: boolean
  rows?: Record<string, unknown>[]
  affected_rows?: number
  insert_id?: number
  error?: string
}

export async function query<T>(
  sql: string,
  params?: (string | number | boolean | null)[],
): Promise<T[]> {
  const result = await proxyFetch<QueryResult>({
    action: "query",
    sql,
    params: params ?? [],
  })
  if (!result.success) throw new Error(result.error ?? "Query failed")
  return (result.rows ?? []) as T[]
}

export async function execute(
  sql: string,
  params?: (string | number | boolean | null)[],
): Promise<{ affectedRows: number; insertId: number }> {
  const result = await proxyFetch<QueryResult>({
    action: "query",
    sql,
    params: params ?? [],
  })
  if (!result.success) throw new Error(result.error ?? "Execute failed")
  return {
    affectedRows: result.affected_rows ?? 0,
    insertId: result.insert_id ?? 0,
  }
}

export async function ping(): Promise<boolean> {
  try {
    const result = await proxyFetch<{ success: boolean }>({ action: "ping" })
    return result.success === true
  } catch {
    return false
  }
}
