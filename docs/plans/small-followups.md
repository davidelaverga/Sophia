# Three follow-ups: Microsoft named, «Open in Tasks» only with a plan, a goal's address followed once

> 2026-10-14 · Codex's P2s on #309 and #300 (`evaluacion-2026-10-13/follow-ups-p2.md`), from Luis's queue.

## What changes

- **Microsoft named** (#309): a session signed in with Microsoft (`azure`, offered when the deployment turns it on)
  says «Signed in with Microsoft» in the account's head; it read as unknown.
- **«Open in Tasks» only with a plan** (#300): a goal observed with items but no plan has a slot on the board; its sheet
  offered a press to a Tasks with nothing planned. Now only a goal whose board holds tasks offers it
  (`canOpenInTasks`).
- **A goal's address followed once** (#300): after «Open in Tasks», choosing another goal in the rail, going to Goals
  and back, chose the first again, the address long gone from the bar. The address now follows the route's own moves
  (`ADDRESS_MOVED`), so a gone address is gone.

## Checks

- `profile.test.ts` (Microsoft), `goals-glance.test.ts` (`canOpenInTasks`), `e2e/goal-address.spec.ts` (the rail's
  choice kept across Goals).
