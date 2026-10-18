# CON-01 G2: the reply runtime, file by file (a plan; docs only)

> **Current source-only addendum, 14 October 2026:** Davide approved the two amendments in REQUEST SHA2569aad53ed91a8d96df7ce0be22d73e57a9061c6e536a1accb3f90393acc1c4b73; [handoff90](../../handoffs/CON-01-codex-source-takeover-90.md) records application and bounded independent component review. ACK reservation rows now require immutable `unit` for all four states (two schema branches), and recovery may obtain each ordinal's original unit from correlated ACK after payload erasure. Missing/conflicting identity or unit stays unresolved. The exact enabled CON controller is cancelled on superseded poll409/invalid_state; mixed-instance polling stops, native goal state is preserved. This supersedes older “pending27/36” source-status wording only. The approved source window ends **20:00 Rome /18:00Z on14October**, superseding historical noon expiry text below. No deployment, hosted migration, credentials/provider, account/grant, integration or Q8/profile authority is added. Full restart/hello orchestration and physical/native qualification remain unfinished; `connect()` still reports CON bindings unrecovered, launcher run/probe is disabled, and Ask stays off. Historical proposals, owner ACKs and pins below remain historical evidence.

> **14 October source addendum — handoffs13/19 approved.** Davide approved exact [handoff24](../../handoffs/CON-01-codex-source-takeover-24.md), recorded [198/6156319630](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6156319630). Source-only scope is renewed through **2026-10-14T10:00Z /12:00 Rome**. Section3.1 now includes the exact CON dispatch snapshot of credentialRef/ownerResourceRef/unit from the eligible locked grant and the settled-only stored-used ACK projection; section3.3 includes the exclusive create wire, listed generated companions and original-unit recovery comparison from exact handoffs13/19. Goal/control payloads, existing auth/locks/accounting and other predicates remain unchanged. Historical ACKs retain their own pins. Q8/profile, current-main Studio/shared integration and all operational effects remain separately held. See [handoff25](../../handoffs/CON-01-codex-source-takeover-25.md) for implementation evidence; no full native or app acceptance follows from these component changes.


> **13 October source-only addendum — handoff11 approved.** Davide's direct approval is recorded in [198/6146624582](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6146624582), exact [handoff11](../../handoffs/CON-01-codex-source-takeover-11.md) SHAa380818c, wire333cd4d6/SQL14fc03ba. It amends the current source scope only: original four-field goal `RuntimeServiceBinding` is unchanged; the exclusive CON branch adds trusted `conversationReplyId` and required `create` (proven-undispatched null, fully correlated current-runtime original commandId/epoch, or explicit unresolved different_runtime/correlation_invalid). New0049 changes only CON-HELLO-BINDINGS; no ACK authority expands. This supersedes current CON four-field descriptions below, while historical owner ACKs retain their exact revisions/pins. Existing expiry18:00Z/20:00Rome and all operational restrictions remain. [Handoff12](../../handoffs/CON-01-codex-source-takeover-12.md) records the partial implementation, closed full/scrubbed projection validation inside existing CON-OBS-REPLY (no new helper), usage correlation and actual limits. Native lifecycle, whole Step3/artifacts/gates/integration/deployment/app acceptance remain incomplete.


**What this is.** A reviewable plan, asked for by Codex in CX-0115. For each part of a reply's native execution, it names the exact code that exists today, the change B-1 needs, who holds the file, and the tests. **Nothing here is written, and nothing here authorizes anything:** no shared file, runtime, migration or number, grant, route, caller, new harness or VM, provider call, spend, merge or live effect.

**Read at:** source `f36a8fa0` (S1–S3 and N4 with G2_CON_ONLY_PLAN Steps A and B) and the binding at `cfaf1295` (BINDING_MAP §8.2–§8.5, as amended through CC-0121; G2_CON_ONLY_PLAN). Line references are to `f36a8fa0`. `NNNN:L` is a migration; `bridge:` is `packages/dsh-bundle/src/control-bridge.ts`; `supervisor:` is `apps/execution-host/src/runtime-supervisor.ts`.

## 0. Unknown, and kept unknown

None of these is a design fact. Each is either an owner's answer or something a pinned-runtime probe (§4) must establish first.

