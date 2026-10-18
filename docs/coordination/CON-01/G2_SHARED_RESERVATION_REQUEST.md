# CON-01 G2 Phase B: the shared reservation request, revision 12 (research compatibility proposal; docs only)

> **Current source-only addendum, 14 October 2026:** Davide approved the two amendments in REQUEST SHA2569aad53ed91a8d96df7ce0be22d73e57a9061c6e536a1accb3f90393acc1c4b73; [handoff90](../../handoffs/CON-01-codex-source-takeover-90.md) records application and bounded independent component review. ACK reservation rows now require immutable `unit` for all four states (two schema branches), and recovery may obtain each ordinal's original unit from correlated ACK after payload erasure. Missing/conflicting identity or unit stays unresolved. The exact enabled CON controller is cancelled on superseded poll409/invalid_state; mixed-instance polling stops, native goal state is preserved. This supersedes older “pending27/36” source-status wording only. The approved source window ends **20:00 Rome /18:00Z on14October**, superseding historical noon expiry text below. No deployment, hosted migration, credentials/provider, account/grant, integration or Q8/profile authority is added. Full restart/hello orchestration and physical/native qualification remain unfinished; `connect()` still reports CON bindings unrecovered, launcher run/probe is disabled, and Ask stays off. Historical proposals, owner ACKs and pins below remain historical evidence.

> **14 October source addendum — handoffs13/19 approved.** Davide approved exact [handoff24](../../handoffs/CON-01-codex-source-takeover-24.md), recorded [198/6156319630](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6156319630). Source-only scope is renewed through **2026-10-14T10:00Z /12:00 Rome**. Section3.1 now includes the exact CON dispatch snapshot of credentialRef/ownerResourceRef/unit from the eligible locked grant and the settled-only stored-used ACK projection; section3.3 includes the exclusive create wire, listed generated companions and original-unit recovery comparison from exact handoffs13/19. Goal/control payloads, existing auth/locks/accounting and other predicates remain unchanged. Historical ACKs retain their own pins. Q8/profile, current-main Studio/shared integration and all operational effects remain separately held. See [handoff25](../../handoffs/CON-01-codex-source-takeover-25.md) for implementation evidence; no full native or app acceptance follows from these component changes.


> **13 October source-only addendum — handoff11 approved.** Davide's direct approval is recorded in [198/6146624582](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6146624582), exact [handoff11](../../handoffs/CON-01-codex-source-takeover-11.md) SHAa380818c, wire333cd4d6/SQL14fc03ba. It amends the current source scope only: original four-field goal `RuntimeServiceBinding` is unchanged; the exclusive CON branch adds trusted `conversationReplyId` and required `create` (proven-undispatched null, fully correlated current-runtime original commandId/epoch, or explicit unresolved different_runtime/correlation_invalid). New0049 changes only CON-HELLO-BINDINGS; no ACK authority expands. This supersedes current CON four-field descriptions below, while historical owner ACKs retain their exact revisions/pins. Existing expiry18:00Z/20:00Rome and all operational restrictions remain. [Handoff12](../../handoffs/CON-01-codex-source-takeover-12.md) records the partial implementation, closed full/scrubbed projection validation inside existing CON-OBS-REPLY (no new helper), usage correlation and actual limits. Native lifecycle, whole Step3/artifacts/gates/integration/deployment/app acceptance remain incomplete.


**What this is.** The record that BINDING_MAP §8.8 Q6 and D-10 call `G2_SHARED_RESERVATION_REQUEST.md`. It covers freeze r2's Phase B start conditions [3] and [4].
- **What it asks:** each recorded owner's narrow acknowledgement of its own surfaces, the exact Phase B scope, and the base, number, writer, order and handback that must be recorded before any shared write.
- **It asks; it assumes nothing.** No shared file, migration, number, contract, runtime, grant, role, route, deployment or provider effect is written or authorized here.
- **It doesn't repeat what is already pending elsewhere.** It points to it (§6).

**Current revision 12, research compatibility amendment.** This docs-only proposal
incorporates [proposal01](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-6131860945)
from exact parent `f9180c734fa98d7e96ff6bb98f93515b50b57af4`, tree
`c626a08bbd10e3c46c2fe11497898e2840c618b2`, reservation SHA256
`51eb36d46a412142ec5347221d4251bc995a53f296b2afd9e89df6564a809d01`.
The [research amendment](G2_RESEARCH_COMPATIBILITY_AMENDMENT.md) is part of this
requested manifest, not an accepted owner decision or executable source.
It replaces the literal aggregate UNION ALL with separate append, bounds durable
CON bindings at two per project/resource/unit, and proposes both hello bindings
and ready unrecovered arrays at502. The old H4=500 condition is expressly not
satisfied by implication: exact owner rechecks are owed. Non-raising valid reply
state handling must preserve mixed research batches without swallowing original
authentication, malformed-input or storage failures. Ask remains off.

A1, A2/A3's C1 safeguards, frozen Q7 r8, §3.2, applied migrations, executable
source, artifacts and operation drafts are preserved. **§3.3 is materially changed**
by the two bounded wire arrays, invalidating affected earlier K3/owner reviews.
All required exact-r12 acknowledgements, base and K5 finite window remain absent;
proposal authorship supplies none. Actual ending identities/review belong in the
[r12 publication receipt](receipts/codex-research-r12-publication.md).

## Historical revision 11 record (its own immutable pin only)

**Revision 11, Codex takeover and retained-owner handbacks.** Davide transferred CON implementation to Codex on 12 October and required automatic Codex review after every push. This revision changes no executable source and opens no window. It incorporates the retained foundation owner's C-1, states its P-1 to P-4 precisely, and records the actual conditional research handback. The former CON Claude session is no longer the proposed feature writer.

