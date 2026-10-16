# R1-F02: the source reviewer's manifest read and refused submissions

Goal and attempt: R1-F02 (FND-A2-R1-F02, packet v1), attempt 1. Human owner / executor resource: Davide / Claude A.  
Native session: Claude Code `local_775c886b-f077-43c7-a07c-74868ab14b5c`.  
Starting worktree/commit: `foundation/review-f02-20261016` from `main` at `f6be9fa7cd7b83ca688878390d474f0f2899bf69`.  
Ending commit/tree and changed files: resolve from the commit containing this record; `packages/dsh-bundle/src/
{review-tools.ts,transport.ts}`, `tests/unit/review-tools.test.mjs`, `apps/api/src/coordination.db.test.ts`,
`package.json` (`test:db` builds the bundle first), `config/runtime-unit.json`,
`config/dsh/profile/pnpm-lock.yaml` (recorded bundle identity) and this record.

## Outcome

The R1 review failed at two points of the bridge's review-tool boundary, both now corrected; the native session's own
tool events (recovered by the operator, private) bind each to the R1 inputs.

1. Both of the reviewer's task reads sent exactly `{"sourceId":"","offset":0}`: an empty string, present. The tool
   forwarded it, the bridge's own request contract refused it before sending, and the model was told "the Sophia
   service could not be reached". Now an empty `sourceId` reads the task, as omitting it does; any other `sourceId` off
   the contract is not sent and is answered `invalid_request` with the field, what it must be, and the sourceIds the
   review may read.
2. Both submissions gave every finding the goal's whole `criteriaRef` (`criteria:…@2:…`, the name of the criteria set)
   as its `criterionId`, where the manifest's criterion is `report-sourced`. 0042 `review_checks` refuses that with a
   reason; the bridge discarded the reason and the model was told only the general rule. Now an `invalid_request`
   refusal reaches the model as one fixed sentence with, from one task read, the criteria's ids and the readable
   sourceIds as data. Nothing is mapped: a criteriaRef is sent as given and refused. The `criterionId` parameter's own
   description tells a criterion's id from the criteriaRef, and has the id copied whole (see the corrections below).

   This record first relayed the service's reason itself (one line, at most 300 characters). That was superseded before
   publication by the feedback containment (`R1-F02-FEEDBACK-CONTAINMENT-attempt-1.md`, Codex 4297108266): a refusal can
   quote what the model sent, so the tools never pass the service's words on. The evidence below is updated to match.

The prompt, SQL, API and contract are unchanged; malformed, partial-source, withdrawn, stopped and unauthorized
submissions are refused exactly as before. Not shown: a published review on the native host (no commission was run).

## Evidence

Native events (private, scoped to the one session): the two task reads' raw arguments, their `service_unavailable`
results after 6 ms, the source read by its UUID with a complete page, and both submissions' shapes (verdict
`changes_required`, all five headings, three findings each citing the read source with its receipt, every
`criterionId` the criteriaRef). The service's historical 422 bodies were not retained.

Tool level, real tools, `ServiceTransport` and generated wire validators over a real HTTP connection to a stand-in of the
API (source-faithful, not the API): the exact R1 read input reads the task; a criteriaRef finding is sent unchanged,
refused with the fixed refusal sentence and the criteria's ids (at this record's first commit, before the containment,
the tool passed the service's reason instead), then the corrected review publishes. The earlier tests fail on the old
source (2 of 21).

