# Implementation-session handoff

Goal and attempt: UIKIT-66 (a project's nav shows the served views; `informe-vistas-20.md` finding 1; Luis: «Sí,
empieza con la PR 1»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/served-views` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1`, 2 workers);
CI as the run on record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; one review round, then P2s to the
follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `e14fe2316b62` (tree `35d1ff638497`), the last commit of `ui/served-views`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `src/app/SignedIn.tsx`, `src/app/route.test.ts`, `src/app/route.ts`, `docs/plans/served-views.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/served-views.md`. Without the vision flag `viewsShown` is Studio, Goals, Tasks and Knowledge
  (`UNSERVED`: Conversations, Updates, Resources), so the nav and its «Go to …» commands lead nowhere unserved; an
  address to a view not shown opens the project's Studio (`shownView`, in `SignedIn`). Under the flag nothing changes.

## Evidence

- Written first and failing (the «(failing)» commit): `route.test.ts`, the shown views without and with the flag and
  `shownView`.
- The fixtures and the signed-in app's page run under the flag (`vite.fixtures.config.ts`), so no browser suite can
  see production's nav; the logic is unit-tested. Local, through the guard: app-auth, view-titles, dock-header: 49
  passed (no change under the flag).
- Unit suite: # pass 1151 # fail 0 ; lint (type-aware), typecheck and Prettier clean.
- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`; Playwright through `safe-run.ps1`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: which views production's nav shows, and where an address to a hidden one lands. Preserved: every view's
  content, the flag's behaviour, `PendingView` (still Resources' page under the flag until it is mounted).
- Instruction applied: Luis, 2026-10-13, «Sí, empieza con la PR 1; Goals con avance y enlace».
- Authority: not widened. When Davide's CON-01 (#199) serves Conversations, it leaves `UNSERVED` there.

## Remaining obligations

- CI on the PR; Codex with no open P1 before merge.

## Next bounded action

PR 2: Resources mounted in the project under the flag; then Goals with progress and a link to its plan.

## Post-review (Codex P1 on #299): a browser run with the flag off

- P1 4263980018: the fixture pages turn the vision flag on, so a fixtures server was run with it off
  (`vite.fixtures.config.ts` imported by a verification-only config that sets `VITE_SOPHIA_VISION=0` before Vite
  reads it; outside the repo, port 5196). In the browser, `room.html`: the project's nav reads Studio · Goals · Tasks ·
  Knowledge, and the command palette's «Go to» rows are Goals, Tasks and Knowledge only. Capture:
  `evaluacion-2026-10-13/vistas/nav-without-vision.jpg` (Luis's evaluation folder). The fallback of an address to a
  hidden view (`shownView` in `SignedIn`) is in the signed-in app, which needs the API; it stays unit-tested
  (`route.test.ts`).
