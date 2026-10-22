# Personal's checks read the same day at any hour of the run

> 2026-10-20 · The midnight family of CI flakes, after `ci-personal-day-pill-flakes.md` (#473): its Limits say the
> personal fixture still reads the wall clock when no `at` is given, so a check needing «Today» can meet midnight again.
> Luis 2026-10-20: «Procede con el próximo lote» and «arregla tú los de Davide»; earlier «Lo que no se mide, no se
> puede mejorar». Tests only; nothing the person sees changes.

## Measured

- **The fixture's clock is the browser's unless the address says `at=HH:MM`** (`fixtures/personal.tsx`, `NOW`), and
  everything on the page is dated from it: today's turns 14, 13, 6 and 5 minutes back, yesterday's a day and 39 to 42
  minutes back, notes and memories whole days back, the ready projects' sessions ahead. `PersonalSpace` takes `now` from
  the fixture: the day dividers, «Where you began», the arrival state and her light (`lightOf`, `data-hour`) all read
  `NOW`. 27 specs load `personal.html`. #438 and #473 pinned the checks that failed at `at=12:00` (ten addresses in
  `personal-day-pill`, `personal-day-menu`, `menu-scale`, `control-heights`, `personal-first-talk`, `personal.spec`);
  21 specs load it only without an hour, and most of `personal.spec` too.
- **Three windows where a check with no hour sees another talk** (from the code; the new check below proves each):
  - 00:00 to 00:04: today's turns fall on yesterday. No «Today»; the new-day state (the mood presses, the day pill
    naming yesterday).
  - 00:05 to 00:14: «Today» stands over the last turn or two only.
  - 00:00 to 00:42: yesterday's turns fall two days back, so the first divider names a weekday, not «Yesterday».
  - And by the hour: from 22:00 to 05:00 her light is the night's (the field asks «Still up?»), 05:00 to 11:00 the
    morning's, 18:00 to 22:00 the evening's. A contrast or ink check measures whichever light the runner's hour gives.
- **No check on main fails in those windows today.** A sweep with a temporary lever (never committed: an inline script
  in `personal.html`, `room.html` and `home.html` that starts the browser's whole `Date` at a set local time, so the
  fixture and the product both read it; a probe at 00:03 read «Sunday · Where you began», «Yesterday», `night`), at
  00:00, 00:03, 00:06, 00:10, 00:13, 00:30, 23:59 and 2027-01-01 00:03, over every spec that loads `personal.html`
  (desktop and phone; in the specs that sweep many pages, the rows on Personal), plus `message-links`, `chat-times` and
  `home-needs`: 222 of 222 at each, but one. At 23:59 «at night the field asks “Still up?”» found no field once (its
  address pins `at=23:30`); at 23:59 again it passed 20 of 20 with its light neighbour, so the machine, not the clock.
  The checks that need «Today» are the ones #438 and #473 pinned; the rest happen not to look at the days. The exposure
  is for the next check that does, as each pinned one did before it failed in CI.
- **The product's own reads of the real clock on this page are by the day, or answered by nothing.** `Memory`
  (`useNow`) and `NotesPanel` (`Date.now()`) say a day (`dayLabel`, `dayOf`); `welcomeDue` (`new Date()`) asks the
  fixture's `resume`, which answers a receipt and shows nothing; the turns and notes written during a check are stamped
  `new Date()`. No «12 min ago» on the page reads the real clock against the fixture's records. So a fixture clock at
  noon of the real day gives every real-clock read the same day it gives now: the concern #473 left it on («how long
  ago» would move by hours) does not hold on this page.
- **The other fixtures are not exposed.** `chat-times` dates its two days by the calendar (`room.tsx`,
  `overTwoDays`: yesterday 17:40, today 08:10) and the room says a future time's day as today's (`dayLabel`, `past`);
  `home-needs`' «Yesterday» is the need's written `detail`, not a date. Both passed at every swept minute.

## What changes

- **Given no `at`, the fixture's clock stands at noon today** (`at` defaults to `12:00`). Every check that loads
  `personal.html`, now and later, sees the same talk, days and light at any hour of the run. `at=HH:MM` still sets the
  hour; the demo (`?demo=1`) shows noon too.
- **A check, written first** (`e2e/personal-any-hour.spec.ts`): with the page's clock fixed (`page.clock`, as
  `menu-scale` does) just after midnight, at a quarter past, at half past, a minute before midnight and as a year
  begins, the talk loaded with no hour shows «Yesterday · Where you began» and «Today», in the day's light.
- The `at=12:00` pins stay: they say what their checks need.

## Checks

- Red: the new check before the fix, 5 of 5, each on the window it stands for: «Sunday · Where you began»,
  «Yesterday» for the two days (00:03, and 00:13 with one more), «Sunday · Where you began» (00:30), «Received:
  "night"» (23:59), «Wednesday · Where you began», «Yesterday» (2027-01-01 00:03).
- Green: the new check after it, 15 of 15 (three times each); the same sweep after it with the new check added, 227 of
  227 at each of the eight minutes and once without the lever (evening, local); whole-repo `oxlint --type-aware`,
  `tsc --noEmit`, Prettier on the two files.
- One test-first pair: the check (`7cefaa1b1`), then the fixture's default (`d1bbbf367`).

## Limits

- A check whose page lives across midnight still meets it: the fixture's clock stays on the day it loaded, the real
  clock moves on. Seconds a day, as before.
- Her night, morning and evening light are measured only by the checks that ask for them by hour (`personal.spec`'s
  «moments»); the contrast and ink checks measure the day's. Before, they measured whichever light CI's hour gave.
