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
  - `conversation_dispatch` defers a pending create whose only ineligibility is a context not yet recorded, until `created_at + conversation_context_wait()` (120 s). After that deadline, the next dispatch pass that processes the row denies it with `context_unavailable`: the denial is recorded then, not at 120 s exactly. Every other denial is unchanged.
  - `conversation_ask` refuses at once (`blocked`, `context_assembler_unbound`) when the role has no admitted login.
  - The wait is sized from ONE reply's uncontended worst case under the worker's limits, and `apps/worker/src/assembly-wait.test.ts` pins that arithmetic: 2 + 3×30 + 2×7 + 7 = 113 s ≤ 120 s.
  - It is not a latency guarantee (V-B2-TIMING-CLAIM-01). `dispatchOnce` claims up to 10 rows and awaits each assembly in turn, so behind other assemblies a reply's first claim can start later than 2 s. Completion within 120 s across the queue is not proved, and no load was measured. A reply that runs out of the wait fails truthfully with `context_unavailable`.
- **Worker:** after a committed `waiting for reply context` deferral, the same pass calls `assembleReply` once through the optional `SOPHIA_ASSEMBLER_DATABASE_URL`, with `ASSEMBLY_LIMITS` held to `checkedLimits`. There is no new loop.
- **Tests and fixtures:**
  - `test:db` serializes its files.
  - test-support gives each migrated fixture one synthetic, bare assembler login, or none on request. It cleans up even after a failed setup, and `drop` may repeat. These logins are test bindings, not Q13 admissions.
  - persistence `runtime.db.test` closes its file fixture before the reconcile group makes its own.
  - `conversation-runtime` parks the installed role in a rolled-back transaction to install the sealed candidate fresh, asserts 0064's own footprint and 0070's grant isolation, and expects 0070's ACLs on exactly the seven functions.
  - `db-test` drops its database in `finally`.
  - New `conversation-assembler-install.db.test.ts`: the guard refuses a second installation (dependencies only, member only, both). CONNECT is not assembly authority. A fresh install succeeds after teardown.
  - New `conversation-context-dispatch.db.test.ts`: unbound refusal; deferral then dispatch after a real `assembleReply`; `context_unavailable` once the wait has run out; other denials unchanged; a withdrawn question is never dispatched.
  - The exclusive admission test gains a migrated-schema (0070) case on the owned cluster (R-B2-Q13-01 repair):
    - an owned empty outside database with PUBLIC CONNECT is held as an admission, actually connected and held as a session;
    - after its CONNECT is revoked, a fresh connection gets 42501, while the old client stays live and still holds;
    - once that client closes, `holds=[]`;
    - postgres and template1 are fresh-denied unconditionally.
  - `conversation-service.test.mjs` runs unpaused through the ordinary worker path. CI's PostgreSQL job runs it after the native crossing.
- **Evidence** (private PostgreSQL 17.11):
  - `test:db` 991/991;
  - SQL 67 migrations;
  - crossings 17/17 (12 service + 5 native);
  - exclusive Q13 admission on an owned cluster:
    - 6/6 at `3d9ba235`, where the migrated case was vacuous (no outside database was connectable, R-B2-Q13-01);
    - 6/6 after its repair, with the migrated case's holds observed at each step: admitted, session open, revoked with the old session holding, then `[]`.
    - After the run, the cluster had no test database, test login or client left. Only the migrations' own NOLOGIN group roles remained, with no member and no dependency. Then the cluster was removed;
  - `pnpm check` 0.
  - PostgreSQL 16: only the ordinary suites through CI. The exclusive admission on 16 is not run (no local 16 binary; the CI service is not an owned cluster).
- **Limits:** the CI database job keeps its 20-minute deadline; serialized `test:db` took about 4–5 min locally. The production login, its activation and service mode stay off.

## C1 carried with main 14e65afc (FND-B2-C1-CHAT-CARRY-01)

One normal merge of the qualified C1 2c60b408 into 71e2c935, with no conflict. It inherits 71 Studio and docs paths, each
byte-equal to C1's. Main 14e65afc changed 69 paths: 63 taken whole, 6 combined, and only OpenConversation resolved by
hand in C1. The rest are C1's read-fence case for formatted words and its records. The API, SQL, packages, root lock,
native host, worker, service executor, bridge, assembler, scripts, tests and CI are byte-equal to 71e2c935. The bundle
reproduces unchanged (sha256:e516779f8608b9246ec76f877d8af5fbe54e473dc0a84f9ceb49b3a3c59428dd), and contract
regeneration has no drift. Unit tests 3017 passed, 0 failed.

Corrections carried here, not in a separate commit:
- The 17 listening API/worker/restricted PostgreSQL/SDK crossings inject a synthetic Bearer test-actor verifier, not
  signed JWT verification.
