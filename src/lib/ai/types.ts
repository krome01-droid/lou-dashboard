export interface FileAttachment {
  filename: string
  mimeType: string
  data: string // base64
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  attachments?: FileAttachment[]
  toolCalls?: ToolCallResult[]
  timestamp?: string
}

export interface ToolCallResult {
  toolName: string
  toolInput: Record<string, unknown>
  result: unknown
  status: "success" | "error"
}

export type StreamEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_use_start"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; result: unknown; status: "success" | "error" }
  | { type: "message_stop" }
  | { type: "error"; error: string }
