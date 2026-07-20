/**
 * Tenutino — the movable Tutor companion that lives above the score.
 *
 * The component owns only presentation and movement state. Musical context is
 * supplied by editor-view after compile(), so Tenutino never invents measure
 * positions or mutates progression state.
 */

import { resolveParkourMotion } from '../sheet-music/parkour.js';

export const TENUTINO_SIZE = 46;
export const TENUTINO_MANUAL_OVERRIDE_MS = 3 * 60 * 1000;

const TENUTINO_CONTEXT_PREFIX = 'legato.tenutinoContext.';

const TRAVEL_MIN_MS = 560;
const TRAVEL_MAX_MS = 1400;
const ENCOURAGEMENTS = [
  'Nice — let’s hear that.',
  'I like where this is going.',
  'That gives us something new to explore.',
  ''
];

/** Restore the last meaningful editor destination, falling back to the most
 * recently created chord when an older cache entry is missing or stale. */
export function loadTenutinoContext(projectId, progression, storage = globalThis.localStorage) {
  let cached = null;
  try {
    cached = JSON.parse(storage?.getItem(`${ TENUTINO_CONTEXT_PREFIX }${ projectId }`) || 'null');
  } catch {
    cached = null;
  }

  if (cached?.type === 'chord'
      && progression.chords.some((chord) => chord.id === cached.chordId)) {
    return { type: 'chord', chordId: cached.chordId };
  }
  if (cached?.type === 'seam'
      && Number.isInteger(cached.index)
      && cached.index >= 0
      && cached.index < progression.seams.length) {
    return { type: 'seam', index: cached.index };
  }

  const latestChord = progression.chords.at(-1);
  return latestChord ? { type: 'chord', chordId: latestChord.id } : null;
}

export function saveTenutinoContext(projectId, context, storage = globalThis.localStorage) {
  if (!context || !projectId) return;
  const value = context.type === 'chord'
    ? { type: 'chord', chordId: context.chordId }
    : { type: 'seam', index: context.index };
  try {
    storage?.setItem(`${ TENUTINO_CONTEXT_PREFIX }${ projectId }`, JSON.stringify(value));
  } catch {
    // A UI-position cache is optional; storage restrictions must not block editing.
  }
}

export function lastMeasureForSource(segments, sourceId, fallback = 0) {
  const measures = segments
    .filter((segment) => segment.sourceId === sourceId)
    .map((segment) => segment.measureIndex);
  return measures.length ? Math.max(...measures) : fallback;
}

export function lastMeasureForSeam(segments, seamIndex, departingSourceId, fallback = 0) {
  const generated = segments
    .filter((segment) => segment.seamIndex === seamIndex)
    .map((segment) => segment.measureIndex);
  if (generated.length) return Math.max(...generated);
  return lastMeasureForSource(segments, departingSourceId, fallback);
}

export function resolveTenutinoAnchor(layout, measureIndex, size = TENUTINO_SIZE) {
  if (!layout.length) return null;
  const measure = layout.find((entry) => entry.index === measureIndex) ?? layout.at(-1);
  return {
    measureIndex: measure.index,
    // Anchor to the stave's actual leading edge. This remains correct when a
    // resize or zoom change pushes the measure onto the next system.
    left: measure.x,
    top: Math.max(4, measure.staffTop - size - 14),
  };
}

export function resolveTenutinoPlaybackPosition(layout, measureIndex, progress, size = TENUTINO_SIZE) {
  const anchor = resolveTenutinoAnchor(layout, measureIndex, size);
  if (!anchor) return null;
  const measure = layout.find((entry) => entry.index === anchor.measureIndex) ?? layout.at(-1);
  const localProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const left = measure.x + Math.max(0, measure.width - size) * localProgress;
  const parkour = resolveParkourMotion(
    measure.parkourObstacles,
    left + size / 2,
    size,
    {
      minCenter: measure.x + size / 2,
      maxCenter: measure.x + measure.width - size / 2,
    },
  );
  return {
    ...anchor,
    left,
    top: anchor.top - parkour.lift,
    parkour,
  };
}

