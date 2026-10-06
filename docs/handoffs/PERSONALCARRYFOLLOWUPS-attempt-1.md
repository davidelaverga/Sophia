# Implementation-session handoff

Goal and attempt: follow-ups to Codex on #131 (`docs/plans/personal-carry-follow-ups.md`), attempt 1, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/carry-follow-ups` on `main` `7979251` (#131 merged), 2026-10-06
Ending commit/tree: four commits on `personal/carry-follow-ups`, read one by one (a merge ref or a squash folds them into one):

- `34de6fe` «Personal carry: follow-ups to Codex on #131»;
- `bbc69a8` «Personal carry follow-ups: the review's P3s»;
- `4149a33` «Personal fixture: Escape closes the notes, as Places has it»;
- this handoff's own commit.

## Outcome

Codex's three P2s on #131, fixed:

- **One writer:**
  - while the package is open it replaces the notes' own Carry;
  - while a note crosses by its own Carry, Review what to carry waits.
- **A take-back answered `not_found`** (taken back elsewhere) is said taken back. Its key is let go.
- **While a step runs, the notes stay open:**
  - Close is unavailable, and Escape waits (the package holds the top layer meanwhile);
  - should the place be left anyway, the batch still goes, and Work marks what arrived.

The personal fixture now closes the notes on Escape, as Places does. Without it, no check could tell that the package holds Escape.

**Independent review:**

- no P1 or P2;
- P3s fixed: the mirror of one writer, the notes' heading while packing, and Close as its own part (NotesPanel was at the line limit);
- P3s left:
  - Escape's layer order can flip if the person leaves Personal mid-step and comes back (`useEscape` has no priority);
  - `not_found` is read as taken back, which holds on today's contract (noted in the design note).

## Evidence

The machine was free (no game open, 18 GB free); all runs went through the guard at its default floor.

- **Browser:** `personal-carry.spec.ts` and `personal.spec.ts`: 96 of 96.
- **Mutations:** 4 of 4 killed, and the control survives:
  - the notes' own Carry live with the package open;
  - a release taken back elsewhere said still there;
  - Close working mid-step;
  - Escape working mid-step.
  - The first run of the first one hit the heading's condition instead (the same words); aimed at the list, it was killed.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- `useEscape` priorities, if leaving mid-step and coming back matters.

## Next bounded action

The deferred mutants of #132, #133 and #134, then Davide's chapter 7.
