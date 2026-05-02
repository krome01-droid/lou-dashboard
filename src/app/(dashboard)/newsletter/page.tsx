"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import DOMPurify from "dompurify"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Mail,
  Send,
  Eye,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Code,
} from "lucide-react"
import Link from "next/link"

interface SendResult {
  success: boolean
  total?: number
  successCount?: number
  error?: string
  errors?: { email: string; error: string }[]
}

const EMAIL_TEMPLATES = [
  {
    name: "Newsletter hebdomadaire",
    subject: "Auto-Ecole Magazine - Les actus de la semaine",
    html: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
  <div style="background:#dc2626;padding:20px;text-align:center;">
    <h1 style="color:white;margin:0;">AUTO-ECOLE<em>MAG</em></h1>
  </div>
  <div style="padding:20px;">
    <h2>Bonjour {{contact.first_name}} !</h2>
    <p>Voici les dernieres actualites du monde de l'auto-ecole :</p>
    <ul>
      <li>Article 1 : ...</li>
      <li>Article 2 : ...</li>
    </ul>
    <p style="text-align:center;margin-top:20px;">
      <a href="https://autoecolemagazine.fr" style="background:#dc2626;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Lire sur le site</a>
    </p>
  </div>
  <div style="background:#f3f4f6;padding:12px;text-align:center;font-size:12px;color:#6b7280;">
    AutoEcoleMagazine.fr - Le comparateur d'auto-ecoles
  </div>
</div>`,
  },
  {
    name: "Alerte nouveau guide",
    subject: "Nouveau guide : Comment choisir son auto-ecole",
    html: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
  <div style="background:#dc2626;padding:20px;text-align:center;">
    <h1 style="color:white;margin:0;">AUTO-ECOLE<em>MAG</em></h1>
  </div>
  <div style="padding:20px;">
    <h2>{{contact.first_name}}, un nouveau guide est disponible !</h2>
    <p>Nous venons de publier un guide complet pour vous aider dans votre choix d'auto-ecole.</p>
    <p style="text-align:center;margin-top:20px;">
      <a href="https://autoecolemagazine.fr" style="background:#dc2626;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Decouvrir le guide</a>
    </p>
  </div>
</div>`,
  },
]

