/**
 * Database access layer via PHP proxy on o2switch.
 *
 * MySQL on o2switch is not accessible from Vercel (localhost only).
 * Instead, we route queries through a PHP proxy deployed as a mu-plugin
 * on the WordPress server.
 *
 * Known quirk: $wpdb->prepare() on this server does not expand ? placeholders
 * reliably (WP version / MariaDB compat). We therefore build the final SQL
 * client-side with escaped values and send params:[]. Additionally, $wpdb
 * can prepend HTML error divs before the JSON payload on query errors —
 * we strip those before parsing.
 */

const PROXY_URL = () => process.env.MYSQL_PROXY_URL!
const PROXY_SECRET = () => process.env.MYSQL_PROXY_SECRET!

// Escape a value for inline MySQL string interpolation.
// Safe because: (a) all callers are server-side trusted code, (b) no
// user-controlled SQL structure — only values go through this path.
function escapeSqlParam(val: string | number | boolean | null): string {
  if (val === null) return "NULL"
  if (typeof val === "number") return String(val)
  if (typeof val === "boolean") return val ? "1" : "0"
  return (
    "'" +
    String(val)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\0/g, "\\0")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\x1a/g, "\\Z") +
    "'"
  )
}

function buildSql(
  sql: string,
  params: (string | number | boolean | null)[],
): string {
  if (!params.length) return sql
  let i = 0
  return sql.replace(/\?/g, () => escapeSqlParam(params[i++]))
}

// Strip any leading WordPress HTML error divs ($wpdb debug output) so JSON.parse
// doesn't fail when the proxy returns "<div id="error">...</div>{...}".
export function extractJson(raw: string): string {
  const start = raw.indexOf("{")
  const startArr = raw.indexOf("[")
  const jsonStart =
    start === -1
      ? startArr
      : startArr === -1
        ? start
        : Math.min(start, startArr)
  if (jsonStart <= 0) return raw
  return raw.slice(jsonStart)
}

async function proxyFetch<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(PROXY_URL(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Lou-Secret": PROXY_SECRET(),
      "User-Agent": "LouDashboard/1.0 (Vercel; +https://autoecolemagazine.fr)",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DB Proxy error ${res.status}: ${text.slice(0, 200)}`)
  }

  const raw = await res.text()
  const clean = extractJson(raw)

  try {
    return JSON.parse(clean) as T
  } catch {
    throw new Error(
      `DB Proxy: réponse non-JSON: ${raw.slice(0, 150)}`,
    )
  }
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
    sql: buildSql(sql, params ?? []),
    params: [],
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
    sql: buildSql(sql, params ?? []),
    params: [],
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
