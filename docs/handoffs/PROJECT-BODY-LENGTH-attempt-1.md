# Implementation-session handoff

Goal and attempt: PROJECT-BODY-LENGTH (main's lint, red since #368 merged), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `fix/project-body-length` from `origin/main`
(`0fd3c915`)
Writable scope: this worktree only (`apps/studio/src/features/studio/ProjectShell.tsx`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `5e6fde863b36` (tree `2396ce7b3993`), the last commit of `fix/project-body-length`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 1 files changed against
`origin/main` at that commit: `src/features/studio/ProjectShell.tsx`. The review notes below name the commit of each later change.

## Outcome

- Main's lint passes again: `ProjectBody` is back under 60 lines.
- The door and the archived project's line over it are their own component, `ProjectDoor`: the same elements, in the
  same place, on every view.

## Evidence

- **Main at `0fd3c915`:** the `runtime-unit` job failed on `pnpm lint`: «The function `ProjectBody` has too many lines
  (63). Maximum allowed is 60.» (run 38999920343).
  - #416 (the view boundary) and #368 (the archived line) each added lines and passed alone.
- **After the change, locally:**
  - `pnpm lint`: exit 0;
  - Studio typecheck and Prettier: clean;
  - `archive-project` and `lobby-door`: 12/12.

## Decisions and changes

- **The door is the piece taken out:** it's the one block that only passes props on, so nothing else in
  `ProjectBody` moves.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1. Every PR that merges main after this one gets a green lint again.
- Source IDs consulted: none from the source register; the work read this repository only.
