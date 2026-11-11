# Owner-host transport (INC01-CC-003 S1a): state and crossing plan

This plan was written before the code it describes. It covers SOPHIA-INC-2026-11, contract C02, and migration
`0093_owner_host_enrollment`.

## Scope

**Built on.** S1a was first built on the backend author's unpublished candidate
`3f27a0a1d2d7bae9f5fc0973e2a1984efd075d42` (tree `856fc776…`, migration 0092, amendment A47), then on db414. r3
integrates it on the accepted backend `30813cd556c7f382e683de32877ad59c1b23c4c2` (tree `d80b1815…`). It reuses the
backend's `SophiaRunnerPort`, `RunnerGateway`, `RunnerJournal`, `T3Transport`, `t3-port-mapping` and the worker's
`runnerDispatchOnce` unchanged.

**What it adds.** S1a adds what that candidate leaves out: the path from Sophia's worker to an owner's machine.

1. An owner-bound, expiring, one-use **pairing** that binds one **owner host**.
2. A host capability that authenticates **only the host channel**.
3. A Sophia-side **port proxy**, a `SophiaRunnerPort` that turns `send`, `reconcile` and `observe` into durable
   **exchanges**.
4. A loopback **T3 MCP transport**.
5. An **owner-host agent** that serves exchanges through the backend's gateway and journal.
6. A small CLI.

**Where it ends.** S1a ends before production HTTP mounting, contract amendments, worker service wiring, native profile
installation and live qualification. The channel is reached through injected interfaces (`ExchangeStore`,
`HostChannel`). In tests they are the database functions themselves; later, a route and an HTTP client. Every real
route stays off: no qualification row exists in production, and S1a creates none.

## Records (0093)

### `owner_host_pairings`

| Column | Meaning |
|---|---|
| `owner_id`, `connection_id` | The owner's own `execution_connections` row, which must be `linked` |
| `code_sha256` | The code's hash only. The code is 256 bits, made and returned once by `createOwnerHostPairing`. |
| `expires_at` | At most 600 seconds after creation |
| `consumed_at`, `host_id` | Set together when the pairing is redeemed |
| `revoked_at` | Set by the owner |

### `owner_hosts`

| Column | Meaning |
|---|---|
| `owner_id`, `connection_id`, `pairing_id` | Fixed at redemption |
| `capability_sha256` | The host's capability is generated **on the host**; only its hash reaches Sophia |
| `state` | `bound` (redeemed, no hello yet), `active`, `retired` (fenced: no new work) or `revoked` (capability dead) |
| Hello identity | `journal_id`, `environment_ref`, `adapter_pin`, `profile_id`, `profile_revision`, `account_key`, `t3_environment_id`, `t3_namespace`. Bound once, at the first hello. **Immutable.** |
| `last_seen_at`, `hello_conflict` | The last successful contact, and the last conflicting hello |

### `owner_host_exchanges`

| Column | Meaning |
|---|---|
| `host_id`, `owner_id` | The host the exchange is for |
| `kind` | `send`, `reconcile` or `observe` |
| `exchange_key` | `send:<op>` for a send; a fresh key per reconcile or observe |
| `project_id`, `operation_id`, `payload_digest`, `request` | `request` is the operation's envelope, digest and journal ID |
| `state` | `queued`, `delivered`, `go_granted`, `answered`, `denied`, `lapsed` or `cancelled` |
| `deadline_at`, `delivered_at`, `delivery_count`, `go_count`, `answer`, `reason` | Timing, counts, outcome |

**Access.** All three tables are RLS-enabled with no policy and no table grant. Every access goes through `SECURITY
DEFINER` functions that check the caller:

- the owner, through `sophia.actor_id()` on `sophia_api`;
- the host, by capability hash on `sophia_api`, which no route mounts yet;
- the worker, on `sophia_worker`.

## Crossings and states

### Pairing (owner → host)

