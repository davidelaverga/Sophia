# SMC-M02 contract binding (G1)

**Frozen at G1 on 2026-09-30** against `main` `acfa348` (the merge of #25). It binds the mission's target semantics ([M02 §4–§5](../missions/2026-09-27-companion-research/missions/M02_DSH_UPGRADE.md), [contract bindings §1, §5, §7](../missions/2026-09-27-companion-research/shared/CONTRACT_BINDINGS.md), [file map, M02](../missions/2026-09-27-companion-research/shared/FILE_CHANGE_MAP.md)) to the code that exists. The target is proposed in [SMC-M02-G1-target-spec.md](SMC-M02-G1-target-spec.md) and awaits Davide's D1. A later change to this binding is recorded here, with its reason, in the commit that makes it.

## 1. What already exists and is reused

| Mission concept | Existing record or code (read at `acfa348`) | M02 use |
|---|---|---|
| Runtime-unit identity | `config/runtime-unit.json` (`sophia.runtime-unit.v1`): dsh tag, commit, package version, release integrities, per-platform artifact digests, bundle archive identity, toolchain, model route, `workspace_lock_sha256` | Extended in place: a new unit id with `previous_unit`, the new pin and its integrities, re-recorded digests. No second registry (M02 §4) |
| Identity reproduction | `scripts/build-artifacts.mjs`, `scripts/lib/artifacts.mjs`, `scripts/lib/tree-digest.mjs` (`pnpm artifacts`, `pnpm artifacts:record`) | Unchanged mechanism; re-recorded for the new unit on the host platform only (R5) |
| Composition gate | `scripts/lib/gate.mjs` (`verifyProfile`, `REQUIRED_DISABLED`, `FOREIGN_ROOT_ROWS`, `checkModelRoute`), `scripts/lib/patch-lint.mjs` (unmatched and duplicate rows, comments-only patch) | Extended, never weakened: two more required disables and a reviewed inventory of dsh-base rows (§3) |
| Patch layers | `packages/dsh-bundle/cordis.patch.yml` over `@deepseek-ai/dsh-base`; profile patch literal `[]` | Two more `disabled: true` rows; comments updated; any R1 pinning inside the `models` entry |
| Upstream source record | `scripts/dsh-source.mjs` (`--verify-release`), `docs/SOURCE_MAP.md`, `docs/RUNTIME_UNIT.md` | New upstream files relied on are recorded; the release is checked against the pinned source |
| Native Agent seam | `packages/dsh-bundle/src/control-bridge.ts`: `ctx.agents.create` / `resume` with `setup: this.setupFor(role)` and `agentOptions()` from `ctx.agentDefaultModel.currentSelection()` | G2: unchanged. G3: the resolved identity is recorded at create and checked at resume (§4) |
| Role composition | `packages/dsh-bundle/src/role-registry.ts` (`ROLE_PRESETS`, six versioned ids including `sophia-brief-v1`), `config/roles.json` | Every role stays registered. G3 adds a test-only synthetic preset outside the production registry |
| Bridge journal | `packages/dsh-bundle/src/session-events.ts` (`Journal`, `foldLog`): `sophia/command` records the role; `resumeNative` refuses an undefined role | G3 extends the recorded identity; an unmatched identity becomes an explicit held/unrecovered state |
| Runtime wire | `packages/contracts` generated runtime wire (`runtime-wire.generated.ts`), bridge protocol version 1 | **No change at G2.** G3 needs no wire change: the unrecovered reason already travels in the ready report (`UnrecoveredBinding.reason`) |
| Database | migrations 0001–0020; `execution_bindings`, `work_attempts` | **No migration at G1/G2.** M02 reserves no migration number. If G3 needs service-side storage of the identity, the next free number is recorded here first |

## 2. Files M02 owns in this PR

Reserved on [#26](https://github.com/davidelaverga/Sophia/issues/26) per [FILE_CHANGE_MAP](../missions/2026-09-27-companion-research/shared/FILE_CHANGE_MAP.md):

- `runtime/dsh/package.json`, `packages/dsh-bundle/package.json`, `pnpm-lock.yaml`, `config/dsh/profile/pnpm-lock.yaml`, `config/dsh/profile/pnpm-lock.darwin-arm64.yaml`;
- `packages/dsh-bundle/cordis.patch.yml`, `packages/dsh-bundle/src/{control-bridge,role-registry,session-events}.ts` (G3 only);
- `config/runtime-unit.json`, `config/dsh/base-rows.reviewed.json` (new);
- `scripts/lib/gate.mjs`, `scripts/lib/patch-lint.mjs` if needed, and their unit and integration tests;
- new integration tests for R1, M02-T10 and M02-T13, and their evidence under `docs/evidence/SMC-M02/`;
- `docs/SOURCE_MAP.md`, `docs/RUNTIME_UNIT.md`, `docs/progress/SMC-M02*.md`, `docs/handoffs/SMC-M02-attempt-1.md`.

M01's surfaces (media bridge, API mission routes, Studio, 0018–0020) are not touched. `sophia-brief-v1` stays defined.

## 3. G2 delta (runtime unit and gate)

| Item | At `acfa348` | Intended |
|---|---|---|
| dsh launcher | `@deepseek-ai/dsh` `0.1.7-rc.1` | `0.2.0-rc.2` exact (fallback `0.2.0-rc.1`) |
| Bundle peers and dev deps | `@deepseek-ai/dsh-*` `0.1.7-rc.1`; cordis `4.0.4` | `0.2.0-rc.2` exact; cordis `4.0.4` unchanged |
| pi-ai (transitive) | `0.85.1` | `0.87.1` at E (R1); `0.85.1` at D |
| `REQUIRED_DISABLED` | 5 rows | + `otel`, `llm-deepseek-account` |
| Reviewed base rows | none; the gate compares composed rows against the installed base's own inserts, so a new base row composes silently | `config/dsh/base-rows.reviewed.json`: every dsh-base row id with its package name. The gate fails on an added, removed or renamed row until the file is updated in a reviewed commit |
| Runtime unit id | `sophia-runtime-s1-03-dev` | `sophia-runtime-m02-dev`, `previous_unit: sophia-runtime-s1-03-dev` (the rollback unit) |
| Model route | openai / gpt-6-luna / high, `OPENAI_API_KEY`, `live_verified: false` | Unchanged. The route's `models` entry may gain explicit values that pin the A request shape (R1, D2) |

## 4. G3 delta (preset and execution identity), conditional

Observed at G1: dsh-base composes **no** `agent-preset-registry` row at A or E, so `ctx.agentPresets` does not exist in `sophia-runtime` today. Roles are applied through `setup` on `ctx.agents.create` / `resume`. G3 therefore needs:

1. a registry row and the `@deepseek-ai/dsh-agent-preset-registry` / `@deepseek-ai/dsh-agent-preset` packages in the bundle's closure (a reviewed dependency change), mounted through the public `agentPresets` API as documented at E (`mount` / `select`; `modeSelectionEnabled` is retired);
2. a recorded execution identity per attempt, following [CONTRACT_BINDINGS §5](../missions/2026-09-27-companion-research/shared/CONTRACT_BINDINGS.md): runtime unit id, role/preset id and a digest of its definition (tool set, guard policy), provider, model, effort. It is written to the bridge journal before the first input;
3. at resume, the bridge uses the **recorded** provider, model and effort, not `currentSelection()` (M02 §5.4). A missing or different preset definition, or an unrecorded identity on an attempt that is not a documented legacy case, yields an explicit unrecovered reason; nothing falls back to a default;
4. old journals without the identity (every attempt created by `sophia-runtime-s1-03-dev`) resolve only to the explicit unchanged baseline (openai / gpt-6-luna / high, the only route that unit ever recorded) and are marked as migrated in the journal. This is recorded evidence, not a guess (§5.4);
5. a synthetic, inert preset (no tools, no prompt claiming a capability) registered only in the test composition.

Upstream's registry "uses the current definition of that ID" after a restart and rejects only a missing definition. The digest check in (2)–(3) is what makes a **changed** definition a held state rather than a silent broadening.

## 5. What does not change

The media bridge, the Live model (`gemini-3.8-live`), Google, LiveKit and React versions; the API, contracts and migrations; the runtime wire protocol version; the model route, provider and payer; the hosted services. Cutover (G5) is a Codex operation under a separate bounded approval.
