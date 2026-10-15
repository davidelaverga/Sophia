# Implementation-session handoff

Goal and attempt: CALL-BACKGROUNDS (a person puts a background behind them on camera; Luis: «Opción A, procede»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/call-backgrounds` from `ui/device-check`
(#341, on #340), which it builds on
Writable scope: this worktree only (`apps/studio`, `config/runtime-unit.json` for the lock's digest, `pnpm-lock.yaml`,
`docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction (option A: MediaPipe from the Studio's own origin, `'wasm-unsafe-eval'`, no third
party); merges on green with no open P1.
Ending commit/tree: pending

## Outcome

- **Choosing and keeping:**
  - `background-preference.ts`: the six backgrounds, the choice kept (`sophia.background.v1`), and each one as the
    processor takes it.
  - `background-pictures.ts`: Sophia's lights drawn once as data URLs.
- **Drawing (`livekit-room.ts`):**
  - `cameraBackground(room)` draws the choice on the camera, now or when it turns on.
  - `@livekit/track-processors` is imported only when a background other than None is drawn. A build confirms it is
    its own chunk (160 KB), imported dynamically and not preloaded.
  - `backgroundsSupported()` asks what the library asks without loading it.
- **Hook and menu:**
  - `useProjectRoom.ts`: `setBackground`, which keeps the choice and puts a refusal in the dock's note, and
    `backgroundsSupported`.
  - `DeviceMenu.tsx`: a Background section in Video settings.
- **MediaPipe from the Studio's own origin:**
  - `mediapipe-assets.ts` (in `vite.config.ts`) emits the installed `@mediapipe/tasks-vision` 0.10.14 wasm and the
    model under `assets/mediapipe-0.10.14/`, and the dev server serves the same files. The build checks the installed
    version against `mediapipe-path.ts`.
  - Model: `apps/studio/mediapipe/selfie_segmenter.tflite` (249,537 bytes, Apache-2.0), from
    `storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/`, sha256
    `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`.
  - Under `/assets/` because `public/vercel.json` rewrites any other address to the page.
- **Policy, dependencies, lock:**
  - `public/vercel.json`: `'wasm-unsafe-eval'` in `script-src`. The policy is still report-only.
  - Dependencies: `@livekit/track-processors` 0.8.1, the September release (0.8.2 was three days old), and
    `@mediapipe/tasks-vision` 0.10.14 directly, so the build can find its wasm.
  - `config/runtime-unit.json`: `workspace_lock_sha256` matches the new lock.
- **Fixture:** the fake LiveKit records `background:<id>`.
  - `backgrounds=unsupported` and `refuse=background` stand in for a device that can't draw one or refuses.
  - `window.fixture.backgroundOnJoin` says what the last call opened with.

## Evidence

- Plan: `docs/plans/call-backgrounds.md`.
- Written first and failing (commit `79cd4ed4`): `background-preference.test.ts`, `call-backgrounds.spec.ts`, and the
  Video settings menu's heads in `call-devices.spec.ts`. Two later changes to the new checks, said here:
  - the unit test's picture helper moved to module scope (lint);
  - the reload step expects the page to join again on its own (`call=on`) instead of pressing Join.
- After the change:
  - Unit tests 1229/1229.
  - `call-backgrounds`, `call-devices`, `device-check` and the room, dock, call, keys, control-height, menu, join,
    light-stage and voice-chat specs pass 377/377 locally.
  - Type-aware lint over the whole repo, typecheck and Prettier are clean.
  - The Studio's build emits the five MediaPipe files.
- **Not verified:** the blur itself, on a real camera with a GPU. The checks here run Chromium in software and stand in
  for LiveKit. It is to be tried on a device; the plan says so.

## Remaining obligations

- CI; Codex with no open P1. Retarget once #340 and #341 merge.
- Davide should see the policy change, since it touches security.
- Left: a background in the check before joining; a person's own picture.
