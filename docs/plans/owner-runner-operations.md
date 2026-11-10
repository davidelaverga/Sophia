# Owner-runner operations: one durable path to an owner's native session

> 2026-11-09 · INC01-CC-002 (SOPHIA-INC-2026-11, INC01-S1 / C02). Coordinator Codex
> `01a1bd48-df51-7692-b30c-9e20f6eb4c81`, author Claude Code `session_01FGXfrJoUMojmJSW3H7XfoG`, base
> `953e5dc3`. Contract amendment A47, migration 0092. Exercised only through a **fake** T3 transport: no live T3,
> account, provider or production change. All real native admission and transport stay off.

## What this is, and is not

An owner admits a bounded operation on **their own** executor resource (an `executor_resources` row with a
`codex-native` or `claude-native` harness and its `execution_connections` row). Sophia persists it with a command and
an outbox row in one transaction; the worker claims it, rechecks current authority, marks the possible send, and passes
it through one `SophiaRunnerPort` gateway that journals to disk before it calls T3. Lost answers reconcile by the
original identities. The owner reads a truthful retained status.

It is not a qualified native connection. A route is usable only with an operator-recorded qualification row
(`owner_runner_qualifications`), which no request can create. None exists in production, so every admission there is
refused before a write.

### Switches, and what OFF keeps

- **API, `SOPHIA_OWNER_RUNNERS`** (`off` by default, or `admit`) gates **new admissions only**. The routes are always
  served: with admissions off, the owner still reads every operation already admitted, its state, its uncertainty and
  its native identities. Rolling back to off never hides admitted, unknown or settling work, and reading it needs no
  extra setting.
- **Never installed is not empty.** On a database without 0092 the reads answer `projection_unavailable` (503), never
  an empty list. `/ready` requires 0092 only with `admit`, so an API with admissions off stays ready on an old database.
- **API, Stop under admissions off (r3, R2-F08).** Off refuses new work (`create`, `input`) and the unsupported kinds.
  A `stop` is not new work: it is still admitted, through the same database admission with every one of its checks
  (owner or editor/admin, the binding's own received create, the route's current `stop` qualification and its frozen
  lineage, expiry, idempotency). Off adds no authority and removes none.
- **Worker, `sends`.** The dispatcher's sends of new work can be off: it then claims no `runner.create` or
  `runner.input` row, while it still claims and sends already-admitted `runner.stop` rows (r3, R2-F08), maintains
  leases, reconciles unknown operations by their original identities and observes received ones until they settle,
  keeping their account reservations. In production `SOPHIA_OWNER_RUNNER_DISPATCH` accepts only `off`: there is
  no owner-host transport yet, so nothing was ever sent and nothing waits to be reconciled. INC01-CC-003 supplies the
  owner-host transport, pairing and profile qualification.

### One runner per owner and environment

A dispatcher serves one owner runner: one owner's gateway bound to one T3 environment. It claims, reconciles and
observes only that owner's operations on that environment (`claim_owner_runner_outbox` and `owner_runner_followups`
take both). The gateway answers reconcile and observe only for an envelope within its own profile whose digest it
journaled. For anything else it answers `unknown`: an empty journal elsewhere proves nothing. Found by the worker DB
test in r1: a reconcile routed to another owner's gateway had answered `not_sent` and requeued a possible send. Since r3
no gateway answers `not_sent` at all (R2-F01 below).

## r2 repairs (independent review INC01-CC-002-r1-SOURCE-PRE-PUSH-001, NEEDS_REVISION)

Seven classes, each repaired as a class. They are rules of this plan, not notes for later.

1. **R1-F01. Only the bound journal speaks for an operation.** Each journal starts with a header carrying its
   `journalId`, written once when the file is created. Prepare-send records the journal it is about to use
   (`gateway_journal_id`). The gateway sends, reconciles and observes only for that `journalId`. A replaced, recreated,
   empty or other journal answers `unknown`, however well its profile matches.
   - *Superseded in r3 (R2-F01):* r2 still let the bound journal prove no send by the absence of a possible-send
     record. A restored valid prefix keeps the same `journalId`, so absence proves nothing. No journal proves no send
     now, and SQL has no `not_sent` transition.
   - Original native identities and reservations are never cleared by an uncertain answer.
