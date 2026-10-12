# G2 Q13: the reply assembler's least-privilege identity (proposal for early review, r4)

**Status: a proposal.** Nothing in it is installed or published as source.
- **The shared read step (§3.3)** changes and adds objects other missions own. It stays held until those owners acknowledge it (CX-0128; owners and routing in §8).
- **The CON-only part (§3.1, §3.2, §3.4, §5)** is written only after this proposal is agreed. Then it goes in as its own pin, with a fail-before at #211 `7d8f415f` and an after.
- **The deployment remedy for admission (§3.5)** runs only under a separately approved, exact deployment configuration. Nothing here approves one.
- **No live effect** of any kind: no role, grant, policy, `pg_hba` or session change on any shared or hosted database.

**r4 corrects r3** (`fc3976ec`), after Codex's PG17 evidence and its new P2 (CX-0131, `07b0ea44`):
- **The assembler's own authority is checked, fail-closed (§3.4, T11 (g)–(o)).** r3 checked the login's authority and the assembler's ownership, but not what the assembler itself may do. Codex's reproducer: a clean login, other admission denied, then `ALTER ROLE sophia_conversation_assembler BYPASSRLS`. r3's check returned **no row**, and the login read a synthetic `FORCE ROW LEVEL SECURITY` deny-all row. The check now holds on:
  - any role attribute on the assembler;
  - any relation privilege other than `SELECT` on the 20, and any column grant;
  - `EXECUTE` on anything outside the 10, and any schema privilege other than `USAGE` on `sophia`;
  - any grant option;
  - any policy naming it outside the 38 reviewed;
  - any dependency of another kind;
  - any member of the assembler that isn't a bare login.

  It must also run again after any change to the login's or the assembler's authority (§3.4).
- **PostgreSQL 17 (§3.3).** The 24 identities Codex took on 17.6 equal the 16 values. The guard accepts majors 16 and 17 and refuses any other.

**r3 corrected r2** (`c6d3479a`), after Codex's early review (CX-0131):
- **The activation check fails closed (§3.4, T11):**
  - an absent assembler role is a hold;
  - its membership checks compare against the assembler as a scalar, so an absent assembler no longer hides a login's other memberships;
  - the target-database exception admits exactly one ACL entry, `CONNECT` alone without the grant option. Ownership of the target, `CREATE`, `TEMPORARY` or a grant option on it are holds;
  - the assembler owning anything, anywhere, is a hold.
- **Attribution (§3.3, §4):**
  - Codex's `PUBLIC` inventory was of the target database `postgres`, not `template1`, which was not read;
  - the view's options were confirmed in source `0022:75`, not in the target's catalog;
  - the proved constraint is that `postgres` cannot revoke `template1`'s `PUBLIC` `CONNECT`, and that no supported admission path is established. It is not a proof that the platform has none.

  Activation stays held.

