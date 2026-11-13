/**
 * Minimal Gemini REST client with native function-calling support.
 * Follows the same convention as /api/translate: raw fetch to
 * generativelanguage.googleapis.com using GEMINI_API_KEY /
 * NEXT_PUBLIC_GEMINI_API_KEY and NEXT_PUBLIC_GEMINI_MODEL.
 */

export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  /** Gemini 3.x requires echoing this back on functionCall parts */
  thoughtSignature?: string
}

export interface GeminiContent {
  role: 'user' | 'model' | 'function'
  parts: GeminiPart[]
}

export interface GeminiToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
const MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash'

export function isGeminiConfigured(): boolean {
  return Boolean(API_KEY)
}

export function geminiModelName(): string {
  return MODEL
}

/**
 * Single generateContent call. Returns the candidate's content parts.
 * Throws on HTTP/parse errors so the runner can degrade gracefully.
 */
export async function generateContent(
  contents: GeminiContent[],
  opts?: {
    systemInstruction?: string
    tools?: GeminiToolDeclaration[]
    temperature?: number
    maxOutputTokens?: number
  }
): Promise<GeminiPart[]> {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts?.temperature ?? 0.4,
      maxOutputTokens: opts?.maxOutputTokens ?? 8192,
    },
  }

  if (opts?.systemInstruction) {
    body.system_instruction = { parts: [{ text: opts.systemInstruction }] }
  }

  if (opts?.tools && opts.tools.length > 0) {
    body.tools = [
      {
        function_declarations: opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ]
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Gemini API error ${resp.status}: ${text.slice(0, 300)}`)
  }

  const data = await resp.json()
  const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts || []
  return parts
}

/**
 * One-shot JSON generation helper for tools that need structured output
 * (listing drafts, negotiation messages). Falls back to null on failure.
 */
export async function generateJSON<T>(prompt: string, fallback: T): Promise<T> {
  try {
    const parts = await generateContent(
      [{ role: 'user', parts: [{ text: prompt }] }],
      { temperature: 0.5, maxOutputTokens: 1200 }
    )
    const text = parts.map((p) => p.text || '').join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback
    return JSON.parse(jsonMatch[0]) as T
  } catch (err) {
    console.error('[agents/gemini] generateJSON failed:', err)
    return fallback
  }
}
