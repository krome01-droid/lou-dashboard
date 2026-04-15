"use client"

import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"
import {
  Globe,
  MessageSquare,
  Bot,
  Database,
  Bell,
  BarChart3,
  Search,
  ImageIcon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react"

interface ConnectionResult {
  name: string
  status: "ok" | "error" | "not_configured"
  detail?: string
}

const CONNECTION_META: Record<
  string,
  { label: string; icon: typeof Globe; description: string }
> = {
  wordpress: {
    label: "WordPress",
    icon: Globe,
    description: "REST API — autoecolemagazine.fr",
  },
  ghl: {
    label: "GoHighLevel",
    icon: MessageSquare,
    description: "API v1 + v2 (PIT) — Contacts, emails, social",
  },
  claude: {
    label: "Claude API",
    icon: Bot,
    description: "Anthropic — Agent LOU",
  },
  mysql: {
    label: "MySQL",
    icon: Database,
    description: "o2switch — Tables wp_lou_*",
  },
  onesignal: {
    label: "OneSignal",
    icon: Bell,
    description: "Push notifications web",
  },
  kie: {
    label: "Kie.ai",
    icon: ImageIcon,
    description: "Génération d'images IA (GPT-4o Image)",
  },
  apify: {
    label: "Apify",
    icon: Search,
    description: "Scraping SERP Google & contenu web",
  },
  ga4: {
    label: "GA4 / Search Console",
    icon: BarChart3,
    description: "Google Analytics & SEO",
  },
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "ok":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <MinusCircle className="h-4 w-4 text-yellow-500" />
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ok":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Connecté
        </Badge>
      )
    case "error":
      return <Badge variant="destructive">Erreur</Badge>
    default:
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
          À configurer
        </Badge>
      )
  }
}

export default function SettingsPage() {
  const [connections, setConnections] = useState<ConnectionResult[]>([])
  const [testing, setTesting] = useState(false)
  const [migrationResult, setMigrationResult] = useState<string[] | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; hasGA4PropertyId: boolean } | null>(null)
  const [googleConnecting, setGoogleConnecting] = useState(false)

  async function testConnections() {
    setTesting(true)
    try {
      const res = await fetch("/admin-lou/api/settings/test-connections")
      const data = await res.json()
      setConnections(data.results ?? [])
    } catch {
      setConnections([])
    } finally {
      setTesting(false)
    }
  }

  async function runMigration() {
    setMigrating(true)
    try {
      const res = await fetch("/admin-lou/api/db/migrate", { method: "POST" })
      const data = await res.json()
      setMigrationResult(data.results ?? [data.error])
    } catch (err) {
      setMigrationResult([`Erreur: ${err}`])
    } finally {
      setMigrating(false)
    }
  }

  async function checkGoogleStatus() {
    try {
      const res = await fetch("/admin-lou/api/google")
      if (res.ok) setGoogleStatus(await res.json())
    } catch {
      // silent
    }
  }

  async function connectGoogle() {
    setGoogleConnecting(true)
    try {
      const res = await fetch("/admin-lou/api/google?action=authorize")
      if (res.ok) {
        const data = await res.json()
        if (data.authUrl) {
          window.open(data.authUrl, "_blank", "width=600,height=700")
        }
      }
    } catch {
      // silent
    } finally {
      setGoogleConnecting(false)
    }
  }

  useEffect(() => {
    testConnections()
    checkGoogleStatus()
  }, [])

  const okCount = connections.filter((c) => c.status === "ok").length
  const totalCount = connections.length

  return (
    <>
      <Header title="Paramètres" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Connexions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Connexions</CardTitle>
              {totalCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {okCount}/{totalCount} services connectés
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={testConnections}
              disabled={testing}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`}
              />
              {testing ? "Test..." : "Tester"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {connections.length === 0 && !testing && (
              <p className="text-sm text-muted-foreground">
                Cliquez sur Tester pour vérifier les connexions.
              </p>
            )}
            {connections.map((conn) => {
              const meta = CONNECTION_META[conn.name]
              if (!meta) return null
              const Icon = meta.icon

              return (
                <div
                  key={conn.name}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="mt-0.5 rounded-md bg-muted p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={conn.status} />
                      <span className="text-sm font-medium">{meta.label}</span>
                      <StatusBadge status={conn.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {meta.description}
                    </p>
                    {conn.detail && (
                      <p className="mt-1 text-xs font-mono text-muted-foreground/80">
                        {conn.detail}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Connexion Google */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Google Analytics &amp; Search Console
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {googleStatus?.connected ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-700">Google connecte</span>
                {!googleStatus.hasGA4PropertyId && (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                    GA4_PROPERTY_ID manquant
                  </Badge>
                )}
              </div>
            ) : googleStatus?.configured ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Les credentials Google sont configures. Cliquez ci-dessous pour autoriser l&apos;acces
                  a GA4 et Search Console.
                </p>
                <Button onClick={connectGoogle} disabled={googleConnecting} size="sm">
                  <BarChart3 className="mr-2 h-3.5 w-3.5" />
                  {googleConnecting ? "Connexion..." : "Connecter Google"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.local pour activer la connexion Google.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Permet d&apos;afficher les vraies donnees de trafic et de positionnement SEO dans le dashboard.
            </p>
          </CardContent>
        </Card>

        {/* Migration BDD */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Base de données</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Créer les 5 tables LOU dans la base MySQL WordPress (wp_lou_content_log,
              wp_lou_social_posts, wp_lou_seo_reports, wp_lou_editorial_calendar,
              wp_lou_conversations).
            </p>
            <Button onClick={runMigration} disabled={migrating} size="sm">
              <Database className="mr-2 h-3.5 w-3.5" />
              {migrating ? "Migration en cours..." : "Lancer la migration"}
            </Button>
            {migrationResult && (
              <div className="mt-3 space-y-1 rounded-md bg-muted p-3">
                {migrationResult.map((r, i) => (
                  <p key={i} className="text-xs font-mono">
                    {r.startsWith("OK") ? "✓" : "✗"} {r}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Agent :</strong> LOU v1.0 — Communication Manager
            </p>
            <p>
              <strong>Site :</strong> autoecolemagazine.fr
            </p>
            <p>
              <strong>Hébergeur :</strong> o2switch (WordPress + MySQL)
            </p>
            <p>
              <strong>Dashboard :</strong> Next.js 16 sur Vercel (CDG1 Paris)
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
