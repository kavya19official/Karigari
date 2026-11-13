// Google OAuth helpers.
//
// This module is imported by BOTH the browser (to build the consent URL) and the
// server callback route (to exchange the code). Secrets are therefore read lazily
// inside the server-only functions, never at module load, and missing config
// produces a clear error instead of the string "undefined" in a URL.

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

// Path of the callback route handler (src/app/api/auth/google/callback/route.ts)
export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback'

// OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ')

export interface GoogleUser {
  id: string
  email: string
  name: string
  picture: string
  verified_email: boolean
}

export interface GoogleAuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

export type GoogleOAuthFailure = 'config' | 'invalid_code' | 'failed'

// Error carrying a coarse reason so the callback route can show a useful message
export class GoogleOAuthError extends Error {
  reason: GoogleOAuthFailure

  constructor(message: string, reason: GoogleOAuthFailure) {
    super(message)
    this.name = 'GoogleOAuthError'
    this.reason = reason
  }
}

/**
 * Redirect URI sent to Google. It MUST be byte-for-byte identical in the
 * authorization request and in the token exchange, and it MUST be listed under
 * "Authorized redirect URIs" in Google Cloud Console.
 *
 * NEXT_PUBLIC_GOOGLE_REDIRECT_URI wins when set; otherwise it is derived from the
 * current origin so the same build works on localhost, previews and production.
 */
export function getGoogleRedirectUri(origin?: string): string {
  const configured = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI?.trim()
  if (configured) return configured

  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  if (!base) {
    throw new GoogleOAuthError('Cannot determine the Google redirect URI', 'config')
  }
  return `${base.replace(/\/$/, '')}${GOOGLE_CALLBACK_PATH}`
}

// Generate Google OAuth URL
export function generateGoogleAuthURL(state?: string): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('Google OAuth: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set (it must be present at build time).')
    throw new GoogleOAuthError('Google sign-in is not configured. Please contact support.', 'config')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent'
  })

  if (state) {
    params.append('state', state)
  }

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

// Exchange authorization code for tokens (server only)
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleAuthResponse> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new GoogleOAuthError(
      'Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET on the server',
      'config'
    )
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    let googleError = ''
    try {
      googleError = JSON.parse(body)?.error ?? ''
    } catch {
      // body was not JSON; fall through to the generic classification
    }

    // invalid_client / redirect_uri_mismatch / unauthorized_client => our config is wrong
    // invalid_grant => the code was already used, expired, or the redirect URI differs
    const reason: GoogleOAuthFailure =
      googleError === 'invalid_grant'
        ? 'invalid_code'
        : ['invalid_client', 'redirect_uri_mismatch', 'unauthorized_client'].includes(googleError)
          ? 'config'
          : 'failed'

    throw new GoogleOAuthError(
      `Failed to exchange code for tokens (redirect_uri=${redirectUri}): ${body}`,
      reason
    )
  }

  return response.json()
}

// Get user info from Google
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUser> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new GoogleOAuthError('Failed to get user info from Google', 'failed')
  }

  return response.json()
}

// Complete OAuth flow (server only)
export async function completeGoogleAuth(code: string, redirectUri: string): Promise<GoogleUser> {
  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Get user info
    return await getGoogleUserInfo(tokens.access_token)
  } catch (error) {
    console.error('Google OAuth error:', error)
    if (error instanceof GoogleOAuthError) throw error
    throw new GoogleOAuthError('Google authentication failed', 'failed')
  }
}

// Validate Google ID token (for server-side verification)
export async function validateGoogleIdToken(idToken: string): Promise<GoogleUser> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`)

  if (!response.ok) {
    throw new Error('Invalid Google ID token')
  }

  const tokenInfo = await response.json()

  return {
    id: tokenInfo.sub,
    email: tokenInfo.email,
    name: tokenInfo.name,
    picture: tokenInfo.picture,
    verified_email: tokenInfo.email_verified
  }
}
