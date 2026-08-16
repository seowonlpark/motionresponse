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

// A limb is root -> hinge -> tip. Legs are arms with different indices.
// This is the whole of the upper-body / full-body difference.
export const LIMB_SETS = {
  upper: [
    { side: 'L', group: 'arm', root: LM.L_SHOULDER, hinge: LM.L_ELBOW, tip: LM.L_WRIST },
    { side: 'R', group: 'arm', root: LM.R_SHOULDER, hinge: LM.R_ELBOW, tip: LM.R_WRIST },
  ],
  full: [
    { side: 'L', group: 'arm', root: LM.L_SHOULDER, hinge: LM.L_ELBOW, tip: LM.L_WRIST },
    { side: 'R', group: 'arm', root: LM.R_SHOULDER, hinge: LM.R_ELBOW, tip: LM.R_WRIST },
    { side: 'L', group: 'leg', root: LM.L_HIP, hinge: LM.L_KNEE, tip: LM.L_ANKLE },
    { side: 'R', group: 'leg', root: LM.R_HIP, hinge: LM.R_KNEE, tip: LM.R_ANKLE },
  ],
};

export const config = {
  // 'auto' resolves to 'upper' or 'full' from hip and ankle visibility.
  mode: 'auto',
  resolvedMode: 'upper',

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

  // Auto mode detection window.
  modeDetectMs: 4000,
  modeDetectThreshold: 0.6,

  showDebug: false,
};
