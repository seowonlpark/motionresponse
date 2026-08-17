// state.js
// Two layers. `targets` is whatever pose last reported. `eased` chases it every
// frame with asymmetric easing. Everything downstream reads `eased` only.

import { config } from './config.js';

const N = 33;

const blank = () =>
  Array.from({ length: N }, () => ({ x: 0.5, y: 0.5, v: 0, seenAt: 0 }));

export const targets = blank();
export const eased = blank();

// Smooth 0..1 ramp instead of a hard cutoff, so the eased rate below doesn't
// flip between attack and release every time speed twitches across a point.
const SWITCH_LO = 0.002;
const SWITCH_HI = 0.006;
function smoothstep(lo, hi, x) {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// easeAttack/easeRelease are tuned as per-frame blend factors at ~60fps.
// rAF doesn't hold to that steadily (pose inference shares the main thread),
// so a fixed factor covers more or less distance per frame as the interval
// swings — that swing is what reads as jerkiness. Rescaling by dt makes the
// blend cover the same distance per unit of wall-clock time regardless of
// how the frame interval wobbles.
const REF_DT = 1000 / 60;
const timeK = (k, dt) => 1 - Math.pow(1 - k, dt / REF_DT);

let hasPose = false;
export const isTracking = () => hasPose;

// Called from the pose callback. Writes only. Never draws.
export function setTargets(marks, now) {
  for (let i = 0; i < N; i++) {
    const m = marks[i];
    if (!m) continue;
    const vis = m.visibility ?? 1;
    const t = targets[i];

    if (vis >= config.visibilityFloor) {
      t.x = config.mirrorVideo ? 1 - m.x : m.x;
      t.y = m.y;
      t.v = vis;
      t.seenAt = now;
    } else {
      // Hold the last known position and let confidence decay. A wrist leaving
      // frame should fade, not snap to the origin, or every style flinches.
      const age = now - t.seenAt;
      t.v = Math.max(0, 1 - age / config.holdDecayMs) * t.v;
    }
  }
  hasPose = true;
}

// Called once per rendered frame from the rAF loop.
export function easeState(dt) {
  for (let i = 0; i < N; i++) {
    const t = targets[i];
    const e = eased[i];
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const speed = Math.hypot(dx, dy);

    // Moving away from rest gets the fast rate; settling gets the slow one,
    // blended smoothly across a small speed band so the rate itself doesn't
    // pop and cause a visible jerk right at the crossover.
    const blend = smoothstep(SWITCH_LO, SWITCH_HI, speed);
    const k = timeK(config.easeRelease + (config.easeAttack - config.easeRelease) * blend, dt);

    e.px = e.x;
    e.py = e.y;
    e.x += dx * k;
    e.y += dy * k;
    e.v += (t.v - e.v) * timeK(0.2, dt);
  }
}
