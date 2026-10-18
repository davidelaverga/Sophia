# Her light follows her voice

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), X3, first part (X3a), from Luis's «Sigue con la
> cola … y el nuevo informe-25». Studio only, no API, nothing behind the vision flag: LiveKit's tracks are real in
> production. Stacked on `light-room-paper.md` (light/paper-and-work), whose paper halo reads the same springs. The
> people's meters and rings follow in their own branch (X3b).

## What was measured

- The light's `amp` spring was never written: every term the shader multiplies by it (size, edge, energy) and the
  flow line read 0, so in «speak» her light changed only through the mode's crossfade, never with her voice.
- No analyser read the call's audio: only the device check and muted speech had one.

## What changes

- **`motion.ts`:** `envelope(value, level, dt)`, a one-pole follower that rises with a 30 ms time constant and falls
  with 180 ms, exact at any frame rate. The meters (X3b) will use it too, so the two move alike.
- **`voice-levels.ts`:** how loud each voice is now, read in this browser from the audio it already receives; nothing
  is sent. One AudioContext per call, made on the first read (after Join's press), resumed when LiveKit allows sound
  and on the next press or key (Safari keeps a context made outside a press suspended); an analyser per microphone
  track on the device check's scale; a changed track retapped; let go when its person leaves; closed once with the
  call. Sophia is read by her standing (`isSophia`). It never throws: what can't be read reads 0.
- **`engine.ts`:** the `amp` spring goes (a symmetric spring can't rise in 30 ms and fall in 180). While she speaks,
  under full motion, the engine reads `voice()` once a frame through the envelope, and hands that to the shader and
  the flow line. `--amp` on the light's box says what the shader was given, written only when it changes, for the
  checks. On paper the halo already reads her size and strength from the same frame (`paperHalo`), so it swells too.
- **`SophiaLight`** takes `voice`; **`RoomStage`** gives it `room.sophiaLevel` (the stage's `layout` word moves into
  `useStageModel` to keep the function in its size).
- **`livekit-room.ts`** and **`useProjectRoom.ts`:** `voiceLevel(identity)` and `sophiaLevel()`, read live through
  the call (`relaysOf`), 0 out of a call; made once, so nothing that takes them runs again.
- **The fixture:** `window.fixture.voiceLevel(who, level)`; 0 until a check sets it.

## Checks, written first

- `motion.test.ts`: 1 − e⁻¹ at 30 ms and ≥ 0.993 at 150 ms rising; e⁻¹ at 180 ms and < 0.01 at 0.83 s falling; six
  5 ms steps equal one of 30 ms; no time, no change.
- `voice-levels.test.ts` (a faked Room and tap maker): nothing opened for someone unknown or with no microphone; one
  context and a tap per track, kept; a changed track retapped; Sophia by her standing only; resumed when sound is
  allowed; let go on leave; closed once with the call and nothing opened after; a refused context or tap reads 0.
- `voice-amplitude.spec.ts`: `--amp` reaches 0.85 within a second of her level at 0.9, and 0 again at 0; while she
  listens a level moves nothing; on paper `--ls` grows to 1.18 or more and back to 1; under reduced motion nothing.

## Limits

- LiveKit marks her speaking a few hundred ms late, so her first syllable shows no swell.
- In text mode Sophia has no audio element after #427: she is read, not heard, and her light rests.
- The dark page without WebGL (`data-fallback`, a fixed radial) still ignores her voice; `--amp` is written anyway.
- On the real stack her normalised voice may sit near the top of the scale: measure it there, and scale hers down if
  it stays above 0.9 most of the time.
