# Implementation-session handoff

Goal and attempt: KNOCK-ALERT (hearing a knock at the door; item 3 of Luis's queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/knock-notify` from `main` (no API, not stacked)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `8e942e5716a2` (tree `4f94d05c5d04`), the last commit of `ui/knock-notify`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/knock-alert.spec.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/access/LobbyPanel.tsx`, `src/features/access/knock-alert.test.ts`, `src/features/access/knock-alert.ts`, `src/features/access/useKnockAlert.ts`, `src/features/studio/ProjectShell.tsx`, `docs/plans/knock-alert.md`. The review notes below name the commit of each later change.

## Outcome

- **`knock-alert.ts`** (pure):
  - `arrivals`: who started waiting since the last look;
  - `knockWords`: «Ana Ruiz is asking to join», or «2 people are asking to join».
- **`useKnockAlert`** in `LobbyPanel` (every view), for editors and admins:
  - a chime of two soft notes made with Web Audio, no file;
  - while the tab is hidden and notifications are allowed, a browser notification with the project's name; pressing it
    brings the tab back;
  - those already waiting when the snapshot was read are not news, so the lobby prop is now undefined until it is;
  - a viewer hears nothing.
- **The door** offers «Notify me when someone knocks» once, while the browser has never asked.
- **Fixture:** `window.fixture.knock()`.

## Evidence

- Plan: `docs/plans/knock-alert.md`.
- Written first and failing (commit `49766210`): `knock-alert.test.ts` (no module) and `knock-alert.spec.ts`. The
  spec's stand-ins were later adjusted for lint only: no shadowing, inline nodes, and `addEventListener`.
- **After the change, locally:**
  - `knock-alert.test.ts`: 2/2;
  - knock-alert, lobby-door, dock-header, report and room-phone-floor specs: 91/91;
  - a capture checked the offer in the door's panel;
  - type-aware lint over the whole repo, typecheck and Prettier are clean.

## Remaining obligations

- CI; Codex with no open P1.
- Browsers may hold the chime until the page has had a gesture (autoplay policy); the panel and the tab's title still
  say it.
