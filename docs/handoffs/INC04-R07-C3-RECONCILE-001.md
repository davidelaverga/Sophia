# INC04-R07-C3-RECONCILE-001: known-evidence reconciliation, cause adjudication and certification (Stage A)

SOPHIA-INC-2026-11, INC-04 R07 C3. SAME Host18 (session_01FGXfrGdEeRRkWqHnZfiF8C).

## 1. ACK and plan (external ACK `156ce77d…`, sent before any effect)

**Base:** signed LOCAL `d98e01b10d501396373034d24071738c91c659df`, tree `1a6c900b…`, sole parent `abebbbad…` (the nonfinancial fence, 0111). Branch `inc04-r07-c3-reconcile-001` was created at d98e. The fence branch is unchanged.

**Migration 0112:** reserved by Root. The census found it in no ref and no worktree.

**Six writable paths:**
- `db/migrations/0112_research_runtime_reconciliation.sql`
- `db/tests/0112_research_runtime_reconciliation.sql`
- `packages/persistence/src/research-runtime-reconciliation.ts`
- `packages/persistence/src/research-runtime-reconciliation.db.test.ts`
- this HDF
- `db/tests/0094_api_contributions.sql`, only if a new runtime selector needs classification

**Implements (synthetic PG only; D1 `conservative_at_reserved` stays DISABLED):**
- **A.** Known-evidence-only reconciliation of a monetary-open reservation against its original binding, exactly once.
- **B (F01).** Nonmonetary, append-only adjudication of every retained conflict/overflow cause, settled ones included.
- **C (F02).** An active allowance-restriction projection (episodes and certificates) used by the ACTUAL paid-call gate and restriction writer, with recurrence.
- **D (F03).** A complete, fresh account certificate over all aliases, projects and causes after the last wait, with the guard LAST. The guard only clears through a durable certificate.
- **E.** Exact replay and canonical digests with literal vectors.

No real financial, operator, provider or production effect is part of this stage.

## 2. Implementation record

(Appended as the work proceeds; nothing above is rewritten.)

### 2.1 Reads (recorded externally before each body)

**New bodies:**
- R1 0109:341–388 `reserve_research`
- R2 0109:711–715 `research_call_restrict_allowance`
- R3 0109:163–172 the guard transition and its triggers
- R4 0109:719–726 `research_call_money`
- R5 0110:522–616 `research_call_settle` (effective)
- R6 0094:524–540 `contribution_lock_connection`
- R7 0109:221–227 `research_evidence_guard_read`

**Also read:**
- reused register ranges: 0029 `end_research_reservation` / `reconcile_research_overrun`;
- schema DDL: 0024 allowances and 0109 history;
- one helper range of the already-selected fixture file (`fillCap`, research-call-evidence 1078–1100).

**Not read:** no other body. The denied db/tests/0110 and transcript retrievals remain held.

### 2.2 What 0112 does

**Authority.**
- `research_financial_authorities`: append-only, operator-only. Fields: key, kind, exact scope (account | project+allowance), approver and verifier references; revocations are append-only.
- Each operation checks an in-scope, unrevoked authority of its kind.
- It is the durable operator binding, not proof of a live bill. A GUC, an `approval_ref` or a digest alone is never authority.

**A. `reconcile_research_reservation`** (closed `research-reconcile-v1` input):
- **Order:** replay first; project (U), then allowance (U), then reservation (U).
- **Original binding:** allowance, account|null, resource, operation, call, provider and reserved amount, read from the authoritative rows. Where the resource was fenced by 0111, the input must name that fence and generation, and the fence's monetary-open snapshot must list the reservation.
- **Basis:** only `provider_billed_attestation` with a 6-decimal STRING cost (a genuinely evidenced zero is `0.000000` with its evidence). `conservative_at_reserved` (D1) is refused (0A000).
- **Money:** one transition through `end_research_reservation`, keeping its invariants (an overrun is recorded, never clamped). Truth, history, identities and witnesses are untouched.
- **Replay:** the stored result; another input is refused (23505). A settled or released row is never charged again.

