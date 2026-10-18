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
- **`SignedIn.tsx`:** `useOneCallInSight` records which project's opening is leaving the call (the call's project and
  the opened one) in a ref, before it leaves. When the call ends, `useSayings` reads the ref and then clears it. Every
  end clears it, so a Leave pressed later never borrows the cause. The opened project's title comes from what this page
  already read: Work's list, else that project's snapshot. Rejoin is `opening(…)(callProjectId, true)`: the call's
  project opens and joins, as «Join the room» from Work does.
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
  so nothing here.
- **Browser** (`app-auth.spec.ts`, the app's page with `work=lost&projects=two`): in a call, Home, then ⌘K «Open
  Research notes» → the toast has the line and Rejoin, and the focus stays off it. Rejoin → back in the fixture
  project, in its call. Control: Leave in the places' bar → «You left Fixture project.» with no press. Opening Research
  notes after that says nothing new.
- **Lever** (`fixtures/app.tsx`, `projects=two`, kept in the tab as `work=lost` is): Work's list holds «Research notes»
  after the fixture project. Its reads are the fixture project's, and its snapshot carries its own id and title. It
  imports the contracts' validators only when asked: `signed-in-later.spec.ts` requires that a page at rest never
  loads them.

## Limits

- Nothing warns before Open; this seam is about what happens after it.
- Rejoin lives as long as the toast does (8 s). After that, the project's own Join is the way back, as today.
- At 390 px the toast is 195 px wide, so the line wraps to four lines. `.toast` sits at `left: 50%` and shrinks to
  fit the half it has, so its `max-width` is never reached. That is a follow-up of its own.
