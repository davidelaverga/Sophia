# Personal carry: follow-ups to Codex on #131

> 2026-10-06 · Luis · the three P2s Codex left on #131 (merged under the no-P1 rule), behind the vision flag

## What Codex found

1. **Two writers:** while a package carried, the notes' own Carry stayed live beside it. A note could go to another project first, and the package then called it stale or «may already be there» in its own project.
2. **A take-back done elsewhere:** a release Work (or another tab) had taken back under its own key answered `not_found`. The package said the note was still in the project, and retried forever.
3. **Closing mid-carry:** closing the notes (Close, Esc) while a package carried unmounted it. The batch stopped silently after the note on its way, and nothing said what went.

## What changes

- **One writer:** while the package is open, it replaces the notes' own Carry (the notes' list with its Carry buttons isn't shown). Cancel or Done brings them back.
- **Taken back is taken back:** a take-back answered `not_found` is a release that came back, whoever asked. Its key is let go.
- **The notes stay open while a step runs** (carrying, taking back): Close is unavailable (aria-disabled), and Esc waits (the package holds the top Escape layer meanwhile). Once the step settles, both work again.
- **Should the package go anyway** (the place left for Work or home), the batch still goes. Nothing chosen stops halfway, and Work marks what arrived (`onCarried`).

## Checks (written first)

- **Browser** (`e2e/personal-carry.spec.ts`):
  - with the package open, the notes' own Carry is put away, and Cancel brings it back;
  - a release already taken back elsewhere is said taken back;
  - while notes are on their way, Close and Esc wait, and once carried, Esc closes the notes.
