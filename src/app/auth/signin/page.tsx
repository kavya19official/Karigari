'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { Eye, EyeOff, AlertCircle, ArrowRight, Sparkles, Shield, Users, Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Image from 'next/image'

// Error codes set by the OAuth callback routes (?error=...) and their default
// messages. Translations can override them via auth.oauthErrors.<code>.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Sign-in was cancelled or failed. Please try again.',
  access_denied: 'Sign-in was cancelled. Please try again when you are ready.',
  no_code: 'The sign-in provider did not return an authorization code. Please try again.',
  code_expired: 'That sign-in attempt expired or was already used. Please start again.',
  email_unverified: 'Your account email address is not verified, so we cannot sign you in with it.',
  server_config: 'Social sign-in is not configured correctly on the server. Please contact support.',
  auth_failed: 'We could not create or find your account. Please try again or sign in with email and password.',
  profile_failed: 'We could not set up your profile. Please try again.',
  database_error: 'We could not reach the database. Please try again in a moment.',
  session_failed: 'Your account was verified but we could not start a session. Please try again.',
  unknown_error: 'Something went wrong while signing in. Please try again.',
  callback_failed: 'Something went wrong while signing in. Please try again.',
}

export default function SignIn() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { signIn, user, profile } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'seller') {
        router.push('/dashboard')
      } else {
        router.push('/marketplace')
      }
    }
  }, [user, profile, router])

  // Show why a social sign-in redirected back here (?error=<code>)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('error')
    if (!code) return

    const knownCode = code in OAUTH_ERROR_MESSAGES ? code : 'callback_failed'
    setError(t(`auth.oauthErrors.${knownCode}`, { defaultValue: OAUTH_ERROR_MESSAGES[knownCode] }))

    // Drop the param so a refresh does not show a stale error
    params.delete('error')
    const query = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''))
  }, [t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setError(t('auth.errors.missingEmailPassword'))
      setLoading(false)
      return
    }

    try {
      await signIn(email, password)
      // User will be redirected based on their role
    } catch (error: unknown) {
      console.error('Signin error details:', error)

      // Handle different types of errors
      if (error instanceof Error) {
        setError(error.message)

        // Log additional error details for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log('Error name:', error.name)
          console.log('Error message:', error.message)
          console.log('Error stack:', error.stack)
        }
      } else {
        setError(t('errors.general'))
      }

      // Clear password field on error for security
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--bg-1)] via-[var(--bg-2)] to-[var(--bg-3)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Floating Orbs */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-br from-[var(--saffron)]/20 to-[var(--turquoise)]/20 rounded-full blur-xl animate-float"></div>
        <div className="absolute top-40 right-20 w-24 h-24 bg-gradient-to-br from-[var(--emerald)]/20 to-[var(--maroon)]/20 rounded-full blur-lg animate-float-slow"></div>
        <div className="absolute bottom-32 left-1/4 w-40 h-40 bg-gradient-to-br from-[var(--turquoise)]/20 to-[var(--saffron)]/20 rounded-full blur-2xl animate-float"></div>
        <div className="absolute bottom-20 right-1/3 w-28 h-28 bg-gradient-to-br from-[var(--maroon)]/20 to-[var(--emerald)]/20 rounded-full blur-xl animate-float-slow"></div>
      </div>

      <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-12 items-center relative z-10">
        {/* Left Side - Branding & Features */}
        <div className="hidden lg:block space-y-8">
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <Image src="/karigari-symbol.png" alt="Karigari Symbol" fill className="object-contain drop-shadow-lg" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-[var(--text)]">{t('auth.branding.karigari')}</h1>
                <p className="text-[var(--text-muted)]">{t('auth.branding.yourArtisanMarketplace')}</p>
              </div>
            </div>

            <h2 className="text-4xl font-bold text-[var(--text)] leading-tight">
              {t('auth.branding.welcomeBackToCreativeJourney')}
            </h2>

            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              {t('auth.branding.connectWithArtisans')}
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card-glass p-6 space-y-3">
              <div className="w-12 h-12 bg-gradient-to-br from-[var(--saffron)] to-[var(--turquoise)] rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text)]">{t('auth.branding.securePlatform')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('auth.branding.yourDataProtected')}</p>
            </div>

            <div className="card-glass p-6 space-y-3">
              <div className="w-12 h-12 bg-gradient-to-br from-[var(--emerald)] to-[var(--maroon)] rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text)]">{t('auth.branding.trustedCommunity')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('auth.branding.joinVerifiedArtisans')}</p>
            </div>
          </div>
        </div>

        {/* Right Side - Sign In Form */}
        <div className="w-full max-w-md mx-auto">
          <div className="card-glass p-8 space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <div className="relative w-24 h-24 mx-auto">
                <Image src="/karigari-symbol.png" alt="Karigari Symbol" fill className="object-contain" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[var(--text)]">
                  {t('auth.welcomeBack')}
                </h2>
                <p className="text-[var(--text-muted)] mt-2">
                  {t('auth.signinSubtitle')}
                </p>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[var(--text)] mb-2">
                    {t('auth.emailAddress')}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--bg-2)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--saffron)] focus:border-transparent transition-all duration-200 text-[var(--text)] placeholder-[var(--text-muted)]"
                    placeholder={t('auth.enterYourEmail')}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--text)] mb-2">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--bg-2)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--saffron)] focus:border-transparent transition-all duration-200 text-[var(--text)] placeholder-[var(--text-muted)] pr-12"
                      placeholder={t('auth.enterYourPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-[var(--saffron)] to-[var(--maroon)] hover:from-[var(--saffron)]/90 hover:to-[var(--maroon)]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--saffron)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      {t('auth.signingIn')}
                    </div>
                  ) : (
                    <div className="flex items-center">
                      {t('navbar.signIn')}
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </button>

              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-[var(--text-muted)]">
                  {t('auth.dontHaveAccount')}{' '}
                  <Link href="/auth/signup" className="font-medium text-[var(--saffron)] hover:text-[var(--maroon)] transition-colors">
                    {t('navbar.signUp')}
                  </Link>
                </p>
                <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-2)] p-2 rounded-lg">
                  💡 {t('auth.chooseRoleTip')}
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
