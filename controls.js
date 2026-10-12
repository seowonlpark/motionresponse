// controls.js
// The side panel. Choose a visual, then up to four sliding bars shape it. Each bar
// bundles a couple of the style's underlying values behind one plain
// description and slides between the style's own default and a bolder take
// on it — nothing here exposes a raw number.

import { styles } from './styles/index.js';
import { routeFor, setRoute } from './modulation.js';

let root = null;
let idleTimer = null;

export function initControls(container, handlers) {
  root = document.createElement('div');
  root.className = 'console';
  container.appendChild(root);
  root._h = handlers;

  root.addEventListener('pointerdown', wake);
  window.addEventListener('pointermove', wake);
  wake();
  return root;
}

// The panel recedes when the room is still and returns on movement.
function wake() {
  if (!root) return;
  root.classList.remove('receded');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => root.classList.add('receded'), 4200);
}

export function renderControls(active) {
  if (!root) return;

  root.innerHTML = `
    <nav class="stylelist" aria-label="visual"></nav>
    <div class="barlist"></div>`;

  // Style list
  const list = root.querySelector('.stylelist');
  styles.forEach((st) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'styleitem' + (st.id === active.id ? ' is-on' : '');
    b.setAttribute('aria-current', st.id === active.id);
    b.innerHTML = `<strong>${st.label}</strong>`;
    b.addEventListener('click', () => root._h.onStyleChange(st.id));
    list.appendChild(b);
  });

  // Bars — up to four per style, defined alongside its schema. The signal
  // map (what movement drives what) goes right under the bar it explains.
  const barlist = root.querySelector('.barlist');
  const bars = active.bars || [];
  const sections = [
    ['Reactivity', bars.filter((b) => b.kind === 'reactive')],
    ['Adjust', bars.filter((b) => b.kind !== 'reactive')],
  ];
  sections.forEach(([title, items]) => {
    if (!items.length) return;
    const sec = document.createElement('section');
    sec.className = 'barsection';
    sec.innerHTML = `<h3 class="panel-head">${title}</h3>`;
    items.forEach((bar) => sec.appendChild(buildBarRow(active, bar)));
    barlist.appendChild(sec);
  });

  wake();
}

function buildBarRow(active, bar) {
  const row = document.createElement('div');
  row.className = 'barrow' + (bar.kind === 'reactive' ? ' is-reactive' : '');
  row.innerHTML = `
    <i>${bar.label}</i>
    <input type="range" class="bar" min="0" max="1" step="0.02" value="${barValue(active, bar)}">`;
  const input = row.querySelector('.bar');
  const paint = () => input.style.setProperty('--v', input.value);
  paint();
  input.addEventListener('input', paint);

  row.querySelector('.bar').addEventListener('input', (e) =>
    setBarValue(active, bar, parseFloat(e.target.value))
  );

  return row;
}

// Reads a bar's current position (0–1) back out of the routing table, rather
// than tracking it separately — the table is the only place this state
// lives, so the slider can never drift out of sync with it.
function barValue(active, bar) {
  const route = routeFor(active);
  if (bar.kind === 'reactive') {
    const f = active.schema.find((f) => f.signal);
    return f ? route[f.key].depth : 0;
  }
  const [key, onVal] = Object.entries(bar.on)[0];
  const offVal = active.defaults[key];
  return clamp01((route[key].base - offVal) / (onVal - offVal));
}

function setBarValue(active, bar, t) {
  t = clamp01(t);
  if (bar.kind === 'reactive') {
    active.schema.forEach((f) => {
      if (!f.signal) return;
      setRoute(active, f.key, { signal: f.signal, depth: t });
    });
    return;
  }
  Object.entries(bar.on).forEach(([key, onVal]) => {
    const offVal = active.defaults[key];
    setRoute(active, key, { base: offVal + (onVal - offVal) * t });
  });
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
