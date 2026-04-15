"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Globe,
  MessageSquare,
  Briefcase,
  Send,
  Clock,
  Hash,
  Link2,
  ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"

type Platform = "facebook" | "instagram" | "linkedin" | "tiktok" | "threads" | "youtube"

interface ScheduleResult {
  success: boolean
  error?: string
}

interface ScheduledPost {
  id: number
  platform: string
  scheduled_at: string | null
  published_at: string | null
  status: string
  caption: string | null
}

interface SocialAccount {
  id: string
  name: string
  platform: string
  type: string
}

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: typeof Globe; color: string; maxLength: number }> = {
  facebook: { label: "Facebook", icon: Globe, color: "text-blue-600", maxLength: 5000 },
  instagram: { label: "Instagram", icon: MessageSquare, color: "text-pink-600", maxLength: 2200 },
  linkedin: { label: "LinkedIn", icon: Briefcase, color: "text-blue-700", maxLength: 3000 },
  tiktok: { label: "TikTok", icon: MessageSquare, color: "text-black", maxLength: 2200 },
  threads: { label: "Threads", icon: MessageSquare, color: "text-gray-800", maxLength: 500 },
  youtube: { label: "YouTube", icon: Globe, color: "text-red-600", maxLength: 5000 },
}

export default function SocialPage() {
  const [platform, setPlatform] = useState<Platform>("facebook")
  const [text, setText] = useState("")
  const [hashtags, setHashtags] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScheduleResult | null>(null)
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [connectedAccounts, setConnectedAccounts] = useState<SocialAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  const fetchScheduledPosts = useCallback(async () => {
    setPostsLoading(true)
    try {
      const res = await fetch("/admin-lou/api/ghl/social")
      if (res.ok) {
        const data = await res.json()
        setScheduledPosts(Array.isArray(data) ? data : data.posts ?? [])
      }
    } catch {
      // silent
    } finally {
      setPostsLoading(false)
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await fetch("/admin-lou/api/ghl/social/accounts")
      if (res.ok) {
        const data = await res.json()
        setConnectedAccounts(Array.isArray(data) ? data : [])
      }
    } catch {
      // silent
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchScheduledPosts()
    fetchAccounts()
  }, [fetchScheduledPosts, fetchAccounts])

  const hasPlatformAccount = (p: Platform) =>
    connectedAccounts.some((a) => a.platform.toLowerCase() === p)

  const charCount = text.length
  const maxLength = PLATFORM_CONFIG[platform].maxLength
  const isOverLimit = charCount > maxLength

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !scheduledAt) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch("/admin-lou/api/ghl/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          text: text.trim(),
          hashtags: hashtags
            ? hashtags.split(/[,\s]+/).filter(Boolean).map((h) => h.replace(/^#/, ""))
            : undefined,
          scheduled_at: new Date(scheduledAt).toISOString(),
          link_url: linkUrl || undefined,
          media_url: mediaUrl || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")

      setResult({ success: true })
      setText("")
      setHashtags("")
      setLinkUrl("")
      setMediaUrl("")
      setScheduledAt("")
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Erreur programmation",
      })
    } finally {
      setLoading(false)
    }
  }

  // Default to tomorrow 10:00
  const getMinDateTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 10)
    return now.toISOString().slice(0, 16)
  }

  return (
    <>
      <Header title="Social Media" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Tabs defaultValue="create">
          <TabsList>
            <TabsTrigger value="create">Programmer un post</TabsTrigger>
            <TabsTrigger value="scheduled">Planifies ({scheduledPosts.length})</TabsTrigger>
            <TabsTrigger value="help">Aide</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
              {/* Platform selector */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Plateforme</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-3">
                    {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG.facebook][]).map(
                      ([key, config]) => {
                        const Icon = config.icon
                        const connected = hasPlatformAccount(key)
                        return (
                          <Button
                            key={key}
                            type="button"
                            variant={platform === key ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => setPlatform(key)}
                            disabled={!accountsLoading && !connected}
                          >
                            <Icon className={`h-4 w-4 mr-2 ${platform !== key ? config.color : ""}`} />
                            {config.label}
                            {!accountsLoading && (
                              connected ? (
                                <CheckCircle2 className="h-3 w-3 ml-1 text-green-500" />
                              ) : (
                                <AlertCircle className="h-3 w-3 ml-1 text-muted-foreground" />
                              )
                            )}
                          </Button>
                        )
                      }
                    )}
                  </div>
                  {!accountsLoading && connectedAccounts.length === 0 && (
                    <p className="text-xs text-destructive">
                      Aucun compte social connecté dans GHL. Allez dans GHL &gt; Marketing &gt; Social Planner &gt; Paramètres pour connecter vos comptes.
                    </p>
                  )}
                  {!accountsLoading && !hasPlatformAccount(platform) && connectedAccounts.length > 0 && (
                    <p className="text-xs text-amber-600">
                      Aucun compte {PLATFORM_CONFIG[platform].label} connecté. Comptes disponibles : {[...new Set(connectedAccounts.map((a) => a.platform))].join(", ")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Content */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contenu du post</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={`Ecrivez votre post ${PLATFORM_CONFIG[platform].label}...`}
                      rows={6}
                      required
                    />
                    <div className="flex justify-between mt-1">
                      <p className="text-xs text-muted-foreground">
                        {platform === "instagram" && "Astuce : les hashtags sont ajoutes automatiquement en fin de post"}
                      </p>
                      <p className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
                        {charCount}/{maxLength}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs flex items-center gap-1 mb-1.5">
                      <Hash className="h-3 w-3" />
                      Hashtags (separes par des virgules)
                    </Label>
                    <Input
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      placeholder="permis, autoecole, conduite"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs flex items-center gap-1 mb-1.5">
                        <Link2 className="h-3 w-3" />
                        URL du lien (optionnel)
                      </Label>
                      <Input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://autoecolemagazine.fr/..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1 mb-1.5">
                        <ImageIcon className="h-3 w-3" />
                        URL de l&apos;image (optionnel)
                      </Label>
                      <Input
                        type="url"
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Programmation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    min={getMinDateTime()}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Choisissez la date et l&apos;heure de publication
                  </p>
                </CardContent>
              </Card>

              {/* Result */}
              {result && (
                <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  <CardContent className="p-4 flex items-center gap-2">
                    {result.success ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-sm text-green-800">Post programme avec succes !</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <span className="text-sm text-red-800">{result.error}</span>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Submit */}
              <div className="flex gap-3">
                <Button type="submit" disabled={loading || !text.trim() || !scheduledAt || isOverLimit || !hasPlatformAccount(platform)} className="flex-1">
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {loading ? "Programmation..." : "Programmer le post"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="scheduled">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Posts planifies
                </CardTitle>
              </CardHeader>
              <CardContent>
                {postsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement...
                  </div>
                ) : scheduledPosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun post planifie. Programmez un post ou demandez a LOU de le faire automatiquement.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {scheduledPosts.map((post) => (
                      <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs capitalize">{post.platform}</Badge>
                            <Badge
                              variant={post.status === "published" ? "default" : post.status === "scheduled" ? "outline" : "destructive"}
                              className="text-xs"
                            >
                              {post.status === "published" ? "Publie" : post.status === "scheduled" ? "Planifie" : post.status}
                            </Badge>
                          </div>
                          <p className="text-sm line-clamp-2">{post.caption || "—"}</p>
                          {post.scheduled_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <Clock className="inline h-3 w-3 mr-1" />
                              {new Date(post.scheduled_at).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="help">
            <Card className="mt-4">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-medium">Conseils de publication</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary">Facebook</Badge>
                    <p>Publiez entre 9h-12h ou 18h-20h. Les posts avec images obtiennent 2.3x plus d&apos;engagement.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary">Instagram</Badge>
                    <p>Meilleur engagement entre 11h-13h et 19h-21h. Utilisez 5-10 hashtags pertinents.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary">LinkedIn</Badge>
                    <p>Publiez en semaine entre 8h-10h. Ton professionnel, partagez des statistiques.</p>
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Vous pouvez aussi demander a LOU de rediger et programmer vos posts automatiquement.
                  </p>
                  <Button className="mt-2" size="sm" variant="outline" render={<Link href="/chat" />}>
                    Demander a LOU
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
