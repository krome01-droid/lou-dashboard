import { getToken } from "next-auth/jwt"
import { exchangeCodeForTokens } from "@/lib/google/auth"
import { execute } from "@/lib/db/connection"
import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  // OAuth callbacks preserve the browser session — require authentication
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    return new Response(htmlPage("Erreur", "Vous devez être connecté pour associer un compte Google.", true), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error) {
    return new Response(htmlPage("Erreur", `Google a refuse l'acces : ${error}`, true), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  if (!code) {
    return new Response(htmlPage("Erreur", "Code d'autorisation manquant", true), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL || "https://agent.autoecolemagazine.fr/admin-lou"
    const redirectUri = `${baseUrl}/api/google/callback`

    const tokens = await exchangeCodeForTokens(code, redirectUri)

    if (!tokens.refresh_token) {
      return new Response(
        htmlPage(
          "Attention",
          "Pas de refresh token recu. Revoquez l'acces dans votre compte Google (myaccount.google.com/permissions), puis reconnectez.",
          true,
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    }

    // Store refresh token in a dedicated settings row — NOT in content_log
    try {
      await execute(
        `INSERT INTO wp_lou_settings (\`key\`, \`value\`, updated_at)
         VALUES ('GOOGLE_REFRESH_TOKEN', ?, NOW())
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
        [tokens.refresh_token],
      )
    } catch {
      // Table may not exist yet — token must be set manually in env vars
    }

    // Show masked token so the user can copy it to Vercel env vars if needed
    const masked = `${tokens.refresh_token.slice(0, 8)}...${tokens.refresh_token.slice(-8)}`

    return new Response(
      htmlPage(
        "Google connecté !",
        `<p>Le refresh token a été obtenu et sauvegardé en base de données.</p>
         <p style="margin-top:16px">Token (masqué) : <code>${masked}</code></p>
         <p style="margin-top:16px">Si vous devez l'ajouter manuellement dans Vercel, récupérez-le via la table <code>wp_lou_settings</code> (clé <code>GOOGLE_REFRESH_TOKEN</code>).</p>
         <p style="margin-top:16px"><a href="/admin-lou/settings" style="color:#e31e44;">Retour aux paramètres</a></p>`,
        false,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  } catch (err) {
    return new Response(
      htmlPage("Erreur", `Echange du token echoue : ${err instanceof Error ? err.message : "erreur inconnue"}`, true),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }
}

function htmlPage(title: string, body: string, isError: boolean): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — LOU Dashboard</title>
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #fff; border-radius: 12px; padding: 40px; max-width: 560px; width: 90%; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  h1 { color: ${isError ? "#dc2626" : "#16a34a"}; margin: 0 0 16px 0; font-size: 24px; }
  p { color: #474747; line-height: 1.6; margin: 0; font-size: 15px; }
  code { background: #f1f1f1; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  a { color: #e31e44; }
</style>
</head>
<body><div class="card"><h1>${title}</h1>${body}</div></body></html>`
}
