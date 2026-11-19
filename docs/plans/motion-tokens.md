# One motion vocabulary

> 2026-11-19 · informe-30 §2.6 («a small set of motion tokens and a fence»). Studio only, CSS only. Nothing moves
> differently beyond rounding: a value moves at most ~40 ms or ~15 % toward its token; what would move further keeps
> its own number in the fence's list, with its reason.

## What was measured

- The Studio's sheets (`apps/studio/src/**/*.css`; `packages/ui` has no CSS) wrote **122** transition and animation
  items with their time or easing by hand (98 distinct), in six sheets: theme 31, personal 31, resources 29, board 13,
  plan 4, conversations 1. Some 40 different durations, from 140 ms to 48 s.
- The only motion tokens were `--ease`, `--fast` (140 ms, read 93 times) and `--base` (220 ms, read 60 times).
- Easings: `--ease` almost everywhere; `ease-in-out` written by hand on 13 loops; `cubic-bezier(0.2, 0, 0, 1)` (the
  value of `--ease`) written out twice, in the two view-transition rules; `ease` once (the glow's colour turn).
- `public/entry.css`, the opening, has its own 20-odd timings: it plays from `index.html` before the app's sheets
  load, so no theme token reaches it. It stays as it is, outside the fence.

## The tokens (theme.css `:root`)

| Token                  | Value                            | Role                                                       |
| ---------------------- | -------------------------------- | ---------------------------------------------------------- |
| `--ease`               | `cubic-bezier(0.2, 0, 0, 1)`     | every one-shot (unchanged)                                 |
| `--ease-in-out`        | `ease-in-out`                    | the ambient loops that breathe                             |
| `linear`               | (keyword, not a token)           | spinners, glints, a toast's clock, a drift                 |
| `--motion-fast`        | 140 ms (was `--fast`)            | a state: hover, colour, a small turn                       |
| `--motion-base`        | 220 ms (was `--base`)            | a small piece: a veil, a slide, a sheet on the phone       |
| `--motion-medium`      | 300 ms                           | a compact arrival: a popover, a row, a toast               |
| `--motion-slow`        | 400 ms                           | a panel or a section arriving                              |
| `--motion-slower`      | 500 ms                           | a large arrival: a tile, a lane, a drawn thread            |
| `--motion-long`        | 600 ms                           | a place's entrance, a hop                                  |
| `--motion-flourish`    | 900 ms                           | a one-off flourish: an ignition, a birth   |
| `--motion-sweep`       | 1.4 s                            | a long one-shot sweep (`ResourceTile.tsx` mirrors 1400 ms) |
| `--motion-pulse`       | 1.6 s                            | the alive pulse: looking, listening, loading               |
| `--motion-breath`      | 2.4 s                            | a waiting mark's breath                                    |
| `--motion-breath-slow` | 2.8 s                            | a slower breath: the glow forming, a question's light      |

`--fast` and `--base` are gone: their 153 reads now say `--motion-fast` and `--motion-base` (same values), so there is
one name per step.

## Mapping (old → token)

| Old    | Token      | Shift             | Items | Where                                                               |
| ------ | ---------- | ----------------- | ----: | ------------------------------------------------------------------- |
| 140ms  | fast       | 0                 |     4 | theme (the toggle's border/background/transform), personal opacity  |
| 0.16s  | fast       | −20 ms            |     2 | theme background, text-decoration-color                             |
| 200ms  | base       | +20 ms            |     3 | personal `ps-arrive`                                                |
| 220ms  | base       | 0                 |     1 | personal `ps-arrive`                                                |
| 240ms  | base       | −20 ms            |     1 | personal `ps-sheet-up`                                              |
| 0.25s  | base       | −30 ms            |     2 | resources, board `arrive`                                           |
| 260ms  | base       | −40 ms            |     3 | personal `ps-arrive`, `ps-from-edge`                                |
| 280ms  | medium     | +20 ms            |     4 | personal `ps-arrive`, resources view-transition group               |
| 0.3s   | medium     | 0                 |     9 | theme `--gc-swirl`, `arrive` (theme, resources, plan)               |
| 320ms  | medium     | −20 ms            |     2 | personal transform                                                  |
| 0.36s  | slow       | +40 ms            |     1 | theme `.arrive`                                                     |
| 0.4s   | slow       | 0                 |    13 | `arrive`, `rise` (theme, resources, board, plan)                    |
| 0.42s  | slow       | −20 ms            |     2 | board transform, width                                              |
| 0.45s  | slow       | −50 ms (−11 %)    |     5 | theme `rise`, resources `logo-in`, board `arrive`, board VT group   |
| 460ms  | slower     | +40 ms            |     2 | personal transform, opacity                                         |
| 0.5s   | slower     | 0                 |     5 | `arrive`, width, `tile-in`, `thread-draw`                           |
| 520ms  | slower     | −20 ms            |     7 | personal `hw-in`                                                    |
| 0.6s   | long       | 0                 |     5 | theme glow transition, `buddy-hop` ×3, `task-look-up`               |
| 600ms  | long       | 0                 |     1 | personal text-shadow                                                |
| 620ms  | long       | −20 ms            |     2 | personal `hw-in`                                                    |
| 0.9s   | flourish   | 0                 |     2 | theme `ignite`, `made-born`                                         |
| 1.4s   | sweep      | 0                 |     3 | theme glow transition, `attention-sweep`, `tile-changed`            |
| 1.6s   | pulse      | 0                 |     5 | `sophia-looking`, `skeleton-light`, `conv-breathe`, `hw-listen`, `ps-who-breathe` |
| 2.4s   | breath     | 0                 |     7 | `gc-call`, `door-breathe`, `waiting-ping` ×3, `away-breathe`, `changed-breathe` |
| 2.8s   | breath-slow| 0                 |     2 | `gc-form`, `ask-light`                                              |

93 items moved to a token (plus the two literal `cubic-bezier(0.2, 0, 0, 1)` → `var(--ease)` and 13 `ease-in-out` →
`var(--ease-in-out)`). Loops keep their exact value; no item moves more than 50 ms (0.45 s → 0.4 s, −11 %; every
other shift is 40 ms or less). Attempt 1 had moved six one-shots 100–200 ms (1.6 s → 1.4 s, 700 ms → 600 ms,
0.8 s and 1 s → 0.9 s); review asked for their old values back, so they are listed below instead.

## What keeps its own number (the fence's list)

`apps/studio/src/app/motion.test.ts` `ALLOWED`, 27 entries:

- **Ambient loops, each its own feel:** the glow's drift 48 s, breath 6.5 s, thinking swirl 11 s; the threshold's
  breath 4.8 s; Personal's ambient light 7 s and 1.8 s while she speaks; the speaking bars 1 s; a spinner's turn
  0.9 s; the effort meter's glint 2.6 s, twinkle 1.8 s and 1.4 s, sparks 4 s, breath 1.2 s; the live ring's quicker
  ping 2 s; the dependency thread's spark 1.4 s.
- **One-shots whose length is what they say:** a toast's clock 8 s (`Toast.tsx` `SHOWN_MS`); a call reaction's float
  4 s; the padlock's pulse 1.2 s (+17 % to the sweep).
- **One-shots more than ~40 ms or ~15 % off the scale, at their old values:** Personal's line drawing in
  (`hw-draw`) 700 ms; the buddies' wave (`buddy-hello-left/right`) and the ultra effort's sweep 1.6 s; a meter
  filling (`meter-fill`) 0.8 s; the Umbral mark's light (`.umbral` filter) 1 s.
- **The glow's colour turn** eases on CSS `ease` (its duration is `--motion-sweep`).
- **Reduced motion:** `0.01s` (theme) and `1ms !important` (personal): next to nothing, so end events still fire.

## The fence

`motion.test.ts`, beside `states.test.ts` and `elevation.test.ts`, reads every sheet in `src/` and `public/` (the
opening excepted) and fails when:

1. a `transition`, `animation`, `transition-duration` or `animation-duration` item's duration (a shorthand's first
   time-like word: a literal, a `calc()` or any `var()` but an easing token; every item of a `-duration` longhand)
   is anything but zero or a bare `var(--motion-…)` the theme declares — so `var(--fast)`, `var(--motion-fast,
   999ms)`, `calc(300ms)` and a local `var(--dur)` are all caught — or an easing in it is anything but
   `var(--ease…)` or plain `linear` (`cubic-bezier()`, `steps()`, `linear()`, keyword eases), and the item is
   not listed;
2. a listed item is no longer written anywhere (the list can't go stale);
3. a transition or animation reads a custom property nothing declares: a `--motion-*` or `--ease*` one must be in
   `:root`; any other (`--d`, `--i`, `--lane-delay`) must be declared by a sheet or set by the Studio's code.

Fixture subtests pin these: `color var(--fast) var(--ease)` is flagged by (1) and (3). A branch that brings back
`var(--fast)` or `var(--base)` (renamed here) fails instead of snapping its transition to 0 s.

Delays (a shorthand's second time, `*-delay`, the staggers' `calc(var(--i) * 40ms)`) are choreography and stay out
of it. Red before the migration: all three subtests failed (122 hand-written items, 86 distinct not listed). Red
before attempt 2's checker: the two new fixture subtests and the stale-list subtest failed (`46029241a`).

## Out of scope

- JS-driven motion (`entry.ts`, `Threshold.tsx`, `note-flight.ts`, `usePlaceMotion.ts`): WAAPI choreographies with
  their own curves and lengths, none mirroring a CSS duration changed here.
- `prefers-reduced-motion` blocks are untouched: they still set `animation: none`, `transition: none` or the
  near-zero durations above.
