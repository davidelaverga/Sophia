# INC04-R07-C2-DIMENSION-BOUNDS-CORE-001 — inactive database core of the qualified dimension bound (Stage A, attempt R2)

**Attempt R2 (Root73, C2R1B-F01).** A separately identified successor of the frozen R1B tree `5ee6373…` (kept unchanged
in its own worktree), on the same base and the same eight paths. It completes the dispatch for the otherwise eligible
design and source-review reservations: reserve → immutable expected-preimage apply → exactly one claim permission, each
through its OWN maintained authenticated scope and post-last-wait fence (`design_scope_of`, `review_scope_of`), never
the research scope and never an operation chosen from a caller label. Plan (written before the code):
- one shared apply / claim / outcome core over the scope's server values (project, runtime, allowance, attempt, native
  session) and the server-side operation of its entry point, which must equal the reservation's immutable identity
  operation; the research entry points keep their behaviour;
- owner-only entry points for design and source review that resolve their own scope (design with the maintained
  reserve's `p_kind` NULL: a design or design-review job) and re-run it with `p_fence` after the last wait;
- no new API, schema, provider or account policy; account-backed source review stays `provider_not_contributed`;
- tests: design and project-funded review reserve → apply → one claim, canonical replay without send, foreign and
  changed-payload refusals, real Stop waits under each scope; causal controls; final positives after all restorations.

**Status.** Stage A successor candidate **R1** (task INC04-R07-C2-DIMENSION-BOUNDS-CORE-R1-001), uncommitted, for the
SAME independent source review. It is its own candidate: the submitted Stage A candidate (tree `4ed29360…`) stays frozen
and unaccepted, and R1 was built from a copy of its eight bodies on the same base. **Inactive.** No API, OpenAPI, SDK,
generated type, runtime bridge, emitter or collector reaches it, and nothing is activated. Base:
`a452010dfee606bc80a0488d8d0f9986ee98e8f5`. Root reserved migration/test ID **0113** for this task only.

**Attempt R1B (Root71).** The same R1 source and lease, verified on a fresh own PostgreSQL after the first R1 cluster
was lost with a machine restart. Its first real database run found two development errors, both fixed within the eight
paths before the controls: an ambiguous plpgsql name in `research_bound_prepare` (the funding-binding variable is now
`fb`, not the bindings alias `b`), and a late-fact operation key reused across two test worlds (keys are global).

**Contract.** The combined R0 + R1 + R2E paper with the Root bridge C01–C03, and the frozen placement corrections:
- **AS-FP01** — the bound block in the reserve (research, and in R1 also design and source review);
- **AS-FP02** — profile locks before the account guard in the current 0112 settle (and in R1 the current 0112 late-fact
  writer).

**Nothing here is a qualification.** Every authority, profile, policy, emitter digest and evidence reference used by the
tests is **synthetic**. A digest is consistency between two parties. It is never authority, a route or profile
qualification (GATE G-ROUTE / G-PROFILE), a loaded-emitter proof, or outbound truth.

## What R1 changes (against the frozen 4ed candidate)

| Repair | Where | What |
|---|---|---|
| **T-C2-34 / K4 late knowledge** | 0113 replaces the current 0112 `research_call_record_late_facts` | Byte for byte, plus the same K4 hook as the settle, at the same place: after `research_call_retain`, before `research_restriction_cause` takes the account guard. Newly accepted late count knowledge above the authorized bound appends one sticky contradiction and the profile's terminal `auto_hold`. Its operator `record_research_late_facts` takes no guard before it (read). Causes, episodes, certificates, recurrence, exact late and settle replay, money, finality and history are unchanged; the old 0110 settler is not restored. |
| **C02 shared lineage** | `research_bound_prepare`; 0113 replaces `runtime_design_reserve` and `runtime_source_review_reserve` (0109) | The account and grant come from the maintained server resolver `research_call_binding` (0109): the job's own contribution task, else the refusal for an unbound contributed lineage, else the allowance's lineage binding. It is STABLE and takes no lock, so it adds no lock and no inversion before the gate. There is never a caller value, and a missing task never means a project payer. The design and source-review reserves run the same plan after their key/replay branch (and the review's call limit), before their gate, and write the fresh rows after the identity. The gate resolves the same binding, and the reserve refuses unless the funding it judged is the plan's. |
| **Finding A** (SAME) | `register_research_bound_profile`, `register_research_bound_policy` | A competing registration is bound to the STORED target's first scope (and, for a policy, its dimension) before any conflict effect. A payload naming another scope, or an authority of another scope, is refused like no authority: no row, no conflict, no digest. Same-scope sticky conflicts and their exact replay are unchanged. |
| **Finding B** (SAME, bridge C02) | `research_bound_policy_lock` (reserve, apply and claim) | ANY sticky conflict of an applicable revision refuses, read from the conflict rows before the derived state. A revoked revision that also carries a conflict is never filtered into a no-cap fallback. Revoke is not weakened (it is still terminal and never caps), and no policy is made active. |
| **T-C2-75** | tests | Real two-connection waits on the authority row in both orders, for profile and policy events and registrations. |
| **F06** (SAME) | `runtime_research_bound_claim` | The no-send claim history is returned only for the SAME canonical claim payload (its digest), from the claim owner. A changed dispatch, runtime, original generation or apply receipt is refused like a foreign caller (`dispatch_claim_refused`); the stored owner, order and may-have-sent are unchanged. |
| **F07** (SAME) | domain `knowledge()` | K1 joint consistency: every known count of the same effect (so_far, reflected q, other known counts) is a lower bound, and a final below any of them is restrictive UNK. It is never an exact final, a negative X or a capacity credit. A valid final above the bound stays exact (K2: 17000 > b 16000). |
| **F08** (SAME) | DB test | One local failure lifecycle (`holding`) for every test that holds a transaction or a gate: gates released, ROLLBACK, every started operation awaited, then the client released (destroyed if cleanup failed); the primary failure stays primary, with any cleanup failure reported beside it. One controlled failure proves the lock, the waiter and the gate are released and the next positive works. |

## What R2 changes (against the frozen R1B candidate 5ee)

| Repair | Where | What |
|---|---|---|
| **C2R1B-F01: one dispatch core** | 0113 `research_bound_dispatch_lock`, `research_bound_apply_core`, `research_bound_claim_core`, `research_bound_outcome_core` | The R1B apply, claim and outcome bodies, unchanged in order and refusals, over the entry point's server values (project, runtime, allowance, attempt, native session) instead of a research scope record. The lock also requires the reservation's immutable identity operation to equal the entry point's operation (defense in depth: the attempt binding already separates operations). |
| **C2R1B-F01: the post-last-wait fence of the OWN scope** | 0113 `research_bound_fence` | After the last wait, the entry's own maintained scope is re-run with `p_fence`: research `research_scope_of(…, true)` (as before), design `design_scope_of(…, NULL, true)` (the maintained design reserve's own `p_kind` NULL: a design or design-review job), source review `review_scope_of(…, true)`. The operation comes from the entry point, never from the request. |
| **C2R1B-F01: design and review entries** | 0113 `runtime_research_bound_{apply,claim,outcome}_design` and `…_review` | Owner-only SECURITY DEFINER entries. Each resolves its own maintained authenticated scope (0041 `design_scope_of`, its 12-field `design_scope`; 0042 `review_scope_of`, its 10-field `review_scope`) and passes only the five fields the core needs; no field is coerced between the composites. The research entries keep their behaviour. |
| **Wrappers** | persistence `runtimeBoundApplyFor`, `runtimeBoundClaimFor`, `runtimeBoundOutcomeFor` | A fixed map from `design` / `source_review` to the fixed entry SQL; the label picks an entry, never an authority or a scope. Private, not exported through the index. |
| **Tests** | DB test (R2 block), SQL test (privileges) | Contributed design and project-funded source review: reserve → expected-preimage apply → exactly one claim (two concurrent design claims, one permission); canonical apply and claim replay with no send; the other operations' entries refuse; foreign identity (another operation's reservation on the same shared allowance), another binding, another project, runtime, call, generation, emitter, bound and receipt refusals; changed claim payloads `dispatch_claim_refused`; the ACTUAL `admit_goal_command` Stop committed first while the claim waits refuses it under the design and the review scope (`Design work is not active`, `The review is not active`); a claim committed first keeps its one permission; a hold refuses the first design apply; a profile revoke first refuses the review claim; money of the reservation's own allowance and the original account/grant lineage unchanged; outcome through the operation's own entry. The R1 design case still shows the research entry refusing a design dispatch. The SQL test asserts nine SECURITY DEFINER entries and invoker-rights cores. |

