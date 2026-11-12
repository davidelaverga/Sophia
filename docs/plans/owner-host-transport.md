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

## Native14: a capability file is complete and flushed before success (NATIVE13-F01)

**Base.** Published `f615b602` (tree `8fb71829`). This is one signed sole child, by the same native author (Claude
Code, session `session_01FGXfrJoUMojmJSW3H7XfoG`), worktree `r14`, branch `inc01-cc005-r14`. Written before any code.

**Scope.** Four paths:
- `scripts/owner-host.ts`, changing `makeCapability` only;
- the new `tests/unit/owner-host-cli.test.mjs`, which the existing `tests/unit/**/*.test.mjs` glob runs;
- this plan;
- the INC01-CC-003 handoff.

Unchanged: `check`, the hello, loopback and configuration loading, the `redeem` and `run` refusals, the journal, the
gateway, the channel, SQL, contracts, generated outputs and SOURCE_MAP.

**Finding (independent FINAL `db93190c…`, automatic comment 4549551048).** `makeCapability` opens the file `wx` with
mode 0600, calls `writeSync` once for the 44 bytes (secret and newline) without checking its count, closes, and prints
success. It never calls `fsync`. Observed outcomes:
- **1 byte or 0 bytes written:** exit 0 and "written". `check` then refuses the malformed file, and a retry refuses the
  existing path.
- **A 7-byte prefix, then EIO:** exit 1, but the malformed 0600 file blocks every retry.
- **Controls:**
  - a normal 44-byte write passes `check`;
  - a close error after a valid write leaves a valid file;
  - the flush-error seam was never hit, because no `fsync` is called. No flush failure or crash is claimed reproduced.

### States and rules

1. **An existing path is refused before anything is created.** Unchanged message; the file is never replaced.
2. **Create.** Open `wx` (`O_CREAT | O_EXCL`, which also refuses an existing symbolic link), mode 0600.
   - If opening fails, the refusal names only the error code; nothing was created by this run.
   - The new file's identity (device and inode) is pinned from its open descriptor.
3. **Write every byte.**
   - The capability is encoded once (`newSecret()` and a newline, 44 ASCII bytes) into a buffer.
   - It is written at offsets 0..43, continuing after any positive short write.
   - Progress that is not a whole number in 1..remaining (zero, negative, NaN, fractional or too large) fails at once,
     so the loop is bounded.
4. **Flush, then success.**
   - `fsync` the file. Only then close it, and `fsync` its directory so the new name is recorded.
   - Then print `capability written`. Success is printed only after all of these.
5. **Failed initialization** (a write error, invalid progress, or a file `fsync` error, all before success):
   - The capability was never announced, so it is not a credential yet.
   - While the descriptor is still open, the path is unlinked only if it still names the pinned inode (a regular file
     with the same device and inode).
     - A replacement file or a symbolic link at the path is never removed.
     - If the unlink itself fails, the file is left, and the message says so.
   - Then the descriptor is closed, and the command exits 1. The message names the error code and either "removed; run
     capability again" or "left in place".
   - So an ordinary retry works after a removed failure.
6. **A complete, flushed file is never deleted or rotated.** If closing it, or syncing its directory, fails after the
   file's `fsync`:
   - the file is kept;
   - the command exits 1 without "written", naming the code, and asks the owner to run `check`, which validates the
     file;
   - nothing is retried, rewritten or replaced.
7. **No value, path or raw error text is printed.** Only fixed text and an error code. The secret buffer is zeroed
   after use (best effort).

**Limits.**
- A same-user process racing renames in the private directory, between the identity check and the unlink, is not
  defended against.
- Power-loss or crash atomicity, filesystem-specific `fsync` semantics and non-POSIX hosts are not qualified.
- Process-local fault injection on regular files is the only fault evidence.

### Proof (to be run)

`tests/unit/owner-host-cli.test.mjs` runs the **real CLI** in bounded child processes (a timeout, no network), with a
fake, unregistered configuration in an owned 0700 temporary directory. The configuration has a loopback URL nothing
listens on and a fake token.

The test-only preload, written into that directory:
- patches `fs.writeSync`, `fs.fsyncSync` and `fs.closeSync` for the capability's descriptor only, then resynchronizes
  the ESM imports;
- traces writes, flushes and closes;
- never records secret bytes.

