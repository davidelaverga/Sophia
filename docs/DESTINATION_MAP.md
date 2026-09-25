# Code destination map

This lists every source destination in the target layout
([03_REPOSITORY_MAP](pack/03_REPOSITORY_MAP.md)) and in each goal's
`destination_paths` ([planning.json](pack/delivery/planning.json)), with its
current state in this repository.

- **built**: exists and does its S1-01 job.
- **partial**: exists; the named later goal completes it.
- **unbuilt**: does not exist yet. The listed goal creates it.

`tests/unit/destination-map.test.mjs` keeps this honest: a `built` or
`partial` path must exist and an `unbuilt` path must not. A goal that creates
a path updates its row in the same commit.

## Root and toolchain

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `AGENTS.md` | built | S1-01 | Pack agent contract plus rules for this repository |
| `package.json` | built | S1-01 | Private root; `packageManager: pnpm@11.7.0`; `engines` node 24.21.0 / pnpm 11.7.0; scripts |
| `pnpm-lock.yaml` | built | S1-01 | Committed exact resolution for the whole workspace |
| `pnpm-workspace.yaml` | built | S1-01 | Workspace globs; `engineStrict`, `saveExact`, `allowBuilds`, `hoistWorkspacePackages: false` |
| `.node-version` | built | S1-01 | `24.21.0` (also `.nvmrc`) |
| `.github/workflows/ci.yml` | built | S1-01 | Clean-checkout reproduction and gate on every push |

## Runtime unit (S1-01)

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `runtime/dsh/` | built | S1-01 | `@sophia/dsh-runtime`: exact `@deepseek-ai/dsh@0.1.7-rc.1`, deployed as the runtime artifact |
| `config/runtime-unit.json` | built | S1-01 | dsh/provider/preset compatibility unit with recorded artifact identities |
| `config/dsh/` | built | S1-01 | Profile installation inputs: manifest, `pnpm-workspace.yaml`, lock pinning the archive, literal `[]` patch |
| `config/models.json` | partial | S1-05, S1-06 | Pack design specimen of exact route ids; consumed once the media and image adapters exist |
| `config/roles.json` | partial | S1-03 | Pack design specimen of role presets; installed by the role registry |
| `config/supervision.json` | partial | S1-11 | Pack design specimen of lead supervision policy |
| `scripts/` | built | S1-01 | Toolchain check, artifact build and verify, profile install and gate, pinned-source verify |

## packages/

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `packages/dsh-bundle/` | partial | S1-01, S1-03 | Built: manifest (`dsh.bundle.patch`), `cordis.patch.yml` (including the development model route), plugin entry, control bridge |
| `packages/dsh-bundle/src/control-bridge.ts` | partial | S1-03, S1-02 | Built: application command ↔ public Agent operations, a fenced Hold/Stop, a journal-backed dedupe, and restart reconciliation. Runs against the labelled fixture service until S1-02's real admission lands |
| `packages/dsh-bundle/src/role-registry.ts` | partial | S1-03, S1-02+ | Built: the five versioned role presets with the S1-03 native-tool policy, enforced by agent-scoped visibility and a monotonic guard that also covers workflow child agents. Sophia domain tools join as later goals build them |
| `packages/dsh-bundle/src/tools/` | unbuilt | S1-03, S1-10 | Typed domain/workspace/source tools (`peer.ts` is S1-10) |
| `packages/dsh-bundle/prompts/` | unbuilt | S1-11 | Stable identity/voice + role instructions |
| `packages/dsh-bundle/skills/` | unbuilt | S1-03 | Procedural task knowledge |
| `packages/contracts/` | unbuilt | S1-02 | Command/event/record schemas; generated clients |
| `packages/domain/` | unbuilt | S1-02, S1-12 | Accepted goals, authority, versions, transitions |
| `packages/persistence/` | unbuilt | S1-02 | Postgres queries, transactions, outbox |
| `packages/context/` | unbuilt | S1-08 | Scoped ContextPacket compiler and invalidation |
| `packages/execution-adapters/` | unbuilt | S1-09, S1-10 | `omnigent/`, `native-team/`, `mailbox/` |
| `packages/creative/` | unbuilt | S1-06, S1-07, S1-13 | Image adapters, assets, prototype bundle |
| `packages/ui/` | unbuilt | S1-04 | Tokens, primitives, common renderers |
| `packages/test-support/` | unbuilt | S1-02 | Semantic fixtures, controlled failures, replay |

## apps/

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `apps/api/` | unbuilt | S1-02, S1-05, S1-09, S1-11 | Fastify HTTP, auth, command admission, SSE |
| `apps/studio/` | unbuilt | S1-04 … S1-12 | React/Vite Studio (Vercel) |
| `apps/worker/` | unbuilt | S1-06, S1-08, S1-11, S1-13 | SQL job/outbox consumers and scheduler |
| `apps/execution-host/` | partial | S1-03, S1-07, S1-12 | Private VM supervisor. Built: the runtime supervisor. The workspace supervisor and artifact gateway are S1-07 |
| `apps/execution-host/src/runtime-supervisor.ts` | partial | S1-03 | Built: launches the official dsh per project home under a single-writer lease and a sanitized env. Ready only from the bridge. Bounded crash restarts. Container isolation and the deployed host are still to do |
| `apps/execution-host/src/workspace-supervisor.ts` | unbuilt | S1-07 | No-secret task containers, build processes |
| `apps/execution-host/src/artifact-gateway.ts` | unbuilt | S1-07, S1-12 | Authenticated preview routing and snapshots |
| `apps/media-bridge/` | unbuilt | S1-05 | Raw LiveKit RTC ↔ Google Live |

## Other roots

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `renderers/` | unbuilt | S1-13 | `web/pdf/` and `web/deck/`: the adapted JS render kernels (v0.4 D32 removed the Python path) |
| `db/migrations/` | unbuilt | S1-02 | New schema; no automatic old-DB migration |
| `deploy/` | unbuilt | S1-14 | Render, execution-host and Vercel manifests |
| `tests/unit/` | built | S1-01 | Toolchain, digest, patch-lint, dump-parse and map checks |
| `tests/integration/` | partial | S1-01, S1-03, S1-14 | Built: profile gate, control bridge, roles, runtime supervisor and the live-steer rehearsal, all against the real pinned dsh. S1-14 adds the release crossings |
| `tests/contracts/` | unbuilt | S1-02 | Contract fixtures |
| `tests/e2e/` | unbuilt | S1-14 | Browser E2E |
| `tests/fixtures/` | unbuilt | S1-02 | Synthetic fixtures |
| `tests/support/` | built | S1-03 | LABELLED fixture Sophia service and keyless mock model for runtime tests |
| `docs/` | built | S1-01 | Pack, source map, this map, runtime-unit guide, evidence, handoffs |
| `docs/releases/` | unbuilt | S1-14 | Release records |
| `planning/` | unbuilt | S1-02 | Versioned goal definitions (no private runtime logs) |
