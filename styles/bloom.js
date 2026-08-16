// styles/bloom.js
// Branches from each limb, flowers at the ends. Seeded so the tree is stable
// instead of re-randomised every frame.
//
// The important detail: branches are not added and removed. A `growth` scalar
// gates how far along each branch is drawn, so they extend and retract visibly.

const TAU = Math.PI * 2;

let cache = null;
let cacheKey = '';
// Trees grow straight up, perpendicular to the horizontal — like out of the
// ground — regardless of live arm sweep. Only growth/size/colour stay reactive.
const BASE_ANGLE = -Math.PI / 2;
// Roots plant once, on the first frame after a reset, and hold there for good —
// like BASE_ANGLE, they don't track the live shoulder/hip landmark every frame.
let lockedRoots = null;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Build once per (depth, angle) pair. Positions are unit-space, relative to a
// limb pointing along +x, so the same tree serves every limb.
function build(depth, forkAngle, seed) {
  const rand = seeded(seed);
  const segs = [];
  (function grow(x, y, a, len, d, order) {
    if (d > depth || len < 0.012) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    segs.push({ x, y, x2, y2, d, order, flower: d >= depth - 1 && rand() > 0.35 });
    const spread = forkAngle * (0.7 + rand() * 0.6);
    grow(x2, y2, a - spread, len * (0.62 + rand() * 0.16), d + 1, order + 1);
    grow(x2, y2, a + spread, len * (0.62 + rand() * 0.16), d + 1, order + 1);
    if (rand() > 0.72) grow(x2, y2, a + (rand() - 0.5) * spread, len * 0.5, d + 1, order + 1);
  })(0, 0, 0, 0.34, 0, 0);
  return segs.sort((p, q) => p.order - q.order);
}

export default {
  id: 'bloom',
  label: 'bloom',
  caption: 'branches from the arms. reach further and the blossom opens.',

  defaults: {
    depth: 5, fork: 0.5, growth: 0.7, open: 0.6,
    hue: 335, spread: 60, weight: 1.6, bg: 0.05,
  },

  schema: [
    { key: 'depth',  label: 'branching',      min: 2,   max: 7,   step: 1,    signal: 'handReach' },
    { key: 'fork',   label: 'fork angle',     min: 0.1, max: 1.1, step: 0.02, signal: 'handDistance' },
    { key: 'growth', label: 'growth',         min: 0,   max: 1,   step: 0.02, signal: 'handSpeed' },
    { key: 'open',   label: 'blossom',        min: 0,   max: 1,   step: 0.02, signal: 'handSpeed' },
    { key: 'hue',    label: 'colour',         min: 0,   max: 360, step: 1,    signal: 'elbowAngle' },
    { key: 'spread', label: 'colour range',   min: 0,   max: 140, step: 1 },
    { key: 'weight', label: 'line thickness', min: 0.4, max: 5,   step: 0.1 },
    { key: 'bg',     label: 'trail',          min: 0,   max: 0.4, step: 0.01 },
  ],

  bars: [
    { id: 'reactive', kind: 'reactive', label: 'reacts to your movement' },
    { id: 'bushy',    label: 'bushier',       on: { depth: 7, fork: 0.9 } },
    { id: 'bold',     label: 'bolder blooms', on: { spread: 120, open: 0.9 } },
    { id: 'thick',    label: 'thicker lines', on: { weight: 3.4 } },
  ],

  reset() { cache = null; cacheKey = ''; lockedRoots = null; },

  draw(ctx, sig, s, frame) {
    const { w, h } = frame;
    const depth = Math.round(s.depth);
    const fork = Math.round(s.fork * 20) / 20;   // quantised so the cache holds
    const key = `${depth}:${fork}`;
    if (key !== cacheKey) { cache = build(depth, fork, 20260816); cacheKey = key; }

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(14,10,16,${1 - s.bg})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const scale = Math.min(w, h);
    const maxOrder = cache[cache.length - 1].order || 1;

    if (!lockedRoots || lockedRoots.length !== sig.limbs.length) {
      lockedRoots = sig.limbs.map((L) => ({ x: L.root.x, y: L.root.y }));
    }

    sig.limbs.forEach((L, i) => {
      const hue = (s.hue + (i / sig.limbs.length) * s.spread) % 360;
      const rootX = lockedRoots[i].x * w;
      const rootY = lockedRoots[i].y * h;
      const a = BASE_ANGLE;
      const size = scale * (0.4 + L.reach * 0.7);
      const vis = 0.35 + L.tip.v * 0.65;

      ctx.save();
      ctx.translate(rootX, rootY);
      ctx.rotate(a);
      ctx.lineCap = 'round';

      for (const seg of cache) {
        // Each branch order enters as growth passes its share of the range.
        const gate = seg.order / (maxOrder + 1);
        const g = Math.min(1, Math.max(0, (s.growth - gate) / 0.25));
        if (g <= 0) continue;

        const x2 = seg.x + (seg.x2 - seg.x) * g;
        const y2 = seg.y + (seg.y2 - seg.y) * g;

        ctx.strokeStyle = `hsla(${(hue + 90) % 360}, 34%, ${58 - seg.d * 3}%, ${0.5 * vis})`;
        ctx.lineWidth = Math.max(0.4, s.weight * (1 - seg.d / (depth + 2)));
        ctx.beginPath();
        ctx.moveTo(seg.x * size, seg.y * size);
        ctx.lineTo(x2 * size, y2 * size);
        ctx.stroke();

        if (seg.flower && g > 0.85) {
          const petals = 5;
          const pr = size * 0.028 * (0.3 + s.open) * g;
          ctx.fillStyle = `hsla(${hue}, 76%, 72%, ${0.5 * vis})`;
          for (let p = 0; p < petals; p++) {
            const pa = (p / petals) * TAU + seg.order;
            ctx.beginPath();
            ctx.ellipse(
              x2 * size + Math.cos(pa) * pr * 0.8,
              y2 * size + Math.sin(pa) * pr * 0.8,
              pr, pr * 0.6, pa, 0, TAU
            );
            ctx.fill();
          }
          ctx.fillStyle = `hsla(${(hue + 40) % 360}, 90%, 84%, ${0.7 * vis})`;
          ctx.beginPath();
          ctx.arc(x2 * size, y2 * size, pr * 0.42, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'source-over';
  },
};
