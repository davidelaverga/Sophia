# Handoff: Mark as seen says what it clears; Up to date says when it checked; a long report's On this page (lote 18)

Goal and attempt: lote 18 (evaluacion-2026-11-16/textos-lote-18.md), items 9, 10 and 13, attempt 1\
Human owner / executor resource: Luis (owner, the lines approved 2026-11-16); the Claude Code session that built it\
Starting worktree/commit: `D:/Descargas/SophiaV4/Sophia-paper-8`, local branch `studio/updates-and-sync-explained` from
main `9495c87fc` (through #513)\
Changed files: `apps/studio/src/api/stream.ts`, `features/studio/useProjectFeed.ts`, `ProjectShell.tsx`,
`ConnectionPill.tsx` (new), `features/updates/UpdatesView.tsx`, `features/voice/voice-trail.ts`,
`features/artifacts/MarkdownView.tsx`, `DocumentPane.tsx`, `OnThisPage.tsx` (new), `page-index.ts` (new),
`page-index.test.ts` (new), `artifacts.css`, `apps/studio/e2e/feed-recovery.spec.ts`, `e2e/room-updates.spec.ts`,
`e2e/report-index.spec.ts` (new), `docs/plans/up-to-date-checked.md`, `report-on-this-page.md`,
`updates-mark-seen-help.md`, this file.

## Outcome

- **Item 9 (Mark as seen).** The first approved line named «the tab’s count», which no tab keeps: the view nav has no
  counts, and the browser tab's «(n)» (`useTabTitle`) counts the door, what waits on this person and unseen room
  messages. Mark as seen reads `['vision', 'since', projectId]` again: Updates' digest and Home's «since you last
  looked» (`homeSinceKey`). Luis chose «Clears these from Updates and from Home’s news.» (2026-11-16). It is the
  button's tip (`has-tip`, aligned to its start) and its description (`aria-describedby` to an `sr-only` span beside
  it, so its name stays «Mark as seen»), since tips hide at 760 px or less and on touch.
- **Item 10 (Up to date).** Hovering the pill reads «Up to date · checked 6 s ago». The time is when the project stream
  last brought bytes: when it opens and with every chunk, its 10 s pings included (`onHeard` in `followEvents`). It is
  kept in a ref in `useProjectFeed` and read only as the pointer comes onto the pill (`ConnectionPill`), so the shell
  renders nothing every second. Every other state keeps its word. A silent stream that still shows «Up to date» (until
  the 25 s stall watch gives up) now says how long it has been quiet.
- **Item 13 (On this page).** A report with four sections or more lists them under «On this page», on the anchors its
  headings already have. Sections are read as the stage's «Sections» read them (`indexLevels` and `inlineText`,
  shared from voice-trail.ts), the title and wordless (citation-only) headings left out. Only the Document tab asks
  for it (`indexed`, from DocumentPane): a report shown on the stage keeps its own Sections. Enlarged at 72rem or wider, the list sits in the left
  margin, sticky and with no height, so the column keeps its centre. In the side pane and on a phone it folds under one
  button (`aria-expanded`). A link brings its heading to the top and focuses it without changing the address (routes
  are paths). Choosing one folds the list first (`flushSync`), then places the heading. `aria-current="location"` marks
  the section being read; it is read again on scroll, as the text changes size and when the report changes (at the
  very end, the last section).

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

- Review round (no P1; two P2s and P3s), tests first: `e7358ce37` (item 9), `7dc8669ea` (the fold's landing),
  `d722a0ac2` (a shown report), `03a0cdbcb` (no nameless link; the stage's words). Unit red on `03a0cdbcb`: the
  citation-only heading, actual `['', 'Part 1', …]`, expected `['Part 1', …]`; the stage-words check already
  passed and stays as a guard on the shared helper. Fixes: `ceaefe6de`, `ed4162e82`, `300e3c508`, `cdd591db5`.
  On `cdd591db5`: `oxlint --type-aware .` clean, `tsc` clean, prettier clean on every touched file, unit
  (artifacts, voice, studio, updates) 686/686.
- E2E for the review round. The guard refused for its whole ~25 min window (memory down to 3.6 GB, then Wow open), so
  these ran through pw-direct (one worker, below normal), checked before each run: Wow.exe running, Aion 2 not.
  - Red on `03a0cdbcb` (tests only): the shown report, «On this page» count expected 0, received 1; Mark as seen,
    desktop and phone, description expected the line, received «». The two fold-landing checks passed there: Chromium's
    scroll anchoring makes up for the fold, so they didn't bite.
  - So `a675b6c04` turns anchoring off in those two checks (`overflow-anchor: none`, as a browser without it), and
    they were run against the old order (the fold after the scroll, restored locally, never committed): both fail,
    expected >= -2, received -174. With the fold first they pass.
  - Green on `a675b6c04`: `room-updates`, `report-index`, `feed-recovery` 22/23. The one failure was the first
    phone test of the run: the fixture page did not start (`.md` never found), before anything was checked. Run
    again it passed alone and 5/5 with `--repeat-each 5` (all of report-index's @phone). Neighbours
    `report-reading`, `report`, `room-walk`, `room-voice-trail`, `arrival-since`, `updates-narrow` 111/111.

## Deviations

- Item 10: the approved line spells «12 seconds ago»; the app's time words say «12 s ago». Luis kept «12 s ago»
  (2026-11-16).
- Item 10: the help is the pill's native title, as before, read on pointer enter and dropped on pointer leave. The
  pill isn't focusable, as on main, so keyboard and touch users don't get it: a noted follow-up.
- Item 10: in a backgrounded tab the browser throttles timers, the stall watch's included, so «Up to date» may sit
  beside «checked 1 min ago». That is honest by design: the pill says what the feed last knew, and the help says how
  old that is.
- Item 13: the first green run failed one assertion of mine: the nav is a zero-height sticky row by design, so
  Playwright calls it hidden. The check now asks for its list to be visible (in the fix commit; the test commit
  keeps the original, which failed earlier on the missing links anyway).
- Item 13: in the side pane (560 px) there is no side, so the index folds there instead of being hidden: one line, «On
  this page», above the text.

## Remaining limits

- The pill's help is mouse-only (follow-up).
- Item 13: a report whose sections are short may not scroll its last headings to the top; at the end of the scroll the
  last section is marked.
- Item 13: the designed HTML page (its own frame) has no index; only the Markdown view has.

## Next bounded action

Nothing is left unrun. Batch `studio/updates-and-sync-explained` with the next
verified branches.
