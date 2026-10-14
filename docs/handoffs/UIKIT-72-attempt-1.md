# Implementation-session handoff

Goal and attempt: UIKIT-72 (Invite opens where you are; `informe-equipo-20.md` findings 2–4; Luis: «Sí, empieza con la
PR 1»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/invite-members` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; the Studio's preview in the app's browser pane); CI as the run on
record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; one review round, then P2s to the
follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `f185381f933d` (tree `f0a90ed10960`), the last commit of `ui/invite-members`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 11 files changed against
`origin/main` at that commit: `e2e/invite-members.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/invitations-data.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/access/InviteSheet.tsx`, `src/features/access/access-view.test.ts`, `src/features/access/access-view.ts`, `src/features/access/useAccess.ts`, `src/features/studio/ProjectShell.tsx`, `docs/plans/invite-members.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/invite-members.md`. Invite opens on Members for an admin out of a call, on Guests in a call or for
  anyone else (`firstInviteTab`); the member's form says what the role chosen may do in one line (`ROLE_NOTE`); the
  demo answers invitations as the API does (made, listed, sent again, cancelled; `fixtures/invitations-data.ts`), and
  takes `role=editor`.
- The sheet learns the call from its opener: `SheetContext.inCall`, set where the project shell opens it.

## Evidence

- Written first and failing (`a17191b1`): `firstInviteTab` and `ROLE_NOTE` in `access-view.test.ts`;
  `e2e/invite-members.spec.ts` (an admin on Members, the role's line for each role, an invitation sent and listed; in a
  call on Guests; an editor on Guests); the fixture's invitations and its `role=editor`.
- Unit suite: # pass 1172 # fail 0 ; Prettier, type-aware lint and typecheck clean.
- On the preview (the app's browser pane): Invite opened on Members with «Editors work on the goals and tasks, and
  invite and let in guests.»; ana@example.test sent and listed as «editor · email sent» with Copy link, Send again and
  Cancel; Cancel asked first and folded it under «1 closed».
- Local Playwright did not run (a heavy app was open; the guard refuses to start); CI is the run on record.
- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: the Invite sheet's first tab, a line under the member's role, the demo's invitations. Preserved: every tab,
  the guests' link and lobby, the calendar, who may invite whom.
- Not here, asked of Davide: the members' list, a role changed or a member removed, who accepted an invitation and
  when (`informe-equipo-20.md` findings 1 and 6).
- Instruction applied: Luis, 2026-10-13, «Sí, empieza con la PR 1 y prepara el issue».
- Authority: not widened.

## Remaining obligations

- CI on the PR; Codex with no open P1 before merge.

## Next bounded action

PR 2: the newcomer's welcome, once, when a project just accepted opens (who invited them and as what, what the project
is for, its goals and what waits on them, one press to start).
