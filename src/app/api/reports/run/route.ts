const ALLOWED = ["daily-brief", "veille", "seo-report", "newsletter", "social-auto"] as const
type Job = (typeof ALLOWED)[number]

// Map each job to its cron handler module. Dynamic imports keep cold-start light.
const HANDLERS: Record<Job, () => Promise<{ GET: (req: Request) => Promise<Response> }>> = {
  "daily-brief": () => import("@/app/api/cron/daily-brief/route"),
  veille: () => import("@/app/api/cron/veille/route"),
  "seo-report": () => import("@/app/api/cron/seo-report/route"),
  newsletter: () => import("@/app/api/cron/newsletter/route"),
  "social-auto": () => import("@/app/api/cron/social-auto/route"),
}

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

    // Call the cron handler directly (no self-HTTP fetch — avoids
    // Vercel self-loop / domain-config issues and removes wrapper timeout).
    const mod = await HANDLERS[job]()
    const url = new URL(req.url)
    const fakeReq = new Request(`${url.protocol}//${url.host}/admin-lou/api/cron/${job}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })

    const res = await mod.GET(fakeReq)
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // keep raw text
    }

    return Response.json({ status: res.status, ok: res.ok, body })
  } catch (err) {
    console.error("[reports/run] error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur exécution" },
      { status: 500 },
    )
  }
}
