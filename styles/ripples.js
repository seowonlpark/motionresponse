// styles/ripples.js
// Minty pearl water. Ported from archive/water-ripple: a drifting pearl
// gradient with a caustic light-web on top, and ripples that bend that water
// (displacement) instead of being drawn over it. Emitters sit at every limb tip
// and hinge; rings drift rather than sitting concentric, which reads as direction.
//
// The water is computed per pixel on a small offscreen canvas and scaled up.
// The softness is the look, and it keeps the loop cheap.

const TAU = Math.PI * 2;
const POOL = 160;
const GRID_W = 224;           // ring field width (smooth, so low-res is fine); height follows the aspect
const OUT_W = 640;            // final water width: caustics and gradient are sharp, so this is higher
const BASE_HUE = 190;         // hue of the archive's pearl gradient

const pool = Array.from({ length: POOL }, () => ({ live: false }));
let cursor = 0;
let lastEmit = 0;

// Pearl stops from the archive's --pearl gradient.
const STOPS = [
  [0.00, 196, 233, 214], [0.22, 147, 216, 207], [0.44, 111, 179, 204],
  [0.62, 154, 219, 208], [0.72, 221, 235, 210], [0.86, 134, 207, 198],
  [1.00, 196, 233, 214],
];

let lut = new Uint8ClampedArray(256 * 3);
let lutHue = null;

function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

function buildLut(hue) {
  const m = hueMatrix(hue - BASE_HUE);
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    let k = 1;
    while (k < STOPS.length - 1 && STOPS[k][0] < p) k++;
    const a = STOPS[k - 1], b = STOPS[k];
    const f = (p - a[0]) / (b[0] - a[0]);
    const r = a[1] + (b[1] - a[1]) * f, g = a[2] + (b[2] - a[2]) * f, bl = a[3] + (b[3] - a[3]) * f;
    lut[i * 3]     = m[0] * r + m[1] * g + m[2] * bl;
    lut[i * 3 + 1] = m[3] * r + m[4] * g + m[5] * bl;
    lut[i * 3 + 2] = m[6] * r + m[7] * g + m[8] * bl;
  }
  lutHue = hue;
}

