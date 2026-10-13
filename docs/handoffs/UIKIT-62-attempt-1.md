# Implementation-session handoff

Goal and attempt: UIKIT-62 (a notice stands clear of an open sheet; `informe-personal-real.md` finding 5; Luis:
«sigue con los puntos 2–5»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/toast-over-sheet` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1`: the failing
run went through, the passing one was refused for free RAM under 9 GB); CI as the run on record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; after the 2026-10-13 freeze, later P2s
go to a follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `01a5f81555a1` (tree `770b0e1103c4`), the last commit of `ui/toast-over-sheet`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `e2e/toast-over-sheet.spec.ts`, `src/app/theme.css`, `docs/handoffs/UIKIT-62-attempt-1.md`, `docs/plans/toast-over-sheet.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/toast-over-sheet.md`. While a sheet is open (`:root:has(.sheet-backdrop)`), the toast is centred in
  what the panel leaves on the left and no wider than that; on a phone (≤ 560 px), where the sheet rises from the
  bottom, it shows at the top under the safe area. With no sheet open it keeps its place.

## Evidence

- Written first and failing (the «(failing)» commit): `e2e/toast-over-sheet.spec.ts`; run here before the change, the
  two sheet cases failed (390 and 900 px) and the no-sheet case passed. After the change the guard refused to start
  (free RAM 8.3–8.7 GB, under its 9 GB floor) even with the dev stack's containers stopped; CI is the run on record.
- Unit suite: # pass 1149 # fail 0 ; lint (type-aware), typecheck and Prettier clean.
- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: the toast's place while a sheet is open. Preserved: its look, timing and words; its place otherwise.
- Instruction applied: Luis, 2026-10-13, «sigue con los puntos 2–5».
- Authority: not widened.

## Remaining obligations

- CI on the PR; Codex with no open P1 before merge.

## Next bounded action

Finding 2: Find's «No match» offers to ask Sophia.

## Local run, after the guard allowed it

- Through the guard, 2 workers: toast-over-sheet and menu-scale on this branch: 8 passed (the two sheet cases now pass).

## Post-review (Codex on #293), the one round

- `01a5f815`: the rule reads an open sheet only (`.sheet-backdrop:not(.palette-veil)`): the command palette, which
  shares the veil's class, leaves the notice where it is. From 561 to 790 px, where the space left of the panel is too
  narrow to read in (107 px at 561), the notice keeps a width of its own (up to 320 px) at the bottom left, under the
  sheet's head. Tests first (the «(failing)» commit). Local: toast-over-sheet and palette-knows, 11 passed.
- Left to the follow-up list: a window both narrow and short (500×400), where a sheet at its 90 dvh cap starts about
  40 px down and no place at the top clears it.
