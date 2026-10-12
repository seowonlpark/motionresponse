// styles/mirror.js
// Faceted jewels drawn once into a wedge, then rotated and mirrored around the
// centre. Draw once, blit N times. Never draw N times.

const TAU = Math.PI * 2;
const MIN_SRC = 420;
const MAX_SRC = 1024;

let src = null, sctx = null;
let srcSize = 0;
let wedgeHeld = 8;
// When the segment count steps, the old layout fades out under the new one
// instead of popping. fade runs 0 -> 1 over FADE_MS.
const FADE_MS = 350;
let prevWedges = 8, fade = 1;

// Facet position/size track the raw arm angle and reach, which is what made
// this style feel jittery even with the reactive bar at zero — sweep and
// reach are read straight off the body every frame, unsmoothed, and a small
// angle change swings a long way once multiplied out to the wedge radius.
// A second, slower ease on top of state.js's landmark easing calms that down
// without touching how "reactive" (the modulation depth) works.
const TRACK_EASE = 0.05;
let tracked = [];

// Rotation is integrated frame by frame. Computing it as t * spin makes the
// whole pattern jump whenever spin changes, because t is the full elapsed time.
let spinAngle = 0, spinNow = 0, facetAngle = 0;

// TRACK_EASE is tuned as a per-frame factor at ~60fps; rescale by dt so the
// facets don't speed up or stutter when the frame interval isn't steady.
const REF_DT = 1000 / 60;
const timeK = (k, dt) => 1 - Math.pow(1 - k, dt / REF_DT);

function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * k;
}

// Sized to the actual blit target so wedges stay crisp instead of stretched.
// Capped so a very large window doesn't push the offscreen draw past budget.
function offscreen(size) {
  if (!src || srcSize !== size) {
    src = src || document.createElement('canvas');
    src.width = src.height = size;
    sctx = src.getContext('2d');
    srcSize = size;
  }
  return sctx;
}

