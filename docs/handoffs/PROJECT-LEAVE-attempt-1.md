# Implementation-session handoff

Goal and attempt: PROJECT-LEAVE (a member leaves a project; the second piece of point 1 of the gaps report; Luis:
«Sigue con los puntos del informe que necesitan API»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/project-leave` from `api/project-rename`
(stacked on the rename PR, whose header menu it extends)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `d31d17718601` (tree `5a7dad0b5c07`), the last commit of `api/project-leave`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 26 files changed against
`api/project-rename` at that commit: `apps/api/src/access.db.test.ts`, `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/projects.ts`, `e2e/project-leave.spec.ts`, `e2e/project-rename.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/api/client.ts`, `src/app/theme.css`, `src/features/studio/ProjectName.tsx`, `src/features/studio/ProjectShell.tsx`, `db/migrations/0052_project_leave.sql`, `docs/handoffs/PROJECT-LEAVE-attempt-1.md`, `docs/plans/project-leave.md`, `packages/contracts/amendments/A21-project-leave.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/projects.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0052:** `sophia.leave_project(project, key)`.
  - Any active member may leave (42501 otherwise), except the last active admin (40001 → 409 `invalid_state`).
  - It is idempotent per actor and key in `sophia.project_departures`. A replay answers the same receipt, though the
    person is no longer a member.
  - It sets the membership inactive (its revision bumped), bumps `audience_revision`, and emits
    `project.member_left`.
  - A new invitation sets the membership active again: accepting an invitation already does this since 0010.
- **A22:** `POST /api/v1/projects/{projectId}/leave`, with `ProjectLeaveRequest` `{}` and `ProjectLeft`. A19 and A20
  are proposals to Davide in #105, and the rename took A21. `/ready` requires the function.
- **Studio:**
  - The header's menu «Project» opens for every member: «Rename…» for an admin, «Leave project…» for anyone.
  - The sheet «Leave project» says what leaving means, with the focus on Cancel.
  - Once left, a call in the room ends, the person goes to Work, and the projects' list is read again.
  - When refused, the sheet stays and shows the API's reason.

## Evidence

- Plan: `docs/plans/project-leave.md`.
- Written first and failing (commit `41393520`):
  - `api.db.test.ts` «leaving a project (A22)»;
  - `access.db.test.ts`: someone who left comes back by invitation;
  - readiness «without 0052»;
  - `project-leave.spec.ts`. Run without the change, all 3 cases failed (no «Leave project…»).
- **After the change, locally:**
  - leave, rename, widths and call-keys specs: 26/26;
  - type-aware lint over the whole repo, typecheck, Prettier and `contracts:check` are clean.
- **Not run locally:** the DB suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after the rename PR, retargeted to `main`.
- **Not done:** handing the admin role over. Until it exists, the only admin of a project can't leave it. Archiving,
  the next piece, gives them a way out.

## Review notes

- `d31d1771`: the sanitizer knows `project.member_left` (the rename PR's CI found the same gap for `project.renamed`).
- `9b599293` (the merge of the rename branch): the amendment was renumbered to A22, because A19 and A20 are already proposals to Davide in #105 and the rename took
  A21.
- `82acf428`, the Codex round on #349:
  - **P1, room access after leaving:** leaving now records a removal in `room_removals`, as A07 does for a guest
    (reason `left`, no lobby entry). The worker settles it on the room server's evidence and keeps watch for 630 s,
    so a token issued before can't bring them back.
  - The API tries once right after leaving, reading the caller's own removal through `own_departure_removal`.
  - Coming back by a new invitation cancels the removal: `accept_room_invitation` is replaced in 0052.
    `settle_room_removal` is replaced so that only a guest's removal moves a lobby entry.
  - **P2:** the join event carries the membership's real revision.
  - **P2:** `project.member_left` has its own summary code and label («Member left»), which the sanitizer knows.
  - **P2:** the Studio drops the cached membership on leaving.
  - Tests: the DB cases assert the removal, its cancelling on return and the events' revisions; `labels.test.ts`
    passes 4/4. Locally, the leave and rename e2e pass 6/6, and lint and typecheck are clean. The DB suites run in CI.
