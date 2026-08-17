// styles/constellation.js
// The stars are always all present. Movement lights them and draws the lines
// between them. Lines retract by drawing shorter, never by blinking off.

const TAU = Math.PI * 2;
const COUNT = 260;

let stars = null;
let built = 0;

// The lit-decay rates below are tuned as per-frame factors at ~60fps;
// rescale by dt so stars don't flicker faster or slower as the frame
// interval wobbles.
const REF_DT = 1000 / 60;
const timeK = (k, dt) => 1 - Math.pow(1 - k, dt / REF_DT);

function build() {
  let s = 20260816 >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  stars = Array.from({ length: COUNT }, () => ({
    x: rand(), y: rand(),
    mag: 0.25 + rand() * 0.75,
    tw: rand() * TAU,
    lit: 0,
  }));
  built = COUNT;
}

export default {
  id: 'constellation',
  label: 'constellation',
  caption: 'a fixed sky. reach lights the stars and draws the figures between them.',

  defaults: {
    // Fixed slow drift. Not in schema, so it's never adjustable or
    // driven by a body signal — the sky always turns at this one rate.
    field: 0.3, link: 0.16, degree: 3, rotate: 0.2,
    twinkle: 0.5, hue: 215, warmth: 20, bg: 0.04,
  },

  schema: [
    { key: 'field',   label: 'light radius',  min: 0.05, max: 0.7,  step: 0.01, signal: 'handReach' },
    { key: 'link',    label: 'link distance', min: 0.04, max: 0.4,  step: 0.01, signal: 'handDistance' },
    { key: 'degree',  label: 'links per star', min: 1,    max: 6,    step: 1 },
    { key: 'twinkle', label: 'twinkle',       min: 0,    max: 1,    step: 0.02, signal: 'handSpeed' },
    { key: 'hue',     label: 'colour',        min: 180,  max: 280,  step: 1,    signal: 'elbowAngle' },
    { key: 'warmth',  label: 'warmth',        min: 0,    max: 60,   step: 1 },
    { key: 'bg',      label: 'trail',         min: 0,    max: 0.3,  step: 0.01 },
  ],

  bars: [
    { id: 'reactive', kind: 'reactive', label: 'reacts to your movement' },
    { id: 'links',    label: 'more connections', on: { link: 0.32, degree: 5 } },
    { id: 'warm',     label: 'warmer colour',    on: { warmth: 48, twinkle: 0.85 } },
    { id: 'wide',     label: 'wider reach',      on: { field: 0.5 } },
  ],

  reset() { stars = null; },

  draw(ctx, sig, s, frame) {
    const { w, h, t, dt } = frame;
    if (!stars || built !== COUNT) build();

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(6,7,14,${1 - s.bg})`;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const rot = (t / 1000) * s.rotate * 0.06;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const R = Math.max(w, h);

    // Screen position of a star after the sky rotates.
    const place = (st) => {
      const dx = (st.x - 0.5) * R, dy = (st.y - 0.5) * R;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    };

    // Attention fields at tips and hinges brighten what falls inside them.
    const fields = [];
    for (const L of sig.limbs) {
      fields.push([L.tip.x * w, L.tip.y * h, s.field * R * 0.5, L.tip.v]);
      fields.push([L.hinge.x * w, L.hinge.y * h, s.field * R * 0.3, L.hinge.v * 0.7]);
    }

    const litList = [];
    ctx.globalCompositeOperation = 'lighter';

    const kLitUp = timeK(0.16, dt);
    const kLitDown = timeK(0.045, dt);

    for (const st of stars) {
      const [x, y] = place(st);
      let target = 0;
      for (const [fx, fy, fr, fv] of fields) {
        const d = Math.hypot(x - fx, y - fy);
        if (d < fr) target = Math.max(target, (1 - d / fr) * fv);
      }
      st.lit += (target - st.lit) * (target > st.lit ? kLitUp : kLitDown);

      const tw = 1 + Math.sin(t * 0.004 * (0.4 + s.twinkle) + st.tw) * 0.3 * s.twinkle;
      const alpha = (0.09 + st.lit * 0.9) * st.mag * tw;
      const rad = (0.6 + st.lit * 2.4) * st.mag * (w / 900 + 0.7);
      const hue = (s.hue - st.lit * s.warmth + 360) % 360;

      ctx.fillStyle = `hsla(${hue}, ${20 + st.lit * 40}%, ${80 + st.lit * 18}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();

      // Brighter stars get a cross flare, which is what makes a field of dots
      // read as a sky rather than noise.
      if (st.lit > 0.55) {
        const f = (st.lit - 0.55) * 2.2 * rad * 4;
        ctx.strokeStyle = `hsla(${hue}, 60%, 92%, ${alpha * 0.5})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - f, y); ctx.lineTo(x + f, y);
        ctx.moveTo(x, y - f); ctx.lineTo(x, y + f);
        ctx.stroke();
      }

      if (st.lit > 0.16) litList.push({ x, y, lit: st.lit });
    }

    // Link lit stars to their nearest lit neighbours, capped so the graph stays
    // legible instead of collapsing into a mesh.
    const maxD = s.link * R;
    const cap = Math.round(s.degree);
    for (let i = 0; i < litList.length; i++) {
      const a = litList[i];
      const near = [];
      for (let j = 0; j < litList.length; j++) {
        if (i === j) continue;
        const b = litList[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxD) near.push({ b, d });
      }
      near.sort((p, q) => p.d - q.d);
      for (let k = 0; k < Math.min(cap, near.length); k++) {
        const { b, d } = near[k];
        const strength = Math.min(a.lit, b.lit) * (1 - d / maxD);
        if (strength < 0.05) continue;
        // Partial length is the retraction. Lines withdraw along themselves.
        const g = Math.min(1, strength * 2.4);
        ctx.strokeStyle = `hsla(${s.hue}, 45%, 88%, ${strength * 0.5})`;
        ctx.lineWidth = 0.6 + strength;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * g, a.y + (b.y - a.y) * g);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
