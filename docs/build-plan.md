# Dance Kaleidoscope: Build Plan

Rebuild from scratch. Static, no build step, ES modules, Canvas 2D, MediaPipe Pose.

---

## 1. Non-negotiables

Decided once, not revisited:

- Runs as static files with no build step.
- Nothing leaves the machine. Nothing is recorded.
- MediaPipe loads only after an explicit click, never on page load.
- Every default value lives in `settings.js`. No magic numbers in renderers.
- Renderers never touch a landmark. They read signals only.

---

## 2. Pipeline

```
camera
  -> pose.js        MediaPipe callback, writes raw landmarks
  -> state.js       targets (raw) and eased (lerped per frame)
  -> signals.js     normalized scalars describing the body
  -> styles/*.js    drawing, reads signals + settings only
  -> main.js        rAF loop, canvas, style crossfade
```

Two rules hold this together:

1. **Never draw inside the pose callback.** The callback writes to shared state. The `requestAnimationFrame` loop reads it. Pose runs at a different, irregular rate from the display.
2. **Two layers of state.** `targets` holds raw landmark positions. `eased` lerps toward targets every frame with asymmetric easing, faster attack than release. That asymmetry is what gives movement weight.

---

## 3. Signal layer

The signal layer is the contract between the body and the visuals. It is the single most important file in the project and the one to budget real time for.

### 3.1 Shared contract across modes

Both modes expose **the same signal names with the same ranges**. Renderers never branch on mode. Signals unavailable in a mode return a defined neutral fallback, listed below.

All distances normalize by **shoulder width in pixels**, captured as a running maximum over the first few seconds and then clamped. This makes every signal invariant to how close the dancer stands to the camera.

### 3.2 Core signals (both modes)

Frame signals, from the shoulder line:

| Signal | Range | Derived from |
|---|---|---|
| `tilt` | -1..1 | shoulder line angle vs horizontal |
| `twist` | 0..1 | apparent shoulder width vs calibrated max, foreshortening proxy for torso rotation |
| `sway` | -1..1 | shoulder midpoint horizontal offset from frame center |
| `rise` | -1..1 | shoulder midpoint vertical offset, catches sinking and lifting |

Per-arm signals, computed twice (L and R):

| Signal | Range | Derived from |
|---|---|---|
| `reach` | 0..1 | wrist distance from shoulder midpoint, over shoulder width |
| `fold` | 0..1 | interior elbow angle, 1 fully bent, 0 straight |
| `sweep` | -pi..pi | angle of shoulder-to-wrist vector, measured **in the shoulder-line frame** |
| `lift` | -1..1 | wrist height relative to the shoulder line |

Pair signals:

| Signal | Range | Derived from |
|---|---|---|
| `energy` | 0..1 | smoothed mean speed of tracked points, in shoulder widths per second |
| `asymmetry` | -1..1 | `reachL` minus `reachR` |
| `gather` | 0..1 | inverse wrist-to-wrist distance |

`sweep` is the primary axis of port de bras and the signal most worth getting right. Measuring it in the shoulder frame rather than screen space keeps it stable when the dancer leans.

`reach` and `fold` are correlated but not redundant: hands close with elbows dropped and hands close with elbows lifted and rounded are different shapes, and only `fold` separates them.

### 3.3 Full-body extension

Full-body mode adds these. In upper-body mode each returns its listed fallback.

| Signal | Range | Derived from | Upper-body fallback |
|---|---|---|---|
| `verticality` | 0..1 | hip-to-shoulder axis vs vertical | derive from `rise`, weakly |
| `stance` | 0..1 | ankle separation over shoulder width | 0.5 constant |
| `groundedness` | 0..1 | hip height relative to standing calibration, catches plie and jump | 0.5 constant |
| `legSweep` L/R | -pi..pi | hip-to-ankle vector in torso frame | mirror the arm `sweep` |
| `legFold` L/R | 0..1 | interior knee angle | mirror the arm `fold` |
| `airborne` | 0..1 | vertical velocity of hip midpoint, positive only | 0 constant |

