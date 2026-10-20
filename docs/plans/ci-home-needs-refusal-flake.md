# Home's refused Needs read samples enough frames, however slowly CI draws

> 2026-10-19 · The week's top CI flake: `home-needs-refusal.spec.ts:111`, 4 of 4 failed room runs in 48 h, again on
> #472 (run 39339435160, job 118357546767, shard 1 of 3, «403, delayed body»); the follow-up list
> (`evaluacion-2026-10-16/seguimientos-p2.md`) notes it as «home-needs-refusal frames>10». Davide's lane wrote it; Luis
> 2026-10-20: «Procede con el próximo lote y arregla tú los de Davide», and «Lo que no se mide, no se puede mejorar».
> Tests only; nothing the person sees changes.

## Measured

- **Every failure is the same line, and it is the frame count, never a cached need.** Failed room jobs of the last
  three days (20 failed `ci.yml` runs read, each failed job's log): `expect(trace.frames).toBeGreaterThan(10)` received
  8 (#472, «403, delayed body»), 9 (run 39289191121, «401, malformed body»), 7 (run 39166721258, «401, malformed»), 7
  (run 39158535555, «401, malformed»); the follow-up list's entry from #462 (run 39167111207) received 10. The next
  line, `expect(trace.hits …).toEqual([])`, never failed. No other spec failed as often in those logs (next: two
  failures each).
- **The cause, in the test:** `trace.frames` counts every `requestAnimationFrame` callback from `observe()` until
  `readTrace()`: a window of the refusal's note plus a fixed `waitForTimeout(400)`. Eight frames there is under 20 a
  second. On CI's runners the page draws that slowly (two workers per runner; most likely Home's light, a WebGL shader
  drawn every frame by `features/light/renderer.ts`, on runners with no GPU, which is why Updates' same count does not
  fail); the count is a measure of the runner, not of the guarantee. Locally Home draws 36 to 39 frames in 600 ms, also with the CPU throttled
  6× and 10× through CDP (`Emulation.setCPUThrottlingRate`): the throttle slows script, not frames, so it does not bring
  CI's rate here.
- **What the count is for:** it stops the empty `hits` from being vacuous (no frame sampled, nothing seen). The frames
  that matter are the ones after the client saw the refusal, which `trace.postFrames` already counts (the
  delivery-held tests wait for them with `expect.poll`); `frames` also counts the few before.

## What changes

- **A slow-frames case, written first:** «403, delayed body» (the variant #472 failed on) with frames as slow as CI's
  and the page's script left free (`slowFrames`): from just before the refusal, every `requestAnimationFrame` callback
  the page asks for (the trace's, Home's light) runs at the first frame 50 ms after it was asked, about 15 a second.
  With the fixed window it fails as CI did. (Found while writing it: a frame that busies the main thread instead does
  not reproduce it. It holds the test's own reads too, so the window stretches with the frames, 13 or 14 of them at
  110 ms a frame. CI's count fits frames that come slowly while script runs on time; the note shows about 20 ms after
  the refusal reaches the app, delayed body or not.)
- **The wait counts frames, not time** (`sampleAfterRefusal`): after the note, at least the old 400 ms and then
  `expect.poll` until more than ten frames have run since the client saw the refusal. The assertion becomes
  `trace.postFrames > 10`, which is stronger than `trace.frames > 10` (the same bound, without the frames before the
  refusal). Used by the four variants, the phone case and the slow case.

## Checks (written first)

- `test: … (failing)`: the slow case with the current wait. Red for the right reason: past the refusal check, `Expected: > 10`
  with a received count under 10, as on CI.
- The fix: green through the guard, the spec 20 times over (`-Repeat 20`), the slow case included; then its neighbours
  (`home-needs`, `home-phone-needs`, `home-since`, `home`, `updates-refusal`).

## Limits

- Slow frames sample more thinly per millisecond: a cached row shown for less than a frame can slip between samples,
  here as on CI. The slow case is one variant; the other four still sample at the machine's own rate.

## The two sibling specs (coordinator's follow-up, same day)

`updates-refusal.spec.ts:148` and `conversations-removal.spec.ts:1254`/`:1289` count frames in the same fixed window.
They have not failed in these logs (their pages draw no light). Each was put under the slow-frames lever that
`e2e/frames.ts` already had (`slowFramesFromNow`, every frame 125 ms late: 8 a second, from `voice-amplitude.md`):

- **Updates' variants (`:148`): red.** 4 or 5 frames. A slow case, written first, then the same wait.
- **The open thread's refused read (`:1289`): red.** 6 frames. A slow case, written first; the trace gains
  `postFrames`, and the wait has a 500 ms floor, its own.
- **The list's refused read (`:1254`): green**, 16 or 17 frames in 10 of 10 runs. Its window opens before Try again,
  the release of the held thread reads and a trip to another view. About 11 of its frames come before the refusal, and
  only about 5 after it at 8 a second (the refusal reaches the app about 630 ms before the trace is read). Left as it
  is, as asked. Its count does not say how many frames came after the refusal; the same wait on `postFrames` would.

The wait moved to `e2e/frames.ts` (`framesAfterRefusal(page, counted, frames = 10, floorMs = 400)`), beside the lever.
Home's own copy of the wait and of its 15-a-second lever gave way to those two; its slow case runs at 8 a second.
