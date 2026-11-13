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
3. **Snapshot:** one `withActor(..., 'read')` transaction (REPEATABLE READ READ ONLY) calls `sophia.selection_snapshot`. It checks membership first, then fixes one instant (`clock_timestamp()`) and judges every expiry and freshness from raw columns at that instant. A non-member and a missing project are both NULL, which becomes 404 for both.
4. **Assembler:** `apps/api/src/selection-snapshot.ts` maps the snapshot purely to the kernel's `SelectionInput` for the one closed profile: a new standalone research request (explore family, explorer role).
5. **Kernel and projection:** `evaluateSelection`, then `projectSelection(decision, actor)`. That projection is the only value returned (no-store). The snapshot and the internal decision never reach HTTP, logs or events.

The preview is advisory. It calls no provider, model, companion or runner, and it reserves, leases, admits, wakes, notifies and dispatches nothing. Existing admission (0094 `contribution_admission`, 0092/0096 owner runner) stays the authority and rechecks everything before any effect.

## The facts and where they come from

| Kernel fact | Source (all at the snapshot's instant) | Missing means |
|---|---|---|
| actor, project | token subject; path | not a member: 404 |
| control | Closed profile (D2): `goalStatus` `ready`, `missionStop` `none`, `designHold` `not_applicable`. **Source:** the named sources' state (withdrawn, ineligible or missing all block). **Authority:** admin/editor `current`, viewer `cannot_edit`. **Operation refusal:** the research gate. | blocked |
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