- The 404 focused DB tests exclude the two empty gated exclusive Q13 groups. PostgreSQL 16 exclusive qualification is
  still owed.
- An earlier claim that the service executor settles usage after an errored or aborted call was wrong and is withdrawn.
  It settles only a completed response, and pi-ai's zero usage on error or abort stays uncertain.
- The native reply supervisor's skipped final sweep (review 4300538470) stays open as a native and BYO activation
  blocker. The service executor runs in the bridge process and is mapped separately. Every reply default stays off.

## Admission and bootstrap (FND-B2-ADMISSION-BOOTSTRAP-Q13-01)

Two findings on the published `8c18b032`, reproduced on a private PostgreSQL 17.11 cluster before anything changed.

**An assembler login without SET (#393 r4300923362), corrected in 0071.** 0071 and 0070 are unapplied: P confirmed
both absent from the applied ledger before this edit. A LOGIN otherwise bare but granted the assembler `WITH SET FALSE`
counted as admitted, so its Ask went `pending`, while the worker's `SET LOCAL ROLE` is refused (42501) and the reply
could only wait for `context_unavailable`. `conversation_assembler_admitted()` now also requires the edge to carry SET
and not ADMIN, exactly what the activation check holds (`assembler edge: admin option or no SET`). New cases in
`conversation-context-dispatch.db.test.ts`: the login's SET LOCAL ROLE is refused, and its Ask is blocked
`context_assembler_unbound` with no attempt or outbox. Before the edit that Ask case failed (`pending`); after it, 7/7,
and the legitimate login still defers and dispatches.

**0070 under a migrator that is not a superuser: not corrected, an owner choice.** CI's local Supabase applies the
migrations as its `postgres` role, which is not a superuser there, and 0070 fails with `sophia_conversation_assembler
exists with unexpected memberships` (run 38994941166, job 117285323339), so the auth tests never run. Reproduced with a
NOSUPERUSER CREATEROLE migrator owning the database: 0001–0069 apply, and 0070 fails the same way. The catalog shows why.
On PostgreSQL 16 and later, CREATE ROLE by a role that is not a superuser makes its creator a member: ADMIN true,
INHERIT false, SET false, granted by the bootstrap superuser. So the role 0070 just created is not bare, and its guard
refuses it. The same edge exists on `sophia_api` and `sophia_worker` (0002) and on every login that migrator makes.
- The creator cannot revoke it: `permission denied to revoke privileges granted by role "postgres"`.
- With it, the creator can grant itself SET or INHERIT, and can admit a login.
- A login it creates carries the same edge (the creator is its member), so 0071's and the activation check's "the
  login has no member" rule refuses every such login too.

Any remedy changes Q13's boundary, so the owner chooses:
1. Accept exactly the creator's edge on a role created in the same transaction: member `current_user`, ADMIN, no
   INHERIT, no SET, granted by the bootstrap superuser. Then the installation owner can become the assembler; it
   already owns every object the assembler reads or runs. The same rule for a login's creator edge in 0071 and the
   activation check.
2. Require a superuser installer for 0070 and for login admission. On hosted Supabase that means the assembler is
   never installed, and an ordinary Ask stays `context_assembler_unbound`. 0070 would also have to stand aside there
   rather than fail, or the auth job stays red.
3. Take 0070 and 0071 out of this source until a hosted bootstrap is designed, leaving Ask unbound everywhere.

None was implemented then. The owner later chose option 1 (D-Q13), implemented in the next section.

**PostgreSQL 16 exclusive qualification: implemented, not yet executed.** `scripts/q13-owned-pg16.sh` (on the runner)
and `scripts/q13-owned-pg16-inner.sh` (in the container), as one new step after the crossings in the database job.
- The image is the job's own postgres:16 service image, by id. The container has no network, runs as the image's
  postgres user, with 1 CPU, 2 GiB and no swap, 128 processes, a 1 GiB /tmp and five minutes. The repository and the
  job's Node 24.21.0 are mounted read-only. Nothing is pulled or installed, and the ordinary service is untouched.
- The inner script starts its own cluster on 127.0.0.1:55499 under `/tmp/con01-q13-owned-pg-*`, so the unchanged
  `requireOwned()` holds for real. It asserts PostgreSQL 16, the data directory, the parent's UID and 0700, and an
  empty entry census.
- It runs both exclusive groups and the install group. It requires 7 tests, 7 passed, no skip, the three suites and
  the four hold stages (admitted; old session open; revoked, old session open; revoked, old session closed `[]`).
- It ends with an empty census and the assembler role bare.
- Checked here: both scripts parse under dash. On an owned PostgreSQL 17.11 cluster the same tests produced exactly
  the required lines, and the exit census was empty, with the assembler role bare. The checklist also catches the
  skipped groups of an ordinary run. Whether the job's Node runs inside that image is known only when CI runs it.

Checks on this candidate:
- format, lint, typecheck and contracts are clean; unit 3017 passed, 0 failed, 70 skipped;
- `pnpm artifacts` reproduces, with the bundle unchanged at `sha256:e516779f…`;
- private PostgreSQL 17.11: `test:sql` 67 migrations; `test:db` 998/998 (the two exclusive groups skip there and are
  not counted); crossings 17/17 (synthetic Bearer verifier).

For the Personal record (no Personal commit): its "a companion on two API processes" case runs two runner instances
in one Node process, not two processes.

## The trusted creator (FND-B-Q13-TRUSTED-CREATOR-SOURCE-01, D-Q13)

Davide approved option 1 above, narrowed: only the trusted installation owner, and only on a role it creates fresh.
P forwarded V's fresh ledger census (0070 and 0071 still absent from all 51 applied rows) before 0070 or 0071 changed.

**Measured first, on an owned PostgreSQL 17.11 cluster shaped like hosted Supabase.** The bootstrap superuser
(OID 10) is not `postgres`; `postgres` is a plain CREATEROLE/CREATEDB login owning the database.
- CREATE ROLE by `postgres` gives the new role exactly one edge: member `postgres`, grantor 10, ADMIN true, INHERIT
  false, SET false. A new LOGIN gets the same edge.
- The edge adds no `pg_shdepend` row, so the cluster-wide dependency check needs no exception and stays as it is.
- The edge's `xmin` is the creating transaction.
- `postgres` cannot revoke the edge, and can add a second, self-granted SET edge.

**What changed.**
- **The trusted installer** is `postgres`, not a superuser, with CREATEROLE, owning this database and schema
  `sophia`: the owner the activation check already binds.
- **0070.** When 0070 itself has just created the role and that installer runs it (as `current_user` and
  `session_user`, with the default `createrole_self_grant`), it accepts the one creator edge. The edge must be exact:
  grantor 10 (a superuser), ADMIN, no INHERIT, no SET, written in this transaction.
  - It records that edge on the role: `COMMENT ON ROLE … 'con01-q13-fresh-creator v1 edge=<oid> installer=<oid>'`.
  - Anything else refuses as before, with the same message. That covers a role found already made, even by the owner,
    even with a forged record; any other installer; another edge or option; and a second installation.
- **`conversation_admit_assembler_login(name)`, new in 0071.** Only that installer can use it. It refuses a role that
  already exists or a non-default self-grant. Otherwise it:
  - creates the login (NOINHERIT, no attribute) and checks the same exact creator edge, made now, with no other edge
    and no dependency;
  - grants the assembler with SET, without ADMIN or INHERIT, and CONNECT on this database;
  - records the creator edge on the login.

  A superuser installation keeps admitting its logins as before.
- **`conversation_assembler_admitted()` and the activation check** excuse that recorded creator edge, from that owner,
  and nothing else. The 0071 SET-and-not-ADMIN rule (#393 r4300923362) and every other hold are unchanged.
- **Limits.**
  - The owner can still grant itself SET on either role, and could forge a record. A superuser could make an
    identical edge. The exception trusts this owner; it does not isolate the roles from it.
  - A role's comment is the record: cluster-wide like the role, readable in any database, writable only by holders
    of ADMIN on that role (the owner) or superusers. It adds no relation, grant or dependency.

**Proof: `conversation-assembler-trusted-creator.db.test.ts`.** It is gated by its own marker on an owned cluster
like the one above; ordinary `test:db` skips it, uncounted.
- Before, at `139f3997`: the owner's fresh install failed with the same error as CI's auth job, and the cases after it
  could not run.
- After: 7/7.
  - Refused before any grant, nothing left: another installer, the owner without the database or the schema, a
    non-default self-grant, and a found role with or without a forged record.
  - The fresh install has exactly the recorded edge; the role owns nothing and holds grants here alone; the ledger has
    0070 and 0071. A second installation is refused.
  - Admission: never an existing login, another caller or a non-default self-grant. The admitted login has exactly the
    creator and execution edges, and CONNECT on this database alone.
  - Its Ask waits for context. The login records the context under `SET LOCAL ROLE`, reading nothing without it, and
    the create dispatches.
  - The holds: fresh denial elsewhere, an old session holding after revocation until its client closes, then `[]`.
  - Drift stops both the holds and admission: another member, the owner's SET grant, an extra role, a missing or
    wrong record, the owner losing the database, and the edge replaced by another grantor's.
  - Without the record check, the pre-existing login is admitted: 4 cases fail.
- Unchanged on a superuser cluster: the exclusive admission and install groups 7/7, `test:sql` (67 migrations),
  `test:db` 998/998.
- **CI.** `scripts/q13-owned-pg16-inner.sh` now runs this group on a second owned PostgreSQL 16 cluster shaped the same
  way. It requires 7/7, the four hold stages, no skip and an empty exit census. That has not run anywhere yet, and
  neither has the Supabase-local auth job on this source.

## Current C1 f76 carried in (FND-B-Q13-CURRENT-C1-F76-CARRY-01)

One normal merge of #385's `f76f5776` (current main `21516687`, the 20 s projection read bounds, the LiveKit test
contract and failure-only partial stops) into `94f0434f`, both parents kept. The merge base is `2c60b408`.
- **No conflict.** The one path both sides changed, `packages/persistence/src/index.ts`, combined automatically: B2's
  exports plus C1's `ServiceControl` type.
- Every other path is exactly one side's blob: the 44 C1 paths are f76's, the 42 B2/Q13 paths are 94's.
- Kept exactly: 0070 `be17d906`, 0071 `3b1ea9b2` and the Q13 guards; C1's `livekit.ts`, `tx.ts`, `host-acts.ts`, the
  Studio and its 55 guards.
- No feature, dependency, lock, migration or contract name was added. Ask and paid defaults stay off.

**Checks on the merged tree.**
- Typecheck and contracts pass.
- On owned PostgreSQL 17.11:
  - the trusted-creator group passes 7/7, on a cluster whose `postgres` is a plain installer;
  - on a superuser cluster: the exclusive groups 7/7, with the four hold stages; `test:sql` 67 migrations; `test:db`
    1000/1000. The three gated groups skip there and are not counted.
- PostgreSQL 16 (both helper phases) and the Supabase-local auth job have still not run on any composition.

**Evidence precision (R on `94f0434f`).**
- The saved COMMENT-negative probe (`03-probe-comment`) fails at `SET ROLE` before its COMMENT. It does not show that
  COMMENT ON ROLE is denied directly.
- The creator-edge record is the trusted owner's attestation, not isolation against that owner.

## Byte-backup test contract carried (FND-B-BYTE-BACKUP-ACCEPTED-CARRY-01)

The concurrent-copy case failed 0 of 2 in this line's check above; its cause remains unknown. C's accepted test
correction (R accepted `ce82b18b`; R-BB-3E76-1 closed) reached this line through current C1 only.
- On C1 (`f76f5776`): cherry-picked `3e767e96`, then `ce82b18b`, never their B2 parent. The delta is byte-identical
  to the accepted one: `apps/api/src/byte-backup.test.ts` → `064bd54d`, plus C's handoff.
- Here: one normal merge of that C1 head, no conflict. Only those two paths change.
- Unchanged: the backup product code (worker `73cfb030`, backup `e8240713`, quota `1fafb2f1`, store `007396af`), the
  quota test, 0070/0071 and every Q13 guard.
- It changes a test, not the product: exactly one admitted put under a real write-once claim, an injected
  journal-lock refusal, and a fixed 100 ms caller and 300 ms lock control that fails rather than passes when the
  deadline comes first. It does not explain the original failure.
- C1's own check on its new head passed; this composition's check is in B's handback.

## Two P1s on `2017330d`, and the PostgreSQL 16 fixture (FND-B2-TWO-P1-FOCUSED-REPAIR-01)

R found both of #393's new P1s valid, and found CI's PostgreSQL 16 failure to be a fixture authenticating without a
password. Each was reproduced on unmodified `2017330d` before any change (B's logs).

**A call that outlived its delivery (4302482622).**
- **Before:** the reply's delivery deadline (call 120 s + 30 s) started before the opening observations and
  preparation, but the call got a fresh 120 s of its own, and the settlement a fresh allowance.
  - Scripted with a virtual clock and the production bounds: the call began at 42 s and completed at 161 s.
  - Its usage was settled at 161 s; its answer then failed against the expired deadline (`observation_unconfirmed`).
- **Now:** one deadline per reply, on one clock (`ReplyStopClock`, injectable for tests):
  - the call may use what remains less the 30 s tail (`REPLY_TAIL_MS`), and never more than `deadlineMs`;
  - with nothing left before the reservation or after it, no call starts;
  - the settlement shares the same deadline instead of a fresh one.
- **Unchanged:** no new cap, wait, retry, refund or release. A reservation left without a call stays counted, and
  aborted, errored or unknown usage stays uncertain.
- **Limit:** the tail is the existing 30 s. A settlement and two observations that each exhaust their retries can
  still exceed it; they then fail at the deadline, never past it.

**The newest runtime instead of an eligible one (4302482626).**
- **Before:** two distinct runtime units with the same role and route, both ready. The Ask bound the newer B; the
  create went to B under the grant's tuple (digest a…). B's executor (digest b…) refused it `reply_executor_mismatch`,
  though the older A ran the pinned executor.
- **Now (A40, P's scope decision):** `RuntimeRole` gains an optional `executor` with A35's exact shapes.
  - The bridge's service role names its configured `{execution, routeId, executorArtifactDigest}`.
  - 0071's `runtime_hello` validates and keeps it, as one named insertion, `CON-HELLO-EXECUTOR`: the rest is 0067's
    body byte for byte, and the preservation test names the insertion.
  - The Ask binds a pinned service grant only to the newest runtime advertising its exact tuple. A native grant takes
    a role with no executor, or the native one.
  - The create's dispatch checks the same rule again. A drifted runtime makes it wait, and it is never retargeted.
  - With no eligible runtime the Ask is refused at once (`runtime_unavailable`), with no attempt and no outbox.
- `presetDigest` and the bundle keep their meanings. No migration number, endpoint or dependency was added.

**The PostgreSQL 16 fixture (job 117383125250).** The case for a login without SET created the login without a
password, so a SCRAM server refused its connection before the SET.
- It now has its own synthetic password (hex, as test-support's logins) and authenticates first: `current_user` is
  asserted, then the `SET LOCAL ROLE` gets 42501.
- Connect and close are in awaited guards. On an owned PostgreSQL 17 cluster with SCRAM it passes; that is not a
  PostgreSQL 16 run.

**Changed tests, in their meaning.**
- Three crossing cases, a grant pinned to another digest, an unpinned lineage and a runtime under another digest,
  are now refused at the Ask instead of by the executor after dispatch.
- The provenance cases' runtimes now advertise the executor they are pinned to.

**Checks.**
- Unit: `reply-service` 38/38, including seven cases on the call plan. Giving the call a fresh budget again fails 3 of
  them.
- Private PostgreSQL 17.11:
  - context dispatch 12/12, on a SCRAM cluster;
  - `conversation-runtime` 129/129;
  - `test:sql` 67 migrations, 5 files;
  - `test:db` 1005/1005. A first run, before the named insertion and the scene changes, failed 7, kept in B's logs;
  - the D-Q13 trusted-creator group 7/7, and the exclusive groups 7/7, each with the four hold stages.
- The conversation-service crossing, real bridge to API to PostgreSQL: 12/12. Its stored runtime role carries the
  configured executor.
- Identities, with `pnpm artifacts:record`: bundle `e516779f…` → `3c2b1d43…` and the profile lock. The darwin dsh tree
  `e24cb887` and the workspace lock `b868da08` are unchanged.
- PostgreSQL 16, both helper phases, and Supabase-local auth have still not run on this source.

## The complete executor identity (FND-B2-COMPLETE-EXECUTOR-IDENTITY-REPAIR-01)

The automatic review of `d0c46d5f` found a P1 (#393 discussion 4302689994), and R confirmed it. The executor digest a
runtime advertised was whatever 64-hex value the operator's variable held; the crossing used the bundle archive's.
That digest names none of the dsh runtime, LLM adapter, SDK, profile or overlays a reply actually runs on.

**Before, on unmodified `d0c46d5f`.** Real dsh ran from a private copy of the recorded runtime whose loaded
`dsh-llm-pi-ai` entry was altered: it printed a marker, so it is the file dsh loaded. The copy carried its own correct
runtime record, which `assertRecordedArtifacts` accepted. With the unchanged archive pin, the bridge's hello still
advertised the conversation role with the archive digest `3c2b1d43…` as its executor.

**Now the executor digest is the installed closure, verified before the role exists.**
- `executor-identity.ts` (bundle) holds one recipe, `sophia-executor-closure-v1`. It hashes the recipe's name and the
  canonical JSON of these components:
  - the dsh runtime this process was launched from (`argv[1]` is its declared bin), with dsh-base, the adapters, pi-ai
    and the OpenAI SDK, as `sophia-tree-v2`, the recorded scheme, with no new exclusion;
  - the installed bundle's own files, the same way;
  - the profile's four inputs and its archive;
  - each `--patch` overlay;
  - the bin, the profile name, and Node's version and platform.
- **Refusals.** A symlink out of its root, an unreadable launch shape (anything but one `--profile` and `--patch`
  files), a bundle outside its profile and an unsupported platform each leave the closure unverifiable.
- **The pin is only an expectation.** The operator's variable is the EXPECTED digest. The bundle derives the closure
  only when a pin is set, and serves only when the two are equal. Otherwise service mode is unavailable with a fixed
  reason (`executor_closure_mismatch`, `executor_closure_unverifiable <reason>`), and no role is advertised. There is no
  fallback.
- **No credential and no new API surface.** No credential value is read or hashed. With service mode off, nothing is
  derived. There is no new contract, migration, endpoint, dependency or flag. A40's field keeps its meaning, now
  derived from the installation.
- **The host side.** `executorClosureDigest` (scripts/lib/profile.mjs) gives the expected pin with the same built
  recipe, only after the runtime is the recorded artifact and the profile runs exactly the recorded bundle.
- **The pin is per launch.** It covers its overlays, so an overlay naming another endpoint is another executor.
- **Limits.** This guards against accidental substitution among owned installations, not against a hostile host
  administrator. A file replaced after startup is outside it, and there is no watcher.

**Identities.** `pnpm artifacts:record`: bundle `3c2b1d43…` → `250a96ef…`, and the profile lock. The darwin dsh tree
`e24cb887`, the workspace lock `b868da08` and linux-x64 `4552d08f` (unqualified) are unchanged.

**Checks** (private PostgreSQL 17.11, en_US.UTF-8).
- **Unit, `executor-identity` 5/5:**
  - the tree component equals `sophia-tree-v2`;
  - an escaping or absolute symlink is refused;
  - every component changes the digest;
  - the launch parse is strict;
  - the settings decision: matched, mismatched, unverifiable without a path in the log, no derivation without a pin or
    with service mode off.
- **The conversation-service crossing: 19/19.** The 12 earlier cases now run under each launch's derived pin. Seven
  are new:
  - the altered loaded adapter, an installed profile input changed by one comment line, and an overlay naming another
    endpoint, each under the old pin. Each leaves service mode unavailable: no role, the Ask refused, no request to
    either endpoint;
  - the archive digest alone, and an arbitrary digest, expected and pinned alike: refused the same way;
  - the altered runtime under its own new pin and a new lineage serves once, retired under its tuple;
  - a restart mid-call under a different verified closure reports the old attempt unrecovered. One create, one request,
    no answer, the reservation still counted, and no receipt under the new closure.
- **Mutation.** With the closure replaced by the operator's pin and packed (`1d88133b…`), 5 of 6 identity cases fail
  at the bundle's refusal. The restart case passes: non-adoption rests on the tuples differing, not on derivation.
  - Two earlier mutation runs were invalid and are kept in B's logs: the mutant did not build, so the repaired bundle
    ran.
- PostgreSQL 16, both helper phases, Supabase-local auth and Linux have not run on this source.

## The enforced service load boundary (FND-B2-ENFORCED-SERVICE-LOAD-BOUNDARY-REPAIR-01)

R's review of `a868530b` (R-B2-A868-01..03) found supported startup inputs that the closure did not cover:
- the home patch `DSH_HOME/cordis.patch.yml`, which the loader composes after the profile's patch and before the
  overlays;
- plugins a patch inserts by path, which the loader mounts from beside that patch, outside both hashed trees;
- Node preload and resolution modifiers.

**Before, on `a868530b` (executed, with a capture-only double).** Each of these kept `executor_closure_verified`, and
the hello advertised the unchanged pin:
- a material home patch added after the pin;
- an external relative plugin whose implementation changed under the same pin, with both markers loaded;
- a preloader by `--import` and by `NODE_OPTIONS`, whose marker ran.

The home patch's own load effect was not separately observed.

**Now the service admits only the reviewed composition** (executor-identity.ts, recipe `sophia-executor-closure-v2`,
policy `sophia-service-composition-v1`, recorded in the closure). These checks are shared by the host's expected-pin
helper and the loaded bootstrap:
- **No home patch.** Any entry there refuses: a file, a directory or a dangling link. Nothing in the home is read or
  hashed, and the launcher removes nothing.
- **The reviewed base profile only.** Its two bundles, its one dependency, and nothing else in its `node_modules`.
- **Config-only overrides.** The profile patch and every overlay must be strict JSON arrays of `{ id, config }`
  overrides of the reviewed config rows: `llm-pi-ai`, `agent-default-model` and `sophia-control-bridge`. The config
  must be a mapping with no inline `apiKey`.
  - That refuses `insert`, a replaced plugin `name`, `group`, `disabled`, `inject`, `intercept`, `isolate`, a
    group's child list, an include row and any `!!js` expression (JSON cannot carry a tag).
  - The loader's own YAML reading of a JSON text is the same data.
- **No Node modifiers.** No `execArgv`, and none of NODE_OPTIONS, NODE_PATH, NODE_PRESERVE_SYMLINKS or
  NODE_PRESERVE_SYMLINKS_MAIN set. `launchRuntime` refuses them in its `extraEnv` too.
- **Fixed reasons** (`home_patch_present`, `profile_unsupported`, `patch_unsupported`, `launch_modifier`), with no
  path, flag, value or credential in the log.
- The crossing's service overlay is now written as JSON, the same data as before.

**Identities.** `pnpm artifacts:record`: bundle `250a96ef…` → `30cf3bdc…`, and the profile lock. The darwin dsh
`e24cb887`, the workspace lock `b868da08` and linux-x64 `4552d08f` (unqualified) are unchanged.

**Checks** (private PostgreSQL 17.11, en_US.UTF-8).
- **Unit, `executor-identity` 9/9:** the four new cases are the home patch's forms, the profile, the patch shapes and
  the modifiers, the launcher's refusal included.
- **The conversation-service crossing: 23/23.** The 19 earlier cases, the standard launch and both restarts included,
  plus four new ones:
  - a material home patch under the old pin;
  - an external relative plugin inserted by an overlay. It is mounted (marker), yet refused, and no expected pin is
    derived for it at either of two bases;
  - a preloader by `--import`, and one by `NODE_OPTIONS`. Each ran (marker), yet is refused, and the launcher refuses
    the variable.
  - Each leaves no conversation role, a blocked Ask with no attempt or outbox, and no provider request.
  - The profile-input case now changes the installed lock: a comment in the profile patch is now refused as
    unsupported rather than mismatched.
- **Mutation.** With the four boundary checks returning at once, built and packed (`638bcbd1…`), the four new crossing
  cases fail.
  - The home-patch and plugin cases fail first at the host helper's refusal, which shares the module. The preloader
    cases fail at the bundle's.
  - A first attempt was not run: its marker pattern missed tsc's line break, and it is kept.
- Dynamic expressions, includes, a replaced name and groups are refused by the unit cases, not by a real dsh launch.
- PostgreSQL 16, both helper phases, Supabase-local auth and Linux have not run on this source.

## The canonical bundle placement (FND-B2-CANONICAL-IMPORT-LAYOUT-FOCUSED-CORRECTION-01)

R's review of `40dfd8bc` closed the home patch and the Node modifiers, but kept one P1, R-B2-A868-02-NESTED-PEER. The
bootstrap admitted any bundle placement inside the profile, and the pinned loader prefers a local package found on the
importer's Node search paths inside the profile (dsh-app-boot `routeScoped`, its `localPrefix` the profile directory)
over the verified installation.

**Before, on `40dfd8bc` (executed, with a capture-only double).** The installed bundle moved to
`<profile>/.nested/node_modules/@sophia/dsh-bundle`, with the canonical entry a relative link to it. A same-version
`@deepseek-ai/dsh-llm` sat beside it, printing a marker and re-exporting the runtime's own package.
- The host derived the same pin as for the canonical layout (`c4ab20ef…`).
- The peer loaded (marker), and the bridge logged `executor_closure_verified` and advertised that pin.

**Now only the canonical hoisted placement is admitted.** The installed bundle's realpath must be the profile's
`node_modules/@sophia/dsh-bundle`, a real directory and not a link. Otherwise the closure is refused with
`profile_unsupported`, in the host helper and the bootstrap alike.
- From that place, the importer's search paths inside the profile are the bundle's own `node_modules` (hashed), its
  scope's and the profile's (both held to the one package already). So no unmeasured peer can be chosen.
- The normal recorded hoisted install is unchanged.
- A peer may still run before the bootstrap refuses. The claim is that no service executor or role exists, not that
  Node never ran it.
- The host helper's comment now names recipe v2.

**Identities.** Bundle `30cf3bdc…` → `ddd2ce41…`, and the profile lock; the darwin tree, workspace lock and linux-x64
(unqualified) are unchanged.

**Checks** (private PostgreSQL 17.11, en_US.UTF-8).
- **Unit, `executor-identity` 10/10**, adding the nested-link and other-place cases.
- **The crossing.** The nested-peer case: the host refuses to derive a pin, the peer loads (marker), and service mode
  is refused, with no role, a blocked Ask with no attempt or outbox, and no request. The normal answer passes.
  - The whole crossing, now 24 cases, runs in the ordinary check.
- **Mutation.** With the placement check disabled and packed (`52eb196c…`), the nested-peer case fails, first at the
  host helper's refusal.
- PostgreSQL 16, both helper phases, Supabase-local auth and Linux have not run on this source.

## The closed service bundle (FND-B2-CLOSED-BUNDLE-SHAPE-FOCUSED-CORRECTION-01)

R's review of `59658927` closed the nested placement but kept one residual on the same guarantee,
R-B2-R02-CANONICAL-BIN-LINK. The canonical real bundle directory could hold `node_modules/.bin` as a link to another
place in the profile, and `node_modules/@deepseek-ai/dsh-llm` as a link to `../.bin/dsh-llm`.
- The tree scheme skips `.bin` before lstat, and hashes only the second link's text.
- `profileDrift` ignores links.
- The pinned loader follows both links to a peer whose bytes were in no pin.

**Before, on `59658927` (executed, with a capture-only double).** The links change the pristine pin, `ccbe9a33…` →
`b88ba5b8…`. But peers A and B, of the same name and version with different bytes, gave the same link-layout pin,
`b88ba5b8…`. Each loaded (marker) and was verified and advertised under it.

**Now the service bundle is closed.** The recorded archive is 89 regular files, with no link and no `node_modules`. An
installed one is those files in 13 directories.
- The host helper and the bootstrap now walk the canonical bundle with lstat and no exclusion. Anything but a regular
  file or a directory, or any `node_modules` at any depth, is `profile_unsupported`.
- The hash and the drift checks are unchanged. The normal hoisted install passes.
- A peer may still load before the bootstrap refuses; no service executor or role exists.

**Identities.** Bundle `ddd2ce41…` → `a27cc50a…`, and the profile lock; the darwin tree, workspace lock and linux-x64
(unqualified) are unchanged.

**Checks** (private PostgreSQL 17.11, en_US.UTF-8).
- **Unit 11/11:** a `.bin` link pair, a bare `node_modules`, a nested `node_modules/.bin`, and an in-bundle link each
  refuse.
- **The crossing.** The `.bin`-link case: the host refuses to derive a pin, the peer loads (marker), and service mode
  is refused, with no role, a blocked Ask with no attempt or outbox, and no request. The nested case and the normal
  answer pass.
  - All 25 cases run in the ordinary check.
- **Mutation.** With `assertClosedBundle` not called and packed (`b11858f8…`), the `.bin`-link case fails, first at the
  host helper's refusal.
- PostgreSQL 16, both helper phases, Supabase-local auth and Linux have not run on this source.

## Common integration: main and C262 (FND-B-COMMON-MAIN-C262-INTEGRATION-01)

After R accepted the closed service bundle (`c7cbc3aa`), this line carries current main and C's accepted
completed-goal session retirement (`c26273d9`, 0075 and A41: the recovery API, admin results and pulse truth, over
`d0c46d5f`). There are two normal merges, with every parent kept.
- **Main `f3700656`.** Its tree is con-c1 `42f65b5e`'s, already in this line, so the merge changes no file.
- **C262 `c26273d9`.** No path changed on both sides since `d0c46d5f`. The merge is automatic.
  - All 21 of C's paths are C's exact blobs, its Studio work files included. All 9 of B's paths are `c7cbc3aa`'s.
  - Contracts regenerate with no drift, and every runtime identity reproduces unrecorded: bundle `a27cc50a…`, darwin
    `e24cb887`, workspace lock `b868da08`, profile lock. linux-x64 is still unqualified.
- **Names.** 0075 and A41 are C's, and no migration or amendment was added. 0067, 0070 and 0071 are unchanged.
- **Behaviour.** Service mode, Ask and the native and BYO paths stay off and held. A completed goal stays completed,
  with its review closed and its controls fenced.
- **Checks.** The ordinary check of this head is in B's handback.
- **Still owed:** PostgreSQL 16 (both helper phases), Supabase-local auth, Linux identity, and the current-head CI and
  automatic review, in one publication after P accepts this carry. Merging B and C into main remains Luis's.

## Retirement receipt cap (FND-B-393-4303630159-RECEIPT-CAP-FOCUSED-CORRECTION-01)

The automatic review of `1e1c9e3a` found a P2 (#393 discussion 4303630159), and R confirmed it.
- 0075 admits every unsettled binding of a completed goal and stores them all in the receipt.
- A41 declared `Receipt.targets` with `maxItems: 1000`.
- So at 1,001 bindings on one goal, the admission committed, and then the shared `parseReceipt` rejected its 202.
- A same-key retry returned the same stored receipt and failed again.

**Before, on `1e1c` contracts (executed).** A real owned PostgreSQL 17, the authenticated API with its default
serializer, and the shared parser; synthetic attempts and bindings on one completed goal; no runtime or worker.
- 1,000 bindings: the receipt parses with every target.
- 1,001: the admission committed first. The authority epoch moved 1→2 and the state revision 1→2, with 1 event, 1,001
  outbox deliveries and 1 command. The 202 carried 1,001 targets, and `parseReceipt` threw `/targets must NOT have
  more than 1000 items`.

**Now `maxItems` is removed from `Receipt.targets` in A41, and nothing else.** The canonical OpenAPI and the validators
are regenerated; types and the runtime wire are unchanged.
- Unchanged: every target, the item shapes, the UUID, null and string limits, `Goal.retirement`, every request limit,
  guard and default.
- There is no SQL, no new name and no new cap.
- A stored oversized receipt now parses on replay without being rewritten.

**Checks.** `apps/api/src/api.db.test.ts`: 37/37.
- **1,000 and 1,001:** each receipt parses with every binding, once.
- **Epoch and revision:** the authority epoch and the state revision move once; the goal stays completed at revision 1.
- **Replay:** the same key after the epoch moved returns the same acknowledgement, with no further epoch, event,
  outbox delivery or command.
- **Projection:** the admin's `Goal.retirement` carries every target.
- **Guards:** C's admin-only, body and idempotency cases still pass.
- **Identities:** all reproduce unchanged.
- The ordinary check of this head is in B's handback.

## Next bounded action

B's private handback goes to P; R reviews this correction. No push until P's next packet.
