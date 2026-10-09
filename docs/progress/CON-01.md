# CON-01 — saved project conversations: progress

The mission's one record of where things stand. Source, local tests, independent review, hosted operations and Davide's acceptance are kept apart. Evidence levels follow pack 07: **L0** source and static, **L1** local real API, PostgreSQL and pinned dsh with a labelled stub provider, **L2** authorized real provider, **L3** deployed app, **L4** Davide's acceptance. A level never promotes another.

| Item | Value |
|---|---|
| Coordination | [docs/coordination/CON-01](../coordination/CON-01/README.md), its [binding map](../coordination/CON-01/BINDING_MAP.md) |
| Coordination issue | to be recorded at creation |
| Branch / PR | `claude/con01-project-conversations` / draft PR to be recorded at creation |
| Base | `main` `4f7470c3ab7c158315934a11c8c620da663f4898` (tree `7d1472e3e61c707e6611015203ddec35f7ff5ce2`) |
| Implementer / reviewer | Claude Code `session_01KUDtFK9gWthsXSrepcLQz3` / Codex `01a1224a-32b4-7222-a017-50a277572d95` |
| Reservations | A16; migrations 0048–0050; runtime unit `sophia-runtime-con01-dev` (G2) ([binding map](../coordination/CON-01/BINDING_MAP.md) §1) |
| Approvals in hand | **None.** No saved-text policy, cohort, grant, provider allowance, migration, deploy or paid call is approved |

## Gates

| Gate | State | Evidence |
|---|---|---|
| G0 binding and policy | Binding proposed ([binding map](../coordination/CON-01/BINDING_MAP.md)); awaiting Codex's review and Davide's decisions D-1 … D-6 | CON-01-CC-0001 |
| G1 durable human conversations | not started | — |
| G2 read-only native reply | not started; §8.2's container choice is open | — |
| G3 Studio experience | not started | — |
| G4 combined candidate | not started | — |
| G5 operations and in-app test (Codex) | not started; no approval | — |

## Baseline (this session, at `4f7470c`)

| Command | Result |
|---|---|
| `pnpm toolchain:check` (Node 24.21.0, pnpm 11.7.0) | ok |
| `pnpm install --frozen-lockfile` | up to date |
| `pnpm test:db` (local PostgreSQL 16.15 via `SOPHIA_DISPOSABLE_DATABASE_URL`; Docker unavailable here) | 600 tests, 600 pass, 0 fail, 0 skipped |

## Acceptance (pack 07; every case starts `not_run`)

| Id | Case | Gate | Status | Evidence |
|---|---|---|---|---|
| CON-01-T01 | Separate conversations | G2/G5 | not_run | |
| CON-01-T02 | Correct authorship | G1/G5 | not_run | |
| CON-01-T03 | Retention boundary | G0/G5 | not_run (policy proposed, D-1) | |
| CON-01-T04 | Current eligibility | G1/G5 | not_run | |
| CON-01-T05 | Account isolation | G1/G5 | not_run | |
| CON01-A01 | Atomic start | G1 | not_run | |
| CON01-A02 | Lost create reply | G1/G5 | not_run | |
| CON01-A03 | Lost send reply | G1/G5 | not_run | |
| CON01-A04 | Changed payload same key | G1 | not_run | |
| CON01-A05 | Current membership | G1/G5 | not_run | |
| CON01-A06 | Forged author | G1 | not_run | |
| CON01-A07 | Ordering and pagination | G1 | not_run | |
| CON01-A08 | No implicit invocation | G1/G2 | not_run | |
| CON01-A09 | Exact response correlation | G2/G5 | not_run | |
| CON01-A10 | Runtime unavailable | G2 | not_run | |
| CON01-A11 | Original destination | G2/G5 | not_run | |
| CON01-A12 | Restart after admission | G2 | not_run | |
| CON01-A13 | Uncertain inference | G2 | not_run | |
| CON01-A14 | Current mission | G2/G5 | not_run | |
| CON01-A15 | Real quick answers | G2/G5 | not_run | |
| CON01-A16 | No mutation from conversation answer | G2 | not_run | |
| CON01-A17 | Summary coverage | G3 | not_run | |
| CON01-A18 | Projection race | G2/G3 | not_run | |
| CON01-A19 | Source injection | G2 | not_run | |
| CON01-A20 | Decision actions retained | G3 | not_run | |
| CON01-A21 | Output identity | G3 | not_run (positive arm proposed not_applicable: no association path, binding map §10) | |
| CON01-A22 | Draft and held write | G3 | not_run | |
| CON01-A23 | Read errors independently | G3 | not_run | |
| CON01-A24 | Mobile and accessibility | G3/G5 | not_run | |
| CON01-A25 | Privacy during read/stream | G2/G5 | not_run | |
| CON01-A26 | Partial and cancelled replies | G2 | not_run | |
| CON01-A27 | No collateral regression | G4/G5 | not_run | |
| CON01-A28 | Bounded context and spending | G2/G4 | not_run | |
| CON01-A29 | Rollback and erasure continuity | G4/G5 | not_run | |
| CON01-A30 | Actual app non-fixture proof | G5 | not_run | |
| CON01-A31 | Parallel ownership | G4 | not_run | |

## Findings

None yet.

## Next action

Codex reviews the G0 binding (CON-01-CC-0001). Meanwhile Claude writes G1's failing tests and migration 0048 behind the off-by-default switch. Neither the schema nor G2's runtime path is frozen before the review.
