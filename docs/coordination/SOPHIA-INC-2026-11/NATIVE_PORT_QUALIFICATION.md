# Native port qualification: INC01-CC-002 source state

Author: Claude Code `session_01FGXfrJoUMojmJSW3H7XfoG` (INC01-CC-002), base `953e5dc3`. Coordinator Codex
`01a1bd48-df51-7692-b30c-9e20f6eb4c81`; independent reviewer `/root/independent_review_app`. This records what the
source candidate maps and what stays unqualified. **No route, account, T3 install, provider or owner profile is
qualified by it.** Every live operation remains off. Plan: [owner-runner operations](../../plans/owner-runner-operations.md).
T3 sources: [SOURCE_MAP §2l](../../SOURCE_MAP.md).

## C02 operations → SophiaRunnerPort → T3 at `ade47301`

| C02 operation | Port | T3 call | State in this candidate |
|---|---|---|---|
| `create_or_attach` | `send` kind `create` | `t3_thread_launch` with `clientRequestId` `sophia:<operation id>` | Mapped, fake-tested; unqualified live |
| `submit_input` | `send` kind `input` | `t3_thread_send`, `mode: "queue"` always | Mapped, fake-tested; `steered`/`restarted` kept unknown as a violation |
| `request_control` (Stop) | `send` kind `stop` | `t3_thread_interrupt` with `stop: true` | Mapped; request, acknowledgement and observed settlement kept separate |
| `request_control` (Hold, Resume) | none | none at the pin | **Unsupported**: refused before any write, never emulated by Stop, attach, input or restart |
| `resolve_permission` | none | none at the pin | **Unsupported**: `t3_pending_request` answers `user_input` questions only and cannot approve a permission |
| answer a question | none | `t3_pending_request respond` exists | **Unsupported here**: its command id is random (no caller idempotency); needs a Sophia-owned journal and current-owner path first |
| `read_execution` / `collect_result` | `observe` | `t3_thread_read` (bounded pages) | Run status only; no transcript retrieval |
| `reconcile_operation` | `reconcile` | `t3_thread_read` by exact original ids | Read-only; never a resend; absence from bounded pages stays unknown |
| `qualify_instance` | none | none | Operator record (`qualify_owner_runner`) after a real owner-host qualification (INC01-CC-003) |

## The seven source corrections (PREFLIGHT-SOURCE-001): disposition

| Finding | Disposition in code |
|---|---|
| F01: questions are not permission approvals | `resolve_permission` and `answer_question` are named kinds refused as `runner_operation_unsupported` before any write (`0092` admission; API test). No generic pending-request response exists. |
| F02: top-level Stop is `t3_thread_interrupt(stop: true)` | The stop mapping always sets `stop: true` (`t3-port-mapping.ts callFor`). `interrupt_requested` is an acknowledgement (`received`, delivery `stop_requested`); settlement is only observed (no active run). Hold and Resume stay unsupported. |
| F03: read-only primitives exist below runtime modes | The launch uses `runtimeMode: approval-required`, but that is not counted as isolation: a qualification row requires `read_only` and is written only by the operator after a real profile proof. None exists. |
| F04: the orchestration capability cannot be disabled with `capabilities: []` | A qualification row must name `toolkit_scope` (`none_exposed` or `gateway_enforced`), which no source primitive establishes. This stays an **INC01-CC-003 blocker**: no row may be written until a supported disabled toolkit, or an enforced server/token/proxy scope, is demonstrated. |
| F05: identity depends on the exact namespace and encoding | Every segment is `encodeURIComponent`-ed as at the pin; launch ids use the JSON-pair SHA-256. The namespace and derived ids are journaled before the call and kept with the operation. A renewed session reconciles by the original namespace's ids and never resends (worker DB test). Operation ids are global uuids, so keys cannot collide across projects in one namespace. |
| F06: `t3_queue` has no `messageId`; absence in a page is not proof | Reconciliation matches only by exact `messageId` or launch thread id, never by text. A message past the bounded pages stays unknown (gateway test). |
| F07: 0053 requeues only a proved-absent DB enqueue | The runner path has its own possible-send boundary. Claims are scoped by owner and environment, and a foreign gateway answers `unknown`. *r1–r2 let the gateway journal's "no intent, or intent without a possible send" prove no send; r3 (R2-F01) removed that proof entirely: once possibly sent, an operation never returns to admitted.* |

