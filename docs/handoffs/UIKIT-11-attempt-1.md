# Implementation-session handoff

Goal and attempt: UIKIT-11 (informe-30 §2.4: the screen is used — 1280, the context to 360, the views' fades), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/widths` from `ui/press-answers` at `bcd49b22`
(stacked on PR #232 → #231 → #230 → #229 → #228 → #227 → #224 → #223 → #222 → #221 → #220; the base retargets as
each merges)
Ending commit/tree: `a9818725` (tree `4908b22beaa7`), after the review: 7 files, 2 new (`e2e/widths.spec.ts`,
`docs/plans/widths.md`) and `theme.css`, `artifacts.css`, `conversations.css`, `ViewNav.tsx`, `widths.spec.ts` again.
The first code state was `2d74ff38` (tree `b5c3ea4b765a`, the five files); Codex's P2 on #233 (the current view in
sight but under the fade at 1024 with Updates open) added the `ViewNav` fade fix and its check in `a9818725`. This
handoff's own commits sit beside them.

## Outcome

- `--content: 1280px`; `.page`, `.updates` and the report pane's padding read it.
- Conversations' third column: `clamp(300px, 300px + (100cqi − 1416px) / 2, 360px)`.
- The project views' `data-more-*` fades are the row's at any width (moved out of the phone's media block).
- `e2e/widths.spec.ts`: wide (1920: page 1280, four lanes ≥ 270, four cards ≥ 260 a row, list 300 / field 760 /
  context 360), between (1440: field 760, context 312), narrow (1024: the row scrolls under a fade, the current view
  in sight, clear of the bar's end; polled).
- Unverified here: the Playwright run of the spec (the guard keeps refusing a browser run beside the open game); CI
  is the run on record. The 1024 check in particular: the row's marks come with a ResizeObserver, which a hidden
  pane never fires, so the pane could not see the fade set.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`).
- Measured in the page (the browser pane, served on 5197), before: at 1920 the page 1040 at x = 493 (925 of content),
  lanes 222 and tiles 218, Knowledge 3 × 298 a row, Conversations `300px 1320px 300px` (its field 760 at x = 580),
  the context 300; at 1024 the views' row 492 px wide for 528 of links, `maskImage: none`, «Resources» cut.
- After: at 1920 the page 1280 at x = 315, lanes 282 × 4, tiles 277, Knowledge 4 × 279, Conversations
  `300px 1260px 360px`, field 760; at 1440 `300px 828px 312px`, field 760 (a first cut with 1360 in the formula left
  the field 744: the thread's 28 px sides count, hence 1416); at 1536 context 360, field 760.
- At 1024 in the pane: the row scrolls (`scrollWidth > clientWidth`), its right edge 813 ≤ the bar's end 825 (clear);
  the marks and the fade were not set in the hidden pane (no ResizeObserver): CI measures them.
- Seen in the pane: Conversations at 1920 (the context wider), the views' row at 1024 (scrolled to «Resources»).

## Decisions and changes

- 1280 is the token (`--content`), not a per-view width: the board's lanes and Knowledge's grid follow it with no
  change of their own (282 lanes rather than the informe's 288: that would take a narrower gutter at 1920).
- The context's growth is half of what is spare, so the thread's column keeps its 760 of content with its sides; the
  constant counts the sides (1416), measured after a first cut at 1360 left the field 744.
- The fades are moved, not duplicated: one source for the row's edges. `ViewNav`'s marking and scroll-into-sight were
  already width-independent.
- Not done, named: a fifth «Blocked» lane (no lane exists), Home's right half (the feature F2).

## Remaining obligations

- Watch CI for `widths.spec.ts`, above all the 1024 check; fix in this PR what the pane did not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/press-answers` until #232 merges.

## Next bounded action

Informe-30 §2.5: a light mode on the report's paper palette (`--paper #fbf8f3`, `--ink #1d1b22`, `--soft #5d5966`,
`--line #e4dfd6`, `--accent #6d5bd0`, `--warm #c8794a`): fourteen tokens to double, the accents a step darker for
contrast, Sophia's light as a violet halo on paper, the grain gone. Design note first.
