// modulation.js
// Every style parameter has a base value and, optionally, a signal driving it.
// The console and the pad both edit the same routing table through this module,
// so there is one source of truth for what the body is currently controlling.

// Four signals, all read straight off the hands and elbows. Nothing here is
// a composite or a proxy — each one is a single plain body measurement.
const norm = {
  none:         () => 0,
  handSpeed:    (s) => s.handSpeed,
  handDistance: (s) => s.handDistance,
  handReach:    (s) => s.handReach,
  elbowAngle:   (s) => s.elbowAngle,
};

export const SIGNAL_LABELS = {
  none: 'nothing', handSpeed: 'hand speed', handDistance: 'hand distance',
  handReach: 'hand location', elbowAngle: 'elbow angle',
};

export function signalValue(signals, id) {
  const f = norm[id] || norm.none;
  const v = f(signals);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

// Routing table, per style. { [key]: { base, signal, depth } }
const routes = new Map();

export function routeFor(style) {
  if (!routes.has(style.id)) {
    const r = {};
    for (const f of style.schema) {
      r[f.key] = {
        base: style.defaults[f.key],
        signal: f.signal || 'none',
        depth: f.signal ? (f.depth ?? 0.75) : 0,
      };
    }
    routes.set(style.id, r);
  }
  return routes.get(style.id);
}

export function setRoute(style, key, patch) {
  Object.assign(routeFor(style)[key], patch);
}

export function resetRoute(style) {
  routes.delete(style.id);
}

// Called once per frame. Base value, pushed toward the far end of the range by
// however much of its signal is present.
export function resolve(style, signals) {
  const r = routeFor(style);
  const out = { ...style.defaults };
  for (const f of style.schema) {
    const cell = r[f.key];
    const span = f.max - f.min;
    const drive = cell.signal === 'none' ? 0 : signalValue(signals, cell.signal);
    const v = cell.base + span * cell.depth * (drive - 0.5) * 2;
    out[f.key] = Math.min(f.max, Math.max(f.min, v));
  }
  return out;
}
