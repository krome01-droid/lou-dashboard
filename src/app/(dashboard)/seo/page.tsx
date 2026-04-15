"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MetricCard } from "@/components/analytics/metric-card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Search,
  TrendingUp,
  TrendingDown,
  Globe,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  MapPin,
  Target,
  Zap,
} from "lucide-react"
import Link from "next/link"

interface KeywordData {
  keyword: string
  position: number
  trend: "up" | "down" | "stable"
  volume: number
}

interface IssueData {
  severity: "error" | "warning" | "info"
  message: string
  page?: string
}

interface SEOData {
  connected: boolean
  score: number | null
  keywords: KeywordData[]
  issues: IssueData[]
  recommendations: string[]
  reportDate: string | null
}

// Fallback data when Search Console is not connected
function getEstimatedData(): SEOData {
  return {
    connected: false,
    score: 62,
    keywords: [
      { keyword: "auto ecole", position: 15, trend: "up", volume: 33100 },
      { keyword: "comparateur auto ecole", position: 8, trend: "up", volume: 1900 },
      { keyword: "permis de conduire prix", position: 22, trend: "down", volume: 12100 },
      { keyword: "meilleure auto ecole", position: 12, trend: "stable", volume: 6600 },
      { keyword: "auto ecole pas cher", position: 18, trend: "up", volume: 8100 },
      { keyword: "code de la route", position: 35, trend: "stable", volume: 90500 },
      { keyword: "taux de reussite auto ecole", position: 6, trend: "up", volume: 2400 },
      { keyword: "auto ecole en ligne", position: 28, trend: "down", volume: 4400 },
    ],
    issues: [
      { severity: "error", message: "Balises meta description manquantes sur 12 pages", page: "/villes/" },
      { severity: "error", message: "Images sans attribut alt (23 images)", page: "/guides/" },
      { severity: "warning", message: "Temps de chargement > 3s sur mobile", page: "/" },
      { severity: "warning", message: "Balises H1 dupliquees sur 3 pages" },
      { severity: "info", message: "Schema markup FAQ absent des guides" },
      { severity: "info", message: "Sitemap XML non soumis a Google Search Console" },
    ],
    recommendations: [
      "Ajouter les meta descriptions manquantes, notamment sur les pages villes",
      "Optimiser les images : ajouter alt text + compression WebP",
      "Implementer le schema markup FAQ sur les articles guides",
      "Creer des liens internes entre articles du meme theme",
      "Publier 2-3 articles/semaine pour renforcer l'autorite thematique",
    ],
    reportDate: null,
  }
}

