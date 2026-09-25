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
| `scripts/` | built | S1-01, S1-02, S1-04 | Toolchain check, artifact build and verify, profile install and gate, pinned-source verify. S1-02: SQL test runner, disposable PostgreSQL, local Supabase, dev stack, API login and member provisioning. S1-04: a dev LiveKit container |

## packages/

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `packages/dsh-bundle/` | partial | S1-01, S1-03 | Built: manifest (`dsh.bundle.patch`), `cordis.patch.yml` (including the development model route), plugin entry, control bridge |
| `packages/dsh-bundle/src/control-bridge.ts` | partial | S1-03, S1-02 | Built: application command ↔ public Agent operations, a fenced Hold/Stop, a journal-backed dedupe, and restart reconciliation. Runs against the labelled fixture service until S1-02's real admission lands |
| `packages/dsh-bundle/src/role-registry.ts` | partial | S1-03, S1-02+ | Built: the five versioned role presets with the S1-03 native-tool policy, enforced by agent-scoped visibility and a monotonic guard that also covers workflow child agents. Sophia domain tools join as later goals build them |
| `packages/dsh-bundle/src/tools/` | unbuilt | S1-03, S1-10 | Typed domain/workspace/source tools (`peer.ts` is S1-10) |
| `packages/dsh-bundle/prompts/` | unbuilt | S1-11 | Stable identity/voice + role instructions |
| `packages/dsh-bundle/skills/` | unbuilt | S1-03 | Procedural task knowledge |
| `packages/contracts/` | built | S1-02, S1-04, S1-04A | OpenAPI contract = the pack plus reviewed JSON Patch amendments (A01 room, A02 room access, A03 lobby decline and block), generated types, generated response validators (`./validate`), Ajv component schemas, SSE frame parser |
| `packages/domain/` | partial | S1-02, S1-12 | Built: the domain error vocabulary (code, HTTP status, retry). S1-12 adds accepted goals, authority, versions, transitions |
| `packages/persistence/` | built | S1-02, S1-04, S1-04A | Actor-scoped transactions (and an actor-less read for invitation previews), command admission, snapshot (with the room, lobby and sessions), event frames, LISTEN, outbox leases, migration ledger, room floor, invitations, lobby, sessions |
| `packages/context/` | unbuilt | S1-08 | Scoped ContextPacket compiler and invalidation |
| `packages/execution-adapters/` | unbuilt | S1-09, S1-10 | `omnigent/`, `native-team/`, `mailbox/` |
| `packages/creative/` | unbuilt | S1-06, S1-07, S1-13 | Image adapters, assets, prototype bundle |
| `packages/ui/` | partial | S1-02, S1-04 | Built: `Tag`, line icons (`Icon`), labels that swap in place (`SwapLabel`), hover and focus tips that name a control and its key (`Tip`), in-place confirmation for actions that cut someone off (`ConfirmButton`) and the sliding thumb of segmented controls and navigation (`useSlidingThumb`). Later goals add common renderers |
| `packages/test-support/` | built | S1-02 | Disposable migrated databases, cluster-role lock, project seeding |

## apps/

| Path | State | Goal | Contents / purpose |
|---|---|---|---|
| `apps/api/` | partial | S1-02, S1-04, S1-04A, S1-05, S1-09, S1-11 | Built: Fastify HTTP, Supabase JWT auth (JWKS; anonymous guests limited to the lobby and their call), project creation, command admission, snapshot, SSE, room tokens and the input floor, invitations (derived links, Resend or folder email, calendar files), lobby decisions, sessions, one's own membership |
| `apps/studio/` | partial | S1-02, S1-04 … S1-12 | Built: sign-in (link or emailed code), project start, the project shell with view routes (`/p/<project>/<view>`), per-viewer lenses and drafts, the work view (snapshot + live feed + goal commands), the room stage (Sophia's light in WebGL, people around her, the input floor passing through her, a floating dock with microphone, camera, screen share and leave; video layouts where her light moves into a tile of her own; LiveKit loads on join) and a mini dock on the other views |
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
| `db/migrations/` | built | S1-02, S1-04, S1-04A | Pack 0001–0004 verbatim plus 0005–0011 (event notify, idempotent project creation, dispatch fencing, idempotent dispatch results, project room and input floor, room access: invitations, lobby, sessions; lobby decline for now and block for good); no automatic old-DB migration |
| `db/tests/` | built | S1-02 | The pack's SQL test, run after the migrations |
| `supabase/` | built | S1-02 | Supabase CLI config for the local stack (ES256 signing keys, Auth redirects) |
| `deploy/` | partial | S1-02, S1-14 | Built: `deploy/supabase/` (hosted project runbook, CA certificate). S1-14 adds Render, execution-host and Vercel manifests |
| `tests/unit/` | built | S1-01 | Toolchain, digest, patch-lint, dump-parse and map checks |
| `tests/integration/` | partial | S1-01, S1-03, S1-14 | Built: profile gate, control bridge, roles, runtime supervisor and the live-steer rehearsal, all against the real pinned dsh. S1-14 adds the release crossings |
| `tests/contracts/` | unbuilt | S1-02 | Contract fixtures |
| `tests/e2e/` | unbuilt | S1-14 | Browser E2E |
| `tests/fixtures/` | unbuilt | S1-02 | Synthetic fixtures |
| `tests/support/` | built | S1-03 | LABELLED fixture Sophia service and keyless mock model for runtime tests |
| `docs/` | built | S1-01 | Pack, source map, this map, runtime-unit guide, evidence, handoffs |
| `docs/releases/` | unbuilt | S1-14 | Release records |
| `planning/` | unbuilt | S1-02 | Versioned goal definitions (no private runtime logs) |
