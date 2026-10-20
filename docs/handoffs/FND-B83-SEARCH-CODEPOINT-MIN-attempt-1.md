# Implementation-session handoff

Goal and attempt: FND-B83-SEARCH-CODEPOINT-MIN-01, attempt 1. This fixes CODE finding 4320173114 on public Search
`b583a390`.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `101ca5a7…`.
Starting point: `/Users/davidelaverga/Documents/Codex/2026-10-17/sophia-search-common`, private branch
`fix/search-codepoint-min-20261020-b83` from `b583a390`. Not pushed, and not carried into Personal or Task.

## The defect

The Studio's shortest-query checks counted UTF-16 units (`q.length >= 2`). A38's `queryOf` counts code points
(`Array.from`). So one supplementary-plane letter, such as a Deseret letter, asked A38, which searches nothing for it.
It also found goals and tasks locally.

## The correction

- `search-view.ts`: adds `codePoints(q)`, which is `Array.from(q).length`, and uses it for the local hits' minimum.
- `SearchSheet.tsx`: the search read's `enabled` and the sheet's `asked` use `codePoints(q) >= MIN_QUERY`.

The 200-code-point field cap, the refusal, privacy, paging and cancellation code, the API, SQL, contracts and
fixtures are unchanged.

## Tests (the same bytes on old and fixed)

- Unit `search-view.test.ts`: «counts letters in code points, as the API does: one Deseret letter finds nothing, two
  find». Old: it found goal d1 for one letter. Fixed: it passes.
- Served Search config `project-search-page.spec.ts`: «one astral letter asks nothing, two are asked». Old: one letter
  was asked. Fixed: it passes.
- The fixed source also passes: Search config 17/17, the default-config project, room and goal search specs 33/33,
  Studio units 2001/2001, prettier, root lint, Studio typecheck and build.
