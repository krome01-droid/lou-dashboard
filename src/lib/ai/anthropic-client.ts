import Anthropic from "@anthropic-ai/sdk"
import { LOU_SYSTEM_PROMPT } from "./lou-prompt"
import { LOU_TOOLS } from "./tools"
import { executeTool } from "./tool-executor"
import type { StreamEvent, FileAttachment } from "./types"

const MODEL = "claude-sonnet-4-6"
const MAX_TOKENS = 8192
const MAX_TOOL_ROUNDS = 5

interface ChatMessage {
  role: "user" | "assistant"
  content: string | Anthropic.ContentBlock[]
  attachments?: FileAttachment[]
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"]

function buildContentBlocks(
  text: string,
  attachments?: FileAttachment[],
): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = []

  if (attachments?.length) {
    for (const att of attachments) {
      if (IMAGE_MIMES.includes(att.mimeType)) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: att.data,
          },
        })
      } else if (att.mimeType === "application/pdf") {
        blocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: att.data,
          },
        })
      } else {
        // Text files: decode base64 and prepend as text
        try {
          const decoded = Buffer.from(att.data, "base64").toString("utf-8")
          blocks.push({
            type: "text",
            text: `[Fichier: ${att.filename}]\n${decoded}`,
          })
        } catch {
          blocks.push({
            type: "text",
            text: `[Fichier: ${att.filename} — impossible de décoder]`,
          })
        }
      }
    }
  }

  if (text) {
    blocks.push({ type: "text", text })
  }

  return blocks
}

/**
 * Streams a chat response from Claude with tool_use support.
 * Returns a ReadableStream of NDJSON StreamEvent objects.
 *
 * The agentic loop:
 * 1. Send messages to Claude with tools
 * 2. Stream text deltas to the client
 * 3. If Claude calls a tool, execute it server-side
 * 4. Send tool_result back to Claude
 * 5. Continue streaming (up to MAX_TOOL_ROUNDS)
 */
export function streamChatWithTools(
  messages: ChatMessage[],
): ReadableStream<Uint8Array> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const encoder = new TextEncoder()

  function send(controller: ReadableStreamDefaultController, event: StreamEvent) {
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
  }

  return new ReadableStream({
    async start(controller) {
      try {
        let currentMessages: Anthropic.MessageParam[] = messages.map((m) => {
          if (m.role === "user" && m.attachments?.length) {
            return {
              role: m.role,
              content: buildContentBlocks(
                typeof m.content === "string" ? m.content : "",
                m.attachments,
              ),
            }
          }
          return { role: m.role, content: m.content }
        })

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: LOU_SYSTEM_PROMPT,
            messages: currentMessages,
            tools: LOU_TOOLS,
          })

          // Process content blocks, execute tools once and store results
          const toolUseBlocks: Anthropic.ToolUseBlock[] = []
          const toolResultsMap = new Map<string, { result: unknown; status: string }>()

          for (const block of response.content) {
            if (block.type === "text") {
              send(controller, { type: "text_delta", content: block.text })
            } else if (block.type === "tool_use") {
              toolUseBlocks.push(block)
              const toolInput = block.input as Record<string, unknown>

              send(controller, {
                type: "tool_use_start",
                toolName: block.name,
                toolInput,
              })

              const result = await executeTool(block.name, toolInput)
              toolResultsMap.set(block.id, result)

              send(controller, {
                type: "tool_result",
                toolName: block.name,
                result: result.result,
                status: result.status,
              })
            }
          }

          // If no tool calls, we're done
          if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
            break
          }

          // Build tool results for next round using stored results (no re-execution)
          const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(toolResultsMap.get(block.id)?.result ?? { status: "ok" }),
          }))

          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
            { role: "user", content: toolResults },
          ]
        }

        send(controller, { type: "message_stop" })
      } catch (err) {
        send(controller, {
          type: "error",
          error: err instanceof Error ? err.message : "Erreur IA inconnue",
        })
      } finally {
        controller.close()
      }
    },
  })
}
