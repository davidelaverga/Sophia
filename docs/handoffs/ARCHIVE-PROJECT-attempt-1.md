# Implementation-session handoff

Goal and attempt: ARCHIVE-PROJECT (an admin archives a project, or brings it back; Luis's queue item 2), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `api/archive-project` from `api/remove-member`
(#356, the end of the A21–A29 stack, with main merged down it)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no hosted migration.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); DB tests in CI
(Docker is down here).
Existing authority: Luis's queue; merges on green with no open P1, after #356.
Ending commit/tree: `a71943c3f6a9` (tree `859958f71744`), the last commit of `api/archive-project`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 34 files changed against
`origin/api/remove-member` at that commit: `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/projects.ts`, `e2e/archive-project.spec.ts`, `e2e/project-leave.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `fixtures/work-space.html`, `fixtures/work-space.tsx`, `src/api/client.ts`, `src/api/personal.ts`, `src/app/theme.css`, `src/features/personal/Places.tsx`, `src/features/personal/WorkSpace.tsx`, `src/features/personal/personal.css`, `src/features/studio/ActivitySheet.tsx`, `src/features/studio/Archive.tsx`, `src/features/studio/ProjectName.tsx`, `src/features/studio/ProjectShell.tsx`, `src/features/work/labels.ts`, `db/migrations/0059_archive_project.sql`, `docs/plans/archive-project.md`, `packages/contracts/amendments/A30-archive-project.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/project-list.ts`, `packages/persistence/src/projects.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0059:** `projects.archived_at`, a `project_archives` ledger, and
  `sophia.set_project_archived(uuid,boolean,text)`.
  - Admins only, idempotent per actor and key.
  - A change emits `project.archived` or `project.unarchived`; asking for the state it already has emits nothing.
- **Amendment A30,** backward compatible:
  - `GET /api/v1/projects` leaves archived projects out, and `ProjectSummary` is unchanged, so an open Studio from
    before reads it fine (the #336 lesson);
  - `GET /api/v1/projects/archived` returns a `ProjectList`;
  - `POST /api/v1/projects/{id}/archive` takes `{ archived }` and returns `ProjectArchived`.
- **Persistence:** `setProjectArchived`; `listProjects(c, bounds, archived)`.
- **API:** `archiveRoutes`.
- **Readiness predicate**, and the sanitizer's event types and summary codes.
- **Studio** (`features/studio/Archive.tsx`):
  - `ArchiveSheet`, from «Archive project…» in the menu, for admins. After it, the call ends and Work opens, through
    the same `onLeft` that leaving uses.
  - `ArchivedLine` shows on every view of an archived project, with Unarchive for admins.
  - Work's `ArchivedFold`, «Archived (n)».
  - `useArchivedProjects` and `useUnarchive`.
  - Activity and pulse wording.
- **Fixtures:**
  - `archived=1` on the room;
  - the fixture API's archive and archived-list routes;
  - `work-space.html`, a new page that draws `WorkSpace` with fixed props.

## Evidence

- Plan: `docs/plans/archive-project.md`.
- **Written first and failing:**
  - `414f7dc1`: `api.db.test.ts` «archiving a project», `readiness.db.test.ts` without 0059,
    `archive-project.spec.ts`, and the leave spec's menu;
  - `705e8faa`: Work's fold.
- **After the change, locally:**
  - archive, leave, rename, activity, member-roles, remove-member, room, work, home, app-auth and commands specs:
    275/275;
  - contracts:check;
  - typecheck and type-aware lint are clean;
  - the API's unit tests: the only failures are the byte-store suites that fail on Windows alone, which this change
    doesn't touch;
  - captures checked the line, the sheet and the fold. The fold first landed outside Work's column, so it moved
    inside the list.
- **DB tests** run in CI only, since there is no Docker here.

## Remaining obligations

- #356 merges first; this then goes on main.
- CI; Codex with no open P1.
- Hosted: 0059 applies with the stack's 0054–0058.
