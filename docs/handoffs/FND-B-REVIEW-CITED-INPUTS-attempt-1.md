# Implementation-session handoff

Goal and attempt: FND-B-REVIEW-CITED-INPUTS-01, attempt 1. Review sources offers, beside a chosen report version, the
sources it cites, for the person to choose explicitly.

Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`). Packet `8a373864…`, P binding
`2139fdd5…`, namespace census `40a28361…` (highest existing: migration 0081, amendment A42), R2 boundary result
`cc0510fa…`.

Names reserved by P:
- `db/migrations/0082_source_review_cited_inputs.sql`;
- amendment A43 (`A43-source-review-cited-inputs.json`).

The existing GET `/api/v1/projects/{projectId}/plans/source-review` and `sophia.source_review_availability` are reused.

Start: `9aa70441` (stacked on PR480, frozen), branch `fix/source-review-cited-inputs-20261024`.

## The gap

- A review reads only the sources its plan names (0042). The entry offered report versions alone, so a review of a
  report could never read the evidence the report cites.
- The proposal already admits any one to three released, eligible, ready project text sources within 32 KiB. Only the
  offer lacked them.

## The change

- **A43** (canonical first, then regenerated):
  - `SourceReviewCandidate.supporting` (at most 50, always present);
  - `SourceReviewSupportingSource` (`sourceId`, `label`, `mime`, `byteLength`);
  - the GET summary.
- **0082** replaces `source_review_availability` with the same signature, owner and grants.
  - Each offered version lists the sources it cites as recorded. That is the `source_dependencies` research_publish
    writes per citation, derived from the version's own source (every later version kind reuses that source; nothing
    else is ever derived from it).
  - A source is listed only while the caller may read it now: a member, project scope, eligible, ready. This restates
    `eligible_sources_read`, because the function runs as its owner.
  - And only while a review may read it now: `review_source_readable` (with text, nothing in its closure withdrawn),
    at most 32 KiB.
  - Never listed: a cited source that is itself a report version.
  - Labels come from recorded origin (a project note's kind, a read page's host, search results, an admitted input,
    the research question), never from the text.
  - Sources are named by source id only, never by an entry or version id.
- **Studio** (`ReviewSources.tsx`, `review-sources.ts`):
  - A chosen report shows "Sources it cites", none checked.
  - `stillChosen` keeps a cited source only beside a chosen report that is still offered. Letting the report go, or the
    service no longer offering it, drops what it cites. Nothing hidden or stale is counted or sent.
  - The 3-source and 32 KiB checks count cited sources the same way.
- Unchanged: the proposal, its decision and every guard; the POST's semantics and caps; source release and admission
  rules; the runtime.

## Evidence (journal `B-REVIEW-CITED-INPUTS-01-logs`)

- **Old FAIL, same final test bytes:**
  - Real PG/API on the old contract and SQL (no 0082 or A43): the offered report has no `supporting` (35).
  - Old `ReviewSources`: the three A43 browser controls fail (38).
- **Fixed:**
  - the real PG/API case (36); `coordination.db.test.ts` 54/54 (45); `test:sql` with 82 migrations (43);
  - the Studio A43 controls with their neighbours (40); the related Studio specs 270/270 (41);
  - the helper unit tests.
- **The real-PG case covers:**
  - a note's source offered, its entry id never;
  - an admitted input and a plain citation offered;
  - excluded: over 32 KiB, no text, a cited report, uncited, another project's;
  - a report citing a withdrawn, indirectly withdrawn or private source is not offered at all (0033's closure);
  - forgetting a cited note withdraws the report from the offer;
  - the proposal: a report plus a cited source is admitted by source id, an entry id is refused 403, four sources 422,
    a stale goal revision 409.
- **The browser cases cover:**
  - nothing cited is shown before the report is chosen, and none is checked;
  - 32 KiB and three-source limits;
  - the exact ids sent, once, with no automatic resend;
  - a report let go takes its cited choices with it;
  - a report the service stops offering leaves with what it cites.

## Limits

- The Studio witness runs on the Vite fixture page, not on built bytes, and is not production acceptance.
- Nothing proves any production fact: whether the prose-cited id exists, its source mapping, its recorded edge, its
  eligibility or its size.
- No source release or consent policy is added: a private or withdrawn source stays unreviewable.
- The old browser run fails the stale-offer control at its first step (no cited group exists), so its pruning step is
  witnessed old-vs-new by the unit tests.
