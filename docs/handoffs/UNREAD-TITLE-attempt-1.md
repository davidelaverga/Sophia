# Implementation-session handoff

Goal and attempt: UNREAD-TITLE (the third gaps report §4, messaging; Luis: «Sigue con lo que queda en la cola»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/unread-title` from `origin/main` (`07364e11`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `de29074053bb` (tree `4aa201b99210`), the last commit of `room/unread-title`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/unread-title.spec.ts`, `src/features/conversation/unread-title.test.ts`, `src/features/conversation/unread-title.ts`, `src/features/studio/ProjectShell.tsx`, `docs/plans/unread-title.md`. The review notes below name the commit of each later change.

## Outcome

- A message written in the room's chat while the project's tab is in the background counts in the tab's title:
  «(2) Fixture project · Sophia». Someone at the door already counted there.
- Shown again, the count goes. The viewer's own messages and spoken turns never count. There's no sound and no
  notification: a message is not a knock.

## Evidence

- Plan: `docs/plans/unread-title.md`.
- Written first and failing (commit of the tests):
  - `unread-title.test.ts`: the count of typed messages not seen;
  - `unread-title.spec.ts`: two messages while the tab is hidden, then shown again. The shown-tab case passed before,
    as it should.
- **After the change, locally:** 141 checks, all passing. They cover:
  - the unread title's checks;
  - every spec that reads the tab's title (`resources`) or the room's discussion (`room-discussion`,
    `discussion-earlier`);
  - the door's (`knock-alert`, `lobby-door`) and `view-titles`.
- Type-aware lint over the whole repository, typecheck and Prettier are clean.
- **No capture:** the change is the tab's title, which the page doesn't draw. The browser check reads it.

## Decisions and changes

- **What counts:** typed messages (`origin: composer`) from someone else. Spoken turns have their captions.
- **Seen:** the messages there while the tab was shown, or when the discussion was first read. A tab opened in the
  background counts only what comes after, never the history.
- **The viewer:** their membership's actor id, known with or without a call.
- **The browser check stands in for a hidden page:** `document.hidden` and `visibilityState` read a flag the check sets,
  and it dispatches `visibilitychange`, as `knock-alert.spec.ts` stands in for a hidden tab.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
