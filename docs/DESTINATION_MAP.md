# Code destination map

This lists every source destination in the target layout
([03_REPOSITORY_MAP](pack/03_REPOSITORY_MAP.md)) and in each goal's
`destination_paths` ([planning.json](pack/delivery/planning.json)), with its
current state in this repository.

- **built**: exists and does its job for the goals delivered so far.
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
| `.github/workflows/ci.yml` | built | S1-01, S1-02 | Clean-checkout reproduction and gate on every push; S1-02 adds the SQL/API job on PostgreSQL 16 and live auth on local Supabase |
| `.gitattributes` | built | S1-02 | LF in every checkout, so `docs/pack/` stays byte-identical to the archive on Windows too |
| `tsconfig.base.json` | built | S1-02 | Strict compiler options for the TypeScript packages and apps (run by Node type stripping, no build step) |
| `.prettierrc.json` | built | S1-02 | Formatting, run by `pnpm check` |
| `.prettierignore` | built | S1-02 | Keeps Prettier off recorded identities: `docs/`, `config/`, the dsh bundle and runtime, generated files |
| `CONTRIBUTING.md` | built | S1-02 | Clean-code rules and how the tools enforce them |
| `.oxlintrc.json` | built | S1-02 | Strict type-aware lint, run by `pnpm check` (CONTRIBUTING.md) |
| `tsconfig.json` | built | S1-02 | Typechecks the TypeScript scripts under `scripts/` |
| `.env.example` | built | S1-02 | Names of the local variables; real values stay outside the repository |

## Runtime unit (S1-01)

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `runtime/dsh/` | built | S1-01 | `@sophia/dsh-runtime`: exact `@deepseek-ai/dsh@0.1.7-rc.1`, deployed as the runtime artifact |
| `config/runtime-unit.json` | built | S1-01 | dsh/provider/preset compatibility unit with recorded artifact identities |
| `config/dsh/` | built | S1-01 | Profile installation inputs: manifest, `pnpm-workspace.yaml`, lock pinning the archive, literal `[]` patch |
| `config/models.json` | partial | S1-05, S1-06 | Pack design specimen of exact route ids; consumed once the media and image adapters exist |
| `config/roles.json` | partial | S1-03 | Pack design specimen of role presets; installed by the role registry |
| `config/supervision.json` | partial | S1-11 | Pack design specimen of lead supervision policy |
| `scripts/` | built | S1-01, S1-02 | Toolchain check, artifact build and verify, profile install and gate, pinned-source verify. S1-02: SQL test runner, disposable PostgreSQL, local Supabase, dev stack, API login and member provisioning |

## packages/

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `packages/dsh-bundle/` | partial | S1-01, S1-03 | Built: manifest (`dsh.bundle.patch`), `cordis.patch.yml`, plugin entry reporting `not_ready` |
| `packages/dsh-bundle/src/control-bridge.ts` | unbuilt | S1-03 | Application command ↔ public Agent operations |
| `packages/dsh-bundle/src/role-registry.ts` | unbuilt | S1-03 | guide/lead/research/prototype/review presets |
| `packages/dsh-bundle/src/tools/` | unbuilt | S1-03, S1-10 | Typed domain/workspace/source tools (`peer.ts` is S1-10) |
| `packages/dsh-bundle/prompts/` | unbuilt | S1-11 | Stable identity/voice + role instructions |
| `packages/dsh-bundle/skills/` | unbuilt | S1-03 | Procedural task knowledge |
| `packages/contracts/` | built | S1-02 | OpenAPI contract (identical to the pack), generated types, Ajv component schemas, SSE frame parser |
| `packages/domain/` | partial | S1-02, S1-12 | Built: the domain error vocabulary (code, HTTP status, retry). S1-12 adds accepted goals, authority, versions, transitions |
| `packages/persistence/` | built | S1-02 | Actor-scoped transactions, command admission, snapshot, event frames, LISTEN, outbox leases, migration ledger |
| `packages/context/` | unbuilt | S1-08 | Scoped ContextPacket compiler and invalidation |
| `packages/execution-adapters/` | unbuilt | S1-09, S1-10 | `omnigent/`, `native-team/`, `mailbox/` |
| `packages/creative/` | unbuilt | S1-06, S1-07, S1-13 | Image adapters, assets, prototype bundle |
| `packages/ui/` | partial | S1-02, S1-04 | Built: the first primitive (`Tag`). S1-04 adds tokens, primitives, common renderers |
| `packages/test-support/` | built | S1-02 | Disposable migrated databases, cluster-role lock, project seeding |

## apps/

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `apps/api/` | partial | S1-02, S1-05, S1-09, S1-11 | Built: Fastify HTTP, Supabase JWT auth (JWKS), project creation, command admission, snapshot, SSE |
| `apps/studio/` | partial | S1-02, S1-04 … S1-12 | Built: sign-in, project start, the S1-02 work view (snapshot + live feed + goal commands) |
| `apps/worker/` | unbuilt | S1-06, S1-08, S1-11, S1-13 | SQL job/outbox consumers and scheduler |
| `apps/execution-host/` | unbuilt | S1-03, S1-07, S1-12 | Private VM supervisor: runtime, workspace, artifact gateway |
| `apps/media-bridge/` | unbuilt | S1-05 | Raw LiveKit RTC ↔ Google Live |

## Other roots

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `renderers/` | unbuilt | S1-13 | `web/pdf/` and `web/deck/`: the adapted JS render kernels (v0.4 D32 removed the Python path) |
| `db/migrations/` | built | S1-02 | Pack 0001–0004 verbatim plus 0005–0007 (event notify, idempotent project creation, dispatch fencing); no automatic old-DB migration |
| `db/tests/` | built | S1-02 | The pack's SQL test, run after the migrations |
| `supabase/` | built | S1-02 | Supabase CLI config for the local stack (ES256 signing keys, Auth redirects) |
| `deploy/` | partial | S1-02, S1-14 | Built: `deploy/supabase/` (hosted project runbook, CA certificate). S1-14 adds Render, execution-host and Vercel manifests |
| `tests/unit/` | built | S1-01 | Toolchain, digest, patch-lint, dump-parse and map checks |
| `tests/integration/` | partial | S1-01, S1-14 | Built: profile gate against the real pinned dsh. S1-14 adds the release crossings |
| `tests/contracts/` | unbuilt | S1-02 | Contract fixtures |
| `tests/e2e/` | unbuilt | S1-14 | Browser E2E |
| `tests/fixtures/` | unbuilt | S1-02 | Synthetic fixtures |
| `docs/` | built | S1-01 | Pack, source map, this map, runtime-unit guide, evidence, handoffs |
| `docs/releases/` | unbuilt | S1-14 | Release records |
| `planning/` | unbuilt | S1-02 | Versioned goal definitions (no private runtime logs) |
