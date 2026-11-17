# Handoff: Up to date says when it last checked; a long report's On this page (lote 18, items 10 and 13)

Goal and attempt: lote 18 (evaluacion-2026-11-16/textos-lote-18.md), items 9, 10 and 13, attempt 1  
Human owner / executor resource: Luis (owner, the lines approved 2026-11-16); the Claude Code session that built it  
Starting worktree/commit: `D:/Descargas/SophiaV4/Sophia-paper-8`, local branch `studio/updates-and-sync-explained` from
main `9495c87fc` (through #513)  
Changed files: `apps/studio/src/api/stream.ts`, `features/studio/useProjectFeed.ts`, `ProjectShell.tsx`,
`ConnectionPill.tsx` (new), `features/artifacts/MarkdownView.tsx`, `OnThisPage.tsx` (new), `page-index.ts` (new),
`page-index.test.ts` (new), `artifacts.css`, `apps/studio/e2e/feed-recovery.spec.ts`, `e2e/report-index.spec.ts`
(new), `docs/plans/up-to-date-checked.md`, `docs/plans/report-on-this-page.md`, this file.

## Outcome

- **Item 9 (Mark as seen), stopped, nothing built.** The approved help, «Clears these from Updates and from the tab’s
  count.», promises something that does not exist. Mark as seen (`useMarkSeen`, UpdatesView.tsx) refetches the
  `['vision', 'since', projectId]` queries: Updates' digest, Home's «since you last looked» (`homeSinceKey`) and the
  arrival band. No tab counts updates: the view nav (ViewNav.tsx) has no counts, and the browser tab's «(n)»
  (`useTabTitle`, ProjectShell.tsx) counts only people at the door, what waits on this person and room messages written
  while the tab was hidden. Proposed line for Luis: «Clears these from Updates and from Home’s news.» (or just «Clears
  these from Updates.»).
- **Item 10 (Up to date).** Hovering the pill reads «Up to date · checked 6 s ago». The time is when the project stream
  last brought bytes: when it opens and with every chunk, its 10 s pings included (`onHeard` in `followEvents`). It is
  kept in a ref in `useProjectFeed` and read only as the pointer comes onto the pill (`ConnectionPill`), so the shell
  renders nothing every second. Every other state keeps its word. A silent stream that still shows «Up to date» (until
  the 25 s stall watch gives up) now says how long it has been quiet.
- **Item 13 (On this page).** A report with four sections or more lists them under «On this page», on the anchors its
  headings already have. Sections are the top headings under the title (`pageIndex`: a lone first top-level heading
  is the title, and the next level down holds the sections). Enlarged at 1100 px or wider, the list sits in the left
  margin, sticky and with no height, so the column keeps its centre. In the side pane and on a phone it folds under one
  button (`aria-expanded`). A link brings its heading to the top and focuses it without changing the address (routes
  are paths). Choosing one folds the list again. `aria-current="location"` marks the section being read and follows
  the scroll (at the very end, the last section).

## Evidence

- Red, item 10, on `f765fe313` (test only), through the guard: `feed-recovery.spec.ts` «checked seconds ago» fails on
  its first help: expected `/^Up to date · checked (just now|[1-5] s ago)$/`, received «Up to date».
- Red, item 13, on `9bbf6c1a5` (tests only): `report-index.spec.ts` 3 fail, all on the missing nav (links: received
  none of the six; the side pane's and the phone's «On this page» button: element(s) not found); the two-section case
  passes, as it should. `page-index.test.ts` with `pageIndex` stubbed to return nothing (never committed): 4 of 5 fail
  (e.g. actual `[]`, expected `['Part 1', …, 'Part 4']`).
- Green on `74773dffa`, through the guard (pw-gentle): `report-index.spec.ts` + `feed-recovery.spec.ts` 9/9; neighbours
  `report-reading`, `report`, `report-pane-keys`, `dock-header` 101/101. Unit: artifacts + studio tests 268/268.
  `oxlint --type-aware .` clean, `tsc` clean, prettier clean on every touched file.

## Deviations

- Item 10: the approved line spells «12 seconds ago»; the app's time words (time-words.ts, `ago` with `seconds`) say
  «12 s ago», and the brief asked to reuse them. Shipped: «Up to date · checked 12 s ago». Luis to confirm, or the
  words change in one place (`connectionHelp`, ConnectionPill.tsx).
- Item 10: the help is the pill's native title, as before, refreshed on pointer enter. The pill isn't focusable, as on
  main, so keyboard and touch users don't get it (no change from today's «Up to date» title).
- Item 13: the first green run failed one assertion of mine: the nav is a zero-height sticky row by design, so
  Playwright calls it hidden. The check now asks for its list to be visible (in the fix commit; the test commit
  keeps the original, which failed earlier on the missing links anyway).
- Item 13: in the side pane (560 px) there is no side, so the index folds there instead of being hidden: one line, «On
  this page», above the text.

## Remaining limits

- Item 9 waits on Luis's line.
- Item 13: a report whose sections are short may not scroll its last headings to the top; at the end of the scroll the
  last section is marked.
- Item 13: the designed HTML page (its own frame) has no index; only the Markdown view has.

## Next bounded action

Luis: a line for item 9, and a yes on «12 s» for item 10. Then an independent review of the four commits on
`studio/updates-and-sync-explained` and a batch with the next verified branches.
