# CON-01 G2: option C impact inventory

The written inventory CX-0002 asked for before any G2 code. Its subject: every reader, writer, constraint and wire field that assumes a native attempt, outbox row, runtime command or binding has a **goal**. Option C ([binding map](BINDING_MAP.md) §8.2) lets an attempt belong to a conversation reply request instead.

The sweep was read-only, at `main` `71dbea3e` (the branch's base for G2). Each SQL function is cited at its **latest** definition. Line numbers are approximate. Claims marked *verified* were re-read directly for this file.

**State:** proposed, for Codex's review and Davide's D-6. No G2 code exists. The [binding map](BINDING_MAP.md) §8.2 binds what this file finds. Revision 5 (CX-0009) corrects two rows this file first left unedited: `apply_runtime_receipt` and `runtime_record_observations` (§3, §4.6, §4.7).

## 1. The finding that shapes the design: goal paths fail open

No goal-reading SQL function raises when the goal is NULL. The goal lookups find nothing, every `g.<field>` is NULL, and a NULL comparison inside a `CASE WHEN` or `IF` is not true, so the refusing branch is skipped.

*Verified* in `native_delivery_ineligible` (`0041_design_lifecycle.sql:149`). A goal-less outbox row passes these three fences silently:
- `WHEN g.authority_epoch<>o.authority_epoch` (the epoch fence);
- `WHEN g.status NOT IN (...)` (Hold and Stop);
- the resume status check.

The same pattern appears in `capture_native_result`, `research_turn_end`, the design and review turn ends, `research_scope_of`, `design_scope_of` and `review_scope_of`, `apply_runtime_receipt` and `settle_native_control` (§3).

**Consequence: option C is safe only with two rules applied together.**
1. **Reply first.** Every crossing a reply attempt takes gets an explicit reply branch, evaluated **before** any goal read. Its fences are the reply's own (§4).
2. **Fail closed elsewhere.** Every goal path a reply attempt must never take gets an explicit guard at its top: `IF g.id IS NULL THEN refuse` (or deny the delivery). A goal-less row reaching a goal path is then refused, never silently served. These guards are the only change to those functions' behaviour, and preservation tests pin the rest (§6).

## 2. Hard failures that would occur today without changes

| Where | What fails | Treatment in G2 |
|---|---|---|
| **The bridge** (`packages/dsh-bundle/src/protocol.ts:50-56`): `parseCommand` uses the generated `validateRuntimeCommand` | `RuntimeWorkBinding` (`openapi.json`, from A04) requires `goalId` (a string matching `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`) and `goalRevision` (integer ≥ 1), with `additionalProperties: false`. A goal-less command is **rejected** (`control-bridge.ts:651-665` sends `rejected`), and `apply_runtime_receipt` then fails the attempt | **Wire change (A16):** `RuntimeWorkBinding` takes either `{goalId, goalRevision}` or `{conversationReplyId}`, exactly one, via `oneOf`. Regenerated runtime wire (`generate-runtime-wire.ts`); bridge rebuilt; artifacts recorded (§7). The bridge never reads `goalId` or `goalRevision` (*per the sweep*: it reads only `attemptId` and `authorityEpoch`). Existing goal bindings validate as before |
| **NOT NULL columns** | `work_attempts.goal_revision` and `authority_epoch`; `outbox.authority_epoch`; `runtime_commands.authority_epoch` | `goal_revision` becomes nullable, with `CHECK((goal_id IS NULL) = (goal_revision IS NULL))`. The `authority_epoch` columns stay NOT NULL: a reply has **its own epoch** (§4.4) |
| `render_jobs.goal_id`, `artifact_versions.goal_id` NOT NULL | Rendering and publishing need a goal | Not touched. A reply never renders or publishes an artifact (no tools, no job; §4.1) |
| `runtime_hello` (`0028:74`, *verified* at L95-102) inner-joins `goals` | A reply binding is never reported to the bridge at reconnect, so it is **never restored** | Replaced: `UNION ALL` of the goal bindings (unchanged, byte-identical) and the reply bindings, with the reply's epoch and state (§4.5) |

## 3. Every goal-assuming SQL function, and what G2 does with it

| Function (latest) | Goal assumption | A goal-less row today | G2 |
|---|---|---|---|
| `dispatch_runtime_outbox` (`0042:1806`) | Locks the goal `FOR UPDATE`; writes `goalId` and `goalRevision` into the command body; the research-concurrency check joins goals | Enqueues a command with `goalId: null` (rejected by the bridge) | **Reply branch first:** when `o.conversation_reply_id IS NOT NULL`, it runs `conversation_dispatch(o, …)` (assembly, §4.2) and returns. The rest is byte-identical, plus a guard `IF g.id IS NULL THEN deny` after the goal lock |
| `native_delivery_ineligible` (`0041:149`) | Epoch and status checks on `g` | **Fences silently pass** | Guard at the top: `WHEN g.id IS NULL THEN 'not a goal''s work'`. Reply eligibility lives in its own `conversation_delivery_ineligible` |
| `capture_native_result` (`0042:1724`) | Goal join `FOR UPDATE`; status and epoch gates | Returns at the first missing job; a `draft_brief` job would publish unfenced | **Reply branch first**, keyed on the binding's attempt `conversation_reply_id`, before any goal or job read (§4.3). The rest byte-identical, plus a `g.id IS NULL` guard |
| `research_turn_end` (`0026:169`), `design_turn_end` (`0040:718`), `design_input` (`0040:470`), `review_turn_end` (`0042:1674`) | Gates on `g`; nudges insert outbox rows with `g.id` and `g.authority_epoch` | NOT NULL errors, or `put_text_source` with a NULL owner | Unreachable: they run only for a job of their kind, and a reply attempt has no job. Not edited |
| `research_scope_of` (`0025:365`), `design_scope_of` (`0041:44`), `review_scope_of` (`0042:1429`) | Goal join; fence on `g.status` and epoch | Requires a job of its kind first (else 42501), so already **fail-closed** for replies | Not edited. A test asserts a reply attempt's runtime-capability call to each is refused |
| `apply_runtime_receipt` (`0012:464`) | Goal join `FOR UPDATE OF g2`; `ready→running` and settle on the goal; terminal updates and events only for a **job** | Binding and attempt change, but a reply has no job: **a rejected create leaves the request waiting**, since no `turn/end` comes and capture never runs (CX-0009). A reply's `stop` `checked` calls `settle_native_control` with a NULL goal (a no-op) | **Replaced (revision 5):** a reply branch first, before the goal and job reads; the same goal-independent updates, then the reply's transitions (§4.6); the goal path byte-identical |
| `runtime_record_observations` (`0023:20`) | None (usage keyed by `attempt_id`), but it **writes text**: each observation's `data` is stored before capture, and an assistant message never calls capture | A late observation after a withdrawal's scrub **writes the withdrawn text back** (CX-0009) | **Replaced (revision 5):** a privacy-fenced reply branch under the conversation writers' lock order (§4.7); goal observations unchanged |
| `runtime_poll` (`0016:114`), `runtime_record_ready` (`0012:613`), `claim_runtime_outbox` (`0012:627`), `reconcile_runtime_outbox` (`0012:782`), `expire_dispatch_leases` (`0004:19`), `record_dispatch_result` (`0008:6`), `deny_` / `defer_native_delivery`, `runtime_unavailable` | None | Work | Not edited. **Proved under the new lane:** an uncertain reply dispatch is reconciled, and a lease that ran out is retaken, with no second runtime command (A12, A13) |
| `settle_native_control`, `admit_goal_command` (`0012:442`, `:279`) | Keyed by goal | `admit_goal_command` is not reachable for replies. `settle_native_control` **is** reached today, by a reply's `stop` receipt through `apply_runtime_receipt`, with a NULL goal: it finds no goal and does nothing | Not edited. `apply_runtime_receipt`'s reply branch returns before it (§4.6). Replies are cancelled by `conversation_cancel` (withdrawal, erasure, a source out of predicate, the grant switch, asker removal), which writes a `stop` runtime command at the reply's raised epoch (§4.4) |
| `claim_outbox` (`0007:11`, old path, only `races.db.test.ts`) | Inner join to goals | Never claims a reply row | Not edited |
| `runtime_hello` | See §2 | — | Replaced (§4.5) |
| Goal triggers (`0042:508`, `0028:261`, `0032:298`, `0040:944`); research and design revocation and publish functions | Fire on goal changes | Never fire for replies | Not edited |
| `native_task_view` (`0022:75`) | Inner join to goals | Reply jobs are invisible (there are none) | Not edited. That replies are invisible to every task reader is the **intended** result: there is no goal to filter |

## 4. The reply's own crossings (new functions; nothing goal-shaped)

1. **Admission** (`conversation_ask`, replaced from 0048, which records `blocked` / `replies_not_enabled` today). When the grant and runtime allow, it writes, in the send's transaction, all of:
   - `work_attempts` (`goal_id` NULL, `goal_revision` NULL, `conversation_reply_id`, `authority_epoch` 1, `state` `admitted`);
   - `execution_bindings` (`native_session_id` `sophia-<attemptId>`, `continuation_owner` `sophia_episode`);
   - `commands` (the asker; `goal_id` NULL; the key is the request id);
   - one `outbox` row (`native.create`, `goal_id` NULL, `conversation_reply_id`);
   - the request `pending`.

   **No job row** (jobs are task records; capture keys on the request). Otherwise it records `blocked` with its reason, and writes nothing else.
2. **Dispatch** (`conversation_dispatch`, which calls the assembly `conversation_reply_statement` of the binding map §8.3):
   1. reply eligibility: the request is `pending` (first dispatch) or `running` (a lease retaken after reconcile), the asker still writes, the conversation is `open`, every source still satisfies the full source predicate ([binding map](BINDING_MAP.md) §8.3), and the grant is enabled and unexpired;
   2. assembly, plus `conversation_reply_sources`;
   3. a payload `{role:'sophia-conversation-v1', route, text}`;
   4. a binding `{conversationReplyId}`.
3. **Capture** (the reply branch of `capture_native_result`): on `turn/end`, the publication checks (§8.3), then one Sophia message and the request `answered`; or `failed` / `cancelled`; then `retire` (§8.5).
4. **Epoch.** A reply attempt's `authority_epoch` starts at 1. `conversation_cancel` raises it to 2 and writes a `stop`. The bridge's existing stale-epoch rejection (`control-bridge.ts:705-707`) then refuses any older command, and capture withholds a result whose owning command's epoch is older (the existing rule, applied in the reply branch).
5. **Hello.** Reply bindings in `running`, `idle` or `stopping` are listed with `authorityEpoch` = the attempt's, and `state`: `stopped` once cancelled or retired, else `active`. A reply never has `held`.
6. **Receipts** (the reply branch of `apply_runtime_receipt`; CX-0009 correction 1). The terminal path for what never reaches `turn/end`: a rejected create (`failed` / `runtime_rejected`), a failed create (`failed` / `runtime_failed`, its open reservation `uncertain`), an uncertain create (`outcome_unknown`, the same request, attempt and reservation, never a new attempt), a stop (the request stays `cancelled`) and a retire. Each writes a `retire` where a native copy may exist. The full table and the receipt-only tests are in the [binding map](BINDING_MAP.md) §8.2.1.
7. **Ingestion** (the reply branch of `runtime_record_observations`; CX-0009 correction 2). Under the project row, then the reply rows in id order, the order every conversation writer uses: an observation for a request no longer `pending` or `running`, or for an erased conversation, is stored **scrubbed** (its ids, type and sequence kept; its `data` reduced to usage). Usage is recorded from the original first. Scrubbing anywhere is an update in place, never a delete, so a replayed batch never re-inserts text. Tests in the binding map §8.2.2.

## 5. TypeScript readers and writers

| Item | Today | G2 |
|---|---|---|
| `packages/persistence/src/outbox.ts:12` `OutboxRow.goal_id: string` | Type only; the worker reads `project_id`, `id`, `lease_token` | Type becomes `string \| null` |
| `native-tasks.ts` (`readNativeTasks`, `readNativeTask`, `readStandingRows`) | Inner joins to goals | Unchanged: replies are not tasks |
| `snapshot.ts` `readResources` (`:148-158`) | Counts launching and running bindings without a goal join | Unchanged: a resource running a reply **is** running. Said in the record, so nobody reads it as hidden work |
| `mission-context.ts` work list | Per goal | Unchanged |
| `coordination.ts` (`:194-200`) | The source-review attempt is found by `wa.goal_id = w.execution_goal_id` | Unchanged: a reply attempt has no goal, so it never matches |
| `design-progress.ts` | Reads no attempt, binding or command | Unchanged |
| `native-tasks.ts` `readResult` usage (`usage_records` by `attempt_id`) | Keyed by attempt, not goal | Unchanged. A reply's usage rows are recorded by `runtime_record_observations` like any attempt's; the grant's reservations (§8.4 of the binding map) settle from them |
| `apps/api/scripts/diagnose.ts` (`:116-120`) | Lists runtime commands' kind, stage and receipts, never the body | Unchanged. A test asserts no conversation text reaches its output |
| `apps/api/src/routes/runtime.ts:131` | The command body passes through untyped | Unchanged |
| `apps/api/src/media-tools.ts` `controlWork` | Finds work by goal | Unchanged: the voice guide cannot control a reply, as intended |
| `packages/dsh-bundle/src/control-bridge.ts` | Reads `attemptId` and `authorityEpoch` only | Unchanged for goals. Added: the `conversation_reply` metering account (§8.4), `retire` (§8.5), and the role preset (`role-registry`, `cordis.patch.yml`) |

## 6. Preservation evidence (what proves the goal paths are untouched)

- **Function body diffs.** For each replaced function (`dispatch_runtime_outbox`, `native_delivery_ineligible`, `capture_native_result`, `runtime_hello`, `apply_runtime_receipt`, `runtime_record_observations`), a test reads `pg_get_functiondef` and the 0042, 0041, 0028, 0012 or 0023 source text. It asserts the new body equals the old one with only the named insertions: the reply branch, and the `g.id IS NULL` guard.
- **Pinned behaviour:** `db/tests/0037_amendment_preservation.sql` (dispatch's grants, SECURITY DEFINER and `search_path`); `personal.db.test.ts:922-929` (no `sophia` function executable by PUBLIC); `db/tests/0001_scope_and_commands.sql`; `runtime.db.test.ts` (hello bindings, epoch); the full `pnpm test:db`; `pnpm test:integration` (`runtime-service.test.mjs`, which uses `goalId`).
- **Bridge fixtures** with a goal binding (`tests/unit/bridge-core.test.mjs`, `routes.test.mjs`) stay as they are, and a reply-binding twin is added.
- **Readiness:** `REQUIRED_SCHEMA` is not changed (`runtime_hello`'s signature stays). G2's functions join `CONVERSATION_SCHEMA`.
- **Test that changes by design:** `conversations.db.test.ts`'s A10 case. "Asking writes no attempt" holds only without a grant or runtime. With both, exactly one attempt, binding, command and outbox row is written, and no goal and no job.

## 7. Shared files and windows (to be acknowledged before writing)

| File | Owner today | CON-01's change |
|---|---|---|
| Migration 0049 (`CREATE OR REPLACE` of the six functions above) | One writer; #190's 0046/0047 (at `f885459`) replace only `media_assignments` | Replaced from their latest bodies, with the insertions only |
| A04's `RuntimeWorkBinding` (amended in A16), `dsh-bundle/src/runtime-wire.generated.ts` and `runtime-wire-types.generated.ts`, `dsh-bundle/dist` | Contracts and runtime writer | `oneOf` goal or reply |
| `config/specialists.json` + schema, `role-registry.ts`, `cordis.patch.yml`, `runtime-unit.json` (id, presets, `role_routes`, `model_routes`), lock and digests | Davide (LFE-00) | One role, one preset and one route (D-4). `pnpm artifacts:record` once, on the combined candidate |

**Requested here:** acknowledgment from #190's owner (SDD-01 G7) and from the WBC-02/SDD-01 runtime owner, plus a named `main` window, before 0049 and before the runtime artifacts are recorded.

## 8. Why still C, and not B

B (a separate reply queue and bridge poll) would avoid touching these functions. But it duplicates the leases, journal, reconcile and epoch fencing that §3 shows are goal-independent and already proven.

C changes six functions with reply-first branches and fail-closed guards, and leaves every other goal path byte-identical. The fail-open finding (§1) is the reason the guards are part of the design, not an afterthought: without them, C would be unsafe.
