# SMC-M01 progress: the mission-aware companion

The mission: [M01](../missions/2026-09-27-companion-research/missions/M01_MISSION_COMPANION.md), pack v1.1. Coordination: issue [#17](https://github.com/davidelaverga/Sophia/issues/17). Contract binding: [SMC-M01-contract-binding.md](SMC-M01-contract-binding.md).

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**State on 2026-09-28: G1 in progress.** The foundation is verified, pack v1.1 is installed, the binding is frozen and the coordination channel exists. Nothing is merged, released or accepted.

| Readiness | State |
|---|---|
| Source-ready | No |
| Merge-ready | No |
| Release-ready | No |
| Hosted-verified | No |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `c683e6e60ff76004e8a06e71c368b718848b1687`: the merge of #15 (parents `01d9117`, `78c76a3`). CI push run 36357507466, all four jobs green |
| Not in the base | R00's closeout, PR #16, open and draft at `86d35ad`. Its code commit `0391bc6` (the runtime profile reconciliation) is what production runs. M01 touches none of its files; the branch merges `main` once #16 lands |
| Branch | `claude/upbeat-feynman-d7jskb` (this session's designated branch, dedicated to M01) |
| Implementation PR | opened with the first push |
| Coordination issue | [#17](https://github.com/davidelaverga/Sophia/issues/17), created by Claude through the repository connection on 2026-09-28 |
| Implementer | Claude Code, session `https://claude.ai/code/session_01WYqdvEfR8p7mTf1Wbh1b4f` |
| Operator | Codex, started by Davide. Session unknown until its first message on #17 |
| Pack | v1.1, installed from `Sophia_Three_PR_Mission_Pack_v1.1_2026-09-28.zip` (sha256 `8ad62933…802c`), see [missions/README.md](../missions/README.md) |
| M01 assets (pack) | prompt `e4fb14d3…c44b` (9809 bytes), skill `2e746dfb…90d5` (14600 bytes), combined `7fe8f729…8f6d` (24410 bytes) |
| Hosted, last observed | every process at `0391bc6`, schema 0001–0017, runtime bundle `391c89ce…` (R00-CX-0007, 2026-09-28 00:59 UTC). Not re-observed by this mission yet (SMC-M01-OP-0001) |

## 2. Baseline checks (at `c683e6e`, in this session)

| Check | Result |
|---|---|
| `pnpm check` (Node 24.21.0, pnpm 11.7.0) | exit 0: 256 unit tests; artifacts reproduced; 51 integration tests against the real pinned dsh |
| `pnpm test:sql` | 17 migrations and the SQL test pass |
| `pnpm test:db` | 147/147 |
| Pack validators, in `docs/missions/2026-09-27-companion-research/` | `sha256sum -c SHA256SUMS` 0 failures; `validate_pack.py` passed; `validate_m01_assets.py` passed (`combined_sha256` `7fe8f729…8f6d`) |

The database suites ran against a disposable local PostgreSQL 16.13 cluster through `SOPHIA_DISPOSABLE_DATABASE_URL`, because this container has no Docker daemon. CI runs them on `postgres:16`.

## 3. Goals

| Goal | State | Evidence |
|---|---|---|
| G1 Bind current source/contracts | binding frozen; failing tests next | [binding](SMC-M01-contract-binding.md); OP-0001 requested |
| G2 Canonical ledger | not started | |
| G3 Voice notes and guide | not started | |
| G4 Mission experience | not started | |
| G5 Release and acceptance | not started | |

## 4. Acceptance cases

| Case | Source | Tests | Hosted | Accepted |
|---|---|---|---|---|
| T01–T22 | — | — | — | — |

## 5. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M01-OP-0001 | read-only preflight (`inspect_request`) | [SMC-M01-CC-0001](../coordination/SMC-M01/SMC-M01-CC-0001.md) | requested; no answer yet |

No hosted effect is requested or approved. No unknown effect exists.

## 6. Ownership

Reserved on #17 (binding §8): migration `0018_mission_ledger.sql`, amendment `A08-mission-ledger`, the media bridge, the mission and media API routes, `packages/persistence/src/mission.ts`, and the Studio conversation and mission features. M01 changes no dependency, lockfile or runtime identity.

## 7. Mission state

```json
{
  "schema": "sophia.mission-state.v1",
  "mission_id": "SMC-M01",
  "current_goal": "M01-G1",
  "repository": "davidelaverga/Sophia",
  "branch": "claude/upbeat-feynman-d7jskb",
  "base_commit": "c683e6e60ff76004e8a06e71c368b718848b1687",
  "candidate_commit": null,
  "implementation_pr": null,
  "coordination_issue": 17,
  "status": {
    "source": "in_progress",
    "merge": "not_requested",
    "release": "not_requested",
    "hosted_verification": "not_run",
    "product_acceptance": "not_requested"
  },
  "owners": {
    "implementation": "Claude Code",
    "operations_support": "Codex",
    "product_authority": "Davide",
    "ui_review": "Luis_when_relevant"
  },
  "completed_goals": [],
  "test_evidence": ["baseline at c683e6e: pnpm check, test:sql, test:db, pack validators (section 2)"],
  "outstanding_operations": ["SMC-M01-OP-0001 revision 1: read-only preflight, requested"],
  "unknown_effects": [],
  "hosted_tuple_ref": "R00-CX-0007 (not re-observed)",
  "migration_ledger_ref": "R00-CX-0007: 0001-0017 applied",
  "approval_refs": [],
  "remaining_allowance_ref": null,
  "file_ownership": ["see section 6"],
  "next_action": "Author the failing tests for M01-T19-T22 and the 0018 schema, then implement G2",
  "checkpoint_ref": null
}
```
