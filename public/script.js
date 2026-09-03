// ==== CONFIGURABLE TIMELINE STYLE ====
const MOBILE_BREAKPOINT = 767;
const WAVEFORM_WIDTH_MULTIPLIER_DESKTOP = 1.6;
const WAVEFORM_WIDTH_MULTIPLIER_MOBILE = 1.8;
const SCROLL_THRESHOLD_DESKTOP = 150;
const SCROLL_THRESHOLD_MOBILE = 60;
const SCRUB_START_THRESHOLD = 4;
const DRIFT_CORRECTION_SECONDS = 0.12;

const tracks = [
  { title: 'The Machinist', file: '/assets/tracks/mp3/the-machinist.mp3' },
  { title: 'Hello', file: '/assets/tracks/mp3/hello.mp3' },
  { title: 'La Vie Est Belle', file: '/assets/tracks/mp3/la-vie-est-belle.mp3' },
  { title: 'Post Traumatic Season', file: '/assets/tracks/mp3/post-traumatic-season.mp3' },
  { title: 'Lost for Words', file: '/assets/tracks/mp3/lost-for-words.mp3' },
  { title: 'Game', file: '/assets/tracks/mp3/game.mp3' }
];

const waveformCanvas = document.getElementById('waveformCanvas');
const waveformCtx = waveformCanvas.getContext('2d');
const interactionLayer = document.getElementById('interactionLayer');
const playlistEl = document.getElementById('playlist');
const activeTrackBlend = document.getElementById('activeTrackBlend');
const emailOverlay = document.getElementById('emailOverlay');
const listenPrompt = document.getElementById('listenPrompt');
const previousTrackButton = document.getElementById('previousTrack');
const nextTrackButton = document.getElementById('nextTrack');
const playtimeEl = document.getElementById('playtime');

let currentIndex = 0;
let duration = 0;
let audio = new Audio();
let audioCtx = null;
let filteredData = [];
const samples = 6000;

let viewportWidth = window.innerWidth;
let viewportHeight = window.innerHeight;
let waveformWidth = 1;
let renderScale = Math.min(window.devicePixelRatio || 1, 2);
let waveformLoadId = 0;

let animationFrameId = null;
let requestedVisualFrameId = null;
let playbackAnchorTime = 0;
let playbackAnchorNow = performance.now();
let visualOverrideTime = null;
let pendingVisualTime = null;
let lastPlaytimeText = '';

let pointerActive = false;
let activePointerId = null;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerLastY = 0;
let pointerStartTime = 0;
let pointerAxis = null;
let pointerMoved = false;
let wasPlayingBeforeScroll = false;
let touchTrackAccum = 0;
let wheelTrackAccum = 0;
let wheelSessionActive = false;
let wheelWasPlaying = false;
let wheelTargetTime = null;
let wheelEndTimer = null;
let preservePlayingOverlayDuringScrub = false;

function isMobile() {
  return viewportWidth <= MOBILE_BREAKPOINT;
}

