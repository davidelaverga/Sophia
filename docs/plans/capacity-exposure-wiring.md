# C4/C5 W1: capacity-exposure custody and a restrictive preview (INC04-R07, Root87)

**Status: states first, written before any source edit;** the boundary note in §3 was added with the evidence. The evidence is recorded in
[the handoff](../handoffs/INC04-R07-C4-C5-W1-001.md).

**Who.** SAME Native1, a Claude Code implementation worker. Human owner Davide.

**Base.** Coherent 007 `b871a6ac…`, tree `b23ccd31…`. Migration **0114** is allocated to this slice. Host keeps 0113,
which is not on this base and is not needed by 0114.

**Contract.** Frozen PRECODE-R2 plus ADDENDUM-001 and FG01–FG05, the accepted pure module
`packages/domain/src/capacity-exposure.ts` (blob `64157197…`, unchanged), ENTRY01–ENTRY05, Root84, Root85 and Root86
as corrected by the Root87 task.

**What W1 is.** A bounded custody and preview slice. It is **not** full C4/C5, admission, numeric disclosure, native, or
any live qualification.

## 1. What it does, in one paragraph

An operator, as the migration owner, records append-only custody:
- **scopes:** one 0107 exact scope plus its qualification revisions;
- **windows:** registered window keys;
- **issuers;**
- **bindings:** one 0107 reading window bound to one registered window and kind;
- **binding revocations;**
- **dimension mappings;**
- **attributions** (q);
- **effect finality.**

With the new **`capacityExposure`** switch on, the preview reads that custody together with the effects on the reading's
account. It runs the accepted pure module server-side and may make an API candidate **only more restrictive**:
- **proven over, or exactly zero headroom:** the kernel's `capacity_exhausted` (limitation `unavailable_now`);
- **any uncertainty:** the kernel's existing `capacity_unproven`.

Nothing new reaches the wire or a log. With the switch off, nothing changes.

## 2. States and transitions

### 2.1 Switch × schema (ENTRY01)

| `capacityExposure` | 0114 installed | `/ready` | Preview route guard | Snapshot read | Parser | Mapping |
|---|---|---|---|---|---|---|
| off (default; `server.ts` does not set it) | no | as before (0105/0109/0110 core unchanged) | as before (0104–0107) | as before; no exposure requested | as before; a missing `exposure` key is ignored | 0107's, byte-identical |
| off | yes | as before | as before | as before (the setting is not set, so SQL adds no key) | as before | 0107's |
| on | no | **503 `schema`** | **503 `projection_unavailable`**, before any snapshot | — | — | — |
| on | yes, but a helper without the key (an older body) | 200 | 200 | requested | **every API candidate must carry `exposure`**: else `projection_unavailable` | — |
| on | yes | 200 | 200 | requested | `exposure` parsed (closed shape) | W1 restrictive mapping |

**The markers.** Each is removed independently in its own database by the readiness test:
- the private function `sophia.selection_capacity_exposure_0114()`;
- the custody table `sophia.capacity_window_registrations`.

A W1 marker is **never** a core requirement: with the switch off, a database without 0114 stays ready.

### 2.2 One API candidate's exposure (switch on)

| 0107 reading | W1 custody for that reading | `exposure` | Mapping |
|---|---|---|---|
| none / conflict / revoked / unbound | — | `null` | 0107's (already non-admitting except "none", which stays the 0107 no-reading baseline) |
| recorded | **never bound** (no binding row for any of its windows, revoked or not) | `{state:'never_bound'}` | 0107's, byte-identical |
| recorded | a binding is revoked, conflicted or invalid (registration, scope or issuer conflicted; registration semantics unknown) | `{state:'restricted'}` | **unproven**: never the never-bound fallback |
| recorded | bound, valid | `{state:'bound', windows:[…]}` | per window (2.3), then combined |

### 2.3 One bound window → outcome

The pure module computes:
1. `reconcileObservations` over the window's partition (the window key, kind and qualification revision);
2. then `projectObservation` of the selected current reading, with the earlier fixed-epoch q.

