"use client"

import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { ChatToolResult } from "./chat-tool-result"
import type { ChatMessage } from "@/lib/ai/types"
import { Bot, User, FileText, Image as ImageIcon, Copy, Check } from "lucide-react"

interface ChatMessagesProps {
  messages: ChatMessage[]
  onSuggestionClick?: (text: string) => void
}

export function ChatMessages({ messages, onSuggestionClick }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  function copyMessage(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Bonjour, je suis LOU</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre assistant communication pour AutoEcoleMagazine.fr
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            "Écris un article sur le permis à 17 ans",
            "Programme les posts sociaux de la semaine",
            "Lance un audit SEO du site",
            "Montre le calendrier éditorial",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSuggestionClick?.(suggestion)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "assistant" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-4 py-3 text-sm group relative",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {/* Copy button for assistant messages */}
              {msg.role === "assistant" && msg.content && (
                <button
                  onClick={() => copyMessage(msg.content, i)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-background/50"
                  title="Copier"
                >
                  {copiedIdx === i ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
              {/* File attachments */}
              {msg.attachments?.map((att, k) => (
                <div key={k} className="mb-2 flex items-center gap-1.5 text-xs opacity-80">
                  {att.mimeType.startsWith("image/") ? (
                    <ImageIcon className="h-3.5 w-3.5" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  <span>{att.filename}</span>
                </div>
              ))}
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.toolCalls?.map((tc, j) => (
                <ChatToolResult key={j} toolCall={tc} />
              ))}
            </div>
            {msg.role === "user" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
