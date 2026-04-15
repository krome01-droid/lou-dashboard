"use client"

import { useState, useRef, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Square, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react"
import type { FileAttachment } from "@/lib/ai/types"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_FILES = 3
const ACCEPTED_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.md,.csv"

interface ChatInputProps {
  onSend: (message: string, attachments?: FileAttachment[]) => void
  onStop?: () => void
  isStreaming: boolean
  disabled?: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip "data:...;base64," prefix
      const base64 = result.split(",")[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit() {
    const trimmed = value.trim()
    if ((!trimmed && files.length === 0) || isStreaming) return

    let attachments: FileAttachment[] | undefined
    if (files.length > 0) {
      attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          mimeType: f.type || "application/octet-stream",
          data: await fileToBase64(f),
        })),
      )
    }

    onSend(trimmed || "(fichier joint)", attachments)
    setValue("")
    setFiles([])
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? [])
    const valid = newFiles.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        alert(`${f.name} dépasse 5 Mo`)
        return false
      }
      return true
    })
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES))
    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const isImage = (mime: string) => mime.startsWith("image/")

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto max-w-3xl">
        {/* File previews */}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
              >
                {isImage(f.type) ? (
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="max-w-[120px] truncate">{f.name}</span>
                <span className="text-muted-foreground">({formatSize(f.size)})</span>
                <button onClick={() => removeFile(i)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Paperclip button */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming || files.length >= MAX_FILES}
            className="shrink-0"
            title="Joindre un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Demander à LOU..."
            disabled={disabled}
            rows={1}
            className="min-h-[40px] max-h-[160px] resize-none"
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="outline"
              onClick={onStop}
              className="shrink-0"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={(!value.trim() && files.length === 0) || disabled}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