The ACK's directory-wide claim that PR #501 does not touch persistence was wrong. PR #501 changes
`packages/persistence/src/artifacts.ts`, its test, and `packages/contracts/src/search-words.ts`. None of these files is
in this candidate.

## r2: the independent review's seven classes (INC01-CC-002-r1-SOURCE-PRE-PUSH-001, NEEDS_REVISION)

Each was repaired as a class in the current, in-process mechanisms. Each has a test that fails without its guard (the
r2 mutation evidence names the guard, the failing test and the restored file hash).

| Finding | Repair | Proven by |
|---|---|---|
| R1-F01 P1: an empty journal of the same profile proved "not sent" | Every journal has a durable `journalId` (its header). Prepare-send binds the operation to the journal it goes through (`gateway_journal_id`). The gateway sends, reconciles and observes only for that id, and SQL records answers only from it. Follow-ups are scoped to the runner's journal. *Partial in r2: the bound journal could still prove "not sent" from a restored prefix. Superseded by R2-F01 below.* | Gateway tests: replacement journal; emptied and recreated file. Worker DB tests: replaced journal; a foreign `not_sent` without an identity; `not_sent` after an identity. |
| R1-F02 P1: no exclusive journal writer | An `O_EXCL` owner-only lock file holding pid, host, process start time and a token. A live or unprovable holder is refused. A stale holder (gone on this host) is recovered by an atomic rename, losers refuse, and the stale lock is kept as evidence. Every append rechecks the token and the exact file length. One call per operation within the holder. | Journal tests (instances, stale, foreign host, unreadable lock, foreign writer); two real processes (hold contention, a four-process race, crash then stale recovery), with exact mutation counts. |
| R1-F03 P2: corrupt complete records folded into absence | Every record is validated: type, exact fields, types, contiguous `seq` from the header, operation id, the intent's digest over its checked envelope, identities, and legal transitions. Anything else stops the journal from opening. Only an unparsable final line without its newline is cut as torn. Files are 0600 and the directory 0700. | 18-case corruption matrix, torn-tail policy, modes. |
| R1-F04 P1: Stop settlement inferred from malformed or partial reads | Reads are decoded against the pinned schema for the exact `threadId`. A Stop settles only with `activeRunId === null`, a complete run list (`recentRuns.length === runCount`) and every run terminal, so `queued` (held) runs and unknown statuses stay unsettled. T3's `settled` marker is never read. In SQL, a Stop's acknowledgement (including `no_active_run`/`already_ended`) stays `received`; only a proven observation settles and ends the binding. | Gateway settlement tests (malformed, foreign, held queued, runLimit cut, unknown status, own run); worker DB test of an acknowledged Stop with a malformed read. |
| R1-F05 P1: Stop neither fenced nor stayed available | Admitting a Stop sets the binding `stopping` and denies, in the same transaction, the binding's admitted inputs that have not been claimed. Input admission and prepare-send refuse a stopping binding. A Stop needs no new-work allowance and consumes none. A second Stop answers the unsettled one. Hold and Resume stay unsupported. | Worker DB tests: Stop with a waiting input; an input claimed before the Stop; a Stop at an exhausted allowance and its dedupe. |
| R1-F06 P2: frozen revisions and expiry not rechecked | Prepare-send compares the goal revision and epoch, the member revision and role, and the resource, connection and qualification revisions. A connection past `expires_at` is refused at qualification, admission and send. | Eight fence tests, each on a fresh fixture asserting its own branch, with zero native calls. |
| R1-F07 P1: a follow-up could change account, profile or qualification | An input or Stop is admitted only if the current route equals its create's frozen lineage (qualification id and revision, connection and revision, resource revision, account, environment, pin, native project, profile). The gateway host profile names its account and profile, and follow-ups must match their create's journaled envelope. A rotation denies the old binding's queued work and never takes a second reservation. | Worker DB rotation test; gateway lineage test. |

## r3: the second review's three classes (INC01-CC-002-r2-SOURCE-PRE-PUSH-001, NEEDS_REVISION)