// Mirror the wedge source N times around the centre at the given opacity.
function blit(ctx, N, R, alpha) {
  const step = TAU / N;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < N; i++) {
    ctx.save();
    ctx.rotate(i * step);
    if (i % 2) ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -step / 2, step / 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(src, -R * 0.5, -R * 0.5, R * 1.5, R * 1.5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export default {
  id: 'mirror',
  label: 'mirror',
  caption: 'the classic kaleidoscope. facets fold around a turning centre.',

  defaults: {
    wedges: 8, spin: 0.6, hue: 210, spread: 90,
    facet: 0.55, glow: 0.5, bg: 0.06,
  },

  schema: [
    { key: 'wedges', label: 'segments',    min: 4,  max: 18,  step: 2,    signal: 'handDistance', depth: 0.3 },
    { key: 'spin',   label: 'spin speed',  min: 0, max: 2,   step: 0.05, signal: 'handSpeed', depth: 0.25 },
    { key: 'hue',    label: 'colour',      min: 0,  max: 360, step: 1,    signal: 'elbowAngle', depth: 0.2 },
    { key: 'spread', label: 'colour range', min: 10, max: 200, step: 1 },
    { key: 'facet',  label: 'facet size',  min: 0,  max: 1,   step: 0.02, signal: 'handReach', depth: 0.3 },
    { key: 'glow',   label: 'glow',        min: 0,  max: 1,   step: 0.02, signal: 'handSpeed', depth: 0.3 },
    { key: 'bg',     label: 'trail',       min: 0,  max: 0.4, step: 0.01 },
  ],

  // The whole panel, reduced to four switches. Each bundles a couple of
  // schema values behind one plain description instead of exposing them raw.
  bars: [
    { id: 'reactive', kind: 'reactive', label: 'react' },
    { id: 'segments', label: 'segments', on: { wedges: 14 } },
    { id: 'bold',     label: 'colour', on: { glow: 0.85, spread: 150 } },
    { id: 'spin',     label: 'spin',   on: { spin: 1.1 } },
  ],

  reset() { wedgeHeld = 8; prevWedges = 8; fade = 1; tracked = []; spinAngle = 0; spinNow = 0; facetAngle = 0; },

  draw(ctx, sig, s, frame) {
    const { w, h, t, dt } = frame;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const R = Math.hypot(w, h) * 0.6;
    const SRC = Math.min(MAX_SRC, Math.max(MIN_SRC, Math.round(R * 1.5 * dpr)));
    const c = SRC / 2;
    const o = offscreen(SRC);

    // Hysteresis: without it the count flickers when a value sits on a boundary.
    const want = Math.max(4, Math.round(s.wedges / 2) * 2);
    // Judge the raw value, not the rounded one, so the count only steps once
    // the hands have clearly moved past the held layout.
    if (Math.abs(s.wedges - wedgeHeld) >= 2.5 && want !== wedgeHeld) {
      prevWedges = wedgeHeld;
      wedgeHeld = want;
      fade = 0;
    }
    fade = Math.min(1, fade + dt / FADE_MS);
    const N = wedgeHeld;

    // Ease the spin speed, then accumulate it into an angle.
    spinNow += (s.spin - spinNow) * timeK(0.02, dt);
    spinAngle += (dt / 1000) * spinNow * 0.35;
    facetAngle += dt * 0.0004 * spinNow;

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.fillStyle = '#0B0B0D';
    o.fillRect(0, 0, SRC, SRC);
    o.globalCompositeOperation = 'lighter';

    if (tracked.length !== sig.limbs.length) tracked = sig.limbs.map(() => null);

    sig.limbs.forEach((L, i) => {
      const rawR = 0.12 + L.reach * 0.82;
      let tr = tracked[i];
      if (!tr) tr = tracked[i] = { a: L.sweep, r: rawR, fold: L.fold, vis: L.tip.v };
      else {
        const k = timeK(TRACK_EASE, dt);
        tr.a = angleLerp(tr.a, L.sweep, k);
        tr.r = tr.r + (rawR - tr.r) * k;
        tr.fold = tr.fold + (L.fold - tr.fold) * k;
        tr.vis = tr.vis + (L.tip.v - tr.vis) * k;
      }

      const hue = (s.hue + (i / sig.limbs.length) * s.spread) % 360;
      const a = tr.a;
      const r = tr.r;
      const x = c + Math.cos(a) * r * c * 0.9;
      const y = c + Math.sin(a) * r * c * 0.9;
      const size = c * (0.12 + tr.fold * 0.3 + s.facet * 0.24);
      const alpha = (0.3 + s.glow * 0.7) * (0.35 + tr.vis * 0.65);

      // Soft body
      const g = o.createRadialGradient(x, y, 0, x, y, size * 1.9);
      g.addColorStop(0, `hsla(${hue}, 88%, 66%, ${alpha})`);
      g.addColorStop(0.5, `hsla(${(hue + 40) % 360}, 84%, 52%, ${alpha * 0.5})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      o.fillStyle = g;
      o.beginPath();
      o.arc(x, y, size * 1.9, 0, TAU);
      o.fill();

      // Facet: a hard-edged shard through the body, which is what makes it
      // read as cut glass rather than a blur.
      const sides = 3 + Math.round(s.facet * 4);
      o.beginPath();
      for (let k = 0; k <= sides; k++) {
        const ka = a + (k / sides) * TAU + facetAngle;
        const kr = size * (0.55 + ((k % 2) ? 0.55 : 0.14) * (0.4 + s.facet));
        const px = x + Math.cos(ka) * kr;
        const py = y + Math.sin(ka) * kr;
        k ? o.lineTo(px, py) : o.moveTo(px, py);
      }
      o.closePath();
      o.fillStyle = `hsla(${(hue + 180) % 360}, 92%, 72%, ${alpha * 0.5})`;
      o.fill();
      o.strokeStyle = `hsla(${hue}, 100%, 88%, ${alpha * 0.8})`;
      o.lineWidth = 1.2;
      o.stroke();

      // Thread back to the centre. Gives the wedge something radial to mirror.
      o.strokeStyle = `hsla(${hue}, 90%, 70%, ${alpha * 0.35})`;
      o.lineWidth = 2 + s.facet * 3;
      o.beginPath();
      o.moveTo(c, c);
      o.lineTo(x, y);
      o.stroke();
    });
    o.globalCompositeOperation = 'source-over';

    // Blit
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(11,11,13,${1 - s.bg})`;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(spinAngle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Ease the weight so the hand-off starts and ends gently.
    const f = fade * fade * (3 - 2 * fade);
    if (f < 1) blit(ctx, prevWedges, R, 1 - f);
    blit(ctx, N, R, f < 1 ? f : 1);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  },
};
