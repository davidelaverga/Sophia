# Scoped capacity observations in the read-only selection preview (INC04-S03a)

**Status:** INC04-S03a, root lease `INC04-S03A-OBSERVATIONS-001`; migration **0107**. There is no contract amendment and no generated change. Base: the accepted coherent `ef2c3cca` (0105 + 0106).

This page is the coherent final plan. The sealed pre-code plan (`7dec776e`) and its amendment A1 (`5f97750d`) stay as history in [the handoff](../handoffs/INC04-S03.md).

This slice is **advisory and restrictive** in the existing read-only research preview. It is not admission enforcement, not native qualification, not full R07 reconciliation, not UI work and not S03 acceptance. All AC-04 cases stay open; AC-04-04, 05, 09 and 14 are not_run.

## What it adds

A migration-owner operator records an **evidence-custody reading** of one API contribution path's provider limits. The existing preview reads the reading that speaks for each API candidate's exact scope at its one instant, and maps it onto the kernel's existing capacity fields. The kernel, admission, dispatch, ledgers, contracts and UI are unchanged.

## Records (0107)

All three tables have RLS enabled, no policy and no application grant. UPDATE, DELETE and TRUNCATE are refused on all of them.

| Record | Holds |
|---|---|
| `capacity_observations` | One sealed reading in one closed v1 scope. See "Scope (C01)" below for the columns. |
| `capacity_observation_windows` | Per window:<br>• `window_ref`, an optional `window_epoch`;<br>• `scope`: account, model, spend or concurrency;<br>• `model_selector`, exactly for a model window and equal to the reading's model;<br>• `unit`: provider-native, never converted;<br>• `value`: custody only, **never projected or used**;<br>• `verdict`: admits, exhausted or unknown, as **the source stated it**;<br>• `applicability`: known, partial or unknown;<br>• `reset_at`. |
| `capacity_observation_revocations` | Insert-only revocation with a reason. |

### Scope (C01)

Every scope column is NOT NULL, so its uniqueness is real.

| Part | Columns and rules |
|---|---|
| Accounting root | Owner, `account_id` and provider, derived from the connection's own rows. |
| Payment path | `connection_id` and its CURRENT `credential_revision`. |
| Use | `route_id`, `model`, `effort` and `operation`. These are pinned by the connection; the grant must match them. |
| Qualifications | The exact live account qualification (`account_qualification_id` and `account_qualification_revision`, 0104), and the exact global route qualification row (`route_qualification_id` plus its frozen `qualified_at` and `expires_at`). The route table has no revision column, and none is invented. |

### Provenance and coverage (C02)

- `source_kind = operator_recorded` only. This is custody, never a feed, never current quota and never a qualification.
- `verification` (operator call or console), `evidence_ref` (outside the database), `source_channel`, and `window_set_ref` plus `window_set_version` (the authoritative applicable-window set).
- An optional authoritative `source_sequence`.
- `coverage`: complete, partial or unavailable.
  - **Complete** must name exactly its windows (at least one), each of known applicability.
  - **A none-applicable claim is refused**: no qualified mechanism proves that no window applies.
- `reflection` (unknown, none, some or all) is recorded and **never used** (C04).

## Recording (C03)

`record_capacity_observation(jsonb)` and `revoke_capacity_observation(uuid,text)` belong to the migration owner alone: EXECUTE is granted to no role. `scripts/record-capacity-observation.ts` is the operator transport. Running it against a deployment is an RTA-held credentialed effect; this slice runs it only against disposable databases.

**One sealed call.** The recorder checks the whole reading, then writes the parent and every window inside a transaction-local seal for exactly that reading.

- A direct insert, or a post-seal append, is refused (55000).
- A deferred constraint trigger refuses a commit whose window count differs from the promised count, so there are no half readings.