Review SHA-256 `3e46e92601579aa5c98228f9567df69f002f985c6c1ebb3cd228c450684b70b4`. Each class was repaired as a class,
with the rules written into the [plan](../../plans/owner-runner-operations.md) first. Each guard has a test that fails
without it (r3 mutation evidence).

| Finding | Repair | Proven by |
|---|---|---|
| R2-F01 P1: a restored valid prefix with the same `journalId` proved "not sent", and a second launch followed under a new namespace | There is no proof of no send any more. `not_sent` is removed from the port. The gateway answers `unknown` for an operation it holds no possible send for (no record, or an intent alone), and never sends an operation it holds any record of. The journal allows one intent per operation. SQL has no `not_sent` transition and refuses such an answer as invalid: a possibly-sent operation never returns to `admitted`. A crash after claim and before prepare-send still requeues: SQL's own proof, since no possible send was committed. | Gateway: absent record and intent alone stay unknown, zero calls; restored header-only and intent-only prefixes under a renewed namespace stay unknown, one launch. Worker DB (real service, disk journal, fake T3): prepared but never handed over stays unknown with its reservation; restored header-only and intent-only prefixes after a lost receipt the service never recorded, under a new namespace, give one launch and one thread; `not_sent` refused raw by SQL from any journal, with or without an identity. Siblings kept: crash before prepare requeues and sends once; a gateway restart reads back its receipt. |
| R2-F03 P2: an intent's identities were shape-checked only | An intent's identity must equal `deriveIdentity(envelope, identity.namespace)` exactly. An input or Stop intent must target a create journaled earlier in the same journal, with a received answer, on that receipt's thread, with every lineage field of the create. An answer carries its intent's identity, and its kind fits the operation: receipt deliveries per kind, violations for inputs only, `settled` for Stops only, with identity. Checked on load and before each append. | A 21-case journal matrix, each case asserting its own reason: substituted, re-namespaced or truncated identities; another operation's derivation; foreign, receipt-less or non-create targets; thread and four lineage moves; misfit answers. Append-time refusal writes nothing. The valid history loads and reopens. |
| R2-F08 P1: rollback switches also disabled a qualified Stop | Admissions off refuses only `create`, `input` and the unsupported kinds. A Stop goes through the same database admission with all its checks. The claim takes a required `p_new_work` flag; with sends off, the worker claims only `runner.stop` rows. Nothing else changed: revoked or expired routes are still refused, Hold and Resume stay unsupported, an acknowledgement does not settle, and fences, dedupe, unknowns and reservations are kept. | API DB: create, input and hold refused under off; the Stop is admitted, its replay and second Stop answer the same operation, and the binding is `stopping`; another editor, an outsider and a foreign project are refused, and a revoked route answers `runner_unqualified`; on a database without 0092 a Stop answers `projection_unavailable`. Worker DB with sends off: zero launch and zero input, one interrupt, settlement only on proof; the waiting create is never claimed; a Stop revoked after admission is denied at prepare-send; another owner's Stop is never claimed. |

Also in r3: the plan's crossing rows are readable Markdown again, and the two-process test's report helper is bounded.
It rejects, and kills its child, on an early exit, an error, a line that is not a report or a 30 s timeout; two tests
prove it.

Still open after r3, and named rather than emulated:
- **Manual settlement gap (R2-F01).** An operation possibly sent, whose receipt is in neither SQL nor the journal that
  answers, stays `unknown` with its reservation. This includes one prepared and never handed to its gateway, which
  was never sent. No automatic retry or proof exists; an operator settles it from the native side.
- **No local no-resend guarantee in the gateway.** A gateway whose records of an operation were rolled away entirely
  cannot tell a first send from a forgotten one. That guarantee is SQL's: `possible_send` is one-way.

Still open after r2, and named rather than emulated:
- An operation bound to a lost or replaced journal stays `unknown`. There is no automatic replacement or retry; an
  operator settles it.
- A Stop's admission still needs the route's current qualification. A Stop on a revoked or expired route is refused
  rather than sent under a route that is no longer qualified (settlement under revocation is a policy for INC01-CC-003).
- The lock is per host. A journal shared across machines is out of scope. Where the process start time cannot be read
  (non-Linux), a live pid is always treated as a live holder.
