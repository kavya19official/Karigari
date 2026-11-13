import { Suspense } from 'react'
import AgentConsole from '@/components/agents/AgentConsole'
import { Bot } from 'lucide-react'

export const metadata = {
  title: 'AI Agents — Karigari',
  description: 'Autonomous AI agents for buyers, artisans, discovery, negotiation and business intelligence.',
}

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-1)] px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold heritage-title flex items-center justify-center gap-2">
            <Bot className="w-8 h-8 text-heritage-gold" /> Karigari AI Agents
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl mx-auto">
            Autonomous agents that search the marketplace, draft listings, benchmark prices and surface
            business insights — powered by live tools, not canned responses.
          </p>
        </div>
        <Suspense fallback={<div className="text-center text-[var(--muted)] py-20">Loading agents…</div>}>
          <AgentConsole />
        </Suspense>
      </div>
    </main>
  )
}
