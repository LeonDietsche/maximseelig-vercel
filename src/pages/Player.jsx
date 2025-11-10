import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { initMaxim } from '../script'
import '../index.css'

const TRACKS = [
  // { title: 'I Love You', file: '/assets/tracks/mp3/I-love-you.mp3' },
  { title: 'The Machinist', file: '/assets/tracks/mp3/the-machinist.mp3' },
  { title: 'La Vie Est Belle', file: '/assets/tracks/mp3/la-vie-est-belle.mp3' },
  { title: 'Cheaper Than A Life', file: '/assets/tracks/mp3/cheaper-than-a-life.mp3' },
  { title: 'Game', file: '/assets/tracks/mp3/game.mp3' },
  { title: 'Post Traumatic Season', file: '/assets/tracks/mp3/post-traumatic-season.mp3' },
]

export default function Player() {
  const canvasRef = useRef(null)
  const playlistRef = useRef(null)
  const emailRef = useRef(null)

  useEffect(() => {
    const cleanup = initMaxim({
      canvas: canvasRef.current,
      playlistEl: playlistRef.current,
      emailEl: emailRef.current,
      tracks: TRACKS,
      playheadColor: '#111',
      playheadWidth: 0.5,
    })
    return cleanup
  }, [])

  return (
    <>
      <div className="topbar">
        <Link to="/" className="subtle-link">
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
        </Link>
      </div>

      <div id="playlist" ref={playlistRef} />
      <canvas id="canvas" ref={canvasRef} />
      <div id="emailOverlay" ref={emailRef}>
        <a href="mailto:contact@maximseelig.com">contact@maximseelig.com</a>
      </div>
    </>
  )
}