**Replay and conflict.** Same key and same canonical payload (key excluded; windows sorted; numbers without trailing zeros; UTC microsecond instants) returns the original receipt, including under a concurrent race: `ON CONFLICT DO NOTHING`, then compare the hash. A changed payload under the same key is a conflict (23505).

**Refusals (22023):**

- unknown fields;
- an unknown or stale connection credential;
- an observation in the future, or freshness not after observation;
- **the epoch fence**: a reading fresh past any window's reset, or a reset not after the observation;
- complete-coverage shape violations, duplicate windows, a model window without its model;
- **qualification identity**. The named account qualification must be the connection's one live one, at that exact revision. The named route row must be current. Both must hold **at the reading's own `observed_at`** as well as at record time:
  - the account qualification observed by then and unexpired;
  - the route row qualified by then, unexpired and unrevoked.

  A backdated reading taken before its qualification is never blessed by a later one.

## Reading at one instant

`selection_capacity_observation_at(grant, connection, p_now)` is STABLE, granted to no role, and called only from the definer snapshot. The 0105 `selection_api_candidate` body is replaced byte for byte with one added key, `observation`.

1. **Exact scope and visibility.** Only readings in the candidate's exact scope count: its connection, account, owner, current credential revision, and the grant's route, model, effort and operation. They must be observed AND recorded by `p_now`; this is evidence-available visibility with no backfill time travel. If none exist, the result is **NULL**, the unchanged baseline.
2. **Current qualification, first.** Keep only readings still bound to the qualifications current at `p_now`: the same ids and revision, the route row's frozen facts unchanged, each holding at the reading's own observation.
   - If none remain, the result is **`unbound`**. This is restrictive, never the baseline.
   - A replaced or lapsed qualification's readings never mask, outvote or conflict with a reading bound to the replacement, whatever stream or window set it is in.
3. **Among bound readings only:**
   - two streams (channel, window set, version) are a **`conflict`**, and windows of distinct readings are never merged;
   - in one stream, the latest observed reading wins, then the higher authoritative sequence;
   - contradictory equal-time readings without two distinct sequences are a **`conflict`**;
   - a late-arriving older reading never wins.
4. **Revocation stays in the choice.** If the chosen reading is revoked by `p_now`, the result is **`revoked`**. An older positive is never resurrected.
5. **Otherwise `recorded`.** It carries the id, the times, `fresh` (`fresh_until > p_now`), coverage, the required refs and the windows. It carries no value, evidence, channel, reflection or limitation.

## Mapping in the preview (C05, with root's precision)

The accepted policy text (`docs/plans/api-contributions.md` lines 50-51) proves that the `bounded_total_spend` / `hold_uncertain` policy operates with **no provider telemetry**. Nothing accepted proves it covers a scope whose applicable reading is non-current or contradictory, so those states are restrictive.

| Reading for the candidate's exact scope | Kernel capacity | Outcome |
|---|---|---|
| none (NULL) | **unchanged baseline**: `conservative_policy`, `limits unknown`, `windows []`, the grant's proof and ledger verdict | as before 0107 |
| `recorded`, fresh, complete, every window known with a stated verdict, refs exact | `conservative_policy`, with the **unchanged** proof and ledger verdict, `limits covered` and the windows (`provenanceRef` = reading id) | the financial gate still decides; any exhausted window gives `capacity_exhausted` |
| anything else: stale (including a prior epoch after its reset), partial, unavailable, unknown verdict or applicability, refs mismatch, `conflict`, `revoked`, `unbound` | `basis: 'none'`, `policy: null`, `windows []` | `capacity_unproven`: unproven pending a qualified refresh |

- The grant's proof status, revision and validity are never altered.
- No owner permission, proof revision or timestamp is synthesized.
- A reading never adds capacity. There is no arithmetic with the ledger, and no reset replenishes anything.
- `factsRevisionRef` gains `.o<id>` (or `.o-<state>`) only when a reading exists.

## Installation and privacy (C07)

