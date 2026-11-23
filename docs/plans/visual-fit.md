# What stays in place: rows, field errors, tips, the dock

> 2026-11-23 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 13 to 16).
> Luis: «Yes, batch E». Studio and `packages/ui` only, no API change.

## Measured

- **Whole rows (13).** The evaluation measured 202 px of a 1227 px Goals row answering a press. It doesn't reproduce:
  on the evaluated commit itself (`df4b4a518`, rehearse dev stack), every point of a 1217 px row opens the goal
  (`elementFromPoint` on a grid every 8 × 6 px: 2280 of 2280, at 793 px wide 1440 of 1440), with a pointer and a hover
  state; the demo fixture's rows with their meter and faces too (257 of 257 across). The row's press already covers it
  (`.goal-press::after`, `inset: 0`, without nesting buttons). Nothing changes here.
- **Field errors (14).** On Invite, an address without «@» showed the browser's own bubble («Please include an '@' in
  the email address…»): nothing in the page, no `aria-invalid`, no `aria-describedby`, gone when the pointer moved.
- **Tips (15).** On a goal with no plan (Tasks on the dev stack, «Admit and replay a command»), the controls stand
  under the criteria and their tips open above them: Request review's covered the last criterion over 229 × 17 px,
  Hold's over 139 × 15, Stop's over 106 × 15 (fixture `work.html?unplanned=1`, 1280 × 800). Over a plan the row stands
  at the card's top right, and nothing is covered.
- **The dock (16).** In the call at 1280 × 800 with the panel open, the stage is 900 px and the dock keeps clear of
  the corner on both sides (`max-width: calc(100% - 2 * (gutter + corner-room))`, 535 px), while its controls need
  673 px: it took two rows, 88 px (`--dock-h`) instead of 48.

## What changes

- **14 · An address the page can't send says why under its field** (`useAddressField.tsx`; `mail-home.ts` with tests).
  Both Invite forms (a guest's link, a member's invitation) check the address on Send with the sign-in screen's own
  check (`plausibleEmail`) and say it in its words, `NOT_AN_ADDRESS`, now shared from `mail-home.ts`: under the field,
  in the error style (`.form-error`, `role="alert"`), linked by `aria-describedby`, the field marked `aria-invalid`
  (its border goes rose, as sign-in's does), the focus back in it. The forms are `noValidate`, so the browser's bubble
  never shows. The words go as soon as the address changes; nothing was sent.
- **15 · A goal's tips never cover its criteria** (`WorkControls.tsx`, `ConfirmButton`'s new `tipSide`). Where the
  controls stand at the content's start (a goal without a plan, under its criteria), their tips open below
  (`tipSideOf`); at its end (over a plan, the card's top) they open above, as before. `ConfirmButton` (Stop, Retire)
  takes the side as it already took the alignment.
- **16 · The dock keeps one row before it wraps** (`dock-fit.ts` with tests, `useDockFit.ts`, theme.css). The dock
  is tried with its words; where they would wrap (`wraps`: a control starts under where another ends), it is marked
  `data-tight` and its word controls (Take the floor, Speak with Sophia, Pass to…, End, Sophia's others) show their
  icon alone in a 36 px square, as on a phone; their captions (Floor, Sophia) are read but not seen, and the
  separators go. Who holds the floor stays in sight. The words stay the controls' names; a control with no tip of its
  own (Take the floor) says them in its tip. Only if the icons don't fit either does it wrap, as before.
  - It is decided in one go before anything paints (the attribute taken off, the row read, put back if it wraps), when
    the controls change (a `MutationObserver` on the dock, the call's clock left out) and when the stage does (a
    `ResizeObserver` on the stage: a panel opened, a window resized). The dock's own size is not observed for this, so
    it never feeds back on itself (no ResizeObserver loop).
  - The `--dock-h` contract stands: the dock's height is still measured after, by its own observer, and is 48 px with
    the panel open.
  - A phone's dock is icons already: the tight rules apply above 600 px only.

## Words

No new words. 14 reuses the sign-in screen's «Check the address: it needs a name, an @ and a domain.», approved there.

## Checks

- `mail-home.test.ts`: `addressProblem` says what an address lacks, nothing for one that can be an address.
- `dock-fit.test.ts`: controls of different heights centred on one line are one row; one under the others is a
  second; one control or none never wraps.
- `e2e/visual-fit.spec.ts`: a member's address without «@» is said under the field, with `aria-invalid`,
  `aria-describedby`, the focus kept and nothing sent, the words gone once it changes; a goal without a plan has its
  tips below and none covers a word of the page; at 1280 × 800 the dock keeps one row with the panel open (icons,
  48 px), with Sophia in too, and its words come back when the panel closes.
- Before and after, both themes, 1280 × 800 and 390 × 844 (fixture): the error line 9.6:1 on dark, 6.25:1 on light,
  8 px under its field, inside the width at 390; the dock 673 px with words closed, 448–450 px with icons open, 48 px
  both ways, on dark and light; at 390 the dock and the tips are as before (a phone shows no tips; its dock is icons).

## Not done

- After a command is sent, the line under a goal's controls («Sent · Hold requested…») is covered by the next tip
  while the pointer rests on a control: below, the tips cover that line; above, they would cover the criteria. Neither
  side is free in that state, and the line stays after the tip goes.
- The dock's fit is checked when its controls or the stage change, not when a web font arrives late; the next change
  checks it again.
