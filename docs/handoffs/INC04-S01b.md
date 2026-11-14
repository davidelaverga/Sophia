# Implementation-session handoff: INC04-S01b

**Slice:** the trusted read-only selection preview (migration 0104, amendment A56). Plan: [docs/plans/selection-preview.md](../plans/selection-preview.md).

| Item | Value |
|---|---|
| Author | the SAME Routing/Personal Claude Code session, session_01FGXfrGsUA6jNm3sxRoSro2 |
| Base | `6ebf45e3`, sole parent `865401b7`; imported from the root bundle into a private ref |
| Branch | `inc04-s01b-trusted-snapshot` |
| Lease | 25 paths, plus `db/tests/0094_api_contributions.sql` by root addendum fbf014ea (26) |
| Toolchain | Node 24.21.0, pnpm 11.7.0, frozen install |

## Outcome

`GET /api/v1/projects/{projectId}/selection-preview` returns the INC-04 kernel's viewer-safe projection for a new standalone research request. It is derived only from authenticated current records in one read-only snapshot, and it has no effect.

A legitimate positive preview needs two facts. Both are added, and both are owner- or operator-controlled:
- the owner's protection declaration on the API account;
- the operator's account-scoped qualification.

Without them every candidate fails closed with a specific reason.

## Evidence

Raw logs are kept outside Git. Every check ran against an owned disposable PostgreSQL 16 cluster. The tests use synthetic records only.

## Decisions and changes

- **Migration 0104:**
  - protection fields on `api_accounts`;
  - `api_account_update` and `api_contributions_mine` replaced (same signatures; marked lines only);
  - `api_account_qualifications` with its operator functions;
  - private at-time helpers;
  - `selection_snapshot` (EXECUTE: sophia_api only).
- **A56:** the preview path; the `SelectionView`, `SelectionViewCandidate`, `SelectionViewProposal`, `SelectionSettings` and `SelectionLimitation` schemas; the account patch `protection`; the owner-only readouts. Generated normally.
- **No unions of objects.** `SelectionView` and its proposal are single closed objects chosen by `if`/`then`, because a tolerant reader would drop fields while trying the wrong branch of a union.
- **`db/tests/0094`:** the runtime_instances selector guard recognises FROM or JOIN and classifies `selection_runtime_ready_at` as scoped. A finite inspection found no other unclassified old selector.
- **Unchanged:**
  - old migrations, amendments and admission;
  - the kernel;
  - `routes/api-contributions.ts`;
  - flags, config, Studio and UI.
- **Strict settings:** null with no disclosure. This says nothing about the separate kernel strict-settings finding (Host R5).

## Remaining obligations

- Independent whole-source CORE and PRE.
- Publication, CI and human review.
- The later coherent join with A3 (0103/A54/A55) and the Host's R5 kernel repair.
- S02 atomic binding, S03 observations, S04 editor, S05 real episodes.
- Live owner, account, native, deployed and app qualification.
- All 18 AC-04 cases.

## Next bounded action

Root's independent review of this candidate.

## R1 chronology: uniform verified-viewer privacy (appended; the text above is unchanged)

- **Origin:** root's whole-source CORE `5baaa07a` on e3a72b10 (whole 278) found F01, P2. A current viewer got restricted 200 at 0 or 200 hidden candidates but 503 at 201, which disclosed the pool threshold. Root adopted it in `a59d822a`. The e3 ordinary (12:06:29–12:26:21, both exits 0, FINAL `04ba8609`) is preserved unchanged.
- **Lease:** INC04-S01B-R1-VIEWER-PRIVACY-REPAIR-001, at most six existing paths.
  - **Branch:** `inc04-s01b-r1-viewer-privacy`, the sole child of e3a72b10.
  - **Plan:** sealed before any edit (sha256 `3a23e1f6…`).
