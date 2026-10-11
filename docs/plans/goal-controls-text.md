# One primary on a goal: Hold and Stop as text

> 2026-10-11 · Luis: «Dale, sigue con Hold/Stop como botones de texto», informe-ui-premium §3 movement 6: on Tasks the
> goal's head shows «Request review», «Hold» and «Stop» as three pills in a row, one filled and two outlined at the
> same size, so the one act that moves the goal forward competes with the two that pause or end it. No API change.

## What was measured

- `WorkControls` draws every command the goal's status allows (`request_review`, `hold` / `resume`, `stop`) as a
  `.pill` 28 px tall in one `.control-row`; only `request_review` is `.primary`. Stop is a `ConfirmButton` that asks in
  place («Stopped goals can’t be resumed.» · Keep working · Stop for good) and never times out.
- The Tasks view holds 31 controls; the goal's head holds three of equal weight. The task sheet already offers Hold
  and Stop with keys (H, S; UIKIT-19), so the head is not the only way.
- A `.text-button` is 24 px tall (padding 2 + leading 20): on the press scale (24 · 28 · 32 · 36).

## What changes

- **Hold, Resume and Stop become text buttons** in the goal's head: `text-button` with the same words, the same tips
  (`has-tip`), the same disabled state while a command is sending. Stop keeps asking in place; its question's own
  presses keep their shapes (the safe answer a ghost, the final one a danger pill).
- **One filled press per goal**: «Request review», as before. The text buttons sit 6 px further from it than from each
  other, so the eye reads one act and two quieter ones.
- Nothing changes in the task sheet's «Act on it» (`SessionActs`): a sheet is a different place, and its keys stay.

## Checks

- `e2e/goal-controls.spec.ts`: on Tasks (the room's fixture and the work space) each goal's controls hold exactly one
  `.pill.primary`, «Request review»; «Hold» and «Stop» are `.text-button` 24 px tall with their tips; pressing Stop
  still asks, with «Stop for good» and «Keep working»; «Keep working» puts Stop back as a text button.
- `control-heights` keeps passing (24 is on the scale). `pnpm format`, `lint`, `typecheck`; measured in the pane.

## After the review (Codex on #253)

- The step after the filled press reached every `.control-row` (the mission editor's Save · Cancel too); it is scoped
  to `.controls`, a goal's. A text button that is `disabled` (a command sending) no longer brightens its underline on
  hover (the rule excluded only `aria-disabled`), and reads as waiting (cursor default, 0.6). `goal-controls.spec`
  measures both.
- **After the review (Codex on #253, 2026-10-11)**: on a coarse pointer a text press's target reaches 4 px past each
  side, and Hold and Stop stood 6 px apart: the targets met by 2 px, and a tap at the edge of Hold could open Stop's
  question. The row keeps 8 px there. The spec's disabled test now hovers the disabled press (its underline keeps the
  rest) and the enabled one (it answers); a @phone test reads the reach and the gap.
