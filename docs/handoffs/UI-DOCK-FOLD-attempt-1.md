# Handoff: the dock never takes a second row, attempt 1

Goal and attempt: UI-DOCK-FOLD (`docs/plans/dock-fold.md`; Luis 2026-11-23 on the dock's two rows), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/dock-fold` from `ui/mejoras-e-visual`
`7aedb8d53` (#548). It is stacked on #548: its PR's base is that branch.

## Outcome

Where even the dock's icons would wrap, Share your screen, React, Raise hand and Keep the call in view fold behind
More controls (⋯). Pressing it opens them in a tray above the dock. The dock keeps one row at every width, a phone
included.

## Evidence

- Fixtures on the branch (:5181), browser pane:
  - 880 × 800 with the chat open and Sophia speaking: before, 2 rows and 87 px; after, 1 row and 47 px.
  - The tray, keyboard and React's menu inside it, the dot, and the tray closing when the window widens.
  - 1280, 390 and 360 were measured.
  - Dark and light.
- A first reading in the pane showed two rows for about a second after the panel opened. Logged, the pane delivered
  no frame until about 750 ms; at the first frame the dock was folded. Not a flash a person would see: the
  ResizeObserver runs before paint.
- `dock-fit.test.ts` passes 6 of 6.
- `pnpm format:check`, `lint` and `typecheck` all return 0.
- First `pull_request` run:
  - `runtime-unit` failed on `elevation.test.ts` («the room keeps every shadow it cast»): the tray's shadow was not in
    the room's list. It is the menu's own value, now listed.
  - `account-settings.spec.ts:104` read 131 against 132, a pixel in Settings, which this PR does not touch. Through
    the guard it passed 5 of 5.
- Through `pw-gentle.ps1` after the fix: `dock-fold`, `account-settings`, `visual-fit` and `room-dock`, 40 of 40.

## Decisions and changes

- The extras stay one group (`DockMore`), laid out with `display: contents` in the row, so their state and keys never
  move. `useDockFit` reads through such groups.
- The order of layouts is a pure function, `firstFit`. Folded is never read: it is the last resort.
- On a phone, `.dock .dock-more > .dock-more-open` outweighs the phone's `.dock :is(.round, .pill:has(.dock-icon))`,
  which otherwise showed ⋯ unfolded and pushed a row of seven to eight.
- «More controls» and the ⋯ glyph: approved by Luis 2026-11-23 («Sí, déjalos»).

## Remaining obligations

- The PR is not merged. It needs #548 merged first, or merged together with it.

## Next bounded action

The PR merges after #548.

Source IDs consulted: `visual-fit.md`, `phone-dock.md`, `raise-hand.md`, `RoomDock.tsx`, `useDockFit.ts`,
`dock-fit.ts`, `ReactMenu.tsx`, `usePopover.ts`, `app/theme.css` (`.dock`, `.menu`, `.toggle-dot`),
`e2e/visual-fit.spec.ts`, `e2e/room-dock.spec.ts`.
