# A goal past its date needs attention

> 2026-10-16 · Follows goal-overdue.md. Found in the real-stack E2E pass (evaluacion-2026-10-16): a goal owned by the
> viewer and due 1 Oct reads «On track» on its row, and above it the brief says «Nothing waits on you. 1 on track».
> The cause is that `healthOf` reads only the goal's state and plan, never its target date. Studio only: it reads A25's
> targets.

## What changes

- **`goals-glance.ts`:**
  - `Glanced` gains `overdue`.
  - `healthOf`: a goal that is moving or ready but past its date needs attention. A paused or done goal stays paused or
    done, as with a difficulty note.
  - `withDue(goals, plans, targets, today)` marks each goal past its date, using `dueOf` (a completed goal is never
    overdue).
  - `rowLine`: when nothing else explains the attention, the row falls back to where the goal is
    («No plan on the board yet»). The target line below already says «overdue since …».
  - `briefOf(asks, late)` also counts the viewer's own goals past their date:
    - «One of your goals is overdue.»
    - «Two of your goals are overdue.»
    - «One thing waits on you, and one of your goals is overdue.»
- **The health count** says «2 need attention», never «2 needs attention» (seen in the same capture).
- **Same health everywhere:**
  - Goals (rows, brief, order, health count) and the goal's sheet read the plans with `withDue`.
  - The project search reads them the same way, so it doesn't call a goal «On track» when its row says «Needs
    attention».
- **The fixture:** `targets=late`, where the admin change is the viewer's goal and due 25 Oct 2026.

## Checks

- **`goals-glance.test.ts`:**
  - the health is attention for a running or ready goal past its date, and unchanged for a paused or done one;
  - the row's fallback line;
  - the brief's words;
  - `withDue` marks only goals past their date that aren't completed.
- **`goal-overdue.spec.ts`**, with the clock at 2 Nov 2026:
  - with `targets=late`, the admin change reads «Needs attention» and the brief reads «One of your goals is overdue.»;
  - with `targets=mine`, Marco's late rollout needs attention, but the brief doesn't count it, because it isn't yours.