| Result (private) | Outcome |
|---|---|
| no current reading, a comparable conflict, a regression, a coverage regression, or a current selection that is not this reading's binding | unproven |
| `tie_bounded` with every effective ceiling ≤ 0 | **exhausted** |
| `tie_bounded`, otherwise | unproven |
| `scope_unqualified`, `verdict_only`, `range_unsupported`, or not `usableCurrent` | unproven |
| remaining kind, effective ceiling ≤ 0: proven over (`provenOverBy`) **or exactly zero headroom** | **exhausted** |
| remaining kind, `exact`/`bounded`, effective floor > 0, coverage complete, no reason or flag, bundle complete | **unchanged** |
| remaining kind, anything else (unknown ceiling, a floor ≤ 0, incomplete coverage, any reason, an incomplete effect set) | unproven |
| consumed kind, complete, no `factConflict`, no reason, bundle complete | unchanged |
| consumed kind, otherwise | unproven |

**Combining windows.** Any exhausted → exhausted (proven over is never weakened to unknown). Else any unproven → unproven.
Else unchanged.

**Kernel input.**
- **Unchanged:** 0107's capacity, as is.
- **Unproven:** `{basis:'none', limits:{witness:'unknown'}, windows:[], policy:null}`, the shape 0107 already uses. This
  gives `capacity_unproven`.
- **Exhausted:** 0107's witness capacity with each exhausted window's verdict set to `exhausted`. This gives
  `capacity_exhausted`, limitation `unavailable_now`. When 0107's capacity is not a witness, it is already
  non-admitting (`capacity_unproven`) and stays so: no witness is made up.

No outcome ever adds capacity (a property test over every input).

### 2.4 The worked partial reflection (Root86; private numbers, asserted inside tests only)

Setup:
- one registered `remaining_at` window with V = 800;
- one in-scope model effect with a qualified final total c = 1000 (a finality append);
- an issuer-qualified attribution q.

The pure module gives X = c − q and effective = V − X.

| q | X | Effective | Outcome |
|---|---|---|---|
| 400 | 600 | 200 | unchanged |
| 800 | 200 | 600 | unchanged |
| 1000 (full reflection) | 0 | 800 | unchanged |
| removed | unknown ceiling | — | unproven (never 0, never available) |
| 0 | 1000 | −200 (proven over by 200) | exhausted |
| 200 | 800 | 0 (zero headroom; its own test) | exhausted |

`consumed_in_window`: V = 9000, q = 400 (complete) gives S = 400 and U = 8600, and the outcome is unchanged. S > V gives
`factConflict`, and the outcome is unproven.

## 3. Effects (obligations) and their facts

- **The scope is the account.** Every model reservation whose tracked identity (`research_call_identities`, 0109) names
  the reading's `account_id`, **in any project**. A window counts every applicable one; the pure module decides
  `inside_final`, `inside_open`, `straddle` or `outside` from the reservation's `created_at` and qualified finality only.
  `ended_at` and money state are never read as finality.
- **Unrepresented:** a model reservation on that account (`api_contribution_reservations`) with no identity. It forces
  the bundle **incomplete**: the outcome is at best unproven, and is never lost or zero. (f1's boundary is closed in
  attempt 2 below.)
- **More than 200 applicable effects:** incomplete as well.
- **Per effect and dimension:**
  - **Counts.** These come only through an applicable registered **dimension mapping** for the identity's (provider,
    route, contract, source field).
    - Classes `unknown` and `no_separate_reported_class` are absent, never 0.
    - Two mapped sources that both give a value must agree. Otherwise the effect is unresolved.
    - `cache_write` and `openai.model_requests` mappings are refused at registration (unsupported semantics). So
      `model_requests` stays unknown, and nothing makes b = 1 from a reservation, a send or a delivery.
  - **Truth state.** A truth row with any first conflict or overflow, `history_count = 16`, or a history row with
    disposition `conflict` makes the effect unresolved. Unread dispositions are never folded.
  - **Finality.** It comes only from finality appends, folded by the accepted `foldFinality` and `effectKnowledge`.
    - A conflicted fold makes the effect unresolved (no max is chosen).
    - A known final total with a larger reported so-far count is a contradiction: unresolved.
  - **Count kinds.** A count is `so_far` (reported, unverified, a lower bound) unless a qualified final total exists.
    The bound is always null (C2 is not here).
  - **Unresolved effects** carry no count and no finality. They force the bundle incomplete.
