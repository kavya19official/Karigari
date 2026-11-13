'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTranslation } from 'react-i18next'
import '@/lib/i18n'
import { Database } from '@/lib/supabase'

// Simple built-in login: accounts live in our own `app_users` table and are checked by
// /api/auth/register and /api/auth/login. No Supabase Auth, no email, no dashboard settings.
// The logged-in user is remembered in localStorage.

type Profile = Database['public']['Tables']['profiles']['Row']

export interface AppUser {
  id: string
  email: string
  name?: string
}

const STORAGE_KEY = 'karigariUser'

interface AuthContextType {
  user: AppUser | null
  profile: Profile | null
  session: null // always null now (no Supabase session); kept so existing components still compile
  loading: boolean
  signUp: (email: string, password: string, name: string, role: 'buyer' | 'seller') => Promise<{ needsEmailConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function callAuthApi(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || 'Something went wrong. Please try again.')
  }
  return payload as { user: AppUser; profile: Profile | null }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiInput, setUpiInput] = useState("");
  const [upiError, setUpiError] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    setIsClient(true)

    // Restore the saved login (if any)
    const init = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const saved = JSON.parse(raw) as AppUser
          if (saved?.id) {
            setUser(saved)
            await fetchProfile(saved.id)
          }
        }
      } catch (error) {
        console.error('Could not restore saved login:', error)
        localStorage.removeItem(STORAGE_KEY)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const syncAnonymousCartToDatabase = async (userId: string) => {
    if (typeof window === 'undefined') return

    try {
      const { getAnonymousCart, clearAnonymousCart } = await import('@/utils/cart')
      const anonymousCart = getAnonymousCart()

      if (anonymousCart.length === 0) return

      console.log('Syncing anonymous cart to database for user:', userId)

      // For each item in anonymous cart, check if it exists in database
      for (const item of anonymousCart) {
        const { data: existing, error: fetchError } = await supabase
          .from('cart')
          .select('id, quantity')
          .eq('buyer_id', userId)
          .eq('product_id', item.product_id)
          .single()

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error checking existing cart item:', fetchError)
          continue
        }

        if (existing) {
          // Update quantity (add anonymous quantity to existing)
          await supabase
            .from('cart')
            .update({ quantity: existing.quantity + item.quantity })
            .eq('id', existing.id)
        } else {
          // Insert new cart item
          await supabase
            .from('cart')
            .insert({
              buyer_id: userId,
              product_id: item.product_id,
              quantity: item.quantity,
            })
        }
      }

      // Clear anonymous cart after syncing
      clearAnonymousCart()
      console.log('Anonymous cart synced successfully')
    } catch (error) {
      console.error('Error syncing anonymous cart:', error)
    }
  }

  const applyProfile = (p: Profile | null) => {
    setProfile(p)
    // Prompt seller for UPI ID if missing
    setShowUpiModal(!!p && p.role === 'seller' && !p.upi_id)
  }

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) {
        console.error('Error fetching profile:', error)
        applyProfile(null)
        return
      }
      applyProfile(data ?? null)
    } catch (error) {
      console.error('Error fetching profile:', error)
      applyProfile(null)
    }
  }

  const startSession = async (u: AppUser, p: Profile | null) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    setUser(u)
    applyProfile(p)
    // Move any cart built while signed out into the database
    await syncAnonymousCartToDatabase(u.id)
  }

  const signUp = async (email: string, password: string, name: string, role: 'buyer' | 'seller') => {
    const { user: u, profile: p } = await callAuthApi('/api/auth/register', {
      email: email.trim(),
      password,
      name,
      role,
    })
    await startSession(u, p)
    return { needsEmailConfirmation: false }
  }

  const signIn = async (email: string, password: string) => {
    const { user: u, profile: p } = await callAuthApi('/api/auth/login', {
      email: email.trim(),
      password,
    })
    await startSession(u, p)
  }

  const signOut = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('pendingProfile')
      localStorage.removeItem('googleUserSession')
      localStorage.removeItem('microsoftUserSession')
      localStorage.removeItem('km_session_json')
      localStorage.removeItem('km_session_updated_at')
      sessionStorage.clear()
    } catch (e) {
      console.warn('Storage clear failed:', e)
    }
    setUser(null)
    setProfile(null)
    setShowUpiModal(false)
  }

  const value = {
    user,
    profile,
    session: null,
    loading: loading || !isClient, // Show loading until client is ready
    signUp,
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* UPI ID Modal for sellers */}
      {showUpiModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)]">
          <div className="p-8 rounded-xl min-w-[320px] shadow-[0_4px_32px_rgba(0,0,0,0.15)]" style={{ background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <h2 className="font-bold text-lg mb-3">{t('auth.upiModal.title')}</h2>
            <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>{t('auth.upiModal.description')}</p>
            <input
              type="text"
              value={upiInput}
              onChange={e => { setUpiInput(e.target.value); setUpiError(""); }}
              placeholder={t('auth.upiModal.placeholder')}
              className="w-full p-2 rounded-lg mb-2"
              style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
            {upiError && <div className="text-red-500 mb-2">{upiError}</div>}
            <div className="flex items-center">
              <button
                className="px-4 py-2 rounded-lg font-bold mr-2"
                style={{ background: 'var(--saffron)', color: 'white' }}
                onClick={async () => {
                  if (!upiInput.trim()) {
                    setUpiError(t('auth.upiModal.requiredError'));
                    return;
                  }
                  // Basic UPI ID format check
                  if (!/^[\w.-]+@[\w.-]+$/.test(upiInput.trim())) {
                    setUpiError(t('auth.upiModal.formatError'));
                    return;
                  }
                  // Save UPI ID to profile
                  try {
                    const { error } = await supabase
                      .from('profiles')
                      .update({ upi_id: upiInput.trim() })
                      .eq('id', profile?.id)
                    if (error) {
                      setUpiError(t('auth.upiModal.saveError'));
                    } else {
                      setShowUpiModal(false);
                      setUpiInput("");
                      setUpiError("");
                      // Refetch profile to update context
                      if (profile?.id) await fetchProfile(profile.id);
                    }
                  } catch (err) {
                    setUpiError(t('auth.upiModal.saveError'));
                  }
                }}
              >{t('common.save')}</button>
              <button
                className="px-4 py-2 rounded-lg font-bold"
                style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }}
                onClick={() => setShowUpiModal(false)}
              >{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
