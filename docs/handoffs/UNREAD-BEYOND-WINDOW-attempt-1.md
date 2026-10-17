# Implementation-session handoff

Goal and attempt: UNREAD-BEYOND-WINDOW (Codex P2 on #418, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `conversation/unread-beyond-window` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `3b77f20d37fe` (tree `28bebb76759c`), the last commit of `conversation/unread-beyond-window`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `e2e/unread-title.spec.ts`, `src/features/conversation/unread-title.test.ts`, `src/features/conversation/unread-title.ts`, `docs/plans/unread-title.md`. The review notes below name the commit of each later change.

## Outcome

- While the tab is hidden, each typed message from someone else is counted into a set as it comes (`withUnseen`), so one that rolls out of the snapshot's latest 50 still counts: the title reads (51) after 51 messages, not (50).
- The number never goes down while hidden (a voice turn or the viewer's own message pushing one out no longer lowers it); shown again, it clears as before.

## Evidence

- New e2e `unread · a message rolled out of the snapshot's 50 still counts`: on main it reads «(50) Fixture project · Sophia»; with the fix «(51)».
- `node --test unread-title.test.ts`: 3/3 (the rewritten count, 51 past the window, the same set back when nothing is new); on main the file fails at import.
- Playwright through `safe-run.ps1`, two workers: unread-title and resources specs (the two that read the tab title), 100/100.
- Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.

## Decisions and changes

- The state is `{ seen, counted }`; the effect keeps the `if (!entries)` guard (the shell in the background passes no discussion) and returns the same state when nothing is new, so a refresh alone renders nothing.
- A Set built with `for…of` rather than a spread, as the lint prefers.
- Known limit, written in the plan: more than 50 messages inside one refresh still count as 50.

## Remaining obligations

- None.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
