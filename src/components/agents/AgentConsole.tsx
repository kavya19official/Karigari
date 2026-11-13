'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Bot, Sparkles, Search, Handshake, BarChart3, ShoppingBag, Send, Loader2,
  Wrench, ChevronDown, ChevronUp, Copy, Check, X, Package, TrendingUp,
  AlertCircle, ExternalLink,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { AgentRunResult } from '@/lib/agents/types'

// ---------------------------------------------------------------------------
// Types mirrored from the API (client-safe subset)
// ---------------------------------------------------------------------------

interface AgentMeta {
  id: string
  name: string
  tagline: string
  description: string
  welcomeMessage: string
  suggestions: string[]
}

interface ToolCall {
  name: string
  args: Record<string, unknown>
  ok: boolean
  summary: string
  data?: unknown
  error?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  toolCalls?: ToolCall[]
  agentId?: string
  timestamp: Date
}

interface ProductSummary {
  id: string
  title: string
  price: number
  category?: string
  image_url?: string
  seller_name?: string | null
  description?: string
}

const AGENTS: AgentMeta[] = [
  {
    id: 'buyer', name: 'Buyer Agent', tagline: 'Personal shopping assistant',
    description: 'Understands your taste, searches the bazaar, compares prices and recommends handcrafted pieces.',
    welcomeMessage: 'Namaste! I\'m your Buyer Agent. Tell me what you\'re looking for — an occasion, a style, a budget — and I\'ll search the bazaar and recommend the best pieces.',
    suggestions: ['Find me a blue pottery vase under ₹2000 for a wedding gift', 'Show me block-print textiles for home decor', 'What handmade jewelry suits a festive outfit?'],
  },
  {
    id: 'artisan', name: 'Artisan Agent', tagline: 'Listing & pricing copilot',
    description: 'Turns a photo or idea into a polished listing with market-grounded pricing.',
    welcomeMessage: 'Namaste karigar! Share a photo URL or describe your craft — I\'ll help you create a compelling listing with smart pricing.',
    suggestions: ['Help me price my handmade ceramic bowls', 'Write a listing description for my silk scarf', 'What tags should I use for bamboo baskets?'],
  },
  {
    id: 'discovery', name: 'Discovery Agent', tagline: 'Buyer–artisan matchmaker',
    description: 'Matches buyers with artisans by preferences, budget and craft — with reasons why.',
    welcomeMessage: 'I\'m the Discovery Agent — your curator of the bazaar. Describe the vibe or occasion you love and I\'ll find matching artisans and products.',
    suggestions: ['Match me with pottery artisans from Rajasthan', 'Find pieces blending traditional craft with modern homes', 'Who makes wooden carved decor under ₹3000?'],
  },
  {
    id: 'negotiation', name: 'Negotiation Agent', tagline: 'Fair-price deal maker',
    description: 'Benchmarks offers against real market data and drafts fair counter messages.',
    welcomeMessage: 'Give me a product and an offer — I\'ll benchmark it against real comparable sales and help you reach a fair deal.',
    suggestions: ['Is ₹1200 a fair offer for this product?', 'Help me negotiate for the blue pottery vase', 'Draft a polite message offering ₹1800'],
  },
  {
    id: 'bi', name: 'Business Intelligence Agent', tagline: 'Demand & trend analyst',
    description: 'Turns marketplace data into demand trends, pricing gaps and sales opportunities.',
    welcomeMessage: 'I analyze live marketplace data — demand, pricing and seller performance — to surface trends and opportunities.',
    suggestions: ['Which categories are growing fastest?', 'Where is there unmet demand for artisans?', 'How is my shop performing?'],
  },
]

const AGENT_ICONS: Record<string, React.ReactNode> = {
  buyer: <ShoppingBag className="w-4 h-4" />,
  artisan: <Sparkles className="w-4 h-4" />,
  discovery: <Search className="w-4 h-4" />,
  negotiation: <Handshake className="w-4 h-4" />,
  bi: <BarChart3 className="w-4 h-4" />,
}

// ---------------------------------------------------------------------------
// Rich tool-result renderers
// ---------------------------------------------------------------------------