`owner_host_create_pairing(connection, code_sha256, ttl)`: the actor is derived server-side. It must own a `linked`
connection.

`owner_host_redeem(code_sha256, capability_sha256)`, atomically under a row lock on the pairing:

| Pairing state | Capability presented | Result |
|---|---|---|
| Unconsumed, not expired or revoked, connection still `linked` and owned | Any | Binds a new host. Any earlier non-revoked host of the same owner and connection becomes `retired`. |
| Consumed by this same capability | Same | `bound` again, with the same host: the host lost the reply and retried |
| Consumed | Different | `refused: already_used` |
| Expired or revoked | Any | `refused` |
| Connection revoked or unlinked | Any | `refused` |

Two concurrent redemptions are serialised by `FOR UPDATE`; exactly one binds.

A host never re-pairs blindly. A lost redemption reply is retried with the **same** code and capability, and the
result says `bound`, with no new pairing and no new host.

### Hello (host → Sophia)

`owner_host_hello(capability_sha256, hello)`:

- **First hello.** Binds the hello identity and moves the host to `active`, or keeps `retired` if it was retired first.
- **Later hellos.** Must equal the bound identity. Anything else returns `conflict` with the differing fields: nothing
  is updated, and nothing is delivered until a matching hello. A changed T3 namespace or journal is therefore never
  adopted silently. The host must pair again, as a new host identity.
- **Revoked capability.** `refused`.
- **Protocol version and types (r5, HOST-S1A-R4-F02).** The database itself requires exactly the JSON number `1` for
  `v`, and a JSON string matching its pattern for every string field, with null-safe predicates
  (`owner_host_version_ok`, `owner_host_json_text`, `IS DISTINCT FROM`). JSON `null`, the string `"1"`, a missing key or
  another type is `Invalid hello` (22023) before anything is bound, on the real API role, whatever the TypeScript
  caller does. Enqueue (the worker) applies the same rules to its request (`v`, `kind`, `journalId`, ids, envelope
  object, a non-null `p_kind`).

### Exchange enqueue (worker → host)

The proxy sends `send`, `reconcile` or `observe` with the operation's whole `RunnerIdentity` (envelope, digest,
journal ID).

- **Host resolution.** The host is resolved by owner, `environment_ref` and **journal ID**. A send of `create` or
  `input` needs an `active` host; a `stop`, `reconcile` or `observe` may use an `active` or `retired` host.
- **No such host.** `no_host`.
- **Idempotent.** The same key and payload digest return the existing exchange; the same key with another digest
  returns `conflict`.

### Delivery (host polls)

`owner_host_poll(capability_sha256, limit)` returns `queued` exchanges, and `delivered` or `go_granted` ones whose
redelivery time has passed, all before their deadline. Before returning a **send**, it rechecks:

- the operation is `possible_send`, is bound to this host's journal, and has the same owner and environment;
- the host's bound identity is the operation's frozen route: adapter pin, profile, profile revision and account;
- the host's last hello matched its bound identity;
- `sophia.owner_runner_ineligible(op)` (0092) is null;
- the host's state allows the kind.

A failed recheck marks the exchange `denied`, with its reason, and does not deliver it.

### Go (host, immediately before the gateway's effect)

`owner_host_go(capability_sha256, exchange_id)` re-runs the delivery recheck, plus the deadline and host-state
checks, **every time** it is asked. It grants only a delivered send, counts every grant, and moves the exchange to
`go_granted`. A denial is recorded on the exchange.

### Agent behaviour

The agent calls `gateway.send` only after a granted go.

- **Go denied after an earlier grant** (a crash after it, or a deadline passed). The agent answers with
  `gateway.reconcile`: the journal or a read-back, never a new send.
- **Go denied, never granted.** The agent answers `refused`: the gateway never saw the operation. If the journal
  nevertheless holds it, the two ledgers disagree; the agent answers nothing and logs it.
