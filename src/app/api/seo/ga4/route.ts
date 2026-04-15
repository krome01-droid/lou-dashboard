import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { isGoogleConfigured } from "@/lib/google/auth"
import {
  getSessions,
  getTopPages,
  getTrafficSources,
  getDevices,
  getDailyVisits,
} from "@/lib/google/ga4"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorise" }, { status: 401 })
  }

  if (!isGoogleConfigured()) {
    return Response.json({ configured: false, message: "GA4 non configure — ajoutez GOOGLE_SERVICE_ACCOUNT_JSON et GA4_PROPERTY_ID" })
  }

  const { searchParams } = new URL(req.url)
  const period = searchParams.get("period") ?? "30d"

  try {
    const [sessions, topPages, sources, devices, dailyVisits] = await Promise.all([
      getSessions(period),
      getTopPages(period),
      getTrafficSources(period),
      getDevices(period),
      getDailyVisits(period),
    ])

    return Response.json({
      configured: true,
      period,
      ...sessions,
      topPages,
      sources,
      devices,
      dailyVisits,
    })
  } catch (err) {
    return Response.json(
      { configured: true, error: err instanceof Error ? err.message : "Erreur GA4" },
      { status: 500 },
    )
  }
}
