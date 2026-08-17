// phantom.js
// A virtual dancer. Emits exactly the shape signals.js emits, so any renderer
// can be driven by it without knowing the difference.
//
// Two jobs: it animates the chooser previews before a camera exists, and it is
// the fallback when a camera is refused or unavailable.

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

const pt = (x, y) => ({ x, y, px: x, py: y, v: 1 });

export function createPhantom(options = {}) {
  const cfg = { limbs: 2, tempo: 1, amplitude: 1, seed: 7, ...options };

  let s = cfg.seed * 2654435761;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  const defs =
    cfg.limbs === 4
      ? [
          { side: 'L', group: 'arm' }, { side: 'R', group: 'arm' },
          { side: 'L', group: 'leg' }, { side: 'R', group: 'leg' },
        ]
      : [{ side: 'L', group: 'arm' }, { side: 'R', group: 'arm' }];

  const phase = defs.map(() => rand() * TAU);

  const signals = {
    handSpeed: 0, handDistance: 0, handReach: 0, elbowAngle: 0,
    origin: { x: 0.5, y: 0.5 },
    scale: 0.19,
    ready: true,
    phantom: true,
    limbs: defs.map((d) => ({
      ...d, reach: 0, fold: 0, sweep: 0, lift: 0,
      root: pt(0.5, 0.5), hinge: pt(0.5, 0.5), tip: pt(0.5, 0.5),
    })),
  };

  function move(p, x, y) { p.px = p.x; p.py = p.y; p.x = x; p.y = y; }

  return function update(now) {
    const t = (now / 1000) * cfg.tempo;
    const A = cfg.amplitude;

    const sw = signals.scale;
    const shoulderAngle = Math.sin(t * 0.23) * 0.55 * A * (Math.PI / 4);
    const ox = 0.5 + Math.sin(t * 0.11) * 0.03;
    const oy = 0.46 + Math.sin(t * 0.14) * 0.02;
    signals.origin.x = ox;
    signals.origin.y = oy;

    let armSpeed = 0;
    let armSpeedCount = 0;

    signals.limbs.forEach((L, i) => {
      const ph = phase[i];
      const isLeg = L.group === 'leg';
      const dir = L.side === 'L' ? -1 : 1;

      L.reach = clamp(0.5 + Math.sin(t * (0.4 + i * 0.11) + ph) * 0.45 * A);
      L.fold = clamp(0.4 + Math.sin(t * (0.31 + i * 0.09) + ph * 1.7) * 0.36 * A);
      L.sweep = Math.sin(t * (0.26 + i * 0.07) + ph) * Math.PI * 0.75 * A;
      L.lift = Math.sin(t * (0.35 + i * 0.05) + ph * 0.6) * 0.85 * A;

      // Geometry consistent with the signals, so renderers that draw limbs work.
      const rootX = ox + dir * sw * 0.5;
      const rootY = oy + (isLeg ? sw * 1.4 : 0);
      const a = L.sweep + shoulderAngle;
      const len = sw * 2.2 * L.reach;
      const tipX = rootX + Math.cos(a) * len;
      const tipY = rootY + Math.sin(a) * len;
      const bend = (1 - L.fold) * 0.5 + 0.25;
      const hx = rootX + Math.cos(a - L.fold * dir * 0.9) * len * bend;
      const hy = rootY + Math.sin(a - L.fold * dir * 0.9) * len * bend;

      if (L.group === 'arm') {
        armSpeed += Math.hypot(tipX - L.tip.x, tipY - L.tip.y);
        armSpeedCount++;
      }
      move(L.root, rootX, rootY);
      move(L.hinge, hx, hy);
      move(L.tip, tipX, tipY);
    });

    // The same four values signals.js exposes, read the same way — off the
    // arms specifically — so a phantom-driven visual behaves like a real one.
    const l = signals.limbs.find((x) => x.group === 'arm' && x.side === 'L');
    const r = signals.limbs.find((x) => x.group === 'arm' && x.side === 'R');

    signals.handSpeed = clamp((armSpeed / Math.max(1, armSpeedCount) / sw) * 22);
    signals.handDistance = clamp(1 - Math.hypot(l.tip.x - r.tip.x, l.tip.y - r.tip.y) / (sw * 2.4));
    signals.handReach = (l.reach + r.reach) / 2;
    signals.elbowAngle = (l.fold + r.fold) / 2;

    return signals;
  };
}
