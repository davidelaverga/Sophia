# Implementation-session handoff

Goal and attempt: search the project, every hit naming its source (`docs/plans/room-search.md`), attempt 1. It is PR 15 of the room's $20 plan, behind the vision flag (A13's `search`, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/search` on `room/so-far` (#120), 2026-10-06
Ending commit/tree: the content commit «Room: search the project, every hit naming its source (A13 on the fixture, behind the vision flag)», the parent of this handoff's commit.

## Outcome

**«Search» in the project's head** (the magnifier, or `/`) opens «Search this project».
- **Results:** typing two characters or more searches after a short pause. Each hit shows its title, the record's own words (when they say more than the title) and where it is from: «Decision · Oct 4», «Meeting recap · Oct 4, 15:00».
- **Paging:** «More results» reads the next page.
- **No hits:** said, naming the query. A status line announces the count.

**What a hit opens:**
- **a report section:** the viewer, at its heading, which takes the focus. A second section of the open report is placed too. A repeated heading is named by its occurrence.
- **a recap:** that meeting's sheet.
- **a decision or a note:** the room, with the brief open.
- **On closing** what a hit opened, the focus returns to Search.

**Structure:**
- The project's sheets that belong to no view (the recap on leaving, the meeting so far, the search) render in `ProjectSheets`.
- RecapSheet knows from the recap itself whether the meeting is running.

**API proposals (#105):**
- `SearchPage { hits, next }`.
- A report hit's `id` is the artifact, and `cite.recordId` is the version.
- A repeated section's anchor carries `#n`.

**Independent review, three passes:**
- **First pass:** one P1: a second section in the open report was never placed, because the ask was read from the address only when the pane mounted. It also found three P2s:
  - a running recap opened from search let a second sheet stack;
  - the focus was lost after a report opened from search;
  - repeated anchors went to the first heading.
- **First-pass P3s:** placeholder data, `/` with nothing shown, a recap hit's id, the brief's opener, the announced count, JSDoc and `LazyInvite`.
- **The fixes:** all of these. The section became the viewer's own ask, placed once by its number, and a section opens in Markdown.
- **Second pass:** one new P2, an earlier ask placed again on a later open. The ask is now cleared by an open without one, and by a close.
- **Third pass:** no P1 or P2.
- **P3s left:**
  - the focus after the last page;
  - a missing section saying so;
  - the reopen check is negative (no section focused) rather than positive (the title focused).

## Evidence

Runs used the guards' gentle mode. The last ones ran beside Luis's games at Idle priority, on his word.

- **Units:** `search-view.test.ts`, 1 of 1.
- **Browser:**
  - `room-search.spec.ts`: 6 of 6;
  - with report, passage-link, updates and recap: 94 of 94, then 66 of 66 after the last fix.
- **Mutations** (`light_mutants.py`): 9 of 9 killed:
  - a section opened at the top;
  - only the first ask placed;
  - no focus on the heading;
  - a recap hit opening nothing;
  - no brief;
  - no next page;
  - no focus in the field;
  - nothing found saying nothing;
  - the focus lost after a report.

  The control survives. The two guards that clear a stale ask (on open, on close) each survive alone, because on the checked path either one is enough. Without both, the check fails. They cover different cases: opening another report, and Back.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.
- The fixture server ran directly, with `node node_modules/vite/bin/vite.js --config vite.fixtures.config.ts`.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:**
  - A13's `search` route and its shapes (#105);
  - Sophia's `search_project` bridge tool (A13's runtime part).
- **This PR** awaits #120, CI and Codex.

## Next bounded action

A14 on the fixture, behind the flag: Sophia walks through the report she shows, and «2 following».
