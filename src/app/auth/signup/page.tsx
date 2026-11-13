'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/components/ThemeProvider'
import { Eye, EyeOff, Palette, ShoppingBag, ArrowRight, Sparkles, Users, Star, Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Image from 'next/image'

function SignUpContent() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { signUp, user, profile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const roleParam = searchParams.get('role')
    if (roleParam === 'seller' || roleParam === 'buyer') {
      setRole(roleParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (user && profile) {
      router.push(profile.role === 'seller' ? '/dashboard' : '/marketplace')
    }
  }, [user, profile, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { needsEmailConfirmation } = await signUp(email, password, name, role)
      // Show success message
      setError('')
      if (needsEmailConfirmation) {
        alert('Account created! Check your email for a confirmation link, then come back and sign in.')
      } else {
        alert(t('auth.branding.accountCreatedSuccessfully'))
      }
    } catch (error: unknown) {
      console.error('Signup error details:', error)
      setError(error instanceof Error ? error.message : t('auth.branding.errorOccurredDuringSignup'))
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
              {t('auth.branding.startYourCreativeJourneyToday')}
            </h2>

            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              {t('auth.branding.joinThousandsOfArtisans')}
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card-glass p-6 space-y-3">
              <div className="w-12 h-12 bg-gradient-to-br from-[var(--saffron)] to-[var(--turquoise)] rounded-xl flex items-center justify-center">
                <Star className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text)]">{t('auth.branding.premiumQuality')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('auth.branding.curatedCollection')}</p>
            </div>

            <div className="card-glass p-6 space-y-3">
              <div className="w-12 h-12 bg-gradient-to-br from-[var(--emerald)] to-[var(--maroon)] rounded-xl flex items-center justify-center">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--text)]">{t('auth.branding.communityDriven')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('auth.branding.supportLocalArtisans')}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--saffron)]">10K+</div>
              <div className="text-sm text-[var(--text-muted)]">{t('auth.branding.artisans')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--emerald)]">50K+</div>
              <div className="text-sm text-[var(--text-muted)]">{t('auth.branding.products')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--maroon)]">100K+</div>
              <div className="text-sm text-[var(--text-muted)]">{t('auth.branding.happyCustomers')}</div>
            </div>
          </div>
        </div>

        {/* Right Side - Sign Up Form */}
        <div className="w-full max-w-md mx-auto">
          <div className="card-glass p-8 space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <div className="relative w-24 h-24 mx-auto">
                <Image src="/karigari-symbol.png" alt="Karigari Symbol" fill className="object-contain" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[var(--text)]">
                  {t('auth.signupTitle')}
                </h2>
                <p className="text-[var(--text-muted)] mt-2">
                  {t('auth.signupSubtitle')}
                </p>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-[var(--text)] mb-2">
                    {t('auth.fullName')}
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--bg-2)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--saffron)] focus:border-transparent transition-all duration-200 text-[var(--text)] placeholder-[var(--text-muted)]"
                    placeholder={t('auth.enterFullName')}
                  />
                </div>

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
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--bg-2)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--saffron)] focus:border-transparent transition-all duration-200 text-[var(--text)] placeholder-[var(--text-muted)] pr-12"
                      placeholder={t('auth.password')}
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

                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-3">
                    {t('auth.chooseRoleTitle')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('buyer')}
                      className={`p-4 border-2 rounded-xl text-center transition-all duration-200 group ${role === 'buyer'
                        ? 'border-[var(--saffron)] bg-[var(--saffron)]/10 text-[var(--saffron)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--saffron)]/50 hover:text-[var(--text)]'
                        }`}
                    >
                      <div className={`w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center transition-all duration-200 ${role === 'buyer'
                        ? 'bg-gradient-to-br from-[var(--saffron)] to-[var(--turquoise)]'
                        : 'bg-[var(--bg-3)] group-hover:bg-gradient-to-br group-hover:from-[var(--saffron)] group-hover:to-[var(--turquoise)]'
                        }`}>
                        <ShoppingBag className={`w-5 h-5 transition-colors duration-200 ${role === 'buyer' ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-white'
                          }`} />
                      </div>
                      <span className="font-medium block">{t('roles.buyer')}</span>
                      <p className="text-xs mt-1">{t('roles.buyerTagline')}</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole('seller')}
                      className={`p-4 border-2 rounded-xl text-center transition-all duration-200 group ${role === 'seller'
                        ? 'border-[var(--emerald)] bg-[var(--emerald)]/10 text-[var(--emerald)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--emerald)]/50 hover:text-[var(--text)]'
                        }`}
                    >
                      <div className={`w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center transition-all duration-200 ${role === 'seller'
                        ? 'bg-gradient-to-br from-[var(--emerald)] to-[var(--maroon)]'
                        : 'bg-[var(--bg-3)] group-hover:bg-gradient-to-br group-hover:from-[var(--emerald)] group-hover:to-[var(--maroon)]'
                        }`}>
                        <Palette className={`w-5 h-5 transition-colors duration-200 ${role === 'seller' ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-white'
                          }`} />
                      </div>
                      <span className="font-medium block">{t('roles.artisan')}</span>
                      <p className="text-xs mt-1">{t('roles.artisanTagline')}</p>
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
                      {t('auth.creatingAccount')}
                    </div>
                  ) : (
                    <div className="flex items-center">
                      {t('auth.createAccount')}
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </button>

              </div>

              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  {t('auth.alreadyHaveAccount')}{' '}
                  <Link href="/auth/signin" className="font-medium text-[var(--saffron)] hover:text-[var(--maroon)] transition-colors">
                    {t('navbar.signIn')}
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignUp() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SignUpContent />
    </Suspense>
  )
}