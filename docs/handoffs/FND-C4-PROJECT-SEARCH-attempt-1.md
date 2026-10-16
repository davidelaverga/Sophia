# Implementation-session handoff

Goal and attempt: FND-C4-PROJECT-SEARCH-01, attempt 1 (#365 section 5; `Refs #365 — section 5`)
Human owner / executor resource: Davide; lane C (Claude). Coordination by P, review by R and V, combined integration by
B, integration review by Luis.
Native session: Claude Code desktop session `local_557a0040-996c-4a7f-874d-01449e49b493`; no native runtime session.
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-project-search`, new branch
`api/project-search-20261016`, from the sealed C3b head `f3bfe5efd3e41c7a0b44bea41a8dd15493b43df1` (tree
`51e599c75c56931b9206999441852f08f8cd38f2`), unpushed.
Names: migration `0072_project_search.sql` and amendment `A38-project-search.json`, allocated by P (namespace rev6).

## Outcome

A project member can search the project's current words and open what was found, re-read and re-authorized as it
opens. `GET /api/v1/projects/{projectId}/search?q=&cursor=` serves, 20 a page, newest first:

- **Reports.** Each section of each Markdown report's current version, by its heading and its words, named as the
  viewer names it (`costs`, `costs#1` for the second). The report itself is found by its title and the text before its
  first heading.
- **The brief.** Current notes, and decisions that are proposed or accepted.
- **The chat.** Current messages, written or shared: each found by exactly the words the chat shows this reader.

The search is lexical. Each typed word is a prefix, every word is required, and at most eight are used. There is no
ranking model, embedding, provider, index or copy of any text.

Opening a hit:

- a section opens the report viewer at that version and heading;
- a decision or a note opens the brief;
- a message opens the room's chat at it.

## How it is authorized (P's accepted design)

- **No definer.** The search is one parameterized statement in `packages/persistence/src/search.ts`, run in
  `withActor(…, 'read')` as `sophia_api`. Every row passes the member's own RLS, as the chat (`DISCUSSION_PAGE`), the
  brief and the report viewer read them.
- **Explicit predicates as well.** The project on every join, the states, and the source rule `owner OR (project,
  eligible, ready)`.
- **What 0072 adds.** Only `markdown_section_texts(text)`, a copy of 0036's splitter loop that also returns each
  section's body and the repeat number of its anchor. It is IMMUTABLE and SECURITY INVOKER, and reads no relation.
  The API role may execute it and the pure `heading_anchor` it calls. Applied migrations are unchanged.
- **Messages.** Both written and shared ones are matched on the body `DISCUSSION_PAGE` gives this reader. A shared
  report or file is found only while this reader can see its source. The same words may also be found as the report's
  section: both are places the reader can see.
- **Bounds.**
  - `q` is at most 200 code points (schema), and each kept word at most 64. Longer is 422 `invalid_request`, with
    the reason said.
  - Under two characters once trimmed, or nothing searchable, gives 200 with no hits.
  - The statement has a 2 s timeout, so it fails as 503, never hangs. No latency promise is made beyond that.
- **The cursor.** Version 2, opaque, ordered by the key (time in µs, kind, record, section). The record is the version
  id for reports, and the section is the splitter's `ord`. The key is unique, and the cursor is bound to its project
  and query hash; any other cursor gives 422.
- **A message's `before`.** The contribution just after it, in any state. `readDiscussion?before=` with it reads the
  page that ends at the hit.

## Studio (feature OFF by default)

- **The flag.** `VITE_SOPHIA_SEARCH=1` (`src/app/search.ts`) offers Search in the project's head and serves it through
  the generated A38 validator (`api/search.ts`). Set it only after 0072 and A38 are deployed. It is off everywhere but
  the fixture pages. The vision flag keeps the A13 proposal it already had (recaps included), which the fixture pages
  answer.
- **A message hit.** It opens the room's chat on `#message-<id>`, with the hit's `before` remembered
  (`message-before.ts`).
- **When the message isn't shown.** The chat makes one A23 read, `before=<before>`: the page that ends at the message.
- **Gaps.** The chat keeps what reads showed of the order, each message's next one: a page's messages are
  consecutive, its last one's next is the message it was read before, and the window's are consecutive. Wherever the
  next message shown is not the one a read showed, messages between were never read: a gap line «Newer messages
  aren't shown here. Show them». Each press reads one page under that gap (A23, before the message just after it).
  Every unread interval keeps its own line however many pages were read, in whatever order (`segment-view.ts`; R-C4-01,
  below).
- **Failures.** If the page read fails: «The message you opened couldn't be loaded.» with Try again. Nothing more is
  read and nothing is acknowledged until it is shown. Not in that page: «isn't in the chat anymore».
- **Unchanged.** A message opened any other way (a mention from Home, a link) keeps C3b's look of at most four pages.
  A mention is still acknowledged only on its current shown revision and occurrence, once readable in the open chat.
- **Shared files** (declared; B integrates):
  - `ProjectShell.tsx`, `Conversation.tsx`, `EarlierDiscussion.tsx`, `useMentionAttention.ts`, `mention-view.ts`;
  - `SearchSheet.tsx`, `search-view.ts`, `api/vision.ts`, `theme.css`, `vite-env.d.ts`;
  - the fixtures `fixture-api.ts`, `room.tsx`, `search-data.ts`;
  - the Studio's `tsconfig.json` (the served check's two configs and `e2e-served/`, which CI's Playwright config does not
    run);
  - persistence `artifacts.ts` (`searchWords` factored out of `searchQuery`, same behavior) and `index.ts`;
  - API `app.ts` (route and readiness);
  - contracts `generate-validators.ts`, `validate.ts` and the generated outputs.

  Luis's #384/#402/#406 UI is not imported.

