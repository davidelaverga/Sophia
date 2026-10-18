# Implementation-session handoff

Goal and attempt: CONVERSATIONS-FOLLOW-UPS-3 (Codex P2s on #375, #382 and #376, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `conversations/follow-ups-3` from `origin/main` (`21516687`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `20781e5aa252` (tree `3bcb5588a41e`), the last commit of `conversations/follow-ups-3`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 8 files changed against
`origin/main` at that commit: `e2e/conversation-address.spec.ts`, `e2e/conversation-moves.spec.ts`, `src/features/conversations/ConversationsView.tsx`, `src/features/conversations/new-conversation.test.ts`, `src/features/conversations/new-conversation.ts`, `docs/plans/conversation-address.md`, `docs/plans/conversation-moves.md`, `docs/plans/same-question.md`. The review notes below name the commit of each later change.

## Outcome

- An address naming a conversation keeps it while the list can't be read yet (still coming, or failed and asked again); it opens once the list arrives.
- A report open beside a conversation keeps Alt+↑/↓ to itself; from the view, or the page around it, the move still goes.
- The draft is folded once, and each conversation's title once, while comparing for the same question.

## Evidence

- Plans: `docs/plans/conversation-address.md`, `conversation-moves.md`, `same-question.md`, «Follow-up».
- **Written first:** on main's code `conversation-address.spec.ts` lost the address («» instead of `#conversation-…`), `conversation-moves.spec.ts` moved from the report, and `new-conversation.test.ts` counted three folds of the draft.
- **After the change, locally:** every Conversations spec: 133/133; unit 48/48; typecheck, lint, Prettier clean.

## Decisions and changes

- **`waiting` beside `missing` in useChosen;** the form for a new one still takes the address away (`starting`).
- **The refuter's tighter guard for Alt moves:** the view, what is inside it, and what holds it (the page, its main), so Skip to content keeps them working.
- **The handler split** into `fromTheView` and `moveBy` to keep it under the complexity limit.
- **`wordsOf`, `negates` and `ownWords` take folded words;** behaviour unchanged (the «n't» rule kept on the folded text).

## Remaining obligations

- None.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
