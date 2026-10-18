# Find in Personal, whatever the accents

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 7). Find in the personal conversation matched
> whatever the case but not whatever the accents: «cafe» didn't find «café», nor «manana» «mañana». The notes' own
> search already ignores both (`findNotes`, `places-view.ts`). Studio only.

## What changes

- **`find-view.ts` compares as the notes' search does:** no case, no accents. Each character is folded on its own
  (decomposed, its marks dropped, lower case), so a match still cuts the words as written.
- **An accent typed as its own mark** (an «o» followed by a combining acute) goes with its letter, so a match never
  leaves it behind.
- A query is still looked for as written, never as a pattern.

## Follow-ups (Codex P2s on #406)

- **One fold for every search** (`search-fold.ts`): the conversation's Find, the notes' search and Resources' search,
  a character at a time.
- **Case folds as Unicode folds it:** ς is σ, ſ is s and ß is ss, as the search before it found them.
- **Only combining marks fold away:** a standalone `^` or `` ` `` is found as written, so nothing matches across one,
  and a search for one no longer folds to nothing (which found everything in Resources).
- **A character is marked once,** even when its decomposition repeats what is sought.

## Checks

- **`find-view.test.ts`:**
  - «cafe» finds «café» and «café» finds «cafe»;
  - «manana» finds «MAÑANA»;
  - a decomposed «café» is matched whole, its mark included;
  - the existing checks hold: case, the longer lower case of «İ», a query's brackets.
