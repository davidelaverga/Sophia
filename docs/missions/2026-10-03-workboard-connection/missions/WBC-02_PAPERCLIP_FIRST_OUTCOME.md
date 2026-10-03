# Mission 2 — WBC-02
## One real managed source review, visible in Luis's board

**Backend/product owner:** Davide. **Frontend integration owner:** Luis. **Implementation:** Claude Code in its own worktree. **Operator/independent reviewer:** Codex under separate authorization.  
**Delivery:** one integration PR, `scm-01/workboard-source-review`, consuming WBC-01.  
**Parent scope:** SCM-00/01 plus a bounded plan/projection capability from SCM-04-G2 and the native dsh safety portion of SCM-03.  
**Status:** implementation instructions; no integration or live test has been performed by this packet.

## 1. The user outcome

In an explicitly enrolled founder project, a builder selects a small set of project sources and the goal/criteria they want checked. Sophia presents a **fixed source-review plan template**, not a generated roadmap. The authorized person accepts that exact plan and allowance. Paperclip records and schedules one source-review item; the existing dsh bridge executes it with a read-only role. Luis's board shows actual state. A retained review result opens from the task and remains correct after reconnect or observer restart. Hold/Resume/Stop work on that assignment without a second writer or stale publication.

A review may conclude that evidence is missing or contradictory. That is a useful completed review, not permission to accept the implementation or deploy it.

**Do not resurrect `draft_brief`.** The living brief stays in its existing mission path. The first task is `source_review`, as selected in SCM-01. No new native coding engine, general researcher, personal-memory store or renderer is introduced.

## 2. What this PR deliberately does not do

It does not connect the three owner-native resources, introduce Omnigent now, generate general plans, schedule periodic lead reasoning, implement cross-agent peers, buy capacity, reassign after quota exhaustion, or connect contextual Ask to a new conversational model. Those remain the retained SCM-02–06 work.

Only a qualified Sophia-native doer appears in the first live board. Other controls/resources remain unavailable with a truthful reason. The candidate-open control, plan decision, Hold/Resume/Stop and the live read projection are real in this mission. Guidance, external permissions, contextual Ask and Review work progress remain unavailable until their real paths are implemented.

## 3. Entry and source binding

Read [current ledger](../01_CURRENT_LEDGER.md), [interface contract](../contracts/01_WORKBOARD_BINDING.md), current SCM-01 and `coordination/03_PAPERCLIP_INTEGRATION.md` in v2.0, and [source register](../sources/REGISTER.md).

- Re-fetch main, open PRs and the existing coordination issue before changing code. Main inspected here is `c8dd5aa…`.
- Consume the accepted WBC-01 schema/fixture digest. Backend setup can start in parallel, but one owner resolves the shared contract before a live binding is written.
- Pin Paperclip to the **existing plan candidate**, `5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb`. Build it and the plugin/adapter artifacts; the source SHA is not an image digest. Do not upgrade to an unrelated latest release inside this goal.
- Preserve the actual dsh runtime unit and public control bridge. Inspected source pins dsh `0.2.0-rc.2`; the runtime manifest's historic readiness text is not live evidence. Codex verifies effective deployment identity independently.
- M03/#32 owns its specialist/source/report changes. Reuse the current Source abstraction, scoped source readers and bounded text storage. Obtain an explicit handoff before extending M03-owned files. No duplicate registry, report service or ad-hoc cherry-pick of a partial migration chain.
- The initial review result is bounded text/Markdown in the existing source record path. A PDF renderer and byte store are **not prerequisites**. A thin task-result reader can render that text using the current shared rendering surface; it does not create a second artifact system.

## 4. Chosen architecture and ownership

```text
Luis's board / authorized user
            |
Sophia API: plan intent, decisions, source eligibility, effect permits
            |
Paperclip + first-party sophia.coordination plugin
core issue / assignment / run / wake / operational disposition
            |
external sophia-dsh adapter
            |
existing Sophia runtime service and dsh control bridge
            |
bounded source-review role -> explicit result submission -> Source record
            |
Sophia read projection + existing project event stream -> board and result
```

