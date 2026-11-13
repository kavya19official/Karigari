import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from '@/lib/supabase-env'
import { hashPassword } from '@/lib/password'

export const runtime = 'nodejs'

// Plain email + password sign-up. No Supabase Auth, no emails, no confirmation.
// Users live in our own `app_users` table (see supabase/schema.sql); the profile goes in `profiles`.
// Meant for a demo / hackathon: nothing proves a person owns the email they type.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SETUP_HINT = 'Database not ready: run supabase/schema.sql in the Supabase SQL Editor, then try again.'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const name = String(body?.name ?? '').trim()
    const role: 'buyer' | 'seller' = body?.role === 'seller' ? 'seller' : 'buyer'

    if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    if (!SUPABASE_SERVICE_KEY) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local and restart.' },
        { status: 500 }
      )
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const id = randomUUID()
    const { error: userError } = await db
      .from('app_users')
      .insert({ id, email, password_hash: hashPassword(password) })

    if (userError) {
      if (userError.code === '23505') {
        return NextResponse.json({ error: 'An account with this email already exists. Please sign in instead.' }, { status: 409 })
      }
      console.error('register: app_users insert failed:', userError)
      const missingTable = userError.code === '42P01' || userError.code === 'PGRST205'
      return NextResponse.json({ error: missingTable ? SETUP_HINT : userError.message }, { status: 500 })
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .insert({ id, name, email, role })
      .select('*')
      .single()

    if (profileError) {
      console.error('register: profile insert failed:', profileError)
      await db.from('app_users').delete().eq('id', id) // undo, so the email is not left half-registered
      const fkProblem = profileError.code === '23503'
      return NextResponse.json({ error: fkProblem ? SETUP_HINT : profileError.message }, { status: 500 })
    }

    return NextResponse.json({ user: { id, email, name }, profile })
  } catch (error) {
    console.error('register: unexpected error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
