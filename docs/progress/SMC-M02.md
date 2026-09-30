# SMC-M02 progress: qualified dsh upgrade and native preset binding

The mission: [M02](../missions/2026-09-27-companion-research/missions/M02_DSH_UPGRADE.md), pack v1.1. Coordination: issue [#26](https://github.com/davidelaverga/Sophia/issues/26). Implementation PR: [#27](https://github.com/davidelaverga/Sophia/pull/27) (draft). G1 target spec: [SMC-M02-G1-target-spec.md](SMC-M02-G1-target-spec.md), moved byte-for-byte (sha256 `7b73f490…37ac`). Contract binding: [SMC-M02-contract-binding.md](SMC-M02-contract-binding.md), with implementation notes in §6. Handoff: [SMC-M02-attempt-1](../handoffs/SMC-M02-attempt-1.md).

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**Checkpoint, 2026-09-30, attempt 1 (updated with CX-0002 at 18:30 UTC): G1, G2 and G3 are implemented and tested on linux-x64, and G4 is partly done (T10, T12/T13). Nothing is merged, released or deployed. D1–D3 await Davide.**

| Readiness | State |
|---|---|
| Source-ready | Yes, for review: PR #27, the code at `f0bdaa8`; `pnpm check` exit 0 locally (§3). CI runs on each pushed head |
| Merge-ready | No: D1–D3, review, CI, and M01's merge order (the pack's default is M01 → M02) |
| Release-ready | No: the G5 cutover plan, the preflight and the live route |
| Hosted-verified | No. This PR touches no hosted state |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `acfa34838b36d89c97f3802548a35a93f33e1e93` (merge of #25), verified by `git fetch` on 2026-09-30 |
| Branch | `claude/smc-m02-dsh-upgrade`, created from that base as the owner instructed |
| Commits | `ee7c08a` G1 docs · `bd9f493` G2 unit and gate · `81a2a81` R1 · `ca73057` T10, T12/T13 · `f0bdaa8` G3 · `75c0ca5` evidence re-captured on G3 · then docs (this checkpoint, the handoff, coordination) |
| Implementer | Claude Code, session `https://claude.ai/code/session_01SBw4oD6egaNmMg9wXgn9sB` |
| Toolchain on this host | linux-x64, Node 24.21.0 (tarball sha256 `fd8e59d5…b6` = the recorded value), pnpm 11.7.0 |
| Rollback unit | `sophia-runtime-s1-03-dev`: dsh `0.1.7-rc.1` = `46a7f68b`, runtime `…0b6991d1…7771`, bundle `391c89ce…f4b1`, rebuilt from `acfa348` |
| Candidate unit | `sophia-runtime-m02-dev`: dsh `0.2.0-rc.2` = `639ed015397290b3745d163aafe02ffee4aa3f84` |
| Release integrities | `@deepseek-ai/dsh` `sha512-EAJ3gPNc…IdA==`; `@deepseek-ai/dsh-base` `sha512-AclHClef…1ug==` (registry values = lock = spec) |
| Runtime artifact, linux-x64 | `sophia-tree-v2:sha256:4552d08f78b47b7d0f16e79a92c487cffdfc5bb0a05eaef867c89ba837479a12`, 27747 entries |
| Bundle archive | sha256 `4c69b9c11ff39cc7664a7f6e7bda55659f2646864d190b945f85b96634914d60` |
| Workspace lock | sha256 `cd1f953c30f8e734bf0207f40098853b4327d191d5b63df671700552119e968e` |
| darwin-arm64 | Recorded from [SMC-M02-CX-0002](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5917094857) (Codex, Apple silicon, Node 24.21.0, pnpm 11.7.0, `pnpm artifacts:record` at `f0bdaa8`, exit 0): runtime `sophia-tree-v2:sha256:e24cb887c7a710069c2f2ac1dfa681611c25f129e39b990b09ce378aa133374c` (28427 entries); bundle archive sha256 `f5d8c66b707923ab3f97c881bdd08de78d2b67c5f986e9a1273274c654da9a49`; profile lock `7983da32…0b6a`. Claude derived that lock here from the linux lock by the archive integrity, and it matches byte for byte. The bundle and runtime sources are unchanged since `f0bdaa8` |
| Model route | openai / gpt-6-luna / high, `OPENAI_API_KEY`, `live_verified: false`: **unchanged**, plus `compat.supportsStrictMode: false` (R1) |
| Upstream release vs source | `pnpm dsh:source --verify-release`: 278 packages, 897 files byte-identical, 0 differing ([evidence](../evidence/SMC-M02/dsh-source-release.json)) |

## 2. G1 re-verification of the target spec

Every fact below was re-observed in this session from public sources, before relying on the spec.

| Spec fact | Observed | Result |
|---|---|---|
| `6a6f350` absent from 0.1.7-rc.2, present in both 0.2.0 tags | `git merge-base --is-ancestor`: rc.1 no, 0.1.7-rc.2 no, 0.2.0-rc.1 yes, 0.2.0-rc.2 yes. `21638c5` (C) likewise only in the 0.2.0 tags | matches |
| Shipped tarballs | `npm pack @deepseek-ai/dsh-agent-loop` and `dsh-session`: `ToolCallRecovery` in 0 files at 0.1.7-rc.1/rc.2, in `dsh-agent-loop/lib` (1 file) and `dsh-session/lib` (5 files) at both 0.2.0 releases | matches |
| Commit distances | A→B 346, B→D 261, D→E 187, A→E 794; upstream `master` = `639ed015` | matches |
| npm integrities | `dsh` and `dsh-base` at 0.2.0-rc.2 and 0.2.0-rc.1 equal the spec's four values; 0.1.7-rc.1's equal the previous unit's | matches |
| Dist-tags | `dsh` `latest` = `next` = `0.2.0-rc.2`; `dsh-base` `latest` = `0.0.1-rc.1` | matches: never install by dist-tag |
| All 7 patch targets exist | present in the parsed base patch of all four releases | matches |
| New base rows | A→E added exactly `llm-deepseek-account` (since 0.1.7-rc.2) and `otel` (since 0.2.0-rc.1); none removed | matches |
| Changed base rows | `session-telemetry-otel` (`maxRequestBytes`, new default endpoint), `llm-deepseek` (package now `@deepseek-ai/dsh-llm-deepseek-api-key`) | matches |
| pi-ai | `dsh-llm-pi-ai` depends on `^0.85.1` at A and D, `^0.87.1` at E; 0.87.1's `openai.json` ships `gpt-6-luna` with `compat`, `cost`, `inputLimits`, `thinkingLevelMap` | matches |

**Discrepancies and additions (no conflict with M02):**
- `TOOL_OUTCOME_UNKNOWN` and `TOOL_NOT_STARTED` already exist in the 0.1.7 tarballs (the abort path), so a grep for them cannot tell A from E. Only `ToolCallRecovery` and the behavioral test can.
- dsh-base composes no `agent-preset-registry`. G3 composes it in the Sophia bundle (binding §4, §6).
- Of the Responses compat switches, dsh lets a route set only 4 of 9. Grammar tools, additional tools, tool search, explicit prompt-cache mode and mid-conversation system messages follow the catalog. R1 therefore had to measure them rather than pin them (§4).
- The spec leaves open whether `live-steer` skips without a key. Its integration test needs no key: it covers the no-credential refusal and a keyless rehearsal.
- **Branch.** Work is on `claude/smc-m02-dsh-upgrade`, as the owner instructed, not on the session's default branch.

## 3. Checks

| Check | Baseline A (`acfa348`) | Candidate (G3, `f0bdaa8`) |
|---|---|---|
| `pnpm check` | exit 0: 333 unit; artifacts reproduced; 51 integration | exit 0: 337 unit; artifacts reproduced (`sophia-runtime-m02-dev`); 68 integration, plus 2 env-gated log-compat cases skipped |
| `runtime-service` on PostgreSQL 16.13 | 5/5 | 5/5 (within `pnpm check`, with `SOPHIA_DISPOSABLE_DATABASE_URL`) |
| `pnpm test:sql` | 20 migrations pass | 20 migrations pass (run at `ca73057`; G3 changes no SQL) |
| `pnpm test:db` | 198/198 | 198/198 (run at `ca73057`; G3 changes no SQL) |
| `pnpm test:livekit` | not run: no LiveKit server here | not run; M02 changes no media code. CI's `room-media` job runs it |

The PostgreSQL is a disposable local cluster; this container has no Docker.

## 4. Acceptance cases

| ID | Case | Source evidence | State |
|---|---|---|---|
| M02-T01 | Frozen build reproduces identities | `pnpm artifacts` in `pnpm check` and CI's `runtime-unit`; release vs source verified; Codex's Mac `artifacts:record` (CX-0002) | **observed on linux-x64** (reproduced); darwin-arm64 **recorded once by Codex**, a second Mac run not yet made |
| M02-T02 | Missing or renamed target, wrong config, unknown or broadened preset fail readiness | `profile-gate.test.mjs` 20/20: <br>• unreviewed or renamed dsh-base row; <br>• dropped `otel` or `llm-deepseek-account` disable; <br>• dropped compat pin; <br>• unknown or broadened preset; <br>• the S1-01 cases. <br>`gate-parse.test.mjs` for each finding | **observed** |
| M02-T03 | No hidden telemetry, credentials, global web, HMR or title call | 7 required disables; the reviewed base rows; the sanitized launch env; roles hide and deny web tools | **observed** for composition; no network capture of a live boot |
| R1 | Request-shape parity | [request-shape](../evidence/SMC-M02/request-shape/README.md): one route difference (`strict: false` on every tool), neutralized by `supportsStrictMode: false`; 3/3 requests then equal the previous unit's shape | **observed**. Residual differences (user-agent version, dsh-authored prompt and tool text) are **for D2** |
| M02-T10 | Failed step with pending tools | [tool-recovery](../evidence/SMC-M02/tool-recovery/README.md): passes on E, fails on A (c2 and c3 unpaired in A's durable log) | **observed** on the installed unit: committed result kept, `TOOL_NOT_STARTED`, original failure, paired history. `TOOL_OUTCOME_UNKNOWN` (`@internal` phases only): **observed in upstream's own tests** at `639ed015` (CX-0002: failure quiescence 6/6, `repair.spec.ts` 32/32), not black-box on the installed unit |
| M02-T12 | Copied old logs and journals tested | [log-compat](../evidence/SMC-M02/log-compat/README.md): A→E healthy logs resume, with the identity migrated from recorded evidence; A's failed-step log refused explicitly | **observed** |
| M02-T13 | Downgrade read or explicit refusal | E→A: A reads E's logs and journals in both episodes, before and after G3 | **observed** on disposable copies |
| M02-T08 | Preset and provider identity restore; no silent default | `presets.test.mjs` 6/6: <br>• identity recorded before create; <br>• resume keeps the route despite a new default; <br>• changed preset → held, then resumes when restored; <br>• missing preset → held, and a new create is refused; <br>• the synthetic preset is mounted and joined on create and resume; <br>• a legacy journal migrates only on its own recorded route | **observed** |
| M02-T14 | M01 and voice continuity | All existing suites pass (§3); no M01 file is changed | **observed** locally; CI pending |
| M02-T04–T07, T09, T11, T15 | Control, recovery and cutover | The existing bridge, recovery, roles and supervisor suites pass unchanged on E | **pending as M02 cases**; none is claimed |

## 5. Goals

| Goal | State | Evidence |
|---|---|---|
| G1 Exact delta and target | done; D1 pending | §2, target spec, binding |
| G2 Parity adapter | source done | `bd9f493`, `81a2a81`; §4 T01–T03, R1 |
| G3 Preset identity | source done | `f0bdaa8`; §4 T02, T08; binding §6 |
| G4 Recovery and rollback | partial: T10 (without the unknown-outcome branch), T12, T13 | `ca73057`; lease settlement and a restore rehearsal are not started |
| G5 Exact cutover | not started; out of scope for this PR | the preflight should count sessions with unpaired failed steps (log-compat README) |

## 6. Owner decisions

| Id | Question | Recommendation | State |
|---|---|---|---|
| D1 | E as the target, D as the fallback | E: R1 neutralized, T10 passes, gate green | pending |
| D2 | Accept or pin each request difference on the gpt-6-luna route | `strict` is pinned. Accept the remaining user-agent version and dsh-authored text: no route setting reaches them, and D carries them too | pending |
| D3 | Disable `llm-deepseek-account` | disable (done in the candidate; the gate requires it) | pending |

## 7. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M02-OP-0001 | read and test only | [CC-0001](../coordination/SMC-M02/SMC-M02-CC-0001.md) ([posted](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5916177646)) | **answered** by [CX-0001](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5916920339) (prepared) and [SMC-M02-CX-0002](https://github.com/davidelaverga/Sophia/issues/26#issuecomment-5917094857) (result), checked by Claude against CC-0001: every asked test was run with its command and exit 0, and the darwin identities were recorded. The only deviation from CC-0001 is that the tests ran on Darwin arm64, not linux. About 9 minutes; 0 provider calls, 0 production reads, 0 commits. No effect |

No hosted effect, deployment, migration, paid call or credential use happened in this attempt.

## 8. Next action

1. Davide decides D1–D3 on #27.
2. Watch CI on #27 and fix anything red.
3. After M01 merges, merge `main` into this branch and re-run `pnpm check`.
4. Then G4's remainder (lease settlement, a restore rehearsal on a disposable home) and a G5 request, under a separate approval.
