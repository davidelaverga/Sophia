# Search the project, every hit naming its source

> 2026-10-06 · Luis · PR 15 of the room's $20 plan, behind the vision flag (A13's `search`, issue #105) · "Construye todo y lo que no tenemos para api que se haga por fixtures"

## The gap, measured

«What did we decide about X?» has no answer in the Studio short of opening the brief, Knowledge and each meeting in turn. Cross-meeting Q&A with citations is a $20 table stake: Notion, Granola and Fathom search across meetings. A13 has the route: `GET /projects/{id}/search?q=&kinds=&cursor=`. Every hit names its source and opens it.

## What changes

**«Search» in the project's head** (the magnifier, key `/`), under the vision flag, opens a sheet: «Search this project».
- **Results:** typing two characters or more searches after a short pause. Each hit shows:
  - its title;
  - a snippet from the record itself;
  - where it is from, and when: «Decision · Oct 4», «Kept note · Oct 5», «Report section · Oct 5», «Meeting recap · Oct 4, 15:00».
- **«More results»** reads the next page.
- **No hits:** «Nothing in this project matches “…”.»

**A hit opens its record:**
- **a report:** the viewer, at that version;
- **a report section:** the viewer at that version, in its Markdown, scrolled to the section's heading, which takes the focus. The section is the viewer's own ask, placed once per press, so a second section of the open report is placed too. A repeated heading is named by its occurrence (`evidence#1`, the second). Closed, the report gives the focus back to Search.
- **a meeting recap:** «This meeting» for that meeting;
- **a decision or a note:** the room with the brief open.

**Who:** members. A guest's room (GuestRoom) has no project head, so no Search, and the API refuses guests (A13).

**API shape (proposed; not yet posted to #105):**
- `SearchPage { hits: SearchHit[], next: string | null }`.
- A report hit's `id` is the artifact, and `cite.recordId` is the version.

**Fixture:** it matches the query, ignoring case, against:
- the decisions of every meeting;
- the notes kept;
- the report's title and its sections;
- the meetings' recaps.

## Out of scope

- Sophia's `search_project` bridge tool (A13's S part: the runtime).
- Filters by kind: the API takes `kinds`, but this first search reads all of them.

## Checks (written first)

- **Browser** (`e2e/room-search.spec.ts`):
  - `/` opens the search. A query finds the decision with its source, and a report section;
  - the section opens the report at its heading, and the heading takes the focus;
  - a recap hit opens its meeting;
  - a decision opens the brief;
  - no hits says so;
  - «More results» reads the next page.
- **Units** (`search-view.test.ts`): each hit's source words.