function getWaveformMultiplier() {
  return isMobile()
    ? WAVEFORM_WIDTH_MULTIPLIER_MOBILE
    : WAVEFORM_WIDTH_MULTIPLIER_DESKTOP;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getKnownDuration() {
  if (Number.isFinite(duration) && duration > 0) return duration;
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  return 0;
}

function syncPlaybackClock(time = audio.currentTime) {
  playbackAnchorTime = Number.isFinite(time) ? time : 0;
  playbackAnchorNow = performance.now();
}

function getVisualCurrentTime(now = performance.now()) {
  const knownDuration = getKnownDuration();

  if (Number.isFinite(visualOverrideTime)) {
    return knownDuration > 0
      ? clamp(visualOverrideTime, 0, knownDuration)
      : Math.max(0, visualOverrideTime);
  }

  // Hold an explicit seek/start position until the media element confirms that
  // playback is genuinely advancing. This prevents a one-frame snap backwards.
  if (Number.isFinite(pendingVisualTime)) {
    return knownDuration > 0
      ? clamp(pendingVisualTime, 0, knownDuration)
      : Math.max(0, pendingVisualTime);
  }

  if (audio.paused || audio.ended) {
    const pausedTime = Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : playbackAnchorTime;

    return knownDuration > 0
      ? clamp(pausedTime, 0, knownDuration)
      : Math.max(0, pausedTime);
  }

  const elapsed = Math.max(0, now - playbackAnchorNow) / 1000;
  const interpolated = playbackAnchorTime + elapsed * (audio.playbackRate || 1);

  return knownDuration > 0
    ? clamp(interpolated, 0, knownDuration)
    : Math.max(0, interpolated);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updatePlaytime(currentOverride = null) {
  const current = Number.isFinite(currentOverride)
    ? currentOverride
    : getVisualCurrentTime();
  const text = `${formatTime(current)} / ${formatTime(getKnownDuration())}`;

  if (text !== lastPlaytimeText) {
    playtimeEl.textContent = text;
    lastPlaytimeText = text;
  }
}

function syncPlaybackOverlay() {
  const isPlaying =
    (!audio.paused && !audio.ended) || preservePlayingOverlayDuringScrub;

  emailOverlay.classList.toggle('is-playing', isPlaying);
}

function setEmailOverlayHidden(isHidden) {
  emailOverlay.classList.toggle('is-hidden', isHidden);
}

function updateWaveformPosition(time = getVisualCurrentTime()) {
  const knownDuration = getKnownDuration();
  const progress = knownDuration > 0 ? clamp(time / knownDuration, 0, 1) : 0;

  // At 0:00 the waveform starts at the fixed centre playhead. At the end,
  // its final sample reaches the centre, matching the previous visual model.
  const translateX = viewportWidth / 2 - progress * waveformWidth;
  waveformCanvas.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

function visualFrame(now) {
  const visualTime = getVisualCurrentTime(now);
  updateWaveformPosition(visualTime);
  updatePlaytime(visualTime);
}

function requestVisualFrame() {
  if (animationFrameId !== null || requestedVisualFrameId !== null) return;

  requestedVisualFrameId = requestAnimationFrame(now => {
    requestedVisualFrameId = null;
    visualFrame(now);
  });
}

function cancelAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function animate(now) {
  visualFrame(now);
  animationFrameId = requestAnimationFrame(animate);
}

function startAnimation(anchorTime = audio.currentTime) {
  if (requestedVisualFrameId !== null) {
    cancelAnimationFrame(requestedVisualFrameId);
    requestedVisualFrameId = null;
  }

  cancelAnimation();
  syncPlaybackClock(anchorTime);
  animationFrameId = requestAnimationFrame(animate);
}

function playCurrentTrack() {
  const knownDuration = getKnownDuration();

  if (audio.ended || (knownDuration > 0 && audio.currentTime >= knownDuration)) {
    audio.currentTime = 0;
    syncPlaybackClock(0);
    updateWaveformPosition(0);
    updatePlaytime(0);
  }

  audio.play().catch(() => syncPlaybackOverlay());
}

function syncActiveTrackBlend() {
  const activeTrack = playlistEl.querySelector('.track.active');

  if (!activeTrack || !activeTrackBlend) {
    if (activeTrackBlend) activeTrackBlend.style.display = 'none';
    return;
  }

  const rect = activeTrack.getBoundingClientRect();
  const styles = window.getComputedStyle(activeTrack);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;

  activeTrackBlend.textContent = activeTrack.textContent;
  activeTrackBlend.style.left = `${rect.left + paddingLeft}px`;
  activeTrackBlend.style.top = `${rect.top}px`;
  activeTrackBlend.style.fontFamily = styles.fontFamily;
  activeTrackBlend.style.fontSize = styles.fontSize;
  activeTrackBlend.style.lineHeight = styles.lineHeight;
  activeTrackBlend.style.display = 'block';
}

function renderPlaylist() {
  playlistEl.innerHTML = '';

  tracks.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = `track${index === currentIndex ? ' active' : ''}`;
    item.textContent = `00${index + 1}`;
    item.title = track.title;
    item.addEventListener('click', () => switchTrack(index));
    playlistEl.appendChild(item);
  });

  requestAnimationFrame(syncActiveTrackBlend);
}

function resizeWaveformCanvas() {
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  renderScale = Math.min(window.devicePixelRatio || 1, 2);
  waveformWidth = Math.max(1, viewportWidth * getWaveformMultiplier());

  waveformCanvas.style.width = `${waveformWidth}px`;
  waveformCanvas.style.height = `${viewportHeight}px`;
  waveformCanvas.width = Math.max(1, Math.ceil(waveformWidth * renderScale));
  waveformCanvas.height = Math.max(1, Math.ceil(viewportHeight * renderScale));

  waveformCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  renderWaveform();
  updateWaveformPosition();
}

function renderWaveform() {
  waveformCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  waveformCtx.clearRect(0, 0, waveformWidth, viewportHeight);

  if (!filteredData.length) return;

  waveformCtx.strokeStyle = '#000';
  waveformCtx.lineWidth = 1;
  waveformCtx.beginPath();

  const sampleWidth = waveformWidth / Math.max(1, filteredData.length - 1);
  const midY = viewportHeight / 2;

  for (let index = 0; index < filteredData.length; index += 1) {
    const sample = filteredData[index];
    const x = index * sampleWidth;

    waveformCtx.moveTo(x, midY - sample.positive * midY);
    waveformCtx.lineTo(x, midY - sample.negative * midY);
  }

  waveformCtx.stroke();
}

function attachAudioEvents() {
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration = audio.duration;
    }
    syncPlaybackClock();
    updatePlaytime();
    requestVisualFrame();
  });

  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration = audio.duration;
    }
    updatePlaytime();
    requestVisualFrame();
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.paused && !audio.ended && !Number.isFinite(pendingVisualTime)) {
      const visualTime = getVisualCurrentTime();
      const mediaIsAheadBy = audio.currentTime - visualTime;

      // Correct forward drift only. A backward correction is visually perceived
      // as the playhead falling back, especially just after play or a seek.
      if (mediaIsAheadBy > DRIFT_CORRECTION_SECONDS) {
        syncPlaybackClock(audio.currentTime);
      }
    }
    updatePlaytime();
  });

  audio.addEventListener('seeking', () => {
    if (!Number.isFinite(pendingVisualTime)) syncPlaybackClock(audio.currentTime);
  });

  audio.addEventListener('seeked', () => {
    const seekTime = Number.isFinite(pendingVisualTime)
      ? pendingVisualTime
      : audio.currentTime;

    syncPlaybackClock(seekTime);

    // When remaining paused after a seek, the seek is complete and the held
    // position can safely be released. During resumed playback, `playing`
    // performs that handoff instead.
    if (audio.paused) {
      pendingVisualTime = null;
      requestVisualFrame();
    }
  });

  // `play` only means playback was requested. The browser may still be
  // buffering, so keep the visual stationary until `playing` fires.
  audio.addEventListener('play', () => {
    syncPlaybackOverlay();
    requestVisualFrame();
  });

  audio.addEventListener('playing', () => {
    const startTime = Number.isFinite(pendingVisualTime)
      ? pendingVisualTime
      : audio.currentTime;

    visualOverrideTime = null;
    pendingVisualTime = null;
    syncPlaybackOverlay();
    startAnimation(startTime);
  });

  audio.addEventListener('waiting', () => {
    if (audio.paused || audio.ended) return;

    pendingVisualTime = getVisualCurrentTime();
    cancelAnimation();
    requestVisualFrame();
  });

  audio.addEventListener('stalled', () => {
    if (audio.paused || audio.ended) return;

    pendingVisualTime = getVisualCurrentTime();
    cancelAnimation();
    requestVisualFrame();
  });

  audio.addEventListener('pause', () => {
    syncPlaybackClock();
    cancelAnimation();
    syncPlaybackOverlay();
    requestVisualFrame();
  });

  audio.addEventListener('ended', () => {
    pendingVisualTime = null;
    syncPlaybackClock(getKnownDuration());
    cancelAnimation();
    syncPlaybackOverlay();
    updateWaveformPosition(getKnownDuration());
    updatePlaytime(getKnownDuration());
  });
}

