# Implementation-session handoff

Goal and attempt: UIKIT-45 (the next ask, only from what is known now; Codex P2s on #262; Luis: «atiende los P2 en PRs
pequeñas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/p2-next-ask-fresh` from `main` at `32854caf`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/p2-next-ask-fresh`; no
service code, no deploy, no contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1`, gentle, one
worker); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit follow-ups (push to `ui/*`, answer Codex's threads with a
fix commit, cancel superseded CI runs on `ui/*`); merges are Luis's, with no open P1. Spending: no paid service; CI
minutes only.
Ending commit/tree: `3b8cfed7830e` (tree `385fc22613c4`), the last commit of `ui/p2-next-ask-fresh`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 8 files changed against
`origin/main` at that commit: `e2e/next-ask.spec.ts`, `src/app/theme.css`, `src/features/conversations/ConversationsView.tsx`, `src/features/conversations/OpenConversation.tsx`, `src/features/conversations/next-ask.test.ts`, `src/features/conversations/next-ask.ts`, `src/features/conversations/useNextAsk.ts`, `docs/plans/p2-next-ask-fresh.md`. The review notes below name the commit of each later change.

## Outcome

- The conversation field's next ask and its quick asks are offered only from a transcript that is read and not being
  read again, and once the viewer's older asks are read in full (to six, or to the thread's start, within eight pages);
  a failed brief or list read gives nothing of itself. With the focus in a field, the next ask's reason shows.
- Answers threads 4248827728, 4248827738, 4248827751, 4249597604, 4249597620, 4250198696 and 4251421906 on #262.

## Evidence

- `next-ask.test.ts`: 3 new (written first, failing on the missing `asksNow`/`briefAsks` and the old `olderAsks`).
  Whole Studio unit suite 1099/1099; lint (type-aware), typecheck and Prettier clean.
- Playwright (gentle, one worker): `next-ask`, `question-asks`, `project-conversations`,
  `project-conversation-writes`, `conversations-answers`: 40 passed. The new tip check fails without the theme.css
  rule (run with it stashed: 1 failed).

## Remaining obligations

- CI on the PR; the independent review (Codex) with no open P1 before merge; its P2s go to follow-ups.

## Next bounded action

The next follow-up: ask-instead and the next ask on Home and a task's sheet (Codex P2s on #267 and #268).