2. **R1-F02. One writer per journal, across processes.** Opening a journal takes an exclusive lock file created with
   `O_EXCL`, owner-only. The lock holds pid, host, process start time and `journalId`.
   - A second process, or a second instance in the same process, is refused while the lock's holder is alive.
   - A stale lock (holder process gone on this host) is recovered by an atomic rename, so only one recoverer wins.
   - A lock held from another host is never presumed stale.
   - The holder rechecks the file's length before each append: a write it did not make fails closed.
   - Within the holder, one call per operation at a time.
3. **R1-F03. Every complete record is validated.**
   - Checked: known type, required fields and their types, contiguous `seq` from the header, the operation id, the
     intent's digest over its checked envelope, and the identities.
   - Allowed transitions: intent → possible send → one answer, or unknown notes. A refusal comes only before any
     intent. (r2 allowed a re-intent before a possible send; r3 removes it, since the gateway never sends an operation
     it holds any record of.)
   - Anything else stops the journal from opening (fails closed).
   - Only a final line without its newline that does not parse is cut as torn. A complete line that does not parse is
     corruption.
   - New journal, lock and directory files are owner-only (0600 / 0700).
4. **R1-F04. An acknowledgement is never settlement.** A read is used only after it is decoded against the pinned
   schema: `thread.threadId` equal to the target, `activeRunId`, `runCount`, `recentRuns`, `items`, `hasMore` and
   `nextPosition`. Decisions:
   - A Stop settles only on positive evidence: the exact thread, `activeRunId === null`, a complete run list
     (`recentRuns.length === runCount`), and every run in a known terminal status. A `queued` run is not active at T3
     but is still unsettled work.
   - A create or input settles only when its own run is in that complete read with a terminal status.
   - Malformed, foreign, truncated, unknown-status or bounded-absence reads stay unknown.
   - T3's `settled` flag is a user-interface marker at the pin and is never used as evidence.
   - In SQL, a Stop's `no_active_run`/`already_ended` acknowledgement leaves the Stop `received`. Only a proven
     observation ends the binding.
5. **R1-F05. Stop fences at once and stays available.**
   - Admitting a Stop sets the binding `stopping` and denies, in the same transaction, the binding's inputs that were
     admitted but not yet sent.
   - Input admission and every prepare-send refuse a binding that is `stopping`, `settled` or `lost`.
   - A Stop needs its route's `stop` qualification but no new-work allowance, and never consumes or refunds any.
   - *Superseded in integrated r2 (PR505 F02):* a second Stop under a fresh key no longer answers the unsettled one.
     It is refused, unless a late input overtook the first Stop (see below).
   - Hold and Resume stay unsupported. A stopped binding is never reopened.
6. **R1-F06. Every frozen revision is rechecked.**
   - Prepare-send compares the goal revision and epoch, the member revision and role, and the resource, connection and
     qualification revisions.
   - A connection whose `expires_at` has passed counts as unauthenticated at qualification, admission and send.
   - Source manifest, repository base, settings and source withdrawal are **not represented** in this slice. They are
     an explicit open boundary that live source-backed intake must supply or refuse. Goal epoch is not source
     withdrawal.
7. **R1-F07. A follow-up never changes its binding's route.**
   - An input or Stop is admitted only if the resource's current qualification is the one its create used, at the same
     revision, connection and connection revision, account key, environment, adapter pin and profile.
   - Otherwise it is refused: no silent move to another account, profile or allowance, and no second reservation.
   - The gateway compares the follow-up's account, profile and qualification with its create's journaled envelope, and
     its host profile names its account and profile.
   - The original operations keep reconciling under their original lineage.

Limits that remain: no owner-host process or real lock across machines (a lock is per host); a pid reused within the
same process start time cannot happen on Linux (start time is compared), and elsewhere the start time is unknown, so
an unprovable stale lock is refused rather than taken.

## r3 repairs (independent review INC01-CC-002-r2-SOURCE-PRE-PUSH-001, NEEDS_REVISION)

Three classes, each a rule of this plan.