async function decodeWaveform(src, requestId) {
  try {
    if (audioCtx && audioCtx.state !== 'closed') {
      await audioCtx.close().catch(() => {});
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Could not load audio: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);

    if (requestId !== waveformLoadId) return;

    duration = buffer.duration;
    const channelData = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / samples));
    const nextFilteredData = [];

    for (let i = 0; i < samples; i += 1) {
      let maxPositive = 0;
      let maxNegative = 0;
      const blockStart = i * blockSize;
      const blockEnd = Math.min(channelData.length, blockStart + blockSize);

      for (let j = blockStart; j < blockEnd; j += 1) {
        const value = channelData[j];
        if (value > maxPositive) maxPositive = value;
        if (value < maxNegative) maxNegative = value;
      }

      nextFilteredData.push({ positive: maxPositive, negative: maxNegative });
    }

    filteredData = nextFilteredData;
    renderWaveform();
    updatePlaytime();
    requestVisualFrame();
  } catch (error) {
    console.error('Waveform loading failed:', error);
  }
}

function loadAndDraw(src, autoplay = false) {
  cancelAnimation();
  audio.pause();

  waveformLoadId += 1;
  const requestId = waveformLoadId;

  duration = 0;
  filteredData = [];
  visualOverrideTime = 0;
  pendingVisualTime = 0;
  waveformCtx.clearRect(0, 0, waveformWidth, viewportHeight);

  audio = new Audio(src);
  audio.crossOrigin = 'anonymous';
  attachAudioEvents();
  syncPlaybackClock(0);

  updateWaveformPosition(0);
  updatePlaytime(0);
  syncPlaybackOverlay();
  decodeWaveform(src, requestId);

  if (autoplay) {
    audio.play().catch(() => syncPlaybackOverlay());
  }
}

