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
Ending commit/tree: `d796cc5cb7e1` (tree `833c9f7d3477`), the last commit of `ui/p2-next-ask-fresh`'s own that changes code (later
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

## Decisions and changes

- Changed: the next ask's readings (transcript, older asks, brief, list) and the reason's tip with the focus. Preserved: `nextAsk`'s order and words, the quick asks' own rules. The design note names each change; the post-review notes below name the commit of each later
  one.
- Instruction applied: Luis, 2026-10-12, «atiende los P2 en PRs pequeñas» (the kit stack's open Codex P2s, one concern a
  PR), under his standing instructions for the kit (push to `ui/*`, answer each thread with its fix commit; merges are
  his, with no open P1).
- Authority: not widened. Studio code, its checks and records only; no service code, no contract, no deploy. Points that
  belong to the service (A15's contract, a single-task read) are recorded for that side, not changed here.

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

- `d017ad37`: the recovery check waits for the older read to fail for good (its retry spent), then moves the feed with an event (`fixture.update()`, no focus regained), so only the `readAt` effect can bring the quick asks back. Not run on this host (guard); its CI: see «CI on record, final head» below.

## Post-review, round 4 (Codex on #275)

- `056daf95`: the transcript, the list and the brief count as current only when their `fetchStatus` is `idle`: a refresh paused offline (its old data kept, `isFetching` false) is not. Its CI: see «CI on record, final head» below.

## Post-review, round 5 (Codex on #275)

- `4a2fc8e9` (P1 4254365139): a failed older read is retried once per read of the thread (`triedAt`, the `readAt` it last retried at), never on the error itself, which looped (a refetch with no data resets the query to pending). Its CI: see «CI on record, final head» below.

## CI on record, final head

- Run 38350824470 on `72a9e382` (the head with every change and review round, round 8's `d796cc5c` included; only this
  record follows it): all jobs green, the browser suites among them. This answers Codex's P1 4254957476. The earlier
  run 38341644324 on `deecead4` predates rounds 6–8.

## Post-review, round 6 (Codex on #275)

- `bfdc0444`: the thread is current only for the feed cursor its last read landed for (`useReadFor`): a moved cursor makes it not current from that very render, before the refetch starts, so no suggestion flashes from the old state. Its CI: the final head's run under «CI on record, final head» above.

## Post-review, round 7 (Codex on #275)

- `db8f2824`: the cursor the thread answers is stamped by the feed-triggered read alone (`useTranscript`'s `onReadFor`, on that refetch's success), not by any data update, so an older page landing meanwhile leaves it not current; «Earlier messages» is not pressed while the thread is read again (`busy`), its words unchanged. Its CI: the final head's run above.

## Post-review, round 8 (Codex on #275)

- `d796cc5c`: «Earlier messages» is not pressed, and nothing is offered, while a read is not settled (`settled`, `fetchStatus`
  idle): a refresh paused offline (`isFetching` false) is still on its way, and an older page pressed then would cancel
  it. Unit suite green, lint and typecheck clean.
- P1 4254957476: the browser suites ran on the final head in CI (local Playwright refused by the machine guard): run
  38350824470 on `72a9e382`, green, recorded under «CI on record, final head» above; the earlier run on `deecead4` kept as
  history.
