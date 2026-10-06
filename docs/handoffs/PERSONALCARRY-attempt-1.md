# Implementation-session handoff

Goal and attempt: carry only what you choose (`docs/plans/personal-carry-package.md`), attempt 1. It is Davide's vision, chapter 1 «Contribute», behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/carry-package` on `room/follow-ups-6` (#130), 2026-10-06
Ending commit/tree: the content commit «Personal: carry only what you choose (Davide's chapter 1)», the parent of this handoff's commit.

## Outcome

«Review what to carry» in Personal's notes opens a package:
- the person picks the project and the notes; none is chosen at first;
- «The team will receive» shows exactly what goes, and «Stays here» says the conversation doesn't go.

**Carrying:** each note goes by the existing carry (the real API), in order.
- What goes is fixed as Carry is pressed. A carried note leaves the notes, so the package counts from that batch and stays open as the list empties.
- A failure stops the package, saying how many went and why.
- A note with no reply, or one that left the list, may have gone: it is never said unsent and never carried again.
- Take back is honest. It says only «Taken back» when every release came back; otherwise it says what is still there, with Try again.
- The focus goes to what the package says, never to the page.

**Independent review, two passes:**
- **First pass:** four P2s, all fixed:
  - the package unmounted as the list emptied;
  - counts came from the live list;
  - Cancel didn't stop the carry;
  - Take back said done when it failed.
- **Second pass:** two P2s, both fixed:
  - Try again could be stuck on a note that already went;
  - the focus fell to the page after Done and Try again.
- **P3s fixed:** the reason shown, the type scale and 24 px controls with the package open, and the fixture's counters and fidelity (a carried note leaves the list).
- **P3s left:**
  - closing the notes panel mid-carry stops it silently, as the panel's own rule has it;
  - viewers can carry, as today's single Carry allows (a decision for Davide).

## Evidence

Runs used the guards' gentle mode, at Idle priority beside Luis's games, on his word.

- **Browser:** `personal-carry.spec.ts` and `personal.spec.ts`: 92 of 92.
- **Mutations:** 13 of 13 killed, and the control survives:
  - everything chosen at first;
  - Carry offered with nothing chosen;
  - the unchosen going;
  - a failure not stopping it;
  - Try again re-carrying;
  - Take back taking one;
  - offered with no project;
  - the package going as the list empties;
  - a failed take-back said done;
  - the focus left behind;
  - a note that left carried again;
  - no reply said unsent;
  - Done dropping the focus.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- Where a carried copy shows inside the project: the next PR.
- Davide: an atomic package write, if wanted (now one carry per note).

## Next bounded action

The project side of chapter 1: «Carried in from Personal» in Knowledge.