Sophia retains the mission, goal criteria, immutable accepted plan, human decisions, sharing/eligibility, resource/allowance authorization and Stop fence. Paperclip owns operational lifecycle for the admitted work. The dsh bridge owns native delivery, journaling and execution identity. The board is a read projection, not another scheduler.

The existing worker can deliver and reconcile operations; it must not independently retry/reassign/continue the managed work. Do not replace the existing safety fence with a Paperclip task status, or assume a core task update stops a remote process.

## 5. Ordered implementation sessions

### G1 — Install and prove the supported service boundary

Build the pinned Paperclip service and **self-contained** `@sophia/paperclip-adapter-dsh` and `sophia.coordination` plugin packages. Use a separate database and private fixed origin. Expose no board/admin token or upstream generic proxy in Studio.

Use the v2.0 selected dedicated, company-scoped integration board principal, without instance-admin privileges. Its service identity is logged honestly. An initiating Sophia human/assignment is a separate signed field checked against current Sophia authority. Installation/admin uses a separate operator credential. Do not impersonate a user by passing arbitrary `actorId` to an admin API.

The plugin declares namespace routes using the actual `apiRoutes` manifest and host `onApiRequest` contract. It uses supported host issue/agent/project APIs; namespace SQL stores only operation bindings, cursors and reconciliation state. No direct writes to Paperclip core issue tables and no private duplicate issue state machine.

**Required binding deliverable:** for create/read issue, stable commission lookup, schedule/invoke, task hold/disposition and cancellation, record the exact exported method or route, actor, request, response, duplicate behavior and failure behavior at the pin. Inspect the source and test each. Do not invent a public route from an internal function name. The supported fields must carry an exact stable commission identity; titles are not identities.

`testEnvironment()` checks installation, service access and configuration without purchasing a model call. A live probe is a separate authorized operation. Hiding an adapter in upstream menus is not the safety shutdown: the Sophia effect permit and admission gate must still deny execution.

**Gate:** real authenticated service/adapter integration succeeds and rejects cross-project/forged/stale envelopes. A contract gap is recorded before widening scope; do not fork the scheduler to make the first task appear successful. [P01–P03]

### G2 — Make one plan admission durable

Expose the proposed Sophia routes through a reviewed contract amendment (names below are **new Sophia endpoints**, not Paperclip endpoints):

| Route | Behavior in WBC-02 |
|---|---|
| `POST /api/v1/projects/{projectId}/plans/source-review` | Build one deterministic proposed review plan from a goal, its criteria and 1–3 eligible source versions. No model, issue or provider work yet. |
| `GET /api/v1/projects/{projectId}/plans` | Validated `sophia.work.board.v1`, with current/proposed definitions, live facts, coverage and project cursor. |
| `POST /api/v1/projects/{projectId}/decisions/{id}/answer` | Commit the exact human answer through the canonical decision mechanism and emit its receipt. An accepted plan enqueues one commission. Declining/expiry dispatches nothing. |
| `GET /api/v1/projects/{projectId}/work/{id}/result` | Resolve the readable exact result/source version, or pending/withdrawn/unavailable. Reuse current scoped source read/formatting code. |
| `POST /api/v1/projects/{projectId}/assignments/{id}/commands` | Only qualified dsh Hold/Resume/Stop in this slice; guidance and external-route operations are rejected as unavailable before dispatch. |

Use the existing idempotency-header and receipt conventions; the body's exact spelling is finalized once in the live OpenAPI amendment. The semantic identities in [the contract](../contracts/01_WORKBOARD_BINDING.md) are mandatory even when repository casing differs. Add no second route for the same decision outside that mechanism.

The proposal carries fixed boundaries: **up to 3 selected source versions, at most 32 KiB total input text, no web/shell/connector access, at most 8 model requests, at most 16 KiB submitted report text**, and one separately supplied positive monetary/usage allowance. These are selected pilot limits, not claimed upstream defaults. The chosen limits and priced route are visible before acceptance. A lower existing cap wins. No allowance or unknown required price/cost enforcement means no dispatch; coding subscriptions are not automatically the payer.

