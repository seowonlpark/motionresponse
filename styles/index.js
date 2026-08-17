// styles/index.js
// Registry. Adding a style is: write the file, add it to this array.
//
// Every style module exports:
//   id       stable key, also the ?style= value
//   label    shown in the chooser and the side list
//   caption  one line of copy
//   defaults every tunable value. No magic numbers in draw().
//   schema   [{ key, label, min, max, step, signal }] drives console and pad
//   draw     (ctx, signals, resolvedSettings, frame) => void
//   reset    optional, clears cached geometry on style change or resize

import mirror from './mirror.js';
import ripples from './ripples.js';
import constellation from './constellation.js';
import skeleton from './skeleton.js';

export const styles = [mirror, ripples, constellation];

// Diagnostic view. Reachable with ?style=skeleton but not offered in the UI.
export const allStyles = [...styles, skeleton];

export const byId = (id) => allStyles.find((s) => s.id === id) || styles[0];
