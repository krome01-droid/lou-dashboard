"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
  Mail,
  Share2,
  Send,
  Calendar as CalendarIcon,
  Loader2,
  X,
} from "lucide-react"

interface CalendarEvent {
  id: number
  title: string
  content_type: string
  planned_date: string
  status: string
  notes: string | null
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  article: { label: "Article", icon: FileText, color: "bg-blue-100 text-blue-800" },
  newsletter: { label: "Newsletter", icon: Mail, color: "bg-purple-100 text-purple-800" },
  social_campaign: { label: "Social", icon: Share2, color: "bg-pink-100 text-pink-800" },
  email_sequence: { label: "Email", icon: Send, color: "bg-green-100 text-green-800" },
  other: { label: "Autre", icon: CalendarIcon, color: "bg-gray-100 text-gray-800" },
}

const STATUS_LABELS: Record<string, string> = {
  idea: "Idee",
  planned: "Planifie",
  in_progress: "En cours",
  review: "A relire",
  published: "Publie",
  cancelled: "Annule",
}

const STATUS_COLORS: Record<string, string> = {
  idea: "bg-yellow-100 text-yellow-800",
  planned: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  review: "bg-purple-100 text-purple-800",
  published: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
}

const MONTHS_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
]

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [formLoading, setFormLoading] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState("")
  const [formType, setFormType] = useState("article")
  const [formStatus, setFormStatus] = useState("planned")
  const [formNotes, setFormNotes] = useState("")

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/admin-lou/api/calendar?month=${monthKey}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data)
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }, [monthKey])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Calendar grid
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday = 0
  const totalDays = lastDay.getDate()

  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let i = 1; i <= totalDays; i++) days.push(i)
  while (days.length % 7 !== 0) days.push(null)

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return events.filter((e) => e.planned_date?.startsWith(dateStr))
  }

  const today = new Date()
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const openForm = (day?: number) => {
    if (day) {
      setSelectedDate(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    } else {
      setSelectedDate("")
    }
    setFormTitle("")
    setFormType("article")
    setFormStatus("planned")
    setFormNotes("")
    setShowForm(true)
  }

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle || !selectedDate) return

    setFormLoading(true)
    try {
      const res = await fetch("/admin-lou/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          content_type: formType,
          planned_date: selectedDate,
          status: formStatus,
          notes: formNotes || undefined,
        }),
      })

      if (res.ok) {
        setShowForm(false)
        fetchEvents()
      }
    } catch {
      // silent
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <>
      <Header title="Calendrier editorial" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon-sm" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[200px] text-center">
              {MONTHS_FR[month]} {year}
            </h2>
            <Button variant="outline" size="icon-sm" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday}>
              Aujourd&apos;hui
            </Button>
          </div>
          <Button size="sm" onClick={() => openForm()}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter
          </Button>
        </div>

        {/* Calendar grid */}
        <Card>
          <CardContent className="p-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b">
              {DAYS_FR.map((d) => (
                <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const dayEvents = day ? getEventsForDay(day) : []
                return (
                  <div
                    key={i}
                    className={`min-h-[100px] border-b border-r p-1.5 ${
                      day ? "cursor-pointer hover:bg-muted/50" : "bg-muted/20"
                    } ${isToday(day!) ? "bg-primary/5" : ""}`}
                    onClick={() => day && openForm(day)}
                  >
                    {day && (
                      <>
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            isToday(day)
                              ? "bg-primary text-primary-foreground font-bold"
                              : "text-muted-foreground"
                          }`}
                        >
                          {day}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 3).map((ev) => {
                            const typeConf = TYPE_CONFIG[ev.content_type] || TYPE_CONFIG.other
                            return (
                              <div
                                key={ev.id}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium truncate ${typeConf.color}`}
                                title={`${ev.title} (${STATUS_LABELS[ev.status] || ev.status})`}
                              >
                                {ev.title}
                              </div>
                            )
                          })}
                          {dayEvents.length > 3 && (
                            <p className="text-[10px] text-muted-foreground pl-1">
                              +{dayEvents.length - 3} de plus
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Events list for current month */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Evenements de {MONTHS_FR[month]} ({events.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement...
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun evenement ce mois-ci. Cliquez sur un jour pour en ajouter.
              </p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => {
                  const typeConf = TYPE_CONFIG[ev.content_type] || TYPE_CONFIG.other
                  const Icon = typeConf.icon
                  return (
                    <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ev.planned_date).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}
                          {ev.notes && ` — ${ev.notes}`}
                        </p>
                      </div>
                      <Badge className={`text-[10px] ${typeConf.color}`}>
                        {typeConf.label}
                      </Badge>
                      <Badge className={`text-[10px] ${STATUS_COLORS[ev.status] || ""}`}>
                        {STATUS_LABELS[ev.status] || ev.status}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create form overlay */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Nouvel evenement</CardTitle>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowForm(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitEvent} className="space-y-4">
                  <div>
                    <Label className="text-xs mb-1.5">Titre</Label>
                    <Input
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Titre de l'evenement"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-xs mb-1.5">Date</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1.5">Type</Label>
                      <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      >
                        {Object.entries(TYPE_CONFIG).map(([key, conf]) => (
                          <option key={key} value={key}>{conf.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5">Statut</Label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value)}
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      >
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs mb-1.5">Notes (optionnel)</Label>
                    <Input
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Notes..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={formLoading}>
                      {formLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Creer
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                      Annuler
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
