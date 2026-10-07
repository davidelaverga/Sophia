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

## Part 2, as built

- `dayOf`, `clock`, `when`, `dayLabel` (both ways from today: «Yesterday», «Tomorrow», a weekday within the week) and
  `dayInSentence` (only «today», «yesterday», «tomorrow» lose the capital: the passkeys said «used monday»).
- **Moved onto them:**
  - Knowledge: a card's date, its description's edit, carried in;
  - a report's history (the year only when it isn't this year, no longer always);
  - the Slack update's day;
  - a link's last day;
  - Conversations' «Oct 6, 09:12»;
  - Updates and search;
  - what came after a meeting;
  - Personal's day labels, clock and «today at 16:00»;
  - the passkeys (`app/days-ago.ts` goes: «3 days ago» becomes the weekday);
  - a research card's «asked 09:12» (no longer «09:12 AM»).
- **Left as they are:** a session's range («Today · 10:00 – 11:00», «Thu, Oct 1 · …») and Personal's long date line
  («Tuesday, October 6») already follow these rules.
- **`now` is passed in.** Where a view has no ticking clock yet, it passes `Date.now()` at the call, for part 3 to
  replace.
- **Personal never says a past day is ahead:** a time a little past now (another device's clock) is today.

## Part 3, as built

- `app/use-now.ts`: `useNow(every = 60 s)` on `useSyncExternalStore`. One interval a pace, shared by every view that
  reads it, running only while one does; read again after a pause, it starts from the time it is read. A view that
  joins a running clock reads its last tick (at most one pace old).
- **The six clocks of their own go:** Work's pulse (15 s), Places (20 s), the lobby, the join page and the room (30 s),
  a research card (a minute, now whether or not it runs). Their paces are kept.
- **Views whose relative words never moved now do:** the calendar's «starts in» and its lines, the invitation lists'
  «ago», the passkeys, Personal's memory, Work's cards and order.
- **Left as they are:**
  - one-second countdowns with their own logic (sign-in's «Send again in 30 s», the join page's);
  - resources' `useClock`, which moves a time it was given;
  - `Date.now()` for absolute dates, which only decides whether to show the year.

## Checks (written first)

- **Unit** (`time-words.test.ts`): each rule above at its edges (59 s, 60 s, 59 min, 23 h 59 min, 24 h; 1 s with
  seconds); rounding down for the past, to the nearest for the future.
- **Existing unit and browser checks** that read these words change with them, and only where a word changes:
  - Updates and the recap's head «38 minutes» → «38 min»; «You joined 1 hour 30 minutes in.» → «… 1 h 30 min in.»;
  - resources «2 d ago» → «2 days ago», «Offline · 26 h» → «Offline · 1 day», «resets in 4 d» → «resets in 4 days»;
  - Work's pulse «45s ago» → «45 s ago», and after an hour «2 h ago» rather than a 12-hour clock;
  - a review asked under a second ago is «just now», not «0 s ago».
- **Mutants** with a control.