export default function SeoPage() {
  const [data, setData] = useState<SEOData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSeoData = useCallback(async () => {
    setLoading(true)
    try {
      // Timeout to prevent infinite spinner if an API hangs
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12_000)

      const [kwRes, auditRes, recoRes] = await Promise.all([
        fetch("/admin-lou/api/seo/search-console?type=keywords", { signal: ctrl.signal }),
        fetch("/admin-lou/api/seo/audit?type=audit", { signal: ctrl.signal }),
        fetch("/admin-lou/api/seo/audit?type=recommendations", { signal: ctrl.signal }),
      ])

      clearTimeout(timer)

      const kwData = kwRes.ok ? await kwRes.json() : {}
      const auditData = auditRes.ok ? await auditRes.json() : {}
      const recoData = recoRes.ok ? await recoRes.json() : {}

      if (kwData.configured && kwData.keywords?.length > 0) {
        setData({
          connected: true,
          score: auditData.score ?? null,
          keywords: kwData.keywords.map((k: { keyword: string; position: number; trend: string; impressions?: number }) => ({
            keyword: k.keyword,
            position: k.position,
            trend: k.trend,
            volume: k.impressions ?? 0,
          })),
          issues: auditData.issues ?? [],
          recommendations: recoData.recommendations ?? [],
          reportDate: auditData.reportDate ?? recoData.reportDate ?? null,
        })
        return
      }
    } catch {
      // Timeout, network error, or API failure — fall through to estimated data
    }
    setData(getEstimatedData())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSeoData().finally(() => setLoading(false))
  }, [fetchSeoData])

  if (loading || !data) {
    return (
      <>
        <Header title="SEO / GEO" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  const errorCount = data.issues.filter((i) => i.severity === "error").length
  const warningCount = data.issues.filter((i) => i.severity === "warning").length
  const top10Keywords = data.keywords.filter((k) => k.position <= 10).length

  return (
    <>
      <Header title="SEO / GEO" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Connection status */}
        {!data.connected && (
          <Badge variant="outline" className="text-xs">
            Donnees estimees — connectez Search Console pour les donnees reelles
          </Badge>
        )}
        {data.connected && (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs">Search Console connecte</Badge>
            {data.reportDate && (
              <span className="text-xs text-muted-foreground">
                Dernier rapport : {new Date(data.reportDate).toLocaleDateString("fr-FR")}
              </span>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Score SEO"
            value={data.score !== null ? `${data.score}/100` : "—"}
            description="Sante globale du site"
            icon={Target}
          />
          <MetricCard
            title="Mots-cles top 10"
            value={top10Keywords}
            description="Positions Google"
            icon={TrendingUp}
          />
          <MetricCard
            title="Erreurs critiques"
            value={errorCount}
            description="A corriger en priorite"
            icon={AlertTriangle}
          />
          <MetricCard
            title="Avertissements"
            value={warningCount}
            description="Optimisations possibles"
            icon={Zap}
          />
        </div>

        {/* Score progress */}
        {data.score !== null && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Score SEO global</span>
                <span className="text-sm font-bold">{data.score}%</span>
              </div>
              <Progress value={data.score} />
              <p className="text-xs text-muted-foreground mt-2">
                Objectif : 80/100 — {80 - data.score} points a gagner
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="keywords">
          <TabsList>
            <TabsTrigger value="keywords">Mots-cles</TabsTrigger>
            <TabsTrigger value="issues">Problemes ({errorCount + warningCount})</TabsTrigger>
            <TabsTrigger value="recommendations">Recommandations</TabsTrigger>
            <TabsTrigger value="geo">GEO / Local</TabsTrigger>
          </TabsList>

          <TabsContent value="keywords">
            <Card className="mt-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Suivi des mots-cles
                  </CardTitle>
                  <Button variant="ghost" size="icon-sm" onClick={fetchSeoData}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="grid grid-cols-4 gap-4 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                    <span>Mot-cle</span>
                    <span className="text-center">Position</span>
                    <span className="text-center">Tendance</span>
                    <span className="text-right">{data.connected ? "Impressions" : "Volume"}</span>
                  </div>
                  {data.keywords.map((kw, i) => (
                    <div key={i} className="grid grid-cols-4 gap-4 px-3 py-2.5 rounded-lg hover:bg-muted/50 text-sm">
                      <span className="font-medium truncate">{kw.keyword}</span>
                      <span className="text-center">
                        <Badge
                          variant={kw.position <= 10 ? "default" : kw.position <= 20 ? "secondary" : "outline"}
                        >
                          #{kw.position}
                        </Badge>
                      </span>
                      <span className="flex items-center justify-center">
                        {kw.trend === "up" ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : kw.trend === "down" ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </span>
                      <span className="text-right text-muted-foreground">
                        {kw.volume.toLocaleString("fr-FR")}{data.connected ? "" : "/mois"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Problemes detectes</CardTitle>
              </CardHeader>
              <CardContent>
                {data.issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun probleme detecte. Lancez un audit via LOU pour une analyse complete.</p>
                ) : (
                  <div className="space-y-2">
                    {data.issues.map((issue, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          issue.severity === "error"
                            ? "border-red-200 bg-red-50"
                            : issue.severity === "warning"
                            ? "border-amber-200 bg-amber-50"
                            : "border-blue-200 bg-blue-50"
                        }`}
                      >
                        {issue.severity === "error" ? (
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        ) : issue.severity === "warning" ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        ) : (
                          <Globe className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm">{issue.message}</p>
                          {issue.page && (
                            <p className="text-xs text-muted-foreground mt-0.5">Page : {issue.page}</p>
                          )}
                        </div>
                        <Badge
                          variant={
                            issue.severity === "error"
                              ? "destructive"
                              : issue.severity === "warning"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {issue.severity === "error" ? "Critique" : issue.severity === "warning" ? "Attention" : "Info"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Plan d&apos;action SEO
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Lancez un audit SEO via LOU pour obtenir des recommandations personnalisees.</p>
                ) : (
                  <div className="space-y-3">
                    {data.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {i + 1}
                        </span>
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Demandez a LOU de generer un audit SEO complet ou de rediger du contenu optimise.
                  </p>
                  <Button className="mt-2" size="sm" variant="outline" render={<Link href="/chat" />}>
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    Audit avec LOU
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geo">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  SEO Local / GEO
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Le SEO local est essentiel pour AutoEcoleMagazine.fr — les recherches &quot;auto-ecole + ville&quot;
                  representent une part importante du trafic potentiel.
                </p>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Villes prioritaires</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { city: "Paris", pages: 1, searches: "18.1K/mois" },
                      { city: "Lyon", pages: 1, searches: "6.6K/mois" },
                      { city: "Marseille", pages: 1, searches: "5.4K/mois" },
                      { city: "Toulouse", pages: 0, searches: "4.4K/mois" },
                      { city: "Bordeaux", pages: 0, searches: "3.6K/mois" },
                      { city: "Lille", pages: 0, searches: "3.2K/mois" },
                      { city: "Nantes", pages: 0, searches: "2.9K/mois" },
                      { city: "Strasbourg", pages: 0, searches: "2.4K/mois" },
                    ].map((item) => (
                      <div
                        key={item.city}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{item.city}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{item.searches}</span>
                          {item.pages > 0 ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="outline">A creer</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Demandez a LOU de creer les pages villes manquantes pour capter ce trafic.
                  </p>
                  <Button className="mt-2" size="sm" variant="outline" render={<Link href="/chat" />}>
                    Creer les pages villes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