1. **R2-F01. No journal, and nothing else, proves that a possibly-sent operation was not sent.**
   - The `not_sent` answer is removed from the port. A journal's `journalId` shows which file it is, not that its
     history is complete: a restored valid prefix (header only, or an intent without its possible send) keeps the same
     id, parses and validates. Absence in it proves nothing.
   - Once Sophia commits `possible_send`, an operation never returns to `admitted`. Without a recorded receipt it ends
     `unknown`: its outbox row `outcome_unknown`, its command `outcome_unknown`, its account reservation held.
   - The gateway answers `unknown` for an operation bound to it that it has no possible send for: no record, or an
     intent alone. It never sends an operation it holds any record of, so a second `send` of the same operation is
     reconciled, not sent. A gateway whose records of an operation were rolled away entirely (a header-only prefix)
     cannot tell a first send from a forgotten one, and nothing local can. That guarantee is SQL's: `possible_send` is
     one-way, so Sophia never asks for a second send of the same operation.
   - SQL's record function has no `not_sent` branch. An answer of that kind is refused as invalid (`22023`) and changes
     nothing.
   - **Named gap.** An operation possibly sent, whose receipt is in neither SQL nor the journal that answers, stays
     `unknown`. No automatic retry or proof exists, and the namespace it would be sent under may have changed. An
     operator settles it from the native side. This includes a crash after prepare-send and before the gateway call,
     which was never sent: the price of never trusting a journal's completeness.
   - A crash after claim and before prepare-send commits is unchanged: the operation is still `admitted`, so the lease
     expiry requeues it. That proof is SQL's own (no possible send was ever committed), not a journal's.
2. **R2-F03. A journaled identity must be the one its envelope derives.** Checked when a record is appended and again
   when the journal is loaded:
   - an intent's identity equals `deriveIdentity(envelope, identity.namespace)`, the pinned derivation, exactly: command,
     message and thread ids;
   - an input or Stop intent targets a create in the same journal, journaled earlier, with a received answer. Its
     thread is that receipt's thread, and every lineage field is the create's own: owner, project, resource, binding,
     qualification and its revision, adapter pin, environment, native project, profile and its revision, account;
   - an answer carries its intent's identity, and its kind fits the operation's kind:
     - a create's receipt is `started`;
     - an input's receipt is `started` or `queued`;
     - a Stop's receipt is `stop_requested`, `no_active_run` or `already_ended`;
     - a violation is an input's alone;
     - `settled` is a Stop's alone, with its own identity.

   A complete record that breaks any of these stops the journal from opening. A torn final line is still cut, and a
   valid restart still loads.
3. **R2-F08. Turning new work off keeps the qualified Stop.** Admissions off and worker sends off stop `create` and
   `input` only.
   - A Stop is admitted and dispatched under them with every existing check: owner or editor/admin, the binding's
     received create, the route's current `stop` qualification at the frozen lineage, expiry, revisions, idempotency
     and same-binding dedupe.
   - The claim function takes an explicit `p_new_work` flag. With it false, only `runner.stop` rows are claimed. Nothing
     is admitted, claimed or sent as new inference.
   - Unchanged:
     - a Stop on a revoked, expired or rotated route is still refused (no revocation policy is invented here);
     - Hold and Resume stay unsupported;
     - an acknowledgement still never settles;
     - Stop fences, unknown effects and reservations are kept.

## Integrated r2 repairs (PR #505 automatic review, confirmed by INC01-CC-002-integrated-r1-SOURCE-FINAL-001)

The published head `db414c02` is never rewritten; these repairs are one child commit of it.

1. **F01 (P1). A Stop settles only after every earlier input has converged.**
   - **The defect.** An input sent before a Stop, and still `possible_send` or `unknown`, may reach T3 after the
     interrupt. T3's `thread.stop` at the pin stops the active run and holds queued ones; it does not refuse a request
     that arrives later. So "no active run now" proves nothing about a request still in flight.
   - **The barrier.** A Stop (`received`, or `unknown` with its delivery unproven) settles, and ends its binding, only
     when both hold:
     - no input of its binding is `admitted`, `possible_send` or `unknown`;
     - a fresh, decoded, complete read shows no active and no unsettled run.
   - **Stale evidence.** The fresh read must also post-date the inputs' last convergence. The follow-up query hands
     the dispatcher a barrier token over the binding's inputs (each id and whether it has converged). The dispatcher
     returns it with the observation, and SQL refuses a settlement whose token no longer matches.
   - **No cached settlement.** A gateway's journaled `settled` answer is a cached past read. SQL no longer settles a
     Stop from it. The dispatcher answers it with a fresh observation of the same Stop, recorded with the token.
   - **While blocked.** The Stop stays unresolved: still `received` (or `unknown`), its binding `stopping`, its account
     reservation held. Its reason names the wait, so the pending safety status stays visible.
   - **A late landing.** If an earlier input lands after the Stop was sent (its receipt recorded after the Stop's
     possible send), its run may have started after the interrupt. The Stop's reason says so, and the Stop is
     **overtaken**. The owner may then Stop again: a new Stop operation, admitted with every existing check and
     dispatched as usual (also with admissions or sends off). Its interrupt reaches the late run. Both Stops then
     settle on proof.
   - **Never.** Nothing replays the unknown input, opens a new session or account, releases its commitment, or claims
     a T3 guarantee the pin does not give. An input that stays `unknown` (lost for good, or a violated delivery) keeps
     the Stop unresolved, for an operator.
