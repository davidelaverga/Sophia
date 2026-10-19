# Implementation-session handoff

Goal and attempt: FND-C50-TASK-REVALIDATION-IMPLEMENTATION (Task lock/current membership, Markdown origins, served
«Nobody yet»), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet `C50-Task-revalidation-source-packet.txt`,
sha256 `00b7e0c0…`) / Claude Code lane C (transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`foundation/task-revalidation-20261019`, from B49 `9759b7e7e7ac27ca32566877820e7dd7592f7647` (tree `3bded35d…`)
Writable scope: new migration `0077` (allocated by P), Task persistence (read projection, report lookup), the shared Task
form, readiness, focused tests, this record. A39 unchanged; 0074 and 0076 untouched.
Runtime unit: Davide's macOS host; Node 24, pnpm (offline, frozen); own PostgreSQL 17.11 on 127.0.0.1:55496 (fresh
cluster, stopped after). No server port, GUI, provider or network.
Ending commit/tree: the commit this record is in. Not pushed.

## Outcome

- **Membership after the lock (0077).** `create_project_task`, `set_project_task_owner` and `finish_project_task` are
  replaced whole (same signatures; `CREATE OR REPLACE` keeps owner and grants). Each is its 0074 body with one change:
  `PERFORM … FROM sophia.projects … FOR UPDATE` now comes BEFORE `a:=sophia.task_actor(p_project)`. Under READ COMMITTED
  the actor is read in a statement after the lock, so a `leave_project` or `remove_member` that held the same project lock
  is seen. can_edit, the viewer-owner rule, CAS, once-per-key replay and the events are unchanged. A replay also rechecks
  current membership (task_actor runs before task_request).
- **The HTTP mitigation is unchanged.** The API's read-back under RLS still rolls back a write whose writer can no longer
  read the task. It is not claimed old-failing: the regression drives the application role's SQL directly.
- **Markdown-only origins.** 0077's create joins `sophia.artifacts r … AND r.format='markdown'`; any other format is
  refused (22023, 422) before any write. The read projection (`ORIGIN`) carries the same predicate, so an origin stored
  before 0077 on a non-Markdown report is kept (task id, history, no purge) and reads `available: false`, with no source
  text. `readReportTasks` answers such a report `not_found`, exactly as an unknown report (422 `not_found`).
- **Readiness.** `/ready` (the existing REQUIRED_SCHEMA pattern) needs all three Task writes to carry the 0077 marker and
  the create's Markdown join; without 0077 it answers 503 `schema`.
- **Served «Nobody yet».** `noOwnerOption(SERVED_TASKS)` labels the shared TaskFoot owner choice (project and passage
  forms); the value and payload stay null. `ownerWords` already says «nobody yet» in the list and confirmation. A17's
  «Anyone» is kept when not served. Permissions unchanged.

## Evidence (logs in P's journal, `C50-logs/`)

- `human-tasks.db.test.ts`, fixed head: 13/13 (the 8 existing A39 cases + 5 new).
- New suite «Task revalidation (0077, FND-C50)»:
  - a deterministic two-connection barrier on the application role: the revoker (the viewer's own leave, or an admin's
    removal) holds the project lock uncommitted; the assigned viewer's `finish_project_task` is seen waiting on a lock
    (`pg_stat_activity`, no sleep); the revoker commits. Fixed: 42501, and tasks/events/requests byte-equal. OLD (0077
    moved aside): the Done COMMITS (`'committed'`), both leave and removal.
  - reverse order: the assigned viewer finishes, the same key replays equal, a stale revision is 409, and after removal
    the same key is 403 (replay rechecks membership). Passes on old and fixed.
  - Markdown: a non-Markdown origin refused (422) with nothing committed (OLD: 201); a Markdown origin links its exact
    version and is listed; a stored origin whose report is no longer Markdown reads unavailable, is not listed, and the
    report's list is `not_found` like an unknown report.
  - readiness: 200 with 0077; OLD: 503 `schema`.
- Existing A39 cases cover: viewer can't claim, release or finish an unassigned task (403) and finishes an assigned one;
  create/assign of a removed member (403/422); stable, superseded, private-own and released-eligible origins admitted;
  forged, cross-project, candidate, private-other, ineligible and erased refused or unavailable.
- Studio `task-view.test.ts` 11/11 (new: «Nobody yet» served, «Anyone» legacy).
- Ordinary: format, full lint (type-aware), typecheck, build: pass. Unit `pnpm test` after build: 3472 pass, 0 fail, 70
  skip (before build, 17 `tests/unit/*.mjs` failed on a missing `packages/dsh-bundle/dist`, a fresh-worktree build gap).

## Not done / not claimed

- Full `pnpm check` (contracts, artifacts, integration gate with the pinned dsh) was NOT run. The other `.db` suites
  (e.g. `api.db.test.ts`, role/grant census suites, the CON preservation guard) were NOT run against 0077.
- No browser check of the served form. SEC details for head 8d36 remain UNKNOWN; this change cannot clear that review.
- Owed: R's review; B's integration (Luis's labels and design kept); CI (PG16); V; any production step needs its own
  approval.
