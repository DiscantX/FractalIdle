import type { SettingChangeApi } from '../settings/types';
import {
  playAnimation,
  pauseAnimation,
  stopAnimation,
  setAnimationPhase,
  getAnimationPhase,
  isAnimationPlaying,
  animationCallbacks,
} from '../services/color-animation';

// Builds the color-animation transport: play/pause toggle, stop, and a scrubber
// that mirrors (and grabs control from) the running loop. Rendered into a custom
// settings field — see the 'color-animation' section in the registry. This file
// is the UI half; the loop lives in services/color-animation.ts.
export function renderAnimationControls(_api: SettingChangeApi): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'anim-controls';

  const buttons = document.createElement('div');
  buttons.className = 'anim-buttons';

  const playPause = document.createElement('button');
  playPause.type = 'button';
  playPause.textContent = 'Play';

  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = 'Stop';
  stop.className = 'nav-secondary';

  buttons.appendChild(playPause);
  buttons.appendChild(stop);

  const scrubRow = document.createElement('div');
  scrubRow.className = 'value-row';

  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = '1';
  scrub.step = '0.001';
  scrub.value = String(getAnimationPhase());
  scrub.className = 'anim-scrubber';

  scrubRow.appendChild(scrub);

  wrap.appendChild(buttons);
  wrap.appendChild(scrubRow);

  const syncState = (playing: boolean) => {
    playPause.textContent = playing ? 'Pause' : 'Play';
    playPause.classList.toggle('is-playing', playing);
  };
  const syncScrub = (phase: number) => {
    // The scrubber is read-only feedback while playing; only move it when the
    // change didn't come from the user dragging it.
    if (document.activeElement !== scrub) {
      scrub.value = String(phase);
    }
  };

  playPause.addEventListener('click', () => {
    if (isAnimationPlaying()) pauseAnimation();
    else playAnimation();
  });

  stop.addEventListener('click', () => stopAnimation());

  // Scrubbing takes over from the loop: pause, then set the phase from the slider.
  scrub.addEventListener('input', () => {
    if (isAnimationPlaying()) pauseAnimation();
    setAnimationPhase(Number(scrub.value));
  });

  // Keep the controls in sync with the loop (play button label, scrubber).
  animationCallbacks.onStateChange = syncState;
  animationCallbacks.onPhaseChange = syncScrub;
  syncState(isAnimationPlaying());

  return wrap;
}