export default function NewsletterPage() {
  const [subject, setSubject] = useState("")
  const [htmlContent, setHtmlContent] = useState("")
  const safeHtmlPreview = useMemo(() => {
    if (typeof window === "undefined") return ""
    return DOMPurify.sanitize(htmlContent.replace(/\{\{contact\.first_name\}\}/g, "Laurent"))
  }, [htmlContent])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmSendAll, setConfirmSendAll] = useState(false)
  const [history, setHistory] = useState<{ id: number; title: string; status: string; meta_json: string; created_at: string }[]>([])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/admin-lou/api/wordpress/posts?per_page=1&status=publish")
      // Use the dashboard API to fetch newsletter logs
      const nlRes = await fetch("/admin-lou/api/dashboard")
      if (nlRes.ok) {
        const data = await nlRes.json()
        const nlLogs = (data.recentActivity ?? []).filter((a: { type: string }) => a.type === "newsletter")
        setHistory(nlLogs)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const sendEmail = async (mode: "preview" | "send_all") => {
    if (!subject.trim() || !htmlContent.trim()) return

    if (mode === "send_all" && !confirmSendAll) {
      setConfirmSendAll(true)
      return
    }

    setLoading(true)
    setResult(null)
    setConfirmSendAll(false)

    try {
      const res = await fetch("/admin-lou/api/ghl/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          html_content: htmlContent,
          mode,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")

      if (mode === "preview") {
        setResult({
          success: data.success,
          error: data.success ? undefined : data.error,
        })
      } else {
        setResult({
          success: true,
          total: data.total,
          successCount: data.success,
          errors: data.errors,
        })
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Erreur envoi",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadTemplate = (template: (typeof EMAIL_TEMPLATES)[0]) => {
    setSubject(template.subject)
    setHtmlContent(template.html)
    setResult(null)
    setConfirmSendAll(false)
  }

  return (
    <>
      <Header title="Newsletter" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Tabs defaultValue="compose">
          <TabsList>
            <TabsTrigger value="compose">Composer</TabsTrigger>
            <TabsTrigger value="history">Historique</TabsTrigger>
            <TabsTrigger value="templates">Modeles</TabsTrigger>
          </TabsList>

          <TabsContent value="compose">
            <div className="grid gap-6 mt-4 lg:grid-cols-2">
              {/* Editor */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Composition
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs mb-1.5">Objet de l&apos;email</Label>
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Objet de votre newsletter..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1 mb-1.5">
                        <Code className="h-3 w-3" />
                        Contenu HTML
                      </Label>
                      <Textarea
                        value={htmlContent}
                        onChange={(e) => setHtmlContent(e.target.value)}
                        placeholder="<div>Votre contenu HTML ici...</div>"
                        rows={16}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Utilisez {"{{contact.first_name}}"} pour personnaliser
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {result && (
                      <div
                        className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                          result.success
                            ? "bg-green-50 text-green-800 border border-green-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        )}
                        <div>
                          {result.total !== undefined ? (
                            <p>
                              Envoye a {result.successCount}/{result.total} contacts
                              {result.errors && result.errors.length > 0 && (
                                <span className="block text-xs mt-1">
                                  {result.errors.length} erreur(s)
                                </span>
                              )}
                            </p>
                          ) : result.success ? (
                            <p>Email de test envoye (krome01@gmail.com)</p>
                          ) : (
                            <p>{result.error}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {confirmSendAll && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">Confirmer l&apos;envoi a tous les contacts ?</p>
                          <p className="text-xs mt-1">
                            Cette action est irreversible. L&apos;email sera envoye a tous vos contacts GHL.
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => sendEmail("send_all")}
                              disabled={loading}
                            >
                              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                              Confirmer l&apos;envoi
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmSendAll(false)}
                            >
                              Annuler
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={loading || !subject || !htmlContent}
                        onClick={() => sendEmail("preview")}
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4 mr-2" />
                        )}
                        Envoyer un test
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={loading || !subject || !htmlContent}
                        onClick={() => sendEmail("send_all")}
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4 mr-2" />
                        )}
                        Envoyer a tous
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Le test est envoye a krome01@gmail.com
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Preview */}
              <div className="space-y-4">
                <Card className="h-fit">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Apercu
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPreview(!showPreview)}
                      >
                        {showPreview ? "Masquer" : "Afficher"}
                      </Button>
                    </div>
                  </CardHeader>
                  {showPreview && htmlContent && (
                    <CardContent>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted px-3 py-2 text-xs border-b">
                          <strong>Objet :</strong> {subject || "(vide)"}
                        </div>
                        <div
                          className="p-4 text-sm"
                          dangerouslySetInnerHTML={{ __html: safeHtmlPreview }}
                        />
                      </div>
                    </CardContent>
                  )}
                  {!htmlContent && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Redigez votre email pour voir l&apos;apercu
                      </p>
                    </CardContent>
                  )}
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      Vous pouvez aussi demander a LOU de rediger votre newsletter.
                    </p>
                    <Button className="mt-2" size="sm" variant="outline" render={<Link href="/chat" />}>
                      Rediger avec LOU
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Newsletters envoyees
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune newsletter envoyee pour le moment. Le cron newsletter s&apos;execute chaque lundi a 8h.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {history.map((nl, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{nl.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(nl.created_at).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <Badge variant={nl.status === "published" ? "default" : "secondary"}>
                          {nl.status === "published" ? "Envoye" : nl.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            <div className="grid gap-4 mt-4 sm:grid-cols-2">
              {EMAIL_TEMPLATES.map((template, i) => (
                <Card key={i} className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="text-sm">{template.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3 truncate">
                      Objet : {template.subject}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadTemplate(template)}
                    >
                      Utiliser ce modele
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
