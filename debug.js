// debug.js
// Permanent fixture, toggled with the D key. When a style feels wrong the cause
// is almost always a signal, not the drawing code. Read it here first.

import { config, LM } from './config.js';
import { eased } from './state.js';

let root = null;
let rows = new Map();
let skeletonCanvas = null;
let skeletonCtx = null;

// Root -> tip pairs actually used by the app (config.js LIMBS), plus the
// shoulder and hip lines so the two sides read as one frame, not four limbs
// floating loose.
const BONES = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW], [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW], [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_SHOULDER, LM.L_HIP], [LM.R_SHOULDER, LM.R_HIP],
];
const JOINTS = [...new Set(BONES.flat())];

// With no camera the demo figure drives the visuals, so there is no landmark
// read to show: the skeleton stays empty and "calibrating" would never end.
let demo = false;
export function setDemo(on) {
  demo = on;
  if (!root) return;
  root.querySelector('.specimen-caption').textContent = on
    ? 'demo figure — no camera, signals are simulated'
    : 'camera read — brightness is confidence';
  skeletonCanvas.style.display = on ? 'none' : 'block';
}

export function initDebug(container) {
  root = document.createElement('div');
  root.className = 'specimen';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="specimen-head">Signal plate<span></span></div>
    <canvas class="specimen-skeleton"></canvas>
    <div class="specimen-caption">camera read — brightness is confidence</div>
    <div class="specimen-body"></div>`;
  container.appendChild(root);

  skeletonCanvas = root.querySelector('.specimen-skeleton');
  skeletonCtx = skeletonCanvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  skeletonCanvas.width = 300 * dpr;
  skeletonCanvas.height = 300 * dpr;

  // A visible way in: the key works, but nobody finds a key by itself.
  toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'plate-toggle';
  toggleBtn.innerHTML = '<kbd>D</kbd><span></span>';
  toggleBtn.addEventListener('click', toggle);
  container.appendChild(toggleBtn);

  setVisible(config.showDebug);

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'd' || e.key === 'D') toggle();
  });
}

let toggleBtn = null;

function toggle() {
  config.showDebug = !config.showDebug;
  setVisible(config.showDebug);
}

function setVisible(on) {
  if (root) root.style.display = on ? 'block' : 'none';
  if (toggleBtn) {
    toggleBtn.querySelector('span').textContent = on ? 'hide signal plate' : 'see how your movement is read';
    toggleBtn.setAttribute('aria-pressed', on);
    toggleBtn.classList.toggle('is-on', on);
  }
}

function row(label, value, signed) {
  let r = rows.get(label);
  if (!r) {
    r = document.createElement('div');
    r.className = 'specimen-row';
    r.innerHTML = `<i>${label}</i><b><s></s></b><u></u>`;
    rows.set(label, r);
    root.querySelector('.specimen-body').appendChild(r);
  }
  const bar = r.querySelector('s');
  const num = r.querySelector('u');
  if (signed) {
    bar.style.left = value < 0 ? `${50 + value * 50}%` : '50%';
    bar.style.width = `${Math.abs(value) * 50}%`;
  } else {
    bar.style.left = '0%';
    bar.style.width = `${value * 100}%`;
  }
  num.textContent = value.toFixed(2);
}

function drawSkeleton() {
  const w = skeletonCanvas.width;
  const h = skeletonCanvas.height;
  skeletonCtx.clearRect(0, 0, w, h);

  // Padding keeps points near the frame edge from clipping on the canvas edge.
  const pad = w * 0.1;
  const px = (x) => pad + x * (w - pad * 2);
  const py = (y) => pad + y * (h - pad * 2);

  skeletonCtx.lineWidth = Math.max(1, w * 0.008);
  BONES.forEach(([a, b]) => {
    const pa = eased[a], pb = eased[b];
    const vis = Math.min(pa.v, pb.v);
    if (vis < 0.05) return;
    skeletonCtx.strokeStyle = `rgba(255,255,255,${0.12 + vis * 0.5})`;
    skeletonCtx.beginPath();
    skeletonCtx.moveTo(px(pa.x), py(pa.y));
    skeletonCtx.lineTo(px(pb.x), py(pb.y));
    skeletonCtx.stroke();
  });

  JOINTS.forEach((i) => {
    const p = eased[i];
    if (p.v < 0.05) return;
    const r = w * 0.012 + p.v * w * 0.016;
    skeletonCtx.beginPath();
    skeletonCtx.fillStyle = `rgba(255,255,255,${0.25 + p.v * 0.65})`;
    skeletonCtx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
    skeletonCtx.fill();
  });
}

export function drawDebug(signals, fps) {
  if (!config.showDebug || !root) return;
  root.querySelector('.specimen-head span').textContent =
    demo
      ? `demo · ${Math.round(fps)}fps`
      : `${Math.round(fps)}fps · ${signals.ready ? 'calibrated' : 'calibrating'}`;

  if (!demo) drawSkeleton();

  row('hand speed', signals.handSpeed);
  row('hand distance', signals.handDistance);
  row('hand location', signals.handReach);
  row('elbow angle', signals.elbowAngle);

  signals.limbs.forEach((L) => {
    const tag = `${L.side}·${L.group}`;
    row(`${tag} reach`, L.reach);
    row(`${tag} fold`, L.fold);
    row(`${tag} sweep`, L.sweep / Math.PI, true);
    row(`${tag} lift`, L.lift, true);
  });
}
