# The room's dock in the header, off the page

> 2026-10-11 · Luis: «Dale, sigue con el dock al header», informe-ui-premium §3 movement 7: on the five views that are
> not the Studio, «Join the room» floats at the bottom right over the content (it covers Knowledge's last row of tiles
> and, on a phone, Tasks' «Up next»), the one element with a strong shadow on those pages. No API change.

## What was measured

- `MiniDock` (`features/voice/MiniDock.tsx`) is mounted after `<main>` in `ProjectShell` and fixed at
  `right: var(--gutter); bottom: var(--floor)` with glass, a 40 px shadow and a rise. At rest it holds the join pill
  (with text mode's switch); live, «In the room · N» and the call's switches (microphone, camera, screen, leave);
  always Sophia's «looking» indicator and the call's note.
- The topbar's end cluster (`.topbar-end`) holds the connection pill, the search and Invite ghosts and the account:
  one row, 48 px tall, with room to spare at 1280 and up.
- Four specs reach the dock by its class or its group name («Project room»), never by its position; Conversations
  makes it inert under its sheets by class.

## What changes

- **The dock moves into the header's end cluster**, first in it, before the connection pill: `ProjectHeader` takes a
  `dock` slot and `ProjectShell` hands it the same `MiniDock`. Nothing in the dock changes: the same pill, the same
  switches, the same group name, the same `data-call-anchor` for text mode.
- **In the header it is a group of controls, not a floating bar**: static, no glass, no border, no shadow, no rise;
  its pill the ghost's height (28 px) beside Invite; a hairline separates it from the connection pill.
- **On a narrow screen it floats as before**: under 721 px the header has no room for five more controls, so the
  dock keeps its fixed place at the bottom right, mounted outside the header (`useMedia(WIDE)`): a sticky header with
  a backdrop filter is the containing block of a fixed child, which would pin the dock inside the header's own box
  (measured: 731 px from the bottom at 375). The phone's bottom bar is informe-ui-premium §3 movement 11, a piece of
  its own.
- Nothing on the page is covered any more on a wide screen: Knowledge's last tiles and Tasks' lanes are clear.

## Checks

- `e2e/dock-header.spec.ts`: on Tasks, Knowledge and Updates at 1280 the group «Project room» is inside `.topbar-end`,
  static, within the topbar's box, and its join pill is 28 px as Invite; in a call (the room's fixture with `call=on`,
  then Tasks) the switches and Leave are in the header too; at 375 the dock is fixed at the bottom right. The four
  specs that reach it by class or name keep passing.
- `pnpm format`, `lint`, `typecheck`; measured in the pane before the push.
