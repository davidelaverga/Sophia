# Implementation-session handoff

Goal and attempt: UIKIT-58 (Home on a phone: what needs you right after the greeting; «¿Vale $20?» for the two
spaces, finding 5; Luis: «Sí, empieza con la PR 2»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/home-phone-needs` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1`, 2 workers,
AION2 closed); CI as the run on record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; after the 2026-10-13 freeze, later P2s
go to a follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `6a91e518244a` (tree `750794974331`), the last commit of `ui/home-phone-needs`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `e2e/home-needs.spec.ts`, `e2e/home-phone-needs.spec.ts`, `src/features/personal/Welcome.tsx`, `docs/plans/home-phone-needs.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/home-phone-needs.md`. Under 861 px «Needs you» is mounted in the column right after the greeting
  (its own «What needs you» landmark), so it is inside a 390×844 screen and first in the document; her light keeps the
  phone's place (the light Home has without the list). From 861 px nothing moves. Behind the vision flag, as before.

## Evidence

- Written first and failing (`git log`: the «(failing)» commit): `e2e/home-phone-needs.spec.ts`; before the change
  its main check failed (heading at y 868, after «You and Sophia»), the two guards passed.
- Local, through the guard: every spec that loads Home (17 files): 200 passed, 1 skipped.
- `home-needs.spec` «her mark keeps the phone's 48 px» reads the light wherever it is mounted.
- Capture after: `evaluacion-2026-10-13/espacios-after/home-needs-phone-dark.png`.
- Unit suite: # pass 1149 # fail 0 ; lint (type-aware), typecheck and Prettier clean.
- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`; Playwright through `safe-run.ps1`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: where the list is mounted on one column (by `useMedia`, not CSS `order`, which would part the reading
  order from the eye's). Preserved: the list's rows, order and presses; the wide and middle layouts; the light.
- Instruction applied: Luis, 2026-10-13, «Sí, empieza con la PR 2» after `informe-espacios-20.md`.
- Authority: not widened. Studio code, its checks and records only.

## Remaining obligations

- CI on the PR; Codex with no open P1 before merge. Independent of #288 (PR 1); either may merge first.

## Next bounded action

PR 3 (Personal): a capture of the new conversation centred, for Luis's eye, before code.
