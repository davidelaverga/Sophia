-- Keep admission distinct from billing, authentication and provider outcomes.
-- Only a currently configured send worker with the matching custody generation supplies readiness.
BEGIN;

CREATE TABLE sophia.managed_explore_worker_readiness (
 route_id text NOT NULL,
 provider_org text NOT NULL,
 provider_project text NOT NULL,
 credential_generation bigint NOT NULL,
 instance_id uuid NOT NULL,
 ready_until timestamptz NOT NULL,
 PRIMARY KEY(route_id,provider_org,provider_project,credential_generation,instance_id)
);
ALTER TABLE sophia.managed_explore_worker_readiness ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.record_managed_explore_worker_readiness(
 p_route text,p_org text,p_provider_project text,p_generation bigint,p_instance uuid,p_ready boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Worker role required' USING ERRCODE='42501'; END IF;
 IF p_route IS NULL OR p_route !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  OR p_org IS NULL OR length(p_org) NOT BETWEEN 1 AND 200
  OR p_provider_project IS NULL OR length(p_provider_project) NOT BETWEEN 1 AND 200
  OR p_generation IS NULL OR p_generation NOT BETWEEN 1 AND 9007199254740991
  OR p_instance IS NULL OR p_ready IS NULL THEN
  RAISE EXCEPTION 'Invalid managed Explore readiness scope' USING ERRCODE='22023'; END IF;
 DELETE FROM sophia.managed_explore_worker_readiness
 WHERE route_id=p_route AND provider_org=p_org AND provider_project=p_provider_project
  AND credential_generation=p_generation
  AND (ready_until<=clock_timestamp() OR (instance_id=p_instance AND NOT p_ready));
 IF p_ready THEN
  INSERT INTO sophia.managed_explore_worker_readiness
   (route_id,provider_org,provider_project,credential_generation,instance_id,ready_until)
  VALUES(p_route,p_org,p_provider_project,p_generation,p_instance,clock_timestamp()+interval '35 seconds')
  ON CONFLICT(route_id,provider_org,provider_project,credential_generation,instance_id)
  DO UPDATE SET ready_until=EXCLUDED.ready_until;
 END IF;
END $$;

CREATE FUNCTION sophia.managed_explore_worker_ready(g sophia.managed_explore_grants,p_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(
  SELECT 1 FROM sophia.managed_explore_worker_readiness r
  WHERE r.route_id=g.route_id AND r.provider_org=g.provider_org AND r.provider_project=g.provider_project
   AND r.credential_generation=g.credential_generation AND r.ready_until>p_at)
$$;

CREATE OR REPLACE FUNCTION sophia.read_managed_explore_preflight(p_project uuid, p_entry uuid, p_revision bigint, p_admissions boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); seed record; grant_row sophia.managed_explore_grants;
 session_row sophia.managed_explore_sessions;
BEGIN
 IF NOT sophia.can_edit(p_project) OR EXISTS(SELECT 1 FROM sophia.projects WHERE id=p_project AND archived_at IS NOT NULL)
 THEN RETURN NULL; END IF;
 IF p_admissions THEN
  grant_row:=sophia.managed_explore_eligible_grant(p_project,actor);
  IF grant_row.id IS NOT NULL AND NOT sophia.managed_explore_worker_ready(grant_row,statement_timestamp()) THEN grant_row:=NULL; END IF;
 END IF;
 SELECT * INTO seed FROM sophia.managed_explore_seed(p_project,actor,p_entry);
 IF NOT FOUND THEN
  IF grant_row.id IS NULL THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Brief not found' USING ERRCODE='22023';
 END IF;
 SELECT s.* INTO session_row FROM sophia.managed_explore_sessions s
 WHERE s.project_id=p_project AND s.founder_id=actor AND s.seed_entry_id=p_entry AND s.seed_revision=seed.revision
   AND s.seed_source_id=seed.source_id AND s.seed_sha256=seed.sha256;
 IF session_row.id IS NULL AND grant_row.id IS NULL THEN RETURN NULL; END IF;
 IF seed.revision IS DISTINCT FROM p_revision THEN
  RAISE EXCEPTION 'Stale saved brief revision' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('seed',sophia.managed_explore_seed_view(seed.entry_id,seed.revision,seed.body,seed.sha256),
  'funding',sophia.managed_explore_funding_view(coalesce(session_row.route_id,grant_row.route_id)),'sessionId',session_row.id);
END $$;

CREATE OR REPLACE FUNCTION sophia.start_managed_explore(p_project uuid, p_entry uuid, p_revision bigint, p_route text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); grant_row sophia.managed_explore_grants; seed record;
 s sophia.managed_explore_sessions; member_revision bigint; new_reservation bigint; result jsonb;
 digest text:=encode(sha256(convert_to(jsonb_build_array('start',p_entry,p_revision,p_route)::text,'UTF8')),'hex');
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT m.revision INTO member_revision FROM sophia.project_members m
 WHERE project_id=p_project AND actor_id=actor AND active AND role IN ('admin','editor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 grant_row:=sophia.managed_explore_eligible_grant(p_project,actor);
 IF grant_row.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO seed FROM sophia.managed_explore_seed(p_project,actor,p_entry);
 IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=seed.source_id
  AND eligible AND state='ready' AND scope='project' AND sha256=seed.sha256 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE='22023'; END IF;

 result:=sophia.managed_explore_prior(p_project,actor,p_key,digest);
 IF result IS NOT NULL THEN
  s:=sophia.managed_explore_owned_session(p_project,(result->>'sessionId')::uuid);
  IF s.id IS NULL THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
  RETURN result;
 END IF;
 IF seed.revision IS DISTINCT FROM p_revision THEN
  RAISE EXCEPTION 'Stale saved brief revision' USING ERRCODE='40001'; END IF;
 IF grant_row.route_id IS DISTINCT FROM p_route THEN RETURN NULL; END IF;
 PERFORM 1 FROM sophia.managed_explore_grants WHERE project_id=p_project AND id=grant_row.id AND revision=grant_row.revision
  AND enabled AND grant_only_verified AND NOT paid_spillover AND route_id=p_route
  AND credential_generation=grant_row.credential_generation AND expires_at>clock_timestamp() AND credential_expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND OR NOT sophia.managed_explore_worker_ready(grant_row,clock_timestamp()) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_sessions
   WHERE project_id=p_project AND founder_id=actor AND seed_entry_id=p_entry AND seed_revision=p_revision) THEN
  RAISE EXCEPTION 'An Explore session already exists for the saved brief' USING ERRCODE='40001'; END IF;
 new_reservation:=grant_row.per_turn_micros+grant_row.environment_micros;
 IF new_reservation>grant_row.per_session_micros THEN
  RAISE EXCEPTION 'Explore session allowance does not cover the first turn and environment' USING ERRCODE='40001'; END IF;
 INSERT INTO sophia.managed_explore_sessions(project_id,founder_id,member_revision,grant_id,grant_revision,route_id,
  credential_generation,seed_entry_id,seed_revision,seed_source_id,seed_sha256,seed_text,reserved_micros)
 VALUES(p_project,actor,member_revision,grant_row.id,grant_row.revision,p_route,grant_row.credential_generation,p_entry,
  p_revision,seed.source_id,seed.sha256,seed.body,new_reservation) RETURNING * INTO s;
 PERFORM sophia.enqueue_managed_explore_turn(s,1,'text',seed.body,seed.sha256,new_reservation,NULL,NULL,NULL);
 result:=jsonb_build_object('sessionId',s.id);
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,actor,p_key,digest,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION sophia.admit_managed_explore_turn(p_project uuid, p_session uuid, p_key text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; grant_row sophia.managed_explore_grants; parent sophia.managed_explore_versions;
 k text:=p_request->>'kind'; instruction text:=btrim(p_request->>'instruction',E' \t\r\n');
 direction uuid:=(p_request->>'directionId')::uuid; parent_id uuid:=(p_request->>'parentVersionId')::uuid;
 component text:=p_request->>'componentId'; expected_revision bigint:=(p_request->>'expectedSessionRevision')::bigint;
 digest text:=encode(sha256(convert_to(jsonb_build_array('turn',p_session,
  (p_request-'instruction')||jsonb_build_object('instruction',instruction))::text,'UTF8')),'hex');
 result jsonb; turn_id uuid; turn_sequence bigint;
BEGIN
 s:=sophia.managed_explore_lock_session(p_project,p_session);
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR
   p_request-ARRAY['kind','instruction','expectedSessionRevision','directionId','parentVersionId','componentId']<>'{}'::jsonb
   OR k IS NULL OR k NOT IN ('text','directions','prototype','revision') OR instruction IS NULL
   OR length(instruction) NOT BETWEEN 1 AND 8000 OR instruction !~ '[^[:space:]]'
   OR expected_revision IS NULL OR expected_revision NOT BETWEEN 1 AND 9007199254740991
   OR (k IN ('prototype','revision'))<>(direction IS NOT NULL) OR (k='revision')<>(parent_id IS NOT NULL)
   OR (p_request ? 'componentId' AND (k<>'revision' OR component IS NULL OR component !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'))
   OR (p_request ? 'directionId' AND direction IS NULL) OR (p_request ? 'parentVersionId' AND parent_id IS NULL) THEN
  RAISE EXCEPTION 'Invalid Explore turn' USING ERRCODE='22023'; END IF;
 result:=sophia.managed_explore_prior(p_project,s.founder_id,p_key,digest);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF s.revision<>expected_revision THEN RAISE EXCEPTION 'Stale Explore session revision' USING ERRCODE='40001'; END IF;
 SELECT g.* INTO grant_row FROM sophia.managed_explore_grants g
 JOIN sophia.project_members m ON m.project_id=g.project_id AND m.actor_id=g.founder_id
 WHERE g.project_id=p_project AND g.id=s.grant_id AND g.founder_id=s.founder_id AND g.revision=s.grant_revision
  AND g.route_id=s.route_id AND g.credential_generation=s.credential_generation AND g.enabled
  AND g.grant_only_verified AND NOT g.paid_spillover AND g.expires_at>clock_timestamp()
  AND g.credential_expires_at>clock_timestamp() AND m.revision=s.member_revision FOR SHARE OF g;
 IF NOT FOUND OR NOT sophia.managed_explore_worker_ready(grant_row,clock_timestamp()) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_dispatch_sessions d
   WHERE d.project_id=p_project AND d.session_id=p_session AND d.input_refused_status IS NOT NULL)
 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_turns WHERE project_id=p_project AND session_id=p_session AND status='queued') THEN
  RAISE EXCEPTION 'Explore already has a waiting turn' USING ERRCODE='40001'; END IF;
 IF direction IS NOT NULL AND direction IS DISTINCT FROM s.selected_direction_id THEN
  RAISE EXCEPTION 'Stale selected Explore direction' USING ERRCODE='40001'; END IF;
 IF parent_id IS NOT NULL THEN
  SELECT * INTO parent FROM sophia.managed_explore_versions WHERE project_id=p_project AND session_id=p_session AND id=parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
  IF parent.direction_id<>direction THEN RAISE EXCEPTION 'Stale parent prototype direction' USING ERRCODE='40001'; END IF;
  PERFORM 1 FROM sophia.managed_explore_version_entry(parent,s.founder_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
  IF component IS NOT NULL AND NOT component=ANY(parent.component_ids) THEN
   RAISE EXCEPTION 'Prototype component not found' USING ERRCODE='22023'; END IF;
 END IF;
 IF s.reserved_micros+grant_row.per_turn_micros>grant_row.per_session_micros THEN
  RAISE EXCEPTION 'Explore session allowance exhausted' USING ERRCODE='40001'; END IF;
 SELECT coalesce(max(sequence),0)+1 INTO turn_sequence FROM sophia.managed_explore_turns
 WHERE project_id=p_project AND session_id=p_session;
 turn_id:=sophia.enqueue_managed_explore_turn(s,turn_sequence,k,instruction,encode(sha256(convert_to(instruction,'UTF8')),'hex'),
  grant_row.per_turn_micros,direction,parent_id,component);
 UPDATE sophia.managed_explore_sessions SET revision=revision+1,reserved_micros=reserved_micros+grant_row.per_turn_micros
 WHERE project_id=p_project AND id=p_session;
 result:=jsonb_build_object('turnId',turn_id);
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,s.founder_id,p_key,digest,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION sophia.managed_explore_worker_ready(sophia.managed_explore_grants,timestamptz),
 sophia.record_managed_explore_worker_readiness(text,text,text,bigint,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.record_managed_explore_worker_readiness(text,text,text,bigint,uuid,boolean) TO sophia_worker;
COMMIT;