| Unknown | Why it matters | Settled by |
|---|---|---|
| **The runtime's owner** (WBC-02/SDD-01) | Every runtime file below is theirs | Q6, Q7 |
| **The accepted base and window** | §7.1 names none. CX-0115's read-only composition with `main` `fec45a0e` is a discovery, not a base | Q6, Q10 |
| **Migration numbers** | 0049 (option C, the reply branches, the claim, `retire`) and the source hook | Q11 |
| **The reply route** | None is bound (`no_grant`). The subscription connection is an owner-resource dependency, not a second harness or collector. There is no pay-as-you-go fallback | D-4 |
| **Which process owns a reply child's relay** | The binding has the supervisor spawn the child (§8.5, "asks the supervisor for a reply child"), but the transport lives in the bridge, which runs inside the project's dsh process (`packages/dsh-bundle/src/index.ts:253-270`). A child's fd 3 belongs to the process that spawned it. **Choices:** (a) the supervisor relays, with its own transport (it already holds the bridge URL and token, supervisor:151-152); (b) the descriptor is passed to the bridge; (c) the bridge spawns through a helper the supervisor owns. The binding doesn't settle it, and neither does this plan | Q7 |
| **dsh 0.2.0-rc.2's own behaviour** in a fresh per-reply home | Whether a profile copied into an empty `DSH_HOME` boots offline; which files dsh writes, and where; whether its logger prints message text; what it does on SIGTERM mid-turn; its exit status on a normal completion; whether anything is cached under `HOME` | The probes in §4.1, before any design depends on them |
| **The deploy host's Landlock ABI and `pidfd`** | Both fail closed: `containment_unavailable`, and the home left unresolved | The host's owner; a host qualification run |

## 1. What CON-01 may write now

Only `db/candidates/con01-*.sql`, `packages/persistence/src/conversation-*.ts` and their tests, and `docs/coordination/CON-01/*` (G2_CON_ONLY_PLAN §1). Steps A and B are those. **Every runtime part below lands in a held file**, so none of it is CON-only, and none is proposed for writing before §5's order is unblocked.

## 2. Each part, today and as B-1 needs it

### 2.1 An isolated home per reply, and its launch

