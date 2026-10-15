# Implementation-session handoff

Goal and attempt: UIKIT-04 (the kit's fifth piece: `SheetFrame`, one sheet), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/kit-sheet` from `ui/kit-tabs` at `807e3bec`
(stacked on PR #223 → #222 → #221 → #220; the base retargets as each merges)
Ending commit/tree: `474c8e02` (tree `373143e5927d`): 12 files, 5 new (`SheetFrame.tsx`, `sheet-class.ts`,
`sheet-class.test.ts`, `e2e/sheet-frame.spec.ts`, `docs/plans/sheet-frame.md`). The commit after it adds only this
handoff.

## Outcome

- `@sophia/ui` exports `SheetFrame` (the veil, the panel, its sticky top with the head, the actions and Close, its
  body) and the pure `sheetClass` / `sheetHeadClass` / `SHEET`.
- `app/Sheet.tsx` renders the frame and wires the Studio around it (`useDialog`, `SheetCall`); it takes `head`,
  `label`, `actions`, `top`, `panelRef`, `onKeyDown`, `data`, `className`, `headClassName`. Its nine sheets keep
  their call unchanged.
- The Invite and the resource sheets render through `Sheet`: the two hand-built shells (veil, panel, top, head, Close,
  `useDialog`, `SheetCall` each) are gone.
- The report viewer's head presses are a sheet's: 28 px squares without the edge, Close 20 from the edge (before 36
  with an edge, 16 from the edge).
- Unverified here: the Playwright run of `sheet-frame.spec.ts` (the guard keeps refusing a browser run beside the open
  game). CI is the run on record for it, and for the Invite's, the resources' and the viewer's own specs.

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean.
- `node --test "packages/ui/src/**/*.test.ts" "apps/studio/src/**/!(*.db|*.live).test.ts"`: 1043 passed.
- The spec's measure, run in the page (the browser pane, 1280×800, served on 5197), after the change:
  - Invite: dialog, modal, named by `invite-title`, 420 wide, padding 12 20 28, head 36, title 15/600, Close
    `round sz-sm` 28×28 at 20 from the edge, no edge, veil rgba(5, 4, 8, 0.5), the tabs under the head, the focus
    inside on open; Escape closes and the focus is back on Invite; a press on the veil closes.
  - A resource: `sheet resource-sheet`, `data-tool` claude-code, named «Davide · Claude Code», head
    `sheet-head resource-sheet-head` 36, actions «Copy link» then «Close» 28 at 20, body a block with no top padding,
    its sections' arrival delays 0 / 40 / 80 / 120 / 160 ms as before, the host line 11 px under the head.
  - A task: 420, padding 12 20 28, head 36, Close 28 at 20, named by `task-work-1`, its content in the body.
  - The report viewer's head: Enlarge 28×28, Close 28×28 at 20 from the edge; the head 64 (its two-line name).
- Before the change, the six sheets measured the same frame (the look was one; the code was three); the viewer's
  presses 36 with an edge, Close 16 from the edge.
- The resource sheet's Previous/Next steps do not show on `/resources.html` because that fixture state shows one
  resource (`order.length` 1): measured the same with this work stashed, so it is the base's behaviour, not this
  change's.
- Seen in the pane: Invite open (its tabs under the head), the resource sheet, the viewer's head.

## Decisions and changes

- The frame lives in the kit; the dialog contract (`useDialog`, which speaks to the shortcuts' scope) and the call's
  switches stay in the Studio's `Sheet`, which hands the panel's ref to the frame. A sheet that moves focus or takes
  keys of its own (the resource's page turns) gives its own `panelRef`.
- The head's actions sit in `.sheet-acts` (28 px squares without the edge, 2 px apart); the resource's
  `.resource-sheet-actions` was this and is gone.
- The resource sheet's body keeps its flow (`.resource-sheet .sheet-body`: block, no top padding, no arrival of its
  own); its sections' arrival is by their place in the body (`:nth-child(2)` …), where before it was by their place in
  the panel after the top.
- The report viewer keeps its own pane; only its head's presses took the sheet's.

- Codex on #224 (three P2s), fixed in the commit after the handoff: `.sheet-tab-body` for the Invite's panels (the
  body's padding and arrival once), `CopyLink` keyed by the resource, the viewer's head presses 40 wide to a finger.

## Remaining obligations

- Watch CI for `sheet-frame.spec.ts` and the Invite's, the resources' and the viewer's specs; fix in this PR what the
  pane did not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/kit-tabs` until #223 merges.

## Next bounded action

UIKIT-05: `Menu` (the account menu, the sort menu, the decision popover: `usePopover` exists), then `Card` and
`Skeleton` (informe-30 §2.1).