Service level, real API, its PostgreSQL functions and both generated validators (the bridge's runtime wire and the
API's), `coordination.db.test.ts` "the R1 review, replayed": the task read the bridge sends for the R1 input, both sources
read whole, a submission whose findings name the criteriaRef refused 422 with "A finding names a criterion this review
does not have: <criteriaRef>" and nothing published, then the same review with the criterion's id published once
(`changes_required`), replayed on resend. Run locally on PostgreSQL 17.11 (50 of 50); CI runs it on PostgreSQL 16.

Joined, the bridge's own tools on the real service, `coordination.db.test.ts` "the R1 review through the bridge's own
tools": the built `reviewTools` and `ServiceTransport` (packages/dsh-bundle/dist), with the world's runtime capability
and bridge instance, against the test's listening API on PostgreSQL. The exact R1 read input returns the task; every
page of both sources is read with its receipts; the R1 submission (every finding's criterionId the criteriaRef) is sent
unchanged and refused, and the model gets the fixed sentence, the criteria's ids and the readable sourceIds, with
nothing published (since the containment; this record's first commit passed the service's reason); the corrected review publishes once (`changes_required`, every source read whole) and its resend
answers the same result. A stopped review reads nothing and publishes nothing through the same tools. On the bundle
before this patch, the joined review test fails. `test:db` now builds the bundle first; the test loads it by path,
not as a dependency of the API, so no workspace copy of the bundle is linked into another package.

## Decisions and changes

`TransportError` keeps the service's message only for an `invalid_request` refusal (`detail`), control characters
removed, at most 300 characters; every other message is still dropped. Since the containment no tool passes `detail` to
the model. A request refused by the bridge's own contract
check names the failing path from the generated validator. A reply off the contract stays `service_unavailable`: that
is the service's fault, not the model's. The bundle's recorded identity changed with its source.

## Corrections at #389's 190c87c2 (FND-B-R1-F02-COMPLETE-ID-01, Claude B)

The automatic review of 190c87c2 found two things, both valid (Codex 4299962005 and 4299962015):

- **Complete criterion ids.** The `criterionId` description said to use "the word before its colon". A criterion's id is any 1 to 160 characters (`SourceReviewCriterion.id`), and 0042 requires it exactly. The task statement lists criteria as `- <id>: <description>`, so a valid `legal:privacy` became `legal`, the service refused it, and no review could be published. The description now has the id copied whole from `goal.criteria[].id` (the task read) or `eligibleCriterionIds`, says an id may contain colons and is never shortened, and still says never the criteriaRef. Nothing else in the tools changed: the fixed refusal sentence, the structured eligible ids, sourceIds, receipts, idempotency and Stop are as they were.
- **This record.** Its outcome and evidence described the superseded reason relay; they are corrected above.

Commands, from the worktree, Node 24.21.0, pnpm 11.7.0, private PostgreSQL 17.11 on 55497 (fresh, stopped and removed after):

1. Before, on 190c87c2's source with only the new tests added: `pnpm --filter ./packages/dsh-bundle build`, then `node --test tests/unit/review-tools.test.mjs`. 23 of 24: the new test fails with "no id is cut at a colon". `node --test --test-name-pattern="R1 review|colon-bearing" apps/api/src/coordination.db.test.ts` (the built tools, `ServiceTransport` and signed runtime HTTP into the API on its restricted role and PostgreSQL): 4 of 4. Following the old description, `legal` is refused with the fixed sentence and `eligibleCriterionIds: ["legal:privacy"]`, and nothing is published; only the whole id publishes.
2. After the description change, the same build and unit file: 24 of 24. `node --test apps/api/src/coordination.db.test.ts apps/api/src/readiness.db.test.ts`: 55 of 55. That includes the colon case (the cut id refused, the whole id published once, its resend replayed), the containment case (the attack text never reaches the model) and the stopped review. `node --test tests/integration/review-tools.test.mjs`: 2 of 2.
3. `pnpm artifacts:record`, then `pnpm artifacts`: all identities reproduced. The bundle's identity changed with its source: `sha256:730370d76bde31aa4364b7ef4959d832095fe3322fa1347c42846e0fa98afda2` (was `c146f12f…`), reflected in `config/runtime-unit.json` and the profile lock. The dsh artifacts and the workspace lock are unchanged.

Not shown: any live model's behavior with these words. The local crossing proves the tools, the transport and the service; it is not live reviewer acceptance.

## Remaining obligations

The rebuilt runtime artifact must be deployed by the operator before a native review can use this. The first authorized
post-merge commission is the operator's; the cancelled R1 commission is not restarted.

## Next bounded action

Independent review and merge; the operator deploys the recorded runtime unit and runs one authorized review commission.
