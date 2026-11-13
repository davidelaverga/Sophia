# INC04-S02a: the atomic contributed-API admission

**Slice:** the existing explicit, pinned contributed research admission, made into INC04-R06's atomic boundary on the ONE existing inventory and admission ledger. **Migration:** `0105_contribution_atomic_admission` (root-allocated).

- **No:** amendment, contract or generated change; kernel change; production TypeScript change; automatic selection, wiring or enablement.
- **Corrigenda:** C01–C08 of root's choices `ef777199`, on the independent review `fcf0bd33`.

## Scope

- **In:** pinned admission (`admit_research_task`, pinned branch), the writable dispatch of a contributed create, each new paid model call of a contributed lineage, and the trusted preview's money facts.
- **Out:**
  - unpinned project-funded research;
  - native and owner-runner work, which keeps its own account-key reservation (0092);
  - the conversation pickers;
  - observation, settlement, Stop, erasure and replay. These behave as before.
- **Not this slice:** S03 usage observation, S04 editor/UI, S05 real episodes. Native bounded assignment and concurrency reserves remain a later obligation (INC04-R08), even without token telemetry.

## Ledger terms

- **Lineage:** `(project_id, allowance_id)` of `api_contribution_tasks`. An amendment reuses the allowance and a rebuild copies the binding; the grant never changes within a lineage.
- **Original ceiling (C02):** admission of a new lineage freezes the grant's task cap on its binding (`lineage_cap_usd`). An amendment or rebuild copies the original value.
  - The effective ceiling is `least(original, current grant task cap)`: current narrowing restricts, and growth is never credit.
  - The research allowance's own `cap_usd` still bounds the lineage (`reserve_research`, unchanged).
- **Legacy binding** (admitted before 0105):
  - Its original cap is proven only while every binding of the lineage carries the grant's current revision. `contribution_store`, the only writer of a grant in 0001–0104, advances `revision` together with every setting.
  - Otherwise new admission, rebuilt delivery and paid model calls are held (`lineage_cap_unproven`).
  - Nothing is backfilled. An out-of-band edit that skipped `contribution_store` cannot be detected.
- **Commitments:**
  - Actual: reserved and uncertain at the reserved amount, settled at cost (`contribution_commit`). They are ended only by `end_research_reservation` evidence.
  - Promised (the hold): for an open lineage with a funded claim, or a proven legacy one, `greatest(effective ceiling − actual lineage commitment, 0)`, once per lineage.
  - Totals are actual + promised, and nothing else is stored.
- **Open and closed:**
  - A lineage is open while a binding's job is `pending`, `running` or `outcome_unknown`.
  - A terminal job drops only the UNUSED promise. This is safe because `research_scope_of` (0025) refuses every new reservation of an ended job.
  - Actual reserved and uncertain amounts stay committed and keep the slot.
- **Claim (C01):** `api_contribution_claims` records `funded` or `unfunded` per binding. It is not a balance, and its only transition is `unfunded → funded`.
  - Admission inserts `funded`.
  - A rebuild inserts `unfunded`. It runs inside source withdrawal, revocation and Stop, takes no account lock and decides nothing, so those always commit.

## Admission (one transaction, one statement)

**Lock order:**
1. projects FOR UPDATE;
2. research_grants SHARE;
3. (amendment) the base goal;
4. the grant SHARE;
5. the connection SHARE;
6. the account FOR UPDATE, which serializes every admission and paid call of the account across projects and aliases;
7. the exact live account-qualification row SHARE, last.

**Checks, in order:**
1. The existing checks, including slots (`account_busy`).
2. Typed identity (`account_identity_unresolved` unless `owner_declared`, C06).
3. Unknown effects on the account (`uncertain_effects_unreconciled`).
4. The lineage's original ceiling (`lineage_cap_unproven`).
5. The qualification row lock.
6. ONE `clock_timestamp()` instant, at which these are all decided (C04): grant usability, global route, that row (revocation, observation, expiry, operation, credential, settings), money (C03) and protection.

**Money (C03):**
- `need = greatest(effective ceiling − lineage actual, 0)`: the full cap for a new lineage, the remainder for an amendment.
- The admission is refused when the grant total or the account total of `actual + other lineages' holds + this lineage's actual + need` would exceed its cap.
- Example: cap 1, actual 0.7. The lineage counts 1 once, not 0.7 + 0.3 + 1.

**Protection:** an explicit after-value check, with slots + 1 and spend after. The 0104 preview helper is untouched.

