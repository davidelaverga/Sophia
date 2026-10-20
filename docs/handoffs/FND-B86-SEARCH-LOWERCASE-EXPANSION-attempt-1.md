# Implementation-session handoff

Goal and attempt: FND-B86-SEARCH-LOWERCASE-EXPANSION-01, attempt 1. This fixes the residual that R2 found on B83
`ae65398a`.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `a9e991c5…`.
Start: `/Users/davidelaverga/Documents/Codex/2026-10-17/sophia-search-common`, private branch
`fix/search-lowercase-expansion-20261020-b86` from `ae65398a`. Not pushed, and not carried into Personal or Task.

## The residual

`localHits` lowercased the query before counting it. A single typed `İ` lowercases to `i` plus a combining dot, which
is two code points. So it passed the minimum and could show a local goal, while the search read and A38 count the
typed query (one code point) and ask nothing.

## The correction

`search-view.ts` `localHits` counts the trimmed query as typed (`codePoints(typed) < MIN_LOCAL`), and only then
lowercases it for case-insensitive matching. The search read's `enabled` and the sheet's `asked` already count the
typed, trimmed query. No grapheme or NFKC policy, and no API, fixture or config change.

## Tests

- Unit «counts the query as typed, not as lowercased: one İ … finds nothing, two letters find». On ae65398 it FAILS:
  the goal «İzmir plan» was found for `İ`. Fixed, it passes. Two letters (`İz`) still find the goal.
- `search-view.test.ts` 25/25 on the fix, including B83's Deseret case. Prettier, oxlint and Studio typecheck: 0.
- Not run: the Search browser config. Ports 5198 and 5199 were C61's, and no STOP had been delivered. The local hits
  it covers come through the function tested here.
