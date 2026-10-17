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

## Next bounded action

B's private handback goes to P; R reviews the composition and the SQL closure. No push until P selects one
publication.
