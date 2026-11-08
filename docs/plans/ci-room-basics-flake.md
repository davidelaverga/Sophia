# The dock's call clock reads the call's time, however slow the runner

> 2026-10-26 · The CI flake `room-basics.spec.ts:18` («basics · the dock says how long the call has run») failed on
> main's CI for the #482 merge (run 40320260093, job 121563091283, «The room in Chromium, part 2 of 3», `db56fe0e1`;
> the other red job is the gate over the three parts) and left main red for about 10 h (the session's reliability
> report, `ci-2026-10-26/reliability.md`: 1 failure, in the last 48 h). Its spec is from Luis's QoL queue
> (`room-basics.md`). Luis 2026-10-26: «Procede con el lote de los tres flakes», earlier «arregla tú los de Davide»,
> and «Lo que no se mide, no se puede mejorar». Tests only; nothing the person sees changes.

## Measured

- **The failing line** (`room-basics.spec.ts:24`), the same in both of the job's reports:
  `expect(locator).toHaveText(expected)`, `Expected: "1:05"`, `Received: "1:10"`. The timer read `1:06` on its first
  five polls, then `1:07`, `1:08`, `1:09`, `1:10`, one a second, over the 5 s timeout. The product counted right; the
  clock it read kept running.
- **The cause, in the test:** `page.clock.install()` alone starts the page's clock where the real one is and lets it
  run in real time. The call goes live at `Date.now()` (`useJoin`'s `onLive`), the dock reads 0:00, and the test then
  jumps 65 s. Whatever real time passes between the call going live and the jump lands on the clock too: past a second
  (a busy runner, two workers), the dock reads 1:06 after the jump, then keeps counting. Locally it passes because that
  gap stays under a second.
- **The product is right:** `CallClock` shows `now - since`, both from `Date.now()`; `useNow(1000)` moves `now` once a
  second, and `fastForward` fires its interval once, at the new time.
- **What else runs on the page's clock:** the room joins on open on a `setTimeout(0)` of its own (`useJoinOnOpen`), so
  a clock stopped before the page opens holds the join until the test lets it go.

## What changes

- **A slow-runner case, written first:** the same steps with 1.5 s of the runner's own time between 0:00 and the jump
  (`callClock(page, 1500)`). With the clock as it is, it fails as CI did: 1:06, then counting on.
- **The page's clock stops before the page opens** (`pauseAt`, a second ahead of where `install` put it), so it moves
  only as the test moves it. The test lets the join-on-open timer go (`runFor(1)`), waits for «Leave the room» (the call
  is live), then checks 0:00, jumps 65 s and checks 1:05 and the words, as before. Both cases use it. Since replaced
  by a fixed time: see «After the independent review» below.
- What it asserts stays: 0:00, exactly 1:05 after 65 s, «In the call for 1 minute». No retry, no longer timeout.

## Checks

- `test: … (failing)`: the slow case with the current clock. Red for the right reason: `Expected: "1:05"`,
  `Received: "1:10"`, first `1:06`, as on CI.
- The fix: green through the guard, both clock cases `-Repeat 20`, then the whole spec `-Repeat 20`, and the room
  neighbours that also install the clock (`host-controls`, `room-captions`).

## Result

- Red: the slow case failed twice before the fix, `Expected: "1:05"`, `Received: "1:10"`, first `1:06` (CI's log).
- Green: both clock cases 40/40 and the whole spec 80/80 with `-Repeat 20`; with `host-controls` and `room-captions`,
  40/40. A probe without `runFor(1)` confirmed the join waits on its timer: «Leave the room» never shows.

## After the independent review (2026-11-08)

- **The review's P2:** a clock stopped before the page opens also stops every timer the page's data waits on. A project
  that loads after the test let the join-on-open timer go never joins, so «Leave the room» never shows. The steps above
  only passed because the fixture's project loads before `runFor(1)`.
- **Written first and failing** (`7080a8740`): a case that holds the project's snapshot (`&snapshot=hold`) and lets it
  through after that point. Red 3 of 3, «Leave the room» never visible (`pw-logs/b13-rb-late-red.txt`).
- **The fix** (`dd014d24f`): `page.clock.setFixedTime(at)` before the page opens, then `setFixedTime(at + 65_000)` in
  place of the jump. It fixes `Date` and leaves timers running, so the join and the project's data come through
  however late, and the runner's seconds still never reach the call's time. `install`, `pauseAt` and `runFor` are gone
  from the helper. The assertions are unchanged: 0:00, exactly 1:05, «In the call for 1 minute».
- **Green:** the whole spec through the guard with `-Repeat 5`, 25/25 (`pw-logs/b13-room-basics.txt`), the three clock
  cases among them.