export function mountTenutino({ container, scrollContainer, callbacks = {}, now = () => Date.now() }) {
  container.insertAdjacentHTML('beforeend', `
    <div class="tenutino-root" hidden>
      <div class="tenutino-encouragement" role="status" aria-live="polite"></div>
      <button class="tenutino-character" type="button" aria-label="Tenutino, your music companion" aria-expanded="false">
        <img src="/assets/tenutino/tenutino.png" alt="" draggable="false">
        <span class="tenutino-notification" aria-label="A newer edit is waiting" hidden></span>
      </button>
      <div class="tenutino-menu" role="menu" aria-label="Ask Tenutino">
        <button type="button" role="menuitem" data-tenutino-action="explain">Explain this</button>
        <button type="button" role="menuitem" data-tenutino-action="suggest">Suggestions</button>
        <button type="button" role="menuitem" data-tenutino-action="ask">Ask Tenutino</button>
        <button class="tenutino-return" type="button" role="menuitem" data-tenutino-action="return" hidden>Return to latest edit</button>
      </div>
    </div>
  `);

  const root = container.querySelector('.tenutino-root');
  const character = root.querySelector('.tenutino-character');
  const notification = root.querySelector('.tenutino-notification');
  const returnButton = root.querySelector('.tenutino-return');
  const encouragement = root.querySelector('.tenutino-encouragement');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let layout = [];
  let zoom = 1;
  // No implicit measure-zero destination. On startup the editor restores the
  // cached edit after compiling the score; remaining hidden until then avoids
  // a visible measure 1 -> latest edit double move.
  let latestMeasure = null;
  let pendingMeasure = null;
  let manualOverrideUntil = 0;
  let overrideTimer = 0;
  let encouragementTimer = 0;
  let travelTimer = 0;
  let scrollTimer = 0;
  let currentLeft = 0;
  let currentTop = 0;
  let isPlaying = false;
  let playbackMeasure = null;
  let playbackProgress = 0;
  let encouragementIndex = 0;
  let drag = null;
  let suppressClick = false;

  function manualOverrideActive() {
    return now() < manualOverrideUntil;
  }

  function updatePendingUI() {
    const hasPending = pendingMeasure != null;
    root.classList.toggle('has-pending-context', hasPending);
    notification.hidden = !hasPending;
    returnButton.hidden = !hasPending;
  }

  function clearTravelTimers() {
    clearTimeout(travelTimer);
    clearTimeout(scrollTimer);
    travelTimer = 0;
    scrollTimer = 0;
    root.classList.remove('is-auto-scrolling');
  }

  function clampPosition(left, top) {
    const maxLeft = Math.max(0, container.clientWidth - TENUTINO_SIZE - 8);
    const contentBottom = layout.length ? Math.max(...layout.map((entry) => entry.staffTop + 54)) : container.clientHeight;
    const maxTop = Math.max(4, contentBottom - TENUTINO_SIZE);
    return {
      left: Math.max(4, Math.min(maxLeft, left)),
      top: Math.max(4, Math.min(maxTop, top)),
    };
  }

  function place(position, { animate = true } = {}) {
    const next = clampPosition(position.left, position.top);
    const distance = Math.hypot(next.left - currentLeft, next.top - currentTop);
    const duration = animate ? Math.max(TRAVEL_MIN_MS, Math.min(TRAVEL_MAX_MS, 420 + distance * 2.1)) : 0;
    root.style.setProperty('--tenutino-travel-ms', `${ Math.round(duration) }ms`);
    root.classList.toggle('is-teleporting', !animate);
    root.style.left = `${ next.left }px`;
    root.style.top = `${ next.top }px`;
    currentLeft = next.left;
    currentTop = next.top;
    if (!animate) requestAnimationFrame(() => root.classList.remove('is-teleporting'));
    return duration;
  }

  function placeAtPlaybackProgress(progress, measureIndex) {
    if (!layout.length || measureIndex == null) return;
    const measureCount = Math.max(...layout.map((entry) => entry.index)) + 1;
    const localProgress = Math.max(0, Math.min(1, progress * measureCount - measureIndex));
    const position = resolveTenutinoPlaybackPosition(layout, measureIndex, localProgress);
    if (!position) return;

    const previousMeasure = playbackMeasure;
    playbackMeasure = position.measureIndex;
    playbackProgress = progress;
    root.dataset.playbackMeasure = String(playbackMeasure);
    root.hidden = false;

    const parkour = position.parkour;
    root.classList.toggle('is-parkouring', Boolean(parkour?.active));
    root.dataset.parkour = parkour?.active ? parkour.mode : '';
    root.style.setProperty(
      '--tenutino-parkour-rotation',
      `${ reducedMotion ? 0 : (parkour?.rotation ?? 0) }deg`,
    );

    const next = clampPosition(position.left, position.top);
    root.style.left = `${ next.left }px`;
    root.style.top = `${ next.top }px`;
    currentLeft = next.left;
    currentTop = next.top;

    if (previousMeasure !== playbackMeasure) {
      const targetTop = next.top * zoom;
      const visibleBottom = scrollContainer.scrollTop + scrollContainer.clientHeight - TENUTINO_SIZE * zoom - 18;
      if (targetTop > visibleBottom) {
        scrollContainer.scrollTo({ top: Math.max(0, targetTop - 34), behavior: 'smooth' });
      }
    }
  }

  function say(message, duration = 2400) {
    clearTimeout(encouragementTimer);
    encouragement.textContent = message;
    root.classList.add('is-speaking');
    encouragementTimer = setTimeout(() => root.classList.remove('is-speaking'), duration);
  }

  function scheduleOverrideExpiry() {
    clearTimeout(overrideTimer);
    const remaining = manualOverrideUntil - now();
    if (remaining <= 0) {
      manualOverrideUntil = 0;
      if (pendingMeasure != null) moveToMeasure(pendingMeasure, { force: true });
      return;
    }
    overrideTimer = setTimeout(() => {
      manualOverrideUntil = 0;
      if (pendingMeasure != null) moveToMeasure(pendingMeasure, { force: true });
    }, remaining);
  }

  function moveToAnchor(anchor, { encouragementMessage } = {}) {
    clearTravelTimers();
    const targetVisualBottom = (anchor.top + TENUTINO_SIZE) * zoom;
    const visibleBottom = scrollContainer.scrollTop + scrollContainer.clientHeight - 18;
    const needsDownwardScroll = targetVisualBottom > visibleBottom;

    if (!needsDownwardScroll) {
      const duration = place(anchor);
      if (encouragementMessage) travelTimer = setTimeout(() => say(encouragementMessage), duration * 0.72);
      return;
    }

    // Walk to the visible bottom edge first. Once Tenutino arrives, scrolling
    // begins immediately and the final measure anchor becomes the destination.
    const dockTop = (scrollContainer.scrollTop + scrollContainer.clientHeight - TENUTINO_SIZE - 18) / zoom;
    const dockLeft = (scrollContainer.scrollLeft + scrollContainer.clientWidth - TENUTINO_SIZE - 28) / zoom;
    const duration = place({ left: dockLeft, top: dockTop });
    root.classList.add('is-auto-scrolling');
    travelTimer = setTimeout(() => {
      scrollContainer.scrollTo({ top: Math.max(0, anchor.top * zoom - 34), behavior: 'smooth' });
      scrollTimer = setTimeout(() => {
        root.classList.remove('is-auto-scrolling');
        const finalDuration = place(anchor);
        if (encouragementMessage) setTimeout(() => say(encouragementMessage), finalDuration * 0.72);
      }, 460);
    }, duration);
  }

  function moveToMeasure(measureIndex, { force = false, encourage = false } = {}) {
    latestMeasure = Number.isInteger(measureIndex) ? measureIndex : latestMeasure;
    if (latestMeasure == null) return;
    const anchor = resolveTenutinoAnchor(layout, latestMeasure);
    if (!anchor) return;

    if (!force && manualOverrideActive()) {
      pendingMeasure = anchor.measureIndex;
      updatePendingUI();
      scheduleOverrideExpiry();
      return;
    }

    manualOverrideUntil = force ? 0 : manualOverrideUntil;
    pendingMeasure = null;
    updatePendingUI();
    root.hidden = false;
    const message = encourage ? ENCOURAGEMENTS[encouragementIndex++ % ENCOURAGEMENTS.length] : '';
    moveToAnchor(anchor, { encouragementMessage: message });
  }

  function returnToLatestEdit() {
    clearTimeout(overrideTimer);
    manualOverrideUntil = 0;
    const destination = pendingMeasure ?? latestMeasure;
    if (destination == null) return;
    pendingMeasure = null;
    updatePendingUI();
    moveToMeasure(destination, { force: true });
  }

  function cancelAutomaticScroll() {
    if (!root.classList.contains('is-auto-scrolling')) return;
    clearTravelTimers();
    pendingMeasure = latestMeasure;
    updatePendingUI();
  }

  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.clientX) / zoom;
    const dy = (event.clientY - drag.clientY) / zoom;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    root.classList.add('is-dragging');
    place({ left: drag.left + dx, top: drag.top + dy }, { animate: false });
  }

  function pointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    character.releasePointerCapture?.(event.pointerId);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    root.classList.remove('is-dragging');
    if (drag.moved) {
      suppressClick = true;
      manualOverrideUntil = now() + TENUTINO_MANUAL_OVERRIDE_MS;
      pendingMeasure = null;
      updatePendingUI();
      scheduleOverrideExpiry();
      setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
  }

  function pointerDown(event) {
    if (event.button !== 0 || isPlaying) return;
    clearTravelTimers();
    root.classList.remove('is-menu-locked');
    character.setAttribute('aria-expanded', 'false');
    drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: currentLeft,
      top: currentTop,
      moved: false,
    };
    character.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    event.preventDefault();
  }

  function characterClick() {
    if (suppressClick || isPlaying) return;
    const locked = root.classList.toggle('is-menu-locked');
    character.setAttribute('aria-expanded', String(locked));
  }

  function documentPointerDown(event) {
    if (root.contains(event.target)) return;
    root.classList.remove('is-menu-locked');
    character.setAttribute('aria-expanded', 'false');
  }

  function actionClick(event) {
    const action = event.target.closest('[data-tenutino-action]')?.dataset.tenutinoAction;
    if (!action) return;
    if (action === 'return') returnToLatestEdit();
    else {
      const detail = { measureIndex: latestMeasure };
      callbacks[action]?.(detail);
      container.dispatchEvent(new CustomEvent(`tenutino:${ action }`, { bubbles: true, detail }));
    }
    if (action !== 'return') {
      root.classList.remove('is-menu-locked');
      character.setAttribute('aria-expanded', 'false');
    }
  }

  character.addEventListener('pointerdown', pointerDown);
  character.addEventListener('click', characterClick);
  root.querySelector('.tenutino-menu').addEventListener('click', actionClick);
  document.addEventListener('pointerdown', documentPointerDown);
  scrollContainer.addEventListener('wheel', cancelAutomaticScroll, { passive: true });
  scrollContainer.addEventListener('touchstart', cancelAutomaticScroll, { passive: true });

  return {
    setLayout(nextLayout) {
      layout = nextLayout;
      if (!layout.length) { root.hidden = true; return; }
      if (root.hidden && latestMeasure != null) {
        moveToMeasure(latestMeasure, { force: true });
      } else if (isPlaying && playbackMeasure != null) {
        placeAtPlaybackProgress(playbackProgress, playbackMeasure);
      } else if (!manualOverrideActive() && !drag) {
        // VexFlow may wrap a measure to another system after zooming or a
        // container resize. Re-resolve the same measure against the new
        // layout instead of leaving Tenutino at its stale pre-wrap position.
        moveToMeasure(latestMeasure);
      }
    },
    setZoom(nextZoom) { zoom = nextZoom || 1; },
    focusMeasure: moveToMeasure,
    say,
    setPlaying(playing, tempo = 100) {
      isPlaying = playing;
      character.disabled = playing;
      if (playing) {
        root.classList.remove('is-menu-locked');
        character.setAttribute('aria-expanded', 'false');
      }
      root.classList.toggle('is-dancing', playing);
      root.classList.toggle('is-following-playback', playing);
      if (!playing) {
        root.classList.remove('is-parkouring');
        root.dataset.parkour = '';
        root.style.setProperty('--tenutino-parkour-rotation', '0deg');
      }
      root.style.setProperty('--tenutino-beat-ms', `${ Math.round(60000 / Math.max(1, tempo)) }ms`);
    },
    setPlaybackMeasure(measureIndex) {
      playbackMeasure = measureIndex;
      root.dataset.playbackMeasure = measureIndex == null ? '' : String(measureIndex);
    },
    setPlaybackProgress(progress, measureIndex) {
      playbackProgress = Math.max(0, Math.min(1, Number(progress) || 0));
      if (!isPlaying || measureIndex == null) return;
      placeAtPlaybackProgress(playbackProgress, measureIndex);
    },
    returnToLatestEdit,
    destroy() {
      clearTimeout(overrideTimer);
      clearTimeout(encouragementTimer);
      clearTravelTimers();
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('pointerdown', documentPointerDown);
      scrollContainer.removeEventListener('wheel', cancelAutomaticScroll);
      scrollContainer.removeEventListener('touchstart', cancelAutomaticScroll);
      root.remove();
    },
  };
}
