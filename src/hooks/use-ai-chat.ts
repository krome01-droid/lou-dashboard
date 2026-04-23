"use client"

import { useState, useCallback, useRef } from "react"
import type { ChatMessage, FileAttachment, StreamEvent, ToolCallResult } from "@/lib/ai/types"

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallResult[]>([])
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number>(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const saveConversation = useCallback(
    async (msgs: ChatMessage[], convId: number | null) => {
      if (msgs.length === 0) return convId

      const firstUserMsg = msgs.find((m) => m.role === "user")
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 80)
        : "Nouvelle conversation"

      try {
        const res = await fetch("/admin-lou/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: convId, title, messages: msgs }),
        })
        if (res.ok) {
          setSaveError(null)
          const data = await res.json()
          return data.id as number
        }
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setSaveError(err.error ?? `Sauvegarde échouée (${res.status})`)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Erreur réseau sauvegarde")
      }
      return convId
    },
    [],
  )

  const sendMessage = useCallback(async (userMessage: string, attachments?: FileAttachment[]) => {
    const userMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      attachments,
      timestamp: new Date().toISOString(),
    }

    // Capture messages state before any updates (used for save after streaming)
    const messagesBeforeSend = [...messages]

    setMessages((prev) => [...prev, userMsg])
    setIsStreaming(true)
    setCurrentToolCalls([])

    // Build message history for API
    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.attachments?.length ? { attachments: m.attachments } : {}),
    }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/admin-lou/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("Pas de stream")

      const decoder = new TextDecoder()
      let assistantText = ""
      const toolCalls: ToolCallResult[] = []
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const event = JSON.parse(line) as StreamEvent

            switch (event.type) {
              case "text_delta":
                assistantText += event.content
                setMessages((prev) => {
                  const updated = [...prev]
                  const lastIdx = updated.length - 1
                  if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: assistantText,
                      toolCalls: [...toolCalls],
                    }
                  } else {
                    updated.push({
                      role: "assistant",
                      content: assistantText,
                      toolCalls: [...toolCalls],
                      timestamp: new Date().toISOString(),
                    })
                  }
                  return updated
                })
                break

              case "tool_use_start":
                toolCalls.push({
                  toolName: event.toolName,
                  toolInput: event.toolInput,
                  result: null,
                  status: "success",
                })
                setCurrentToolCalls([...toolCalls])
                break

              case "tool_result":
                const idx = toolCalls.findIndex(
                  (t) => t.toolName === event.toolName && t.result === null,
                )
                if (idx >= 0) {
                  toolCalls[idx] = {
                    ...toolCalls[idx],
                    result: event.result,
                    status: event.status,
                  }
                }
                setCurrentToolCalls([...toolCalls])
                break

              case "error":
                assistantText += `\n\n_Erreur: ${event.error}_`
                setMessages((prev) => {
                  const updated = [...prev]
                  const lastIdx = updated.length - 1
                  if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
                    updated[lastIdx] = { ...updated[lastIdx], content: assistantText }
                  } else {
                    updated.push({
                      role: "assistant",
                      content: assistantText,
                      timestamp: new Date().toISOString(),
                    })
                  }
                  return updated
                })
                break
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }

      // Final update with tool calls
      if (toolCalls.length > 0) {
        setMessages((prev) => {
          const updated = [...prev]
          const lastIdx = updated.length - 1
          if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
            updated[lastIdx] = { ...updated[lastIdx], toolCalls: [...toolCalls] }
          }
          return updated
        })
      }

      // Auto-save: build the final message list from known values to avoid
      // calling async side effects inside a setMessages updater (React anti-pattern)
      const finalMsgs: ChatMessage[] = [
        ...messagesBeforeSend,
        userMsg,
        {
          role: "assistant",
          content: assistantText,
          toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
          timestamp: new Date().toISOString(),
        },
      ]
      setTimeout(() => {
        saveConversation(finalMsgs, conversationId).then((newId) => {
          if (newId && newId !== conversationId) {
            setConversationId(newId)
          }
          setLastSavedAt(Date.now())
        })
      }, 100)
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `_Erreur de connexion: ${(err as Error).message}_`,
            timestamp: new Date().toISOString(),
          },
        ])
      }
    } finally {
      setIsStreaming(false)
      setCurrentToolCalls([])
      abortRef.current = null
    }
  }, [messages, conversationId, saveConversation])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const loadConversation = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/admin-lou/api/conversations/${id}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        setConversationId(id)
      }
    } catch {
      // Silent fail
    }
  }, [])

  const newConversation = useCallback(() => {
    setMessages([])
    setConversationId(null)
  }, [])

  return {
    messages,
    isStreaming,
    currentToolCalls,
    conversationId,
    lastSavedAt,
    saveError,
    sendMessage,
    stopStreaming,
    loadConversation,
    newConversation,
  }
}
