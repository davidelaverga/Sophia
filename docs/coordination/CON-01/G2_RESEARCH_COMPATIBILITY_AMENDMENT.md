# CON-01 r12 research compatibility amendment (proposed)

> **14 October source addendum — handoffs13/19 approved.** Davide approved exact [handoff24](../../handoffs/CON-01-codex-source-takeover-24.md), recorded [198/6156319630](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6156319630). Source-only scope is renewed through **2026-10-14T10:00Z /12:00 Rome**. Section3.1 now includes the exact CON dispatch snapshot of credentialRef/ownerResourceRef/unit from the eligible locked grant and the settled-only stored-used ACK projection; section3.3 includes the exclusive create wire, listed generated companions and original-unit recovery comparison from exact handoffs13/19. Goal/control payloads, existing auth/locks/accounting and other predicates remain unchanged. Historical ACKs retain their own pins. Q8/profile, current-main Studio/shared integration and all operational effects remain separately held. See [handoff25](../../handoffs/CON-01-codex-source-takeover-25.md) for implementation evidence; no full native or app acceptance follows from these component changes.


> **13 October source-only addendum — handoff11 approved.** Davide's direct approval is recorded in [198/6146624582](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6146624582), exact [handoff11](../../handoffs/CON-01-codex-source-takeover-11.md) SHAa380818c, wire333cd4d6/SQL14fc03ba. It amends the current source scope only: original four-field goal `RuntimeServiceBinding` is unchanged; the exclusive CON branch adds trusted `conversationReplyId` and required `create` (proven-undispatched null, fully correlated current-runtime original commandId/epoch, or explicit unresolved different_runtime/correlation_invalid). New0049 changes only CON-HELLO-BINDINGS; no ACK authority expands. This supersedes current CON four-field descriptions below, while historical owner ACKs retain their exact revisions/pins. Existing expiry18:00Z/20:00Rome and all operational restrictions remain. [Handoff12](../../handoffs/CON-01-codex-source-takeover-12.md) records the partial implementation, closed full/scrubbed projection validation inside existing CON-OBS-REPLY (no new helper), usage correlation and actual limits. Native lifecycle, whole Step3/artifacts/gates/integration/deployment/app acceptance remain incomplete.


Status: part of the requested r12 manifest, not an accepted amendment, owner ACK, source
window, schema or operation. Codex remains sole CON implementer; no former CON
Claude coding session, delegated investigation or monitor is requested.

Exact input: PR271 head f9180c734fa98d7e96ff6bb98f93515b50b57af4,
tree c626a08bbd10e3c46c2fe11497898e2840c618b2; reservation SHA256
51eb36d46a412142ec5347221d4251bc995a53f296b2afd9e89df6564a809d01.
Automatic review6131783223 explicitly reviews that head without major issues;
that is documentation review, not research-owner approval or runtime proof.
Conditional research handback: SMC-M03-CC-0025,31/6130961758, exact r10 only.
Observed main83d9e33b/tree9bda4080 remains evidence, not an accepted base.

## Proposed bounded replacement of the research-facing plan

1. In reservation3.1(b)'s runtime_hello row and the corresponding inventory/plan
   descriptions, replace the literal two-aggregate UNION ALL proposal with a
   separate reply aggregate appended to the existing bindings JSON array.
   Preserve the original goal SELECT INTO bindings statement byte for byte,
   including revoked->stopped, all goal predicates and ordering. Preserve roles,
   project locking, instance update, event and cursor call. Insert named CON-only
   actions after the existing project lock and instance update. The existing
   goal path remains owned by M03. No goal bindings are removed or truncated.
2. Select CON bindings through work_attempts.conversation_reply_id, never a
   fabricated goal. Restrict project/resource/runtime_unit to the authenticated
   instance; each service binding keeps exactly attemptId, nativeSessionId,
   authorityEpoch, state. Epoch is the reply attempt's own; state active only
   for pending/running requests, otherwise stopped. Include all not-yet-retired
   CON bindings, including never-dispatched and unresolved cleanup bindings.
3. Propose an explicit bounded wire amendment: RuntimeHelloReply.bindings
   maxItems500 ->502, and RuntimeReady.unrecovered maxItems500 ->502,
   together in A04's existing A16 wire-change transaction. This changes
   the research owner's H4=500 condition and requires a new explicit disposition;
   it does not satisfy the old ACK by implication. Preserve the old goal SELECT
   and capacity: every goal list valid under the old500 cap still fits alongside
   at most two CON bindings. No claim repairs pre-existing >500-goal output.
   Preserve A11 roles and command role/route patches and every unrelated A04
   field. RuntimeReady is a required sibling: control-bridge.connect collects one
   unrecovered entry per failed binding and transport.ready validates this array;
   changing hello alone can accept502 then refuse readiness at501 failures. Keep
   all failure entries; do not truncate them or falsely report restored bindings. Regenerate canonical OpenAPI/types/validators/runtime-wire companions
   together, using the existing generation lane and new artifact recording.
4. Enforce the two-CON-binding bound at conversation_ask admission, under the
   existing project lock, before an attempt/binding/command/outbox/reservation is
   created. Count every unretired CON binding for the selected project/resource/
   runtime_unit, not just live children or bindings on one runtime_instances.id.
   A new bridge lease/instance, failed execution, timeout, Stop or uncertain
   accounting does not clear a slot. The third new logical Ask is recorded as
   blocked with an explicit cleanup-capacity reason through the existing blocked
   request path; it creates no attempt or operational/accounting rows, resets no
   allowance and is not automatically retried. Its human message is preserved.
   An idempotent replay returns the original logical request before considering
   new admission. Only verified A2/A3 local settlement or checked full retirement
   releases a slot; contradictory evidence and failed cleanup keep it occupied.
   Changing resource/unit does not migrate or conceal an old binding or reset
   the logical request or cumulative allowance. Existing two-child execution
   limits remain a separate bound, not proof of this durable-binding bound.