// hue -> rgb for tinting crests (full saturation, light)
function tintRGB(hue) {
  const h = (((hue % 360) + 360) % 360) / 60;
  const f = (n) => {
    const k = (n + h) % 6;
    return 0.5 - 0.5 * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

let field = new Float32Array(0);
let off = null, octx = null, img = null;

function spawn(x, y, dx, dy, hue, born, maxR, life) {
  const r = pool[cursor];
  cursor = (cursor + 1) % POOL;
  r.live = true;
  r.x = x; r.y = y; r.dx = dx; r.dy = dy;
  r.tint = tintRGB(hue); r.born = born; r.maxR = maxR; r.life = life;
}

export default {
  id: 'ripples',
  label: 'ripples',
  caption: 'minty water. speed sets how often, direction sets where the rings run.',

  defaults: {
    period: 150, drift: 0.5, wavelength: 0.42, life: 3600,
    hue: 190, spread: 30, weight: 1.6, bg: 0.55,
  },

  schema: [
    { key: 'period',     label: 'interval',      min: 40,  max: 500,  step: 5,    signal: 'handSpeed' },
    { key: 'drift',      label: 'drift',         min: 0,   max: 1.6,  step: 0.02, signal: 'handSpeed' },
    { key: 'wavelength', label: 'ring size',     min: 0.1, max: 1,    step: 0.02, signal: 'handDistance' },
    { key: 'life',       label: 'duration',      min: 900, max: 7000, step: 100 },
    { key: 'hue',        label: 'water colour',  min: 150, max: 250,  step: 1,    signal: 'elbowAngle' },
    { key: 'spread',     label: 'ring tint',     min: 0,   max: 120,  step: 1 },
    { key: 'weight',     label: 'ripple depth',  min: 0.4, max: 5,    step: 0.1 },
    { key: 'bg',         label: 'caustics',      min: 0,   max: 1,    step: 0.01 },
  ],

  bars: [
    { id: 'reactive', kind: 'reactive', label: 'react' },
    { id: 'busy',     label: 'ripples',  on: { period: 60 } },
    { id: 'bold',     label: 'colour', on: { spread: 100, weight: 3.2 } },
    { id: 'big',      label: 'size',  on: { wavelength: 0.85, life: 5500 } },
  ],

  reset() { pool.forEach((r) => (r.live = false)); },

  draw(ctx, sig, s, frame) {
    const { w, h, t } = frame;
    const W = GRID_W, H = Math.max(40, Math.round((GRID_W * h) / w));
    const k = W / w;                                   // css px -> grid px

    if (!off) { off = document.createElement('canvas'); octx = off.getContext('2d'); }
    const OW = Math.min(OUT_W, Math.round(w)), OH = Math.max(40, Math.round((OW * h) / w));
    if (off.width !== OW || off.height !== OH) {
      off.width = OW; off.height = OH;
      img = octx.createImageData(OW, OH);
    }
    if (field.length !== W * H * 6) field = new Float32Array(W * H * 6);
    const hueKey = Math.round(s.hue);
    if (lutHue !== hueKey) buildLut(hueKey);

    // ---- emit
    const spawnMaxR = Math.hypot(w, h) * 0.5 * s.wavelength * 1.3 * k;
    if (t - lastEmit > s.period) {
      lastEmit = t;
      sig.limbs.forEach((L, i) => {
        const hue = s.hue + (i / sig.limbs.length) * s.spread;
        const a = L.sweep;
        const dx = Math.cos(a) * s.drift * 0.00006;
        const dy = Math.sin(a) * s.drift * 0.00006;
        spawn(L.tip.x, L.tip.y, dx, dy, hue, t, spawnMaxR, s.life);
        if (L.hinge.v > 0.4) spawn(L.hinge.x, L.hinge.y, dx * 0.6, dy * 0.6, hue + 14, t, spawnMaxR * 0.8, s.life);
      });
    }

    // ---- live rings this frame
    const rings = [];
    for (const r of pool) {
      if (!r.live) continue;
      const age = t - r.born;
      if (age > r.life) { r.live = false; continue; }
      const p = age / r.life;
      const R = p * r.maxR;
      const lam = Math.max(11, r.maxR * 0.1);          // wavelength of the packet
      const e = Math.min(1, R / (lam * 4)), grow = e * e * (3 - 2 * e);   // fade in over the first wavelengths
      rings.push({
        x: (r.x + r.dx * age) * W, y: (r.y + r.dy * age) * H,
        R, lam, sig: lam * 1.3, soft: lam * lam,
        // swell in, spread thin as it travels, melt out
        a: Math.sin(p * Math.PI) * grow * (1 - p * 0.35) / (1 + R / (W * 0.5)),
        tint: r.tint,
      });
    }

    const disp = Math.min(s.weight, 3.5) * 2.4 * (W / 176);                        // refraction, grid px
    const causticAmt = s.bg;
    const tt = t * 0.001;
    const drift = 0.5 - 0.5 * Math.cos((t / 15000) * TAU);
    const asp = OW / OH;
    const Z = 3.0;                                      // pattern zoom-out (higher = smaller features)
    const d = img.data;

    // pass 1: ring field on the coarse grid
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let vx = 0, vy = 0, hgt = 0, tr = 0, tg = 0, tb = 0;
        for (let n = 0; n < rings.length; n++) {
          const q = rings[n];
          const ex = i - q.x, ey = j - q.y;
          const d2 = ex * ex + ey * ey;
          const dist = Math.sqrt(d2);
          const u = dist - q.R;
          if (u > q.sig * 2.4 || u < -q.sig * 2.4) continue;
          // softened direction: a plain ex/dist flips sign at the ring's centre, which
          // shows up as a hard pinwheel while the ring is still small
          const dn = Math.sqrt(d2 + q.soft);
          const env = Math.exp(-(u * u) / (q.sig * q.sig));
          const wave = Math.cos((u * TAU) / q.lam) * env * q.a;
          vx += (wave * ex) / dn; vy += (wave * ey) / dn;
          hgt += wave;
          const c = env * q.a;
          tr += q.tint[0] * c; tg += q.tint[1] * c; tb += q.tint[2] * c;
        }
        const f = (j * W + i) * 6;
        field[f] = vx; field[f + 1] = vy; field[f + 2] = hgt;
        field[f + 3] = tr; field[f + 4] = tg; field[f + 5] = tb;
      }
    }

    // pass 2: full-res water, reading the field bilinearly
    const fxs = (W - 1) / (OW - 1), fys = (H - 1) / (OH - 1);
    for (let j = 0; j < OH; j++) {
      const v = j / OH;
      const fy = j * fys, j0 = fy | 0, j1 = Math.min(H - 1, j0 + 1), wy1 = (fy - j0) * (fy - j0) * (3 - 2 * (fy - j0)), wy0 = 1 - wy1;
      for (let i = 0; i < OW; i++) {
        const fx = i * fxs, i0 = fx | 0, i1 = Math.min(W - 1, i0 + 1), wx1 = (fx - i0) * (fx - i0) * (3 - 2 * (fx - i0)), wx0 = 1 - wx1;
        const a00 = (j0 * W + i0) * 6, a10 = (j0 * W + i1) * 6, a01 = (j1 * W + i0) * 6, a11 = (j1 * W + i1) * 6;
        const w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
        const vx = field[a00] * w00 + field[a10] * w10 + field[a01] * w01 + field[a11] * w11;
        const vy = field[a00 + 1] * w00 + field[a10 + 1] * w10 + field[a01 + 1] * w01 + field[a11 + 1] * w11;
        const hgt = field[a00 + 2] * w00 + field[a10 + 2] * w10 + field[a01 + 2] * w01 + field[a11 + 2] * w11;
        const tr = field[a00 + 3] * w00 + field[a10 + 3] * w10 + field[a01 + 3] * w01 + field[a11 + 3] * w11;
        const tg = field[a00 + 4] * w00 + field[a10 + 4] * w10 + field[a01 + 4] * w01 + field[a11 + 4] * w11;
        const tb = field[a00 + 5] * w00 + field[a10 + 5] * w10 + field[a01 + 5] * w01 + field[a11 + 5] * w11;

        // sample the water through the refraction
        const sx = i / OW + (vx * disp) / W, sy = v + (vy * disp) / H;

        // pearl: gradient along 118deg, drifting, mirrored at the ends
        let pp = ((sx - 0.5) * 0.883 + (sy - 0.5) * 0.469) * 0.9 * Z + 0.35 + drift * 0.5;
        pp = Math.abs(((pp % 2) + 2) % 2 - 1);
        const li = ((pp * 255) | 0) * 3;
        let r = lut[li], g = lut[li + 1], b = lut[li + 2];

        // caustic light-web: two warped stripe sets, thin bright lines
        const X = sx * asp * Z, Y = sy * Z;
        const wx = Math.sin(Y * 4.1 + tt * 0.35) * 0.55 + Math.sin(X * 2.7 - tt * 0.28) * 0.45;
        const wy = Math.sin(X * 3.4 + tt * 0.31) * 0.5 + Math.sin(Y * 2.3 + tt * 0.22) * 0.4;
        const s1 = 1 - Math.abs(Math.sin((X * 0.788 + Y * 0.616 + wx) * 11 + tt * 0.6));
        const s2 = 1 - Math.abs(Math.sin((X * 0.588 - Y * 0.809 + wy) * 8 - tt * 0.45));
        const cs = (s1 * s1 * s1 * s1 * 0.8 + s2 * s2 * s2 * s2 * s2 * 0.5) * causticAmt;
        r += cs * 58; g += cs * 64; b += cs * 54;

        // crest sheen and trough shade, plus the tint of whoever made the ring
        if (hgt > 0) { const sh = Math.min(1, hgt * 1.2) * 22; r += sh; g += sh; b += sh; }
        else { const sh = Math.min(1, -hgt * 1.2) * 16; r -= sh; g -= sh * 0.7; b -= sh * 0.5; }
        // tint: blend toward the ring colour in proportion to how much ring is here,
        // saturating softly so overlaps can't stack into a bright wash
        const tmax = Math.max(tr, tg, tb);
        if (tmax > 0.5) {
          const c = tmax / 255, wgt = (c / (c + 0.5)) * 0.22, nrm = 255 / tmax;
          r += (tr * nrm - r) * wgt; g += (tg * nrm - g) * wgt; b += (tb * nrm - b) * wgt;
        }

        const o = (j * OW + i) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }

    octx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, w, h);
  },
};
