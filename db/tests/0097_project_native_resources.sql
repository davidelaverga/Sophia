-- INC01-CC-006 (0097): the native resource catalog at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * Only sophia_api executes the reader; no application role executes its private helpers. Definer, fixed search_path.
-- * A nonmember and a missing project read NULL; a member reads native resources only (no dsh), the owner alone `mine`.
-- * Pages of 200 by id, a next cursor only when a 201st row exists, no row twice.
-- States, hosts, qualifications, roles and HTTP run on real roles in project-resources.db.test.ts (persistence and API).
BEGIN;

-- --- privileges -------------------------------------------------------------------------------------------------------
DO $$ DECLARE f record; BEGIN
 IF NOT has_function_privilege('sophia_api','sophia.project_native_resources(uuid,uuid)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.project_native_resources(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'The reader is not sophia_api''s alone'; END IF;
 IF has_function_privilege('sophia_api','sophia.project_native_resource_mine(sophia.executor_resources,timestamptz)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.project_native_qualification_state(sophia.owner_runner_qualifications,sophia.executor_resources,sophia.execution_connections,timestamptz)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.project_native_resource_mine(sophia.executor_resources,timestamptz)','EXECUTE') THEN
  RAISE EXCEPTION 'An application role executes a private helper'; END IF;
 FOR f IN SELECT p.proname, p.prosecdef, p.proconfig, p.provolatile, p.proacl FROM pg_proc p
   WHERE p.pronamespace='sophia'::regnamespace AND p.proname IN
    ('project_native_resources','project_native_resource_mine','project_native_qualification_state') LOOP
  -- r2: the entry point alone renders in a fixed UTC zone; its helpers run inside it.
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia']
       || (SELECT ARRAY['TimeZone=UTC'] WHERE f.proname='project_native_resources') OR f.provolatile<>'s'
     OR EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0) THEN
   RAISE EXCEPTION '% is not a stable definer with a fixed search_path and no PUBLIC execute', f.proname; END IF;
 END LOOP;
END $$;

-- --- fixtures (migration owner) ------------------------------------------------------------------------------------
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('97000000-0000-0000-0000-000000000001','Project A','97000000-0000-0000-0000-0000000000a1');
INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES
 ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-0000000000a1','editor'),
 ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-0000000000a2','editor');
INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES
 ('97000000-0000-0000-0000-0000000000c1','97000000-0000-0000-0000-0000000000a1','synthetic','synthetic','linked');
INSERT INTO sophia.executor_resources(project_id,id,owner_id,connection_id,harness,label,repository_root,state) VALUES
 ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000101','97000000-0000-0000-0000-0000000000a1',
  '97000000-0000-0000-0000-0000000000c1','claude-native','PRIVATE-LABEL','/home/PRIVATE-ROOT','active');
INSERT INTO sophia.executor_resources(project_id,id,owner_id,connection_id,harness,label,repository_root,state) VALUES
 ('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000100','97000000-0000-0000-0000-0000000000a1',
  NULL,'dsh','Sophia runtime','/srv/dsh','active');

-- --- the gate and the owner's part -----------------------------------------------------------------------------------
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','97000000-0000-0000-0000-0000000000a1',true);
DO $$ DECLARE p jsonb; r jsonb; BEGIN
 p:=sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL);
 IF jsonb_array_length(p->'resources')<>1 OR p->>'complete'<>'true' OR p->'nextCursor'<>'null'::jsonb
    OR p->>'observedAt' IS NULL OR jsonb_array_length(p->'notReported')<>8 THEN RAISE EXCEPTION 'Owner page: %', p; END IF;
 r:=p->'resources'->0;
 IF r->>'tool'<>'claude' OR r->>'state'<>'active' OR NOT (r->'owner'->>'isYou')::boolean OR NOT (r->'owner'->>'isMember')::boolean
    OR r->'mine'->'connection'->>'state'<>'linked' OR r->'mine'->'host'<>'null'::jsonb
    OR r->'mine'->'recordedQualification'->>'state'<>'none' THEN RAISE EXCEPTION 'Owner resource: %', r; END IF;
 IF p::text ~ 'PRIVATE|/home|/srv|dsh' THEN RAISE EXCEPTION 'A label, path or the dsh row leaked: %', p; END IF;
END $$;
SELECT set_config('sophia.actor_id','97000000-0000-0000-0000-0000000000a2',true);
DO $$ DECLARE p jsonb; BEGIN
 p:=sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL);
 IF p->'resources'->0->'mine'<>'null'::jsonb OR (p->'resources'->0->'owner'->>'isYou')::boolean THEN
  RAISE EXCEPTION 'A teammate sees the owner''s part: %', p; END IF;