- **Attributions** are per binding (observation) and effect. A different payload for the same key is a sticky conflict.
  q is never carried across observations or epochs. Earlier fixed-epoch q (max over aliases) is used only for the
  regression check.
- **Time.** δ = 0: no clock bound is passed (Q7 is unqualified). A binding's `as_of` and `fresh_until` are the 0107
  reading's own. Its server receipt (`recorded_at`) is the received instant (ADDENDUM clause 3).

## 4. Custody (0114)

### 4.1 Tables

All append-only: sealed writes, no update, delete or truncate. RLS is on, with no policy, and no application grant.

| Table | Natural key | Payload domain |
|---|---|---|
| `capacity_exposure_scopes` | `scope_id` | `sophia.c4c5.scope.register.v1` (W1): the 0107 exact scope and qualification ids and revisions |
| `capacity_window_registrations` | `window.key.v1` | `sophia.c4c5.window.register.v1` (R2, frozen fields) |
| `capacity_exposure_issuers` | `issuer_id` | `sophia.c4c5.issuer.register.v1` (R2) |
| `capacity_observation_bindings` | `binding.key.v1` (observation, window ref) | `sophia.c4c5.binding.append.v1` (W1) |
| `capacity_binding_revocations` | the binding key | `sophia.c4c5.binding.revoke.v1` (W1) |
| `capacity_dimension_mappings` | `mapping.key.v1` (provider, route, contract, source field) | `sophia.c4c5.mapping.register.v1` (W1) |
| `capacity_attributions` | `attribution.key.v1` (R2) | `sophia.c4c5.attribution.append.v1` (R2) |
| `capacity_effect_finality` | (`finality.key.v1`, payload digest) | `sophia.c4c5.finality.append.v1` (R2); several payloads per subject (knowledge extension, FG) |
| `capacity_exposure_conflicts` | (kind, key digest, competing payload digest) | the sticky conflict record |

### 4.2 The codec and validation order

The codec is R2's typed TLV byte for byte (`C4C5 ` + domain + field count + typed fields). The SQL test reproduces the
frozen fixture identities for the window, key, issuer, attribution and finality domains.

Validation order: key completeness (`payload_incomplete`), then each field's closed grammar including a real calendar
(`payload_invalid`), then cross-field rules, then append-time semantics.

### 4.3 Receipts

- An exact replay returns the same receipt.
- A different payload under the same key records one sticky conflict (the same receipt on retry) and never updates.
- Finality: a new payload under the same subject is a new immutable row. The pure fold decides extension, provenance or
  conflict.

### 4.4 Approval (ADDENDUM clause 2)

Scope, window, issuer, mapping and finality payloads carry `approval_ref_digest`. Bindings and attributions derive
their authority from the registered issuer and window custody, and store the relied-on registration's digest.

### 4.5 Who may write and read

- **Writes:** migration-owner functions only, EXECUTE revoked from PUBLIC. The CLI `scripts/record-capacity-exposure.ts`
  is for disposable databases. No deployment or live use is authorized.
- **The read:** `selection_capacity_exposure_at(grant, connection, now)`, STABLE. It is reached only from
  `selection_api_candidate`, which is called only by the definer snapshot after 0106's role decision. A viewer never
  reaches it. EXECUTE is revoked from PUBLIC.
- **The candidate.** `selection_api_candidate` is 0107's body byte for byte. It adds an `exposure` key **only** when
  the read transaction set `sophia.capacity_exposure = 'w1'`. The persistence read sets it only when the switch is on.
  That setting is a switch for what is assembled, not authority: the snapshot still decides the role first, and nothing
  it adds leaves the server.

