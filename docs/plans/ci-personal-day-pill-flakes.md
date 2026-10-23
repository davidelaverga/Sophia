# Personal's tests read the same just after midnight

> 2026-10-19 · CI flakes in `personal-day-pill.spec.ts` (old lines 16, 32 and 78: «the day pill steps aside…», «the pill
> stepped aside leaves the accessibility tree…», «the days' menu closed with Escape…»; the last on 2026-10-17 23:46 UTC,
> run 39080296257). Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de Davide»; earlier «Lo que no se
> mide, no se puede mejorar». Tests only; nothing the person sees changes.

## Measured

- **Every failure ran in the quarter hour after midnight UTC.** All 176 failed `ci.yml` runs since 10-12, read with
  `gh run view --log-failed`: the three tests failed in five runs, and every failing test ran between 00:03 and
  00:13 UTC (38975614900 at 00:03, 38976088276 and 38978036610 at 00:12, 39080296257 at 00:06, 39080233504 at 00:10).
  The runs that reached them at 00:19 (10-15) and 00:22 (10-16) passed them. Not an animation, a scroll or focus race.
- **The cause, in the code:** the personal fixture dates today's turns 14, 13 and 6 minutes before its clock, and its
  clock is the browser's (UTC in CI) unless the address says `at=HH:MM` (`fixtures/personal.tsx`, `NOW`). Before 00:06
  all three fall on yesterday and there is no «Today» divider: the 00:03 run's four failures all read «no Today
  divider». From 00:06 to 00:14 the divider stands over the last turn or two, at the very end of the list. A probe at
  `at=00:06` and `at=00:13` found the list already scrolled to its end (`scrollTop` = max): asked to put the divider
  20 px or −40 px under the top, it stays 108 px (00:06) or 32 px (00:13) down. So the pill never steps aside, or
  never comes back.
- **Already fixed on main for these three:** `01252cb16` («the day pill's checks stand the fixture's clock at noon»,
  #438, merged 2026-10-18 04:16 UTC) loads the spec at `at=12:00`. No failure of the spec since. Reproduced here: the
  spec at `at=00:03` fails 4 of 4 with «no Today divider» (as the 00:03 run), at `at=00:06` and `at=00:08` the same three
  fail on the crowding (as the other runs; which of the two checks fails depends on the minute and the fonts).
- **The same cause, still open, in four neighbours.** The 00:03 run also failed `personal-first-talk` «a conversation
  in progress still rests on the field» and `personal.spec` «a short conversation rests on the field» and «Ctrl F
  finds…». With the fixture's clock made 00:04 when no `at` is given (a local lever, not committed), every spec that
  loads `personal.html` was run: those three fail again, and so does `control-heights` «on personal, every single-line
  press stands on 24, 28, 32 or 36 px». Before 00:06 nothing has been said today, so Personal shows its new-day state:
  the day pill names Saturday, «Light today», «Steady», «Heavy today» sit under the conversation, the last turn stands
  165 px above the field, the list scrolls, and a find's current mark is off screen. The tests describe a conversation
  in progress today; at that hour there is none.

## What changes

- The four neighbours load the fixture at noon (`at=12:00`), as the day pill's spec, the days' menu spec and
  `menu-scale` already do. What each asserts is unchanged.

## Checks

- Red: the lever at 00:04 fails the four, each on the assertion CI quoted («Received: 165.5», ≤ 64; a gap of null;
  «viewport ratio 0»; the pill and three mood presses off the scale).
- Green: with the lever at 00:04, the four and the pill's spec, 5 of 5 each. Without it: the four
  `--repeat-each 20` (80/80), the day pill's spec `--repeat-each 20` (80/80), and the five specs whole, desktop and
  phone (123/123). The phone project runs only `@phone` tests, none of the day pill's.
- One commit, not a pair: only test addresses change, and the red is those tests with the clock set, run and quoted.

## After review (P2)

- At noon the whole talk fits, so «Ctrl F finds…»'s in-view check proves nothing there. A new check in a talk that
  scrolls (480 px high; a short phone too) found Find's match left out of sight: its smooth `scrollIntoView` was undone
  by the list's end-keeping as the finder's count resized the list, and the same match stayed current while typing.
  Find now brings the match at once (`Find.tsx`), test first: red 3 of 3 on a wide screen, green 20 of 20.
- A `control-heights` row at 00:04 would fail the scale (the pill's 26 px, the mood presses' 44 px): left in Limits.

## Limits

- The fixture still reads the wall clock when no `at` is given; a new test that needs «Today» can meet midnight again.
  Making noon the fixture's default was weighed and left: the product reads the real clock for «how long ago», so a
  fixed fixture clock would move other tests' texts by hours at most times of day.
- The new-day state is measured nowhere: the day pill's 26 px is off the press scale, and the mood presses are 44 px.
  Whether those are meant is a question for the kit, outside this change.
