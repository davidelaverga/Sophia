---
id: SMC-M02-G1-target-spec
mission: SMC-M02 (qualified dsh upgrade and native preset binding)
pack: docs/missions/2026-09-27-companion-research/ (v1.1)
version: 1.0
date: 2026-09-30
status: proposed — target selection awaits Davide's confirmation (D1 below)
author: Claude (claude.ai research session, read-only repository access)
repository: davidelaverga/Sophia
observed_main: acfa34838b36d89c97f3802548a35a93f33e1e93
intended_path: docs/progress/SMC-M02-G1-target-spec.md
---

# SMC-M02 — G1 target refresh: qualify `dsh-v0.2.0-rc.2`

## 0. Decision in one paragraph

Qualify **`dsh-v0.2.0-rc.2`** (`639ed015397290b3745d163aafe02ffee4aa3f84`) as the single M02 runtime candidate. Use **`dsh-v0.2.0-rc.1`** as the fallback. Keep **`dsh-v0.1.7-rc.1`** (the current pin, unit `sophia-runtime-s1-03-dev`) as the preserved rollback unit.

The pack's own candidate rule leads here. M02 §2 says to choose 0.1.7-rc.2 unless it fails a required recovery case "fixed by C or a later exact release", and in that case to qualify that coherent unit. Both the shipped npm tarballs and git ancestry show that the failed-step recovery fix (`6a6f350`) is absent from 0.1.7-rc.2 and present in both 0.2.0 releases. Those releases also contain candidate C (`21638c5`), and they are published to npm. That removes the need for the upstream source build that was blocked in S1-01.

This spec does not change M02's scope, authority, model route or acceptance. It records the G1 selection with its evidence, the risks the qualification must close, and the bounded work for the first M02 PR.

## 1. Authority and precedence

- [M02_DSH_UPGRADE.md](../missions/2026-09-27-companion-research/missions/M02_DSH_UPGRADE.md) remains the mission specification. Where this spec is more specific about the target, file changes or tests, it refines M02 inside M02's stated candidate policy. Where they conflict, M02 wins and the conflict is reported.
- `AGENTS.md`, `CLAUDE.md` and [CONTRIBUTING.md](../../CONTRIBUTING.md) govern implementation.
- **No change to:**
  - the model route (openai / gpt-6-luna / high, `OPENAI_API_KEY`);
  - the payer;
  - Google, LiveKit or React versions;
  - hosted state.
- Davide retains the target decision (D1) and every merge and release decision. Hosted cutover (M02-G5) is a Codex operation under a bounded approval and is out of scope for this PR.

## 2. Observed starting state (2026-09-30)

