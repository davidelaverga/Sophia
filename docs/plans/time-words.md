# Time words: one way to say when

> 2026-10-07 · Luis: «unificación de time words». Measured on main `aa5065c`.

## The gap, measured

About 20 places turn a timestamp into words, each its own way:

- **«ago», 5 implementations** (access, resources ×2, Work's pulse, passkeys), plus a sixth without «ago» (the lobby).
  Side by side: «45s ago» and «45 s ago»; «2 d ago» and «2 days ago»; «36 h ago» where another says «1 day ago»;
  90 seconds read «1 min ago» in one place (rounded down) and «2 min ago» in another (rounded).
- **Durations, 4:** Updates says «38 minutes», a research card «38 min», resources «~2 d».
- **Countdowns, 3:** «starts in 2 days» and «in 4 d».
- **Absolute dates and clocks, about 12:** some follow the browser's locale («6 oct, 09:12» in a Spanish browser,
  beside Personal's fixed «Monday»), two show a 12-hour clock («09:12 AM») where the rest show 24 hours, and the year
  shows always, never, or only when it isn't this year.
- **The clock:** six ticking hooks of their own (15 s to 60 s), and about ten views that read the clock while
  rendering and never move again («starts in 12 min» stays).

## What changes

One module, `app/time-words.ts`: pure functions that take `now`, in English with a 24-hour clock (the Studio's
language), in the viewer's own time zone.

| Words                                            | For                          | Rules                                                                                                                                     |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ago(at, now)`                                   | when something happened      | «just now» under a minute; «12 min ago»; «3 h ago» under a day; «1 day ago», «3 days ago». Rounded down: never more time than has passed. |
| `ago(at, now, { seconds: true })`                | live readings that tick fast | as above, with «just now» under a second and «40 s ago» under a minute                                                                    |
| `lasted(ms)`                                     | how long it took (the past)  | «under a minute», «38 min», «1 h 12 min», «3 h», then «1 day», «2 days»; rounded down                                                     |
| `roughly(ms)`                                    | how long, in a tight place   | its largest unit, rounded down: «under a minute», «20 min», «3 h», «2 days»                                                               |
| `about(ms)`                                      | an estimate                  | «12 min», «36 h», «3 days»: to the nearest, at least «1 min», in hours up to two days (a reset in 36 h matters to the hour)               |
| `inTime(at, now)`                                | how long until               | «in a moment» under a minute, then `about`: «in 12 min», «in 36 h», «in 3 days»                                                           |
| `dayOf(at, now)` · `clock(at)` · `when(at, now)` | a date, a time, both         | «Oct 6» (the year only when it isn't this year), «09:12», «Oct 6, 09:12»                                                                  |
| `dayLabel(at, now)`                              | a day in a list              | «Today», «Yesterday», «Monday» within the week, then `dayOf`                                                                              |

Units are always short and spaced (`s`, `min`, `h`) except days, which are spelled («1 day», «2 days»).

**In three PRs,** one concern each:

1. **Relative words** (this one): `ago`, `lasted`, `about`, `inTime`, and every «ago», duration and countdown moved
   onto them: access, resources (with pace and history), Work's pulse, the lobby, a research card, Updates, the recap's
   head, «You joined … in», Personal's «starts in».
2. **Dates and clocks:** `dayOf`, `clock`, `when`, `dayLabel`, and every absolute format moved onto them (no
   browser-locale dates, no 12-hour clocks). Calendar-day words go here too: the passkeys' «Today», «3 days ago»
   (`app/days-ago.ts`), Personal's day labels, a research card's «asked 09:12 AM».
3. **One clock:** a single `useNow` for the views that say relative time, in place of the six hooks and the reads
   while rendering.

## Checks (written first)

- **Unit** (`time-words.test.ts`): each rule above at its edges (59 s, 60 s, 59 min, 23 h 59 min, 24 h; 1 s with
  seconds); rounding down for the past, to the nearest for the future.
- **Existing unit and browser checks** that read these words change with them, and only where a word changes:
  - Updates and the recap's head «38 minutes» → «38 min»; «You joined 1 hour 30 minutes in.» → «… 1 h 30 min in.»;
  - resources «2 d ago» → «2 days ago», «Offline · 26 h» → «Offline · 1 day», «resets in 4 d» → «resets in 4 days»;
  - Work's pulse «45s ago» → «45 s ago», and after an hour «2 h ago» rather than a 12-hour clock;
  - a review asked under a second ago is «just now», not «0 s ago».
- **Mutants** with a control.
