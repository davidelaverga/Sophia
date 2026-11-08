# Implementation-session handoff

Goal and attempt: SEARCH-WORDS-LIKE-THE-API (finding 1 of the hunt on main, `evaluacion-2026-11-08/caza-main.md`: the
Studio finds goals and tasks, and marks hits, by the whole query as one phrase while the API finds by words; Luis
2026-11-08: «Procede y corrige»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `search/words-like-the-api` from `origin/main`
`953e5dc3d` (everything through #500 merged; not pushed)
Writable scope: this worktree only (`apps/studio`, `packages/contracts`, `packages/persistence/src/artifacts.ts`,
`docs/plans`, `docs/handoffs`); no SQL, no route, no copy.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis, the quote above; local only, nothing pushed.
Ending commit/tree: `970bd45ae`, the last commit that changes code; the next one adds only this record. Files changed
against `953e5dc3d`: `apps/studio/src/features/search/search-view.ts` and its test, `apps/studio/e2e/search-goals.spec.ts`,
`apps/studio/fixtures/search-data.ts`, `packages/contracts/src/search-words.ts` (new), `packages/contracts/package.json`,
`packages/persistence/src/artifacts.ts`, `docs/plans/search-words-like-the-api.md`, and this record.

## Outcome

- **One word rule, one function.** `searchWords` moves from `packages/persistence/src/artifacts.ts` to
  `@sophia/contracts/search-words` (a new subpath export, beside `SEARCH_WORD` and `textWords`). Persistence imports and
  re-exports it, so Project Search's `queryOf` and the report-card `searchQuery` are unchanged; the Studio reads the same
  function, so the two sides cannot drift.
- **Goals and tasks found by words**: every typed word must begin a word of the goal (title, outcome and criteria
  together) or of the task (purpose and doer together), in any order. «checklist region», «region checklist», «transl
  reg» and «marco checklist» find «Translate the checklist for the second region»; «checklist zebra» and «hecklist»
  find nothing. The two-letter minimum is unchanged; a query with no letter or digit finds nothing, as `queryOf` says.
- **Marked word by word**: `marked` marks the beginning of every word a typed word begins (the longest such typed word).
  A word whose lower case changes its length (İ) is marked whole.
- **Cut around the first word found**: `around` centres on it, instead of on index 0 when the phrase is absent.
- **The fixtures answer by the same rule** (`says`), a report section by its heading and words together.

## Evidence

- **Written first and failing** (`80f77617c`):
  - `node --test …/search-view.test.ts`: `AssertionError: checklist region` (actual `[]`, expected `['t1']`);
    `marked('Release REL-2026-07 ships', '2026 07')` gave `[{ text: 'Release REL-2026-07 ships', mark: false }]`;
    `around` returned the text's first 80 characters (`a a a …`), so «the checklist» was cut away.
  - e2e «region checklist» (`pw-logs/words-red.txt`): `.search-hit-title mark` expected `["checklist", "region"]`,
    received `[]`.
- **Fix `970bd45ae`**: `search-view.test.ts` and persistence's `artifacts.test.ts` 30/30; `search-goals`,
  `project-search` and `room-search` through the guard 34/34 (`pw-logs/words-green.txt`), the new case included.
- Whole-repo `oxlint --type-aware` (exit 0); `tsc --noEmit` for `apps/studio`, `apps/api`, `packages/persistence` and
  `packages/contracts` (exit 0); Prettier on every non-docs file touched: clean.

## Decisions and changes

- **Shared through contracts, not copied.** Persistence depends on `pg`, so the Studio can't import it; contracts is
  already a dependency of both and holds other pure helpers behind subpaths (`room-chat`, `sse`). The subpath keeps the
  Studio off the root entry, which reads the OpenAPI file with `node:fs`.
- **The text side splits as the query side does** (lower case, then runs of letters and digits). A word of digits stands
  alone, so #497's signed digits (`REL-2026-07` → `-07` in PostgreSQL) need nothing extra here.
- **A goal shows the first outcome or criterion that says one of the words**, as it showed the one that said the phrase.

## Remaining obligations

- Where PostgreSQL's parser keeps a compound whole (`1.2.3`, `a@b.com`, a path), the Studio can find and mark a later
  part the API misses: the SEARCH-HYPHEN handoff's named limit, not changed here.
- Touches Davide's lane at one point: `packages/persistence/src/artifacts.ts` imports `searchWords` instead of defining
  it. Worth naming in the PR.
- Not pushed; CI is the run on record.
