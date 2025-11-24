// src/routes/guards.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth({ children }) {
  const auth = useAuth()
  if (auth === 'loading') return null          // or a tiny spinner
  if (auth === 'guest')   return <Navigate to="/" replace />
  return children
}

export function RedirectIfAuthed({ to = '/release', children }) {
  const auth = useAuth()
  if (auth === 'loading') return null
  if (auth === 'authed')  return <Navigate to={to} replace />
  return children
}
