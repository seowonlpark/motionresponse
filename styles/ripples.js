// styles/ripples.js
// Rings on water. Emitters sit at every limb tip and hinge. Rings drift rather
// than sitting concentric, which is what reads as direction.

const TAU = Math.PI * 2;
const POOL = 220;

const pool = Array.from({ length: POOL }, () => ({ live: false }));
let cursor = 0;
let lastEmit = 0;

function spawn(x, y, dx, dy, hue, born) {
  const r = pool[cursor];
  cursor = (cursor + 1) % POOL;
  r.live = true;
  r.x = x; r.y = y; r.dx = dx; r.dy = dy;
  r.hue = hue; r.born = born;
}

export default {
  id: 'ripples',
  label: 'ripples',
  caption: 'rings on a pond. speed sets how often, direction sets where they run.',

  defaults: {
    period: 130, drift: 0.5, wavelength: 0.42, life: 3400,
    hue: 205, spread: 45, weight: 1.6, bg: 0.1,
  },

  schema: [
    { key: 'period',     label: 'interval',      min: 40,  max: 500,  step: 5,    signal: 'handSpeed' },
    { key: 'drift',      label: 'drift',         min: 0,   max: 1.6,  step: 0.02, signal: 'handSpeed' },
    { key: 'wavelength', label: 'ring size',     min: 0.1, max: 1,    step: 0.02, signal: 'handReach' },
    { key: 'life',       label: 'duration',      min: 900, max: 7000, step: 100 },
    { key: 'hue',        label: 'colour',        min: 170, max: 250,  step: 1,    signal: 'elbowAngle' },
    { key: 'spread',     label: 'colour range',  min: 0,   max: 120,  step: 1 },
    { key: 'weight',     label: 'line thickness', min: 0.4, max: 5,    step: 0.1 },
    { key: 'bg',         label: 'trail',         min: 0,   max: 0.5,  step: 0.01 },
  ],

  bars: [
    { id: 'reactive', kind: 'reactive', label: 'reacts to your movement' },
    { id: 'busy',     label: 'more ripples',  on: { period: 60 } },
    { id: 'bold',     label: 'bolder colour', on: { spread: 100, weight: 3.2 } },
    { id: 'big',      label: 'bigger rings',  on: { wavelength: 0.85, life: 5500 } },
  ],

  reset() { pool.forEach((r) => (r.live = false)); },

  draw(ctx, sig, s, frame) {
    const { w, h, t } = frame;

    if (t - lastEmit > s.period) {
      lastEmit = t;
      sig.limbs.forEach((L, i) => {
        const hue = (s.hue + (i / sig.limbs.length) * s.spread) % 360;
        // Each emitter's own sweep sets its drift vector.
        const a = L.sweep;
        const dx = Math.cos(a) * s.drift * 0.00006;
        const dy = Math.sin(a) * s.drift * 0.00006;
        spawn(L.tip.x, L.tip.y, dx, dy, hue, t);
        if (L.hinge.v > 0.4) spawn(L.hinge.x, L.hinge.y, dx * 0.6, dy * 0.6, (hue + 14) % 360, t);
      });
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(6,12,22,${1 - s.bg})`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const maxR = Math.hypot(w, h) * 0.5 * s.wavelength * 2.2;

    for (const r of pool) {
      if (!r.live) continue;
      const age = t - r.born;
      if (age > s.life) { r.live = false; continue; }

      const p = age / s.life;
      const rad = p * maxR;
      const fade = Math.sin(p * Math.PI) * (1 - p * 0.4);
      const x = (r.x + r.dx * age) * w;
      const y = (r.y + r.dy * age) * h;

      // Two concentric strokes give the crest and its trailing shadow.
      ctx.lineWidth = s.weight;
      ctx.strokeStyle = `hsla(${r.hue}, 78%, 66%, ${fade * 0.55})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.stroke();

      ctx.lineWidth = s.weight * 0.5;
      ctx.strokeStyle = `hsla(${(r.hue + 20) % 360}, 90%, 82%, ${fade * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.88, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
