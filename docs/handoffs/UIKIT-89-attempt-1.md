# Implementation-session handoff

Goal and attempt: UIKIT-89 (the call's keys from every view; `informe-comandos-20.md` proposal A, Luis: «haz la propuesta A»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/call-keys-anywhere` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no contract.
Runtime unit: Luis's Windows host (local Playwright through `.claude-guards/safe-run.ps1`); CI as the run on record.
Existing authority: Luis's approval of proposal A; merges on green with no open P1.
Ending commit/tree: `9730a0841cbf` (tree `5b4b95fd4f7e`), the last commit of `ui/call-keys-anywhere`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/call-keys.spec.ts`, `src/features/personal/PlacesBar.tsx`, `src/features/voice/MiniDock.tsx`, `src/features/voice/call-commands.test.ts`, `src/features/voice/call-commands.ts`, `docs/plans/call-keys-anywhere.md`. The review notes below name the commit of each later change.

## Outcome

- Wherever the call's switches show beyond the dock (the mini dock on every project view but the Studio's, and the
  places' bar), their keys and commands come with them, as the switches there allow:
  - the microphone on Ctrl+D (⌘D) both ways, as its switch there goes;
  - «Camera off» on Ctrl+E and «Stop sharing the screen» on Ctrl+Shift+E, only while on;
  - «Leave the room» in the palette.
- The switches' tips there show the keys. Joining and starting the camera or a share stay the room's.
- A sheet's call row registers nothing, since the mini dock under it already does.
- `callCommands` (`voice/call-commands.ts`, pure) builds them. `RoomSwitches` takes `keys` (the mini dock passes it);
  `PlacesBar`'s call pill uses the same builder.
- The `also` words (#325) are left out here, so this branch stands on main alone. They can be added once #325 lands.

## Evidence

- Plan: `docs/plans/call-keys-anywhere.md`.
- Written first and failing (commit `12953926`): `call-commands.test.ts`, failing for want of the module, and
  `e2e/call-keys.spec.ts`. Before the fix, Ctrl+D in Tasks left the microphone on; the palette had no «Microphone
  off»; the tip had no key. «Ctrl+E with the camera off starts nothing» held before and after: it is the rule's guard.
- After the fix:
  - Unit tests 1203/1203. Prettier, type-aware lint (whole repo) and typecheck clean.
  - Local Playwright through the guard, 2 workers:
    - `call-keys` 5/5, twice each (`--repeat-each=2`);
    - with `dock-header` and `commands`, 33/34. The one failure was my test's wait after an in-app move to Tasks
      (`DRAWN.tasks` waits for the research card); it now waits for the Tasks heading.
  - Control mutant (`useCommands(callCommands(…))` commented out in `MiniDock`): the Ctrl+D case fails on the
    microphone's state.

## Remaining obligations

- CI; Codex with no open P1.