Full-body mode also **changes the point set feeding `energy` and the emitter lists** (see 4.2). It does not change the meaning of any core signal.

### 3.4 Robustness requirements

Non-optional, all three:

1. **Calibrate shoulder width on start.** Running max over the opening seconds, then clamp. Without this, `twist` drifts the moment the dancer turns.
2. **Gate on landmark visibility, hold last known.** A missing point decays toward its last position over roughly 500ms. Wrists leave the frame constantly at upper-body framing. Snapping to zero makes every style flinch.
3. **Mirror the video horizontally.** People read their own image as a mirror. Unmirrored left and right feels wrong immediately.

---

## 4. Mode selection

### 4.1 How the mode is chosen

Run a visibility check over the first few seconds: mean confidence of hips and ankles. Above threshold, full body. Below, upper body. Expose a manual override in the controls, since a dancer may deliberately want the upper-body reading while standing full length in frame.

Mode is a value in `settings.js`, not a separate code path.

### 4.2 What actually differs

Only three things:

- **Point set.** Upper body tracks 6 points (shoulders, elbows, wrists). Full body adds hips, knees, ankles.
- **Emitter lists.** Styles that place emitters read `settings.emitters[mode]`, a named list, rather than hardcoding wrists.
- **Extension signals.** Present or falling back per 3.3.

Everything downstream is identical. Build upper-body mode first, get all four styles working, then add full body as a second point set and emitter list. It should be additive, not a fork.

---

## 5. The four styles

Each style is a module exporting a pure function of `(ctx, signals, settings, palette)`. Signal-to-parameter mappings live in `settings.js` so feel can be tuned without editing drawing code.

Every parameter driven by a signal is **continuous and bidirectional**. More and less are the same knob moving two directions. Nothing needs a separate retract path.

### 5.1 Mirror

Classic kaleidoscope. Landmarks become faceted jewel shapes.

| Parameter | Driven by |
|---|---|
| rotation offset | mean `sweep` |
| wedge count, 6 to 16 stepped | `gather`, hands together tightens |
| spin velocity, saturation | `energy` |
| hue walk | `asymmetry` |
| facet elongation | `reach` |

Draw once into a clipped offscreen canvas, then transform and blit N times. Never draw N times. Apply hysteresis at wedge-count boundaries so it does not flicker when hovering between values.

### 5.2 Ripples

Rings on water. Pooled ring objects with age, radius, origin, drift.

| Parameter | Driven by |
|---|---|
| emission period | `energy`, fast movement gives dense rings |
| drift vector per emitter | that emitter's `sweep` |
| wavelength, max radius | `reach` |
| surface bias | `tilt` |

Emitters: wrists and elbows (upper body), plus ankles and knees (full body). Additive blending so overlapping rings interfere. Drift is what reads as direction; concentric rings alone look static.

Palette: deep indigo through pale cyan over a soft pastel wash. Cool throughout.

### 5.3 Bloom

Recursive branching with flowers. **Fixed seed** so the tree is stable, not re-randomized each frame.

| Parameter | Driven by |
|---|---|
| trunk direction | `sweep` |
| fork angle | `fold`, bent arm gives a denser twisted tree |
| recursion depth | `reach` |
| growth scalar, 0..1 | `lift`, raising the arms opens the blossoms |
| flower open amount | `energy` |

The growth scalar gates how far along each branch is drawn. Branches extend and retract visibly instead of popping in and out. Cache geometry, rebuild only when depth or fork angle crosses a threshold.

Palette: ink strokes over soft washes. Blush, cream, pale gold on off-white.

### 5.4 Constellation

Seeded star field, always fully present, mostly dim.

| Parameter | Driven by |
|---|---|
| attention field radius | `reach` |
| sky rotation | `twist` and `tilt`, geared down |
| connection distance threshold | `gather` |
| twinkle rate, line draw speed | `energy` |

Attention fields sit at wrists and elbows. Stars inside brighten. Stars above a brightness threshold connect to nearest lit neighbors, with a capped degree so the graph stays readable. Retraction draws partial line lengths so connections withdraw along themselves rather than blinking off.

