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
- **`pnpm check`: exit 0. Skips, classified from the raw markers; none counted as passed.**
  - The integration run's 2 counted skips are the log-compat export and import tests (they need a second runtime
    unit: `SOPHIA_LOG_COMPAT_EXPORT`, `_IMPORT`).
  - The design-capture, render-supervisor and runtime-service crossings, which need
    `SOPHIA_DISPOSABLE_DATABASE_URL`, are separate, unavailable crossing suites.
  - The unit run's 70 counted skips come from 77 raw markers: 66 «the confined renderer runs on Linux only (here:
    darwin)», 4 «SOPHIA_TEST_LIVEKIT_URL not set», and the Linux-only /proc and tar scans.
- **Browser: prepared, NOT run** (see below).

## Served browser checks (FND-C5-SERVED-BROWSER-PREP-01; run in FND-C5-UI-REPAIR-01)

Written while 5198/5199 were B's, and run once P granted them (below). They run with `playwright test -c
playwright.served.config.ts`.

- **The served page.** `vite.served.config.ts` now also sets `VITE_SOPHIA_TASKS=1` (vision off, search on), so the
  Studio reads and writes tasks through `api/tasks.ts` and the generated A39 parsers.
- **The fixture.** `fixtures/human-tasks-data.ts` answers A39's six routes as the API does:
  - D-TASKS;
  - the revision compared, with stale_revision and invalid_state;
  - create and Done once per key;
  - a link-only origin, `{available: false}` for one the reader may not follow;
  - a request refused that carries anything but A39's fields (a quote included).

  Each request is recorded as sent (`task-request:METHOD path body`, `task-read:path`).
  - `humantasks=seed` gives four tasks: one for nobody, one for the reader from a passage, one for Lucía, and one
    from a passage the reader may not follow.
  - `bumpTask` is another member's change meanwhile; `tasksAsProposed` answers once in A17's shape.
  - Without a seed, the served page answers an empty A39 list.
- **`e2e-served/human-tasks-served.spec.ts`, 8 prepared cases (and 3 more below):**
  - the brief's list (a link-only passage, an unavailable one redacted, no quote);
  - an admin claims, releases, assigns and finishes, with each request's exact path and body;
  - a viewer: no Claim, Release or Assign, Done only on their own, with its body;
  - a stale 409 said and read again;
  - `#todo-` focused, again after a reload, and one that isn't there;
  - a passage's task: the title starts empty, and the request is exactly `{title, ownerId, origin{5 fields}}` with no
    passage words, title, quote or hash; the tab shows the version link, not a quote;
  - the report's tab lists only the followable ones;
  - an A17-shaped answer refused by the generated parser (the negative control).
- **Not covered here.** The API's 403s for a viewer are proven by the PG suite, not by these synthetic fixture checks,
  which are not a signed-in App, Auth or API crossing. A17's vision cases (`e2e/room-passage-task.spec.ts`) are
  unchanged and run under the vision fixture.
- **An observation to confirm in the browser first.** The Task form's «For» still offers «Anyone», which A39 records
  as nobody yet (only an editor or an admin may finish it). No product change is made in this preparation.

## UI repair (FND-C5-UI-REPAIR-01; R-C5-01, 02 and 03)

The evidence below is for the commit that carries this section. Studio and fixture only: 0074, A39, the persistence,
the routes and the generated contract are unchanged from `7caf2f35`.

