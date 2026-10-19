# A speaker's meter and ring follow their voice

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), X3, second part (X3b), from Luis's «Sigue con la
> cola … y el nuevo informe-25». Studio only, no API. Stacked on `voice-amplitude.md` (X3a), whose `voiceLevel` and
> envelope it uses.

## What was measured

- A speaker's four bars ran one CSS loop (0.9 s, fixed delays) for a whisper or a shout, driven only by LiveKit's
  speaking flag. The presence's ring and the tile's glow were fixed shadows.

## What changes

- **`useVoiceMeters(box, people, level)`:** while anyone in the stage speaks, under full motion, one frame loop writes
  `--level` on each speaking element (`[data-actor][data-speaking]`: presences and tiles alike) through the same
  envelope as her light, and takes it off whoever stops. Keyed on whether anyone speaks, not on the people array, so a
  re-render mid-speech (someone else starting, a reaction) restarts nothing; the box is read each frame, so tiles moving
  between the gallery and the strip are found where they are; with no size (a shell kept out of sight for its call)
  nothing is read. Called once in `RoomStage` on its stage (`live` moves into `useStageModel` to keep its size).
- **`theme.css`:** the bars' loop, its delays and `@keyframes voice` go. Each bar is `scaleY(0.2 + level × reach)`,
  the middle ones reaching most (0.5, 0.8, 0.7, 0.4), so the four never move as one. The orbit's ring widens and
  brightens with the level, the tile's glow grows from 16 px to 52 px; neither shadow is transitioned, so a syllable
  isn't blunted. Under reduced motion the loop doesn't run and speakers stand at `--level: 0.34`: the ring and glow as
  before, the bars at a third of their reach (6.6 px tallest, where they stood at 2.8 px under the old loop's «none»).

## Checks, written first

- `voice-meters.spec.ts`: Marco's bars at most 3 px and his ring's glow at most 0.12 at level 0; at 0.8 his tallest bar
  reaches 11.2 px, steady across three reads 100 ms apart, the four uneven by 2 px or more, no animation running, the
  glow 0.3 or more; Lucía starting to speak keeps his bar at 11 px or more through 300 ms of frames; nobody speaking,
  no element keeps a written level; a speaking tile's glow 18 px or less at 0 and 40 px or more at 0.8; under reduced
  motion the tallest bar stands at 6.6 px and nothing is written.

- At 8 frames a second (`e2e/frames.ts`; CI's run of #462 drew under 20), a meter's `--level` is back at 0 within 1.8 s
  of its voice going from 0.9 to 0: the loop hands the envelope the clock's own time between frames, not a step clamped
  to 0.05 s (it read 0.04).

## Limits

- Someone heard at «Off» volume (#425) is unsubscribed, so their meter rests at 0 while LiveKit still marks them
  speaking.
- On a phone the bars are hidden as before; the ring follows the voice there too.

## With the light plan (group/paper-light)

- Row 9 (`light-live.md`) made a speaker's ring and tile glow roles (`--glow-orbit`, `--glow-speaking`): the room's
  still layers, and on paper two solid pixels of the warm. A level set on each speaker can't live in a root token, so
  the pieces keep reading their roles, and the voice moves them in a room-only rule under full motion
  (`:root:not([data-theme='light'])` inside `prefers-reduced-motion: no-preference`). Under reduced motion the room
  stands at its roles, as main drew it (the bars at a third of their reach, `--level: 0.34`); paper keeps its rings, and
  its bars follow the voice as the room's do. `glow.test.ts` names the two moving rules and pins their room values;
  light-live.spec's room check reads the still look.
