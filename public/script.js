// script.js

// ==== CONFIGURABLE PLAYHEAD STYLE ====
const PLAYHEAD_COLOR = '#666';
const MOBILE_BREAKPOINT = 767;
const PLAYHEAD_WIDTH_DESKTOP = 1.5;
const PLAYHEAD_WIDTH_MOBILE  = 2;

function getPlayheadWidth() {
  return window.innerWidth <= MOBILE_BREAKPOINT
    ? PLAYHEAD_WIDTH_MOBILE
    : PLAYHEAD_WIDTH_DESKTOP;
}

const tracks = [
  { title: 'Game',                  file: '/assets/tracks/mp3/game.mp3' },
  { title: 'The Machinist',         file: '/assets/tracks/mp3/the-machinist.mp3' },
  { title: 'hello',                 file: '/assets/tracks/mp3/hello.mp3' },
  { title: 'la vie est belle',      file: '/assets/tracks/mp3/la-vie-est-belle.mp3' },
  { title: 'Post Traumatic Season', file: '/assets/tracks/mp3/post-traumatic-season.mp3' },
  { title: 'Lost for Words',        file: '/assets/tracks/mp3/lost-for-words.mp3' }
];

let currentIndex = 0,
    duration     = 0;

// --- SCROLL/SWIPE THRESHOLDS ---
const SCROLL_THRESHOLD_DESKTOP = 150;
const SCROLL_THRESHOLD_MOBILE  = 60;
const SCRUB_START_THRESHOLD     = 2; // px before a click becomes a drag

const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const playlistEl   = document.getElementById('playlist');
const emailOverlay = document.getElementById('emailOverlay');
const listenPrompt = document.getElementById('listenPrompt');
const previousTrackButton = document.getElementById('previousTrack');
const nextTrackButton     = document.getElementById('nextTrack');
const emailLink    = document.getElementById('emailLink');
const playtimeEl   = document.getElementById('playtime');

let audio         = new Audio();
let audioCtx      = new (window.AudioContext || window.webkitAudioContext)();
let filteredData  = [];
const samples     = 6000;
let animationFrameId;
let hasInteracted = false;

// drag/playhead state
let isDragging            = false;
let wasPlayingBeforeDrag  = false;
let dragStartX            = 0;
let dragX                 = 0;
let dragMoved             = false;

// Native directional cursor state
let pointerClientX       = window.innerWidth;
let cursorDirection      = 'right';

// The centre switches between the transport controls and the email:
// - paused / ended: BACK — PLAY — NEXT
// - playing: email address
// The entire overlay still hides temporarily while the playhead is dragged.
function revealEmail() {
  hasInteracted = true;
}

function syncPlaybackOverlay() {
  const isPlaying = !audio.paused && !audio.ended;
  emailOverlay.classList.toggle('is-playing', isPlaying);
}

function setEmailOverlayHidden(isHidden) {
  emailOverlay.classList.toggle('is-hidden', isHidden);
}

function playCurrentTrack() {
  revealEmail();

  if (audio.ended || (duration > 0 && audio.currentTime >= duration)) {
    audio.currentTime = 0;
    updatePlaytime();
  }

  audio.play().catch(() => {
    syncPlaybackOverlay();
  });
}

// Start playback directly inside the button handler so browser autoplay
// policies recognize the visitor's action.
listenPrompt.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  playCurrentTrack();
});

previousTrackButton.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();

  revealEmail();
  switchTrack((currentIndex - 1 + tracks.length) % tracks.length);
});

nextTrackButton.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();

  revealEmail();
  switchTrack((currentIndex + 1) % tracks.length);
});

// desktop wheel accumulator for track nav
let wheelAccum            = 0;

// for vertical swipe nav on mobile
let touchStartY           = 0;
let touchAccum            = 0;

// --- Playback Time Display ---
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updatePlaytime() {
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const total = Number.isFinite(duration) && duration > 0
    ? duration
    : (Number.isFinite(audio.duration) ? audio.duration : 0);

  playtimeEl.textContent = `${formatTime(current)} / ${formatTime(total)}`;
}

// --- Canvas Resize + Init ---
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
  updateScrubCursorDirection();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Playlist UI ---
function renderPlaylist() {
  playlistEl.innerHTML = '';
  tracks.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'track' + (i === currentIndex ? ' active' : '');
    div.textContent = '00' + (i + 1);
    div.onclick = () => {
      revealEmail();
      switchTrack(i);
    };
    playlistEl.appendChild(div);
  });
}

// --- Track Switching + Audio Loading ---
function switchTrack(index) {
  if (index < 0 || index >= tracks.length) return;
  currentIndex = index;
  renderPlaylist();
  loadAndDraw(tracks[index].file, true);
}

