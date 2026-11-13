/**
 * Tool implementations for Karigari agents.
 *
 * Every tool is a real function the LLM can invoke autonomously.
 * They read/write live Supabase data and call Gemini where needed.
 * Results are intentionally compact (summaries + small arrays) so the
 * agent loop and the UI trace stay fast.
 */

import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embedding-service'
import { generateJSON } from './gemini'
import type { AgentTool } from './types'

type ProductRow = {
  id: string
  seller_id: string
  title: string
  category: string
  description: string
  price: number
  image_url: string
  created_at: string
  is_virtual?: boolean | null
  product_story?: string | null
}

const MAX_RESULTS = 12

function summarizeProduct(p: ProductRow & { seller_name?: string | null }) {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    category: p.category,
    image_url: p.image_url,
    seller_id: p.seller_id,
    seller_name: p.seller_name || null,
    description: (p.description || '').slice(0, 220),
    is_virtual: Boolean(p.is_virtual),
    created_at: p.created_at,
  }
}

async function attachSellerNames(products: ProductRow[]) {
  const ids = [...new Set(products.map((p) => p.seller_id).filter(Boolean))]
  if (ids.length === 0) return products as (ProductRow & { seller_name?: string | null })[]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', ids)
  const nameMap = new Map((profiles || []).map((pr: any) => [pr.id, pr.name]))
  return products.map((p) => ({ ...p, seller_name: nameMap.get(p.seller_id) || null }))
}

/** Semantic + keyword product search, shared by several agents. */
async function searchProducts(args: {
  query: string
  category?: string
  min_price?: number
  max_price?: number
  limit?: number
}) {
  const limit = Math.min(args.limit || 8, MAX_RESULTS)
  const results = new Map<string, ProductRow & { similarity?: number }>()

  try {
    const embedding = await generateEmbedding(args.query)
    const { data } = await supabase.rpc('match_products', {
      query_embedding: embedding,
      match_threshold: 0.25,
      match_count: 50,
    })
    for (const row of (data || []) as any[]) {
      results.set(row.id, row)
    }
  } catch (err) {
    console.error('[agents/tools] semantic search failed:', err)
  }

  // Keyword fallback / enrichment
  const words = args.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 5)
  if (words.length > 0) {
    const orQuery = words
      .map((w) => `title.ilike.%${w}%,description.ilike.%${w}%,category.ilike.%${w}%`)
      .join(',')
    const { data } = await supabase.from('products').select('*').or(orQuery).limit(30)
    for (const row of (data || []) as ProductRow[]) {
      if (!results.has(row.id)) results.set(row.id, row)
    }
  }

  let list = [...results.values()] as (ProductRow & { similarity?: number })[]

  if (args.category) {
    const cat = args.category.toLowerCase()
    list = list.filter((p) => (p.category || '').toLowerCase().includes(cat))
  }
  if (typeof args.min_price === 'number') list = list.filter((p) => p.price >= args.min_price!)
  if (typeof args.max_price === 'number') list = list.filter((p) => p.price <= args.max_price!)

  list = list
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, limit)

  const enriched = await attachSellerNames(list as ProductRow[])
  return enriched.map(summarizeProduct)
}