END $$;
SELECT set_config('sophia.actor_id','97000000-0000-0000-0000-0000000000ff',true);
DO $$ BEGIN
 IF sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL) IS NOT NULL
    OR sophia.project_native_resources('97000000-0000-0000-0000-00000000dead',NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'A nonmember or a missing project reads a page'; END IF;
END $$;
SELECT set_config('sophia.actor_id','',true);
DO $$ BEGIN
 IF sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'No actor reads a page'; END IF;
END $$;
RESET ROLE;

-- --- r1 (CC006-F01/F02): a record the frozen qualifier accepts stays readable, as recorded ---------------------------
-- Repeated, reordered operations read as their set in the fixed order; an infinity expiry, which has no RFC 3339 form,
-- reads as null while the state is still judged on the recorded value (current, not expired).
SELECT sophia.qualify_owner_runner('97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000101',
 'ade473018d32003658b7d38693e083ee2e314bd8','env-1','project-1','read-only-v1',1,'gateway_enforced','acct-1',
 ARRAY['stop','create','stop'],5,'infinity','synthetic fixture');
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','97000000-0000-0000-0000-0000000000a1',true);
DO $$ DECLARE q jsonb; BEGIN
 q:=sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL)->'resources'->0->'mine'->'recordedQualification';
 IF q->>'state'<>'current' OR q->'operations'<>'["create","stop"]'::jsonb OR q->'expiresAt'<>'null'::jsonb
    OR q->>'qualifiedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN RAISE EXCEPTION 'Recorded qualification as read: %', q; END IF;
END $$;
RESET ROLE;

-- --- r2 (CC006-R1-F01): every outward time is RFC 3339 in UTC, whatever the caller's session zone --------------------
-- A legal 1900 time in a session in Asia/Kathmandu would render with a seconds offset (+05:41:16); the reader renders in
-- UTC, so it reads 1900-01-01T00:00:00+00:00, observedAt is +00:00 too, and the caller's own zone is left as it was.
UPDATE sophia.owner_runner_qualifications SET qualified_at='1900-01-01T00:00:00Z'
 WHERE resource_id='97000000-0000-0000-0000-000000000101';
SET LOCAL ROLE sophia_api;
SET LOCAL TimeZone='Asia/Kathmandu';
SET LOCAL DateStyle='SQL, DMY';
SELECT set_config('sophia.actor_id','97000000-0000-0000-0000-0000000000a1',true);
DO $$ DECLARE p jsonb; q jsonb; BEGIN
 p:=sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL);
 q:=p->'resources'->0->'mine'->'recordedQualification';
 IF q->>'qualifiedAt'<>'1900-01-01T00:00:00+00:00' OR q->>'state'<>'current' OR q->'expiresAt'<>'null'::jsonb
    OR p->>'observedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?\+00:00$'
 THEN RAISE EXCEPTION 'Times in a Kathmandu session: %', p; END IF;
 IF current_setting('TimeZone')<>'Asia/Kathmandu' OR current_setting('DateStyle')<>'SQL, DMY' THEN
  RAISE EXCEPTION 'The read changed the caller''s session: % %', current_setting('TimeZone'), current_setting('DateStyle');
 END IF;
END $$;
RESET TimeZone;
RESET DateStyle;
RESET ROLE;

-- --- pages: 205 more resources, pages of 200 by id, a cursor only when a 201st row exists -----------------------------
INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
SELECT '97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-0000000000a1','97000000-0000-0000-0000-0000000000c1',
 'codex-native','x','x','active' FROM generate_series(1,205);
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','97000000-0000-0000-0000-0000000000a2',true);
DO $$ DECLARE p1 jsonb; p2 jsonb; ids uuid[]; BEGIN
 p1:=sophia.project_native_resources('97000000-0000-0000-0000-000000000001',NULL);
 IF jsonb_array_length(p1->'resources')<>200 OR (p1->>'complete')::boolean
    OR p1->>'nextCursor'<>p1->'resources'->199->>'id' THEN RAISE EXCEPTION 'First page wrong'; END IF;
 p2:=sophia.project_native_resources('97000000-0000-0000-0000-000000000001',(p1->>'nextCursor')::uuid);
 IF jsonb_array_length(p2->'resources')<>6 OR NOT (p2->>'complete')::boolean OR p2->'nextCursor'<>'null'::jsonb THEN
  RAISE EXCEPTION 'Last page wrong: % rows', jsonb_array_length(p2->'resources'); END IF;
 SELECT array_agg((e->>'id')::uuid ORDER BY (e->>'id')::uuid) INTO ids
  FROM (SELECT jsonb_array_elements(p1->'resources') e UNION ALL SELECT jsonb_array_elements(p2->'resources')) x;
 IF cardinality(ids)<>206 OR (SELECT count(DISTINCT u) FROM unnest(ids) u)<>206
    OR ids IS DISTINCT FROM (SELECT array_agg(id ORDER BY id) FROM sophia.executor_resources
      WHERE project_id='97000000-0000-0000-0000-000000000001' AND harness<>'dsh') THEN
  RAISE EXCEPTION 'Pages miss or repeat a resource'; END IF;
END $$;
ROLLBACK;
