# Implementation-session handoff

Goal and attempt: UIKIT-57 (Home at first glance; «¿Vale $20?» for the two spaces, findings 1–4; Luis: «Sí, empieza
con la PR 1»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/home-first-glance` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1`, 2 workers,
AION2 closed); CI as the run on record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; after the 2026-10-13 freeze, later P2s
go to a follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `53cd807cff5b` (tree `5c409434eb9b`), the last commit of `ui/home-first-glance`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/home-first-glance.spec.ts`, `e2e/home.spec.ts`, `e2e/spaces-honest.spec.ts`, `src/features/personal/Welcome.tsx`, `src/features/personal/personal.css`, `docs/plans/home-first-glance.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/home-first-glance.md`. The greeting's lines keep `.hw-hello`'s 1.02 (the universal leading had set
  them at 80 px for 52 px type: a regression of the kit's #231); «3 notes →» is a text press in «You and Sophia»'s
  head, the row gone; a row that joins or takes you back says so at rest on every screen. At 1440×900 Home's scroller
  went from 935 px in 852 to 852 in 852: every project row and «All 4 projects» inside the screen.

## Evidence

- Written first and failing (`134e4c3a`): `e2e/home-first-glance.spec.ts`, 6 checks; run on `main`'s source here, 6
  failed; with the change, all pass.
- Local, through the guard: every spec that loads Home (16 files): 201 passed, 1 skipped, 2 failed before the last
  fix: `spaces-honest` «Home counts the notes» (it read the count by its exact text, now `1 note →`; it reads the head's
  press now, 28/28 with the new spec ×2) and press-answers «Home, its microphone listening», the flake fixed in #286,
  not yet on `main`.
- Captures before (`evaluacion-2026-10-13/espacios/`) and after (`espacios-after/`).
- Unit suite: # pass 1149 # fail 0 ; lint (type-aware), typecheck and Prettier clean.
- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`; Playwright through `safe-run.ps1`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: the greeting's line boxes, where your notes are pressed, a join row's words at rest. Preserved: the
  greeting's size, weight and words, the rows' order and presses, an open row's arrow under the pointer only, the
  phone's touch rule.
- Instruction applied: Luis, 2026-10-13, «Sí, empieza con la PR 1» after `informe-espacios-20.md`.
- Authority: not widened. Studio code, its checks and records only.

## Remaining obligations

- CI on the PR; Codex with no open P1 before merge. PR 2 (Home on a phone: «Needs you» first) and PR 3 (Personal)
  follow.

## Next bounded action

PR 2: on a phone, «Needs you» right after the greeting (behind the vision flag).