## The eight paths

| Path | Role |
|---|---|
| `db/migrations/0113_research_dimension_bounds.sql` | The database core (below). It replaces exactly **eight** existing functions; every other definition is new and owner-only. |
| `db/tests/0113_research_dimension_bounds.sql` | Covers, and rolls back: SQL codec parity with the frozen fixtures; custody; the derived lifecycle; policies; **R1 findings A and B**; the request parser; privileges. |
| `packages/domain/src/research-dimension-bounds.ts` | The pure codec (8 append domains and 3 digest helpers), the derived lifecycle and Rule K (K1–K4, `effective = V - X`). Not exported through the index. R1: F07 joint consistency. |
| `packages/domain/src/research-dimension-bounds.test.ts` | Unit tests over the frozen fixtures and the R1 numeric vectors. R1 adds the F07 cases; the frozen vectors are unchanged. |
| `packages/domain/src/research-dimension-bounds.fixtures.json` | Frozen synthetic identities: 12 positive, 6 helper, 28 refusals and 9 knowledge vectors. Unchanged in R1. |
| `packages/persistence/src/research-dimension-bounds.ts` | Private typed owner wrappers (R1 adds the design and source-review reserves with the opt-in; R2 their apply, claim and outcome entries). Not exported through the index. |
| `packages/persistence/src/research-dimension-bounds.db.test.ts` | Real-PostgreSQL flows with genuine two-connection waits (R1 adds the late-fact, shared-lineage, findings A/B and current-authority blocks; R2 the design and source-review dispatch block). |
| `docs/handoffs/INC04-R07-C2-DIMENSION-BOUNDS-CORE-001.md` | This note. |

