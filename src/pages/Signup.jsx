import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMsg('')

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
      navigate('/release')
    } catch (err) {
      setMsg(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function onSkip() {
    navigate('/release')
  }

  return (
    <div className="page page-signup">
      <div className="bg-visual" aria-hidden="true">
        <picture>
          <source
            srcSet="/assets/ms_thumbnail_mobile.jpg"
            media="(max-width: 640px)"
          />
          <img
            className="bg-image-el"
            src="/assets/ms_thumbnail_desktop.jpg"
            alt=""
            loading="eager"
            decoding="async"
          />
        </picture>
      </div>

      {/* <div className="topbar">
        <button className="skip-link" onClick={onSkip} aria-label="Skip signup">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 100 100"
            style={{ verticalAlign: 'middle' }}
          >
            <line
              x1="10"
              y1="10"
              x2="90"
              y2="90"
              stroke="black"
              strokeWidth={0.533}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="90"
              y1="10"
              x2="10"
              y2="90"
              stroke="black"
              strokeWidth={0.533}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </button>
      </div> */}

      <div className="signup-card">
        <div className="signup-head">
          <h1>LOST FOR WORDS</h1>
        </div>

        <form onSubmit={onSubmit} className="signup-form">
          <input
            type="email"
            name="email"
            placeholder="YOU@EXAMPLE.COM"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Get Access'}
          </button>
        </form>

        {msg && <p className="signup-msg">{msg}</p>}
      </div>

      <section className="sr-only">
        <h1>Maxim Seelig — Unreleased Music & Newsletter</h1>
        <p>Producer and artist. Listen to selected tracks and get release updates by email.</p>
        <ul>
          <li>La Vie Est Belle</li>
          <li>The Machinist</li>
          <li>Post Traumatic Season</li>
          <li>Paris</li>
        </ul>
      </section>
    </div>
  )
}