2. **F02 (P2). A successful admission always binds its key.**
   - A Stop under a fresh key, while its binding has an unsettled Stop that was not overtaken, is **refused** (40001,
     `invalid_state`). The refusal names the pending Stop, and nothing is written, so the refused key stays unbound.
   - The same key replays its own receipt (a project-and-owner-scoped key lookup comes first), before and after
     settlement and after a restart. Another request under it conflicts.
   - A refused key may later carry another request: a refusal binds nothing.
   - Concurrent Stops serialize on the project lock: one is admitted and the others are refused. There is one actual
     Stop, one native interrupt and no allowance use.
3. **F03 (P2). Maintenance takes locks in the recorder's order.**
   - Every writer takes the project first, then the operation and outbox rows. Maintenance now selects candidates
     without locks, then for each one locks its project (`SKIP LOCKED`), then its rows (`SKIP LOCKED`), and rechecks
     the candidate's condition under those locks.
   - A busy project or row is skipped and maintained on a later pass, never waited on. So maintenance can deadlock
     neither with a recorder nor with another maintainer.
   - The bound and the one-way unknown semantics are unchanged.

### Integrated r2 crossings

| Crossing | Rule |
|---|---|
| Input in transit (delayed before effect, response lost); run 1 ends; Stop sent; a read shows no active run | The Stop stays `received`, its binding `stopping`, its reservation held, its reason naming the unconverged input |
| That input lands later, after a reconnect or a namespace renewal | Reconciled by its original identities to `received`. The Stop is marked overtaken and stays unsettled while the late run is active |
| Owner Stops again after the overtaking | A new Stop is admitted (also with admissions or sends off), one interrupt is sent, and both Stops settle on proof |
| Earlier input stays `unknown` for good | The Stop never settles automatically; it stays visible for an operator |
| Earlier input `received` (queued or started) before the Stop | No barrier; the Stop settles when the complete read shows every run terminal |
| Gateway answers a cached `settled` for a lost Stop | It is not settlement; a fresh observation with the current token is required |
| Observation made, then an input converges before it is recorded | The token changed: no settlement on that observation |
| Second Stop under a fresh key, first not overtaken | Refused (`invalid_state`); no row and no key binding |
| Same-key Stop retry, before or after settlement | Its own receipt |
| Recorder holds the project while maintenance runs | Maintenance skips that project. No 40P01; the recorder completes; the next pass maintains the rest |

## Integrated r3 repair (PR #505 automatic review on `7629c104`, confirmed by INC01-CC-002-integrated-r2-SOURCE-FINAL-001)

The published head `7629c104` is never rewritten; this repair is one child commit of it.

**F01 (P1). A run identity that is missing or malformed is never a receipt.**

- **The defect.** The read decoder turned a missing, non-string or empty `runId` into null and still indexed the exact
  message. Reconcile then journaled `received`/`started` with no run, and the direct send path accepted the same.
  SQL counted that input as converged, so a Stop and its binding settled while the original request was still in
  transit. When it landed, it started a run.
- **The pinned schema.** At `ade47301`, `RunId` is a trimmed non-blank string, and the shapes that carry it are:
  - a timeline item's `runId`: required and nullable;
  - a send result's `runId`: required and never null;
  - a launch result's `runId`: nullable, because an idle launch starts no run;
  - an interrupt result's `runId`: nullable.
- **Rules.**
  - **Decoding.** An item whose `runId` is missing, not a string, empty or blank, or whose non-null `messageId` is
    blank, makes the whole page no evidence. Items with an explicit null `runId` keep their place: unrelated nullable
    items stay valid.
  - **Reconcile.** A matched target message whose `runId` is null proves no accepted run. A create or input stays
    `unknown`, nothing is journaled as received, and SQL's barrier stays up.
  - **Direct receipts.**
    - An input's receipt needs a non-blank `runId`; otherwise `unknown`, not a violation.
    - A create's receipt needs one too: Sophia always launches with a message, so a null run proves no accepted
      work. It stays `unknown` and is reconciled.
    - A Stop acknowledgement keeps its nullable `runId`, but a present one must be non-blank.
    - Malformed data from a possible send is always `unknown`: never refused, rejected or "not sent".
  - **The gateway's own check.** Before it journals or returns any answer, from a send or a reconcile, the gateway
    checks the receipt: a create or input receipt needs a non-blank run, a Stop receipt a null or non-blank one.
    Anything else becomes `unknown`. So an invalid reply cannot pass merely because the mapping normally validates.
  - **Unchanged.** Exact thread, message and namespace matching; the barrier token; the pending and overtaken Stop;
    held commitments; the Stop under admissions off; the lock order; the fresh-key refusal; the bounded process test.