**r2 corrected r1** (`598b1d1c`), after Codex's early review (CX-0130):
- **Admission.** r1 let the owner accept another database's `PUBLIC` admission. The selected boundary is the intended database alone (D-8). So every admission elsewhere now **holds activation** until its denial is qualified under an approved deployment configuration (§3.4, §3.5, §4). There is no acceptance path.
- **On the actual target** (Codex's read-only metadata, CX-0131): the proved constraint is that the deploying role `postgres` cannot revoke `template1`'s `PUBLIC` `CONNECT`, and no supported admission path for the login is established. Activation stays held (§4).
- **The actor.** r1 let the execution login read as any actor, in any project, in the 20 relations. Its reads are now bound to the one claim its own transaction began, for that claim's project and asker, by 19 restrictive policies on the assembler alone (§3.2, §3.3). A wrong actor, project, reply or lease reads nothing (T3).
- **The drift guard.** r1 compared policy names, commands, permissiveness and roles, not predicates, despite saying so. It now also binds the reviewed identities: each predicate's text, `native_task_view`'s definition and options, and each function's definition. It fails closed on any difference (§3.3, T2).

**Authority.** Davide's Q13 answer, A (BINDING_MAP §13 D-8, §8.7): least-privilege isolation per identity, scoped to the intended database and the required assembly operations. The test plan it must meet is Codex's [Q13_INDEPENDENT_QUALIFICATION](https://github.com/davidelaverga/Sophia/blob/f9f164e4d3dac7214b1042c9e6d191d3f53bd646/docs/coordination/CON-01/Q13_INDEPENDENT_QUALIFICATION.md); §5 maps every crossing.

**The finding it answers** stays open until an affected qualification passes. PR #211 r4242913900 (cross-database inheritance): the assembler is a member of `sophia_api`, a cluster role. So any login that holds the assembler can:
- inherit `sophia_api`'s rights in every database it can reach;
- assume `sophia_api` with `SET ROLE`;
- run `sophia_api`'s writers.

## 1. The change in one paragraph

The assembler stops being a member of `sophia_api`, or of any role.
- **What it keeps:** the five entry points it already has.
- **What it gains:** the narrowest read surface the compiler needs, under row security:
  - `SELECT` on the 20 relations the compiler and its policies touch;
  - `EXECUTE` on the 4 functions those policies and that view call, and on one new CON function;
  - its name added to the 19 row policies that let `sophia_api` read those relations;
  - 19 restrictive policies of its own that admit a row only from the project of the claim its own transaction began, and only while the actor is that claim's asker.

  So it reads, in its assembly alone, what the asker may read, under the same predicates.
- **Where it holds them:** only in the database the candidate is installed in. The candidate refuses a role that already holds anything anywhere in the cluster.
- **Admission elsewhere** comes from `PUBLIC`'s default `CONNECT`. CON can't refuse it. It holds activation until an approved deployment remedy denies it (§4).

## 2. Why this design (the smallest least-privilege one)

| Option | Verdict |
|---|---|
| Keep `sophia_api`, with `INHERIT FALSE` or `SET FALSE` | **No.** It fails Q13 by definition. `INHERIT FALSE` still lets the login `SET ROLE` to it, and `SET FALSE` alone still inherits it |
| A new intermediate reader role that the policies name | **No.** It adds a role, a membership edge and a second cluster-global object to qualify, to reach the same 19 policies |
| Parallel `FOR SELECT TO sophia_conversation_assembler` policies copying each predicate | **No.** Two predicates per table can drift: a later privacy fix to one leaves the copy open (fail-open) |
| Move the compiler's reads into SECURITY DEFINER functions | **No.** It rewrites `readMissionContext` in SQL. The reads would then run as the function owner, outside row security, which is the opposite of reading as the asker |
| **The assembler on the 19 existing policies' role lists, plus 19 restrictive claim-bound policies of its own** | **Chosen.** One predicate per table, shared with `sophia_api` and unchanged. The restrictive policies are `TO sophia_conversation_assembler` only, so `sophia_api`'s reads are untouched. Each is `project_id = (SELECT sophia.conversation_assembly_project())`: an uncorrelated subquery, evaluated once per statement, not per row |

- **Table-level `SELECT`, not column-level.** The row predicates are the boundary. The assembler reads, in its claim, only rows the asker can already read through the API. A column list would copy the compiler's columns into grants, so any compiler change would need a new shared grant.
- **Why the claim binds the actor.** `conversation_assembly_begin` already stamps the claim with `begun_xid = pg_current_xact_id()` in the same REPEATABLE READ transaction as the reads. The new function admits only that transaction's begun, unexpired, unsettled claim, whose reply the current actor asked. Claiming a pending reply then lets the identity read as that reply's asker, in that reply's project, for that transaction alone. That is the assembly the reply requires, and nothing beyond it.

## 3. The exact SQL

### 3.1 CON-only: the candidate's role section (`db/candidates/con01-s3-conversation-reply-context.sql`, today lines 22–55)

**Removed:** lines 52–55, the comment and the grant:
```sql
GRANT sophia_api TO sophia_conversation_assembler WITH INHERIT TRUE;
```

**Replaced:** lines 32–50, the found-role checks. The `CREATE ROLE` (lines 25–27) and the attribute check (28–31) stay as they are.
```sql
 -- A role found is adopted only bare (Q13, D-8): a member of no role and with no member, so it inherits and assumes
 -- nothing and lends the entry points to no one. Anything else is refused; nothing is revoked.
 SELECT oid INTO STRICT a FROM pg_roles WHERE rolname='sophia_conversation_assembler';
 IF EXISTS(SELECT FROM pg_auth_members m WHERE m.member=a OR m.roleid=a) THEN
  RAISE EXCEPTION 'sophia_conversation_assembler exists with unexpected memberships' USING ERRCODE='42501';
 END IF;
 -- Nor anything of its own anywhere in the cluster (Q13; PR #211 r4242793043, r4242913900): pg_shdepend names the role
 -- for every object it owns, every privilege granted to it (default privileges included) and every policy naming it,
 -- in every database. So the role holds what this file grants in one database alone, and a second installation in the
 -- same cluster is refused.
 IF EXISTS(SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=a) THEN
  RAISE EXCEPTION 'sophia_conversation_assembler exists with privileges or objects of its own' USING ERRCODE='42501';
 END IF;
```
- **The header** (lines 5–7) then says: the role is a member of no role. In the one database it is installed in, it holds the five entry points and the read step (§3.3), and nothing elsewhere.
- **The TS module** `conversation-assembly.ts` is unchanged. It already begins, then sets the actor to the asker begin named, then reads, all in one REPEATABLE READ transaction under `SET LOCAL ROLE`. Its header comment (lines 17–18) gains "a member of no other role; its reads bound to the claim this transaction began".

### 3.2 CON-only: the claim-bound project (appended after the five `GRANT EXECUTE`)
```sql
-- (Q13, D-8) The one project the assembler may read, and only as its asker: the project of the claim this transaction
-- began (begun_xid), still unsettled and inside its lease, whose reply the current actor asked. NULL otherwise, and with
-- more than one such claim, so the read policies (below) admit no row.
CREATE FUNCTION sophia.conversation_assembly_project() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN count(*)=1 THEN (array_agg(k.project_id))[1] END
   FROM sophia.conversation_assembly_claims k
   JOIN sophia.conversation_replies r ON r.project_id=k.project_id AND r.id=k.reply_id
  WHERE k.begun_xid=pg_current_xact_id_if_assigned() AND k.outcome IS NULL AND k.lease_expires_at>clock_timestamp()
    AND r.asked_by=sophia.actor_id() $$;
REVOKE ALL ON FUNCTION sophia.conversation_assembly_project() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.conversation_assembly_project() TO sophia_conversation_assembler;
```

### 3.3 Shared read step (held until its owners acknowledge it; appended after §3.2)

It runs in the candidate's transaction, so a refusal installs nothing.
- **The identities** below were taken on PostgreSQL 16.15, the major version these were reviewed on:
  - each `md5(pg_get_expr(polqual|polwithcheck))`;
  - `md5(pg_get_viewdef)` with the view's options;
  - each `md5(pg_get_functiondef)`.

  All are deparsed with `search_path = pg_catalog`, so every name is schema-qualified.
- **Another major version** is refused until its own identities are reviewed and added.
- **The actual target is PostgreSQL 17.6** (Codex, CX-0131, read-only).
- **Codex collected the 17.6 identities as reviewer evidence** (`07b0ea44`, `identity-comparison.json`). It used this exact SQL, on a fresh owned 17.6 cluster, from #211 `7d8f415f`'s migrations 0001–0045 and 0048; the six shared defining files are byte-identical to main `e0200f1a`.
- **All 24 match the 16 values above:** the 19 policies, the 4 functions, and the view's definition with its options.
- **r4 integrates that result:** the guard accepts majors 16 and 17 with the same values, and refuses any other. I qualify that on 16; 17 is Codex's independent recheck.
- **The view's identity** is its definition plus its `security_barrier` and `security_invoker` options, as replaced at `0022_research_readers.sql:75`. Codex confirmed the options in that source line, not in the target's catalog. On its owned 17.6 cluster the view's identity also matched the 16 value (above).
```sql
-- (Q13, D-8) What the compiler reads as the asker, and nothing else: the relations readMissionContext and the window
-- read, native_task_view's base tables, the relations their SELECT policies read, the functions those policies and that
-- view call. Refused, before anything here changes, unless every one is still exactly what Q13 was reviewed against.
DO $$
DECLARE was text:=current_setting('search_path');
 rels text[]:=ARRAY['commands','contributions','conversation_messages','conversations','decisions','execution_bindings',
  'goals','jobs','mission_confirmation_targets','mission_entries','mission_note_consents','mission_note_policies',
  'project_members','project_revisions','projects','source_dependencies','source_objects','source_texts','work_attempts'];
 member text:='c6b5d3e81ef41aae94b11f678470fa70'; none text:='d41d8cd98f00b204e9800998ecf8427e';
BEGIN
 PERFORM set_config('search_path','pg_catalog',true);
 IF current_setting('server_version_num')::int/10000 NOT IN (16,17) THEN
  RAISE EXCEPTION 'the Q13 read identities are reviewed for PostgreSQL 16 and 17 only' USING ERRCODE='55000';
 END IF;
 IF (SELECT array_agg(s.v ORDER BY s.v COLLATE "C") FROM (
      SELECT c.relname||'.'||p.polname||' '||p.polcmd::text||' '||p.polpermissive::text||' '||
       (SELECT string_agg(x::regrole::text,',' ORDER BY x::regrole::text COLLATE "C") FROM unnest(p.polroles) x)||' '||
       md5(coalesce(pg_get_expr(p.polqual,p.polrelid),''))||' '||md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
       AS v
       FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      WHERE c.relnamespace='sophia'::regnamespace AND c.relname=ANY(rels) AND p.polcmd IN ('r','*')) s)
   IS DISTINCT FROM ARRAY[
   'commands.members_read r true sophia_api '||member||' '||none,
   'contributions.members_read r true sophia_api '||member||' '||none,
   'conversation_messages.members_read r true sophia_api e76fc23de87f4b338688e22f5ab4d6b1 '||none,
   'conversations.members_read r true sophia_api 8c39e31aa575d8d6bb545db05993ba6b '||none,
   'decisions.members_read r true sophia_api '||member||' '||none,
   'execution_bindings.members_read r true sophia_api '||member||' '||none,
   'goals.members_read r true sophia_api '||member||' '||none,
   'jobs.members_read r true sophia_api '||member||' '||none,
   'mission_confirmation_targets.members_read r true sophia_api '||member||' '||none,
   'mission_entries.members_read r true sophia_api '||member||' '||none,
   'mission_note_consents.members_read r true sophia_api '||member||' '||none,
   'mission_note_policies.members_read r true sophia_api '||member||' '||none,
   'project_members.members_read r true sophia_api '||member||' '||none,
   'project_revisions.members_read r true sophia_api '||member||' '||none,
   'projects.members_read r true sophia_api 2755e13246aa841a78d079f595642542 '||none,
   'source_dependencies.members_read r true sophia_api '||member||' '||none,
   'source_objects.eligible_sources_read r true sophia_api aafc1899b46eebed028871abe57807d2 '||none,
   'source_texts.readable_source r true sophia_api 088c91c8879bb4247da7f13658543709 '||none,
   'work_attempts.members_read r true sophia_api '||member||' '||none]
 OR (SELECT md5(pg_get_viewdef(c.oid))||' '||array_to_string(c.reloptions,',') FROM pg_class c
      WHERE c.oid='sophia.native_task_view'::regclass)
   IS DISTINCT FROM 'c0d03ea473637eab9be98b68e0216d65 security_barrier=true,security_invoker=true'
 OR (SELECT array_agg(p.oid::regprocedure::text||' '||md5(pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text COLLATE "C")
      FROM pg_proc p WHERE p.oid IN ('sophia.actor_id()'::regprocedure,'sophia.is_member(uuid)'::regprocedure,
       'sophia.is_task_kind(text)'::regprocedure,'sophia.mission_capture_default()'::regprocedure))
   IS DISTINCT FROM ARRAY['sophia.actor_id() 27098852bf55bc01c3c6b938a646491c',
    'sophia.is_member(uuid) 73e40f4a2d8d6af95f8d414c6c2ee784','sophia.is_task_kind(text) ab5390873bf78035cc94d99466f49d12',
    'sophia.mission_capture_default() d3212aa604efc9363d7d30e4ee0777a5'] THEN
  RAISE EXCEPTION 'the read policies, view or functions are not the ones Q13 was reviewed against' USING ERRCODE='55000';
 END IF;
 PERFORM set_config('search_path',was,true);
END $$;
GRANT USAGE ON SCHEMA sophia TO sophia_conversation_assembler;
GRANT SELECT ON sophia.commands, sophia.contributions, sophia.conversation_messages, sophia.conversations,
 sophia.decisions, sophia.execution_bindings, sophia.goals, sophia.jobs, sophia.mission_confirmation_targets,
 sophia.mission_entries, sophia.mission_note_consents, sophia.mission_note_policies, sophia.native_task_view,
 sophia.project_members, sophia.project_revisions, sophia.projects, sophia.source_dependencies, sophia.source_objects,
 sophia.source_texts, sophia.work_attempts TO sophia_conversation_assembler;
GRANT EXECUTE ON FUNCTION sophia.actor_id(), sophia.is_member(uuid), sophia.is_task_kind(text),
 sophia.mission_capture_default() TO sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.commands TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.contributions TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.conversation_messages TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.conversations TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.decisions TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.execution_bindings TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.goals TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.jobs TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.mission_confirmation_targets TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.mission_entries TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.mission_note_consents TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.mission_note_policies TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.project_members TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.project_revisions TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.projects TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.source_dependencies TO sophia_api, sophia_conversation_assembler;
ALTER POLICY eligible_sources_read ON sophia.source_objects TO sophia_api, sophia_conversation_assembler;
ALTER POLICY readable_source ON sophia.source_texts TO sophia_api, sophia_conversation_assembler;
ALTER POLICY members_read ON sophia.work_attempts TO sophia_api, sophia_conversation_assembler;
-- The assembler's reads, bound to its own begun claim: restrictive, so they narrow the shared policies above for the
-- assembler alone; sophia_api is not named and reads as before.
CREATE POLICY con01_assembly_bound ON sophia.commands AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.contributions AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.conversation_messages AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.conversations AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.decisions AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.execution_bindings AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.goals AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.jobs AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.mission_confirmation_targets AS RESTRICTIVE FOR SELECT
 TO sophia_conversation_assembler USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.mission_entries AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.mission_note_consents AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.mission_note_policies AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.project_members AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.project_revisions AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.projects AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.source_dependencies AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.source_objects AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.source_texts AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
CREATE POLICY con01_assembly_bound ON sophia.work_attempts AS RESTRICTIVE FOR SELECT TO sophia_conversation_assembler
 USING (project_id=(SELECT sophia.conversation_assembly_project()));
```
- `ALTER POLICY … TO` changes only a policy's role list, so every shared predicate and every `sophia_api` read stays byte-identical. T2 re-takes the §3.3 identities after installation and compares them.
- The restrictive policies name only the assembler; T2 asserts that too.

### 3.4 Activation check (CON-provided, owner-run, read-only)

Proposed as `db/candidates/con01-s3-assembler-activation-check.sql`, a new CON file.
- **Where and how:** run in the target database by the owner, with `-v login=<the execution login>`, after the login is created and granted the assembler, and before it is used.
- **Every row it returns holds activation.** Zero rows are required. There is no row an owner accepts.
```sql
-- Fails closed: a missing login or assembler is a hold, and every membership check compares against the assembler's oid
-- as a scalar, so an absent assembler (NULL) makes every membership of the login a hold rather than hiding them.
WITH l AS (SELECT * FROM pg_roles WHERE rolname=:'login'),
     a AS (SELECT * FROM pg_roles WHERE rolname='sophia_conversation_assembler'),
     t AS (SELECT oid FROM pg_database WHERE datname=current_database()),
     -- What the assembler may hold, by name, and nothing else (§3.2, §3.3 and the five entry points). Matched by
     -- schema and name, never by a cast, so a database without schema sophia neither errors nor admits.
     rels(r) AS (VALUES ('commands'),('contributions'),('conversation_messages'),('conversations'),('decisions'),
      ('execution_bindings'),('goals'),('jobs'),('mission_confirmation_targets'),('mission_entries'),
      ('mission_note_consents'),('mission_note_policies'),('native_task_view'),('project_members'),('project_revisions'),
      ('projects'),('source_dependencies'),('source_objects'),('source_texts'),('work_attempts')),
     fns(f) AS (VALUES ('actor_id()'),('is_member(uuid)'),('is_task_kind(text)'),('mission_capture_default()'),
      ('conversation_assembly_project()'),('conversation_assembly_claim(uuid, integer)'),
      ('conversation_assembly_begin(uuid, integer, uuid)'),('conversation_assembly_close(uuid, integer, uuid, text)'),
      ('conversation_assembly_fail(uuid, integer, uuid, text)'),('conversation_record_context(uuid, integer, uuid, jsonb)')),
     pols(r, p) AS (SELECT r, CASE r WHEN 'source_objects' THEN 'eligible_sources_read'
       WHEN 'source_texts' THEN 'readable_source' ELSE 'members_read' END FROM rels WHERE r<>'native_task_view'
      UNION ALL SELECT r, 'con01_assembly_bound' FROM rels WHERE r<>'native_task_view'),
     -- Where a shared dependency is named: a database by its own name, anything else by the database it lives in.
     dep AS (SELECT d.*, CASE WHEN d.classid='pg_database'::regclass
               THEN 'database '||coalesce((SELECT datname FROM pg_database WHERE oid=d.objid),'?')
               ELSE coalesce((SELECT datname FROM pg_database WHERE oid=d.dbid),'(shared)') END AS place
               FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass)
SELECT 'hold' AS kind, 'no such login' AS what WHERE NOT EXISTS(SELECT FROM l)
UNION ALL SELECT 'hold', 'no assembler role' WHERE NOT EXISTS(SELECT FROM a)
UNION ALL SELECT 'hold', 'attribute' FROM l
 WHERE rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR NOT rolcanlogin
UNION ALL SELECT 'hold', 'member of '||m.roleid::regrole FROM pg_auth_members m, l
 WHERE m.member=l.oid AND m.roleid IS DISTINCT FROM (SELECT oid FROM a)
UNION ALL SELECT 'hold', 'assembler edge: admin option or no SET' FROM pg_auth_members m, l
 WHERE m.member=l.oid AND m.roleid=(SELECT oid FROM a) AND (m.admin_option OR NOT m.set_option)
UNION ALL SELECT 'hold', 'not a member of the assembler' FROM l
 WHERE NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=l.oid AND m.roleid=(SELECT oid FROM a))
UNION ALL SELECT 'hold', 'the login has a member: '||m.member::regrole FROM pg_auth_members m, l WHERE m.roleid=l.oid
UNION ALL SELECT 'hold', 'the assembler is a member of '||m.roleid::regrole FROM pg_auth_members m, a WHERE m.member=a.oid
-- The login's own dependencies: none, except one ACL entry on the target database itself (checked exactly below).
UNION ALL SELECT 'hold', 'the login '||CASE dep.deptype WHEN 'o' THEN 'owns something in ' ELSE 'holds something in ' END||dep.place
 FROM dep, l, t WHERE dep.refobjid=l.oid
  AND NOT (dep.dbid=0 AND dep.classid='pg_database'::regclass AND dep.objid=t.oid AND dep.deptype='a')
-- That ACL entry is CONNECT alone, without the grant option: no CREATE, TEMPORARY or anything else on the target.
UNION ALL SELECT 'hold', 'on the target database: '||x.privilege_type||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_database db, aclexplode(db.datacl) x, l, t
 WHERE db.oid=t.oid AND x.grantee=l.oid AND (x.privilege_type<>'CONNECT' OR x.is_grantable)
-- The assembler's: grants in the target alone (no database-level or shared entry), and it owns nothing anywhere.
UNION ALL SELECT 'hold', 'the assembler '||CASE dep.deptype WHEN 'o' THEN 'owns something in ' ELSE 'holds something in ' END||dep.place
 FROM dep, a, t WHERE dep.refobjid=a.oid AND (dep.dbid<>t.oid OR dep.deptype='o')
-- The assembler's own authority, exactly (CX-0131: BYPASSRLS drift): no attribute; on relations, SELECT on the 20 alone;
-- no column grant; EXECUTE on the 10 alone; USAGE on schema sophia alone; no grant option anywhere; named only by the
-- 38 reviewed policies; and no dependency of any other kind (types, languages, default privileges, large objects…).
UNION ALL SELECT 'hold', 'the assembler has '||concat_ws(', ', CASE WHEN rolsuper THEN 'SUPERUSER' END,
   CASE WHEN rolbypassrls THEN 'BYPASSRLS' END, CASE WHEN rolcanlogin THEN 'LOGIN' END, CASE WHEN rolcreatedb THEN 'CREATEDB' END,
   CASE WHEN rolcreaterole THEN 'CREATEROLE' END, CASE WHEN rolreplication THEN 'REPLICATION' END)
 FROM a WHERE rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication
UNION ALL SELECT 'hold', 'the assembler may '||x.privilege_type||' on '||n.nspname||'.'||c.relname
   ||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x, a
 WHERE x.grantee=a.oid AND NOT (n.nspname='sophia' AND c.relname IN (SELECT r FROM rels)
   AND x.privilege_type='SELECT' AND NOT x.is_grantable)
UNION ALL SELECT 'hold', 'the assembler may '||x.privilege_type||' on column '||c.relname||'.'||att.attname
 FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid CROSS JOIN LATERAL aclexplode(att.attacl) x, a
 WHERE x.grantee=a.oid
UNION ALL SELECT 'hold', 'the assembler may EXECUTE '||n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')'
   ||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) x, a
 WHERE x.grantee=a.oid AND NOT (n.nspname='sophia' AND p.proname||'('||oidvectortypes(p.proargtypes)||')' IN (SELECT f FROM fns)
   AND NOT x.is_grantable)
UNION ALL SELECT 'hold', 'the assembler may '||x.privilege_type||' on schema '||n.nspname
   ||CASE WHEN x.is_grantable THEN ' with grant option' ELSE '' END
 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) x, a
 WHERE x.grantee=a.oid AND NOT (n.nspname='sophia' AND x.privilege_type='USAGE' AND NOT x.is_grantable)
UNION ALL SELECT 'hold', 'a policy names the assembler: '||p.polname||' on '||n.nspname||'.'||c.relname
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace, a
 WHERE a.oid=ANY(p.polroles) AND NOT (n.nspname='sophia' AND (c.relname::text, p.polname::text) IN (SELECT r, p FROM pols))
UNION ALL SELECT 'hold', 'the assembler holds something of another kind in '||dep.place
 FROM dep, a WHERE dep.refobjid=a.oid AND dep.classid NOT IN ('pg_class'::regclass, 'pg_namespace'::regclass,
   'pg_proc'::regclass, 'pg_policy'::regclass)
-- Every identity that can act as the assembler, not only this login: each member must be a bare login.
UNION ALL SELECT 'hold', 'a member of the assembler is not a bare login: '||r.rolname
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member, a
 WHERE m.roleid=a.oid AND (NOT r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
   OR r.rolreplication OR m.admin_option OR EXISTS(SELECT FROM pg_auth_members o WHERE o.member=r.oid AND o.roleid<>a.oid)
   OR EXISTS(SELECT FROM pg_auth_members o WHERE o.roleid=r.oid))
UNION ALL SELECT 'hold', 'session open in '||coalesce(s.datname,'?')||' (pid '||s.pid||')'
 FROM pg_stat_activity s, l WHERE s.usesysid=l.oid AND s.pid<>pg_backend_pid()
UNION ALL SELECT 'hold', 'admitted to '||d.datname||CASE WHEN has_database_privilege('public', d.oid, 'CONNECT')
   THEN ' (PUBLIC CONNECT)' ELSE ' (granted)' END
 FROM pg_database d, l, t WHERE d.datallowconn AND d.oid<>t.oid AND has_database_privilege(l.oid, d.oid, 'CONNECT');
```
**What activation is bound to.** The login is not used until both hold on the actual target.
- **Settlement:** the check returns no `session` row. A found session is settled only by its own client ending; nothing here terminates one.
- **Admission configuration:** the check returns no `admitted to` row. Each database's denial must also be qualified by a fresh connection attempt (§3.5), under the deployment configuration approved for it.

**When it must run again:**
- a changed admission configuration or a new database means re-running the check and the attempts before use;
- so does any change to a role, grant, policy or membership that touches the login or the assembler.

The check binds the authority it reads at the moment it runs. Drift after that is caught only by running it again.

### 3.5 Admission: read-only discovery, then the bounded deployment remedy (owner-run, only when approved)

**Discovery** (read-only, owner-run on the actual target, results kept in the owner's private store, not here). It finds:
- which databases are connectable;
- who owns each, and its ACL;
- whether the deploying role can change each one's `CONNECT`;
- the server version (§3.3 binds its major);
- whether `pg_hba` rules are readable.
```sql
SELECT current_setting('server_version') AS server, current_user AS deploying_role,
       (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser;
SELECT d.datname, d.datallowconn, d.datistemplate, pg_get_userbyid(d.datdba) AS owner, d.datacl::text AS acl,
       has_database_privilege('public', d.oid, 'CONNECT') AS public_connect,
       pg_has_role(current_user, d.datdba, 'USAGE') AS can_change_connect
  FROM pg_database d ORDER BY d.datname COLLATE "C";
SELECT r.rolname FROM pg_roles r WHERE r.rolcanlogin ORDER BY 1;   -- the logins an ACL change would touch
SELECT count(*) AS hba_rules_readable FROM pg_hba_file_rules;      -- an error here means not readable by this role
```
**Discovery on the actual target is already answered** (Codex, CX-0131: read-only, 23:56:29Z, rolled back, connection ended):
- the target and intended database is `postgres`, on PostgreSQL 17.6;
- the deploying role is `postgres`, **not a superuser**;
- the only other connectable database is `template1`, owned by `supabase_admin`, with `PUBLIC` `CONNECT`;
- the assembler role is absent.

Supabase's own troubleshooting page ("custom role inherits privileges that were not explicitly granted", edited 2026-10-11) says `postgres` **cannot revoke `template1`'s `CONNECT`**.

**So the remedy below cannot apply to the actual target.** It applies only where discovery shows the deploying role owns, or may change, every other connectable database. My owned-cluster `REVOKE` (§7) ran as a superuser on my own cluster. It shows the mechanism, not a remedy for this target.

**The remedy, where it applies.** It is applied by the owner, under a separately approved operation batch that names the exact databases and logins. For each connectable database `D` other than the target that discovery shows the deploying role can change:
```sql
GRANT CONNECT ON DATABASE D TO each_login_the_inventory_shows_needs_D;   -- one GRANT per such login, named
REVOKE CONNECT ON DATABASE D FROM PUBLIC;
```
- **Qualification after it** (§5 T7, on the actual target):
  - a fresh connection by the execution login to every such `D` is refused;
  - it is admitted to the target;
  - every re-granted login is still admitted where the inventory says;
  - §3.4 returns no row.
- **Where the remedy can't apply** (a connectable database the deploying role can't change, and no `pg_hba` rule it may set): activation stays held, and that is the incompatibility (§4). There is no exception for it.
- **`pg_hba`** is an alternative only where the platform exposes it to the deploying role. It would need its own approved configuration and the same qualification. It is not selected here.

## 4. The incompatibility, stated exactly (Q13 crossing "other database admission")

**What can't be done from CON.** CON's source can't make a fresh connection by the login to another database fail. Every database has `PUBLIC` `CONNECT` unless its owner revoked it, and `template1` is connectable by default.

**Shown on my owned clusters** (§7):
- the login was admitted to `postgres`, `template1` and a fresh database;
- after `REVOKE CONNECT … FROM PUBLIC` on that database, it was refused there with `42501`.

**Under §3**, an admitted login holds `PUBLIC`'s baseline there and nothing of Sophia's:
- the assembler is a member of no role;
- it holds nothing outside the target, and §3.1 refuses installation otherwise;
- §3.4 refuses a login with anything of its own anywhere.

**That is not the selected boundary.** So every admission elsewhere holds activation until the §3.5 remedy, under an approved configuration, denies it and the denial is qualified.

**On the actual target: the proved constraint.** Codex's read-only metadata (CX-0131) shows:
- the one other connectable database, `template1`, is owned by `supabase_admin` with `PUBLIC` `CONNECT`;
- the deploying role `postgres` is not a superuser.

Supabase's own page says `postgres` cannot revoke `template1`'s `CONNECT`. So the §3.5 remedy can't deny the execution login's admission to `template1` on this target. **No supported `pg_hba` or other admission path for the login is established.** That is not a proof that the platform has none; it is a statement that none is established and qualified. Until one is, activation stays held.

**The consequences:**
- §3.4 returns `admitted to template1 (PUBLIC CONNECT)` on the target. **Activation stays held**, with no exception and no new policy default.
- **What `PUBLIC` holds in `template1` is not established.** Codex did not connect to `template1` or read its catalog.
- Codex's catalog-only inventory (CX-0131) was of the **target database `postgres`**. It found, among the non-system schemas, only `USAGE` on `public`; no `pg_net`, `http` or `pg_cron`, and no network relations or functions; and other `PUBLIC` function grants behind schemas without `PUBLIC` `USAGE`.
- So no network-execution failure is claimed in either database. The installed identity's actual negative qualification on the target is still owed.
- **What would change it** is outside CON:
  - the template's owner revoking `PUBLIC` `CONNECT` on `template1`;
  - a supported admission path for the login, once established and qualified;
  - or a deployment in which the deploying role owns every connectable database.

  None is proposed, assumed or asked here.

**Not inferred:**
- no `CONNECT` revocation, `pg_hba` edit, grant or session termination on any shared or hosted cluster;
- the actual deployment's databases, owners and `PUBLIC` grants are found by §3.5's discovery, owner-held, at the time of an approved batch.

## 5. Tests (CON-only, `packages/persistence/src/conversation-assembly.db.test.ts`), mapped to the Q13 crossings

All run on owned disposable PostgreSQL through a real login: `LOGIN NOINHERIT`, granted only the assembler, connecting fresh, never the owner with `SET ROLE`.

**Fail-before** is each test run against #211 `7d8f415f` unchanged.
- **Must fail there:** T2's install refusal, T3's denials, T4, T5, T6, T7, T8 and T9. At `7d8f`:
  - the assembler is a member of `sophia_api`;
  - the login can `SET ROLE` to it and reach its writers;
  - it reads as any actor;
  - a second installation is adopted;
  - nothing binds the identities;
  - the check doesn't exist.
- **Controls that pass at both:** T1, T3's positive read and T10. Assembly, read equality inside the claim, and logins that can't assume each other already hold at `7d8f`, and must keep holding.

**After** is the corrected candidate, where all must pass.

| Crossing | Test |
|---|---|
| Intended database admission | **T1**: a fresh connection by the login URL; `assembleReply` reaches `recorded`; the context equals the one assembled for the same scene at `7d8f` (unchanged compiler) |
| Required assembly only; wrong asker, project, reply, lease | **T3**, each through the login under `SET LOCAL ROLE`, in REPEATABLE READ: **(i)** with no claim begun, as the asker: `readMissionContext` is `null` and every one of the 20 relations returns 0 rows; **(ii)** with its claim begun, as the asker: the context and window equal the API login's for the same actor; **(iii)** in that transaction, as another member of the project: 0 rows; **(iv)** in that transaction, as the asker, in another project the asker belongs to: 0 rows; **(v)** a begun claim whose lease has passed: 0 rows; **(vi)** after the claim is recorded or closed: 0 rows. Plus the existing lifecycle cases (claim, begin, record, close, fail, wrong lease, withdrawn source, exhausted), unchanged |
| Drift (the reviewed identities) | **T2**: on an unmodified database, after installing: the §3.3 identities are re-taken and equal, and the 19 restrictive policies name only the assembler. Then, each in a rolled-back transaction before installing, the candidate is **refused**: one predicate changed (`ALTER POLICY members_read ON sophia.goals USING (true)`); `is_task_kind` replaced by an equivalent body; `native_task_view` recreated with `security_invoker` off; an extra permissive SELECT policy on a scope table; a pre-existing `con01_assembly_bound` |
| Inherited authority | **T4**: a recursive walk of `pg_auth_members` from the login (inherit options), plus `PUBLIC`, ownership, default privileges and direct grants. Expected: the assembler only; the assembler a member of nothing; `SELECT` on exactly the 20 relations; `EXECUTE` on exactly the 10 functions (5 entry points, 4 read helpers, `conversation_assembly_project`); nothing writable; no sequence. Then through the login: reading an out-of-scope table (`sophia.outbox`, `sophia.runtime_commands`, `sophia.research_allowances`) gives `42501` |
| Assumable authority | **T5**: for every role in the cluster, `pg_has_role(login, r, 'SET')` holds only for the login and the assembler, and `SET ROLE r` for each other role gives `42501`. Among them: `sophia_api`, `sophia_worker`, the test API and worker logins, and a second assembler login |
| Operational writers | **T6**: every function in `sophia` executable by `sophia_api` or `sophia_worker` today, taken from the catalog and not a hand list, is called by the login with typed `NULL` arguments in a rolled-back transaction. Each gives `42501` before it runs, except the 10. Direct `INSERT`, `UPDATE` and `DELETE` on every `sophia` table, and `nextval` on every sequence, give `42501`. The digests of the operational tables (commands, jobs, goals, outbox, runtime, allowances, contributions) are unchanged |
| Other database admission | **T7**, on an owned throwaway cluster: **before** the remedy, the login is admitted to `postgres`, `template1` and a synthetic database, holds nothing of Sophia's there, and §3.4 holds activation (`admitted to` rows). **After** §3.5's remedy (one other login re-granted `CONNECT` on `postgres`): a fresh connection by the login to each is refused (`42501`); it is admitted to the target; the re-granted login is admitted to `postgres`; §3.4 returns no row. The throwaway cluster is removed afterwards |
| Scope to one database | **T8**: installing the candidate in a second database of the same cluster is refused ("privileges or objects of its own"). This replaces today's "adopts an existing role" control, which applied in a second database. The other found-role cases are kept |
| Pre-existing out-of-scope session | **T9**: an owned session by the login is open in another database before the check. §3.4 returns its `session` row. Revoking `PUBLIC` `CONNECT` there does not end it: it still queries. Its client closes voluntarily, and the `session` row is gone. No other process is terminated |
| Activation check fails closed | **T11**, the §3.4 query on owned disposable databases, each case in a rolled-back transaction: **(a)** no assembler role, with the login a member of `sophia_api`: `no assembler role`, `member of sophia_api` and `not a member of the assembler`; **(b)** the login owns the target database: `the login owns something in database <target>` (the owner's implicit `CREATE` and `TEMPORARY` rows appear only where the version writes the owner's ACL, as on 16; they are not required); **(c)** `CREATE` and `TEMPORARY` granted on the target: one `on the target database:` row each; **(d)** `CONNECT` with the grant option: `on the target database: CONNECT with grant option`; **(e)** the assembler owns a table: `the assembler owns something in <target>`; **(f)** the login set up as §3.4 requires: no row but `admitted to` rows.

The assembler's own authority (CX-0131), each with every other database's admission denied in the same rolled-back transaction, so the control returns no row at all:
- **(g)** the assembler given `BYPASSRLS`: `the assembler has BYPASSRLS`. r3's text returns no row here, and the login reads a synthetic `FORCE ROW LEVEL SECURITY` deny-all row; r4 must hold;
- **(h)** an extra `SELECT` on a table outside the 20, an `INSERT` on one of the 20, and a grant option: one row each;
- **(i)** a column grant: `the assembler may SELECT on column …`;
- **(j)** `EXECUTE` on a function outside the 10: `the assembler may EXECUTE …`;
- **(k)** `CREATE` on a schema: `the assembler may CREATE on schema …`;
- **(l)** a policy outside the 38 naming it: `a policy names the assembler: …`;
- **(m)** a default privilege granted to it: `the assembler holds something of another kind …`;
- **(n)** a group role, or a login with another membership, made a member of the assembler: `a member of the assembler is not a bare login: …`;
- **(o)** the full installed candidate with its login, set up as required: no row beyond `admitted to` (the allowlist equals what §3.2 and §3.3 grant).

Each must return its rows; at `7d8f` the check does not exist |
| Concurrent identities and restart | **T10**: two logins, each a member of the assembler; neither can `SET ROLE` the other. Each `assembleReply` call opens and destroys its own connections: no backend pid is reused across calls, and `current_user` after each transaction is the login. A revoked login's next call fails at connect or `SET LOCAL ROLE`, and its claim count is unchanged: no fresh attempt is created by the failure |

## 6. What this does not settle

- **Admission elsewhere:** on the actual target, `postgres` cannot revoke `template1`'s `PUBLIC` `CONNECT`, and no supported admission path is established, so activation stays held (§4). Elsewhere, it is held until §3.5 is approved, applied and qualified.
- **PostgreSQL 17.6:** the identities taken on Codex's owned 17.6 cluster equal the 16 values, so the guard accepts 16 and 17 and refuses any other major (§3.3). This is not evidence about the target's own catalog, which is read only at installation, by that guard.
- **Inside its claim,** the login reads what the claim's asker may read in that project, in the 20 relations. That is the compiler's required read. Claiming is limited to pending replies and to three attempts each, as the S3 functions already enforce.
- **Policy drift after install:**
  - A later migration that drops and recreates one of the 19 shared policies for `sophia_api` alone makes the assembly `unreadable` (fail-closed).
  - A later change to a shared predicate, the view or a function fails T2 in the shared suite the moment it lands, until Q13's identities are re-reviewed.
  - The installed restrictive policies keep the assembler inside its claim whatever the shared predicates become.
- **Another PostgreSQL major version** is refused at install until its identities are reviewed (§3.3). The target's major is found by §3.5's discovery.
- **Native execution isolation, provider eligibility, useful answers and app acceptance** are not touched by this database proof.

## 7. Owned-local evidence so far (clusters 55436 and a throwaway). Not qualification

**r1 ad hoc demo** (`q13-demo.ts`, `2a3b3858…`), at #211 `7d8f415f` with s1–s3:

| Run | Outcome | Counts as |
|---|---|---|
| 1 | Aborted, `42P19` (my recursive CTE). Its cleanup hung and was killed by `timeout 300` (exit 124); my manual cleanup at 23:36:51Z returned the cluster to its baseline | **void, not a pass** |
| 2 | Aborted, `42601` (role list read as a string) | void |
| 3 | `42501` on `is_task_kind`, called by `native_task_view` (0022:90); the scope query had missed view dependencies | void |
| 4 | Exit 0. Before: the login reads as the asker, `SET ROLE sophia_api` succeeds, `submit_contribution` writes a row. Gap: `42501` on the schema; grants without policies give context `null`, window `[]`. After (r1's step): the read is equal, `assembleReply` reaches `recorded`, and the four denials hold. The pre-existing session still reaches the writer. Admission is open through `PUBLIC` CONNECT (`q13-demo.jsonl` `1bce9b54…`) | r1 evidence only |

**r1 exact-SQL validation** (`q13-validate.sh`):

| Run | Outcome | Counts as |
|---|---|---|
| v1 | Two defects in my SQL: `array_agg(… ORDER BY 1)` sorts by a constant, and an ambiguous `oid` (`42702`) | void, kept |
| v2 | r1's text installs; a second installation is refused; the check returns a session row and 3 admission rows, then the admission rows alone | r1 only. Superseded by r2: r1 allowed accepting admission, did not bind the actor, and did not bind the predicates |

**r2 exact-SQL validation** (`q13-validate-r2.ts` and `.sh`, on 55436, PostgreSQL 16.15). The doc's 7 `sql` blocks are taken verbatim, and s3 is built from #211's file plus §3.1, §3.2 and §3.3.

| Case | Result |
|---|---|
| Drift, each in a rolled-back transaction: a predicate changed, `is_task_kind` replaced, the view's `security_invoker` off, an extra permissive policy, a pre-existing `con01_assembly_bound` | all 5 **refused** (`55000`, "not the ones Q13 was reviewed against"); the unmodified control installs |
| Install on an unmodified database | installs |
| T3 (i) no claim | context `null`, 0 rows in all 19 tables |
| T3 (ii) its own begun claim | equal to E's read through the API login (23 rows) |
| T3 (iii) another member, same transaction | `null`, 0 rows |
| T3 (iv) E in another project, same transaction | `null`, 0 rows |
| T3 (v) lease lapsed inside the transaction | 23 rows inside the lease, then `null`, 0 rows |
| T1 `assembleReply` by the login's URL | `recorded` |
| T5 `SET ROLE sophia_api`, `SET ROLE` of the other login; T6 `submit_contribution`, `UPDATE sophia.goals`; T4 read `sophia.outbox` | all `42501` |
| T4 authority | member of none; `SELECT` on 20; no other table privilege; `EXECUTE` on the 10; 19 restrictive policies naming only the assembler |
| T8 a second installation | **refused**, but by the membership check ("unexpected memberships"), because the two logins were members by then. The "of its own" path refused in r1's v2, with no login yet. My test expected only the second message, so it is marked as differing |
| §3.4 with an owned session open in `postgres` | `hold` rows: the session, plus `admitted to` for `postgres`, `template1` and the 2 other test databases. After the client exited, the `admitted to` rows alone |
| §3.5 discovery (my superuser cluster) | runs read-only; `can_change_connect` is true here, unlike the target |
| Cleanup | every database and role dropped; census `postgres`, `sophia_api`, `sophia_worker` / `postgres`, `template0`, `template1` / 0 clients |

This applies the exact text on a disposable PG16 database. It is not the installed candidate, not PG 17.6, and not a qualification.

**r3: only §3.4's check changed** since that run. §3.1–§3.3 and §3.5's discovery are byte-identical to the r2 text validated above. The check (`74e6ea2f…`, doc block 5, verbatim) was run on owned 55436 per T11, each adverse case in a rolled-back transaction (`q13-r3-t11.out`, `ed928bf1…`):

| Case | Rows returned |
|---|---|
| (a) no assembler role; the login a member of `sophia_api` | `no assembler role`, `member of sophia_api`, `not a member of the assembler`, plus the `admitted to` rows. r2's check would have returned only the `admitted to` rows, because its empty `a` dropped the membership checks |
| (f) the login set up as required | the 2 `admitted to` rows alone (`postgres`, `template1`) |
| (b) the login owns the target | `the login owns something in database <target>`, plus `CREATE` and `TEMPORARY` (an owner's implicit ACL) |
| (c) `CREATE` and `TEMPORARY` granted on the target | one `on the target database:` row each |
| (d) `CONNECT` with the grant option | `on the target database: CONNECT with grant option` |
| (e) the assembler owns a table | `the assembler owns something in <target>` |
| (f) again, after the rolled-back cases | unchanged: the 2 `admitted to` rows |
| Cleanup | the target, the login and the assembler dropped; census baseline, 0 clients |

**r4.** Codex's owned 17.6 evidence (`07b0ea44`):
- all 24 identities match the 16 values;
- r3's six controls behaved as required;
- **the new P2:** an assembler with `BYPASSRLS` passed r3's check with zero rows and read a `FORCE ROW LEVEL SECURITY` deny-all row.

My runs on owned 55436 (PG 16.15) use r4's check (`bec619e1…`, doc block 5, verbatim), next to r3's (`74e6ea2f…`) as the fail-before.

**Run A** (`q13-validate-r2.ts`/`.sh` on r4's text; `q13-r2.jsonl`, `q13-r2-check.out`): the drift, install, T3, T1, T4, T5 and T6 results as in r2, unchanged. On that full installed candidate, r4's check returns only the session and `admitted to` rows. So **the allowlist equals what §3.2 and §3.3 grant (T11 (o))**, and the second bare login is accepted.

**Run B** (`q13-r4-t11.out`, `a20302fe…`). Each case ran in one rolled-back transaction with `postgres` and `template1` `CONNECT` revoked from `PUBLIC`, so the control is empty:

| Case | r3 (fail-before) | r4 (after) |
|---|---|---|
| control (the assembler: `USAGE` on `sophia`, `SELECT` on `sophia.goals`) | none | none |
| (g) Codex's reproducer: a `FORCE ROW LEVEL SECURITY` deny-all table granted to the assembler, its policy, then `BYPASSRLS` | **none** (the login then reads `visible 1`) | `the assembler has BYPASSRLS`; `may SELECT on public.cx131_rls`; `a policy names the assembler: deny_all on public.cx131_rls` |
| (g′) `BYPASSRLS` alone | none | `the assembler has BYPASSRLS` |
| (h) `SELECT` on `sophia.outbox`, `INSERT` on `sophia.goals`, `SELECT … WITH GRANT OPTION` | none | one row each |
| (i) a column grant | none | `may SELECT on column outbox.id` |
| (j) `EXECUTE` on `public.q13_f()` | none | `may EXECUTE public.q13_f()` |
| (k) `CREATE` on schema `public` | none | `may CREATE on schema public` |
| (l) an extra policy on `sophia.goals` | none | `a policy names the assembler: extra on sophia.goals` |
| (m) a default privilege | none | `holds something of another kind in <target>` |
| (n) a group role, and a login also in `sophia_api`, made members | none | `a member of the assembler is not a bare login:` for each |
| Cleanup | | dropped; census baseline; `postgres` and `template1` ACLs as before (`(default)` and `{=c/postgres,postgres=CTc/postgres}`) |

These run on a disposable PG 16 database: not the installed candidate on 17.6, and not a qualification. Codex rechecks independently.

## 8. Affected shared objects and the acknowledgements they need (expanded in r2)

**Owners**, as Codex read them from the joint owner-routing record r2 (SHA-256 `569fe9275b0bdb7614852f31ae4d5b681fbf6a5d251c5ab333cf3433c85af341`, CX-0131):
- **The joint WBC-02/SDD-01 lane** acknowledges conditionally, as a consumer, only 3 relations, 2 policies and 1 helper of its runtime and design compatibility surface. It is not the owner of the core or ledger objects.
- **There is no shared-write GO.**

| Objects | Defined in | Owner (routing r2) |
|---|---|---|
| Policies `members_read` on `commands`, `decisions`, `execution_bindings`, `goals`, `jobs`, `project_members`, `project_revisions`, `projects`, `source_dependencies`, `work_attempts`; `eligible_sources_read` on `source_objects`: **each gains the assembler in its role list**. **New** restrictive `con01_assembly_bound` policies on those 11 tables. `actor_id()`, `is_member(uuid)`; schema `sophia` `USAGE` | `0002_roles_rls.sql` | core: Luis / Davide |
| Policies `members_read` on `contributions` and `readable_source` on `source_texts`: role list. **New** `con01_assembly_bound` on both | `0012_runtime_service.sql` | S1-05A, historically: Davide / Luis. The joint lane's conditional consumer ACK covers its part of the runtime surface |
| `native_task_view` (SELECT grant; definition and options bound); `is_task_kind(text)` (EXECUTE grant; definition bound) | the view in `0012`, replaced in `0022_research_readers.sql:75`; the function in `0022`, replaced in `0038_design_records.sql` | the view in `0022`: SMC-M03, under Davide / Luis UI. The joint lane's conditional consumer ACK covers its part of the design surface |
| Policies `members_read` on `mission_confirmation_targets`, `mission_entries`, `mission_note_consents`, `mission_note_policies`: role list. **New** `con01_assembly_bound` on those 4. `mission_capture_default()` | `0018_mission_ledger.sql`, `0019_default_mission_capture.sql` | ledger SMC-M01: Davide / Luis |
| Policies `members_read` on `conversations`, `conversation_messages`: role list, and **new** `con01_assembly_bound` on both | `0048_project_conversations.sql` | CON-01 (its own) |
| **Admission:** `CONNECT` on every other connectable database of the target cluster (§3.5) | the deployment and its platform | on the actual target, `template1` belongs to `supabase_admin` and is outside the deploying role (§4) |

Codex routes the acknowledgements.
- **No applied migration is edited.** Every change is in the S3 candidate, which takes its own census number later.
- **No shared source file is written.** The shared surface is these database objects and the deployment's admission configuration.
- **Order once acknowledged:**
  1. the CON-only pin, with §3.3 and the tests;
  2. the fail-before at `7d8f415f`;
  3. the after, `test:sql` and `pnpm check`;
  4. an immutable handback;
  5. Codex's independent qualification against §5.

  Activation then still waits for §3.4 and §3.5 on the actual target.