- `SELECTION_PREVIEW_SCHEMA` keeps 0104, 0105's `ATOMIC_ADMISSION_INSTALLED` and 0106's marker, and adds the private `selection_capacity_observations_0107()`.
- **Without 0107:** 503 `projection_unavailable` for every role, never an empty or unobserved pool. The same running app serves once the migrator applies 0107.
- **Readiness** (`app.ts`) is unchanged.
- **Older helper body:** a full snapshot whose API candidates lack the `observation` key is unavailable, never guessed. This covers, for example, a database where 0105 was applied after 0107.
- **Viewers:** 0106's role-first restricted branch returns before any helper runs, so a viewer never reaches the new read.
- **Projections:** the reading's facts stay inside the server-internal snapshot and the kernel input. No id, window, unit, evidence or verdict reaches HTTP or logs.

## Coverage versus reflection (C04)

- Limiting-window coverage is not reflection of Sophia's own consumption. Reflection is recorded and never used, and remains unknown in practice.
- Observations never write, release or reclassify a ledger, reservation, claim or uncertain hold. 0105 admission and dispatch do not read them.
- The two independent gates (the ledger, and a fresh exhausted window) are **not** full R07 reconciliation.

## Checks (actual, on disposable PG16)

| Suite | Covers |
|---|---|
| `db/tests/0107_capacity_observations.sql` | Privileges. The seal (update, delete, truncate, post-seal append, half reading at commit). Canonical replay and conflict. Every refusal, including a backdated reading before its account or route qualification. Visibility, staleness, a late older reading, two streams, equal-time conflict versus distinct sequences, revocation without resurrection. Account and route requalification: unbound-only stays `unbound`; a replacement reading in a **different stream and window set** is current; two current-bound streams still conflict. Model mismatch. |
| `capacity-observations.db.test.ts` | A 4-way concurrent same-key race (one row, identical receipts) and a changed-payload conflict. Refusals with nothing written. No application login can record, revoke or select. Requalification, then a replacement in another stream, then credential rotation. The operator CLI recording, replaying (identical output) and revoking. |
| `selection-snapshot.db.test.ts` | The null baseline. The projected reading, without its value, evidence or channel. The same reading for another project's grant on the same account and connection, with identical capacity facts. Ledger, reservation, claim, binding, job, command and outbox rows byte-equal across record, revoke and a real reset passing (fresh becomes stale, the uncertain reservation still held). An expired account qualification gives `unbound`. |
| `selection-snapshot.test.ts` | The byte-identical baseline; the fresh positive with an unchanged proof; one of two windows exhausted; ledger busy despite admits; eleven non-witnessing states giving `basis none`, `capacity_unproven` and an untouched grant; native unchanged; nothing projected. |
| `selection-observations.db.test.ts` | Real HTTP: the baseline and the fresh positive selected; exhausted gives `unavailable_now`; stale and requalification-unbound are not selected; the viewer is restricted; nothing private in bodies or logs; previews write nothing. A SYNTHETIC helper fault: the viewer is still restricted, the editor fails without the database message. Nonmember 404, no token 401. The real migrator up to 0106 gives 503 for every role; after it applies 0107, the same app gives 200. |

Every fixture is SYNTHETIC. Nothing here qualifies a real account, route, provider or telemetry source.

## Limits and open gates

- **Native observation scope** (the `account_key` group) is deferred; native keeps every exclusion.
- No qualified provider or adapter telemetry source exists, and none is fabricated.
- Readings are operator-recorded only, and that custody is not live evidence.
- A reading speaks only for its exact connection, credential revision and qualifications. A reading through one connection does not restrict another connection of the same account. It also does not create allowance there.
- Native requested, accepted and observed settings, any public field, and the UI are deferred.
- Admission enforcement of observations is not done, and neither is R07 numeric reconciliation.
- The native G1, owner, provider, deployed authorization, RTA and app gates stay open.