function switchTrack(index) {
  if (index < 0 || index >= tracks.length) return;

  currentIndex = index;
  renderPlaylist();
  loadAndDraw(tracks[index].file, true);
}

function commitSeek(time) {
  const knownDuration = getKnownDuration();
  if (knownDuration <= 0) return;

  const nextTime = clamp(time, 0, knownDuration);
  pendingVisualTime = nextTime;
  audio.currentTime = nextTime;
  syncPlaybackClock(nextTime);
  updateWaveformPosition(nextTime);
  updatePlaytime(nextTime);
}

function beginHorizontalScrub() {
  preservePlayingOverlayDuringScrub = wasPlayingBeforeScroll;
  syncPlaybackOverlay();
  setEmailOverlayHidden(true);

  if (wasPlayingBeforeScroll && !audio.paused) {
    audio.pause();
  }
}

function finishScrubOverlay(shouldResumePlayback) {
  const revealOverlay = () => {
    preservePlayingOverlayDuringScrub = false;
    setEmailOverlayHidden(false);
    syncPlaybackOverlay();
  };

  if (!shouldResumePlayback) {
    revealOverlay();
    requestVisualFrame();
    return;
  }

  audio.play().then(revealOverlay).catch(revealOverlay);
}

function resetPointerState() {
  if (activePointerId !== null && interactionLayer.hasPointerCapture(activePointerId)) {
    interactionLayer.releasePointerCapture(activePointerId);
  }

  pointerActive = false;
  activePointerId = null;
  pointerAxis = null;
  pointerMoved = false;
  touchTrackAccum = 0;
  interactionLayer.classList.remove('is-scrolling');
}

interactionLayer.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  pointerActive = true;
  activePointerId = event.pointerId;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  pointerLastY = event.clientY;
  pointerStartTime = getVisualCurrentTime();
  pointerAxis = null;
  pointerMoved = false;
  touchTrackAccum = 0;
  wasPlayingBeforeScroll = !audio.paused;

  interactionLayer.setPointerCapture(event.pointerId);
  interactionLayer.classList.add('is-scrolling');
  event.preventDefault();
});

interactionLayer.addEventListener('pointermove', event => {
  if (!pointerActive || event.pointerId !== activePointerId) return;

  const totalX = event.clientX - pointerStartX;
  const totalY = event.clientY - pointerStartY;

  if (!pointerAxis) {
    if (Math.abs(totalX) < SCRUB_START_THRESHOLD && Math.abs(totalY) < SCRUB_START_THRESHOLD) {
      return;
    }

    pointerAxis = Math.abs(totalX) >= Math.abs(totalY) ? 'x' : 'y';
    if (pointerAxis === 'x') beginHorizontalScrub();
  }

  if (pointerAxis === 'x') {
    pointerMoved = true;
    const knownDuration = getKnownDuration();

    if (knownDuration > 0 && waveformWidth > 0) {
      visualOverrideTime = clamp(
        pointerStartTime + (-totalX / waveformWidth) * knownDuration,
        0,
        knownDuration
      );
      requestVisualFrame();
    }

    event.preventDefault();
    return;
  }

  if (pointerAxis === 'y' && event.pointerType !== 'mouse') {
    const movementY = pointerLastY - event.clientY;
    pointerLastY = event.clientY;
    touchTrackAccum += movementY;

    if (touchTrackAccum > SCROLL_THRESHOLD_MOBILE) {
      switchTrack((currentIndex + 1) % tracks.length);
      touchTrackAccum = 0;
    } else if (touchTrackAccum < -SCROLL_THRESHOLD_MOBILE) {
      switchTrack((currentIndex - 1 + tracks.length) % tracks.length);
      touchTrackAccum = 0;
    }

    event.preventDefault();
  }
});

