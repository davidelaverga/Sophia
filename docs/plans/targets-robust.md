# Goals' health waits on the goals' dates

> 2026-10-17 · A Codex P2 on #372 (`evaluacion-2026-10-13/follow-ups-p2.md`), from Luis's «Sigue con los P2 en local,
> sin subir nada». Studio only; no API change.

## What was measured

- `useGoalTargets` gave only the targets' map: while its read was pending, or after it failed (three tries), the map
  was empty, the same as «no dates».
- A goal past its date then read «On track» or «Not started» on its row, in the health line, in the brief («Nothing
  waits on you.») and in its sheet; search said «Goal · Not started». Nothing said the dates were unknown.

## What changes

- **`useTargetsRead`** (`GoalTargets.tsx`) runs the same read and says how it stands (`notesRead`): read, reading,
  failed, or failed with a last read kept. `useGoalTargets` stays for the sheet's own date.
- **The brief says what is still coming**, as it did for the notes: « · Reading the dates…», or « · Reading the notes
  and dates…» (`readingWords`).
- **A read that fails says so** under the brief, with Try again: «The dates can’t be read right now, so an overdue goal
  may be missing.» (`ReadFailed`, the notes' alert made general).
- **Search says no health** until both the notes and the dates are in (`known`), as search-honest.md settled for the
  notes.
- **Parity with the notes, on purpose:** rows, the health line and the sheet keep the health they can read while the
  dates come, with the brief's words or the alert beside them, as notes-robust.md settled. Withholding the rows' health
  entirely would be a larger change than the notes made.

## Checks

- `goal-notes.test.ts`: `known` (both in, one stale, one reading, one failed); `readingWords` (none, notes, dates, both,
  a failed one left to its alert).
- `e2e/targets-robust.spec.ts` (`targetsRead=hold|fail`, `window.fixture.holdTargets/failTargets`):
  - with the dates held, the brief says they are being read; let through, the overdue goal needs attention;
  - with them failing, the alert says so with Try again; answered, Try again brings the overdue goal and the brief's
    «one of your goals is overdue» back;
  - search says «Goal» alone while the dates are held, then «Goal · Needs attention».
- notes-robust, goal-overdue and search-goals specs unchanged.
