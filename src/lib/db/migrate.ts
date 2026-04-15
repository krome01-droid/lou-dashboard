/**
 * Run database migrations via the WP REST proxy on o2switch.
 */

export async function runMigrations(): Promise<string[]> {
  const proxyUrl = process.env.MYSQL_PROXY_URL
  const proxySecret = process.env.MYSQL_PROXY_SECRET

  if (!proxyUrl || !proxySecret) {
    return ["ERREUR: MYSQL_PROXY_URL ou MYSQL_PROXY_SECRET non configuré"]
  }

  try {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lou-Secret": proxySecret,
      },
      body: JSON.stringify({ action: "migrate" }),
    })

    if (!res.ok) {
      const text = await res.text()
      return [`ERREUR: HTTP ${res.status} — ${text}`]
    }

    const data = await res.json()
    return data.results ?? ["Migration terminée"]
  } catch (err) {
    return [`ERREUR: ${err instanceof Error ? err.message : String(err)}`]
  }
}
