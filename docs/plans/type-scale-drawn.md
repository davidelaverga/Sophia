# Type scale check: measured once the view has drawn, not once the network is idle

> 2026-10-09 · Luis: «Do this task here: Replace networkidle wait in type-scale spec». Found on #187's CI: «type ·
> Knowledge keeps to the app's scale, its bar too» timed out in `waitForLoadState('networkidle')` on a slow runner.

## What is wrong

- `type-scale.spec.ts` waits for the network to be idle before it measures. A fixture page keeps loading modules and
  images as it draws, and on a slow runner a quiet half second may not come within the test's 30 s; it also says
  nothing about what has drawn, only that the network paused.

## What changes

- Each view names what must be on screen before its sizes are read: the bar's Invite (the membership's read), and a
  part for each read that fills the view, the last of a chain included: the room's words; Knowledge's first report and
  its first drawn cover (covers read their version three steps after the list); Updates' decided line and a meeting;
  Conversations' context and a message only its thread shows (each row shows its last message, so that one would be
  met by the list). Nothing waits on the network. What the check measures, and its scale, don't change.
- `ink.spec.ts` has the same wait over more pages; it is left for its own change, named in the handoff.

## Checks

- The spec, run on its own under the machine's guard, passes; with an anchor that never appears it fails on that
  anchor, not on a timeout of the network.
