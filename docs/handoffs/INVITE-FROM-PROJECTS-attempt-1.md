# Implementation-session handoff

Goal and attempt: INVITE-FROM-PROJECTS (Luis: «al momento de invitar… que me salga una lista con todos los miembros
del equipo y ahí yo decido a quién invitar»; his choices: people you share projects with, an invitation they accept),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/invite-from-projects` from
`api/goal-owner-date` (stacked: it relies on #352's name kept on opening a project)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `af29e4fa7eb9` (tree `b651d6a7c2d0`), the last commit of `api/invite-from-projects`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 22 files changed against
`api/goal-owner-date` at that commit: `apps/api/src/access.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/goal-targets.ts`, `e2e/invite-from-projects.spec.ts`, `fixtures/invitations-data.ts`, `fixtures/room.tsx`, `src/api/access.ts`, `src/app/theme.css`, `src/features/access/FromYourProjects.tsx`, `src/features/access/InviteSheet.tsx`, `db/migrations/0054_invitable_people.sql`, `docs/plans/invite-from-projects.md`, `packages/contracts/amendments/A26-invite-from-projects.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/goal-targets.ts`, `packages/persistence/src/index.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0054:** `sophia.invitable_people(project)`.
  - It is for an admin only (42501).
  - It lists everyone in the admin's other projects, with the latest address the room keeps for them (their verified
    account name, 0050).
  - It leaves out the admin, the project's members, anyone an open member invitation already reaches, and unknown
    addresses.
- **A26:** `GET /api/v1/projects/{projectId}/invitable`. `/ready` requires 0054.
- **No new write:** each chosen person gets the existing `createInvitation`, with its email, mail and in-app list,
  and only they can accept it.
- **Studio** (`FromYourProjects.tsx`, in the Members tab above the email field):
  - «From your projects» shows a checkbox each, «Invite as» one role, and «Invite N».
  - «Invited N» says what went out. A failed address is named and stays chosen, and its key is kept, so a retry never
    makes a second invitation.
  - Those invited drop out of the list. With nobody to offer, the section isn't there.

## Evidence

- Plan: `docs/plans/invite-from-projects.md`.
- Written first and failing (commit `ebe902dd`):
  - `access.db.test.ts` «people to invite from other projects (A26)»;
  - readiness «without 0054»;
  - `invite-from-projects.spec.ts`. Run without the change, 2 of its 3 cases failed (no list); the third checks
    there's no section when there's nobody to offer.
- **After the change, locally:**
  - `invite-from-projects.spec.ts`: 3/3.
  - Invite members, tabs scale, field scale, press answers, room recap, sheet frame and toast over sheet: 63 + 17.
  - Three corrections came up while running it:
    - the batch role select is labelled «Invite as», so the email form's «Role» stays unambiguous;
    - it is wrapped in the kit's `.field`, at 36 px, as the field-scale rule asks;
    - its checkboxes are sized as Carry's are, after a capture showed them stretched.
  - Type-aware lint over the whole repo, typecheck, Prettier and `contracts:check` are clean.
- **Not run locally:** the DB suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after #352, retargeted to `main`.
- A person is offered only once the room knows their address, which happens when they open a project or join a call.
