# Implementation-session handoff

Goal and attempt: DECISION-ALERT (informe-25 DL-07 (a); Luis: «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `work/decision-alert` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `f2be3d72111a` (tree `d47ff01e6e48`), the last commit of `work/decision-alert`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 11 files changed against
`215166872` at that commit: `e2e/decision-alert.spec.ts`, `fixtures/work.tsx`, `src/app/notify.ts`, `src/features/access/useKnockAlert.ts`, `src/features/studio/ProjectShell.tsx`, `src/features/work/GoalList.tsx`, `src/features/work/planning/ServedWork.tsx`, `src/features/work/planning/decision-alert.test.ts`, `src/features/work/planning/decision-alert.ts`, `src/features/work/planning/useDecisionAlert.ts`, `docs/plans/decision-alert.md`. The review notes below name the commit of each later change.

## Outcome

- A decision waiting on the viewer counts in the tab's number, in the house format: «(1) Fixture project · Sophia», one number for everything that waits; it goes once answered or expired.
- One that arrives while the tab is hidden, with notifications allowed, is a browser notification by its question and when it ends; one open on arrival is not news, a shown tab only counts, and without permission it only counts.

## Evidence

- Written first (commit `40bb72122` before the fix): `decision-alert.test.ts` fails at import on main; `decision-alert.spec.ts` 8/8 fail there (the title stays «Fixture project · Sophia», nothing notified).
- Playwright through `safe-run.ps1`, two workers, at the fix: decision-alert, knock-alert, work, unread-title, resources, search-goals, views-goals, goals-overview, app-auth, room and next-up 364/364 (desktop and phone).
- Unit: `decision-alert.test.ts` and features/work; Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.
- Captures: `evaluacion-2026-10-17/capturas/after-dl07-decision-waiting-desktop.png` (title «(1) Fixture project · Sophia»), `after-dl07-decision-answered-desktop.png` (title «Fixture project · Sophia»), `after-dl07-decision-waiting-phone.png`.

## Decisions and changes

- Designed and attacked before coding (informe25-design workflow). The decisions open for the viewer are each one's latest revision, still proposed, not expired, theirs; a proposed plan's included, which is the admission production serves.
- The notification itself moves to `app/notify.ts`, shared with the knock; `useKnockAlert` behaves as before (knock-alert.spec green).
- No sound, and the first look is the baseline: what was already waiting when the page opened is counted, never notified.

## Remaining obligations

- The board is read on Goals, Tasks and search only: elsewhere the number is the last read's, and a decision that arrives meanwhile isn't counted until the board is read again.
- In production the one decision served is the admission of one's own review: the tab says «(1)» while Goals says «Nothing waits on you.» Whether Goals counts it too is Luis's call.
- DL-07 (b) and (c) wait on Luis.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