- Reviewed parent: `91110fdda17dab26b8b7b1a6f1026060d888fa7c`, document SHA256 `90ea5a52a1a292deb847d55d329d4fcd131538d4a0125507837b96d0f84973df`.
- Foundation: [S1-05A-CC-0038](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-6131109861), actual session `session_0132HNzeA65ec3zBCL4KYtX2`. Conditional K-2b/runtime K-1b for exact r10; C-1 adds absence of observations and usage to local A-2/A-3 settlement. No unpublished work or active writer reported. Its interrupted multi-agent pass was stopped and is explicitly unqualified; the owner relies on its own source reads only. No tests were run by that owner.
- Research: [SMC-M03-CC-0025](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-6130961758), actual session `session_018hCUhiK4hgMf5V5QPbkC9S`. Conditional K-2c for exact r10 only, H1–H5/O1–O4. No unpublished work, writer or monitor reported. Its goal/research path stays owned by M03.
- Exact r10's root, K-1c and K-2d dispositions are recorded in [CC-0188](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6121348601); they are not extended to this material revision.
- **Affected rechecks owed:** foundation's C-1/P delta, joint consumer and owner incorporation, and research compatibility. Core K-2a, Luis's base/Studio handback and K-5 remain absent.
- **Research conditions are received, not yet fully incorporated:** the hello aggregation/capacity and non-raising fenced reply helper behavior need a separate exact amendment (§5). No claim that this revision clears H1–H5/O1–O4.
- **Additional owner scope missing:** CC-0038 expressly does not acknowledge §3.3's bridge edits or §3.4's supervisor/launcher/profile edits. A precise retained-owner handback is required for those files/functions before writes; K-3's overlap/order ACK cannot proxy it.
- **Automatic-review correction to r11:** [PR271's P2](https://github.com/davidelaverga/Sophia/pull/271#discussion_r4251735835) found the new bundle modules missing from K-2e's owner route. Section 1 and K-2e now explicitly include §3.3's new `reply-child.ts` and `reply-plugin.ts`, and the existing and new launcher/profile/test companions in §3.4. No owner ACK or write window is inferred for them; Q8's profile/image decision stays separate. Executable scope is unchanged.
- **Preserved:** A-1, §3.2 and §3.3 are byte-identical to r10; frozen Q7 r8, applied migrations, executable files, artifacts and all operation drafts are untouched. A-2 is deliberately amended by C-1 and is no longer claimed byte-identical.
- Observed main `83d9e33b6ce86cef5c75839ef9936f96e1ed5334` is not an accepted base. Phase A #256 and G1 composition still require Luis's acceptance. Ask remains off.

## Historical revision records (each describes its own immutable pin)

**Revision 10, after CX-0168 (reviewer `1706f438`): one docs-only correction to A-3.** Codex's root review of exact revision 9 (`1bd83eec`) finds its corrections to the deferral, the denial, D4's preflight and the citations responsive at proposal scope. It confirms A-1, A-2, §3.2 and §3.3 are unchanged. One new P2 remains, and it is accepted:

| Finding | Disposition | Where |
|---|---|---|
| PB9-A3-FALLBACK-TERMINAL-WRITER (P2; `a3-fallback-finding.safe.json` at `1706f438`) | **Accepted.** Revision 9's A-3 kept steps 1 to 3 when evidence defeated its local retirement: the request `failed` (`not_dispatched`), then a full retirement. But nothing in frozen Q7 r8's table (r8:860-870) can be that request's `terminalWriter`: no receipt, capture, hello or A-1 cancellation ended it, and a later receipt can't be named as the earlier writer. So "never reaches the predicates" didn't hold for the fallback. **Revision 10 removes the fallback.** A-3's conditions are checked first, under the dispatch's locks, before any write. They now include no reservation of any state. If any fails, `conversation_dispatch` refuses (55000): the transaction rolls back and nothing is written. No denial, `failed`, `not_dispatched`, `retire`, receipt, cancellation, release, deletion or reset. The request stays `pending`, and the contradiction stays visible for its owner. A-3 then has only two outcomes, local retirement or nothing, so it never reaches B-6's predicates. The runtime-command, execution and reservation (`reserved`, `uncertain`) cases are named as adverse tests that prove the refusal changes nothing | §3.1(d), case (B); §3.1(f), A-3; the counts; tests |

- **Unchanged from revision 9:**
  - the typed-NULL deferral, the CON-only denial, D4's preflight and validated CHECKs, and the citations;
  - A-1 and A-2, byte for byte;
  - §3.2 and §3.3, byte for byte;
  - cumulative accounting and the privacy barriers.
- **The joint consumer review of revision 9 reports the same gap.** Its final record, and the owner's review of revision 9, were still in progress at CX-0168. Neither is counted here.
- **Rechecks owed, for this exact revision:** Codex's independent recheck, the joint consumer recheck (K-1c), the owner's review under K-2d, and A-3's explicit review (K-1b).
- **Nothing is opened:** no executable SQL, test run, source window, Studio edit or operational authority.

**Revision 9, after CX-0166 (reviewer `8bff1a41`) and the owner's incorporation review (#198 comment 6120514429): one docs-only amendment, to §3.1, with §1, §2, §5 and §6 kept consistent.**
- **The joint review withholds K-1c for exact revision 8** (`960f262f`). Its verdict is `CHANGES_REQUIRED_ONE_BOUNDED_P2_PLUS_MIGRATION_QUALIFICATION_GAP` (`joint-r8-review.safe.json` at `8bff1a41`; original record `f0f8a320978c759b…`). Codex's root review agrees. It verified all 65 immutable Git input hashes, all 65 extracted ones, and 5 evidence-record hashes. The review keeps D1, D2 and N1, D3's enqueue, D4's direction, C1 to C4 and D5's preservation plan compatible at proposal scope.
- **The owner acknowledges** D1 to D3, D5, C1 to C4, N1, the ACLs and D4's CHECK as incorporated, with two corrections and a citation fix.
- **Each is accepted:**

| Finding | Disposition | Where |
|---|---|---|
| PB8-A2-DEFER-HELPER-SCOPE (P2; root's PB5-DEFER-JOB-BOUNDARY; the owner's correction 1, its deferral) | **Accepted.** `defer_native_delivery` (0012:694-705) also updates `jobs` by `c.id`, and can emit `native_task.waiting`. Revision 8 relied on no job matching. **Every reply deferral is now exactly `defer_native_delivery(o, NULL::sophia.commands, <fixed reason>)`:**<ul><li>the helper isn't `STRICT`, and reads `c` only in that predicate;</li><li>`command_id = NULL` matches no row, so no job row is locked, changed or announced;</li><li>the outbox transition stays the helper's own.</li></ul>Its `UPDATE` still runs on `sophia.jobs`. So the claim is no job **row** lock or effect, not no access. The helper isn't edited | §3.1(d), "Dispatch and delivery"; tests |
| The owner's correction 1, its denial (CX-0166) | **Accepted.** A reply never calls `deny_native_delivery` (0012:661-679):<ul><li>its `native.create` branch writes bindings, attempts and jobs;</li><li>its other branch emits `command.denied`;</li><li>a NULL command would leave the command `admitted`.</li></ul>**A reply's terminal denial is CON-only:** the outbox row `denied` (`lease_until` NULL, the reason), and the reply's own command `denied`. Nothing else is inherited. The further own-state transitions are enumerated by case, for review. **One is new:** a request still `pending` whose `create` is denied ends `failed`, and is retired locally (**addendum A-3**, §3.1(f)). The shared helper's binding and attempt writes no longer happen, so the reply's own path must end it | §3.1(d), (f); the counts; tests |
| PB8-D4-EXISTING-ROW-INVENTORY (a qualification gap; root's PB6; the owner's correction 2) | **Accepted.** "No existing row is a `native.retire`" described producers, not rows: `destination` is unconstrained text (0001:111). It is replaced by:<ul><li>a source expectation;</li><li>an explicit preflight that refuses any existing `native.retire` row (23514), before the DDL;</li><li>every new CHECK validated, never `NOT VALID`;</li><li>no backfill, `UPDATE` or `DELETE`.</li></ul>Seeded-violation, rollback and non-mutation cases are added | §3.1(a); tests |
| The citation (the owner; CX-0166) | **Accepted. The conclusion doesn't change.**<ul><li>The goal-side `native.stop` cleanup writers also include WBC-02's `work_control` (0042:458-461, `hold` or `stop` only). The owner's comment names it by its Studio caller, `work_command` (:835).</li><li>The `control.settle` rows (0012:327-328, 0041:323-327, 0042:485-487) are taken by the `control.settle` branch (0042:1822) before any kind is derived.</li></ul> | §3.1(a) |

- **Unchanged:**
  - A-1's and A-2's blocks, byte for byte. From A-1's heading through A-2's last bullet, the SHA-256 is `5befc98cecb14e46…` in revisions 8 and 9;
  - the typed immediate cause, the source withdrawal, the shared sequence, capture, the ACLs and cumulative accounting;
  - §3.2 and §3.3, byte-identical to revisions 5 and 8. The owner's SHA-256 is `66362753ab912851…`, reproduced here. So K-3's exact scope is untouched, and K-3 isn't extended either.
- **Rechecks owed, for this exact revision:**
  - Codex's independent recheck;
  - the joint consumer recheck (K-1c);
  - the owner's review of these corrections, under K-2d;
  - the explicit review of A-3, with A-1 and A-2 (K-1b).
- **Nothing is opened:** no source window, test run, write or operational authority.
  - K-1b, K-2a to K-2c, Luis's K-4 and Studio handback, and K-5 stay held.
  - The owner holds no route to the other owners beyond the planning record, and appoints no substitute. None is inferred here.

**Revision 8, after Codex's K-3 disposition (CX-0164 at `c4389f84`): K-3 recorded as supplied, within its exact scope; no manifest change.**
- **The disposition:** Codex independently read and accepted #198 comment 6120100817 as the retained source coordinator's explicit K-3. The coordinator is session `session_0155SjcXhv87RErnWEBWxfBM`, acting in its own source-coordination remit.
  - **Scope:** exact revision 5, with §1 to §4 unchanged at revision 6.
  - **Where it is recorded:** #198 comment 6119717658 (updated), and the safe record `actual-owner-handback.safe.json` at `c4389f84` (SHA-256 `cca6dacb49a80f18…`).
- **What K-3 is, narrowly:** the preservation of #190's overlap, and the order of regeneration and integration (§3.2, §3.3; Q10).
- **What K-3 is not:**
  - an acknowledgement from the unreachable historical actor `aca33481`;
  - an approval of #190's billing direction, product, merge or deploy.
- **K-3 is not extended.** Revision 7's amendment changed only §3.1, so §3.2 and §3.3, which K-3 covers, are byte-identical to revision 5's. That is stated as a fact, not as an extension of K-3 to revisions 7 or 8.
- **Unchanged here:** revision 7's §3.1 amendment still needs its affected rechecks: Codex's independent recheck, the joint lane's consumer recheck (K-1c was for revision 5), and the owner's review of D4 under K-2d. §1 to §4 are byte-identical to revision 7's.
- **Nothing is opened:** no source window, and no operational authority.

**Revision 7, after CX-0164: K-2d's conditions incorporated, and one amendment (D4).** Its K-3 bullet below is superseded by revision 8's disposition, and its "Why no second guard" citations by revision 9's.
- **What arrived:** the joint WBC-02/SDD-01 implementer (session `session_0155SjcXhv87RErnWEBWxfBM`) gave **K-2d, conditional,** against exact revision 5, in #198 comment 6120057551. Codex verified the author, and that 0041's and 0042's whole bytes at the owner's cited `e0200f1a` equal current `main` `3c40b1c6`. The conditions are D1 to D5, C1 to C4 and N1.
- **What revision 7 does:** it writes those conditions into §3.1 as the owner stated them. Each is exactly the owner's condition, and none widens what may be written:

| Owner condition | Where it now stands |
|---|---|
| D1, D2 and D5: where the reply branch and the goal-less guard go in `dispatch_runtime_outbox`; the goal path otherwise byte-identical | §3.1(b), its row |
| D3: what `conversation_dispatch` must do to enqueue, deny or defer | §3.1(d), "Dispatch and delivery" |
| **D4: a `native.retire` row belongs to a reply only** | **§3.1(a): a new outbox CHECK (the one material amendment)** |
| C1 to C4: `capture_native_result`'s reply branch: its place, its limits, its guard and its idempotence | §3.1(b), its row |
| N1: `native_delivery_ineligible`'s one first `WHEN` | §3.1(b), its row |
| The ACLs and the preservation proof | §3.1(b), its introduction |
| Future tests for each | §3.1's tests |

- **D4, precisely.**
  - **The gap:** on the goal path, a non-cleanup row's runtime-command kind is `substr(o.destination, 8)` (0042:1846). Once K-2b widens `runtime_commands.kind` with `retire`, a goal-bound `native.retire` row would become a `retire` command for a goal binding. Revision 5's §3.1(a) added the exclusive goal-or-reply reference, but no constraint on the destination.
  - **The guard:** `CHECK (destination <> 'native.retire' OR conversation_reply_id IS NOT NULL)`, under the existing S1-02 DDL scope. The goal path's `native.create` and `native.stop` rows, and every existing row, are untouched.
  - **Why no second guard:** a goal cleanup row takes its kind from its command (`kind := c.kind`, 0042:1831). Every goal-side cleanup writer writes only `hold` or `stop` (`admit_goal_command`, 0012:285, :311-335; `research_stop_revoked`, 0028:120-123), and none is added. So no second guard is needed. If the owner wants one anyway, it would be the reply branch denying a non-reply `native.retire`; it is named here for review, and not added.
  - **What is not added:** no live constraint, grant or migration. Like all DDL here, it runs only on a disposable test database in Phase B.
- **Rechecks owed:** this is a material manifest amendment.
  - It needs Codex's independent recheck, and the joint lane's consumer recheck, since K-1c was for revision 5.
  - It needs the owner's review of D4's incorporation, under K-2d.
- **K-3 is unresolved, and is not claimed.**
  - #190's historical product writer (`aca33481`) can't be reached.
  - 6120057551 supplied the engineering overlap and order, but expressly reserved the authority.
  - A follow-up from the same retained coordinator, #198 comment 6120100817 (07:54:57Z), states an acknowledgement "in its own name, within its retained source-coordination remit", against revision 5. It answers the clarification Codex sent. It is recorded here as received, without acceptance as K-3. Whether it suffices is for Codex to verify and the owner to decide.
  - The question is not asked again, and no actor is recreated.
- **Everything else stays held.** K-1b, K-2a, K-2b, K-2c, Luis's K-4 base, his Studio handback, and K-5 (§5).

**Revision 6, after CX-0162: the acknowledgement state, recorded; no manifest change.**
- **Revision 5 (`b975bbe2`) has no findings.** The joint lane gave **K-1c** for that exact revision, A-1 and A-2 included, within its consumer remit (CX-0162). That is a consumer review only, not an owner ACK, an implementation qualification or a GO.
- **This revision changes no part of the manifest.** §1 to §4 are byte-identical to revision 5's, so K-1c still names exactly what it reviewed. Only the following change:
  - this header and the records table;
  - §5's state column and its evidence;
  - §6's operation-draft pointers: OP0002-r6 and OP0001-r4 replace r5 and r3. Both are `draft_not_authorized`, and neither is reviewed or approved here.
- **Every other acknowledgement is still missing.** K-1b, K-2a to K-2d, K-3 and K-4 are each demonstrably not recorded (§5's evidence). No owner, identity or authority is inferred from routing records, planning files, consumer reviews or commit authors. So K-5 cannot start, and nothing in §3 is written.
- **Carried for the implementer (CX-0162's notes), unchanged in scope:**
  - **A-2's proof is the whole historical conjunction** (§3.1(f)). Final state alone, or row absence alone, is never enough.
  - **Cause validation is null-safe and project-scoped.** The message lookup stays within the request's project and conversation. Each `cause_kind` and its fields are checked explicitly, so a NULL can never slip a malformed cause past a CHECK.
  - **A source-answer withdrawal's cause is the immediate one:** the withdrawn answer, never a substituted upstream source.

**Revision 5, after CX-0161.** Its disposition stands, unchanged below. The joint review of revision 4 (`a31c023f`) and Codex's root review find all three PB3 corrections addressed at proposal scope. They also judge A-1's and A-2's directions compatible. One bounded P2 remains, a gap in the exact manifest rather than an observed failure, with the verdict `CHANGES_REQUIRED_ONE_BOUNDED_P2_EXACT_R4_K1C_NOT_SUPPLIED_NO_WRITE_GO`. It is accepted:

| Finding | Disposition | Where |
|---|---|---|
| PB4-CANCELLATION-CAUSE-INPUT | **Accepted.** Revision 4 promised a cancellation row naming its actual caller and cause. But `conversation_cancel` took only the project, request, reason and time. S4's call dropped its source, and S1's loop carried no conversation or seq. Revision 5 carries a **typed immediate cause** through the helper and both call sites:<ul><li>`conversation_cancel` gains `p_cause_kind`, `p_cause_conversation`, `p_cause_seq`, `p_cause_message` and `p_cause_source`;</li><li>`conversation_source_out` passes `'source_out'` and its own `p_source`;</li><li>`conversation_withdrawn_from` types its cause once, from its own inputs and one unique, locked lookup, then passes it for every request it cancels. The lookup is the message at `(conversation, seq)`, under 0048's `UNIQUE(conversation_id, seq)`, which its caller has just withdrawn in the same transaction.</li></ul>The row keeps the first cancelling input, immutably, one per request: a later input finds the request terminal and writes nothing. It holds no text, and its ACL is closed. Nothing is inferred from a latest message or timestamp. S4's exact replacement and its equality restoration are updated to match | §3.1(d), (e), (f); tests |
| The precision notes | **Accepted:**<ul><li>A-2's tests read internal provenance, and never call an authenticated entry point with a `create` that doesn't exist;</li><li>A-2's "no runtime command" proof is historical, recorded under the lock at cancellation, not merely a current absence;</li><li>B-2's shorthand that every cleanup has a `runtime_commands` row is narrowed by A-2's explicit counts</li></ul> | §2 B-2; §3.1(f); tests |

**Revision 4, after CX-0159.** Its dispositions stand, unchanged below. The joint review of revision 3 (`34397f7e`) and Codex's root review find:
- CX-0155's four findings still addressed;
- CX-0157's `stop` delivery and source-out fixes standing;
- the first `reserved` recovery settle fixed.

They found three bounded P2s, contract gaps rather than observed failures, with the verdict `CHANGES_REQUIRED_THREE_BOUNDED_P2_K1C_NOT_SUPPLIED_NO_WRITE_GO`. Each is accepted. **Two of the corrections are named addenda to the frozen Q7 r8, for explicit review (§3.1(f)).** Q7 r8 itself is not rewritten, and its design ACK is not counted for them.

| Finding | Disposition | Where |
|---|---|---|
| PB3-RECOVERY-SETTLED-REPLAY | **Accepted.** Revision 3's recovery case admitted only a `reserved` ordinal, so the new bridge's identical retry after a lost answer was refused before S2's own replay branch (S2:363-364). The recovery case now admits `reserved`, or `settled`, with every other condition unchanged. S2 then returns the existing receipt, without mutation, only for identical usage, and refuses anything else | §2 B-5, §3.1(c) |
| PB3-STOPPING-RETIRE-PRECEDENCE | **Accepted.** For a claimed attempt that was cancelled, revision 3 required stop → `checked` → `retire`. But its generic `retire` callers (a terminal `create` receipt, capture, hello) were held back only by idempotency. `conversation_retire` and every caller now share one guard: while the attempt's own `stop` has no recorded `checked` answer, no `retire` is written by any path. A late `create` answer, capture or hello records its facts and changes neither the `cancelled` request, nor the `stopping` binding, nor any accounting | §2 B-2, §3.1(b), (d) |
| PB3-UNDISPATCHED-CREATE-PROOF | **Accepted, through a named addendum.** Revision 3 delivered a `retire` to a runtime for an attempt that no runtime was ever told of. That `retire` could pass neither the entry points' scope nor Q7 r8's eight predicates. Revision 4 delivers it to no runtime:<ul><li>the cleanup is settled locally, exactly as the goal path already settles a cleanup for a binding with no runtime command (0042:1830-1837);</li><li>it happens only under locked proof that the `create` is permanently undispatched, unclaimed and unspawned (addendum A-2);</li><li>no receipt, `create` answer, claim, `stop` or call is invented, and no predicate is marked met.</li></ul>A durable cancellation record (`conversation_cancellations`) becomes the cancelled request's `terminalWriter` in every case, claimed or not (addendum A-1). A later stop's answer settles the binding, but it is never named as what ended the request | §2 B-6, §3.1(d), (f) |
| The precision notes | **Accepted:**<ul><li>the promotion-equality test restores S4's original `UPDATE` in place of its replacement before comparing whole definitions;</li><li>an identical replay adds 0 rows, but a newly recorded `checked` stop after an `outcome_unknown` is a new transition, and writes the first `retire`;</li><li>claim takes an unclaimed request, so it can't require a claim to exist already;</li><li>the joint lane's K-1c now names this exact revision, not "the exact r2 manifest"</li></ul> | §3.1(b), (c), (d), (e); §1; §5 |

**Revision 3, after CX-0157.** Its dispositions stand, unchanged below. The joint review of revision 2 (`b6ee23a4`) and Codex's root review find CX-0155's four findings addressed at proposal scope. They found three new bounded P2s on adverse paths, with the verdict `CHANGES_REQUIRED_THREE_BOUNDED_P2_NOT_FULL_MANIFEST_ACK_NO_WRITE_GO`. Each is accepted:

| Finding | Disposition | Where |
|---|---|---|
| PB2-STOP-DELIVERY | **Accepted.** Revision 2's reply dispatcher knew only `native.create` and `native.retire`, so the `stop` that `conversation_cancel` writes had no delivery path. Revision 3 enumerates it:<ul><li>when the cleanup `stop` is written: exactly when a claim exists;</li><li>its key, its actor and its epoch (2);</li><li>its delivery through `conversation_dispatch`'s cleanup branch, with no statement and no grant, open-request or source eligibility;</li><li>the exact `commands`, `outbox` and `runtime_commands` counts of `create`, `stop` and `retire` on every path, replays included</li></ul> | §2 B-2, §3.1(a), (b), (d) |
| PB2-SOURCE-OUT-CANCEL | **Accepted.** S4's `conversation_source_out` cancelled a live request in the database only (:452-456). Revision 3 replaces that update with a `conversation_cancel` call. The call runs under the same locks and before the context is erased, and it is the one named promotion-equality exception in S4. S1's `conversation_withdrawn_from` likewise selects the open requests first, then cancels each through `conversation_cancel`. Revision 2 also named the grant switch and the asker's removal as callers, without the functions that would call it; both are now stated as not wired in Phase B, and held | §3.1(d), (e) |
| PB2-RECOVERY-SETTLE-LEASE | **Accepted.** Revision 2 held settle to the claim's own lease. That refuses the frozen Q7 r8's recovery settle (r8:775, :887). Revision 3 keeps the claim's lease strict for claim, go and reserve, and gives settle one narrow recovery case: the current authenticated bridge of the same runtime, for a request that capture ended and an ordinal still `reserved`. S2's identical-replay and conflict refusals stand, and an `uncertain` ordinal is never settled | §2 B-5, §3.1(c) |
| The M01 wording and the review's precision notes | **Accepted:**<ul><li>"No M01 object is read" becomes "no M01 object, definition or ACL changes". S3's dormant context still reads accepted mission and decision data and ledger revisions, and those reads are preserved;</li><li>each `ON CONFLICT DO NOTHING` is followed by reading and verifying the existing row before any dependent row;</li><li>the entry points bind the authenticated runtime instance, project and resource, not a unit name alone;</li><li>the plugin entry must resolve through the approved loader form (Q8);</li><li>relocated and Python tests are a plan until executed, and an unsupported platform is reported as such, never as a pass on exit 0 alone</li></ul> | §1, §2, §3.1(c), §3.3, §3.4 |

**Revision 2, after CX-0155.** Its dispositions stand, unchanged below. The joint Phase B review found four P2s in revision 1 (`57f66b50`), with the verdict `CHANGES_REQUIRED_NO_RESERVATION_OR_WRITE_GO`. Codex's root review agrees with all four. Each is accepted:

| Finding | Disposition | Where |
|---|---|---|
| PB-OWNER-ROUTING | **Accepted.** Revision 1 claimed that no separate core or ledger owner is recorded. That claim was wrong, and it is withdrawn: routing r2 and the current plan name them. Ownership is now split by surface: CON's own responsibility, the retained core and runtime owners' acceptance, and the joint lane's consumer compatibility. Each is asked for its own narrow acknowledgement, and the owner lanes name their current writers; no writer is inferred from old commit authors. S2 is CON's reply-reservation ledger, distinct from SMC-M01. No M01 object changes, so no M01 acknowledgement is asked | §1, §2, §5 |
| PB-SQL-MANIFEST | **Accepted.** §3.1 is now an exhaustive manifest. It lists: option C's DDL; the seven replaced functions, each with its latest body and owner; the five authenticated entry points and their ACL; every new CON object, including the cleanup `retire` writer and its idempotency key; and S1–S4's exact objects, hashes, triggers and ACLs. **S3's role preamble and its role grant are excluded.** They are superseded under D-8 (Q13A), and the assembly dependency is named. Ask stays off. S2's release and reconcile stay dormant stubs, and their proof sources are stated as later tasks | §3.1 |
| PB-IMPLEMENTATION-COMPANIONS | **Accepted.** §3.2 now names: the persistence module and its five wrapper signatures (`runtime.ts` is read, not edited); the routes and their registration; `generate-runtime-wire.ts`'s exact `SCHEMAS` and `VALIDATED` additions; and every generated companion. §3.4 now names `config/dsh/profile/pnpm-lock.yaml`, as recorder output only, and the canonical patch and profile paths. Revision 1's bare `cordis.patch.yml` was the wrong place for the reply child's row. That row belongs in the reply template's rows | §3.2–§3.4 |
| PB-GATE-ORDER | **Accepted, the first of the review's two sequences.** Every pin that changes the bundle records its identities and the profile lock in the same commit (AGENTS.md:56) and passes the complete gates before the next pin. Revision 1's "record once, at the end" is withdrawn. To make each pin compile on its own, A16's changes to A04's components move from step 2 to step 3, the bridge's step. Each new test is placed where a gate runs it (§3.3, §3.4). There is no stale-artifact waiver, and no claim of a crossing that hasn't run | §3.3, §3.4, §4 |

What revisions 1 and 2 got right stands: the frozen Q7 r8 design and its consumer ACK; the dispatcher-first base (main, the accepted Phase A, then G1's 0048); one writer; the stopped handback; and every hold.

**It rests on these exact records:**

| Record | Exact identity |
|---|---|
| Q7 design, revision 8 (frozen) | [`7d4a76d9`](https://github.com/davidelaverga/Sophia/blob/7d4a76d9ec50fc80e97b3d2912e48ae362863043/docs/coordination/CON-01/G2_Q7_RELAY_OWNERSHIP.md), tree `5df0f52d`, document SHA-256 `82ff0856fd6a5a6d…`, 1298 lines |
| The joint consumer ACK of that exact revision | `BOUNDED_RUNTIME_CONSUMER_DESIGN_ENGINEERING_ACK_EXACT_R8_ONLY`. Findings empty. Safe record `942e5a3cc79d86da…`, original `fc4f61ca63e063fc…`, in [CX-0154](https://github.com/davidelaverga/Sophia/blob/aeff9f89147a96ca0ce3cebe5a776dc8107df24c/docs/coordination/CON-01/CX-0154.md). **A design ACK only:** no writer window, no core or ledger acceptance, no implementation and no target qualification. CX-0155 keeps it valid |
| The joint Phase B review of revision 1 | [`joint-phase-b-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/9fbc1fc26fcb5cd3a49d103a7e282d5bd8d75f0e/docs/coordination/CON-01/evidence/20261012-cx155-reservation/joint-phase-b-review.safe.json) at `9fbc1fc2`, SHA-256 `350d0213059b8745…` (original `894e518aff23f3ec…`). Four P2s; B-1 to B-6 judged compatible consumer directions; K-1 to K-5 routing |
| Codex's root review and the combined packet | [CX-0155](https://github.com/davidelaverga/Sophia/blob/9fbc1fc26fcb5cd3a49d103a7e282d5bd8d75f0e/docs/coordination/CON-01/CX-0155.md) at `9fbc1fc2`; [#198 comment 6118556530](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6118556530) |
| The joint review of revision 2 | [`joint-phase-b-r2-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/7b93140ad327617aad34f07634e76f7d311bd6cd/docs/coordination/CON-01/evidence/20261012-cx157-reservation-r2/joint-phase-b-r2-review.safe.json) at `7b93140a`, SHA-256 `aaf6b43e06f06372…` (original `2d37018cbace6ef1…`). Three P2s; CX-0155's four findings addressed at proposal scope |
| Codex's root review of revision 2 | [CX-0157](https://github.com/davidelaverga/Sophia/blob/7b93140ad327617aad34f07634e76f7d311bd6cd/docs/coordination/CON-01/CX-0157.md) at `7b93140a`; [#198 comment 6118950446](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6118950446) |
| The joint review of revision 3 | [`joint-phase-b-r3-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/2080f1d1945ae0d9d42a96933186c1828c466884/docs/coordination/CON-01/evidence/20261012-cx159-reservation-r3/joint-phase-b-r3-review.safe.json) at `2080f1d1`, SHA-256 `52ba6691dc9c12fb…` (original `13d622f405f19b73…`). Three P2s; K-1c not supplied |
| Codex's root review of revision 3 | [CX-0159](https://github.com/davidelaverga/Sophia/blob/2080f1d1945ae0d9d42a96933186c1828c466884/docs/coordination/CON-01/CX-0159.md) at `2080f1d1`; [#198 comment 6119240597](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6119240597) |
| The joint review of revision 4 | [`joint-phase-b-r4-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/a2118b1b7adac79c39eed93c3e29a3da4731f085/docs/coordination/CON-01/evidence/20261012-cx161-reservation-r4/joint-phase-b-r4-review.safe.json) at `a2118b1b`, SHA-256 `f37c213baff3bce3…` (original `9a9a9832c666c83f…`). One P2; K-1c not supplied |
| Codex's root review of revision 4 | [CX-0161](https://github.com/davidelaverga/Sophia/blob/a2118b1b7adac79c39eed93c3e29a3da4731f085/docs/coordination/CON-01/CX-0161.md) at `a2118b1b`; [#198 comment 6119498696](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6119498696) |
| The joint review of revision 5 | [`joint-phase-b-r5-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/2cb08a7b4a77c31808506c8ee2528393ed407fd3/docs/coordination/CON-01/evidence/20261012-cx162-reservation-r5/joint-phase-b-r5-review.safe.json) at `2cb08a7b`, SHA-256 `86f1614cd3d98912…` (original `75904e556aead0be…`). `BOUNDED_CONSUMER_COMPATIBILITY_ACK_EXACT_PHASE_B_R5_K1C_ONLY_NO_WRITE_GO`; findings empty |
| Codex's root review of revision 5 | [CX-0162](https://github.com/davidelaverga/Sophia/blob/2cb08a7b4a77c31808506c8ee2528393ed407fd3/docs/coordination/CON-01/CX-0162.md) at `2cb08a7b`; [#198 comment 6119717658](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6119717658) |
| Codex's K-3 disposition | CX-0164 at `c4389f844b15599850d490cf85abc1dceafad591`, with `evidence/20261012-cx164-owner-coordination/actual-owner-handback.safe.json` (SHA-256 `cca6dacb49a80f18…`); #198 comment 6119717658, updated. It counts 6120100817 as a narrow K-3 for exact revision 5 (and revision 6, unchanged in §1 to §4) |
| Codex's root review of revision 9 | CX-0168 at `1706f438c574a17fee492c5cfba072cb7678bc1c`, with `evidence/20261012-cx168-reconciliation/a3-fallback-finding.safe.json` (PB9-A3-FALLBACK-TERMINAL-WRITER); #198 comment 6119717658 and #199 comment 6116157885, updated. Revision 9's other corrections are responsive at proposal scope |
| Revision 9 of this file | `1bd83eecec94d336b3b53ff2b67ec6e9a4cc1ee5`, tree `57e7752e`, SHA-256 `790e79c996e6024c…`, 916 lines |
| Codex's review of revision 8, and the joint review | [CX-0166](https://github.com/davidelaverga/Sophia/blob/8bff1a4131c7e633ccd7cbff98efb553ecbd5bb8/docs/coordination/CON-01/CX-0166.md) at `8bff1a41`, with [`joint-r8-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/8bff1a4131c7e633ccd7cbff98efb553ecbd5bb8/docs/coordination/CON-01/evidence/20261012-cx166-r8-review/joint-r8-review.safe.json) (original record `f0f8a320978c759b…`); #198 comment 6119717658, updated. K-1c is withheld for exact `960f262f`: one P2 and one qualification gap |
| The owner's incorporation review of revision 8 | [#198 comment 6120514429](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6120514429), from the joint WBC-02/SDD-01 implementer `session_0155SjcXhv87RErnWEBWxfBM`, measured against 6120057551. It acknowledges D1 to D3, D5, C1 to C4, N1, the ACLs and D4's CHECK as incorporated, with two corrections and a citation fix. It restates K-3 as covering §3.2 and §3.3 unchanged. It attests no source write in flight and its freeze unchanged, and appoints no substitute owner |
| Revision 8 of this file | `960f262f1e51dfb46eb2e16fb093ad1f90eecb11`, tree `0ab2cc13`, SHA-256 `39fd1fc8d62403e2…`, 792 lines |
| Revision 7 of this file | `330e52be6904afb0f2dfd5960e373cc0f6f85c1f`, tree `66af72f1`, SHA-256 `fdb76bf6045a20ba…`, 778 lines. §1 to §4 here are byte-identical to it |
| The joint implementer's K-2d, and its K-3 statement | [#198 comment 6120057551](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6120057551): K-2d, conditional (D1 to D5, C1 to C4, N1), against exact revision 5; its author is verified by Codex. [#198 comment 6120100817](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6120100817): a K-3 statement in the coordinator's own remit, received and not yet verified |
| Revision 6 of this file | `193badb41cd5919bd863429b6ac07e2ac2bc7311`, tree `6304b5be`, SHA-256 `9b04335e14f5f84c…`, 712 lines. Its §1 to §4 were byte-identical to revision 5's |
| Revision 5 of this file | `b975bbe2409cce9d3349c049e2de5569b164b648`, tree `895b75e2`, SHA-256 `69219da474faf2c8…`, 677 lines. The revision that K-1c, K-2d and the K-3 statement each name |
| The current operation drafts | [`CON-01-OP-0002-r6.json`](https://github.com/davidelaverga/Sophia/blob/8af725ea44a6f16b4c0f2c6f6c004bef154c1fcf/docs/coordination/CON-01/CON-01-OP-0002-r6.json) (setup and human chat; SHA-256 `4ea475e83a44410c…`) and [`CON-01-OP-0001-r4.json`](https://github.com/davidelaverga/Sophia/blob/8af725ea44a6f16b4c0f2c6f6c004bef154c1fcf/docs/coordination/CON-01/CON-01-OP-0001-r4.json) (Ask; SHA-256 `661b196bb87f23bd…`), at `8af725ea`. Both are `draft_not_authorized`, and r5 and r3 stay as history. **Pointers only: not reviewed or approved here** |
| Revision 4 of this file | `a31c023f5fe3ccd7c1731fd54aedb4877cfbc96e`, tree `31b660ea`, SHA-256 `b300b0a223933f6c…`, 635 lines |
| Revision 3 of this file | `34397f7e7ee461949c3048918db68759e433f3cd`, tree `d659eaa2`, SHA-256 `68c924f0e83b558b…`, 541 lines |
| Revision 2 of this file | `b6ee23a47188f94c291e0516643dce3f62309601`, tree `f71a9c7a`, SHA-256 `040c2041bd6aba50…`, 437 lines |
| Revision 1 of this file | `57f66b5067a4e50cc0df0190d491947f2624596b`, tree `7a571790`, SHA-256 `6aee5c9e789b23ea…`, 232 lines |
| The owner routing | [`joint-owner-routing.r2.json`](https://github.com/davidelaverga/Sophia/blob/7dc23203eeaef3e91e4515f36127e1f86318d7c4/docs/coordination/CON-01/evidence/20261012-cx131-boundary/joint-owner-routing.r2.json) at `7dc23203`, SHA-256 `569fe9275b0bdb76…` |
| The current plan | `docs/execution/2026-10-01-unified/planning/goals.json` on observed `main` (SHA-256 `1cf14f4e4f49ef1a…`): S1-02 Luis (`folded_not_restarted`); S1-05A and SMC-M01 Davide/Luis (`retained_foundation`). `goals/BASE.md` (`d58298a699f5d6ab…`), whose line 30 asks BASE to "name current writers for routes/App/SidePanel, A10/A11/contracts, registry/byte store and runtime locks". **Routing evidence, not an appointment or an ACK** |
| The shared-runtime freeze, r2 | `SHARED_RUNTIME_FREEZE_20261012.r2.json` at `01777c5ca32b8a92…`, SHA-256 `0a24d62dd9d2df01…`. CON's acknowledgement is CC-0155. **A consumer freeze and preservation agreement; it transfers no foundational SQL ownership** |
| Phase A | GO record `SOURCE_PHASE_A_20261012.r1.json` at `a5479439e8b52424…` (SHA-256 `946c654fb03786ca…`). The pin is `93e9313d` (PR #256, draft), with `0053_runtime_outbox_reconcile.sql`. **The window has ended; acceptance is separate and still pending** |
| The decisions record | D-8 (Q13: least-privilege per-identity isolation; continued inheritance of the broad `sophia_api` is not sufficient), D-10 (the writer) and D-12 (what may be written now), at [`3b1af9b9`](https://github.com/davidelaverga/Sophia/blob/3b1af9b94413a409214b05203d5fbdf5088435c1/docs/coordination/CON-01/BINDING_MAP.md) §13; §8.8's open questions |
| The Q13 isolation plan | [`2ff7daeb`](https://github.com/davidelaverga/Sophia/blob/2ff7daeb34cd56d9a5eec2f0bee8f36cc175b36e/docs/coordination/CON-01/G2_Q13_ISOLATION_PLAN.md), CON's proposal r5. **Held: its own scope and acknowledgement** |
| The reply runtime plan | [`46ddd769`](https://github.com/davidelaverga/Sophia/blob/46ddd769b7182e968da20219a9f6852757419805/docs/coordination/CON-01/G2_RUNTIME_PLAN.md) §3 (the held files) and §5 (the order). SHA-256 `fc6f4ad8548dee9c…` |
| The option C impact inventory | [`3b1af9b9`](https://github.com/davidelaverga/Sophia/blob/3b1af9b94413a409214b05203d5fbdf5088435c1/docs/coordination/CON-01/G2_IMPACT_INVENTORY.md) §3–§7 |
| The S1–S4 candidates | `7d8f415f45d51d3f536443060f5acbfd3bea9455` (PR #211's head, review-only, never to merge). Full hashes in §3.1(e) |
| Observed `main` | `3c40b1c64eadaef5…`. Since `5ed752bd`, which revisions 1 and 2 read, it changes none of the paths this file cites: no `db/`, contracts, persistence, API, bundle, execution host, worker, `config/`, `scripts/`, root package, lock, `AGENTS.md` or planning path. So migrations run through 0045, and amendments through A14. **Observed, not an accepted base** |

## 1. Who is asked, by surface

Every surface Phase B touches has one recorded route. Each route is asked only about its own surfaces (§5).

| Surface | Recorded route | Asked for |
|---|---|---|
| **CON's own:** the reply design; 0048's objects that Phase B replaces; S1–S4; the new `conversation_*` objects (§3.1(d)); A16; `packages/persistence/src/conversation-*.ts` | **CON-01** (this lane). **S2 is CON's reply-reservation ledger.** It is not the SMC-M01 mission ledger, and it needs no separate owner | No external owner is asked. CON/Codex must record its own exact-revision K-1a by immutable commit and document hash before K-5; proposal authorship alone is not that record. Its responsibility does not extend to a shared surface or constitute independent validation |
| **Core tables (0001):** `work_attempts`, `outbox` and `execution_bindings` (option C, §3.1(a)); `commands` (the `retire`'s idempotency key, read but not altered) | **Luis, S1-02** (routing r2, `core`: "source/schema coordination") | A narrow ACK of §3.1(a) and of B-2's rows. The lane names the current writer and reviewer for these tables |
| **The 0012 runtime foundation:** `runtime_commands.kind`, `runtime_cursor`, `apply_runtime_receipt` and `runtime_lease`; the runtime entry-point pattern and its `sophia_api` grant; A04's `RuntimeWorkBinding`/`RuntimeCommand` and proposed hello.bindings/ready.unrecovered502 limits; the runtime routes and their registration | **Davide/Luis, retained S1-05A/BASE** (routing r2: the access and product boundary; BASE.md:30 names the current writers) | A narrow ACK of §2's B-1, B-3, B-5 and B-6, of B-2's runtime part, of §3.1(b), §3.1(c) and §3.2's registration, and, explicitly, of addenda A-1, A-2 and A-3 (§3.1(f); A-3 is new in revision 9). This is a scope ACK, not a mechanics choice: CON's recommendations stand unless the owner replaces one |
| **The held runtime source, existing and new:** §3.3's `control-bridge.ts`, `index.ts`, `transport.ts`, `protocol.ts`, new `reply-child.ts` and `reply-plugin.ts`, and their listed tests; §3.4's `runtime-supervisor.ts`, `runtime-host.mjs`, `profile.mjs`, new `reply-launch.py`/`test_reply_launch.py`, listed Node tests and `config/dsh/reply-rows.reviewed.json` | **Retained S1-05A/R00 source owner,** requested through the recorded foundation owner, with joint preservation review (K-2e). CC-0038's prior exclusions stand. If another owner holds a listed surface, that owner must be identified and supply its own handback | Explicit ownership and one-writer handback for every listed existing/new file and function at the accepted base and finite K-5 window; current writer/unpublished-work disposition. This assigns a request route, not an ACK. K-3 cannot substitute for it. Q8's separate profile/image authority and the recorder-only artifact/lock rules remain required |
| **SMC-M03's latest bodies:** `runtime_hello` (0028:74) and `runtime_record_observations` (0023:20); A11's `RuntimeCommand` payload role and route | **The current SMC-M03 research implementer under Davide,** with Luis for UI integration | A narrow ACK that their goal and research paths are preserved, with only §3.1(b)'s named insertions |
| **The joint lane's latest bodies:** `native_delivery_ineligible` (0041:149, SDD-01) and `dispatch_runtime_outbox` and `capture_native_result` (0042:1806 and :1724, WBC-02) | **The joint WBC-02/SDD-01 implementer,** for those bodies; their foundation is 0012's (S1-05A) | The implementer's ACK of the named insertions in its bodies. Separately, **the joint lane's consumer compatibility** with this exact revision, named by its commit and hash when acknowledged. It has already judged B-1 to B-6 compatible as directions (CX-0155) |
| **#190's overlap:** the generated contracts and shared registration files that freeze r2 lists | **#190's owner** | The overlap and the order in which each side regenerates (Q10) |
| **The base** | **Luis's integration review** | §4's exact commit and tree |
| **The numbers, the census and the GO** | **Codex,** as the source coordinator | As for Phase A, after K-1 to K-4 |

**Not asked:**
- **SMC-M01 (0018, 0019, A08 and A09):** no M01 object, definition or ACL changes, so no blanket M01 acknowledgement is asked.
  - M01 isn't untouched in every sense. S3's dormant context reads the accepted mission (`project_revisions` at `projects.mission_revision`), the decisions, and the mission and ledger revisions, under the compiler identity `sophia.mission-context.v1`. Those read dependencies are kept and preserved.
  - If an M01 change turns out to be needed, it stops the writer and goes to M01's own narrow route (Davide/Luis).
- **`is_task_kind` (0038, SDD-01), `actor_id()` and `is_member(uuid)` (0002, core):** not changed.
- **Q13's read policy and the assembler's identity:** Q13's own scope (§3.1(e), §6).
- **Davide is asked no low-level engineering choice.** What is already his and pending stays pending, and is not asked again:
  - Q8: the reply profile rows and the runtime image;
  - D-4: no reply route is bound, so replies stay `no_grant`.
- **Luis's Studio handback** is separate (§6).

## 2. The engineering binding, against the exact r8 design

Each item is an existing Q7 r8 obligation that the joint ACK left to the core and runtime owners. CON's recommendation is stated so that it can be accepted, replaced or refused. None is a new design. The joint lane's consumer review judged all six compatible (CX-0155, `boundedConsumerDisposition`).

| # | The decision | CON's recommendation | Bound by | Q7 r8 |
|---|---|---|---|---|
| B-1 | **Hello's lease-loss table:** keep it or drop it | **Keep it.** It ends a lease-lost request at the hello, whatever the new bridge answers to the replay. And it keeps a busy or replies-off bridge's `rejected` from releasing a reservation the old execution may have used. **If it is dropped,** the required alternative is accounting-safe: the bridge asks the claim before ever answering a replayed `create` `rejected`. Tests exist for both. P1-E stays withdrawn either way | S1-05A/BASE. SMC-M03 confirms that `runtime_hello`'s goal and research branch is preserved | §6, the table and "Why a table at all"; §10 |
| B-2 | **The cleanup commands, `stop` and `retire`: their writers, keys and delivery.** Exactly one `retire` per attempt. One `stop` per attempt that was claimed, then cancelled. Each comes with its own `commands`, `outbox` and `runtime_commands` rows (0012:74, 77-79). The `runtime_commands` row exists only when a runtime is told: A-2's and A-3's local retirements have none (§3.1(d)'s counts). Never a new Ask, `create` or execution, attempt, reservation, call or allowance reset | **Two writers, using only existing unique constraints:**<ul><li>`conversation_cancel` writes the `stop`. Its `commands` row has key `conversation-stop:<attemptId>`, with the request's asker as its actor. Its one `outbox` row is `native.stop`, `binding/<bindingId>`, `cleanup` true, at epoch 2;</li><li>`conversation_retire` writes the `retire`. Its key is `conversation-retire:<attemptId>`, with the same actor. Its `outbox` row is `native.retire`, `binding/<bindingId>`, `cleanup` true, at the attempt's current epoch.</li></ul>The constraints are 0001's `UNIQUE(project_id, actor_id, idempotency_key)` and `UNIQUE(project_id, command_id, destination_key)`, and 0012's `UNIQUE(project_id, outbox_id)`. The actor is fixed per attempt, so each key stays unique per attempt whoever cancels. Each insert is `ON CONFLICT DO NOTHING`, **then the existing row is read back by its key and verified** (the same attempt, kind and epoch) before any dependent row. A mismatch refuses. So a repeated hello, receipt, withdrawal, erasure or source-out writes nothing new. **Precedence (PB3):** while an attempt's own `stop` has no recorded `checked` answer, `conversation_retire` writes nothing, whichever caller asks; that `checked` answer is the only path to such an attempt's `retire`. Both destinations stay inside the `native.%` reconcile filter, and the `create`'s rows are never reused. The owner may name other keys | S1-02 (the `commands` and `outbox` rows and keys); S1-05A/BASE (`runtime_commands.kind` and the callers) | §6, "The one exception"; §7, "Withdrawal"; §10's delivery counts |
| B-3 | **The cursor rule** for reply `stop` and `retire`: replayed once per hello until that command has a recorded `checked` receipt | A new version of `runtime_cursor` in 0049, with the same signature, owner, security, `search_path` and privileges (0012:399 is not edited). **Reply cleanup only:** test absence of `runtime_receipts.stage = 'checked'` for the exact project/runtime-command id; never use `answered_stage`, which keeps the first answer. **Every goal command keeps the original `answered_stage IS NULL` predicate.** The single runtime low-water mark can replay later goal commands too; tests must prove their journal replay repeats no native effect. Its only caller is hello (0028:105); poll (0016:114) stays unchanged. The reply branch of bridge `execute` precedes the existing prior-receipt return, so cleanup is rechecked rather than answered from stale memory | S1-05A/BASE | §6, the `stopping` row |
| B-4 | **BINDING_MAP §8.2.1:297 and :299,** which say "no second … outbox row or runtime command" beside "one `retire`" | Replaced in the accepted window by: "no second attempt, reservation, `create` or execution. Exactly one cleanup `retire`, with its own command and delivery rows; none on replay". CON edits its own binding only in that window, after B-2 is bound | CON, after B-2 | §6, "Owned by the core owner" |
| B-5 | **The run gate, the claim, and whose lease each call needs** | `runtime_conversation_claim` and `runtime_conversation_go` (§3.1(c)) call `runtime_lease` first. A superseded bridge is refused with `40001`. The lease is the authenticated `bridgeInstanceId`; a body whose `leaseId` differs is refused. Then the request's row is locked, and `conversation_execution_claim` and `conversation_execution_go` run. One atomic `pending` → `running` transition, replayed for the same lease and command. **Claim, go and reserve act only for the claim's own lease. Settle also has Q7 r8's one recovery case:** the current bridge of the same runtime may resend a journaled settle for a request that capture ended, while its ordinal is `reserved`, or `settled` for an identical replay (§3.1(c)) | S1-05A/BASE (the entry points and `runtime_lease`); CON (the claim's table and functions, and S2's ledger) | §6, "The API and 0049"; §7's ledger table (r8:775) and "After a restart" |
| B-6 | **The acknowledgement's eight predicates,** plus the relay's own condition | `runtime_conversation_acknowledged` → `conversation_acknowledged`. Each predicate is bound to its durable key as §7 lists them: `terminalWriter`, `createAnswered`, and `capture: none` only with no `turn/end` in both the journal and the database. A lease-loss `terminalWriter` is the hello's row in `conversation_executions`. **A cancelled request's `terminalWriter` is its `conversation_cancellations` row** (addendum A-1, §3.1(f)), never a later stop's answer. No predicate ever asserts a record that doesn't exist. **An attempt that no runtime was ever told of never reaches these predicates.** Its cleanup is settled locally: under addendum A-2 when it was cancelled, and under A-3 when its `create` was denied at dispatch while its request was still `pending`. The relay's `closed` is never asked of the API | S1-05A/BASE (the entry point, and A-1, A-2 and A-3 explicitly); CON (the predicates over its rows) | §7; addenda A-1, A-2 and A-3 are new |

## 3. Phase B's exact scope, by step

**The order is the plan's §5:** SQL, then the wire and contracts, then the bridge, then the supervisor, launcher and profile, then qualification. One correction from §4 applies: A16's A04 changes move into the bridge step. **Each step is its own immutable pin**, with:
- a fail-before and an after;
- §4's complete gates;
- a fresh composition with the accepted base;
- independent review between steps.

**Nothing outside these lists is written.** An unlisted need stops the writer, and the list is amended and acknowledged again.

**Dormant in every pin.** No reply attempt is admitted outside a test's own setup:
- `conversation_ask` admits only with an enabled grant and a bound route, and neither exists (D-4; Ask off);
- `conversation_set_grant` has no caller in Phase B.

So no reply command reaches a bridge before the pin that teaches the bridge to read one.

### 3.1 Step 1: the SQL, one migration (`0049`, after the census)

**In-source ACL statements are not live effects.** The `REVOKE` and `GRANT` statements below are migration text. In Phase B, a migration runs only on a disposable test database. No hosted or live grant, role, membership or connection change is made or authorized.

**(a) Option C's core DDL** (S1-02; append-only; 0001 is not edited):

| Table | Change |
|---|---|
| `sophia.work_attempts` | `goal_id` and `goal_revision` drop NOT NULL. Add `conversation_reply_id uuid`, with `FOREIGN KEY (project_id, conversation_reply_id) REFERENCES sophia.conversation_replies(project_id, id)`. Add `CHECK (num_nonnulls(goal_id, conversation_reply_id) = 1)` and `CHECK ((goal_id IS NULL) = (goal_revision IS NULL))`. Add the unique partial index `work_attempts_by_reply ON (project_id, conversation_reply_id) WHERE conversation_reply_id IS NOT NULL`: one native attempt per request |
| `sophia.outbox` | `goal_id` drops NOT NULL. Add `conversation_reply_id uuid`, with the same foreign key, and `CHECK (num_nonnulls(goal_id, conversation_reply_id) = 1)`. Add the non-unique partial index `outbox_by_reply ON (project_id, conversation_reply_id) WHERE conversation_reply_id IS NOT NULL`. **Add `CHECK (destination <> 'native.retire' OR conversation_reply_id IS NOT NULL)`** (`outbox_retire_reply_only`; K-2d's D4): a `native.retire` row exists only for a reply. No SQL or TypeScript producer on observed `main` writes `native.retire`, so it is expected to hold over existing rows. That is a statement about producers, not a census: `destination` is unconstrained text (0001:111), so 0049 checks first (below). A request has its `create` row, at most one `stop` row and at most one `retire` row (§3.1(d)'s counts) |
| `sophia.execution_bindings` | Its state CHECK is replaced under its own name, found by its definition (as S1 does for 0048's). `retired` is added to `created`, `launching`, `running`, `idle`, `stopping`, `settled` and `lost` |
| `sophia.runtime_commands` (0012:74-79) | Its kind CHECK is replaced the same way. `retire` is added to `create`, `resume`, `input`, `steer`, `hold`, `stop` and `inspect` |
| `sophia.commands` | Not altered. `goal_id` is already nullable, and the `retire` key uses its existing unique constraint (B-2) |

- **Existing rows, fail closed (PB8-D4-EXISTING-ROW-INVENTORY):**
  - **A preflight, before any DDL in 0049:** `IF EXISTS (SELECT 1 FROM sophia.outbox WHERE destination = 'native.retire') THEN RAISE EXCEPTION … USING ERRCODE = '23514'`. Its detail gives the count of such rows, and nothing from them.
  - **Every new or replaced CHECK is added validated,** never `NOT VALID`. That covers `outbox_retire_reply_only`, the two `num_nonnulls` CHECKs and the goal/revision CHECK, and also the widened binding-state and command-kind CHECKs, which only add values. The `num_nonnulls` and goal/revision CHECKs hold over existing rows only because `outbox.goal_id`, `work_attempts.goal_id` and `goal_revision` are NOT NULL today. So a violating row refuses the same way, by 23514 at `ADD CONSTRAINT`.
  - **No backfill,** and no `UPDATE` or `DELETE` of any existing row. A violation refuses the whole transaction, and every row stays as it was.
  - **Nothing is cleaned automatically.** An incompatible row stops qualification, with its count and provenance, for its owner. Nothing is deleted, reassigned or reset.
  - **No hosted database is read.** The preflight runs only where 0049 runs: in Phase B, a disposable test database.
- **Why no goal row can derive `retire`** (citations corrected in revision 9; the conclusion is unchanged):
  - **Goal cleanup rows:** a goal cleanup row takes its kind from its command (`kind := c.kind`, 0042:1831). Every goal-side `native.stop` cleanup writer writes only `hold` or `stop`:
    - `admit_goal_command` (0012:279; its rows at :319-325);
    - `research_stop_revoked` (0028:110; its `stop` command at :120-122, its rows at :126-127);
    - WBC-02's `work_control` (0042:437; its rows at :458-461), called by `work_command` (:835) and at :1244 and :1918.
  - **`control.settle` rows:** they are taken by the `control.settle` branch (0042:1822) before any kind is derived. Their writers:
    - `admit_goal_command` (0012:327-328);
    - `research_queue_unstarted` (latest at 0041:323-327, earlier at 0028:252-256);
    - `work_control` (0042:485-487).
  - **So:** no goal cleanup row can derive `retire`, and D4's CHECK closes non-cleanup rows.
- **The constraint and index names above are proposals.** S1-02 may rename them.
- `authority_epoch` stays NOT NULL on both tables (BINDING_MAP §8.2).

**(b) The seven replaced shared functions.** Each keeps its signature, owner, `SECURITY DEFINER`, `search_path` and privileges.
- **The current privileges, as K-2d states them:**
  - `dispatch_runtime_outbox(uuid,uuid,uuid)`: `EXECUTE` for `sophia_worker` only (0037:838-839);
  - `capture_native_result(uuid,uuid,bigint,text)`: no grant (0012:580);
  - `native_delivery_ineligible(outbox, goals, commands, execution_bindings, runtime_instances)`: no grant (0012:658). It stays `LANGUAGE sql STABLE`.
- **The joint lane's three latest bodies** follow K-2d's conditions exactly, as set out in their rows. That covers placement, limits and idempotence, and nothing beyond.

| Function | Latest body on observed `main` | Route (§1) | The named insertion |
|---|---|---|---|
| `dispatch_runtime_outbox` | 0042:1806 | Joint (WBC-02); 0012 foundation | **D1, the reply branch,** goes first ahead of the goal path, not ahead of the lease. It comes after the project lock (:1812), the outbox row's `FOR UPDATE` (:1813), the lease check (:1815, 40001) and the lease-expiry step (:1816-1819, `outcome_unknown`). It comes before the goal read (:1820). So a stale or expired lease never dispatches a reply row. A row with `conversation_reply_id` goes to `conversation_dispatch` and returns, whatever its destination (`native.create`, `native.stop` or `native.retire`). **D2, the goal-less guard:** `IF g.id IS NULL` denies, immediately after the goal and command reads (:1820-1821). It comes before the `control.settle` branch (:1822, which calls `settle_native_control`) and before the binding read (:1828). **D5:** everything else is byte-identical. That covers the cleanup branch, the reviewers-only `native.steer` pass, research, design, design review, source review and brief |
| `native_delivery_ineligible` | 0041:149 | Joint (SDD-01) | **N1:** one first `WHEN g.id IS NULL THEN '<fixed reason>'`. Every later `WHEN` is byte-identical. Its only caller is the dispatch goal path (0042:1842), which no reply row reaches under D1, so the guard defends goal-less non-reply rows |
| `capture_native_result` | 0042:1724 | Joint (WBC-02) | It is internal, and its callers are `runtime_record_observations` (latest at 0023:46) and `capture_completed_turns` (0016:23). **C1, the reply branch:** after the binding read (:1729) and before the goal read (`FOR UPDATE OF g2`, :1730-1731). It is keyed on `work_attempts.conversation_reply_id` for `b.attempt_id`. A missing binding never matches, and the existing no-op path is kept. **C2:** the branch takes no goal or job lock, and calls none of `research_turn_end`, `design_turn_end` or `review_turn_end`. **C3, the goal-less guard:** `IF g.id IS NULL THEN RETURN`, immediately after the goal read and before the research job read (:1732). **C4, idempotence:** the same turn end can arrive twice, live and through `capture_completed_turns`' replay. So the branch is idempotent per binding and turn end (`p_turn_end_seq`), and agrees with K-2c's reply branch in `runtime_record_observations`, so a turn is handled once |
| `runtime_hello` | 0028:74 | SMC-M03; 0012 foundation | Preserve the goal SELECT INTO bindings byte for byte; aggregate CON bindings separately and append, never two aggregate result rows via UNION ALL. B-1's table runs after the project lock and instance update, handling valid owned reply states without new CON domain exceptions. The bounded two-CON-binding rule and complete502 hello/ready reports are specified in the research amendment |
| `apply_runtime_receipt` | 0012:464 | S1-05A | A reply branch first, before the goal and job reads (BINDING_MAP §8.2.1). For cleanup, a `checked` `stop` settles the binding and calls `conversation_retire`; any other answer leaves it `stopping`, replayed at each hello (B-3). Either way, an open reservation becomes `uncertain`. A `checked` `retire` marks the binding `retired`; any other answer leaves it, replayed at each hello. **A `create` answer for a cancelled attempt** (`rejected`, `failed` or `outcome_unknown`):<ul><li>is recorded once per stage (0016:97-102), and what it carries is scrubbed;</li><li>changes neither the `cancelled` request, nor the `stopping` binding, nor any accounting;</li><li>its `conversation_retire` call writes nothing while the attempt's own `stop` is unconfirmed (B-2's precedence)</li></ul> |
| `runtime_record_observations` | 0023:20 | SMC-M03; 0012 foundation | A privacy-fenced reply branch under the existing runtime_lease project/instance locks, then sorted CON request locks (§8.2.2). Preserve ownership checks first and the goal path byte for byte; valid owned reply states and their helpers cannot poison a mixed research batch. Original malformed-input/authentication/storage failures remain failures; see the research amendment |
| `runtime_cursor` | 0012:399 | S1-05A | B-3's rule only |

**The preservation test accounts for the insertions.** It doesn't claim whole definitions are byte-identical. For each function:
- `pg_get_functiondef`, with each named insertion removed between its marker comments, equals the latest body byte for byte. An insertion that replaces text, like S4's in `conversation_source_out`, is compared with the original text restored in its place;
- `proowner`, `prosecdef`, `proconfig` and `proacl` are equal before and after.

**Receipt precision, P-3 (revision 11).** The reply branch preserves the foundation's first-answer evidence and command/outbox transition guards. If cleanup first answers `outcome_unknown` and later records `checked`, its `runtime_commands.answered_stage`, `outbox.state` and `commands.state` remain `outcome_unknown`; immutable `runtime_receipts` records both stages. The new `checked` drives only the reply binding's cleanup settlement and its one subsequent retire, as applicable. B-3 consults the recorded stage and stops replaying that cleanup. A later negative or duplicate stage cannot undo an already checked cleanup, revive the reply, publish text, release uncertain usage or reset an allowance. No reconcile change is added; 0053 keeps these rows outside its claim window. Tests pin each row and both stage orderings.

**(c) The five authenticated runtime entry points** (new):
- **The functions:** `sophia.runtime_conversation_claim`, `runtime_conversation_go`, `runtime_conversation_reserve`, `runtime_conversation_settle` and `runtime_conversation_acknowledged`. Each takes `(bytea, text, text, jsonb)` (the token hash, runtime unit, bridge instance and request) and returns `jsonb`.
- **Their form:** each is `SECURITY DEFINER`, `SET search_path = pg_catalog, sophia`, and calls `sophia.runtime_lease(p_token_sha256, p_unit, p_bridge)` first. That is the pattern of 0012:837-841 and 0025:606-614.
- **The lock order:** the project, then the instance (inside `runtime_lease`), then the request's row.
- **The authenticated scope:**
  - `runtime_lease` returns the caller's runtime instance: its project, resource, unit and id (`runtime_instances`, 0012:52-60).
  - Every call must name an attempt whose binding has that project, resource and unit, and whose `create` was queued for that runtime instance (`runtime_commands.runtime_id`).
  - The request, attempt, binding, command and ordinal must all belong together.
  - A unit name alone is never the scope.
- **Claim** takes the request only while no claim exists. Under the request lock, it records the caller's `bridgeInstanceId` as the claim's lease. A replay by the same lease and command answers as before, and any other caller is refused (`already_claimed`). It never requires a claim that doesn't exist yet.
- **Go and reserve** act only for the claim's own lease: the caller's `bridgeInstanceId`.
- **Settle** acts in two cases (PB2-RECOVERY-SETTLE-LEASE), and in no other:
  - **live:** the claim's lease is the caller's;
  - **recovery** (Q7 r8:775, :887), when all of these hold:
    - the caller holds the runtime's current lease, which `runtime_lease` has just proved;
    - the claim's lease is an earlier bridge instance of the same runtime;
    - the request is terminal, and `conversation_acknowledged`'s `terminalWriter` is capture;
    - the ordinal is `reserved`, or `settled`. A `settled` ordinal here is the identical replay of a recovery settle whose answer was lost (PB3-RECOVERY-SETTLED-REPLAY).

  In both cases S2's `conversation_settle` then checks the amounts. It accepts `reserved` → `settled`, or an identical replay, and refuses anything else (`outcome_conflict`).
  - **For a `settled` ordinal,** it returns the existing receipt without any mutation, and only when the usage is identical (S2:363-364). The grant's counters don't move.
  - **A later current instance** of the same runtime replays the same way.
  - **A different body** is `outcome_conflict`.
  - **An `uncertain` or `released` ordinal** is refused, and is never settled.
  - **The recovery case is settle only.** It never claims, goes, reserves, releases, resets an allowance or moves the claim.
  - **Why capture is the only terminal writer here:** a request ended any other way loses its open ordinals to `uncertain`. That covers a receipt, the hello's lease-loss rows, and a cancellation, whose own `stop` answer moves them (Q7 r8 §7). A recovering bridge never settles a cancelled request's ordinal.
- **Acknowledged** requires the scope only, because the recovering bridge asks it (Q7 r8 §7).
- **Their ACL:** `REVOKE ALL ... FROM PUBLIC`, then `GRANT EXECUTE ... TO sophia_api`, for these five only.

| Entry point | Calls (internal, no grant) |
|---|---|
| `runtime_conversation_claim` | `conversation_execution_claim(p_attempt uuid, p_command uuid, p_lease text, p_epoch bigint)` |
| `runtime_conversation_go` | `conversation_execution_go(p_attempt uuid, p_command uuid, p_lease text, p_epoch bigint)` |
| `runtime_conversation_reserve` | S2's `conversation_reserve(uuid, uuid, integer, jsonb)`, for a request `running` under this lease |
| `runtime_conversation_settle` | S2's `conversation_settle(uuid, uuid, integer, jsonb)`, in the live or the recovery case above |
| `runtime_conversation_acknowledged` | `conversation_acknowledged(p_attempt uuid, p_keys jsonb)` |

**(d) CON's new internal objects.** None has a grant: `REVOKE ALL ... FROM PUBLIC, sophia_api, sophia_worker`; each table has row security on and no policy.
- **The table `sophia.conversation_executions`:** one row per attempt (`UNIQUE (project_id, attempt_id)`). It holds the request, the command, the lease (`bridgeInstanceId`), the epoch and the claim's outcome (`claimed`, `running` or `lost`). For a lease loss, it also holds the hello's instance that recorded it (B-6's `terminalWriter`).
- **The table `sophia.conversation_cancellations` (new; addendum A-1):** one row per cancelled request (`UNIQUE (project_id, reply_id)`). `conversation_cancel` writes it in the same transaction as the `cancelled` state.
  - **Immutable:** a new trigger function, `conversation_cancellations_kept()`, refuses `UPDATE`, `DELETE` and `TRUNCATE` through two triggers, as S2 to S4 do for their tables. It is closed like every other new function.
  - **It records:**
    - the request, and its attempt if there is one;
    - the reason, and the real cancellation time (`p_at`);
    - the caller: `conversation_withdrawn_from` or `conversation_source_out`;
    - **the typed immediate cause (PB4):**
      - `cause_kind`: `member_withdrawal`, `source_answer_withdrawal`, `conversation_erasure` or `source_out`;
      - `cause_conversation_id`, `cause_seq` and `cause_message_id`: for the two withdrawals, the withdrawn message; for the erasure, the conversation and seq 1, with no message;
      - `cause_source_id`: for `source_out` only;
    - the epoch it raised;
    - whether a claim existed, and the `stop` command it wrote, if any;
    - what became of the `create`, read under the request lock: `superseded` or `left_to_dispatch` (no runtime command existed yet), `dispatched`, or `none`.
  - **The CHECKs:**
    - each `cause_kind` has exactly its own fields set, and the others NULL;
    - `source_out` goes with the caller `conversation_source_out`, and the other three kinds with `conversation_withdrawn_from`.
  - **No text:** ids, seqs, kinds and times only. No message or source text is copied.
  - **The first cause only:** the first input that cancels a request writes its row. A later one finds the request terminal, so `conversation_cancel` writes nothing; the unique key is only a backstop.

  It is the cancelled request's `terminalWriter` (B-6).
- **The claim and go:** `conversation_execution_claim` and `conversation_execution_go` (B-5).
- **Dispatch and delivery (PB2-STOP-DELIVERY):**
  - **What `conversation_dispatch` must do (K-2d's D3)**, within the same call:
    - **Enqueue atomically:**
      - one `UPDATE runtime_instances SET command_sequence = command_sequence + 1 … RETURNING`, on the binding's active runtime;
      - one `runtime_commands` row with `outbox_id = o.id`, `command_id`, `binding_id`, `attempt_id` and `authority_epoch = o.authority_epoch`;
      - the outbox row set to `acknowledged`, with `lease_until` NULL.

      That is the same atomic insert-and-acknowledge as the goal path's (0042:1886-1895).
    - **Otherwise, deny or defer** only through outbox states that 0012's reconcile, and #256's 0053, already map: no command row means `pending`, and a command row means the receipt mapping.
      - **Each takes one exact form** (revision 9; CX-0166; the owner's 6120514429).
      - **Neither shared helper is edited or widened.**
    - **The deferral, job-inert (PB8-A2-DEFER-HELPER-SCOPE).** Every reply deferral, A-2's included, is exactly `sophia.defer_native_delivery(o, NULL::sophia.commands, '<fixed reason>')`.
      - **What `o` is:** the reply's own outbox row, read `FOR UPDATE` under the project lock.
      - **Why it touches no job:** the helper isn't `STRICT`, and reads `c` only in its `jobs` predicate (0012:700-701). With `c.id` NULL, `command_id = c.id` matches no row. So it locks, changes and announces no job: no `native_task.waiting` (:702).
      - **What it keeps:** its outbox transition, which is its own (:698-699): `pending`; `lease_owner`, `lease_token` and `lease_until` NULL; `available_at = now() + 5 seconds`; `outcome_reason = left(reason, 2000)`. It returns `deferred`.
      - **What it still does:** its `UPDATE` runs on `sophia.jobs` and takes that relation's ordinary lock. So the claim is no job **row** lock or effect, not no access.
    - **The denial, CON-only.** `conversation_dispatch` never calls `deny_native_delivery` (0012:661-679), with any command:
      - its `native.create` branch writes bindings, attempts and jobs;
      - its other branch emits a project-visible `command.denied` event;
      - a NULL command would leave the command `admitted`, and emit an event with no id.

      **A reply's denial writes exactly two rows:**
      - the outbox row: `denied`, with `lease_until` NULL and `outcome_reason = left(reason, 2000)`;
      - the reply's own command, read by `o.command_id`, never NULL: `denied`, from `admitted` or `dispatching`.

      It returns `denied` with the reason, the shared helper's shape. It writes no `jobs`, binding, attempt, goal, cancellation or `project_events` row. It changes no reservation, counter or allowance.
    - **What else a denial does, by case** (enumerated for review):
      - **(A) A `create` whose request is no longer `pending`** (cancelled, under the request lock). Nothing else: the request keeps its `cancelled` state and its cancellation row (A-1), and A-2 settles the attempt's existing `retire`.
      - **(B) A `create` whose request is still `pending`, but ineligible** (`conversation_delivery_ineligible`: the asker no longer writes, the conversation isn't open, a source fails the predicate, or the grant is disabled or expired). **New in revision 9, for review.**
        - A-3's conditions are checked first, before any write (§3.1(f)). If they hold, the request ends `failed`, reason `not_dispatched`, and the attempt is retired locally in the same transaction (addendum A-3).
        - **If any fails, the dispatch refuses (55000) and writes nothing** (revision 10, PB9-A3-FALLBACK-TERMINAL-WRITER). There is no denial, no `failed` and no `retire`, so no fallback ever needs a `terminalWriter`.
        - Revision 8 named no denial form here. Had the shared helper been used, it would have settled the binding and failed the attempt, goal-style, and left the request `pending`.
      - **(C) A cleanup row at a stale epoch, or one for a `retired` binding.** Nothing else: the attempt's current-epoch rows govern it.
    - **A-2's local settlement** uses the goal path's own cleanup outcome: the outbox row `settled`, and the command `checked` (0042:1832-1835).
    - **Use the runtime's single `command_sequence`.** There is no separate sequence for replies, so cursor order and Hold and Stop claiming first stay valid.
    - **Take no goal or job row lock.**
      - The order is the project, the outbox row, CON's own rows, the binding, then the runtime instance. The runtime entry points also take the project row first, so the two orders never interleave.
      - The job-inert deferral's relation-level lock on `sophia.jobs` is `conversation_dispatch`'s only access to that table.
    - **Never call `settle_native_control`.**
  - **`conversation_dispatch(o)`, by destination:**
    - `native.create`: the inventory's §4.2 eligibility, `conversation_reply_statement` and the payload, as a `create` runtime command at epoch 1;
    - `native.stop` and `native.retire`, the cleanup rows: a `stop` or `retire` runtime command at the row's epoch. Its payload has no text, role or route, and nothing is assembled. **A cancelled request's grant, open state and sources are never checked for cleanup,** so they can't block an authorized attempt's cleanup. **Except under addendum A-2:** a `native.retire` row whose binding has never had any runtime command is delivered to no runtime. It is settled locally if A-2's conditions hold, and deferred otherwise (§3.1(f)).
  - **`conversation_reply_statement`:** BINDING_MAP §8.3's statement, built only from S3's recorded context. It refuses without one.
  - **`conversation_delivery_ineligible(o)`:**
    - for `native.create`, the inventory's §4.2 conditions;
    - for a cleanup row, only that the row's epoch is the attempt's current one and the binding isn't `retired`.
- **Cancelling: `conversation_cancel(p_project uuid, p_reply uuid, p_reason text, p_at timestamptz, p_cause_kind text, p_cause_conversation uuid, p_cause_seq bigint, p_cause_message uuid, p_cause_source uuid)`.** The cause is typed by its caller (below), and checked against the row's CHECKs. A malformed cause refuses, before any state changes.
  - **Locks first:** its caller already holds the project and conversation locks. It locks the request's row, and does nothing unless the request is `pending` or `running`.
  - **Then reads:** the request's attempt, binding and claim, and whether the `create` has a runtime command. All of this is read **before** any state changes.
  - **Then, in every case:**
    - the request becomes `cancelled`, with the reason and `settled_at`, and the attempt's epoch rises to 2;
    - its `conversation_cancellations` row is written in the same transaction, with the caller's typed cause (A-1);
    - if a runtime command holds the `create`'s payload, it is scrubbed in place (Q7 r8's `payloadScrubbed`).
  - **What else depends on the claim:**
    - **No claim yet.** No execution exists, and none can start: a claim needs `pending` under this same lock.
      - The `create`'s outbox row, if still `pending`, is superseded, as `research_stop_revoked` does (0028:115). If a worker already holds its lease, dispatch finds the request no longer `pending` and denies it.
      - No `stop` is written. `conversation_retire` writes the attempt's one `retire` now. If the `create` never reached a runtime, that `retire` reaches none either: A-2 settles it locally (§3.1(f)).
      - If the `create` already reached a runtime, the bridge's claim is refused `not_pending`. It spawns nothing and answers `outcome_unknown`, which writes nothing new.
    - **A claim exists, before or after `go`.** The binding becomes `stopping`, and B-2's one `stop` is written at epoch 2.
      - Its `checked` answer settles the binding and writes the one `retire`.
      - Any other answer leaves it `stopping`, replayed at each hello (B-3).
      - Either way, an open reservation becomes `uncertain` (Q7 r8 §7, "Withdrawal").
  - **Its callers in Phase B:**
    - S1's `conversation_withdrawn_from`: withdrawal, erasure, and source-out's answered branch;
    - S4's `conversation_source_out`, in its open-request branch (§3.1(e)).
  - **Not wired in Phase B, and held:** the grant switched off, and the asker's removal (BINDING_MAP §8.5). Revision 2 named them as callers without the functions that would call.
    - Wiring them needs `conversation_set_grant` (S2's; it has no caller in Phase B) and a membership-removal function that isn't CON's and isn't in this manifest.
    - Neither can meet a live reply in Phase B: no grant exists, and Ask is off.
    - They are closed, with their own owners' acknowledgement, before any Ask activation.
- **Retiring:** `conversation_retire`, B-2's writer. It is called:
  - by `conversation_cancel` with no claim;
  - by `apply_runtime_receipt`'s reply branch (a terminal receipt; a `checked` `stop`);
  - by `capture_native_result`'s reply branch;
  - by `runtime_hello`'s lease-loss rows;
  - by `conversation_dispatch`'s denial case (B) (A-3; new in revision 9).

  **One guard, in the writer, so every caller has it (PB3-STOPPING-RETIRE-PRECEDENCE).** Under the request's and the binding's locks, `conversation_retire` writes nothing in either of two cases:
  - the attempt's `retire` already exists;
  - the attempt has a `stop` (a claimed attempt that was cancelled) whose runtime command has no recorded `checked` answer.

  So for such an attempt, a late `create` answer, capture or a hello writes no `retire`, however often it arrives. The stop's own `checked` answer, through `apply_runtime_receipt`, is the only path to it. A newly recorded `checked` after an earlier `outcome_unknown` is a new stage, not a replay, and writes the first `retire`. **Each attempt has exactly one `retire`.**
- **The delivery counts,** in `commands` / `outbox` / `runtime_commands` rows per attempt:

  | How the attempt ends | `create` | `stop` | `retire` |
  |---|---|---|---|
  | Not cancelled: capture, a terminal receipt, or the hello's lease-loss rows | 1 / 1 / 1 | 0 | 1 / 1 / 1 |
  | Cancelled before any claim, the `create` never dispatched | 1 / 1 (superseded or denied) / 0 | 0 | 1 / 1 / 0: settled locally, no runtime told (A-2) |
  | Denied at dispatch while the request is still `pending` | 1 / 1 (denied) / 0 | 0 | 1 / 1 / 0: settled locally in the same transaction, no runtime told (A-3) |
  | The same, but A-3's conditions fail on contradictory evidence | +0: the dispatch refuses and rolls back | +0 | +0 |
  | Cancelled before any claim, the `create` already dispatched | 1 / 1 / 1 | 0 | 1 / 1 / 1 |
  | Cancelled after a claim, before or after `go` | 1 / 1 / 1 | 1 / 1 / 1, at epoch 2 | 1 / 1 / 1, written only by the stop's own `checked` |
  | An identical replay: hello, receipt, withdrawal, erasure, source-out | +0 | +0 | +0 |
  | A new `checked` stop answer after an earlier `outcome_unknown` | +0 | its stage recorded once | the first `retire`, once |
- **`conversation_acknowledged`:** B-6.
- **Replaced from 0048, keeping each one's owner, security, `search_path` and privileges:**
  - `conversation_ask`, the admission (the inventory, §4.1), additionally enforcing the research amendment's durable two-unretired-CON-binding cap under the project lock before any operational/accounting writes. Idempotent replay returns the original request; a third new Ask records blocked/cleanup-capacity with its human message retained, no attempt/command/outbox/reservation or allowance reset;
  - `conversation_withdrawn_from(uuid, uuid, bigint, text)`: S1's body, except its cancelling `UPDATE` (S1:51-53). Its signature is unchanged, so 0048's two callers are untouched. In place of that `UPDATE`:
    1. **It types the cause once,** from its own inputs and one unique, locked lookup:
       - `p_reason = 'conversation_erased'` (only `erase_conversation` passes it, 0048:390): `conversation_erasure`, with `p_conversation` and seq 1;
       - otherwise, the message at `(p_conversation, p_seq)`, read `FOR SHARE` under 0048's `UNIQUE(conversation_id, seq)`. Its caller has just withdrawn that message in the same transaction: `withdraw_conversation_message` (0048:366) or S4's answered branch (S4:459-463). Its `withdrawn_by` decides the kind:
         - `author` or `admin` gives `member_withdrawal`;
         - `source` gives `source_answer_withdrawal`.

         In both cases the cause holds the conversation, seq and message id.
       - **Fails closed:** a message that isn't there, or isn't withdrawn, refuses. Nothing is inferred from another message or a timestamp.
    2. **It takes one time,** `clock_timestamp()`, for every request it cancels.
    3. **It selects the open requests,** `pending` or `running` with `cutoff_seq >= p_seq`, `FOR UPDATE` in id order.
    4. **It calls `conversation_cancel` for each,** with that typed cause.

    No state is updated before each request's attempt is identified.

**(e) S1–S4, promoted into 0049 from `7d8f415f`.** Each comes with its exact objects and its closed ACL. The only differences from the candidates are the ones named in this subsection and in (d).

| Candidate | SHA-256 | What 0049 takes |
|---|---|---|
| S1 `db/candidates/con01-s1-reply-states.sql` (55 lines) | `bf2ce1908bf3cac25c9de094a7c74708c828f76a233ba373a84808f93f70d817` | **All of it.** The refusal over an open `outcome_unknown` (:16-22). 0048's settled-time CHECK on `conversation_replies`, replaced under its own name (:26-34). `conversation_replies_open`, recreated for `pending` and `running` (:37-39). `conversation_withdrawn_from`, replaced (:44; its final body is (d)'s), and its `REVOKE ALL ... FROM PUBLIC` (:55). No grant |
| S2 `db/candidates/con01-s2-conversation-reply-ledger.sql` (427 lines) | `e136626d20fdb85b4f375d54d8e27b5d4a5362e3baeab498fca0597bc92a4316` | **All of it:**<ul><li>five tables: `conversation_grants`, `conversation_grant_approvals`, `conversation_grant_subjects`, `conversation_reply_allowances` and `conversation_reservations`;</li><li>the unique index `conversation_grants_current`;</li><li>eleven functions: `conversation_ledger_kept` (the trigger function), `_ledger_amount`, `_reservation_receipt`, `_grant_subjects_set`, `_new_lineage`, `_set_grant`, `_reserve`, `_settle`, `_mark_uncertain`, `_release` and `_reconcile`;</li><li>eight triggers: four `*_kept` and four `conversation_ledger_tables_kept`.</li></ul>Row security is on for all five tables (:414-418). Its ACL (:419-426) revokes everything from `PUBLIC`, `sophia_api` and `sophia_worker`. **Its closed ACL doesn't broaden:** only §3.1(c)'s entry points reach `_reserve` and `_settle` |
| S3 `db/candidates/con01-s3-conversation-reply-context.sql` (754 lines) | `d0a84820b483581b79ccc9d637d53f41bec2bccef8ff9cb158d15c4d9032f4e4` | **All but its role preamble and its role grant.** It takes:<ul><li>four tables: `conversation_assembly_claims`, `conversation_reply_contexts`, `conversation_reply_sources` and `conversation_reply_messages`;</li><li>three indexes: `conversation_reply_contexts_recorded` (unique), `conversation_reply_sources_by_source` and `conversation_reply_messages_by_message`;</li><li>twenty-two functions: `conversation_context_kept`, `_quoted`, `_time`, `_fields`, `_template`, `_mission`, `_decision`, `_message`, `_current`, `_scrub`, `_message_scrubbed`, `_reply_scrubbed`, `_grammar` and `_list`; `conversation_assembly_locked`, `_privacy`, `_current`, `_claim`, `_begin`, `_close` and `_fail`; and `conversation_record_context`;</li><li>ten triggers: four `*_kept`, four `conversation_context_tables_kept`, `conversation_context_message_scrub` and `conversation_context_reply_scrub`.</li></ul>Row security is on (:730-733), and its function `REVOKE` is kept (:736-750) |
| S4 `db/candidates/con01-s4-reply-fences.sql` (495 lines) | `ba32e07294d0e2908b06ba2887c207d8811625a2ea5e361c62ca90c4d34e47b8` | **All of it, with one named insertion in `conversation_source_out` (below):**<ul><li>three tables: `conversation_reply_answers`, `conversation_reply_suppressions` and `conversation_context_erasures`;</li><li>`conversation_context_kept`, replaced (:112);</li><li>the length CHECK on `conversation_reply_contexts`, replaced under its own name (:158-166);</li><li>eleven functions: `conversation_fences_kept`, `_fences_locked`, `_reply_verdict`, `_fences_recorded`, `_answer_receipt`, `_context_digest_erase`, `_fences_text_gone`, `_reply_check`, `_publish_answer`, `_refuse_answer` and `_source_out`;</li><li>seven triggers: three `*_kept`, three `conversation_fences_tables_kept` and `conversation_fences_text_gone`.</li></ul>Row security is on (:482-484), and its ACL (:485-495) is closed to every login |

- **S3's role preamble is excluded and superseded.** That is the `DO` block that creates or adopts `sophia_conversation_assembler` (:22-51), and line 55, `GRANT sophia_api TO sophia_conversation_assembler WITH INHERIT TRUE;`.
  - D-8 (Q13A) rejects continued inheritance of the broad `sophia_api` as the reply identity's isolation.
  - The isolation plan that replaces it (`2ff7daeb`) is held under its own scope. A held plan is not permission to promote the old preamble.
  - **So 0049 creates no role, grants no membership and changes no role attribute.**
- **S3's entry-point grant is excluded too.** That is :751-754, `GRANT EXECUTE ... TO sophia_conversation_assembler`.
  - S3's five entry points (`conversation_assembly_claim`, `_begin`, `_close`, `_fail` and `conversation_record_context`) have **no grantee** in Phase B. Only their owner can execute them.
- **The `REVOKE` lists change to match.** S3:734-735's and S4:485-486's table `REVOKE`, and S4:487-495's function `REVOKE`, drop `sophia_conversation_assembler` from their role lists. A `REVOKE` from a role that doesn't exist fails, and nothing else in those lists changes.
- **S4's `conversation_source_out` gets one insertion, its only change (PB2-SOURCE-OUT-CANCEL).** Its open-request branch (:452-456) set the request `cancelled` directly, so a running attempt was never stopped.
  - **The replacement:** that branch's `UPDATE` (:454-455) becomes `PERFORM sophia.conversation_cancel(p_project, r.id, why, t, 'source_out', NULL, NULL, NULL, p_source)`, between marker comments. Its typed cause is its own `p_source`, the source whose suppression it has just written (:446-447).
  - **When it runs:**
    - under the locks the function already holds: the project (:416), the conversation (:442) and the request (:443);
    - while the request is still `pending` or `running`, so its attempt and claim are read before any state changes;
    - before `conversation_context_digest_erase` (:468).
  - **What it sets is unchanged:** `cancelled`, the reason `why`, and `settled_at` `t`. `n_cancelled` still counts it.
  - **Also unchanged:** the suppressions, tombstones and counts, and the answered branch (:457-465).
    - That branch still reaches later open requests in the same conversation through `conversation_withdrawn_from`, which now cancels each through `conversation_cancel`.
    - Nothing reaches other humans, other conversations or independent decisions.
  - **The promotion-equality test** restores the candidate's original `UPDATE` (:454-455) in place of this insertion, then compares the whole definition with the candidate's byte for byte. Every other S4 function is compared whole, unchanged.
  - **Nothing else is added:** no source-policy trigger, grant or Q13 scope. `conversation_source_out` still has no caller but a test's owner setup, until the held source-writer and Q13 integration.
- **The assembly dependency, named.** A reply's context is assembled only by the isolated identity that Q13's scope defines and qualifies (D-8's tests). Until Q13 is accepted and its own scope is written:
  - no reply can be assembled outside a test's owner setup;
  - `conversation_reply_statement` refuses;
  - **Ask stays off.**
- **S2's `conversation_release` and `conversation_reconcile` stay the `no_proof_source` stubs** of S2:402-411. Nothing in Phase B calls them, and they refuse every call. Their proof sources are later, separately acknowledged ledger tasks:
  - release's is a rejected create's receipt, or an outbox row never claimed, fenced in the same transaction (S2:399-401);
  - reconcile's is the attempt's `usage_records`, by ordinal (Q7 r8 §6). It is run only by an operator, separately authorized.

  Until release is wired, **no reservation is ever released.** The receipt branch's `rejected` row finds none `reserved` in any reachable state: a reservation exists only after `go` (S2:311), and the hello's lease-loss rows move open ones to `uncertain`. Should one ever be found there, it becomes `uncertain`, still counted, and is never released. That narrows BINDING_MAP §8.4:437's "it is `released`" to the stub's reality for Phase B, and a test pins it.

**(f) Three addenda to the frozen Q7 r8, named for explicit review.** A-1 is unchanged since revision 4. A-2 and A-3 gain C-1's two absence checks in revision 11; A-3 was introduced in revision 9.
- **Q7 r8 (`7d4a76d9`) stays frozen.** Its design ACK is not counted for any addendum.
- **Who reviews each:** the retained runtime owner (S1-05A/BASE) and CON. The joint lane checks consumer compatibility (K-1b, K-1c).
- **Not exceptions:** B-2's precedence guard and the settled-replay settle are restatements consistent with r8 (r8:709-718, :775). They are not exceptions.

**A-1: a cancelled request's terminal writer is its cancellation.**
- **What r8 says:** `terminalWriter` names a receipt, capture, or the hello's lease-loss transition (r8 §7).
- **Why that is not enough:** a cancelled request becomes terminal in `conversation_cancel`'s own transaction, before any `stop` is answered.
  - Naming the later stop's `checked` would name something that did not cause it.
  - An unclaimed cancellation has no `stop` at all.
- **The addendum:** for a cancelled request, `terminalWriter` is its `conversation_cancellations` row (§3.1(d)), with its typed immediate cause, real time and caller. The row is written under the same locks as the `cancelled` state, from the inputs its caller passes, never inferred afterwards.
  - The stop's `checked` answer settles the binding, and is recorded as that.
  - The other seven predicates are unchanged, and none is skipped.

**A-2: an attempt whose create never reached a runtime is retired locally, only after the complete local proof.**
- **The case:** an attempt cancelled before any claim, when no runtime command was ever written for its binding.
- **What no command proves:** no bridge can claim, spawn a conforming child, journal that child's output, or reserve a metered call for it. It does **not** prove that no observation or usage row exists: hello can disclose an unretired binding, and observation intake scopes to its runtime/binding without a command gate. C-1 therefore checks those two tables explicitly under the same project lock.
  - A claim needs the `create`'s runtime command for the caller's runtime (§3.1(c)), and a `pending` request.
  - A home exists only after a claim's spawn.
  - A reservation exists only after `go` (S2:311).
- **What r8's barrier is for:** the eight predicates, and the relay's `closed`, gate a bridge's deletion of a home it may hold. Here there is no home, no relay and no bridge to ask. The predicates are not evaluated, and none is marked met.
- **The settlement:** `conversation_dispatch` settles the attempt's `native.retire` row locally. That is what the goal path already does for a cleanup row whose binding has no runtime command (0042:1830-1837).
  - **When:** in the dispatch transaction, under the project, outbox and binding locks.
  - **Only if all of these hold:**
    - the request is `cancelled`, and its `conversation_cancellations` row recorded the `create` as `superseded` or `left_to_dispatch`. That was read under the request lock at cancellation, so no runtime command existed then;
    - the `create`'s outbox row is now final and undispatched: `superseded` or `denied`;
    - no `conversation_executions` row exists for the attempt;
    - no `runtime_commands` row exists for the binding;
    - **C-1:** no `native_observations` row exists for the binding;
    - **C-1:** no `usage_records` row exists for the attempt.

    **The proof is historical, not a current absence.** A runtime command is written only in the same transaction that moves its outbox row to `acknowledged` (0012:768-770), and `conversation_dispatch` keeps that rule. A row that ended `superseded` or `denied` was never acknowledged, so no runtime command was ever written for it. The cancellation row records what held at cancellation. No migration in the base or in this manifest deletes `runtime_commands` rows. A test asserts that the recorded and final states agree, rather than relying on absence alone.
- **What it writes:** the binding `retired`, the attempt `stopped`, the `retire`'s outbox row `settled`, and its `commands` row `checked`.
- **What it never writes:** no `runtime_commands` row, no runtime receipt, no `create` answer, no claim, no `stop` and no call. The `create`'s `commands` row stays as the supersession or dispatch's denial left it. It is never marked answered.
- **Fail closed:**
  - **Contradictory observations or usage:** either C-1 check failing defers this retire through the existing typed-NULL deferral, without local settlement, deleting/scrubbing evidence, changing usage or declaring the barrier satisfied. Seed each independently, with every row except the already specified deferral transition unchanged.
  - **A row still in flight:** the `create`'s outbox row may still be `dispatching` or `outcome_unknown`, because a worker held its lease when the request was cancelled. Then the `retire` is deferred, not settled.
    - The `create`'s dispatch then finds the request no longer `pending`, and denies it. Or 0053's reconcile re-dispatches it into that same denial.
    - Only then does the `retire` settle.
  - **A runtime command did reach the binding:** A-2 never applies. The `retire` is delivered and acknowledged in full.
- **Before it settles:** the hello may still list the binding `stopped` (r8's table). A bridge that never held it finds no home, and asks nothing.
- **Unchanged:** every other attempt's `retire`, with r8's full barrier: process, future writer, relay, journal, observations, usage and reservations.

**A-3: a request whose `create` is denied at dispatch, while the request is still `pending`, is retired locally.** New in revision 9, for explicit review. Its fallback was removed in revision 10 (PB9-A3-FALLBACK-TERMINAL-WRITER).
- **The case:** §3.1(d)'s denial case (B). `conversation_dispatch` holds the `create`'s live lease and the request is still `pending`, but `conversation_delivery_ineligible` gives a reason.
- **Why nothing exists to clean:**
  - The `create`'s row is `dispatching` under this live lease, past D1's checks, so it was never `acknowledged`.
  - A runtime command is written only in the transaction that acknowledges its row (0042:1893-1895). 0053's reconcile re-dispatches only a row with no runtime command. So no create was ever dispatched; hello may still have disclosed the binding. Absence of observations and usage is checked separately by C-1.
  - With no runtime command there is no claim (§3.1(c)), no home, and no reservation (S2:311).
- **Checked first,** under the dispatch's locks, before any write. All of these must hold:
  - the `create`'s row is `dispatching` under this transaction's live lease (D1);
  - no `runtime_commands` row exists for the binding;
  - no `conversation_executions` row exists for the attempt;
  - no `conversation_reservations` row exists for the request, in any state: `reserved`, `settled`, `released` or `uncertain`;
  - **C-1:** no `native_observations` row exists for the binding;
  - **C-1:** no `usage_records` row exists for the attempt.

  **The proof is in the transaction itself,** not a later absence.
- **Only then does the one transaction write,** in this order:
  1. the CON-only denial: the `create`'s outbox row and its command, both `denied`, with the ineligibility as the outbox's reason;
  2. the request `failed`, reason `not_dispatched`, `settled_at = clock_timestamp()`, and only from `pending`;
  3. `conversation_retire`'s one `retire`, under B-2's key, read back and verified. No `stop` exists, so the precedence guard doesn't hold it back;
  4. its local settlement, with A-2's writes: the binding `retired`, the attempt `stopped`, the `retire`'s outbox row `settled` and its command `checked`.
- **If any check fails, it refuses, and writes nothing** (revision 10, extended by C-1). `conversation_dispatch` raises `55000`, with a fixed message and nothing from any row. The retained foundation owner confirmed this code in CC-0038.
  - The transaction rolls back. The `create`'s row stays as it was, the request stays `pending`, and every row is unchanged.
  - **What it doesn't do:**
    - no denial, no `failed` and no `not_dispatched`;
    - no `retire`, local settlement or full retirement;
    - no receipt, cancellation, claim, execution or call;
    - no reservation release, settlement or `uncertain` change, no counter or allowance change, and no reset or deletion.
  - **Why this is the truthful outcome:** contradictory evidence means the case isn't A-3's. Nothing here could name a `terminalWriter` for a `failed` request (r8:860-870): no receipt, capture, hello or A-1 cancellation ended it. So nothing is ended.
  - **What happens next:** the worker counts the exception as lost and does not immediately redispatch it. Its next per-pass `expire_dispatch_leases` moves an expired lease to `outcome_unknown`; 0053's reconcile returns a row with no runtime command to `pending`, then claim may lease it again. D1's own expiry step only applies to a dispatch actually called after expiry. Each later dispatch refuses while the contradiction remains; nothing repairs it automatically. No hot-loop or starvation waiver is implied.
- **What it never writes:**
  - no runtime command, receipt, `create` answer, claim, `stop` or call;
  - no `conversation_cancellations` row, since this isn't a cancellation;
  - no `jobs`, goal or `project_events` row;
  - no reservation, counter or allowance change.
- **The predicates:** like A-2's attempt, this one never reaches B-6's eight predicates. Its record is the request's `failed` state and A-3's rows. A-3 has only two outcomes, local retirement or a refusal that writes nothing, so no A-3 path ever needs a `terminalWriter` or a full retirement.
- **Not changed:** A-1, byte for byte. A-2 also receives C-1 in this revision. Every other attempt's `retire` keeps r8's full barrier.

**Not edited:**
- every other function in the inventory's §3. That includes `runtime_poll` (0016:114), `runtime_lease` (0012:387), `runtime_record_receipts`, `claim_runtime_outbox` and `reconcile_runtime_outbox`, which is 0053's after Phase A;
- every M01 object, `is_task_kind`, `actor_id()`, `is_member(uuid)` and every policy;
- any applied migration, 0048 included;
- `apps/worker/src/runtime-dispatch.ts`.

**Tests:**
- **`packages/persistence/src/runtime.db.test.ts`,** extended with Q7 r8 §10's SQL cases:
  - the hello table's rows;
  - the `stopping` replay once per hello;
  - B-3's reply-only receipt-aware cursor, including `outcome_unknown` then `checked`, both stage orderings, one stuck cleanup before later goal commands, and restart journal replay with no repeated goal effect;
  - the `retire`'s uniqueness across a repeated hello and a replayed receipt;
  - the claim and go;
  - `40001` for a superseded bridge;
  - no reachable call to either S2 stub.
- **Cleanup delivery (PB2-STOP-DELIVERY).** Each case counts every `commands`, `outbox` and `runtime_commands` row against §3.1(d)'s table. At step 1 they run in SQL, with each answer recorded through the runtime entry points as a stub bridge would record it. Step 4's `reply-runtime.test.mjs` repeats them across the stub runtime:
  - cancelled before the `create` is dispatched (A-2):
    - the `create` row superseded, no `stop`, and one `retire`, settled locally: binding `retired`, outbox `settled`, command `checked`;
    - no runtime command, receipt, claim, spawn, reservation or call, and the `create` never marked answered;
    - the cancellation row is the `terminalWriter`;
    - **race controls:**
      - with the `create`'s row `dispatching` under a held worker lease, the `retire` is deferred; the `create` is then denied, and only then does the `retire` settle;
      - with a `create` that did reach a runtime, the `retire` is delivered and acknowledged in full;
      - **C-1:** seed one observation for the binding, then independently one usage record for the attempt. Each causes typed-NULL deferral, no local retirement or false deletion receipt, no cleanup of the contradictory evidence and no usage/allowance change. The digest allows only the exact existing deferral transition, not arbitrary row changes;
  - **denied at dispatch while the request is still `pending` (A-3).** Before the `create` is dispatched, the grant expires, the asker stops writing, or a source fails:
    - one transaction gives exactly A-3's four steps: the `create` row and its command `denied`; the request `failed` (`not_dispatched`); and one `retire`, settled locally (binding `retired`, attempt `stopped`, outbox `settled`, command `checked`);
    - no runtime command, receipt, claim, reservation, cancellation row, `jobs` row or project event;
    - the next hello doesn't list the binding, and a replayed dispatch writes nothing;
    - **fail closed on contradictory evidence (PB9-A3-FALLBACK-TERMINAL-WRITER).** Each case is seeded, catalog-valid, while the request is still `pending` and its `create` row is `dispatching` under a live lease:
      - **the cases:**
        - a `runtime_commands` row for the binding;
        - a `conversation_executions` row for the attempt;
        - a `conversation_reservations` row for the request, once `reserved` and once `uncertain`, with its grant's reserved and uncertain counters to match;
        - **C-1:** a `native_observations` row for the binding;
        - **C-1:** a `usage_records` row for the attempt;
      - in each, the dispatch refuses (`55000`) and the transaction rolls back;
      - **every row is unchanged,** by a digest of each table's rows before and after: `outbox`, `commands`, `conversation_replies`, `work_attempts`, `execution_bindings`, `runtime_commands`, `conversation_executions`, `conversation_reservations`, `native_observations`, `usage_records`, the grant's counters and `project_events`. The before digest is taken **after claim commits**: its `dispatching`, lease and attempts increment are not A-3 writes (P-4);
      - **nothing is written:** no `failed`, `not_dispatched`, denial, `retire`, receipt, cancellation, claim or call; no reservation release, settlement or `uncertain` change, no allowance reset, and no deletion;
      - a later dispatch of the same row refuses the same way;
      - no case reaches B-6's predicates, and none needs a `terminalWriter`;
  - cancelled after the `create` reached a runtime, before any claim: the claim refused `not_pending`, no `stop`, and one `retire`;
  - **cancelled after the claim, before `go` (PB3-STOPPING-RETIRE-PRECEDENCE),** with the launcher held so that there is no process proof:
    - a late `create` `rejected`, `failed` or `outcome_unknown`, both before and after a `stop` `outcome_unknown`;
    - capture;
    - repeated hellos, each replaying the same `stop`.

    The binding stays `stopping`, and there is no `retire`. A verified `checked` stop then writes exactly one. The counts, epochs and allowances don't move;
  - cancelled after `go`: one `stop` at epoch 2. It is dispatched with no statement, with the grant disabled and the source withdrawn.
    - Its `checked` answer gives the one `retire`.
    - Its `outcome_unknown` answer leaves the binding `stopping`, and the next hello replays the same `stop` with no new row;
  - repeated withdrawal, erasure and source-out, a repeated hello and a replayed receipt: no new row;
  - a key found with a different attempt, kind or epoch: refused, before any dependent row;
  - in every cancelled case that a runtime took, `conversation_acknowledged` (through the real entry point and the real `create`) names the cancellation row as `terminalWriter` (A-1), never a stop's answer, and the runtime's real answer as `createAnswered`. A-2's case is checked by reading internal provenance only. No entry point is called with a `create` that doesn't exist;
  - **the cancellation cause (PB4-CANCELLATION-CAUSE-INPUT):**
    - **several eligible inputs:** two messages below one request's cutoff, withdrawn in separate transactions; or a withdrawal, then the erasure; or two sources out for one running request. Each row keeps exactly the first input that cancelled it, by its kind and keys, and the later inputs leave it unchanged;
    - **the answered propagation:** a source-out withdraws an answer, and a later open request in the same conversation is cancelled through `conversation_withdrawn_from`. Its row reads `source_answer_withdrawal`, with that answer's conversation, seq and message;
    - **replays:** the same withdrawal (0048's key returns its prior receipt), the same erasure and the same source-out leave every row unchanged;
    - **refusals:** a malformed cause, or a `(conversation, seq)` with no withdrawn message, refuses, and nothing changes;
    - **the paths around it:** each case runs through both claimed and never-dispatched cleanup, in SQL and through the stub bridge, with no new execution, reservation, call or allowance reset, and every barrier intact;
  - in every case, no new execution, attempt, reservation, call or allowance reset.
- **Source-out (PB2-SOURCE-OUT-CANCEL).** A running request has a recorded context and a claimed attempt. Its source becomes ineligible, and `conversation_source_out` runs. The cases show:
  - the request `cancelled` (`source_withdrawn` or `source_out_of_scope`) and the epoch 2;
  - one `stop`, then `checked` or `outcome_unknown`, then the one `retire`;
  - the suppressions, tombstones and counts that S4's own tests expect.

  Also: a pending request with no claim gets no `stop` and one `retire`, and the answered branch's same-conversation reach is unchanged.
- **Recovery settle (PB2-RECOVERY-SETTLE-LEASE):**
  - **positive:** bridge instance A claims, goes and reserves. Capture commits `answered`, and A goes before its settle is answered. Instance B of the same runtime says hello and resends the same settle, and the ordinal becomes `settled`;
  - **the lost answer (PB3-RECOVERY-SETTLED-REPLAY):**
    - B's recovery settle commits, but its answer is deliberately dropped;
    - B's identical retry returns the same receipt, and the grant's reserved and spent counters don't move;
    - a later instance C of the same runtime replays the same way;
  - **negatives:**
    - A, after B's hello (`40001`);
    - another resource, unit, project, attempt or ordinal;
    - an `uncertain` ordinal;
    - a different body, on a `reserved` or a `settled` ordinal (`outcome_conflict`);
    - a `released` ordinal;
    - a request that a receipt, the hello's lease-loss rows or a cancellation ended;
    - B trying to claim, go or reserve.
- **K-2d's conditions (future cases; none has run):**
  - **D4:**
    - **fail-before,** on revision 5's DDL: a goal-bound `native.retire` outbox row is accepted;
    - **after:** it is refused (23514) by `outbox_retire_reply_only`, with `cleanup` false and with `cleanup` true;
    - **the preflight (PB8-D4-EXISTING-ROW-INVENTORY):**
      - on a disposable database at §4's base, seed a catalog-valid `native.retire` outbox row: once with `cleanup` false, once with `cleanup` true;
      - 0049 refuses with 23514, before any DDL;
      - the transaction rolls back. Every seeded and existing row is unchanged, by a digest of each table's rows before and after, and no 0049 object exists;
      - with no such row, 0049 applies;
    - **validated:** `pg_constraint.convalidated` is true for `outbox_retire_reply_only` and every new or replaced CHECK; none is `NOT VALID`;
    - **the goal path, unchanged:** goal `native.create` rows; the `hold` and `stop` `native.stop` cleanup rows from `admit_goal_command`, `research_stop_revoked` and `work_control`; and the `control.settle` rows. Each is written and dispatched as before;
    - a reply's `native.retire` row is accepted, dispatched (or settled under A-2 or A-3), and replayed as §3.1(d) counts it.
  - **D1:** a reply row with a stale lease token gets 40001, and one with an expired lease becomes `outcome_unknown`. Neither is dispatched.
  - **D2 and N1:** a goal-less non-reply row is denied before `control.settle` or the binding read, and `settle_native_control` is never called for it.
  - **D3:**
    - reply and goal commands share one runtime's `command_sequence`, in order;
    - the `runtime_commands` insert and the outbox `acknowledged` commit together, or not at all;
    - a denied or deferred reply row ends only in a state that 0012's reconcile and 0053 map;
    - **the job-inert deferral (PB8-A2-DEFER-HELPER-SCOPE).** A-2's in-flight case defers the `retire` through `defer_native_delivery(o, NULL::sophia.commands, …)`:
      - the outbox row reads exactly: `pending`; `lease_owner`, `lease_token` and `lease_until` NULL; `available_at` the transaction's `now()` plus 5 seconds; and `outcome_reason` the fixed reason. `attempts` is unchanged;
      - **the adverse seed:** two catalog-valid `pending` `jobs` rows in the reply's project, each with another reason. One has the `retire`'s own command as its `command_id`, the row a non-NULL call would match. The other has a NULL `command_id`;
      - while the deferral's transaction is open, a second connection takes `FOR UPDATE NOWAIT` on both rows, and succeeds;
      - after it commits, both rows are unchanged (state, reason and `xmin`). No `project_events` row is added: `event_sequence` doesn't move, and there is no `native_task.waiting`;
      - no runtime command, `create` receipt, claim, provider call or reset;
      - a later final denial of the `create` lets exactly one local settlement happen;
      - the receipt claims only that no job row is locked or changed, never zero access: the helper's `UPDATE` does run on `sophia.jobs`;
    - **the CON-only denial,** in each of §3.1(d)'s cases. Case (A) is a cancelled request's `create`; (B), A-3's still-`pending` `create`; (C), a stale-epoch cleanup row and one for a `retired` binding:
      - the denial writes exactly the outbox row (`denied`, `lease_until` NULL, the reason) and the reply's own command (`denied`, from `admitted` or `dispatching`). In case (B), it also writes A-3's enumerated rows when A-3's checks hold, and nothing more. When they fail, the denial isn't made at all;
      - with the same adverse `jobs` seed, keyed to the `create`'s command, no `jobs`, `execution_bindings`, `work_attempts` or `project_events` row changes beyond those named: no `cancelled` job, and no `command.denied` or `native_task.denied` event;
      - `conversation_dispatch`'s definition calls neither `deny_native_delivery` nor a denial with a NULL command;
    - no goal or job **row** is locked. The deferral's relation-level lock on `sophia.jobs` is expected, and isn't counted as one.
  - **C1 to C4:**
    - a missing binding takes the existing no-op path;
    - the reply branch calls no `*_turn_end` and locks no goal or job;
    - a goal-less goal path returns before the research job read;
    - the same turn end, live and then through `capture_completed_turns`, is handled once, in agreement with K-2c's `runtime_record_observations` branch.
  - **D5:** the preservation test of §3.1(b), with each named insertion removed, and the owner, security, `search_path` and ACL equal.
- **The option C and catalog cases:**
  - the two CHECKs and the unique attempt index;
  - the five entry points executable by `sophia_api` alone;
  - every new table and internal function closed to `PUBLIC`, `sophia_api` and `sophia_worker`;
  - no role created and `pg_auth_members` unchanged.
- **§3.1(b)'s preservation test.**
- **From `7d8f415f`, changed only to read the migrated database** instead of applying `db/candidates/*`:
  - `conversation-reply-states.db.test.ts` (S1, `ce1f2be8487fcb0a…`);
  - `conversation-ledger.db.test.ts` (S2, `72bd63ec90e472b0…`);
  - the role-independent cases of `conversation-assembly.db.test.ts` (S3, `5b5121033a54b065…`) and `conversation-fences.db.test.ts` (S4, `fe9e536f1e1e3506…`).
- **Held, not promoted:** their cases that record a context through `sophia_conversation_assembler`, and the module they use, `conversation-assembly.ts` (`35f18af65275a4eb…`, which issues `SET LOCAL ROLE` to that role in each transaction). These stay on #211, held with Q13, and every receipt names them as not run. No case is rewritten to pass without the role.
- **The bridge to #211's results:** a promotion-equality case shows that each promoted S3 and S4 function and constraint is byte-identical to its candidate, except `conversation_source_out`'s one named insertion. So #211's recorded results stay attached to the same bodies, without being claimed as re-run. `conversation_source_out`'s results are not carried over: its own new case, above, covers it.
- **`conversation-context.ts`** (`1b378011b228833d…`) and **`conversation-context.test.ts`** (`9123b01de94f790b…`) are promoted unexported and dormant, for S3's grammar cases.
- **Existing tests:** `conversations.db.test.ts`, whose A10 case changes by design (the inventory, §6); `db/tests/0037_amendment_preservation.sql`; `personal.db.test.ts:922-929`.
- **TypeScript:** `packages/persistence/src/outbox.ts`'s `OutboxRow.goal_id` becomes `string | null`. No worker code reads it.

### 3.2 Step 2: the route shapes, persistence and routes (additive; no A04 change)

**Amendment A16 (CON's), additive only:**
- ten component schemas:
  - `RuntimeConversationClaimRequest` and `RuntimeConversationClaimReply`;
  - `RuntimeConversationGoRequest` and `RuntimeConversationGoReply`;
  - `RuntimeConversationReserveRequest` and `RuntimeConversationReservation`;
  - `RuntimeConversationSettleRequest` and `RuntimeConversationSettlement`;
  - `RuntimeConversationAcknowledgedRequest` and `RuntimeConversationAcknowledgement`;
- the five paths `/v1/runtime/conversation/{claim,go,reserve,settle,acknowledged}`.

They are prefixed `RuntimeConversation` so they never meet A16's public `ConversationReply`. A04's `RuntimeWorkBinding` and `RuntimeCommand` are **not** changed in this step (§4).

**The generator, `packages/contracts/scripts/generate-runtime-wire.ts`:**
- `SCHEMAS` (:18) and `VALIDATED` each gain exactly those ten. The bridge sends the five requests and reads the five replies.
- Nothing else in the generator changes.
- **`generate-validators.ts` (`EXPORTS`) and `src/validate.ts` are not edited.** They serve the client's parsers, and no client reads these shapes.

**Generated companions,** made only by `pnpm --filter @sophia/contracts generate` and never merged by hand:
- `packages/contracts/openapi/openapi.json`;
- `packages/contracts/src/generated-types.ts`;
- `packages/contracts/src/generated/validators.js` and `validators.d.ts`. These are expected unchanged, since no exported client schema changes; `pnpm contracts:check` proves it either way;
- `packages/dsh-bundle/src/runtime-wire.generated.ts` and `runtime-wire-types.generated.ts`.

`generate-specialists.ts` and both `specialists.generated.ts` files are unchanged, because their input is unchanged.

**Persistence: the five-call implementation.** The new file is `packages/persistence/src/conversation-runtime.ts`, a CON path. It follows `research.ts:91-108`: a local `args(who)` and `operation(c, fn, who, request)` run `SELECT sophia.<fn>($1, $2, $3, $4) AS reply` and return `onlyRow(rows, fn).reply`. It imports `type RuntimeCaller` from `./runtime.ts` and `onlyRow` from `./rows.ts`.

```ts
export const runtimeConversationClaim = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationClaimRequest) =>
  operation<RuntimeConversationClaimReply>(c, 'runtime_conversation_claim', who, request)
export const runtimeConversationGo = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationGoRequest) =>
  operation<RuntimeConversationGoReply>(c, 'runtime_conversation_go', who, request)
export const runtimeConversationReserve = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationReserveRequest) =>
  operation<RuntimeConversationReservation>(c, 'runtime_conversation_reserve', who, request)
export const runtimeConversationSettle = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationSettleRequest) =>
  operation<RuntimeConversationSettlement>(c, 'runtime_conversation_settle', who, request)
export const runtimeConversationAcknowledged = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationAcknowledgedRequest) =>
  operation<RuntimeConversationAcknowledgement>(c, 'runtime_conversation_acknowledged', who, request)
```

- **The capability, lease and binding checks are the SQL entry points' own** (§3.1(c)). The module adds no authority.
- **`packages/persistence/src/runtime.ts` is read** (`RuntimeCaller`), **not edited.**
- **`packages/persistence/src/index.ts`** gains one export block for the five.

**Routes:**
- **`apps/api/src/routes/runtime.ts`:**
  - `RUNTIME_ROUTES` (:43-58) gains the five paths;
  - a new `conversationRuntimeRoutes(app, pool)`, modelled on `researchRoutes` (:181), registers each with `runtimeHeaders`, the body `$ref` and the 200 response `$ref`;
  - each handler is `withService(pool, (c) => runtimeConversationX(c, callerOf(req), req.body))`.
- **`apps/api/src/app.ts`** gains the import and one call, after `researchRoutes(app, deps.pool)` (:212).

**Preserved, per freeze r2's Phase B paths:**
- #190's `VOICE_SCHEMA`, the required-schema list and `registerHealth`;
- the voice persistence exports;
- A15's and A17's contracts and validation;
- every A11, A12, A13 and A14 runtime shape in the generator's lists.

**Tests:**
- `packages/persistence/src/conversation-runtime.db.test.ts` (new): each wrapper through the real entry point, with `40001` after a newer hello and a refusal for another unit's attempt;
- `apps/api/src/runtime.db.test.ts`, extended: the five routes, the capability headers, and a missing capability refused;
- `tests/unit/routes.test.mjs`, with the five paths;
- the contract checks;
- every goal case unchanged.

### 3.3 Step 3: the A04 wire change and the bridge, one pin

**Amendment A16, its A04 part.** This moves here from revision 1's step 2.
- `RuntimeWorkBinding` becomes a `oneOf`: `{goalId, goalRevision}` exactly as today, or `{conversationReplyId}`.
- `RuntimeCommand.kind` gains `retire`.
- **R12 bounded proposal:** `RuntimeHelloReply.bindings.maxItems` and `RuntimeReady.unrecovered.maxItems` both move500 to502, preserving up to500 goal bindings and at most two CON bindings. Keep complete failed-recovery reports; do not truncate either array. Existing observation/receipt batch caps remain500. Admission, generated companions, reader-first compatibility and rollback are bound by the [research amendment](G2_RESEARCH_COMPATIBILITY_AMENDMENT.md); this is not an accepted wire change or implementation grant.
- A11's `RuntimeCommand` payload `role` and `route` patches are preserved.
- The same generated companions are regenerated.

**Approved recovery addition (handoff11):** A16's RuntimeServiceBinding becomes exclusive original goal row / CON row. Only CON gains required conversationReplyId and create:null/current/unresolved metadata, exactly as the source addendum above. The new0049 CON-HELLO-BINDINGS insertion supplies it and keeps original goal SQL/authority unchanged. Existing listed generation/tests/coordination companions apply. Authenticated API/PG recovery, malformed/correlation contradictions, reader-first rollout and cleanup-compatible rollback are requalified; metadata is not process or deletion proof.

**Edited:**
- `packages/dsh-bundle/src/control-bridge.ts`: `execute`'s one reply branch (bridge:694), `connect` → `reconcileReply` (bridge:319-350) and the disposer (bridge:309-316);
- `index.ts`: `BridgeSettings.replies`;
- `transport.ts`: the five conversation calls and the optional `signal` on `observations`;
- `protocol.ts`: `KINDS` (:28) gains `retire`.

**New:**
- `packages/dsh-bundle/src/reply-child.ts` (`ReplyChildren`, `ReplyChild`, `ReplyRelay` and `fromJournal`);
- `packages/dsh-bundle/src/reply-plugin.ts`.

**Not edited:**
- `role-registry.ts`, `config/roles.json` and `config/specialists.json`. The reply child takes no native role or tool, and no route is bound (D-4). Revision 1 listed `role-registry.ts`; Q7 r8 §6 has no change there;
- `packages/dsh-bundle/package.json`. Its `files` already ships `dist/*.js`, but its `exports` expose no subpath. So the `sophia-reply-child` row must resolve the plugin through the approved loader form (Q8). That it does is proved by execution (step 4's L1, step 5's P7), not assumed;
- `packages/dsh-bundle/cordis.patch.yml`, the goal profile's bundle layer.

An unlisted need, a plugin entry included, stops the writer (§3).

**Artifact:** the bundle archive changes, so §4's recording applies.

**Tests:**
- `tests/unit/reply-child.test.mjs` and `tests/unit/reply-plugin.test.mjs` (new), beside `bridge-core.test.mjs`. They hold Q7 r8 §10's cases, unchanged. Only the place moves:
  - Q7 r8 names `packages/dsh-bundle/test/*.test.ts`, which no `pnpm test` glob reaches (`package.json:16`);
  - a test under the bundle's `src/` would enter its build (`tsconfig.json`: `include: ["src"]`) and so its archive.
- `tests/unit/bridge-core.test.mjs`, with a reply twin;
- the goal fixtures, byte-identical.

### 3.4 Step 4: the supervisor, the launcher and the profile

**Edited:**
- `apps/execution-host/src/runtime-supervisor.ts`: `SupervisorOptions.replies`, `environment()`, and `sweepReplies` with the generation seal;
- `scripts/runtime-host.mjs` and `scripts/lib/profile.mjs`: the reply template's install, its link rule and its `sophia-reply-tree-v1` digest.

**New:**
- `apps/execution-host/reply/reply-launch.py` and `test_reply_launch.py` (Q7 r8 §10's `unittest` cases);
- `tests/unit/reply-launch.test.mjs`, which runs `python3 -I -m unittest discover -s apps/execution-host/reply -p 'test_*.py'` and fails, never skips, on any nonzero exit or a missing `python3`. That way `pnpm check` runs them. The existing Python precedent runs in its own workflow (`.github/workflows/uml-fixture.yml`), outside `pnpm check`, and no workflow file is in scope. These tests, and the relocated bundle tests, are a plan until they are executed. An unsupported platform or missing containment is reported as failed or held, never as passed on exit 0 alone.

**Profile, by canonical path:**
- **`config/dsh/reply-rows.reviewed.json` (new):** the reply template's reviewed rows. They include the `sophia-reply-child` row that loads the bundle's `reply-plugin`. The rows are Davide's (Q8), so this step waits on Q8. Revision 1 placed that row in a bare `cordis.patch.yml`, which was wrong.
- **The template's install:** it uses the same committed profile files, lock and bundle archive as today's `installInto` (`profile.mjs:54-67`), with the reply rows as its only difference. There is no second lock.
- **The template's digest:** the launcher computes and records it at host start (Q7 r8 §5). It depends on the host's install, which P1 records. **It is not a committed identity.** Revision 1's "recorded in `config/runtime-unit.json`" is withdrawn.
- **Unchanged:**
  - `config/dsh/profile/cordis.patch.yml` (the user patch, `[]`);
  - `packages/dsh-bundle/cordis.patch.yml`;
  - `config/dsh/base-rows.reviewed.json` and `scripts/lib/gate.mjs`;
  - `config/dsh/profile/package.json` and `pnpm-workspace.yaml`;
  - the root `pnpm-lock.yaml` and `workspace_lock_sha256`.

**No route, role, specialist, dependency or workspace-lock change** (D-4).

**Tests:**
- `tests/integration/supervisor.test.mjs`, extended;
- `tests/integration/reply-runtime.test.mjs` (new): L1, with the loopback stub. It includes the crossings of §3.1's cleanup-delivery, source-out and recovery-settle cases, through the real bridge, launcher and stub runtime.

### 3.5 Step 5: qualification

Q7 r8 §9's P1–P8 and §10's L1 cases run on the step 4 pin, composed with the accepted base, on the pinned runtime with the stub route only. **No provider call, and no hosted effect.** A fix found here is a new pin, with §4's recording and gates.

**Not in Phase B:**
- Q13's shared read-policy scope and the assembler's identity (freeze r2 start condition [4]; `2ff7daeb`, its own scope and acknowledgement);
- the Studio, held for Luis's handback;
- any route or credential;
- S2's release and reconcile proof sources;
- the grant-switch and asker-removal cancellation (§3.1(d)).

## 4. Base, number, writer, order, gates and handback

- **The base:** one exact commit and tree, sealed before the first write. It contains:
  - `main`;
  - **the accepted Phase A** (0053, PR #256, once accepted and merged). It is the dispatcher prerequisite, so it comes first;
  - **G1's 0048 (PR #199),** because 0049 extends 0048's tables and functions, and `main` has neither. PR #199 is held at `d527f385`, pending Luis's Studio handback. So the integration owner either accepts G1 onto `main` first or names a composed base.
  - It is not `#211`'s diverged base, and not an unmerged CON candidate by default.
- **The numbers:** 0049 for the migration, from CON's retained 0048–0050. A fresh census of every published ref, every PR and the local owner confirms it at the start. A16 is CON's amendment. **A collision stops the writer.** The historical reservations are not a fresh census, and 0053 stays reserved.
- **One proposed writer:** Codex, session `01a1224a-32b4-7222-a017-50a277572d95`, under Davide's 12 October takeover. The former CON Claude session is no longer the feature implementer. This records the assignment, **not** a K-5 GO. Each retained owner must acknowledge its own surfaces and leave them unwritten during the exact window. The joint lane keeps its freeze until handback, and #190 later merges `main` with its own writer. No second writer or executable window is created here.
- **The order:** §3's five steps. Each is pinned, reviewed and accepted before the next, and re-composes with the accepted base.

**The gates (PB-GATE-ORDER).** CON chooses the first of the review's two sequences: **every accepted pin is complete and recorded.**
- **AGENTS.md:56** requires the identity diff with any change to the bundle, the lock or the runtime package.
- **`pnpm check` runs `pnpm artifacts`,** which compares the archive, the unit and the profile lock and exits 1 on any mismatch (`build-artifacts.mjs`).
- So a pin whose bundle changed but whose identities weren't recorded would fail the ordinary gate. The second sequence (partial intermediate pins, one final record) would leave pins that fail it, so it isn't used.

| Pin | Bundle archive | Identities | Gates |
|---|---|---|---|
| Step 1 (SQL) | unchanged | `pnpm artifacts` must reproduce the base's record unchanged | `pnpm check` complete, `pnpm test:db`, `pnpm test:sql` |
| Step 2 (shapes, persistence, routes) | changed (the generated wire) | `pnpm artifacts:record`. The diff to `config/runtime-unit.json` (`sophia_bundle.archive_sha256`, `.archive_integrity` and `.artifact_digest`) and `config/dsh/profile/pnpm-lock.yaml` is committed in the pin | as step 1 |
| Step 3 (A04 wire, bridge) | changed | recorded as step 2 | as step 1 |
| Step 4 (supervisor, launcher, profile) | unchanged | `pnpm artifacts` must reproduce step 3's record. If it doesn't, the writer stops and names why | as step 1, plus `reply-runtime.test.mjs` |
| Step 5 (qualification) | — | `pnpm artifacts` reproduces the step 4 record on the composed tree | as step 1, plus P1–P8 and L1 |

- **The lock is recorder output only.** `config/dsh/profile/pnpm-lock.yaml` pins only the bundle archive's integrity (`artifacts.mjs:9-10, :28-33`). It is written only by the recorder, and it grants no dependency or workspace-lock change.
- **Only the bundle identities move.** They are the same on every platform (`artifacts.mjs:124-127`). The per-platform `dsh.*` digests don't change, because no dsh pin changes.
- **Unchanged in `config/runtime-unit.json`:** its `id`, `status`, `model_routes`, `role_routes` and `required_before_deploy`. No unit cutover is part of Phase B.
- **Why each pin passes alone:** every pin is dormant (§3), and its goal crossings run unchanged on the real pinned dsh. The step 2/step 3 split puts each contract change in the same pin as the code that compiles against it. Revision 1's step 2 changed A04's `RuntimeWorkBinding`, which the bridge's `WorkBinding` type aliases (`protocol.ts:20`).
- **What each receipt states:** each pin's receipt names the crossings that exist in that pin and ran. A crossing that doesn't exist yet, such as the bridge's reply path at steps 1 and 2, is "not present", never "passed". Held cases are named "not run" (§3.1).
- **Fail-before:** each pin's new tests are run first against the previous pin, then after.
- **No waiver:** there is no stale-artifact waiver, no rerun of an old probe, and no old image receipt for new artifacts.

**The handback boundary (freeze r2):**
- the immutable commit and tree;
- the exact path, function, contract and identity diffs;
- the ordinary checks and the affected real integration crossings;
- the retained failures, the cleanup and the limits;
- a preservation review against the joint mission's source;
- every reserved write stopped before the handback;
- the ownership return recorded.

**Stop conditions (freeze r2):**
- a path, method, object, grant or role outside §3;
- an edit to an applied migration;
- a number collision or a second writer;
- any change to a goal, research, design, source-review, M01 or Paperclip path beyond §3;
- any hosted, provider, deployment, spend or permission effect.

Any of these stops the writer and goes back to Codex.

## 5. The acknowledgements, as a checklist

| # | From | Acknowledges | State |
|---|---|---|---|
| K-1a | CON-01, now Codex as the feature author | Its own responsibility: the reply design, 0048's replaced objects, S1–S4 (S2 included, distinct from M01), `conversation_source_out`'s insertion, §3.1(d), A16, `conversation-*.ts` | **Pending for exact revision 12.** The revisions1–11 records are historical and are not extended over the B-3/A-2/A-3 and research aggregation/capacity/helper changes. Codex must record its exact immutable commit/document hash responsibility after the revised manifest review; K-5 cannot open before that record. This is author responsibility, not independent review or a shared-owner ACK |
| K-1b | The retained core and runtime owners, through their lanes (§1) | §2's B-1 to B-6 against Q7 r8 exactly, each by the owner its "Bound by" names. This includes whether B-1 keeps the table, B-2's keys and precedence guard, and, explicitly, addenda A-1, A-2 and A-3, which the r8 design ACK does not cover. A-3 is new in revision 9, and its fallback was removed in revision 10 | **not recorded** (evidence below) |
| K-1c | The joint lane | Consumer compatibility with this exact revision, named by its commit and document hash when acknowledged. Its CX-0155 disposition already covers B-1 to B-6 as directions. **The r8 design ACK is not counted as K-1a, K-1b or K-1c** | **supplied for exact revision 5:** `b975bbe2`, document `69219da474faf2c8…`, A-1 and A-2 included, within the joint WBC-02/SDD-01 consumer remit (CX-0162; #198 comment 6119717658; safe record `86f1614c…` at `2cb08a7b`). **A consumer ACK only.** **Withheld for exact revision 8** (`960f262f`; CX-0166 at `8bff1a41`; `joint-r8-review.safe.json`): one P2, PB8-A2-DEFER-HELPER-SCOPE, and one qualification gap, PB8-D4-EXISTING-ROW-INVENTORY. The review found D1, D2 and N1, D3's enqueue, D4's direction, C1 to C4 and D5's plan compatible at proposal scope. Revision 9 answers both. **Exact revision 9** (`1bd83eec`) **is changes-required at root** (CX-0168: PB9-A3-FALLBACK-TERMINAL-WRITER). The joint consumer's review of it reports the same gap; its final record wasn't in at CX-0168. Revision 10 answers that finding, so its **recheck is owed**. The exact-revision-5 ACK stays as it is, and isn't extended |
| K-2a | S1-02 (Luis) | §3.1(a), and B-2's `commands` and `outbox` rows and keys for `stop` and `retire`; names the current writer and reviewer | **not recorded** |
| K-2b | Retained S1-05A/BASE owner | §3.1(b)'s 0012-foundation rows, §3.1(c), `runtime_commands.kind`, B-3, §3.3's A04 binding/kind plus hello/ready array limits, and §3.2's registration | **Conditional for exact r10 only:** [CC-0038](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-6131109861), actual session0132HNzeA65ec3zBCL4KYtX2, C-1. No active writer/unpublished work. This revision incorporates C-1/P-1 to P-4 and requires the owner's delta recheck. Its explicit exclusions include bridge/supervisor/profile scope, which is K-2e below |
| K-2c | Recorded SMC-M03 owner | `runtime_hello` and `runtime_record_observations`; A11 preserved | **Conditional for exact r10 only:** [CC-0025](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-6130961758), actual session018hCUhiK4hgMf5V5QPbkC9S, H1–H5/O1–O4. No active writer/unpublished work/monitor. R12 proposes the exact aggregation/capacity/helper amendment. H4's old500 condition is not extended to the proposed bounded502 hello/ready arrays; current H1–H5/O1–O4 owner review remains pending, with no ACK inferred. This is not permission to write the two bodies |
| K-2d | The joint WBC-02/SDD-01 implementer | The named insertions in `dispatch_runtime_outbox` (every reply destination, cleanup included), `capture_native_result` and `native_delivery_ineligible` | **conditional, against exact revision 5** (#198 comment 6120057551; its author is verified by Codex). The conditions are D1 to D5, C1 to C4 and N1, now in §3.1. **The owner's incorporation review of revision 8** (#198 comment 6120514429) acknowledges D1 to D3, D5, C1 to C4, N1, the ACLs and D4's CHECK as incorporated. It adds two corrections and a citation fix, which revision 9 makes: the explicit deferral and denial forms, and D4's preflight. **The owner's review of revision 9's corrections, and of A-3, is owed.** At CX-0168 the owner's review of revision 9 was in progress, and it isn't accepted or counted here. That review, or a fresh one, is owed for revision 10's A-3. None of this is K-1c, or a write GO |
| K-3 | #190's owner | §3.2's and §3.3's overlap, and the order of regeneration (Q10) | **supplied, narrowly:** #198 comment 6120100817, from the retained source coordinator `session_0155SjcXhv87RErnWEBWxfBM` in its own source-coordination remit, against exact revision 5 (revision 6 unchanged in §1 to §4). Codex accepted it (CX-0164 at `c4389f84`; 6119717658). It covers the overlap and the order of regeneration only. It is not from `aca33481`, and it is no billing, product, merge or deploy approval. §3.2/§3.3 were unchanged through r11; that historical fact does not extend K3 to the new r12 wire proposal. The same coordinator's 6120514429 restates that its K-3 covers revision8's §3.2/§3.3, byte-identical to revision5's and preserved through r11. **R12 materially changes §3.3's hello/ready caps and needs a new exact K3 overlap/regeneration review.** §3.2 remains unchanged. Historical K3 covers only its original overlap/order |
| K-4 | Luis's integration review | §4's base: an exact commit and tree including the accepted Phase A and G1, or a named composition | **not recorded.** #256 is a draft at `93e9313d` (mergeable). Luis's acceptance is pending in Codex's existing handoff (#256 comment 6116716003). #199 is a draft at `d527f385` (conflicting), pending Luis's Studio handback |
| K-2e | Retained S1-05A/R00 source owner, with joint preservation review; §1's explicit route, including identification of any other actual owner | All §3.3 existing bridge/transport/protocol/index insertions, new `reply-child.ts` and `reply-plugin.ts` and listed tests; all §3.4 existing/new supervisor, launcher, profile and test files listed in §1 | **Not supplied:** CC-0038's exclusions stand. Every existing/new held runtime file needs explicit ownership and one-writer handback, with current writer/unpublished-state, before K-5 can open a finite window. Q8 remains separate. No delegation, old batch, runtime/provider or source write is requested; K-3's overlap/order is not a proxy for source ownership |
| K-5 | Codex, as for Phase A | The fresh census, the atomic number and path reservation, and the GO record: the sole writer, the files, the start, the expiry and the return, source-only | **not started:** it waits on exact-r12 K-1a, current affected rechecks and every required owner/base record, K-2e included |

**Until all of them are recorded, nothing in §3 is written.** An owner that replaces a recommendation in §2 or §3 is recorded with its replacement. The affected rows are amended and acknowledged again.

**Current incorporation state, revision 12.** K1a and every required affected
owner/review/base record are pending for the immutable ending commit/document
hash. R11's clear automatic documentation review is not extended. Foundation
CC-0038 and research CC-0025 remain conditional exact-r10 only; earlier joint/K3
records remain at their original pins. The C1 safeguards stay, while the new
research amendment needs explicit H4 disposition, non-raising-helper preservation,
foundation/joint/K3 rechecks and K2e handback. §3.2 stays unchanged; §3.3 changes.
No accepted combined base, dispatcher landing or finite K5 GO is supplied.
This is not source-ready Phase B and authoring it opens no shared write window.

**The evidence for the state above.** Revision 6 searched through the newest comment at 07:26:57Z. Revision 7 adds only the two comments named in K-2d and K-3, revision 8 only Codex's K-3 disposition, revision 9 only CX-0166 and the owner's 6120514429, and revision 10 only CX-0168. No new inventory was made. The owner holds no evidenced route to the other owners beyond the planning record (S1-02 Luis; S1-05A and SMC-M01 Davide and Luis; SMC-M03 an unnamed implementer), and appoints no substitute. Revision 6's search:
- **What was searched:** every comment created or edited from 05:00Z on (the request was first published at 05:36Z), in:
  - issue #198, all five pages;
  - PR #256: its comments, reviews and review threads;
  - PR #199: its comments, its 122 reviews and its 71 review threads;
  - PR #190: its comments, reviews and review threads.
- **What it found:**
  - No acknowledgement from S1-02, S1-05A/BASE, the SMC-M03 implementer, the joint implementer or #190's owner.
  - No accepted base, no Phase A acceptance and no merge.
  - The one comment in the window by anyone other than the account that posts CX and CC records is Luis's #199 comment 6118092274 (05:04Z). It is a Studio conflict note ("No CON-01 code of its own"), not an acknowledgement.
- **Where each is still asked:**
  - this file's §1 and §5, as revised through revision 5;
  - for K-4, Codex's existing #256 handoff to Luis (6116716003).

  No duplicate ownership request, new task or automation is created by this revision.

## 6. Already pending elsewhere, not repeated here

- **Phase A's acceptance and merge:** PR #256, head `93e9313d`. The window has ended, and 0053 stays reserved.
- **Luis's Studio handback:** the accepted base and order, the authoritative branch or PR, the sole writer and the return boundary, with A15 and A16 regenerated together. It covers seven shared Studio paths and the contracts:
  - the original four: `ConversationRows.tsx`, `OpenConversation.tsx`, `conversations.css` and `ProjectShell.tsx`;
  - the newly shared `ConversationComposer.tsx`, `ConversationsView.tsx` and `NewConversation.tsx` (CX-0165, at Luis's prepared `d96626ac`, which is not the accepted base).

  PR #199 stays at `d527f385`. There is no later explicit handback than Luis's existing comments. The current reconciliation is #199 comment 6116157885, and the hold is recorded in the CON-01 handoff at `7c36aa8c`, which CX-0166 accepts.
  - Luis's prepared resolutions are preserved.
  - After the handback come CON's bounded corrections: the kit confirmation controls, the moderator's Remove wording, distinct coverage labels, and `635a3ef2`'s conservative withdrawal disclosure.
  - Then Codex's independent recheck.
- **Davide's:**
  - Q8: the reply profile rows and the runtime image;
  - D-4: no route bound, Ask stays off;
  - OP-0002-r6 (setup and human chat) and OP-0001-r4 (Ask) stay unapproved drafts. They replace r5 and r3, which stay as history.
- **Q13's shared read policy and the reply identity's isolation:** `2ff7daeb`, its own scope (D-8).
- **#211's room job and the Personal Find fix:** the personal owner's.

## 7. Not authorized by this file

- No shared source, SQL, contract, generated file, artifact, profile or runtime write.
- No migration number or window.
- No role, membership, grant or connection change, in any cluster.
- No PR, merge or CI rerun.
- No hosted SQL, configuration, account, deployment, provider call or spend.

A consumer ACK or a published branch doesn't reopen a window. Only §5's records do.
