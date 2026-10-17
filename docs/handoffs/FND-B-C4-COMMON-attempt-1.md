# Implementation-session handoff

Goal and attempt: FND-B-C4-COMMON-01 (the project's search on the qualified C1+C2+C3 common line), attempt 1, with
P's focused addendum for R-C4-SQL-01.
Human owner / executor resource: Davide (product, merge and production decisions); Luis (UI acceptance) / Claude Code
session (Claude B) on Davide's Mac, coordinated by P.
Native session: none (a coding session, not a runtime attempt).
Starting worktree/commit: `sophia-search-common`, branch `foundation/search-common-20261017`, new from the qualified
common `7a7c43e75a3dc935a2892dea9eb6594d4677572e`.
Ending commit/tree: in B's private handback (a commit cannot name itself).
Writable scope: one normal merge of C4's sealed `445d782a` (0072/A38), its conflict resolutions, the source-authorized
0072 correction, test-only byte-backup failure diagnostics, the served search cases and this record. No other SQL,
name, dependency or authority change; no C5, B2, Personal or main import.
Runtime unit: none run. Existing authority: P's packet and addendum; fake actors and owned loopback services only.

## Outcome

- **The merge.** One merge onto the common line, both parents kept. Conflicts resolved as unions:
  - the search flag beside the others; the Studio tsconfig's configs and spec directories; ProjectShell's imports;
  - the contract outputs regenerated from every amendment (A33, A15/A34, A36, A37, A38).
  - The donor's strict synthetic search check is segregated as `playwright.search.config.ts`, `vite.search.config.ts`
    and `e2e-search/`. The real-App `playwright.served.config.ts` keeps its listening-API meaning, now with
    `VITE_SOPHIA_SEARCH=1`.
  - C1/C2/C3 migrations and amendments and canonical 0058 are unchanged.
- **0072 (R-C4-SQL-01).** The unchanged `test:sql` failed on 0036's own security test: 0072 granted the API role
  EXECUTE on 0036's private `heading_anchor`, because its new formatter called it. The donor alone failed the same
  way; the base passed.
  - Source-authorized correction, in unapplied 0072 only: the formatter computes each anchor with 0036's expression,
    copied byte for byte (textually identical, parameter aside), and 0072 no longer grants the old helper.
  - Unchanged: 0036's migration and test, the old helper's definition and ACL, the formatter's grant, PUBLIC revoke,
    IMMUTABLE, SECURITY INVOKER and fixed search path. No new name or function.
  - 0072's blob goes from `6623428d` to `1e2be844`.
- **Byte-backup failure diagnostics (R-C3-BACKUP-01).** Test-private only: the two-put test reports, on failure,
  both rejections (name, status, code, message without paths), the time, and the journal rows, file and remote
  digests. While a test sets one environment-data key, the reservation worker and its wrapper also report their
  stages (handled catch, deadline, admission, exit) on a channel of that name. Production never sets it; the public
  503 mapping and the exactly-one and winning-bytes assertions are unchanged.

## Evidence

Node 24.21.0, pnpm 11.7.0, private PostgreSQL 17.11 UTF8 (fresh, removed after).
- Format, lint, typecheck, contracts and the toolchain check pass. Artifacts reproduce unchanged: bundle
  `sha256:e956becc…`, lock `b868da08…`, darwin dsh `e24cb887…`.
- Units, the one ordinary run with the diagnostics armed: 3046 passed, 0 failed, 70 skipped. The two-put case passed
  (141 ms) and reported nothing. The original failure's cause stays UNKNOWN.
- `test:sql`: failed before the correction (`heading_anchor` callable); after it, 69 migrations and all 5 files pass,
  0036 included. `test:db` (before the correction): 1036/1036. Search and readiness DB tests after it: 13/13.
  - The parity case now also covers a byte order mark, no-break spaces, a tab, punctuation, edge hyphens and an anchor
    repeated by different words: the formatter matches 0036's outline and the viewer's sections.
  - The API role still calls the formatter; the old helper is callable by neither API, worker nor PUBLIC; the formatter
    calls no private helper. Before the correction that case failed on the call.
- Real API (normal App → listening API → restricted PostgreSQL, synthetic HS256; VISION off; search, conversations,
  attention, message acts and mentions on), under the statistics control below: 27/27.
  - The 20 earlier C1/C2/C3 journeys.
  - Search:
    - a message, a note and a decision found, and the message opened in the room;
    - an older message beyond the chat's latest window found and opened;
    - a corrected message found by its new words only, a withdrawn one not at all;
    - More results reading the next page by its cursor;
    - a non-A38 answer refused with Try again (the answer replaced in the browser);
    - an outsider refused by the API.
  - A report section's hit opens the report at that section, the second of its name (`costs#1`). The report is seeded
    on the owned database as its producer writes it (`seed-report.sql` in B's logs). Its first seed lacked the change
    facts publication writes, and the versions read refused to serialize it.
- Fixtures: the segregated search config 8/8; C4 and its neighbours 103/103; C1 and C3 neighbours 271/271.

## Failures kept

- **A C1 served case, run 42:** the conversations list showed before any API request was recorded. The case now waits
  for the A33 response before its unchanged request assertion. Its search-absent line now expects A38's own Search
  and no VISION-only read.
- **The A34 served case, runs 46–52, five times:** the project it seeds with 510 messages never loaded its snapshot.
  - Eleven discussion reads (`actor_label` over contributions) were found running on the test cluster for 25 s to
    over 7 minutes, never finishing; they were terminated.
  - Timed directly, the same snapshots took 4.0 s and over 60 s (`revisions=1`) just after seeding, and 0.04–0.15 s
    after the tables were analyzed. `auto_explain` caught no completed slow statement.
  - With `ANALYZE` every second during the run (an owned-database control), the case passed in 1.3 s, and the whole
    suite 27/27.
  - Association, not proof: the read is reached by unchanged code since `7a`; whether `7a` behaves the same in that
    state was not run. No query, timeout or test was changed for it.

## Limits

- The report is seeded owner-side; producing one through a real task was not exercised.
- No viewer identity in dev-db.
- PostgreSQL 16 exclusive groups are unchanged and not run.

## Search read fence (FND-B-C4-SEARCH-READ-02, R-C4-SEARCH-READ-01)

The sheet's infinite query kept its pages cached when this person's own next read was refused (401, 403). The hits'
words, their presses and More results rendered from that cache next to the alert, while the project itself stayed
healthy.
- Before, reproduced on `113c` with the normal App, listening API and restricted PostgreSQL: page 1 was read (20 hits,
  More). Only the next search read was then refused 403, replaced in the browser by `page.route` (synthetic over the
  real App, API and database). The sheet said «The search couldn’t be read.» and still showed all 20 hits.
- Now each page carries when its read was set out (`searchOrder`, a page-local counter, as Updates' `sinceOrder`;
  never the clock). A refusal seen is kept in the account's query cache, per project (`['vision', 'search-refused',
  id]`), as later than every read set out before it.
  - The sheet shows no page, no press and no More while refused, and none read before the last refusal, whatever
    comes next: a later 503, an older read answering late, the sheet opened again, the query typed again, another
    query's answer (`shownPages`). Nothing found is not said over them either.
  - A read set out since the refusal, and allowed (Try again, or a new query's own read), shows its current results.
- Unchanged:
  - Without a refusal, a failed page keeps the pages read, with the alert and Try again.
  - The project shell; other projects and accounts; A38's parser, cursor, pages and opening paths. The real nonmember
    403 stays its own API case.
- After:
  - The served case passes: hidden after the 403, through a 503, Escape and Search again, and the query typed again;
    then a fresh allowed read gives 20 hits and More. A served case without a refusal keeps its 20 hits.
  - Unit and state checks run TanStack's own infinite observer on one account's cache: 403 on the next page; 401 with
    an older read answering 200 after it; another query; another project; another account's cache; the clock set
    back. With the fence removed, 5 of them fail.
- Checks:
  - `pnpm check` passes: units 3056 passed, 0 failed, 70 skipped; integration 108 passed, 2 skipped; the artifacts
    reproduce unchanged.
  - Served C4 9/9 (the report section seeded as before), with the two new cases repeated once. The segregated search
    config passes 8/8, and C4 and its neighbours 103/103. The other served journeys were not rerun.
  - The first lint failed on the sheet's complexity: the fence now sits in its own hook. Everything above ran after
    that change.

## Next bounded action

B's private handback goes to P; R reviews the composition and the SQL closure. No push until P selects one
publication.
