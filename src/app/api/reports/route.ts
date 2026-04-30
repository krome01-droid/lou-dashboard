import { query } from "@/lib/db/connection"

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

export async function GET() {
  try {
    const [briefs, veille, seoReports] = await Promise.all([
      query<ContentLogRow>(
        `SELECT id, title, type, status, content_markdown, meta_json, created_by, created_at
         FROM wp_lou_content_log
         WHERE type = 'brief'
         ORDER BY created_at DESC
         LIMIT 30`,
      ).catch(() => []),
      query<ContentLogRow>(
        `SELECT id, title, type, status, content_markdown, meta_json, created_by, created_at
         FROM wp_lou_content_log
         WHERE created_by = 'lou-veille'
         ORDER BY created_at DESC
         LIMIT 30`,
      ).catch(() => []),
      query<SeoReportRow>(
        `SELECT id, report_type, period_start, period_end, summary, data_json, created_at
         FROM wp_lou_seo_reports
         ORDER BY created_at DESC
         LIMIT 20`,
      ).catch(() => []),
    ])

    return Response.json({ briefs, veille, seoReports })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur reports" },
      { status: 500 },
    )
  }
}
