-- INC04-S01b R2 (0106): the selection snapshot decides the caller's role first. Run against a disposable database with
-- every migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * The replaced snapshot keeps 0104's privileges, definer, search_path, time zone and volatility; the private marker
--   is executable by no application role.
-- * A current viewer gets the minimal restricted form (exactly five keys) at 0, 200 and 201 private candidates, while an
--   editor gets the full form: complete at 200, incomplete at 201. Nonmember, missing project, former viewer and no
--   actor stay NULL; an invalid source list is refused for a viewer as for anyone.
-- * SYNTHETIC helper faults (the private helpers replaced, inside this rolled-back test, by stubs that raise): the viewer
--   still gets the restricted form, the editor meets the fault. A regression witness, not evidence about production.
-- The relation-level witness (the viewer never waits on the pool's tables) is in selection-installation.db.test.ts.
BEGIN;

-- --- privileges and the marker -------------------------------------------------------------------------------------
DO $$ DECLARE f record; BEGIN
 SELECT p.prosecdef, p.proconfig, p.provolatile, p.proacl INTO f FROM pg_proc p
  WHERE p.oid='sophia.selection_snapshot(uuid,uuid[])'::regprocedure;
 IF NOT f.prosecdef OR f.provolatile<>'s' OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia','TimeZone=UTC'] THEN
  RAISE EXCEPTION 'The snapshot is no longer a STABLE definer with a fixed search_path in UTC: %', f.proconfig; END IF;
 IF NOT has_function_privilege('sophia_api','sophia.selection_snapshot(uuid,uuid[])','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.selection_snapshot(uuid,uuid[])','EXECUTE')
    OR has_function_privilege('sophia_conversation_assembler','sophia.selection_snapshot(uuid,uuid[])','EXECUTE')
    OR EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0) THEN
  RAISE EXCEPTION 'The snapshot is not sophia_api''s alone'; END IF;
 IF to_regprocedure('sophia.selection_viewer_boundary_0106()') IS NULL OR sophia.selection_viewer_boundary_0106()<>106 THEN
  RAISE EXCEPTION 'The 0106 marker is missing'; END IF;
 IF has_function_privilege('sophia_api','sophia.selection_viewer_boundary_0106()','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.selection_viewer_boundary_0106()','EXECUTE')
    OR has_function_privilege('sophia_conversation_assembler','sophia.selection_viewer_boundary_0106()','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid='sophia.selection_viewer_boundary_0106()'::regprocedure AND a.grantee=0) THEN
  RAISE EXCEPTION 'An application role or PUBLIC executes the marker'; END IF;
END $$;

-- --- fixtures (migration owner) --------------------------------------------------------------------------------------
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('a6000000-0000-0000-0000-000000000001','Project R2','a6000000-0000-0000-0000-0000000000a1');
INSERT INTO sophia.project_members(project_id,actor_id,role,active) VALUES
 ('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-0000000000a1','admin',true),
 ('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-0000000000e1','editor',true),
 ('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-0000000000f1','viewer',true),
 ('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-0000000000f2','viewer',false);
SELECT sophia.set_research_grant('a6000000-0000-0000-0000-000000000001','enabled',5,40,'web-pilot-v1','approval:test');
INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES
 ('a6000000-0000-0000-0000-0000000000c1','a6000000-0000-0000-0000-0000000000e1','synthetic','synthetic','linked');
CREATE TEMP TABLE seen(k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON seen TO PUBLIC;

-- One read as `actor`, kept under `k`.
CREATE FUNCTION pg_temp.read_as(p_key text, p_actor text, p_sources uuid[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('sophia.actor_id',p_actor,true);
 INSERT INTO seen VALUES(p_key,sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001',p_sources));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.read_as(text,text,uuid[]) TO PUBLIC;

-- The restricted form: exactly its five keys, this caller and project, the viewer's own membership, an instant of now.
CREATE FUNCTION pg_temp.assert_restricted(p_key text, p_actor text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s jsonb:=(SELECT v FROM seen WHERE k=p_key);
BEGIN
 IF s IS NULL OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(s) x)
    IS DISTINCT FROM ARRAY['actorId','evaluatedAt','evaluation','member','projectId'] THEN
  RAISE EXCEPTION '%: not the minimal restricted form: %', p_key, s; END IF;
 IF s->>'evaluation'<>'restricted' OR s->>'projectId'<>'a6000000-0000-0000-0000-000000000001' OR s->>'actorId'<>p_actor
    OR s->'member'->>'role'<>'viewer' OR NOT (s->'member'->>'active')::boolean
    OR (s->>'evaluatedAt')::timestamptz NOT BETWEEN now() AND clock_timestamp() THEN
  RAISE EXCEPTION '%: restricted form %', p_key, s; END IF;
END $$;

-- --- 0, 200 and 201 private candidates ---------------------------------------------------------------------------------
SET LOCAL ROLE sophia_api;
SELECT pg_temp.read_as('viewer-0','a6000000-0000-0000-0000-0000000000f1','{}');
SELECT pg_temp.read_as('editor-0','a6000000-0000-0000-0000-0000000000e1','{}');
RESET ROLE;
INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
 SELECT 'a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-0000000000e1','a6000000-0000-0000-0000-0000000000c1',
  'claude-native','PRIVATE-label','/PRIVATE','active' FROM generate_series(1,200);
SET LOCAL ROLE sophia_api;
SELECT pg_temp.read_as('viewer-200','a6000000-0000-0000-0000-0000000000f1','{}');
SELECT pg_temp.read_as('admin-200','a6000000-0000-0000-0000-0000000000a1','{}');
RESET ROLE;
INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
 VALUES('a6000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-0000000000e1','a6000000-0000-0000-0000-0000000000c1',
  'claude-native','PRIVATE-label','/PRIVATE','active');
SET LOCAL ROLE sophia_api;
SELECT pg_temp.read_as('viewer-201','a6000000-0000-0000-0000-0000000000f1','{}');
SELECT pg_temp.read_as('editor-201','a6000000-0000-0000-0000-0000000000e1','{}');
RESET ROLE;

DO $$ DECLARE kk text; e0 jsonb:=(SELECT v FROM seen WHERE k='editor-0'); a2 jsonb:=(SELECT v FROM seen WHERE k='admin-200');
 e1 jsonb:=(SELECT v FROM seen WHERE k='editor-201'); BEGIN
 FOREACH kk IN ARRAY ARRAY['viewer-0','viewer-200','viewer-201'] LOOP
  PERFORM pg_temp.assert_restricted(kk,'a6000000-0000-0000-0000-0000000000f1');
  IF (SELECT v-'evaluatedAt' FROM seen WHERE k=kk)<>(SELECT v-'evaluatedAt' FROM seen WHERE k='viewer-0') THEN
   RAISE EXCEPTION 'The viewer''s form at % differs from the form at 0', kk; END IF;
 END LOOP;
 -- The evaluators still get the full 0104 facts, marked full.
 IF e0->>'evaluation'<>'full' OR NOT (e0->>'complete')::boolean OR jsonb_array_length(e0->'candidates')<>0
    OR e0->'gate'->>'state'<>'enabled' OR e0->'projectBudget'<>'true' OR e0->'member'->>'role'<>'editor' THEN
  RAISE EXCEPTION 'Editor at 0: %', e0; END IF;
 IF a2->>'evaluation'<>'full' OR NOT (a2->>'complete')::boolean OR jsonb_array_length(a2->'candidates')<>200
    OR a2->'candidates'->0->>'kind'<>'native' OR a2->'candidates'->0->>'route'<>'none' OR a2->'member'->>'role'<>'admin' THEN
  RAISE EXCEPTION 'Admin at 200: complete %, %', a2->>'complete', a2->'candidates'->0; END IF;
 IF e1->>'evaluation'<>'full' OR (e1->>'complete')::boolean OR jsonb_array_length(e1->'candidates')<>0 THEN
  RAISE EXCEPTION 'Editor at 201 is incomplete and lists none: %', e1->>'complete'; END IF;
END $$;

-- --- membership and the closed request --------------------------------------------------------------------------------
SET LOCAL ROLE sophia_api;
DO $$ BEGIN
 -- A former (inactive) viewer, an outsider, a missing project and no actor: NULL, as in 0104.
 PERFORM set_config('sophia.actor_id','a6000000-0000-0000-0000-0000000000f2',true);
 IF sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001','{}') IS NOT NULL THEN RAISE EXCEPTION 'Former viewer'; END IF;
 PERFORM set_config('sophia.actor_id','a6000000-0000-0000-0000-0000000000ff',true);
 IF sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001','{}') IS NOT NULL THEN RAISE EXCEPTION 'Outsider'; END IF;
 PERFORM set_config('sophia.actor_id','a6000000-0000-0000-0000-0000000000f1',true);
 IF sophia.selection_snapshot('a6000000-0000-0000-0000-0000000000ee','{}') IS NOT NULL THEN RAISE EXCEPTION 'Missing project'; END IF;
 PERFORM set_config('sophia.actor_id','',true);
 IF sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001','{}') IS NOT NULL THEN RAISE EXCEPTION 'No actor'; END IF;
 -- A viewer's invalid source list is refused like anyone's (the closed request), before membership is read.
 PERFORM set_config('sophia.actor_id','a6000000-0000-0000-0000-0000000000f1',true);
 BEGIN PERFORM sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001',
   ARRAY['a6000000-0000-0000-0000-00000000d001','a6000000-0000-0000-0000-00000000d001']::uuid[]);
  RAISE EXCEPTION 'A repeated source was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;

-- --- SYNTHETIC helper faults ------------------------------------------------------------------------------------------
-- Stage 1: only the native candidate helper raises. The pool has 201, so shrink it to 1 first; the editor's full read
-- reaches the helper and meets the fault, the viewer's does not.
DELETE FROM sophia.executor_resources WHERE project_id='a6000000-0000-0000-0000-000000000001'
 AND id<>(SELECT min(id::text)::uuid FROM sophia.executor_resources WHERE project_id='a6000000-0000-0000-0000-000000000001');
SET LOCAL ROLE sophia_api;
SELECT pg_temp.read_as('editor-1-healthy','a6000000-0000-0000-0000-0000000000e1','{}');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT jsonb_array_length(v->'candidates') FROM seen WHERE k='editor-1-healthy')<>1 THEN
  RAISE EXCEPTION 'The matched editor read is not healthy: %', (SELECT v FROM seen WHERE k='editor-1-healthy'); END IF;
END $$;
CREATE OR REPLACE FUNCTION sophia.selection_native_candidate(r sophia.executor_resources, p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
BEGIN RAISE EXCEPTION 'SYNTHETIC selection helper fault' USING ERRCODE='XX000'; END $$;
SET LOCAL ROLE sophia_api;
SELECT pg_temp.read_as('viewer-fault-1','a6000000-0000-0000-0000-0000000000f1','{}');
DO $$ BEGIN
 PERFORM set_config('sophia.actor_id','a6000000-0000-0000-0000-0000000000e1',true);
 BEGIN PERFORM sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001','{}');
  RAISE EXCEPTION 'The editor did not reach the faulted helper';
 EXCEPTION WHEN internal_error THEN
  IF SQLERRM<>'SYNTHETIC selection helper fault' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;

-- Stage 2: every private pool, budget and source helper raises; the viewer names sources and still gets its form.
CREATE OR REPLACE FUNCTION sophia.selection_project_budget(p_project uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
BEGIN RAISE EXCEPTION 'SYNTHETIC selection budget fault' USING ERRCODE='XX000'; END $$;
CREATE OR REPLACE FUNCTION sophia.selection_api_candidate(gr sophia.api_contribution_grants, p_actor uuid,
 pin sophia.research_funding_pins, p_budget boolean, p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
BEGIN RAISE EXCEPTION 'SYNTHETIC selection helper fault' USING ERRCODE='XX000'; END $$;
CREATE OR REPLACE FUNCTION sophia.selection_source(p_project uuid, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
BEGIN RAISE EXCEPTION 'SYNTHETIC selection source fault' USING ERRCODE='XX000'; END $$;
SET LOCAL ROLE sophia_api;
SELECT pg_temp.read_as('viewer-fault-2','a6000000-0000-0000-0000-0000000000f1',
 ARRAY['a6000000-0000-0000-0000-00000000d001','a6000000-0000-0000-0000-00000000d002']::uuid[]);
DO $$ BEGIN
 PERFORM set_config('sophia.actor_id','a6000000-0000-0000-0000-0000000000a1',true);
 BEGIN PERFORM sophia.selection_snapshot('a6000000-0000-0000-0000-000000000001','{}');
  RAISE EXCEPTION 'The admin did not reach the faulted budget';
 EXCEPTION WHEN internal_error THEN
  IF SQLERRM<>'SYNTHETIC selection budget fault' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
DO $$ BEGIN
 PERFORM pg_temp.assert_restricted('viewer-fault-1','a6000000-0000-0000-0000-0000000000f1');
 PERFORM pg_temp.assert_restricted('viewer-fault-2','a6000000-0000-0000-0000-0000000000f1');
 IF (SELECT v-'evaluatedAt' FROM seen WHERE k='viewer-fault-2')<>(SELECT v-'evaluatedAt' FROM seen WHERE k='viewer-0') THEN
  RAISE EXCEPTION 'The viewer''s form under faults differs from its healthy form'; END IF;
END $$;

ROLLBACK;
