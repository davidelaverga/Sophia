# «Proposed · it’s in Still open» says only what is so

> 2026-10-09 · Luis: «Continua». Two of Codex's P2s on #174 (C7), answered there as follow-ups: a message's «Proposed ·
> it’s in Still open» could be said when the brief wasn't read again, and stayed once the proposal was decided. No API
> change.

## What is wrong

- After a proposal is recorded, the brief is read again before the press says «it’s in Still open»; but a read that
  fails is swallowed, so the line is said while Still open can't show it.
- The line is a flag kept with the message (`proposed[id] = true`), never compared with the brief again: once the
  proposal is accepted or declined, here or elsewhere, the message still says it waits in Still open.

## What changes

- The view keeps which proposal the message made (the receipt's decision id, or the one already waiting with its
  words), not a flag. The line is read from the brief as the context last read it:
  - listed as waiting: «Proposed · it’s in Still open»;
  - read, and no longer waiting: «Proposed · decided since»;
  - not read again (the last read failed, or none yet): «Proposed · Still open couldn’t be read again».
- It follows the brief as it moves: a read that comes back later says «it’s in Still open»; a decision anywhere says
  «decided since». No read of its own: the context's.

## Checks (written first)

- `conversations-decide.spec.ts`: proposed, then accepted in Still open: the message says «Proposed · decided since»;
  proposed while the brief's read again fails (`propose=slow`, the read failed meanwhile): «Proposed · Still open
  couldn’t be read again», then read again: «Proposed · it’s in Still open».
- The existing «it’s in Still open» checks, unchanged.
