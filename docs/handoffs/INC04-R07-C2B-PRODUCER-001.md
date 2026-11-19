# INC04-R07-C2B-PRODUCER-001: the C2B call-observation producer, delivered to the original ledger (Stage A)

**Who.** SAME Native1, the existing session. One exclusive worktree `/home/user/Sophia-r07-c2b-producer-001` on branch `inc04-r07-c2b-producer-001`.

**Status.** An **uncommitted** candidate on the accepted backend base, frozen for the SAME independent reviewer. There is no commit, push, PR, ordinary run, `pnpm check`, publication, merge, deployment, activation, real provider call, native or account effect, billing or voice. Every hold remains (§7).

## 1. Intake and ACK (recorded before any effect)

**Dispatch.** `TASK.md` (14587 B, `4b896dd5…`) and its context zip (604114 B, `e1471d78…`, 11/11 SUMS OK). Readiness `4261cf1d` (E01–E05), with Root adoption of the exact lease.

**Addendum.** ROOT FOOTPRINT ADDENDUM 001 (`ADDENDUM.md` 3871 B, `e7bd50ac…`; context 26553 B, `083c8baf…`).

- Three paths are added, for 22 in total: `tests/support/fixture-service.mjs`, `tests/support/mock-responses.mjs` and `patches/README.md`.
- Their acceptance was recorded before any edit to them. Each base blob was re-verified at abeb.

**Base.** `abebbbad0c25087697d4c27bf759f950a63855d9`, tree `e6caaa57…`, sole parent `0261a78f…`.

- `0261` was fetched by object ID (FETCH_HEAD only, no remote ref).
- The backend bundle was imported into one intake ref, `refs/intake/c2b-producer-001/abeb`. Its raw commit was checked against `raw-commit.txt`.
- All 4270 tree leaves match the inventory: 0 mismatches, 0 extra.

**The four old local commits** on `claude/kind-hawking-j07uzz` (`091a3b69`, `0f6381b6`, `86baf1ea`, `da914cb5`) are preserved and were never pushed.

- None is an ancestor of `0261`. Their merge base is `953e5dc3`.
- `git cherry` marks all four `+`: none is patch-equivalent in `0261`.
- `0261` carries the separately integrated INC01-CC-002 lineage (`db414c02`, `7629c104`, `30813cd5`), so no duplicate merge is made or proposed.

**Environment.**

- Pinned Node 24.21.0, pnpm 11.7.0, umask 022.
- A **private** pnpm store at `/var/tmp/r07-c2b-producer-001-store`. No shared store or runtime was edited.
- PG 16 on the new free port 55573, under `/var/tmp/r07-c2b-producer-001-pg55573/{data,log,sock,secret}` (§6).

**Disclosure.** `pnpm toolchain:check` runs pnpm's own dependency verification. Here it performed the normal frozen install into the private store; nothing outside the worktree and that store changed.

## 2. What the slice does

**The producer (two revised patches; no third).**

- pi-ai records a private, non-enumerable observation, only when asked (`callObservation: true`). It holds:
  - the transport status and `x-request-id` (N2);
  - a typed error's status and request id;
  - the `response.created` id (N1);
  - the first actual provider terminal, with its own id and the raw `input_tokens`, `cached_tokens` and `output_tokens`.
- dsh-llm-pi-ai asks for it only on `openai-responses`, and only when the cordis capability `sophiaC2bObservation` resolves at call time with version `sophia-c2b-observation-v1`. It then interleaves at most three frames into `llm/stream`, each once and in order, just before the event they precede:
  - F1, transport;
  - F2, the first **supported** created N1;
  - F3, the terminal or error.
- Each payload is a frozen, non-enumerable, non-writable own property. Without the capability, with another version, or on any other API, the chunk stream is byte-for-byte C1P's.
- Patches, lock and hashes: [patches/README.md](../../patches/README.md). Upstream passages: [SOURCE_MAP §2u](../SOURCE_MAP.md).

**The consumer (`packages/dsh-bundle`).**

