# Implementation-session handoff: SMC-M02, attempt 1

Goal and attempt: [M02, the qualified dsh upgrade and native preset binding](../missions/2026-09-27-companion-research/missions/M02_DSH_UPGRADE.md), attempt 1. Coordination issue [#26](https://github.com/davidelaverga/Sophia/issues/26); implementation PR [#27](https://github.com/davidelaverga/Sophia/pull/27), draft.
Human owner / executor resource: Davide (owner: D1–D3, merge, release, spend) / Claude Code, cloud session `https://claude.ai/code/session_01SBw4oD6egaNmMg9wXgn9sB`, implementer role only.
Native session: none. Every runtime in this attempt was a disposable local test composition; no hosted or persistent native session was created.
Starting worktree/commit: `main` `acfa34838b36d89c97f3802548a35a93f33e1e93`, verified by fetch in this environment. Branch `claude/smc-m02-dsh-upgrade`, with no merge, rebase or force-push.
Ending commit/tree and changed files: the code at `f0bdaa8`, evidence re-captured at `75c0ca5`, then docs only. Changed:
- `runtime/dsh/package.json`, `packages/dsh-bundle/{package.json,cordis.patch.yml,src/control-bridge.ts,src/session-events.ts,src/index.ts}`;
- `pnpm-lock.yaml`, `config/dsh/profile/pnpm-lock.yaml` (the darwin lock removed), `config/runtime-unit.json`, `config/dsh/base-rows.reviewed.json` (new);
- `scripts/lib/{gate,artifacts}.mjs`;
- tests: `tests/integration/{request-shape,tool-recovery,log-compat,presets}.test.mjs` (new), `profile-gate.test.mjs`, `tests/unit/{gate-parse,bridge-core}.test.mjs`;
- test support: `tests/support/{harness,mock-llm}.mjs`, and new `mock-responses.mjs`, `request-shape.mjs`, `request-shape.expected.json`, `native-log.mjs`, `fault-tool-mode/`, `inert-preset/`;
- docs: `docs/evidence/SMC-M02/`, `docs/progress/SMC-M02*.md`, `docs/coordination/SMC-M02/`, `docs/{SOURCE_MAP,RUNTIME_UNIT,DESTINATION_MAP,README}.md`, this handoff.

## Outcome

`sophia-runtime-m02-dev` runs dsh `0.2.0-rc.2` with the same model route and control behavior. The G1 spec's facts were re-verified with no discrepancy. The candidate is source-ready for review, not merged or released.
- **The gate** additionally rejects:
  - unreviewed dsh-base rows;
  - the new `otel` and `llm-deepseek-account` rows enabled;
  - a route without its compat pin;
  - any preset roster but the recorded one.
- **R1.** The request shape was held to the previous unit's by pinning `supportsStrictMode: false`.
- **T10.** The failed-step recovery is shown behaviorally on the installed unit, and its absence on the old unit.
- **T12/T13.** Copied logs cross both ways; the old unit's failed-step logs are refused by both units.
- **G3.** Presets mount through the public registry, and each attempt keeps an immutable execution identity that is restored exactly or held.

**Missing or unverified:**
- `TOOL_OUTCOME_UNKNOWN` (CC-0001);
- darwin-arm64 identities;
- a live gpt-6-luna request;
- image inputs and compaction under the catalog's inherited limits;
- lease settlement and a restore rehearsal (the rest of G4);
- all of G5;
- CI on #27.

## Evidence

- Commands and results are in [SMC-M02 §3–§4](../progress/SMC-M02.md). In summary: `pnpm check` exit 0 at A (333 unit, 51 integration) and at the candidate (337 unit, 68 integration, 2 env-gated skips); `runtime-service` 5/5, `test:sql` 20 migrations and `test:db` 198/198 on PostgreSQL 16.13, for both.
- Upstream checks: `pnpm dsh:source --verify-release` found 897 files byte-identical and 0 differing.
- The previous unit's behavior came from a separate worktree at `acfa348`, running the same test files.
- Stored evidence: `docs/evidence/SMC-M02/{request-shape,tool-recovery,log-compat}/`, `lock-delta.md`, `dsh-source-release.json`. It is path-normalized and holds no credential; the only key used was a literal dummy.
- Sources: the upstream tags `dsh-v0.1.7-rc.1/rc.2` and `dsh-v0.2.0-rc.1/rc.2`, commit `6a6f350`, and npm, all read outside the tree. New upstream files relied on are recorded as DSH-21 … DSH-25 in `docs/SOURCE_MAP.md`.

## Decisions and changes

- The owner's instructions and the G1 spec applied, with M02 governing; no conflict with M02 was found.
- **R1.** The difference was neutralized by explicit config, so no fallback to D was considered. The residual differences (user-agent version, dsh-authored prompt and tool text) cannot be set by any route configuration and would also come with D. They are put to Davide as D2 rather than treated as a stop condition.
- **T10.** No public seam can fail a step. The test therefore uses a test-only plugin wrapping the public `ctx.tools.executionMode` (upstream's own seam for the case); nothing upstream is spliced or patched in production.
- **G3** needed a reviewed dependency addition, `@deepseek-ai/dsh-agent-preset-registry` as an exact peer and dev dependency. It was already in the closure, so only the importer changed.
- No migration, contract amendment, wire change, model route, provider or payer change was made, and no hosted state was touched.

## Remaining obligations

- **OP-0001 (CC-0001).** Posted, read and test only, no approval. Waits for Davide to start Codex.
- **darwin-arm64.** The unit refuses to run there until someone records it.
- **Hosted runtime.** It still runs the previous unit's code. Sessions that failed a step with pending tools under it are already unrecoverable, under either unit. The G5 preflight should count them before cutover.
- No active job, retained runtime data, stopped epoch or unknown effect exists. Local scratch (a disposable PostgreSQL and test homes) lives outside the repository.

## Next bounded action

1. Davide answers D1–D3 on #27 and starts Codex on CC-0001.
2. The next Claude attempt keeps this branch green on CI and integrates M01 once it merges (merge `main`, re-run `pnpm check`).
3. It records darwin-arm64 from Codex's reply, if one comes.
4. It then does G4's lease-settlement and restore rehearsal on a disposable home, and drafts the G5 release request.
