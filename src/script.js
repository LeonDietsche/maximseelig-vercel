// src/script.js
//
// Waveform player engine.
// Ported from the standalone "directional cursor" build (Variante 2) into the
// React app: same interaction model, but wrapped in initMaxim() so the Player
// page can hand in its own DOM refs and track list, and so every listener is
// torn down again on unmount.

export function initMaxim({
  canvas,
  playlistEl,
  emailEl,
  tracks,
  playtimeEl = null,
  playButtonEl = null,
  prevButtonEl = null,
  nextButtonEl = null,
  playheadColor = '#666',
  playheadWidthDesktop = 1.5,
  playheadWidthMobile = 2,
}) {
  if (!canvas || !playlistEl || !emailEl || !tracks?.length) return () => {}

  // ==== CONSTANTS ====
  const MOBILE_BREAKPOINT = 767
  const SCROLL_THRESHOLD_DESKTOP = 150
  const SCROLL_THRESHOLD_MOBILE = 60
  const SCRUB_START_THRESHOLD = 2 // px before a click becomes a drag
  const samples = 6000

  function getPlayheadWidth() {
    return window.innerWidth <= MOBILE_BREAKPOINT
      ? playheadWidthMobile
      : playheadWidthDesktop
  }

  // ==== TRACK PLAYABILITY ====
  const isPlayable = (t) => t && t.file && !t.unreleased
  const findNextPlayable = (from, dir) => {
    let i = from
    for (;;) {
      i += dir
      if (i < 0 || i >= tracks.length) return from
      if (isPlayable(tracks[i])) return i
    }
  }

  // ==== STATE ====
  const ctx = canvas.getContext('2d')
  let currentIndex = findNextPlayable(-1, 1)
  let duration = 0

  let audio = new Audio()
  let audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  let filteredData = []
  let animationFrameId

  let isDragging = false
  let wasPlayingBeforeDrag = false
  let dragStartX = 0
  let dragX = 0
  let dragMoved = false

  let pointerClientX = window.innerWidth
  let cursorDirection = 'right'

  let wheelAccum = 0
  let touchAccum = 0

  // ==== LISTENER BOOKKEEPING ====
  const off = []
  function on(target, type, fn, opts) {
    if (!target) return
    target.addEventListener(type, fn, opts)
    off.push(() => target.removeEventListener(type, fn, opts))
  }

  // ==== OVERLAY ====
  // Centre of the overlay switches between transport controls and the email:
  //   paused / ended -> BACK  PLAY  NEXT
  //   playing        -> email address
  // The whole overlay hides while the playhead is being dragged.
  function syncPlaybackOverlay() {
    const isPlaying = !audio.paused && !audio.ended
    emailEl.classList.toggle('is-playing', isPlaying)
  }

  function setEmailOverlayHidden(isHidden) {
    emailEl.classList.toggle('is-hidden', isHidden)
  }

  function playCurrentTrack() {
    if (!isPlayable(tracks[currentIndex])) return

    if (audio.ended || (duration > 0 && audio.currentTime >= duration)) {
      audio.currentTime = 0
      updatePlaytime()
    }

    audio.play().catch(() => {
      syncPlaybackOverlay()
    })
  }

  // ==== PLAYBACK TIME ====
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
    const totalSeconds = Math.floor(seconds)
    const minutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
  }

  function updatePlaytime() {
    if (!playtimeEl) return
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    const total =
      Number.isFinite(duration) && duration > 0
        ? duration
        : Number.isFinite(audio.duration)
          ? audio.duration
          : 0
    playtimeEl.textContent = `${formatTime(current)} / ${formatTime(total)}`
  }

  // ==== CANVAS ====
  function resizeCanvas() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    draw()
    updateScrubCursorDirection()
  }

  // ==== PLAYLIST ====
  function renderPlaylist() {
    playlistEl.innerHTML = ''
    tracks.forEach((t, i) => {
      const div = document.createElement('div')
      div.className = 'track' + (i === currentIndex ? ' active' : '')
      div.textContent = String(i + 1).padStart(3, '0')
      div.onclick = () => switchTrack(i)
      playlistEl.appendChild(div)
    })
  }

  // ==== TRACK SWITCHING ====
  function switchTrack(index) {
    if (index < 0 || index >= tracks.length) return
    if (!isPlayable(tracks[index])) {
      const dir = index > currentIndex ? 1 : -1
      const next = findNextPlayable(index - dir, dir)
      if (next === currentIndex || !isPlayable(tracks[next])) return
      index = next
    }
    currentIndex = index
    renderPlaylist()
    loadAndDraw(tracks[index].file, true)
  }

  function loadAndDraw(src, autoplay = false) {
    audio.pause()
    duration = 0
    audio = new Audio(src)
    audio.crossOrigin = 'anonymous'
    updatePlaytime()

    audio.addEventListener('loadedmetadata', updatePlaytime)
    audio.addEventListener('durationchange', updatePlaytime)
    audio.addEventListener('timeupdate', updatePlaytime)
    audio.addEventListener('play', syncPlaybackOverlay)
    audio.addEventListener('pause', syncPlaybackOverlay)
    audio.addEventListener('ended', () => {
      updatePlaytime()
      syncPlaybackOverlay()
      draw()
    })

    audioCtx.close().then(() => {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      fetch(src)
        .then((r) => r.arrayBuffer())
        .then((buf) => audioCtx.decodeAudioData(buf))
        .then((buffer) => {
          duration = buffer.duration
          updatePlaytime()
          const data = buffer.getChannelData(0)
          const blockSize = Math.floor(data.length / samples)
          filteredData = []
          for (let i = 0; i < samples; i++) {
            let maxPos = 0
            let maxNeg = 0
            for (let j = 0; j < blockSize; j++) {
              const v = data[i * blockSize + j]
              if (v > maxPos) maxPos = v
              if (v < maxNeg) maxNeg = v
            }
            filteredData.push({ positive: maxPos, negative: maxNeg })
          }
          draw()
        })
        .catch(() => {})
    })

    audio.onplay = () => {
      syncPlaybackOverlay()
      animate()
    }
    audio.onpause = () => {
      cancelAnimationFrame(animationFrameId)
      draw()
      syncPlaybackOverlay()
    }
    syncPlaybackOverlay()

    if (autoplay) {
      audio.play().catch(() => {
        syncPlaybackOverlay()
      })
    }
  }

  // ==== TIME <-> X ====
  function xToTime(x) {
    return duration > 0 ? (x / canvas.width) * duration : 0
  }

  function timeToX(time) {
    return duration > 0 ? (time / duration) * canvas.width : 0
  }

  function getPlayheadX() {
    const x = isDragging ? dragX : timeToX(audio.currentTime)
    return Math.max(0, Math.min(canvas.width, Number.isFinite(x) ? x : 0))
  }

  // ==== DIRECTIONAL CURSOR ====
  function updateScrubCursorDirection() {
    const rect = canvas.getBoundingClientRect()
    const pointerX = pointerClientX - rect.left
    const scaleX = canvas.width > 0 ? rect.width / canvas.width : 1
    const playheadX = getPlayheadX() * scaleX
    const difference = pointerX - playheadX

    // Keep the previous direction in the one-pixel neutral zone so the cursor
    // does not rapidly alternate when it sits directly on the playhead.
    if (Math.abs(difference) > 1) {
      cursorDirection = difference < 0 ? 'left' : 'right'
    }

    document.body.classList.toggle('nav-left', cursorDirection === 'left')
    document.body.classList.toggle('nav-right', cursorDirection === 'right')
  }

  // ==== DRAW ====
  function draw() {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!filteredData.length) return

    const mid = canvas.height / 2
    const w = canvas.width / filteredData.length
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    filteredData.forEach((v, i) => {
      const x = i * w
      ctx.beginPath()
      ctx.moveTo(x, mid)
      ctx.lineTo(x, mid - v.positive * mid)
      ctx.moveTo(x, mid)
      ctx.lineTo(x, mid - v.negative * mid)
      ctx.stroke()
    })

    const px = getPlayheadX()
    ctx.strokeStyle = playheadColor
    ctx.lineWidth = getPlayheadWidth()
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, canvas.height)
    ctx.stroke()

    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
  }

  function animate() {
    draw()
    updatePlaytime()
    updateScrubCursorDirection()
    animationFrameId = requestAnimationFrame(animate)
  }

  // ==== TRANSPORT BUTTONS ====
  on(playButtonEl, 'click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    playCurrentTrack()
  })

  on(prevButtonEl, 'click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    switchTrack((currentIndex - 1 + tracks.length) % tracks.length)
  })

  on(nextButtonEl, 'click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    switchTrack((currentIndex + 1) % tracks.length)
  })

  // ==== POINTER / WHEEL / KEYBOARD ====
  on(window, 'resize', resizeCanvas)

  on(
    canvas,
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return
      pointerClientX = event.clientX
      updateScrubCursorDirection()
    },
    { passive: true },
  )

  on(canvas, 'mousedown', (e) => {
    const rect = canvas.getBoundingClientRect()
    dragStartX = e.clientX - rect.left
    dragX = dragStartX
    isDragging = true
    dragMoved = false
    wasPlayingBeforeDrag = !audio.paused
    updateScrubCursorDirection()
  })

  on(window, 'mousemove', (e) => {
    if (!isDragging) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (Math.abs(x - dragStartX) > SCRUB_START_THRESHOLD) {
      if (!dragMoved) {
        dragMoved = true
        setEmailOverlayHidden(true)
      }
      dragX = Math.max(0, Math.min(canvas.width, x))
      audio.currentTime = xToTime(dragX)
      updatePlaytime()
      if (wasPlayingBeforeDrag && audio.paused) audio.play().catch(() => {})
    }
  })

  on(window, 'mouseup', (e) => {
    if (!isDragging) return

    // A plain click seeks straight to the clicked point; movement beyond
    // SCRUB_START_THRESHOLD stays a normal drag/scrub.
    if (!dragMoved) {
      const rect = canvas.getBoundingClientRect()
      const clickX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left))
      dragX = clickX
      if (duration > 0) {
        audio.currentTime = xToTime(clickX)
        updatePlaytime()
      }
    }

    isDragging = false
    updateScrubCursorDirection()
    setEmailOverlayHidden(false)

    if (!dragMoved) {
      // Clicking the timeline seeks and continues playback rather than
      // toggling a playing track back to pause.
      audio.play().catch(() => {})
      draw()
    } else if (!wasPlayingBeforeDrag) {
      audio.pause()
    }
  })

  // Restore the overlay if the browser loses focus mid-drag.
  on(window, 'blur', () => {
    isDragging = false
    setEmailOverlayHidden(false)
  })

  on(
    window,
    'wheel',
    (e) => {
      e.preventDefault()
      wheelAccum += e.deltaY
      if (wheelAccum > SCROLL_THRESHOLD_DESKTOP) {
        switchTrack(currentIndex + 1)
        wheelAccum = 0
      } else if (wheelAccum < -SCROLL_THRESHOLD_DESKTOP) {
        switchTrack(currentIndex - 1)
        wheelAccum = 0
      }
    },
    { passive: false },
  )

  on(window, 'keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault()
      audio.paused ? playCurrentTrack() : audio.pause()
    }
  })

  // ==== TOUCH ====
  if ('ontouchstart' in window) {
    let initialTouchX = 0
    let initialTouchY = 0
    let gestureAxis = null

    on(
      canvas,
      'touchstart',
      (e) => {
        e.preventDefault()
        const touch = e.touches[0]
        initialTouchX = touch.clientX
        initialTouchY = touch.clientY
        gestureAxis = null
      },
      { passive: false },
    )

    on(
      canvas,
      'touchmove',
      (e) => {
        const touch = e.touches[0]
        if (!gestureAxis) {
          const dx = Math.abs(touch.clientX - initialTouchX)
          const dy = Math.abs(touch.clientY - initialTouchY)
          if (dx > 10 || dy > 10) gestureAxis = dx > dy ? 'x' : 'y'
          else return
        }
        if (gestureAxis === 'y') return
        if (!isDragging) {
          const rect = canvas.getBoundingClientRect()
          dragStartX = initialTouchX - rect.left
          dragX = dragStartX
          isDragging = true
          dragMoved = false
          wasPlayingBeforeDrag = !audio.paused
        }
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const x = touch.clientX - rect.left
        dragMoved = true
        setEmailOverlayHidden(true)
        dragX = Math.max(0, Math.min(canvas.width, x))
        audio.currentTime = xToTime(dragX)
        updatePlaytime()
        if (wasPlayingBeforeDrag && audio.paused) audio.play().catch(() => {})
      },
      { passive: false },
    )

    on(canvas, 'touchend', () => {
      if (isDragging) {
        isDragging = false
        setEmailOverlayHidden(false)
        if (gestureAxis === 'x') {
          if (!dragMoved) audio.paused ? playCurrentTrack() : audio.pause()
          else if (!wasPlayingBeforeDrag) audio.pause()
        }
      } else {
        audio.paused ? playCurrentTrack() : audio.pause()
      }
    })

    on(canvas, 'touchcancel', () => {
      isDragging = false
      setEmailOverlayHidden(false)
    })

    // Vertical-only swipe for track navigation.
    const navTarget = canvas.parentNode || document.body
    let navTouchStartY = 0

    on(
      navTarget,
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return
        const touch = e.touches[0]
        initialTouchX = touch.clientX
        initialTouchY = touch.clientY
        gestureAxis = null
        navTouchStartY = touch.clientY
        touchAccum = 0
      },
      { passive: false },
    )

    on(
      navTarget,
      'touchmove',
      (e) => {
        if (e.touches.length !== 1) return
        const touch = e.touches[0]
        if (!gestureAxis) {
          const dx = Math.abs(touch.clientX - initialTouchX)
          const dy = Math.abs(touch.clientY - initialTouchY)
          if (dx > 10 || dy > 10) gestureAxis = dx > dy ? 'x' : 'y'
          else return
        }
        if (gestureAxis !== 'y') return
        e.preventDefault()
        const y = touch.clientY
        touchAccum += navTouchStartY - y
        navTouchStartY = y
        if (touchAccum > SCROLL_THRESHOLD_MOBILE) {
          switchTrack(currentIndex + 1)
          touchAccum = 0
        } else if (touchAccum < -SCROLL_THRESHOLD_MOBILE) {
          switchTrack(currentIndex - 1)
          touchAccum = 0
        }
      },
      { passive: false },
    )
  }

  // ==== INIT ====
  resizeCanvas()
  updatePlaytime()
  renderPlaylist()
  if (isPlayable(tracks[currentIndex])) {
    loadAndDraw(tracks[currentIndex].file, false)
  }
  syncPlaybackOverlay()

  // ==== CLEANUP ====
  return () => {
    try { cancelAnimationFrame(animationFrameId) } catch { /* noop */ }
    try { audio.pause() } catch { /* noop */ }
    try { audio.src = '' } catch { /* noop */ }
    try { audio.load?.() } catch { /* noop */ }
    try { audioCtx.close() } catch { /* noop */ }
    document.body.classList.remove('nav-left', 'nav-right')
    off.forEach((fn) => fn())
  }
}
