# A dropped call rejoins on its own, once

> 2026-10-19 · the reliability baseline's gap #9 (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.5, §5 row 9;
> metric M5); Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de Davide», and earlier «Lo que no se
> mide, no se puede mejorar». Studio only, no API. Read beside the call-end seams already merged (`costuras.md` #1, #2,
> #3, #6, #8: `call-ends-on-open.md`, `signed-out-elsewhere.md`, `join-other-browser.md`, `sound-blocked-others.md`,
> `offline-join-from-rest.md`), so the try never fights them.

## Measured

- **The baseline holds.** A call LiveKit can't bring back ends with `Disconnected`; any reason that isn't another tab,
  taken out or the room closed reads as `dropped` (`livekit-room.ts`, `ENDS[reason] || 'dropped'`). `outOfCall`
  (`useRoomConnection`) sets `failed` and the note «You were disconnected from the room.», and only the person's Try
  again joins again. Offline it says #467's «You’re offline, so the call ended here. Join again once you’re back.» and,
  back online, «You’re back online. Try again rejoins the call.»: nothing joins on its own.
- **LiveKit's own policy is the SDK's default, never set** (`roomOptions()` passes no `reconnectPolicy`). In
  livekit-client 2.22.3 that is `DefaultReconnectPolicy` with ten tries at 0, 300, 1200, 2700, 4800 ms and then 7000 ms
  five times, plus up to 1 s of jitter from the third on: about 44 s of waiting, 52 s at most, before each try's own
  time. So `dropped` arrives about a minute after the link went, and the server has let this participant go by then.
- **What a second join costs here.** A join is a fresh room token (`issueRoomToken`, a new idempotency key each time)
  and a new LiveKit room. A join that Leave or the page going away overtook still connects once its token arrives, and
  is left at once (`CallFence.adopt`): the room sees this person flash in and out. Until now nothing could overtake a
  join from the dock (no Leave shows while joining).
- **Where the call's project lives.** A project shell stays mounted out of sight (Home, Personal, Work) only while its
  room reports a call (`useReportCall` → SignedIn's `useCall` → `ids`). The moment the call ends the shell goes, and
  its room's cleanup ends any join under way. The toast then says the room's note («You were disconnected …»).
- **The ends that must never bring a try:** the person's Leave and every quiet leave (`useLeave`: another project
  opened, `useOneCallInSight`; a shut door, `useLeaveBehindClosedDoor`, which an archived project or a removed member
  reaches; the page going away); `elsewhere` (another tab or browser, a person is in a call once); `removed`; `closed`.
  A sign-out elsewhere unmounts the signed-in tree, so the room's cleanup runs.
- **The fixture** (`fake-livekit.ts`) never runs `roomOptions`; `fixture.drop(why)` ends the call as LiveKit reports
  it. `failToken()` refuses the next token once; nothing holds a token.

## What changes

- **The rule** (`call-rejoin.ts`, pure, so unit-tested): after an end, `rejoinPlan` says `now`, `online` or nothing.
  Only `dropped` tries. Never for a call last seen live more than two minutes ago (`REJOIN_WINDOW_MS`): «seen» moves
  every 5 s while the call is live and the page is running, so a laptop lid closed for an hour or a tab frozen in the
  background doesn't turn a microphone on in an old call when it wakes. Never twice for one drop: at most one try in
  any two minutes, so a call that drops again right after its try came back is left to the person (a flapping
  network). Online, one try at once; offline, the try waits for `online`, once, and only while still inside the window.
- **The try is a Try again pressed for the person** (`Rejoin`, beside the rule, its timers and the browser's `online`
  passed in): the room's own `join`, through the offline fence (`joinOnline`), with the microphone as last chosen and
  text mode kept, as Try again joins. A fresh token, a new call.
- **What it says** (the try's lines are polite, `role=status`, from the dock's line that is there before it speaks;
  never an alert, never the focus):
  - while it tries: «Connection lost. Rejoining the call…»
  - offline, waiting: «You’re offline, so the call ended here. Back online, you rejoin it automatically.»
  - back in: «Reconnected.», said once, gone after 4 s.
  - when the try fails, or the window closes while offline: the lost call's words as today, with Try again
    («You were disconnected from the room.»; offline, #467's line; back online after that, «You’re back online. Try
    again rejoins the call.»). The server's own refusal is said when the person presses Try again, as before.
- **Meanwhile, Leave stays.** The dock and the header's mini dock show Leave beside «Joining…» (or the offline Try
  again) while the try waits or runs. Leave stops it: the room rests at «Join the room», with no note and no recap (the
  drop ended the call; the press only declines the way back), and the focus goes to Join. Every quiet leave stops it
  the same way (`useLeave`). The places' bar keeps showing the call while it comes back (the room reports it as on),
  so the shell stays mounted out of sight and the bar's Leave does the same; when the try fails, the call ends there
  and the toast says the lost call, as today.
- **A join overtaken before it connects asks for nothing more** (`openRoom`): once its token arrives, a join that is
  no longer the current one stops before LiveKit, so a Leave during the try never flashes this person into the room.
