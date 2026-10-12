// config.js
// Global settings only. Per-style settings live in each style module.

// BlazePose 33-point landmark indices.
export const LM = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
};

// A limb is root -> hinge -> tip. Only the arms are tracked.
export const LIMBS = [
  { side: 'L', group: 'arm', root: LM.L_SHOULDER, hinge: LM.L_ELBOW, tip: LM.L_WRIST },
  { side: 'R', group: 'arm', root: LM.R_SHOULDER, hinge: LM.R_ELBOW, tip: LM.R_WRIST },
];

export const config = {
  // People read their own image as a mirror. Non-negotiable.
  mirrorVideo: true,

  // Asymmetric easing. Faster attack than release is what gives movement weight.
  easeAttack: 0.34,
  easeRelease: 0.12,

  // A point that drops out decays toward its last position over this long
  // instead of snapping to zero. Wrists leave frame constantly.
  holdDecayMs: 500,
  visibilityFloor: 0.5,

  // Shoulder width normalizer. Running max over the opening window, then clamped,
  // so every distance is invariant to how close the dancer stands.
  calibrationMs: 4000,

  showDebug: false,
};
