'use client'

// Shows the sign-in screen until the owner is signed in, then the app.
// The real protection is in the database (only the owner's account can read or
// write); this screen is how the owner gets that account's session.
// Supabase keeps the session on the device, so signing in is needed only once
// per device or after signing out.

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearTransactionLookups } from '@/components/TransactionForm'

export const SIGNED_OUT_EVENT = 'fintrack:signed-out'

export async function signOut() {
  await supabase.auth.signOut()
  clearTransactionLookups()
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
}

type AuthState = 'checking' | 'signed-out' | 'signed-in'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('checking')

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? 'signed-in' : 'signed-out')
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        if (active) setState(session ? 'signed-in' : 'signed-out')
      }
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (state === 'checking') return <div style={{ minHeight: '100vh' }} />
  if (state === 'signed-out') return <SignIn />
  return <>{children}</>
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setBusy(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)

    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'Email or password is not right.'
          : signInError.message
      )
    }
  }

  const input: React.CSSProperties = {
    width: '100%',
    height: '48px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '16px',
    background: '#fff',
    boxSizing: 'border-box',
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        background: '#f8fafc',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px 20px',
          display: 'grid',
          gap: '14px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#0f172a' }}>FinTrack</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '14px' }}>Sign in to continue.</p>
        </div>

        <label style={{ display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#374151' }}>
          Email
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </label>

        <label style={{ display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#374151' }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />
        </label>

        {error && <div style={{ color: '#b91c1c', fontSize: '14px', fontWeight: 600 }}>{error}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            height: '48px',
            borderRadius: '10px',
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 800,
            fontSize: '15px',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
