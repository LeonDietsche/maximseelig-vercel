import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { initMaxim } from '../script'
import '../index.css'

const TRACKS = [
  { title: 'La Vie Est Belle',      file: '/assets/tracks/mp3/la-vie-est-belle.mp3' },
  { title: 'The Machinist',         file: '/assets/tracks/mp3/the-machinist.mp3' },
  { title: 'Post Traumatic Season', file: '/assets/tracks/mp3/post-traumatic-season.mp3' },
  { title: 'Paris',                 file: '/assets/tracks/mp3/paris.mp3' },
  { title: 'Game',                 file: '/assets/tracks/mp3/game.mp3' },
  { title: 'Zodiac',                unreleased: true },
  { title: 'I Love You',            unreleased: true },
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
          Subscribe
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