**Today:** one dsh process per project, one home.
- **Spawn:** supervisor:183, `spawn(process.execPath, [runtimeDir/launcherEntry, '--profile', profile, …], { cwd: <root>/work, stdio: ['ignore','pipe','pipe'] })`. The argv is built at supervisor:182; `launcherEntry` is `DSH_ENTRY` (`scripts/lib/common.mjs:28`), set at `scripts/runtime-host.mjs:74-82`.
- **Environment:** supervisor:131-155: `HOME`, `TMPDIR`, `DSH_HOME`, `SOPHIA_WORKSPACE`, the credential names, the bridge URL and token. `extraEnv` is spread last (:153), so it can override any of them.
- **Root layout:** `scripts/lib/profile.mjs:18-20`. The profile is installed with `dsh plugin install --frozen-lockfile --offline` (`profile.mjs:54-67`) and reconciled at host start (:146-169). Recorded artifacts are checked at :23-35.
- **The only supervisor lease** is a pid file (supervisor:82, :101-128). There is no `pidfd`, process group, `PDEATHSIG` or orphan sweep.
- **No per-reply home, `replies/` path or retire exists anywhere** (the surveys' greps).

**B-1 needs (held):**
- A reply-child spawn path, beside today's goal path, in `apps/execution-host`. It:
  1. runs only after the claim answers `first` (§2.3);
  2. creates `<root>/replies/<attemptId>/{home,home/tmp,dsh-home,work,diag}` with mode 0700;
  3. sets the environment once. **`extraEnv` must not override a reply child's `HOME`, `TMPDIR` or `DSH_HOME`**, as it can today;
  4. points stdout and stderr at `diag/` files, so there is no `this.output` for a reply child. Today's collector is unbounded (supervisor:209-215).
- **The reply profile,** copied into the child's `DSH_HOME/profiles/` and digest-checked. Whether a copy of an installed profile tree boots, or each child needs `installInto`'s offline install, is an unknown (§0), and a probe decides it.
- **A launcher** in the runtime image (new, held: Q7–Q9). It reuses the renderer's reviewed pattern:
  - the ABI 4 check, `renderers/web/pdf/uml/landlock-launch.py:96-98`;
  - `RLIMIT_CORE` 0, :99;
  - no-new-privileges, :139;
  - `restrict_self`, :141;
  - descriptor closing like :195, but keeping 0–3;
  - `pidfd` as in `namespace-launch.py:76` and `test_owned_exec.py:12, :46, :54`.
- **Settling a reply child's descendants: identity-bound only** (CX-0116).
  - **Not reused:** the PDF renderer's `signalGroup`/`reap`/`groupAlive` (`renderers/web/pdf/supervisor.mjs:351-432`) target numeric ids. `reap` selects by process group or by a shared uid (:400-417) and signals `-pgid` and numeric pids, and `signalGroup` (:354) and `groupAlive` (:428) use numeric ids too. Reply children run as the host user that every mission shares, so a uid-wide selection could reach unrelated missions. That fits the renderer's own environment; it does not give B-1's guarantee.
  - **Prohibited for CON's reply children:** any uid-wide sweep, any signal to a numeric pid or process group, and any numeric fallback when a `pidfd` is unavailable. In that case nothing is signalled and the home stays unresolved, as §8.5 says.
  - **Required:** a descendant-settlement mechanism the runtime owner approves (Q7), whose every target is identity-bound to the reply child that owns it. One option to evaluate is the child as init of its own PID namespace, held by a `pidfd`, as `namespace-launch.py:60` and `:76` do. This plan does not choose it.

**Tests** (held, written with the code):
- **Extended from `tests/integration/supervisor.test.mjs`** (today :60-141, the goal path only): two concurrent replies, with each child's `/proc/<pid>/environ` inside its own home, and the parent's and supervisor's environments unchanged.
- **Containment:** a write outside the home fails `EACCES`, and so does one into `runtimeDir`. `/proc/self/fd` just before `exec` is exactly four. Every later descriptor is accounted for by provenance.
- **Failure modes:** no `core*` file after a crash. ABI below 4, or no `pidfd`, gives `containment_unavailable` and no child.
- **Identity controls for descendant settlement:**
  - an unrelated process of the same uid, and another mission's child, survive every stop, reap and sweep;
  - a lease rewritten to name another live process (same command line, a different start time or nonce) kills nothing and leaves the home unresolved;
  - a pid reused between the check and the signal is never signalled;
  - every descendant a reply child started is gone before its home is cleaned.

### 2.2 Correlation: request, attempt, session, epoch

**Today:**
- **Sessions:** a native session is `sophia-<attemptId>` (bridge:829-833), and `newAttempt` is bridge:835-856.
- **Epoch:** a strictly older epoch is refused (bridge:705-707).
- **Hello:** reconciles each binding (bridge:334-337, :1251-1295); `runtime_hello` is 0028:74.
- **Dispatch** builds the payload and binding, and writes the runtime command (0042:1806; the command at :1893-1894).
- **Goal ids are required:** `work_attempts.goal_id` is NOT NULL (0001:76), and so is `outbox.goal_id` (0001:111).
- **The wire's work binding** is A04's, validated through `runtime-wire.generated.ts:27-32`.

**B-1 needs (held):**
- **Option C** (§8.2 and G2_IMPACT_INVENTORY): `goal_id` nullable, plus a `conversation_reply_id`, on the shared tables.
- **The binding** becomes a `oneOf` of a goal binding or `{conversationReplyId}`, regenerating the wire and the contracts (§2 of the binding map: whoever lands second).
- **`runtime_hello`** preserves the original goal SELECT and appends a separate CON aggregate, each active only while pending/running, otherwise stopped. The [r12 research amendment](G2_RESEARCH_COMPATIBILITY_AMENDMENT.md) proposes a durable two-CON-binding admission cap and both hello.bindings/ready.unrecovered limits502, with complete reports and compatible readers before admission. Old H4=500 is not implicitly accepted; exact foundation/research/joint/K3 rechecks remain pending.
- **`dispatch_runtime_outbox`** gets a reply branch that assembles through N2.
- **`conversation_cancel`**, which doesn't exist today: it raises the epoch to 2 and writes `stop`. It is CON's function, but it writes shared rows, so it is held too.

**Tests:**
- **Goals unchanged:** `packages/persistence/src/runtime.db.test.ts` :341-806, byte-identical for goals.
- **New reply-branch database tests:**
  - hello: `active` or `stopped`, never `held`;
  - dispatch accepts only `pending`;
  - an older epoch is refused by the bridge.

### 2.3 The execution claim, and cumulative idempotency

**Today's fences, cumulatively:**
- **One runtime command per outbox row:** `UNIQUE(project_id,outbox_id)`, 0012:77.
- **Each receipt once:** `(project, command, stage)`, 0012:93, inserted `ON CONFLICT DO NOTHING` (0016:100).
- **Each observation once:** `UNIQUE(project, binding, upstream_key)`, 0001:125, keyed `unit:session:seq` (0023:33).
- **Each usage row once:** `UNIQUE(project, attempt, provider_call_id)`, 0012:19-20, keyed `session#seq` (0023:42).
- **In the bridge,** a duplicate command is answered from `attempt.receipts` (bridge:703-704), and `create` refuses an existing attempt unless its command is unsettled (bridge:1007-1009).

**B-1 adds** (held: 0049, the route set):
- **`conversation_executions`** with `conversation_execution_claim`, consulted before any spawn. Only `first` spawns; a lost answer or `already_claimed` spawns nothing (§8.5).
- **Its route** `/v1/runtime/conversation/claim` joins `RUNTIME_ROUTES` (`apps/api/src/routes/runtime.ts:43-58`).
- **"Attempt" names two things here.** S3's context-assembly attempts (1–3 per reply, `conversation_assembly_claims.attempt`) are bounded re-assemblies of the same request. The native execution attempt (one `work_attempts` row per request, under option C) is what dispatch, the claim and the spawn act on. Both belong to the same logical request and its one cumulative allowance (S2).
- **The resulting chain:** one request → one native execution attempt → one outbox row → at most one runtime command → at most one claim → at most one spawn. Observations, usage and receipts are each recorded once. Reservations are keyed by the request (S2), and there is one answer per reply (N4's answers row).

**Tests** (held), each counting spawns (the launcher's counter) and the stub's call log: the same `create` redelivered during execution, after each terminal state, after `retire`, after a lost `retire` acknowledgment, and from a restarted bridge.

### 2.4 An uncertain dispatch, reconciled before any retry

**Today:**
- **Leases expire:** a `dispatching` row past its lease becomes `outcome_unknown` (`expire_dispatch_leases`, 0004:19-21; and dispatch's own branch, 0042:1816-1818).
- **`reconcile_runtime_outbox`** (0012:782-797) returns a row to `pending` **only when no runtime command exists for it** (`rc_id IS NULL`). Otherwise it settles the row by the command's `answered_stage`, or leaves it `outcome_unknown`.
- **The worker** runs expire → reconcile → claim → dispatch (`apps/worker/src/runtime-dispatch.ts:41-60`).
- **Covered by** `runtime.db.test.ts:806`, "reconciles an uncertain dispatch from the database and never queues it twice".

**The reply rule** (§8.2.1, §8.5):
- Only an outbox row with no runtime command is ever re-dispatched, and its `create` must still win the claim.
- An execution that may have started (a claim taken whose outcome is unknown, or a lost claim answer) is reconciled first: the request ends `outcome_unknown` and its open reservation becomes `uncertain`. **It is never re-run.**
- Asking again is a new request.

**A pre-existing shared defect sits under this path:** the dispatcher's reconcile spin, and the starvation of recoverable rows behind it (§2.4.1). The reply design depends on its correction.

**Tests:** the existing :806 test kept, plus held reply cases:
- a lost claim answer: `outcome_unknown`, no spawn;
- a row with a command: never re-dispatched;
- a row with none: re-dispatched once, for the same request against the same reservations;
- at most one answer.

### 2.4.1 A shared owner dependency: the dispatcher's reconcile spin and starvation (P2; CX-0116)

**What happens.** A native outbox row left `outcome_unknown` behind an answered runtime command is counted as reconciled on every pass, though nothing changes. The worker then skips its idle wait.
- **Codex reproduced it** on PG 17.6 (CX-0116), at `f36a8fa0`, byte-identical to `main` `fec45a0e` for every file below:
  - a `failed` receipt and an `outcome_unknown` receipt each leave one such row;
  - three real `dispatchOnce` passes each return `reconciled=1`, with no expiry, outcome or loss, and the same state;
  - a real `RuntimeDispatcher` with `idleMs` 1000 ran five reconcile passes in 4.94 ms before a controlled stop;
  - **control:** a `delivered` receipt gives `reconciled=0` on all three passes.
- **The damage:** repeated database work with no progress. No duplicate native dispatch or provider use was seen.
- **The same rows also starve recoverable ones** (CX-0116 recheck, a third fresh probe on PG 17.6 at the same source):
  - **The backlog:** two older rows whose commands answered `failed` and `outcome_unknown`, and a newer expired row with no runtime command.
  - **With `p_limit` 2:** three passes each return 2, and the newer row stays `outcome_unknown` with 0 commands. It could be returned to `pending`, but the `ORDER BY created_at LIMIT p_limit` window (:786-789) selects the same two older rows every time.
  - **Control, `p_limit` 3:** the pass returns 3, and the newer row becomes `pending` with 0 commands.
  - **The default window has the same class:** 50 such rows older than a recoverable one hide it from the worker's own call, `reconcileRuntimeOutbox(pool)` with its limit of 50 (`dispatch.ts:56`).

**The exact shared boundary,** none of it CON's:

| Where | What |
|---|---|
| `db/migrations/0012_runtime_service.sql:782-797`, `reconcile_runtime_outbox` | Selects `outcome_unknown` native rows, LEFT JOINed to their runtime command (:786-789). For a command answered `failed` or `outcome_unknown`, the CASE's `ELSE` leaves the row `outcome_unknown` (:791-795). `n:=n+1` still runs for every selected row (:796) |
| `db/migrations/0012_runtime_service.sql:470-475`, `apply_runtime_receipt` | Sets the outbox row `outcome_unknown` for any receipt stage other than `rejected`, `delivered` or `checked`, which produces such rows in normal operation |
| `packages/persistence/src/dispatch.ts:55-58`, `reconcileRuntimeOutbox` | Returns the function's count unchanged |
| `apps/worker/src/runtime-dispatch.ts:41-60`, `dispatchOnce`; :93-112, `RuntimeDispatcher.run` | A pass is expire → reconcile → claim → dispatch. Line 98 runs the next pass at once when `reconciled > 0`, skipping `idleMs` |

**The smallest owner correction** (the runtime writer's, by a new migration with a census number; 0012 is never edited). Both parts are required:
- **(a) No starvation.** A recoverable row is reached within a bounded number of passes, however many rows that can't change are older than it. Either:
  - **select only rows the pass can change.** Exclude exactly the rows the CASE's `ELSE` leaves `outcome_unknown`: a command whose `answered_stage` is set and is not `delivered`, `checked` or `rejected` (today `failed` or `outcome_unknown`). Then they no longer occupy the window. The filter and the mapping must state the same rule, so they can't drift;
  - **or a bounded fair traversal** that the owner proves: every recoverable row is selected within a stated number of passes, whatever the backlog ahead of it.
- **(b) An honest count.** Count a row only when its state actually changes: test `FOUND` on an UPDATE whose WHERE excludes an unchanged result, or increment only when the target state differs from `outcome_unknown`.
- **(b) alone is not enough.** It ends the spin, but each pass keeps selecting the same older rows, and the recoverable row behind them is never reached (CX-0116 recheck).
- **Unchanged:**
  - the mapping itself;
  - a row that can't change stays `outcome_unknown`, with its one runtime command, its reason and its accounting;
  - no row ever gets a second runtime command;
  - `runtime-dispatch.ts` needs no change once both hold.
- **The scan's cost:** rows that can't change stay `outcome_unknown` until an operator settles them (A12, A13). How the selection's cost over that backlog is bounded is the owner's call; this plan does not choose an index.

**The owner's recheck:**
- **The new regression:** a row left `outcome_unknown` by a `failed` receipt, and by an `outcome_unknown` receipt, gives `reconcile_runtime_outbox` = 0 and `dispatchOnce` `reconciled: 0` on the second pass. A `RuntimeDispatcher` then waits `idleMs` between passes.
- **The backlog regression, at `p_limit` L, run at L = 2 and at the default 50.** The head is L older rows whose commands answered `failed` and `outcome_unknown`, both kinds present. Behind it, at L + 1, is a newer expired row with no runtime command.
  - **The tail is reached:** on the first pass with a selection of changeable rows, or within the stated bound with a fair traversal. It becomes `pending`, reconcile writes no runtime command, and that pass counts 1.
  - **The head is unchanged:** every row stays `outcome_unknown`, each with exactly its one runtime command, and its reason, command state and accounting unchanged.
  - **Every other pass counts 0,** and a `RuntimeDispatcher` idles between them.
  - **Afterwards:** the tail, dispatched by the ordinary path, gets its first and only runtime command. No head row ever gets a second.
  - **Fail-before, at today's source:** each pass counts L, and the tail stays `outcome_unknown` with 0 commands (Codex's probe).
- **The same backlog with each other recoverable tail:**
  - a command not yet answered: `acknowledged`;
  - one answered `delivered` or `checked`: `settled`;
  - one answered `rejected`: `denied`.
  - Each is reached as above and moved by today's mapping, so the correction leaves out nothing the mapping can move.
- **Controls:**
  - `p_limit` L + 1 over the same backlog reaches the tail at once (as today);
  - a `delivered` receipt: 0 (unchanged);
  - a row with no runtime command: still returned to `pending` once, and still counted;
  - `runtime.db.test.ts:806`, "reconciles an uncertain dispatch from the database and never queues it twice": unchanged.
- **The rest:** the existing runtime and worker suites, and `pnpm check`.

**What CON-01 binds for itself** (no CON fix, and no widening of CON's scope):
- **The order:** 0049's reply branches (§5, step 1) are not proposed for writing until the owner's correction has landed on the accepted base, or is in the same named window ahead of them. Otherwise every failed or uncertain reply create would add a spinning row, and enough of them would hide a recoverable reply behind them.
- **The reply branch of `apply_runtime_receipt`** keeps today's outbox mapping. It does not invent its own outbox state to dodge the spin or the window, so the shared semantics stay one rule.
- **The reply qualification adds the owner's recheck for replies:**
  - a reply `create` answered `failed`, and one answered `outcome_unknown`: the request ends as §8.2.1 says, the outbox row stays uncertain, and the next reconcile pass reports 0, with the dispatcher idle;
  - neither is ever re-dispatched;
  - **the backlog:** a full window of such reply rows, then an expired reply `create` with no runtime command. The newer one is reached as the owner's recheck requires and dispatched once, for the same request and against the same reservations. No older one is re-dispatched.
- **Recorded as Q12** in BINDING_MAP §8.8.

### 2.5 The relay, the projection, and every copy

**Today:**
- **The goal projection:** `summarize` (bridge:1459-1494) passes `turn/*` and `step/*` data raw, and slices assistant text at 120,000 (:1422, :1472-1479).
- **Validation:** `enqueueObservation` checks `wire.RuntimeObservation` (bridge:1315-1332), whose `data` is unbounded (A04).
- **The queue:** the observation queue is a `RetainedQueue` (bridge:179-183) with no length bound (`retained-queue.ts:32-77`). `headBatch` bounds each request (:15-25).
- **Transport:** `observations` (`transport.ts:182`), like `hello`, `receipts`, `ready` and research reserve/settle/submit, carries no abort signal or timeout.
- **API:** the observations route allows 8 MiB (`apps/api/src/routes/runtime.ts:90`).
- **The journal** stores the prompt's content in `sophia/command` (`session-events.ts:54-66`) and fsyncs each record (:171-177), but not the directory.
- **The bridge's maps** are never pruned (bridge:144-157).

**B-1 needs (held):**
- **The reply-only projection** and its schema (§8.5, CC-0118/CC-0120/CC-0121): five types, the answer 1–16,000 characters as PostgreSQL counts them, storable, never sliced.
- **A relay per reply:**
  - a 1 MiB line bound, checked before parse;
  - a queue of 64 items and 4 MiB, an item admitted only if it fits;
  - backpressure;
  - `draining` / `fenced` / `closed`.
- **The process that holds it is unknown** (§0).
- **Timeouts:** the transport calls the relay makes need them, so blocked delivery is noticed. Today's lack is a goal-path fact; the relay must not inherit it.
- **The copies** (§8.5's table), each with where it is today:

| Copy | Today | Under B-1 |
|---|---|---|
| The bridge journal | `dsh-home/sophia-bridge/<session>.jsonl` (`index.ts:255`; `session-events.ts:118-124`) | In the child's home; never in the parent |
| dsh's session log, projection cache, spill, startup logs | `dsh-home/sessions`, `storages/session_projcache`, `home/tmp`, `dsh-home/logs` | Contained in the child's home |
| The credential store | `dsh-home/.credentials.yaml` | Disabled in the reply profile |
| The profile | `dsh-home/profiles/<profile>` (`profile.mjs:51`) | Copied per child |
| The supervisor's output | `this.output` (supervisor:209-215) | None for a reply child; `diag/` |
| The bridge's maps | bridge:144-157 | Pruned at `retire` |
| `runtime_commands.body` | 0042:1893 | Scrubbed in place (§8.5) |
| `native_observations.data` | 0023:32-34 | Scrubbed in place (§8.2.2) |
| The answer | `conversation_messages` (0048) | Governed (§6, N4) |

**Tests:** §8.5's qualification rows, all required and none run, each with a canary in the prompt and the answer.

### 2.6 Settlement and accounting

**Today:**
- **Research metering** (`metered`, bridge:467-533) reserves before each call and settles in a `finally`. A failed settle is only logged ("the service reconciles it", :528-530).
- **The SQL behind it:** `reserve_research` (0029:36), `end_research_reservation` (0029:84), `runtime_research_reserve` (0029:131), `runtime_research_settle` (0025:518).
- **Receipts and capture:** `apply_runtime_receipt` (0012:464) and `capture_native_result` (0042:1724) have no reply branch.

**B-1 needs:**
- **A `conversation_reply` account in `metered`**, with `/v1/runtime/conversation/reserve` and `/settle`. These are held: bridge, routes, wire.
- **S2's ledger** (CON's candidate) is the SQL behind those routes. Its callers are held.
- **The reply branches** of `apply_runtime_receipt` (§8.2.1's table) and of `capture_native_result`. At `turn/end`, capture calls N4's publication, or Step B's refusal when the answer is empty, oversize or unstorable. A terminal receipt never settles: an open reservation becomes `uncertain`.

**Tests:**
- S2's suite exists (CON).
- **Held:**
  - §8.2.1's receipt-only cases;
  - a refused reserve: no call leaves;
  - a failed settle: `uncertain`, counted until an operator reconciles it;
  - capture calling the refusal with nothing published.

### 2.7 Cleanup: `retire` and the barrier

**Today:**
- No `retire` kind exists: the CHECK at 0012:75, `KINDS` in `protocol.ts:28`, no handler.
- dsh's session store deletes only in memory.
- Nothing per attempt is deleted.

**B-1 needs (held):**
- **The `retire` kind:** a CHECK-replacing migration, the wire, `protocol.ts`, and a bridge or supervisor handler.
- **`/v1/runtime/conversation/acknowledged`.**
- **§8.5's eight-condition barrier,** whose eighth condition is the relay `closed`.
- **The deletion:** delete without following links, verify, prune the maps, then answer `checked`. Anything else is `failed`, with the purge said pending.

**Tests** (held):
- each condition withheld in turn;
- a forced deletion failure;
- `retire` replayed;
- the canary scan.

### 2.8 Restart and withdrawal

**Today:**
- **The supervisor** restarts dsh with backoff (supervisor:227-248) and stops it with SIGTERM, then SIGKILL (:251-270).
- **The bridge** resumes native sessions from the journal at hello: `adopt` re-sends observations above `observedSeq` (bridge:923-955).
- **Tested** by `tests/integration/recovery.test.mjs:36-252` and `bridge.test.mjs:130`, `:161`.
- **Withdrawal paths:**
  - `conversation_withdrawn_from` (0048:243; S1's replacement at `con01-s1-reply-states.sql:44`);
  - N4's `conversation_source_out`;
  - Step B's refusal for an unpublishable answer.
- `conversation_cancel` is absent.

**B-1 needs (held):**
- **The restart sweep** of `<root>/replies/*`: a five-field lease, signalled only through a `pidfd`.
- **Hello lists reply bindings `stopped`**, which fences their relays. A request that was `running` ends `outcome_unknown`.
- **`conversation_cancel`:** epoch 2 and `stop`.
- **The order:** stop, then reap, then reconcile against the journal, then clean behind the barrier.

**Tests** (held):
- §8.5's outcome table, one test per row;
- the orphan case: SIGKILL on the parent;
- a restart while draining: nothing published;
- withdrawal mid-run, and while delivery is blocked.

## 3. The held files, and what binds each

| Held | Bound by |
|---|---|
| `apps/execution-host/src/runtime-supervisor.ts`, `scripts/runtime-host.mjs`, `scripts/lib/{profile,common,runtime}.mjs` | Q6, Q7 |
| The launcher (new) and `renderers/web/pdf/uml/*` reuse | Q7, Q9 |
| `packages/dsh-bundle/src/{control-bridge,session-events,transport,protocol,retained-queue,role-registry,index}.ts`, `cordis.patch.yml`; the bundle archive and its recorded digest (`config/runtime-unit.json:93-105`, `:21-28`; `dist` is built, not committed) | Q6, Q7, Q8 |
| `config/runtime-unit.json`, `config/specialists.json`, `config/roles.json`, a reply profile under `config/dsh/` | Q8 (LFE-00), D-4 |
| 0049 (option C, the reply branches of the six shared functions, `conversation_executions`, the `retire` CHECK) and any runner or number | Q6, Q10, Q11 |
| `apps/api/src/routes/runtime.ts` (`RUNTIME_ROUTES`) and `apps/api/src/app.ts` | the window (§2 of the binding map) |
| A04's `RuntimeWorkBinding`, the generated wire and contracts | whoever lands second (§2) |
| Grants of any CON function to a runtime role | none is proposed until a caller exists |

## 4. Qualification on the real pinned runtime

**What "real" means here:**
- the pinned dsh 0.2.0-rc.2 (`config/runtime-unit.json:7-43`), launched through `DSH_ENTRY` with the recorded artifacts checked (`profile.mjs:23-35`);
- the real supervisor, bridge and launcher;
- real PostgreSQL, the API and the worker. This is what `tests/integration/runtime-service.test.mjs` already does for goals (:51; it needs `SOPHIA_DISPOSABLE_DATABASE_URL`; CI runs it at `.github/workflows/ci.yml:100-101`).

**The model is the stub** (`tests/support/mock-llm.mjs:17`, `:84`).
- **What it can show:** the runtime's own behaviour (processes, files, copies, ordering, receipts, idempotency) and accounting arithmetic.
- **What it can't:** a stub result is never provider evidence. No route, price, usage figure, latency, model behaviour or vendor retention claim is drawn from it.
- **Provider evidence** comes only from a documented, bound route (D-4: none), under its own authorization.

### 4.1 The probes, before design depends on them

These are on the pinned runtime, in a disposable root, with no external or provider route and no network beyond loopback. Where a probe needs a model route for dsh to boot or answer, it uses only a labelled loopback stub route (`tests/support/mock-llm.mjs`, `mockRouteOverlay`), named as such in its record.
1. A copied installed profile in an empty `DSH_HOME`: does dsh boot offline? If not, `installInto`'s offline install per child: its time and its files.
2. Every file one stub reply writes, traced (`strace -f`, the `open*`, `creat`, `rename*`, `unlink*`, `mkdir*` and `link*` families): all under the child's home?
3. dsh's stdout and stderr on a canary reply, and on a crash: any message text?
4. SIGTERM mid-turn, and a normal completion: the exit statuses, what is journaled, what is flushed.
5. Anything written under `HOME` outside `DSH_HOME` (caches)?
6. The host: the Landlock ABI, `pidfd_open`, `RLIMIT_CORE`.

### 4.2 The qualification cases

These are §8.5's table, CC-0117–CC-0121's relay rows, and §2.1–§2.8's tests above, each labelled L1: required, not run. Each states its expected result before it runs. A failure is recorded as it is, never re-run away.

## 5. Order, once the holds lift

Nothing here is writable before Q6, Q7, Q10, Q11 and Q12 are answered. Then, each as its own pin with a fail-before, an after and the full gates:
1. 0049: option C, the reply branches, the claim, `retire`. Only after the owner's reconcile correction (§2.4.1, Q12).
2. The wire and contracts.
3. The bridge: the claim, the relay, `retire`, `metered`.
4. The supervisor and launcher: the reply child, the sweep, the profile.
5. Qualification, §4.

Each crossing first needs a fresh composition with the accepted base.
