"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LogIn, AlertCircle, Eye, EyeOff } from "lucide-react"

const WP_LOST_PASSWORD_URL =
  "https://autoecolemagazine.fr/wp-login.php?action=lostpassword"

function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const searchParams = useSearchParams()
  const raw = searchParams.get("callbackUrl") ?? "/admin-lou"
  // Sanitize: /signin doesn't exist, fallback to dashboard root
  const callbackUrl = raw.endsWith("/signin") ? "/admin-lou" : raw

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    })

    if (result?.error) {
      setError("Identifiants incorrects ou accès non autorisé.")
      setLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-4">
            <h1 className="text-2xl font-black tracking-tight">
              <span className="text-primary italic">AUTO-ECOLE</span>
              <span className="italic">MAGAZINE</span>
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Agent LOU
            </p>
          </div>
          <CardTitle className="text-lg">Connexion</CardTitle>
          <CardDescription>
            Utilisez vos identifiants WordPress admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Identifiant</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Votre identifiant WordPress"
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <a
                  href={WP_LOST_PASSWORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  Mot de passe oublié ?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !username || !password}
            >
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            La réinitialisation se fait depuis WordPress. Vous recevrez un
            e-mail avec un lien sécurisé.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
