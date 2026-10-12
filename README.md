# shifting in motion

Physical motion translated to visual effects.

A kaleidoscope driven by your own body. Pose tracking reads how far you reach,
how sharply you fold, and which way you sweep, and turns that into colour, shape
and spin in real time. Three visuals, each reshapeable from inside.

Static files. No build step, no dependencies to install, no server code. Nothing
leaves the machine and nothing is recorded.

---

## Running it

ES modules need to be served over http, so opening `index.html` as a `file://`
URL will not work.

```
python3 -m http.server 8000
```

Run that from inside this directory.

Then open `http://localhost:8000`. A camera prompt appears only after you click
into the tool, never on page load.

Requires a browser with `getUserMedia` and WebAssembly: current Chrome, Edge,
Safari 16.4+, or Firefox.

---

## The four screens

| File | What it is |
|---|---|
| `index.html` | Landing. The shifting prismatic field, the title, one link. |
| `choose.html` | Full-screen chooser. All visuals running live, before any camera. Picking one opens the camera check as a popup. |
| `tool.html` | The instrument. Takes `?style=` and `?go=camera` or `?go=watch` (sent by the popup), then shows the canvas and side panel. |
| `?style=` | Any screen can deep-link a visual, e.g. `tool.html?style=ripples`. |

---

## Architecture

```
camera
  ->  pose.js         MediaPipe callback, writes raw landmarks
  ->  state.js        targets (raw) and eased (lerped per frame)
  ->  signals.js      normalized scalars describing the body
  ->  modulation.js   routes signals onto style parameters
  ->  styles/*.js     drawing, reads signals and settings only
  ->  main.js         rAF loop, canvas, style switching
```

Two rules hold this together, and most bugs come from breaking one of them.

**Never draw inside the pose callback.** The callback writes to shared state and
returns. The `requestAnimationFrame` loop reads it. Pose runs at a different and
irregular rate from the display, so coupling them makes movement stutter in a way
that looks like a rendering problem but is not.

**Renderers never touch a landmark.** They read signals. This is what keeps the
visuals from becoming copies of the pose code, and it is what makes the
tracking code and drawing code independent.

---

## The signal layer

`signals.js` is the contract between the body and the visuals, and the single
most important file here. Everything is continuous and bidirectional: more and
less are the same value moving two directions, so nothing needs a retract path.

All distances normalize by shoulder width, captured as a running maximum over the
first few seconds and then clamped, so signals do not change when you stand
closer to the camera.

**The four signals a style parameter can be driven by**, all read from the arms
specifically, so each one means exactly what it says:

| Signal | Range | From |
|---|---|---|
| `handSpeed` | 0..1 | smoothed mean hand speed, in shoulder widths per second |
| `handDistance` | 0..1 | the two hands together (1) against apart (0) |
| `handReach` | 0..1 | mean hand distance from the shoulder midpoint |
| `elbowAngle` | 0..1 | mean elbow bend, 1 fully folded, 0 straight |

These are deliberately plain: each is one thing you can point at your own body
and feel yourself doing, rather than a composite. Earlier versions also exposed
`asymmetry`, `gather`, `twist`, and shoulder `tilt` as drivable signals, but they
required understanding two limbs at once or an indirect proxy (foreshortening
for rotation) to predict, which made the side panel's "why did that change"
harder to answer than it needed to be.

**Per-limb signals**, in `signals.limbs` — geometry, not modulation. Renderers
use these directly to place things on screen; they are not in the four above.

| Signal | Range | From |
|---|---|---|
| `reach` | 0..1 | tip distance from the shoulder midpoint |
| `fold` | 0..1 | interior hinge angle, 1 fully bent, 0 straight |
| `sweep` | -pi..pi | root-to-tip angle, measured in the shoulder frame |
| `lift` | -1..1 | tip height relative to the shoulder line |

`sweep` is the primary axis of port de bras and the one most worth getting right.
It is measured in the shoulder frame rather than screen space, which is what keeps
it from jumping when you lean.

`reach` and `fold` look correlated but are not. Hands close with elbows dropped
and hands close with elbows lifted and rounded are different shapes, and only
`fold` separates them. `handReach` and `elbowAngle` are the frame-level, arms-only
means of these two, and are what styles actually get driven by.

`signals.tilt` (shoulder line angle) still exists but is diagnostic only, used by
the skeleton view — no style is driven by it.

### Limbs

A limb is a root, a hinge, and a tip. `signals.limbs` holds the two arms.
Renderers iterate the array and never ask how long it is.

### Three robustness requirements

These are not optional and removing any of them breaks every visual at once.

1. **Shoulder width is calibrated then clamped.** Without it, `handDistance` and
   `handReach` drift the moment you stand closer to or further from the camera.
2. **Missing points hold and decay.** A point below the visibility floor fades
   from its last position over 500ms rather than snapping to the origin. Wrists
   leave frame constantly.
3. **The video is mirrored horizontally.** People read their own image as a
   mirror and unmirrored left and right feels wrong immediately.

---

## Modulation

Every style parameter has three properties, held in one routing table per style
in `modulation.js`:

- **base**, where the parameter sits with no signal applied
- **signal**, which of the four signals drives it, or `none`
- **depth**, how far that signal pushes it

The side panel writes to this same table, so it is the only copy of this state —
nothing to keep in sync elsewhere.

