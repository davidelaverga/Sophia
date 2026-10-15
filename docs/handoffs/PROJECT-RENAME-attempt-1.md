# Implementation-session handoff

Goal and attempt: PROJECT-RENAME (an admin renames a project; the first piece of point 1 of the gaps report; Luis:
«Sigue con los puntos del informe que necesitan API»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/project-rename` from `main`
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `67b859607576` (tree `e3b36264b27f`), the last commit of `api/project-rename`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 23 files changed against
`origin/main` at that commit: `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/projects.ts`, `e2e/project-rename.spec.ts`, `fixtures/fixture-api.ts`, `src/api/client.ts`, `src/app/theme.css`, `src/features/studio/ProjectName.tsx`, `src/features/studio/ProjectShell.tsx`, `db/migrations/0051_project_rename.sql`, `docs/handoffs/PROJECT-RENAME-attempt-1.md`, `docs/plans/project-rename.md`, `packages/contracts/amendments/A21-project-rename.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/projects.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0051:** `sophia.rename_project(project, title, key)`.
  - It is for an admin only (42501), with a title of 1–180 characters that isn't spaces alone (22023).
  - It is idempotent per actor and key in `sophia.project_renames`, as `create_project` is.
  - It holds the project's row, bumps `projects.title_revision`, and emits `project.renamed`.
- **A21** (A19 and A20 are proposals to Davide in #105): `POST /api/v1/projects/{projectId}/title`, with `ProjectRenameRequest` and `ProjectRenamed`. `/ready`
  requires the function.
- **Persistence and API:** `renameProject`, and its route next to `createProject`'s.
- **Studio:**
  - For an admin, the header's title is a press that opens the menu «Project». Its «Rename…» opens the sheet «Rename
    project» (`ProjectName.tsx`). The sheet's key stays the same across retries.
  - Once saved, the snapshot and the projects' list are read again.
  - Other members see the words alone. A long title gives way before the views do.
  - Other members' feeds read the new title through the event: any applied event refreshes the snapshot.

## Evidence

- Plan: `docs/plans/project-rename.md`.
- Written first (commit `933e87e2`):
  - the API cases in `api.db.test.ts`;
  - the readiness step «without 0051»;
  - `project-rename.spec.ts`.
- **After the change, locally:**
  - `project-rename.spec.ts`: 3/3, with the long-title case added after a capture showed the button needed its own
    truncation.
  - `widths.spec.ts` and `app-auth.spec.ts`: they pass.
  - Type-aware lint over the whole repo, typecheck, Prettier and `contracts:check` are clean.
- **Not run locally:** the DB suites (`api.db.test.ts` and `readiness.db.test.ts`). CI runs them.

## Remaining obligations

- CI; Codex with no open P1.
- Next pieces of point 1: leaving a project, then archiving and unarchiving it. Deleting for good waits for a decision
  with Davide.

## Review notes

- `85f336aa`: CI's runtime-unit refused `project.renamed` as an unknown event type (`diagnostics/sanitize.test.ts`, run
  only in CI here). The sanitizer now knows it, and the event's summary code is `project.renamed`, dotted like the
  others.
- The amendment was renumbered from A19 to A21, because A19 and A20 are already proposals to Davide in #105
  (`apps/studio/src/api/vision.ts`). The leave PR takes A22.
