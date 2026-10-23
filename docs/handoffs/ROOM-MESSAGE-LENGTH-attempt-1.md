# Implementation-session handoff

Goal and attempt: ROOM-MESSAGE-LENGTH (the third gaps report, fault 2; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `chat/room-message-length` from `origin/main` (`f062d838`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Procede» (the seven faults, one PR each); merges on green with no open P1.
Ending commit/tree: `f9083f9f62e5` (tree `c4163732d92a`), the last commit of `chat/room-message-length`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/room-discussion.spec.ts`, `src/app/theme.css`, `src/features/conversation/Composer.tsx`, `src/features/conversation/bar-length.test.ts`, `src/features/conversation/bar-length.ts`, `docs/plans/room-message-length.md`. The review notes below name the commit of each later change.

## Outcome

- **`bar-length.ts`** (pure) holds the most per target:
  - the room: 4000 characters, counted as the API counts them;
  - Sophia: 2000 UTF-16 units, her chat packet's limit.
- **`Composer.tsx`:**
  - the bar has no `maxLength`, so nothing written is cut;
  - from nine tenths of the most on, a count on its own line over the bar says how full it is;
  - past the most it says how far over, and Send and Enter wait.

## Evidence

- Plan: `docs/plans/room-message-length.md`.
- **Written first and failing** (commit of the tests):
  - `bar-length.test.ts`, against a stub;
  - two checks in `room-discussion.spec.ts`: the field kept 2000 of 4100, and no count showed.
- **Found in the capture:** beside Send, the count squeezed the field to a narrow column in the chat's 347 px panel, so
  it moved to its own line over the bar.
- **After the change, locally:**
  - room-discussion, room-chat-replies, chat-times, message-links, room-passage and push-to-talk: 48/48;
  - the units: 3/3;
  - type-aware lint, typecheck and Prettier are clean.
- **Captures:** desktop (the chat panel) and phone (390 px). Over the most, the count reads «4,091 / 4,000 · 91 over»,
  the field keeps its width, and there is no sideways scroll.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
