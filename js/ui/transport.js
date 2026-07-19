import { icon } from './icons.js';

/**
 * Playback controls (play/pause toggle and stop).
 *
 * The module doesn't drive audio itself — it exposes callbacks that editor-
 * view hooks into playSegments/pausePlayback/resumePlayback/stopPlayback.
 * The setters let the caller reflect playback state back into the controls.
 */

const TEMPLATE = `
<section class="transport" aria-label="Playback controls">
  <div class="transport-buttons">
    <button id="play" class="play-button primary-action" type="button">
      <span class="play-icon">${ icon('play') }</span>
      <span class="play-copy"><strong>Play</strong></span>
    </button>
    <button id="stop" class="stop-button" type="button">${ icon('stop') }<span>Stop</span></button>
  </div>
</section>
`;

export function mountTransport({ container, callbacks }) {
  container.innerHTML = TEMPLATE;
  const playBtn = container.querySelector('#play');
  const stopBtn = container.querySelector('#stop');
  const playIconEl = playBtn.querySelector('.play-icon');
  const playStrongEl = playBtn.querySelector('.play-copy strong');

  playBtn.onclick = () => callbacks.onPlayToggle();
  stopBtn.onclick = () => callbacks.onStop();

  return {
    setPlayEnabled(enabled) { playBtn.disabled = !enabled; },
    /**
     * @param {'play' | 'pause' | 'resume'} mode
     * `play`   — from idle: start progression from the beginning
     * `pause`  — currently playing: freeze at cursor
     * `resume` — paused: continue from cursor
     */
    setPlayMode(mode) {
      if (mode === 'pause') {
        playIconEl.innerHTML = icon('pause');
        playStrongEl.textContent = 'Pause';
        playBtn.setAttribute('aria-label', 'Pause playback');
      } else if (mode === 'resume') {
        playIconEl.innerHTML = icon('play');
        playStrongEl.textContent = 'Resume';
        playBtn.setAttribute('aria-label', 'Resume playback');
      } else {
        playIconEl.innerHTML = icon('play');
        playStrongEl.textContent = 'Play';
        playBtn.setAttribute('aria-label', 'Play progression');
      }
    },
  };
}
