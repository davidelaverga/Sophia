# Implementation-session handoff

Goal and attempt: UIKIT-81 (Personal's day pill, Codex's two P2s on #292; Luis's queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/personal-followups` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/handoffs`); no service code, no deploy, no contract.
Runtime unit: Luis's Windows host (headless captures of the preview); CI as the run on record.
Existing authority: Luis's standing instructions for the kit; merges on green with no open P1 (his queue).
Ending commit/tree: `ef5448e728af` (tree `2915fc559919`), the last commit of `ui/personal-followups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 3 files changed against
`origin/main` at that commit: `e2e/personal-day-pill.spec.ts`, `src/features/personal/Conversation.tsx`, `docs/handoffs/UIKIT-81-attempt-1.md`. The review notes below name the commit of each later change.

## Outcome

- The day pill, stepped aside for the divider under it, is out of the accessibility tree and out of reach while it is
  (`aria-hidden`, `inert`), and back in both once it returns. Crowding is read again on a resize or rotation too
  (`ResizeObserver` on the list), not only on scroll.
- The third Personal P2 (#290, the centred start kept for the tab's life) stays on the follow-up list: it needs
  Personal to know when it is out of sight, more than a P2.

## Evidence

- Written first and failing: `personal-day-pill.spec.ts` («the pill stepped aside leaves the accessibility tree»).
- Prettier, type-aware lint and typecheck clean. On the preview (headless, 1440×440): crowded, the pill read
  `data-crowded="true"`, `aria-hidden="true"`, `inert`; back, none of them.
- Local Playwright did not run (a heavy app was open); CI is the run on record.

## Review notes

- Codex P1 (no check for the resize path): «a resize that moves the divider away reads the crowding again, with no
  scroll». Room is added below so the reader is not at the end (the list's own stick-to-the-end would scroll, and that
  scroll alone reads the crowding again: the reason a viewport resize could not isolate the observer, which fired 2–4
  scroll events in a probe). Padding on the list resizes its box and moves the divider 80 px down with no scroll event;
  the test asserts zero scrolls and the crowding cleared. Local Playwright through the guard: 3/3 pass; control mutant
  (`resized?.observe(box)` commented out) fails on the crowding assertion.

## Remaining obligations

- CI; Codex with no open P1.