## 5. What covers, replaces or is left alone

- **Replaced:** `selection_api_candidate`, with its 0107 body plus one optional key.
- **Not touched:**
  - 0107's rows and semantics; admission, dispatch, ledgers and money;
  - contracts, OpenAPI, GEN and SDK; the UI;
  - `server.ts`; the runtime identity; `DESTINATION_MAP` and the Source Map (rows go in the external handback).
- **The pure module and its fixtures and tests** are byte-identical. `packages/domain/src/index.ts` only exports it.

## 6. Failures and crossings

| Case | What happens |
|---|---|
| A slow or failed database read | the existing `unavailable` (503); the helper writes nothing, so a retry is safe |
| The same append pressed twice | the same receipt |
| Concurrent appends of one key | serialized by a transaction advisory lock on the key digest: one row, then a replay or a conflict |
| Binding while the reading is revoked | refused |
| Revocation after binding | restrictive from then on |
| A reading superseded by a newer 0107 reading | the new reading's own custody decides (never bound → baseline) |
| An old helper body with the switch on | `projection_unavailable` (never guessed) |
| The switch on, 0114 removed by a rollback | `/ready` and the route answer 503 |
| An effect set larger than the cap | unproven, never a partial positive |
| A cross-project effect on the same account | counted |
| A legacy, unrepresented reservation | incomplete |
| A future observation (`as_of` > recorded) | refused at binding |
| Exhausted versus unknown precedence | exhausted wins (stronger) |
| Unknown versus unchanged | unknown wins |
| A viewer, a nonmember, no token | unchanged (restricted, 404, 401); a viewer reaches no helper |
| A nonowner editor | sees no owner codes (the kernel's own rule) |

**Platforms:** a server-only change. No browser or UI is touched.

## 7. Checks

- **SQL** (`db/tests/0114_capacity_exposure_custody.sql`):
  - frozen codec identities;
  - each domain's refusals in order;
  - replay and conflict receipts;
  - binding refusals (unregistered, unit, window, epoch, time, future, scope, model, issuer, revoked reading);
  - mappings that are unsupported;
  - finality FG01–FG05 rows and receipts;
  - seal and immutability;
  - no application privilege on any new table or function.
- **Persistence DB:** the wrappers' receipts, lost-reply replay, concurrent appends, refusal codes and the CLI-facing
  validation.
- **Unit:** adapter mapping, count derivation, monotonicity (never less restrictive), no numbers in codes, and the
  causal controls' targets.
- **API DB, real HTTP:**
  - the switch × schema states;
  - the worked partial reflection (q 400, 800, 1000, removed, 0, 200) and `consumed_in_window`;
  - restrictive cases: sticky conflicts, history conflict and ordinal 16, legacy and unrepresented effects, a mapping
    disagreement, `so_far` without a bound, model requests, cross-project effects, regression, tie, retirement,
    straddle, stale, historical, not_open and future;
  - FG finality persisted;
  - role boundaries;
  - leak capture of bodies and logs;
  - purity of previews (no ledger, reservation, claim or custody change).
- **Readiness DB:** switch off/on × 0114 absent/present; each marker removed; core 0110 retained.

## 8. Not in W1

W2 (numeric wire and owner disclosure), C2 bounds (null), L1 admission, P1/D1 project payer, native resources, live
issuer, clock, mapping, provider and route qualification, and the UI.

## Attempt 2 (Root88, from f1 `f1c1e334…`): close B1, the unrepresented ledger obligation

Written before any test change. Same 17 paths. The intended changes against f1 are the 0114 SQL test, the API exposure
DB test, and this plan and the handoff. The production query and adapter change only if B1 exposes a genuine
completeness defect.

**States (unchanged rules, now exercised end to end).**

| Ledger row (0094 `api_contribution_reservations`) on the window scope's account | Identity | Kind | Read (`unrepresented`) | Outcome |
|---|---|---|---|---|
| none | — | — | false | as before (the q 400 positive stays available, private effective 200) |
| another account | none | model | false | unchanged: never restricts, never leaks |
| this account | none | search | false | unchanged: not a token effect (existing scope rule) |
| this account, **any project** | none | model, created before the window ends | **true** | **unproven** (`capacity_unproven`), never available, never 0 |
| this account | a 0109 identity | model | false: a represented effect, as before | per its facts |

**Fixture boundary (declaration read L1–L4).**
- The ledger row references `research_reservations` (the f1 fixture row, written under the explicit replication-role
  exception) and `api_contribution_tasks(project_id, job_id)`.
- The task row references the real `api_accounts` and `api_contribution_grants` rows (in HTTP: the contribution's real
  account and grant, and a real grant for the other project), plus `jobs`.
- `jobs` is a further hop whose declaration is outside the grant (no recursive walk). The fixture therefore writes the
  task and ledger rows in the same explicit replication-role transaction. Only the `jobs` reference is left without a
  row. The test asserts that every other reference resolves.
- In the SQL test, which has no grant fixture, the grant reference does not resolve either. This is stated there.
- These rows qualify no admission, money, account or native fact.

**Causal control.** Defeat only the ledger detection in 0114's read. The new B1 assertions must then fail.

## Attempt 3 (Root89, from 019 `019153b8…`): the review's W1-F01, W1-F02 and W1-F03

Written before any source or test change. Only nine paths are writable: the migration, the SQL test, the adapter, its
unit and DB tests, the custody DB test, the CLI, this plan and the handoff. The other eight bodies stay byte-exact at
019.

**W1-F01: a mapping counts only while its issuer is qualified in its own scope.**

| Issuer of a mapping | NEW registration | At read |
|---|---|---|
| registered, unconflicted, with its own registered scope and revision unconflicted (`capacity_exposure_issuer_of(issuer, its scope, its revision)`) | recorded | eligible: its reported counts may count as so-far lower bounds |
| its own record conflicted, or its parent scope conflicted, or unregistered | refused, `issuer_unqualified` (an exact replay of an already recorded payload still returns its receipt first) | **ineligible: restrictive**, read like a conflicted mapping. The effect is unresolved and the set incomplete; never a qualified count, and never absent-as-zero |

- The read emits each mapping's `eligible`, and folds ineligibility into the existing restrictive `conflict` flag. The
  parser and the adapter (frozen persistence types) already treat that flag as unresolved.
- The global four-field mapping key and its sticky different-payload conflict are unchanged. Finality knowledge is not
  erased.
- **The meaningful case:** the bound reading and window belong to a still-valid scope S1. The mapping's issuer belongs to
  a separate scope S2, which then conflicts. Before the conflict the count counts; after it, the effect is unresolved,
  and S1's binding stays valid (not `restricted`).

**W1-F02: the strongest existing refusal survives uncertainty.**

| 0107 base capacity | W1 effect | Result |
|---|---|---|
| a witness with a current exhausted window (`capacity_exhausted`) | unproven or restricted (missing q, revoked binding…) | **the base, unchanged** (`capacity_exhausted`, `unavailable_now`); never replaced by `capacity_unproven` |
| a witness, all windows admitting | unproven | unproven, as before |
| any | exhausted | exhausted windows marked, as before |
| basis none | any | the base, as before |

- No exhausted verdict is made up where 0107 had none.
- The monotonic property now includes bases with exhausted windows. It asserts preservation **unconditionally**, even if
  the output basis is none.

**W1-F03: the CLI dispatches only its eight own kinds.**
- The registry is a `Map`, checked before the payload file is read or a database client exists.
- `toString`, `constructor`, `__proto__`, `hasOwnProperty` and any unknown kind are usage, exit 2: no receipt, no
  connection, no append. This holds even with a missing file and an unusable URL.

**Controls.**
- F01a: new-registration qualification removed.
- F01b: read eligibility removed.
- F02: preservation removed.
- F03: own-key check removed.
- Plus a rerun of C1–C8 and C3b.

**Outcome.** Implemented as planned. The results are in the handoff's "Attempt 3".
