import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const r = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({}))
        throw new Error(error || 'Could not subscribe')
      }
      setMsg('Thanks! Check your inbox to confirm. You can listen now.')
      // optional: go straight to the player
      navigate('/app')
    } catch (err) {
      setMsg(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function onSkip() {
    navigate('/app')
  }

  return (
    <div className="page page-signup">
      <div className="signup-card">
        <div className="signup-head">
          <h1>UNRELEASED MUSIC</h1>
          <button className="skip-link" onClick={onSkip} aria-label="Skip signup">Skip →</button>
        </div>
        <form onSubmit={onSubmit} className="signup-form">
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Subscribe'}
          </button>
        </form>
        {msg && <p className="signup-msg">{msg}</p>}
      </div>
    </div>
  )
}
