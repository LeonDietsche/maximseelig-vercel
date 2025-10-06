// src/script.js
export function initMaxim({
  canvas,
  playlistEl,
  emailEl,
  tracks,
  playheadColor = '#111',
  playheadWidth = 0.5,
}) {
  if (!canvas || !playlistEl || !emailEl || !tracks?.length) return () => {}

  // --- helpers about track playability ---
  const isPlayable = (t) => t && t.file && !t.unreleased
  const findNextPlayable = (from, dir) => {
    let i = from
    while (true) {
      i += dir
      if (i < 0 || i >= tracks.length) return from // none found → stay
      if (isPlayable(tracks[i])) return i
    }
  }

  // ==== STATE ====
  let currentIndex = findNextPlayable(-1, 1) // first playable
  let duration = 0

  const SCROLL_THRESHOLD_DESKTOP = 150
  const SCROLL_THRESHOLD_MOBILE = 60

  const ctx = canvas.getContext('2d')
  let audio = new Audio()
  let audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  let filteredData = []
  const samples = 1000
  let animationFrameId

  // drag/playhead
  let isDragging = false
  let wasPlayingBeforeDrag = false
  let dragStartX = 0
  let dragX = 0
  let dragMoved = false

  let wheelAccum = 0
  let touchAccum = 0

  const off = []
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts)
    off.push(() => target.removeEventListener(type, fn, opts))
  }

  // --- Canvas resize ---
  function resizeCanvas() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    draw()
  }
  on(window, 'resize', resizeCanvas)
  resizeCanvas()

  // --- Playlist UI (now shows number + title + "UNRELEASED" badge) ---
  function renderPlaylist() {
    playlistEl.innerHTML = ''
    tracks.forEach((t, i) => {
      const playable = isPlayable(t)
      const div = document.createElement('div')
  
      // Nur 'track' + 'active' Klasse, keine 'unreleased' Klasse mehr
      div.className = 'track' + (i === currentIndex ? ' active' : '')
  
      const num = String(i + 1).padStart(3, '0')
  
      // Nur die Nummer anzeigen – kein Titel, kein Badge, kein title-Attribut
      div.innerHTML = `<span class="num">${num}</span>`
  
      // Klick nur wenn abspielbar
      if (playable) div.onclick = () => switchTrack(i)
  
      playlistEl.appendChild(div)
    })
  }
  

  // --- Track switch (skips unreleased) ---
  function switchTrack(requestedIndex) {
    if (requestedIndex === currentIndex) return
    let idx = requestedIndex
    if (!isPlayable(tracks[idx])) {
      const dir = requestedIndex > currentIndex ? 1 : -1
      idx = findNextPlayable(currentIndex, dir)
      if (idx === currentIndex) return
    }
    currentIndex = idx
    renderPlaylist()
    loadAndDraw(tracks[idx].file, true)
  }

  function loadAndDraw(src, autoplay = false) {
    try { audio.pause() } catch {}
    audio = new Audio(src)
    audio.crossOrigin = 'anonymous'

    audioCtx.close().catch(() => {}).finally(() => {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      fetch(src)
        .then(r => r.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(buffer => {
          duration = buffer.duration
          const data = buffer.getChannelData(0)
          const blockSize = Math.floor(data.length / samples)
          filteredData = []
          for (let i = 0; i < samples; i++) {
            let maxPos = 0, maxNeg = 0
            for (let j = 0; j < blockSize; j++) {
              const v = data[i * blockSize + j]
              if (v > maxPos) maxPos = v
              if (v < maxNeg) maxNeg = v
            }
            filteredData.push({ positive: maxPos, negative: maxNeg })
          }
          draw()
          if (autoplay) audio.play().catch(() => {})
        })
    })

    audio.onplay = animate
    audio.onpause = () => { cancelAnimationFrame(animationFrameId); draw() }
  }

  const xToTime = x => (x / canvas.width) * duration
  const timeToX = t => (t / duration) * canvas.width

  function draw() {
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!filteredData.length) return

    const mid = canvas.height / 2
    const w = canvas.width / filteredData.length
    ctx.strokeStyle = '#333'
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

    const px = isDragging ? dragX : timeToX(audio.currentTime)
    ctx.strokeStyle = playheadColor
    ctx.lineWidth = playheadWidth
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, canvas.height)
    ctx.stroke()

    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
  }

  function animate() {
    draw()
    animationFrameId = requestAnimationFrame(animate)
  }

  // --- Desktop interactions ---
  const mDown = e => {
    const r = canvas.getBoundingClientRect()
    dragStartX = e.clientX - r.left
    dragX = dragStartX
    isDragging = true
    dragMoved = false
    wasPlayingBeforeDrag = !audio.paused
  }
  const mMove = e => {
    if (!isDragging) return
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left
    if (Math.abs(x - dragStartX) > 0) {
      dragMoved = true
      dragX = Math.max(0, Math.min(canvas.width, x))
      audio.currentTime = xToTime(dragX)
      if (wasPlayingBeforeDrag && audio.paused) audio.play().catch(() => {})
    }
  }
  const mUp = () => {
    if (!isDragging) return
    isDragging = false
    if (!dragMoved) audio.paused ? audio.play() : audio.pause()
    else if (!wasPlayingBeforeDrag) audio.pause()
  }
  const onWheel = e => {
    e.preventDefault()
    wheelAccum += e.deltaY
    if (wheelAccum > SCROLL_THRESHOLD_DESKTOP) { switchTrack(currentIndex + 1); wheelAccum = 0 }
    else if (wheelAccum < -SCROLL_THRESHOLD_DESKTOP) { switchTrack(currentIndex - 1); wheelAccum = 0 }
  }
  const onKey = e => {
    if (e.code === 'Space') { e.preventDefault(); audio.paused ? audio.play() : audio.pause() }
  }

  on(canvas, 'mousedown', mDown)
  on(window, 'mousemove', mMove)
  on(window, 'mouseup', mUp)
  on(window, 'wheel', onWheel, { passive: false })
  on(window, 'keydown', onKey)

  // --- Inactivity overlay ---
  const activity = () => {
    emailEl.style.opacity = 0
    clearTimeout(window._inact)
    window._inact = setTimeout(() => { emailEl.style.opacity = 1 }, 1000)
  }
  ;['mousedown','mousemove','keydown','touchstart'].forEach(ev => on(window, ev, activity))

  // --- Mobile touch ---
  if ('ontouchstart' in window) {
    let initialTouchX = 0, initialTouchY = 0, gestureAxis = null
    const tStart = e => {
      e.preventDefault()
      const t = e.touches[0]
      initialTouchX = t.clientX
      initialTouchY = t.clientY
      gestureAxis = null
    }
    const tMove = e => {
      const t = e.touches[0]
      if (!gestureAxis) {
        const dx = Math.abs(t.clientX - initialTouchX)
        const dy = Math.abs(t.clientY - initialTouchY)
        if (dx > 10 || dy > 10) gestureAxis = dx > dy ? 'x' : 'y'
        else return
      }
      if (gestureAxis === 'y') return
      if (!isDragging) {
        const r = canvas.getBoundingClientRect()
        dragStartX = initialTouchX - r.left
        dragX = dragStartX
        isDragging = true
        dragMoved = false
        wasPlayingBeforeDrag = !audio.paused
      }
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const x = t.clientX - r.left
      dragMoved = true
      dragX = Math.max(0, Math.min(canvas.width, x))
      audio.currentTime = xToTime(dragX)
      if (wasPlayingBeforeDrag && audio.paused) audio.play().catch(() => {})
    }
    const tEnd = () => {
      if (isDragging) {
        isDragging = false
        if (!dragMoved) audio.paused ? audio.play() : audio.pause()
        else if (!wasPlayingBeforeDrag) audio.pause()
      } else {
        audio.paused ? audio.play() : audio.pause()
      }
    }

    let navTouchStartY = 0
    let gestureAxis2 = null
    let initialX2 = 0, initialY2 = 0
    const navStart = e => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      initialX2 = t.clientX
      initialY2 = t.clientY
      gestureAxis2 = null
      navTouchStartY = t.clientY
      touchAccum = 0
    }
    const navMove = e => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (!gestureAxis2) {
        const dx = Math.abs(t.clientX - initialX2)
        const dy = Math.abs(t.clientY - initialY2)
        if (dx > 10 || dy > 10) gestureAxis2 = dx > dy ? 'x' : 'y'
        else return
      }
      if (gestureAxis2 !== 'y') return
      e.preventDefault()
      const y = t.clientY
      touchAccum += (navTouchStartY - y)
      navTouchStartY = y
      if (touchAccum > SCROLL_THRESHOLD_MOBILE) { switchTrack(currentIndex + 1); touchAccum = 0 }
      else if (touchAccum < -SCROLL_THRESHOLD_MOBILE) { switchTrack(currentIndex - 1); touchAccum = 0 }
    }

    on(canvas, 'touchstart', tStart, { passive: false })
    on(canvas, 'touchmove', tMove, { passive: false })
    on(canvas, 'touchend', tEnd)
    on(canvas.parentNode || document.body, 'touchstart', navStart, { passive: false })
    on(canvas.parentNode || document.body, 'touchmove', navMove, { passive: false })
  }

  // init
  renderPlaylist()
  if (isPlayable(tracks[currentIndex])) loadAndDraw(tracks[currentIndex].file, false)

  // cleanup
  return () => {
    try { cancelAnimationFrame(animationFrameId) } catch {}
    try { audio.pause() } catch {}
    try { audio.src = '' } catch {}
    try { audio.load?.() } catch {}
    try { audioCtx.close() } catch {}
    off.forEach(fn => fn())
  }
}