- **Go unreachable.** No GO: nothing is sent and nothing is answered.
- **Malformed or foreign request.** A send is answered `refused` without asking GO; a read is left unanswered, so it
  ends `unknown`.
- **`reconcile` and `observe`.** Passed straight to the gateway. They are reads that start no turn.

### Answer (host → Sophia)

`owner_host_answer(capability_sha256, exchange_id, answer)` stores a validated answer of at most 64 KiB. The same
answer twice is accepted; a different answer for an answered exchange returns `conflict`, and the first is kept. A
send never granted GO can only be answered `refused`. The answer's `kind` must be a JSON string of its exchange's
vocabulary: a missing, null or non-string kind is `Invalid answer` and the exchange stays open (r5).

### Proxy outcome for a send

The worker has already committed `possible_send` (0092 prepare-send):

| Exchange outcome | Port answer | Why |
|---|---|---|
| `answered` | The host's answer, checked | The gateway answered |
| `answered` with an identity not derived under the host's bound namespace, or malformed | `unknown` | No receipt |
| `denied` at delivery or go | `refused` | No go was granted, so no host called the gateway |
| Deadline passed, never granted go (queued or delivered) | `refused`, recorded `lapsed` | Go is refused after the deadline, so no send can follow |
| Deadline passed after a granted go, no answer | `unknown` | A send may have happened; the dispatcher reconciles by the original identities |
| `no_host` at enqueue | `refused` | Nothing was created to deliver |
| The digest does not bind the envelope | `refused` | Nothing is queued |
| `conflict` | `conflict` | Coordination error |

The `refused` rows rest on the server's go ledger: a host may call the gateway **only** after a go granted in the same
database that records the outcome. That is evidence that nothing was sent. It is not a timeout heuristic. A possible
send with a granted go is never turned into `refused` or `rejected`, never re-prepared, never re-sent and never given a
fresh key.

### What counts as a receipt (r2, CC003-S1A-STUDY-F01)

A host's answer is evidence, not authority. A GO, the host capability or a well-formed identity is not native proof that
the operation was accepted. Before the proxy returns `received`, for a direct send or a reconcile, the answer must prove
what its operation needs:

| Operation | A `received` answer must carry |
|---|---|
| `input` | A run ID that is a non-empty, non-blank string, and delivery `queued` or `started` |
| `stop` | Delivery `stop_requested`, `no_active_run` or `already_ended`. The run ID may be `null` (nothing was running), and otherwise is a non-blank string. |
| `create` | A run ID that is a non-empty, non-blank string, and delivery `started`. Sophia always launches with a message, so the run must be named, as the accepted backend's `receiptError` requires (r4). |

Anything else stays `unknown` with the bound identity: a send may have happened, and it is reconciled by the original
identity. That covers a missing, `null`, numeric, boolean, object, array, empty or blank run ID on an input or a create, and a
delivery that does not fit the operation. Only a Stop may acknowledge with a `null` run. It is never turned into `received`, `queued`, `started`, `refused`, `rejected` or "not sent",
and no run ID is invented. The host's raw answer stays stored on the exchange as evidence. This holds even if the
backend mapping is correct, so the host boundary cannot reintroduce the class after a retarget.

### Reconcile and observe

They are never effects. With no host, or no answer by the deadline, they return `unknown`, or an `unknown`
observation. They stay available after the host is retired and after revocation of the native route.

