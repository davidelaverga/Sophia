# INC04-R07-C4-C5-PURE-001: pure capacity reflection and exposure (Stage A-R1, uncommitted)

**Status.** An inactive, pure component on a new owned worktree from base `e9ec44753f1a1c0e5e4040cc250287aa775ce610` (tree `625c4c1813f835fdf0e2929fd68d1d24547576ec`).

- It is **not committed, not composed, not wired** and not accepted.
- This is the **R1 successor** (Root77, `INC04-R07-C4-C5-PURE-REPAIR-R1-001`) of the reviewed uncommitted tree `59d244d7b1a5eda5964e70a08f7dc7bb9e1ccfee`. It lives on its own worktree and ref (`refs/heads/inc04-r07-c4c5-pure-r1-001`, still at e9); the 59d244 worktree, ref and files are preserved unchanged. See "R1 repairs" below.
- Base e9 is this component's source base only. It is not the latest coherent composition: later composition and the exact composed checks remain due.

## Scope: exactly four new files

| File | Role |
|---|---|
| `packages/domain/src/capacity-exposure.ts` | The pure mechanics. Nothing imports it, and no package export changed. |
| `packages/domain/src/capacity-exposure.test.ts` | Targeted Node unit tests. |
| `packages/domain/src/capacity-exposure.fixtures.json` | The frozen independent expectations, copied (not generated). |
| `docs/handoffs/INC04-R07-C4-C5-PURE-001.md` | This document. |

No existing file changed. That covers the export index, package, config, lock, GEN, Map, API, wire, SQL, auth, provider, SDK and artifact identities.

## Contract

The combined frozen contract:

- PRECODE-R2: MD `81ae5014…`, JSON `9e6c09ba…`, 64 vectors `ce226935…`;
- the normative ADDENDUM-001, `a306d9e1…`;
- the transition witnesses FG01–FG05, `a6d6ec87…`;
- the combined identity `9f568bd3…`.

The addendum supersedes only its explicit older finality rules. The fixture's `supersession` section maps each superseded expectation: it keeps the historical expectation and asserts the corrected one separately.

## Authority boundary (read this first)

The inputs are **already validated internal collector facts**. The module does not register, authenticate, authorize, persist, append or disclose anything.

The following are only as true as the trusted server caller that derived them:

- `issuerQualified` and the issuer's scope, from derived registered custody (ADDENDUM clause 2);
- `finality`, from the `appendFinality` fold;
- `bound` (DEP-C2);
- a `ClockBound` (clause 3: a route-qualified, server-held basis);
- `receivedAt` (an authentic, already-received measurement);
- every digest.

A caller, model, role, GUC or self-attested number is not that authority. Money state is never an input: there is no money field.

Results carry no release, refund, reservation or wallet change. They are not a provider limit, an admission decision or a private-capacity disclosure.

## Mechanics

| Function | Behavior |
|---|---|
| `timeState` / `checkObservationAppend` | One time predicate (future, historical, not_open, stale, current) for append, projection and current selection. A nonzero δ is refused (`clock_unqualified`) without a qualified basis. Append-time refusals: unregistered window, `issuer_unqualified`, unit and dimension mismatch, window mismatch, invalid time, `obs_from_future` (against server `receivedAt` plus δ). |
| `projectObservation` | C4 reflection and C5 exposure for one observation (`remaining_at`, `consumed_in_window` or `verdict_only`). |
| `reconcileObservations` | Over ONE partition (window key, kind, qualification revision; anything mixed is refused `mixed_partition`). Comparable different values are a sticky conflict; fixed-epoch regressions are detected over the complete strict-as-of relation (every reading against every strictly later one; R1-F02), so an equal-as-of group never hides a regression and input or id order never matters. The current reading is the latest current one. An equivalent tie keeps every candidate's projection and the union of diagnostics; an incomparable tie is bounded. Never issuer or arrival order. |
| `appendFinality` / `foldFinality` / `effectKnowledge` | The immutable finality knowledge fold (FG01–FG05). |

**`projectObservation` in detail:**

- **Exact arithmetic (R1-F01):** every running sum (floor, ceiling, attributed S) is exact (bigint) and converted only when it is itself a safe integer. A floor or attributed sum outside that range gives `status: 'range_unsupported'` (reason `aggregate_beyond_safe_range`, no numeric field, never usable as current); a ceiling outside it is an unknown ceiling (reason `ceiling_beyond_safe_range`, restrictive). Instants shifted by δ are compared exactly. The accepted scalar range (each input a safe integer) is unchanged.

- **Partitions:** effects must match the window's dimension, otherwise `partition_mismatch` is refused. An attribution counts only for its own observation (epoch): q is never carried across.
- **Identity:** effects are identified by project, reservation and dimension. Exact duplicates and alias handles merge once, so there is no double q. Differing facts for one effect are refused; disagreeing alias witnesses make q unknown.
- **Prior q (R1-F03):** `priorQ` is consulted under every alias handle of the original effect, and the highest earlier q is kept, so alias order cannot hide a regression; alias records are never summed and an earlier q is never used as q.
- **Witnesses:**
  - q comes only from a qualified reflection witness: coverage plus q plus a well-formed evidence digest. Timestamps alone never yield q.
  - A missing witness is `coverage_unknown` (never 0), except for a VALID final whole-effect zero.
- **Validation order (§5.1):** issuer, conflict, N1 correlation, q above the used amount, fixed-epoch coverage regression, then q above the ceiling.
- **Knowledge:**
  - A `final_total` with qualified finality caps consumption and takes precedence over a contradicted bound (N10, flag `used_exceeds_bound`).
  - A `final_total` without finality is held as lower-bound knowledge (`count_finality_inconsistent`).
  - A `so_far` count is never a ceiling. A missing or contradicted bound gives an unknown ceiling (`ceiling_unknown` or `future_exposure_unknown`).
