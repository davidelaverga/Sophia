# Typing anywhere in the room says so, once

> 2026-11-19 · Luis approved the line verbatim: «Tip: just start typing to message the room.» Same rules as the keys'
> tip (`keys-tip.md`): once per browser, one press ends it, never over a control, never while a field has the caret,
> not on a touch screen.

## What was measured

- In the project room, with the chat's foot on screen, a key typed with the focus on no control (or on a control of
  the side panel: its tabs, Close) is text for the message bar: the focus moves there before the character lands
  (`shortcuts.ts`, `data-typing-sink` on the bar in `Composer.tsx`). Nothing on the page says so.
- The foot is on screen only while the side panel is open (`c`, or its tab). With the panel closed, `c` and the other
  letters are shortcuts, and stray typing goes nowhere: there the line would not be true.
- Opening the panel by its key puts the caret in the bar (measured 2026-11-19 on the fixture: after `c`, the focus is
  `#converse-draft`). Type-anywhere matters once the person has left the bar with the panel still open (a click on the
  stage, Escape out of a menu): that is when the tip has something to say.

## What changes

- **`TypeTip`** (`app/KeysTip.tsx`, beside `KeysTip`, rendered by `CommandsHost`): «Tip: just start typing to message
  the room.», with Dismiss. Both tips are one component, `CornerTip`, over one machinery, `onceTip(key)` in
  `app/keys-tip.ts`: no parallel copy.
  - **When:** only where its words are true: the room's message bar (`[data-chat-entry]`) is the field that takes stray
    typing now (`typingSink`), no field has the caret, no sheet is up. It waits, unseen, meanwhile (panel closed, the
    caret in the bar or in any other field) and shows when the page lets typing through.
  - **Where:** the same bottom-left corner and the same box as the keys' tip (`.keys-tip`, its catalogued shadow), above
    the floor band. Never shown while its box meets a control: the same unseen measure (`keys-tip-measure`), read a
    frame after the page changes, resizes or moves its focus.
  - **Once per browser:** Dismiss keeps `sophia.type-tip` = `seen`; it never returns, after a reload too, nor in
    another tab (`storage`). Let be, it counts its visits and ends after the third, as the keys' tip does.
  - **Seen by use:** a message started by typing without focusing the bar (stray typing that moved the focus into the
    room's bar, `useShortcuts`) keeps it seen: the person already knows. Stray typing into Personal's composer doesn't
    count (the line speaks of the room).
  - **Blocked storage:** read as seen, as the keys' tip: a tip that could not be kept closed would come back on every
    visit. Writing that fails breaks nothing; the tip still goes for the page.
- **Screen reader:** a `role="status"` mounted all along at the end of the page (a portal to `body`), so the line is
  announced politely as it comes and Tab reaches its Dismiss last; it never takes the focus, and stray typing still
  lands in the bar while it shows.
- **Phone and touch:** never, `(hover: none)`: there is no keyboard to type on without touching the bar.
- **Light and dark:** the keys' tip's box, tokens only (`--plane-2`, `--line-2`, `--text-2`, `--elev-welcome`); no new
  colour, shadow or duration.

## With the keys' tip

- **Never both at once, the keys' tip first.** The typing tip waits until the keys' tip has had its turn in this
  browser (dismissed, the index opened, or let be for three visits). Their words also exclude each other: the keys'
  tip needs no field taking stray typing (`?` would be text), the typing tip needs the room's bar to take it; so even
  apart from the order they could not share the screen.
- Why the keys first: it holds on every page with keys, the typing tip only in the room with the panel open, and one
  lesson at a time keeps the corner quiet. Someone who uses type-anywhere before ever seeing the second tip simply
  never sees it.

## Checks (written first)

- `type-tip.test.ts`: the rule (the keys' tip first; the bar taking typing; no caret, no sheet, no control under it;
  not on touch); `onceTip` over a store: dismissed and used both keep it seen under its own key, the keys' tip
  untouched; three visits end it; a blocked store reads as seen and keeps without throwing; only the room's bar counts
  as use.
- `e2e/type-tip.spec.ts` (fixture room, keys' tip seen): panel closed, no tip; panel open with the caret in the bar,
  no tip; the bar left, the line in a status, focus not taken, over no control; Dismiss ends it after a reload; a letter typed from the panel's tab lands in the bar and
  ends it; the caret in the bar hides it and leaving brings it back; an empty store shows the keys' tip and, with the
  panel open, neither; a blocked store shows nothing and throws nothing; `@phone`: never.
- `e2e/tip-seen.ts` keeps both tips seen for the other checks.
