# The personal days' menu reads the same at any hour

> 2026-10-15 · CI failed #334 at 00:30 UTC on `menu-scale.spec.ts`'s days' menu: «Yesterday» wasn't offered. Luis:
> «Arregla también los dos pendientes del follow-up».

## What was measured

- The fixture builds its talk around its clock (`fixtures/personal.tsx`, `NOW`). Unpinned, that is now: yesterday's
  talk sits a day and 42 minutes back (`ago(BEFORE + 42)`). From 00:00 to 00:42 that is the day before yesterday, so
  the menu has no «Yesterday» row, and the test fails.
- The page labels the days by the browser's clock, so nothing in the app is wrong: the fixture's talk moved.

## What changes

- `menu-scale.spec.ts` sets the browser's clock to half past midnight (`page.clock.setFixedTime`) and pins the
  fixture's talk at noon (`at=12:00`). The days read «Yesterday» and «Today» at any hour, and the test covers the hour
  that failed.
- `personal-day-menu.spec.ts`, which counts on the same two days, pins `at=12:00` too.

## Checks

- Written first and failing: at half past midnight, unpinned, the test failed exactly as CI did («Yesterday» not
  found).
- After the change: `menu-scale.spec.ts`, `personal-day-menu.spec.ts` and `personal.spec.ts` pass 106/106 locally.
