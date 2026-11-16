# Search finds and marks words as the API does

> 2026-11-08 · Finding 1 of the hunt on main `953e5dc3d` (`evaluacion-2026-11-08/caza-main.md`). Luis: «Procede y
> corrige».

## What was measured

- **The API searches by words; the Studio by the phrase.** Project Search (A38) and the report-card search take the
  typed words (`searchWords`: letters and digits, lower case, the first 8), each a required prefix of a word of the
  text, in any order; #497 found digits signed too (`REL-2026-07`). What the Studio finds itself, goals and tasks, it
  finds by the whole query as one substring. In the demo, «checklist» finds «Translate the checklist for the second
  region»; «checklist region», «region checklist» and «translate region» find nothing, and the sheet says «Nothing in
  this project matches».
- **Two words mark nothing.** `marked` looks for the whole query too: in a hit the API returned for «2026 07»,
  «Release REL-2026-07 ships» has no mark, so nothing says why it answered.
- **The cut can lose the word.** `around` cuts a long text from its start when the phrase is absent, so the 160
  characters shown can leave out the word the API found (its 200-character snippet was centred on it).
- **The fixtures search by phrase** (`fixtures/search-data.ts`), so no e2e can see any of this.

## What changes

- **One word rule.** `searchWords` moves from `packages/persistence` to `@sophia/contracts/search-words`, next to the
  pattern of a word (`SEARCH_WORD`) and a text's words (`textWords`). The API's query builders import it from there
  (persistence still exports it), and the Studio reads the same function: the two cannot drift.
- **Found as the API finds**: a goal or a task is found when every typed word begins a word of it, in any order: a
  goal's title, outcome and criteria together; a task's purpose and doer together. A goal still shows the first outcome
  or criterion that says one of the words. Two letters typed are still the least, and a query with no letter or digit
  finds nothing, as A38's `queryOf` says.
- **Marked word by word**: every word of the text that a typed word begins has that beginning marked, each word on its
  own, whatever the order.
- **Cut around the first word found**, as before around the phrase.
- **The fixtures follow the rule** (`says`, the same function the goals and tasks use), a report section by its heading
  and its words together, as the API reads a section.

Not changed: the API, its SQL and its signed digits (a Studio word of digits already stands alone: «REL-2026-07» is
`rel`, `2026`, `07`); the limit of three goals and three tasks; the copy. Where the parser keeps a compound whole
(`1.2.3`, `a@b.com`, a path) the Studio may find a part the API misses; the SEARCH-HYPHEN handoff names that limit.

## After the independent review (no P1/P2; its P3s)

- **A goal shows the words its title lacks.** Found by «admin checklist», «Keep teams through an admin change» shows
  the criterion that says «checklist», not the outcome that repeats «admin».
- **The fixture search refuses as A38 does** (`fixtures/search-query.ts`, the API's `queryOf`): a word over 64
  characters is refused (422), under two characters or no letter or digit finds nothing.
- **`SEARCH_WORD` is global**: its comment says to use it with `match` or `matchAll`, never `test` or `exec`.
- **Limits of the shared rule**, the API's as much as the Studio's; each needs an API change, not a Studio one:
  - Turkish İ lowercases to i and a combining dot (U+0307), which is no letter, so «İzmir» splits into `i` and `zmir`:
    «zmir» finds it mid-word, «izmir» doesn't.
  - Text isn't normalised to NFC: decomposed text (NFD) splits at its accents.
  - `toLowerCase` isn't case folding: «Straße» isn't found by «strasse», nor a ligature by its letters.

## Checks

- `search-view.test.ts`: «checklist region» and «region checklist» find the task; a word the task lacks finds nothing;
  `marked('Release REL-2026-07 ships', '2026 07')` marks «2026» and «07»; `around` centres on the first word found when
  the phrase is absent.
- `e2e/search-goals.spec.ts`: «region checklist» finds the task, with «region» and «checklist» marked.
- `search-goals`, `project-search` and `room-search` specs through the guard; persistence's `artifacts.test.ts`
  unchanged and green.
- Prettier, type-aware lint, typecheck; CI as the run on record.
