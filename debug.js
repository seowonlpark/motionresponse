// debug.js
// Permanent fixture, toggled with the D key. When a style feels wrong the cause
// is almost always a signal, not the drawing code. Read it here first.

import { config } from './config.js';

let root = null;
let rows = new Map();

export function initDebug(container) {
  root = document.createElement('div');
  root.className = 'specimen';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="specimen-head">Signal plate<span></span></div>
    <div class="specimen-body"></div>`;
  container.appendChild(root);
  setVisible(config.showDebug);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      config.showDebug = !config.showDebug;
      setVisible(config.showDebug);
    }
  });
}

function setVisible(on) {
  if (root) root.style.display = on ? 'block' : 'none';
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

export function drawDebug(signals, fps) {
  if (!config.showDebug || !root) return;
  root.querySelector('.specimen-head span').textContent =
    `${config.resolvedMode} · ${Math.round(fps)}fps · ${signals.ready ? 'calibrated' : 'calibrating'}`;

  row('hand speed', signals.handSpeed);
  row('hand distance', signals.handDistance);
  row('hand location', signals.handReach);
  row('elbow angle', signals.elbowAngle);
  row('tilt (diagnostic)', signals.tilt, true);

  signals.limbs.forEach((L) => {
    const tag = `${L.side}·${L.group}`;
    row(`${tag} reach`, L.reach);
    row(`${tag} fold`, L.fold);
    row(`${tag} sweep`, L.sweep / Math.PI, true);
    row(`${tag} lift`, L.lift, true);
  });
}
