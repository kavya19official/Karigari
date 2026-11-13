import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from '@/lib/supabase-env'
import { verifyPassword } from '@/lib/password'

export const runtime = 'nodejs'

const SETUP_HINT = 'Database not ready: run supabase/schema.sql in the Supabase SQL Editor, then try again.'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Please enter your email and password.' }, { status: 400 })
    }
    if (!SUPABASE_SERVICE_KEY) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local and restart.' },
        { status: 500 }
      )
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: account, error } = await db
      .from('app_users')
      .select('id, email, password_hash')
      .eq('email', email)
      .maybeSingle()

    if (error) {
      console.error('login: lookup failed:', error)
      const missingTable = error.code === '42P01' || error.code === 'PGRST205'
      return NextResponse.json({ error: missingTable ? SETUP_HINT : error.message }, { status: 500 })
    }

    // Same message for "no such email" and "wrong password"
    if (!account || !verifyPassword(password, account.password_hash)) {
      return NextResponse.json({ error: 'Invalid email or password. Please check your credentials and try again.' }, { status: 401 })
    }

    const { data: profile } = await db.from('profiles').select('*').eq('id', account.id).maybeSingle()

    return NextResponse.json({
      user: { id: account.id, email: account.email, name: profile?.name },
      profile: profile ?? null,
    })
  } catch (error) {
    console.error('login: unexpected error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
