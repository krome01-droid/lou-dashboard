"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  Save,
  Loader2,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"

interface ArticleDetail {
  id: number
  title: string
  content: string
  slug: string
  status: string
  link: string
  date: string
  categories: number[]
}

export default function ArticleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [article, setArticle] = useState<ArticleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  // Editable fields
  const [title, setTitle] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    async function fetchArticle() {
      try {
        const res = await fetch(`/admin-lou/api/wordpress/posts/${id}`)
        if (!res.ok) throw new Error("Article introuvable")
        const data = await res.json()
        setArticle(data)
        setTitle(data.title)
        setStatus(data.status)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur")
      } finally {
        setLoading(false)
      }
    }
    fetchArticle()
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/admin-lou/api/wordpress/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status }),
      })
      if (!res.ok) throw new Error("Erreur sauvegarde")
      const data = await res.json()
      setArticle((prev) =>
        prev ? { ...prev, title: data.title, status: data.status, link: data.link } : prev,
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <Header title="Article" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (error || !article) {
    return (
      <>
        <Header title="Article" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-destructive">{error || "Article introuvable"}</p>
          <Button variant="outline" onClick={() => router.push("/articles")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Retour
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Article">
        <div className="flex items-center gap-2">
          {article.status === "publish" && (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={article.link} target="_blank" rel="noopener noreferrer" />
              }
            >
              <Eye className="h-4 w-4 mr-1" />
              Voir
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {saved ? "Sauvegarde" : "Sauvegarder"}
          </Button>
        </div>
      </Header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Button variant="ghost" size="sm" render={<Link href="/articles" />}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Tous les articles
        </Button>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Titre</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-medium"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contenu</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: article.content }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs mb-1.5">Statut</Label>
                  <div className="flex gap-2">
                    {["draft", "publish"].map((s) => (
                      <Button
                        key={s}
                        variant={status === s ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatus(s)}
                      >
                        {s === "publish" ? "Publie" : "Brouillon"}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-1.5">Slug</Label>
                  <p className="text-sm text-muted-foreground">/{article.slug}</p>
                </div>

                <div>
                  <Label className="text-xs mb-1.5">Date</Label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(article.date).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div>
                  <Label className="text-xs mb-1.5">ID WordPress</Label>
                  <p className="text-sm text-muted-foreground">#{article.id}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  render={
                    <a
                      href={`${article.link.replace(/\/[^/]*\/?$/, "")}/wp-admin/post.php?post=${article.id}&action=edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Editer dans WordPress
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
