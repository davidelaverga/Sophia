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
Ending commit/tree: `056daf952ff8` (tree `073aee4a5511`), the last commit of `ui/p2-next-ask-fresh`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 11 files changed against
`origin/main` at that commit: `e2e/next-ask.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/conversations/ConversationsView.tsx`, `src/features/conversations/OpenConversation.tsx`, `src/features/conversations/next-ask.test.ts`, `src/features/conversations/next-ask.ts`, `src/features/conversations/useNextAsk.ts`, `docs/handoffs/UIKIT-45-attempt-1.md`, `docs/plans/p2-next-ask-fresh.md`. The review notes below name the commit of each later change.

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

## Post-review (Codex on #275)

- `1c03d6fc`: a failed read of the older asks is tried once more, and again each time the thread is read again (the feed
  moved; `readAt`, the transcript's `dataUpdatedAt`), so a passing failure no longer blanks the quick asks for the rest
  of the visit. `e2e/next-ask.spec.ts` «older asks unread…» (`older=fail`, then another conversation moves) holds it,
  and fails without the change; the fixture gained `older=fail` and `failOlderMessages` (`794a940a`). next-ask,
  question-asks and project-conversations: 23 passed; unit 1099/1099.

## Post-review, round 2 (Codex on #275)

- `e6a4f5f4`: nothing is offered while the brief (`brief.isFetching`) or the conversation list (`list.isFetching`, passed
  from `ConversationsView`) is read again, so a proposal decided or a question closed since never stands for the ask in
  between. Unit suite 1099/1099, lint and typecheck clean. Local Playwright refused by the machine guard (free RAM 2 GB
  with AION2 open); CI is the run on record for the browser suites.

## CI on record

- Run 38331759492 on `ca06ec3f` (the head with every change and its review rounds): all jobs green, the browser suites
  among them (next-ask.spec's focus and «older asks unread» checks included).

## Post-review, round 3 (Codex on #275)

- `d017ad37`: the recovery check waits for the older read to fail for good (its retry spent), then moves the feed with an event (`fixture.update()`, no focus regained), so only the `readAt` effect can bring the quick asks back. Not run on this host (guard); its CI is pending (the run on record above predates this check's change).

## Post-review, round 4 (Codex on #275)

- `056daf95`: the transcript, the list and the brief count as current only when their `fetchStatus` is `idle`: a refresh paused offline (its old data kept, `isFetching` false) is not. The CI on record above predates this change; the new head's CI is pending, and recorded here when it lands.
