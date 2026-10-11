# G2 Q13: the reply assembler's least-privilege identity (proposal for early review)

**Status: a proposal.** Nothing in it is installed or published as source.
- **The shared read step (§3.2)** changes objects other missions own. It stays held until those owners acknowledge it (CX-0128).
- **The CON-only part (§3.1, §3.3, §5)** is written only after this proposal is agreed. Then it goes in as its own pin, with a fail-before at #211 `7d8f415f` and an after.
- **No live effect** of any kind: no role, grant, policy or session change on any shared or hosted database.

**Authority.** Davide's Q13 answer, A (BINDING_MAP §13 D-8, §8.7): least-privilege isolation per identity, scoped to the intended database and the required assembly operations. The test plan it must meet is Codex's [Q13_INDEPENDENT_QUALIFICATION](https://github.com/davidelaverga/Sophia/blob/f9f164e4d3dac7214b1042c9e6d191d3f53bd646/docs/coordination/CON-01/Q13_INDEPENDENT_QUALIFICATION.md) (§5 maps every crossing).

**The finding it answers** stays open until an affected qualification passes. PR #211 r4242913900 (cross-database inheritance): the assembler is a member of `sophia_api`, a cluster role. So any login that holds the assembler can:
- inherit `sophia_api`'s rights in every database it can reach;
- assume `sophia_api` with `SET ROLE`;
- run `sophia_api`'s writers.

## 1. The change in one paragraph

The assembler stops being a member of `sophia_api`, or of any role.
- **What it keeps:** the five entry points it already has.
- **What it gains:** the narrowest read surface the compiler needs to read as the asker, under row security:
  - `SELECT` on the 20 relations the compiler and its policies touch;
  - `EXECUTE` on the 4 functions those policies and that view call;
  - its name added to the role list of the 19 row policies that let `sophia_api` read those relations, so it reads exactly the rows `sophia_api` would read for the same actor, under the same predicate.
- **Where it holds them:** only in the database the candidate is installed in. The candidate refuses a role that already holds anything anywhere in the cluster.
- **Admission elsewhere** comes only from `PUBLIC`'s default `CONNECT`. CON can't refuse it; §4 reports it as the specific incompatibility.

## 2. Why this design (the smallest least-privilege one)

| Option | Verdict |
|---|---|
| Keep `sophia_api`, with `INHERIT FALSE` or `SET FALSE` | **No.** It fails Q13 by definition. `INHERIT FALSE` still lets the login `SET ROLE` to it, and `SET FALSE` alone still inherits it |
| A new intermediate reader role that the policies name | **No.** It adds a role, a membership edge and a second cluster-global object to qualify, to reach the same 19 policies |
| Parallel `FOR SELECT TO sophia_conversation_assembler` policies copying each predicate | **No.** Two predicates per table can drift: a later privacy fix to one leaves the copy open (fail-open) |
| Move the compiler's reads into SECURITY DEFINER functions | **No.** It rewrites `readMissionContext` in SQL. The reads would then run as the function owner, outside row security, which is the opposite of reading as the asker |
| **Add the assembler to the 19 existing policies' role lists** | **Chosen.** One predicate per table, unchanged byte for byte. If a later migration drops and recreates a policy for `sophia_api` alone, the assembler loses access and the assembly is `unreadable`, never wider |

- **Table-level `SELECT`, not column-level.** The row predicate is the boundary. The assembler reads, as the asker, only rows the asker can already read through the API. A column list would copy the compiler's columns into grants, so any compiler change would need a new shared grant.
- **The actor.** The compiler sets `sophia.actor_id` to the asker that `conversation_assembly_begin` named, as now. A login holding the assembler could set another actor. It would then read, never write, what that actor may read, in these 20 relations only. Binding the policies to the claim (an actor derived from a begun claim) would put a per-row subquery in 19 shared policies. It would narrow little: the identity can already claim any pending reply. **Not proposed; recorded as residual (§6).**

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
- **The header** (lines 5–7) then says: the role is a member of no role. In the one database it is installed in, it holds the five entry points and the read step (§3.2), and nothing elsewhere.
- **The TS module** `conversation-assembly.ts` is unchanged. It already runs `SET LOCAL ROLE sophia_conversation_assembler`, then the actor; its header comment (lines 17–18) gains "a member of no other role".

### 3.2 Shared read step (held until its owners acknowledge it)

Appended to the same candidate after the five `GRANT EXECUTE` (today the file's last statement). It runs in the candidate's transaction, so a refusal installs nothing.
```sql
-- (Q13, D-8) What the compiler reads as the asker, under row security, and nothing else: the relations
-- readMissionContext and the window read, native_task_view's base tables, the relations their SELECT policies read, the
-- functions those policies and that view call, and the role named on exactly the policies that let sophia_api read them.
-- Refused, before anything here changes, unless each policy is still the one this was reviewed against.
DO $$
DECLARE want text[]:=ARRAY[
 'commands.members_read','contributions.members_read','conversation_messages.members_read',
 'conversations.members_read','decisions.members_read','execution_bindings.members_read','goals.members_read',
 'jobs.members_read','mission_confirmation_targets.members_read','mission_entries.members_read',
 'mission_note_consents.members_read','mission_note_policies.members_read','project_members.members_read',
 'project_revisions.members_read','projects.members_read','source_dependencies.members_read',
 'source_objects.eligible_sources_read','source_texts.readable_source','work_attempts.members_read'];
 got text[];
BEGIN
 SELECT array_agg(s.n ORDER BY s.n) INTO got FROM (SELECT c.relname||'.'||p.polname AS n FROM pg_policy p
   JOIN pg_class c ON c.oid=p.polrelid
  WHERE c.relnamespace='sophia'::regnamespace AND c.relname IN ('commands','contributions','conversation_messages',
   'conversations','decisions','execution_bindings','goals','jobs','mission_confirmation_targets','mission_entries',
   'mission_note_consents','mission_note_policies','project_members','project_revisions','projects',
   'source_dependencies','source_objects','source_texts','work_attempts')
   AND p.polcmd IN ('r','*')) s;
 IF got IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(want) x)
   OR EXISTS(SELECT FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      WHERE c.relnamespace='sophia'::regnamespace AND c.relname||'.'||p.polname=ANY(want)
        AND (NOT p.polpermissive OR p.polcmd<>'r' OR p.polroles<>ARRAY['sophia_api'::regrole::oid])) THEN
  RAISE EXCEPTION 'the read policies are not the ones Q13 was reviewed against' USING ERRCODE='55000';
 END IF;
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
```
`ALTER POLICY … TO` changes only the role list. The `USING` expression, and so every `sophia_api` read, stays byte-identical. §5's T2 compares `pg_policies.qual` before and after.

### 3.3 Activation check (CON-provided, owner-run, read-only)

Proposed as `db/candidates/con01-s3-assembler-activation-check.sql`, a new CON file.
- **Where and how:** run in the target database by the owner, with `-v login=<the execution login>`, after the login is created and granted the assembler, and before it is used.
- **Result:** zero `violation` rows are required. `admission` rows are the owner's decision (§4).
- **What activation is bound to.** The login is not used until both hold:
  - **settlement:** the check, run on the actual target, returns no `violation` row. Among other things, no session of the login is open anywhere in the cluster. A session found is settled only by its own client ending; nothing here terminates one.
  - **admission configuration:** every `admission` row carries the owner's recorded decision in BINDING_MAP §8.7, the database by name:
    - **accepted**, with `PUBLIC`'s baseline there listed; or
    - **refused**, by one of the acts in §3.4, re-checked with this query.

  A changed admission configuration or a new database means re-running the check before use.
```sql
WITH l AS (SELECT * FROM pg_roles WHERE rolname=:'login'),
     a AS (SELECT oid FROM pg_roles WHERE rolname='sophia_conversation_assembler'),
     t AS (SELECT oid FROM pg_database WHERE datname=current_database())
SELECT 'violation' AS kind, 'no such login' AS what WHERE NOT EXISTS(SELECT FROM l)
UNION ALL SELECT 'violation', 'attribute' FROM l
 WHERE rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR NOT rolcanlogin
UNION ALL SELECT 'violation', 'member of '||m.roleid::regrole FROM pg_auth_members m, l, a
 WHERE m.member=l.oid AND m.roleid<>a.oid
UNION ALL SELECT 'violation', 'assembler edge: admin option or no SET' FROM pg_auth_members m, l, a
 WHERE m.member=l.oid AND m.roleid=a.oid AND (m.admin_option OR NOT m.set_option)
UNION ALL SELECT 'violation', 'not a member of the assembler' FROM l, a
 WHERE NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=l.oid AND m.roleid=a.oid)
UNION ALL SELECT 'violation', 'the login has a member: '||m.member::regrole FROM pg_auth_members m, l WHERE m.roleid=l.oid
UNION ALL SELECT 'violation', 'the assembler is a member of '||m.roleid::regrole FROM pg_auth_members m, a WHERE m.member=a.oid
UNION ALL SELECT 'violation', 'own privilege or object in '||coalesce((SELECT datname FROM pg_database WHERE oid=d.dbid),'(shared)')
 FROM pg_shdepend d, l, t WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=l.oid
  AND NOT (d.dbid=0 AND d.classid='pg_database'::regclass AND d.objid=t.oid)   -- its CONNECT on the target alone
UNION ALL SELECT 'violation', 'assembler holds something in '||coalesce((SELECT datname FROM pg_database WHERE oid=d.dbid),'(shared)')
 FROM pg_shdepend d, a, t WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=a.oid AND d.dbid<>t.oid
UNION ALL SELECT 'violation', 'session open in '||coalesce(s.datname,'?')||' (pid '||s.pid||')'
 FROM pg_stat_activity s, l WHERE s.usesysid=l.oid AND s.pid<>pg_backend_pid()
UNION ALL SELECT 'admission', 'can connect to '||d.datname||CASE WHEN has_database_privilege('public', d.oid, 'CONNECT')
   THEN ' (PUBLIC CONNECT)' ELSE ' (granted)' END
 FROM pg_database d, l, t WHERE d.datallowconn AND d.oid<>t.oid AND has_database_privilege(l.oid, d.oid, 'CONNECT');
```

### 3.4 Admission: what only the owner can do

The selected boundary would refuse the login's admission to every database but the target. In PostgreSQL that takes one of two acts. Both are cluster or deployment acts, outside CON's source and outside anything authorized here:
- **Per database:** `REVOKE CONNECT ON DATABASE <each other connectable database> FROM PUBLIC`. Re-grant `CONNECT` there to every role that still needs it. This changes admission for every login of the cluster.
- **Per role, in `pg_hba.conf`:** a line admitting the login to the target alone, then a `reject` line for that login on `all`, ahead of the general lines. This is possible only where the platform exposes `pg_hba`.

## 4. The incompatibility, stated exactly (Q13 crossing "other database admission")

**What can't be done from CON.** CON can't make a fresh connection by the login to another database of the cluster fail. Every database has `PUBLIC` `CONNECT` unless its owner revoked it, and `template1` is connectable by default.

**What was shown.** Owned cluster 55436, run 4 of the ad hoc demo (§7): the login is admitted to `postgres`, `template1` and a fresh `q13_other`. After `REVOKE CONNECT ON DATABASE q13_other FROM PUBLIC` it is refused there with `42501` "permission denied for database".

**The minimal effect under §3.** In any other database, the admitted login holds `PUBLIC`'s baseline and nothing else:
- the assembler is a member of no role;
- it holds nothing outside the target, and §3.1 refuses installation otherwise;
- the activation check (§3.3) refuses a login with anything of its own anywhere.

What `PUBLIC` itself holds there is the deployment's own fact. In the demo it was `TEMP`, where granted, and nothing on `public` under PostgreSQL 16. Activation lists those databases (`admission` rows) for the owner to decide: accept, or revoke as in §3.4.

**Not inferred:**
- no `CONNECT` revocation, `pg_hba` edit or session termination on any shared or hosted cluster;
- the actual deployment's databases and `PUBLIC` grants are an activation-time inventory, owner-held (§8.7).

## 5. Tests (CON-only, `packages/persistence/src/conversation-assembly.db.test.ts`), mapped to the Q13 crossings

All run on owned disposable PostgreSQL through a real login: `LOGIN NOINHERIT`, granted only the assembler, connecting fresh, never the owner with `SET ROLE`.

**Fail-before** is each test run against #211 `7d8f415f` unchanged.
- **Must fail there:** T4, T5, T6, T7, T8 and T9. At `7d8f` the assembler is a member of `sophia_api`, the login can `SET ROLE` to it and reach its writers, and a second installation is adopted. The activation check does not exist there.
- **Controls that pass at both:** T1, T2, T3 and T10. Assembly, unchanged predicates, read equality, and logins that can't assume each other already hold at `7d8f`, and must keep holding.

**After** is the corrected candidate, where all must pass.

| Crossing | Test |
|---|---|
| Intended database admission | **T1**: a fresh connection by the login URL; `assembleReply` reaches `recorded`; the context equals the one assembled for the same scene before (unchanged compiler) |
| Required assembly only | The existing lifecycle cases, unchanged, now through a login that holds only the assembler: claim, begin, record, close, fail, wrong lease, withdrawn source, exhausted. **T2**: every `pg_policies.qual` and `with_check` on the 20 relations is byte-identical before and after the candidate. **T3**: as the login, the asker's mission context and window equal the API login's for the same actor and scene, and a removed or ineligible asker reads what the API reads |
| Inherited authority | **T4**: a recursive walk of `pg_auth_members` from the login (inherit options), plus `PUBLIC`, ownership, default privileges and direct grants. Expected: the assembler only; the assembler a member of nothing; `SELECT` on exactly the 20 relations; `EXECUTE` on exactly the 9 functions; nothing writable; no sequence. Then through the login: reading an out-of-scope table (`sophia.outbox`, `sophia.runtime_commands`, `sophia.research_allowances`) gives `42501` |
| Assumable authority | **T5**: for every role in the cluster, `pg_has_role(login, r, 'SET')` holds only for the login and the assembler, and `SET ROLE r` for each other role gives `42501`. Among them: `sophia_api`, `sophia_worker`, the test API and worker logins, and a second assembler login. The role's attributes are refused before any partial install (the existing attribute and membership cases) |
| Operational writers | **T6**: every function in `sophia` executable by `sophia_api` or `sophia_worker` today, taken from the catalog and not a hand list, is called by the login with typed `NULL` arguments in a rolled-back transaction. Each gives `42501` before it runs, except the 9. Direct `INSERT`, `UPDATE` and `DELETE` on every `sophia` table, and `nextval` on every sequence, give `42501`. The digests of the operational tables (commands, jobs, goals, outbox, runtime, allowance, contributions) are unchanged |
| Other database admission | **T7**: two synthetic databases besides the target. One is fresh. The other has the Sophia schema migrated and **the candidate refused there** (T8). The login is admitted to both (`PUBLIC` CONNECT) and in both reads nothing of `sophia` (`42501`). With `CONNECT` revoked from `PUBLIC` on the fresh one (owned and synthetic), it is refused. The activation check lists both as `admission` rows |
| Scope to one database | **T8**: installing the candidate in a second database of the same cluster is refused ("privileges or objects of its own"). This replaces today's "adopts an existing role" control, which applied in a second database. The other found-role cases are kept |
| Pre-existing out-of-scope session | **T9**: before the activation check, an owned session by the login is open in another database. The check reports it (`violation`, a session). Revoking `PUBLIC` `CONNECT` there does not end it: it still queries. Its client closes voluntarily, and the check then passes. No other process is terminated |
| Concurrent identities and restart | **T10**: two logins, each a member of the assembler; neither can `SET ROLE` the other. Each `assembleReply` call opens and destroys its own connections: no backend pid is reused across calls, and `current_user` after each transaction is the login. A revoked login's next call fails at connect or `SET LOCAL ROLE`, and its claim count is unchanged: no fresh attempt is created by the failure |

## 6. What this does not settle

- **Admission elsewhere:** §4. It is the owner's choice at activation, with the live inventory.
- **The actor:** a login holding the assembler can read as an actor other than the reply's asker, in the 20 relations only. Narrowing that needs claim-bound policies (§2), which are not proposed.
- **Policy drift:** T2 and the §3.2 check catch a changed policy at install. After install, a later migration that drops and recreates one of the 19 policies for `sophia_api` alone makes the assembly `unreadable` (fail-closed). A later **restrictive** policy added for `sophia_api` alone would not bind the assembler (fail-open). A CON test (T2's second half) asserts parity: every SELECT or ALL policy on the 20 relations names both roles, or neither. It fails the shared suite the moment such a policy lands.
- **Native execution isolation, provider eligibility, useful answers and app acceptance** are not touched by this database proof.

## 7. Ad hoc evidence so far (owned cluster 55436, PostgreSQL 16.15). Not qualification

These runs apply §3.2 as ad hoc SQL to a disposable database built from #211 `7d8f415f` with s1–s3. They are not the installed candidate.
- **Script:** `q13-demo.ts`, `2a3b3858…`, in the session scratchpad.

| Run | Outcome | Counts as |
|---|---|---|
| 1 | Aborted, `42P19` (my recursive CTE). Its cleanup hung and was killed by `timeout 300` (exit 124); my manual cleanup at 23:36:51Z returned the cluster to its baseline | **void, not a pass** |
| 2 | Aborted, `42601` (role list read as a string) | void |
| 3 | `42501` on `is_task_kind`, called by `native_task_view` (0022:90). The scope query had missed view dependencies; it now includes them, so the function is in §3.2 | void |
| 4 | Exit 0. Before: the login reads as the asker, `SET ROLE sophia_api` succeeds, `submit_contribution` writes a row. Gap: `42501` on the schema; grants without policies give context `null`, window `[]`. After: the read is equal, `assembleReply` reaches `recorded`, and the four denials hold. The pre-existing session still reaches the writer. Admission as in §4. Cleanup to baseline (`q13-demo.jsonl` `1bce9b54…`) | evidence for this proposal only |

**Validation of this document's exact SQL** (`q13-validate.sh`). It extracts the four `sql` blocks above verbatim and builds s3 from #211's file plus §3.1 and §3.2. On a fresh owned database it applies migrations 0001–0048, s1, s2, then that s3, all on 55436. It also tries a second installation and runs §3.3 with an owned session open, then again after that client exits on its own. Every database and role is dropped, and the census is back to baseline.

| Run | Outcome | Counts as |
|---|---|---|
| v1 | **Two defects in my SQL.** §3.2's check refused a clean database, because `array_agg(… ORDER BY 1)` sorts by the constant 1. §3.3 failed `42702`, an ambiguous `oid`. Both fixed in this text | void, kept |
| v2 | Installs. The assembler is a member of none; 19 policies name it; 0 of the 20 relations keep a `sophia_api`-only policy. The second installation is refused ("privileges or objects of its own"). The check returns `violation \| session open in postgres` plus 3 `admission` rows (`postgres`, `template1`, the second database, all `PUBLIC CONNECT`). After the owned client exits, the 3 `admission` rows alone | exact text applies, on a disposable database; not the installed candidate or a qualification |

## 8. Affected shared objects and their owners (the acknowledgement this needs)

| Objects | Defined in | Acknowledgement from |
|---|---|---|
| Policies `members_read` on `commands`, `decisions`, `execution_bindings`, `goals`, `jobs`, `project_members`, `project_revisions`, `projects`, `source_dependencies`, `work_attempts`; `eligible_sources_read` on `source_objects`; `actor_id()`, `is_member(uuid)`; schema `sophia` `USAGE` | `0002_roles_rls.sql` | the owner of the core schema, as recorded (Davide where none is) |
| Policies `members_read` on `contributions`; `readable_source` on `source_texts` | `0012_runtime_service.sql` | the runtime surface's owners: the joint WBC-02/SDD-01 lane under r2 |
| `native_task_view`; `is_task_kind(text)` | the view in `0012`, replaced in `0022_research_readers.sql`; the function in `0022`, replaced in `0038_design_records.sql` | the research and design surface's owners: the joint WBC-02/SDD-01 lane under r2 |
| Policies `members_read` on `mission_confirmation_targets`, `mission_entries`, `mission_note_consents`, `mission_note_policies`; `mission_capture_default()` | `0018_mission_ledger.sql`, `0019_default_mission_capture.sql` | the mission ledger's owner, as recorded (Davide where none is) |
| Policies `members_read` on `conversations`, `conversation_messages` | `0048_project_conversations.sql` | CON-01 (its own) |

Codex routes these. I don't name an owner the records don't name.

- **No applied migration is edited.** Every change is in the S3 candidate, which takes its own census number later.
- **No shared source file is written.** The shared surface is these database objects alone.
- **Order once acknowledged:**
  1. the CON-only pin, with §3.2 and the tests;
  2. the fail-before at `7d8f415f`;
  3. the after, `test:sql` and `pnpm check`;
  4. an immutable handback;
  5. Codex's independent qualification against §5.
