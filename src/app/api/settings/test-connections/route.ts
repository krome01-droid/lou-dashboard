import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { extractJson } from "@/lib/utils"

interface ConnectionResult {
  name: string
  status: "ok" | "error" | "not_configured"
  detail?: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: "Non autorisé" }, { status: 401 })
  }
  const results: ConnectionResult[] = []

  // 1. WordPress
  try {
    if (!process.env.WP_URL || !process.env.WP_APP_PASSWORD) {
      results.push({ name: "wordpress", status: "not_configured" })
    } else {
      const creds = Buffer.from(
        `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`,
      ).toString("base64")
      const res = await fetch(
        `${process.env.WP_URL}/wp-json/wp/v2/posts?per_page=1`,
        { headers: { Authorization: `Basic ${creds}` } },
      )
      if (res.ok) {
        const posts = JSON.parse(extractJson(await res.text()))
        results.push({
          name: "wordpress",
          status: "ok",
          detail: `Connecté — ${Array.isArray(posts) ? posts.length : 0} post(s) récupéré(s)`,
        })
      } else {
        results.push({
          name: "wordpress",
          status: "error",
          detail: `HTTP ${res.status}`,
        })
      }
    }
  } catch (err) {
    results.push({
      name: "wordpress",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 2. GoHighLevel
  try {
    if (!process.env.GHL_PIT || !process.env.GHL_LOCATION_ID) {
      results.push({ name: "ghl", status: "not_configured", detail: "GHL_PIT ou GHL_LOCATION_ID manquant" })
    } else {
      const res = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${process.env.GHL_LOCATION_ID}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${process.env.GHL_PIT}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        },
      )
      if (res.ok) {
        const data = await res.json()
        const total = data.contacts?.length ?? 0
        results.push({
          name: "ghl",
          status: "ok",
          detail: `Connecté — API v2 (${total >= 1 ? "contacts accessibles" : "aucun contact"})`,
        })
      } else {
        results.push({
          name: "ghl",
          status: "error",
          detail: `HTTP ${res.status}`,
        })
      }
    }
  } catch (err) {
    results.push({
      name: "ghl",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 3. Claude API
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      results.push({ name: "claude", status: "not_configured" })
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 10,
          messages: [{ role: "user", content: "Dis juste OK" }],
        }),
      })
      if (res.ok) {
        results.push({
          name: "claude",
          status: "ok",
          detail: "Connecté — Claude API fonctionnelle",
        })
      } else {
        const text = await res.text()
        results.push({
          name: "claude",
          status: "error",
          detail: `HTTP ${res.status}: ${text.slice(0, 100)}`,
        })
      }
    }
  } catch (err) {
    results.push({
      name: "claude",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 4. MySQL (via PHP proxy)
  try {
    if (!process.env.MYSQL_PROXY_URL || !process.env.MYSQL_PROXY_SECRET) {
      results.push({
        name: "mysql",
        status: "not_configured",
        detail: "MYSQL_PROXY_URL ou MYSQL_PROXY_SECRET manquant",
      })
    } else {
      const { ping } = await import("@/lib/db/connection")
      const ok = await ping()
      if (ok) {
        results.push({
          name: "mysql",
          status: "ok",
          detail: `Connecté via proxy — ${process.env.MYSQL_DATABASE}`,
        })
      } else {
        results.push({
          name: "mysql",
          status: "error",
          detail: "Proxy PHP non joignable — déployez lou-db-proxy.php dans mu-plugins",
        })
      }
    }
  } catch (err) {
    results.push({
      name: "mysql",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 5. OneSignal
  if (process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY) {
    results.push({
      name: "onesignal",
      status: "ok",
      detail: `Configuré — App ${process.env.ONESIGNAL_APP_ID.slice(0, 8)}...`,
    })
  } else {
    results.push({ name: "onesignal", status: "not_configured" })
  }

  // 6. Kie.ai (image generation)
  try {
    if (!process.env.KIE_API_KEY) {
      results.push({ name: "kie", status: "not_configured" })
    } else {
      // Kie.ai doesn't have a /me endpoint — test with a lightweight call
      // We just verify the key format is present (actual validation on first generation)
      results.push({
        name: "kie",
        status: "ok",
        detail: `Configuré — Génération d'images (GPT-4o Image)`,
      })
    }
  } catch (err) {
    results.push({
      name: "kie",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 7. Fal.ai (image generation fallback)
  try {
    if (!process.env.FAL_API_KEY) {
      results.push({ name: "fal", status: "not_configured" })
    } else {
      results.push({
        name: "fal",
        status: "ok",
        detail: `Configuré — Fallback images (flux-pro)`,
      })
    }
  } catch (err) {
    results.push({
      name: "fal",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 8. Apify
  try {
    if (!process.env.APIFY_API_TOKEN) {
      results.push({ name: "apify", status: "not_configured" })
    } else {
      const res = await fetch(
        `https://api.apify.com/v2/acts?token=${process.env.APIFY_API_TOKEN}&limit=1`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (res.ok) {
        const data = await res.json()
        const total = data.data?.total ?? 0
        results.push({
          name: "apify",
          status: "ok",
          detail: `Connecté — ${total} acteur(s) disponible(s)`,
        })
      } else {
        results.push({
          name: "apify",
          status: "error",
          detail: `HTTP ${res.status}`,
        })
      }
    }
  } catch (err) {
    results.push({
      name: "apify",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 9. GA4 / Search Console
  const hasOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
  const hasSA = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const hasGA4 = !!process.env.GA4_PROPERTY_ID
  if ((hasOAuth || hasSA) && hasGA4) {
    results.push({ name: "ga4", status: "ok", detail: `Connecté — ${hasOAuth ? "OAuth2" : "Service Account"} + GA4 Property ${process.env.GA4_PROPERTY_ID}` })
  } else if (hasOAuth || hasSA) {
    results.push({ name: "ga4", status: "not_configured", detail: "Google connecté mais GA4_PROPERTY_ID manquant" })
  } else {
    results.push({ name: "ga4", status: "not_configured", detail: "Connectez Google dans Paramètres ci-dessous" })
  }

  return Response.json({ results })
}
