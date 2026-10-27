# Implementation-session handoff

Goal and attempt: FND-B-ASK-ALTERNATIVE-01, attempt 1. Find another way for one authorized member to get an ordinary
Ask reply on existing resources, without waiting for or asking Supabase support, keeping the security properties.

Human owner / executor resource: Davide (receipt `8992b2aa…`); Claude Code lane B, runtime
`60d65501-d779-4a4c-80e8-89485d10c86e`, packet `01b4a89f…`.

Starting worktree/commit: main `62444136`, branch `fix/ask-context-without-execution-login-20261027`.

Inputs:

- R2's boundary (`94ba6866…`), early finding and sealed reader-boundary result (`d4631c65…`).

## The boundary

- An Ask's context is assembled by the trusted worker, through a second login (`SOPHIA_ASSEMBLER_DATABASE_URL`) admitted
  to the bare assembler role. Each transaction runs `SET LOCAL ROLE` as the assembler and sets the asker as the actor.
- Q13 confines that login AND the assembler, PUBLIC-derived authority included. Any login inherits PUBLIC CONNECT on
  `template1`, which the managed customer owner cannot revoke. So the login route cannot pass Q13 there.
  - Unchanged here: Q13 stays held, and its check is the login route's gate.
- Not chosen (R2's early finding): the worker's own login plus `SET LOCAL ROLE`. `RESET ROLE`, `session_user` and the
  worker's pool would remain with the assembly component.

## The change: a fixed claim-bound reader boundary (0084), versioned and OFF until enabled

**Eight reader functions**, one per statement the assembly path issues today: project, decisions (3 fixed variants),
entries (2), their counts, work, note policy, history, window.

- Each is SECURITY DEFINER with `search_path pg_catalog,sophia,pg_temp`, and returns the same columns and types.
- Each refuses unless it runs as the assembler, i.e. unless the assembler owns it. The assembler's grants and its
  claim-bound row policies stay the read control, never an owner's.
- `conversation_assembly_bind` accepts only a current claim begun in this very transaction. It derives project, asker,
  conversation and window from server records, and sets the asker as the actor on every call.
- The caller passes the claim triple and, for three readers, a fixed variant word: no SQL, relation, function, role,
  actor or project.

**Installed OFF.**

- The readers are owned by the installation owner, so they refuse.
- The worker holds no entry point.
- `conversation_assembler_admitted()` keeps 0071's login rule byte for byte.

**Enable and disable are a separate operator act** (`conversation_enable_fixed_assembly()` /
`conversation_disable_fixed_assembly()`), by the trusted installation owner `postgres` or a superuser installation.

- Refused while the assembler has any member but its recorded creator edge, or belongs to any role: no login route may
  coexist.
- It gives the readers to the assembler. It grants the assembler EXECUTE on `bind` and the reader guard, and grants
  `sophia_worker` EXECUTE on the five entry points (claim, begin, close, fail, record).

**Old sessions (repair 1, #487 P1).** A login that ran `SET ROLE` to the assembler keeps it as its current user after
its membership is revoked, until it resets the role or disconnects. PostgreSQL shows neither another session's current
user nor past memberships. At 7073, enable checked memberships only, so such a session would have owned the readers.

- `conversation_mark_fixed_assembly_cutover()` (owner act, mode off, the assembler standing alone) records the instant
  the login route was seen retired.
- Enable is refused while any login session of this database began at or before that instant, unless the session is a
  superuser's or the trusted owner's. It is also refused while a session's start is not visible to the caller:
  `pg_stat_activity` hides another login's start without `pg_read_all_stats`. A session with no logged-in user (an
  autovacuum worker) cannot have assumed a role.
- Such sessions settle by closing. Nothing terminates them.
- The cutover and enable hold the assembler's per-role lock to commit (`COMMENT ON ROLE`, with its comment unchanged;
  `GRANT` and `REVOKE` of the role take the same lock), and both run in READ COMMITTED. So no membership changes
  between the check and the transfer.
- Disable forgets the cutover.
- The fixed check holds on the same rule with its own query, and `whole()` requires a recorded cutover.

**`conversation_assembler_admitted()`**: while the worker holds `begin`, it answers for the fixed mode alone, and only
when the mode is whole. Both modes at once is never true.

**Worker**: `SOPHIA_CONVERSATION_ASSEMBLY=fixed` assembles with the worker's own login, through the readers, in the same
bounded transactions.

- No `SET ROLE`; the caller sets no actor.
- It refuses to start if `SOPHIA_ASSEMBLER_DATABASE_URL` is also set: no fallback.
- Unset or `login`: unchanged.

