// pose.js
// Owns MediaPipe. Writes into shared state and returns immediately.
// Nothing in this file draws. Nothing in this file reads the clock for animation.

import { setTargets } from './state.js';

const TASKS_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarker = null;
let video = null;
let lastVideoTime = -1;
let running = false;

// Loaded only after an explicit click. Multi-megabyte download and a heavy runtime.
export async function startPose(onStatus = () => {}) {
  onStatus('Requesting camera');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });

  video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();

  try {
    onStatus('Loading pose model');
    const { FilesetResolver, PoseLandmarker } = await import(
      /* @vite-ignore */ `${TASKS_VISION}`
    );
    const fileset = await FilesetResolver.forVisionTasks(`${TASKS_VISION}/wasm`);

    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (err) {
    // Model failed to load after the camera was already granted. Release the
    // stream so the indicator light goes off and a retry doesn't leak it.
    stream.getTracks().forEach((t) => t.stop());
    video = null;
    throw err;
  }

  running = true;
  onStatus('ready');
  tick();
  return video;
}

// Runs on its own schedule, decoupled from the render loop.
// Its only job is to write targets.
function tick() {
  if (!running) return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = landmarker.detectForVideo(video, performance.now());
      const marks = result?.landmarks?.[0];
      if (marks) setTargets(marks, performance.now());
    } catch (err) {
      console.warn('pose detect failed', err);
    }
  }
  video.requestVideoFrameCallback
    ? video.requestVideoFrameCallback(tick)
    : requestAnimationFrame(tick);
}

export function stopPose() {
  running = false;
  if (video?.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  landmarker?.close?.();
  landmarker = null;
}