Palette: white and pale blue on near-black, fine grain.

---

## 6. File layout

```
/kaleidoscope/
  index.html
  main.js              loop, canvas sizing, style switching, crossfade
  pose.js              MediaPipe init, writes targets
  state.js             targets, eased, easing
  signals.js           derived body signals, both modes
  styles/
    index.js           registry, crossfade
    mirror.js
    ripples.js
    bloom.js
    constellation.js
  settings.js          defaults, signal mappings, emitter lists, schema
  palettes.js
  controls.js          panel built from schema
  style.css
  assets/              paper texture, plate illustrations, fallback video
```

---

## 7. Build phases

Each phase has a gate. Do not proceed past a failing gate.

**Phase 0. Spec.** Non-negotiables written down. Minimum shippable version defined as upper-body mode, mirror style only, no control panel.

**Phase 1. Skeleton on screen.** `index.html`, one canvas, `getUserMedia`, MediaPipe Pose, raw landmarks as dots. No styling, no symmetry.
*Gate: tracks at a steady frame rate.*

**Phase 2. Architecture, before any visuals.** This is the phase referenced throughout and the one that determines whether the rest is pleasant or painful. It covers three things:

- Decoupling: pose callbacks write to shared state, the rAF loop reads it.
- Easing: `targets` and `eased` layers with asymmetric attack and release.
- `signals.js`: the full signal vocabulary, plus all three robustness requirements from 3.4.

Debug view: render every signal as a labeled numeric readout and a bar. Move in front of it until each one behaves. This debug overlay stays in the codebase permanently, toggled by a key.

*Gate: motion stays smooth when pose drops frames, and every signal reads sensibly through a full range of movement without spiking or sticking.*

**Phase 3. Mirror style.** Wedge transform, offscreen draw and blit, hysteresis.
*Gate: symmetry holds when moving to the edge of frame.*

**Phase 4. Remaining styles.** Ripples, then constellation, then bloom. Bloom last: cached recursive geometry is the only genuinely hard one. Commit between each.

**Phase 5. Controls, presets, crossfade.** `controls.js` builds the panel from the schema in `settings.js`, not hand-written HTML per slider. Presets are named settings snapshots. Style switches crossfade over roughly 600ms via offscreen canvases; a hard cut between two full-screen visual worlds is jarring.

**Phase 6. Full-body mode.** Second point set, second emitter list, extension signals. Additive only.

**Phase 7. Ship.** See section 9.

---

## 8. Aesthetic direction

Artistic and immersive, not sleek. Stated as constraints because they have implementation consequences.

**Avoid:** cards, drop shadows, rounded rectangles, sans-serif UI font, dark-mode dashboard chrome, hamburger menus, toast notifications.

**Instead:**

- Full-bleed canvas. Paper or film grain texture over the whole surface.
- A serif with warmth. Real letterpress or plate-book feeling, not a web-default serif.
- Controls that recede: fade out after a few seconds of stillness, return on movement of the pointer.
- The four styles chosen as small illustrated plates, not tabs.
- Transitions slow and eased. Nothing snaps.
- Copy written as captions, not labels.

The interface should read closer to a printed plate or a musical instrument than a settings panel.

---

## 9. Ship checklist

- Hosted at `/kaleidoscope/` inside the portfolio repo, static, no config.
- `/work/kaleidoscope` is the writeup page, with the recorded loop as hero. Button leads to the tool. Do not iframe.
- Click-to-start gate. One line of copy: uses your camera, nothing leaves your machine, nothing is recorded.
- MediaPipe lazy-loads on that click only.
- Recorded video loop as fallback on small screens or denied permission. **Record this while building, not after.**
- Back link from the tool to the writeup.

---

## 10. Tuning notes

Keep a running log of mapping values that felt right, in `settings.js` comments. The signal-to-parameter mappings are what get tuned repeatedly for the rest of the project; the drawing code will settle long before they do.
