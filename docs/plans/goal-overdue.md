# A goal past its date, and your own goals

> 2026-10-15 · Follows goal-owner-date.md (A25): a goal has an owner and a target date, and its row says them. A date
> that has passed reads the same as one ahead, and there is no way to see only the goals that are yours. Asana Goals and
> Linear mark a target date that has passed and filter by owner. Luis's queue, item 3. Studio only: it reads A25's
> targets.

## What changes

- **`goal-due.ts`** (pure):
  - `dueOf(targetDate, today, done)` gives overdue, today or later, or nothing when the goal is completed or has no
    date. `today` is the viewer's calendar day.
  - `dueWords` gives «overdue since 30 Oct 2026», «due today» or «due 30 Oct 2026».
- **A goal's row:**
  - It says its owner, «You» for one's own, and its date in those words.
  - Overdue is set in the warning colour (`data-due`).
- **«Mine»** sits beside the goals' heading, as a switch with `aria-pressed`. It keeps the goals the viewer owns, and
  shows only when there is one.
- **The fixture:** `targets=mine`. The rollout is Marco's, due 30 Oct 2026. The admin change is the viewer's, due
  20 Nov 2026. The completed pilot is the viewer's, due 1 Oct 2026.

## Checks

- `goal-due.test.ts`:
  - overdue, today and later;
  - nothing for a completed goal or no date;
  - the words for each.
- `goal-overdue.spec.ts`, with the clock at 2 Nov 2026:
  - the rollout reads «Marco · overdue since 30 Oct 2026», marked overdue;
  - the admin change reads «You · due 20 Nov 2026»;
  - «Mine» keeps the viewer's goals and gives the others back;
  - with no goal of the viewer's, no «Mine».
