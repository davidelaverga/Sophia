# Implementation-session handoff

Goal and attempt: FOLLOWUPS-DOOR-NOTES (the Codex P2s left on #362 and #363), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/followups-door-notes` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `146a5ee8d57f` (tree `e3718653765a`), the last commit of `ui/followups-door-notes`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 7 files changed against
`origin/main` at that commit: `e2e/knock-alert.spec.ts`, `e2e/personal-notes-write.spec.ts`, `fixtures/personal.tsx`, `src/features/access/LobbyPanel.tsx`, `src/features/access/useKnockAlert.ts`, `src/features/personal/NotesPanel.tsx`, `src/features/personal/personal.css`. The review notes below name the commit of each later change.

## Outcome

- **`useKnockAlert`:** the first look is the baseline. While the role is unread, or can't answer, the look doesn't
  move on, so a knock meanwhile is still news once the role can answer.
- **`LobbyPanel` (`NotifyOffer`):** asking once is remembered on the device (`sophia.knock.notify.asked`). A prompt
  closed without a choice leaves the permission «default», and the offer doesn't come back.
- **`NotesPanel`:** «Write a note…» shows once the notes are read, and a note on its way says «Keeping…».
- **Fixture:** `keepSlow=1` on Personal.

## Evidence

- These are the Codex P2s from `evaluacion-2026-10-13/follow-ups-p2.md`; the plans are knock-alert.md and
  personal-notes-write-find.md.
- Written first and failing (the commit before the fix): two cases in `knock-alert.spec.ts`, one in
  `personal-notes-write.spec.ts`.
- **After the change, locally:**
  - knock-alert, lobby-door, personal-notes-write, personal-forget-note and personal-carry specs: 35/35;
  - typecheck and type-aware lint are clean.

## Remaining obligations

- CI; Codex with no open P1.
