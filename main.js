// main.js
// The render loop. Reads state, never writes pose. Pose runs on its own clock.

import { config } from './config.js';
import { easeState, isTracking } from './state.js';
import { computeSignals, resolveMode, resetMode } from './signals.js';
import { startPose, stopPose } from './pose.js';
import { byId } from './styles/index.js';
import { resolve } from './modulation.js';
import { createPhantom } from './phantom.js';
import { initControls, renderControls } from './controls.js';
import { initDebug, drawDebug } from './debug.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('view');
const gate = document.getElementById('gate');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d', { alpha: false });

const params = new URLSearchParams(location.search);
let active = byId(params.get('style'));

let usePhantom = false;
const phantom = createPhantom({ limbs: 2 });

let frame = { w: 0, h: 0, t: 0, dt: 16.6667 };
let last = performance.now();
let fps = 60;

function size() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  frame.w = r.width;
  frame.h = r.height;
  active.reset?.();
}
window.addEventListener('resize', size);

function loop(now) {
  const dt = Math.min(64, now - last);
  last = now;
  fps += (1000 / Math.max(1, dt) - fps) * 0.08;
  frame.t = now;
  frame.dt = dt;

  let sig;
  if (usePhantom) {
    sig = phantom(now);
  } else {
    easeState(dt);
    resolveMode(now);
    sig = computeSignals(now, dt);
  }

  if (usePhantom || isTracking()) {
    active.draw(ctx, sig, resolve(active, sig), frame);
  }
  drawDebug(sig, fps);
  requestAnimationFrame(loop);
}

function selectStyle(id) {
  active.reset?.();
  active = byId(id);
  active.reset?.();
  const url = new URL(location.href);
  url.searchParams.set('style', active.id);
  history.replaceState(null, '', url);
  renderControls(active);
}

function selectMode(mode) {
  config.mode = mode;
  resetMode();
}

let started = false;

function enterStage() {
  if (started) return;
  started = true;
  gate.classList.add('open');
  window.dispatchEvent(new Event('kaleidoscope:started'));
  stage.hidden = false;
  size();
  initDebug(stage);
  initControls(stage, { onStyleChange: selectStyle, onModeChange: selectMode });
  renderControls(active);
  requestAnimationFrame(loop);
}

document.getElementById('begin').addEventListener('click', async () => {
  gate.classList.add('opening');
  try {
    await startPose((msg) => (status.textContent = msg === 'ready' ? '' : msg.toLowerCase() + '…'));
    enterStage();
  } catch (err) {
    // No camera is not a dead end. The phantom drives the same renderers.
    gate.classList.remove('opening');
    status.textContent =
      err?.name === 'NotAllowedError'
        ? 'the camera stayed shut. showing a figure of its own instead.'
        : 'no camera here. showing a figure of its own instead.';
    usePhantom = true;
    setTimeout(enterStage, 1200);
  }
});

// Explicit way in without a camera, used by the chooser and the fallback link.
document.getElementById('watch')?.addEventListener('click', (e) => {
  e.preventDefault();
  usePhantom = true;
  enterStage();
});

window.addEventListener('beforeunload', stopPose);