function finishPointerInteraction(event) {
  if (!pointerActive || event.pointerId !== activePointerId) return;

  const didScrollHorizontally = pointerMoved && pointerAxis === 'x';
  const finalTime = Number.isFinite(visualOverrideTime)
    ? visualOverrideTime
    : getVisualCurrentTime();

  resetPointerState();

  if (didScrollHorizontally) {
    commitSeek(finalTime);
    visualOverrideTime = null;
    finishScrubOverlay(wasPlayingBeforeScroll);
    return;
  }

  visualOverrideTime = null;
  if (audio.paused) playCurrentTrack();
  else audio.pause();
}

interactionLayer.addEventListener('pointerup', finishPointerInteraction);
interactionLayer.addEventListener('pointercancel', event => {
  visualOverrideTime = null;
  pendingVisualTime = null;
  resetPointerState();
  preservePlayingOverlayDuringScrub = false;
  setEmailOverlayHidden(false);
  syncPlaybackOverlay();
  requestVisualFrame();
});

window.addEventListener('blur', () => {
  visualOverrideTime = null;
  pendingVisualTime = null;
  resetPointerState();
  preservePlayingOverlayDuringScrub = false;
  setEmailOverlayHidden(false);
  syncPlaybackOverlay();
  requestVisualFrame();
});

function finishWheelScrub() {
  if (!wheelSessionActive) return;

  const finalTime = Number.isFinite(wheelTargetTime)
    ? wheelTargetTime
    : getVisualCurrentTime();

  commitSeek(finalTime);
  visualOverrideTime = null;
  wheelTargetTime = null;
  wheelSessionActive = false;
  finishScrubOverlay(wheelWasPlaying);
}

window.addEventListener('wheel', event => {
  const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
  event.preventDefault();

  if (horizontalIntent) {
    const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
    const knownDuration = getKnownDuration();

    if (knownDuration <= 0 || waveformWidth <= 0) return;

    if (!wheelSessionActive) {
      wheelSessionActive = true;
      wheelWasPlaying = !audio.paused;
      wheelTargetTime = getVisualCurrentTime();
      preservePlayingOverlayDuringScrub = wheelWasPlaying;
      syncPlaybackOverlay();
      setEmailOverlayHidden(true);
      if (wheelWasPlaying) audio.pause();
    }

    wheelTargetTime = clamp(
      wheelTargetTime + (horizontalDelta / waveformWidth) * knownDuration,
      0,
      knownDuration
    );
    visualOverrideTime = wheelTargetTime;
    requestVisualFrame();

    clearTimeout(wheelEndTimer);
    wheelEndTimer = setTimeout(finishWheelScrub, 120);
    return;
  }

  wheelTrackAccum += event.deltaY;

  if (wheelTrackAccum > SCROLL_THRESHOLD_DESKTOP) {
    switchTrack((currentIndex + 1) % tracks.length);
    wheelTrackAccum = 0;
  } else if (wheelTrackAccum < -SCROLL_THRESHOLD_DESKTOP) {
    switchTrack((currentIndex - 1 + tracks.length) % tracks.length);
    wheelTrackAccum = 0;
  }
}, { passive: false });

listenPrompt.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  playCurrentTrack();
});

previousTrackButton.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  switchTrack((currentIndex - 1 + tracks.length) % tracks.length);
});

nextTrackButton.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  switchTrack((currentIndex + 1) % tracks.length);
});

window.addEventListener('keydown', event => {
  if (event.code === 'Space') {
    event.preventDefault();
    audio.paused ? playCurrentTrack() : audio.pause();
  }
});

window.addEventListener('resize', () => {
  resizeWaveformCanvas();
  requestAnimationFrame(syncActiveTrackBlend);
});

resizeWaveformCanvas();
renderPlaylist();

if (document.fonts?.ready) {
  document.fonts.ready.then(() => requestAnimationFrame(syncActiveTrackBlend));
}
updatePlaytime(0);
loadAndDraw(tracks[0].file, false);
syncPlaybackOverlay();