| Item | Value | How observed |
|---|---|---|
| `main` | `acfa348` (merge of PR #25). M01 is merged. There is no SMC-M02 progress record | `git ls-remote`, clone |
| Current pin | `dsh-v0.1.7-rc.1` = `46a7f68b0922371ce7144b668b90e377d8e799f4`; pi-ai `0.85.1` in `pnpm-lock.yaml` | `config/runtime-unit.json`, lock |
| Runtime unit | `sophia-runtime-s1-03-dev`, `built_not_ready`; route `live_verified: false` | `config/runtime-unit.json` |
| Hosted runtime | `docs/progress/SMC-M01.md` records the runtime service at `0391bc6`. **Not re-verified here** | repository record only |
| Baseline A on linux-x64 (Node 24.21.0, pnpm 11.7.0) | `pnpm toolchain:check`, `build` and `typecheck` pass. `pnpm artifacts` reproduces every recorded identity. `pnpm test`: 333/333 pass. Integration files `profile-gate`, `bridge`, `roles`, `recovery`, `supervisor` and `live-steer` exit 0. `runtime-service` was **not run** (needs PostgreSQL). It is **unknown** whether `live-steer` skips without a model key | local run |

## 3. Candidate refresh

| ID | Source | npm `@deepseek-ai/dsh` published | Ships the failed-step fix? | pi-ai | Verdict |
|---|---|---|---|---|---|
| A | `dsh-v0.1.7-rc.1` `46a7f68b` | 2026-09-23 | No | ^0.85.1 | Current pin. Preserved rollback unit |
| B | `dsh-v0.1.7-rc.2` `477b4f42` | 2026-09-24 | **No** (`6a6f350` is not an ancestor; the tarball has no `ToolCallRecovery`) | ^0.85.1 | Rejected: fails M02-T10 by construction |
| C | `master` `21638c56` (not a release) | — | Yes (source) | — | Superseded. It is an ancestor of both 0.2.0 tags. A source build is no longer needed |
| D | `dsh-v0.2.0-rc.1` `4878cdab` | 2026-09-28 | **Yes** (the tarball `lib` contains `ToolCallRecovery` and the recovery error text) | ^0.85.1 | **Fallback** |
| E | `dsh-v0.2.0-rc.2` `639ed015` | 2026-09-29 | **Yes** (same check) | ^0.87.1 | **Selected target** |

Commit distance: A→B 346, B→D 261, D→E 187; A→E 794 in total. On 2026-09-30, upstream `master` equals E, and npm dist-tags `latest` and `next` for `@deepseek-ai/dsh` both point to `0.2.0-rc.2`.

**Pin exact versions only.** The `@deepseek-ai/dsh-base` dist-tag `latest` is `0.0.1-rc.1`, so a dist-tag install would silently pick an unrelated base.

Registry integrity (verify again at install; the frozen lock is the authority):

| Package | Integrity |
|---|---|
| `@deepseek-ai/dsh@0.2.0-rc.2` | `sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==` |
| `@deepseek-ai/dsh-base@0.2.0-rc.2` | `sha512-AclHClefnPmUe2qoPrKMUvauA/KelYevYlxFdHLZGcPRqrDH+D21HyrwJmj4f7Iu5OO0IqfjB4zBOkwMp5h1ug==` |
| `@deepseek-ai/dsh@0.2.0-rc.1` (fallback) | `sha512-F6hKNVoGgBDIzSiyRaIlobq4UD6cwxUjh+nwXqcDmufDh87TE1izsYzs8L5cZNpF2JmPnFM1mXRNnRJ0cs43ng==` |
| `@deepseek-ai/dsh-base@0.2.0-rc.1` (fallback) | `sha512-5knjWdy+/lFOcwjuliaK4Pc+xPfDXMOoN/+CCza5JkQG5JI+GajicpAh7XFH/At6WzWjf9m8OwLGYABVz1pIxA==` |

The bundle's peer packages all exist at `0.2.0-rc.2` and declare `@deepseek-ai/cordis ~4.0.4`. They are: `dsh-agent`, `dsh-agent-default-model`, `dsh-brand`, `dsh-llm`, `dsh-session` and `dsh-tools`.

### Freeze rule

E is frozen for this PR. Upstream released two tags in two days. A later tag (0.2.0-rc.3 or newer) is considered only if it fixes a blocker this qualification actually demonstrates. It is never adopted because it is newer, and never by following a floating branch or dist-tag.

## 4. Delta evidence: A → E on the surfaces Sophia uses

| Surface | Result | Evidence |
|---|---|---|
| `@deepseek-ai/dsh-agent` (`ctx.agents` create/resume/get/list/isOwnedBy/currentInitiator) | `packages/core/agent/src` is **identical** | `diff -r` of the tag checkouts |
| `@deepseek-ai/cordis` | 4.0.4 in both | `vendor/cordis/package.json` |
| Session log format | `SESSION_FORMAT_VERSION = 4` in A, B and E. The 14 `SessionEventMap` types are unchanged | `packages/core/session/src` |
| `dsh-session` | Adds `ToolCallRecovery` and `Session.toolHistory()` (a projection derived from existing `request/header` and developer events). Its `repair.ts` changes | source diff |
| `dsh-tools` | `PreToolDecision.ask` gains an optional `displayReason`. This is additive; Sophia's `ToolGuard` use is unaffected | source diff |
| `dsh-agent-default-model` | `saveSelection` now serializes saves. `currentSelection()` is unchanged | source diff |
| `agent-preset-registry` | `modeSelectionEnabled` is removed; `defaultId = selectedDefault ?? default`. Sophia does not set it. G3 must use `mount`/`select` as documented at E | source diff |
| dsh-base patch rows | All 7 Sophia targets exist at E: `session-log-deepseek`, `plugin-package-inventory-deepseek`, `session-telemetry-otel`, `hmr`, `session-title-llm`, `llm-pi-ai`, `agent-default-model`. None was removed or renamed | parsed `packages/bundle/base/cordis.patch.yml` |
| New base rows | `llm-deepseek-account` (since B) and **`otel`** (`@deepseek-ai/dsh-otel`, since D). Also, `llm-deepseek` now names the package `@deepseek-ai/dsh-llm-deepseek-api-key` | same |
| Changed base rows | `session-telemetry-otel` gains `maxRequestBytes`, and its default endpoint changes. Sophia disables this row | same |

Release notes (GitHub, immutable releases) that matter to Sophia:

- **D:** fixes conversations that could not continue after a tool-scheduling failure, and tells the agent to verify side effects before retrying an unknown-outcome operation. Automation tasks move to an optional plugin bundle. DeepSeek-account models can search the web without an extra key.
- **E:** updates the model catalog and compatibility layer to pi-ai 0.87.1, removing some old model IDs. Adds an experimental asynchronous question mode that is off unless configured.
- Everything else is Desktop or Web UI and does not load in `sophia-runtime`. The composition gate must confirm this.

## 5. Risks the qualification must close

### R1 — pi-ai 0.87.1 changes the live route's resolved model (highest risk)

pi-ai 0.85.1 ships no `gpt-6-luna` under `openai`. That is why the Sophia patch declares it in the route's `models` list. pi-ai 0.87.1 does ship `openai/gpt-6-luna`, and dsh's materializer (`packages/llm/llm-pi-ai/src/catalog.ts`, `resolveEntry`) **spreads the installed catalog entry under each configured entry**.

At E, the resolved model therefore inherits fields it never had at A:
- `compat`: `supportsStrictMode`, `supportsOpenAIGrammarTools`, `supportsAdditionalTools`, `supportsToolSearch`, `supportsMidConvoSystemMessages`, `supportsExplicitPromptCacheMode`;
- a non-zero `cost`;
- `inputLimits`: `maxRequestBytes` 536870912, and images at most 1500 per request with resize limits;
- `thinkingLevelMap`.

`contextWindow` (272000), `maxTokens` (128000) and `input` are numerically unchanged. Provider, model, effort and credential are unchanged.

**Required:** a deterministic request-shape parity test.
1. Build the same fixture turn: system, user, one declared tool, `reasoningEffort: high`.
2. Send it to a local stub of the OpenAI Responses endpoint under A and under E. Use a disposable test composition that points the openai route's `baseURL` at the stub, with a dummy key.
3. Diff the captured request bodies and headers.
4. Explain every difference. Pay particular attention to tool `strict`, prompt-cache parameters, `max_output_tokens` and `reasoning`.
5. For each difference, either accept it through D2 or neutralize it by stating the value explicitly in the Sophia `models` entry (`modelOverrides` is refused beside `models`).

The production patch must not gain a `baseURL`. If a neutral shape cannot be reached cleanly, fall back to D, which keeps pi-ai 0.85.1, and record why. Live acceptance of the route stays pending as it is today (`live_verified: false`).

### R2 — new telemetry and credential surfaces

- **`otel`:** its README says mounting it creates no transport and sends nothing. At E the only base consumer is `session-telemetry-otel`, which Sophia disables. Disable `otel` anyway, as defense in depth under M02 §5.3.
- **`llm-deepseek-account`:** this is account-login and model machinery Sophia does not use. Disable it unless the gate shows a dependency.
- Add both rows to `REQUIRED_DISABLED` in `scripts/lib/gate.mjs`, with unit and integration coverage.
- Add a reviewed base-row inventory so that any unreviewed added or renamed dsh-base row fails the gate at the next upgrade. The proposed shape is a committed file such as `config/dsh/base-rows.reviewed.json`, holding id and package name and checked by the gate against the installed base; an equivalent existing mechanism is fine. Silent new rows are how an egress path would appear.
- Update the patch's stale comments: the pin in the header, and "pi-ai 0.85.1 at the pin predates gpt-6-luna".

### R3 — the recovery claim must be behavioral, not textual

Evidence so far is static: release notes, ancestry, and grepping the shipped tarballs. M02-T10 needs a test against the **installed unit**:
1. An assistant step with pending tool calls fails.
2. The history stays validly paired.
3. Committed results are preserved.
4. Unknown outcomes are recorded as `TOOL_OUTCOME_UNKNOWN` and never-started calls as `TOOL_NOT_STARTED`.
5. The original failure is retained, not reported as success.

Run the same case on A, where it is expected to fail or show unpaired history, and on E, where it is expected to pass. Use only public APIs or a test-only fixture adapter or plugin in a disposable composition. **Never** splice upstream loop files into Sophia. If no faithful black-box case can be built without private internals, record that. Then request, through Codex, a run of upstream's focused tests (`packages/core/agent-loop/tests/tool-calls.spec.ts` at `639ed015`) against the published package contents, and keep T10 open with that stated limit.

### R4 — downgrade and read compatibility (M02-T13)

The format stays V4, and the core event map is unchanged. Readers refuse unrecognized *required* events rather than dropping them, so the expected worst case is an explicit refusal, which is safe to hold. Prove it anyway:
- copy logs and journals written by E into a disposable home;
- open them with A;
- record whether A reads them or refuses them explicitly.

Neither A nor E may ever write to the same `DSH_HOME` concurrently.

### R5 — per-platform identities

`config/runtime-unit.json` records linux-x64 (canonical) and darwin-arm64. A host records only its own platform. Do not leave the other platform's identity stale or guessed:
- record linux-x64 through the Linux CI output or a Codex run;
- record darwin-arm64 on a Mac;
- or mark that platform's identity pending until it is recorded.

### R6 — hosted state

Nothing in this PR touches the hosted runtime. Cutover follows M02 §8: pause admission, drain or hold, settle the old writer, transfer the lease, then smoke-test. It is a later Codex operation under an explicit approval.

## 6. Selection and fallback tree

1. E installs frozen, the gate is green, R1 is neutral or accepted by D2, T10 passes on E → **E**.
2. R1 cannot be neutralized, or E regresses a required case that D does not → **D**, re-running the same suite, with the reason recorded.
3. T10 fails on both D and E, or neither reproduces → **no upgrade**. Return a bounded blocker, keep A, and relabel nothing.

## 7. Work plan for the first M02 PR (G1 and G2; G3 if time allows)

Branch `claude/smc-m02-dsh-upgrade` from refreshed `main`. Commit in reviewable steps.

**C1 — G1 records (docs only)**
- Commit this spec at `docs/progress/SMC-M02-G1-target-spec.md`.
- Create `docs/progress/SMC-M02.md`, modeled on `SMC-M01.md`, with a readiness table, identities, and observed versus pending evidence.
- Create `docs/progress/SMC-M02-contract-binding.md`, as `shared/CONTRACT_BINDINGS.md` requires at G1.
- Reserve file ownership per `shared/FILE_CHANGE_MAP.md`.
- Open the SMC-M02 coordination issue through the approved repository connection and record its real number. Do not invent IDs.

**C2 — G2 runtime unit**
- `runtime/dsh/package.json`: set `@deepseek-ai/dsh` to `0.2.0-rc.2` and update the description.
- `packages/dsh-bundle/package.json`: set every `@deepseek-ai/dsh-*` peer and dev dependency to `0.2.0-rc.2`. Cordis stays `4.0.4`.
- `pnpm-lock.yaml`, `config/dsh/profile/pnpm-lock.yaml` and `config/dsh/profile/pnpm-lock.darwin-arm64.yaml`: regenerate these deliberately in this reviewed commit. The only intended change is the dsh closure. Explain any other resolved change.
- `packages/dsh-bundle/cordis.patch.yml`: disable `otel` and `llm-deepseek-account`, update the comments, and apply any R1 pinning.
- `scripts/lib/gate.mjs` and tests: extend `REQUIRED_DISABLED` and add the reviewed-row inventory check.
- `config/runtime-unit.json`: assign a new unit id (for example `sophia-runtime-m02-dev`) that records `previous_unit`, and update tag, commit, package version and release integrity. Resolve `source_build` for the npm release path. Leave the route `live_verified: false`. Then run `pnpm artifacts:record` (R5).
- `docs/SOURCE_MAP.md` and `docs/RUNTIME_UNIT.md`: add the new upstream files relied on. Run `pnpm dsh:source --verify-release` against `639ed015`.
- `sophia-brief-v1` and every existing role stay registered.

**C3 — R1 request-shape parity test**, with its evidence written to `docs/evidence/` (path-normalized, no credentials).

**C4 — M02-T10 recovery test**, plus the R4 copied-log check.

**C5 — G3, only after C1–C4 are green**
- Mount presets on create and resume through the public `agentPresets` registry.
- Add a strict synthetic, inert preset used only in test composition.
- Persist the resolved preset, prompt, skill and guard identity together with the provider, model and effort envelope.
- An incompatible or missing identity produces an explicit held state and never falls back to a default.
- No production capability text mentions research.

**C6 — handoff**
- Write `docs/handoffs/SMC-M02-attempt-1.md` using `docs/pack/templates/SESSION_HANDOFF.md`.
- Update `docs/DESTINATION_MAP.md` if the PR creates any path listed there.
- Refresh the progress record.

## 8. Acceptance for this PR

| ID | Case | Expected at PR open |
|---|---|---|
| M02-T01 | Frozen build reproduces the unit's identities | Observed on the host platform. The other platform is recorded or explicitly pending |
| M02-T02 | Missing or renamed target, wrong config, or unknown or broadened preset fails readiness | Observed, including the new reviewed-row check |
| M02-T03 | No hidden telemetry, credentials, global web, HMR or title call | Observed: gate, plus `otel` and `llm-deepseek-account` disabled |
| R1 | Request-shape parity with A, or a recorded D2 decision | Observed |
| M02-T10 | Failed step with pending tools | Observed on the installed unit, or open with the stated limit (R3) |
| M02-T13 | E-written logs are read, or explicitly refused, by A | Observed on a disposable copy |
| M02-T14 | Existing suites: `pnpm check`, `runtime-service` on PostgreSQL, `test:db`, `test:sql`, `test:livekit` | Observed locally or on the PR's CI run |
| M02-T08 | Preset and provider identity restore; no silent default | Observed only if G3 lands; otherwise pending |
| M02-T04–T07, T09, T11, T12, T15 | Control, recovery and cutover cases | Pending (G3–G5); none is claimed |

"Done" means source-ready for review. It does not mean merge-ready, release-ready or hosted-verified.

## 9. Non-goals and prohibitions

- No research tools and no web egress.
- No change to the model, provider or payer.
- No broad dependency refresh.
- No Google, LiveKit or React upgrade.
- No hot-patching of upstream internals.
- No splicing upstream source into the tree.
- No hosted mutation, merge, deploy or paid call.
- No credentials in the repository, traces or handoffs.
- No `--force` or rebase of another contributor's branch.

## 10. Owner decisions needed

- **D1:** confirm E as the target, with D as the fallback. The alternative is choosing D up front to avoid the pi-ai change entirely.
- **D2:** once C3 reports, accept or pin each request-shape difference on the gpt-6-luna route.
- **D3:** confirm that disabling `llm-deepseek-account` is acceptable. Sophia has no DeepSeek-account use, and the D13 release baseline uses the API-key route.

## Appendix — sources and reproduction

- Upstream: `https://github.com/deepseek-ai/deepseek-harness`. Tags `dsh-v0.1.7-rc.1`, `dsh-v0.1.7-rc.2`, `dsh-v0.2.0-rc.1` and `dsh-v0.2.0-rc.2`; commit `6a6f350b9437cf24e34a34f39ee4dfd107897d0c` ("settle pending tool results before failed steps close").
- Release notes: `https://github.com/deepseek-ai/deepseek-harness/releases` (0.2.0-rc.1 and 0.2.0-rc.2 entries).
- Re-check commands:
  - `git merge-base --is-ancestor 6a6f350 <tag>`
  - `npm view @deepseek-ai/dsh@<v> dist.integrity`
  - `npm pack @deepseek-ai/dsh-agent-loop@<v>`, then `grep -r ToolCallRecovery package/lib`
  - `npm pack @earendil-works/pi-ai@0.87.1`, then inspect `dist/providers/data/openai.json` for `gpt-6-luna`
  - Diff the parsed `packages/bundle/base/cordis.patch.yml` between tags.
- Everything above was observed on 2026-09-30 from public sources and a read-only clone. Nothing was installed into the repository, committed, pushed or deployed.
