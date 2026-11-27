# Two lines from the demo test: new messages in the call, and whose role changed

> 2026-11-27 · Luis approved both lines («Sí, constrúyelos»). Findings 7 and 5 of the test before the demo
> (`hallazgos-prueba-demo.md`). Studio only; no API change.

## Finding 7 · «1 message came while you were away» while in the call

- Seen: Davide was in the call with the chat closed and the tab elsewhere; the chat said the message came while he
  was away.
- Change: an absence remembers whether the person was in the room's call at every read while the tab was hidden and as
  it came back (`nextUnseen`'s `inCall`, `Away.inRoom`, unread-title.ts). Then the divider and the chat's head line
  say «2 new messages» / «1 new message» (`awayWords(count, inRoom)`). Out of the call at any read, or back after
  leaving it, the words stay «… came while you were away». An absence added to one not yet reached is in the room
  only if both were.
- The shell passes whether its call is live or reconnecting (`isInCall`, ProjectShell).

## Finding 5 · The admin sees no confirmation

- Seen: an admin changed a role, and the row said only «Saved».
- Change: the row says who has which role now, under the select, for the same moment: «Marco is now a viewer.»
  (`savedNote(name, role)`, role-notes.ts). The slow-reply line («Saved. The reply was slow, so we checked.») is as
  it was. The admin's own row says it with their name too, the approved shape, rather than a new «You're now …».
- The other person's tab follows the change since #567 (role-follows-audience.md).

| Measure (fixture)                                         | Before                                  | After                                |
| --------------------------------------------------------- | --------------------------------------- | ------------------------------------ |
| In the call, tab hidden, two messages, back, open Chat    | «2 messages came while you were away»   | «2 new messages»                     |
| Not in the call, same                                     | «2 messages came while you were away»   | same                                 |
| Invite → Members, Marco to viewer / editor                | «Saved»                                 | «Marco is now a viewer.» / «… an editor.», one line at 1280 |

## Checks

- Unit: `unread-title.test.ts` (in the call all along; out of it at any read; the words) and `role-notes.test.ts`
  (`savedNote` with each article).
- E2E: `unread-title.spec.ts` (in the call: «2 new messages»); `member-roles.spec.ts` now reads «Marco is now a
  viewer.». Walked in the browser pane; CI is the record (the Playwright guard refuses while Opera is open).
