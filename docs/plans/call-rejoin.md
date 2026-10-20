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
- **A join overtaken before its token arrives goes no further** (`openRoom`): once the token is back, a join that is
  no longer the current one stops before LiveKit, so a Leave pressed while the try waits for its token never flashes
  this person into the room. (A Leave after the token, while LiveKit connects, still connects and leaves at once, as
  any overtaken join does: `CallFence.adopt`.)
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


## After the independent review (2026-10-20: one P1, two P2s, P3s)

Luis approved the three lines and the two-minute window with its sleep rule. Each finding below held when read against
the code; each was written first.

- **P1, the try could turn on a microphone that was off (real).** The try and Try again joined with no options, so
  the microphone came from this device's stored choice (`micOnJoin`), not from the call: an admin's mute (server-side,
  `rememberMic` never called), or «on» chosen in Settings or another tab while muted, brought the call back with the
  microphone on. Now the connection keeps the microphone as it was while the room was last connected
  (`micWas`, `livekit-room.ts`: LiveKit unpublishes the tracks before it says the call ended, so the end can't tell),
  and a `dropped` end makes it the next join's choice (`useJoin`'s `stand`, the slot a failed join's choices already
  use): the try and a later Try again both come back as the call was. Any other end clears it, so a plain Join goes by
  the person's choice. Checks: muted by the dock, then `sophia.mic.v1` set to «on», `drop()` → back in with no
  `microphone:on`; muted by an admin (a new lever, `fixture.mutedByHost()`), then a drop whose try fails and Try again
  → no `microphone:on`.
- **P2, the window was checked at the drop, not when the try connects (real).** LiveKit 2.22.3 leaves the room itself
  on `pagehide`, `beforeunload` and `freeze` (`CLIENT_INITIATED`), which read as `dropped` with a fresh «seen»; the
  token request could go out as the page froze and connect minutes later. Both closed: `onEnded` carries `selfLeft`
  (LiveKit left itself) and no try is made for it; and the try hands its join a gate (`still`) that `openRoom` asks
  right before LiveKit: the try at most 30 s old (`TRY_FRESH_MS`), the call still inside the window, no Leave since,
  no other tab in the call. Past it the join fails as a failed join, and the lost call is said with Try again.
  Checks: units for the gate; browser: `drop('dropped', true)` asks no token; a held token let go after the page's
  clock jumps ten minutes connects nothing and says the lost call.
- **P2, the try could take the call from where the person moved (real, seam #3).** Same browser: each room says on a
  BroadcastChannel (`call-tabs.ts`) when it holds the call; a drop makes no try while another tab holds one, a try
  under way stops at the gate, and an offline wait ends without a try if a tab joined meanwhile. A tab that vanished
  without saying so is still counted: the try then waits for the person. Checks: a second page in the same browser in
  the call → the first page's drop asks no token; once that page leaves, the next drop comes back.
- **P3s applied:** a beat counts only when the last came at most two beats before (`stillSeen`), so a minute of
  sleep or freezing can't be bridged by the next beat; a join that throws is a failed try; a Leave during the offline
  wait leaves the room at rest (`rest`), so an offline Join then says «You’re offline. Join once you’re back.»; back in
  with the focus on the try's Leave, the focus goes to the call's own Leave (`data-dock-key="leave"` on both); the
  fixture keeps tokens held twice; the «within 10 s» check also asks for the mode's hello, and a new check keeps a
  message begun for Sophia hers and unsent through a drop that comes back.


## After the second review (2026-10-20: one P1, one P2, P3s)

- **P1, a microphone muted during «Reconnecting…» came back on (real).** The room module kept the microphone only
  while LiveKit's room read connected, but livekit-client 2.22.3 mutes a published track at once and says so
  (`TrackMuted`) while it reconnects, so a mute then was missed and a drop brought the call back with the microphone
  on. Two closes: the join after a drop turns the microphone on only if both the call, as last seen, and this person's
  own choice since have it on (`micWas() && micOnJoin()`, which can never turn on what either has off); and the room's
  rule, now `mic-while-connected.ts`, hears a mute or unmute in any state but disconnected and reads the microphone
  again on `Reconnected` (a teardown that unpublishes outside a connected room still changes nothing). Checks: unit
  over a fake room (a mute in Reconnecting then Disconnected reads off; a teardown's unpublish doesn't; Reconnected
  reads again); the fixture keeps the microphone as strictly as the old rule did (`linkLost` freezes it), and the
  browser check mutes during «Reconnecting…», drops, and finds no `microphone:on`.
- **P2, a try left with Leave wrote the old microphone back (real).** The overtaken join's late answer set the next
  join's choices after Leave had cleared them, so a later «Join the room» came in with the microphone on though
  Settings said off. Only the join still current writes them now. Check: tokens held, drop, Leave, the token let go,
  Settings off, Join → no `microphone:on`.
- **P3s applied:** the tabs' claims carry the call they are about, its LiveKit room and the person (the token's
  subject, `scopeOf`), so another project's call or a guest's tab never blocks a try; a room says it is joining as
  well as in the call, and a try says so before it asks for its token; a join is asked once more right after it
  connects, before it becomes the call and its microphone starts, and is left at once if no longer wanted
  (`keptIfStill`); a try whose clock went back is stale; a try that fails with the focus on its Leave hands the focus
  to Try again; `call-tabs.ts` is a factory over its channel, with unit checks (claims and their scope, ask and answer,
  a tab going away, malformed messages, no BroadcastChannel). A held fixture token is answered as it would be when let
  go.
