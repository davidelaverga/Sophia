# Notes on a goal: written in its sheet, the latest said on its row, a difficulty a call for attention

> 2026-10-13 · Luis: «Se puede dejar comentarios, si hay dificultades (valida si esto aplica)… piensa en el quality of
> life del user», then, on the briefing (#304): «sigue con las notas». The briefing mock
> (`evaluacion-2026-10-13/goals-mock/goals-briefing-v2.html`) shows them: a note's author and words on the goal's row,
> and in its sheet the notes, newest first, under a field with Note · Difficulty · Expected.

## What is served

- The mission ledger already holds notes on a goal: a `MissionEntry` carries `goalId`, and `recordMissionEntry` takes
  it (`MissionEntryRequest.goalId`), under `capabilities.recordNote`. Its kinds include `blocker` and `expectation`.
  Sophia writes there too (`authoredBy: 'sophia'`), from calls. Nothing new is asked of the API.
- The ledger's read keeps its newest entries (`excluded.olderEntries` counts the rest): a goal shows the notes that
  read holds. Names are the ones the Studio knows (the viewer, Sophia, who has been in the room); anyone else reads «A
  member», as the brief's notes already do.

## What changes

- **In the goal's sheet, Notes**: a field («Add a note on this goal…»), its kind as one choice (Note · Difficulty ·
  Expected: the ledger's observation, blocker and expectation) and Add, also ⌘/Ctrl+Enter. Under it the goal's current
  notes, newest first: who («You», «Sophia», a name, «A member»), the kind when it says something (Difficulty in amber,
  Expected, Outcome…; a plain note says nothing), when, and the words. Where notes are off for the viewer, the
  ledger's reason instead of the field. A write keeps its key until answered; no reply offers «Not confirmed: try
  again» with the same key.
- **On the goal's row**: its latest note, as «Sophia “Legal review lands Thursday.”», in place of the state line; what
  waits on the viewer still comes first.
- **A difficulty is a call for attention**: a goal moving or ready whose latest note is a Difficulty needs attention,
  and its row says the difficulty. A later note (any kind) settles it.
- Goals and the sheet read the ledger with the brief's own query (`missionKey`): one read, kept fresh by the writes.

## Checks

- `goal-notes.test.ts`: a goal's notes (its own, current, newest first), the kind's word, who wrote it, the latest
  said, the plans with their notes (goals without a plan too).
- `goals-glance.test.ts`: a latest Difficulty makes a goal need attention and is its row's line; a note is the line of
  a goal on track.
- `e2e/goal-notes.spec.ts`: the demo's rollout says Sophia's difficulty on its row and holds its notes newest first;
  a Difficulty written on the ready goal comes first in its sheet as «You» and turns its row to Needs attention;
  ⌘/Ctrl+Enter adds; with notes off, the reason and no field.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Goals suites
  through the guard when the machine allows, CI as the run on record.