Store one immutable accepted-plan definition with `goal_id`, goal/criteria revision, mission revision, source manifest, recipe and completion policy. The live state is separate. Never reuse an old mission acceptance as blanket permission for new paid work.

After commit, the outbox delivers the commission to the plugin. Use a unique server-owned commission key and verified lookup in core records. Serialize creation for that key. When a create response is lost, reconcile the same core object; never repeat creation solely because no response reached Sophia. If the selected upstream method cannot establish absence or exact identity, retain `outcome_unknown` and require reconciliation rather than guessing from a title.

**Gate:** response-loss and duplicate-request tests prove one work ID/one core issue. No shared transaction is assumed across the two databases.

### G3 — Execute the real review through existing dsh

Implement `ServerAdapterModule` through the external-adapter factory, not a fork of Paperclip. Use `sessionParams` for stable native association, correct `usageBasis`, nullable unknown cost and typed failures. Register `await ctx.onCancellationReady?.()` and observe `ctx.signal` before any native/provider effect; test an already-aborted signal. Call `onDispatch` immediately before the actual remote/native start, not at plan creation. [P02]

Create a new explicit **`sophia-source-review-v1`** recipe/preset using the repository's selected registry after the agreed M03 handoff. Do not silently give broad powers to the older identity-only `sophia-review-v1`. Preserve dsh's normal loop and scoped-tool guards. The reviewed runtime/bundle identity changes through its actual build/qualification tooling.

Use the currently approved underlying model route; at this source pin it is the recorded development `openai / gpt-6-luna / high` route, not an instruction to add a new provider. Bind the actual available approved route at G1 and record its exact identity. A new route/model change needs a separate scoped decision rather than automatic fallback. This packet does not establish that the route is live available or funded.

Every billable model request uses the existing bounded admission/reservation/settlement mechanism, including any compaction or retry call. The eight-request ceiling counts those calls too. Resolve a finite output ceiling and conservative request reservation before dispatch; settle actual billed usage afterward. An uncertain charge keeps its reservation unresolved rather than restoring fictitious headroom. Resume inherits the same remaining allowance. Extend the shared M03-owned budget seam only through its explicit handoff, not a second accounting system.

The role has only:

- `read_review_source`: read pages of one of the manifest's eligible exact sources;
- `submit_source_review`: submit the structured findings and bounded text result;
- `report_review_blocker`: retain a precise missing-input/permission/configuration problem.

Tool names here are new implementation targets. Trusted context supplies project, attempt, source manifest and allowance; the model cannot select another owner, URL, database, work ID or source corpus. The host compiles criteria and source identity; source text remains untrusted data, not tool policy.

Submission validates source references, applicable criteria, selected candidate/source version, size, current eligibility and control epoch. It stores an immutable source-backed result before emitting result-ready. A plain assistant message does not publish a result. A run that ends without a submitted result is an explicit no-result outcome, not automatic Complete.

Use [the literal review instruction](../prompts/SOURCE_REVIEW.md) as a versioned role asset. Its structure is Goal / Evidence inspected / Findings / What remains unknown / Suggested next action. Each finding cites actual inspected source identifiers; it does not declare tests passed without evidence or accept/deploy the implementation.

The review's own completion policy requires a successfully stored review deliverable and its structural/reference checks. Its substantive verdict can be `changes_required` or `insufficient_evidence`. That does not satisfy the implementation's acceptance requirements.

**Gate:** an actual core issue drives an actual native dsh attempt; a real provider test is separate from fake-provider runtime tests. The task opens a useful retained review in Luis's board.

### G4 — Reconcile without duplicate work or false completion

Keep stable mapping of Sophia project/goal/plan/work/assignment/generation to Paperclip company/project/issue/run and the native attempt/session. Control authority is attached to the work and its current attempt, not browser array order.

