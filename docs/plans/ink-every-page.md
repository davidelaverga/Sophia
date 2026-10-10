# Every word at rest reads, on the work and resources views too

> 2026-10-09 · Luis: «Sigue con lo siguiente de la cola». The «$20» pass measured again on main: the contrast check
> (`ink.spec.ts`) covered five pages; on three of the others words read at 2.05:1 and 2.13:1. No API change.

## What was measured

- Text under 4.5:1 at rest, on the pages `ink` didn't cover (desktop and phone alike):
  - Tasks, the work space and Resources: a filter's count (`.filter-count`, the board's lenses and Resources' tabs),
    2.05:1; on Tasks and the work space, what a task hangs on («Reviews …», «After …»), 2.13:1. Both in the faintest
    ink (`--text-4`, 0.26), made for marks, not words.
  - Goals, sign-in, the door and Conversations: none.
- Targets under 24 px (Knowledge's tile actions, a goal's criteria): each clear of every other target by WCAG 2.5.8's
  spacing, so none is a fault; on a touch screen an inline action already reaches past its words.

## What changes

- A filter's count reads in the third ink (`--text-3`), the chosen one's a step up (`--text-2`), on Resources' tabs as
  on the board's lenses (before, the board's chosen count stayed as faint as the rest).
- What a task hangs on reads in the third ink, as the line above it; the short rule leading in stays faint (a mark).
- `ink` covers Goals, Tasks, Resources, the work space, sign-in and the door too, each waiting for what it shows once
  drawn (`e2e/drawn.ts`). Conversations check their own contrast already (their specs), and on a phone open on the
  list alone.

## Checks (written first)

- `ink.spec.ts` with the six pages: it failed on Tasks, Resources and the work space, desktop and phone (the counts at
  2.05:1, the hangs-on line at 2.13:1); with the change, every page passes.
- New in `ink.spec.ts`: on Resources and the work space, the chosen filter's count stands a step above the others.
- `resources`, `room-work`, `work`, `type-scale`, `drawn`: unchanged, pass.
- Mutants, with a control that passes: a count back in the faintest ink, the hangs-on line back in it, the chosen
  count's step dropped: each fails.

## Left

- `--text-4` still colours words seen only in other states: placeholders, an empty lane's line, a review's evidence
  reference, Resources' step list and one label. Each needs its state on a page to be measured: next.
