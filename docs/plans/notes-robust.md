# Notes on goals, honest when the ledger is slow, fails, or a note is still going

> 2026-10-14 · Codex's three P2s on #305 (`evaluacion-2026-10-13/follow-ups-p2.md`), from Luis's queue: «Encola varias
> tareas que no tengas que detenerte y preguntarme».

## What was measured (Codex, on #305)

- While the ledger's first read is pending, or after it failed, Goals reads the notes as none: a goal whose latest
  note is a Difficulty reads On track or Not started, and nothing says the health is incomplete.
- Typing the next note while one is still sending: the first one's success clears the new words and the kind.
- A note kept whose refresh then fails: the sheet keeps the old list and says nothing; the person may write it again.

## What changes

- **The brief says how the notes stand**: while they are read, «Reading the notes…» after the health line; if they
  can't be read, «The notes can't be read right now, so a difficulty may be missing.» with Try again (`notesRead`).
- **A kept note clears only what was sent**: words typed since, or a kind chosen since, stay (`keptAfter`).
- **A refresh that fails after a note is kept says so** in the sheet: «The notes couldn't be read again.» with Try
  again; the last list stays under it.

## Checks

- `goal-notes.test.ts`: `notesRead` (read, reading, failed, failed with a last read); `keptAfter` (cleared when
  unchanged; words and kind typed since kept).
- `e2e/notes-robust.spec.ts`: with the ledger held, the brief says the notes are being read; with it failing, it says
  so with Try again, and Try again once it answers brings the rollout's difficulty back; a note kept while reads fail
  says the list couldn't be read again.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; CI as the run on
  record.