5. For valid owned CON bindings, B1 hello transitions and every reachable helper
   must handle all legitimate terminal/privacy/cleanup states without a new CON
   domain exception that aborts hello. Lock request rows in deterministic id
   order after the existing project/instance lock. A retire already present or
   an unconfirmed stop yields the defined no-write/deferred result; it never
   bypasses B2 identity/idempotency checks or claims successful cleanup.
6. For runtime_record_observations, preserve runtime_lease and existing ownership
   checks first, including42501 for wrong unit/attempt/native session and40001
   for an obsolete lease. Preserve malformed attemptId behavior. Acquire only
   additional CON request locks, sorted by id, after the project lock. A batch
   with no reply observation executes the original goal path without new locks,
   writes or changed errors. Preserve the goal observation conflict rule, A11
   usage counters/purpose and turn/end capture byte for byte.
7. In a valid owned mixed batch, each non-open reply state, withdrawal, erasure,
   source-out, duplicate turn end, stop/retire wait and lease loss must commit
   legitimate research observations, capture and usage. Record actual reply usage
   from the original observation first, then keep only allowed content-free
   correlation/usage for a fenced reply; never reinsert withdrawn text. Capture
   and retire helpers must return the prescribed no-publication/no-write result
   for these states. No blanket exception swallowing or success acknowledgement
   of uncommitted usage; invalid identity, malformed input, storage failures and
   existing authentication failures retain their actual refusal/rollback behavior.
   Live capture and capture_completed_turns replay handle one binding/turn once.
8. Install compatible bounded API/bridge readers before any CON admission can be
   enabled. In a later separately authorized rollout, a failed compatibility gate
   leaves Ask off. Rollback must stop new asks and preserve compatible readers,
   governed data, cleanup and uncertain accounting until all outstanding CON
   bindings are retired. Never roll a502-binding feed back to a500-only reader
   while those bindings exist. No version switch, deployment or cutover is
   requested by this proposal.

## Required qualification before executable approval or acceptance

- Real PostgreSQL: original500 goal bindings plus0/1/2 CON gives500/501/502;
  exact mixed research/reply recovery and four-key/epoch/state validation through
  the generated validator; hello503 rejected. The same500/501/502 failed recoveries
  produce valid, complete RuntimeReady reports;503 rejected. Test the actual
  transport.connect/ready crossing and server validation, not hello alone. Old >500 goal behavior is not waived.
- Concurrent asks from distinct conversations: exactly two admitted under the
  project lock, third blocked; replay after lost reply remains one request and
  no extra rows. Count never-dispatched, outcome_unknown and cleanup-failed rows.
- New hello/lease/instance and API/native restart preserve the same occupied
  slots. A2/A3 contradictory observation/usage evidence never frees one; verified
  local settlement or checked retirement frees exactly one. Duplicate checked,
  late negative and replay never release twice or reset accounting.
- Every reachable B1 state and valid mixed observation batch commits unaffected
  goal/research effects. Check before/after digest of unrelated rows, usage and
  capture, and preservation definitions/owner/security/search_path/ACLs.
- Wrong actor/project/unit/attempt/session/lease and malformed pre-scan retain
  original errors; no orphan, forged receipt, hidden budget reset or swallowed
  storage failure. A reply-only low-water cursor replay executes no goal again.
- Actual reader compatibility/retained-queue behavior and rollout/rollback tests
  are separate from SQL mechanism checks. Stubs are L1 only; no native provider,
  subscription, app or live cleanup verdict is inferred.

## Source evidence for the sibling readiness boundary

At exactf9180c73, A04 lines244-246 cap RuntimeReady.unrecovered at500;
control-bridge.ts333-343 collects each failed recovery and calls ready;
transport.ts185-186 validates the report before sending. A bounded author-run
Node24.21.0 check of the existing generated wire.RuntimeReady passed3 assertions:
500 synthetic failures accepted,501/502 rejected specifically by maxItems500.
Exit0; no transport/server/native/provider invocation or repository source edit.
This qualifies the existing validator boundary only, not the proposed fix or an
actual mixed runtime recovery. Script/result retained privately; no acceptance
verdict is upgraded. Therefore both related arrays are included in the proposal.

## Affected owner rechecks and source boundary

Research K2c must explicitly accept or narrow H1-H5/O1-O4 against this proposal,
including the new bounded502 wire option. Foundation K2b/K2e, joint K1c/K2d,
source-coordinator K3 and Luis core/integration must recheck only affected scope
against the eventual exact amended manifest and accepted base; historical r10
ACKs do not extend. Ask the retained research owner for the smallest compatibility
correction or demonstrated technical incompatibility, not another product choice.

The requested manifest edits are named above; executable files remain precisely those
already listed in3.1/3.3 plus their generated companions. Any newly necessary path
stops at the ownership boundary and requires explicit reservation. Dispatcher256
acceptance/landing, Luis base/Studio handback, exact K1a and fresh finite K5 census/
number/path/sole-writer window remain prerequisites. No hosted operation, grant,
account creation, provider execution, paid call or previous production batch is
approved. OP0002r6/OP0001r4 remain draft_not_authorized; Ask stays off.
