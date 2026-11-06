import { NextRequest, NextResponse } from 'next/server'
import {
  completeGoogleAuth,
  getGoogleRedirectUri,
  GoogleOAuthError,
  type GoogleUser,
} from '@/lib/google-oauth'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ADMIN_KEY, SUPABASE_SERVICE_KEY } from '@/lib/supabase-env'

// Create a Supabase client with service role key for server-side operations
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_ADMIN_KEY, // Use service role key to bypass RLS
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

type Role = 'buyer' | 'seller'

// Public origin of this request. Honours the proxy headers so it is correct on
// Vercel and on any host that terminates TLS in front of Next.js.
function getOrigin(request: NextRequest): string {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))?.split(',')[0]?.trim()
  if (!host) return request.nextUrl.origin
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto = forwardedProto || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

// The sign-in page turns these codes into user-facing messages
function failWith(origin: string, code: string) {
  return NextResponse.redirect(new URL(`/auth/signin?error=${code}`, origin))
}

function parseRole(state: string | null): Role {
  if (!state) return 'buyer'
  for (const candidate of [() => decodeURIComponent(state), () => state]) {
    try {
      const parsed = JSON.parse(candidate())
      return parsed?.role === 'seller' ? 'seller' : 'buyer'
    } catch {
      // try the next interpretation
    }
  }
  console.warn('Failed to parse OAuth state parameter')
  return 'buyer'
}

// listUsers() is paginated (50 per page by default), so a single call silently
// misses most users once the project grows. Walk the pages instead.
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const target = email.toLowerCase()
  const perPage = 1000
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users ?? []
    const match = users.find(u => u.email?.toLowerCase() === target)
    if (match) return match.id
    if (users.length < perPage) break
  }
  return null
}

// Create the Supabase Auth user, or return the id of the one that already exists
async function ensureAuthUser(
  googleUser: { id: string; email: string; name: string; picture: string },
  role: Role
): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: googleUser.email,
    password: `google_${googleUser.id}_${crypto.randomUUID()}`, // never used to sign in
    email_confirm: true, // Google already verified this address
    user_metadata: {
      name: googleUser.name,
      role: role,
      google_id: googleUser.id,
      picture: googleUser.picture
    }
  })

  if (!error && data.user) return data.user.id

  const alreadyExists =
    error?.code === 'email_exists' || /already (been )?registered|already exists/i.test(error?.message ?? '')
  if (alreadyExists) {
    const existingId = await findAuthUserIdByEmail(googleUser.email)
    if (existingId) return existingId
  }

  throw error ?? new Error('createUser returned no user')
}

// Ask Supabase for a one-time sign-in link; following it creates a real Supabase
// session in the browser and lands on `redirectTo`.
async function createSignInLink(email: string, redirectTo: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo }
  })
  const link = data?.properties?.action_link
  if (error || !link) {
    console.error('Failed to generate Supabase sign-in link:', error)
    return null
  }
  return link
}

export async function GET(request: NextRequest) {
  const origin = getOrigin(request)

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors (e.g. the user pressed "Cancel" on Google's consent screen)
    if (error) {
      console.error('Google OAuth error:', error)
      return failWith(origin, error === 'access_denied' ? 'access_denied' : 'oauth_failed')
    }

    // Check if we have an authorization code
    if (!code) {
      return failWith(origin, 'no_code')
    }

    // Without the service role key every admin call below fails (the shared
    // client silently falls back to the anon key), so fail loudly up front.
    if (!SUPABASE_SERVICE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not set; Google sign-in cannot create sessions.')
      return failWith(origin, 'server_config')
    }

    const role = parseRole(state)

    // Complete Google OAuth flow
    let googleUser: GoogleUser
    try {
      googleUser = await completeGoogleAuth(code, getGoogleRedirectUri(origin))
    } catch (err) {
      const reason = err instanceof GoogleOAuthError ? err.reason : 'failed'
      return failWith(origin, reason === 'config' ? 'server_config' : reason === 'invalid_code' ? 'code_expired' : 'callback_failed')
    }

    if (!googleUser.email || googleUser.verified_email === false) {
      return failWith(origin, 'email_unverified')
    }

    // Check if user already exists in our database
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, profile_image')
      .eq('email', googleUser.email)
      .limit(1)
      .maybeSingle()

    if (profileError) {
      console.error('Profile lookup error:', profileError)
      return failWith(origin, 'database_error')
    }

    let destinationRole: Role

    if (existingProfile) {
      // Only update the profile image if it is not already set
      if (!existingProfile.profile_image && googleUser.picture) {
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ profile_image: googleUser.picture })
          .eq('id', existingProfile.id)
        if (updateError) {
          console.warn('Failed to update profile with Google info:', updateError)
        }
      }
      destinationRole = existingProfile.role === 'seller' ? 'seller' : 'buyer'
    } else {
      // New to the app: make sure an Auth user exists, then its profile row
      let authUserId: string
      try {
        authUserId = await ensureAuthUser(googleUser, role)
      } catch (err) {
        console.error('Supabase auth error:', err)
        return failWith(origin, 'auth_failed')
      }

      // upsert (not insert): a database trigger on auth.users may already have
      // created the profile row, which would make a plain insert fail.
      const { error: profileCreateError } = await supabaseAdmin
        .from('profiles')
        .upsert([{
          id: authUserId, // Use the Supabase Auth user ID
          name: googleUser.name,
          email: googleUser.email,
          role: role,
          profile_image: googleUser.picture,
          bio: null,
          store_description: null,
          created_at: new Date().toISOString()
        }], { onConflict: 'id' })

      if (profileCreateError) {
        console.error('Profile creation error:', profileCreateError)
        return failWith(origin, 'profile_failed')
      }

      destinationRole = role
    }

    // Sign the user in with a real Supabase session
    const destination = destinationRole === 'seller' ? '/dashboard' : '/marketplace'
    const signInLink = await createSignInLink(googleUser.email, `${origin}${destination}`)
    if (!signInLink) {
      return failWith(origin, 'session_failed')
    }

    return NextResponse.redirect(signInLink)

  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return failWith(origin, 'callback_failed')
  }
}