- **Crossings.**

| Crossing | Rule |
|---|---|
| Input still in transit; a read names its exact message with `runId` missing, null, a number, an object, empty or blank | Input stays `unknown`; Stop and binding stay unsettled; the request lands later and is reconciled to its real run, once |
| Same request; the send itself answers `delivery` started or queued with such a `runId` | `unknown`, not received; the same late landing |
| A valid non-blank run for the exact message (read or send) | `received`, as before |
| An unrelated item with null `messageId` and null `runId` on the page | Still a valid read |
| Stop acknowledgement with `runId: null` (`no_active_run`) | Still an acknowledgement |
| A create answered with a null or malformed `runId` | `unknown`, then reconciled by its exact message |

## Records (0092, additive)

| Record | Anchored on | Holds |
|---|---|---|
| `owner_runner_qualifications` | `executor_resources` (native harness), its `execution_connections` row | Operator evidence that one owner's route/profile ran: adapter pin, T3 environment and project refs, read-only profile id/revision, toolkit scope, account key, allowed operations, cumulative allowance (operations, never money), expiry, revocation |
| `owner_runner_operations` | `goals`, `work_attempts`, `execution_bindings`, `commands`, `outbox`, the qualification | One operation: kind, frozen identity (goal revision and epoch, member, resource, connection and qualification revisions, profile, account key), payload digest, state, native identities and receipt |
| `owner_runner_reservations` | the account key, one binding | The account's one active assignment, across projects and aliases |

A `create` makes the attempt and the binding (`runtime_unit_id` `owner-runner:t3`, `continuation_owner`
`native_goal`). The binding starts `launching`, never `created`: the dsh cleanup path settles a `created` binding with
no runtime command as "no native session to fence", which would falsely settle a possible T3 send. `native_goal` keeps
goal steer/resume from fanning out dsh rows to it. Outbox destinations are `runner.create`, `runner.input`,
`runner.stop`: not `native.*`, so the dsh claim (`claim_runtime_outbox`) and its reconcile (0053) never take them.

## Operation states

| State | Meaning | Next |
|---|---|---|
| `admitted` | Kept with its command and outbox row; nothing sent | `possible_send`, `denied` |
| `possible_send` | Current authority rechecked, reservation held (create/input), journal recorded, committed before the gateway is called | `received`, `rejected`, `unknown`; never back to `admitted` (r3) |
| `received` | T3 answered with its identities (`started`/`queued`; for a Stop any acknowledgement, including `no_active_run`) | `settled` only on a proven observation |
| `rejected` | T3 gave a typed refusal: nothing was accepted | terminal |
| `denied` | Sophia refused before any send (authority, qualification, goal fence, superseded) | terminal |
| `unknown` | A send may have happened and nothing proves either way | `received`, `rejected`, `settled`, or stays for an operator; never back to `admitted` |
| `settled` | Proven: its run is terminal in a complete read, or (Stop) the thread has no active and no unsettled run | terminal |

Projection words: waiting for runner/authority (`admitted`, with the deferral reason), sending (`possible_send`),
received/queued (`received`), outcome unknown, refused, denied, settled. Received is never accepted, applied or verified.

Unsupported kinds are named and refused before any write: `hold`, `resume`, `resolve_permission`, `answer_question`.
`stop` is `t3_thread_interrupt(stop: true)`; its request, T3 acknowledgement and observed settlement are separate.

## Crossings

