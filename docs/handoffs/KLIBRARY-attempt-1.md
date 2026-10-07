# Implementation-session handoff

Goal and attempt: Knowledge as a library, each report a tile with its cover (`docs/plans/knowledge-library.md`, K1 of the «$20» pass on Conversations and Knowledge), attempt 1. Luis approved the critique: «arranca con K1 y luego itera sobre esa nueva versión».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `knowledge/library` on `demo/video-data` (#151) `700d624`, 2026-10-07 (#151's later commits merged in since)
Ending commit/tree: the final implementation is commit `68dadea81b9c2003035b23d6b3a7b4cf50de37c5` (tree `cc2835cd15a0570e73a3421d0f89fe3ce3dfec11`), after `7dfbab4`, `4c2da6f` and a merge of `main` (#151's squash). Against `main` it changes `apps/studio/src/features/artifacts/` (`KnowledgeReports.tsx`, `SummaryEditor.tsx`, `artifacts.css`, and the new `ReportCover.tsx`, `report-cover.ts`, `report-cover.test.ts`), `apps/studio/fixtures/` (`report-data.ts`, `fixture-api.ts`, `demo-page.ts`), the new `apps/studio/e2e/knowledge-library.spec.ts` and `docs/plans/knowledge-library.md`. The commit after it changes only this file.

## Outcome

**The reports are tiles in a grid** (columns of at least 260 px: three at 1440 px, one on a phone).

**Each tile opens with a cover:**

- **A designed page:** its first screen, the page laid out at three times the cover's width and drawn at a third. The bytes are checked against the rendition's hash, as in the viewer. The frame has no permission at all (`sandbox=""`), and is `aria-hidden`, `inert` and out of the Tab order.
- **A Markdown report:** its opening as a sheet: the heading, the first words, the sections in mono labels. Drawn as text: no citation id, image or link address.
- **Lazy:** a cover reads once its tile is within 240 px of the screen, through the viewer's query keys (`report-versions`, `report-html`, `report-text`). The viewer then reuses the page and the text; it reads the versions again, as it always does.
- **Until it arrives,** a quiet plane. **A read that fails or doesn't match:** the format's monogram, and no tag repeating it.
- **A version the read doesn't hold** (published since): the versions are read again once, as the viewer does, before the monogram.

**Presses:**
- the cover of a designed page opens that page («Open {title}, HTML page»);
- anywhere else on the tile opens the report (the title's press takes the tile);
- Edit and History and changes keep their own.

**One meta line,** «HTML · v2 · 2 versions · Oct 1»: no «1 version», no «updated». With all projects shown, the project comes first.

**Four type sizes** in the tiles: 14, 13, 12 and 10.5, the app's tokens. Before: nine sizes in the view.

**No description is no one's:** «No description yet.» no longer sits over «Description by Sophia».

**Fixtures:**
- The older report serves its version and Markdown, so its cover reads them. The demo's version is the pilot's plan.
- The demo's designed page cites its sources with in-page links, as a compiled page does. Its hashes are recomputed: v1 `13065301…717d`, v2 `8f0f5f73…9a60`.

## Evidence

- **Tests first:**
  - `knowledge-library.spec.ts`: 11 checks failed before the change (8 of the first 9; then the no-description and monogram-tag checks).
  - `report-cover.test.ts`: the unit checks failed before `coverOf`, `metaOf` and `monogramOf`, and again before the sections and the Markdown cases.
- **Browser** (under the guard, one worker): `knowledge-library`, `report`, `project-carried-in`, `project-connections`, `room-passage` and `room-made`, 118 of 118.
- **Mutations:** two batches, each with an e2e control and a unit control that survive. Killed (18):
  - the frame allowed scripts, heard by readers, in the Tab order, or Tab into it;
  - a failed read that waits forever;
  - one version counted;
  - citation links, link addresses or rules kept; underscores anywhere; sections not marked;
  - a missing description credited;
  - Edit, or the cover's press, under the tile's press;
  - one column always;
  - the cover a quarter of its press;
  - the tag repeating the monogram.
- **Independent review** (a separate agent, read-only, before the review round): no P1, one P2 and six P3s.
  - **Fixed:** the P2 (links inside the frame could take the focus outside Chromium: now `inert`). Also the P3s on the re-read, the comment's claim about the cache, the Markdown cases, the CSS leftovers, the design note's meta size and the unit test's timezone.
  - **Left:** see below.
- **Codex on #152 (two P2s), fixed:**
  - A cover's versions were read again whenever the window came back, for every tile ever shown. They are now read once. A new check counts the versions reads after the window comes back: 2 before, 0 after.
  - With the versions already cached (the viewer's), an off-screen tile read its page or text. Both reads now wait for the tile's reach. No check covers this: the fixture's tiles all sit within reach.
  - Found on the way: opening the older report asked for its sources, which the fixture didn't serve. A new check opens it; it now reads an empty list.
  - `knowledge-library` and the Knowledge checks of `report`: 19 of 19.
- **Gates:** `tsc --noEmit`, `oxlint --type-aware` (sizes and complexity), Prettier.

**Source-register IDs consulted:** none.

## Remaining obligations

- **`inert` is not proved in Chromium:** there `tabIndex={-1}` already keeps Tab out of the frame. The new Tab check passes with or without `inert`; it guards Firefox and Safari, where the reviewer expected links inside the frame to take the focus.
- **The re-read of a missing version is not covered by a check:** the fixture has no card that names a version its list lacks.
- **The review's P3s left:**
  - no check that a tile off screen reads nothing (two tiles fit in the 240 px margin);
  - a cover's frame stays mounted once read, so a long list keeps every page it showed. Fixed after Codex's P2 on #152:
    the frame is mounted only while the tile is within reach, the page kept in the cache; checked by «a cover scrolled
    far away keeps no frame, and comes back without a new read» (14 passed; the mutant that keeps the frame is
    killed). Its «no new read» counts the fixture's reads of that page's source (`content:<id>` in `served`); a
    mutant that reads the page again every 300 ms is killed.
- **K2 next:** the filters and `/`, the reports before what was carried in, and the demo's fuller library.

## Next bounded action

Show Luis the captures. Merge #151 first; then retarget this to `main`, merge on green and no Codex P1.
