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
       <div className="bg-video" aria-hidden="true">
         <video
        className="bg-video-el"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/assets/Face.jpg"
      >
        {/* Phones first (tweak the breakpoint if you like) */}
        <source
          src="/assets/thumbnail_mobile.mp4"
          type="video/mp4"
          media="(max-width: 768px)"
        />
        {/* Fallback / desktop */}
        <source
          src="/assets/thumbnail.mp4"
          type="video/mp4"
        />
        {/* Optional webm versions if you have them:
        <source src="/assets/thumbnail_mobile.webm" type="video/webm" media="(max-width: 768px)" />
        <source src="/assets/thumbnail.webm" type="video/webm" />
        */}
        </video>
      </div>
      <div className="topbar">
          <button className="skip-link" onClick={onSkip} aria-label="Skip signup">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                viewBox="0 0 100 100"
                style={{ verticalAlign: 'middle' }} // This must be an object, not a string
              >
                <line
                  x1="10"
                  y1="10"
                  x2="90"
                  y2="90"
                  stroke="black"
                  strokeWidth={0.533} // Use camelCase and numeric values when possible
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
      </div>
      <div className="signup-card">
        <div className="signup-head">
          <h1>UNRELEASED MUSIC</h1>
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
            {loading ? 'Sending…' : 'Subscribe'}
          </button>
        </form>
        {msg && <p className="signup-msg">{msg}</p>}
      </div>
    </div>
  )
}