- **`c2b-observation.ts`.**
  - It decodes every chunk through own data descriptors only. No getter, `toJSON` or `cause` is ever invoked.
  - A frame's payload is validated closed. A reserved key on a known chunk kind is removed by rebuilding the chunk from its own data fields.
  - An accessor, an unknown kind carrying the key, or an unreadable `type` gets one fixed, value-free error.
  - `CallObservation` merges the delivered frames first-known: provenance unions, at most one sticky witness per dimension (≤ 8), counts only with a terminal, and the A58 delivery stage.
- **`control-bridge.ts`.**
  - Its prepended global `llm/stream` listener removes frames on **every** branch: unbound, refused, unpriced and metered.
  - The capability is provided only after that listener is installed, and only when some route qualified. It is withdrawn first on stop.
  - A qualified route reserves with `facts: "observed_v1"`. An ACK that does not echo exactly that is refused before any provider effect, with no fallback.
  - Settlement adds `evidence.observed` only on an opted-in reservation.
- **`reply-plugin.ts`.** The reply meter strips frames too.
- **`index.ts`.** C1P is requalified on the new loaded runtime digest `sophia-tree-v2:sha256:93e1e0de…`, and `C2B_RUNTIMES` is the same digest. Each route logs `call_observation route=<id> observed=on|off reason=<why>`.

**Kept unchanged.**

- C15′: the A57 fields and C1P money.
- R3: `inputTotal` alone makes no class known.
- The baseline N1 in `finish.replayState`, the only N1 in generic replay.
- A57, 0109, A58, 0110, all backend, persistence and generated code, the manifests, `cordis.patch.yml` and every other SDK.

## 3. Footprint (19 of the 22 authorized paths)

The **changed** paths:

- the two patches;
- `pnpm-lock.yaml`, the two patch identities only;
- `packages/dsh-bundle/src/{index,control-bridge,reply-plugin}.ts` and the new `c2b-observation.ts`;
- the new `tests/unit/c2b-observation.test.mjs` and `c2b-sdk-patches.test.mjs`;
- `tests/unit/bridge-core.test.mjs` and `reply-plugin.test.mjs`;
- `tests/integration/call-evidence.test.mjs`;
- `tests/support/fixture-service.mjs` and `mock-responses.mjs`;
- `config/runtime-unit.json` and `config/dsh/profile/pnpm-lock.yaml`, by `artifacts:record` only;
- `docs/SOURCE_MAP.md`, the new §2u only;
- `patches/README.md`;
- this handoff.

`tests/integration/{usage-provenance,reply-runtime,conversation-service}.test.mjs` needed no change.

**`reply-plugin.test.mjs`** now imports `dist/reply-plugin.js`, because the source module's sibling `.js` import does not resolve under type stripping.

**`mock-responses.mjs`** gained explicit, test-only options. Every default is unchanged.

- `requestId`, `cutAfterHeaders` and `errorEvent`, as the addendum named.
- **`delayBeforeCreatedMs`, beyond the addendum's list (disclosed here).** It flushes the headers, then holds before `response.created`, so Stop can land after F1 and before any created N1.

## 4. Evidence (pinned toolchain, private store; logs and counters in FINAL-A)

**Patches.**

- pi-ai `81cfd171…` (14,359 B) and dsh-llm-pi-ai `96f9dbd5…` (10,584 B), made by `pnpm patch`/`patch-commit`.
- The lock changes only those two identities, at every occurrence.
- The deployed runtime holds exactly one copy of each package. Its patched files are byte-equal to the workspace's.

**Artifacts.** The final normal `artifacts:record` (log 82) reproduced the recorded `runtime-unit.json` and profile lock byte for byte. `pnpm artifacts` VERIFY (log 83) reports **8/8 match**:

- runtime digest `93e1e0de…`;
- Sophia bundle `5ab32340…`;
- workspace lock `7e7bb011…`.

**Statics.** `format:check`, `lint`, `build`, `typecheck` and `contracts:check` all exit 0. Prettier and oxlint both ignore `packages/dsh-bundle/**` and `tests/**` by repository policy. The bundle is covered by its own `tsc` build and the typecheck.

**Unit.**

- `c2b-observation` and `bridge-core`/`reply-plugin`: 99/99.
- `c2b-sdk-patches` 14/14, driving the **deployed** patched adapter against the double through these endings:
  - activation;
  - grammar and privacy;
  - zeros and partial counts;
  - failed N1, unsupported ids and over-bound;
  - an error event, HTTP 500 and a transport cut after headers;
  - a consumer return after F1 and after F2, and a consumer throw, all with no drain;
  - a caller abort;
  - retry isolation.
