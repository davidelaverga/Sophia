# Implementation-session handoff — INC03 S02 durable deterministic observation

- Goal/attempt: bounded local S02 immutable deterministic observation recording, attempt1, 2026-11-20.
- Human owner/executor: Davide; root coordinator; Codex author `/root/personal_recorded_status_author`. Native runtime session identity unavailable; no runtime session started.
- Worktree: journal-relative `release/INC03-O4-DURABLE-OBSERVATION-001/source`; exact published HEAD `d49397798354bda44c28baaa22dea8101addca1c`.
- Verified initial staged input: accepted reader/adapter/v26 tree `7ba0cfc7a3bdcf1042e818608d2ca68c8bac1e9a`, no unstaged tracked changes, protected `db/tests/` absent.
- Migration lease:0124_saved_conversation_input_observations; coordinator reservation SHA256 `0d54fef1f0cc91792cfd9f85fb470a2868586dd7f03bf9b9c3040ca1b306d3cf`.
- Exact final tree/patch/source hashes and owned cleanup: external sibling evidence receipt. No commit/push/publication or production activation.

## Outcome

One immutable typed observation per original addressed input can be retained through an internal API-role writer.
It takes the established project/conversation parent locks, rechecks current writer/original sender and the exact
current input/member/target context. Reader and writer share a SECURITY INVOKER predicate with explicit current
membership. Direct API calls use the API role and its ordinary RLS. The bounded writer invokes the function as its
SECURITY DEFINER owner, so explicit actor, membership, source and reference predicates enforce eligibility there.
No broad project grant, new role or worker privilege is added. The local reader requires migration 0124. Published
A33/A49/A63 surfaces, readiness and original data are unchanged.

SQL NULL is a same-transaction probe used by the trusted application; its narrow function grant still covers the
whole API role. A prior record returns before application read/policy invocation, after current eligibility. A fresh
record computes v26 while the same parent locks remain held. A changed supplied policy never overwrites or implicitly
reinterprets prior metadata. Current revocation/withdrawal fails closed before replay. Records are immutable and
current-context RLS hides stale sources while retaining only protected metadata for historical correlation.

Fresh metadata is closed and typed: original human provenance/input correlation, exact source/revision/address facts,
policy/rule/proposed action/addressee/target/uncertainty and zero-effect/authority-none outcome. A proposal route is no
actual beneficiary, payer, permit, admission or dispatch. The locked project audience_revision is recorded as a
historical manifest fact. Full inputSha256 and content-derived observationId are validated transiently against the
locked full text/context with canonical JSON, then removed. No content_sha256 column/body/target body/name or duplicate
body-derived digest is retained or returned. The original request semantic remains unchanged and withdrawal still
redacts its sole text digest. A server record UUID, original input ID and policy version give durable correlation.

## Evidence

Owned disposable PostgreSQL16.15 UTF8 loopback56504, UNIX sockets off, ordinary standard migrations and synthetic
actors only; Node24.21.0/pnpm11.7.0 frozen offline dependencies. No protected SQL/held-out/private evaluation read,
provider/native request or production account/secret. Exact commands/logs are retained in sibling evidence.

- New real PG cases cover create/replay/concurrent creators; original sender/current writer/role fences; actual normal member removal and source/target withdrawal/erasure between preparation and write; stale revisions/digests and bounded malformed shape/provenance/effect/authority; rollback before/after insert and lock release; current RLS/immutability/API/worker/assembler privileges; complete4,000 supplementary-code-point validation without retained digests; ordinary unrecognized abstain/no effects.
- `red-revalidation-order-race.log`: moving only context resolution before parent locking makes one executed normal-remove_member race incorrectly record (1 intended failure,0skip/cancel). Restored order revalidates after blocking. Separate stale REPEATABLE WRITE snapshot fails40001 after real audience revision change, rather than retaining old eligibility. The predecessor READ snapshot's behavior is separate evidence, not a claim that reads themselves gain current admission authority.
- `red-abstain-rule.log`: the original dotted-rule bound rejects a legitimate retained unrecognized input (1 real failure). Only exact literal abstain was added alongside the bounded dotted pattern; restored full writer cases pass.
- Prior without fresh application read/policy: after first record, the fixture temporarily revokes API EXECUTE on the shared reader, and durable replay still returns the exact prior through the definer's eligibility check; grant restored. Supplying a new policy also returns the immutable prior. Fresh computation requires the shared read. Original request semantic is unchanged by recording, then actual withdrawal redacts it; retained observation is verified to contain neither inputSha256/observationId nor any content digest.
- Accepted read/adapter/v26 and A49/A63 HTTP regression suites run with the new helper. The 0123 historical foundation fixture now excludes successor migrations during its pre0123 snapshot and installs0124 after0123, preserving every foundation assertion. No historical migration was edited.
- Final combined Node/PG run:261pass,0fail/skip/cancel (13new durable cases plus248 accepted reader/adapter/policy/A49/A63 cases). Touched lint/typecheck/format/diff results are recorded in the external receipt. Earlier green258 run predates the transient-only retention correction; it is retained as superseded evidence, not the final verdict.

## Decisions and remaining scope

C03-R02/R04/R05 and INC03-R04/R06/R08/R16 govern the retained envelope, deterministic record and no-promotion fence.
The coordinator explicitly authorized the narrow invoker EXECUTE grant, same-transaction probe and transient-only
hash policy. Underlying original SELECT/RLS/route behavior is unchanged; the new shared reader dependency is disclosed.
No independent source review is claimed by this author. Unexpected transaction failures propagate/rollback rather
than return a stale composite; there is no exception-swallowing or alternate target/payer path.

Normal independent review, runtime qualification, future assessment/correction contract, actual admission and rollout
remain open. Stored observations are historical proposals, not authority surviving a later audience/source change.
No new public HTTP/configuration/generated wire, model inference, worker dispatch, provider call, migration execution
in production, publication or R16 promotion occurred. Coordinator should bind the exact final source/evidence before
any further action; failed/superseded attempts and existing holds remain retained.