- **Not built, recorded:** a crashed tab's claim stays until that browser's tabs reload: the try then waits for the
  person (it errs towards never taking the call). Timestamped claims refreshed on the beat, or a short ask at the
  drop, would clear it; left for when it is seen.

## After the third review (2026-10-20: one P1, P3s)

- **P1, the cap on the microphone was read once, at the drop (real).** A dropped call's microphone was cut by this
  device's choice when the call dropped, then kept as is: «join with the microphone off» chosen during an offline wait,
  or before a Try again minutes later, was ignored, and the microphone came on though Join's tip said off. The drop
  now keeps the call's microphone marked `capped`, and each join that uses it turns the microphone on only if this
  device's choice is on as that join begins. Checks: drop offline with the microphone on, choose off, back online → no
  `microphone:on`; the same with Try again after a failed try.
- **P3s applied:** a try no longer wanted once LiveKit has connected is made quiet before it is left
  (`keptIfStill`'s `quiet`), so the disconnect LiveKit reports for that leave (CLIENT_INITIATED) is never taken for the
  call's end; the fixture now reports that disconnect on any leave, as LiveKit does, and can hold LiveKit's connect
  (`holdConnect`), and a check flips the try's gate while connect waits. A try that fails with no status move (a join
  held offline, none possible) clears its `joining` claim. A call seen live «later» than now is not recent. The fixture
  starts each connection, and each drop, with the link up.
- **Can't be spared by the check after connecting:** another tab of the same person already in that call is taken out
  by LiveKit as this one connects (a person is in a call once, DUPLICATE_IDENTITY). The checks before the token and
  before LiveKit are what spare it.
- **Transient:** the tabs' channel is `sophia.calls.v2` since the claims carry their call; a tab opened before the
  deploy speaks v1 and isn't heard until it reloads.

## After the fourth review (2026-10-20: no P1, no P2; three P3s)

- **Every carried microphone is capped as its join begins (pre-existing on main).** A join from the check that failed
  kept its microphone for Try again uncapped: with «join with the microphone off» chosen since, Try again turned it on
  while Join's tip said off. The cut now applies to any microphone carried to a join (a choice made before it, a failed
  join's, a dropped call's), and `capped` is gone. The check writes the choice with each press, so its own join is as
  chosen. Check: `device-check.spec.ts`, a check join that fails with the microphone on, «off» chosen, Try again → no
  `microphone:on`.
- **The join's open and its microphone have unit checks.** `openRoom` and the cut moved, unchanged, into
  `call-open.ts` over an injected LiveKit (useProjectRoom keeps the one import the fixtures replace). Each check fails
  against its mutant: without the quiet guard, the leave's end reaches the room; without the cut, «off» chosen since is
  ignored.
- The «left quietly» browser check reads only what was asked after the drop.

## After Codex's P2 on #475 (2026-10-20: a call that froze once was never seen live again)

> Source: `seguimientos-p2.md`, last entry (#475, `call-rejoin.ts:67`); Luis 2026-10-20: «Procede con el próximo
> lote».

- **Real, as read.** `stillSeen(seen, now)` moves «seen» only when `now - seen ≤ 10 s`, and compares every beat with
  that same `seen`: after one gap over 10 s (a tab frozen or throttled, a lid closed for a moment) no later beat can
  move it, so two minutes on, that call's drop never tries, however long it runs in the foreground afterwards. It
  fails safe, as before the branch, but the try is lost for the rest of the call.
- **What must still hold** (the first review's P3, kept by the second's): a gap is never bridged. A laptop that wakes
  from sleep keeps the call as old as it was before the lid closed, so the drop LiveKit reports about a minute later
  (`dropped` after its ~44–52 s of tries) makes no try once the call is more than two minutes old.
- **Why «compare with the previous beat» alone isn't enough.** On waking, the next beat comes 5 s after the first;
  counted as live, it would make the call fresh while LiveKit is still finding out that the link died in the sleep.
  LiveKit finds that out with its pong timer: the server's `pingTimeout` (15 s, with pings every 5 s, read from the
  join response of `livekit-server` v1.13.7 `--dev`; the repo sets neither) is long past due after any gap longer
  than it, so it fires as the page wakes and LiveKit starts reconnecting. (That this takes the room to «Reconnecting…»,
  where no beat runs, was wrong: see the review below.)
