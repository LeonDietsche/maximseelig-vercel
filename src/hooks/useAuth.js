// src/hooks/useAuth.js
import { useEffect, useState } from 'react'

/**
 * Calls /api/auth/whoami to detect the cookie-backed session.
 * Returns: 'loading' | 'authed' | 'guest'
 */
export function useAuth() {
  const [state, setState] = useState('loading') // 'loading' | 'authed' | 'guest'

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/auth/whoami', { credentials: 'include' })
        const j = await r.json()
        if (!alive) return
        setState(j?.authed ? 'authed' : 'guest')
      } catch {
        if (!alive) return
        setState('guest')
      }
    })()
    return () => { alive = false }
  }, [])

  return state
}