**An observation is checked for its own operation (r5, HOST-S1A-R4-F01).** A host's well-formed JSON is not proof of
native settlement. The proxy accepts only what the gateway itself would say for that operation (`runner-gateway`
`observed`, with the mapping's own status semantics `runState`):

| Operation | Accepted observation | Refused (kept `unknown`) |
| --- | --- | --- |
| `stop` | `no_active_run`: the complete, decoded read of the exact thread (`stopSettled`) | any `run` summary, of any status or `terminal` |
| `create`, `input` | `run` for its own recorded run: a status the mapping knows, `terminal` exactly as the mapping reads it | `no_active_run` (thread absence is not its run's state); an unknown status; a contradictory `terminal` |
| any | `unknown` with a reason | any other shape |

A refused observation becomes `unknown` with a reason naming the operation. The raw host answer stays in the exchange
row as evidence; the operation keeps its original identities, its state (`received` stays received: an ACK is not a
settlement) and its account commitment; nothing is resent. A valid nonterminal run is followed, a valid terminal run
settles a create or input, and a proven thread settles a Stop, all through the unchanged backend (0092). No native
state is inferred and no new native control is added. A reconcile answered `settled` for anything but a Stop is
already refused by the backend.

## Authority at the effect

0092's `prepare_send` checks authority when the possible send is marked. Because the proxy queues remotely, S1a checks
again with the **same** `owner_runner_ineligible` at delivery and at go, immediately before the gateway's effect:
goal epoch and revision, membership revision, resource, connection, qualification and binding. The agent's
`authority` seam is the go call. Its default is fail-closed: an unconfigured or unreachable go means `refused` and no
send.

**What none of these checks proves.** 0092 does not represent the source manifest, the repository base, settings, or
source withdrawal, and the goal epoch is not source withdrawal. Neither S1a nor 0092 checks them. Real new work
therefore stays **off**:

- no production qualification exists;
- `qualify_owner_runner` is migration-owner only;
- the worker is not wired;
- the routes are not mounted.

Source disclosure and the read-only profile still need their own qualification (see the handoff).

## Fencing

- **Retire, revoke or re-pair** at once moves `queued` and `delivered` create or input sends to the host to
  `cancelled`, which counts as never granted, so the result is `refused`. Stop sends, reconcile and observe continue
  on a retired host.
- **Revoked capability.** Nothing more is delivered. Operations bound to its journal keep their state (`unknown` or
  `received`) and their account reservation (0092 releases a reservation only on proven settlement). Nothing here
  implies a native process ended.
- **Already granted.** A send already granted go keeps that grant's possible effect, and stays `unknown` until a
  reconcile through some host bound to the same journal.
- **Old journal.** Operations bound to an old journal stay answerable only by a host bound to that journal. A new
  journal never inherits them.

## T3 transport

- **Endpoint.** MCP Streamable HTTP (protocol `2025-06-18`) to a **loopback** URL only: `127.0.0.1`, `::1` or
  `localhost`. Redirects are an error; bounded timeouts; bounded response bytes. JSON and single-event SSE bodies are
  both read.
- **Sessions.** `initialize`, then `notifications/initialized` with `mcp-session-id`. Only the backend's `T3_TOOLS`
  can be called, and only for the bound `environmentId`.
- **Failures.** A 404 renews the MCP session once (the request was not processed). A 401 or 403 is a
  `capability_denied` failure, which is pre-dispatch. Errors are redacted.
- **Bearer.** Read from the owner host's token file through an injected reader, for each request. It is never sent to
  Sophia, logged, or put in argv. Every value actually read (the last eight, in memory only, so a rotation is covered)
  is masked out of a decoded failure's code and message **before** any truncation, whatever its accepted length (16 to
  4096), prefix or surrounding punctuation (r5, HOST-S1A-R4-F03). Every other reason the transport returns is a fixed
  text, an HTTP status, or a name from a **fixed allowlist** of runtime errors (`DIAGNOSTIC_ERROR_NAMES`: `AbortError`,
  `TimeoutError`, `TypeError`, `SyntaxError`, `RangeError`, `NetworkError`, `Error`). The name is never one taken from
  the thrown error itself, whatever its shape; anything else is just `error`. Every allowlisted name is shorter than
  the 16-character minimum bearer, so none can equal one (r6, HOST-S1A-R5-F01: an alphabetic bearer named by a fetch
  rejection or a failing response stream had reached the gateway's unknown reason and its fsynced journal). The name
  is read **once**, inside a `try`; that single snapshot is validated and returned, never read again. An accessor that
  answers differently on each read cannot pass one value and return another, and one that throws gives `error` (r7,
  HOST-S1A-R6-F01). The general redaction of `Bearer …` and long opaque runs still
  applies. This is a property of the synthetic proof; it establishes nothing about a real credential's exposure.
- **Namespace.** T3's request namespace for an outside agent is `client:<T3 auth session id>`
  (`apps/server/src/auth/McpOAuth.ts` L599 at the pin). That ID belongs to the OAuth sign-in, which has no refresh
  grant (L96, L500), not to the HTTP or MCP session. So the transport's `namespace()` is a **declared, persistent**
  value from host configuration, bound immutably at hello, and never derived from `Mcp-Session-Id`.
- **Proving the namespace.** It is unproven until a launch receipt's thread ID equals `launchCommandId(namespace,
  key)`. A mismatch is already `unknown` in the backend's `classifyReply`. A new T3 sign-in is a new namespace and
  needs a new host identity.

## Owner-host agent

A bounded channel consumer: hello, poll, go, gateway, answer, sleep. It is not a scheduler or a continuation owner:
no model input, child mission, provider retry, permission answer, or Hold, Resume or steer. After a restart it reopens
the **same** journal file (the backend's lock prevents a second writer). A redelivered send replays from the journal.
Its configuration and credential files are read from paths, never from argv.

**CLI** (`scripts/owner-host.ts`):

- `check` validates the configuration (exact fields, loopback URL, the identity as a hello is, absolute paths), checks
  that the token and capability files are this user's only, opens the journal under its lock and prints the hello. It
  calls neither Sophia nor T3.
- `capability` writes a new capability to its file (mode 0600, never replaced) without printing it.
- `redeem` and `run` are refused: no Sophia owner-host route is mounted.

S1a does not run the CLI against a real Sophia, T3 or provider.

## Qualification state

Every provider and operation stays unqualified until real profile evidence exists.

- **Claude:** the profile in INC01-CC-003's preflight is a proposal. Deny-rule documentation is not live enforcement.
- **Codex:** UNQUALIFIED pending a verified control over T3's injected MCP credential. That is not proof Codex is
  universally unsupported.
- Hold, Resume, permission resolution and steer stay unsupported (the backend port).

## Tests

Fake and disposable only:

- **Unit:** channel, proxy, transport against a fake loopback MCP server, and the agent with the real gateway and
  journal over the fake T3.
- **SQL:** `db/tests/0093`, which rolls back.
- **DB:** enrollment, RLS and functions, plus one end-to-end case: the backend's `runnerDispatchOnce`, the proxy, the
  agent, the real gateway, the journal and the fake T3. A create with a lost reply and a reconnect produces **one**
  native effect with a stable identity.
- **r5:** operation-aware observations through that same crossing (a Stop given a run summary, a Create or Input given
  `no_active_run`, unknown or contradictory statuses; the valid siblings settle as before), SQL version and type
  tables on the API and worker roles, and an injected-fetch bearer table (short, rotated, unprefixed, `Bearer`, in the
  code, at the truncation boundary).
- **r6:** fetch rejection and response-stream error names for alphabetic, punctuation-bearing, current and rotated
  values; useful runtime names kept; the real gateway and a temporary fsynced journal hold no bearer in the returned
  reason or the bytes on disk.
- **r7:** changing `name` accessors (allowed then a bearer, allowed then disallowed), a throwing accessor, and stable
  allowed and arbitrary names, on fetch and stream failures, through the real gateway and a temporary fsynced journal.

## Source-map reconciliation for INC01-CC-005 (doc-only companion)

The exclusive SOURCE_MAP owner (this slice) records the six upstream pins that INC01-CC-005 relies on. The CC005 author
does not edit the map.

**Plan.**

1. **Verify.** Re-read the six files at `pingdotgg/t3code@ade473018d32003658b7d38693e083ee2e314bd8`, outside the
   tree, with no copy or install. Check each full-file SHA-256 against the CC005 qualification record and the
   reviewer's receipt.
2. **Record.** Add one additive section to `docs/SOURCE_MAP.md`, at the next free number after §2m. It holds:
   - the six file paths, with links at the full 40-hex commit;
   - each full 64-hex file SHA-256 and the relied-on lines;
   - the narrow wire facts relied on, and the limits.

   §2k, §2l, §2m and the older baseline links are kept byte-for-byte. Only the reliance overview in §2k is updated to
   name the new section.
3. **Hand off.** Append a handoff entry with the base, the scope and the expected retarget.

**Scope.** Three documents only:

- `docs/SOURCE_MAP.md`;
- this plan;
- `docs/handoffs/INC01-CC-003.md`.

No source, runtime, migration, contract, generated, pack or release-amendment byte changes.

**Base.** INC01-CC-005 `33c020af` (tree `e1efbfd1`) is a development parent only. Its final gate holds integration on
two P1 authority races, so it is not release-ready. Root retargets this documentation onto the accepted repaired parent
and proves doc equivalence before the whole-source gate. Nothing here is a live qualification.

## repair7 B: no read bearer in a successful reply (NATIVE6-F02)

**Base.** Published `5eb86c22` (tree `7877ab02`), a development child only. Written before the code. The other P1
(NATIVE6-F01, runner readiness) and the CC005 docs belong to repair7 A. The S2 patch at `22c9eee8` is not part of
this candidate.

**Finding.** `decodedReply` returns every successful decoded body unchanged; only a failure is masked. A bearer the
transport sent, echoed by T3 in a success, therefore leaves the transport. For example, as a `runId` next to the
expected thread: `classifyReply` accepts it, the gateway fsyncs it, and the agent answers it on the channel. The
review adds two siblings:

- a bearer with `"` or `\` decodes equal to the value, though `JSON.stringify` of the body does not contain it;
- a request's own bearer can be evicted from the last-8 history by more than eight later reads while its reply is in
  flight.

**Repair (transport only).**

- **Request-local bearers.** Each call keeps the bearer(s) it actually sent in a local set, until its own reply is
  returned. Those plus the bounded last-8 history are the values guarded. History stays 8: nothing unbounded, no reread.
- **Reject the whole body.** A successful body is refused if any guarded value occurs in:
  - any decoded string (top-level, nested, in arrays);
  - any object key;
  - any primitive's text;
  - the tool's raw text;
  - the JSON-escaped form of any of those.

  The answer is a fixed `transport_error`. The gateway keeps it `unknown` with the original identity, so it is
  reconciled and never sent again. Nothing is redacted or rewritten into a receipt, and nothing claims `not_sent` or a
  refusal before dispatch.
- **Unchanged:** clean successes (exact native ids), failure masking and truncation, the error-name snapshot, the
  protocol, namespace, time, byte and HTTP-status rules, and the 404 renewal.

**Not changed:** the gateway, the agent, persistence and the database channel. The boundary holds at the transport.

**Tests (one test file; synthetic, marked values only; injected fetch; no network).** Through the real transport,
gateway, fsynced journal and owner-host agent to a fake channel:

- a bearer echoed as `runId`: the current one, a rotated one, one Unicode-escaped, and one with `"` and `\`;
- nested values, keys and primitives;
- a bearer inside a longer string;
- a request's own bearer after nine concurrent rotations.

Each answers `unknown` with no bearer in the reply, the journal bytes or the channel answer. A clean launch is still
received with its exact ids. Fail-before on exact `5eb`, then minimal mutants: guard removed, escaped-form check
removed, request-local set removed.