On observer loss after native creation, recover the mapping and attach to the same execution. An upstream replacement run must obtain current effect permission; it cannot create another native writer while the old one is live or uncertain. A lease timeout alone is not proof of death or proof that prior effects did not occur.

On native result publication followed by a lost acknowledgement, reconcile the existing immutable result by submission identity. Retry delivery/finalization, not the model task. The same result can be notified again without becoming two candidates.

Hold first closes continuation admission, then requests cancellation/settlement at the route's supported boundary. Held is shown only after the current native work is settled. Resume is explicit and preserves the same work, remaining allowance and source constraints; no blanket budget reset. Stop retires future continuation, then cancels/drains the active attempt. Stopped results cannot publish late, and a delayed answer or message cannot reverse it.

Guidance/capacity classification must never sit in front of the safety path. An unavailable Paperclip service does not disable the existing native safety fence. After recovery, mirror the held/stopped intention into the operational record before any new effect permit can be granted. This is reconciliation of a control decision, not a second scheduler.

Revoking an input closes eligibility, stops affected review work and prevents the old result from being served as a current authorized output. Preserve required non-content audit evidence under the existing retention rules. Do not automatically start a replacement review on a narrowed corpus in this mission.

**Gate:** pre-start cancellation, mid-work Hold/Stop, response loss, native-observer loss and source withdrawal all have real local process/database evidence. No live-provider delay is manufactured merely to test a timer; deterministic test hooks may exercise these races and must be labeled.

### G5 — Feed the existing UI and release narrowly

Return the proposed WorkBoardView through Sophia's authenticated API. The browser never accesses Paperclip administration. Reuse the existing project event stream: immutable event ID, monotonic project cursor, entity/attempt generation and snapshot resynchronization. A projection version is not a plan revision. Coalesce activity bursts; preserve every durable decision/control/result event.

The UI may be cached, partial or unavailable. It must not turn a lost service into an empty board, all-complete state or fabricated heartbeat. Reads continue to respect current membership/source withdrawal. Show the actual native reviewer identity without fake account capacity.

Add a small explicit **Review selected sources** pilot entry for authorized members in Tasks. It uses current project sources and goal criteria, displays the proposal/allowance and then uses the normal decision control. This is real user admission—not operator SQL seeding as the only entry. It is not automatic goal/roadmap generation.

Keep unavailable controls visibly unavailable or omit them with context: live Ask, generative lead review, guidance and owner-native enrollment are not silently attached to mock handlers. WBC-01's exact result port opens the retained text result. Connect no microphone and make no guide prompt change just to show the first board task.

Prepare a reader-first release: registered contracts/readers and new migration dependencies before writers/adapters; private service build and credentials separately provisioned; new admission feature closed by default; pilot enabled only for the approved project after health/auth/contract checks. Existing conversation/living brief remain usable when Paperclip is down.

Codex independently verifies deployments, migrations, artifact digests, effective roles and current allowance before one explicitly approved live review. Local integrated tests do not stand in for hosted acceptance.

**Gate:** a person submits/accepts one plan, sees actual work, opens the result, reconnects and exercises control. Record separately: source-ready, local-integration-passed, provider-qualified, hosted-verified and product-accepted.

## 6. Code and data changes

| Destination | Responsibility |
|---|---|
| `packages/coordination/` (new) | Work/plan binding, admission constraints, current-effect permit, deterministic read projection. No separate autonomous scheduler. |
| `packages/paperclip-plugin/` (new) | First-party declared namespace routes, core issue binding and projection/reconciliation metadata. |
| `packages/paperclip-adapters/src/sophia-dsh/` (new) | External adapter factory, execution, readiness, cancellation and stable native association. |
| `apps/api/src/routes/coordination/` (new) | Member-scoped proposal/decision/read/control/result facade. |
| `apps/worker/` (existing) | Deliver/reconcile durable intents, not independently replan or buy another attempt. |
| Current dsh bridge/registry | New scoped review recipe/tool bindings and work association only. |
| `packages/persistence/`, `packages/contracts/amendments/`, `db/migrations/` | Canonical plan/decision extension, binding and reader projection; fresh IDs after all open reservations are checked. |
| `deploy/paperclip/` (new) | Exact build/configuration, private networking, independent database and operating instructions. |
| Existing Studio plan/result/API seams | Consume WBC-01 view/receipts; narrow source-review admission and result read. |

