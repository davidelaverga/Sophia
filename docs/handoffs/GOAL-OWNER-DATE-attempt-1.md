# Implementation-session handoff

Goal and attempt: GOAL-OWNER-DATE (a goal has an owner and a target date; point 9 of the gaps report; Luis: «Sigue
con los puntos del informe que necesitan API»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/goal-owner-date` from `api/host-controls`
(stacked, so the contract's generated files, migrations and amendment numbers stay in one line)
Writable scope: this worktree only (`db/migrations`, `packages/contracts`, `packages/persistence`, `apps/api`,
`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy, no migration applied to a live database.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `1ffdd62114a2` (tree `65ba50e06d57`), the last commit of `api/goal-owner-date`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 26 files changed against
`api/host-controls` at that commit: `apps/api/src/access.db.test.ts`, `apps/api/src/api.db.test.ts`, `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/access.ts`, `apps/api/src/routes/goal-targets.ts`, `e2e/goal-owner-date.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/api/client.ts`, `src/app/theme.css`, `src/features/work/GoalSheet.tsx`, `src/features/work/GoalTargets.tsx`, `src/features/work/GoalsOverview.tsx`, `db/migrations/0054_goal_targets.sql`, `docs/plans/goal-owner-date.md`, `packages/contracts/amendments/A25-goal-owner-date.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/goal-targets.ts`, `packages/persistence/src/index.ts`. The review notes below name the commit of each later change.

## Outcome

- **Kept beside the goal (migration 0054, `sophia.goal_targets`):** `Goal`, its revision and its authority are
  untouched, so the mission's commands, Sophia's tools and the runtime wire module see nothing new.
- **`sophia.set_goal_target`:**
  - editors and admins only (42501);
  - the owner is an active member, and the date is in 2000–2100 (22023);
  - a compare-and-set on its own revision, where 0 means none yet; a stale write is 409 `stale_revision`;
  - it emits `goal.target_set`, and the sanitizer knows the event and its summary.
- **`sophia.project_members_named`** gives the active members, their roles, and the name the room keeps (0050), to
  members only.
- **A decision to review (Davide):** 0050 kept a name for its member's own voice writes only. Now a member's name shows
  to the project's other members, as A17 already shows a message's author name. Reading one's membership on opening a
  project keeps one's name, as joining the call does.
- **A25:**
  - `GET /api/v1/projects/{projectId}/goal-targets`;
  - `PUT /api/v1/projects/{projectId}/goals/{goalId}/target`;
  - `GET /api/v1/projects/{projectId}/members`.
  - `/ready` requires 0054.
- **Studio** (`GoalTargets.tsx`):
  - A goal's row says «Marco · due 30 Oct 2026».
  - Its sheet has Owner (the members, or «No owner») and Target date with Save, for editors and admins. A stale save
    is said, and the form shows what stands now.
  - Viewers read the owner and date.

## Evidence

- Plan: `docs/plans/goal-owner-date.md`.
- Written first and failing (commit `ac4dbf26`):
  - `api.db.test.ts` «goal targets (A25)»;
  - `access.db.test.ts` «a project's members (A25)», named by the email tokens there;
  - readiness «without 0054»;
  - `goal-owner-date.spec.ts`. Run without the change, all 3 cases failed (no Owner field).
- **After the change, locally:**
  - goal owner, goals overview, notes, controls, views, search goals and goal address specs: 9 + 25 in all.
  - Two corrections were found while running it:
    - the section's label contained «target date» and confused the label lookup, so it is now «Owner and date»;
    - the fixture routed the PUT.
  - The sanitizer's unit test passes. Type-aware lint over the whole repo, typecheck, Prettier and `contracts:check`
    are clean.
- **Not run locally:** the DB suites. CI runs them.

## Remaining obligations

- CI; Codex with no open P1. It merges after the host-controls PR, retargeted to `main`.
- Davide to confirm that showing members' names to each other is acceptable, given 0050's narrower intent.
