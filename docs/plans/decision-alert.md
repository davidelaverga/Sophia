# A decision waiting on you, heard beyond the view

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), DL-07, from Luis's «Sigue con la cola … y el nuevo
> informe-25». Studio only: GET /plans is already served.

## What was measured

- Nothing found the viewer outside the tab: the tab's number counted the door, the room's messages while hidden and the
  requests in their tools, never a decision; only a knock made a browser notification. A decision that expires died in
  silence.

## What changes

- **`decision-alert.ts` (pure):** the decisions open for the viewer on each goal (each one's latest revision, still
  proposed, not expired, theirs; a proposed plan's included, which is the admission production serves); every goal's
  together; the ones not there at the last look; and how a notification says them.
- **Each goal's plan** carries `toDecide` (served and fixture boards alike).
- **The tab's number** adds them, in the house format: «(1) Project · Sophia», one number for everything that waits.
- **`useDecisionAlert`:** a new one, while the tab is hidden and notifications are allowed, is a notification, by its
  question and when it ends. The first look is the baseline; the look moves on with every change. No sound.
- **`app/notify.ts`:** the notification itself, shared with the knock (`useKnockAlert` behaves as before).

## Checks, written first

- `decision-alert.test.ts`: open decisions (latest revision, expired, answered, someone else's, no viewer); across goals,
  none before the board is read; news since the last look; one said by its question and expiry, several by how many.
- `decision-alert.spec.ts` (Tasks' fixture): counted and gone once answered; gone once expired; the served admission of
  one's own proposal counted and gone once answered; a new one while hidden notified by its question; one open on
  arrival not news; with the tab shown, counted and not notified; without permission, only counted; an answered one
  leaving notifies nothing more.

## Limits, and for Luis

- The board is read on Goals, Tasks and search only: on the Studio or Knowledge the number is the last read's (expiry
  still holds, the clock moves every minute), and a decision that arrives meanwhile isn't counted until the board is
  read again. While the tab is hidden the board's 30 s read doesn't run; only the feed's events bring a new one.
- A decision answered in another tab stays counted until the next read; a new revision of the same decision doesn't
  notify again.
- In production the one decision served is the admission of one's own review: the tab says «(1)» while Goals says
  «Nothing waits on you.» (Goals counts only an operable plan's asks). Whether Goals counts it too is Luis's call.
- The report's «(1) for you» isn't used: the number already counts the room's messages, for which «for you» is wrong.
- Offering the notification permission beside a decision or in Settings, and notifying with the tab closed (push, mail)
  or before an expiry, wait on Luis and on the API (#390's /me/needs).