Keep Paperclip's database/migrations separate. Sophia owns plan and human-decision content; Paperclip owns core operational task state. Projection caches and mapping rows are not a second authoritative editable task board. Source text stays in the existing Source abstraction; the plugin holds minimal references and eligible bounded task context.

## 7. Acceptance cases

| ID | Required observation |
|---|---|
| INT-01 | Real pinned Paperclip and external adapter load; readiness does not purchase a model call. |
| INT-02 | Cross-company/project, forged actor, expired envelope and replayed nonce are rejected before effects. |
| INT-03 | Creating a proposal runs no model/issue; decline or expiry creates no commission. |
| INT-04 | Acceptance is exact-revision-bound; one committed human decision precedes its operational consequence. |
| INT-05 | Lost issue-create reply reconciles the same commission/core issue, never a title-based duplicate. |
| INT-06 | One native attempt is bound to the core run; actual role/source/allowance constraints are enforced. |
| INT-07 | Pre-aborted signal causes no native/provider work. |
| INT-08 | Crash observer after native creation; recovered observer attaches rather than starting another attempt. |
| INT-09 | Lost result reply reuses the same immutable source result; no model re-execution. |
| INT-10 | Hold stops continuation; explicit Resume keeps remaining allowance and identity. |
| INT-11 | Stop plus late callback/recovery refuses restart/publication; unknown native settlement is not Stopped. |
| INT-12 | Paperclip outage leaves conversation/living brief/native Stop usable; new work is honestly unavailable. |
| INT-13 | Revoked input or membership prevents future reads and current-result serving; no automatic replacement task. |
| INT-14 | Snapshot/replay and duplicate/out-of-order events produce the same board with no old-attempt takeover. |
| INT-15 | Review with adverse findings completes its own review policy but does not accept the implementation. |
| INT-16 | Open result resolves exact source/version under current access; no fake preview URL or replaced source. |
| INT-17 | Usage basis preserves billed amounts; cumulative totals not recharged; unknown cost is not zero. |
| INT-18 | No hidden mock route, fake account, auto-Ask, broad shell, private source or paid fallback in pilot. |
| INT-19 | Real provider qualification identifies the effective model and role and returns useful source-grounded text. |
| INT-20 | Approved hosted pilot matches the reviewed source/artifact/configuration and can be closed safely. |

All start **not run**. Local database/runtime tests use the project's existing harness. Record the fake-provider versus real-provider boundary, deterministic fault injection, source manifests and exact result identity. Each repaired defect gets a regression that fails without the repair.

## 8. Release, rollback and handback

Claude prepares code/tests/amendments and exact operations requests. Codex first discovers actual hosted state. No new instance, schema mutation, production deploy or provider spend occurs without the separately authorized batch in [the protocol](../operations/CLAUDE_CODEX_PROTOCOL.md).

Disable new managed admissions before recovery. Preserve binding/result records. Keep readers compatible with already-written data. Do not drop new tables or roll back a writer underneath a newer reader by guessing; forward repair or an explicitly compatible previous image is the recovery path. Before allowing legacy/manual fallback to touch this work, verify the old managed writer has stopped and transfer control explicitly.

Close with a concise source/evidence handback: actual contract amendment IDs and migration order, Paperclip/plugin/adapter/dsh identities, core and native association, tests by evidence level, the source result, remaining product dependencies and the next bounded PR.

**Stop condition:** one real managed source-review result and its control/recovery path are proven. Do not expand into SCM-02–06 inside this PR. If basic binding needs a pervasive Paperclip authorization/scheduler fork, stop at that exact incompatibility, keep the UI usable and report a narrowly priced alternative; do not quietly implement a duplicate scheduler.
