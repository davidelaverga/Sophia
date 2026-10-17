# Implementation-session handoff

Goal and attempt: PREJOIN-TOGGLES (the microphone and the camera chosen before joining; item 3 of Luis's queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/prejoin-toggles` from `main` (no API, not stacked)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `17733085dd61` (tree `d8a51ccc6908`), the last commit of `ui/prejoin-toggles`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/device-check.spec.ts`, `src/app/theme.css`, `src/features/voice/DeviceCheck.tsx`, `src/features/voice/RoomDock.tsx`, `docs/plans/prejoin-toggles.md`. The review notes below name the commit of each later change.

## Outcome

- **`DeviceCheck`:** «Microphone» and «Camera» switches on the picture, each with `aria-pressed`.
  - The microphone starts as the next join would (this device's last choice) and is kept with `rememberMic`, as the
    dock's own switch keeps it.
  - The camera starts off.
  - The preview follows them by disabling tracks: the meter rests, and the picture says «Your camera is off». The
    browser is never asked again.
  - With access refused, the picture only says how to give access.
- **`RoomDock`:** Join from the sheet enters with that microphone, then turns the camera on when it was chosen.

## Evidence

- Plan: `docs/plans/prejoin-toggles.md`.
- Written first and failing (commit `ec103cdd`): a case in `device-check.spec.ts` (no switches).
- **After the change, locally:**
  - device-check, call-devices and room specs: 16/17. The refused case still expected the picture's words alone, so
    the switches now hide when access is refused.
  - after that change: device-check and call-devices 10/10;
  - captures checked the camera-off and camera-on states;
  - type-aware lint over the whole repo, typecheck and Prettier are clean.

## Remaining obligations

- CI; Codex with no open P1.
