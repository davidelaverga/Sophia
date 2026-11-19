# A raised hand is said; «Up to date» is reachable by keyboard

> 2026-11-19 · Two accessibility gaps left open by `raise-hand.md` («Not here»: no line said when someone raises a hand)
> and `up-to-date-checked.md` (the pill's help is read on hover only). Client only, no API. The new line is proposed;
> Luis approves its words.

## 1. A raised hand is said to a screen reader

**What was measured.** Another person's raised hand shows on their tile («Hand raised», `room-view.ts`,
`VideoStage.tsx`), and nothing is said: a screen reader user hears it only if they walk the tiles.

**What changes.**

- **The line:** «Marco raised their hand.», the name as the tile shows it (`shortName`); raises arriving within 300 ms
  of each other (a late joiner is told each hand at once) in one sentence: «Marco and Lucía raised their hands.»,
  «Marco, Lucía and Ana raised their hands.» (`hand-said.ts`). The words are one exported function, `handRaisedLine`
  in `room-view.ts`, so they change in one place.
- **Where:** one polite status line (`HandSaidLine`, `role="status"`, out of sight) for the whole call, mounted once in
  the project's shell (`ProjectShell.tsx`), so it speaks on every view, the call in the header's dock included; a
  guest's room (`GuestRoom.tsx`, its own page) mounts its own. Mounted all along so what it says is read; it never
  takes the focus. Not the dock's note (`DockNote`): that line says the connection and a failure, and a hand would
  overwrite it. Not the reactions' log: a hand is not a reaction. The line is cleared after a few seconds, as a
  reaction goes.
- **When (`hand-signal.ts`, `onRaised`):** once per raise, only when another member's hand goes from down to up.
  - Not on lowering; not for this person's own hand (their button already reads as pressed); not for a guest or Sophia
    (neither can send a hand, so none is heard).
  - The same raised hand said again (to a newcomer, or answering an ask) is not a new raise.
  - **Back from a drop**, the room is asked for its hands and what was heard before is forgotten: a hand raised before
    the drop and heard again in the next 5 s (the answer to the ask) is not said again. Each such hand has its own
    window, so a later drop never stretches an earlier one's. After its window, a raise is a new one.
  - **Joining late**, each hand already raised is said once as it is told: the person learns what the tiles show.

## 2. «Up to date · checked 6 s ago» by keyboard and screen reader

**What was measured.** The pill (`ConnectionPill.tsx`) carries its help in `title`, set as the pointer comes onto it:
no keyboard focus reaches it, and a screen reader reads only «Up to date».

**What changes.**

- The pill takes the keyboard focus (`tabIndex=0`, a `group` named by its word through `aria-labelledby`); the live
  region (`role="status"`) is the word alone, so the help never enters what a change of state announces. The kit's tip (`has-tip` + `<Tip>`, below the pill, aligned to
  its end) in place of `title`: shown on hover and on keyboard focus, as every other tip.
- The help is computed as the pointer comes onto the pill **or** the focus does (no re-render per second), and is the
  pill's accessible description (`aria-describedby` to the tip; the tip stays `aria-hidden`, which a description by
  reference still reads), only when it says more than the word: never «Reconnecting, Reconnecting».
- No new copy: the same «Up to date · checked {ago}» and, in every other state, its word.

## Checks (written first)

- `hand-signal.test.ts`: another member's raise is said once; said again (told, answered) nothing; lowered and raised
  again, said again; mine, a guest's, Sophia's, a lowering, nothing; back from a drop, a hand raised before and heard
  again is not said, one raised after the window is; a later drop doesn't stretch an earlier hand's window.
- `room-view.test.ts`: `handRaisedLine` for one, two and three names.
- `hand-said.test.ts`: raises arriving together are one line; a raise after the wait is its own; a name twice is said
  once; cleared, what waited is never said.
- `call-raise-hand.spec.ts`: your own raise says nothing; Marco's raise (the fake's `echoHand`) is said in a polite
  status line while the focus stays on the dock's button; once the line has gone quiet, a lowering says nothing; on
  Tasks, the call in the header's dock, Marco's raise is still said, from the one line.
- `feed-recovery.spec.ts`: the pill takes the focus, is named «Up to date», its status says the word alone, its tip
  shows, and its accessible description is «Up to date · checked …»; the hover check reads the tip instead of `title`.

## Not here

- Back from a drop, a hand from before that is lowered and raised again within its 5 s window, the lowering lost in
  the drop, is taken for the same raise and not said (the tile still shows it).

- No sound or visual toast for a raised hand; no announcement of a lowered hand.
- The pill's states, label and the stall watch are unchanged; the pill is still hidden on a phone (`display: none`).
- The line's words wait for Luis's approval.