## The database core (0113)

### Framing and validation

- **Framing:** `d<len>:<domain>`, `k<len>:<n>`, then each field as `s<len>:<utf8>` or `n` (typed null). Digests are sha256, lowercase hex.
- **Validation order:** key-set (`payload_incomplete` / `payload_invalid`), then grammar including the R2 calendar, then cross-field.
- **Domains:** the eight closed append domains and the three digest helpers of R2E.

### Custody

- **A dedicated authority** (`research_bound_authorities`): kind `bound_profile_qualification`; exact scope and
  dimension; approver ≠ verifier; append-only revocation taken under the authority row FOR UPDATE. The 0112 financial
  authority table, enums and grants are **not** widened.
- **Every manual action** (each registration and each event) locks the target row FOR UPDATE, then the CURRENT authority
  FOR SHARE, after its last wait. A registration-time approval is not perpetual. A revocation committed first refuses the
  action; an action committed first keeps its one receipt and the revocation waits for it (tested with genuine waits).
- **What is refused with no row:** unauthorized, malformed or wrong-scope requests (R1: the scope is the stored target's).
- **What is a sticky conflict:** an authorized, grammar-valid competing payload of the same scope. Its exact replay
  returns the same conflict receipt. An exact replay of an accepted payload returns its stored receipt (E1.1).

### Lifecycle

- **Derived, never stored.** For a profile: distrust > revoke > auto_hold > conflicted > held (an open manual hold) >
  active > inactive. For a policy: revoke > conflicted > active > inactive.
- **event_seq** is a server receipt assigned under the target row. **unhold** targets exactly one open manual hold.
  **auto_hold** is written only by the contradiction writer (settle and, in R1, late facts).
- **C01:** a policy's canonical activation is the accepted activate with the smallest event_seq. **C02** (R1 finding B):
  an applicable revision with any sticky conflict refuses new authorize, apply and claim, whatever its derived state.

### Reserve (AS-FP01)

The replaced `runtime_research_reserve`, `runtime_design_reserve` and `runtime_source_review_reserve` are the 0109
bodies byte for byte, plus marked lines. For a NEW tracked model call that opted in with `boundProfile` only, the bound
block runs strictly after the existing key/replay handling (and, for research, the finalizing branch; for a review, its
call limit), and before the new-call gate. It:
1. resolves the original funding binding with the maintained `research_call_binding` (no lock);
2. locks the profile rows FOR SHARE, in dimension order;
3. locks the applicable policy rows FOR SHARE, in (policy_id, revision) order, resolved from their first immutable
   registration, and refuses on any sticky conflict (C02);
4. derives `b = min(profile.max_ceiling, active caps)`, together with the set and outbound digests.

Then:
- **After the identity**, it writes fresh rows only: one dispatch and four authorize rows (output_tokens,
  model_requests, and input / input_cached as `unsupported`).
- **The gate's funding** must equal the binding the plan was locked under.
- **Replay** compares the stored original client request. A changed client request is the existing 23505; a later server
  policy or profile change is never a client change.

### Request, replay and ACK

These replace the current 0110 functions, byte for byte plus marked lines: `boundProfile` is accepted only on the
tracked model opt-in; a caller number (`bound`, `maxTokens`, …) is `bound_caller_supplied`; without the opt-in the
request, identity, replay, ACK and digests are unchanged; the ACK echoes the **stored** bounds only for an opted
reservation.

### Dispatch (owner-only runtime entries in this slice)

| Operation | Behaviour |
|---|---|
| **apply** | Compares the server-derived expected outbound and authorize-set digests. Any inequality is one generic `bound_param_mismatch` (C03). A receipt only; an exact replay at any phase returns it and never grants permission. A different apply is a sticky orthogonal `apply_conflicted` flag. |
| **claim** | The single at-most-once `applied → claimed` transition. Only the transitioning reply has `sendPermitted: true`. Lock order: scope → allowance → profile rows (S) → policy rows (S) → dispatch (U), then the scope's own fence and every post-wait recheck. A replay is history only, to the claim owner only, and only for the same canonical claim payload (R1 F06). |
| **outcome** | Informational, from the claim owner only, through the operation's own entry. |

R2: each operation has its own entries (research, design, source review), each resolving its own maintained scope; the
shared core binds the reservation's identity (allowance, attempt, native session, operation) to that scope and re-runs
the scope with its fence after the last wait. An entry never accepts another operation's reservation.

### Settle and late facts (AS-FP02, K4)

The replaced `research_call_settle` and `research_call_record_late_facts` are the current 0112 writers byte for byte,
plus one hook placed before `research_restriction_cause`, which takes the account guard even when the account is already
restricted. When a known output count is above the authorized bound, the hook writes one sticky contradiction per input
evidence, writes the profile's `auto_hold`, and holds the profile row FOR UPDATE. Unsupported dimensions, unopted
reservations and counts at or below the bound write nothing; wrong-binding, malformed and unauthorized late facts are
refused whole by the 0112 operator. Rule K is unchanged: a valid qualified final is exact (K2) even when the bound is
contradicted, and a so_far count never caps (K3).

### Read model

`research_bound_status` reports, per dimension, unknown | unsupported | authorized_not_applied | applied_unqualified |
qualified | contradicted. It is server mechanics only and is not wired to any collector.

### Money

Nothing here creates, reprices, releases or refunds USD. There is no dollars-to-native conversion and no legacy backfill.

## Running the checks (own disposable PostgreSQL 16)

- **Migrations and SQL test:** apply every migration in order (111 at the base, plus 0113: 112), then only
  `db/tests/0113_…` (113 files), on a fresh database.
- **DB test:**

  ```bash
  SOPHIA_DISPOSABLE_DATABASE_URL=… node --test --test-concurrency=1 packages/persistence/src/research-dimension-bounds.db.test.ts
  ```

- **Unit:**

  ```bash
  node --test packages/domain/src/research-dimension-bounds.test.ts
  ```

The denied `db/tests/0110` is never read or run.

## Honest limits and named gaps

- **Design and source-review dispatch entries (R2).** They exist, owner-only and inactive like the research entries; no
  API, bridge or emitter reaches them. Their scope resolvers were read only within Root73's four granted spans (G1–G4);
  no helper they call was read. The design and review attempts in the tests are labelled synthetic fixtures.
- **Account-backed source review.** It stays refused by the maintained gate (`provider_not_contributed`, C02-01), opted
  or not, before any effect.
- **Original generation.** `sophia.contribution_runtime_generation` is invoked with its accepted C3 P03-A meaning. Its
  body was not re-read here, and its lock behaviour is a named condition; it runs before the gate.
- **Whole-transaction "guard last".** It remains conditional on the untouched helpers and foreign keys. The tests show
  the order directly at the settle and at the late-fact writer: a profile-share holder makes the writer wait on the
  profile row while the guard is still free, and a guard holder finds the profile row already held by the waiting writer.
- **Not run in this slice:** the C/R matrix layers (controlled emitter/send, real route and isolation qualification,
  two-units-per-HTTP); the semantics-evidence content review; G-ROUTE and G-PROFILE; live provider calls; activation.
- **Still open:** U2–U6.

The mapping of all 87 matrix cases and the causal controls (the Root69 passes, kept unmodified, and the R1 targeted
controls with the re-run placement and bridge controls) are in the R1B evidence packet; the R2 controls (each new
operation path and post-wait fence reverted) and the final positives after every restoration are in the R2 packet, not
in this file.
