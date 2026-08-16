// backdrop.js
// The shifting prismatic field, built as inline SVG driven by CSS transforms
// rather than a rasterized canvas -- vector shapes render at native display
// resolution at any window size or DPR, so there is no offscreen bitmap to
// upscale and blur.
//
// A wedge of soft chromatic bodies and crisp facet-edge triangles is drawn
// once into <defs>. N rotated (and, on alternate wedges, vertically mirrored)
// <use> instances of that same wedge, each clipped to a pie slice, build the
// kaleidoscope symmetry -- the DOM/CSS equivalent of "draw once, blit N times."
//
// Eye comfort is a hard constraint, so three rules hold throughout:
//   1. Tints composite with 'multiply' on a near-white base. Nothing blows out.
//   2. Chroma stays under about 60% saturation at high lightness. Pastel, not neon.
//   3. Everything moves slowly. Hue drifts over minutes, not seconds, via a
//      looping CSS animation rather than a per-frame recompute.

const TAU = Math.PI * 2;
const SVGNS = 'http://www.w3.org/2000/svg';
const V = 100; // half-extent of the wedge's coordinate space, in SVG user units

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .kaleido-base { position: relative; overflow: hidden; background: #f6f6f7; }
    .kaleido-svg {
      position: absolute; top: 50%; left: 50%;
      width: 150vmax; height: 150vmax;
      transform: translate(-50%, -50%);
      animation: kaleido-spin var(--kaleido-spin-dur, 140s) linear infinite,
                 kaleido-hue var(--kaleido-hue-dur, 400s) linear infinite;
    }
    .kaleido-svg.is-reduced {
      animation: none;
      transform: translate(-50%, -50%) rotate(11.5deg);
      filter: hue-rotate(210deg);
    }
    .kaleido-lift {
      position: absolute; inset: 0;
      background: linear-gradient(135deg,
        rgba(255,255,255,.62), rgba(255,255,255,.18) 45%, rgba(255,255,255,0) 82%);
      pointer-events: none;
    }
    @keyframes kaleido-spin {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to   { transform: translate(-50%, -50%) rotate(360deg); }
    }
    @keyframes kaleido-hue {
      from { filter: hue-rotate(0deg); }
      to   { filter: hue-rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .kaleido-svg { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

export function createBackdrop(container, options = {}) {
  const cfg = {
    wedges: 6,        // even numbers mirror cleanly
    shards: 22,       // intricacy. more shards, denser facets
    speed: 0.045,     // rotation, radians per second
    hueDrift: 0.9,    // degrees per second
    hueSpread: 300,   // how much of the spectrum is present at once
    chroma: 0.5,      // 0 near-grey, 1 full pastel
    ...options,
  };

  injectStyles();
  container.classList.add('kaleido-base');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Seeded so the composition is stable across reloads rather than a new
  // random field every visit.
  let seed = 20260816;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const shards = Array.from({ length: cfg.shards }, () => ({
    a: rand() * TAU,
    r: 0.08 + rand() * 0.62,
    len: 0.18 + rand() * 0.5,
    wide: 0.12 + rand() * 0.5,
    hue: rand() * cfg.hueSpread,
    bright: rand() > 0.72,
  }));

  const bodySat = Math.round(52 * cfg.chroma + 18);
  const facetSat = Math.round(46 * cfg.chroma + 14);
  const breathe = 0.9; // static stand-in for the canvas version's per-frame pulse

  const N = Math.max(2, cfg.wedges - (cfg.wedges % 2));
  const step = 360 / N;
  const halfStep = (step / 2) * (Math.PI / 180);

  const svg = svgEl('svg', {
    class: 'kaleido-svg' + (reduced ? ' is-reduced' : ''),
    viewBox: `${-V} ${-V} ${V * 2} ${V * 2}`,
  });
  svg.style.setProperty('--kaleido-spin-dur', `${(TAU / cfg.speed).toFixed(1)}s`);
  svg.style.setProperty('--kaleido-hue-dur', `${(360 / cfg.hueDrift).toFixed(1)}s`);

  const defs = svgEl('defs');
  svg.appendChild(defs);

  // Pie-slice clip, shared by every wedge instance.
  const clipId = 'kaleido-wedge-clip';
  const clipPath = svgEl('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
  const clipShape = svgEl('path', {
    d: `M 0 0 L ${(V * Math.cos(-halfStep)).toFixed(2)} ${(V * Math.sin(-halfStep)).toFixed(2)} ` +
       `A ${V} ${V} 0 0 1 ${(V * Math.cos(halfStep)).toFixed(2)} ${(V * Math.sin(halfStep)).toFixed(2)} Z`,
  });
  clipPath.appendChild(clipShape);
  defs.appendChild(clipPath);

  // One wedge's worth of content, drawn once and reused by every <use> below.
  const wedge = svgEl('g', { id: 'kaleido-wedge' });

  // Opaque near-white floor so 'multiply' deepens overlaps instead of just
  // darkening toward transparent -- the same role the canvas fillRect played.
  wedge.appendChild(svgEl('rect', { x: -V, y: -V, width: V * 2, height: V * 2, fill: '#f6f6f7' }));

  shards.forEach((s, i) => {
    const x = Math.cos(s.a) * s.r * V * breathe;
    const y = Math.sin(s.a) * s.r * V * breathe;
    const rad = s.len * V * breathe;
    const hue = s.hue % 360;

    const gradId = `kaleido-grad-${i}`;
    const grad = svgEl('radialGradient', { id: gradId });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': `hsl(${hue.toFixed(1)}, ${bodySat}%, 88%)`, 'stop-opacity': 0.85 }));
    grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': `hsl(${((hue + 26) % 360).toFixed(1)}, ${bodySat}%, 91%)`, 'stop-opacity': 0.42 }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#fff', 'stop-opacity': 0 }));
    defs.appendChild(grad);

    wedge.appendChild(svgEl('circle', {
      cx: x.toFixed(2), cy: y.toFixed(2), r: rad.toFixed(2),
      fill: `url(#${gradId})`, style: 'mix-blend-mode: multiply',
    }));
  });

  // Facet edges. Thin, straight, and where the intricacy comes from.
  shards.forEach((s) => {
    const facetHue = (s.hue + 40) % 360;
    const x1 = Math.cos(s.a) * s.r * V;
    const y1 = Math.sin(s.a) * s.r * V;
    const x2 = Math.cos(s.a + s.wide) * (s.r + s.len) * V;
    const y2 = Math.sin(s.a + s.wide) * (s.r + s.len) * V;
    const x3 = Math.cos(s.a - s.wide * 0.6) * (s.r + s.len * 0.6) * V;
    const y3 = Math.sin(s.a - s.wide * 0.6) * (s.r + s.len * 0.6) * V;
    const points = `${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x3.toFixed(2)},${y3.toFixed(2)}`;

    const poly = svgEl('polygon', {
      points,
      fill: `hsl(${facetHue.toFixed(1)}, ${facetSat}%, 93%)`,
      'fill-opacity': 0.5,
      style: 'mix-blend-mode: multiply',
    });
    // A few edges catch the light. Restraint: only about a quarter of them.
    if (s.bright) {
      poly.setAttribute('stroke', `hsl(${facetHue.toFixed(1)}, 70%, 97%)`);
      poly.setAttribute('stroke-opacity', 0.9);
      poly.setAttribute('stroke-width', 0.6);
    }
    wedge.appendChild(poly);
  });

  defs.appendChild(wedge);

  for (let i = 0; i < N; i++) {
    const g = svgEl('g', {
      transform: `rotate(${i * step})${i % 2 ? ' scale(1,-1)' : ''}`,
      'clip-path': `url(#${clipId})`,
    });
    g.appendChild(svgEl('use', { href: '#kaleido-wedge' }));
    svg.appendChild(g);
  }

  const lift = document.createElement('div');
  lift.className = 'kaleido-lift';

  container.append(svg, lift);

  return {
    stop() { svg.remove(); lift.remove(); },
  };
}
