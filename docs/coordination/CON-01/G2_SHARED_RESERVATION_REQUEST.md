# CON-01 G2 Phase B: the shared reservation request, revision 2 (for the owners' acknowledgement; docs only)

**What this is.** The record that BINDING_MAP §8.8 Q6 and D-10 call `G2_SHARED_RESERVATION_REQUEST.md`. It covers freeze r2's Phase B start conditions [3] and [4].
- **What it asks:** each recorded owner's narrow acknowledgement of its own surfaces, the exact Phase B scope, and the base, number, writer, order and handback that must be recorded before any shared write.
- **It asks; it assumes nothing.** No shared file, migration, number, contract, runtime, grant, role, route, deployment or provider effect is written or authorized here.
- **It doesn't repeat what is already pending elsewhere.** It points to it (§6).

**Revision 2, after CX-0155.** The joint Phase B review found four P2s in revision 1 (`57f66b50`), with the verdict `CHANGES_REQUIRED_NO_RESERVATION_OR_WRITE_GO`. Codex's root review agrees with all four. Each is accepted:

| Finding | Disposition | Where |
|---|---|---|
| PB-OWNER-ROUTING | **Accepted.** Revision 1 claimed that no separate core or ledger owner is recorded. That claim was wrong, and it is withdrawn: routing r2 and the current plan name them. Ownership is now split by surface: CON's own responsibility, the retained core and runtime owners' acceptance, and the joint lane's consumer compatibility. Each is asked for its own narrow acknowledgement, and the owner lanes name their current writers; no writer is inferred from old commit authors. S2 is CON's reply-reservation ledger, distinct from SMC-M01. No M01 object changes, so no M01 acknowledgement is asked | §1, §2, §5 |
| PB-SQL-MANIFEST | **Accepted.** §3.1 is now an exhaustive manifest. It lists: option C's DDL; the seven replaced functions, each with its latest body and owner; the five authenticated entry points and their ACL; every new CON object, including the cleanup `retire` writer and its idempotency key; and S1–S4's exact objects, hashes, triggers and ACLs. **S3's role preamble and its role grant are excluded.** They are superseded under D-8 (Q13A), and the assembly dependency is named. Ask stays off. S2's release and reconcile stay dormant stubs, and their proof sources are stated as later tasks | §3.1 |
| PB-IMPLEMENTATION-COMPANIONS | **Accepted.** §3.2 now names: the persistence module and its five wrapper signatures (`runtime.ts` is read, not edited); the routes and their registration; `generate-runtime-wire.ts`'s exact `SCHEMAS` and `VALIDATED` additions; and every generated companion. §3.4 now names `config/dsh/profile/pnpm-lock.yaml`, as recorder output only, and the canonical patch and profile paths. Revision 1's bare `cordis.patch.yml` was the wrong place for the reply child's row. That row belongs in the reply template's rows | §3.2–§3.4 |
| PB-GATE-ORDER | **Accepted, the first of the review's two sequences.** Every pin that changes the bundle records its identities and the profile lock in the same commit (AGENTS.md:56) and passes the complete gates before the next pin. Revision 1's "record once, at the end" is withdrawn. To make each pin compile on its own, A16's changes to A04's components move from step 2 to step 3, the bridge's step. Each new test is placed where a gate runs it (§3.3, §3.4). There is no stale-artifact waiver, and no claim of a crossing that hasn't run | §3.3, §3.4, §4 |