function priceStats(prices: number[]) {
  if (prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const sum = prices.reduce((a, b) => a + b, 0)
  const avg = sum / prices.length
  return {
    count: prices.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(avg),
    median: sorted[Math.floor(sorted.length / 2)],
  }
}

async function benchmarkForCategory(category: string, excludeProductId?: string) {
  const q = supabase.from('products').select('id, price, title').ilike('category', `%${category}%`)
  const { data } = await q.limit(200)
  const rows = ((data || []) as any[]).filter((p) => p.id !== excludeProductId)
  return {
    products: rows.map((p) => ({ id: p.id, title: p.title, price: p.price })),
    stats: priceStats(rows.map((p) => p.price)),
  }
}

export const agentTools: Record<string, AgentTool> = {
  // ------------------------------------------------------------------
  // Discovery / retrieval tools
  // ------------------------------------------------------------------
  search_products: {
    name: 'search_products',
    description:
      'Search the Karigari marketplace for handcrafted products using semantic + keyword matching. Supports category, price range and result limit filters. Returns product cards with id, title, price, category, seller and image.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language description of what the user wants, e.g. "blue pottery vase for wedding gift under 2000"' },
        category: { type: 'string', description: 'Optional category filter, e.g. Pottery, Textile, Jewelry, Woodwork' },
        min_price: { type: 'number', description: 'Optional minimum price in INR' },
        max_price: { type: 'number', description: 'Optional maximum price in INR' },
        limit: { type: 'number', description: 'Max results, default 8' },
      },
      required: ['query'],
    },
    async execute(args) {
      const products = await searchProducts(args as any)
      return { count: products.length, products }
    },
  },

  get_product_details: {
    name: 'get_product_details',
    description: 'Get full details for one product including seller info, story and price. Use before recommending, negotiating or analyzing a specific item.',
    parameters: {
      type: 'object',
      properties: { product_id: { type: 'string', description: 'Product UUID' } },
      required: ['product_id'],
    },
    async execute(args) {
      const { data: p } = await supabase
        .from('products')
        .select('*')
        .eq('id', String(args.product_id))
        .maybeSingle()
      if (!p) return { error: 'Product not found' }
      const enriched = await attachSellerNames([p as ProductRow])
      const prod = enriched[0]
      const { data: seller } = await supabase
        .from('profiles')
        .select('id, name, bio, store_description')
        .eq('id', prod.seller_id)
        .maybeSingle()
      return {
        product: summarizeProduct(prod),
        full_description: prod.description,
        product_story: prod.product_story || null,
        seller: seller || null,
      }
    },
  },

  find_similar_products: {
    name: 'find_similar_products',
    description: 'Find products semantically similar to a given product (same craft style, use-case or aesthetic). Used for alternatives and negotiation benchmarks.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['product_id'],
    },
    async execute(args, ctx) {
      const productId = String(args.product_id || ctx.productId || '')
      if (!productId) return { error: 'product_id is required' }
      const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle()
      if (!p) return { error: 'Product not found' }
      const text = `${p.title}. ${p.description || ''} ${p.category || ''}`
      const embedding = await generateEmbedding(text)
      const { data } = await supabase.rpc('match_products', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 30,
      })
      const rows = ((data || []) as any[]).filter((r) => r.id !== productId).slice(0, Number(args.limit) || 6)
      const enriched = await attachSellerNames(rows as ProductRow[])
      return { product_id: productId, similar: enriched.map(summarizeProduct) }
    },
  },

  // ------------------------------------------------------------------
  // Market intelligence tools
  // ------------------------------------------------------------------
  get_category_stats: {
    name: 'get_category_stats',
    description: 'Get pricing and demand statistics for a product category: count, avg/min/max/median price, units sold and revenue in the last 90 days.',
    parameters: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Category name, e.g. Pottery' } },
      required: ['category'],
    },
    async execute(args) {
      const category = String(args.category)
      const { data: products } = await supabase
        .from('products')
        .select('id, title, price, seller_id')
        .ilike('category', `%${category}%`)
        .limit(300)
      const rows = (products || []) as any[]
      const stats = priceStats(rows.map((p) => p.price))

      // Sales last 90 days via orders -> order_items
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .gte('created_at', since)
        .limit(1000)
      const orderIds = (orders || []).map((o: any) => o.id)
      let units = 0
      let revenue = 0
      if (orderIds.length > 0) {
        const productIds = new Set(rows.map((p) => p.id))
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, quantity, price')
          .in('order_id', orderIds)
          .limit(2000)
        for (const it of (items || []) as any[]) {
          if (productIds.has(it.product_id)) {
            units += it.quantity || 1
            revenue += (it.price || 0) * (it.quantity || 1)
          }
        }
      }

      return {
        category,
        product_count: rows.length,
        price_stats: stats,
        sales_last_90d: { units, revenue_inr: Math.round(revenue) },
        sample_products: rows.slice(0, 8).map((p) => ({ id: p.id, title: p.title, price: p.price })),
      }
    },
  },

  get_market_trends: {
    name: 'get_market_trends',
    description:
      'Get marketplace-wide demand trends: per-category product counts, units sold and revenue over the last 90 days, plus fastest-growing categories. Use for opportunity spotting and BI insights.',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const { data: products } = await supabase.from('products').select('id, category, price').limit(1000)
      const prods = (products || []) as any[]
      const byCat = new Map<string, { count: number; prices: number[] }>()
      for (const p of prods) {
        const cat = p.category || 'Uncategorized'
        const e = byCat.get(cat) || { count: 0, prices: [] }
        e.count += 1
        e.prices.push(p.price || 0)
        byCat.set(cat, e)
      }

      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: orders } = await supabase.from('orders').select('id').gte('created_at', since).limit(2000)
      const orderIds = (orders || []).map((o: any) => o.id)
      const salesByCat = new Map<string, { units: number; revenue: number }>()
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, quantity, price')
          .in('order_id', orderIds)
          .limit(5000)
        const prodCat = new Map(prods.map((p) => [p.id, p.category || 'Uncategorized']))
        for (const it of (items || []) as any[]) {
          const cat = prodCat.get(it.product_id) || 'Uncategorized'
          const e = salesByCat.get(cat) || { units: 0, revenue: 0 }
          e.units += it.quantity || 1
          e.revenue += (it.price || 0) * (it.quantity || 1)
          salesByCat.set(cat, e)
        }
      }

      const categories = [...byCat.entries()].map(([category, v]) => {
        const s = salesByCat.get(category) || { units: 0, revenue: 0 }
        return {
          category,
          product_count: v.count,
          avg_price: priceStats(v.prices)?.avg ?? 0,
          units_sold_90d: s.units,
          revenue_90d: Math.round(s.revenue),
        }
      })
      categories.sort((a, b) => b.revenue_90d - a.revenue_90d)

      return {
        total_products: prods.length,
        total_orders_90d: orderIds.length,
        categories: categories.slice(0, 15),
      }
    },
  },

  get_seller_insights: {
    name: 'get_seller_insights',
    description:
      'Get sales and catalog insights for an artisan/seller: their products, pricing, units sold and revenue over the last 90 days, plus bestsellers. If seller_id is omitted, uses the logged-in user.',
    parameters: {
      type: 'object',
      properties: { seller_id: { type: 'string', description: 'Seller profile UUID (optional)' } },
    },
    async execute(args, ctx) {
      const sellerId = String(args.seller_id || ctx.sellerId || ctx.userId || '')
      if (!sellerId) return { error: 'seller_id is required (or log in as the seller)' }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, bio, store_description')
        .eq('id', sellerId)
        .maybeSingle()
      const { data: products } = await supabase
        .from('products')
        .select('id, title, category, price, created_at')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(100)

      const prods = (products || []) as any[]
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: orders } = await supabase.from('orders').select('id').gte('created_at', since).limit(2000)
      const orderIds = (orders || []).map((o: any) => o.id)
      const sales = new Map<string, { units: number; revenue: number }>()
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, quantity, price')
          .eq('seller_id', sellerId)
          .in('order_id', orderIds)
          .limit(2000)
        for (const it of (items || []) as any[]) {
          const e = sales.get(it.product_id) || { units: 0, revenue: 0 }
          e.units += it.quantity || 1
          e.revenue += (it.price || 0) * (it.quantity || 1)
          sales.set(it.product_id, e)
        }
      }

      const catalog = prods.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        price: p.price,
        units_sold_90d: sales.get(p.id)?.units || 0,
        revenue_90d: Math.round(sales.get(p.id)?.revenue || 0),
      }))
      const totalRevenue = catalog.reduce((a, c) => a + c.revenue_90d, 0)
      const totalUnits = catalog.reduce((a, c) => a + c.units_sold_90d, 0)
      const topSellers = [...catalog].sort((a, b) => b.revenue_90d - a.revenue_90d).slice(0, 5)

      return {
        seller: profile,
        product_count: prods.length,
        catalog_summary: priceStats(prods.map((p) => p.price)),
        sales_last_90d: { units: totalUnits, revenue_inr: totalRevenue },
        top_products: topSellers,
        slow_movers: catalog.filter((c) => c.units_sold_90d === 0).slice(0, 5),
      }
    },
  },

  get_price_benchmark: {
    name: 'get_price_benchmark',
    description:
      'Get comparable pricing for a product or category: stats and sample listings of similar items. Essential for pricing suggestions and negotiation analysis.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category to benchmark, e.g. Pottery' },
        title: { type: 'string', description: 'Optional product title to find close comparables' },
        exclude_product_id: { type: 'string', description: 'Product to exclude (e.g. the item being negotiated)' },
      },
      required: ['category'],
    },
    async execute(args) {
      const bench = await benchmarkForCategory(String(args.category), args.exclude_product_id ? String(args.exclude_product_id) : undefined)
      let products = bench.products
      if (args.title) {
        const words = String(args.title).toLowerCase().split(/\s+/).filter((w) => w.length > 3)
        const scored = products
          .map((p) => {
            const t = p.title.toLowerCase()
            const score = words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0)
            return { ...p, score }
          })
          .sort((a, b) => b.score - a.score)
        products = scored.slice(0, 10)
      }
      return {
        category: args.category,
        stats: priceStats(products.map((p) => p.price)),
        comparables: products.slice(0, 10),
      }
    },
  },

  // ------------------------------------------------------------------
  // Artisan tools
  // ------------------------------------------------------------------
  analyze_product_image: {
    name: 'analyze_product_image',
    description:
      'Analyze a product image URL with vision AI to draft a title, description, category, tags and price range. Use when an artisan shares an image of their craft.',
    parameters: {
      type: 'object',
      properties: { image_url: { type: 'string', description: 'Public URL of the product image' } },
      required: ['image_url'],
    },
    async execute(args) {
      const url = String(args.image_url)
      if (!/^https?:\/\//.test(url)) return { error: 'image_url must be a public http(s) URL' }
      // Lazy import: ai-service constructs its Gemini client at module load
      // and throws when no API key is configured.
      const { AIService } = await import('@/lib/ai-service')
      const result = await AIService.getInstance().analyzeProductImage(url)
      return { analysis: result }
    },
  },

  create_listing_draft: {
    name: 'create_listing_draft',
    description:
      'Generate a complete marketplace listing draft (title, description, category, tags, SEO keywords, suggested price range with reasoning) from artisan-provided details. Combine with get_price_benchmark results for realistic pricing.',
    parameters: {
      type: 'object',
      properties: {
        title_hint: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string', description: 'Artisan notes about materials, process, story' },
        image_url: { type: 'string' },
        price_context: { type: 'string', description: 'Optional pricing guidance, e.g. benchmark stats JSON' },
      },
    },
    async execute(args) {
      const prompt = `You are Karigari's Artisan Agent helping an Indian artisan create a marketplace listing for a handcrafted product.

Details:
- Title hint: ${args.title_hint || '(none)'}
- Category: ${args.category || '(infer from description)'}
- Artisan notes: ${args.description || '(none)'}
- Image URL: ${args.image_url || '(none)'}
- Pricing context: ${args.price_context || '(none)'}

Return ONLY a JSON object:
{
  "title": "3-6 word evocative title",
  "description": "2-3 paragraph product description covering materials, craftsmanship, cultural significance and care instructions",
  "category": "best-fit category",
  "tags": ["5-8 lowercase search tags"],
  "seo_keywords": ["5-8 keywords buyers would search"],
  "price_min": 500,
  "price_max": 1500,
  "pricing_reasoning": "why this range fits the Indian handicraft market"
}
All prices in INR (₹). Be specific and authentic — avoid generic words like "beautiful" or "amazing".`

      const draft = await generateJSON(prompt, null as any)
      if (!draft) return { error: 'Listing generation failed, please try again' }
      return {
        draft: {
          ...draft,
          image_url: args.image_url || null,
          source: 'artisan_agent',
        },
      }
    },
  },

  // ------------------------------------------------------------------
  // Negotiation tools
  // ------------------------------------------------------------------
  analyze_offer: {
    name: 'analyze_offer',
    description:
      'Analyze a buyer offer against a product: compares offer vs asking price and market benchmarks, computes a fair range, and suggests a counter-offer with reasoning. Use for price negotiation support.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product being negotiated' },
        offer_amount: { type: 'number', description: 'Buyer offer in INR' },
        buyer_note: { type: 'string', description: 'Optional context from the buyer' },
      },
      required: ['product_id', 'offer_amount'],
    },
    async execute(args, ctx) {
      const productId = String(args.product_id || ctx.productId || '')
      const offer = Number(args.offer_amount)
      if (!productId) return { error: 'product_id is required' }
      if (!Number.isFinite(offer) || offer <= 0) return { error: 'offer_amount must be a positive number' }

      const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle()
      if (!p) return { error: 'Product not found' }

      const bench = await benchmarkForCategory(p.category || '', productId)
      const asking = p.price as number
      const stats = bench.stats
      const avg = stats?.avg ?? asking
      const fairMin = Math.round(Math.min(avg * 0.9, asking * 0.85))
      const fairMax = Math.round(Math.max(avg * 1.05, asking))
      const offerVsAsking = Math.round((offer / asking) * 100)

      let verdict: 'strong' | 'fair' | 'low' | 'too_low'
      let suggestedCounter: number
      if (offer >= asking) {
        verdict = 'strong'
        suggestedCounter = asking
      } else if (offer >= fairMin) {
        verdict = 'fair'
        suggestedCounter = Math.min(asking, Math.round(offer * 1.08))
      } else if (offer >= avg * 0.7) {
        verdict = 'low'
        suggestedCounter = Math.round(avg * 0.95)
      } else {
        verdict = 'too_low'
        suggestedCounter = Math.round(avg)
      }

      return {
        product: summarizeProduct((await attachSellerNames([p as ProductRow]))[0]),
        offer_amount: offer,
        asking_price: asking,
        offer_vs_asking_pct: offerVsAsking,
        market: {
          category_avg: avg,
          category_median: stats?.median ?? null,
          comparable_count: stats?.count ?? 0,
          fair_range_inr: [fairMin, fairMax],
        },
        verdict,
        suggested_counter_inr: suggestedCounter,
        reasoning:
          verdict === 'strong'
            ? 'Offer meets or exceeds the asking price — safe to accept.'
            : verdict === 'fair'
              ? 'Offer is within the fair market range; a modest counter near asking is reasonable.'
              : verdict === 'low'
                ? 'Offer is below market average; counter closer to the category average.'
                : 'Offer is well below market value; counter at or near the category average.',
        buyer_note: args.buyer_note || null,
      }
    },
  },

  draft_negotiation_message: {
    name: 'draft_negotiation_message',
    description:
      'Draft a polite, culturally-aware negotiation message for a buyer or seller based on offer analysis. Returns ready-to-send text.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        offer_amount: { type: 'number' },
        counter_amount: { type: 'number', description: 'Suggested counter if any' },
        role: { type: 'string', enum: ['buyer', 'seller'], description: 'Who the message is written for' },
        tone: { type: 'string', enum: ['warm', 'firm', 'friendly'], description: 'Defaults to warm' },
      },
      required: ['product_id', 'offer_amount', 'role'],
    },
    async execute(args) {
      const { data: p } = await supabase
        .from('products')
        .select('title, price, category')
        .eq('id', String(args.product_id))
        .maybeSingle()
      if (!p) return { error: 'Product not found' }

      const role = args.role === 'buyer' ? 'buyer' : 'seller'
      const tone = ['warm', 'firm', 'friendly'].includes(String(args.tone)) ? String(args.tone) : 'warm'
      const prompt = `Write a short (3-5 sentence) ${tone} price-negotiation chat message for the ${role} of a handcrafted product on Karigari, an Indian artisan marketplace.

Product: "${p.title}" (${p.category}), listed at ₹${p.price}
Offer on the table: ₹${args.offer_amount}
${args.counter_amount ? `Suggested counter: ₹${args.counter_amount}` : ''}

Rules:
- Be respectful of the artisan's craft and cultural heritage
- Reference fair value naturally without being pushy
- Include the concrete number(s)
- End with a clear next step
- Plain text only, no markdown, no subject line`

      try {
        const { generateContent } = await import('./gemini')
        const parts = await generateContent([{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.6 })
        const message = parts.map((x) => x.text || '').join('').trim()
        return { message, product_title: p.title, offer_amount: args.offer_amount, counter_amount: args.counter_amount || null }
      } catch {
        return { error: 'Message drafting failed' }
      }
    },
  },
}

/** Helper for runner/tool wiring */
export function getToolDeclarations() {
  return Object.values(agentTools).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

export { MAX_RESULTS }
