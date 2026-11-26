# On Windows, the dev stack runs the runtime in a Linux container

> 2026-11-26 · Luis, after the local stack came up without its runtime on his Windows host: «Arregla el runtime para
> que corra en Windows». Of a native port and a Linux container, he chose «Sí, en contenedor». Dev stack only; the
> runtime, its supervisor and its checks are unchanged.

## What was measured

- `node scripts/dev-stack.ts --runtime rehearse` on Windows (main `1658cd175`) starts the API, the worker, the media
  bridge and the Studio, but the runtime host stops at its first step: no `win32-x64` artifact is recorded
  (`assertRecordedArtifacts`). With one recorded locally, `dsh plugin install` dies on `spawn cmd.exe ENOENT`.
- The runtime is Linux and macOS by design. The executor identity admits only `darwin-arm64` and `linux-x64`. The
  reply child refuses to start outside Linux. Installs are stopped and proven gone as a process group
  (`kill(-pid)`), which Windows lacks. The launch PATH is `/usr/bin:/bin`. A native port would loosen these checks.
- In `node:24.21.0-bookworm-slim` (`sha256:d6aa754f…`), from the same checkout, `pnpm install --frozen-lockfile`,
  `pnpm build` and `scripts/build-artifacts.mjs` take about 30 s. Every recorded identity is reproduced once the git
  file modes are restored. Through the Windows bind mount, every file looks executable, and `sophia-tree-v2` hashes
  the executable bit: copied as they come, two identities differ.
- From that container, `host.docker.internal` reaches a server listening on the host's `127.0.0.1` (200).
  `--network host` does not.

## What changes

- **On Windows, `startRuntime` launches the runtime in a container** (`sophia-dev-runtime`) instead of
  `node scripts/runtime-host.mjs`. Elsewhere, nothing changes.
- **The container works on its own copy.** The checkout is mounted read-only. The files git knows (tracked, plus
  untracked ones that aren't ignored) are copied into a named volume (`sophia-dev-runtime`), with the mode git
  records: 755 for `100755`, 644 otherwise. Files left from an earlier copy are removed first, except `node_modules`.
  Then the container installs pnpm 11.7.0, runs `pnpm install --frozen-lockfile` (its store kept in the volume),
  `pnpm build` and `scripts/build-artifacts.mjs`, and starts `scripts/runtime-host.mjs`. An identity that doesn't
  reproduce stops it there, as on Linux.
- **The same binding.** The runtime reaches the API at `http://host.docker.internal:8787`. Its token, project and
  credential variables pass by name (`-e NAME`), never as values in the command line. Its data stays outside the
  tree, in the volume (`/work/root/<project>`).
- **Lifecycle.** A container left from an earlier run is removed before the start, and removed again when the stack
  stops by its own handler. A stop that kills the process tree runs no handler, and the container would outlive it.
  So the manifest is only the first line of the container's input, and the input stays open. When it closes, the
  dev stack is gone however it stopped: the container stops the runtime host, and `--rm` removes it. `--init`
  passes signals on.
- The pure parts go in a new `scripts/lib/runtime-container.ts`: the platform choice, the copy manifest from git's
  answers, the container's arguments and the credential names a unit needs. The impure start sits beside them, as
  in `livekit.ts`.

## Checks, written first

- **Unit** (`tests/unit/runtime-container.test.mjs`):
  - Windows runs in a container; Linux and macOS don't.
  - The manifest keeps `100755` as 755, everything else as 644. Untracked files are 644, and no path appears twice.
  - The arguments mount the checkout read-only and the volume, name and remove the container, pass `--init`, and
    pass every environment name with no value. No value from the environment appears in them.
  - The credential names are the unit's model route, model routes and research sources, without repeats.
  - Red before: no such module.
- **Real stack, Windows**: `--runtime rehearse --voice rehearse` comes up with the runtime ready against the API.
  Every artifact identity is reproduced, and the runtime asks the API for its commands. Killing the stack leaves no
  `sophia-dev-runtime` container.
- `prettier --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## What was measured after

- Unit: `runtime-container.test.mjs` 6 of 6, red before (no module). On this Windows host, `tests/unit` fails 228
  tests with or without this change, the same ones; CI on Linux is the record for the suite. `pnpm typecheck`
  (scripts included) and the repository's type-aware lint: 0.
- Real stack on Windows, main `1658cd175` plus this change, `--runtime rehearse --voice rehearse`:
  - The container copied 4,445 files, installed, built and reproduced every artifact identity. The profile was
    installed, and the runtime reported `ready against http://host.docker.internal:8787` (rehearsal).
  - The API logs the runtime's long poll, `GET /v1/runtime/commands?waitMs=20000`, every 20 s, its capability
    accepted.
  - The stack killed as the desktop app stops it: the container stopped and was gone in about 4 s. Before the
    input was kept open, it was still up a minute later.
- Not shown here: a task answered by the mock model through the Studio. On current main, no Studio action sends
  work to the runtime in a `--runtime rehearse` stack. Briefs are retired (`POST …/native-tasks` answers
  `native_task_retired`). Conversation replies need `SOPHIA_CONVERSATIONS`, operator SQL for settings and a grant,
  and a runtime that advertises `sophia-conversation-v1`, which only `--service-overlay` gives and which
  `runtime-host.mjs` refuses with `--rehearse`. Research is started only by live voice tools. Edits and PDF retries
  need an earlier report. The header of `dev-stack.ts` still says rehearse «exercises the whole brief path». That is
  unchanged here; it is a question for the runtime's owners.
