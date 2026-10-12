# Implementation-session handoff

Goal and attempt: UIKIT-38 (next up: after an answer, the board names what waits on the viewer next and keeps the
focus; informe-inteligencia #2; Luis: «Continúa»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/next-up` from `ui/next-ask` (stacked on PR #262
→ #260 → … ; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/next-up`; no service
code, no deploy, no contract.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through `.claude-guards/safe-run.ps1`,
2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `ea7211636d9b` (tree `26e556ff746c`), the last commit of `ui/next-up`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 8 files changed against
`ui/next-ask` at that commit: `e2e/next-up.spec.ts`, `src/features/work/planning/NextUp.tsx`, `src/features/work/planning/PlanBoard.tsx`, `src/features/work/planning/board.css`, `src/features/work/planning/next-up.test.ts`, `src/features/work/planning/next-up.ts`, `docs/handoffs/UIKIT-38-attempt-1.md`, `docs/plans/next-up.md`. The review notes below name the commit of each later change.

## Outcome

- Once the viewer answers a decision, a line under the board's bar names what waits on them next («Next: “Implement the
  PDF retry” waits for you →») and takes the focus, which used to fall to `body` (the pressed choice disabled while the
  answer goes). Enter goes there: the next decision's first choice, the task's sheet, or the review's card.
- What is next, on this board: another of the viewer's decisions not answered in this visit, then a task waiting for
  them in the board's lane order, then a review proposing a change, else «Nothing else here waits on you.» (a status
  that holds the focus and leaves with it). The decisions' pill closes the line; another answer replaces it.

## Evidence

- `next-up.test.ts` (4): pass.
- `e2e/next-up.spec.ts` (3) with work, board-why, room-work, control-heights, type-scale, press-answers and home-needs:
  240 pass locally; one home-needs test red under load in that run passes 11/11 twice alone. Lint (type-aware) and
  typecheck clean.
- Captures `evaluacion-2026-10-12/inteligencia/next-up-{dark,light}.png`: the line's left on the bar's (38.4 = 38.4),
  18 px under it, the focus on its press in both themes.

## Decisions and changes

- The line lives at the board, not in the answered decision: a decision accepted by the service leaves the open list
  (and with it any line inside it); the board's line stays.
- This board only; across projects is Home's list (A15), for the other two moments of informe #2.

## Remaining obligations

- Watch CI for `next-up.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The base is `ui/next-ask`
  until #262 merges.

## Next bounded action

informe-inteligencia #3 (the palette that knows: «For you now» from the needs and the commands used most) and #5 (a
question mark in a field offers «Ask Sophia»).

## Post-review (Codex on #263)

- The line moves on only once an answer is recorded: a conflict, a refusal, an expiry or an unknown keeps the decision
  the one to answer and shows no line (next-up.spec with the fixture's `conflict=1`).
- Answers are kept by decision and revision (`answeredKey`): a revision proposed later is the next to decide
  (next-up.test).
- The tasks waiting for the viewer are read by their pending request, as `forViewer` reads them, not by the waiting mark.
