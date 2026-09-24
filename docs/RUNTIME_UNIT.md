# The sophia-runtime unit

The runtime unit is the set of things that must change together:

- the dsh release;
- the Sophia bundle;
- the profile composition;
- the toolchain;
- the recorded identities of each.

The record is [`config/runtime-unit.json`](../config/runtime-unit.json). This
page explains what each identity means and how a second checkout proves it.

## Identities

| Identity | Recorded as | Produced by | Meaning |
|---|---|---|---|
| Workspace lock | `workspace_lock_sha256` | `pnpm install` (committed) | The exact resolution of every workspace dependency, including the dsh closure with sha512 integrity per package |
| dsh release | `dsh.release_integrity` | npm registry, via the lock | sha512 of `@deepseek-ai/dsh@0.1.7-rc.1` and `@deepseek-ai/dsh-base@0.1.7-rc.1`. The same values the registry serves for tag `dsh-v0.1.7-rc.1` = `46a7f68b` |
| Runtime artifact | `dsh.artifacts_by_platform.<platform>.digest` (`sophia-tree-v2:sha256:…`); `dsh.artifact_digest` repeats the primary platform's (`linux-x64`, the execution host) | `pnpm deploy --prod` of `runtime/dsh` into `.artifacts/runtime` | Content digest of the deployed launcher tree. Only files and symlinks count. Empty directories are scratch space: install scripts leave `node_modules/.tmp` on some hosts, and the GitHub runner exposed this with v1. It also excludes `.bin` shims (they embed the install path), pnpm install-time bookkeeping and the deploy-local `pnpm-lock.yaml` (it embeds the source checkout's absolute `file:` URLs), so it is location- and host-independent |
| Bundle archive | `sophia_bundle.archive_sha256`, `archive_integrity`, `artifact_digest` | `pnpm pack` of `packages/dsh-bundle` | Byte-reproducible tarball: fixed mtime, uid 0, the pinned Node zlib |
| Profile lock | `config/dsh/profile/pnpm-lock.yaml` | `pnpm install --lockfile-only` over the committed profile manifest | Pins the bundle archive's sha512, so `--frozen-lockfile` rejects other bytes at install time |

The runtime artifact is **per platform**. It contains native prebuilds
(koffi, node-pty) and platform-optional packages. Only `linux-x64` is
recorded. On another platform, `pnpm artifacts` reports `UNRECORDED` and
exits 1 rather than comparing against the wrong platform or passing silently.
Record that platform's digest with `pnpm artifacts:record` in a reviewed
commit. The bundle archive and both locks are platform-independent. The
archive's byte identity on other platforms (same Node, possibly a different
zlib code path) has not been observed yet. Its integrity check will report
any difference.

`sophia_bundle.source_commit` stays null inside the repository. A commit
cannot contain its own hash. The release tag records it, and
`pnpm artifacts` proves that any checkout reproduces the recorded archive
bytes.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm artifacts            # build both artifacts; compare every identity; exit 1 on any mismatch
pnpm artifacts:record     # only when you intend to change an identity; commit the diff with the cause
```

## Installing and booting the profile

```bash
pnpm profile:install [--home <dir>] [--force] [--boot <seconds>] [--evidence <dir>]
```

1. Refuses unless the built artifacts equal the recorded identities.
2. Writes the committed profile manifest, `pnpm-workspace.yaml`, lock, the
   literal `[]` profile patch and the archive into
   `<home>/dsh-home/profiles/sophia-runtime/`.
3. Runs the upstream-supported
   `dsh plugin --profile sophia-runtime install --frozen-lockfile --offline`
   from the runtime artifact.
4. Runs the composition gate (below), including the trusted
   `dsh --profile sophia-runtime --dump-config`.
5. With `--boot N`, launches `dsh --profile sophia-runtime` for N seconds.
   It captures stderr, the Sophia bridge line and any
   `$DSH_HOME/logs/startup-*.log` full diagnostics.

The launch environment is fully explicit (`scripts/lib/common.mjs` →
`sanitizedEnv`). It sets:

- a per-install `DSH_HOME`;
- a throwaway `HOME`;
- a `TMPDIR` inside the install. dsh's `spill-local` creates `dsh-spill-*`
  under the process temp dir, which would otherwise be the shared system
  `/tmp`;
- `DSH_TELEMETRY_DISABLED=1`;
- `PATH` set to the node directory, the directory of the pinned `pnpm`
  (found on the caller's `PATH`; `dsh plugin` needs it), and `/usr/bin:/bin`.

It carries no credentials and no proxy variables, and runs in an empty
working directory, so no invoking-directory `.env` is read. The default home
is `<tmpdir>/sophia-next/<unit id>`, outside the product tree.

## The composition gate

The runtime's `--dump-config` exit code is not a verdict (see
[SOURCE_MAP §3](SOURCE_MAP.md#3-facts-learned-at-the-pin-not-in-the-pack)).
The gate (`scripts/lib/gate.mjs`) fails unless every check below passes.
`pnpm profile:verify` and `pnpm profile:install` first refuse the wrong
toolchain or a runtime artifact or bundle archive other than the recorded ones.

| Check | Rejects |
|---|---|
| `profile_manifest` | Bundles other than exactly `[@deepseek-ai/dsh-base, @sophia/dsh-bundle]`, or extra dependencies |
| `bundle_installed` | Missing bundle, wrong name or version, a dsh peer other than the pinned version, no `dsh.bundle.patch`, an archive missing from the profile or differing from the record, or installed files that differ from a clean extraction of that archive (the dump sees composition, not the bridge code) |
| `patch_layers` | Empty or comments-only layers, an empty bundle layer, unmatched or duplicate rows, a non-empty profile patch, a home-level patch |
| `no_bundle_shadowing` | Any `@sophia/dsh-bundle` reachable from the dsh installation's ancestors |
| `dump_config` | A nonzero dump, or any stderr line (classified as `bundle_missing`, `bundle_incompatible`, `patch_comments_only`, `patch_unmatched_row`, …) |
| `composition` | Missing or invalid `sophia-control-bridge` row; one of the four required disables not applied by the bundle; anything but exactly one `agent-loop` from dsh-base; an app-surface root loop (`webserver`, `headless-runner`, `acp`, `sdk-jsonrpc-server`, `modules`, `connection`); any row from another layer; a row set other than base inserts plus Sophia inserts |

**Health** is separate from composition. It requires a verified composition
and a bridge that reports `ready`. The S1-01 bridge always reports
`not_ready`, so every S1-01 runtime is unhealthy by design. The reasons list
keeps "composition failed" distinct from "bridge not implemented".

## Upgrading dsh

A dsh upgrade is a new runtime unit, never an in-place edit:

1. Change the pin in `config/runtime-unit.json`, `runtime/dsh/package.json`
   and the bundle's `peerDependencies` together.
2. Re-read DSH-03/04 at the new commit. Row ids and skip behavior may change,
   and the patch lint and gate encode them.
3. `pnpm install`, then `pnpm artifacts:record`, then `pnpm check`. Then run
   `pnpm dsh:source --verify-release` against the new tag.
4. Keep the previous unit available to drain existing sessions
   (02_DSH_BOOTSTRAP §10).
