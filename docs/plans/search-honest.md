# Search says only what it knows

> 2026-10-14 · Codex's three P2s on #313 (`evaluacion-2026-10-13/follow-ups-p2.md`). Luis's queue: work that needs no
> asking, merged on green with no P1.

## What was measured

- **«Nothing» before the board is read.** From a view that doesn't read the board (Studio, Knowledge), opening the
  search starts the board's read. If `/search` answers zero first, the sheet says «Nothing in this project matches…» and
  offers «Ask Sophia», while a matching task is still on its way.
- **A task found by its doer shows no mark.** «Marco» finds «Translate the checklist…», but the doer line is drawn
  plain, so nothing in the hit says why it answered.
- **Health without the notes.** Search reads a goal's health from the served plan alone. A goal whose latest note is a
  Difficulty says «Needs attention» in Goals and «Not started» (or «On track») in search.

## What changes

- **While the board is read for the first time**, zero is no answer yet: the sheet says «Searching…», as it does while
  `/search` is read. A board that can't be read leaves the search's own answer as it is.
- **The doer marked**: a task's line is «Task · » and its doer, marked as the title is.
- **The health with the notes**, as Goals reads it (`withNotes`, the same ledger query). Until the notes are read, or
  when they can't be, the line says «Goal» alone. A health that may be missing a Difficulty is not said.

## Checks

- `search-view.test.ts`: a task hit carries its doer; a goal whose health isn't known reads «Goal».
- `e2e/search-goals.spec.ts`:
  - From the Studio view with the board held, «checklist» says «Searching…», not «Nothing». Released, the task shows.
  - «Marco» marks the doer.
  - A Difficulty noted on the ready goal reads «Goal · Needs attention» in search.
- Prettier, type-aware lint, typecheck; CI as the run on record.
