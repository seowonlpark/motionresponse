// archive/dead-code.js
// Code removed from the live modules because nothing imports or calls it.
// Kept here instead of deleted outright, in case it's wanted again.

// --- from modulation.js (removed 2026-08-16) ---------------------------
// Never imported anywhere; SIGNAL_LABELS (which IS used) already carries
// the same key set via Object.keys if a list of ids is needed again.
export const SIGNAL_IDS = Object.keys({
  none: 0, handSpeed: 0, handDistance: 0, handReach: 0, elbowAngle: 0,
});

// --- from pose.js (removed 2026-08-16) ----------------------------------
// Never called anywhere; `running` and `video` are module-local state in
// pose.js that these simply exposed without any caller ever using them.
export function isRunning(running) {
  return running;
}

export function getVideo(video) {
  return video;
}
