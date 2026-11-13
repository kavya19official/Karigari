/**
 * Agent runner — the autonomous loop that makes Karigari agents
 * genuinely agentic rather than simple chatbots.
 *
 * Loop:  LLM → functionCall → execute tool(s) → feed results back → repeat
 * until the model produces a final text reply or MAX_STEPS is reached.
 * Conversation history is persisted in the existing conversation_history
 * table (query_context JSONB stores agent + tool trace metadata).
 */

import { supabase } from '@/lib/supabase'
import { generateContent, isGeminiConfigured, type GeminiContent, type GeminiPart } from './gemini'
import { agentTools } from './tools'
import type { AgentDefinition } from './types'
import type { AgentRunResult, AgentToolContext, ToolCallRecord } from './types'

const MAX_STEPS = 6
const HISTORY_LIMIT = 10

interface StoredMessage {
  role: 'user' | 'assistant'
  message: string
}

async function loadHistory(userId: string | null | undefined, sessionId: string): Promise<StoredMessage[]> {
  if (!userId) return []
  try {
    const { data } = await supabase
      .from('conversation_history')
      .select('role, message')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    return ((data || []) as StoredMessage[]).reverse()
  } catch {
    return []
  }
}

async function persistExchange(
  userId: string | null | undefined,
  sessionId: string,
  agentId: string,
  userMessage: string,
  reply: string,
  toolCalls: ToolCallRecord[]
) {
  if (!userId) return
  try {
    await supabase.from('conversation_history').insert([
      {
        user_id: userId,
        session_id: sessionId,
        role: 'user',
        message: userMessage,
        query_context: { agent: agentId },
      },
      {
        user_id: userId,
        session_id: sessionId,
        role: 'assistant',
        message: reply,
        query_context: {
          agent: agentId,
          toolCalls: toolCalls.map((t) => ({ name: t.name, ok: t.ok, summary: t.summary })),
        },
      },
    ])
  } catch (err) {
    console.error('[agents/runner] failed to persist conversation:', err)
  }
}

function summarizeResult(name: string, data: unknown): string {
  if (!data || typeof data !== 'object') return String(data ?? '').slice(0, 80)
  const d = data as Record<string, unknown>
  if (d.error) return `error: ${d.error}`
  if (Array.isArray(d.products)) return `found ${d.products.length} product(s)`
  if (Array.isArray(d.similar)) return `found ${d.similar.length} similar item(s)`
  if (d.count !== undefined) return `${d.count} result(s)`
  if (d.draft) return 'generated listing draft'
  if (d.message) return 'drafted message'
  if (d.verdict) return `verdict: ${d.verdict}`
  if (Array.isArray(d.categories)) return `${d.categories.length} categories analyzed`
  if (d.sales_last_90d) return 'sales stats computed'
  return `${name} completed`
}

export async function runAgent(
  agent: AgentDefinition,
  message: string,
  ctx: AgentToolContext & { contextNote?: string }
): Promise<AgentRunResult> {
  const sessionId = ctx.sessionId || crypto.randomUUID()

  if (!isGeminiConfigured()) {
    return {
      reply:
        'The AI agents are not configured yet. Please add GEMINI_API_KEY (or NEXT_PUBLIC_GEMINI_API_KEY) to your environment variables and restart the server.',
      toolCalls: [],
      sessionId,
      agentId: agent.id,
      needsConfig: true,
    }
  }

  const toolCtx: AgentToolContext = {
    userId: ctx.userId,
    sessionId,
    productId: ctx.productId,
    sellerId: ctx.sellerId,
  }

  // Build conversation: persisted history + current message (+ page context)
  const history = await loadHistory(ctx.userId, sessionId)
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.message }],
  }))

  let userText = message
  if (ctx.contextNote) {
    userText += `\n\n[Context: ${ctx.contextNote}]`
  }
  contents.push({ role: 'user', parts: [{ text: userText }] })

  const declarations = agent.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

  const toolCalls: ToolCallRecord[] = []
  let finalParts: GeminiPart[] = []

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const parts = await generateContent(contents, {
        systemInstruction: agent.systemPrompt,
        tools: declarations,
        temperature: 0.4,
        maxOutputTokens: 2048,
      })

      const calls = parts.filter((p) => p.functionCall)

      if (calls.length === 0) {
        finalParts = parts
        break
      }

      // Record model turn (text + function calls) and append tool responses.
      // Drop any non-text/non-function parts (e.g. thought signatures).
      const modelParts: GeminiPart[] = parts
        .filter((p) => p.functionCall || p.text)
        .map((p) => {
          const np: GeminiPart = {}
          if (p.functionCall) np.functionCall = p.functionCall
          if (p.text) np.text = p.text
          // Gemini 3.x models require the thought signature to be echoed back
          if (p.thoughtSignature) np.thoughtSignature = p.thoughtSignature
          return np
        })
      contents.push({ role: 'model', parts: modelParts })

      const responses: GeminiPart[] = []
      for (const call of calls) {
        const fn = call.functionCall!
        const tool = agentTools[fn.name]
        const record: ToolCallRecord = {
          name: fn.name,
          args: (fn.args || {}) as Record<string, unknown>,
          ok: false,
          summary: '',
        }

        if (!tool || !agent.tools.includes(tool)) {
          record.summary = 'tool not available to this agent'
          record.error = 'unknown_tool'
          responses.push({
            functionResponse: {
              name: fn.name,
              response: { error: 'This tool is not available to you.' },
            },
          })
          toolCalls.push(record)
          continue
        }

        try {
          const result = await tool.execute((fn.args || {}) as Record<string, unknown>, toolCtx)
          record.ok = true
          record.data = result
          record.summary = summarizeResult(fn.name, result)
          responses.push({
            functionResponse: {
              name: fn.name,
              response: { result: JSON.stringify(result).slice(0, 12000) },
            },
          })
        } catch (err) {
          record.summary = `failed: ${err instanceof Error ? err.message : 'error'}`
          record.error = record.summary
          responses.push({
            functionResponse: {
              name: fn.name,
              response: { error: record.summary },
            },
          })
        }
        toolCalls.push(record)
      }

      // Newer Gemini models reject the legacy 'function' role; function
      // responses are accepted inside a regular 'user' turn.
      contents.push({ role: 'user', parts: responses })

      // If this was the last allowed step, do one final text-only call
      if (step === MAX_STEPS - 1) {
        const finalPartsRetry = await generateContent(contents, {
          systemInstruction: agent.systemPrompt,
          temperature: 0.4,
          maxOutputTokens: 8192,
        })
        finalParts = finalPartsRetry
      }
    }
  } catch (err) {
    console.error(`[agents/runner] ${agent.id} failed:`, err)
    await persistExchange(ctx.userId, sessionId, agent.id, message, '', toolCalls)
    return {
      reply: `Sorry, I ran into an error while working on that: ${err instanceof Error ? err.message : 'unknown error'}. Please try again.`,
      toolCalls,
      sessionId,
      agentId: agent.id,
    }
  }

  const reply = finalParts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('')
    .trim()

  const safeReply =
    reply ||
    (toolCalls.length > 0
      ? 'I completed the requested actions — see the results above.'
      : 'I wasn\'t able to produce a response. Could you rephrase your request?')

  await persistExchange(ctx.userId, sessionId, agent.id, message, safeReply, toolCalls)

  return { reply: safeReply, toolCalls, sessionId, agentId: agent.id }
}
