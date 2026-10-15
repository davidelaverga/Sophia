// Where the Studio serves MediaPipe for camera backgrounds (docs/plans/call-backgrounds.md): its own copy, never a
// third party's. Under /assets/ (the deployment's rewrite sends any other address to the page), named by the version,
// since /assets/ is cached for a year; the build's plugin (mediapipe-assets.ts) checks it is the version installed.

export const MEDIAPIPE_VERSION = '0.10.14'
export const MEDIAPIPE_BASE = `/assets/mediapipe-${MEDIAPIPE_VERSION}`
/** Google's selfie segmenter, float16, version 1 (Apache-2.0), kept in apps/studio/mediapipe. */
export const SEGMENTER_FILE = 'selfie_segmenter.tflite'
