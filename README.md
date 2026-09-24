# Sophia

The space where the project of your dreams becomes reality.

This is Sophia's new product repository: a shared creation and engineering
workspace built on the official DeepSeek Harness (`dsh`) launcher and a Sophia
profile bundle. The implementation pack calls it `sophia-next`. It is a
separate repository from
[Sophia-Agent](https://github.com/davidelaverga/Sophia-Agent), which stays the
live application. That repository and its outstanding obligations are not
modified by this one.

**Status:** S1-01 is done: the repository, exact toolchain, pinned runtime
artifact and bundle archive are built and identified. S1-02 is in progress:
the first product slice (shared project, command admission, snapshot and live
events, with a minimal Studio view) works against PostgreSQL and Supabase
Auth; see its [handoff](docs/handoffs/S1-02-attempt-1.md). The runtime
carries the Sophia bundle but is **not healthy by design** until the S1-03
control bridge reports ready.

## Read first

- [AGENTS.md](AGENTS.md): the coding-agent contract.
- [docs/pack/00_START_HERE.md](docs/pack/00_START_HERE.md): the v0.4
  implementation pack, the design source of truth.
- [docs/pack/delivery/GOAL_INDEX.md](docs/pack/delivery/GOAL_INDEX.md): the
  goals. S1-02 is in progress.
- [docs/RUNTIME_UNIT.md](docs/RUNTIME_UNIT.md): what is pinned, how it is
  identified and how to reproduce it.
- [docs/DESTINATION_MAP.md](docs/DESTINATION_MAP.md): every planned source
  path, marked built or unbuilt.
- [docs/SOURCE_MAP.md](docs/SOURCE_MAP.md): which documents and upstream
  sources govern which files.

## Toolchain

| Tool | Version | Where it is pinned |
|---|---|---|
| Node.js | 24.21.0 | `.node-version`, `.nvmrc`, `package.json#engines`, `config/runtime-unit.json` |
| pnpm | 11.7.0 | `package.json#packageManager` and `#engines` (strict) |
| dsh | 0.1.7-rc.1 = `46a7f68b0922371ce7144b668b90e377d8e799f4` (tag `dsh-v0.1.7-rc.1`) | `runtime/dsh/package.json`, `pnpm-lock.yaml`, `config/runtime-unit.json` |
| TypeScript | 6.0.3 | root and `packages/dsh-bundle/package.json` |

## Reproduce the runtime unit

```bash
pnpm install --frozen-lockfile   # the only install mode; lock is committed
pnpm check                       # toolchain → typecheck → unit tests → artifacts → integration tests
```

`pnpm check` rebuilds the runtime artifact and bundle archive, then fails
unless every identity recorded in `config/runtime-unit.json` and
`config/dsh/profile/pnpm-lock.yaml` is reproduced. It then installs the
`sophia-runtime` profile into throwaway Harness homes and runs the positive
and adverse composition checks against the real pinned launcher.

Individual steps:

```bash
pnpm toolchain:check                          # exact Node/pnpm or fail
pnpm artifacts                                # build + compare with recorded identities
pnpm artifacts:record                         # build + write identities (reviewed change)
pnpm profile:install --force --boot 10        # isolated install, gate, bounded boot
pnpm profile:verify                           # gate an existing install
pnpm dsh:source --verify-release              # pinned source outside the tree + release provenance
```

## Product slice (S1-02)

The API, Studio and packages are TypeScript run directly by Node (type
stripping, no build step). Suites that need a database or Supabase run apart
from `pnpm test`; with Docker they start what they need:

```bash
pnpm test:sql                 # migrations + SQL test on a throwaway postgres:16 (--source pack: the pack's own)
pnpm test:db                  # persistence, race and HTTP suites on a throwaway postgres:16
pnpm supabase:local           # local Supabase (Auth + Postgres) with the migrations applied
pnpm test:supabase            # real Supabase tokens through the API
pnpm dev                      # API :8787 + Studio :5173 with synthetic identities (--supabase, --hosted <env file>)
```

Secrets never enter the repository: env files live outside it or are
gitignored (`.env.*`). See [.env.example](.env.example) and
[deploy/supabase/README.md](deploy/supabase/README.md).

## Layout (built so far)

```text
package.json / pnpm-lock.yaml / pnpm-workspace.yaml   exact workspace resolution
runtime/dsh/                 @sophia/dsh-runtime: the pinned dsh launcher release
packages/dsh-bundle/         @sophia/dsh-bundle: profile bundle + sophia-control-bridge row
config/runtime-unit.json     runtime unit: pins and recorded artifact identities
config/dsh/profile/          sophia-runtime profile manifest, lock and literal [] patch
config/{models,roles,supervision}.json   design specimens from the pack (not installed)
packages/contracts, domain, persistence, test-support, ui   S1-02 packages
apps/api/                    Fastify API: auth, projects, commands, snapshot, SSE
apps/studio/                 React/Vite Studio: sign-in and the S1-02 work view
db/migrations/, db/tests/    pack 0001–0004 verbatim + 0005–0007; the SQL test
supabase/, deploy/supabase/  local Supabase config; hosted project runbook and CA
scripts/                     toolchain, artifact, profile and gate tooling; database and dev-stack scripts
tests/unit, tests/integration
docs/pack/                   v0.4 Part 2 implementation pack (byte-identical import)
docs/evidence/S1-01/, S1-02/ evidence retained from actual runs
docs/handoffs/               session handoffs per goal attempt
```
