# INC04-S01b: the trusted read-only selection preview

This is the source plan for slice S01b of [INC-04](../execution/2026-11-08-incremental/modules/INC-04_ALLOCATION_AND_TEAM_RESOURCES.md), with migration 0104 and contract amendment A56.

- **Controlling decisions:** root 623d6f78 (six corrections, D0–D10), 39363283 (RC1–RC4) and 33a934ff (the seven kernel choices), plus the runtime-selector lease addendum fbf014ea.
- **Base:** `6ebf45e3`. That commit holds the INC-04 kernel at `packages/domain/src/allocation-selection.ts` (R4 repair). It does not hold A3 (0103/A54/A55), which is not joined here.
- **Numbering:** 0104/A56 leave gaps at 0103 and A54/A55. Migrations and amendments are read in sorted order with duplicate and name checks only, so the gap is accepted. A later join applies 0103 as pending.

## What it is

```
GET /api/v1/projects/{projectId}/selection-preview?operation=research[&sourceIds=<up to 8 uuids>]
```

1. **Auth:** the actor is the verified token's subject.
2. **Closed query:** only the one operation and the exact named sources. There is no actor, role, goal, task, grant, proof, policy or settings field, so unknown fields are 422.
3. **Snapshot:** one `withActor(..., 'read')` transaction (REPEATABLE READ READ ONLY) calls `sophia.selection_snapshot`. It checks membership first, then fixes one instant (`clock_timestamp()`) and judges every expiry and freshness from raw columns at that instant. A non-member and a missing project are both NULL, which becomes 404 for both. (Superseded in part by R2 below: since 0106 the function decides the caller's role right after membership and returns a restricted form to a non-evaluator before reading anything else.)
4. **Assembler:** `apps/api/src/selection-snapshot.ts` maps the snapshot purely to the kernel's `SelectionInput` for the one closed profile: a new standalone research request (explore family, explorer role).
5. **Kernel and projection:** `evaluateSelection`, then `projectSelection(decision, actor)`. That projection is the only value returned (no-store). The snapshot and the internal decision never reach HTTP, logs or events.

The preview is advisory. It calls no provider, model, companion or runner, and it reserves, leases, admits, wakes, notifies and dispatches nothing. Existing admission (0094 `contribution_admission`, 0092/0096 owner runner) stays the authority and rechecks everything before any effect.

## The facts and where they come from

| Kernel fact | Source (all at the snapshot's instant) | Missing means |
|---|---|---|
| actor, project | token subject; path | not a member: 404 |
| control | Closed profile (D2): `goalStatus` `ready`, `missionStop` `none`, `designHold` `not_applicable`. **Source:** the named sources' state (withdrawn, ineligible or missing all block). **Authority:** admin/editor `current`, viewer `cannot_edit` (since R2 a viewer never reaches the assembler: their snapshot is restricted). **Operation refusal:** the research gate. | blocked |
| summary viewers | the actor only, when admin/editor (D6) | restricted |
| policy | the requester's own `research_funding_pins` becomes a family_default Pin with null settings. No Prefer, override or cross-payer record exists. | auto |
| API grant authority | 0094 grant lifecycle codes, plus `owner_not_member` and `pin_stale`. Requester eligibility. Grant role `sophia-research-md-v1` is the kernel's `explorer` (D1). | prohibition |
| route qualification | the global route record (0094) AND the account's own record for its connection at its current credential revision (0104). A rotation stales it. | `none`/`stale`: prohibition |
| host | the contribution runtime: leased, ready, seen within the existing 90 s (D8) | offline |
| disclosure | owner a current member, requester eligible, gate enabled, every named source eligible (D7) | denied |
| capacity | `conservative_policy` (D3): the owner's bounded_total_spend grant as proof. Its verdict comes from the existing ledgers: grant total, account total across every project and alias, account and grant slots, and the project's non-model budget for one more allowance, each against the prospective task's cap. Free slots never overcome exhausted money (RC3). | busy, or the proof `capacity_policy_unproven` |
| protection | The owner's declaration on the account (RC2). `none_applicable` exactly as declared. `protected` keeps owner-entered slots and/or spend free of one more task. | `policy_absent`: `reserve_policy_missing` |
| commitments | Any uncertain reservation or `outcome_unknown` task of the account means present (RC1), and held slots mean busy. | — |
| native | Recorded facts only. Host, capacity and reserve are unknown. Own native: the explore default route prohibits it. Others: owner-only. | — |
| ranking | no records exist | unknown, ordered by candidate id |
| strict settings | null, with no disclosure (D5) | — |

**The pool:**
- the project's non-revoked API grants, plus the actor's pinned grant even if it is revoked;
- then its native resources.

A 201st row means more than 200: the response is 503 `projection_unavailable`, never a ranked subset (RC4). Account sums are complete regardless.

## The two owner/operator facts (0104)

- **Owner protection.** Nullable fields on `api_accounts`, which is the existing accounting root.
  - Written only by the account's owner, through the existing idempotent `account_update` with the patch key `protection`: an object, replaced whole, or null to withdraw.
  - Table CHECKs require a whole declaration, scoped exactly to {research}/{sophia-research-md-v1}, with amounts within the account's limits. So a conflicting cap edit is refused as any invalid account is.
  - No default, backfill or inference.
  - The owner reads it back in `GET /api/v1/me/api-resources`.
- **Account qualification.** An operator record (migration owner only) binding:
  - the account, the connection and its current credential revision;
  - route, model, effort and operations;
  - kind of verification, an evidence reference, observation, expiry and revocation.

  It is recorded with `scripts/qualify-api-account.ts`, which reads no credential and calls no provider. Recording it is custody of a claim, not live access: the global route qualification is still required. The owner reads its state and provenance back, never its evidence reference.

## Checks

- **SQL** (`db/tests/0104`): privileges; protection CHECKs and the owner write path (replay, conflict, stale, non-owner, cap conflict, withdraw); qualification boundaries (exact `expires_at`, revocation at the clock, rotation stale); at-time parity away from boundaries and the 90 s liveness boundary; the snapshot (non-member, sources, revoked Pin, protection witnesses, 201); owner-only readouts.
- **0094 guard:** `db/tests/0094` now recognises runtime_instances selectors by FROM or JOIN, and lists this slice's one scoped reader.
- **Persistence DB:** the real money and slot ledgers (money exhausted with free slots, held slot, account-wide uncertainty from another project, project non-model budget), a read-only transaction that assigns no transaction id, and the owner and operator writes.
- **API DB:** selected for owner and other member with zero writes and no private log line; restricted viewer; uniform 404; closed query; missing protection; protected violation; no account qualification; rotation; owner removal; source withdrawal; expiry; revoked Pin; equal correlation with a new commitment; 201 → 503; absent 0104 → 503.
- **Unit:** the assembler and the parser.

**Limits:** all of this is synthetic and local. Nothing here qualifies a live owner, account, route or provider, completes any AC-04 case, or activates anything.

## R1: one uniform answer for a current viewer (CORE F01, P2)

- **Defect on e3a72b10:** the route checked the pool's completeness before the projection.
  - 0104 gives every current member the same count-based completeness bit.
  - So a current viewer got restricted 200 at 0 or 200 hidden candidates, but 503 `projection_unavailable` at 201. That revealed the pool threshold.
- **Repair:** `previewSelection` owns the order.
  1. If the verified current membership gives no summary authority (a viewer), the one restricted view is returned first.
     - It is exactly the kernel's projection for a viewer outside the summary audience.
     - The pool's completeness and candidates are never read, and nothing is evaluated.
  2. Only then is a current admin's or editor's pool required complete. A pool above 200 stays `projection_unavailable`, never a ranked subset or an empty preview.
  3. Otherwise the kernel path runs, unchanged.
- **Unchanged:** the authenticated actor, the read-only snapshot, the installation 503, the uniform 404 (a former member included), 401, the closed query, no-store, zero effects and the logs. There is no new contract or endpoint.
- **Checks:**
  - **API DB:** a current viewer at 0, 200 and 201 hidden candidates gets the same status, body, cache-control, content-type and logged status. In the same project the editor gets 200 over the complete 200, then 503 at 201. The controls hold: 404, 401 and 422, with zero writes.
  - **Unit:** the viewer gets the kernel's restricted view at an empty, a full and an incomplete pool. An editor's incomplete pool is `projection_unavailable`.
- **Limit:** response TIMING is not made uniform. 0104 still counts and builds the bounded pool before the role is known, and changing that needs SQL, which R1 does not lease. (Kept as R1's record. R2 below moves the role decision into SQL; it still makes no constant-time promise.)
- **Native as-of precision:** `selection_native_candidate` reads `qualified_at` without an observation-time fence. This stays a bounded, nonblocking observation, not a selectable-native defect, and R1 does not change it. A future native-eligible or readout scope must fence observation time explicitly. No general native at-time guarantee is claimed.

## R2: the viewer boundary in SQL, and the installed contribution schema (PR519-950D F01, F02)

- **Origin:** published 950d72fa (PR #519) carried two automated findings. Root's independent SOURCE_FINAL `971db26e` classed both NEEDS_REVISION (repair decision `4532d25a`, scope addendum `a11e15e1`, lease decision `a15db587`).
  - **F01** (reported P1, comment 4564324297; confirmed as a narrow dependency/control gap): 0104's `selection_snapshot` read the gate, Pin and budget, counted the pool and built every candidate before the TypeScript layer restricted a current viewer. So a viewer's request still depended on that private work succeeding, and R1's "before the pool is read" was true only of the TypeScript layer. No pool-triggered 503, external leak, exploit or timing result was observed; the reported P1 is not waived by this note.
  - **F02** (P2, comment 4564324310): with `apiContributions` on, `/ready` and the contribution routes' own installation check required 0094 and 0100 but not 0104. A56's protection patch reaches 0094's `api_account_update`, which refuses the `protection` key, so on a database through 0100 or 0102 an "installed" API refused a valid patch as an invalid setting. Source control flow only; no deployed outage is claimed.
- **SQL (0106, a new migration; 0104 is not edited):** `selection_snapshot` is replaced with the same signature, volatility, definer, search_path, time zone and grants.
  1. The closed source list is validated (22023), and membership is checked (NULL for a nonmember, missing project, former member or no actor, as before).
  2. The caller's own membership row is read. A current member who is not an admin or editor gets the **restricted** form: `{evaluation: 'restricted', evaluatedAt, projectId, actorId, member}`. It is returned before the project row, research gate, Pin, budget, named sources, the candidate count or any candidate helper is read.
  3. An admin or editor gets the 0104 facts unchanged, marked `evaluation: 'full'`.

  `sophia.selection_viewer_boundary_0106()` is a private installed marker (executable by no application role). It is a migration-presence marker only: it does not detect a later hand replacement of the function body.
- **Internal types:** `SelectionSnapshot` is now the union `FullSelectionSnapshot | RestrictedSelectionSnapshot`.
  - The restricted form is unevaluated: it is not an empty or a complete pool, and it carries no budget, source or qualification fact.
  - `readSelectionSnapshot` checks the discriminant at runtime. It refuses, as `projection_unavailable`, a form without it, and a full form whose member is not an admin or editor. That second check keeps the earlier TypeScript role restriction as a second line behind the SQL.
  - `assembleSelectionInput`, `requestRevisionOf` and every candidate mapping accept only a full snapshot.
  - `previewSelection` answers the uniform restricted view for a restricted snapshot, and for a full snapshot whose membership is not active. Otherwise it keeps R1's order: an incomplete pool is `projection_unavailable`, and ≤200 is evaluated exactly as before (R5 strict-null, kernel unchanged).
  - No public contract changes: A56, GEN and OpenAPI are untouched.
- **Installation:**
  - **Preview:** requires `selection_snapshot` AND the 0106 marker, so a database with 0104 but not 0106 answers 503 `projection_unavailable`, as one without 0104 always did.
  - **Contributions:** one predicate, `API_CONTRIBUTIONS_SCHEMA`, is required by the routes (before any read or write reaches SQL) and by `/ready` when contributions are on. It needs:
    - 0094: the write entry and the owner's projection;
    - 0100: the rebuild funding guard;
    - 0104: the protection refusal and views, the qualification table, the seven protection columns, and the replaced update and owner projection bodies that call them;
    - the 0106 marker.

    A partial database answers 503 `projection_unavailable` with no account change, idempotency row or command.
  - **Default off:** with contributions off (the default), no route is mounted and `/ready` requires nothing of them, as before.
  - **Latch limit:** the installed latch is still monotone. An online rollback after a success is not detected.
- **Checks:**
  - **SQL** (`db/tests/0106`): privileges and the marker; the minimal restricted form at 0, 200 and 201 private candidates, beside the full forms (complete at 200, incomplete at 201); NULL for a former viewer, outsider, missing project and no actor; 22023 for a viewer's invalid list. SYNTHETIC helper faults: the viewer keeps its form while the editor and admin meet the fault.
  - **API DB** (`selection-installation.db.test.ts`):
    - the viewer's 0/200/201 answers are identical, with no effect;
    - SYNTHETIC helper faults leave the viewer unchanged, while the editor gets 503 `unavailable`;
    - an owned ACCESS EXCLUSIVE lock on the pool's tables never holds the viewer, while the editor waits and then evaluates;
    - 404, 401 and 422;
    - an unmarked form, or a full form for a viewer, answers 503;
    - real partial schemas (through 0100, through 0102, with 0104 but without 0106) and the full schema: owner protection declare, replay, conflict, stale, foreign, invalid, replace, read and withdraw.
  - **Unit:** the union, the restricted view, and the refusal of a restricted snapshot by the assembler's types and at runtime.
  - **Persistence DB:** explicit full narrowing and a viewer's restricted form.
- **Limits:**
  - **Timing and availability:** nothing promises constant time. A database or installation failure still answers unavailable; a viewer's healthy answer just no longer depends on the pool.
  - **0104's own SQL test:** it is unchanged. Its viewer blocks now compare NULL fields of the restricted form and pass vacuously; its viewer role check still holds. 0106's test re-asserts those facts for the editor and the viewer.
  - **Native as-of precision:** stays as R1 records it.
