# CON-01 G2 Phase B: the shared reservation request (for the owners' acknowledgement; docs only)

**What this is.** The record that BINDING_MAP §8.8 Q6 and D-10 call `G2_SHARED_RESERVATION_REQUEST.md`. It covers freeze r2's Phase B start conditions [3] and [4].
- **What it asks:** the named owners' engineering binding, the exact Phase B scope, and the base, number, writer, order and handback that must be recorded before any shared write.
- **It asks; it assumes nothing.** No shared file, migration, number, contract, runtime, grant, route, deployment or provider effect is written or authorized here.
- **It doesn't repeat what is already pending elsewhere.** It points to it (§6).

**It rests on these exact records:**

| Record | Exact identity |
|---|---|
| Q7 design, revision 8 | [`7d4a76d9`](https://github.com/davidelaverga/Sophia/blob/7d4a76d9ec50fc80e97b3d2912e48ae362863043/docs/coordination/CON-01/G2_Q7_RELAY_OWNERSHIP.md), tree `5df0f52d`, document SHA-256 `82ff0856fd6a5a6d…`, 1298 lines |
| The joint consumer ACK of that exact revision | `BOUNDED_RUNTIME_CONSUMER_DESIGN_ENGINEERING_ACK_EXACT_R8_ONLY`. Findings empty. Safe record `942e5a3cc79d86da…`, original `fc4f61ca63e063fc…`, in [CX-0154](https://github.com/davidelaverga/Sophia/blob/aeff9f89147a96ca0ce3cebe5a776dc8107df24c/docs/coordination/CON-01/CX-0154.md). Codex's root review (CX-0153) found no new blocker. **It is a design ACK only:** no writer window, no core or ledger acceptance, no implementation and no target qualification |
| The shared-runtime freeze, r2 | `SHARED_RUNTIME_FREEZE_20261012.r2.json` at `01777c5ca32b8a92…`, SHA-256 `0a24d62dd9d2df01…`. CON's acknowledgement is CC-0155 |
| Phase A | GO record `SOURCE_PHASE_A_20261012.r1.json` at `a5479439e8b52424…` (SHA-256 `946c654fb03786ca…`). The pin is `93e9313d` (PR #256, draft), with `0053_runtime_outbox_reconcile.sql`. **The window has ended, and acceptance is separate and still pending** |
| The decisions record | D-10 (the writer) and D-12 (what may be written now) at [`3b1af9b9`](https://github.com/davidelaverga/Sophia/blob/3b1af9b94413a409214b05203d5fbdf5088435c1/docs/coordination/CON-01/BINDING_MAP.md) §13; §8.8's open questions |
| The reply runtime plan | [`46ddd769`](https://github.com/davidelaverga/Sophia/blob/46ddd769b7182e968da20219a9f6852757419805/docs/coordination/CON-01/G2_RUNTIME_PLAN.md) §3 (the held files) and §5 (the order). SHA-256 `fc6f4ad8548dee9c…`, the same blob the joint review read |
| The option C impact inventory | [`3b1af9b9`](https://github.com/davidelaverga/Sophia/blob/3b1af9b94413a409214b05203d5fbdf5088435c1/docs/coordination/CON-01/G2_IMPACT_INVENTORY.md) §3–§7 |
| Observed `main` | `5ed752bde219d38d…`, migrations through 0045, amendments through A14. **Observed, not an accepted base** |

## 1. Who is asked, and what is not asked

| Owner | Asked for | How |
|---|---|---|
| **The joint WBC-02/SDD-01 runtime owner** (the joint implementer lane in freeze r2) | §2's engineering binding, and §3's scope, as the owner of the runtime SQL, bridge, supervisor and launcher | Through Codex's root joint lane. Freeze r2 says this lane never messages the CON session |
| **#190's owner (SDD-01 G7)** | The overlap on the generated contracts and the shared registration files that freeze r2 lists (§3.2). Also the order in which each side regenerates (Q10) | The same |
| **The census** | Confirmation of the number 0049 (CON's retained 0048–0050), and that A16 is CON's, at the start (Q11) | Recorded by Codex before the first write, as for Phase A |

**On "the core and ledger owners":**
- The records name one runtime owner, WBC-02/SDD-01, and **no separate core or ledger owner**. §8.8's Q1 says that for the mission ledger, A08.
- So §2's decisions are put to the runtime owner as the owner of the runtime SQL. The reply ledger (S2) is CON's own candidate; it becomes part of 0049 in §3.1.
- **The one authority question here:** if separate core or ledger owners do exist, Codex names them, and the same §2 goes to them. It is not a question for Davide.

**Not asked:**
- Davide is asked no low-level engineering choice.
- What is already his and pending stays pending, and is not asked again:
  - Q8: the reply profile rows and the runtime image;
  - D-4: no reply route is bound, so replies stay `no_grant`.
- Luis's Studio handback is separate (§6).

## 2. The engineering binding the owner settles, against the exact r8 design

Each item is an existing Q7 r8 obligation that the joint ACK left to the core and ledger owners. CON's recommendation is stated so that it can be accepted, replaced or refused. None is a new design.

| # | The decision | CON's recommendation | Q7 r8 |
|---|---|---|---|
| B-1 | **Hello's lease-loss table:** keep it or drop it | **Keep it.** It ends a lease-lost request at the hello, whatever the new bridge answers to the replay. And it keeps a busy or replies-off bridge's `rejected` from releasing a reservation the old execution may have used. **If it is dropped,** the required alternative is accounting-safe: the bridge asks the claim before ever answering a replayed `create` `rejected`. Tests exist for both. P1-E stays withdrawn either way | §6, the table and "Why a table at all"; §10 |
| B-2 | **The cleanup `retire`'s writer and idempotency.** Exactly one per attempt, keyed to the same attempt and reply, with its own `commands`, `outbox` and `runtime_commands` rows (0012:74, 77-79). Never a new Ask, `create` or execution, attempt, reservation, call or allowance reset | **One idempotency key per attempt,** enforced by a unique constraint the owner names. The receipt reply branch and the hello's lease-loss rows both go through one writer function, so a repeated hello or a replayed receipt writes nothing new. A `retire` runtime-command kind is added by the reviewed CHECK change and the wire. The outbox destination stays inside the existing `native.%` reconcile filter | §6 "The one exception"; §10's delivery counts |
| B-3 | **The cursor rule** for `stop` and `retire`: replayed once per hello until a `checked` answer is recorded | A new version of `runtime_cursor` in 0049 (it is defined at 0012:399, and 0012 is not edited). It counts a `stop` or `retire` with no recorded `checked` answer as unanswered at the hello only, never in a loop within one connection | §6, the `stopping` row |
| B-4 | **BINDING_MAP §8.2.1:297 and :299,** which say "no second … outbox row or runtime command" beside "one `retire`" | Replaced in the accepted window by: "no second attempt, reservation, `create` or execution. Exactly one cleanup `retire`, with its own command and delivery rows; none on replay". CON edits its own binding only in that window, after B-2 is bound | §6 "Owned by the core owner" |
| B-5 | **The run gate and the claim:** `conversation_execution_claim` and `conversation_execution_go`, with the lease as `bridgeInstanceId`, behind `runtime_lease` | As written. One atomic `pending` → `running` transition, replayed for the same lease and command | §6, "The API and 0049" |
| B-6 | **The acknowledgement's eight predicates,** plus the relay's own condition | Bound to their durable keys as §7 lists them: `terminalWriter`, `createAnswered`, and `capture: none` only with no `turn/end` in both the journal and the database. No predicate ever asserts a record that doesn't exist | §7 |

## 3. Phase B's exact scope, by step

**The order is the plan's §5.** Each step is its own immutable pin, with a fail-before, an after and the full gates, and a fresh composition with the accepted base, with independent review between steps. **Nothing outside these lists is written.** An unlisted need stops the writer, and the list is amended and re-acknowledged.

### 3.1 Step 1: the SQL, one migration (`0049`, after the census)

**Replaced:** each with a reply-first branch and a `g.id IS NULL` guard. The goal path stays byte-identical to its latest body, and a `pg_get_functiondef` equality test proves it (the inventory, §6):

| Function | Latest body on observed `main` |
|---|---|
| `dispatch_runtime_outbox` | 0042:1806 |
| `native_delivery_ineligible` | 0041:149 |
| `capture_native_result` | 0042:1724 |
| `runtime_hello` | 0028:74 |
| `apply_runtime_receipt` | 0012:464 |
| `runtime_record_observations` | 0023:20 |
| `runtime_cursor` | 0012:399. Only B-3's rule changes |

**New:**
- `conversation_executions`;
- `conversation_execution_claim` and `conversation_execution_go`;
- `conversation_dispatch`, `conversation_delivery_ineligible` and the assembly `conversation_reply_statement`;
- `conversation_cancel` (epoch 2 and `stop`);
- the S2 ledger's candidate functions, from `db/candidates/con01-s2-conversation-reply-ledger.sql` as reviewed:
  - `conversation_reserve`, `conversation_settle` and `conversation_mark_uncertain`;
  - `conversation_release` and `conversation_reconcile`, stubs with no proof source;
  - its grant and ledger helpers;
- the cleanup `retire` writer (B-2);
- `runtime_commands.kind`, with `retire` added to its CHECK.

**Changed from 0048 (CON's own):**
- `conversation_ask` (admission);
- the request-state CHECK, its partial index and `conversation_withdrawn_from` (`outcome_unknown` becomes terminal; BINDING_MAP §8.2.1).

The S1, S3 and S4 candidates on `7d8f415f` are promoted only as their own reviews set out.

**Not edited:**
- every other function in the inventory's §3, including `runtime_poll` (0016:114), `runtime_lease` (0012:387) and `reconcile_runtime_outbox`, which is 0053's after Phase A;
- any applied migration;
- any grant beyond the named callers.

**Tests:**
- `packages/persistence/src/runtime.db.test.ts`, extended as Q7 r8 §10 lists;
- `conversations.db.test.ts`, whose A10 case changes by design (the inventory, §6);
- the function-body preservation tests;
- `db/tests/0037_amendment_preservation.sql`;
- `personal.db.test.ts:922-929`;
- `pnpm test:db`, `pnpm test:sql` and `pnpm check`.

### 3.2 Step 2: the wire and the contracts

**Amendment:** A16 (CON), A04's `RuntimeWorkBinding` as `oneOf` goal or reply, plus the new route bodies.

**Generated companions,** made only by their generators and never merged by hand:
- `packages/contracts/openapi/openapi.json`;
- `packages/contracts/src/generated-types.ts`;
- `packages/contracts/src/generated/validators.js` and `validators.d.ts`;
- `packages/dsh-bundle/src/runtime-wire.generated.ts` and `runtime-wire-types.generated.ts`.

`generate-validators.ts` and `validate.ts` are edited only if the generator needs it, and then named.

**Registration:**
- `apps/api/src/routes/runtime.ts`: claim, go, reserve, settle and acknowledged, each behind `runtime_lease`;
- `apps/api/src/app.ts`;
- `packages/persistence/src/index.ts`;
- `packages/persistence/src/outbox.ts`: `goal_id` becomes `string | null`.

**Preserved, per freeze r2's Phase B paths:**
- #190's `VOICE_SCHEMA`, the required-schema list and `registerHealth`;
- the voice persistence exports;
- A15's and A17's contracts and validation.

**Tests:** the contract checks, `tests/unit/routes.test.mjs` with a reply twin, and every goal case unchanged.

### 3.3 Step 3: the bridge

**Edited:**
- `packages/dsh-bundle/src/control-bridge.ts`: `execute`'s one reply branch, `connect` → `reconcileReply`, and the disposer;
- `index.ts`: `BridgeSettings.replies`;
- `transport.ts`: the five conversation calls and the optional `signal` on `observations`;
- `protocol.ts`: `KINDS` gains `retire`;
- `role-registry.ts`;
- `cordis.patch.yml`: the `sophia-reply-child` row.

**New:**
- `packages/dsh-bundle/src/reply-child.ts` (`ReplyChildren`, `ReplyChild`, `ReplyRelay`, `fromJournal`);
- `packages/dsh-bundle/src/reply-plugin.ts`.

**Artifact:** the bundle archive and its recorded digest (`config/runtime-unit.json`), regenerated by the recorder.

**Tests:**
- `packages/dsh-bundle/test/reply-child.test.ts` and `reply-plugin.test.ts` (new);
- `tests/unit/bridge-core.test.mjs`, with a reply twin;
- the goal fixtures, byte-identical.

### 3.4 Step 4: the supervisor, the launcher and the profile

**Edited:**
- `apps/execution-host/src/runtime-supervisor.ts`: `SupervisorOptions.replies`, `environment()`, and `sweepReplies` with the generation seal;
- `scripts/runtime-host.mjs` and `scripts/lib/profile.mjs`: the reply template's install, its link rule and its `sophia-reply-tree-v1` digest.

**New:** `apps/execution-host/reply/reply-launch.py` and `test_reply_launch.py`.

**Profile:**
- `config/dsh/reply-rows.reviewed.json` (new; the rows are Davide's, Q8);
- its template digest, recorded in `config/runtime-unit.json`.

**No route is added** (D-4), and no dependency, pin or lock change is inferred.

**Tests:**
- `tests/integration/supervisor.test.mjs`, extended;
- `tests/integration/reply-runtime.test.mjs` (new, L1 with the loopback stub).

### 3.5 Step 5: qualification

Q7 r8 §9's P1–P8 and §10's L1 cases, on the pinned runtime with the stub route only. `pnpm artifacts:record` runs once, on the combined candidate. **No provider call, and no hosted effect.**

**Not in Phase B:**
- Q13's shared read-policy scope (freeze r2 start condition [4]; CON's proposal is `2ff7daeb`, its own scope and acknowledgement);
- the Studio, held for Luis's handback;
- any route or credential.

## 4. Base, number, writer, order and handback

- **The base:** one exact commit and tree, sealed before the first write. It contains:
  - `main`;
  - the **accepted Phase A** (0053, PR #256, once accepted and merged);
  - **G1's 0048 (PR #199),** because 0049 extends 0048's tables and functions, and `main` has neither. PR #199 is held, with its head at `d527f385`, pending Luis's Studio handback. So the integration owner either accepts G1 onto `main` first or names a composed base.
  - It is not `#211`'s diverged base, and not an unmerged CON candidate by default.
- **The numbers:** 0049 for the migration, from CON's retained 0048–0050, confirmed by a fresh census of every published ref, every PR and the local owner, at the start. A16 is CON's amendment. **A collision stops the writer.**
- **One writer:** this CON thread, session `01KUDtFK9gWthsXSrepcLQz3` (D-10). The joint lane keeps its freeze on these surfaces until the handback, and #190 later merges `main` with its own writer. There is no second writer.
- **The order:** §3's five steps, each pinned, reviewed and accepted before the next. Every step re-composes with the accepted base.
- **The handback boundary (freeze r2):**
  - the immutable commit and tree;
  - the exact path, function, contract and artifact diffs;
  - the ordinary checks and the affected real integration crossings;
  - a preservation review against the joint mission's source;
  - every reserved write stopped before the handback;
  - the ownership return recorded.
- **Stop conditions (freeze r2):**
  - a path or method outside §3;
  - an edit to an applied migration;
  - a number collision or a second writer;
  - any change to a goal, research, design, source-review or Paperclip path beyond §3;
  - any hosted, provider, deployment, spend or permission effect.

  Any of these stops the writer and goes back to Codex.

## 5. The acknowledgements, as a checklist

| # | From | Acknowledges | State |
|---|---|---|---|
| K-1 | The joint runtime owner | §2's B-1 to B-6, choosing whether B-1 keeps the table, against Q7 r8 exactly | requested here |
| K-2 | The joint runtime owner | §3's scope, with any addition or removal named | requested here |
| K-3 | #190's owner | §3.2's overlap and the order of regeneration (Q10) | requested here |
| K-4 | The integration owner | §4's base: an exact commit and tree including the accepted Phase A and G1, or a named composition | waits on Phase A's acceptance and G1 |
| K-5 | Codex, as for Phase A | the census, the number reservation, and the GO record: writer, files, start and return | after K-1 to K-4 |

**Until all five are recorded, nothing in §3 is written.**

## 6. Already pending elsewhere, not repeated here

- **Phase A's acceptance and merge:** PR #256, head `93e9313d`. The window has ended, and 0053 stays reserved.
- **Luis's Studio handback:** the accepted base and order, the authoritative branch, the sole writer, and the four files with A15 and A16 regenerated. PR #199 stays at `d527f385`. CON's five follow-up corrections and `635a3ef2`'s withdrawal disclosure come after it.
- **Davide's:**
  - Q8: the reply profile rows and the runtime image;
  - D-4: no route bound, Ask stays off;
  - OP-0002-r5 and OP-0001-r3 stay unapproved drafts.
- **Q13's shared read policy:** `2ff7daeb`, its own scope.
- **#211's room job and the Personal Find fix:** the personal owner's.

## 7. Not authorized by this file

- No shared source, SQL, contract, generated file, artifact, profile or runtime write.
- No migration number or window.
- No PR, merge or CI rerun.
- No hosted SQL, configuration, grant, account, deployment, provider call or spend.

A consumer ACK or a published branch doesn't reopen a window. Only §5's records do.
