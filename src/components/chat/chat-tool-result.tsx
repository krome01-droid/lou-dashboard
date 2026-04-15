"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { ToolCallResult } from "@/lib/ai/types"
import { Wrench, Check, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"

const TOOL_LABELS: Record<string, string> = {
  publish_article: "Publication WordPress",
  schedule_social: "Programmation sociale",
  send_email: "Envoi email",
  search_wp_posts: "Recherche articles",
  get_calendar: "Calendrier éditorial",
  create_calendar_event: "Ajout calendrier",
  get_seo_data: "Données SEO",
  get_analytics: "Analytics",
  scrape_serp: "Recherche Google (SERP)",
  scrape_webpage: "Extraction contenu web",
  generate_image: "Génération image",
}

function summarizeResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== "object") return ""
  const r = result as Record<string, unknown>

  if (r.error) return `Erreur : ${r.error}`

  switch (toolName) {
    case "publish_article":
      return r.success ? `Article publié (ID ${r.post_id})` : "Échec publication"
    case "search_wp_posts":
      return Array.isArray(result) ? `${result.length} article(s) trouvé(s)` : ""
    case "get_calendar":
      return Array.isArray(result) ? `${result.length} événement(s)` : ""
    case "create_calendar_event":
      return r.success ? `Événement créé (ID ${r.id})` : "Échec création"
    case "schedule_social":
      return r.success ? "Post programmé" : "Échec programmation"
    case "send_email":
      return r.success ? "Email envoyé" : "Échec envoi"
    case "get_seo_data":
      if (r.searchConsoleConnected === false && (!r.keywords || (Array.isArray(r.keywords) && r.keywords.length === 0))) {
        return "Search Console non connecté — données indisponibles"
      }
      if (r.score != null) return `Score SEO : ${r.score}/100`
      if (Array.isArray(r.keywords)) return `${r.keywords.length} mot(s)-clé(s)`
      return ""
    case "get_analytics":
      if (r.configured === false) return "GA4 non configuré"
      if (r.totalSessions != null) return `${r.totalSessions} sessions`
      return ""
    case "scrape_serp":
      return r.total_results != null
        ? `${r.total_results} résultat(s) Google pour "${r.query ?? ""}"`
        : ""
    case "scrape_webpage": {
      const domain = typeof r.url === "string" ? new URL(r.url).hostname : ""
      return r.content_length != null
        ? `Contenu extrait de ${domain} (${r.content_length} chars${r.truncated ? ", tronqué" : ""})`
        : ""
    }
    case "generate_image":
      if (r.wordpress_media_id) return `Image générée et uploadée (media_id: ${r.wordpress_media_id})`
      if (r.image_url) return "Image générée"
      return ""
    default:
      return ""
  }
}

export function ChatToolResult({ toolCall }: { toolCall: ToolCallResult }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[toolCall.toolName] ?? toolCall.toolName
  const isLoading = toolCall.result === null
  const isError = toolCall.status === "error"
  const summary = !isLoading ? summarizeResult(toolCall.toolName, toolCall.result) : ""

  return (
    <div className="my-2 rounded-md border bg-muted/50 px-3 py-2">
      <div
        className="flex cursor-pointer items-center gap-2"
        onClick={() => !isLoading && setExpanded(!expanded)}
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{label}</span>
        {isLoading ? (
          <Badge variant="outline" className="text-[10px]">
            En cours...
          </Badge>
        ) : isError ? (
          <Badge variant="destructive" className="text-[10px]">
            <AlertCircle className="mr-1 h-3 w-3" />
            Erreur
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            <Check className="mr-1 h-3 w-3" />
            OK
          </Badge>
        )}
        {!isLoading && (
          expanded
            ? <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
        )}
      </div>
      {summary && !expanded && (
        <p className="mt-1 text-[11px] text-muted-foreground">{summary}</p>
      )}
      {expanded && toolCall.result != null && (
        <pre className="mt-1 max-h-40 overflow-auto text-[11px] text-muted-foreground">
          {typeof toolCall.result === "string"
            ? toolCall.result
            : JSON.stringify(toolCall.result as object, null, 2)}
        </pre>
      )}
    </div>
  )
}
