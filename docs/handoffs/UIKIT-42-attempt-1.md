# Implementation-session handoff

Goal and attempt: UIKIT-42 (nothing found: ask Sophia instead; informe-inteligencia #7; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/ask-instead` from `ui/same-question` (stacked
on PR #266 → #265 → … ; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/ask-instead`; no
service code, no deploy, no contract.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through `.claude-guards/safe-run.ps1`,
2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `f37e8ff5` (5 files: `project-go.tsx`, `ConversationsView.tsx`,
`KnowledgeReports.tsx`, `SearchSheet.tsx`, `e2e/ask-instead.spec.ts`) and `docs/plans/ask-instead.md`; the commit after
it adds only this handoff. A squash on merge gives the work an id this file cannot know.

## Outcome

- Knowledge with words matching nothing offers «Ask Sophia about “…”» beside «Clear the filters»; Search's empty
  answer offers the same under its line. The press opens Conversations with a new conversation's form, the words its
  question, «Ask Sophia» on, the focus in the form; nothing is sent until Start. A held form keeps its words; a viewer
  is shown the list.
- Offered only inside a project's shell with Conversations among its views (`VISION`): `useAskSophia()` is null
  elsewhere. `Arrival` gains `{ view: 'conversations'; ask }`.

## Evidence

- Lint (type-aware) and typecheck clean. No pure logic beyond the arrival: no node test.
- `e2e/ask-instead.spec.ts` (2) written; not run locally: the machine guard refused Playwright while AION2 was open. A
  headless probe read both: Knowledge «No reports match these filters.» with the press, then the form with «zebra
  crossings in the north», Sophia asked, the focus inside; Search «Nothing in this project matches…» with the press,
  the sheet gone, the same form. CI is the run on record.
- Capture `evaluacion-2026-10-12/inteligencia/ask-instead-knowledge.png`.

## Remaining obligations

- Watch CI for `ask-instead.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The base is
  `ui/same-question` until #266 merges.

## Next bounded action

informe-inteligencia #4 (the next-ask piece on Home, a task's sheet and the personal space) and #8 (a message that reads
like a decision offers «Propose as decision»).