function loadAndDraw(src, autoplay = false) {
  audio.pause();
  duration = 0;
  audio = new Audio(src);
  audio.crossOrigin = 'anonymous';
  updatePlaytime();

  audio.addEventListener('loadedmetadata', updatePlaytime);
  audio.addEventListener('durationchange', updatePlaytime);
  audio.addEventListener('timeupdate', updatePlaytime);
  audio.addEventListener('play', syncPlaybackOverlay);
  audio.addEventListener('pause', syncPlaybackOverlay);
  audio.addEventListener('ended', () => {
    updatePlaytime();
    syncPlaybackOverlay();
    draw();
  });
  audioCtx.close().then(() => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    fetch(src)
      .then(r => r.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(buffer => {
        duration = buffer.duration;
        updatePlaytime();
        const data = buffer.getChannelData(0);
        const blockSize = Math.floor(data.length / samples);
        filteredData = [];
        for (let i = 0; i < samples; i++) {
          let maxPos = 0, maxNeg = 0;
          for (let j = 0; j < blockSize; j++) {
            const v = data[i * blockSize + j];
            if (v > maxPos) maxPos = v;
            if (v < maxNeg) maxNeg = v;
          }
          filteredData.push({ positive: maxPos, negative: maxNeg });
        }
        draw();
      });
  });
  audio.onplay = () => {
    syncPlaybackOverlay();
    animate();
  };
  audio.onpause = () => {
    cancelAnimationFrame(animationFrameId);
    draw();
    syncPlaybackOverlay();
  };
  syncPlaybackOverlay();

  if (autoplay) {
    audio.play().catch(() => {
      syncPlaybackOverlay();
    });
  }
}

// --- Time<->X Conversion ---
function xToTime(x) {
  return duration > 0 ? (x / canvas.width) * duration : 0;
}

function timeToX(time) {
  return duration > 0 ? (time / duration) * canvas.width : 0;
}

function getPlayheadX() {
  const x = isDragging ? dragX : timeToX(audio.currentTime);
  return Math.max(0, Math.min(canvas.width, Number.isFinite(x) ? x : 0));
}

function updateScrubCursorDirection() {
  const rect = canvas.getBoundingClientRect();
  const pointerX = pointerClientX - rect.left;
  const scaleX = canvas.width > 0 ? rect.width / canvas.width : 1;
  const playheadX = getPlayheadX() * scaleX;
  const difference = pointerX - playheadX;

  // Keep the previous direction in the one-pixel neutral zone so the cursor
  // does not rapidly alternate when it sits directly on the playhead.
  if (Math.abs(difference) > 1) {
    cursorDirection = difference < 0 ? 'left' : 'right';
  }

  document.body.classList.toggle('nav-left', cursorDirection === 'left');
  document.body.classList.toggle('nav-right', cursorDirection === 'right');
}

// Track the pointer position over the waveform. The animation loop also calls
// updateScrubCursorDirection(), so the native cursor flips if the moving
// playhead passes underneath a stationary pointer.
canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  pointerClientX = event.clientX;
  updateScrubCursorDirection();
}, { passive: true });

// --- Draw Waveform + Playhead ---
function draw() {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!filteredData.length) return;

  // waveform
  const mid = canvas.height / 2;
  const w   = canvas.width / filteredData.length;
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 1;
  filteredData.forEach((v, i) => {
    const x = i * w;
    ctx.beginPath();
    ctx.moveTo(x, mid);
    ctx.lineTo(x, mid - v.positive * mid);
    ctx.moveTo(x, mid);
    ctx.lineTo(x, mid - v.negative * mid);
    ctx.stroke();
  });

  // playhead
  const px = getPlayheadX();
  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth   = getPlayheadWidth();
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, canvas.height);
  ctx.stroke();

  // reset
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 1;
}

// --- Animation Loop ---
function animate() {
  draw();
  updatePlaytime();
  updateScrubCursorDirection();
  animationFrameId = requestAnimationFrame(animate);
}

// --- Desktop Mouse & Wheel Controls ---
canvas.onmousedown = e => {
  const rect = canvas.getBoundingClientRect();
  dragStartX = e.clientX - rect.left;
  dragX      = dragStartX;
  isDragging = true;
  dragMoved  = false;
  wasPlayingBeforeDrag = !audio.paused;
  updateScrubCursorDirection();
};
window.onmousemove = e => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (Math.abs(x - dragStartX) > SCRUB_START_THRESHOLD) {
    if (!dragMoved) {
      dragMoved = true;
      revealEmail();
      setEmailOverlayHidden(true);
    }
    dragX = Math.max(0, Math.min(canvas.width, x));
    audio.currentTime = xToTime(dragX);
    updatePlaytime();
    if (wasPlayingBeforeDrag && audio.paused) audio.play().catch(() => {});
  }
};
window.onmouseup = e => {
  if (!isDragging) return;

  // A desktop click seeks directly to the clicked point. A movement beyond
  // SCRUB_START_THRESHOLD remains a normal drag/scrub interaction.
  if (!dragMoved) {
    const rect = canvas.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    dragX = clickX;

    if (duration > 0) {
      audio.currentTime = xToTime(clickX);
      updatePlaytime();
    }
  }

  isDragging = false;
  updateScrubCursorDirection();
  revealEmail();
  setEmailOverlayHidden(false);

  if (!dragMoved) {
    // Clicking the timeline should seek and start/continue playback, rather
    // than toggling a track that is already playing back to pause.
    audio.play().catch(() => {});
    draw();
  } else if (!wasPlayingBeforeDrag) {
    audio.pause();
  }
};
// Restore the email overlay if the browser loses focus during a drag.
window.addEventListener('blur', () => {
  isDragging = false;
  setEmailOverlayHidden(false);
});

