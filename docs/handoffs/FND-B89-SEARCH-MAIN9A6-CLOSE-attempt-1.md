# Implementation-session handoff

Goal and attempt: FND-B89-SEARCH-MAIN9A6-CLOSE-01, attempt 1. This brings fresh Main `9a6b03a7` (tree `f1878282`)
into Search B86 `97c76983`.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `4cad3638…`.
Branch: `integration/search-main9a6-20261020-b89` in `/Users/davidelaverga/Documents/Codex/2026-10-17/sophia-search-common`.
Not pushed. No Personal or Task carry. No SQL, contract, dependency or lock change.

## Merge

Normal merge of 9a6 into 97c7; the merge-base is 2ce0e5cd. The 72 Main paths and 55 Search paths are byte-identical
to their side, except the 6 overlaps R2 named:

- `ProjectShell.tsx` (conflict): Main's `UnderTheBar shell={props} … room` (arrival since, board failure and retry)
  is kept, with Search's `SEARCHABLE` gate on the commands' search.
- `press-answers.spec.ts` (conflict): Main's in-call row is kept. It uses a late token and waits for the dock's
  «Leave the room», the precondition C57 added; C57's note goes into its comment.
- `app-auth.spec.ts`, `fixture-api.ts`, `room.tsx` and `theme.css` merged on their own; the typecheck and the checks
  below pass.

## The served İ regression

The fixture's additive `turkish=1` adds a goal titled «İzmir pilot review». The served case types one `İ`, waits past
the field's settle, expects no goal shown, then types `z` and expects the goal shown. With the same test bytes, it
FAILS with ae65398's `search-view.ts` (the goal is shown for `İ`) and PASSES on this head.

## Checks on this head

- Root lint, prettier, Studio typecheck and build: 0. Studio units plus reliability-report: 2070/2070.
- Search config: 18/18, including the İ case, B83's Deseret case, the 401/403 local hide and fresh-read recovery,
  the 200-code-point astral cases and body cancellation.
- Default config, one run: app-auth (with its «session · token expired» renewal crossings, «refuses every token» and
  the other-tab other-account case), press-answers (the merged in-call row, personal and the other pages),
  project-search, room-search, search-goals, arrival-since and board-robust. 119/119.
