# Owner-runner source authority (INC01-CC-005)

SOPHIA-INC-2026-11, migration `0096_owner_runner_source_authority.sql`, contract amendment `A50`. It builds on the
owner-runner operations of `0092` (A47, [owner-runner-operations.md](owner-runner-operations.md)) and the owner-host
channel of `0093` ([owner-host-transport.md](owner-host-transport.md)). Development base: host r6 `09b09413` (tree
`b08e9628`), which is **source-blocked, not accepted**. Publication must retarget onto the root-selected accepted
repaired host and pass the independent whole-source gate.

This slice binds what a native create or input may read, and where and how it runs, to Sophia's records. Then it
rechecks that binding at every crossing where an effect or a disclosure can still be stopped. It qualifies nothing
live: admission flags stay off, no host route is mounted and no real provider is called.

## 1. What a v2 operation freezes

Every new **create** and **input** is version 2. A **Stop** stays version 1: it carries no content and is exempt from
source authority. It keeps its existing qualified-route authority, and no revoked-route exception is invented.

| Record | Where | Notes |
|---|---|---|
| The owner's instruction (create: message and title; input: message) | One new **owner-private source** per operation: `source_objects` with `scope='private'`, `owner_id` the operation owner, `eligible=false`, `state='ready'`; body in `source_texts` | Written by `owner_runner_put_private`, never `put_text_source` (that one publishes to the project). The body is `{"message":…,"title":…}` in Sophia's canonical JSON. Its SHA-256 is the operation's `payload_sha256`, frozen and never rewritten. |
| Selected project sources | `owner_runner_operation_sources(project, operation, source, sha256, eligibility_revision)`, one row per source | A create selects project-scoped, eligible, ready sources that are not withdrawn (whole `source_closure`). An input selects a **subset of its create's set**, in its own rows. The create's rows are never appended to. |
| Context | One `context_manifests` row per create **and** per input. Its body is an owner-private source holding the canonical manifest JSON. | The manifest lists the payload digest, the selected `{id, sha256, eligibilityRevision}`, repository root, base, write scope, settings, the qualification and profile revisions, and the project's frozen `audience_revision` and `eligibility_revision`. Its digest is `manifest_sha256`. |
| Repository | `repository_root` (copied from the resource), `base_commit` (40-hex, requested), `write_scope='read_only'` | Input rows copy them from their create. |
| Settings | `requested_settings` = `{instanceId, model, options:[{id, value}]}`. This is the pin's `ModelSelection` shape (`modelSelection.ts`:9–50). | It must lie inside the qualification's operator-declared `source_policy` catalog, with every declared option id given exactly once. There is no profile-default fallback, no static effort list and no provider or account substitution. |
| Envelope version | `envelope_version` 1 or 2 | Every pre-0096 row stays 1. Nothing is backfilled or relabelled. |

`requested_settings` is a request. No column claims what the adapter accepted, reported or used. The launch result's
`modelSelection` echo is the thread's stored selection, and a read's run `model` label is a label. Neither proves the
model or effort used, so neither is recorded as an observation. **Accepted, reported and observed all stay unknown.**
A 40-hex `baseRef` and T3's permissive pre-launch check are not proof of a checkout. `read_only` is a request that the
profile must enforce; it is not enforced here.

*INC04-S03b B2 (0108), added later:* a **patched** producer's provider-reported models are kept as their own
append-only evidence (§12). They are what a provider reported, as one read collected them. They are neither accepted
nor observed settings, and `requested_settings` is never compared with them. Accepted and observed stay unknown.

The qualification gains `source_policy jsonb`, which is null for every existing one. Only the migration owner can
declare it, through `declare_owner_runner_source_policy`, and declaring it bumps the qualification's revision. A route
without a policy refuses every v2 create as `runner_unqualified` before anything is written.

## 2. Version and digest

- **v1 is frozen.** For a v1 row, `owner_runner_envelope` returns the 0092 expression byte for byte. `checkEnvelope`
  v1, its `KEYS`, the v1 digest, the journal records, the native identities, and read, reconcile and the qualified
  Stop do not change.
- **v2 is content-free.** It has the v1 identity and route fields, without `message` or `title`, plus
  `payloadSha256`, `manifestSha256`, `baseCommit`, `writeScope` and `settings`. The send digest is `digestOf` over
  this content-free envelope. The journal's intent stores the v2 envelope and so never holds the body.