- **The rule.** Each beat is compared with the previous beat, not with «seen». A gap (over two beats, or a clock set
  back) starts a run and leaves «seen» where it was; once the run has lasted 30 s with every beat on time and LiveKit
  connected (`STEADY_MS`, twice that timeout), each beat is «seen» again. A call that goes live (a join, or LiveKit's
  own reconnect) is seen at once, as before: LiveKit itself said the link works. The state is `Liveness` (when seen,
  the last beat, when the run began), and `stillSeen` stays pure.
- **Checks, written first** (`call-rejoin.test.ts`): a page that froze for 30 s and then ran for three minutes tries
  on its drop (red now: no join); a page that wakes after an hour and whose beats stop 25 s later («Reconnecting…»)
  never tries on the drop 50 s on (green now; red against the previous-beat-only rule, run as a local mutant). With
  the fix, the pure rule's check takes the new shape: on time, one beat late, a gap kept, a run under 30 s kept,
  renewed at 30 s, a clock set back as a gap. No browser check: the fixture has no clock, and a run of beats past the
  window would take minutes of real time.

### After the independent review of this fix (2026-10-20: one P1)

- **P1, a woken laptop could still count as seen live (real, read in livekit-client 2.22.3).** The pong timeout calls
  `handleOnClose` → `handleDisconnect('signal')` → `attemptReconnect`. With the peer connections not `NEW` (LiveKit's
  reading stays `CONNECTED` through an ICE `disconnected`; only `failed` or `closed` move it) that is a *resume*:
  `EngineEvent.Resuming`, which the room turns into `ConnectionState.SignalReconnecting` and
  `RoomEvent.SignalReconnecting`, not `Reconnecting`. The room module hears only `RoomEvent.Reconnecting`, so the dock
  stays `live` and the beats run. A failed resume throws `SignalReconnectError`, which doesn't escalate to a full
  reconnect, so with no network every one of LiveKit's ten tries can be a resume while the dock reads `live`;
  `EngineEvent.Offline` (→ `Reconnecting`) comes only if a peer connection reaches `failed` while the signal is cut, a
  race with ICE's consent checks. So: an hour asleep, waking with no network, beats on time, «seen» renewed at 30 s,
  `dropped` 45–60 s later, an offline wait still inside the window, Wi-Fi back → a join nobody asked for.
- **The rule now.** A beat counts only while LiveKit reads the room `Connected` (`RoomConnection.connected()`, read
  from `room.state` at each beat): any other state (`SignalReconnecting`, `Reconnecting`) is a gap, so the run starts
  again and «seen» stays. A resume that succeeds ends in `Connected` (`EngineEvent.Resumed` → `RoomEvent.Reconnected`,
  which keeps the dock `live`, so it is not a `live()`): the run then lasts its 30 s again before the call is seen.
  The dock itself is unchanged: during a resume the media can still flow, and saying «Reconnecting…» then is for
  another change.
- **Checks, written first:** woken after an hour, 60 s of on-time beats while the room isn't connected, then
  `dropped` → no join (red now: one join); the pure rule: a beat while not connected starts the run again; a point
  at 29 999 ms into the run is still not seen (the review's P3). The fixture's connection says `connected` while its
  link is up.

## Limits

- Out of sight, the places' bar keeps the call during the try but says nothing of it (its note is the devices' alert);
  back in, nothing is said there, and a failed try is said by the toast.
- A black-holed network, where each of LiveKit's tries waits its full timeout, can reach `dropped` more than two
  minutes after the call was last seen live: then no try is made, and the lost call is said with Try again, as before
  this branch. It fails safe.
- A crashed tab's claim (call-tabs.ts) stays until this browser's tabs reload, so a try waits for the person: it errs
  towards never taking the call (the second review's optional point, not built).
- **Another device isn't seen** (review P2 b, not built): someone who joined from a phone while LiveKit was still
  trying is taken out of the call there when this tab's try lands (`elsewhere` there, which never tries back, so there
  is no ping-pong). Telling would need the room's own presence before the try: a follow-up for Davide's lane (the API
  listing the room's participants, asked before a try, which makes none while this identity is already in).
- A hidden tab whose timers run less often than every 10 s (a browser's heaviest background throttling) stops counting
  as seen live while it is throttled, so a drop then isn't tried; 30 s after its beats come on time again it counts
  once more (Codex's P2 on #475). Whether a page with a live call is throttled that hard wasn't observed here.
- Try again's tip describes this device's own microphone choice, while the join after a drop turns the microphone on
  only if both the call, as last seen, and that choice (read as the join begins) have it on: the tip can say «on»
  where the microphone comes back off, never the reverse.
- The camera comes back off, as after Try again.
- The two-minute window can't be shown in the browser checks without a clock under the fixture; the unit checks hold
  it.