- The full `pnpm test` result is in §4a.

**Integration on the owned cluster (serial).** Each suite ran against the real pinned runtime, real bridge, real API and PostgreSQL:

- `call-evidence`, which includes the producer crossing below and every wrapper;
- `usage-provenance`, `reply-runtime` and `conversation-service`;
- the backend `research-call-evidence.db.test.ts` (57/57). It includes "an account-backed review stays refused", the unchanged backend refusal.

**The single producer → real API HTTP → original PostgreSQL crossing.** This is the test "C2B producer: the real runtime's observed facts reach the original ledger…", running the real deployed runtime against a local Responses double through a recording pass-through to the real API.

- The bridge's own reserve carries `facts: observed_v1`, and the real API's ACK echoes it.
- The identity row on the original ledger equals the ACK binding exactly: evidence, call, attempt, native session, project, runtime unit, resource, operation, provider and payer (project, so no account, grant, connection or qualification).
- The bridge's own settlement carries:
  - a worst-escaped 8192-byte N1 (`\u0001`, 6 B per byte, in both the A57 `responseId` and `observed.n1`);
  - a worst-escaped 8192-byte N2 header (`\\`);
  - the raw counts.
- It lands on the same row (`facts_version 2`, delivery `none`, both ids kept whole, C1P money).
- Replaying the exact bytes as the same bridge instance, and again after an API restart, returns the recorded disposition. The digest, history count, reservation state, settled amount, reservation count and project spend are all unchanged: no double charge.
- The ids exist only in `research_call_truth`. They appear in no other table, the bridge journal, the runtime log or the API log.
- The same serializer output, rebound to each wrapper's own opted-in reservation, settles under the real body limits: research (2 MiB), design (1 MiB) and source review (256 KiB).
- The existing backend tests keep the full worst-escaped envelope with all eight witnesses, at every wrapper under its parser limit, and the oversize and malformed refusals.

**Causal mutants** (each an exact single replacement with a byte-exact, sha256-checked restore; SDK mutants only in a scratch copy of the deployed packages whose other dependencies resolve by symlink, so no store was edited):

| Id | Mutation | Result |
|---|---|---|
| M01 | the stripper also yields the frame | killed (3 tests) |
| M02 | rebuild by spread instead of own data fields | killed (3) |
| M03 | an enumerable payload accepted | killed (1) |
| M04 | the witness not sticky | survived at first; the sticky test gained a second competing value; **killed** (1) |
| M05 | the unbound branch not stripped | killed (1) |
| M06 | the ACK `facts` check removed | killed (1) |
| M07 | the capability withdrawn last | killed (1) |
| M08 | the unpriced branch not stripped | survived at first; the bridge test gained the bound-unmetered branch; **killed** (1) |
| M09 | the reply meter not stripped | killed (1) |
| S01 | DA: any capability version | killed (1) |
| S02 | DA: an enumerable frame payload | killed (1) |
| S03 | DA: F2 for an unsupported created id | killed (1) |
| S05 | pi-ai: a missing `cached_tokens` becomes 0 | killed (1) |
| S04 | DA: `if (record === void 0 \|\| crossed.terminal) return;` → `if (record === void 0) return;` | **equivalent, not killed** |

**Why S04 is equivalent.** Its variant changes behaviour only if `frames.before` runs again after F3. No reachable path does that:

- pi-ai's `AssistantMessageEventStream` (`dist/utils/event-stream.js` `29a6bb6b…`, lines 35–41 and 82–94) is complete at the first `done` or `error`, and its `push` drops every later event.
- DA's `toStreamChunks` returns at both of those cases anyway.

The externally visible guarantees are tested directly instead:

- the F1/F2/F3 ordering, each once, before usage and finish, on the real adapter;
- late, duplicate and excess frames ignored by the consumer;
- all frames stripped.

### 4a. Final matrix on the final record

These ran after the final record (log 82) and VERIFY (log 83), serially on 55573, after a clean census: no test process, no fixture database or login, no client backend.

