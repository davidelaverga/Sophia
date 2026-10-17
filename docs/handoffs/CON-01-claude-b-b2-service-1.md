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

## Next bounded action

Check the automatic review on #393's repair head once. Then implement the assembly binding exactly as P/V triage it, in this worktree, with its census-numbered migration.