**What is frozen:** exactly the checked facts are written on the binding: original cap, account revision and provenance, qualification id and revision, protection witness, instant. `contribution_bind_task` refuses without them. The binding is INSERT-only, enforced by a trigger.

## Dispatch and paid calls

- **Dispatch (C04):** `contribution_delivery_ineligible` also requires the account's CURRENT qualification for contributed new work. A stored witness is not perpetual authorization. Stop and retire are never blocked.
- **Reacquisition (C01):**
  - Only `dispatch_runtime_outbox` writes a claim. It is 0075's definition byte for byte plus the marked `S02A-FUND` block, which runs after `native_delivery_ineligible` and `runtime_unavailable`.
  - There, an unfunded rebuilt successor takes grant, connection, account, then the qualification row, and re-decides funding at one instant. It is funded, or it is withheld (denied, never sent).
  - Eligibility reads, readiness views, preview snapshots and fences only evaluate.
- **New paid model call** (`contribution_model_reserve`):
  - It needs a funded (or legacy) claim, typed identity and the original ceiling.
  - Then, after the qualification row lock, at one instant: grant, route, the current qualification, the per-lineage ceiling, and totals counted once. A 0.1 call makes 0.8 + 0.2, never 1.1.
  - It also checks the owner's CURRENT protection.
  - A replay of an existing reservation key never reaches these checks; settlement is unchanged.

## Preview (C05)

`selection_api_candidate` is replaced: the account and grant commitments include every open funded lineage's promise, so promised money is never shown free. There is no new field, no hold or claim detail, and the viewer and editor behaviour is unchanged. The preview remains advisory, never an admission.

## Limits

- **Qualification:** deployed route and account qualification state is UNKNOWN. These checks are source prerequisites only.
- **Duplicate accounts:** unrecorded real-world duplicates (two roots for one provider account) cannot be detected. Only typed recorded facts are used, never labels or note text.
- **Unknown effects:** a running lineage's in-cap call is not blocked by another lineage's unknown effect; its accounting stays conservative.
- **Timing:** response timing is not uniform (SQL computes before deciding).
- **Acceptance:** this slice is neither complete S02 nor app or AC-04 acceptance.

## Checks

- **`db/tests/0105`:** privileges; the one writable boundary (a static scan of every function body); binding and claim invariants; pure refusals.
- **`packages/persistence/src/contribution-admission.db.test.ts`:**
  - two-client cross-project alias race on the last money;
  - once-counted arithmetic;
  - replay;
  - uncertain retention and evidence release; known-ended release;
  - rebuild reacquisition at dispatch only, not by a read, readiness view or fence, and withheld when the money went elsewhere, without rolling back the erasure;
  - original cap under growth and narrowing; legacy proven vs unproven;
  - protection (slot, narrowed, withdrawn);
  - qualification expiry while waiting on its row, a revocation race, and revocation before dispatch and before a paid call;
  - identity;
  - immutability;
  - the dispatch definition pin;
  - preview holds, alias and protection basis, and privacy.
- **Existing suites:** fixtures declare protection and record a synthetic account qualification, and assertions are unchanged.

## Compatibility fixtures (bounded, recorded)

- Existing pinned-admission fixtures now declare the owner's protection and record a synthetic account qualification, with every assertion unchanged:
  - `packages/persistence/src/api-contributions.db.test.ts`, which re-qualifies after its rotation test;
  - `apps/api/src/api-contributions.db.test.ts`;
  - `packages/persistence/src/inc01-coherent.db.test.ts` (root-authorized path).
- In `inc01-coherent`, the "existing orphan (a rebuild queued before 0100)" case fabricates its historical state by deleting a binding. 0105 makes bindings INSERT-only, so root authorized ONE bounded synthetic fault injection there:
  - one migration-owner transaction on the disposable database;
  - only the two named guard triggers are disabled;
  - exactly that project's successor claim, ledger links and binding are deleted, with counts asserted;
  - the guards are re-enabled and verified before COMMIT, and any error rolls the whole transaction back.
- This is not a real pre-0100 upgrade and not a production path. The 0105 guards and FKs are unchanged.
- In `packages/persistence/src/conversation-runtime.db.test.ts` (root-authorized), the invariant that keeps seven shared definitions byte-identical outside their named insertions now also recognizes 0105's marked `S02A-FUND` block. The recognition is narrow:
  - only in `dispatch_runtime_outbox`;
  - only as exactly one BEGIN/END pair, asserted.
- Everything else in that file is unchanged: byte identity outside the recognized insertions, the seven-function count, the ACL, security, config and owner assertions, and every old marker.
