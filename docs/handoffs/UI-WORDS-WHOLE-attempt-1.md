# Handoff: words said whole (counts, possessives, dates, a name's limit), attempt 1

Goal and attempt: UI-WORDS-WHOLE (`docs/plans/words-whole.md`; improvements 25, 26 and 27 of the independent
evaluation of 2026-11-22), attempt 1. Batch G of seven, the last; A is #544, B #545, C #546, D #547, E #548, F #549.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-g-texto` from `origin/main`
`d1e6b1410`.
Ending commit/tree and changed files: content commit `72daf552d` (tree `748bb1909`) and the note's last edit: 21
files changed, about 400 insertions, 58 deletions, under `apps/studio` and `docs/plans`; this record is the next commit.

## Outcome

- 25: Home's last row says «All 4 projects», with «2 notes from you» as the row's own note; in a call Home says «You’re
  in the room for Launch plan.» (no possessive after a title). «All 1 project» was already gone on `main`.
- 26 (Luis: «Releer en 24 h»): Calendar's and the target date's fields stay the browser's; under them, the choice read
  back as the Studio says it («Today · 18:30 – 19:30», «15 Dec 2026»), as their description.
- 27: a project's name in «Start a project», the first run and Rename shows «165 / 180» from 160 characters on, and a
  cut paste says «Only the first 180 characters fit.»; Rename counts as the API does now; the tab says at most 60
  characters of a title.
- Pending Luis: five new texts (the note's table, each with an alternative).

## Evidence

- Before (fixtures on `main`): «All 4 projects · 2 from you» in one span; «You’re in Launch plan’s room.»; Calendar's
  fields «11/23/2026», «10:30 AM» with no read-back; a 218-character paste kept to 180 in silence.
- After, fixtures, dark and light, 1280 × 800 and 390 × 844: the row's note laid out as the others' (54 px at 1280,
  58 at 390, as before); Calendar's read-back 8 px under its fields; the goal's in its field's column; the limit's
  line one line at 390, 17:1 on dark; «Start a project» 36 px tall with nothing to say, as before.
- `pnpm format:check`, `lint`, `typecheck` 0; Studio units pass (`places-view`, `name-limit`, `document-title`).
- Playwright through `pw-gentle.ps1`: `words-whole`, `home`, `home-since`, `goal-owner-date`, `home-first-run` 65
  passed with one spec fix (an exact label), then `words-whole` 3; on the final commit `words-whole`,
  `goal-owner-date`, `archive-project` 39 passed.
- One independent review: no P1; three P2s fixed (an empty limit's grid gap in «Start a project», «Invalid Date» for
  a five-digit year, the spec's exact label) and three nits (a stale comment, Rename's Save for an old title past the
  most, a check that ran before its form).

## Decisions and changes

- 26 decided by Luis in this session: the Studio keeps its 24-hour clock (`time-words.md`); no own date or time
  controls.
- A person's possessive stays («Marco’s camera»): only the one after a project's title was rewritten.

## Remaining obligations

- The PR is not merged; CI's browser job is the run on record for the rest of the suite.
- The new words wait for Luis's approval.

## Next bounded action

Luis reviews the PR. Outside the batches remain: checking improvement 7, and one proposal in `docs/plans/` for 11, 12,
19, 22 and 23.

Source IDs consulted: `evaluacion-2026-11-22/mejoras-ui.md` (25–27), `docs/plans/time-words.md`,
`features/personal/places-view.ts`, `Welcome.tsx`, `FirstRun.tsx`, `WorkSpace.tsx`, `useCapped.ts`, `characters.ts`,
`features/access/CalendarTab.tsx`, `access-view.ts`, `features/work/GoalTargets.tsx`, `goal-day.ts`,
`features/studio/ProjectName.tsx`, `app/document-title.ts`.
