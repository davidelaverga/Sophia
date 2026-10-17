# Implementation-session handoff

Goal and attempt: CONVERSATION-ADDRESS (the open conversation in the address; Luis's queue, «Later»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `conversations/in-address` from `origin/main` (`9b984ea0`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `040b8a2b4152` (tree `9706fae10a08`), the last commit of `conversations/in-address`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `e2e/conversation-address.spec.ts`, `src/features/conversations/ConversationsView.tsx`, `src/features/resources/link.ts`, `docs/plans/conversation-address.md`. The review notes below name the commit of each later change.

## Outcome

- **`link.ts`:** `CONVERSATION = '#conversation-'`, beside `#goal-`, `#task-`, `#resource-` and `#decision-`.
- **`ConversationsView`:**
  - `useChosen` says whether a person opened the conversation (`picked`): a row, the form, another view or the
    address. The newest, open by default, doesn't count.
  - `useInAddress` follows the address with `useAddressed`, the same way `useOpenGoal` does. A named conversation
    goes through `ask` (the missing note included) and `show` (the thread screen on a phone).
  - It writes the conversation a person opened while it's on screen, and takes it away for the list or the form,
    using `showInAddress` (replaceState, so the history doesn't grow). A fragment under another prefix is left alone.
- Conversations is still behind the vision flag until A18 is served, so this shows in the demo and the fixtures.

## Evidence

- Plan: `docs/plans/conversation-address.md`.
- Written first and failing (commit `f91457d6`): `conversation-address.spec.ts`, all five failing. One selector was
  narrowed afterwards to `.conv-note`, because the list holds a second status.
- **After the change, locally:**
  - every conversation spec, plus search-goals and goal-address: 156/157, the one failure being that selector; after
    narrowing it, the address spec 5/5;
  - type-aware lint over the whole repo, typecheck and Prettier are clean;
  - the capture of the fixture opened with `#conversation-<briefs>` shows «Short or long briefs?» open and pressed.

## Remaining obligations

- None. Once A18 is served, the same address works on the real stack, with nothing more to do.