| Log | Run | Result |
|---|---|---|
| 84 | `pnpm test` (no database URL) | 5414 tests: 5347 pass, 0 fail, 67 skipped (the suite's own DB-gated and conditional cases) |
| 90 | `call-evidence` | 47/47, including the producer crossing |
| 90 | `usage-provenance` | 32/32 |
| 90 | `reply-runtime` | 13/13 |
| 90 | `conversation-service` | 39/39 |
| 91 | backend `research-call-evidence.db` | 57/57 |
| 92 | `c2b-observation`, `c2b-sdk-patches`, `bridge-core` and `reply-plugin` | 113/113 |

## 5. Attempts that failed or were cancelled (kept; a later pass erases none)

| Log | What happened | Cause | What changed |
|---|---|---|---|
| 20 | bundle build exit 2 | TS2322: `sent` was not narrowed in `c2b-observation.ts` | narrowed via `sentValue` |
| 24, 32 | the reply-plugin unit test failed | under type stripping, the source module's `./c2b-observation.js` import does not resolve | the test imports `dist` |
| 26 | 3 `c2b-observation` failures | the test helpers built payloads with `undefined` members (not A58-valid), and the wire test used a non-uuid reservation | the helpers JSON-roundtrip; a uuid is used |
| 28, 29 | SDK test failures (10, then 1) | a queued double step left over from the completions case, and the double's per-request id numbering | a `null` script skips the queue; numbering is normalized |
| 35, 38 | `call-evidence` failures (12, then 4) | expectations predating C2B: no `observed`, tampered bindings without the `facts` echo, the double's default `cacheRead: 0`, and the wire refusal for another facts version | expectations corrected; the adverse ACK cases kept |
| 40 | crossing failed | the bridge's settle was 200 and its body passed; the test's own ledger query returned no row | the test query was corrected |
| 41–43 | crossing failed, 409 "Runtime lease superseded" | the bridge's settle had passed; the **test's replay** used a fresh `x-sophia-bridge-instance`, which supersedes the live lease (as designed) | the replay resends as the bridge's own instance (log 44 passed) |
| 46 reply-runtime | load failure | `apps/execution-host/dist` was not built in this worktree | `pnpm build` (log 47); log 48 passed 13/13 |
| 46 conversation-service | 2 failures, then cancelled | the same missing dist. I started the 48 loop while the 46 loop was still running this suite, so the two **overlapped**; I then stopped my stale 46 run's process group with a normal SIGTERM | no code change |
| 48, 49 | conversation-service: suite hook failed, 28 cancelled (also alone, in 49) | the SIGTERM skipped run 46's `after` hook. Its fixture logins (`sophia_*_t_b1ecb8437f33`) and database `sophia_t_f7fe425f2dc5` stayed on my cluster, and 0070 then refused `sophia_conversation_assembler` ("unexpected memberships"), shown by the TAP run 50 | the fixture's own `drop()` statements, once, by exact name, on 55573 only. Counts after: 0 members, 0 databases, 0 logins. Log 51 passed 39/39 |
| 63 | 1 reply-plugin failure | `dist` still held the last Sophia mutant (M09). Restoring the source does not restore build output | rebuilt (log 64); 99/99 (log 65); the driver now rebuilds after restore |

**Since then.** Database integration runs are serial on 55573, with a process census before each. Two earlier census counts of 2 or 3 were the census command matching itself.

## 6. PostgreSQL 55573 (owned, disposable)

- **Created after a fresh census.** Dirs are 0700, the secret 0600. The password never appears in a log or archive, and the URL is built inside the runner only.
- **Authentication.** Positive rc 0. A wrong password and no password were refused, and uid 65534 was denied at the unix socket.
- **The only data change outside tests** was the targeted teardown in §5.
- The stop lifecycle is in FINAL-A.

## 7. Limits and holds

**Limits.**

- Local double and dummy keys only. Nothing establishes live provider behaviour, provider-billed amounts, any cache-write class or contributed-account review eligibility.
- A consumer return after F1 or F2 is proven at the adapter boundary. Through the agent loop, Stop is an abort: the loop reads one more chunk, so the abort F3 crosses with no provider terminal, and the delivery stage is `none`.
- Old pre-patch copies (`fc9c52c8…`, `e61fcb0f…`) remain unreferenced in this worktree's own virtual store. The linked and deployed copies are the new ones only.
- The bridge does not compute `cross_c1p`; the server derives it (0110).

**Holds.** GOV, Luis, RTA, Personal 9e, default-off 8c and its erratum, the 9ed cancellation, the native owner, the deployed app and the full mission all remain. Voice remains user-suspended.

The four old local commits stay unpushed.

---

## R1 (C2B69-F01, C2B69-F02): one distinct successor to the rejected 69e4

**Inputs.**

- Dispatch: `TASK.md` (11610 B, `e5f6651a…`) in its context `928519cd…` (6/6 SUMS).
- REVIEW `0232799a…`: CHANGES_REQUIRED, F01 and F02.
- Root adoption: E01–E09.
- My external ACK/plan before any effect: `ACK-R1.md` `3442a804…`, in `ACK-R1.zip` `5870a3cb…`.

**69e4 is history, unchanged.**

- Its tree `69e469393fa1a4b61f9a1bbd3b59001c935b6a1c` (4274 leaves, 19 changed), its packet `dde0cbc9…` and everything above this line stay as they were.
- R1 has its own tree, given in its FINAL-A. HEAD stays `abebbbad`, with no commit.

**R1 footprint.** Of the 12 permitted paths, R1 changes:

- the pi-ai patch;
- `pnpm-lock.yaml`, the pi-ai `patch_hash` only;
- `config/runtime-unit.json` and `config/dsh/profile/pnpm-lock.yaml`, by `artifacts:record` only;
- `packages/dsh-bundle/src/index.ts`, the two qualified digest rows only;
- `tests/unit/c2b-sdk-patches.test.mjs`, `tests/support/mock-responses.mjs` and `tests/integration/call-evidence.test.mjs`;
- `patches/README.md`;
- `docs/SOURCE_MAP.md`, §2u rows only;
- this handoff, as an append.

The dsh-llm-pi-ai patch did not need to change. No other 69e4 code (decoder, bridge, reply) changed.

### R1.1 C2B69-F01: typed HTTP facts only from the request's own rejection

**The defect (the review's static counterexample).** The 69e4 pi-ai producer recorded `typedError` in the outer `catch` from any `Error` with a numeric `status`. That try also spans:

- client and parameter construction;
- the awaited `onPayload`, before any HTTP;
- `onResponse`, after the headers;
- the stream;
- the local ending checks.

The adapter turns `typedError` into `sent`, `httpStatus` and N2 (`typed_error`). So a local error could have become transport evidence. Narrowing the class alone would not fix it, because a callback can throw the SDK class itself.

**The repair, in the pi-ai patch only (normal `pnpm patch` / `patch-commit`, private edit dir and store).**

- The outer-catch capture is removed.
- A scope now wraps exactly the awaited `retryProviderRequest(() => client.responses.create(params, requestOptions).withResponse(), …)`. It records `typedError` only for `OpenAI.APIError` with a numeric `status`; both fields are read as own data properties. It then rethrows the same error.
- Error handling, C1P counts and money, and the no-observation (v1) path are unchanged.
- The successful header capture is unchanged.

**Why that scope is the boundary.**

- `onPayload` runs before it and `onResponse` after it.
- `retryProviderRequest` (`f14a8cfb…`) only rethrows the SDK's rejection, or throws local abort and delay errors that carry no status.
- Sophia's adapter passes `maxRetries: 0` and forwards neither callback. Nothing was added to forward one.

**Identities.**

- The patch is now 16,233 B `21b71bed…` (was 14,359 B `81cfd171…`).
- `dist/api/openai-responses.js` is now `495d1870…` (16,488 B; was `130c355e…`).
- The other three patched files are unchanged.
- The loaded runtime digest is now `sophia-tree-v2:sha256:874b64ea…`, so `C1P_RUNTIMES` = `C2B_RUNTIMES` = that digest.

**Bodies read.** The one additional public body is openai 6.40.0 `client.mjs` (`45b54e0c…`), line 693 only, disclosed in the ACK. The other bodies (`provider-retry.js`, `core/error.mjs`) are within the existing scope.

**Controls, executed on the deployed patched public pi `stream` with the deployed `openai` carrier and the local double:**

| Control | Before R1 (69e4 producer) | R1 |
|---|---|---|
| (a) `onPayload` throws a generic `Error` with `status` 503 and a `requestID` | FAILS | 0 requests reach the double; the record is empty (no `transport`, no `typedError`) |
| (b) `onPayload` throws a real `OpenAI.APIError(503, x-request-id)` | FAILS | same as (a) |
| (c) `onResponse` throws an `APIError(418, forged id)` after genuine headers | FAILS | `transport` is the genuine `{200, genuine id}`; no `typedError`; the forged id is absent |
| (d) a real HTTP 500 with `x-request-id` | passes | `typedError {500, id}` only (positive kept) |

**Fail-before evidence.** (a), (b) and (c) fail with the exact 69e4 `openai-responses.js` placed in a private overlay of the deployed packages.

**Causal check.** With R1's capture call removed, (d), the adapter-level HTTP 500 test and the two-calls test fail.

**Retained.** The adapter-level HTTP 500, known zeros, missing cache, provider terminals and the local abort.

**Overlay.** The store was never written: only DA and pi-ai were copied, and the other dependencies are symlinks.

**Source-only conclusions, kept separate (read, not executed).**

- `onPayload` and `onResponse` lie outside the scope; `retryProviderRequest` runs no user code.
- Sophia's adapter passes no custom `fetch`: its call options are the profile options, temperature, max tokens, session id, signal, headers and `callObservation`.

**Not examined (a limitation, not a claim).** Whether a caller-supplied custom `fetch` could make the SDK reject with an `APIError` with a numeric status without a real peer response. Only line 693 of the SDK's `client.mjs` was read.

### R1.2 C2B69-F02: honest double counters and completion

**The defect.** In `tests/support/mock-responses.mjs`, `send()` was a no-op once the client closed, yet a delayed handler still incremented `terminalSent`.

**The repair.**

- `send()` returns whether it wrote, and `terminalSent` counts only a terminal actually **written**.
- `whenSettled(ms)` resolves when every streamed handler has finished, on every exit path. It rejects with a fixed error at its bound. It is not a sleep.
- Default answer bytes and option-less scripts are unchanged.

**Controls (SDK level).**

- An ordinary completion counts exactly one written terminal, after real completion.
- Each of these counts **zero** written terminals after the delayed handler really finished, with the stream abandoned and no drain:
  - a consumer return during `delayBeforeCreatedMs` (after F1);
  - a consumer return and a consumer throw during `delayMs` (after F2);
  - a caller abort.
- With only the written-terminal gate reverted, those three tests fail; the ordinary positive passes.

**Controls (`call-evidence`).** Both Stop cases now await `whenSettled()` before reading the counter.

**Kept distinct.** A double's written terminal is not proof that a client consumed it, or that a provider billed it. The delivered frames, the abandoned stream and the SDK no-more-read controls remain separate from the double's counters.

### R1.3 Errata to the 69e4 text above (kept as written there)

- **E1, the "67 skipped" in §4a.** These are conditional, headless, log-compat and root-related source cases, not 67 database tests. The four whole LiveKit suites are separate markers and were not run (E05).
- **E2, the execution trees.** The 69e4 final focused runs started at tree `71d83f5b…`, and the record and full-unit runs at `2a48995a…`, not at the sealed `69e4…`. The packet did not independently prove the transition was documentation-only (C10, E08). R1 archives start and end trees and per-path bindings for each run.
- **E3, the 69e4 inventory.** Its added-file rows were malformed multi-line rows (E01). The tree and patch remained the proof. R1's inventories are NUL-safe.
- **E4, the PG 55573 stop.** The normal stop exited 0, with a reap and point absences (accepted). But the script printed rather than propagated the `pg_ctl` exit, the wrong-PID canary failed at the argv check rather than at a separate process check, and the uid 65534 unix-socket record was truncated, with no archived specific reason (E09). R1's cleanup on its own new cluster corrects the procedure. 55573 is not rerun.
- **E5, the privacy sentence in §4.** It covers the queried service tables, the bridge journal and the logs. It does not cover the baseline successful N1 in SDK `finish.replayState`, which is legitimate replay (E03).

All earlier adverse attempts (§5), the overlap, the cancellations, the targeted teardown, the initial M04/M08 survivors, the 13 kills and S04's equivalence (not a kill) stand as recorded.