**New activation check**, `db/candidates/con01-fixed-assembly-activation-check.sql`, read-only and beside the unchanged Q13
check.

- Holds unless the mode is whole.
- No role can act as the assembler: no member but the creator edge, and it belongs to nothing.
- The assembler owns exactly the eight readers (definitions hash-bound), and its explicit grants are the reviewed
  allowlist plus the two helpers.
- Every reviewed callable's ACL is exact.
- All shared S3/S4 identities are kept byte for byte.
- It does not hold on PUBLIC-derived privileges of the assembler (see below).

## Capability table

| Actor               | Login route (unchanged)                                                                   | Fixed mode (0084)                                                         |
| ------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| model / native      | no database credential                                                                    | no database credential                                                    |
| worker process      | worker login (generic SQL as `sophia_worker`) + assembler login (generic SQL as assembler) | worker login only, + EXECUTE on 5 entry points and 8 readers              |
| assembler role      | assumable through SET by the admitted login                                               | assumable by no session, and enabled only once every session that may have assumed it has closed; its privileges run only inside the 8 fixed bodies |
| PUBLIC defaults     | reach both logins and the assembler (the Q13 holds)                                       | reach the worker login as before; unreachable through the assembler       |
| credentials to hold | 2                                                                                         | 1                                                                         |

## Policy and authority delta (for R2 and the owner; not a Q13 PASS and not a bugfix)

1. Confinement moves.
   - Before: a bare login session limited by Q13.
   - After: no session can be the assembler, and fixed, hash-bound readers derive claim, actor and project on the
     server.
   - The assembler's PUBLIC-derived privileges become unreachable rather than absent. The fixed check does not hold
     on them.
2. `sophia_worker` gains EXECUTE on the 5 entry points (on enable) and on the 8 readers (on install, inert).
   - The same worker process could already do this through its second credential; as a role grant it is new.
3. Once enabled, the assembler owns the 8 readers. Q13's "owns nothing" is no longer true in this mode; Q13 is not this
   mode's gate.
4. The enable and disable acts are new operational effects:
   - a temporary self-granted SET edge for the owner (with INHERIT on disable), revoked before return;
   - a temporary CREATE on schema `sophia` for the assembler, revoked before return;
   - (repair 1) the cutover act writes the owner-only `sophia.conversation_fixed_assembly_cutover` row; disable deletes
     it. The cutover and enable each rewrite the assembler's own comment unchanged, to hold its per-role lock.

   A clean final topology is not production approval.
5. The trusted computing base is unchanged in kind: the worker process was and stays trusted to record context. A
   compromised worker is not claimed to be contained, now or before.

## Evidence (journal `B-ASK-ALTERNATIVE-01-logs`; owned loopback PostgreSQL 17 clusters)

`conversation-fixed-assembly.db.test.ts` (9 cases), with the real API and worker logins, Ask, dispatch and
`assembleReply`:

- **OFF:** the Ask is refused (`context_assembler_unbound`); the worker can begin nothing; readers refuse.
- **Same records, same snapshot, same claim:** the context rendered through the login route and through the fixed
  readers is byte-identical.
- **On this cluster:** Q13 holds `admitted to template1 (PUBLIC CONNECT)` for the login route; the fixed check holds
  nothing once enabled.
- **Enabled, end to end:**
  - an Ask waits; the worker's own login records its context; the create is dispatched once;
  - the payload carries the context and no connection string or password;
  - a second assembly answers `already_recorded`.
- **At the worker's own connection:**
  - `SET ROLE` to the assembler is refused;
  - a claim not begun in the transaction is refused, including one begun by another open transaction of the worker's;
  - a wrong token or attempt, a lapsed lease, and an injection-shaped variant word are refused;
  - a caller-set actor is overwritten (the asker's consent and role are read, never another member's);
  - another project's records never reach the context;
  - temporary tables named as every relation used change nothing.
- **Fences:**
  - a forged context is refused at record (`context_forged`);
  - a removed asker closes the reply (`asker_removed`);
  - a withdrawn question is never dispatched.
- **Dual mode refused:** a login member makes `admitted()` false, holds the fixed check, and refuses enable.
- **Disable:** the Ask is refused again; enabling again works.

`conversation-fixed-assembly-trusted-owner.db.test.ts` (4 cases; marker-gated; owned cluster shaped like hosted Supabase:
the bootstrap superuser is not postgres, and postgres is a plain CREATEROLE owner), all as the non-superuser owner:

- 0001–0084 install;
- the login route's Q13 holds on `template1`, and enable is refused while its login exists;
- enable leaves exactly the creator edge, the readers the assembler's, no CREATE, and zero fixed-check holds;
- a real Ask is recorded through the worker's login and dispatched;
- disable and enable again each leave the creator edge as it was.

Worker: `assembly-config.test.ts` (login default, fixed, both refused, unknown refused).

Old candidate (0084 set aside, same test bytes): the fixed mode does not exist and the crossing fails. Full checks and
the old/new logs are in the journal handback.

Repair 1 (#487 P1; journal `B-ASK-ALTERNATIVE-01-REPAIR-01-logs`):

- **At OLD 7073**, on an owned cluster, a real assembler login runs `SET ROLE` and stays connected while its membership
  is revoked.
  - It remains `session_user` = the login and `current_user` = the assembler.
  - Enable succeeds, `admitted()` is true, and the fixed check holds nothing.
  - The connection owns the eight readers: it granted EXECUTE on one to PUBLIC and revoked it again.
  - A fresh connection of the same login cannot `SET ROLE`.
- **OLD source, new tests:** the stale-session cases fail with "Missing expected rejection", on the superuser cluster
  and as the non-superuser owner.
- **New source, `conversation-fixed-assembly.db.test.ts` (11 cases)**:
  - with no cutover, enable is refused and the gate holds;
  - a session that assumed the assembler before the cutover holds enable (55006, naming its pid and login). Nothing
    moves: reader owners, the entry points, the bind grant and the role comment are all as they were;
  - the gate holds it and `admitted()` is false;
  - the same login connected after the cutover can neither assume the assembler nor hold anything;
  - after the client closes voluntarily, enable succeeds, the gate holds nothing and a fixed Ask is recorded;
  - while the cutover's or enable's transaction is open, a concurrent `GRANT` of the assembler waits (lock timeout);
  - REPEATABLE READ is refused, and so is a new cutover while enabled;
  - disable forgets the cutover.
- **Trusted owner (6 cases)**: the admitted login's real connection, unseen by the non-superuser owner ("its start is
  not visible"), holds enable and the gate until it closes.
  - Without `pg_read_all_stats`, the API's and worker's later sessions are held while open.
  - With it (granted in the fixture by the bootstrap superuser), a session begun after the cutover holds nothing.

Corrections made during the attempt:

- A first draft restored the caller's actor after each read. The record then ran with no actor and refused. The asker
  now stays the transaction's actor, as the login route sets it.
- My stated hypothesis that a caller-set actor makes the record refuse was wrong: the record rebuilds every item from
  its rows owner-side. The test asserts what holds.

## Deployment (not done here)

- Apply 0084, after a fresh ledger and hash check. Nothing changes until the separate enable act.
- Before enabling:
  1. Retire the login route: no assembler login member, and `SOPHIA_ASSEMBLER_DATABASE_URL` unset.
  2. Run `conversation_mark_fixed_assembly_cutover()` as `postgres`.
  3. Let every listed session close: restart or stop the API and worker. Provider-owned sessions that are not a
     superuser's count too, and a database restart settles all of them. Nothing in the source terminates them.
  4. Run `conversation_enable_fixed_assembly()` (it names any session still held), then the fixed activation check:
     zero rows required.
- Without `pg_read_all_stats`, the owner cannot see when another login's session began. Then the gate and enable hold
  every such open session, including ones begun after the cutover, until it closes. Whether the managed `postgres` has
  that role is to be read there.
- Deploy the worker with `SOPHIA_CONVERSATION_ASSEMBLY=fixed` and no `SOPHIA_ASSEMBLER_DATABASE_URL`.
- The API and Studio are unchanged.

## Limits

- Local owned clusters only, PostgreSQL 17. The reviewed definition hashes are computed on 17; 16 is not run here.
- No live Supabase, native, Paperclip or provider call, and no model, paid action or production read.
- Payer, grant and cost admission are unchanged and were not exercised beyond the existing synthetic lineage.
- Repair 1 bounds old sessions by when they began, not by who they were. PostgreSQL keeps no history of who was a
  member, so every non-superuser login session older than the cutover is held. A trusted owner's grant of the assembler
  after the cutover can be seen only while it exists: the gate and `admitted()` hold it then. After its revoke, nothing
  records it. Re-establishing the mode then takes disable, a new cutover and settlement.
- PUBLIC-derived privileges remain on the worker's own login exactly as before. Whether the managed cluster's current
  catalog passes the fixed check is unknown until it is run there.
