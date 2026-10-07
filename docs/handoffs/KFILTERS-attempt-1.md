# Implementation-session handoff

Goal and attempt: Knowledge's second pass: one kind of filter, the reports first, a library in the demo (`docs/plans/knowledge-filters.md`, K2), attempt 1. Luis, after K1: «itera sobre esa nueva versión».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `knowledge/filters` on `knowledge/library` (#152) `322d3bb`, 2026-10-07
Ending commit/tree: the final change is commit `6a4383befbaf0139f4a9461c0e3650dcacf5102d` (tree `db0791b49ee2676928439593cd26907d8d96a4df`), after `ca15bc2`. Against `knowledge/library` they change `apps/studio/src/features/artifacts/KnowledgeReports.tsx`, `artifacts.css` and the new `demo-library-hashes.test.ts`, `apps/studio/fixtures/` (the new `demo-library.ts`, `report-data.ts`, `fixture-api.ts`, `demo-page.ts`), the new `apps/studio/e2e/knowledge-filters.spec.ts` and `docs/plans/knowledge-filters.md`. The commit after it adds only this handoff.

## Outcome

**One kind of filter:**
- The project filter (This project, All projects, the others with their counts) is now the app's `.segmented` group, as the format filter already was.
- The pressed choice sits on a quiet plane. The search field is on the body size.
- The round pills (`.filter-chip`) are gone. Their 44 px touch target on a coarse pointer now applies to the segmented buttons.

**The reports first:** what members carried in from Personal follows the tiles, before Connections. The first tile now sits right under the filters, where before it started at y = 431 on a desktop and y = 540 on a phone.

**A library in the demo (fixtures only, `?demo=1`):**
- Seven reports. The first page shows six of them, two full rows at 1440 px: the readout, the week-3 survey (with its own designed page), the setup checklist, the ticket review, the call notes and the second region's notes.
- More reports brings the pilot's plan.
- Every text's hash is checked by a one-off script.
- Without `demo`, the list is the fixture's, as before: the fixture report, then the older report.

## Evidence

- **Tests first:** the four checks in `knowledge-filters.spec.ts` failed before the change. Their failures:
  - the project group was not `.segmented`;
  - the filter sizes were 12.5 and 13.5 px;
  - the carried-in section came first;
  - the demo had one tile.
- **Browser** (under the guard): `knowledge-filters`, `knowledge-library`, `report`, `project-carried-in`, `project-connections`: 84 of 84; after the review's fixes, `knowledge-filters` and `knowledge-library` 16 of 16.
- **Mutations:** the control survives. Killed:
  - the project filter as before;
  - no plane under the pressed choice;
  - what was carried in moved back above the reports (moved, not duplicated);
  - the search at its own size.
- **Independent review** (a separate agent, read only): no P1, one P2.
  - **The P2, fixed:** a choice not pressed read at 3.8:1 (the format filter's too, since before). A new check of every word in the filters failed with «All projects (3.84)», «With PDF», «Without PDF»; with the second ink it passes.
  - **P3s fixed:** a gap between the rows of a wrapped group; the leftover comment; the design note's wording; a unit check that every demo text matches its hash (`demo-library-hashes.test.ts`, in the unit run).
  - **P3 left:** the pilot's plan is dated after the shelved reports; no card shows its date.
- **Gates:** `tsc --noEmit`, `oxlint --type-aware`, Prettier.

**Source-register IDs consulted:** none.

## Remaining obligations

- The count beside another project's name had its style but no check. Fixed after Codex's P2 on #153: the count is in
  `--text-2` (it read at 3.84:1 in `--text-3`), and the fixture's `reports=elsewhere` lists another project, so a
  check measures the button and its count at 4.5:1, pressed or not (21 passed with K1's checks; the `--text-3` mutant
  is killed).
- Codex's next two P2s on #153, fixed: the fixture answers a request for the other project with that project's
  report (its one, not this project's), and the check presses it and finds that report alone; in the demo the
  pilot's plan is dated Sep 15, older than the shelf, so More reports keeps the list newest first (a check reads each
  tile's day). Both mutants killed.
- From the captures, for the next pass:
  - each tile repeats «Description by Sophia» and «History and changes», which is noise across six tiles;
  - More reports is a full-width bar.

## Next bounded action

Merge #151 and #152 first; then retarget this to `main`, merge on green and no Codex P1.
