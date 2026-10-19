# Opening another project says it ended your call, with Rejoin

> 2026-10-18 · Luis: «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella» · seam #1 of
> `evaluacion-2026-10-18/experiencia/costuras.md` (judge's adjustment: «when you opened», never «because you»). Studio
> only.

## Measured

- **The end:** `useOneCallInSight` (`app/SignedIn.tsx`) leaves the call as soon as the address names another project.
  The room's `leave()` ends it with no note (`useProjectRoom`'s `outOfCall(null)`), so `useSayings` hands `callEnded`
  a null note and the toast says «You left Pitch deck, Q4.» for 8 s, with no press.
- **The same words as a Leave:** the places' bar's Leave (`inCall`'s `onLeave`) calls the same `leave()`, so the two
  ends reach `callEnded` alike. Only `useOneCallInSight` knows the cause and which project was opened.
- **Brief against code:** the report says no fixture mounts SignedIn's toast with a live call. The app's own page
  (`fixtures/app.tsx`, `work=lost`) does: `app-auth.spec.ts` joins a call there and goes Home (Codex P1 on #367). It
  lacks a second project to open: its list holds the fixture project alone.

## What changes

- **`notice-view.ts`:** `callEnded` gives the words and the press together, `{ message, act }`. With `opened`, the
  title of the project whose opening ended the call: «Your call in “Pitch deck, Q4” ended when you opened “Research
  notes”.» with the act `Rejoin`. When that project's title isn't read here yet (a link to one never listed): «… ended
  when you opened another project.» Without `opened`, today's words and no act. A note the room gives (dropped, joined
  elsewhere, taken out, closed) still comes first: that note names the real cause.
- **`SignedIn.tsx`, `one-call.ts`:** `useOneCallInSight` records which project's opening is leaving the call, before it
  leaves. The cause lives with the call that runs (`oneCall`, after the review below): each call begins with none, and
  its end hands it to `useSayings`, so a Leave pressed later never borrows it. The opened project's title comes from
  what this page already read: Work's list, else that project's snapshot. Rejoin is `opening(…)(callProjectId, true)`:
  the call's project opens and joins, as «Join the room» from Work does.
- **One line:** it replaces the toast that already shows, and adds none. Each hang-up gets its own toast. An opening
  with no call says nothing. The toast keeps role=status and never takes the focus.
- **`ProjectShell.tsx` (`useJoinOnOpen`), found at the first fix:** Rejoin opened the fixture project, but its dock
  stayed at «Joining the room…». The project's snapshot was already read, so the join began during the shell's first
  effects. React's strict mode (development) then remounts at once: the room's unmount (`useRoomConnection`,
  `calls.end()`) superseded that join, and `done` kept the second pass from joining. With strict mode off on the app's
  page, the same check passed. The join now waits a tick after the effects, and a remount cancels the wait. A
  production build runs effects once. Work's «Join the room» on a warmed project takes the same path (inferred).

## Checks (written first)

- **Unit** (`notice-view.test.ts`): with `opened`, the line and `Rejoin`; with an unread title, «another project» and
  `Rejoin`; without it, «You left Pitch deck, Q4.» and no act; a note wins over the opening; the room on screen says it,
  so nothing here. After the review: `room-view.test.ts` (`askedJoin`, each status, loaded or not) and
  `one-call.test.ts` (the order of reports, and the cause).
- **Browser** (`app-auth.spec.ts`, the app's page with `work=lost&projects=two`): in a call, Home, then ⌘K «Open
  Research notes» → the toast has the line and Rejoin, and the focus stays off it. Rejoin → back in the fixture
  project, in its call. Control: Leave in the places' bar → «You left Fixture project.» with no press. Opening Research
  notes after that says nothing new. After the review: back in the call by the dock's own Join, then Rejoin, then
  Leave → no new room token, and the room stays out.
- **Lever** (`fixtures/app.tsx`, `projects=two`, kept in the tab as `work=lost` is): Work's list holds «Research notes»
  after the fixture project. Its reads are the fixture project's, and its snapshot carries its own id and title. It
  imports the contracts' validators only when asked: `signed-in-later.spec.ts` requires that a page at rest never
  loads them.

## After the independent review (round 1: three P2s)

- **Rejoin pressed once already back in that call (real):** the person goes back to the call's project and joins with
  the dock's own Join while the toast still offers Rejoin, then presses it. `useJoinRequest` keeps the request while
  that project is on screen, and `useJoinOnOpen` skipped any room not `idle` without taking the request as handled, so
  the next Leave (`idle` again) joined the room by itself. Before this branch nothing reached it: Home and Work turn the
  call's project into Back and Leave. Now `askedJoin` (`room-view.ts`) decides: wait while the project loads; join a
  room out of the call, after a failed join too (Rejoin then does what Try again does, never a dead press); a room the
  person is in, or joining, answers the request.
- **A cause kept after the call ended (real, inferred from the code, not observed):** `leaveFor` wrote the cause
  whatever the call's state, so a render still holding a call that had just ended could write it again after the end
  had read it, and the next Leave in that project would say «ended when you opened …» with Rejoin. The bookkeeping
  moved, unchanged, into `oneCall` (`app/one-call.ts`, pure), then the rule changed: the cause is part of the running
  call. An opening asked for a call that no longer runs keeps nothing and leaves nothing; a call that begins has no
  cause; what the call reports while it ends (who speaks, a device) carries the cause through.
- **No check for «every end forgets the cause» (real):** `one-call.test.ts` now pins it: read once by that call's end,
  carried through its reports, never read by another call's end, kept by nothing after the end, taken by no call that
  begins later. The browser check also presses Rejoin a second time, goes Home and presses Leave in the bar: «You left
  Fixture project.», with nothing to press.

## Limits

- Nothing warns before Open; this seam is about what happens after it.
- Rejoin lives as long as the toast does (8 s). After that, the project's own Join is the way back, as today.
- At 390 px the toast is 195 px wide, so the line wraps to four lines. `.toast` sits at `left: 50%` and shrinks to
  fit the half it has, so its `max-width` is never reached. That is a follow-up of its own.