**B (F01).** `research_restriction_causes` holds every conflict/overflow cause in its original scope.
- **Backfill:** from retained truth first conflicts/overflows and conflict history rows.
- **Writes after 0112:** the replaced `research_call_settle` (0110 copy, marked CAUSE-WRITER) records a cause first, then runs the original restriction statements only for a genuinely new cause.
- **Cause identity:** (reservation, kind, canonical facts digest of its v1/v2 `facts_version` domain).
  - A below-cap repeat is a history replay that never reaches the writer.
  - A post-cap repeat finds its cause; nothing new happens.
  - New evidence has a new digest and restricts anew.
- **`adjudicate_research_cause`** (closed `research-adjudicate-v1`): nonmonetary (`original_money_stands`), append-only. It is refused while the reservation is still open (money first) and replays exactly.

**C (F02).** The allowance projection consists of append-only `research_allowance_restriction_episodes` (the legacy rows are backfilled as episode 1) and `research_allowance_certificates`.
- **Gate:** the replaced `reserve_research` (0109 copy, marked ACTIVE-GATE) gates on an open (uncertified) episode, not on mere row existence.
- **Writer:** the replaced `research_call_restrict_allowance` keeps the historical row and opens a NEW episode whenever none is open (recurrence).
- **`certify_research_allowance`:**
  - project (U), then allowance (U, the writer's row);
  - the complete current causes are recomputed after the wait and must equal the certified digest, every cause adjudicated and final;
  - an insert trigger re-validates the record itself.

**D (F03). `certify_research_account`.**
- **Locks:** every project of the account in id order (U), then every alias connection in id order (U: the existing `contribution_lock_connection` protocol of projects then connection, used by grants/links/registration/connection changes), then the guard LAST.
- **After the last wait:** projects, aliases and the complete causes are recomputed; drift refuses (40001). Every cause must be adjudicated and its reservation final.
- **Record:** a durable certificate (txid-bound) is written. The replaced guard trigger (CERTIFIED-CLEAR) allows true→false only for this transaction's certificate and only while every current cause is covered. The setting carrying its id is a pointer only.
- **Writer:** the cause writer locks the guard LAST even when it is already restricted.
- **Still barriers:** unknown effects (`contribution_account_uncertain`), qualification and caps are untouched and remain barriers.

**E.** Canonical jsonb, with sha256 over `<kind>-v1|` + text.
- **Literal vectors** (computed independently in Python, asserted in `db/tests/0112`):
  - reconcile digest `e0bd8963…a883`;
  - cause-set digest `056f9407…2547`;
  - empty cause-set digest `33ea4e2b…3208`.
- **Strings only:** money is a 6-decimal string (JSON numbers and other spellings are refused) and every uuid is a lowercase string.
- **Bounds:** 256 causes and 256 projects/aliases, refused whole, never truncated.

**Not needed:** no 0094-test edit (no new runtime selector); the full SQL profile passes it unchanged.

### 2.3 Root clarification (within cffb8f4a)

1. **Membership.** The certifier takes the alias connections between its projects and the guard.
   - **Tested:**
     - a new project grant on an alias WAITS for a pending certification (M-CONNLOCK removes the connection lock and the grant no longer waits: killed);
     - a new alias created while the certification waits at a project row refuses it after the last wait, leaving the guard restricted (M-FRESH: certified, killed).
   - **Characterized, not assumed:** a bare new alias (no grant, project or cause) does not wait for a pending certification. It adds nothing to cover; any cause through it restricts anew.
2. **Fresh vs replay.**
   - After a certificate, repeating the covered conflicting input (and a post-cap repeat of a covered overflow) creates no cause or episode, and the real gate stays open.
   - New conflicting evidence opens a new episode and closes the real gate again.
   - Both directions go through `reserve_research` and the account gate.

### 2.4 Evidence class and open dependencies

This is controlled source evidence on SYNTHETIC real-PG fixtures: a migration-owner authority stands for the external operator. It is not owner approval, a verified bill, or native, account, deployed or app acceptance.

**Remaining:**
- the production operator/executor and independent verification (RTA) gate;
- D1 (disabled);
- outcome_unknown jobs (still a barrier, not closed);
- account/allowance retirement;
- the governed late-fact path beyond operator attestation (now refused through the fenced runtime);
- the Map and operator documentation for these private functions (no Map/GEN lease);
- the integrated full-DB stage for every other `.db` suite touching the replaced `reserve_research`/`research_call_settle`;
- coherent ordinary/PRE/CI and full C3.

## 3. R1 (C3REC-F01/F02): plan, written before any R1 source change

R1 responds to review e2fa0e69 (adopted by Root, no scope waiver), under TASK `8bf587e6` and the P01 operation-identity clarification `b5db0ae4`. External ACK `82bc093f…` was sent before any effect.

**Starting point:**
- The frozen 4f09 candidate (original FINAL-A `ed64cb78…`) and §1–§2 above stay as history.
- §2.4 listed "the governed late-fact path beyond operator attestation" as remaining. Under the original TASK it was NOT deferred, so that listing was an omission. R1 implements it.

**F01: `record_research_late_facts`** (private, owner-only, typed wrapper):
- Closed `research-late-facts-v1` input with a durable `operationKey`.
- Bound to the original identities and to the 0111 fence/generation when present; only after the original runtime instance is revoked (the native path stays fenced).
- The report is the existing tracked settle request, processed by the existing fact writer: observed_v1, facts_version, history cap, conflicts and the 0112 cause writer.
- Never moves money: an open reserved reservation is refused; an uncertain one takes only an uncertain report; a complete report needs the money already ended (billed-cost attestation or the runtime itself), where a difference is a retained conflict.
- **P01:** same key + same input returns the stored result first; same key + changed input refuses; a distinct key carries a later observation; exact covered replays append nothing; new conflicts recur.

**F02:** real-PG BEGIN → effect → ROLLBACK controls for reconciliation and for late facts, then one committed effect, a fresh-connection stored replay, mismatch refusal, and no double charge.

### 3.1 R1 change record (corrected model, ACK addendum 1 `b4aa807a…` after Root Message42)

**Correction to the plan above.** The plan's money rules (refuse RESERVED; refuse a complete report on open money) were withdrawn after Root Message42 and never shipped. A valid observation is recorded whatever the money state, and the money never moves.

**Revocation proof.** A draft read the original runtime with `FROM sophia.runtime_instances`; the fail-closed 0094 selector guard flagged it. The 0094 test is not leased, so it was not edited and the guard was not evaded. The shipped operation instead requires the 0111 fence of the original generation: the fence row for the original resource, its id and generation named in the input, and the original runtime id in its frozen `runtime_ids`, all revoked by it.

**Dependency (reported, not implemented):** late facts for a NON-fenced revoked generation (for example a legacy account-null runtime revoked by re-registration) need a classified bound runtime selector, which is a `db/tests/0094` edit outside this lease.

**F01 as shipped:**
- `record_research_late_facts` (owner-only, `late_fact_attestation` authority) with a typed wrapper.
- **Input:** the closed `research-late-facts-v1`, with the durable `operationKey` (P01), the full original binding (attempt, session, call, unit, runtime, resource, operation, provider, account, grant, allowance), the mandatory fence/generation, and a bounded report that is exactly the tracked settle request.
- **Writer:** `research_call_record_late_facts` is a FACT-ONLY copy of the effective settle. It differs only in its two money calls, which use the pure `research_call_money_unchanged`: no money while open; an `outcome_changed` conflict only against money that has already ended. It keeps facts_version, observed_v1, history, witnesses, the first conflict/overflow, the cause writer and recurrence.
- **Defensive check:** the operation verifies that reservation and allowance money are byte-identical after the writer, or refuses and rolls back.
- **Record:** append-only `research_late_fact_operations`.

**F02:** real-PG BEGIN → effect → ROLLBACK controls for the reconciliation and for late facts. Each is followed by one committed effect with its ack ignored, a fresh-connection stored replay, mismatch refusal, and money charged once.

**Development negatives:**
1. The 0094 unclassified-selector refusal (dev `test:sql` 01).
2. The authority-kind list missed the new kind (dev DB run 03, 12/14).
3. A lint fix.
4. The mutant r1 harness cascade, fixed with ROLLBACK-before-release in the rollback tests.

## 4. R2 (Root Message46): plan, written before any R2 source or PG change

**Base and ACK.** R2 starts from the frozen, uncommitted R1 tree `94cd5ff5…` on HEAD `d98e01b1…`. The fresh external R2 ACK `b72b6c12…` was sent before any effect. R2 uses a new owned PostgreSQL 16 cluster on 127.0.0.1:55595 under `/var/tmp/r07-c3-reconcile-001-r2-pg55595`; 55591 stays stopped and retained. Six paths: the five R1 paths and `db/tests/0094_api_contributions.sql`, for the classification only.

**P03 — non-fenced original generations.** The late-fact input names a canonical original-generation tuple: project, the call's frozen resource and runtime, `generation` (always a 64-hex token), and `fenceId` (a uuid or null). It is validated after the project wait:
- **Generation:** the original resource's link row is read FOR SHARE and `generation` must equal `contribution_runtime_generation` of that resource. This is 0111's token of its immutable binding, never the current or replacement one.
- **Original runtime:** one bound selector reads exactly the call's original runtime row (id, project and resource) FOR SHARE. It must be `revoked`; an active original keeps its own native path, and nothing is reactivated.
- **Fence present:** the resource's 0111 fence must be named, carry the same generation, and contain the runtime. A null `fenceId` when a fence exists refuses.
- **Fence absent:** `fenceId` must be null.

The operation record keeps `original_runtime_id` and `original_basis` (`fence` or `runtime_revoked`). The 0094 test classifies `record_research_late_facts` as a scoped, non-picker selector and asserts its bound selector and its owner-only reach. No guard, picker rule or old assertion changes.

**P02 — reported facts versus financial truth.** In the native settle, the truth's `outcome`/`cost_usd` are always the money's: the money moved to them, or on a conflict they are the reservation's state. R2 keeps that meaning:
- **Open money:** while the money is open (reserved or uncertain), the fact-only writer records the financial pair as `uncertain`/NULL (marked `R2 P02 OPEN-MONEY`). It does this after building the reported facts and their digest.
- **Raw facts kept:** the report, `consumer_ending`, counts, response id, observed witnesses and history stay complete.
- **Reported claim:** the reported outcome and cost are kept separately on the operation record, with basis `reported_unverified`, alongside the reservation's unchanged money. The result carries `reported` and `financial`, and a private read returns the same distinction.
- **Ended money:** unchanged from R1. An equal report is accepted; a different one is a retained conflict.
- **Billed cost:** the billed cost stays the separate reconciliation, applied once with replay.

**Checks.** Final serial checks:
- statics, build, typecheck and contracts;
- the full `pnpm test:sql`;
- the complete reconciliation DB file and the complete unchanged fence DB file;
- causal controls on the changed source.

The R2 tree is frozen uncommitted, and the sealed R2 FINAL-A records the results. R2 results are in the FINAL-A, not here.

### 4.1 R2 correction (HOLD-1 `a9a406e5…`, HOLD-2 `048338ca…`, ACK addendum P03-A `51441a14…`), written before the corrected source

**Disproved premise.** On real PG, an ordinary credential rotation leaves the original contribution runtime `active` with no fence (R2 development run 2). Rotation is therefore not the non-fenced revocation, and the plan above is corrected on that point. The active-original refusal stays.

**Cluster.** PG 55595 was lost to a VM reboot (18:18:31Z). Its files are retained untouched and it is never restarted. A new owned cluster on 55601 (Root Message50) serves the rest of R2.

**P03-A, the corrected tuple.** The tuple is (project, original resource, original runtime, generation or null, fence or null), validated as follows:
- **Original resource has a contribution link:** `generation` is required and must equal that link's own token.
- **Original resource has no link** (a legacy runtime resource, which can never be fenced): `generation` is JSON null. Any non-null value refuses. Null is not a wildcard.
- **Fence:** a fence that exists must be named and validated; when there is none, `fenceId` is null.
- **Original runtime:** the bound original runtime row must actually be revoked by a maintained path.
- **Unchanged:** the immutable call bindings and the tracked facts protocol.

The record stores a nullable generation, with a fence implying a generation.

**Fixtures.** Real maintained re-registration only, never a hand UPDATE:
- the contribution class that the one authorized read of `register_contribution_runtime` (0094:893–927) shows;
- the legacy no-link class through the existing `registerRuntime` helper.

Any missing class is reported, not simulated.
