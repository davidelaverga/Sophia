# A result arriving blooms her orb once

> 2026-10-17 · Luis: «debe reaccionar apropiadamente a lo que sucede en la sala». Studio only. Stacked on
> `orb-hears.md`. From the paper-orb workflow's survey of the room: work finishing changed only her ember.

## What was measured

- When work she was doing finished, her light only eased out of «work»: nothing said that something had arrived.

## What changes

- **`room-view.ts`:** `arrivedResults(before, now)`: the tasks at work in the last snapshot whose result is ready now.
  The first snapshot arrives nothing: what was finished when the room opened is not news. Failed or stopped work is
  not a result.
- **`RoomStage`:** `useResultArrival` keeps the last snapshot's work and tells her light when a result arrived.
- **The engine:** `arrive()`: one soft swell over 0.9 s on the swell spring the floor handoff already uses (so `--ls`
  carries it on paper, and the canvas draws it on the dark page). None while she speaks, and none under reduced motion.
- **`SophiaLight`:** its handle gains `arrive`.

## Checks, written first

- `room-view.test.ts`: a task at work before with its result ready now; nothing on the first look, for a result ready
  already, a task new with its result, or work that failed or stopped.
- `orb-result.spec.ts`: her research finishing takes her size past 1.03 and back to 1; under reduced motion it never
  passes 1.

## Limits

- Several results at once bloom once.
- The bloom reads on the dark page too (the canvas reads the same swell), which is the same news there.
