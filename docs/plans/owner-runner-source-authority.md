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
