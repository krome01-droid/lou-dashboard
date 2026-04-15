import { exchangeCodeForTokens } from "@/lib/google/auth"
import { execute } from "@/lib/db/connection"

export async function GET(req: Request) {
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

    // Store refresh token in DB for persistence across deploys
    try {
      await execute(
        `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
         VALUES ('Google OAuth connected', 'article', 'draft', ?, '{}', 'system')`,
        [`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`],
      )
    } catch {
      // DB may not be available
    }

    return new Response(
      htmlPage(
        "Google connecte !",
        `<p>Le refresh token a ete obtenu avec succes.</p>
         <p style="margin-top:16px"><strong>Etape suivante :</strong> Ajoutez cette variable dans votre <code>.env.local</code> sur Vercel :</p>
         <pre style="background:#1a1c1c;color:#e31e44;padding:16px;border-radius:8px;margin-top:12px;overflow-x:auto;font-size:13px;">GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}</pre>
         <p style="margin-top:16px">Puis redéployez le dashboard.</p>
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