- **The payload sidecar.** `send(envelope, digest, journalId, payload?)`. For v2 the payload string is required.
  Before it journals anything except a refusal, the gateway checks four things:
  - `sha256(payload) == payloadSha256`;
  - its exact keys and the kind rules;
  - `settings` lies in the gateway's own `sourcePolicy`;
  - `writeScope` is `read_only`.
  A gateway with no `sourcePolicy` refuses every v2 envelope.
- **Follow-up versions.** A v2 input must target a v2 create, with the same base, scope and settings. A v1 input that
  targets a v2 create, or a v2 input that targets a v1 create, is refused by the gateway before intent. SQL refuses a
  new input on a v1 binding at admission: such an input could not be bounded by a selection.
- **Unsent v1 work.** An unsent v1 create or input, admitted before 0096, is denied at prepare-send ("admitted before
  source authority"). An already-possible v1 operation keeps its unknown, read, reconcile and Stop exactly as before.
- **Mapping.** For a v2 create, `callFor` adds `workspaceStrategy: {type:"worktree", baseRef: baseCommit}` and
  `modelSelection: settings` (`project/tools.ts`:124–164), plus the payload's title and message. A v2 input is sent
  with the payload's message only, because `t3_thread_send` (`orchestratorMcp.ts`:501–513) takes neither field.

## 3. Rechecks (every crossing)

`owner_runner_source_ineligible(o)` checks v2 creates and inputs. It returns a reason, or null. It is ineligible when:

1. **The payload is not intact.** The payload source is missing, not `ready`, not private, owned by someone else, its
   text is gone, or the SHA-256 of its text is not `payload_sha256`.
2. **The context changed.** The manifest is retired, its body source is not intact, or `manifest_sha256` moved.
3. **The project's revisions moved.** The project's `audience_revision` or `eligibility_revision` differs from the
   manifest's. This is refused and never re-snapshotted: the owner admits again.
4. **A selected source moved.** It is not project-scoped, eligible and ready; its `sha256` or `eligibility_revision`
   moved; or anything in its `source_closure` is withdrawn (`source_withdrawn`).
5. **The settings left the policy.** The frozen settings are no longer inside the current qualification's policy. The
   revision check already covers this; it is checked again regardless.
6. **The operation was withdrawn.** `source_withdrawn_at` is set.

`owner_runner_ineligible` is replaced with the same 0092 checks, now in this order:

- every expiry uses **`clock_timestamp()`**, never the transaction-start `now()`, so an admission or prepare that
  waited on a lock judges expiry at the real time;
- an unsent v1 create or input is refused;
- then `owner_runner_source_ineligible`.

Because 0093 calls the same function, one guard serves every crossing:

| Crossing | Function | Effect of a refusal |
|---|---|---|
| Admission | replaced `admit_owner_runner_operation` (project lock first) | Raised before any write. Expiry uses `clock_timestamp()`. |
| Prepare-send | `owner_runner_prepare_send` (replaced only to return the v2 payload) | Denied, with zero native calls. |
| Host delivery | 0093 `owner_host_poll` → `owner_host_send_refusal` → `owner_runner_ineligible` | Denied at delivery, with no GO. The exchange holds no body. |
| GO | replaced `owner_host_go`: the same recheck, and the payload is **returned only with a granted GO** | Denied: the host's agent never calls its gateway, and the body never left Sophia. |
| Owner content read | `owner_runner_content`: payload intact, manifest not retired, not withdrawn, and the reader is the owner and a current member | `content: "withdrawn"`. Metadata, Stop, read and reconcile stay. |

### The decision clock (INC01-30813-EXPIRY-F01, incorporated here)

The independent revalidation found a P1 in the inherited backend `30813cd5`. 0092's `owner_runner_ineligible` judged
connection and qualification expiry with `now()`, the transaction-start time. So a prepare-send that started while its
route was valid, then waited on the project lock past the expiry, still marked the possible send, and the dispatcher
sent it.

0092 stays frozen. The repair lives in 0096's replacements:

- **Every expiry is judged with `clock_timestamp()`.** This covers `owner_runner_ineligible`, which the prepare-send,
  0093 delivery and GO paths all call, and the admission.
- **Prepare-send rechecks once more after the account reservation's lock.** That is the last wait before a create or
  input commits its possible send. The whole `owner_runner_send_check` runs again (expiry, revocation, revisions,
  source authority and the payload), immediately before the `possible_send` update. That update now records
  `possible_send_at` at the actual time.
- **A Stop takes no reservation.** Its single recheck already follows its last wait.
- **Admission rechecks expiry after its last lock wait** (goal, target, binding, sources), immediately before the
  first write.

GO already rechecks after its own locks, immediately before the grant. These rules stay as they were: unknown and
possible sends, original identities, journal and payload digests, and kept commitments.

**Regressions** run on real PostgreSQL through the actual dispatcher, gateway, fsynced journal and FakeT3. Each wait
has an expired case and an unexpired control:
- prepare-send waiting on the project, for both a qualification and a connection;
- an input waiting on the account reservation;
- an admission waiting on the goal.

### v1 rows admitted before 0096 (characterized, not dropped)

The DB tests install the **frozen 0092 bytes** of admission, eligibility and prepare-send under legacy names. With
them they make genuine pre-0096 rows, then check that after 0096:
- a v1 create sent earlier keeps its envelope digest, journal intent, observation, inline owner view and qualified Stop;
- a lost v1 create is reconciled by its original identity and never relaunched;
- a v1 key replays its first receipt;
- a v1 binding takes no new input;
- an unsent v1 create is denied at prepare-send with zero native calls.

A v1 Stop is still sent. A v1 create or input is no longer sent.

## 4. Withdrawal hook and lock order

`mission_erase_source`, whose latest version is `0041`:133, is replaced. It keeps its body, with the research and
design revocations, **then** calls `owner_runner_source_withdrawn(project, source)`.

**Callers audited.** All take `projects FOR UPDATE` before any row lock:
- `0018`:469 and 475, `mission_withdraw`, through its own project lock;
- `0068`:229/252 and 272/282, `correct_contribution` and `withdraw_contribution`;
- `0069`:175/214 and 232/242, which replace those two.

`0074` only mentions the function. No other code path changes `source_objects` eligibility, and no erase spans
projects. The hook takes the project lock itself as well (re-entrant), and then:

1. **Find the affected operations.** These are the project's v2 creates and inputs whose payload or manifest body is
   the erased source, or whose selected sources' closure contains it. Their rows are locked `ORDER BY id`.
2. **Deny admitted, unclaimed work.** An `admitted` operation whose outbox row is still `pending` is denied, in the
   0092 fence's pattern. A claimed one is denied by its prepare-send. A create's binding ends `failed`.
3. **Retire and mark every affected operation.** Each one's manifest is retired and `source_withdrawn_at` is set,
   with an owner event.
4. **Change nothing else.** A `possible_send`, `unknown` or `received` operation keeps its state, reservation, account,
   binding, native identities and reconcile. Nothing is reset, re-prepared, replayed, refunded or replaced, and no
   unsend is pretended. **A native copy already delivered cannot be recalled.**

The lock order is project, then operation, then outbox, as in integrated-r2 F03. Prepare-send takes the project first
too, so the two serialize on it. GO takes no project lock: it reads committed state when it runs. A withdrawal that
commits after a granted GO is a post-GO withdrawal.

## 5. Disclosure map

| Copy | v1 (unchanged) | v2 |
|---|---|---|
| Operation row and `semantic` | Inline message and title | No message or title. `semantic` keeps the request without content, plus `payloadSha256` |
| Commands and outbox (member-readable) | Payload digest | Payload digest (unchanged) |
| Payload source and manifest body | — | Private to the owner. RLS: owner, or project-scoped, eligible and ready |
| Owner view | Inline text | Text only while the read guard passes; otherwise `withdrawn` |
| Worker prepare-send result | Envelope | Envelope, plus the payload after the recheck. The host proxy drops the payload; only an in-process gateway uses it |
| Host exchange (`request`, poll) | Full envelope | Content-free envelope |
| GO answer | `{result:"go"}` | `{result:"go", payload}`, only when granted |
| Gateway journal | Envelope with text | Content-free envelope and digests |
| T3 launch or send | Message | Payload. Cannot be recalled |
| Reconcile and observe | Envelope | Content-free envelope. The body is never needed or rebuilt |

## 6. Files (exclusive lease)

- **SQL.**
  - `db/migrations/0096_owner_runner_source_authority.sql`;
  - `db/tests/0096_owner_runner_source_authority.sql`.
- **Contract.** `packages/contracts/amendments/A50-owner-runner-source-authority.json`, with its generated outputs.
  - Request: `sourceIds`, `baseCommit`, `writeScope`, `settings`.
  - View: `envelopeVersion`, `content`, `sourceIds`, `baseCommit`, `writeScope`, `settings`.
- **Coordination.**
  - `runner-port` (v2 type, `checkEnvelope` dispatch, payload check, settings policy);
  - `runner-gateway`;
  - `t3-port-mapping`;
  - `runner-fake-t3`: the pinned launch input shapes, and the `modelSelection` echo;
  - the transferred owner-host channel, agent and proxy;
  - tests for each.
- **Persistence, worker and API.**
  - `runner-operations.ts`: prepare returns the payload; reads carry content;
  - `owner-host-enrollment.ts`: GO returns the payload;
  - `runner-dispatch.ts`: passes the payload;
  - the route's comment;
  - their DB tests, whose fixtures now admit v2 with a declared source policy.
- **Not touched.**
  - `0092`, `0093`, `0094` and `0095`;
  - A47;
  - `SOURCE_MAP`: its additions are reported in the handoff;
  - the host transport and its test, plan and handoff;
  - `runner-journal-records.ts`, because `checkEnvelope`'s version dispatch is enough.

## 7. Proof plan

Real disposable PostgreSQL 16 and the configured proxy, channel, agent, gateway, fsynced disk journal and FakeT3.

**Admission and records:**
- private bodies and titles;
- refusals for a selected source that is private, unready, withdrawn, or has a withdrawn closure;
- refusals for an unsupported base, settings or policy;
- a v1 binding refused for an input;
- each input's own payload and context;
- `clock_timestamp` expiry after a lock wait.

**Effect boundaries:**
- withdrawal or erasure at admitted, delivered, before GO and after GO;
- audience and eligibility revision changes;
- mutated payload hashes;
- v1/v2 restart with zero resend;
- the safe withdrawn owner view, with Stop, read and reconcile still working.

**Mutations:** each new effect or disclosure guard gets one that fails an assertion, with zero cancellations and the
bytes restored afterwards. Survivors are reported as they are.

## 8. Repair 1 (gate INC01-CC-005-final-53f42da1-SOURCE-PRE-PUSH-001: three classes)

Written before any code. The da42 expiry fix, v1 characterization, Stop and read/reconcile semantics, and every 0096
privacy guard are kept.

### CC005-E7-F01 (P1): fixed, content-free diagnostics

**Rule.** Nothing a native runner or transport says is copied into an answer, journal record, operation reason,
exchange answer, event or view. That covers a failure's `message` and `code`, a transport `reason`, a thrown error's
message, a decoded `delivery` or `status`, and a read failure's text or code.

The gateway and mapping emit only fixed diagnostics:
- A native code is named only when it is one of the pin's codes the mapping already lists. Anything else is "an
  unlisted code".
- A definite refusal keeps its listed code, with a fixed reason.
- An unknown says only which kind of uncertainty it is.
- The dispatcher's thrown-port reason, the proxy's unreachable-store reasons and the gateway's no-session refusal
  are fixed too.

**What does not change.** Identities, outcomes, journal transitions and commitments are untouched. v1 records already
written are never rewritten. This applies to every answer of every version, since a fixed diagnostic loses nothing a
v1 row needed. No regex, bearer pattern or caller label is trusted to sanitize text.

### CC005-E7-F02 (P1): an input is fenced by its binding's whole disclosed context

A new v2 input must still be authorized for the context its native thread already holds. That context is:
- the binding's create: its private instruction, context manifest and selected sources with their closure;
- every earlier input of the binding that may have reached T3 (`possible_send`, `unknown`, `received` or `settled`):
  its instruction, manifest and selected sources.

**One check, two paths.** `owner_runner_context_ineligible(x)` is the per-operation check. It is the instruction,
manifest, selected-source and `source_withdrawn_at` part of `owner_runner_source_ineligible`, factored out unchanged.
`owner_runner_lineage_ineligible(project, binding, create, self)` applies it to that whole set. It also refuses a
project `audience_revision` that moved since the create's manifest: the thread's context was disclosed for that
audience.

**Where it runs:**
- at input admission, under the project lock and before any write;
- inside `owner_runner_source_ineligible` for an input, so prepare-send, 0093 delivery and GO all apply it.

**A selection keeps its revision.** An input's selected source must equal its create's frozen row by
`(id, sha256, eligibility_revision)`, not by id alone. A changed source is refused, never re-snapshotted.

**The erase hook also denies dependent inputs.** Admitted, unclaimed inputs of a binding whose create or earlier
disclosed input was affected are denied at once, in the same project-first, id-ordered locking. A claimed input is
denied by its prepare-send.

**Kept as they were:**
- the create's manifest is never rewritten, and nothing new is appended to its hash;
- native context is never claimed purged;
- no binding or account is switched, and no budget is reset or refunded;
- nothing unknown is resent;
- a Stop stays source-exempt under its qualified route only;
- read and reconcile of possible work are unchanged.

### CC005-E7-F03 (P2): one character semantics

A character is a Unicode code point everywhere:
- the A50 and A47 schemas, where ajv's `maxLength` counts code points;
- SQL `length()`;
- the gateway's `checkPayload` and `checkEnvelope` message and title limits, which now count code points rather than
  UTF-16 units.

A blank instruction or title is one made only of the characters JavaScript's `trim()` removes. SQL refuses exactly
those at admission, with an explicit character class, before any write or allowance use, so the gateway's `trim()`
never refuses what SQL admitted. Nothing is truncated or replaced. Loosening a v1 length check from UTF-16 units to
code points cannot invalidate any v1 envelope or journal written before.

### Proof plan

**Fail-before** on exact 53f's source with the new tests:
- a gateway and fsynced journal whose transport echoes the instruction through every diagnostic field;
- the PG dispatcher's operation reason after erasure;
- the host exchange answer;
- the binding-context erasure siblings: before admission, admitted before prepare, and before GO through the
  configured proxy, channel and agent;
- the Unicode boundary cases at and over the limits, for create and input, through admission and the dispatcher.

**Then** the repair, assertion-failing mutations with zero cancellations and the bytes restored, the affected suites,
the generator check, and `pnpm check` plus `git diff --check` on the exact final source.

## 9. Repair 2 (gate INC01-CC-005-repair1-33c020af-SOURCE-FINAL-001: two concurrency classes)

Written before any code. The parent is the published `33c020af`, now immutable. The fix is a new signed child, in the
active `0096` only, through `CREATE OR REPLACE`. Nothing in `0092` or `0093` is edited. The repair-1 classes, the da42
expiry fix and all privacy guards stay.

### The authority lock

**The projects row is the one authority lock.** Every decision that may send or disclose, and every change of the
authority it depends on, must hold it. Whichever commits first wins.

**Writers holding it `FOR UPDATE`:**
- admission;
- prepare-send;
- every caller of `mission_erase_source` (0018, 0068, 0069), with the hook as well;
- the membership changes (0052, 0056, 0058);
- now also `revoke_owner_runner` and `declare_owner_runner_source_policy`.

**Lock order:**

| Path | Order |
|---|---|
| Admission | project → resource → connection → qualification → goal → target → binding → sources |
| Prepare-send | project → outbox → operation → reservation, then (new) the resource, connection and qualification rows `FOR SHARE` before its final recheck |
| GO (new) | project `FOR SHARE` → host → exchange → resource, connection and qualification `FOR SHARE`. Then the final recheck, the payload read and the grant, all in one transaction |

**Why the extra row locks.** The row-level `FOR SHARE` on the resource, connection and qualification serializes even a
writer that does not take the project lock, such as an operator's direct update of a connection or resource.
Prepare-send and GO take those rows after the project, in admission's resource → connection → qualification order.

**No deadlock.** No writer takes those rows before the project and then waits on the project. No writer locks a host or
an exchange while holding a project. Poll locks host → exchange and never the project.

### PR505-33-F01: revocation against the final prepare-send and GO decisions

`revoke_owner_runner` is replaced with the same signature, errors and privileges: it is still migration-owner only, and
the replacement keeps its pinned `search_path`. It now locks the project first, then the qualification.
`declare_owner_runner_source_policy` does the same.

**Outcomes:**
- **Revocation first.** A revocation that commits before the decision makes prepare-send, which waits on the project,
  recheck after its wait and deny. GO, which waits on the project in `FOR SHARE`, refuses with no payload.
- **Decision first.** A decision that holds the lock first commits first. Its possible send or granted GO stays, with
  the original identities, binding, account reservation and unknown reconciliation. The revocation then takes effect
  for later work only. Nothing is falsely unsent, purged, refunded, reset or resent.

### PR505-33-F02: GO against a source erasure

`owner_host_go` is replaced. In order, it:
1. **Looks up the exchange's project, without a lock.** The lookup authorizes nothing. An unknown capability or
   exchange answers exactly as before: "not authenticated", or Forbidden.
2. **Takes the project lock** `FOR SHARE`.
3. **Authenticates and locks the host.**
4. **Locks the exchange and revalidates it.** The exchange must still be this host's, and still the same project.
5. **Takes the authority rows** `FOR SHARE`.
6. **Decides under these locks:** the final recheck, including the cumulative input lineage, then the payload read,
   then the grant.

An erasure or retirement through `mission_erase_source` needs the project `FOR UPDATE`, so it waits for a GO in
progress, and a GO waits for an erase in progress. The same holds for audience changes.

### Proof plan

**Fail-before on exact `33c020af`.** These use real two-client lock barriers: an ungranted lock observed in `pg_locks`,
never a sleep taken as proof. They use the original roles and SQL, with no rewritten production function and no
trigger.
- **Revocation while prepare-send is paused** at its event insert (the `project_events` table held in `SHARE` mode).
- **Revocation open before prepare-send.**
- **GO paused** at its final exchange update (the `owner_host_exchanges` table held in `SHARE` mode), against:
  - an erasure of a create's instruction;
  - an erasure of an input's create context;
  - a revocation.
- **Erasure or revocation open before GO.**

**After the repair, the same barriers assert the winner order:**
- the later writer is observed waiting;
- the decision that won keeps its commitment;
- the change that won blocks the payload and any new native call.

They also cover unchanged controls, repeated GO, a qualified Stop, read and reconcile. Each new lock gets an
assertion-failing mutation.

## 10. Repair 3 (addendum INC01-CC-005-33-73-PAIRING-AND-COVERAGE-ADDENDUM-001: PR505-33-73-F03, P1)

Written before any code. The development child is a child of `73f73137`. The publication candidate is one signed child
of the published `33c020af`, holding repairs 2 and 3 with the same tree. The repair is in `0096` only, by
`CREATE OR REPLACE` plus one additive index. `0093` stays frozen.

### The defect

Two different codes paired to one connection can be redeemed at once:
- each redemption locks only its own pairing row;
- they share the connection `FOR SHARE`, which does not conflict;
- each retires only the committed hosts it can see.

So both insert, and the connection keeps two live hosts.

### The protocol

**One live host per connection, two ways:**
- **Serialization.** A transaction-scoped advisory lock on the connection, `pg_advisory_xact_lock(class, hashtext(connection id))`,
  serializes every redemption of the connection. It conflicts with nothing but another redemption of the same
  connection. A hash collision only adds serialization, never a wrong answer. No other path takes it, so it cannot
  invert against GO, retirement or revocation.
- **Structure.** A partial unique index, `owner_hosts(connection_id) WHERE state IN ('bound','active')`, makes "one live
  host per connection" a database invariant. If the advisory lock were ever skipped, the second insert fails rather than
  leaving two live hosts.

**Lock order.** `owner_host_redeem` is replaced (same signature, `SECURITY DEFINER`, pinned `search_path`; still granted
to `sophia_api` only) and takes: pairing `FOR UPDATE` → the connection's advisory lock → the connection's live hosts
`FOR UPDATE` → the connection `FOR SHARE`. That is host before connection, the same order GO uses (project `FOR SHARE` →
host → exchange → resource → connection → qualification). Retirement and revocation lock only host and then exchange.
So no path holds a connection lock while waiting for a host. The operator's direct connection update holds only the
connection row, and `owner_host_create_pairing` holds only the connection row.

**The decision, after every wait and before any change:**
- the pairing is unconsumed, unrevoked and unexpired, judged at `clock_timestamp()`;
- the connection is the pairing owner's, linked and unexpired, also at `clock_timestamp()`;
- the capability is not bound already.

A refusal changes nothing.

**Unchanged:**
- the same code with the same capability replays the same host;
- a used code with another capability is refused;
- an expired, revoked or foreign pairing or connection is refused.

**A replaced host is retired, never revoked.** Its fenced queued new work is cancelled exactly as before. Its journal's
operations keep their state, identities, commitments, Stop, read and reconcile through it. Nothing is unsent, refunded,
settled or unbound.

### Proof plan

**Fail-before on `73f73137`.** Real transactions through `redeemOwnerHostPairing` (one held open on its own client) and
the actual `DbHostChannel`, `OwnerHostAgent`, gateway and journal:
- two distinct codes redeemed concurrently: one live host after both commit, and the second waits for the first;
- an expiry that falls during that wait;
- a connection revoked during that wait;
- redemption against GO in both orders.

**Controls:**
- the same code and capability replayed, and a used code with another capability;
- a sequential replacement;
- a foreign owner;
- the retired host still observing its own operation.

**Cleanup.** The repair-2 lock-wait loops get their own finite deadlines.

**Mutations.** Each of the advisory lock, the unique index and the decision clock, alone and paired.

### As built

The protocol above, with three additions found while proving it:
- **Migration precondition.** Before the index is created, a database that already holds two live hosts for one
  connection stops the migration with a named error. Which host keeps serving is the owner's decision, so the migration
  retires nothing.
- **Retirement race.** An owner's retirement of the old host racing a redemption is covered in both orders.
- **Re-pairing a host with unknown work.** A host replaced by a concurrent re-pairing keeps its unknown create and its
  qualified Stop.

The mutations are N1 to N5:
- the lock alone and the index alone;
- both together;
- the after-wait expiry on the transaction clock;
- the lock taken after the host scan.

The index alone is a redundant layer for the DB tests; the SQL test judges it.

## 11. Repair 4 (gate INC01-CC-005-repair3-map-compose-SOURCE-PRE-PUSH-001: CC005-R3-F01, P1)

Written before any code. The development child is a child of the composed `50cd1054`. The publication candidate is one
signed child of the published `33c020af` with the same tree, so the source-map companion's three documents stay
byte-for-byte those of `84e01bc9`. The repair is in `0096` only, by `CREATE OR REPLACE`. The three closed concurrency
classes (revocation, source erasure, pairing redemption) keep their locks and order.

### The defect

Holding the authority rows serializes writers, but it cannot hold time still. Each time-bound decision was taken before
writes that can still wait on a lock:
- **Prepare-send** rechecks everything, then writes the possible send, the command and the owner's event. The event
  `INSERT` (and either `UPDATE`) can wait on a table lock while a qualification or connection expires, and then the
  send commits.
- **GO** checks the exchange deadline, the current authority and the private body, then its final exchange `UPDATE` can
  wait while any of them expires. It then grants and returns the payload.

### The rule

A clock-sensitive authorization is decided after the last statement that can wait, inside the transaction that commits
it. Only the commit follows it.

### The protocol

- **Prepare-send.** The possible-send writes (operation, command, event) run in a PL/pgSQL block, which is a
  subtransaction. Its last statement is the whole send check again on `clock_timestamp()`: the same check as before
  (`owner_runner_send_check`), the payload re-read with it.
  - **Expiry wins.** The block raises a private SQLSTATE and is rolled back: no possible send, no `sending` event, no
    command change. The operation is then denied through `owner_runner_deny_prepared` exactly as an earlier denial: its
    outbox and command, a create's binding, a reservation with nothing unsettled, and a `denied` event. Those writes may
    wait; a denial authorizes nothing.
  - **The decision wins.** It commits as before, with the payload read under the final check.
  - **Scope.** This holds for every kind, a Stop included, with the same check as its first. A Stop's own rules are
    unchanged.
- **GO.** The grant (the exchange `UPDATE`) runs in a block whose last statement is the final check: the exchange
  deadline, `owner_host_send_refusal` (host, route, operation state, and the whole operation recheck with both expiries)
  and, for v2, the private body re-read.
  - **Any of them fails.** The block is rolled back: no grant, no `go_count`, no payload. The answer is the existing
    refusal. A first GO denies the exchange, and a GO after an earlier grant only records the refusal. A deadline that
    passed answers as an earlier deadline refusal does.
  - **The grant wins.** The payload returned is the one read under the final check.
- **Order.** Unchanged: project → host → exchange → authority rows, and the per-connection pairing lock and
  one-live-host rule. The final check takes no new lock: every row it reads is already held. The rollback releases only
  what the block took.
- **Already-possible effects.** An effect that is already possible is not touched: an earlier send stays
  possible, unknown or received with its binding, reservation, journal, reconciliation and Stop. Nothing is marked
  unsent, refunded or reset. A first send denied this late leaves no `sending` event and no grant to replay.
- **Admission is not changed.** It authorizes no outward effect, and prepare and GO decide again.

### Proof plan

**Fail-before on `50cd1054`.** Real PostgreSQL, the actual dispatcher, persistence, `OwnerHostPortProxy`,
`DbHostChannel`, `OwnerHostAgent`, gateway, fsynced journal and FakeT3. The barrier is a real table `SHARE` lock that
blocks only the final write. The waiting backend is identified in `pg_locks` and `pg_stat_activity` (its query is the
function under test), and every wait is bounded.
- prepare-send waiting on its event `INSERT`: qualification and connection expiry, each with a valid control;
- prepare-send waiting on its command `UPDATE`: qualification expiry;
- GO waiting on its final exchange `UPDATE`: qualification and connection expiry, and the exchange deadline
  passing, each against a valid control;
- an earlier received create kept when its input is denied this late.

**After the fix.** No launch, no message, no payload and no grant when expiry wins. When the decision wins, exactly
one send. The original effect keeps its journal, reservation and later reconciliation.

**Mutations.** The prepare final check removed, the GO final check removed, the GO deadline left out of it, and the
final check moved back before the writes.

## 12. Reported models (INC04-S03b B2, migration 0108)

**The producer.** A patched T3 (`patches/t3code/ade47301-provider-reported-models.patch`, `docs/SOURCE_MAP.md`
§2p), which Sophia neither applies nor installs, adds an optional `providerReportedModels` to each run of
`t3_thread_read`. An unpatched T3 sends nothing.

**The path.** No new endpoint; the existing chain carries it:

1. **Decode** (`t3-port-mapping.ts`): keeps each listed run's raw value and nothing else. It is never part of whether
   a read is evidence.
2. **Gateway** (`runner-gateway.ts`): `observe` attaches only the receipt run's report, and only when the producer
   sent the field. `runner-model-report.ts` checks it there, against the producer's contract and relations, and
   bounds it. The checks are listed below.
3. **Channel** (`owner-host-channel.ts`): `ownRun` accepts exactly `kind`, `status`, `terminal`, or those plus
   `reportedModels`, which it checks again on Sophia's side. A bad report never voids the checked status.
4. **Worker** (`runner-dispatch.ts`): for a create's or input's run observation, it first appends the report, or
   `absent` when there is none. This is its own autocommit statement. Then it records the status from the
   observation's own fields.
   - An appender failure never stops that, whether a missing function, a refused report or a lost connection.
   - Such a failure is logged as a fixed class (`not_installed`, `refused`, `transient`, `failed`) taken from the
     SQLSTATE alone. Database text, reports and model ids are never logged.
5. **Recorder** (`sophia.owner_runner_record_models`, worker only, SECURITY DEFINER): appends to
   `sophia.owner_runner_model_reports`.

**The checks** (step 2, repeated in step 3 and in SQL):
- Model ids: 1–200 UTF-16 units, trimmed as JavaScript trims, no C0/C1 controls, distinct and in code-unit order.
- Attempt ids: trimmed and non-empty, unbounded as at the pin.
- Integers by value: safe, non-negative, positive where the contract says so.
- Attempts in the producer's order: ordinal descending, then id by code unit.
- The whole compact report, its receipt thread and run ids included, at most 32,768 UTF-8 bytes. Anything else is
  `malformed` (`invalid` or `oversize`), with no content.

**The evidence.**

| Rule | What it means |
|---|---|
| Who and when | Only for a create or input in `received`, bound to the answering journal. A Stop, another journal or any other state appends nothing. |
| Provenance | Thread, run, owner, connection, resource, goal, binding, qualification, profile, pin, repository, base and the frozen `requested_settings` digest, all copied from the operation's row, never from the report. |
| States | `absent`, `collected` (the canonical report without its `collectedAt`), `unavailable`, `malformed`, `foreign` (another thread or run; no content) and `capped`. |
| Change-only | A row is appended only when its canonical evidence, everything but the producer's `collectedAt`, differs from the latest row. The first sighting's time is kept. SQL canonicalizes integers, so `1`, `1.0` and `1e0` are the same report. |
| Cap | 32 ordinary rows, then exactly one `capped` row, then nothing, under the project then operation locks. |
| Append-only | No update, delete or truncate, even by the owner. Inserts happen only inside the recorder's seal. A later absence, erasure or contradiction adds a row and never retracts one. |
| Untouched | The operation, binding, reservation, outbox row, command and events. |
| Readers | No application role reads the table. An owner read is a later, separate amendment. |
| SQL bound | `p_report::text` at most 49,152 bytes. jsonb text adds one space per separator, so this is a proven superset of the 32,768-byte compact bound. |

**Not claimed.**
- No accepted, effort, effective, final or complete model, and no union across rows.
- No producer installation and no native qualification. R11 stays open.
- The first terminal status ends follow-ups, so a later report is not collected: it stays unknown. There is no
  reopen and no new poll.

**Cutover (operational).**
1. Install 0108, and the worker and proxy, everywhere first.
2. Then the owner-host gateway.
3. Then a patched T3, only under separate owner-route authority.

An older proxy would void a four-key observation and hold its reservation, so a rollback removes the producer before
the consumer.