Cases, each followed by `check` and then a second `capability`:
- **Normal:** 44 bytes, mode 0600, `isSecret`; `check` passes; a retry refuses the existing file.
- **Positive short progress completing the exact bytes:** 1 byte, then 7, then the rest.
- **Impossible progress:** zero, negative, fractional and too large.
- **Errors:** a prefix then `EIO`; a file `fsync` error.
- **A close error** after a complete write and flush.
- **Existing files:** an existing valid file and an existing malformed or foreign file are refused and kept byte for
  byte.
- **Replacement during a failure:** a replacement regular file, or a symbolic link, at the path during a failed write
  is kept.

The new tests run on exact `f615` production (fail-before, actual causes), then on the repair. The narrow class
mutants are: the one-call write, zero progress accepted, too-large progress accepted, no `fsync`, the cleanup removed,
and the identity check dropped. Each is run alone with its source SHA restored. Then one signed commit, an early
checkpoint, **one** ordinary `pnpm check` and the sealed handback.

### Native14 repair 1: the whole initialization is guarded, and an unverified path is never deleted (NATIVE14-F01)

**Base.** The published `f615b602`, with the exact rejected `8b1ebb89` tree (`5de342c6`) staged first and no
intermediate commit. Worktree `r14r1`, branch `inc01-cc005-r14r1`. The final result is one signed sole child of
`f615`; `8b1` stays outside its ancestry, with its ref, worktree, raw evidence and its one ordinary check kept. The same
four paths. Written before any code.

**Finding (CORE `405098e6…` and its recovery addendum `8f3a1ec1…`).**
- **The unguarded step.** `8b1` creates the file, then builds the secret buffer and reads the file's identity
  (`fstatSync`) **outside** its failure guard. An injected identity-read error (EIO) therefore escaped as a raw
  exception:
  - its message, the private path and a stack were printed;
  - a 0-byte 0600 file was left, with no explicit close;
  - `check` refused it, and a retry refused the existing path.

  The child's exit released its descriptor: no surviving descriptor leak, credential disclosure or random-generator
  failure is claimed.
- **Conflated guidance (addendum).** The cleanup's single `catch` treated an unreadable path (no identity
  established) like a confirmed-own unlink failure. In both cases it told the owner to "remove it".

**Rules (adding to the rules above; everything else unchanged).**
1. **The secret is made before anything is created.** A failure to generate it creates nothing and prints a fixed,
   code-only refusal.
2. **Every step after a successful create is guarded:** reading the identity, writing, and the file `fsync`. On any
   failure:
   - the secret buffer is zeroed;
   - the descriptor's close is attempted, and a close error never replaces the original error, whose code is what is
     reported;
   - the command exits 1 with fixed text and the original error code only: no injected message, path or stack.
3. **No identity, no deletion.** If the identity read failed, nothing is unlinked. The message says the path was left
   in place unverified and asks for inspection before any retry. `check` and `capability` may then refuse it; no
   blind removal is advised.
4. **Cleanup states are kept apart:**
   - **Removed:** the path still named this run's inode and was unlinked. The owner can run `capability` again.
   - **Replaced:** the path names another file or a link. It is left in place, as before.
   - **Not inspected:** the path could not be inspected (an `lstat` error), so ownership is unknown. It is left in
     place, the error code is given, and the owner is asked to inspect it. There is no "remove it".
   - **Own but not removable:** the path is confirmed as this run's file, but the unlink failed. Only here is the owner
     told to remove it, then run `capability` again.
5. **Unchanged:**
   - complete bytes, bounded progress, file and directory sync;
   - a valid, flushed file is kept when a later close or directory sync fails;
   - foreign files and links are kept;
   - 0600, no overwrite, the value never printed;
   - configuration, `check`, the hello, `run` and `redeem`.

   No same-user hostile-directory or crash guarantee is claimed.

**Proof (to be run).** New bounded CLI cases in the same test file, using the same test-only preload, extended to
patch `fstatSync` on the capability's descriptor and `lstatSync` and `unlinkSync` on its path. The injected identity
error carries a private marker and the path, so that leaking either is caught. The cases:
- an identity-read EIO before any write;
- the same error after a replacement regular file, or a symbolic link, was put at the path;
- the identity-read EIO with a secondary close failure carrying a different code (the original code wins);
- a zero-progress write whose cleanup `lstat` fails ("not inspected": no removal advice);
- a confirmed-own unlink failure (the existing "remove it" advice, as a control).

The new cases must fail on exact `8b1` for these causes and pass on the repair, with all 15 existing cases kept.
Narrow new mutants: the identity read moved outside the guard; no close on failure; a close error replacing the
original; the not-inspected state conflated with "remove it"; unlinking without an identity.
