# Implementation-session handoff

Goal and attempt: PROD-ASKS (informe-25 DL-06; Luis: «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `work/prod-asks` from `studio/prod-lenses` (stacked) (`477fe616a`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `c2b634758561` (tree `a40d0294e3ab`), the last commit of `work/prod-asks`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 7 files changed against
`477fe616a` at that commit: `e2e/prod-asks.spec.ts`, `fixtures/demo-work.ts`, `src/features/work/WorkControls.tsx`, `src/features/work/labels.test.ts`, `src/features/work/labels.ts`, `src/features/work/planning/PlanBoard.tsx`, `docs/plans/prod-asks.md`. The review notes below name the commit of each later change.

## Outcome

- Production offers no «Request review»: nothing consumes the lead's review yet, so its receipt waited for ever. A goal shows Hold and Stop as 24 px text. Under the vision flag it is as before.
- A board with no conversation at all (the served board, the room demo) offers no asking on a task; a conversation that only dropped keeps its asks, with why (Codex F-005).

## Evidence

- Written first (commit `c3668c26c`): `labels.test.ts` fails at import; `prod-asks.spec.ts` fails its two checks on main's code (one «Request review», the demo sheet's ask chips) and passes its control (the work space still asks).
- Playwright through `safe-run.ps1`, two workers, at the fix (`c2b634758`): prod-asks, prod-lenses, goal-controls, views-goals, work, next-ask-places, task-keys and press-answers 242/242.
- Unit: labels and features/work 193/193; Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.
- Captures: `evaluacion-2026-10-17/capturas/after-dl06-goal-production.png`, `after-dl06-sheet-no-ask.png`.

## Decisions and changes

- Split from the design's prod-honesty branch, as its refuter asked; stacked on the lens branch for its `?vision=off` lever.
- `goalCommands(status, vision)` is pure; the board's rule is «a page with a conversation to ask in, or one to go to».

## Remaining obligations

- When the lead's review gets a consumer, Request review comes back by dropping the flag check in `goalCommands`.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
