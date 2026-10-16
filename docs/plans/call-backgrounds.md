# A person puts a background behind them on camera

> 2026-10-15 · The third of three pieces after Luis's «Procede» (call-devices.md, device-check.md): Meet's blur and
> backgrounds. Luis chose option A: MediaPipe served from the Studio's own domain, loaded only when a background is
> used, with `'wasm-unsafe-eval'` in the policy and no third party.

## What was measured

- The camera sent the room exactly what it saw. Nothing blurred or replaced what was behind a person.
- LiveKit's `@livekit/track-processors` draws a blur or a picture behind a person with MediaPipe's selfie segmenter.
  By default it fetches the segmenter's wasm (9.4 MB, plus a no-SIMD twin) from jsDelivr and its model from Google's
  storage. The Studio's policy (`public/vercel.json`, report-only) allows scripts and connections to its own origin
  and its services only, and no wasm.

## What changes

- **The video opener's menu offers a background** under the cameras: None, Slight blur, Blur, and three of Sophia's
  lights (Dusk, Deep, Dawn).
  - The lights are gradients drawn in the browser, so there is no picture to ship or license.
  - The one in use is marked. A choice applies to the camera at once (or when it next turns on) and is kept on this
    device for the next call (`sophia.background.v1`).
- **Where the device can't draw one** (`supportsBackgroundProcessors()` false), the menu says so and offers nothing to
  press. A background the device refuses is said in the dock's note.
- **MediaPipe from the Studio's own domain:**
  - The wasm is copied from the installed `@mediapipe/tasks-vision` into the build as `/mediapipe/*`, unhashed,
    because the loader asks for them by name (a Vite plugin, `mediapipe-assets.ts`). The dev server serves the same
    files.
  - The model is kept in the repo (`apps/studio/mediapipe/selfie_segmenter.tflite`, Apache-2.0, from Google's
    versioned path `image_segmenter/selfie_segmenter/float16/1`, sha256
    `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`).
  - The processor and MediaPipe are imported only when a background other than None is chosen, so nobody else
    downloads them.
- **The policy** gains `'wasm-unsafe-eval'` in `script-src`. Nothing else: the files come from `'self'`.
- **Version:** `@livekit/track-processors` 0.8.1 (September 16). 0.8.2 was three days old; it brings
  `@mediapipe/tasks-vision` 0.10.14.

## Codex on #342

- **P1, a camera must not show what is behind before its background is drawn.** LiveKit creates and publishes the
  camera track inside `setCameraEnabled(true)`. Before, the processor was set after that, so the room could see
  unprocessed frames while MediaPipe loaded. Now:
  - The processor goes with the capture (`setCameraEnabled(true, { processor })`), so the first frame is drawn.
  - A camera that is only muted gets it on its own track before it is unmuted.
- **P2, a background that fails isn't swallowed.** A background that can't load when the camera turns on keeps the
  camera off, and the note says why (`BackgroundUnavailable`). Nothing is sent without it.
- **P2, the latest choice wins.** Each choice takes a turn number, and work superseded across a slow load is
  discarded, so an earlier choice never takes effect after a later one.
- **Second round, two P1s and two P2s:**
  - **P1:** the processor 0.8.1 passes its first frame through raw before it segments. With a background, the camera
    is now made unpublished (`createLocalVideoTrack` with the processor), waits for a drawn frame
    (`onFrameProcessed`), and only then is published. A camera only muted is let go first, so it is never unmuted raw,
    and a camera drawn this way turns off by being let go. If no frame is drawn in 10 s, the camera stays off and says
    why.
  - **P1:** the upstream files are recorded in `docs/SOURCE_MAP.md`: the processor's bundle, MediaPipe's runtime and
    the model, with their digests.
  - **P2:** where the device can't draw a background, None still answers, so one kept from a device that could is
    always cleared.
  - **P2:** changes take their turns, one at a time, and work a later choice superseded is let go before it touches the
    processor.
- The logic lives in `camera-background.ts`, with the camera, the loader and the publication passed in, so these rules
  are unit-tested without LiveKit.

## Checks

- `background-preference.test.ts`: the list; the choice kept, with anything unknown read as None; each background
  as the processor takes it.
- `call-backgrounds.spec.ts` on the room's fixture (the fake LiveKit records the background):
  - the menu marks None; Blur applies, is marked next time, and the next call opens with it;
  - a device that can't draw one is said so;
  - a refused background is said in the dock.
- The blur itself needs a real camera and GPU, which no check here has: it is to be tried on a device.

## Left

- A background in the check before joining.
- A person's own picture.
