# Implementation-session handoff

Goal and attempt: FND-C5-HUMAN-TASKS-01, attempt 1 (#365 section 3; `Refs #365 — section 3`)
Human owner / executor resource: Davide; lane C (Claude). Coordination by P, review by R, combined integration by B,
integration review by Luis.
Native session: Claude Code desktop session `local_557a0040-996c-4a7f-874d-01449e49b493`; no native runtime session.
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-human-tasks`, new branch
`api/human-tasks-20261017`, from the R-cleared C4 head `445d782ab4708d98d593cb778d8304e5caf00475` (tree
`ccb7ab25d93d1bd7b5b45b6fc254c87232e79dce`), unpushed.
Names: `0074_project_human_tasks.sql` and `A39-project-human-tasks.json` (P's namespace rev8). Source policy: Davide's
D-TASKS (`decision-D-TASKS.json`), the private v2 proposal (link-only origin) and R's C5 boundaries.

## Outcome

A project's members can give people things to do, and say they are done.

| act | admin, editor | viewer | non-member, removed, guest |
|---|---|---|---|
| read tasks | yes | yes | 403 |
| create, claim, assign or reassign, release | yes | no (403) | 403 |
| mark done | any open task | only one explicitly assigned to them | 403 |

- **Owners.** An owner is an active member of any role. A former member's task stays readable and is reassignable by
  an editor or an admin.
- **Writes.** Every write is compared and set on the task's revision: a moved one is 409 and changes nothing. Creating
  and finishing are once per key: a replay re-reads the task, and another request under the key is 409.
- **Done.** It is terminal and changes only the task: no goal, decision, agent work (work_*), allowance, spend or
  outbox.
- **Names.** Each person shows by their current display name (D-NAMES), else «A member»; never an address.

## The origin is a link only

- **What is kept.** A task may come from a passage of a report: the published version (stable or superseded) of a
  report of this project, and its place in it (block, word, count, as `passage-link.ts` names it). The database binds
  the tuple: a foreign key to `artifact_versions(project_id, artifact_id, id)`.
- **At creation,** the source must be ready and readable by the person creating the task, under the source rule:
  their own, or the project's released and eligible. The write function checks this explicitly, since it runs as
  definer. A forged, foreign, crossed, candidate or unreadable version, or a place out of bounds, gives 422. A private
  source is never released.
- **Never kept:** the passage's words, the source's hash, or the report's title, in the task, its request, its
  receipt or its event. Erasing a source (`mission_erase_source`, 0041) therefore leaves nothing of it behind, and
  0041 is unchanged.
- **Every read, for its own reader** (list, detail, a report's list, and the answer to every write and replay):
  - the origin is a link only while the version is published and its source ready and readable by THIS reader;
  - otherwise it is `{available: false}`, with no id, place, title, words or hash;
  - a report's list leaves out the tasks whose origin the reader may not follow.
  - Membership or assignment is no source grant. Following the link re-authorizes in the viewer.
- **A stated limit.** The place is the rendered document's; the server can't check it falls inside the text. A place
  past the end opens the version with the viewer's own «not found».

## Events

- Each act is one project event: `project.task_created`, `project.task_owner_set` or `project.task_done`, with
  summary `task.created`, `task.owner_set` or `task.done`. It carries the session's actor and the task's id and
  revision, and no title, words or references.
- The admin's activity lists them through the existing `project.%` allow-list, with no function replaced.
- As every event's does, the commit's notification may wake a dispatcher's poll, which can advance work admitted
  separately before. A task event admits no paid work and creates no commission, goal, allowance or outbox command.
  Nothing reads it as work.

## What changed

- **0074.** Two tables, `project_tasks` (RLS members_read, SELECT to the API role) and `project_task_requests` (no
  API access). Three SECURITY DEFINER writes with explicit checks, the only ones the API role may execute:
  `create_project_task`, `set_project_task_owner` and `finish_project_task`. Private helpers. No other function is
  replaced, and 0001–0072 are not edited.
- **A39.** ProjectTask, ProjectTaskOrigin, ProjectTaskPlace and ProjectTaskList; the create, owner and done requests;
  six operations; the generated types and validators (parsers `parseProjectTask` and `parseProjectTaskList`).
- **Persistence and API.** `packages/persistence/src/human-tasks.ts` (the reads, invoker under RLS with the explicit
  source rule; the writes, then a read-back) and `apps/api/src/routes/human-tasks.ts`. The routes are registered,
  and readiness requires 0074's three writes.
- **Studio, behind `VITE_SOPHIA_TASKS` (off by default).**
  - `api/tasks.ts`: the served adapter on the generated parsers. The passage leaves the page as its version and
    place, never its words.
  - The report pane's Tasks tab (`TaskList.tsx`) and Task form (`PassageTask.tsx`) use it, under D-TASKS, with an
    owner control (Claim, Release, Assign to) for editors and admins, and «isn't available to you» for an origin the
    reader can't follow.
  - The brief lists the project's tasks (`ProjectTasks.tsx`), and a `#todo-<id>` address opens the brief on one, read
    on its own when it isn't listed. `#task-` remains the agent board's.
  - Activity words for the three summary codes.
  - The vision flag's A17 proposal is unchanged on the fixture pages, its own rules included.
- **Shared files** (declared; B integrates):
  - `api/vision.ts` (the task type widened: `from` may be none or unavailable, `revision` optional);
  - `TaskList.tsx`, `PassageTask.tsx`, `DocumentPane.tsx`, `task-view.ts`, `StudioShell.tsx`, `link.ts`,
    `labels.ts`, `vite-env.d.ts`;
  - API `app.ts` and `diagnostics/sanitize.ts` (the three event types and summary codes), persistence `index.ts`,
    contracts `generate-validators.ts` and `validate.ts`.

  Luis's open branches are not imported.

## Evidence

- **Restricted PostgreSQL 17.11** (owned, port 55498), signed API, generated parsers. `apps/api/src/human-
  tasks.db.test.ts` has 8 cases:
  - every D-TASKS cell, a viewer's own Done and others' refused included;
  - CAS 409 with nothing changed; two concurrent assignments (one wins); create and done replay; key conflict; done
    is terminal;
  - a removed member;
  - the origin: superseded valid; foreign, crossed, unknown, candidate, out-of-bounds, string and quote refused;
  - a private source per reader in detail, list and report list; made ineligible; erased, with the same-key replay;
  - a raw scan of task, request, receipt and event rows for the source's words, hash and title;
  - one event per act, its fields, and none on a replay, a refusal or the same owner; activity;
  - authority rows unchanged: goals, decisions, work_items, work_assignments, allowances, commands, outbox, and the
    mission and eligibility revisions;
  - paging; grants and RLS; readiness (not ready without 0074).
- **Before-evidence kept.**
  - The first run found a real authorization defect: `t.owner_id = a` is NULL for a task for nobody, and `IF NOT
    NULL` never raises, so a viewer could finish an unassigned task. It is now `IS NOT DISTINCT FROM`.
  - A mutation check (the source rule dropped from the create check) fails the private-origin case.
  - My contract first said 404 for an unknown task; the API's `not_found` is 422 everywhere, so A39 says 422.
  - The first `pnpm check` failed one unit test: the diagnostic sanitizer's guard («knows every event type and summary
    the migrations write») caught the three new event types. They are now listed, with their summary codes.
- **Studio units** (`task-view.test.ts`, `api/tasks.test.ts`): the D-TASKS matrix as the rows apply it, and the served
  mapping through the generated parser (no quote, unavailable, none, the revision kept).
- **Browser: NOT run.** P granted no fixture slot in this START. The served fixture answers and specs (create, assign,
  claim, Done by an editor and an assigned viewer, a stale 409, a deep link after reload, an unavailable origin, A17
  kept) are left for that bounded step.

## Limits

- **Not deployed.** The flag is off. Nothing is pushed, and no CI, automatic review or browser run has happened on
  this head. No provider, inference, credentials, real data or spend was involved.
- **No erasure of task titles.** Human tasks have no withdrawal or erasure of their own (as goal titles have none). A
  title is the member's own text, never a copied source snippet.
- **The base.** C stacks on the retained 0059–0061 (Luis) and C's 0062, 0065, 0066, 0068, 0069 and 0072. None is on
  main (29a64221, migrations through 0058) or applied. 0074 needs 0062's `actor_label`.

## Next bounded action

Stop at the local seal for R's independent review and B's sequenced integration. When B releases 5198/5199 and P
grants them, write and run the served browser checks.
