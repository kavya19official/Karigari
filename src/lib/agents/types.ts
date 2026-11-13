/**
 * Shared types for the Karigari agentic framework.
 *
 * Agents are autonomous, tool-using LLM loops (not plain chatbots):
 * the model decides which tools to call, the runtime executes them
 * against Supabase/Gemini, feeds results back, and iterates until
 * the agent produces a final natural-language reply.
 */

export interface AgentToolContext {
  userId?: string | null
  sessionId?: string
  /** Optional product the user is currently viewing (negotiation/discovery context) */
  productId?: string | null
  /** Optional seller context */
  sellerId?: string | null
}

export interface AgentTool {
  name: string
  description: string
  /** JSON Schema for the tool parameters (Gemini functionDeclarations format) */
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<unknown>
}

export interface AgentDefinition {
  id: string
  name: string
  tagline: string
  description: string
  /** Short greeting shown before the first user message */
  welcomeMessage: string
  /** Example prompts shown as quick-start chips */
  suggestions: string[]
  systemPrompt: string
  tools: AgentTool[]
}

export interface ToolCallRecord {
  name: string
  args: Record<string, unknown>
  ok: boolean
  /** Human-readable one-line summary for the UI trace */
  summary: string
  /** Full tool result (kept small by tool design) for rich UI rendering */
  data?: unknown
  error?: string
}

export interface AgentRunResult {
  reply: string
  toolCalls: ToolCallRecord[]
  sessionId: string
  agentId: string
  /** True when the Gemini key is missing and a fallback message was returned */
  needsConfig?: boolean
}
