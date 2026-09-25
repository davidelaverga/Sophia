# Sophia

The space where the project of your dreams becomes reality.

This is Sophia's new product repository: a shared creation and engineering
workspace built on the official DeepSeek Harness (`dsh`) launcher and a Sophia
profile bundle. The implementation pack calls it `sophia-next`. It is a
separate repository from
[Sophia-Agent](https://github.com/davidelaverga/Sophia-Agent), which stays the
live application. That repository and its outstanding obligations are not
modified by this one.

**Status:** S1-01 is done (merged). S1-03 is in progress on a development
model route: the control bridge, role presets and the execution-host runtime
supervisor are built and pass their acceptance and adverse checks against the
real pinned dsh loop, a LABELLED fixture Sophia service and a keyless mock
model. Real S1-02 admission and a live-model steer check are still to come
(see [docs/RUNTIME_UNIT.md](docs/RUNTIME_UNIT.md#control-bridge-s1-03)).
Without a Sophia service binding the runtime reports `readiness=not_ready` by
design.

## Read first

- [AGENTS.md](AGENTS.md): the coding-agent contract.
- [docs/pack/00_START_HERE.md](docs/pack/00_START_HERE.md): the v0.4
  implementation pack, the design source of truth.
- [docs/pack/delivery/GOAL_INDEX.md](docs/pack/delivery/GOAL_INDEX.md): the
  goals. S1-02 (admission) and S1-03 (this runtime) are the current work.
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
| TypeScript | 6.0.3 | `packages/dsh-bundle/package.json` |

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
pnpm live:steer                               # real-route steer check; needs OPENAI_API_KEY (exits 2 without it)
pnpm live:steer --rehearse                    # the same check against the keyless mock (never live evidence)
```

The development model route is `openai/gpt-6-luna` at `high` reasoning
through the pinned `@deepseek-ai/dsh-llm-pi-ai` adapter. The credential is
passed by reference (`OPENAI_API_KEY`), never stored. The D13 release
baseline is unchanged.

## Layout (built so far)

```text
package.json / pnpm-lock.yaml / pnpm-workspace.yaml   exact workspace resolution
runtime/dsh/                 @sophia/dsh-runtime: the pinned dsh launcher release
packages/dsh-bundle/         @sophia/dsh-bundle: profile bundle, control bridge, role presets
apps/execution-host/         @sophia/execution-host: runtime supervisor (one dsh per project home)
config/runtime-unit.json     runtime unit: pins and recorded artifact identities
config/dsh/profile/          sophia-runtime profile manifest, lock and literal [] patch
config/{models,roles,supervision}.json   design specimens from the pack (not installed)
scripts/                     toolchain, artifact, profile and gate tooling
tests/unit, tests/integration
tests/support/               LABELLED fixture Sophia service, keyless mock model, test harness
docs/pack/                   v0.4 Part 2 implementation pack (byte-identical import)
docs/evidence/S1-01/         evidence retained from actual runs (S1-03 live evidence pending)
docs/handoffs/               session handoffs per goal attempt
```
