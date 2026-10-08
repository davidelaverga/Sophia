# The door: the lobby, seen from the room, quiet

> 2026-10-08 · Luis: «Arranca» the «$20» pass on the lobby. Measured at 1440 and 390 px, `?demo=1&lobby=waiting`. The
> guest's side (`JoinFlow`, `GuestRoom`) has no fixture page yet, so this pass is the room's side.

## The gap

- A box with a warm border and a mono, upper-case line, «SOMEONE IS WAITING TO COME IN», for one person whose name is
  right under it.
- No sign of who: no face, no sense that someone just arrived.
- «Let in» and «Decline» weigh nearly the same; the answer most people give doesn't lead.
- On a phone the card is about 240 px tall and pushes the people over the light.
- In the demo, Ana has waited «6 days» (a fixed fixture date).

## What changes

- **At the door:** «At the door» (with several, «3 at the door»), in the sans at the small size, after a warm dot that
  breathes (still under reduced motion). The row names them to the eye; the status, heard alone, names the one waiting
  («At the door: Ana Ruiz»). The panel keeps its name, «Waiting to come in».
- **Who:** each row opens with their initial in a warm ring, then the name and how long they have waited.
- **The answer leads:** «Let in» a filled warm pill; «Decline» a quiet word. Block, after a second knock, as before.
- **Unboxed:** the glass and its shadow, no warm border.
- **A phone:** the row is one line: the initial, the name and wait, the answers.
- **The demo:** the knock is a minute old.

## Checks (written first)

- The head says «At the door» (the status names the one waiting), or how many; the row's initial, name and wait; «Let in» filled, «Decline» not.
- On a phone the row is one line, and the card no taller than 120 px.
- Contrast 4.5:1 and the app's type sizes on the card; the dot still under reduced motion.
- The report checks that find the door (`report.spec.ts`) pass unchanged.
