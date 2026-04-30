const ALLOWED = ["daily-brief", "veille", "seo-report", "newsletter", "social-auto"] as const
type Job = (typeof ALLOWED)[number]

export async function POST(req: Request) {
  try {
    const { job } = (await req.json()) as { job: Job }
    if (!ALLOWED.includes(job)) {
      return Response.json({ error: "Job inconnu" }, { status: 400 })
    }

    const secret = process.env.CRON_SECRET
    if (!secret) {
      return Response.json({ error: "CRON_SECRET non configuré" }, { status: 500 })
    }

    const url = new URL(req.url)
    const target = `${url.protocol}//${url.host}/admin-lou/api/cron/${job}`

    const res = await fetch(target, {
      headers: { Authorization: `Bearer ${secret}` },
    })

    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // keep raw text
    }

    return Response.json({ status: res.status, ok: res.ok, body })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur exécution" },
      { status: 500 },
    )
  }
}