- **Applicability:** outside, inside_final, inside_open or straddle. Straddling, old-epoch and late obligations keep their ceiling exposure across a reset; they are never dropped.
- **Outputs:**
  - the exposure interval `[xFloor, xCeiling]`;
  - effective capacity: `exact`, `bounded` or `bounded_unknown_ceiling`, with `possibleOverBy` and `provenOverBy`;
  - consumed attribution S and U with `coverageComplete` and `attributedIsLowerBound`, and `factConflict`.
- **Non-numeric inputs:** a verdict-only or unqualified-scope reading has **no** numeric fields. Non-numeric, negative or fractional inputs are refused, never coerced.

**The finality fold in detail:**

- **FG01:** none → qualified known count extends knowledge with a new receipt.
- **FG02:** an exact replay returns the same receipt, with no new sequence entry.
- **FG03:** the same known facts with new provenance are a provenance receipt.
- **FG04 and FG05:** a differing known count or incompatible known terminal time is a sticky conflict that keeps the first-known truth and the competing payload. An unknown field may still improve.
- **Identities:** receipt and payload identities are supplied data. One digest naming two payloads is refused.
- **Conflict reads:** a conflicted state yields no finality (restrictive), and only the largest competing count as lower-bound knowledge.
- **Purity:** results are new frozen values; inputs are never mutated. A caller-owned state that is not already deeply frozen is copied field by field before anything is frozen, so its nested objects keep their values, descriptors and frozen/extensible status (Root77 purity addendum); a deeply frozen state produced here is reused.

## Tests and causal controls (R1, actual)

`node --test packages/domain/src/capacity-exposure.test.ts` gives **117 tests in 16 suites, all passing**:

- the original 93 (all 64 frozen vectors with an exactly-once check, fixture integrity, FG01–FG05 plus the FG01 capacity example, and the synthetic mechanics checks), unchanged;
- 24 new R1 checks: F01 (9), F02 (6), F03 (5) and the purity addendum (4).

Expected values come only from the frozen fixture (unchanged, `f52ab855…`) or are derived by hand, never from this implementation. No received reference program was executed.

**Fail-before.** The R1 test file run against the unchanged 59d244 module (a scratch copy) gives 13 failures of 117: every F01, F02, F03 and purity counterexample. The positive boundary checks pass on both.

**Fifteen causal controls** each temporarily mutated only the successor `capacity-exposure.ts`, failed intended assertions, and were restored byte-for-byte:

| Control | Mutation |
|---|---|
| M11 | F01: checked conversion removed (the old unchecked rounding) |
| M12 | F02: adjacent-only regression scan restored |
| M13 | F03: first-handle-only prior q lookup restored |
| M14 | purity: caller-owned state frozen in place (no copy) |
| M01–M10 | the eleven Root76 categories (unknown → zero, N10, dedup, alias identity, cross-epoch, mixed partition, reset, FG always-conflict, FG overwrite, so-far ceiling, final without finality), re-targeted at the successor text |

The exact time comparisons have no causal control: the old number comparisons were an equivalent mutant, because rounding only happens beyond the safe range, where every comparison against a safe operand gives the same answer. They are kept exact so that this does not rest on that argument.

`prettier --check` (four files), `oxlint --type-aware` (two TS files) and `tsc --noEmit -p packages/domain` are clean. Toolchain: Node 24.21.0, pnpm 11.7.0; installed with an owned store `/var/tmp/r07-c4c5-pure-r1-pnpm-store`.

## R1 repairs (Root77) and history

The SAME SOURCE_CORE review of 59d244 (`96f7fac4…`, adopted by Root) required three repairs, and a later Root purity addendum added a fourth boundary:

| ID | Defect in 59d244 | Repair |
|---|---|---|
| F01 | Unchecked sums: final totals `MAX_SAFE, 1, 1`, q 0, V = MAX_SAFE gave "exact" −1 (true −2) | Exact bigint sums with checked conversion; `range_unsupported` or unknown ceiling instead of a rounded number |
| F02 | Adjacent-only regression scan: remaining 40/50 @100 then 45 @200 passed, depending on id order | Complete strict-as-of relation, permutation-invariant; ties and rolling windows unchanged |
| F03 | Prior q read only under the first alias handle | All alias handles consulted, highest earlier q kept |
| Purity | Append and replay could freeze nested objects of a caller-owned, non-frozen state | Copy before freezing; deeply frozen states reused |

**History kept honest.** 59d244's 93 tests and 11 controls are history at their own scope, not transferred credit. Draft failures in R1: one hand-derived time expectation was wrong (window start 0 with δ = M − 1 is `not_open`, not `current`; the test constant was corrected, not the code), and the first static run needed Prettier formatting and removal of one unnecessary type assertion in the test. Recorded exceptions Root66, AUTHSEM-SCOPE-01, Root94, Root95, PURE-E01 (shared store in Root76) and PURE-E02 (Root76 `-002` moves and no-op rm) remain history. The R1 install left the old default store untouched, but pnpm appended one entry to its shared `~/.cache/pnpm/lockfile-verified.jsonl`.

## Not done, and still required

- This is not a collector, issuer registration, attribution or finality append service, SQL, wire or OpenAPI field, export, API route, live clock or bound qualification, or admission.
- The canonical codec and its full-field closed grammars (ADDENDUM E04) are not part of this slice.
- Still required: composition onto the current coherent base, exact composed checks, collector and authority integration, wire home, limitation aggregation, DEP-C2 enforced bounds, later DEP-L1, and live qualification.
- No commit, ordinary check, PG, publication, CI, merge, deployment or activation is granted. All existing holds remain.
