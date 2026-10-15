# Implementation-session handoff

Goal and attempt: DEVICE-CHECK (a person checks their camera and microphone before joining; Luis: «Procede»), attempt
1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/device-check` from `ui/call-devices` (#340),
which it builds on
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `e4efc93effe8` (tree `0ace7c8c8eef`), the last commit of `ui/device-check`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`origin/ui/call-devices` at that commit: `e2e/call-devices.spec.ts`, `e2e/device-check.spec.ts`, `src/app/theme.css`, `src/features/voice/DeviceCheck.tsx`, `src/features/voice/DeviceMenu.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/device-check.test.ts`, `src/features/voice/device-check.ts`, `src/features/voice/useDevicePreview.ts`, `docs/plans/device-check.md`. The review notes below name the commit of each later change.

## Outcome

- `device-check.ts`: the voice's level from the microphone's samples, in steps, and the constraints asked for.
- `useDevicePreview.ts`: the chosen camera and microphone, asked for again when one is chosen and let go on close, and
  the meter's level.
- `DeviceCheck.tsx`, a sheet, opened by `CheckOpener` beside the dock's Join:
  - the mirrored picture;
  - the rows (Microphone with its meter, Speaker where the browser can choose one, Camera), each a `DeviceChoice`
    over the kit's menu;
  - **Join the room**.
  - The sheet is portalled to the page: the dock's blur would hold a fixed sheet inside its own box.
- `DeviceMenu.tsx` shares its reading and its items with `DeviceChoice`. The dock's menus pass what was chosen.
- The opener beside Join now opens the check in place of #340's menu; `call-devices.spec.ts` chooses the camera there.

## Evidence

- Plan: `docs/plans/device-check.md`.
- Written first and failing (commit `88c4d67e`):
  - `device-check.test.ts`;
  - `device-check.spec.ts`, with the camera and microphone stood in for by a painted canvas and a steady tone, every
    request recorded;
  - the camera case in `call-devices.spec.ts`, moved to the check.
- After the change:
  - `device-check.spec.ts` and `call-devices.spec.ts` pass 9/9.
  - The room, dock, call, keys, control-height, menu, join, light-stage and voice-chat specs pass 366/366 locally.
  - Studio unit tests: 1226 pass.
  - Type-aware lint over the whole repo, typecheck and Prettier are clean.
- Capture of the sheet on the room's fixture: `evaluacion-2026-10-15/device-check/check-sheet.png` (taken before the
  rows' last alignment fix: the microphone's row now lines up with the others).

## Remaining obligations

- CI; Codex with no open P1. Retarget to `main` once #340 merges. The third piece, backgrounds, follows.
