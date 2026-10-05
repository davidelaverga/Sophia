# WBC-02 — one Paperclip-managed source review in Tasks

Mission: [WBC-02](../missions/2026-10-03-workboard-connection/missions/WBC-02_PAPERCLIP_FIRST_OUTCOME.md) (SCM-01), from the workboard connection packet v1.1 (`Sophia_Workboard_Connection_Missions_v1.1_2026-10-03.zip`, sha256 `b79d7346…51c32bf`; its WBC-02 mission text is byte-identical to the v1.0 copy installed in `docs/missions/`). Launch brief: the packet's `launch/WBC-02_CLAUDE.md`. Also read: Davide's "Native design and Paperclip: parallel-execution addendum" (5 Oct 2026, a proposed coordination amendment, not installed).

**Status: implemented, locally evidenced, not deployed.** One focused PR on `scm-01/workboard-source-review`. Every check below ran in Claude's container against a local PostgreSQL 16, the real pinned dsh, and the pinned Paperclip's own SDK and plugin test harness. No Paperclip service, provider call, hosted database, secret or deployment was touched: those are operations Davide authorizes and Codex performs ([WBC-02-CC-0001](../coordination/WBC-02/WBC-02-CC-0001.md)). No WBC-02 coordination thread exists yet; none was invented.

## Owners

| Role | Who |
|---|---|
| Backend and product decisions, operation approval | Davide |
| Studio integration | Luis (the Studio binding here is the minimal one the mission scopes: the served board and the pilot entry; see "Studio") |
| Implementer | Claude Code (this session) |
| Independent review, deploy, live tests | Codex, only under Davide's authorization of an exact operation batch |

## What works

A member who can edit opens **Tasks**, presses **Review sources** under a goal, chooses one to three report versions (at most 32 KiB of text), an allowance within the project's cap and an optional purpose, and proposes. Sophia records one deterministic plan (`sophia.work.plan.v2`) and one admission decision for the proposer; nothing runs. The proposer starts it (**Start the review**). In one transaction Sophia admits one work item with its assignment, a hidden execution goal (the review's own Hold/Resume/Stop fence), an allowance on the shared research accounting, and one commission. The worker delivers the commission to the `sophia.coordination` plugin under an Ed25519 envelope; the plugin creates **one** core issue in the mapped Paperclip project, assigned to the managed `source-reviewer` agent, and wakes it. Paperclip's run calls the external `sophia_dsh` adapter, which opts into cancellation, asks Sophia for an effect permit, dispatches, and asks Sophia to start the work's one attempt through Sophia's existing native path. The runtime runs `sophia-source-review-v1` on `source-review-luna-high-v1` with three tools only (`read_review_source`, `submit_source_review`, `report_review_blocker`); every model call is reserved and settled against the work's allowance, eight at most. The review is published as an immutable source with structural checks (five sections, findings that cite only manifest sources this attempt read). The board shows it Complete with its result openable at its exact version; Paperclip's issue is mirrored `done`; the run reports its own usage (`per_run`; an uncertain cost is `null`). An adverse review is a completed review: the reviewed goal is untouched.

Hold, Resume and Stop from the board fence the runtime at once and are mirrored onto the issue; a cancelled Paperclip run holds the work (never stops or loses it); a lost commission reply is reconciled by its key; a withdrawn input stops the work and withdraws its result; a turn that ends without a result is nudged once, then the work fails with `no_result_submitted`.

## Decisions and their reasons

