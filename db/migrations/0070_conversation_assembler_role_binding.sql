-- FND-B2-ORDINARY-ASK-ASSEMBLY-01: the conversation assembler's role and its read surface, and nothing else. 0064
-- already installs every assembly table, function, trigger and row-security switch (executable by their owner alone);
-- this adds what the review-only S3 candidate (db/candidates/con01-s3-conversation-reply-context.sql) grants on top,
-- by an exact diff against 0064: the NOLOGIN role, EXECUTE on the five entry points and the two claim-bound helpers,
-- the Q13 read grants, and the claim-bound read policies. No object is created or replaced, no owner is changed, and no
-- login or credential is made: admitting an execution login is a separate, reviewed operator act (Q13 activation check,
-- db/candidates/con01-s3-assembler-activation-check.sql). The one membership made is PostgreSQL's own, for a trusted
-- non-superuser installer that creates the role (D-Q13, below).
-- * The role is adopted only bare, exactly as the candidate's guard (Q13, D-8), kept byte for byte: NOLOGIN and no
--   unsafe attribute, a member of no role and with no member, and holding nothing of its own ANYWHERE in the cluster
--   (pg_shdepend, every database). So a second installation in the same cluster is refused before anything is granted,
--   and a login admitted for one installation never gains another's assembly surface. Admitting a login stays the
--   separate operator act; a test cluster runs one migrated installation at a time and tears it down before the next.
-- * The Q13 read identities (policies, view, helper functions) are checked before anything is granted, unchanged from
--   the candidate, and match the schema through 0067.
BEGIN;

DO $$
DECLARE a oid; fresh boolean:=false; i oid;
BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
  CREATE ROLE sophia_conversation_assembler NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
  fresh:=true;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_conversation_assembler'
    AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
  RAISE EXCEPTION 'sophia_conversation_assembler exists with unsafe attributes' USING ERRCODE='42501';
 END IF;
-- A role found is adopted only bare (Q13, D-8): a member of no role and with no member, so it inherits and assumes
 -- nothing and lends the entry points to no one. Anything else is refused; nothing is revoked.
 SELECT oid INTO STRICT a FROM pg_roles WHERE rolname='sophia_conversation_assembler';
 -- D-Q13, the owner-approved trusted-creator exception: the trusted installation owner (postgres, not a superuser,
 -- owning this database and schema sophia, as on hosted Supabase) that has just created the role above is made its
 -- creator by PostgreSQL: one edge, ADMIN, granted by the bootstrap superuser (OID 10), no INHERIT, no SET, which it
 -- cannot revoke. Exactly that edge, written in this transaction, with the default createrole_self_grant, is accepted
 -- and recorded on the role (con01-q13-fresh-creator v1). A role found already made, any other installer, any other
 -- edge or option: refused as before. The owner can still grant itself SET: the role is not isolated from it.
 SELECT r.oid INTO i FROM pg_roles r WHERE r.rolname='postgres' AND NOT r.rolsuper AND r.rolcreaterole
  AND r.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
  AND r.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='sophia');
 IF fresh AND i IS NOT NULL AND current_user='postgres' AND session_user='postgres'
    AND current_setting('createrole_self_grant')=''
    AND (SELECT count(*) FROM pg_auth_members m WHERE m.member=a OR m.roleid=a)=1
    AND EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
     WHERE m.roleid=a AND m.member=i AND m.grantor=10 AND g.rolsuper AND m.admin_option AND NOT m.inherit_option
      AND NOT m.set_option AND m.xmin=pg_current_xact_id()::xid) THEN
  EXECUTE format('COMMENT ON ROLE sophia_conversation_assembler IS %L', 'con01-q13-fresh-creator v1 edge='||
   (SELECT m.oid FROM pg_auth_members m WHERE m.roleid=a)||' installer='||i);
 ELSIF EXISTS(SELECT FROM pg_auth_members m WHERE m.member=a OR m.roleid=a) THEN
  RAISE EXCEPTION 'sophia_conversation_assembler exists with unexpected memberships' USING ERRCODE='42501';
 END IF;
 -- Nor anything of its own anywhere in the cluster (Q13; PR #211 r4242793043, r4242913900): pg_shdepend names the role
 -- for every object it owns, every privilege granted to it (default privileges included) and every policy naming it,
 -- in every database. So the role holds what this file grants in one database alone, and a second installation in the
 -- same cluster is refused.
 IF EXISTS(SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=a) THEN
  RAISE EXCEPTION 'sophia_conversation_assembler exists with privileges or objects of its own' USING ERRCODE='42501';
 END IF;
END $$;

-- The five entry points and the two claim-bound helpers 0064 installed for their owner alone.
GRANT EXECUTE ON FUNCTION sophia.conversation_assembly_claim(uuid,integer),
 sophia.conversation_assembly_begin(uuid,integer,uuid), sophia.conversation_assembly_close(uuid,integer,uuid,text),
 sophia.conversation_assembly_fail(uuid,integer,uuid,text), sophia.conversation_record_context(uuid,integer,uuid,jsonb),
 sophia.conversation_assembly_project(), sophia.conversation_actor_label(uuid,uuid,text)
 TO sophia_conversation_assembler;

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
       'sophia.is_task_kind(text)'::regprocedure,'sophia.mission_capture_default()'::regprocedure,
       'sophia.actor_label(uuid,uuid,text)'::regprocedure,'sophia.kept_name(text)'::regprocedure))
   IS DISTINCT FROM ARRAY['sophia.actor_id() 27098852bf55bc01c3c6b938a646491c',
    'sophia.actor_label(uuid,uuid,text) 8c748d42671b0a38ad081382766d1ffd',
    'sophia.is_member(uuid) 73e40f4a2d8d6af95f8d414c6c2ee784','sophia.is_task_kind(text) ab5390873bf78035cc94d99466f49d12',
    'sophia.kept_name(text) 6206e79ec9c0e29173324e2fb00f85c9',
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

-- The shared read policies name the assembler too; the restrictive policies below bind its reads to its claim.
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

COMMIT;
