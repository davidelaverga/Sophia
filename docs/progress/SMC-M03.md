# SMC-M03 progress: research specialists, Markdown/PDF delivery and Knowledge

The mission: [M03](../missions/2026-09-27-companion-research/missions/M03_RESEARCH_WORKFLOW.md), pack v1.1. Coordination: issue [#31](https://github.com/davidelaverga/Sophia/issues/31). Plan: [SMC-M03-plan.md](SMC-M03-plan.md) (approved). Contract binding: [SMC-M03-contract-binding.md](SMC-M03-contract-binding.md). State: [SMC-M03-state.json](SMC-M03-state.json). Coordination mirror: [docs/coordination/SMC-M03](../coordination/SMC-M03/README.md).

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**Checkpoint, 2026-10-01, attempt 1: S0 (bind) is done. S1 (readers first) is next. Nothing is merged, released or deployed.**

| Readiness | State |
|---|---|
| Source-ready | No: S0 is documents only. S1–S7 are planned (plan §4) |
| Merge-ready | No |
| Release-ready | No: every hosted step is a Codex operation with Davide's bound approval (plan §5) |
| Hosted-verified | No. This attempt touches no hosted state |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `ba983e7` (merge of #23; #29 merged at `41ac3e7`, then #28 and #23) |
| Luis's work included | #24 (`studio/side-chat`) merged at `19a41e0` in `da7660e`, as Davide asked ("targets also Luis's latest changes"). #30 is not included yet (§5) |
| Branch | `claude/smc-m03-research` |
| Implementation PR | recorded here once opened (draft, base `main`) |
| Implementer | Claude Code, session `https://claude.ai/code/session_018hCUhiK4hgMf5V5QPbkC9S` |
| Operator | Codex, woken by Davide on #31 |
| Toolchain on this host | linux-x64, Node 24.21.0 (tarball checksum verified), pnpm 11.7.0; `pnpm install --frozen-lockfile` exit 0 at `da7660e` |
| Harness | dsh `0.2.0-rc.2` at `639ed01` (unit `sophia-runtime-m02-dev`, cut over by OP-0003) |
| Hosted gate | M02 OP-0003 complete and verified ([CX-0015](https://github.com/davidelaverga/Sophia/pull/29#issuecomment-5921358520)) |

## 2. Goals

| Goal | Slices (plan §4) | State |
|---|---|---|
| G1 Source access | S0, S1, S3 | S0 done; S1 next |
| G2 Durable Markdown | S2, S4 | planned |
| G3 PDF | S5a (renderer host, Codex probe), S5b | planned; the host depends on CC-0001 and D6 |
| G4 Voice and text | S6 | planned |
| G5 Mission loop and release | S7 | planned |

## 3. Owner decisions

All recorded in plan §8. D1–D10 decided on 2026-09-30, with D1 raised to **$5 per task** and $40 for qualification, and D3 set to `main`. L6, U3 and U4 approved on 2026-10-01. L1–L5 and U1 are proposed for Luis's review.

## 4. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M03-OP-0001 | read only | [CC-0001](../coordination/SMC-M03/SMC-M03-CC-0001.md) ([posted](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5921937526)) | awaiting Codex. Wake line: `SMC-M03: read SMC-M03-CC-0001 on #31 and act within its scope.` |

No hosted effect, deployment, migration, paid call or credential use happened in this attempt.

## 5. Luis's open work

- **#24** is merged into this branch. The delivery UI builds on its `SidePanel`.
- **#30** conflicts with #23's review fixes on `main` (`App.tsx`, `route.ts`, `route.test.ts`, `CONTRIBUTING.md`, and `ProjectHome.tsx` deleted vs changed). Those resolutions are Luis's. This branch merges #30 once Luis updates it on `main`. It owns `0021` and `A10`; M03 starts at `0022` and `A11`.
- The cross-project Knowledge library (L6) lands in #30's Work place after that merge.