The panel itself doesn't expose base/signal/depth directly. It shows four sliding
bars per style (`bars` in the style module, see below), each a plain-language
bundle over one or two schema keys. The first bar is always "reacts to your
movement" — it slides every signal-driven field's `depth` from 0 to 1 together.
The other three each slide a couple of keys' `base` between the style's own
default and a bolder hand-picked value. Nothing in the panel shows a signal name
or a raw number; the schema's `signal` field is still what decides which of the
four signals a parameter listens to, it's just not user-facing anymore.

---

## The visuals

**mirror** Faceted jewels drawn once into a wedge, then rotated and mirrored
around the centre. Draw once, blit N times, never draw N times. Wedge count uses
hysteresis so it does not flicker on a boundary value.

**ripples** Pooled rings emitted from every tip and hinge. Each emitter's own
`sweep` sets a drift vector, so rings advect across the surface instead of sitting
concentric. Drift is what reads as direction.

**constellation** A fixed, seeded sky, always fully present and mostly dim.
Attention fields at tips and hinges brighten what falls inside them, and lit stars
link to nearest lit neighbours with a capped degree so the graph stays legible.
Lines retract by drawing shorter rather than blinking off.

**skeleton** A diagnostic view, not offered in the UI but reachable at
`tool.html?style=skeleton`. It draws the tracked figure plainly with the shoulder
line and the sweep rays visible.

---

## The phantom

`phantom.js` is a synthetic dancer that emits exactly the shape `signals.js`
emits, so any renderer can be driven by it without knowing the difference.

It does two jobs. It animates the three chooser previews before a camera is ever
requested, and it takes over when a camera is refused or unavailable. A dead
canvas is a worse failure than a moving one, and this removes the need for a
recorded fallback video.

---

## Adding a visual

One file, one line.

```js
// styles/yours.js
export default {
  id: 'yours',
  label: 'yours',
  caption: 'one line of copy for the chooser.',

  defaults: { size: 0.5, hue: 200 },

  // What can be driven, and by which of the four signals by default.
  // Colour should stay on elbowAngle across styles — it's the one convention
  // worth keeping consistent, so "bend your elbow" always means "colour shifts".
  schema: [
    { key: 'size', label: 'size',   min: 0, max: 1,   step: 0.02, signal: 'handReach' },
    { key: 'hue',  label: 'colour', min: 0, max: 360, step: 1,    signal: 'elbowAngle' },
  ],

  // What the side panel actually shows: up to four sliding bars. `reactive`
  // is the movement master bar; the rest bundle base values between this
  // style's own defaults (off) and a bolder value (on).
  bars: [
    { id: 'reactive', kind: 'reactive', label: 'reacts to your movement' },
    { id: 'bold', label: 'bolder', on: { hue: 320, size: 0.9 } },
  ],

  reset() {},                       // clear cached geometry, optional

  draw(ctx, sig, s, frame) {
    // sig.limbs, sig.handSpeed, sig.handDistance ... never a raw landmark
    // s.size, s.hue ... already resolved through modulation
    // frame.w, frame.h, frame.t
  },
};
```

Then add it to the array in `styles/index.js`. It appears in the chooser with a
live preview and in the side panel's style list automatically. Without a `bars`
array it still works, just with nothing to slide in the "adjust" section.

Keep every number in `defaults`. A magic number inside `draw()` is a value nobody
can reach from the interface.

---

## The signal plate

Press **D** while the tool is running. Every signal appears as a labelled bar and
number, along with the frame rate.

This is a permanent fixture rather than a development leftover. When a visual
feels wrong, the cause is almost always a signal rather than the drawing code, so
read it here first. Things to check:

- `handReach` should approach 1.0 at full extension regardless of your distance
  from the camera.
- `handDistance` should climb toward 1 as your hands meet and drop toward 0 as
  they separate.
- `elbowAngle` should track a slow curl smoothly, independent of `handReach` —
  hands close with elbows dropped and hands close with elbows lifted are
  different shapes, and only `elbowAngle` tells them apart.
- `handSpeed` should build quickly and settle slowly.
- Walking out of frame and back should produce no snapping.

---

## Files

```
kaleidoscope/
  index.html         landing
  landing.css
  choose.html        full-screen chooser
  choose.css
  tool.html          the instrument
  style.css

  backdrop.js        the shifting prismatic field, shared by landing and tool
  config.js          mirroring, easing, calibration, landmark indices
  pose.js            MediaPipe, lazy loaded on click
  state.js           targets and eased, asymmetric easing, hold and decay
  signals.js         the signal layer
  modulation.js      routing table, signal to parameter
  phantom.js         synthetic dancer for previews and fallback
  controls.js        side panel, XY pad, routing rows
  debug.js           the signal plate
  main.js            render loop

  styles/
    index.js         registry
    mirror.js
    ripples.js
    constellation.js
    skeleton.js      diagnostic
```

---

## Hosting

Drop the folder into the portfolio repo at `/kaleidoscope/`. Both are static with
no build step, so it works with no configuration.

Keep the writeup at `/work/kaleidoscope` as a separate page rather than embedding
the tool in it. A page that requests camera access while someone is reading is
startling, and the tool's stylesheet will collide with the site's global one if
they share a DOM.

---

## Tuning notes

The visual constants are a first pass and are meant to be argued with. Start with
`chroma`, `shards`, `wedges` and `speed` on the backdrop, and the `defaults` block
at the top of each style.

`docs/build-plan.md` is the original planning document. Its phases and signal
tables still hold; its aesthetic direction and its single global `settings.js`
were both superseded, the latter because per-style settings keep each visual
self-contained.
