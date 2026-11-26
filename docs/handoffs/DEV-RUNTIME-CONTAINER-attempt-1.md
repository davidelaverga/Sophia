# Handoff: the dev stack's runtime in a Linux container on Windows, attempt 1

Goal and attempt: DEV-RUNTIME-CONTAINER (`docs/plans/dev-runtime-container.md`; Luis 2026-11-26, «Arregla el
runtime para que corra en Windows», then «Sí, en contenedor»), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `dev/runtime-container` from
`origin/main` `1658cd175`.
Ending commit/tree and changed files: `scripts/lib/runtime-container.ts` (new), `scripts/runtime-container.mjs`
(new), `scripts/dev-stack.ts`, `tests/unit/runtime-container.test.mjs` (new), the note and this record.

## Outcome

On Windows, `pnpm dev -- --runtime rehearse|live` now starts the dsh runtime in a Linux container
(`node:24.21.0-bookworm-slim`, pinned by digest) instead of failing at its first step. The container builds its
own copy of the checkout with git's file modes, reproduces every recorded artifact identity, and binds to the
host's API through `host.docker.internal`. It goes away with the stack, however the stack is stopped. On Linux and
macOS nothing changes. The runtime, its supervisor and its checks are untouched.

## Evidence

- Unit, the real stack's measurements and what could not be shown: the note's last section.
- `prettier --check` on the changed files, the repository's type-aware lint and `pnpm typecheck` return 0.

## Decisions and changes

- A container, not a native port (Luis's pick): the runtime admits `linux-x64` and `darwin-arm64` only, and its
  reply child, process groups and PATH are Linux's.
- The container works on a copy in a named volume, not on the bind mount: the Windows mount shows every file as
  executable, and the tree digest hashes that bit.
- Variables pass by name (`-e NAME`), never as values in the command line.
- The container's input is its lifeline: a stop that kills the process tree runs no handler.

## Remaining obligations

- The PR is not merged.
- No Studio action reaches the runtime in a `--runtime rehearse` stack on current main (the note says why). That is
  for the runtime's owners; nothing here changes it.

## Next bounded action

Luis reviews the PR.

Source IDs consulted: `scripts/dev-stack.ts`, `scripts/runtime-host.mjs`, `scripts/lib/common.mjs`,
`scripts/lib/profile.mjs`, `scripts/lib/tree-digest.mjs`, `scripts/build-artifacts.mjs`, `scripts/lib/livekit.ts`,
`apps/execution-host/src/runtime-supervisor.ts`, `packages/dsh-bundle/src/executor-identity.ts`,
`packages/dsh-bundle/src/reply-child.ts`, `docs/evidence/S1-05A/checkpoint-B.md`, `apps/api/src/routes/conversations.ts`.
