# Hold and Stop answer across their row under a mouse

> 2026-11-23 · Luis: «Yes, all five» (`five-decisions.md`, 12, option B). Improvement 12 of the independent evaluation
> of 2026-11-22. Studio only; no API change, no new text.

## Measured

`document.elementFromPoint` on every pixel around each press, Tasks (`room.html?demo=1&place=work`) at 1280 × 800,
fine pointer:

- «Hold» and «Stop» are 28 × 24 text buttons, 6 px apart, beside a 28 px «Request review»; they pressed only inside
  their box (28 × 24).
- Under a finger they already reach 44 × 44 (`::after`, `goal-controls.spec.ts`); under a mouse nothing did.

## What changes

- Under `(pointer: fine)` a goal's text presses (`.controls .control-row .text-button`) get the same `::after`, 2 px
  out on every side: the target is the row's 28 px tall and 4 px wider than the words. Two targets keep 2 px between
  them (a third of the row's gap), clear of the hit test's rounding; at 2.5 px the middle of the gap already pressed
  Stop.
- Nothing drawn changes: the press stays 24 px, its underline and tip as they were; the `::after` has no paint.
- A finger keeps its 44 × 44 (`pointer: coarse`), untouched.

| Measure (Tasks, 1280, fine pointer)     | Before  | After        |
| --------------------------------------- | ------- | ------------ |
| «Hold» target                           | 28 × 24 | 32 × 28      |
| «Stop» target                           | 28 × 24 | 33 × 28      |
| Drawn height                            | 24      | 24           |
| Middle of the 6 px between them presses | nothing | nothing      |
| Dark and light                          | —       | same targets |

## Checks

- `e2e/goal-controls.spec.ts`: under a mouse, 1.5 px over, under and past each side of Hold and Stop presses that
  press; the middle between them presses neither; both stay drawn at 24. Seen failing with the `::after` taken away
  (every point missed).
- The coarse test (44 × 44, apart) and `control-heights.spec.ts` unchanged and passing.
