# Implementation-session handoff

Goal and attempt: FND-B104-TASK-PERSONAL-COMBINED-INTEGRATION-01, attempt 1.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `a5295930…`.
Branch: `integration/task-personal-20261020-b104` from public Task `e23307dd`, with a normal merge of public Personal
`63e96806`. Private; not pushed.

## Composition

The merge-base is Search `abd96292`. The 56 Task paths and 33 Personal paths are byte-identical to their side. Three
paths are composed:

- `apps/studio/playwright.served.config.ts` (the one textual conflict): both served modes are kept.
  `SOPHIA_SERVED_TASKS=1` runs only `human-tasks-served.spec.ts` (Vite with `VITE_SOPHIA_TASKS`).
  `SOPHIA_SERVED_PERSONAL=1` runs only `personal-served.spec.ts` (the launcher, the count file owned by the config
  unless the caller names one). The default ignores both. Personal's `SOPHIA_SERVED_GL` option is kept.
- `apps/api/src/app.ts`: merged in separate hunks. `/ready` keeps Task's A39 function checks and Personal's companion
  readiness, and Task's routes and Personal's close hook are both registered. Because the composed `buildApp` was one
  line over the lint limit, Personal's runner, close hook and routes move unchanged to `registerPersonal`, called at the
  same point.
- `packages/persistence/src/index.ts`: two separate export blocks.

Migrations 0073–0080 are unchanged; 0080's raw sha256 is `94ecf5f0…`. There is no new name, contract or migration.

## Checks on the final source

- First `pnpm check` (logs 20): FAIL at lint, `buildApp` 61 > 60 lines. Fixed as above.
- `pnpm check` (22): exit 0. Units 3682, with 3612 pass and 70 skipped. Integration 110, with 108 pass and 2 skipped.
  Artifacts reproduced.
- Served selector (32): the default lists the four ordinary served specs; Task mode only the human-tasks spec (5);
  Personal mode only the Personal spec (1).
- Served Task mode (41): 5/5.
- Served Personal mode, with the config's own count file (46-owned): 1/1, with 0 `sophia-served-count-*` directories
  before and after.
- Served Personal mode, with a caller-named file (46-caller): 1/1. The caller's file was retained (value 3) and no
  owned directory was left.
- DB files, each alone on a fresh cluster: human-tasks 17/17, personal-live 36/36, personal (keyless) 28/28, search
  13/13.