- **Change:** `previewSelection` returns the kernel's restricted view to a current viewer before the pool is read. The editor's 201 stays `projection_unavailable`. The route no longer checks completeness itself. Each path is listed in [the plan's R1 section](../plans/selection-preview.md).
- **Not changed:** SQL and SQL tests, GEN and contracts, dependencies, config, the Map, the kernel, Studio and UI, authorization policy, the operator recording functions, and native as-of precision.
- **Exact limits:** response timing still depends on the pool size (SQL, not leased).
- **Corrected metadata (it supersedes the earlier wording above and in my packets):**
  - The inherited kind-only manual-provenance finding is **PR517** (comment 4562616410), not "PR516/Host R5".
    - Its fix is the separately accepted R5 `89aebbc1`. It is NOT in this ancestry and must join later in its own coherent candidate, with fresh checks.
    - This slice's strict-null, no-disclosure path does not clear that hold.
  - `qualify_api_account` and `revoke_api_account_qualification` are SECURITY INVOKER functions, with EXECUTE revoked from PUBLIC. No application role (sophia_api, sophia_worker) can run them; the migration owner runs them. "Migration owner only" above means exactly that.
- **Still open:**
  - the 6ebf manual-origin hold and the later R5 `89aebbc1` join;
  - CORE and PRE of this candidate;
  - publication, CI and human review;
  - live owner, account, native, deployed and app qualification;
  - all 18 AC-04 cases and the RTA release.

## Coherent join with R5 (appended; the text above is unchanged)

- **Lease:** INC04-S01B-COHERENT-89-D939-IMPLEMENTATION-001, by the Host. Source composition only: no push, PR, CI, merge to main, release or activation.
- **Inputs, in parent order:**
  1. the published R5 kernel `89aebbc1ac37ca90927ed6cef2a4676e8a9c1182`, whose source FINAL and operative CI are accepted;
  2. this slice's R1 `d9392efd5a2bddd7dc44e83e67d5b91926d1f48e`, whose bounded CORE and PRE are accepted, with the kind-only manual-origin hold still open on it.

  Their merge-base is `6ebf45e3`. The R1 commits came in through a reviewed bundle into a private ref.
- **Composition:** an ordinary `git merge --no-ff --no-commit` of d939 onto 89.
  - It had no conflict and produced exactly root's read-only preview tree `09910189`.
  - Outside this file, every source entry equals that tree. The three R5 kernel paths come from 89, and everything else that changed comes from d939.
  - The normal contract generation (`pnpm --filter @sophia/contracts run generate`) left the four generated outputs byte-unchanged. A56 is the only contract change, and R5 changes no contract.
  - Studio, its default-off native-resources flag, SQL, migrations, amendments, the kernel, the API, persistence, config, dependencies and the Map are exactly as in the parents.
- **What this joins:** the R5 manual-origin fix (a manual disclosure bound to its request revision and current read) is now in the same source as the selection preview. The preview always passes strict settings `null` with no disclosure, and that is unchanged. The kind-only manual-origin hold carried from 6ebf is addressed in this candidate's source by the joined fix, subject to this candidate's own review; the earlier records above stay as history.
- **Not joined here:** the Personal reader (9e, A55, 0103). It awaits its owner decision. Numbering keeps its known gaps (0103, A54, A55); nothing was renumbered or invented.
- **Checks, evidence and limits:** this candidate's own checks, commit identity, ordinary run and their limits are recorded in its external evidence packets, not here. Evidence from either parent proves nothing for this candidate beyond its exact unchanged bytes.
- **Still open:**
  - independent CORE and PRE of this candidate, its publication, CI and human review;
  - live owner, account, native, deployed and app qualification;
  - all 18 AC-04 cases and the RTA release.

## R2: the viewer boundary in SQL and the installed contribution schema (appended; the text above is unchanged)

- **Lease:** INC04-S01B-R2-SQL-VIEWER-INSTALLATION-001, by the Host: at most 13 listed paths, the sole child of the published coherent `950d72fac89347f1c615aa5e605ef65fa6312bd6`. Source repair only: no push, PR, CI, merge to main, release or activation. The PLAN was sealed before any edit.
- **Findings repaired** (root SOURCE_FINAL `971db26e`, NEEDS_REVISION; addendum `a11e15e1`):
  - **F01** (reported P1, comment 4564324297; confirmed as a narrow dependency/control gap). 0104's snapshot did the viewer's private pool work before TypeScript restricted the viewer. The reported P1 stays unresolved until its own review; no leak, pool 503, exploit or timing result was observed.
  - **F02** (P2, comment 4564324310). With contributions on, `/ready` and the routes' installation check omitted 0104, although A56's protection patch needs it.
- **Change:** each path is listed in [the plan's R2 section](../plans/selection-preview.md).
  - New migration 0106: the role is decided first, a non-evaluator gets a restricted snapshot, and a private installed marker is added.
  - An internal full/restricted snapshot union, narrowed by every caller.
  - The preview requires the marker.
  - One contribution installation predicate (0094, 0100, 0104, 0106), shared by the routes and `/ready` when contributions are on.
  - New SQL and API DB tests; the unit and persistence tests narrowed honestly.
  - Routing's 0105 and contribution-admission files are not touched. The persistence snapshot DB test was edited under Routing's recorded ownership transfer.
- **Not changed:** migrations 0001–0104, amendments, GEN and OpenAPI, the kernel, Studio and UI, the Runner, flags, config, dependencies and the Map. Default `apiContributions` off behaves as before.
- **Limits:**
  - No constant-time promise; a database or installation failure still answers unavailable.
  - The marker detects the migration, not a later hand replacement of the body. The reader refuses unmarked forms and full forms for non-evaluators.
  - The installed latch is monotone.
  - 0104's own SQL test now passes its viewer blocks vacuously; 0106's test carries those assertions.
- **Checks, evidence and limits of this candidate:** recorded in its external evidence packets, not here.
- **Still open:**
  - independent CORE and PRE of this candidate, its publication, CI and human review, and the disposition of both findings;
  - live owner, account, native, deployed and app qualification;
  - all 18 AC-04 cases and the RTA release.
