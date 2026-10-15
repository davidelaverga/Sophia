# Search finds goals and tasks, and marks the words

> 2026-10-14 · `evaluacion-2026-10-13/informe-search-20.md`, findings 1–2. Luis: «Sí, empieza con la PR 1 de búsqueda».

## What was measured

- A13's search answers decisions, notes, reports, report sections and recaps (`api/vision.ts:253`). «goal» found
  nothing; «checklist» brought neither the task «Translate the checklist for the second region» nor the goal whose
  criterion says «The checklist opens on its first step».
- A report section's hit shows its whole paragraph (six lines), the word nowhere marked.

## What changes

- **Goals and tasks first**, from what the Studio already holds: a goal by its title, its outcome or a criterion (from
  the snapshot); a task by its purpose or who does it (from the served board, read while the search is open, from any
  view). Three of each at most, each labelled: «Goal · Needs attention», «Task · Marco's Claude Code». A goal opens its
  sheet in Goals (`#goal-`); a task its sheet in Tasks (`#task-`).
- **The words marked** in every hit's title and its words (`<mark>`), and a long paragraph cut around the first match.
- The search's own hits, «More results» and «Ask Sophia about…» stay as they are.

## Checks

- `search-view.test.ts`: goals found by title, outcome or criterion, tasks by purpose or doer, at most three each,
  nothing under two letters; the words marked whatever their case; a long text cut around the match.
- `e2e/search-goals.spec.ts`: in the demo «checklist» finds the task and the goal, marked; the task opens its sheet in
  Tasks; the goal opens its sheet in Goals; from the Studio view too.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; CI as the run on
  record.