## Evidence (local; the exact numbers and log hashes are in the journal's C4-project-search-handback.txt)

- **Real restricted-role PostgreSQL 17.11** (owned, port 55498), signed API and generated parser.
  `apps/api/src/search.db.test.ts` has 11 cases:
  - report words, repeated anchors, the fence, the preamble and the title;
  - superseded words not found;
  - notes and decisions, with forgotten, rejected and withdrawn-with-note negatives;
  - per-reader chat visibility: written, corrected (old words gone), withdrawn, a shared project report, a private
    source (owner only, with the same chat read compared), ineligible, and RLS as `sophia_api`;
  - foreign, non-member and removed member (403);
  - cursor: 45 sections of one version 20/20/5, equal times across kinds and artifacts, 1 µs neighbors, malformed and
    foreign q or project (422);
  - bounds: 200/201 characters and emoji, 64/65 word, nine words, empty;
  - `before` any state;
  - splitter parity with 0036 and the viewer's `sectionsOf`;
  - catalog: no definer, pure, grants, and the migration adds no table, index or write.
- **Neighbors.** readiness (not ready without 0072), knowledge, mentions, contribution-acts, needs, access, api,
  profile and mission.
- **Mutation checks** fail as they should: the section part dropped from the key, and the cursor time rounded to ms.
- **Browser** (headless synthetic fixture on 5198/5199, granted to C4 by P). `e2e/project-search.spec.ts`:
  - a section opens at its heading;
  - a message beyond the chat's 200 gets exactly one A23 read, the segment, the start, the gap line and filling a page
    per press until it meets the segment, with its mention acknowledged once;
  - the newest message is found in the window with no read;
  - the found page's read fails: failure and Try again, one read, no acknowledgement;
  - nothing found versus a failed search, and Try again.

  The nearby room, search, mentions and chat specs pass too. Before-evidence: with the search's hint ignored, the 200+
  case fails (C3b's four-page bound cannot reach it).
- Lint, format, typecheck, contracts and units are clean, and artifacts reproduce (bundle unchanged).
- **Skips, classified from the raw logs (corrected; none counted as passed).**
  - The ordinary `pnpm check` integration run reported 2 skipped. Its raw skip markers are crossings that need a
    disposable PostgreSQL (`SOPHIA_DISPOSABLE_DATABASE_URL`: design capture, render supervisor, runtime service) and
    the log-compat export/import, which needs a second runtime unit.
  - The «confined renderer runs on Linux only (here: darwin)» skips are in the unit run, among its 70 skips, with the
    LiveKit-server tests.
  - The first handback attributed the integration skips to the darwin renderer. That was wrong.
- **Excluded, kept visible.** The first `pnpm test` in the fresh worktree failed 13 `tests/unit/*.mjs` on a missing
  `packages/dsh-bundle/dist` (not built yet); after the build, 0 fail. The first lost-part mutation had a SQL syntax
  error (503) and proves nothing; it was redone.

## Limits

- **Not deployed.** The flag is off, nothing is pushed, and no CI or automatic review has run on this head. The
  synthetic fixture is not production acceptance, and no provider, inference, credentials or spend were involved.
- **No index.** Every request scans the project's current visible texts under the statement timeout. A GIN index waits
  for timing evidence.
- **Viewer `#n` in the browser.** The fixture report has no repeated heading. Repeated anchors (`#n`) are proven on
  the server and by splitter parity with the viewer's `sectionsOf`, not by a browser case.
- **A message withdrawn between search and open.** Unit-tested (`nextLook`: not in the read page, gone), not exercised
  in the browser fixture.
- **Snippets** are the stored words around the match, Markdown included; nothing is rendered or highlighted by the
  service.
- **Not searched:** recaps (A12 unserved), saved conversations (CON, B's), Personal and other projects.

## Gap and served-path closure (FND-C4-GAP-SERVED-CLOSURE-01; R-C4-01 and C4-SERVED-PATH-PENDING)

The evidence below is for the commit that carries this section. Studio only: no server, SQL, A38, generated, native,
profile or lock byte changed from `d5c32e68`.

- **R-C4-01, P2: an unread interval lost across sequential opens.**
  - Reproduced in the browser first, on `d5c32e68`'s chat: 260 messages; open the hit at 100, then 125, with the gap
    not filled. The second page (76–125) overlapped the first, the only gap was cleared, and 51–125 showed straight
    above 211–260, with 126–210 never read and no Show them.
  - A disjoint second open (150, then 40) lost the gap above 211.
  - Log `browser-gap-before.keep.log`. In the disjoint case the run stopped at the first missing gap; its later steps,
    whose expected order was itself wrong (151–160 stay unread after one press), never ran.
- **The repair.** The single gap is replaced by what reads showed of the order (Gaps, above). A gap closes only when a
  read shows a message's next one to be the next shown.
  - Overlap with another page never implies continuity to the window.
  - A disjoint open keeps both intervals.
  - «Earlier messages», the window's moves, the once-address look and the mention rules are unchanged. There is no new
    load and no automatic read.
- **The served path.**
  - `vite.served.config.ts` serves the existing room fixture page with `VITE_SOPHIA_SEARCH=1` and the vision flag
    off. `playwright.served.config.ts` runs `e2e-served/` on 5198.
  - Without the vision flag the fixture answers strict A38 pages: each hit with its hash, no meeting, no recap, and a
    message's `before`. `searchAsProposed()` answers once as the A13 proposal.
  - The Studio searches through `searchServed`, `callApi` and the generated `parseSearchPage`.
- **Checks.**
  - The served spec, 6 cases:
    - the endpoint and the query, then the cursor (`?q=Message+1`, `?q=Message+1&cursor=3`) as sent;
    - a section opens at its heading;
    - an A13 answer refused by the generated parser («The search couldn't be read.»), then Try again;
    - a found message beyond 200: one read, and the mention on the revision shown acknowledged once;
    - 100 then 125: one gap, filled from 211 then 161;
    - a disjoint 150 then 40: two gaps, each filled from below (211, 161; 101, 51);
    - the found page's read fails: one read, nothing acknowledged, Try again.
  - A negative control: the same spec with the vision flag set fails its refusal case, so the served build is the one
    under test.
  - `e2e/project-search.spec.ts` gains the same sequential and disjoint cases on the vision fixture, and the unit test
    `segment-view.test.ts` traces both.
  - The C3b and search neighbors pass.

## Concurrent reads (FND-C4-CONCURRENT-READ-CLOSURE-01; R-C4-02)

The evidence below is for the commit that carries this section. Studio only: no server, SQL, A38, generated, native,
profile or lock byte changed from `284cce2e`. This is the final consolidated C4 exchange.

- **R-C4-02, P2: a slow read overwriting another.**
  - A page that answered used the held state captured when its read began, so a read that answered meanwhile was
    lost.
  - Reproduced in the browser first, on `284cce2e`, with a fixture hold of chosen earlier reads (`holdEarlierBefore`,
    `releaseEarlierReads`). 260 messages; open 100:
    - **Order A:** Show them is held (before 211); open 40 answers. When the fill is released, message 40 is gone.
    - **Order B:** the open for 40 is held; Show them answers. When the open is released, 161–210 are gone.
  - Log `browser-concurrent-before.keep.log`.
- **The repair.** A page is added to the held state as it is when the page answers (a functional update):
  - what other reads brought stays, with their links;
  - the start, once read, stays read;
  - the window is the one now, not the one when the read was asked, and goes last as the latest;
  - an entry is never replaced by an older revision of itself.
  - The window's authority over its span, withdrawals, the once-address look, one page per press, and the current
    revision and visible-Need ACK are unchanged.
- **Checks.**
  - Both orders, in the vision fixture spec and in the strict served (SEARCH=1, no vision) spec: the target and both
    pages stay; gaps after 40 and after 100; the start shown; three reads, one per press or open.
  - The serial, disjoint, failure and mentions neighbors pass.

## Next bounded action

Stop at the local seal. R or V review the exact head, and B integrates on common main. C5 (human tasks) waits for its
own packet.
