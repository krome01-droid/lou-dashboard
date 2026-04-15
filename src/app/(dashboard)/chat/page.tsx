"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput } from "@/components/chat/chat-input"
import { useAiChat } from "@/hooks/use-ai-chat"
import { Button } from "@/components/ui/button"
import { Plus, MessageSquare, Trash2, Download, ClipboardCopy } from "lucide-react"

interface ConversationSummary {
  id: number
  title: string | null
  updated_at: string
}

export default function ChatPage() {
  const {
    messages,
    isStreaming,
    conversationId,
    sendMessage,
    stopStreaming,
    loadConversation,
    newConversation,
  } = useAiChat()

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/admin-lou/api/conversations")
      if (res.ok) {
        setConversations(await res.json())
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Refresh list after each conversation save
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const timer = setTimeout(fetchConversations, 500)
      return () => clearTimeout(timer)
    }
  }, [isStreaming, messages.length, fetchConversations])

  function exportAsMarkdown() {
    if (messages.length === 0) return
    const md = messages
      .map((m) => {
        const role = m.role === "user" ? "## Vous" : "## LOU"
        const files = m.attachments?.map((a) => `📎 ${a.filename}`).join("\n") ?? ""
        return `${role}\n${files ? files + "\n" : ""}${m.content}\n`
      })
      .join("\n---\n\n")

    const blob = new Blob([md], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `conversation-lou-${new Date().toISOString().split("T")[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyConversation() {
    if (messages.length === 0) return
    const text = messages
      .map((m) => `${m.role === "user" ? "Vous" : "LOU"}: ${m.content}`)
      .join("\n\n")
    navigator.clipboard.writeText(text)
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/admin-lou/api/conversations/${id}`, { method: "DELETE" })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (conversationId === id) {
        newConversation()
      }
    } catch {
      // silent
    }
  }

  return (
    <>
      <Header title="Chat LOU">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Historique
          </Button>
          {messages.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyConversation}
                title="Copier la conversation"
              >
                <ClipboardCopy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={exportAsMarkdown}
                title="Télécharger en Markdown"
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="sm" onClick={newConversation}>
            <Plus className="h-4 w-4 mr-1" />
            Nouveau
          </Button>
        </div>
      </Header>
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation history panel */}
        {showHistory && (
          <div className="w-64 border-r bg-muted/30 overflow-y-auto shrink-0">
            <div className="p-3 space-y-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  Aucune conversation sauvegardee
                </p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors group ${
                      conversationId === conv.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium">
                        {conv.title || "Sans titre"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(conv.updated_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatMessages messages={messages} onSuggestionClick={(text) => sendMessage(text)} />
          <ChatInput
            onSend={sendMessage}
            onStop={stopStreaming}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </>
  )
}
