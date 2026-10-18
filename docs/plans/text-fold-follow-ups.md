# Text folding: the open follow-ups

> 2026-10-18 · Luis · «Procede con los arreglos» · Codex P2s on #433 ([find-accents](find-accents.md)) and #428
> ([board-export](board-export.md)). Studio only.

| Follow-up | Measured | Change |
|---|---|---|
| Capital sharp S (`search-fold.ts`, #433) | One pass of upper then lower folds ẞ to ß while ß folds to ss, so «ss» or «ß» never found «ẞ» in Find, the notes' search or Resources. Over every code point, ẞ is the only character that pass leaves unsettled; with a second pass, the fold groups characters as Python's full case folding does, but for ı, which also finds i (as before) | Case folds twice over, upper then lower. |
| Unicode line separators (`board-export.ts`, #428) | A task holding U+2028 or U+2029 kept it in its Markdown item, and the report's parser (`packages/report/src/markdown.ts`, `itemOf`) read that item as a paragraph | U+2028 and U+2029 fold to a space with CR and LF. |

## Checks (written first)

- **`search-fold.test.ts`:** ẞ folds to ss, «STRAẞE» as «straße»; for every code point, a folded character holds
  nothing left to fold (U+1E9E failed on main). About half a second.
- **`find-view.test.ts`:** «ss» and «straße» find «ẞ», and «ẞ» finds the ß in «Straße».
- **`board-export.test.ts`:** two tasks with U+2028 and U+2029, parsed as the report parses them: one list of both,
  not a paragraph (main), each on its own line.

## Limits

- Folding stays a character at a time, marks dropped: ᾳ finds α, not αι as full case folding has it, and ı finding i
  is kept.
- The CSV quotes only CR, LF, quotes and commas, as RFC 4180 has it; a separator inside a CSV field is left as is.
- No Playwright spec: both changes are in pure functions the unit checks cover end to end.
