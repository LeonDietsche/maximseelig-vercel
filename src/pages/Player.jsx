import { useEffect, useRef } from 'react'
import { initMaxim } from '../script'
import '../index.css'

const TRACKS = [
  // { title: 'I Love You', file: '/api/protected/track/i-love-you' },
  // { title: 'The Machinist', file: '/api/protected/track/the-machinist' },
  // { title: 'La Vie Est Belle', file: '/api/protected/track/la-vie-est-belle' },
  // { title: 'Cheaper Than A Life', file: '/api/protected/track/cheaper-than-a-life' },
  // { title: 'Game', file: '/api/protected/track/game' },
  // { title: 'Post Traumatic Season', file: '/api/protected/track/post-traumatic-season' },
  { title: 'Lost For Words', file: '/api/protected/track/lost-for-words' },
]

export default function Player() {
  const canvasRef = useRef(null)
  const playlistRef = useRef(null)
  const emailRef = useRef(null)
  const playtimeRef = useRef(null)
  const playRef = useRef(null)
  const prevRef = useRef(null)
  const nextRef = useRef(null)

  useEffect(() => {
    // Enables the native directional (e-resize / w-resize) scrub cursor.
    document.body.classList.add('manual-slideshow', 'nav-right')

    const cleanup = initMaxim({
      canvas: canvasRef.current,
      playlistEl: playlistRef.current,
      emailEl: emailRef.current,
      tracks: TRACKS,
      playtimeEl: playtimeRef.current,
      playButtonEl: playRef.current,
      prevButtonEl: prevRef.current,
      nextButtonEl: nextRef.current,
    })

    return () => {
      cleanup()
      document.body.classList.remove('manual-slideshow', 'nav-right', 'nav-left')
    }
  }, [])

  return (
    <>
      <canvas id="canvas" ref={canvasRef} />
      <div id="playlist" ref={playlistRef} />
      <div id="playtime" ref={playtimeRef} role="timer" aria-label="Track playback time">
        0:00 / 0:00
      </div>

      <div id="emailOverlay" ref={emailRef} aria-live="polite">
        <div id="transportControls" role="group" aria-label="Playback controls">
          <button
            id="previousTrack"
            ref={prevRef}
            className="transport-button track-navigation"
            type="button"
            aria-label="Previous track"
          >
            <span className="skip-icon skip-icon-previous" aria-hidden="true" />
          </button>

          <button
            id="listenPrompt"
            ref={playRef}
            className="transport-button"
            type="button"
            aria-label="Play music"
          >
            <span className="play-icon" aria-hidden="true" />
          </button>

          <button
            id="nextTrack"
            ref={nextRef}
            className="transport-button track-navigation"
            type="button"
            aria-label="Next track"
          >
            <span className="skip-icon skip-icon-next" aria-hidden="true" />
          </button>
        </div>

        <a id="emailLink" href="mailto:contact@maximseelig.com">
          contact@maximseelig.com
        </a>
      </div>
    </>
  )
}
