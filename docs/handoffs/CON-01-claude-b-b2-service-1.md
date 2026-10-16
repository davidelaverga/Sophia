# Implementation-session handoff

Goal and attempt: FND-B2-CON-SERVICE (CON-01 service-mode replies), attempt 1, phases 1 and 2 plus the first review repair (FND-B2-SERVICE-REVIEW-R1)
Human owner / executor resource: Davide (merge; no merge, deploy or inference authority held here) / Claude Code session (Claude B) on Davide's Mac, worktree `sophia-con-service`
Native session: none (a coding session, not a runtime attempt)
Starting worktree/commit: `sophia-con-service`, branch `foundation/con-service-20261016`, from sealed C1 `0a08e58c6a94462eb32bda17de255cd3e23027c7`
Ending commit/tree and changed files: phase 1 ends at `856499c1`, phase 2 at `d20612a4`, and the review repairs are `cb80fbe5` plus the commit carrying this record. A commit cannot name its own id, so that id and tree are in B's handback and on #393. The changed files are listed under Decisions and changes.
Writable scope: this worktree only. 0067, A35, `packages/dsh-bundle`, `config/runtime-unit.json` and its recorded profile lock, `docs/SOURCE_MAP.md`, this record, and the tests named below. No contract generation after phase 1 (C holds A36), and no applied migration edited.
Runtime unit: the pinned dsh `0.2.0-rc.2` runtime, rebuilt with `pnpm artifacts:record`. Its service mode is OFF in the committed profile.
Existing authority: P's FND-B2 packets (implementation, phase 2, service review R1). No provider call, live inference, grant, flag, login or credential.

## Outcome

- **0067 / A35** record each reply attempt's execution, as dispatched, in immutable provenance:
  - a pinned service tuple `{execution:'service', routeId, executorArtifactDigest}` on the grant lineage;
  - a dispatch-time `conversation_dispatch_provenance` row;
  - its projection in hello;
  - a typed `RuntimeReceipt.executor`, which a service retire must carry.
- **`ReplyServiceExecutor`** (`packages/dsh-bundle/src/reply-service.ts`) answers each reply with one in-process call: the public `ctx.llm.prepareCall` and its single-use `stream`, with no session id, Agent, home or tools.
  - The sequence is claim, go, `delivered`, the opening observations, a counted reservation before the call, then the call.
  - It settles only from a completed response's usage. Anything else ends in a `failed` receipt, and the reservation stays counted as uncertain.
  - Stop aborts and drains. Its own 120 s deadline aborts the call independently.
  - Retire names the executor only for its own attempts, or for ones adopted under the exact tuple. Nothing is dispatched again after a restart.
- **Review repair R1:**
  - A superseded lease now fences service replies: the executor is disposed, the call aborted, and the bridge goes not ready.
  - A receipt left unconfirmed after a transient failure is kept, with its exact identity, in the bridge's retained queue until acknowledged. An unconfirmed `delivered` is followed there by a terminal `failed`. A 4xx refusal is not retained.
  - Claim, go, preparation and every receipt request are bounded by the request wait as well as Stop.
  - `docs/SOURCE_MAP.md` 2j registers the upstream semantics relied on.
