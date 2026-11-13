import { NextResponse } from 'next/server'
import { getAgent, agentSummaries } from '@/lib/agents/agents'
import { runAgent } from '@/lib/agents/runner'
import { isGeminiConfigured } from '@/lib/agents/gemini'

/**
 * POST /api/agents/run
 * Body: {
 *   agentId: 'buyer' | 'artisan' | 'discovery' | 'negotiation' | 'bi',
 *   message: string,
 *   userId?: string,
 *   sessionId?: string,
 *   context?: { productId?: string, sellerId?: string }
 * }
 *
 * Runs the autonomous agent loop (LLM + tool calls) and returns the
 * final reply plus the full tool-call trace for rich UI rendering.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { agentId, message, userId, sessionId, context } = body || {}

    if (!agentId || !message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'agentId and message are required' }, { status: 400 })
    }

    const agent = getAgent(String(agentId))
    if (!agent) {
      return NextResponse.json(
        { error: `Unknown agent. Available: ${agentSummaries().map((a) => a.id).join(', ')}` },
        { status: 400 }
      )
    }

    if (message.length > 4000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Build a human-readable context note for the model when the user is
    // viewing a specific product or seller page.
    let contextNote: string | undefined
    if (context?.productId || context?.sellerId) {
      contextNote = `The user is currently viewing ${
        context.productId ? `product ${context.productId}` : ''
      }${context.productId && context.sellerId ? ' sold by ' : ''}${
        context.sellerId ? `seller ${context.sellerId}` : ''
      }. Prefer this as the default subject when the request is ambiguous.`
    }

    const result = await runAgent(agent, message.trim(), {
      userId: userId || null,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      productId: context?.productId || null,
      sellerId: context?.sellerId || null,
      contextNote,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/agents/run] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Agent run failed' },
      { status: 500 }
    )
  }
}

/** GET /api/agents/run — list available agents (for tooling/debugging). */
export async function GET() {
  return NextResponse.json({
    configured: isGeminiConfigured(),
    agents: agentSummaries(),
  })
}
