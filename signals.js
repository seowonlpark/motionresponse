// signals.js
// The contract between the body and the visuals.
// Renderers read this file's output and never touch a landmark.
//
// Every signal is continuous and bidirectional. "More" and "less" are the same
// value moving two directions, so nothing needs a separate retract path.

import { config, LM, LIMBS } from './config.js';
import { eased } from './state.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Calibration ------------------------------------------------------------
let shoulderWidth = 0.2;
let calibMax = 0;
let calibStart = 0;
let calibrated = false;

// Signal object, allocated once and mutated in place to avoid per-frame garbage.
//
// The four values every style parameter can be driven by. Always read from
// the two arm limbs, so
// "elbow angle" always means an elbow and "hand distance" always means hands.
export const signals = {
  // frame
  handSpeed: 0,      //  0..1  mean hand speed, in shoulder widths per second
  handDistance: 0,   //  0..1  hands together (1) vs apart (0)
  handReach: 0,      //  0..1  mean hand distance from the body centre
  elbowAngle: 0,     //  0..1  mean elbow bend, straight (0) to folded (1)
  // per limb: { side, group, reach, fold, sweep, lift, tip, root, hinge }
  limbs: [],
  // frame of reference, exposed for renderers that want screen-space origin
  origin: { x: 0.5, y: 0.5 },
  scale: 0.2,   // shoulder width in normalized units
  ready: false,
};

let smoothedSpeed = 0;

function angleBetween(ax, ay, bx, by, cx, cy) {
  const v1x = ax - bx, v1y = ay - by;
  const v2x = cx - bx, v2y = cy - by;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (d < 1e-6) return Math.PI;
  return Math.acos(clamp((v1x * v2x + v1y * v2y) / d, -1, 1));
}

export function computeSignals(now, dt) {
  const ls = eased[LM.L_SHOULDER];
  const rs = eased[LM.R_SHOULDER];

  // Origin and frame of reference: the shoulder line, always.
  const ox = (ls.x + rs.x) / 2;
  const oy = (ls.y + rs.y) / 2;
  signals.origin.x = ox;
  signals.origin.y = oy;

  const sw = Math.hypot(rs.x - ls.x, rs.y - ls.y);
  const shoulderAngle = Math.atan2(rs.y - ls.y, rs.x - ls.x);

  // Calibrate the normalizer over an opening window, then clamp it. Without
  // this, hand distance and reach drift the moment the dancer stands closer
  // to or further from the camera.
  if (!calibrated) {
    if (!calibStart) calibStart = now;
    calibMax = Math.max(calibMax, sw);
    shoulderWidth = Math.max(0.05, calibMax);
    if (now - calibStart > config.calibrationMs && calibMax > 0.05) calibrated = true;
  }
  signals.scale = shoulderWidth;

  // Limbs. Renderers iterate and never ask how many.
  const set = LIMBS;
  if (signals.limbs.length !== set.length) {
    signals.limbs = set.map((d) => ({ ...d, reach: 0, fold: 0, sweep: 0, lift: 0 }));
  }

  let armSpeedSum = 0;
  let armSpeedCount = 0;

  for (let i = 0; i < set.length; i++) {
    const d = set[i];
    const L = signals.limbs[i];
    const root = eased[d.root];
    const hinge = eased[d.hinge];
    const tip = eased[d.tip];

    L.side = d.side;
    L.group = d.group;
    L.root = root;
    L.hinge = hinge;
    L.tip = tip;

    // reach: tip distance from origin, in shoulder widths.
    L.reach = clamp(Math.hypot(tip.x - ox, tip.y - oy) / (shoulderWidth * 2.2));

    // fold: interior hinge angle. 1 fully bent, 0 straight.
    const a = angleBetween(root.x, root.y, hinge.x, hinge.y, tip.x, tip.y);
    L.fold = clamp(1 - a / Math.PI);

    // sweep: measured in the shoulder frame, not screen space, so it stays
    // correct when the dancer leans. This is the primary axis of port de bras.
    const raw = Math.atan2(tip.y - root.y, tip.x - root.x);
    let s = raw - shoulderAngle;
    while (s > Math.PI) s -= Math.PI * 2;
    while (s < -Math.PI) s += Math.PI * 2;
    L.sweep = s;

    // lift: tip height relative to the shoulder line.
    L.lift = clamp(-(tip.y - oy) / shoulderWidth, -1, 1);

    // Confidence-weighted so a dropped point does not fake stillness.
    // Arms only — a foot moving is not "hand speed".
    if (d.group === 'arm' && tip.px !== undefined) {
      armSpeedSum += Math.hypot(tip.x - tip.px, tip.y - tip.py) * tip.v;
      armSpeedCount += tip.v;
    }
  }

  // The four values every style parameter can be driven by, all read from
  // the arms specifically so they mean exactly what they're named.
  const arms = signals.limbs.filter((l) => l.group === 'arm');
  const lArm = arms.find((a) => a.side === 'L');
  const rArm = arms.find((a) => a.side === 'R');

  // handSpeed: mean hand speed in shoulder widths per second.
  const perFrame = armSpeedCount > 0 ? armSpeedSum / armSpeedCount : 0;
  const perSecond = (perFrame / shoulderWidth) * (1000 / Math.max(1, dt));
  const target = clamp(perSecond / 6);
  smoothedSpeed = lerp(smoothedSpeed, target, target > smoothedSpeed ? 0.25 : 0.06);
  signals.handSpeed = smoothedSpeed;

  // handDistance: how close the two hands are, inverted so together reads high.
  const handGap = Math.hypot(lArm.tip.x - rArm.tip.x, lArm.tip.y - rArm.tip.y);
  signals.handDistance = clamp(1 - handGap / (shoulderWidth * 2.4));

  // handReach: mean hand distance from the body centre.
  signals.handReach = (lArm.reach + rArm.reach) / 2;

  // elbowAngle: mean elbow bend.
  signals.elbowAngle = (lArm.fold + rArm.fold) / 2;

  signals.ready = calibrated;
  return signals;
}