- **Review exchange 2 (#393, on `cb80fbe5`):** each attempt of the bridge's retained receipt delivery is now bounded (`receiptWaitMs`, default 10 s). A request the service accepts but never answers is retried rather than blocking every later receipt, Stop and retire included, and shutdown's flush. This applies to native receipts as well: a timed-out batch is sent again, and the service deduplicates by command and stage.
- **Missing:**
  - A production context assembler. Today an ordinary Ask's create is denied as `not_dispatched` if dispatch wins the race (B2-assembly-intake-delta). The joined tests assemble with owner-run setup and pause dispatch for it. Production is not proved.
  - Service mode is unavailable until an operator pins a grant, sets the digest variable and enables `replies`, and the owner approves the context classes.
  - No live provider has been exercised.

## Evidence

- `tests/unit/reply-service.test.mjs`: 31/31. It uses the real wire validators, ReplyDelivery, ReplySettlements and, for stalled bodies, the bridge's own ServiceTransport against a local HTTP server.
- `tests/integration/conversation-service.test.mjs`: 12/12 on a fresh private PostgreSQL 17.11. The stack is the real pinned dsh, pi-ai and OpenAI SDK, a local Responses double with a dummy key, the real API, worker and restricted logins. The cases:
  - a complete answer, with one request;
  - 429 and 503 each make exactly one request and publish no answer, with the reservation left uncertain;
  - wrong scope, and a native lineage, dispatch nothing;
  - late withdrawal, erasure and member removal publish no answer;
  - SIGKILL restart with adoption, and no redispatch;
  - TWO LIVE runtimes: the superseded one aborts its held call and goes not ready. Nothing is published, no second request is made, and the cost stays uncertain;
  - zero-reservation restart;
  - another digest gets no retire.
- `pnpm check`, format and lint: see B's handback for the run on the final head.
- Source register: `docs/SOURCE_MAP.md` 2j (CON-B2-PREPARE, CON-B2-ADAPTER-PREPARE, CON-B2-NO-RETRY).
- Reviews:
  - #393 at `856499c1`: clean.
  - At `d20612a4`: three findings plus independent R/V findings, fixed by `cb80fbe5` and this repair.

## Decisions and changes

- **Changed:**
  - `db/migrations/0067_conversation_execution_provenance.sql`, `packages/contracts/amendments/A35-…` and the regenerated wire (phase 1);
  - `packages/dsh-bundle/src/{reply-service.ts, control-bridge.ts, index.ts, transport.ts, reply-child.ts}`: the reservation call now picks exactly its three source fields;
  - `packages/dsh-bundle/cordis.patch.yml`: the route `conversation-service-luna-high-v1` with the alias `openai-conversation`, capped at 4096. No `replies` key;
  - `config/runtime-unit.json` and the profile lock (bundle identity);
  - `docs/SOURCE_MAP.md`;
  - the tests and support named above.
- **Preserved:**
  - native review, research and resume behaviour with service mode off. R found the affected method bodies byte-identical;
  - 0064 bytes;
  - S3 candidate pins.
- **The executor's digest** is an operator-supplied environment variable. It is never inferred or self-hashed.

## Remaining obligations

- The production assembler binding (FND-B2-ASSEMBLY-INTAKE-01) waits for P/V triage and a census number. Until it exists, the hosted reply is not ready.
- The Q13 assembler login is not activated, and S3 is not promoted.
- The fixed `SERVICE_SYSTEM` wording needs product review. No `sophia-conversation-v1` role asset exists; it is needed only for the native path.
- At most one more review exchange on #393 under the two-exchange rule.

## Ordinary Ask binding (FND-B2-ORDINARY-ASK-ASSEMBLY-01, FND-B2-Q13-FIXTURE-LIFETIME-01)

- **0070_conversation_assembler_role_binding.sql** is role, grants and policies only, by exact diff against 0064. It contains:
  - the S3 candidate's role block with its ORIGINAL Q13 guard, byte for byte: no member, and nothing of its own anywhere in the cluster, so a second installation in one cluster is refused;
  - EXECUTE on the five entry points and the two claim-bound helpers;
  - the Q13 read-identity check, unchanged;
  - the read grants;
  - 19 ALTER POLICY and 19 restrictive claim-bound policies.
  - No object is created or replaced; no login or credential is made.
- **0071_conversation_context_before_dispatch.sql:**
  - `conversation_dispatch` defers a pending create whose only ineligibility is a context not yet recorded, until `created_at + conversation_context_wait()` (120 s). After that it is denied with `context_unavailable`. Every other denial is unchanged.
  - `conversation_ask` refuses at once (`blocked`, `context_assembler_unbound`) when the role has no admitted login.
  - The wait is derived from the worker's limits and pinned by `apps/worker/src/assembly-wait.test.ts`: 2 + 3×30 + 2×7 + 7 = 113 s ≤ 120 s.
- **Worker:** after a committed `waiting for reply context` deferral, the same pass calls `assembleReply` once through the optional `SOPHIA_ASSEMBLER_DATABASE_URL`, with `ASSEMBLY_LIMITS` held to `checkedLimits`. There is no new loop.
- **Tests and fixtures:**
  - `test:db` serializes its files.
  - test-support gives each migrated fixture one synthetic, bare assembler login, or none on request. It cleans up even after a failed setup, and `drop` may repeat. These logins are test bindings, not Q13 admissions.
  - persistence `runtime.db.test` closes its file fixture before the reconcile group makes its own.
  - `conversation-runtime` parks the installed role in a rolled-back transaction to install the sealed candidate fresh, asserts 0064's own footprint and 0070's grant isolation, and expects 0070's ACLs on exactly the seven functions.
  - `db-test` drops its database in `finally`.
  - New `conversation-assembler-install.db.test.ts`: the guard refuses a second installation (dependencies only, member only, both). CONNECT is not assembly authority. A fresh install succeeds after teardown.
  - New `conversation-context-dispatch.db.test.ts`: unbound refusal; deferral then dispatch after a real `assembleReply`; `context_unavailable` once the wait has run out; other denials unchanged; a withdrawn question is never dispatched.
  - The exclusive admission test gains a migrated-schema (0070) case.
  - `conversation-service.test.mjs` runs unpaused through the ordinary worker path. CI's PostgreSQL job runs it after the native crossing.
- **Evidence** (private PostgreSQL 17.11):
  - `test:db` 991/991;
  - SQL 67 migrations;
  - crossings 17/17 (12 service + 5 native);
  - exclusive Q13 admission 6/6 on an owned cluster;
  - `pnpm check` 0.
  - PostgreSQL 16: only the ordinary suites through CI. The exclusive admission on 16 is not run (no local 16 binary; the CI service is not an owned cluster).
- **Limits:** the CI database job keeps its 20-minute deadline; serialized `test:db` took about 4–5 min locally. The production login, its activation and service mode stay off.

## Next bounded action

Check the automatic review on #393's repair head once. Then implement the assembly binding exactly as P/V triage it, in this worktree, with its census-numbered migration.