| Crossing | Rule |
|---|---|
| Same key, same request | Prior receipt; nothing new |
| Same key, other request | `idempotency_conflict`; nothing written |
| Not the resource's owner, not an editor/admin, foreign project/resource/goal/target | Refused; foreign ids answer like missing ones |
| No active, unexpired qualification for the resource, operation not in it, revisions moved, allowance used | `runner_unqualified`, nothing written |
| Two workers claim | The outbox lease admits one; the other sees no row |
| Revocation, membership loss, resource/connection change, goal Hold/Stop between claim and send | Prepare-send denies; nothing reaches the gateway |
| Account busy with another binding | Deferred (back to pending, available later); nothing sent |
| Crash after claim, before prepare commits | Lease expires; the operation is still `admitted`, so it is requeued |
| Crash after prepare, before or during the gateway call | `unknown`. Reconcile asks the bound journal: a journaled possible send is read back by its exact identities; no record, or an intent alone, stays `unknown` (r3: never `not_sent`); any other journal answers `unknown` |
| Restored valid journal prefix with the same `journalId` (header only, or intent only), after a native accept whose receipt SQL never recorded | `unknown`, reservation kept; not requeued, not resent under the old or a new namespace; one native call in all (r3, R2-F01) |
| A complete intent whose identity is not its envelope's derivation, or an input/Stop whose target or lineage is not its journaled create's | The journal does not open, or the append is refused; nothing is sent or proved (r3, R2-F03) |
| Admissions off, owner asks a Stop of a received binding on its still-qualified route | Admitted; create and input refused `runner_admission_disabled` (r3, R2-F08) |
| Worker sends off, Stop admitted | The Stop is claimed and sent (one interrupt); admitted creates and inputs stay unclaimed, zero launches or sends (r3, R2-F08) |
| Admissions off: Stop by a non-owner viewer, on a foreign project, or on a revoked route | Refused as before (`forbidden`, not found, `runner_unqualified`); off grants nothing |
| Journal replaced, emptied, recreated or unavailable | `unknown`, identities and reservation kept; never `not_sent`, never a fresh-namespace resend |
| Second process or instance on the same journal | Refused by the lock while the holder lives; a dead holder's lock is recovered by one process, which then reloads and reconciles, never resends |
| Complete but invalid journal record | The journal does not open; nothing is sent or proved |
| Stop admitted while inputs wait or race claim-to-send | The binding is `stopping` at once; waiting inputs are denied and none crosses the transport |
| Stop at exhausted new-work allowance | Admitted (the route's `stop` qualification still needed); allowance neither used nor refunded |
| Goal revision moves without its epoch; connection expires | Denied at the next prepare-send; zero native calls |
| Requalification, account, connection or profile rotation under a live binding | Its follow-ups and Stops are refused; the old binding's original operations still reconcile |
| Native accept, lost answer | Host journal has the receipt; reconcile returns it |
| Gateway restart | Journal reloaded (torn tail cut); the same operation is answered from it, never sent again |
| Namespace change | Derived identities stay the originals; reconcile reads by them; never resent under the new namespace |
| Absent from a bounded read | Stays `unknown`; absence is not proof |
| `steered`/`restarted` delivery when `queue` was asked | `unknown` with the violation named and journaled as final: a later read never turns it into a receipt; reservation kept |
| Lease expiry, browser close, observer timeout | Reservation kept while any operation of the binding is unsettled |
| Admissions off after admission | New create/input admissions refused (`runner_admission_disabled`); a qualified Stop is still admitted; the owner's reads, the unknown state and the original identities stay |
| Worker sends off after a possible send | No new create/input claim or send; admitted Stops are still sent; reconciliation and observation continue by the original identities; the reservation is kept until settlement |
| Database without 0092 | Reads answer `projection_unavailable`; never an empty list |
| Reconcile through another owner's or environment's gateway | Not routed there (claims and follow-ups are scoped); a gateway asked anyway answers `unknown` |

## T3 mapping (pin `ade47301`)

- `create` → `t3_thread_launch` with `clientRequestId` `sophia:<operation id>`. T3 derives
  `mcp:launch:<sha256(JSON.stringify([namespace, key]))>` as command, thread and message id.
- `input` → `t3_thread_send`, `mode: "queue"` always. Command and message ids are
  `command|message:mcp:<enc(namespace)>:thread-send:<enc(key)>`, each segment `encodeURIComponent`-ed.
- `stop` → `t3_thread_interrupt` with `stop: true`.
- Reconcile and observe use `t3_thread_read` only. No other tool can be built, and no shell, URL or tool name is taken
  from a request.

## Not done here

No owner-host process, pairing, native sign-in or account provenance; no qualification of the real read-only
profile or of T3's injected orchestration toolkit (finding F04): until that exists, no qualification row may be written.
No Studio change. Hold, Resume, permission approval and question answers stay unsupported.
