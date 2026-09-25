# Document and source map

This file answers two questions: which document governs a decision, and which
upstream source a Sophia file is grounded in. Design authority is the v0.4
pack. Upstream sources establish mechanisms and never override a Sophia
decision.

## 1. The implementation pack

| Fact | Value |
|---|---|
| Imported file | `Sophia_Implementation_Pack_v0.4_Part2_2026-09-24.zip` (cumulative: Part 1 plus the Part 2 bindings) |
| ZIP SHA-256 | `2a869f5201bac25c47584fda95b7146ef9dfd3b5ab86ef71db11cc93d9973766` |
| Location | [`docs/pack/`](pack/00_START_HERE.md): 119 files, byte-identical to the archive contents; `sha256sum -c` against the pack's own [SHA256SUMS.txt](pack/SHA256SUMS.txt) passes for all 118 listed files |
| Validator | `docs/pack/scripts/verify_local.sh` (runs `validate_pack.py`, `validate_part2.py` and the pack's 48 reference tests): all passed on a throwaway copy ([run output](evidence/pack-v0.4/verify-local.run.txt)). The scripts rewrite files under `evidence/`, so they never run in place |
| Replaces | v0.3 Part 1 (`..._LINKS_FIXED_...zip`, SHA-256 `61fb067b…`), imported at S1-01. The v0.4 `00_START_HERE` makes v0.3 historical. Its navigation-only extras (`OPEN_GOALS.html`, `NAVIGATION_README.md`) are not part of v0.4 and were dropped; on GitHub the Markdown links work as they are |

Do not edit files under `docs/pack/`. Record repository-specific decisions in
the files outside it (this map, [DESTINATION_MAP](DESTINATION_MAP.md),
[RUNTIME_UNIT](RUNTIME_UNIT.md), handoffs). The next pack installment
replaces `docs/pack/` wholesale.

### Which document governs what

| Document | Governs | Read by goals |
|---|---|---|
| [00_START_HERE](pack/00_START_HERE.md) | Reading order, status language | all |
| [01_SOPHIA_END_TO_END](pack/01_SOPHIA_END_TO_END.md) | Product, experience, three releases | all (people) |
| [02_DECISIONS](pack/02_DECISIONS.md) | Settled choices; no framework reselection | all |
| [03_REPOSITORY_MAP](pack/03_REPOSITORY_MAP.md) | Monorepo layout, boundaries, toolchain pinning; mirrored in [DESTINATION_MAP](DESTINATION_MAP.md) | all coding goals |
| [AGENTS](pack/AGENTS.md) | Coding-agent contract; root [AGENTS.md](../AGENTS.md) imports it verbatim | all coding goals |
| [architecture/01_SYSTEM](pack/architecture/01_SYSTEM.md) | Data/command flow, authority, runtime/media split | S1-14 |
| [architecture/02_DSH_BOOTSTRAP](pack/architecture/02_DSH_BOOTSTRAP.md) | Profile, bundle, Agent bridge, telemetry disables, model routing | **S1-01**, S1-03 |
| [architecture/03_BACKEND](pack/architecture/03_BACKEND.md) | Records, API groups, jobs, streams, replay | S1-02, S1-03, S1-05, S1-06, S1-08 … S1-11 |
| [architecture/04_FRONTEND](pack/architecture/04_FRONTEND.md) | Screens, components, focus, cards | S1-02, S1-04, S1-07, S1-12 |
| [architecture/05_EXECUTION_TEAMS](pack/architecture/05_EXECUTION_TEAMS.md) | Three engineering resources, messages, heartbeat | S1-09, S1-10, S1-11 |
| [architecture/06_VOICE_AND_VISION](pack/architecture/06_VOICE_AND_VISION.md) | Gemini Live, LiveKit, floor, capture | S1-04, S1-05, S1-12 |
| [architecture/07_IMAGE_GENERATION](pack/architecture/07_IMAGE_GENERATION.md) | Google/OpenAI image adapters and assets | S1-06 |
| [architecture/08_CREATION_AND_REVIEW](pack/architecture/08_CREATION_AND_REVIEW.md) | Prototypes, reports/decks, snapshots, review | S1-07, S1-12, S1-13 |
| [architecture/09_MEMORY_AND_CONTEXT](pack/architecture/09_MEMORY_AND_CONTEXT.md) | Accepted state, scoped sources, recall, imports | S1-02, S1-08, S1-11 |
| [architecture/10_OPERATIONS_AND_TESTS](pack/architecture/10_OPERATIONS_AND_TESTS.md) | Hosts, isolation, secrets, test layers, release | **S1-01**, S1-03, S1-07, S1-09, S1-13, S1-14 |
| [contracts/](pack/contracts/README.md) | Initial record/event vocabulary (not a generated SDK) | S1-02 onward |
| [config/](pack/config/README.md) | Machine-readable decisions; the specimens are copied to [`config/`](../config) | S1-01, S1-03, S1-05, S1-06, S1-11 |
| [sources/](pack/sources/README.md) | Source register and donor atlas | per goal `source_ids` |
| [delivery/](pack/delivery/GOAL_INDEX.md) | Goals, dependencies, acceptance | per goal |
| [templates/](pack/templates/SESSION_HANDOFF.md) | Session and executable handoffs; S1-01 attempt 1 is [here](handoffs/S1-01-attempt-1.md) | every attempt |
| [architecture/11_OMNIGENT_BINDINGS](pack/architecture/11_OMNIGENT_BINDINGS.md) | Owner device grants, dormant session bundles, native Stop/settlement, receipts | S1-09, S1-10 |
| [architecture/12_DATA_AND_API_BINDINGS](pack/architecture/12_DATA_AND_API_BINDINGS.md) | Roles/RLS, command admission, outbox, snapshot + SSE, errors | **S1-02** onward |
| [architecture/13_FRONTEND_BINDINGS](pack/architecture/13_FRONTEND_BINDINGS.md) | Studio reference → production components and API | S1-04, S1-07, S1-12 |
| [architecture/14_RENDERER_EXTRACTION](pack/architecture/14_RENDERER_EXTRACTION.md) | The three audited JS render kernels and their adaptations (D32) | S1-13 |
| [api/](pack/api/README.md) | OpenAPI contract (33 operations), generated types, route bindings, reference client | S1-02 onward |
| [db/](pack/db/README.md) | Four PostgreSQL migration candidates and their SQL tests | **S1-02** |
| [implementation/](pack/implementation/README.md) | Executable reference logic (wire builders, control rules, projections, source patches) | S1-02, S1-03, S1-09 |
| [frontend/](pack/frontend/README.md) | Anchor → component/API bindings for the Studio reference | S1-04, S1-07, S1-12 |
| [renderers/](pack/renderers/README.md) | Renderer extraction manifest, dependency closure, render contract | S1-13 |
| [ops/](pack/ops/DEPLOYMENT_BINDINGS.md) | Deployment units, secrets, readiness, upgrade order | S1-01, S1-14 |
| [05_IMPLEMENTATION_STATUS](pack/05_IMPLEMENTATION_STATUS.md) | What the pack itself tested and what it did not | all |
| [CONTINUATION](pack/CONTINUATION.md) | Next documentation pass | documentation owners |

## 2. Upstream sources used at S1-01

All at `deepseek-ai/deepseek-harness@46a7f68b0922371ce7144b668b90e377d8e799f4`
(tag `dsh-v0.1.7-rc.1`), read from a checkout outside this tree (see
[`scripts/dsh-source.mjs`](../scripts/dsh-source.mjs)).

| Source id | Upstream file | Used for | Sophia files |
|---|---|---|---|
| DSH-01 | `package.json` | pnpm 11.7.0, Node `^22.19.0 \|\| >=24.0.0`, version 0.1.7-rc.1 | `package.json`, `.node-version`, `config/runtime-unit.json` |
| DSH-02 | `docs/architecture.md` | Official launcher, profiles, bundles | `runtime/dsh/`, `scripts/lib/profile.mjs` |
| DSH-03 | `packages/boot/app-boot/README.md` | Bundle order; skip-on-failure behavior; `--dump-config`; comments-only user patch fails boot; peer-dependency compatibility check; startup-diagnostics log | `scripts/lib/gate.mjs`, `scripts/lib/patch-lint.mjs`, `tests/integration/profile-gate.test.mjs` |
| DSH-04 | `packages/bundle/base/cordis.patch.yml` | The 92 base row ids; `session-log-deepseek`, `plugin-package-inventory-deepseek`, `session-telemetry-otel`, `hmr` rows and the `DSH_TELEMETRY_DISABLED` semantics | `packages/dsh-bundle/cordis.patch.yml`, `scripts/lib/common.mjs` (`sanitizedEnv`) |
| DSH-05 | `packages/bundle/sdk-app/cordis.patch.yml` | Row `disabled: true` and `insert` syntax precedent | `packages/dsh-bundle/cordis.patch.yml` |
| DSH-19 | `packages/util/package-manifest/src/types.ts` | `dsh.profile.bundles`, `dsh.bundle.patch`, `manifestVersion` | `config/dsh/profile/package.json`, `packages/dsh-bundle/package.json` |
| DSH-20 | `packages/bundle/sdk-app/package.json` | Packaged bundle manifest shape (`exports` of `./cordis.patch.yml`, `files`) | `packages/dsh-bundle/package.json` |
| DSH-15 | `packages/llm/llm-pi-ai/README.md`, and `docs/config-catalog.md` (`dsh-llm-pi-ai`, `dsh-agent-default-model`, `dsh-agent-loop`) | Provider routes, `apiKeyEnv` references, a `models` list declaring a model newer than the catalog, `reasoningEfforts`; default-model `{provider, model, reasoningEffort}`; the agent loop requires the `agents`, `sessions`, `llm`, `tools`, `systemPrompt` and `sessionProjections` services | `packages/dsh-bundle/cordis.patch.yml` (development model route), `scripts/lib/gate.mjs` (`checkModelRoute`) |
| DSH-08, DSH-09, DSH-10 | `docs/subsystems/core.md`, and the installed `@deepseek-ai/dsh-agent` declarations | `ctx.agents.create/resume` with `setup`, `AgentHandle.dispose`, `send/followup/steer/inject`, `cancel(cause, {keepInbox})`, `whenIdle`, `agent/pre-step` (reject/enter), inbox `claimed`/`discarded`, `isOwnedBy` | `packages/dsh-bundle/src/control-bridge.ts` |
| DSH-11 | `docs/subsystems/session.md`, `persistence.md` | `ctx.sessions.flush` as the durability barrier; log-only plugin events and the `ignorable` envelope marker | `control-bridge.ts` (`settled`), `session-events.ts` (journal) |
| DSH-12 | `docs/cookbook/extension-cookbook.md`, and the installed `@deepseek-ai/dsh-tools` declarations | Protocol-driver plugin shape; `tools.guard` (monotonic, root and nested executions); `tools.restrict` (agent scope, unknown names fail); `tools.schemas` | `control-bridge.ts`, `role-registry.ts` |
| DSH-13, DSH-18 | `docs/subsystems/core.md` (`ctx.agentPresets`); the `workflow` tool schema observed at runtime | Presets resolve current definitions on resume; `workflow` is the PTC program runtime in native presentation mode | `role-registry.ts` |
| — | `apps/cli/README.md`, `apps/cli/reference/README.md` | `dsh plugin --profile … <pnpm args>`, dump flags, startup diagnostics under `$DSH_HOME/logs/` | `scripts/lib/profile.mjs` |

Also consulted: the `dsh plugin` output at the pin. A non-shipped profile
initializes with `dsh.profile.bundles: [dsh-base, …]`, depends only on the
added bundle (dsh-base resolves from the installation), and gets a
`pnpm-workspace.yaml` with `nodeLinker: hoisted` and
`autoInstallPeers: false`. `config/dsh/profile/` reproduces that generated
shape exactly.

## 2a. Sources and amendments at S1-04

| What | Version / identity | Used for | Sophia files |
|---|---|---|---|
| `livekit-server-sdk` | 2.19.1 (npm) | `AccessToken` with a single-room video grant | `apps/api/src/livekit.ts` |
| `livekit-client` | 2.22.3 (npm) | Browser room connection, remote audio, active speakers | `apps/studio/src/features/voice/livekit-room.ts` |
| `livekit/livekit-server` | v1.13.7 (Docker image, dev mode) | The local room server for the dev stack; not a deployment | `scripts/lib/livekit.ts` |
| LK-01 … LK-03 | pack source register | Read for the room lifecycle; `@livekit/rtc-node` 1.1.0 stays the S1-05 media bridge's pin | — |

**Contract amendments.** `packages/contracts/openapi/openapi.json` is the pack's contract plus the JSON Patches in [`packages/contracts/amendments/`](../packages/contracts/amendments/), applied in file order and checked by `pnpm contracts:check`. The pack's own generated types still come out byte-for-byte from the pack's contract. A01 (S1-04) exposes the project room in the snapshot and ships `transferInputFloor` with S1-04. Its reasons are in the file.

## 2b. Sources and amendments at S1-05A

| What | Version / identity | Used for | Sophia files |
|---|---|---|---|
| `@google/genai` (GG-01, G-01–G-06) | 2.24.0 (npm) | `ai.live.connect` on the Gemini API (never Vertex), model `gemini-3.8-live`; audio responses, input and output transcription, context-window compression (`triggerTokens` `'25000'`, sliding window `'8000'`; strings in this SDK), session resumption, NON_BLOCKING tools with top-level `scheduling`/`willContinue` | `apps/media-bridge/src/live-session.ts`, `tools.ts`, `live-messages.ts` |
| `@livekit/rtc-node` (LK-01–LK-03) | 1.1.0 (npm; FFI bindings 0.12.73) | Raw RTC as the `sophia` participant: `AudioStream(track, 16000, 1)` for members' microphones, `AudioSource(24000, 1, 200)` + `LocalAudioTrack` for her one track, `VideoStream` only for the looked-at source, `setAttributes` for observed state | `apps/media-bridge/src/rtc.ts` |
| `jpeg-js` | 0.4.4 (npm) | Encodes the sampled still (≤1 fps, ≤1024 px wide) | `apps/media-bridge/src/vision.ts` |
| `livekit/livekit-server` | v1.13.7 (Docker image, dev mode) | The real server for `pnpm test:livekit` and the CI `room-media` job | `scripts/livekit-test.ts`, `apps/media-bridge/src/rtc.livekit.test.ts` |

Observed in these SDKs, not in the pack: `sendClientContent` mid-conversation is for seeding initial history on the 3.x Live route (`historyConfig.initialHistoryInClientContent`), so a finished-result notice goes as realtime text; a LiveKit participant can set its own attributes only when its grant has `canUpdateOwnMetadata` (the API's bridge token does, people's tokens do not); `@livekit/rtc-node` logs at debug level unless `NODE_ENV=production`.

**Contract amendments.** A04 (the private runtime service), A05 (discussion and native tasks) and A06 (the room exchange, the bridge's private `/v1/media/*` routes, `room.sophia` in the snapshot; viewers publish and may hold the floor) are in [`packages/contracts/amendments/`](../packages/contracts/amendments/), each with its reasons. A01 stays as it was; A06 amends it rather than duplicating the floor.

## 3. Facts learned at the pin (not in the pack)

These are observed behaviors of the pinned release, recorded so later goals
do not rediscover them.

1. **`--dump-config` exits 0 for a broken Sophia layer.** A missing,
   peer-incompatible or comments-only bundle is skipped with one stderr line.
   A patch row that targets an unknown id only warns. An empty `[]` bundle
   patch composes silently with nothing from Sophia. Only a comments-only
   *profile* patch fails the dump. This is why the S1-01 gate is Sophia code
   and not a dsh exit code.
2. **Workspace hoisting can mask the profile.** dsh resolves plugins
   installation-first. With pnpm's default `hoistWorkspacePackages`, the
   in-tree `@sophia/dsh-bundle` was reachable through
   `node_modules/.pnpm/node_modules`, so deleting the bundle from the
   profile changed nothing. Fixed by `hoistWorkspacePackages: false`, by
   launching only from the deployed runtime artifact, and by the gate's
   `no_bundle_shadowing` check.
3. **Some deploy output depends on location.** pnpm `.bin` shims embed the
   absolute install path. The lock that `pnpm deploy` writes embeds the
   source checkout's absolute `file:` URLs. The clean second checkout caught
   the latter. Both are excluded from the runtime tree digest, and the
   launcher runs as `node <artifact>/node_modules/@deepseek-ai/dsh/lib/bin.js`.
4. **The npm release matches the pin.** Across 267 `@deepseek-ai`
   package entries at 0.1.7-rc.1 in the runtime artifact, all 846 shipped
   files that are also tracked in the source checkout are byte-identical
   ([evidence](evidence/S1-01/dsh-source.json)). A full source build was not
   possible in the S1-01 environment: the upstream lock fetches `xlsx` from
   `cdn.sheetjs.com`, and egress policy denied that host.
5. **The base profile boots without an app surface.** `dsh --profile
   sophia-runtime` stays running with no listening port, loads the Sophia
   row, and disposes cleanly on SIGTERM (exit 0).

Learned during S1-03 (each is covered by a test):

6. **`ctx.agents.create` does not apply the default model.** An Agent
   created without `agentOptions` fails its first step with "has no
   provider/model". Entry points read `ctx.agentDefaultModel` at creation,
   and the bridge does the same on create and resume.
7. **An external plugin cannot write a reload-safe session event.**
   Persistence refuses to reload a log that holds an out-of-repo event type
   unless its stored envelope carries `ignorable: true`. The public
   `Session.append` cannot set that marker; only seed events carry it. The
   bridge therefore keeps its correlation, fences and held input in its own
   fsynced journal instead of the extension event 02_DSH_BOOTSTRAP §5
   prefers.
8. **A rejected pre-step drops the claimed messages.** They are neither
   discarded nor re-queued, and re-queuing them would restart the driver. A
   Hold must therefore keep claimed input itself (the journaled stash).
9. **`workflow` is the PTC runtime in this composition.** In native
   presentation mode there is no `run_code`. `workflow` scripts reach tools
   only through child agents, so a PTC guard must cover child agents, which
   is why the bridge walks runtime ownership.
10. **`session-title-llm` makes a second model call per session.** It sends
    the first prompt to the provider again. The Sophia bundle disables it,
    as dsh's SDK bundle does.
11. **`tools.restrict` fails on unknown names.** Role visibility is
    therefore computed from the registered tools (deny what the role does not
    allow), never from a static allowlist.
