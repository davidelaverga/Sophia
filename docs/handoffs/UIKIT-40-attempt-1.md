# Implementation-session handoff

Goal and attempt: UIKIT-40 (a question asks Sophia too: «?» with «Ask Sophia» off, Tab turns it on;
informe-inteligencia #5; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/question-asks` from `ui/palette-knows` (stacked
on PR #264 → #263 → … ; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`), on branch
`ui/question-asks`; no service code, no deploy, no contract.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through `.claude-guards/safe-run.ps1`,
2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `74beaa2a6b61` (tree `87ca06c5001f`), the last commit of `ui/question-asks`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 8 files changed against
`ui/palette-knows` at that commit: `e2e/question-asks.spec.ts`, `src/features/conversations/ConversationComposer.tsx`, `docs/handoffs/UIKIT-40-attempt-1.md`, `docs/plans/question-asks.md`, `packages/ui/src/NextAskHint.tsx`, `packages/ui/src/index.ts`, `packages/ui/src/next-ask-key.test.ts`, `packages/ui/src/next-ask-key.ts`. The review notes below name the commit of each later change.

## Outcome

- Words ending in «?» (or «？») with «Ask Sophia» off and nothing held show the next ask's key cap «Tab»; its tip says
  «A question: Tab asks Sophia too», the field's description says it to a screen reader. Tab turns her on: the words and
  the focus stay, the cap goes, «Sophia will answer» shows; Enter sends and she answers.
- Without a question mark, with her on already, with a modifier or while composing, Tab is Tab. One cap at a time: the
  next ask's at the empty field, this one once words are written. `NextAskHint` takes its description as given.

## Evidence

- `next-ask-key.test.ts` (6, two new) with `next-ask.test.ts`: 15 pass. Lint (type-aware) and typecheck clean.
- `e2e/question-asks.spec.ts` (3) written; not run locally: the machine guard refused Playwright while AION2 (10.5 GB)
  was open. A headless probe of the fixture read the same three cases: typed «What should we cut first?» → cap 1,
  described «A question: Tab asks Sophia to answer it too.», «To the team only»; Tab → «Ask Sophia» on, value and focus
  kept, cap 0, «Sophia will answer»; Enter → her answer the newest message; «We cut the intro.» → cap 0 and Tab leaves
  the field; her on already → cap 0. CI is the run on record for the spec.
- Capture `evaluacion-2026-10-12/inteligencia/question-asks.png`: the cap with its tip.

## Remaining obligations

- Watch CI for `question-asks.spec.ts` (and `next-ask.spec.ts`, whose hint now takes a description); the independent
  review (Codex) with no P1/P2 before merge. The base is `ui/palette-knows` until #264 merges.

## Next bounded action

informe-inteligencia #6 (before a duplicate conversation) and #4 (the next-ask piece on Home, a task's sheet and the
personal space).