// wheel scroll for desktop track nav
window.addEventListener('wheel', e => {
  e.preventDefault();
  wheelAccum += e.deltaY;
  if (wheelAccum > SCROLL_THRESHOLD_DESKTOP) {
    switchTrack(currentIndex + 1);
    wheelAccum = 0;
  } else if (wheelAccum < -SCROLL_THRESHOLD_DESKTOP) {
    switchTrack(currentIndex - 1);
    wheelAccum = 0;
  }
}, { passive: false });
// spacebar play/pause
window.onkeydown = e => {
  if (e.code === 'Space') {
    e.preventDefault();
    audio.paused ? playCurrentTrack() : audio.pause();
  }
};

// --- Mobile-Only Touch Handlers ---
if ('ontouchstart' in window) {
  let initialTouchX = 0,
      initialTouchY = 0,
      gestureAxis   = null;

  // reset drag state on new touch
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    initialTouchX = touch.clientX;
    initialTouchY = touch.clientY;
    gestureAxis   = null;
    // don't start drag until we detect horizontal movement
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    const touch = e.touches[0];
    // determine axis
    if (!gestureAxis) {
      const dx = Math.abs(touch.clientX - initialTouchX);
      const dy = Math.abs(touch.clientY - initialTouchY);
      if (dx > 10 || dy > 10) gestureAxis = dx > dy ? 'x' : 'y';
      else return;
    }
    // if vertical, bail out
    if (gestureAxis === 'y') return;
    // horizontal → initialize drag on first move
    if (!isDragging) {
      const rect = canvas.getBoundingClientRect();
      dragStartX           = initialTouchX - rect.left;
      dragX                = dragStartX;
      isDragging           = true;
      dragMoved            = false;
      wasPlayingBeforeDrag = !audio.paused;
    }
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x    = touch.clientX - rect.left;
    dragMoved = true;
    revealEmail();
    setEmailOverlayHidden(true);
    dragX     = Math.max(0, Math.min(canvas.width, x));
    audio.currentTime = xToTime(dragX);
    updatePlaytime();
    if (wasPlayingBeforeDrag && audio.paused) audio.play().catch(() => {});
  }, { passive: false });

  // touchend: handle tap or finish drag
  canvas.addEventListener('touchend', e => {
    if (isDragging) {
      isDragging = false;
      revealEmail();
      setEmailOverlayHidden(false);
      if (gestureAxis === 'x') {
        if (!dragMoved) audio.paused ? playCurrentTrack() : audio.pause();
        else if (!wasPlayingBeforeDrag) audio.pause();
      }
    } else {
      // no drag initiated → treat as tap
      revealEmail();
      audio.paused ? playCurrentTrack() : audio.pause();
    }
  });

  canvas.addEventListener('touchcancel', () => {
    isDragging = false;
    setEmailOverlayHidden(false);
  });

  // Vertical-only swipe for track nav
  let navTouchStartY = 0;
  canvas.parentNode.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    initialTouchX = touch.clientX;
    initialTouchY = touch.clientY;
    gestureAxis   = null;
    navTouchStartY = touch.clientY;
    touchAccum  = 0;
  }, { passive: false });

  canvas.parentNode.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!gestureAxis) {
      const dx = Math.abs(touch.clientX - initialTouchX);
      const dy = Math.abs(touch.clientY - initialTouchY);
      if (dx > 10 || dy > 10) gestureAxis = dx > dy ? 'x' : 'y';
      else return;
    }
    if (gestureAxis !== 'y') return;
    e.preventDefault();
    const y = touch.clientY;
    touchAccum += (navTouchStartY - y);
    navTouchStartY = y;
    if (touchAccum > SCROLL_THRESHOLD_MOBILE) {
      switchTrack(currentIndex + 1);
      touchAccum = 0;
    } else if (touchAccum < -SCROLL_THRESHOLD_MOBILE) {
      switchTrack(currentIndex - 1);
      touchAccum = 0;
    }
  }, { passive: false });
}

// --- Initialize ---
updatePlaytime();
renderPlaylist();
loadAndDraw(tracks[0].file, false);
syncPlaybackOverlay();
