# SMC-M02 progress: qualified dsh upgrade and native preset binding

The mission: [M02](../missions/2026-09-27-companion-research/missions/M02_DSH_UPGRADE.md), pack v1.1. Coordination: issue [#26](https://github.com/davidelaverga/Sophia/issues/26). Implementation PR: draft, recorded here once opened. G1 target spec: [SMC-M02-G1-target-spec.md](SMC-M02-G1-target-spec.md) (moved byte-for-byte, sha256 `7b73f490…37ac`). Contract binding: [SMC-M02-contract-binding.md](SMC-M02-contract-binding.md).

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**State on 2026-09-30, attempt 1: G1 recorded. The target (D1) awaits Davide.**

| Readiness | State |
|---|---|
| Source-ready | No: G1 records only |
| Merge-ready | No |
| Release-ready | No |
| Hosted-verified | No. Nothing hosted is touched by this PR |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `acfa34838b36d89c97f3802548a35a93f33e1e93` (merge of #25), verified by `git fetch` on 2026-09-30 |
| Branch | `claude/smc-m02-dsh-upgrade`, created from that base as the owner instructed |
| Implementer | Claude Code, session `https://claude.ai/code/session_01SBw4oD6egaNmMg9wXgn9sB` |
| Toolchain on this host | linux-x64, Node 24.21.0 (tarball sha256 `fd8e59d5…b6` = the recorded value), pnpm 11.7.0 |
| Current (rollback) unit | `sophia-runtime-s1-03-dev`, dsh `0.1.7-rc.1` = `46a7f68b` |
| Proposed target | `dsh-v0.2.0-rc.2` = `639ed015397290b3745d163aafe02ffee4aa3f84`; fallback `dsh-v0.2.0-rc.1` = `4878cdabd87d4041bdaff61d04c966883b9fd07a` |

## 2. G1 re-verification of the target spec

Every fact below was re-observed in this session from public sources, before relying on the spec.

| Spec fact | Observed | Result |
|---|---|---|
| `6a6f350` absent from 0.1.7-rc.2, present in both 0.2.0 tags | `git merge-base --is-ancestor`: rc.1 no, 0.1.7-rc.2 no, 0.2.0-rc.1 yes, 0.2.0-rc.2 yes. `21638c5` (C) likewise only in the 0.2.0 tags | matches |
| Shipped tarballs | `npm pack @deepseek-ai/dsh-agent-loop` and `dsh-session`: `ToolCallRecovery` in 0 files at 0.1.7-rc.1/rc.2, in `dsh-agent-loop/lib` (1 file) and `dsh-session/lib` (5 files) at both 0.2.0 releases | matches |
| Commit distances | A→B 346, B→D 261, D→E 187, A→E 794; upstream `master` = `639ed015` | matches |
| npm integrities | `dsh` and `dsh-base` at 0.2.0-rc.2 and 0.2.0-rc.1 equal the spec's four values; 0.1.7-rc.1's equal `config/runtime-unit.json` | matches |
| Dist-tags | `dsh` `latest` = `next` = `0.2.0-rc.2`; `dsh-base` `latest` = `0.0.1-rc.1` | matches: never install by dist-tag |
| All 7 patch targets exist | `session-log-deepseek`, `plugin-package-inventory-deepseek`, `session-telemetry-otel`, `hmr`, `session-title-llm`, `llm-pi-ai`, `agent-default-model` present in the parsed base patch of all four releases | matches |
| New base rows | A→E added exactly `llm-deepseek-account` (since 0.1.7-rc.2) and `otel` (since 0.2.0-rc.1); none removed | matches |
| Changed base rows | `session-telemetry-otel` (adds `maxRequestBytes`, new default endpoint), `llm-deepseek` (package now `@deepseek-ai/dsh-llm-deepseek-api-key`) | matches |
| pi-ai | `dsh-llm-pi-ai` depends on `^0.85.1` at A and D, `^0.87.1` at E. pi-ai 0.87.1's `openai.json` ships `gpt-6-luna` with `compat`, `cost`, `inputLimits`, `thinkingLevelMap`; 0.85.1 ships none | matches |

**Discrepancies and additions:**
- The recovery error codes `TOOL_OUTCOME_UNKNOWN` and `TOOL_NOT_STARTED` already exist in the 0.1.7 tarballs, which use them on the abort path. A text grep for those codes therefore does not tell A from E. Only `ToolCallRecovery` and a behavioral test (T10) do.
- dsh-base composes no `agent-preset-registry` row at A or E, so there is no `ctx.agentPresets` in `sophia-runtime` today (binding §4). This does not change G1; it sizes G3.
- The spec lists as unknown whether `live-steer` skips without a model key. Its integration test needs none: it exercises the no-credential refusal and a keyless rehearsal against the mock model, and it passed in the baseline.

## 3. Baseline A (`acfa348`, this host)

| Check | Result |
|---|---|
| `pnpm check` | exit 0: toolchain, format, lint, build, typecheck, contracts; 333/333 unit; `pnpm artifacts` reproduced every identity of `sophia-runtime-s1-03-dev`; 51/51 integration (runtime-service skipped without a database) |
| `runtime-service.test.mjs` on PostgreSQL 16.13 | 5/5 (a local disposable cluster; no Docker on this host) |
| `pnpm test:sql` | 20 migrations and the SQL test pass |
| `pnpm test:db` | 198/198 |

## 4. Goals

| Goal | State | Evidence |
|---|---|---|
| G1 Exact delta and target | recorded; D1 pending | §2, target spec, binding |
| G2 Parity adapter | not started | |
| G3 Preset identity | not started | |
| G4 Recovery and rollback | not started | |
| G5 Exact cutover | out of scope for this PR | |

## 5. Owner decisions

| Id | Question | State |
|---|---|---|
| D1 | E as the target, D as the fallback | pending |
| D2 | Accept or pin each request-shape difference on the gpt-6-luna route | pending the R1 report |
| D3 | Disable `llm-deepseek-account` | pending |

## 6. Operations

None. No Codex operation is requested yet.
