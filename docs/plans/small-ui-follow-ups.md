# Two small follow-ups: a refused copy's link at rest, a held goal's tips in the window

> 2026-10-18 · Codex's P2s on #441 and #421, from Luis's queue.

## What was measured

- **The refused copy's link** (#441): the panel that hands a refused «Copy link» over (`.copy-link-hand`) runs
  `arrive` under `prefers-reduced-motion: reduce`. Resources' reduced-motion list comes before the panel's own rule, so
  naming the panel there would not stop it: at the same specificity, the later `animation: arrive` wins.
- **A held goal's tips** (#421): held, a goal offers Resume then Stop, and their tips aligned to their ends. Only a goal
  over its plan, on a screen wider than 760 px, keeps its controls at the content's end (top right, `board.css`). A goal
  without a plan has them at the content's start. On `/work.html?goals=9` at 1280 px the page's gutter is 38.4 px, and
  from Geist's widths (12 px at 500 for a tip, 13 px for a text press) Resume's tip starts about 129 px left of the
  window, Stop's about 22 px and Retire remaining sessions' (a completed goal, for an admin) about 247 px. The fit
  suite's page-width check can't see it: a box past the left edge doesn't make the page wider.
- **Not on a phone**: the finding places the case on a phone, but `theme.css` hides tips up to 760 px, and without
  hover. There, no goal control's tip ever shows.

## What changes

- `.copy-link-hand` gets its own reduced-motion override, after its rule: it is there at once.
- `GoalCard` tells `WorkControls` where its row stands: at the end over a plan, else at the start. From the start
  every tip hangs from its control's start; from the end, Request review centres its tip and the others align to their
  ends, as before. `ConfirmButton`'s `tipAlign` takes `start` too.

## Checks, written first

- `e2e/goals-overview.spec.ts`, «with less motion asked for, a refused «Copy link» hands its link over without
  moving»: the panel's `animation-name` is `none` (main: `arrive`).
- `e2e/type-rem-fit.spec.ts`, «fit · at 125% / 150%, a held goal's Resume keeps its tip in the window, as every goal
  control does» (a computer's check): on `/work.html?goals=9` Resume's tip shows under the pointer, and every goal
  control's tip lies inside the window (main: Resume's, Stop's and Retire's past its left edge).

## Limits

- Playwright wasn't run here (the machine guard); the numbers above come from the CSS and the font's advance widths,
  without kerning, not from a capture.
- No unit test: one is a cascade's order, the other a layout.
- Retire remaining sessions' tip is about 441 px wide. From a row's start it fits any window that shows tips, but a
  content column narrower than that (a report open beside Tasks) wasn't measured.