- **LiveKit's policy is pinned** (`livekit-room.ts`): `reconnectPolicy: new DefaultReconnectPolicy(RECONNECT_DELAYS_MS)`
  with the defaults written out, so an SDK upgrade can't change how long the room waits before `dropped` without a
  diff here. The unit check holds the window above the policy's longest wait.
- **The chat's foot** under the offline waiting line steps aside as it does under #467's (`offlineBarWords`).

## Checks (written first)

- **Unit** (`call-rejoin.test.ts`): `rejoinPlan` for each end, online and offline, inside and past the window, with a
  try in the last two minutes or not; `stillSeen` moves while the page runs and stays after a longer gap; the lines;
  the policy's longest wait under the window. `Rejoin` with fake ports: one try now, `trying` then `back` then nothing
  after 4 s; a failed try says the dropped words once and tries no more; offline, nothing until `online`, then one try;
  past the window, `online` brings nothing; the window closing offline ends the wait; Leave (`stop`) during a try or a
  wait ends it, and a late answer changes nothing; a second drop right after a try brings none.
  (`call-end.test.ts`): the three lines are polite. (`discussion-view.test.ts`): under the offline waiting line, as
  under #467's, the bar adds nothing of its own and a held message says only that it isn't confirmed.
- **Browser** (`room.spec.ts`, `room.html?call=on`; a new lever `holdToken(on)` keeps room tokens until let go):
  - `drop()` → back in without a press within 10 s: one more token and one more `connect`, the polite line there
    before says «Reconnected.», no alert, no recap; the line empties after.
  - tokens held, `drop()` → «Connection lost. Rejoining the call…» politely, «Joining…» and Leave in the dock; Leave →
    tokens let go: no `connect`, «Join the room», no note, the focus on Join.
  - `failToken()`, `drop()` → «You were disconnected from the room.» with Try again; one token, and still one after a
    wait; Try again gets in.
  - `drop()`, back in, `drop()` again → the lost call's words and Try again, one token in all.
  - `elsewhere`, `removed`, `closed` → no token.
  - offline, `drop()` → the waiting line from the polite line, no alert; Try again asks for nothing; back online → in
    without a press, one `connect`, «Reconnected.» from the same line. The header's mini dock says the waiting line.
  - The checks that test the lost call's own state (its words in the chat's foot and the panels, Chat with Sophia after
    it, a held message, no recap, captions and the mode's hello after Try again, #467's lines after a failed rejoin)
    first make the one try fail (`failToken()`), the state a person reaches when the room can't be reached again.
- **Browser, out of sight** (`app-auth.spec.ts`, from Home): a drop comes back with one token, the places' bar keeps
  the call and no toast says it ended; tokens held, the bar's Leave stops the try, says «You left Fixture project.»,
  and nothing joins once the token is let go.

## Found while building

- **The function-size limit.** `useRoomConnection` stayed under 60 lines by moving `outOfCall` out as `outOfCallFor`
  (unchanged but for the end telling the try). The new argument to `openRoom` took `joinConnection` to 61, so its
  callbacks moved out, unchanged, as `heardWhile`.
- **A pressed Leave during a try returned early** (`useLeave` ignores a press with no call, so a slow disconnect isn't
  ended twice), and the try's join would have landed. A leave that stops a try now always ends its join, and counts no
  press: no recap. Only the room's own Leave sends a press, and it isn't shown during a try; the palette's could.
- **Out of sight, checked first and controlled** (`app-auth.spec.ts`, the app's own page, a new `appFixture.drop()`
  that loads the fake LiveKit only when called, so a page at rest still loads none): built without the line in
  `useReportCall`, the bar's pill went and the bar's Leave couldn't be found, while the room token count still rose by
  one: the try began before the shell unmounted, the wasted token the measurement predicted.
- **Red before the fix, for the right reasons:** the eight new or changed `BASE-03` checks failed on the missing words,
  the missing token (expected 2, received 1) and the missing connection; the two `@phone` checks failed because no try
  took the one refused token, so the person's own Try again met it.

## Limits

- Out of sight, the places' bar keeps the call during the try but says nothing of it (its note is the devices' alert);
  back in, nothing is said there, and a failed try is said by the toast.

- A long outage past the window (a black-holed network where each of LiveKit's tries waits its full 15 s) ends as
  today: the lost call and Try again.
- LiveKit leaves the room itself on `pagehide` and `freeze` (`CLIENT_INITIATED`), which reads as `dropped`. A frozen
  tab woken within two minutes rejoins; a page restored from the back-forward cache within two minutes would too.
  Neither is told apart from a lost link here.
- The camera comes back off, as after Try again. Someone who joined from a phone during LiveKit's minute of tries is
  taken out of the call there when this tab's try lands (`elsewhere`, which never tries back, so there is no
  ping-pong).
- The two-minute window can't be shown in the browser checks without a clock under the fixture; the unit checks hold
  it.