function ProductGrid({ products }: { products: ProductSummary[] }) {
  if (!products.length) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
      {products.slice(0, 6).map((p) => (
        <Link
          key={p.id}
          href={`/product/${p.id}`}
          className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-2)] overflow-hidden hover:border-heritage-gold/60 transition-colors"
        >
          <div className="h-20 bg-[var(--bg-3)] flex items-center justify-center overflow-hidden">
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            ) : (
              <Package className="w-6 h-6 text-[var(--muted)]" />
            )}
          </div>
          <div className="p-2">
            <p className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-tight">{p.title}</p>
            <p className="text-xs font-bold text-heritage-gold mt-1">₹{p.price?.toLocaleString('en-IN')}</p>
            {p.seller_name && <p className="text-[10px] text-[var(--muted)] truncate">by {p.seller_name}</p>}
          </div>
        </Link>
      ))}
    </div>
  )
}

function StatCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const interesting = Object.entries(data).filter(
    ([k]) => !['products', 'similar', 'catalog', 'comparables', 'top_products', 'slow_movers', 'sample_products'].includes(k)
  )
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-3 mt-2 text-xs">
      <p className="font-semibold text-[var(--text)] mb-1.5 flex items-center gap-1">
        <TrendingUp className="w-3.5 h-3.5 text-heritage-gold" /> {title}
      </p>
      <dl className="space-y-1">
        {interesting.slice(0, 10).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-[var(--muted)] capitalize">{k.replace(/_/g, ' ')}</dt>
            <dd className="text-[var(--text)] font-medium text-right">
              {typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function ListingDraftCard({ draft, userId }: { draft: Record<string, unknown>; userId?: string }) {
  const [state, setState] = useState<'idle' | 'creating' | 'done' | 'error'>('idle')
  const price = Number(draft.price_max) || Number(draft.price_min) || 0

  const create = async () => {
    if (!userId) return
    setState('creating')
    try {
      const res = await fetch('/api/marketplace/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: userId,
          title: draft.title,
          description: draft.description,
          category: draft.category || 'Handicraft',
          price,
          image_url: draft.image_url || 'https://via.placeholder.com/600x400?text=Karigari',
          product_story: draft.pricing_reasoning || null,
        }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-xl border border-heritage-gold/40 bg-gradient-to-br from-heritage-gold/5 to-transparent p-3 mt-2">
      <p className="text-xs font-bold text-heritage-gold mb-1">Listing draft ready</p>
      <p className="text-sm font-semibold text-[var(--text)]">{String(draft.title || '')}</p>
      <p className="text-xs text-[var(--muted)] mt-1 line-clamp-3">{String(draft.description || '')}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {Array.isArray(draft.tags) && (draft.tags as string[]).slice(0, 6).map((t) => (
          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-3)] text-[var(--muted)]">#{t}</span>
        ))}
      </div>
      {Boolean(draft.pricing_reasoning) && (
        <p className="text-[11px] text-[var(--muted)] mt-2 italic">₹{price.toLocaleString('en-IN')} — {String(draft.pricing_reasoning)}</p>
      )}
      {userId && state !== 'done' && (
        <button
          onClick={create}
          disabled={state === 'creating'}
          className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-heritage-gold text-black hover:opacity-90 disabled:opacity-50"
        >
          {state === 'creating' ? 'Creating…' : 'Create this listing'}
        </button>
      )}
      {state === 'done' && <p className="mt-2 text-xs text-green-500 font-semibold">Listing created — find it in your dashboard!</p>}
      {state === 'error' && <p className="mt-2 text-xs text-red-500">Failed to create listing.</p>}
      {!userId && <p className="mt-2 text-[11px] text-[var(--muted)]">Log in as a seller to publish this listing.</p>}
    </div>
  )
}

function NegotiationCard({ data, onCopy }: { data: Record<string, unknown>; onCopy: (t: string) => void }) {
  const verdictColors: Record<string, string> = {
    strong: 'text-green-500', fair: 'text-heritage-gold', low: 'text-orange-500', too_low: 'text-red-500',
  }
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-3 mt-2 text-xs space-y-1.5">
      {Boolean(data.product) && typeof data.product === 'object' && (
        <p className="font-semibold text-[var(--text)]">{(data.product as ProductSummary).title}</p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex justify-between"><span className="text-[var(--muted)]">Offer</span><span className="font-medium">₹{Number(data.offer_amount || 0).toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between"><span className="text-[var(--muted)]">Asking</span><span className="font-medium">₹{Number(data.asking_price || 0).toLocaleString('en-IN')}</span></div>
        {data.suggested_counter_inr != null && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">Suggested counter</span><span className="font-bold text-heritage-gold">₹{Number(data.suggested_counter_inr).toLocaleString('en-IN')}</span></div>
        )}
        {Boolean(data.verdict) && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">Verdict</span><span className={`font-bold capitalize ${verdictColors[String(data.verdict)] || ''}`}>{String(data.verdict).replace('_', ' ')}</span></div>
        )}
      </div>
      {Boolean(data.reasoning) && <p className="text-[var(--muted)] italic pt-1">{String(data.reasoning)}</p>}
      {typeof data.message === 'string' && data.message && (
        <button onClick={() => onCopy(data.message as string)} className="flex items-center gap-1 text-heritage-gold font-semibold pt-1">
          <Copy className="w-3 h-3" /> Copy drafted message
        </button>
      )}
    </div>
  )
}

