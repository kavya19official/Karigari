// Central place for Supabase env vars.
// If .env.local is missing, createClient() used to crash the whole app with
// "supabaseUrl is required". We now fall back to harmless placeholders so the
// app still boots, and print one clear warning telling you what to fix.
// (Data calls will fail until you put real keys in .env.local.)

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
export const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

if (!SUPABASE_CONFIGURED && typeof window === 'undefined') {
  console.warn(
    '\n[Karigari] Supabase env vars are missing. Copy .env.example to .env.local, ' +
      'fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart `npm run dev`.\n'
  )
}

// Used by server-side "admin" clients. Prefers the service-role key (bypasses RLS);
// falls back to the anon key so the app doesn't crash if it isn't set.
export const SUPABASE_ADMIN_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
