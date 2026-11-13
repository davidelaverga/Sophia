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