What revision 1 got right stands: the frozen Q7 r8 design and its consumer ACK; the dispatcher-first base (main, the accepted Phase A, then G1's 0048); one writer; the stopped handback; and every hold.

**It rests on these exact records:**

| Record | Exact identity |
|---|---|
| Q7 design, revision 8 (frozen) | [`7d4a76d9`](https://github.com/davidelaverga/Sophia/blob/7d4a76d9ec50fc80e97b3d2912e48ae362863043/docs/coordination/CON-01/G2_Q7_RELAY_OWNERSHIP.md), tree `5df0f52d`, document SHA-256 `82ff0856fd6a5a6d…`, 1298 lines |
| The joint consumer ACK of that exact revision | `BOUNDED_RUNTIME_CONSUMER_DESIGN_ENGINEERING_ACK_EXACT_R8_ONLY`. Findings empty. Safe record `942e5a3cc79d86da…`, original `fc4f61ca63e063fc…`, in [CX-0154](https://github.com/davidelaverga/Sophia/blob/aeff9f89147a96ca0ce3cebe5a776dc8107df24c/docs/coordination/CON-01/CX-0154.md). **A design ACK only:** no writer window, no core or ledger acceptance, no implementation and no target qualification. CX-0155 keeps it valid |
| The joint Phase B review of revision 1 | [`joint-phase-b-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/9fbc1fc26fcb5cd3a49d103a7e282d5bd8d75f0e/docs/coordination/CON-01/evidence/20261012-cx155-reservation/joint-phase-b-review.safe.json) at `9fbc1fc2`, SHA-256 `350d0213059b8745…` (original `894e518aff23f3ec…`). Four P2s; B-1 to B-6 judged compatible consumer directions; K-1 to K-5 routing |
| Codex's root review and the combined packet | [CX-0155](https://github.com/davidelaverga/Sophia/blob/9fbc1fc26fcb5cd3a49d103a7e282d5bd8d75f0e/docs/coordination/CON-01/CX-0155.md) at `9fbc1fc2`; [#198 comment 6118556530](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6118556530) |
| Revision 1 of this file | `57f66b5067a4e50cc0df0190d491947f2624596b`, tree `7a571790`, SHA-256 `6aee5c9e789b23ea…`, 232 lines |
| The owner routing | [`joint-owner-routing.r2.json`](https://github.com/davidelaverga/Sophia/blob/7dc23203eeaef3e91e4515f36127e1f86318d7c4/docs/coordination/CON-01/evidence/20261012-cx131-boundary/joint-owner-routing.r2.json) at `7dc23203`, SHA-256 `569fe9275b0bdb76…` |
| The current plan | `docs/execution/2026-10-01-unified/planning/goals.json` on observed `main` (SHA-256 `1cf14f4e4f49ef1a…`): S1-02 Luis (`folded_not_restarted`); S1-05A and SMC-M01 Davide/Luis (`retained_foundation`). `goals/BASE.md` (`d58298a699f5d6ab…`), whose line 30 asks BASE to "name current writers for routes/App/SidePanel, A10/A11/contracts, registry/byte store and runtime locks". **Routing evidence, not an appointment or an ACK** |
| The shared-runtime freeze, r2 | `SHARED_RUNTIME_FREEZE_20261012.r2.json` at `01777c5ca32b8a92…`, SHA-256 `0a24d62dd9d2df01…`. CON's acknowledgement is CC-0155. **A consumer freeze and preservation agreement; it transfers no foundational SQL ownership** |
| Phase A | GO record `SOURCE_PHASE_A_20261012.r1.json` at `a5479439e8b52424…` (SHA-256 `946c654fb03786ca…`). The pin is `93e9313d` (PR #256, draft), with `0053_runtime_outbox_reconcile.sql`. **The window has ended; acceptance is separate and still pending** |
| The decisions record | D-8 (Q13: least-privilege per-identity isolation; continued inheritance of the broad `sophia_api` is not sufficient), D-10 (the writer) and D-12 (what may be written now), at [`3b1af9b9`](https://github.com/davidelaverga/Sophia/blob/3b1af9b94413a409214b05203d5fbdf5088435c1/docs/coordination/CON-01/BINDING_MAP.md) §13; §8.8's open questions |
| The Q13 isolation plan | [`2ff7daeb`](https://github.com/davidelaverga/Sophia/blob/2ff7daeb34cd56d9a5eec2f0bee8f36cc175b36e/docs/coordination/CON-01/G2_Q13_ISOLATION_PLAN.md), CON's proposal r5. **Held: its own scope and acknowledgement** |
| The reply runtime plan | [`46ddd769`](https://github.com/davidelaverga/Sophia/blob/46ddd769b7182e968da20219a9f6852757419805/docs/coordination/CON-01/G2_RUNTIME_PLAN.md) §3 (the held files) and §5 (the order). SHA-256 `fc6f4ad8548dee9c…` |
| The option C impact inventory | [`3b1af9b9`](https://github.com/davidelaverga/Sophia/blob/3b1af9b94413a409214b05203d5fbdf5088435c1/docs/coordination/CON-01/G2_IMPACT_INVENTORY.md) §3–§7 |
| The S1–S4 candidates | `7d8f415f45d51d3f536443060f5acbfd3bea9455` (PR #211's head, review-only, never to merge). Full hashes in §3.1(e) |
| Observed `main` | `5ed752bde219d38d…`, migrations through 0045, amendments through A14. **Observed, not an accepted base** |

## 1. Who is asked, by surface

Every surface Phase B touches has one recorded route. Each route is asked only about its own surfaces (§5).

| Surface | Recorded route | Asked for |
|---|---|---|
| **CON's own:** the reply design; 0048's objects that Phase B replaces; S1–S4; the new `conversation_*` objects (§3.1(d)); A16; `packages/persistence/src/conversation-*.ts` | **CON-01** (this lane). **S2 is CON's reply-reservation ledger.** It is not the SMC-M01 mission ledger, and it needs no separate owner | Nothing; this file records CON's responsibility (K-1a). That responsibility doesn't extend to a shared surface |
| **Core tables (0001):** `work_attempts`, `outbox` and `execution_bindings` (option C, §3.1(a)); `commands` (the `retire`'s idempotency key, read but not altered) | **Luis, S1-02** (routing r2, `core`: "source/schema coordination") | A narrow ACK of §3.1(a) and of B-2's rows. The lane names the current writer and reviewer for these tables |
| **The 0012 runtime foundation:** `runtime_commands.kind`, `runtime_cursor`, `apply_runtime_receipt` and `runtime_lease`; the runtime entry-point pattern and its `sophia_api` grant; A04's `RuntimeWorkBinding` and `RuntimeCommand`; the runtime routes and their registration | **Davide/Luis, retained S1-05A/BASE** (routing r2: the access and product boundary; BASE.md:30 names the current writers) | A narrow ACK of §2's B-1, B-3, B-5 and B-6, of B-2's runtime part, and of §3.1(b), §3.1(c) and §3.2's registration. This is a scope ACK, not a mechanics choice: CON's recommendations stand unless the owner replaces one |
| **SMC-M03's latest bodies:** `runtime_hello` (0028:74) and `runtime_record_observations` (0023:20); A11's `RuntimeCommand` payload role and route | **The current SMC-M03 research implementer under Davide,** with Luis for UI integration | A narrow ACK that their goal and research paths are preserved, with only §3.1(b)'s named insertions |
| **The joint lane's latest bodies:** `native_delivery_ineligible` (0041:149, SDD-01) and `dispatch_runtime_outbox` and `capture_native_result` (0042:1806 and :1724, WBC-02) | **The joint WBC-02/SDD-01 implementer,** for those bodies; their foundation is 0012's (S1-05A) | The implementer's ACK of the named insertions in its bodies. Separately, **the joint lane's consumer compatibility** with the exact r2 manifest. It has already judged B-1 to B-6 compatible as directions (CX-0155) |
| **#190's overlap:** the generated contracts and shared registration files that freeze r2 lists | **#190's owner** | The overlap and the order in which each side regenerates (Q10) |
| **The base** | **Luis's integration review** | §4's exact commit and tree |
| **The numbers, the census and the GO** | **Codex,** as the source coordinator | As for Phase A, after K-1 to K-4 |

**Not asked:**
- **SMC-M01 (0018, 0019, A08 and A09):** no M01 object is read, replaced or granted, so no M01 acknowledgement is asked. If an M01 change turns out to be needed, it stops the writer and goes to M01's own narrow route (Davide/Luis).
- **`is_task_kind` (0038, SDD-01), `actor_id()` and `is_member(uuid)` (0002, core):** not changed.
- **Q13's read policy and the assembler's identity:** Q13's own scope (§3.1(e), §6).
- **Davide is asked no low-level engineering choice.** What is already his and pending stays pending, and is not asked again:
  - Q8: the reply profile rows and the runtime image;
  - D-4: no reply route is bound, so replies stay `no_grant`.
- **Luis's Studio handback** is separate (§6).

## 2. The engineering binding, against the exact r8 design

Each item is an existing Q7 r8 obligation that the joint ACK left to the core and runtime owners. CON's recommendation is stated so that it can be accepted, replaced or refused. None is a new design. The joint lane's consumer review judged all six compatible (CX-0155, `boundedConsumerDisposition`).

| # | The decision | CON's recommendation | Bound by | Q7 r8 |
|---|---|---|---|---|
| B-1 | **Hello's lease-loss table:** keep it or drop it | **Keep it.** It ends a lease-lost request at the hello, whatever the new bridge answers to the replay. And it keeps a busy or replies-off bridge's `rejected` from releasing a reservation the old execution may have used. **If it is dropped,** the required alternative is accounting-safe: the bridge asks the claim before ever answering a replayed `create` `rejected`. Tests exist for both. P1-E stays withdrawn either way | S1-05A/BASE. SMC-M03 confirms that `runtime_hello`'s goal and research branch is preserved | §6, the table and "Why a table at all"; §10 |
| B-2 | **The cleanup `retire`'s writer and idempotency.** Exactly one per attempt, keyed to the same attempt and reply, with its own `commands`, `outbox` and `runtime_commands` rows (0012:74, 77-79). Never a new Ask, `create` or execution, attempt, reservation, call or allowance reset | **One writer, `conversation_retire`, using only existing unique constraints:**<ul><li>the `commands` row takes key `conversation-retire:<attemptId>`, with the request's asker as its actor, under 0001's `UNIQUE(project_id, actor_id, idempotency_key)`;</li><li>its one `outbox` row (`native.retire`, `cleanup` true, inside the `native.%` reconcile filter) falls under `UNIQUE(project_id, command_id, destination_key)`;</li><li>its `runtime_commands` row falls under 0012's `UNIQUE(project_id, outbox_id)`.</li></ul>Each insert is `ON CONFLICT DO NOTHING`. So a repeated hello or a replayed receipt writes nothing new. A `retire` kind is added by the reviewed CHECK change and the wire. The owner may name another key | S1-02 (the `commands` and `outbox` rows and the key); S1-05A/BASE (`runtime_commands.kind` and the callers) | §6, "The one exception"; §10's delivery counts |
| B-3 | **The cursor rule** for `stop` and `retire`: replayed once per hello until a `checked` answer is recorded | A new version of `runtime_cursor` in 0049, with the same signature, owner, security, `search_path` and privileges. It is defined at 0012:399, and 0012 is not edited. Its only caller is `runtime_hello` (0028:105), so a `stop` or `retire` without a `checked` answer is replayed at each hello, and never in a loop within one connection. `runtime_poll` (0016:114) is not edited | S1-05A/BASE | §6, the `stopping` row |
| B-4 | **BINDING_MAP §8.2.1:297 and :299,** which say "no second … outbox row or runtime command" beside "one `retire`" | Replaced in the accepted window by: "no second attempt, reservation, `create` or execution. Exactly one cleanup `retire`, with its own command and delivery rows; none on replay". CON edits its own binding only in that window, after B-2 is bound | CON, after B-2 | §6, "Owned by the core owner" |
| B-5 | **The run gate and the claim** | `runtime_conversation_claim` and `runtime_conversation_go` (§3.1(c)) call `runtime_lease` first. A superseded bridge is refused with `40001`. The lease is the authenticated `bridgeInstanceId`; a body whose `leaseId` differs is refused. Then the request's row is locked, and `conversation_execution_claim` and `conversation_execution_go` run. One atomic `pending` → `running` transition, replayed for the same lease and command | S1-05A/BASE (the entry points and `runtime_lease`); CON (the claim's table and functions) | §6, "The API and 0049" |
| B-6 | **The acknowledgement's eight predicates,** plus the relay's own condition | `runtime_conversation_acknowledged` → `conversation_acknowledged`. Each predicate is bound to its durable key as §7 lists them: `terminalWriter`, `createAnswered`, and `capture: none` only with no `turn/end` in both the journal and the database. A lease-loss `terminalWriter` is the hello's row in `conversation_executions`. No predicate ever asserts a record that doesn't exist. The relay's `closed` is never asked of the API | S1-05A/BASE (the entry point); CON (the predicates over its rows) | §7 |

## 3. Phase B's exact scope, by step

**The order is the plan's §5:** SQL, then the wire and contracts, then the bridge, then the supervisor, launcher and profile, then qualification. One correction from §4 applies: A16's A04 changes move into the bridge step. **Each step is its own immutable pin**, with:
- a fail-before and an after;
- §4's complete gates;
- a fresh composition with the accepted base;
- independent review between steps.

**Nothing outside these lists is written.** An unlisted need stops the writer, and the list is amended and acknowledged again.

**Dormant in every pin.** No reply attempt is admitted outside a test's own setup:
- `conversation_ask` admits only with an enabled grant and a bound route, and neither exists (D-4; Ask off);
- `conversation_set_grant` has no caller in Phase B.

So no reply command reaches a bridge before the pin that teaches the bridge to read one.

### 3.1 Step 1: the SQL, one migration (`0049`, after the census)

**In-source ACL statements are not live effects.** The `REVOKE` and `GRANT` statements below are migration text. In Phase B, a migration runs only on a disposable test database. No hosted or live grant, role, membership or connection change is made or authorized.

**(a) Option C's core DDL** (S1-02; append-only; 0001 is not edited):

| Table | Change |
|---|---|
| `sophia.work_attempts` | `goal_id` and `goal_revision` drop NOT NULL. Add `conversation_reply_id uuid`, with `FOREIGN KEY (project_id, conversation_reply_id) REFERENCES sophia.conversation_replies(project_id, id)`. Add `CHECK (num_nonnulls(goal_id, conversation_reply_id) = 1)` and `CHECK ((goal_id IS NULL) = (goal_revision IS NULL))`. Add the unique partial index `work_attempts_by_reply ON (project_id, conversation_reply_id) WHERE conversation_reply_id IS NOT NULL`: one native attempt per request |
| `sophia.outbox` | `goal_id` drops NOT NULL. Add `conversation_reply_id uuid`, with the same foreign key, and `CHECK (num_nonnulls(goal_id, conversation_reply_id) = 1)`. Add the non-unique partial index `outbox_by_reply ON (project_id, conversation_reply_id) WHERE conversation_reply_id IS NOT NULL`. A request has its `create` row and at most one cleanup row |
| `sophia.execution_bindings` | Its state CHECK is replaced under its own name, found by its definition (as S1 does for 0048's). `retired` is added to `created`, `launching`, `running`, `idle`, `stopping`, `settled` and `lost` |
| `sophia.runtime_commands` (0012:74-79) | Its kind CHECK is replaced the same way. `retire` is added to `create`, `resume`, `input`, `steer`, `hold`, `stop` and `inspect` |
| `sophia.commands` | Not altered. `goal_id` is already nullable, and the `retire` key uses its existing unique constraint (B-2) |

- **Existing rows:** every one has a goal, so the new CHECKs hold without a backfill. No existing row is updated.
- **The constraint and index names above are proposals.** S1-02 may rename them.
- `authority_epoch` stays NOT NULL on both tables (BINDING_MAP §8.2).

**(b) The seven replaced shared functions.** Each keeps its signature, owner, `SECURITY DEFINER`, `search_path` and privileges.

| Function | Latest body on observed `main` | Route (§1) | The named insertion |
|---|---|---|---|
| `dispatch_runtime_outbox` | 0042:1806 | Joint (WBC-02); 0012 foundation | A reply branch first: a row with `conversation_reply_id` goes to `conversation_dispatch` and returns. After the goal lock, `IF g.id IS NULL` denies |
| `native_delivery_ineligible` | 0041:149 | Joint (SDD-01) | A first `WHEN g.id IS NULL` refuses |
| `capture_native_result` | 0042:1724 | Joint (WBC-02) | A reply branch first, keyed on the attempt's `conversation_reply_id`, before any goal or job read. A `g.id IS NULL` guard |
| `runtime_hello` | 0028:74 | SMC-M03; 0012 foundation | The reply bindings as a `UNION ALL` beside the goal bindings. B-1's table, in the hello's own transaction after its project lock and instance update |
| `apply_runtime_receipt` | 0012:464 | S1-05A | A reply branch first, before the goal and job reads (BINDING_MAP §8.2.1) |
| `runtime_record_observations` | 0023:20 | SMC-M03; 0012 foundation | A privacy-fenced reply branch, under the conversation writers' lock order (§8.2.2) |
| `runtime_cursor` | 0012:399 | S1-05A | B-3's rule only |

**The preservation test accounts for the insertions.** It doesn't claim whole definitions are byte-identical. For each function:
- `pg_get_functiondef`, with each named insertion removed between its marker comments, equals the latest body byte for byte;
- `proowner`, `prosecdef`, `proconfig` and `proacl` are equal before and after.

**(c) The five authenticated runtime entry points** (new):
- **The functions:** `sophia.runtime_conversation_claim`, `runtime_conversation_go`, `runtime_conversation_reserve`, `runtime_conversation_settle` and `runtime_conversation_acknowledged`. Each takes `(bytea, text, text, jsonb)` (the token hash, runtime unit, bridge instance and request) and returns `jsonb`.
- **Their form:** each is `SECURITY DEFINER`, `SET search_path = pg_catalog, sophia`, and calls `sophia.runtime_lease(p_token_sha256, p_unit, p_bridge)` first. That is the pattern of 0012:837-841 and 0025:606-614.
- **The lock order:** the project, then the instance (inside `runtime_lease`), then the request's row.
- **What each checks:**
  - claim, go, reserve and settle require the attempt to be bound to the caller's runtime unit, and act only for the claim's own lease (the caller's `bridgeInstanceId`);
  - acknowledged requires the binding only, because the recovering bridge asks it (Q7 r8 §7).
- **Their ACL:** `REVOKE ALL ... FROM PUBLIC`, then `GRANT EXECUTE ... TO sophia_api`, for these five only.

| Entry point | Calls (internal, no grant) |
|---|---|
| `runtime_conversation_claim` | `conversation_execution_claim(p_attempt uuid, p_command uuid, p_lease text, p_epoch bigint)` |
| `runtime_conversation_go` | `conversation_execution_go(p_attempt uuid, p_command uuid, p_lease text, p_epoch bigint)` |
| `runtime_conversation_reserve` | S2's `conversation_reserve(uuid, uuid, integer, jsonb)`, for a request `running` under this lease |
| `runtime_conversation_settle` | S2's `conversation_settle(uuid, uuid, integer, jsonb)` |
| `runtime_conversation_acknowledged` | `conversation_acknowledged(p_attempt uuid, p_keys jsonb)` |

**(d) CON's new internal objects.** None has a grant: `REVOKE ALL ... FROM PUBLIC, sophia_api, sophia_worker`; each table has row security on and no policy.
- **The table `sophia.conversation_executions`:** one row per attempt (`UNIQUE (project_id, attempt_id)`). It holds the request, the command, the lease (`bridgeInstanceId`), the epoch and the claim's outcome (`claimed`, `running` or `lost`). For a lease loss, it also holds the hello's instance that recorded it (B-6's `terminalWriter`).
- **The claim and go:** `conversation_execution_claim` and `conversation_execution_go` (B-5).
- **Dispatch and delivery:**
  - `conversation_dispatch`: for a `native.create` row, the inventory's §4.2 eligibility, statement and payload; for a cleanup `native.retire` row, the `retire` command only;
  - `conversation_reply_statement`: BINDING_MAP §8.3's statement, built only from S3's recorded context. It refuses without one;
  - `conversation_delivery_ineligible`.
- **Cancelling and retiring:**
  - `conversation_cancel`: it raises the epoch to 2 and writes the `stop`. Its callers are withdrawal and erasure (through `conversation_withdrawn_from`), the grant switch and the asker's removal;
  - `conversation_retire`: B-2's writer. It is called from `apply_runtime_receipt`'s reply branch, `capture_native_result`'s reply branch and `runtime_hello`'s lease-loss rows.
- **`conversation_acknowledged`:** B-6.
- **Replaced from 0048, keeping each one's owner, security, `search_path` and privileges:**
  - `conversation_ask`, the admission (the inventory, §4.1);
  - `conversation_withdrawn_from(uuid, uuid, bigint, text)`. Its one final body is S1's, plus a `conversation_cancel` call for an open request that has an attempt.

**(e) S1–S4, promoted into 0049 from `7d8f415f`.** Each comes with its exact objects and its closed ACL. The only differences from the candidates are the ones named in this subsection and in (d).

| Candidate | SHA-256 | What 0049 takes |
|---|---|---|
| S1 `db/candidates/con01-s1-reply-states.sql` (55 lines) | `bf2ce1908bf3cac25c9de094a7c74708c828f76a233ba373a84808f93f70d817` | **All of it.** The refusal over an open `outcome_unknown` (:16-22). 0048's settled-time CHECK on `conversation_replies`, replaced under its own name (:26-34). `conversation_replies_open`, recreated for `pending` and `running` (:37-39). `conversation_withdrawn_from`, replaced (:44; its final body adds (d)'s `conversation_cancel` call), and its `REVOKE ALL ... FROM PUBLIC` (:55). No grant |
| S2 `db/candidates/con01-s2-conversation-reply-ledger.sql` (427 lines) | `e136626d20fdb85b4f375d54d8e27b5d4a5362e3baeab498fca0597bc92a4316` | **All of it:**<ul><li>five tables: `conversation_grants`, `conversation_grant_approvals`, `conversation_grant_subjects`, `conversation_reply_allowances` and `conversation_reservations`;</li><li>the unique index `conversation_grants_current`;</li><li>eleven functions: `conversation_ledger_kept` (the trigger function), `_ledger_amount`, `_reservation_receipt`, `_grant_subjects_set`, `_new_lineage`, `_set_grant`, `_reserve`, `_settle`, `_mark_uncertain`, `_release` and `_reconcile`;</li><li>eight triggers: four `*_kept` and four `conversation_ledger_tables_kept`.</li></ul>Row security is on for all five tables (:414-418). Its ACL (:419-426) revokes everything from `PUBLIC`, `sophia_api` and `sophia_worker`. **Its closed ACL doesn't broaden:** only §3.1(c)'s entry points reach `_reserve` and `_settle` |
| S3 `db/candidates/con01-s3-conversation-reply-context.sql` (754 lines) | `d0a84820b483581b79ccc9d637d53f41bec2bccef8ff9cb158d15c4d9032f4e4` | **All but its role preamble and its role grant.** It takes:<ul><li>four tables: `conversation_assembly_claims`, `conversation_reply_contexts`, `conversation_reply_sources` and `conversation_reply_messages`;</li><li>three indexes: `conversation_reply_contexts_recorded` (unique), `conversation_reply_sources_by_source` and `conversation_reply_messages_by_message`;</li><li>twenty-two functions: `conversation_context_kept`, `_quoted`, `_time`, `_fields`, `_template`, `_mission`, `_decision`, `_message`, `_current`, `_scrub`, `_message_scrubbed`, `_reply_scrubbed`, `_grammar` and `_list`; `conversation_assembly_locked`, `_privacy`, `_current`, `_claim`, `_begin`, `_close` and `_fail`; and `conversation_record_context`;</li><li>ten triggers: four `*_kept`, four `conversation_context_tables_kept`, `conversation_context_message_scrub` and `conversation_context_reply_scrub`.</li></ul>Row security is on (:730-733), and its function `REVOKE` is kept (:736-750) |
| S4 `db/candidates/con01-s4-reply-fences.sql` (495 lines) | `ba32e07294d0e2908b06ba2887c207d8811625a2ea5e361c62ca90c4d34e47b8` | **All of it:**<ul><li>three tables: `conversation_reply_answers`, `conversation_reply_suppressions` and `conversation_context_erasures`;</li><li>`conversation_context_kept`, replaced (:112);</li><li>the length CHECK on `conversation_reply_contexts`, replaced under its own name (:158-166);</li><li>eleven functions: `conversation_fences_kept`, `_fences_locked`, `_reply_verdict`, `_fences_recorded`, `_answer_receipt`, `_context_digest_erase`, `_fences_text_gone`, `_reply_check`, `_publish_answer`, `_refuse_answer` and `_source_out`;</li><li>seven triggers: three `*_kept`, three `conversation_fences_tables_kept` and `conversation_fences_text_gone`.</li></ul>Row security is on (:482-484), and its ACL (:485-495) is closed to every login |

- **S3's role preamble is excluded and superseded.** That is the `DO` block that creates or adopts `sophia_conversation_assembler` (:22-51), and line 55, `GRANT sophia_api TO sophia_conversation_assembler WITH INHERIT TRUE;`.
  - D-8 (Q13A) rejects continued inheritance of the broad `sophia_api` as the reply identity's isolation.
  - The isolation plan that replaces it (`2ff7daeb`) is held under its own scope. A held plan is not permission to promote the old preamble.
  - **So 0049 creates no role, grants no membership and changes no role attribute.**
- **S3's entry-point grant is excluded too.** That is :751-754, `GRANT EXECUTE ... TO sophia_conversation_assembler`.
  - S3's five entry points (`conversation_assembly_claim`, `_begin`, `_close`, `_fail` and `conversation_record_context`) have **no grantee** in Phase B. Only their owner can execute them.
- **The `REVOKE` lists change to match.** S3:734-735's and S4:485-486's table `REVOKE`, and S4:487-495's function `REVOKE`, drop `sophia_conversation_assembler` from their role lists. A `REVOKE` from a role that doesn't exist fails, and nothing else in those lists changes.
- **The assembly dependency, named.** A reply's context is assembled only by the isolated identity that Q13's scope defines and qualifies (D-8's tests). Until Q13 is accepted and its own scope is written:
  - no reply can be assembled outside a test's owner setup;
  - `conversation_reply_statement` refuses;
  - **Ask stays off.**
- **S2's `conversation_release` and `conversation_reconcile` stay the `no_proof_source` stubs** of S2:402-411. Nothing in Phase B calls them, and they refuse every call. Their proof sources are later, separately acknowledged ledger tasks:
  - release's is a rejected create's receipt, or an outbox row never claimed, fenced in the same transaction (S2:399-401);
  - reconcile's is the attempt's `usage_records`, by ordinal (Q7 r8 §6). It is run only by an operator, separately authorized.

  Until release is wired, **no reservation is ever released.** The receipt branch's `rejected` row finds none `reserved` in any reachable state: a reservation exists only after `go` (S2:311), and the hello's lease-loss rows move open ones to `uncertain`. Should one ever be found there, it becomes `uncertain`, still counted, and is never released. That narrows BINDING_MAP §8.4:437's "it is `released`" to the stub's reality for Phase B, and a test pins it.

**Not edited:**
- every other function in the inventory's §3. That includes `runtime_poll` (0016:114), `runtime_lease` (0012:387), `runtime_record_receipts`, `claim_runtime_outbox` and `reconcile_runtime_outbox`, which is 0053's after Phase A;
- every M01 object, `is_task_kind`, `actor_id()`, `is_member(uuid)` and every policy;
- any applied migration, 0048 included;
- `apps/worker/src/runtime-dispatch.ts`.

**Tests:**
- **`packages/persistence/src/runtime.db.test.ts`,** extended with Q7 r8 §10's SQL cases:
  - the hello table's rows;
  - the `stopping` replay once per hello;
  - the cursor;
  - the `retire`'s uniqueness across a repeated hello and a replayed receipt;
  - the claim and go;
  - `40001` for a superseded bridge;
  - no reachable call to either S2 stub.
- **The option C and catalog cases:**
  - the two CHECKs and the unique attempt index;
  - the five entry points executable by `sophia_api` alone;
  - every new table and internal function closed to `PUBLIC`, `sophia_api` and `sophia_worker`;
  - no role created and `pg_auth_members` unchanged.
- **§3.1(b)'s preservation test.**
- **From `7d8f415f`, changed only to read the migrated database** instead of applying `db/candidates/*`:
  - `conversation-reply-states.db.test.ts` (S1, `ce1f2be8487fcb0a…`);
  - `conversation-ledger.db.test.ts` (S2, `72bd63ec90e472b0…`);
  - the role-independent cases of `conversation-assembly.db.test.ts` (S3, `5b5121033a54b065…`) and `conversation-fences.db.test.ts` (S4, `fe9e536f1e1e3506…`).
- **Held, not promoted:** their cases that record a context through `sophia_conversation_assembler`, and the module they use, `conversation-assembly.ts` (`35f18af65275a4eb…`, which issues `SET LOCAL ROLE` to that role in each transaction). These stay on #211, held with Q13, and every receipt names them as not run. No case is rewritten to pass without the role.
- **The bridge to #211's results:** a promotion-equality case shows that each promoted S3 and S4 function and constraint is byte-identical to its candidate. So #211's recorded results stay attached to the same bodies, without being claimed as re-run.
- **`conversation-context.ts`** (`1b378011b228833d…`) and **`conversation-context.test.ts`** (`9123b01de94f790b…`) are promoted unexported and dormant, for S3's grammar cases.
- **Existing tests:** `conversations.db.test.ts`, whose A10 case changes by design (the inventory, §6); `db/tests/0037_amendment_preservation.sql`; `personal.db.test.ts:922-929`.
- **TypeScript:** `packages/persistence/src/outbox.ts`'s `OutboxRow.goal_id` becomes `string | null`. No worker code reads it.

### 3.2 Step 2: the route shapes, persistence and routes (additive; no A04 change)

**Amendment A16 (CON's), additive only:**
- ten component schemas:
  - `RuntimeConversationClaimRequest` and `RuntimeConversationClaimReply`;
  - `RuntimeConversationGoRequest` and `RuntimeConversationGoReply`;
  - `RuntimeConversationReserveRequest` and `RuntimeConversationReservation`;
  - `RuntimeConversationSettleRequest` and `RuntimeConversationSettlement`;
  - `RuntimeConversationAcknowledgedRequest` and `RuntimeConversationAcknowledgement`;
- the five paths `/v1/runtime/conversation/{claim,go,reserve,settle,acknowledged}`.

They are prefixed `RuntimeConversation` so they never meet A16's public `ConversationReply`. A04's `RuntimeWorkBinding` and `RuntimeCommand` are **not** changed in this step (§4).

**The generator, `packages/contracts/scripts/generate-runtime-wire.ts`:**
- `SCHEMAS` (:18) and `VALIDATED` each gain exactly those ten. The bridge sends the five requests and reads the five replies.
- Nothing else in the generator changes.
- **`generate-validators.ts` (`EXPORTS`) and `src/validate.ts` are not edited.** They serve the client's parsers, and no client reads these shapes.

**Generated companions,** made only by `pnpm --filter @sophia/contracts generate` and never merged by hand:
- `packages/contracts/openapi/openapi.json`;
- `packages/contracts/src/generated-types.ts`;
- `packages/contracts/src/generated/validators.js` and `validators.d.ts`. These are expected unchanged, since no exported client schema changes; `pnpm contracts:check` proves it either way;
- `packages/dsh-bundle/src/runtime-wire.generated.ts` and `runtime-wire-types.generated.ts`.

`generate-specialists.ts` and both `specialists.generated.ts` files are unchanged, because their input is unchanged.

**Persistence: the five-call implementation.** The new file is `packages/persistence/src/conversation-runtime.ts`, a CON path. It follows `research.ts:91-108`: a local `args(who)` and `operation(c, fn, who, request)` run `SELECT sophia.<fn>($1, $2, $3, $4) AS reply` and return `onlyRow(rows, fn).reply`. It imports `type RuntimeCaller` from `./runtime.ts` and `onlyRow` from `./rows.ts`.

```ts
export const runtimeConversationClaim = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationClaimRequest) =>
  operation<RuntimeConversationClaimReply>(c, 'runtime_conversation_claim', who, request)
export const runtimeConversationGo = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationGoRequest) =>
  operation<RuntimeConversationGoReply>(c, 'runtime_conversation_go', who, request)
export const runtimeConversationReserve = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationReserveRequest) =>
  operation<RuntimeConversationReservation>(c, 'runtime_conversation_reserve', who, request)
export const runtimeConversationSettle = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationSettleRequest) =>
  operation<RuntimeConversationSettlement>(c, 'runtime_conversation_settle', who, request)
export const runtimeConversationAcknowledged = (c: pg.PoolClient, who: RuntimeCaller, request: RuntimeConversationAcknowledgedRequest) =>
  operation<RuntimeConversationAcknowledgement>(c, 'runtime_conversation_acknowledged', who, request)
```

- **The capability, lease and binding checks are the SQL entry points' own** (§3.1(c)). The module adds no authority.
- **`packages/persistence/src/runtime.ts` is read** (`RuntimeCaller`), **not edited.**
- **`packages/persistence/src/index.ts`** gains one export block for the five.

**Routes:**
- **`apps/api/src/routes/runtime.ts`:**
  - `RUNTIME_ROUTES` (:43-58) gains the five paths;
  - a new `conversationRuntimeRoutes(app, pool)`, modelled on `researchRoutes` (:181), registers each with `runtimeHeaders`, the body `$ref` and the 200 response `$ref`;
  - each handler is `withService(pool, (c) => runtimeConversationX(c, callerOf(req), req.body))`.
- **`apps/api/src/app.ts`** gains the import and one call, after `researchRoutes(app, deps.pool)` (:212).

**Preserved, per freeze r2's Phase B paths:**
- #190's `VOICE_SCHEMA`, the required-schema list and `registerHealth`;
- the voice persistence exports;
- A15's and A17's contracts and validation;
- every A11, A12, A13 and A14 runtime shape in the generator's lists.

**Tests:**
- `packages/persistence/src/conversation-runtime.db.test.ts` (new): each wrapper through the real entry point, with `40001` after a newer hello and a refusal for another unit's attempt;
- `apps/api/src/runtime.db.test.ts`, extended: the five routes, the capability headers, and a missing capability refused;
- `tests/unit/routes.test.mjs`, with the five paths;
- the contract checks;
- every goal case unchanged.

### 3.3 Step 3: the A04 wire change and the bridge, one pin

**Amendment A16, its A04 part.** This moves here from revision 1's step 2.
- `RuntimeWorkBinding` becomes a `oneOf`: `{goalId, goalRevision}` exactly as today, or `{conversationReplyId}`.
- `RuntimeCommand.kind` gains `retire`.
- A11's `RuntimeCommand` payload `role` and `route` patches are preserved.
- The same generated companions are regenerated.

**Edited:**
- `packages/dsh-bundle/src/control-bridge.ts`: `execute`'s one reply branch (bridge:694), `connect` → `reconcileReply` (bridge:319-350) and the disposer (bridge:309-316);
- `index.ts`: `BridgeSettings.replies`;
- `transport.ts`: the five conversation calls and the optional `signal` on `observations`;
- `protocol.ts`: `KINDS` (:28) gains `retire`.

**New:**
- `packages/dsh-bundle/src/reply-child.ts` (`ReplyChildren`, `ReplyChild`, `ReplyRelay` and `fromJournal`);
- `packages/dsh-bundle/src/reply-plugin.ts`.

**Not edited:**
- `role-registry.ts`, `config/roles.json` and `config/specialists.json`. The reply child takes no native role or tool, and no route is bound (D-4). Revision 1 listed `role-registry.ts`; Q7 r8 §6 has no change there;
- `packages/dsh-bundle/package.json`. Its `files` already ships `dist/*.js`;
- `packages/dsh-bundle/cordis.patch.yml`, the goal profile's bundle layer.

An unlisted need, a plugin entry included, stops the writer (§3).

**Artifact:** the bundle archive changes, so §4's recording applies.

**Tests:**
- `tests/unit/reply-child.test.mjs` and `tests/unit/reply-plugin.test.mjs` (new), beside `bridge-core.test.mjs`. They hold Q7 r8 §10's cases, unchanged. Only the place moves:
  - Q7 r8 names `packages/dsh-bundle/test/*.test.ts`, which no `pnpm test` glob reaches (`package.json:16`);
  - a test under the bundle's `src/` would enter its build (`tsconfig.json`: `include: ["src"]`) and so its archive.
- `tests/unit/bridge-core.test.mjs`, with a reply twin;
- the goal fixtures, byte-identical.

### 3.4 Step 4: the supervisor, the launcher and the profile

**Edited:**
- `apps/execution-host/src/runtime-supervisor.ts`: `SupervisorOptions.replies`, `environment()`, and `sweepReplies` with the generation seal;
- `scripts/runtime-host.mjs` and `scripts/lib/profile.mjs`: the reply template's install, its link rule and its `sophia-reply-tree-v1` digest.

**New:**
- `apps/execution-host/reply/reply-launch.py` and `test_reply_launch.py` (Q7 r8 §10's `unittest` cases);
- `tests/unit/reply-launch.test.mjs`, which runs `python3 -I -m unittest discover -s apps/execution-host/reply -p 'test_*.py'` and fails, never skips, on any nonzero exit or a missing `python3`. That way `pnpm check` runs them. The existing Python precedent runs in its own workflow (`.github/workflows/uml-fixture.yml`), outside `pnpm check`, and no workflow file is in scope.

**Profile, by canonical path:**
- **`config/dsh/reply-rows.reviewed.json` (new):** the reply template's reviewed rows. They include the `sophia-reply-child` row that loads the bundle's `reply-plugin`. The rows are Davide's (Q8), so this step waits on Q8. Revision 1 placed that row in a bare `cordis.patch.yml`, which was wrong.
- **The template's install:** it uses the same committed profile files, lock and bundle archive as today's `installInto` (`profile.mjs:54-67`), with the reply rows as its only difference. There is no second lock.
- **The template's digest:** the launcher computes and records it at host start (Q7 r8 §5). It depends on the host's install, which P1 records. **It is not a committed identity.** Revision 1's "recorded in `config/runtime-unit.json`" is withdrawn.
- **Unchanged:**
  - `config/dsh/profile/cordis.patch.yml` (the user patch, `[]`);
  - `packages/dsh-bundle/cordis.patch.yml`;
  - `config/dsh/base-rows.reviewed.json` and `scripts/lib/gate.mjs`;
  - `config/dsh/profile/package.json` and `pnpm-workspace.yaml`;
  - the root `pnpm-lock.yaml` and `workspace_lock_sha256`.

**No route, role, specialist, dependency or workspace-lock change** (D-4).

**Tests:**
- `tests/integration/supervisor.test.mjs`, extended;
- `tests/integration/reply-runtime.test.mjs` (new): L1, with the loopback stub.

### 3.5 Step 5: qualification

Q7 r8 §9's P1–P8 and §10's L1 cases run on the step 4 pin, composed with the accepted base, on the pinned runtime with the stub route only. **No provider call, and no hosted effect.** A fix found here is a new pin, with §4's recording and gates.

**Not in Phase B:**
- Q13's shared read-policy scope and the assembler's identity (freeze r2 start condition [4]; `2ff7daeb`, its own scope and acknowledgement);
- the Studio, held for Luis's handback;
- any route or credential;
- S2's release and reconcile proof sources.

## 4. Base, number, writer, order, gates and handback

- **The base:** one exact commit and tree, sealed before the first write. It contains:
  - `main`;
  - **the accepted Phase A** (0053, PR #256, once accepted and merged). It is the dispatcher prerequisite, so it comes first;
  - **G1's 0048 (PR #199),** because 0049 extends 0048's tables and functions, and `main` has neither. PR #199 is held at `d527f385`, pending Luis's Studio handback. So the integration owner either accepts G1 onto `main` first or names a composed base.
  - It is not `#211`'s diverged base, and not an unmerged CON candidate by default.
- **The numbers:** 0049 for the migration, from CON's retained 0048–0050. A fresh census of every published ref, every PR and the local owner confirms it at the start. A16 is CON's amendment. **A collision stops the writer.** The historical reservations are not a fresh census, and 0053 stays reserved.
- **One writer:** this CON thread, session `01KUDtFK9gWthsXSrepcLQz3` (D-10). Each owner in §1 is asked to acknowledge its own surfaces and to leave them unwritten during the window. The joint lane keeps its freeze on these surfaces until the handback, and #190 later merges `main` with its own writer. There is no second writer.
- **The order:** §3's five steps. Each is pinned, reviewed and accepted before the next, and re-composes with the accepted base.

**The gates (PB-GATE-ORDER).** CON chooses the first of the review's two sequences: **every accepted pin is complete and recorded.**
- **AGENTS.md:56** requires the identity diff with any change to the bundle, the lock or the runtime package.
- **`pnpm check` runs `pnpm artifacts`,** which compares the archive, the unit and the profile lock and exits 1 on any mismatch (`build-artifacts.mjs`).
- So a pin whose bundle changed but whose identities weren't recorded would fail the ordinary gate. The second sequence (partial intermediate pins, one final record) would leave pins that fail it, so it isn't used.

| Pin | Bundle archive | Identities | Gates |
|---|---|---|---|
| Step 1 (SQL) | unchanged | `pnpm artifacts` must reproduce the base's record unchanged | `pnpm check` complete, `pnpm test:db`, `pnpm test:sql` |
| Step 2 (shapes, persistence, routes) | changed (the generated wire) | `pnpm artifacts:record`. The diff to `config/runtime-unit.json` (`sophia_bundle.archive_sha256`, `.archive_integrity` and `.artifact_digest`) and `config/dsh/profile/pnpm-lock.yaml` is committed in the pin | as step 1 |
| Step 3 (A04 wire, bridge) | changed | recorded as step 2 | as step 1 |
| Step 4 (supervisor, launcher, profile) | unchanged | `pnpm artifacts` must reproduce step 3's record. If it doesn't, the writer stops and names why | as step 1, plus `reply-runtime.test.mjs` |
| Step 5 (qualification) | — | `pnpm artifacts` reproduces the step 4 record on the composed tree | as step 1, plus P1–P8 and L1 |

- **The lock is recorder output only.** `config/dsh/profile/pnpm-lock.yaml` pins only the bundle archive's integrity (`artifacts.mjs:9-10, :28-33`). It is written only by the recorder, and it grants no dependency or workspace-lock change.
- **Only the bundle identities move.** They are the same on every platform (`artifacts.mjs:124-127`). The per-platform `dsh.*` digests don't change, because no dsh pin changes.
- **Unchanged in `config/runtime-unit.json`:** its `id`, `status`, `model_routes`, `role_routes` and `required_before_deploy`. No unit cutover is part of Phase B.
- **Why each pin passes alone:** every pin is dormant (§3), and its goal crossings run unchanged on the real pinned dsh. The step 2/step 3 split puts each contract change in the same pin as the code that compiles against it. Revision 1's step 2 changed A04's `RuntimeWorkBinding`, which the bridge's `WorkBinding` type aliases (`protocol.ts:20`).
- **What each receipt states:** each pin's receipt names the crossings that exist in that pin and ran. A crossing that doesn't exist yet, such as the bridge's reply path at steps 1 and 2, is "not present", never "passed". Held cases are named "not run" (§3.1).
- **Fail-before:** each pin's new tests are run first against the previous pin, then after.
- **No waiver:** there is no stale-artifact waiver, no rerun of an old probe, and no old image receipt for new artifacts.

**The handback boundary (freeze r2):**
- the immutable commit and tree;
- the exact path, function, contract and identity diffs;
- the ordinary checks and the affected real integration crossings;
- the retained failures, the cleanup and the limits;
- a preservation review against the joint mission's source;
- every reserved write stopped before the handback;
- the ownership return recorded.

**Stop conditions (freeze r2):**
- a path, method, object, grant or role outside §3;
- an edit to an applied migration;
- a number collision or a second writer;
- any change to a goal, research, design, source-review, M01 or Paperclip path beyond §3;
- any hosted, provider, deployment, spend or permission effect.

Any of these stops the writer and goes back to Codex.

## 5. The acknowledgements, as a checklist

| # | From | Acknowledges | State |
|---|---|---|---|
| K-1a | CON-01 | Its own responsibility: the reply design, 0048's replaced objects, S1–S4 (S2 included, distinct from M01), §3.1(d), A16, `conversation-*.ts` | recorded by this revision |
| K-1b | The retained core and runtime owners, through their lanes (§1) | §2's B-1 to B-6 against Q7 r8 exactly, each by the owner its "Bound by" names. This includes whether B-1 keeps the table, and B-2's key | requested here |
| K-1c | The joint lane | Consumer compatibility with this exact r2 manifest. Its CX-0155 disposition already covers B-1 to B-6 as directions. **The r8 design ACK is not counted as K-1a, K-1b or K-1c** | requested here |
| K-2a | S1-02 (Luis) | §3.1(a), and B-2's `commands` and `outbox` rows; names the current writer and reviewer | requested here |
| K-2b | S1-05A/BASE (Davide/Luis) | §3.1(b)'s 0012-foundation rows, §3.1(c) and its `sophia_api` ACL, `runtime_commands.kind`, B-3's cursor, §3.3's A04 change, and §3.2's registration (`runtime.ts`, `app.ts`, `index.ts`); names the current writers (BASE.md:30) | requested here |
| K-2c | The current SMC-M03 implementer | `runtime_hello` and `runtime_record_observations`, with only the named insertions; A11's runtime shapes preserved | requested here |
| K-2d | The joint WBC-02/SDD-01 implementer | The named insertions in `dispatch_runtime_outbox`, `capture_native_result` and `native_delivery_ineligible` | requested here |
| K-3 | #190's owner | §3.2's and §3.3's overlap, and the order of regeneration (Q10) | requested here |
| K-4 | Luis's integration review | §4's base: an exact commit and tree including the accepted Phase A and G1, or a named composition | waits on Phase A's acceptance and G1 |
| K-5 | Codex, as for Phase A | The fresh census, the atomic number and path reservation, and the GO record: the sole writer, the files, the start, the expiry and the return, source-only | after K-1 to K-4 |

**Until all of them are recorded, nothing in §3 is written.** An owner that replaces a recommendation in §2 or §3 is recorded with its replacement. The affected rows are amended and acknowledged again.

## 6. Already pending elsewhere, not repeated here

- **Phase A's acceptance and merge:** PR #256, head `93e9313d`. The window has ended, and 0053 stays reserved.
- **Luis's Studio handback:** the accepted base and order, the authoritative branch, the sole writer, and the four files with A15 and A16 regenerated. PR #199 stays at `d527f385`. CON's five follow-up corrections and `635a3ef2`'s withdrawal disclosure come after it.
- **Davide's:**
  - Q8: the reply profile rows and the runtime image;
  - D-4: no route bound, Ask stays off;
  - OP-0002-r5 and OP-0001-r3 stay unapproved drafts.
- **Q13's shared read policy and the reply identity's isolation:** `2ff7daeb`, its own scope (D-8).
- **#211's room job and the Personal Find fix:** the personal owner's.

## 7. Not authorized by this file

- No shared source, SQL, contract, generated file, artifact, profile or runtime write.
- No migration number or window.
- No role, membership, grant or connection change, in any cluster.
- No PR, merge or CI rerun.
- No hosted SQL, configuration, account, deployment, provider call or spend.

A consumer ACK or a published branch doesn't reopen a window. Only §5's records do.
