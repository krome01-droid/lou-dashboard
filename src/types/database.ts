export interface ContentLog {
  id: number
  title: string
  type: "article" | "social" | "newsletter" | "email"
  status: "draft" | "review" | "published" | "scheduled" | "failed"
  wp_post_id: number | null
  wp_url: string | null
  ghl_message_id: string | null
  content_markdown: string | null
  meta_json: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface SocialPost {
  id: number
  content_log_id: number | null
  platform: "facebook" | "instagram" | "linkedin" | "google_business"
  ghl_post_id: string | null
  scheduled_at: string | null
  published_at: string | null
  status: "draft" | "scheduled" | "published" | "failed"
  caption: string | null
  media_urls: string[] | null
  engagement_json: Record<string, number> | null
  created_at: string
}

export interface SeoReport {
  id: number
  report_type: "weekly" | "monthly" | "audit" | "geo"
  period_start: string | null
  period_end: string | null
  data_json: Record<string, unknown>
  summary: string | null
  created_at: string
}

export interface EditorialCalendarEvent {
  id: number
  title: string
  content_type: "article" | "newsletter" | "social_campaign" | "email_sequence"
  planned_date: string
  status: "idea" | "planned" | "in_progress" | "review" | "published" | "cancelled"
  assigned_to: string
  content_log_id: number | null
  tags: string[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: number
  title: string | null
  messages_json: string
  context_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
