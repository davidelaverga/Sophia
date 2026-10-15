# Implementation-session handoff

Goal and attempt: E2E-INVITE-STUDIO (A16: member invitations waiting in the app, the Studio; Luis: «¿y si la persona está activamente in app?»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/pending-invitations` from `api/pending-invitations` (#332)
Writable scope: this worktree only (`apps/studio`, `packages/contracts` validators, `docs/plans`, `docs/handoffs`); no API, no deploy.
Runtime unit: Luis's Windows host; CI as the run on record.
Existing authority: Luis's instruction; merges on green with no open P1, after #332.
Ending commit/tree: `25f3cf8ae2f7` (tree `63c554d9194d`), the last commit of `ui/pending-invitations`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 15 files changed against
`origin/api/pending-invitations` at that commit: `e2e/home-invited.spec.ts`, `fixtures/home.tsx`, `src/api/access.ts`, `src/features/access/InvitedBand.tsx`, `src/features/access/pending-invitations.test.ts`, `src/features/access/pending-invitations.ts`, `src/features/personal/Places.tsx`, `src/features/personal/Welcome.tsx`, `src/features/personal/WorkSpace.tsx`, `src/features/personal/personal.css`, `docs/plans/pending-invitations-studio.md`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`. The review notes below name the commit of each later change.

## Outcome

- **`InvitedBand`** sits at the head of Home (under the greeting) and Work (over the list). It shows one row per
  invitation waiting for the person: «Luis invited you to “Onboarding pilot” as an editor» and Accept. Nothing shows
  when nothing waits.
- **The list** is read every 20 s, as Work's projects are.
- **Accept** posts `POST /api/v1/invitations/{id}/accept`, remembers the welcome as the link does, opens the project
  and reads the projects again. A refusal is said on the row in the API's words. The list is read again either way.
- **The client:** `listPendingInvitations`, `acceptPendingInvitation`, and `parsePendingInvitationList` (the validator
  added to `generate-validators.ts`'s exports).
- **The line** comes from `pending-invitations.ts` (`invitedLine`, `inviterName`), named as the join page names the
  inviter.
- **The Home fixture:** `invited=1` answers the two routes as the API would.

## Evidence

- Plan: `docs/plans/pending-invitations-studio.md`.
- Written first and failing (commit `dbf402f0`): `pending-invitations.test.ts` (no module) and
  `e2e/home-invited.spec.ts`.
- After the change:
  - The unit tests pass (2 new; 1209/1209 in all).
  - `pnpm contracts:check`, Prettier, type-aware lint (whole repo) and typecheck are clean.
- Local Playwright did not run: a heavy app was open with 7.3 GB free, and the guard's RAM floor is not lowered. CI is
  the run on record for `home-invited.spec.ts`.

## Remaining obligations

- Merge #332 first; then CI; Codex with no open P1.
