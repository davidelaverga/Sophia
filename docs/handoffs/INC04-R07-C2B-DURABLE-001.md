# INC04-R07-C2B-DURABLE-001: durable closed optional observed facts on the original call ledger (Stage A)

**Header.**
- **Goal and attempt:** SOPHIA-INC-2026-11 INC-04 R07 / C2B durable backend half, Stage A, attempt 001.
  - Task: `8725260d…570e`, 17429 B.
  - Root readiness: `94babf19…`.
  - Independent task review: `f74876e9…`.
- **Human owner / executor resource:** Davide / SAME Host18, Claude Code session `session_01FGXfrGdEeRRkWqHnZfiF8C`. I am the sole source and GEN writer for this lease's paths and IDs.
- **Native session:** not applicable. No native Sophia session is driven, and there is no SDK producer or carrier.
- **Runtime unit:** `sophia-runtime-wbc02-dev` (`config/runtime-unit.json`). The SDK tree `c97621b4…` and workspace lock `7a500c03…` stay unchanged. Only the Sophia archive and profile integrity may change, by normal derivation.
- **Starting worktree/commit:** `/home/user/Sophia-r07-c2b-durable-001`, branch `inc04-r07-c2b-durable-001`.
  - Exact base: `0261a78fd499a8be29a148bb4c4dd40f39e8e14a`, tree `38cfc5b7d43b9d9beb507857a6a9239ecded44a5`, with ordered parents `5a7ec565` and `302af00b`.
  - Intake was by normal bundle: C7 `3bea17…`, which requires d3e, then 0261 `2bebed…`, which requires d3e and C7.
  - All 4264 leaves match the base inventory `e30a67f7…`.
- **Ending state:** Stage A ends with an UNCOMMITTED frozen candidate tree. Its identity is in the FINAL-A packet. There is no commit and no ordinary until a separate CORE and Root readiness.

## 1. ACK/PLAN (recorded before any production edit)

**External ACK:** `C2B-DURABLE-001-STAGEA-ACK.zip`, sha256 `b9f7190c…27b7`, sent before this worktree existed.

**Authority:** the explicit Root/user dispatch in session `session_01FGXfrGdEeRRkWqHnZfiF8C`.
- Root adopts 0261 Stage A CORE `5a1b7a8c` / Root `a7783799`.
- Implementation may proceed while the Routing ordinary `bgqipsayp` runs in its own container. I do not touch, replay or borrow it.
- A finding from that ordinary must be reconciled before integration.

**IDs allocated to this worktree only:**
- amendment `A58` and migration `0110`, both absent at 0261 and in every local ref and worktree;
- the six normal GEN outputs.

**Frozen at 0261:**
- `A57` and `0109`, immutable;
- SOURCE_MAP blob `c7cd2e18…`, not edited;
- `docs/pack` OpenAPI, unchanged;
- no SDK, patch, lock, pin, dependency, profile or provider-config change.

**Writable paths, as the TASK lists them:**
- A58;
- `0110` (migration and SQL test);
- `research-call-evidence.test.ts` and the new `research-call-observed.test.ts`;
- `persistence/src/research.ts`, `research-call-evidence.db.test.ts` and the new `research-call-observed-facts.db.test.ts`;
- the runtime and design routes and design persistence, ONLY if the inspected forwarding or types need it;
- the api `research`, `design` and `review-request-v1` DB tests, and the integration `call-evidence` test;
- this HDF;
- the six GEN outputs;
- `config/runtime-unit.json` and the profile lock, ONLY for the derived Sophia identity.

No pure helper is planned. If one becomes necessary, I stop and name it.

**Wire contract** (SI01–SI04, per the TASK):
- **Reserve:** optional `facts:"observed_v1"`. If it is omitted, v1 is byte-identical.
- **ACK:** `binding.facts` is echoed only on opt-in.
- **Internal `facts_version`:** 1 or 2, frozen at reserve. Changing the opt-in under the same request identity is a conflict.
- **Settle v2:** `evidence.observed` is the sole new closed object. There is no `factsVersion` or `c2b` alias.

**Durable semantics:**
- The merge is monotone first-known. Each of the 8 dimensions (in the order `n1`, `n2`, `http_status`, `provider_terminal`, `input_total`, `cache_read`, `output`, `cross_c1p`) keeps one sticky first witness.
- Delivery stages are ordered no_frame_delivered < closed_before_terminal_frame < none.
- Counts merge only under the same terminal.
- SI04: the A57 `responseId` and the observed N1 share one namespace, and the cross check runs before money. A metadata-only report never moves USD.
- An all-unknown v2 report falls back to the literal v1 digest and receipt. Anything else uses `research-call-facts-v2`, which is the 0109 v1 field list plus the observed canonical.
- The cross_c1p grouped preimage is frozen literally by the TASK.