function ToolTrace({ calls }: { calls: ToolCall[] }) {
  const [open, setOpen] = useState(false)
  if (!calls.length) return null
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-heritage-gold transition-colors">
        <Wrench className="w-3 h-3" />
        Agent used {calls.length} tool{calls.length > 1 ? 's' : ''}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {calls.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] bg-[var(--bg-2)] rounded-lg px-2 py-1.5 border border-[var(--border)]">
              {c.ok ? <Check className="w-3 h-3 text-green-500 mt-0.5 shrink-0" /> : <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />}
              <div>
                <span className="font-mono font-semibold text-heritage-gold">{c.name}</span>
                <span className="text-[var(--muted)]"> — {c.summary}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Extract and render rich cards from tool call results. */
function ToolResults({ calls, userId, onCopy }: { calls: ToolCall[]; userId?: string; onCopy: (t: string) => void }) {
  const nodes: React.ReactNode[] = []

  calls.forEach((c, i) => {
    const d = c.data as Record<string, unknown> | undefined
    if (!d || typeof d !== 'object') return

    // Product collections
    const products: ProductSummary[] = [
      ...(Array.isArray(d.products) ? (d.products as ProductSummary[]) : []),
      ...(Array.isArray(d.similar) ? (d.similar as ProductSummary[]) : []),
      ...(d.product && typeof d.product === 'object' ? [d.product as ProductSummary] : []),
    ]
    const unique = [...new Map(products.map((p) => [p.id, p])).values()]
    if (unique.length) nodes.push(<ProductGrid key={`p${i}`} products={unique} />)

    // Listing draft
    if (d.draft && typeof d.draft === 'object') {
      nodes.push(<ListingDraftCard key={`d${i}`} draft={d.draft as Record<string, unknown>} userId={userId} />)
    }

    // Negotiation analysis
    if (d.verdict || d.suggested_counter_inr != null) {
      nodes.push(<NegotiationCard key={`n${i}`} data={d} onCopy={onCopy} />)
    }

    // Stats-ish tools (only when no richer renderer handled it)
    const statTools = ['get_price_benchmark', 'get_category_stats', 'get_market_trends', 'get_seller_insights', 'analyze_offer', 'analyze_product_image']
    if (statTools.includes(c.name) && !d.verdict) {
      const { stats, price_stats, market, sales_last_90d, categories, catalog_summary, analysis, ...rest } = d
      const merged: Record<string, unknown> = { ...rest }
      if (stats) merged.price_stats = stats
      if (price_stats) merged.price_stats = price_stats
      if (market) Object.assign(merged, { market })
      if (sales_last_90d) merged.sales_last_90d = sales_last_90d
      if (catalog_summary) merged.catalog_summary = catalog_summary
      if (categories) merged.top_categories = (categories as any[]).slice(0, 5)
      if (analysis) merged.vision_analysis = analysis
      nodes.push(<StatCard key={`s${i}`} title={c.name.replace(/_/g, ' ')} data={merged} />)
    }
  })

  if (!nodes.length) return null
  return <div>{nodes}</div>
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AgentConsole() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [activeAgent, setActiveAgent] = useState('buyer')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [contextProduct, setContextProduct] = useState<{ id: string; title: string; seller_id?: string } | null>(null)
  const sessionIds = useRef<Record<string, string>>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  const agent = AGENTS.find((a) => a.id === activeAgent)!

  // Optional ?product=<id> context (e.g. from a product page)
  useEffect(() => {
    const pid = searchParams.get('product')
    if (!pid) return
    supabase
      .from('products')
      .select('id, title, seller_id')
      .eq('id', pid)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setContextProduct(data as any)
      })
  }, [searchParams])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const switchAgent = (id: string) => {
    setActiveAgent(id)
    setMessages([])
    setInput('')
  }

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return
      setInput('')
      setLoading(true)

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: trimmed, timestamp: new Date() }
      setMessages((m) => [...m, userMsg])

      try {
        const res = await fetch('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: activeAgent,
            message: trimmed,
            userId: user?.id || null,
            sessionId: sessionIds.current[activeAgent],
            context: contextProduct
              ? { productId: contextProduct.id, sellerId: contextProduct.seller_id }
              : undefined,
          }),
        })
        const data: AgentRunResult & { error?: string } = await res.json()
        if (!res.ok) throw new Error(data.error || 'Agent request failed')

        if (data.sessionId) sessionIds.current[activeAgent] = data.sessionId

        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'agent',
            text: data.reply,
            toolCalls: data.toolCalls,
            agentId: activeAgent,
            timestamp: new Date(),
          },
        ])
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'agent',
            text: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'unknown error'}. Please try again.`,
            timestamp: new Date(),
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [activeAgent, loading, user?.id, contextProduct]
  )

  const copyText = (t: string) => {
    navigator.clipboard.writeText(t).catch(() => {})
    setCopied(t)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[560px] max-w-5xl mx-auto w-full">
      {/* Agent selector */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => switchAgent(a.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-all ${
              activeAgent === a.id
                ? 'bg-heritage-gold/15 border-heritage-gold text-heritage-gold'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-heritage-gold/50 hover:text-[var(--text)]'
            }`}
          >
            {AGENT_ICONS[a.id]}
            {a.name}
          </button>
        ))}
      </div>

      {/* Agent description + context */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[var(--text)] flex items-center gap-2">
              <Bot className="w-5 h-5 text-heritage-gold" /> {agent.name}
              <span className="text-xs font-normal text-[var(--muted)]">— {agent.tagline}</span>
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">{agent.description}</p>
          </div>
          {contextProduct && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-heritage-gold/10 border border-heritage-gold/40 text-heritage-gold flex items-center gap-1">
                <Package className="w-3 h-3" /> Context: {contextProduct.title.slice(0, 30)}
                <button onClick={() => setContextProduct(null)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-heritage-gold/15 flex items-center justify-center shrink-0 text-heritage-gold">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--text)] max-w-[85%]">
                {agent.welcomeMessage}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-11">
              {agent.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-heritage-gold/60 hover:text-heritage-gold transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              m.role === 'user' ? 'bg-[var(--bg-3)] text-[var(--muted)]' : 'bg-heritage-gold/15 text-heritage-gold'
            }`}>
              {m.role === 'user' ? <span className="text-xs font-bold">{(user?.email?.[0] || 'U').toUpperCase()}</span> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[85%] space-y-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-heritage-gold text-black rounded-tr-sm'
                  : 'bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text)] rounded-tl-sm'
              }`}>
                {m.text}
              </div>
              {m.toolCalls && (
                <>
                  <ToolTrace calls={m.toolCalls} />
                  <ToolResults calls={m.toolCalls} userId={user?.id} onCopy={copyText} />
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-heritage-gold/15 flex items-center justify-center text-heritage-gold shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Agent is working…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[var(--card)] border border-heritage-gold/50 text-heritage-gold text-xs px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Copied to clipboard
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="flex gap-2 mt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask the ${agent.name}…`}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-heritage-gold/60"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 rounded-xl bg-heritage-gold text-black font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
      <p className="text-[10px] text-[var(--muted)] mt-2 text-center flex items-center justify-center gap-1">
        <ExternalLink className="w-3 h-3" /> Agents use live marketplace tools — every claim is grounded in real data.
      </p>
    </div>
  )
}
