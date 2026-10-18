# Implementation-session handoff

Goal and attempt: SERVED-NAMES (informe-25 DL-05; Luis: «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `work/served-names` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `aa411f0e4726` (tree `d1b47d4759d4`), the last commit of `work/served-names`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 7 files changed against
`origin/main` at that commit: `e2e/served-names.spec.ts`, `fixtures/demo-work.ts`, `src/features/conversation/conversation-view.ts`, `src/features/work/planning/ServedWork.tsx`, `src/features/work/planning/board-people.test.ts`, `src/features/work/planning/board-people.ts`, `docs/plans/served-names.md`. The review notes below name the commit of each later change.

## Outcome

- The served board names teammates from the project's members: «1 decision for Marco», «Marco decides» with his picture, «Luis chose», «Waiting on Marco» on the task held by his permission, «Marco answers it» in its sheet. No «someone» is left in the demo's goal.
- An address is never printed as a name: members and a viewer with no display name are said as the stage says them (spokenName).

## Evidence

- Written first (commit before the fix): `board-people.test.ts` (6 cases) fails at import on main; `served-names.spec.ts` reads «1 decision for someone» on main (desktop and phone).
- Control mutant: Tasks given no members (`NO_MEMBERS`) turns the e2e red at the pill («1 decision for someone»); restored after.
- Playwright through `safe-run.ps1`, two workers: served-names, views-goals, demo-resources, work, app-auth, palette-knows, micro-type, control-heights, chips-radii, goals-overview, search-goals and task-keys specs: 282 passed with the fix and the two served-names tests passed once their locators were corrected (a tile pinned by `data-task`, the pill's words measured apart from its dot and chevron).
- Unit: board-people, conversation-view and fixture-boundary 17/17; Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.
- Captures: `evaluacion-2026-10-17/capturas/after-dl05-served-names-desktop.png` and `-phone.png`, against informe-25's `desktop-tasks.png`.

## Decisions and changes

- Designed and attacked before coding (informe25-design workflow); its corrections are applied: the visible changes beyond the fallbacks are stated, «Waiting on Marco» is tested, the phone check measures the words on one line (the pill has a fixed height), «Decided» is matched exactly, and the key's comment names GoalTargets.tsx and InProject.tsx.
- A member with no name, or an id no active member has, is left out rather than called «A member»: the board's own words («for someone») then read grammatically.
- The viewer's own entry wins over the room's name for them, and a viewer with no display name is said by `spokenName`, never by address (the refuter's recommendation).
- Goals' members key, not a new one, so one read names both views; GoalTargets.tsx is not edited (work/targets-robust changes the lines above `useMembers`).

## Remaining obligations

- Two members whose addresses start alike read the same first name.
- The members read keeps for 60 s: a member who just joined reads «someone» until the next read.
- Fold the three copies of the members key into one `useMembers` with `enabled` after work/targets-robust merges.
- The `enabled` gate on the members read is covered by review, not by a test (fixture pages answer /members everywhere).

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