- **First run of the prepared cases:** 15 of 16 served cases passed (the 8 tasks and C4's 8 search). The one failure
  was a harness flaw: the A17-shaped negative control answered once, and the query's own retry then read the strict
  list. It now answers that way until turned off, from the first read when `proposedtasks=1`.
- **R-C5-01 was happening, not only possible.** The dev server logged «Unhandled rejection: TypeError: Cannot read
  properties of undefined (reading 'map')» during the passing cases. The feed's later read had hidden it.
- **Each finding reproduced in the browser before any change** (`served-ui-rc5-before.keep.log`):
  - **01.** With the project's pages and one deep-linked task read, a Claim that landed («For you») also said «Not
    sent.», and the Done threw. `taskChanged` mapped a flat `tasks` array over the infinite pages and the single task.
  - **02.** A Done whose answer was lost, retried after Marco took the task and the feed moved, marked it done: «For
    Marco · Done by you.». The retry kept its key but sent the row's new revision.
  - **03.** An off-page task opened by `#todo-` kept its available link after its origin was withdrawn and the feed
    moved.
- **The repairs:**
  - **01.** `taskChanged` updates each cache in its own shape: a report's flat list, the project's infinite pages and
    the one task.
  - **02.** Done's admission carries `{taskId, revision}` as its arguments, so a retry sends exactly the first body
    with its key.
  - **03.** The named task follows the feed. It is read again after a stale action, and once its read is refused it
    is not shown from what was read before.
- **A regression of my own, caught and fixed.** My first 03 change refetched the named task with none named (`GET
  …/tasks/`), because a forced refetch ignores `enabled`. Every served case caught it. The feed follow now uses the
  query's own condition. Log `served-ui-rc5-repair1-regression.keep.log`.
- **New fixture hooks:** `humantasks=many` (60 newer tasks, so a deep link is off-page), list paging by cursor,
  `dropNextTaskWrite`, `bumpTask(…, moveFeed)`, `withdrawTaskOrigin` and `hideTask`. The keys sent are recorded as
  `task-key:`.
- **After, on the final bytes:**
  - the served spec ×2: 38/38 (human tasks 11, C4 search 8), with no unhandled rejection;
  - the neighbors under the vision fixture: 345/345 (A17's room-passage-task, room-passage, room-passage-link,
    project-activity, project-search, room-search, search-goals, mentions, discussion-earlier, message-acts,
    room-discussion, chat-times, message-links, room-chat-replies, ask-instead, work, room-work and task-keys);
  - units 2387 pass, 0 fail; format, lint, typecheck and contracts clean.
- **Still open, not changed:** the Task form's «For» offers «Anyone», which A39 records as nobody yet. It is not covered
  by a failing case here; it is left for an owner or wording decision.

## Named-task transition (FND-C5-NAMED-TRANSITION-01; R-C5-04)

The evidence below is for the commit that carries this section. This is the final consolidated exchange: one call-site
change in `ProjectTasks.tsx` and one served case. The shared `useFeedRefetch` and `feedStep` are unchanged.

- **R-C5-04.** An off-page task named by `#todo-`, then no task named while the brief stayed open (the address cleared,
  or Back). The feed helper read the cursor going from defined to undefined as a move, and the disabled named query's
  forced refetch, which ignores `enabled`, read an empty id.
  - Reproduced first on `753ee354`: `GET /api/v1/projects/…/tasks/` twice, as unexpected requests (log
    `served-rc5-04-before.keep.log`).
- **The correction.** At the call site, the feed helper is handed a `refetch` that reads only while a task is named
  and read alone. The named re-reads on feed moves and on stale actions are unchanged (R-C5-03's case passes).
- **After.** The served config gives 20/20: human tasks 12 (with the new case) and C4 search 8. Repeated twice: 40/40.
  No unexpected request and no unhandled rejection. Units, format, lint, types and contracts are clean.

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

## Dated clarification — 2026-10-19 (FND-B-TASK465-CACHE-AND-SERVED-REPAIR-19)

The sections above that name `vite.served.config.ts` and an `e2e-served/human-tasks-served.spec.ts` with "8 prepared
cases", and the 20/40 counts, describe an A39 **route fixture** (`fixtures/human-tasks-data.ts` answering the six routes).
That was not a signed-in App → API crossing, and those served paths were never committed under those names. The strict
synthetic route cases that do exist are `e2e-search/human-tasks-page.spec.ts` (page fixture, never counted as the real
API).

Real served evidence, separately:

- B's private run of 2026-10-19 04:32 UTC passed three real journeys: local Vite 5198 → listening API 5199 on its
  restricted role → an owned PostgreSQL; synthetic dev auth; no Task response intercepted. Its specs were untracked
  journal files, so a checkout could not reproduce it. The first private attempt failed (one missing response; the role
  cases then saw a membership left inactive); that cause stays unknown. The report task refusal there was a 422, not a 403.
- Committed now, reproducible: `apps/studio/e2e-served/human-tasks-served.spec.ts` (three journeys) with
  `e2e-served/support/tasks-served.ts`. It runs on the normal served path with Tasks on and vision off, its owner setup
  comes only from a loopback `SOPHIA_DISPOSABLE_DATABASE_URL`, and every case puts Davide's standing back on exit:

  ```
  SOPHIA_SERVED_ENV=<node apps/api/scripts/dev-db.ts --json output> SOPHIA_DISPOSABLE_DATABASE_URL=<owned loopback PG> \
    SOPHIA_SERVED_TASKS=1 SOPHIA_SERVED_BROWSER=chromium pnpm exec playwright test -c playwright.served.config.ts
  ```

  Run the root check and the `.db` tests before seeding dev-db, never on the same cluster at the same time: dev-db
  creates cluster-wide roles.