**Preserved:** `p_write=false` late settle, original authority, cap16 with fixed truth and a sticky first overflow, guard-LAST, private truth versus sanitized history and receipt, replay and idempotency, and C02-01 (refused and open).

**Checks:**
- own NEW PG16 on 55565;
- `test:sql` once on the frozen candidate;
- the focused contracts, persistence and new DB tests; the api research, design and review tests; and the integration crossing with the full worst-escaped 256 KiB envelope;
- installation fixtures over the pending 0110;
- golden literal digests and preimages, and the 13 vectors extended for SI01–SI04;
- mutation controls for repaired classes;
- the guarded PG stop before FINAL-A.

**Not done (holds):**
- no push, publication, PR, GitHub, bot, CI, merge, release, activation, provider, native, voice or UI effect;
- no full C2B, R07 or AC-04/05 claim;
- Personal 9e owner-held; 8c default-off with its erratum; the 9ed cancel;
- GOV, Luis, RTA, the native owner pairs, the deployed app and full-mission gates; SEC-null is informational only;
- the protected bodies are excluded.

## 2. Implementation record

(Appended as the work proceeds; nothing above is rewritten.)

### 2.1 What changed (all inside the lease)

- **A58** (`packages/contracts/amendments/A58-research-call-observed-facts.json`). It adds three optional members to existing shapes:
  - `ResearchReserveRequest.facts` (`observed_v1`);
  - `ResearchReservation.binding.facts` (`observed_v1`);
  - `ResearchSettleRequest.evidence.observed`, one closed object.

  Every nested object is `additionalProperties:false`. IDs follow A57's 8192 / no NUL / well-formed pattern. Status is 100..599, counts are 0..2^53-1, N1 has 1..4 sources and N2 has 1..2, there are at most 8 witnesses (`^[0-9a-f]{64}$`), and `deliveryUnknownReason` is required. There is no `factsVersion` or `c2b` alias, and no N3. A57 is unchanged.
  - **uniqueItems:** the first GEN attempt refused `uniqueItems`, because the standalone runtime-wire code cannot carry ajv's `equal` (the log is retained). Uniqueness of sources and dimensions is therefore the SERVICE's closed check (SQL, fixed message). The wire schema bounds only the cardinality.
- **GEN, normal generators only:** `openapi.json`, `generated-types.ts`, `runtime-wire-types.generated.ts` and `runtime-wire.generated.ts` changed. The validators were "up to date"; no route uses a generated validator for these shapes.
- **Derived artifacts:** normal `artifacts:record`, then the all-8 VERIFY (match).
  - The Sophia bundle went from `9c9c5e6d…` to `8fedcb04…`, with its integrity and the profile lock line.
  - SDK `c97621b4…` and workspace lock `7a500c03…` are unchanged.
