// controls.js
// The side panel. Choose a visual, then four sliding bars shape it. Each bar
// bundles a couple of the style's underlying values behind one plain
// description and slides between the style's own default and a bolder take
// on it — nothing here exposes a raw number.

import { styles } from './styles/index.js';
import { routeFor, setRoute, resetRoute, SIGNAL_LABELS } from './modulation.js';
import { config } from './config.js';

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
    <p class="panel-head">visual</p>
    <nav class="stylelist" aria-label="visual"></nav>

    <p class="panel-head">adjust</p>
    <div class="barlist"></div>

    <footer class="console-foot">
      <label class="mode">figure
        <select aria-label="figure">
          <option value="auto">as detected</option>
          <option value="upper">upper body</option>
          <option value="full">full body</option>
        </select>
      </label>
      <button class="linkish" type="button">reset</button>
    </footer>`;

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
  (active.bars || []).forEach((bar) => {
    barlist.appendChild(buildBarRow(active, bar));
    if (bar.kind === 'reactive') {
      const map = buildSignalMap(active);
      if (map) barlist.appendChild(map);
    }
  });

  const modeSel = root.querySelector('.mode select');
  modeSel.value = config.mode;
  modeSel.addEventListener('change', () => root._h.onModeChange(modeSel.value));

  root.querySelector('.linkish').addEventListener('click', () => {
    resetRoute(active);
    renderControls(active);
  });

  wake();
}

function buildBarRow(active, bar) {
  const row = document.createElement('div');
  row.className = 'barrow' + (bar.kind === 'reactive' ? ' is-reactive' : '');
  row.innerHTML = `
    <i>${bar.label}</i>
    <input type="range" class="bar" min="0" max="1" step="0.02" value="${barValue(active, bar)}">`;

  row.querySelector('.bar').addEventListener('input', (e) =>
    setBarValue(active, bar, parseFloat(e.target.value))
  );

  return row;
}

// Spells out, in plain words, exactly what "reacts to your movement" means
// for the current visual — which of the four signals drives which parameter.
// This was the missing piece: the reactive bar changed things, but nothing
// said what was actually listening to what.
function buildSignalMap(active) {
  const groups = new Map();
  active.schema.forEach((f) => {
    if (!f.signal) return;
    if (!groups.has(f.signal)) groups.set(f.signal, []);
    groups.get(f.signal).push(f.label);
  });
  if (!groups.size) return null;

  const list = document.createElement('ul');
  list.className = 'signalmap';
  groups.forEach((fieldLabels, sigId) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${SIGNAL_LABELS[sigId]}</b> <span class="arrow">changes</span> ${fieldLabels.join(', ')}`;
    list.appendChild(li);
  });
  return list;
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
