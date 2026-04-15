"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/analytics/metric-card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3,
  TrendingUp,
  Users,
  Eye,
  Clock,
  Globe,
  Smartphone,
  Monitor,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"

interface AnalyticsData {
  configured: boolean
  sessions: number
  pageviews: number
  users: number
  avgDuration: string
  bounceRate: number
  topPages: { path: string; views: number; avgTime: string }[]
  sources: { source: string; sessions: number; percentage: number }[]
  devices: { device: string; percentage: number }[]
  dailyVisits: { date: string; sessions: number }[]
}

const PERIOD_LABELS: Record<string, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
}

function generateEstimatedData(period: string): AnalyticsData {
  const multiplier = period === "7d" ? 1 : period === "30d" ? 4.2 : 12.5
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90
  return {
    configured: false,
    sessions: Math.round(850 * multiplier),
    pageviews: Math.round(2400 * multiplier),
    users: Math.round(680 * multiplier),
    avgDuration: "2:34",
    bounceRate: 58,
    topPages: [
      { path: "/", views: Math.round(600 * multiplier), avgTime: "1:45" },
      { path: "/comparateur", views: Math.round(420 * multiplier), avgTime: "3:12" },
      { path: "/guides/choisir-auto-ecole", views: Math.round(310 * multiplier), avgTime: "4:20" },
      { path: "/villes/paris", views: Math.round(280 * multiplier), avgTime: "2:55" },
      { path: "/guides/prix-permis-conduire", views: Math.round(250 * multiplier), avgTime: "3:45" },
    ],
    sources: [
      { source: "Google (organique)", sessions: Math.round(510 * multiplier), percentage: 60 },
      { source: "Direct", sessions: Math.round(170 * multiplier), percentage: 20 },
      { source: "Reseaux sociaux", sessions: Math.round(85 * multiplier), percentage: 10 },
      { source: "Referral", sessions: Math.round(51 * multiplier), percentage: 6 },
      { source: "Newsletter", sessions: Math.round(34 * multiplier), percentage: 4 },
    ],
    devices: [
      { device: "Mobile", percentage: 68 },
      { device: "Desktop", percentage: 27 },
      { device: "Tablette", percentage: 5 },
    ],
    dailyVisits: Array.from({ length: days }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (days - 1) + i)
      const dayOfWeek = date.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      return {
        date: date.toISOString().split("T")[0],
        sessions: Math.round((isWeekend ? 100 : 140) + Math.random() * 60 - 30),
      }
    }),
  }
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d")
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/admin-lou/api/seo/ga4?period=${period}`)
      if (res.ok) {
        const json = await res.json()
        if (json.configured && json.sessions !== undefined) {
          setData({ configured: true, ...json })
          return
        }
      }
    } catch {
      // Fall through to estimated data
    }
    setData(generateEstimatedData(period))
    setLoading(false)
  }, [period])

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  if (loading || !data) {
    return (
      <>
        <Header title="Analytics" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  const maxSessions = Math.max(...data.dailyVisits.map((d) => d.sessions), 1)

  return (
    <>
      <Header title="Analytics" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Period selector */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <Button
                key={key}
                variant={period === key ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(key)}
              >
                {label}
              </Button>
            ))}
            <Button variant="ghost" size="icon-sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {!data.configured && (
            <Badge variant="outline" className="text-xs">
              Donnees estimees — connectez GA4 pour les donnees reelles
            </Badge>
          )}
          {data.configured && (
            <Badge variant="default" className="text-xs">
              Donnees GA4 en direct
            </Badge>
          )}
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Sessions"
            value={data.sessions.toLocaleString("fr-FR")}
            description={PERIOD_LABELS[period]}
            icon={BarChart3}
          />
          <MetricCard
            title="Pages vues"
            value={data.pageviews.toLocaleString("fr-FR")}
            description={`${(data.pageviews / Math.max(data.sessions, 1)).toFixed(1)} pages/session`}
            icon={Eye}
          />
          <MetricCard
            title="Visiteurs uniques"
            value={data.users.toLocaleString("fr-FR")}
            description={PERIOD_LABELS[period]}
            icon={Users}
          />
          <MetricCard
            title="Duree moyenne"
            value={data.avgDuration}
            description={`Taux de rebond: ${data.bounceRate}%`}
            icon={Clock}
          />
        </div>

        {/* Mini chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Visites quotidiennes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-px h-32">
              {data.dailyVisits.map((day, i) => {
                const height = (day.sessions / maxSessions) * 100
                const isToday = i === data.dailyVisits.length - 1
                return (
                  <div
                    key={i}
                    className="flex-1 group relative"
                    title={`${new Date(day.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}: ${day.sessions} sessions`}
                  >
                    <div
                      className={`w-full rounded-t-sm transition-colors ${
                        isToday ? "bg-primary" : "bg-primary/30 hover:bg-primary/50"
                      }`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>
                {new Date(data.dailyVisits[0]?.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
              <span>
                {new Date(data.dailyVisits[data.dailyVisits.length - 1]?.date).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">Pages populaires</TabsTrigger>
            <TabsTrigger value="sources">Sources de trafic</TabsTrigger>
            <TabsTrigger value="devices">Appareils</TabsTrigger>
          </TabsList>

          <TabsContent value="pages">
            <Card className="mt-4">
              <CardContent className="p-0">
                <div className="grid grid-cols-3 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground border-b">
                  <span>Page</span>
                  <span className="text-center">Pages vues</span>
                  <span className="text-right">Temps moyen</span>
                </div>
                {data.topPages.map((page, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-3 gap-4 px-4 py-3 text-sm hover:bg-muted/50 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="truncate">{page.path}</span>
                    </div>
                    <span className="text-center font-medium">
                      {page.views.toLocaleString("fr-FR")}
                    </span>
                    <span className="text-right text-muted-foreground">{page.avgTime}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources">
            <Card className="mt-4">
              <CardContent className="p-4 space-y-3">
                {data.sources.map((source, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span>{source.source}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {source.sessions.toLocaleString("fr-FR")}
                        </span>
                        <Badge variant="secondary">{source.percentage}%</Badge>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${source.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {data.devices.map((device) => {
                    const Icon =
                      device.device === "mobile" || device.device === "Mobile"
                        ? Smartphone
                        : device.device === "desktop" || device.device === "Desktop"
                        ? Monitor
                        : Globe
                    return (
                      <div key={device.device} className="text-center p-4 rounded-lg border">
                        <Icon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-2xl font-bold">{device.percentage}%</p>
                        <p className="text-sm text-muted-foreground capitalize">{device.device}</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* GA4 connection CTA — only show if not configured */}
        {!data.configured && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Globe className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-medium mb-1">Connecter Google Analytics 4</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Pour afficher vos vraies donnees de trafic, ajoutez les variables
                GOOGLE_SERVICE_ACCOUNT_JSON et GA4_PROPERTY_ID dans les parametres.
              </p>
              <div className="flex gap-3 justify-center">
                <Button size="sm" variant="outline" render={<Link href="/settings" />}>
                  Configurer GA4
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  render={
                    <a
                      href="https://analytics.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ouvrir GA4
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
