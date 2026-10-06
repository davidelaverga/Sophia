# Personal carry and carried in: follow-ups 2

> 2026-10-06 · Luis · the P2s Codex left on #132 (carried in) and #135 (carry follow-ups), both merged under the no-P1 rule, behind the vision flag

## What Codex found, and what changes

**On #135 (the package):**

1. **The account leaves mid-carry:** since #135 the batch went on after the package unmounted, so signing out mid-carry could publish more notes under the account that left.
   - The package now stops when it unmounts again.
   - #135 made that safe: while a step runs the notes can't be closed, and Personal stays mounted across the places. The only thing left that unmounts the package is the account going.
2. **Escape after leaving and coming back:** on returning to Personal mid-step, the notes' Escape layer opened again above the package's, and Escape closed the notes.
   - A layer can now hold Escape above the others (`priority`; `topOf` in `escape-layers.ts`). The package holds it while a step runs.

**On #132 (carried in):**

1. **Stale while open:** the list is read again as the project's feed moves (a member carried or took back), and a carry or take-back from Personal refreshes it.
2. **A project past the list's first ones** (the project list is capped) is never said to have nothing: «What was carried in can’t be listed here: this project isn’t in your list’s read.»
3. **An empty list, then a failed read:** «This may be out of date.», with Try again, whatever the list held.
4. **While read, its place is kept:** the heading shows, with «Reading what was carried in…» when slow, so the reports below don't jump.
5. **Try again with a list shown** says «Reading again…» (unavailable) until the read settles. With no list read yet, the section's own reading line shows.

## Out of scope

- A project-scoped read of releases (the API's): the cap is said, not worked around.

## Checks (written first)

- **Browser:**
  - `personal-carry.spec.ts`:
    - when the account goes mid-carry, nothing more goes under it;
    - after leaving Personal and coming back mid-step, Esc still waits.
  - `project-carried-in.spec.ts`:
    - a note carried while Knowledge is open shows, as the feed moves;
    - nothing carried, then a failed read, says it may be out of date;
    - a project past the list's first ones is never said to have nothing;
    - while read, its place is kept; with a list shown, Try again says it is reading.
- **Unit:** `escape-layers.test.ts`: the top layer by priority, then by which opened last.