- Source manifest, repository base, settings and source withdrawal are not represented. (INC01-CC-005, 0096,
  represents them in source; see the section below.)

## Live blockers for INC01-CC-003 (not resolved here)

1. Owner-host transport and pairing: an authenticated, owner-bound channel from the gateway host to Sophia, and the
   worker's per-runner routing to it. Until then `SOPHIA_OWNER_RUNNER_DISPATCH` accepts only `off`.
2. T3 install and version provenance on the owner host. Its session namespace must be observed, not assumed.
3. F04: the scope of T3's injected orchestration toolkit for Sophia-launched threads.
4. A real read-only profile: filesystem sandbox, tool availability, network and GitHub effects, and no unrelated
   history. Prompt wording and preapproval lists do not count.
5. Native account, billing and quota provenance, plus model and effort observation. T3 exposes none of them.
6. That T3's typed failure codes listed as definite refusals really are pre-effect. Until confirmed live, they are
   treated as refusals only in the fake.
7. A bounded live read-only task through Sophia with reconnect and Stop evidence, which is the actual INC-01 case.

## INC01-CC-005: source authority in source (0096, A50): what is and is not shown

**Shown in source, against real disposable PostgreSQL and the FakeT3:**

- **Payloads.** A create's and each input's instruction is an owner-private source.
- **Selected project sources and closure.** They are frozen with their hashes and revisions, and checked again
  through `source_closure`.
- **Base and settings.**
  - A requested 40-hex base and `read_only` write scope are frozen.
  - Requested settings must sit inside the qualification's operator-declared source policy.
  - The pinned launch shapes are `workspaceStrategy {type:"worktree", baseRef}` and
    `modelSelection {instanceId, model, options:[{id, value}]}`. Option ids are per provider: `reasoningEffort` (Codex)
    and `effort` (Claude).
- **Content-free v2 envelope.** The instruction travels only as a hash-checked payload, handed to the owner host only
  with a granted GO.
- **Rechecks.**
  - Withdrawal and revisions are rechecked at prepare-send, delivery and GO.
  - Expiry is judged at the actual time after every lock wait (INC01-30813-EXPIRY-F01).
- **After a possible send.** Nothing is undone.

Pinned facts used (`pingdotgg/t3code` `ade473018d32003658b7d38693e083ee2e314bd8`):

| File | Lines | SHA-256 |
|---|---|---|
| `packages/contracts/src/orchestrationV2.ts` | 654-674 | `9f791f7e75031f56c36fddabb2529913c2c4f1f539415037f9d7b9355dc597fb` |
| `packages/contracts/src/modelSelection.ts` | 9-50 | `54832cd6d41fae198eca90fe58cfceab4f6b97572c90e32cbfff703b584b434a` |
| `packages/contracts/src/providerInstance.ts` | 7-22 | `ade67de404651ff6c5373ba1b0359f598c06d49f5e4de2aa77ebf396ab91233a` |
| `packages/contracts/src/orchestratorMcp.ts` | 501-525 | `a1a1f5ffc84c5cc151947db666069a440f1f4f15c96cdd6dabfbc0b9bae826d1` |
| `apps/server/src/mcp/toolkits/project/tools.ts` | 124-164 | `ccaba4a185d959ce0c3c0b812f23cbc5196e21dfa87349f06b15904b66bd0d6c` |
| `apps/server/src/mcp/toolkits/project/handlers.ts` | 146-236, 277-284 | `0d7027332a51cf6d8e23222484daf50be263e61f8b2c665ccbe66dbdd4bb0284` |

**Still unqualified:**

- **Base.** That T3 checks out exactly the requested base. Its pre-launch check is permissive and nothing echoes the
  base.
- **Read-only enforcement** and the toolkit scope (F03, F04).
- **Model and effort actually used.** The launch's `modelSelection` echo is the thread's stored selection, and a run's
  `model` is a label. Neither is recorded as an observation: accepted, reported and observed stay unknown.
- **Catalog values.** A real profile's effort values.
- **Live routes.** The owner profile, account, billing and sign-in, and any live route.
- **Native copies.** The privacy of a native copy once delivered: it cannot be recalled.
- **Release isolation.** Operational release isolation.

Admission and dispatch stay off.