| Decision | Reason |
|---|---|
| Sophia stays authoritative (plan, decision, allowance, eligibility, permit, fence, result); Paperclip owns only the issue and its runs | The mission's authority split; Paperclip never reaches Sophia's database or a model |
| The work runs through Sophia's existing goal → attempt → binding → outbox path, under a hidden per-work execution goal | Reuses the authority-epoch fence and the native Hold/Resume/Stop settlement instead of a second control system (addendum §3). The execution goal is not a project goal: the snapshot hides it |
| Spend uses the existing research grant, allowance and reservation tables (`reserve_research`, `end_research_reservation`) | The addendum: reuse safety and cumulative-budget mechanisms, no competing accounting. A project needs both its research grant and the new coordination grant |
| Route `source-review-luna-high-v1` = the approved development model (`gpt-6-luna`, high) under a provider alias `openai-review`, `maxTokens` 16 000, catalog prices | No new vendor, model or effort; the alias lets the bridge tell the reviewer's calls from the default route's and bound/meter them. **Needs Davide's confirmation of the route and its payer (`OPENAI_API_KEY`)** before any live call |
| New runtime unit `sophia-runtime-wbc02-dev` (previous `sophia-runtime-m03-dev`) | A bundle change is a new recorded unit; research roles, routes, presets and compaction are unchanged |
| Migration `0042`, amendment `A13`; runtime operations under `/v1/runtime/source-review/*` (`runtime_source_review_*`, schemas `SourceReview*`) | SDD-01 reserved `0038`–`0041`, `A12` and the `/v1/runtime/review/*` names first ([its binding map §9](https://github.com/davidelaverga/Sophia/blob/claude/sdd01-native-html-design/docs/coordination/SDD-01/BINDING_MAP.md), PR #104, 17:19 UTC). This branch first took `0038`/`A12` after reading only the files on remote branches, not that written reservation; corrected here. See "Shared boundaries with SDD-01" |
| The admission decision of a review proposed under a goal with no plan in force is answered at the pilot entry | The board keeps WBC-01's reviewed rule that a plan only proposed is read only (Codex F-006 and the e2e checks); once a plan is in force, the board answers the next proposal itself |
| The board and receipt routes check their whole reply against the contract (Ajv) and send plain JSON | `fast-json-stringify` cannot compile the packet's conditional rules; a reply that breaks the contract is never sent |
| A Paperclip run cancel is a Sophia **Hold** | Losing a run must never lose the work; only an explicit Resume continues it |

## Shared boundaries with SDD-01

SDD-01 (PR #104, thread #103) runs in parallel under the same addendum. Its binding map §9 states the reservations and the order for the shared files; this branch follows it.

| Boundary | SDD-01 | WBC-02 (this branch) | Who resolves it |
|---|---|---|---|
| Migrations | `0038`–`0041` | `0042` | done |
| Contract amendment | `A12` | `A13` | done |
| Runtime review operations | `/v1/runtime/review/{context,capture,submit}`, `runtime_review_*`, schemas `Review*` | `/v1/runtime/source-review/{context,reserve,settle,submit}`, `runtime_source_review_*`, schemas `SourceReview*`; transport `sourceReview*` | done: no route, SQL function, schema or transport name is defined by both |
| `capture_native_result`, `dispatch_runtime_outbox` | replaced in `0040` | replaced in `0042` | the PR that lands second rebases and keeps both lanes' branches in its replacement (a later `CREATE OR REPLACE` would otherwise drop the other's) |
| Registry, its schema and generator (`config/specialists.json`, `config/schemas/specialists.schema.json`, `generate-specialists.ts`) | the single writer until #104 merges; `task_kind` becomes an enum (`design`, `design_review`) | adds the source reviewer additively today; after #104 merges, `source_review` joins SDD-01's enum | order: Davide and Codex (SDD-01 O-6) |
| Runtime unit (`config/runtime-unit.json`), `cordis.patch.yml`, bridge | `sophia-runtime-sdd01-dev` | `sophia-runtime-wbc02-dev` | the PR that lands second rebuilds one combined unit with every role of both (addendum: neither release removes the other's roles) |

## Binding table (pin `paperclipai/paperclip@5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb`)

| Need | Pinned surface used | Where Sophia binds it |
|---|---|---|
| Plugin routes (Sophia → Paperclip) | Manifest `apiRoutes` (`PluginApiRouteDeclaration`, `packages/shared/src/types/plugin.ts` 613–627) with `api.routes.register`; forwarded by `server/src/routes/plugins.ts` 1840–1935 to the worker's `onApiRequest` (`define-plugin.ts` 160–182, 328): `auth: board`, company from the body or the issue, JSON only, 1 MB body, the plugin's `{status, body}` returned as is | `packages/paperclip-plugin/src/manifest.ts`; routes `POST /api/plugins/sophia.coordination/api/{commissions, commissions/lookup, issues/:issueId/control}` |
| Who may call | `actor.actorType`/`userId` from the board session or API key (`plugins.ts` 1889–1900) | Only the configured integration board user (`integrationUserId`); agents refused |
| Create one issue per commission | `ctx.issues.list({companyId, originKind, originId, limit})` exact filters (`services/issues.ts` 3058–3066, 6270), `ctx.issues.create({… originKind: 'plugin:sophia.coordination:commission', originId, assigneeAgentId, billingCode, status})` (`plugins/sdk/src/types.ts` 1422–1461) | `coordination.ts`: look up by origin, claim the key in the namespace, then create; a create in flight answers 503 (unknown), never a duplicate |
| Wake, hold, resume, stop, complete | `ctx.issues.update(id, {status}, companyId)`, `ctx.issues.requestWakeup(id, companyId, {reason, contextSource, idempotencyKey})` (`types.ts` 1462–1510). What the pin does with a wakeup (source, not run live): the host passes the key to `heartbeat.wakeup` and then writes its activity log, so a call can fail after the wakeup is durable (`plugin-host-services.ts` 2164–2228); the generic issue path inserts a fresh wakeup request with the key and no deduplication by it (`heartbeat.ts` ~28373); a wakeup while a run of the issue is active is coalesced or deferred behind it (`heartbeat.ts` ~28121–28178); the SDK harness ignores the key (`testing.ts` 1681–1691, per Codex CX-0004) | `CONTROL_EFFECT`: hold → blocked, resume → todo + wake, stop/fail → cancelled, complete → done. Every wakeup goes through `wakeOnce`: recorded before it is asked; a resend confirms it by a run of the issue since the first ask (`public.heartbeat_runs`), waits (503 `wake_in_progress`) while an ask may still be in flight, and asks again only when the ask is stale with no run since, claimed by one resend. A second run would only attach to Sophia's one attempt (M06); this keeps the host from being asked for one |
| The reviewer agent | `ctx.agents.managed.reconcile(agentKey, companyId)` → `PluginManagedAgentResolution.agentId` (`types.ts` 1669–1673; `shared/src/types/plugin.ts` 425) and manifest `agents[]` with `adapterType: 'sophia_dsh'` | `REVIEWER_AGENT_KEY = 'source-reviewer'` |
| Plugin state | `ctx.db.namespace/query/execute` (`types.ts` 623–632), manifest `database.migrationsDir`, `coreReadTables: ['issues', 'heartbeat_runs']`. The host's rules (`plugin-database.ts` 246–300): `query` is one SELECT with no mutation keyword, reading `public` only from the core-read tables; `execute` is one INSERT/UPDATE/DELETE inside the namespace and returns a row count only; migrations are checked statement by statement | `migrations/001_sophia_coordination.sql`: nonces, commission bindings with their effect lease, controls `pending` until their effect is confirmed, then `applied`, and wakeup asks. The host checks each raw statement when it installs (its keyword scan strips quoted strings before comments, so no comment may hold a quote character); `scripts/paperclip-host-probe.mjs` installs the built package through the pin's own loader (WBC-02-CX-0010). The synthetic host applies the same rules (`host-sql.ts`); `scripts/paperclip-verify.mjs` runs the pin's own validators over every statement and the migration |
| Plugin config | `ctx.config.get(companyId)` (`types.ts` 443–450) | signing public key, integration user, project mapping |
| Worker entry | `definePlugin`, `runWorker` (`worker-rpc-host.ts` 282–302) | written by `scripts/paperclip-build.mjs`; handlers in `bind.ts` |
| External adapter load | `createServerAdapter()` from the package root (`server/src/adapters/plugin-loader.ts` 73–77, 151–159) | `packages/paperclip-adapters/src/sophia-dsh/index.ts` |
| Run lifecycle | `AdapterExecutionContext` (`adapter-utils/src/types.ts` 197–236): `signal`, `onCancellationReady`, `onDispatch`, `runId`, `agent`, `context.issueId` (`services/heartbeat.ts` 992, 1013) | `execute.ts`: opt in first, no call if pre-aborted, permit, `onDispatch` immediately before start |
| Run result | `AdapterExecutionResult` (`types.ts` 77–115): `usageBasis: 'per_run'`, `costUsd` null when unknown, `sessionParams`, `sessionDisplayId`, `biller`, `billingType`. How the pinned host reads it (`heartbeat.ts` 25132–25139): exit code 0 with no error message and no signal is a succeeded run, otherwise failed unless the host cancelled the run itself; a failed run leaves the agent in `error` (`finalizeAgentStatus`, 18022–18030), a succeeded or cancelled one leaves it idle | `report()` and `forHost()` in `execute.ts`: a run that ended on Sophia's definite answer (held, stopped, withdrawn, a review that ended blocked or failed, a denied permit, an observer let go) completes, with Sophia's outcome as its summary and `resultJson.sophiaOutcome`; a run Paperclip cancelled keeps its error; a run that could not work with Sophia at all fails, for an operator (WBC-02-CX-0007). `scripts/paperclip-host-probe.mjs` runs the built adapter in the pin's own heartbeat |
| Readiness | `testEnvironment` (`types.ts` 322–334) | `environment.ts`: env present, Sophia `/health`; never a model |
| Compile-time proof | the pin's `PluginContext`, `PluginApiRequestInput`, `PaperclipPluginManifestV1`, `ServerAdapterModule` | `scripts/paperclip-build.mjs` typechecks the structural bindings against them |
| Behavioural proof | `createTestHarness` (`plugins/sdk/src/testing.ts` 483) | `scripts/paperclip-verify.mjs` |

Sophia's side (amendment `A13`, `packages/contracts/amendments/A13-workboard-source-review.json`):

| Route | Who | Does |
|---|---|---|
| `GET /api/v1/projects/{id}/plans` | members | the board (`sophia.work.board.v1`), checked against the contract |
| `GET`/`POST /api/v1/projects/{id}/plans/source-review` | members / editors | the pilot entry's bounds and sources; a proposal (201) |
| `POST /api/v1/projects/{id}/decisions/{decisionId}/answer` | the decider | `sophia.work.receipt.v1`; refusals are receipts |
| `POST /api/v1/projects/{id}/assignments/{assignmentId}/commands` | editors | Hold, Resume, Stop at a generation (202); guidance is `unavailable` |
| `GET /api/v1/projects/{id}/work/operations/{operationId}` | the operation's actor | the receipt as its effect stands |
| `GET /api/v1/projects/{id}/work/{workId}/result?version=` | members | the exact version, or withdrawn/unavailable |
| `POST /v1/coordination/{permit,start,observe,cancel}` | the adapter's capability, per company | the effect permit, the one start, observation with per-run usage, cancel → Hold |
| `POST /v1/runtime/source-review/{context,reserve,settle,submit}` | the runtime capability and its binding | the reviewer's reads, metering and publication, fenced |

## INT evidence (levels: **unit**, **sql-run** = real PostgreSQL through the real API over HTTP, **pinned-dsh** = the real pinned dsh with a stub model endpoint, **pinned-harness** = the pinned Paperclip SDK's own plugin test harness, **browser-local** = Chromium on a synthetic local stack; **not_run** = needs a live service or provider)

| Case | Status | Evidence |
|---|---|---|
| INT-01 pinned Paperclip and adapter load; readiness buys no model call | partial | pinned-harness (`scripts/paperclip-verify.mjs`) and a typecheck against the pin (`scripts/paperclip-build.mjs`); `testEnvironment` calls `/health` only (unit). A real Paperclip instance loading both packages: **not_run** |
| INT-02 cross-company/project, forged actor, expired, replayed rejected before effects | pass | sql-run: `packages/paperclip-plugin/src/coordination.db.test.ts` (forged, digest, expired, replayed, other company, unmapped, wrong operation, agent, other board user, no config); Sophia side in `apps/api/src/coordination.db.test.ts` (unknown capability, other company's capability, a member's token). Mutations M01, M03 |
| INT-03 a proposal runs no model or issue; decline or expiry commissions nothing | pass | sql-run: no issue before acceptance; decline; expiry |
| INT-04 acceptance bound to the exact revision; one decision precedes its consequence | pass | sql-run: only the decider; a replayed answer returns the same receipt; stale revisions are `conflict` (SQL) |
| INT-05 a lost create reply reconciles the same issue | pass | sql-run (plugin and end to end): unknown → lookup by key → delivered, one issue; a concurrent create answers 503. A commission wake that never arrived is asked again once its ask is stale, never while it may be in flight; one durable but unanswered is confirmed by its run, never asked again; concurrent resends ask the host once (WBC-02-CX-0002, CX-0004; synthetic host faithful to the pin's wakeup: no key deduplication, failure after durability). Mutations M02, M16–M19 |
| INT-06 one native attempt per core run; role, source and allowance enforced | pass | sql-run: start once per run, a second run attaches; eight model requests then `research_limit_reached`; no search; manifest-only reads; pinned-dsh: exactly the three review tools. Mutation M06 |
| INT-07 a pre-aborted signal causes no work | pass | unit (`execute.test.ts`); Mutation M04 |
| INT-08 a recovered observer attaches, never starts another | pass | sql-run (attach permit); unit (observer released without claiming an outcome) |
| INT-09 a lost result reply reuses the same immutable result | pass | sql-run: the repeated submit answers `replayed` with the same result and source |
| INT-10 Hold stops continuation; Resume keeps the work | pass | sql-run: fenced at once (reserve 409), held only after the runtime's check, mirrored `blocked`; Resume mirrored `todo` + wake. The allowance's remaining amount after Resume is not separately asserted A Hold whose issue update failed is applied by its resend, never answered `already`; a Resume's wakeup is reconciled as a commission's is; an older pending control never undoes a later one (WBC-02-CX-0002, CX-0004; sql-run on the plugin's tables, synthetic host). Mutations M15, M20–M22 On the pin's own heartbeat (`paperclip-host-probe.mjs`): a Hold made in Sophia ends its run as completed and the reviewer stays idle; the Resume wakeup queues a run that completes (WBC-02-CX-0007). A wakeup the host does not queue is not delivered (503 `wake_not_queued`). One delivery at a time changes a commission's issue (an effect lease); a delivery whose host call outlived its lease settles after a later control, so a delayed original Hold never undoes a later Stop (WBC-02-CX-0008). Mutations M23–M26 |
| INT-11 Stop refuses restart; unknown settlement is not Stopped | pass | sql-run (permit after Stop denies `stopped`); unit (`sophia_hold_unsettled`, never "held"). A cancel that never reached Sophia, or whose reply was lost, is asked again under the same run within the settle wait; never answered, the run says `sophia_hold_unconfirmed`, never released (WBC-02-CX-0002). Mutations M05, M05b, M13, M14 |
| INT-12 a Paperclip outage leaves Sophia usable; new work honestly unavailable | partial | sql-run: an undelivered commission is waiting/unknown on the board, never "running"; the conversation and native paths share nothing with the coordinator. A real outage: **not_run** |
| INT-13 a revoked input stops reads and result serving; no replacement task | partial | sql-run: a withdrawn source stops the work, withdraws the result, denies permits. Membership revocation over Sophia's HTTP API: independently verified by Codex (WBC-02-CX-0005, at `936081c`): a revoked viewer and editor are refused the report, the board, the availability, receipts and new operations, an admin keeps them. Not covered: Paperclip membership propagation, a running review stopped by revocation. Mutation M09 |
| INT-14 snapshot, replay and out-of-order events give the same board | partial | the board is a pure projection of stored state (unit, `projection.test.ts`), re-read on every event; no event-sourced replay to compare |
| INT-15 an adverse review completes its review, accepts nothing | pass | sql-run: `changes_required` → Complete; the reviewed goal unchanged |
| INT-16 the result opens at its exact source/version | pass | sql-run: `?version=` exact, another version `unavailable`, sha256 of the bytes; unit (Studio shows it only if its bytes hash). Mutation M10 |
| INT-17 usage basis per run; no recharge; unknown cost is not zero | pass | sql-run (claims per run; a second run reports 0 calls); unit (`costUsd: null`). Mutation M07 |
| INT-18 no mock route, fake account, auto-Ask, broad shell, private source or paid fallback | pass | the registry and unit name one route; the bridge's route guard (no fallback); pinned-dsh: three tools, no web/shell; Ask stays unavailable |
| INT-19 real provider qualification | not_run | needs Davide's allowance and Codex |
| INT-20 approved hosted pilot matches the reviewed source and closes safely | not_run | needs the authorized release |

## Checks run (2026-10-05, linux-x64, Node 24.21.0, pnpm 11.7.0)

| Command | Result |
|---|---|
| `pnpm check` (at `b50e8aa`) | format, lint, build, typecheck and contracts pass; unit tests 1356 pass, 0 fail, 1 skipped; `pnpm artifacts` reproduces every identity of `sophia-runtime-wbc02-dev` (bundle `17a6a46e`); integration gate against the real pinned dsh 95 pass, 0 fail, 2 skipped (the two service crossings that need `SOPHIA_DISPOSABLE_DATABASE_URL`) |
| `pnpm test:db` (local PostgreSQL 16, at `b50e8aa`) | 487 pass, 0 fail, including `apps/api/src/coordination.db.test.ts` (12) and `packages/paperclip-plugin/src/coordination.db.test.ts` (36, with the fault-injection and ordering cases of WBC-02-CX-0002, CX-0004, CX-0007 and CX-0008) |
| `node --test tests/integration/research-tools.test.mjs tests/integration/review-tools.test.mjs` | 8 pass: the reviewer through the real pinned dsh, the research roles unchanged |
| `node scripts/paperclip-build.mjs --paperclip <pin>` | bindings typecheck against the pin; packages bundled; `MANIFEST.json` digests |
| `node scripts/paperclip-verify.mjs --paperclip <pin>` | the built worker under the pin's harness: commission, resend, forged refusal, Hold/Resume/Stop; its 7 queries and 31 executes pass the pin's own `ctx.db` validators (the migration's install check is the host probe's); the adapter loads |
| `node scripts/paperclip-host-probe.mjs --paperclip <pin> --dist <built>` | the built adapter in the pin's own heartbeat (every pinned Paperclip migration, local PostgreSQL 16, a scripted Sophia): Hold → Resume, a review that ended blocked, a denied permit and new work leave the reviewer runnable; an adapter that cannot reach Sophia fails for an operator, after which the same issue is not woken (the host's recovery hold, CX-0009) while another is; and the built plugin installs through the pin's own loader (4 pass). Rebuilt with Sophia's endings reported as failures it fails as CX-0007 found; with the previous migration the install fails as CX-0010 found |
| Codex's independent checks at `936081c` | `pnpm check` and `pnpm test:db` (PG 17.6) reproduced; Studio driven in a browser on a local stack, desktop and 390 px (WBC-02-CX-0003, CX-0006); membership revocation over HTTP (CX-0005) |
| Mutation checks | [28, each caught](../evidence/WBC-02/mutations.txt) |
| Browser, synthetic local stack (API + Vite, Chromium) | [propose and decide, the board with the review waiting on Paperclip, phone](../evidence/WBC-02/README.md) |

## Studio

`ProjectShell` reads its plans from `useServedWork` (the served board through the board's own reader) only while Tasks is in view (`readsServedBoard`), unless a page brings its own; `GoalList` renders the pilot's entry under each goal. Everything else is in `features/work/planning/` (`ServedWork.tsx`, `ReviewSources.tsx`, `served.ts`) and `api/work.ts`. `fixture-boundary.test.ts` now asserts that production plans come only from the served board. The room fixture's API answers Tasks' two reads as the API answers a project with no plan and the pilot not enabled (`fixtures/fixture-api.ts`); `pnpm --filter @sophia/studio test:browser` runs every fixture page with its unexpected-request check. Names: the board knows the viewer's own name; others read as "someone" (no member directory is read).

## Not done, or known limits

- Nothing live (INT-01 live, INT-12 outage, INT-19, INT-20).
- After a run that genuinely fails (Sophia unreachable, a refused credential), the pinned host places a recovery hold on that issue (`issue_recovery_actions`, `legacy_execution_requires_reconciliation`), so its next wakeup is not queued (CX-0009). The plugin answers that as 503 `wake_not_queued` and the worker keeps asking; Sophia's board shows the delivery unconfirmed until an operator resolves the hold in Paperclip. The plugin never clears it, and never resets the agent.
- Not run here: the installed plugin worker behind the host's authenticated HTTP routes with a separate operator and a non-admin integration principal (Codex's installed-HTTP probe covers it).
- The pin's wakeup semantics are read from its source, not exercised against a running host (the SDK harness ignores the key). The plugin therefore never relies on deduplication: a run of the issue since the first ask confirms a wakeup, even one started by another trigger (it ran the issue, which is what the wakeup is for); a wakeup the host deferred has no run yet, so it is asked again only once stale, and the host merges an issue's deferred wakeups into its next run. Codex's live checks should include a Resume whose plugin reply is lost (one run) and a stale ask during a deferral.
- A status change made by a person on the Paperclip issue is not mirrored back: Sophia is authoritative, and its next control sets the issue again.
- Guidance and Ask stay unavailable (later missions).
- The board serializer exception: the board and receipt routes bypass `fast-json-stringify` after checking against the contract.

## Remaining obligations

[WBC-02-CC-0001](../coordination/WBC-02/WBC-02-CC-0001.md): Davide decides the route and payer, the pilot allowance and the WBC-02 thread; Codex reviews, builds and verifies against the pin, quotes the Paperclip infrastructure cost, and performs only the operations Davide authorizes.