- **0110** (`db/migrations/0110_research_call_observed_facts.sql`). 0109 and every retained row are untouched.
  - **Identity:** `facts_version` 1 or 2 (retained rows get 1 through a constant default; no row trigger fires).
  - **Truth (same original row):** delivery, sent, http_status, n1 with reason and sources, the existing `header_id_status` slot for N2 with id, reason and sources, the existing `provider_terminal` slot, three raw counts and eight sticky witness columns. Its CHECKs are widened only where 0109 had held these at `unknown`. A first-settlement `outcome='reserved'` records that no money moved. Two conflict reasons are added: `observed_changed` and `cross_changed`.
  - A BEFORE UPDATE trigger keeps the observed truth monotone, with witnesses write-once.
  - **History:** an `observed` canonical, with ids by digest only.
  - **Replaced:** `research_call_request`, `_identify`, `_replay`, `_ack`, `_fact_digest` (EXACT v1 when the observation is absent or all-unknown, otherwise `research-call-facts-v2` over the same 0109 list plus the canonical), `_retain` and `_settle`.
    - The settle path is identical for facts_version 1.
    - For version 2 the observation is merged and classified BEFORE any money helper. Metadata-only gains are `extended` and never call money.
    - The lock order is still allowance → reservation → truth → guard LAST (0109's own static test passes on it).
  - **New pure helpers:** closed parse, canonical, merge, the SI04 cross check with the frozen grouped preimage, and witness. None is executable by any application role or PUBLIC.
- **Routes and persistence:** `runtime.ts`, `design.ts`, `persistence/design.ts` and `research.ts` are UNCHANGED. The three wrappers share the four amended components and pass the JSON through, so no forwarding edit was needed.

### 2.2 Failures met and repaired (logs retained in the packet)

- **Real defect: SQL three-valued logic in the cross check.** With the A57 N1 unknown, `NOT (NULL OR false)` is NULL, so `research_call_cross` fell through to "mismatch". An unknown side became a false contradiction, which also blocked money.
  - **Fix:** each disjunct is `coalesce(...,false)`.
  - **Regressions:** "known zeros … (R3)" and "monotone gains …".
  - **Mutation check:** reverting the fix fails both tests. The candidate was restored byte-identical, blob `0479680c…`.
- **Fixture mistakes, not product defects:**
  - the refusal code is spelled `idempotency_conflict`;
  - a test reused an allowance its own earlier contradiction had restricted;
  - a test made an admission after the account was already restricted;
  - two synthetic attempts were created on one runtime (seq collision);
  - HTTP status expectations: 422 for schema refusals and 400 for an oversize body.

### 2.3 Limits (not claimed)

- **Backend half only.** The SDK producer and carrier, producer refusal before effect, the loaded qualifier for C2B, and activation are a later separate lease. Full C2B / R07 / AC-04-05 is not claimed.
- **Bridge ACK check:** the bridge's own check of `binding.facts` is a producer-side composition proof. The bridge never sends `facts` today.
- **Accessors and toJSON:** the wire is JSON text. Accessor and toJSON rejection is proven at the validator (function and toJSON members refused). An accessor on an in-memory producer object is a producer concern.
- **C02-01 stays open:** an account-backed review is refused, as before.

## 3. R1 (C2B-48B4-REPAIR-R1-001): successor repair of F01/F02. ACK, appended before any R1 code edit

Everything above this heading is the exact 48b4 HDF; that history is not revised.

**Governed by:**
- Independent CORE `7efddebe` (CHANGES_REQUIRED, C2B-48B4-F01 and F02).
- Root decision `b8382677`, with its tie rule.
- The R1 TASK `240d0d9f`. External ACK `769448da…`.
- 48b4 (`48b4acf9…`, FINAL-A `9db09c42…`) stays immutable as evidence. The successor is a separately identified tree in this same worktree; HEAD stays 0261 and there is no commit.

**Delta vs 48b4:** only the 0110 migration, the 0110 SQL test, `research-call-evidence.db.test.ts` and this HDF append. No GEN, artifact record, SDK, Map or new IDs.

**F01:** the 8 dimensions all reach the fixed truth.
- A valid reported `cross_c1p` witness is retained like any other.
- A service-derived grouped cross is retained even when another dimension conflicts in the same input.
- **Tie (Root):** a stored witness always wins. Within one input, the service witness of a dimension precedes the producer's report of that dimension. Otherwise the producer-only witness is kept.
- Witnesses of an input are written even when 0109's A57 comparison already conflicts, and at or after the 16-input cap. The disposition, reason, restriction and no-money rules are unchanged.

**F02:** the observed count returns the already validated NUMERIC cast to bigint, for counts and HTTP status. Integral decimals and exponents (`1.0`, `200.0`, `1e3`) canonicalize to the same integer. The refusal stays fixed with no echo. 0109 and v1 are untouched. No observed-HTTP regression is claimed, because JS JSON parsing normalizes these values.

**Checks:**
- NEW own PG16 on 55567; 55565 stays stopped and retained.
- `test:sql` once on the frozen successor; the full call-evidence DB file; the retained pre-0110 control; the integration call-evidence file; static checks and the all-8 VERIFY.
- Causal mutants M2, M3 and M4, each restored byte-identically.
- The guarded stop, then the successor FINAL-A, then HOLD.

### 3.1 R1 implementation record (successor; the 48b4 sections above unchanged)

**0110** (blob `0479680c` → `80669f7e`), pure functions only:

| Change | What it does |
|---|---|
| F02 | `research_call_observed_count` returns `(…)::numeric::bigint`, the validated integral value |
| F01, merge | a reported `cross_c1p` is adopted when no service witness of that dimension exists in the input |
| F01, observe | the service grouped cross witness (`sx`) is merged over the witnesses even when another dimension conflicts |
| F01, settle | `research_call_observe` runs for every opted-in comparison. A 0109 `conflict` keeps its own disposition and reason, while its witnesses are still written |

Unchanged: the money path, the lock order, the cap and the canonical and digest shapes.

**Tests:**
- The 0110 SQL test gains F02 goldens and adverses plus F01 pure merge and observe controls.
- The call-evidence DB test replaces the null expectation with the retained reported witness. It gains 4 F01 controls (producer-only; another dimension plus a service cross over the producer's, sticky; an A57-conflicting input keeping its witnesses; first delivered at the cap) and 2 F02 controls (direct real-SQL goldens and adverses; one canonical, with the decimal spelling replayed by the integer spelling through the real settle wrapper).

**Fixture and plpgsql mistake (dev):** an `IF … CASE … THEN` needed parentheses (plpgsql's IF condition ends at the first THEN); lint required the helper hoisted. Logs retained.

**Causal mutants, each restored to blob `80669f7e`:**

| Mutant | Reverts | Result |
|---|---|---|
| M2 | the reported cross dropped again | 4 controls fail |
| M3 | the early return without the service cross | 1 fails |
| M4 | the old text cast | 2 fail |
| M5 | the observation skipped on an A57 conflict | 1 fails |
