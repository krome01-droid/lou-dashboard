"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { MetricCard } from "@/components/analytics/metric-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  Share2,
  Search,
  TrendingUp,
  PenLine,
  CalendarDays,
  Zap,
  BarChart3,
  Clock,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

interface DashboardData {
  totalArticles: number
  thisMonthArticles: number
  recentActivity: { title: string; type: string; status: string; created_at: string }[]
  upcomingEvents: { title: string; content_type: string; planned_date: string }[]
}

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  newsletter: "Newsletter",
  social_campaign: "Social",
  email_sequence: "Email",
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/admin-lou/api/dashboard")
        if (res.ok) {
          setData(await res.json())
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  return (
    <>
      <Header title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Articles publies"
            value={loading ? "..." : (data?.totalArticles ?? 0)}
            description="Total"
            icon={FileText}
          />
          <MetricCard
            title="Ce mois"
            value={loading ? "..." : (data?.thisMonthArticles ?? 0)}
            description="Articles publies"
            icon={TrendingUp}
          />
          <MetricCard
            title="Mots-cles top 10"
            value="2"
            description="Google"
            icon={Search}
          />
          <MetricCard
            title="Score SEO moy."
            value="62"
            description="Sur 100"
            icon={BarChart3}
          />
        </div>

        {/* Actions rapides */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/chat">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <PenLine className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Nouvel article</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/social">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <Share2 className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Programmer des posts</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/seo">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <Zap className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Audit SEO</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/calendar">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <CalendarDays className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Calendrier</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Derniere activite */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Derniere activite</CardTitle>
                <Button variant="ghost" size="sm" render={<Link href="/articles" />}>
                  Voir tout
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data?.recentActivity && data.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {data.recentActivity.map((activity, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {TYPE_LABELS[activity.type] || activity.type} —{" "}
                          {new Date(activity.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <Badge variant={activity.status === "published" ? "default" : "secondary"}>
                        {activity.status === "published" ? "Publie" : "Brouillon"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Aucune activite recente. Commencez par discuter avec LOU pour creer votre premier contenu.
                  </p>
                  <Button className="mt-4" size="sm" render={<Link href="/chat" />}>
                    Discuter avec LOU
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prochains evenements */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Prochains evenements</CardTitle>
                <Button variant="ghost" size="sm" render={<Link href="/calendar" />}>
                  Calendrier
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data?.upcomingEvents && data.upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {data.upcomingEvents.map((event, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.planned_date).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                          })}
                        </p>
                      </div>
                      <Badge variant="outline">{TYPE_LABELS[event.content_type] || event.content_type}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Aucun evenement planifie. Ajoutez des evenements dans le calendrier editorial.
                  </p>
                  <Button className="mt-4" size="sm" variant="outline" render={<Link href="/calendar" />}>
                    Ouvrir le calendrier
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
