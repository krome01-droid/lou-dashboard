"use client"

import { useCallback, useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  FileBarChart,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Newspaper,
  TrendingUp,
} from "lucide-react"

interface ContentLogRow {
  id: number
  title: string
  type: string
  status: string
  content_markdown: string | null
  meta_json: string | null
  created_by: string | null
  created_at: string
}

interface SeoReportRow {
  id: number
  report_type: string
  period_start: string | null
  period_end: string | null
  summary: string | null
  data_json: string | null
  created_at: string
}

interface ReportsData {
  briefs: ContentLogRow[]
  veille: ContentLogRow[]
  seoReports: SeoReportRow[]
}

type Job = "daily-brief" | "veille" | "seo-report" | "newsletter" | "social-auto"

const JOBS: { id: Job; label: string; description: string; cadence: string }[] = [
  {
    id: "daily-brief",
    label: "Brief quotidien",
    description: "État du site, actions prioritaires, idée d'article",
    cadence: "Tous les jours · 7h",
  },
  {
    id: "veille",
    label: "Veille actualités",
    description: "Scan RSS sécurité routière → idées d'articles",
    cadence: "Lun–Ven · 7h",
  },
  {
    id: "seo-report",
    label: "Rapport SEO",
    description: "Analyse complète SEO/GEO + recommandations",
    cadence: "Dimanche · 6h",
  },
  {
    id: "newsletter",
    label: "Newsletter",
    description: "Génération + envoi de la newsletter hebdo",
    cadence: "Lundi · 8h",
  },
  {
    id: "social-auto",
    label: "Posts sociaux",
    description: "Génération automatique de posts réseaux",
    cadence: "Lun/Mer/Ven · 9h",
  },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<Job | null>(null)
  const [lastRun, setLastRun] = useState<{ job: Job; ok: boolean; message: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin-lou/api/reports")
      if (res.ok) {
        const json = (await res.json()) as ReportsData
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const runJob = async (job: Job) => {
    setRunning(job)
    setLastRun(null)
    try {
      const res = await fetch("/admin-lou/api/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      })
      const json = await res.json()
      const ok = json.ok === true
      const message = ok
        ? "Exécution réussie"
        : typeof json.body === "object" && json.body && "error" in json.body
          ? String((json.body as { error?: string }).error)
          : `Erreur ${json.status ?? ""}`
      setLastRun({ job, ok, message })
      if (ok) await fetchData()
    } catch (err) {
      setLastRun({
        job,
        ok: false,
        message: err instanceof Error ? err.message : "Erreur",
      })
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <Header title="Rapports">
        <Button variant="ghost" size="icon-sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </Header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Job runner */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              Exécution manuelle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {JOBS.map((job) => (
                <div key={job.id} className="rounded-md border p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium">{job.label}</p>
                    <p className="text-xs text-muted-foreground">{job.description}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{job.cadence}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => runJob(job.id)}
                    disabled={running !== null}
                  >
                    {running === job.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Lancer maintenant
                  </Button>
                </div>
              ))}
            </div>
            {lastRun && (
              <div
                className={`text-xs rounded-md px-3 py-2 ${
                  lastRun.ok
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                <span className="font-medium">{lastRun.job}</span> — {lastRun.message}
              </div>
            )}
          </CardContent>
        </Card>

        {loading || !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="briefs">
            <TabsList>
              <TabsTrigger value="briefs">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Briefs quotidiens ({data.briefs.length})
              </TabsTrigger>
              <TabsTrigger value="seo">
                <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                Rapports SEO ({data.seoReports.length})
              </TabsTrigger>
              <TabsTrigger value="veille">
                <Newspaper className="h-3.5 w-3.5 mr-1.5" />
                Veille ({data.veille.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="briefs" className="mt-4 space-y-3">
              {data.briefs.length === 0 && <EmptyState label="Aucun brief généré" />}
              {data.briefs.map((b) => {
                const id = `brief-${b.id}`
                const open = openId === id
                const meta = parseJson<{ score?: number }>(b.meta_json)
                return (
                  <Card key={id}>
                    <button
                      type="button"
                      className="w-full text-left p-4 hover:bg-muted/40 flex items-start justify-between gap-3"
                      onClick={() => setOpenId(open ? null : id)}
                    >
                      <div>
                        <p className="font-medium text-sm">{b.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(b.created_at)}
                        </p>
                      </div>
                      {meta?.score !== undefined && (
                        <Badge variant="secondary">Score {Math.round(meta.score)}/100</Badge>
                      )}
                    </button>
                    {open && b.content_markdown && (
                      <div className="border-t px-4 py-3">
                        <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">
                          {b.content_markdown}
                        </pre>
                      </div>
                    )}
                  </Card>
                )
              })}
            </TabsContent>

            <TabsContent value="seo" className="mt-4 space-y-3">
              {data.seoReports.length === 0 && <EmptyState label="Aucun rapport SEO" />}
              {data.seoReports.map((r) => {
                const id = `seo-${r.id}`
                const open = openId === id
                const meta = parseJson<{ score?: number; recommendations?: unknown[] }>(r.data_json)
                return (
                  <Card key={id}>
                    <button
                      type="button"
                      className="w-full text-left p-4 hover:bg-muted/40 flex items-start justify-between gap-3"
                      onClick={() => setOpenId(open ? null : id)}
                    >
                      <div>
                        <p className="font-medium text-sm capitalize">
                          Rapport {r.report_type}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(r.created_at)}
                          {r.period_start && r.period_end && (
                            <>
                              {" "}
                              · période {r.period_start} → {r.period_end}
                            </>
                          )}
                        </p>
                      </div>
                      {meta?.score !== undefined && (
                        <Badge variant="secondary">Score {Math.round(meta.score)}/100</Badge>
                      )}
                    </button>
                    {open && (
                      <div className="border-t px-4 py-3 space-y-2">
                        {r.summary && <p className="text-sm">{r.summary}</p>}
                        {r.data_json && (
                          <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground bg-muted/40 p-2 rounded">
                            {JSON.stringify(parseJson(r.data_json) ?? r.data_json, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </TabsContent>

            <TabsContent value="veille" className="mt-4 space-y-3">
              {data.veille.length === 0 && <EmptyState label="Aucune veille enregistrée" />}
              {data.veille.map((v) => {
                const id = `veille-${v.id}`
                const open = openId === id
                const meta = parseJson<{ priority?: string }>(v.meta_json)
                return (
                  <Card key={id}>
                    <button
                      type="button"
                      className="w-full text-left p-4 hover:bg-muted/40 flex items-start justify-between gap-3"
                      onClick={() => setOpenId(open ? null : id)}
                    >
                      <div>
                        <p className="font-medium text-sm">{v.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(v.created_at)} · statut {v.status}
                        </p>
                      </div>
                      {meta?.priority && (
                        <Badge variant={meta.priority === "high" ? "default" : "secondary"}>
                          {meta.priority}
                        </Badge>
                      )}
                    </button>
                    {open && v.content_markdown && (
                      <div className="border-t px-4 py-3">
                        <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">
                          {v.content_markdown}
                        </pre>
                      </div>
                    )}
                  </Card>
                )
              })}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        <FileBarChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
        {label}
      </CardContent>
    </Card>
  )
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
