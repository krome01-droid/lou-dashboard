"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Share2,
  Mail,
  CalendarDays,
  Search,
  BarChart3,
  Settings,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat LOU", icon: MessageSquare },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/social", label: "Social", icon: Share2 },
  { href: "/newsletter", label: "Newsletter", icon: Mail },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/seo", label: "SEO / GEO", icon: Search },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Paramètres", icon: Settings },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <h1 className="text-lg font-black tracking-tight">
          <span className="text-sidebar-primary italic">AUTO-ECOLE</span>
          <span className="italic">MAG</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-xs text-sidebar-foreground/50">
          LOU v1.0 — Agent IA
        </p>
      </div>
    </aside>
  )
}
