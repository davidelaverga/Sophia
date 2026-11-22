-- FOUNDER-EXPLORE-TO-BUILD-001 (A67). Operator-only grant enrollment; no grant or provider side effect here.
-- The admission transaction keeps a private seed snapshot and reserves exposure before making an outbox row visible.
BEGIN;

CREATE TABLE sophia.managed_explore_grants (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 founder_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 route_id text NOT NULL CHECK(route_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
 provider_org text NOT NULL CHECK(length(provider_org) BETWEEN 1 AND 200),
 provider_project text NOT NULL CHECK(length(provider_project) BETWEEN 1 AND 200),
 credential_generation bigint NOT NULL CHECK(credential_generation>0),
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 per_turn_micros bigint NOT NULL CHECK(per_turn_micros BETWEEN 1 AND 9007199254740991),
 per_session_micros bigint NOT NULL CHECK(per_session_micros BETWEEN per_turn_micros AND 9007199254740991),
 environment_micros bigint NOT NULL CHECK(environment_micros BETWEEN 1 AND per_session_micros),
 funding_evidence_ref text NOT NULL CHECK(length(funding_evidence_ref) BETWEEN 1 AND 500),
 grant_only_verified boolean NOT NULL DEFAULT false,
 paid_spillover boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 credential_expires_at timestamptz NOT NULL,
 PRIMARY KEY(project_id,id)
);
CREATE UNIQUE INDEX managed_explore_grants_enabled ON sophia.managed_explore_grants(project_id) WHERE enabled;

CREATE TABLE sophia.managed_explore_sessions (
 project_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 founder_id uuid NOT NULL,
 member_revision bigint NOT NULL,
 grant_id uuid NOT NULL,
 grant_revision bigint NOT NULL,
 route_id text NOT NULL,
 credential_generation bigint NOT NULL,
 seed_entry_id uuid NOT NULL,
 seed_revision bigint NOT NULL CHECK(seed_revision BETWEEN 1 AND 9007199254740991),
 seed_source_id uuid NOT NULL,
 seed_sha256 text NOT NULL CHECK(seed_sha256 ~ '^[a-f0-9]{64}$'),
 seed_text text NOT NULL CHECK(octet_length(seed_text) BETWEEN 1 AND 262144),
 reserved_micros bigint NOT NULL CHECK(reserved_micros BETWEEN 1 AND 9007199254740991),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 selected_direction_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id),
 UNIQUE(project_id,founder_id,seed_entry_id,seed_revision),
 FOREIGN KEY(project_id,grant_id) REFERENCES sophia.managed_explore_grants(project_id,id),
 FOREIGN KEY(project_id,seed_entry_id) REFERENCES sophia.mission_entries(project_id,id),
 FOREIGN KEY(project_id,seed_source_id) REFERENCES sophia.source_objects(project_id,id)
);

CREATE TABLE sophia.managed_explore_directions (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 position smallint NOT NULL CHECK(position IN (1,2)),
 candidate jsonb NOT NULL CHECK(jsonb_typeof(candidate)='object'),
 PRIMARY KEY(project_id,session_id,id),
 UNIQUE(project_id,session_id,revision,position),
 FOREIGN KEY(project_id,session_id) REFERENCES sophia.managed_explore_sessions(project_id,id)
);
ALTER TABLE sophia.managed_explore_sessions
 ADD FOREIGN KEY(project_id,id,selected_direction_id) REFERENCES sophia.managed_explore_directions(project_id,session_id,id);

CREATE TABLE sophia.managed_explore_versions (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 id uuid NOT NULL,
 number bigint NOT NULL CHECK(number BETWEEN 1 AND 9007199254740991),
 parent_version_id uuid,
 direction_id uuid NOT NULL,
 entry_source_id uuid NOT NULL,
 entry_sha256 text NOT NULL CHECK(entry_sha256 ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND jsonb_typeof(manifest->'files')='array'),
 change_summary text NOT NULL CHECK(length(change_summary) BETWEEN 1 AND 2000),
 acceptance_criteria text[] NOT NULL,
 mock_replacements text[] NOT NULL,
 limitations text[] NOT NULL,
 component_ids text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(project_id,session_id,id),
 UNIQUE(project_id,session_id,number),
 FOREIGN KEY(project_id,session_id) REFERENCES sophia.managed_explore_sessions(project_id,id),
 FOREIGN KEY(project_id,session_id,direction_id) REFERENCES sophia.managed_explore_directions(project_id,session_id,id),
 FOREIGN KEY(project_id,session_id,parent_version_id) REFERENCES sophia.managed_explore_versions(project_id,session_id,id),
 FOREIGN KEY(project_id,entry_source_id) REFERENCES sophia.source_objects(project_id,id)
);

CREATE TABLE sophia.managed_explore_turns (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 id uuid NOT NULL,
 actor_id uuid NOT NULL,
 sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),
 command_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('text','directions','prototype','revision')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','retaining','completed','failed','cancelled','outcome_unknown')),
 instruction text NOT NULL CHECK(octet_length(instruction) BETWEEN 1 AND 262144),
 direction_id uuid,
 parent_version_id uuid,
 component_id text,
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 reserved_micros bigint NOT NULL CHECK(reserved_micros BETWEEN 1 AND 9007199254740991),
 reply text,
 result_version_id uuid,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id),
 UNIQUE(project_id,session_id,sequence),
 UNIQUE(project_id,command_id),
 FOREIGN KEY(project_id,session_id) REFERENCES sophia.managed_explore_sessions(project_id,id),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id),
 FOREIGN KEY(project_id,session_id,direction_id) REFERENCES sophia.managed_explore_directions(project_id,session_id,id),
 FOREIGN KEY(project_id,session_id,parent_version_id) REFERENCES sophia.managed_explore_versions(project_id,session_id,id),
 FOREIGN KEY(project_id,session_id,result_version_id) REFERENCES sophia.managed_explore_versions(project_id,session_id,id),
 CHECK ((kind IN ('prototype','revision'))=(direction_id IS NOT NULL)),
 CHECK ((kind='revision')=(parent_version_id IS NOT NULL)),
 CHECK (component_id IS NULL OR kind='revision')
);
CREATE UNIQUE INDEX managed_explore_one_waiter ON sophia.managed_explore_turns(project_id,session_id) WHERE status='queued';
CREATE UNIQUE INDEX managed_explore_one_root ON sophia.managed_explore_turns(project_id,session_id)
 WHERE status IN ('running','retaining','outcome_unknown');

ALTER TABLE sophia.outbox ADD COLUMN managed_explore_turn_id uuid,
 ADD CONSTRAINT outbox_explore_turn_fk FOREIGN KEY(project_id,managed_explore_turn_id) REFERENCES sophia.managed_explore_turns(project_id,id),
 DROP CONSTRAINT outbox_owner,
 ADD CONSTRAINT outbox_owner CHECK(num_nonnulls(goal_id,conversation_reply_id,managed_explore_turn_id)=1),
 ADD CONSTRAINT outbox_explore_destination CHECK((destination='managed_explore.turn')=(managed_explore_turn_id IS NOT NULL));
CREATE UNIQUE INDEX outbox_by_managed_explore ON sophia.outbox(project_id,managed_explore_turn_id)
 WHERE managed_explore_turn_id IS NOT NULL;

CREATE TABLE sophia.managed_explore_requests (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 actor_id uuid NOT NULL,
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 160),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,
 PRIMARY KEY(project_id,actor_id,request_key)
);

CREATE TABLE sophia.managed_explore_approvals (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 version_id uuid NOT NULL,
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 acceptance_criteria text[] NOT NULL CHECK(cardinality(acceptance_criteria) BETWEEN 1 AND 40),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,session_id,id),
 UNIQUE(project_id,session_id,version_id),
 FOREIGN KEY(project_id,session_id,version_id) REFERENCES sophia.managed_explore_versions(project_id,session_id,id)
);

-- No table grants: all actor reads and writes go through the functions below.
ALTER TABLE sophia.managed_explore_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_approvals ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.managed_explore_seed(p_project uuid, p_actor uuid, p_entry uuid)
RETURNS TABLE(entry_id uuid, revision bigint, source_id uuid, body text, sha256 text)
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT e.id,e.ledger_revision,s.id,t.body,s.sha256
 FROM sophia.mission_entries e JOIN sophia.source_objects s ON s.project_id=e.project_id AND s.id=e.source_id
 JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
 WHERE e.project_id=p_project AND e.id=p_entry AND e.actor_id=p_actor AND e.state='current'
   AND s.owner_id=p_actor AND s.scope='project' AND s.eligible AND s.state='ready'
   AND s.mime='text/plain; charset=utf-8' AND s.byte_length=octet_length(t.body)
   AND s.sha256=encode(pg_catalog.sha256(convert_to(t.body,'UTF8')),'hex')
$$;

CREATE FUNCTION sophia.managed_explore_eligible_grant(p_project uuid, p_actor uuid)
RETURNS sophia.managed_explore_grants LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT g FROM sophia.managed_explore_grants g
 JOIN sophia.project_members m ON m.project_id=g.project_id AND m.actor_id=g.founder_id
 JOIN sophia.projects p ON p.id=g.project_id AND p.archived_at IS NULL
 WHERE g.project_id=p_project AND g.founder_id=p_actor AND m.active AND m.role IN ('admin','editor')
   AND g.enabled AND g.grant_only_verified AND NOT g.paid_spillover
   AND g.expires_at>statement_timestamp() AND g.credential_expires_at>statement_timestamp()
$$;

CREATE FUNCTION sophia.managed_explore_seed_view(p_entry uuid, p_revision bigint, p_text text, p_sha256 text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('entryId',p_entry,'revision',p_revision,'text',p_text,'sha256',p_sha256)
$$;

CREATE FUNCTION sophia.managed_explore_funding_view(p_route text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('routeId',p_route,'label','OpenAI API credits')
$$;

-- Existing reads survive the spend switch or grant expiry. Losing current project membership or source eligibility
-- cuts read visibility even when the data has been frozen. Use the same 404 for absent and inaccessible sessions.
CREATE FUNCTION sophia.managed_explore_owned_session(p_project uuid, p_session uuid)
RETURNS sophia.managed_explore_sessions LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT s FROM sophia.managed_explore_sessions s
 JOIN LATERAL sophia.managed_explore_seed(s.project_id,s.founder_id,s.seed_entry_id) seed
   ON seed.revision=s.seed_revision AND seed.source_id=s.seed_source_id AND seed.sha256=s.seed_sha256
 WHERE s.project_id=p_project AND s.id=p_session AND s.founder_id=sophia.actor_id() AND sophia.can_edit(p_project)
   AND EXISTS(SELECT 1 FROM sophia.projects p WHERE p.id=s.project_id AND p.archived_at IS NULL)
$$;

CREATE FUNCTION sophia.read_managed_explore_preflight(p_project uuid, p_entry uuid, p_revision bigint, p_admissions boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); seed record; grant_row sophia.managed_explore_grants;
 session_row sophia.managed_explore_sessions;
BEGIN
 IF NOT sophia.can_edit(p_project) OR EXISTS(SELECT 1 FROM sophia.projects WHERE id=p_project AND archived_at IS NOT NULL)
 THEN RETURN NULL; END IF;
 IF p_admissions THEN grant_row:=sophia.managed_explore_eligible_grant(p_project,actor); END IF;
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

CREATE FUNCTION sophia.managed_explore_prior(p_project uuid, p_actor uuid, p_key text, p_digest text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.managed_explore_requests;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Invalid request identity' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.managed_explore_requests WHERE project_id=p_project AND actor_id=p_actor AND request_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.request_digest<>p_digest THEN RAISE EXCEPTION 'Idempotency key reused for a different Explore request' USING ERRCODE='23505'; END IF;
 RETURN prior.receipt;
END $$;

CREATE FUNCTION sophia.enqueue_managed_explore_turn(s sophia.managed_explore_sessions, p_sequence bigint, p_kind text,
 p_instruction text, p_digest text, p_reservation bigint, p_direction uuid, p_parent uuid, p_component text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE turn_id uuid:=gen_random_uuid(); command_id uuid:=gen_random_uuid();
BEGIN
 INSERT INTO sophia.commands(project_id,id,actor_id,kind,idempotency_key,semantic_request,state)
 VALUES(s.project_id,command_id,s.founder_id,'managed_explore.turn','managed-explore:'||turn_id,
  jsonb_build_object('turnId',turn_id,'payloadDigest',p_digest),'admitted');
 INSERT INTO sophia.managed_explore_turns(project_id,session_id,id,actor_id,sequence,command_id,kind,instruction,direction_id,
  parent_version_id,component_id,request_digest,reserved_micros)
 VALUES(s.project_id,s.id,turn_id,s.founder_id,p_sequence,command_id,p_kind,p_instruction,p_direction,
  p_parent,p_component,p_digest,p_reservation);
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,authority_epoch,managed_explore_turn_id)
 VALUES(s.project_id,command_id,'managed_explore.turn','turn/'||turn_id,s.grant_revision,turn_id);
 RETURN turn_id;
END $$;

CREATE FUNCTION sophia.start_managed_explore(p_project uuid, p_entry uuid, p_revision bigint, p_route text, p_key text)
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
 IF NOT FOUND THEN RETURN NULL; END IF;
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

CREATE FUNCTION sophia.managed_explore_lock_session(p_project uuid, p_session uuid)
RETURNS sophia.managed_explore_sessions LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions;
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 s:=sophia.managed_explore_owned_session(p_project,p_session);
 IF s.id IS NULL THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=s.founder_id
   AND active AND role IN ('admin','editor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=s.seed_source_id
  AND eligible AND state='ready' AND scope='project' AND sha256=s.seed_sha256 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM sophia.managed_explore_sessions WHERE project_id=p_project AND id=p_session FOR UPDATE;
 RETURN s;
END $$;

CREATE FUNCTION sophia.admit_managed_explore_turn(p_project uuid, p_session uuid, p_key text, p_request jsonb)
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
 IF NOT FOUND THEN RETURN NULL; END IF;
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

CREATE FUNCTION sophia.select_managed_explore_direction(p_project uuid, p_session uuid, p_key text,
 p_direction uuid, p_direction_revision bigint, p_session_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; candidate_revision bigint; result jsonb;
 digest text:=encode(sha256(convert_to(jsonb_build_array('direction',p_session,p_direction,p_direction_revision,p_session_revision)::text,'UTF8')),'hex');
BEGIN
 s:=sophia.managed_explore_lock_session(p_project,p_session);
 result:=sophia.managed_explore_prior(p_project,s.founder_id,p_key,digest);
 IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT revision INTO candidate_revision FROM sophia.managed_explore_directions WHERE project_id=p_project
 AND session_id=p_session AND id=p_direction AND revision=(SELECT max(revision) FROM sophia.managed_explore_directions
  WHERE project_id=p_project AND session_id=p_session);
 IF NOT FOUND THEN RAISE EXCEPTION 'Direction not found' USING ERRCODE='22023'; END IF;
 IF candidate_revision IS DISTINCT FROM p_direction_revision OR s.revision IS DISTINCT FROM p_session_revision THEN
  RAISE EXCEPTION 'Stale Explore session or direction revision' USING ERRCODE='40001'; END IF;
 UPDATE sophia.managed_explore_sessions SET selected_direction_id=p_direction,revision=revision+1
 WHERE project_id=p_project AND id=p_session RETURNING jsonb_build_object('revision',revision) INTO result;
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,s.founder_id,p_key,digest,result);
 RETURN result;
END $$;

CREATE FUNCTION sophia.read_managed_explore_session(p_project uuid, p_session uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; turns jsonb; directions jsonb; versions jsonb; approvals jsonb;
BEGIN
 s:=sophia.managed_explore_owned_session(p_project,p_session);
 IF s.id IS NULL THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,'status',t.status,'instruction',t.instruction,
  'reply',t.reply,'resultVersionId',t.result_version_id,'error',t.error) ORDER BY t.sequence)
 INTO turns FROM sophia.managed_explore_turns t WHERE t.project_id=p_project AND t.session_id=p_session;
 SELECT jsonb_agg(d.candidate||jsonb_build_object('id',d.id,'revision',d.revision) ORDER BY d.position)
 INTO directions FROM sophia.managed_explore_directions d WHERE d.project_id=p_project AND d.session_id=p_session
 AND d.revision=(SELECT max(revision) FROM sophia.managed_explore_directions WHERE project_id=p_project AND session_id=p_session);
 SELECT jsonb_agg(jsonb_build_object('id',v.id,'number',v.number,'parentVersionId',v.parent_version_id,
  'directionId',v.direction_id,'entrySha256',v.entry_sha256,'manifestSha256',v.manifest_sha256,'changeSummary',v.change_summary,
  'acceptanceCriteria',v.acceptance_criteria,'mockReplacements',v.mock_replacements) ORDER BY v.number)
 INTO versions FROM sophia.managed_explore_versions v
 CROSS JOIN LATERAL sophia.managed_explore_version_entry(v,s.founder_id) AS retained
 WHERE v.project_id=p_project AND v.session_id=p_session;
 SELECT jsonb_agg(jsonb_build_object('id',a.id,'versionId',a.version_id,'manifestSha256',a.manifest_sha256,
  'approvedAt',to_char(a.approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'acceptanceCriteria',a.acceptance_criteria) ORDER BY a.approved_at)
 INTO approvals FROM sophia.managed_explore_approvals a WHERE a.project_id=p_project AND a.session_id=p_session;
 RETURN jsonb_build_object('id',s.id,'revision',s.revision,
  'seed',sophia.managed_explore_seed_view(s.seed_entry_id,s.seed_revision,s.seed_text,s.seed_sha256),
  'funding',sophia.managed_explore_funding_view(s.route_id),'turns',coalesce(turns,'[]'::jsonb),
  'directions',coalesce(directions,'[]'::jsonb),'selectedDirectionId',s.selected_direction_id,
  'versions',coalesce(versions,'[]'::jsonb),'approvals',coalesce(approvals,'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION sophia.managed_explore_seed(uuid,uuid,uuid),sophia.managed_explore_eligible_grant(uuid,uuid),
 sophia.managed_explore_seed_view(uuid,bigint,text,text),sophia.managed_explore_funding_view(text),
 sophia.managed_explore_owned_session(uuid,uuid),sophia.managed_explore_prior(uuid,uuid,text,text),
 sophia.enqueue_managed_explore_turn(sophia.managed_explore_sessions,bigint,text,text,text,bigint,uuid,uuid,text),
 sophia.managed_explore_lock_session(uuid,uuid),sophia.read_managed_explore_preflight(uuid,uuid,bigint,boolean),
 sophia.start_managed_explore(uuid,uuid,bigint,text,text),sophia.admit_managed_explore_turn(uuid,uuid,text,jsonb),
 sophia.select_managed_explore_direction(uuid,uuid,text,uuid,bigint,bigint),
 sophia.read_managed_explore_session(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.read_managed_explore_preflight(uuid,uuid,bigint,boolean),sophia.start_managed_explore(uuid,uuid,bigint,text,text),
 sophia.admit_managed_explore_turn(uuid,uuid,text,jsonb),sophia.select_managed_explore_direction(uuid,uuid,text,uuid,bigint,bigint),
 sophia.read_managed_explore_session(uuid,uuid) TO sophia_api;

CREATE TABLE sophia.managed_explore_preview_permits (
 token_sha256 text PRIMARY KEY CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 version_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 entry_sha256 text NOT NULL CHECK(entry_sha256 ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '10 minutes'),
 FOREIGN KEY(project_id,session_id,version_id) REFERENCES sophia.managed_explore_versions(project_id,session_id,id)
);
CREATE INDEX managed_explore_permits_by_version ON sophia.managed_explore_preview_permits(project_id,session_id,version_id,actor_id);
ALTER TABLE sophia.managed_explore_preview_permits ENABLE ROW LEVEL SECURITY;

-- The v1 sandbox serves a single index.html. Order the schema-owned keys in this exact canonical wire format; the
-- extra JSONB equality check proves the stored manifest has no omitted or substituted fields.
CREATE FUNCTION sophia.managed_explore_version_entry(v sophia.managed_explore_versions, p_actor uuid)
RETURNS TABLE(source_id uuid, byte_length bigint, storage_key text, body text)
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT src.id,src.byte_length,src.storage_key,t.body
 FROM sophia.source_objects src
 LEFT JOIN sophia.source_texts t ON t.project_id=src.project_id AND t.source_id=src.id
 CROSS JOIN LATERAL (SELECT v.manifest->>'artifactId' AS artifact_id) a
 CROSS JOIN LATERAL (SELECT jsonb_build_object('bytes',src.byte_length,'mime','text/html','path','index.html',
  'sha256',src.sha256,'sourceId',src.id) AS file) i
 WHERE src.project_id=v.project_id AND src.id=v.entry_source_id AND src.owner_id=p_actor AND src.scope='private'
   AND src.eligible AND src.state='ready' AND src.sha256=v.entry_sha256 AND src.byte_length BETWEEN 1 AND 2097152
   AND src.mime IN ('text/html','text/html; charset=utf-8') AND a.artifact_id=v.session_id::text
   AND ((src.storage_key='objects/'||src.project_id||'/'||src.id AND t.body IS NULL)
     OR (src.storage_key='inline/'||src.project_id||'/'||src.id AND octet_length(t.body)=src.byte_length
       AND encode(sha256(convert_to(t.body,'UTF8')),'hex')=src.sha256))
   AND v.manifest=jsonb_build_object('artifactId',a.artifact_id,'directionId',v.direction_id,'entry','index.html',
    'files',jsonb_build_array(i.file),'format','sophia.prototype.v1','parentVersionId',v.parent_version_id,'versionId',v.id)
   AND v.manifest_sha256=encode(sha256(convert_to(
      '{"artifactId":'||to_json(a.artifact_id)::text||',"directionId":'||to_json(v.direction_id)::text
      ||',"entry":"index.html","files":[{"bytes":'||src.byte_length::text||',"mime":"text/html","path":"index.html","sha256":'
      ||to_json(src.sha256)::text||',"sourceId":'||to_json(src.id)::text||'}],"format":"sophia.prototype.v1","parentVersionId":'
      ||coalesce(to_json(v.parent_version_id)::text,'null')||',"versionId":'||to_json(v.id)::text||'}','UTF8')),'hex')
$$;

CREATE FUNCTION sophia.read_managed_explore_entry(p_project uuid, p_session uuid, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; result jsonb;
BEGIN
 s:=sophia.managed_explore_owned_session(p_project,p_session);
 IF s.id IS NULL THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('entrySha256',v.entry_sha256,'byteLength',r.byte_length,
  'projectId',p_project,'sourceId',r.source_id,'storageKey',r.storage_key,'text',r.body)
 INTO result FROM sophia.managed_explore_versions v
 CROSS JOIN LATERAL sophia.managed_explore_version_entry(v,s.founder_id) r
 WHERE v.project_id=p_project AND v.session_id=p_session AND v.id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION sophia.issue_managed_explore_preview(p_project uuid, p_session uuid, p_version uuid, p_key text,
 p_manifest text, p_entry text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; v sophia.managed_explore_versions; result jsonb;
 issued timestamptz:=clock_timestamp(); expires timestamptz; token text;
 digest text:=encode(sha256(convert_to(jsonb_build_array('preview',p_session,p_version,p_manifest,p_entry)::text,'UTF8')),'hex');
BEGIN
 s:=sophia.managed_explore_lock_session(p_project,p_session);
 SELECT * INTO v FROM sophia.managed_explore_versions WHERE project_id=p_project AND session_id=p_session AND id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.managed_explore_version_entry(v,s.founder_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=v.entry_source_id
  AND eligible AND state='ready' AND scope='private' AND sha256=v.entry_sha256 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 result:=sophia.managed_explore_prior(p_project,s.founder_id,p_key,digest);
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM sophia.managed_explore_preview_permits
    WHERE token_sha256=encode(sha256(convert_to(result->>'token','UTF8')),'hex') AND expires_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'Expired Explore preview permit requires a new key' USING ERRCODE='40001'; END IF;
  RETURN result;
 END IF;
 IF v.manifest_sha256 IS DISTINCT FROM p_manifest OR v.entry_sha256 IS DISTINCT FROM p_entry THEN
  RAISE EXCEPTION 'Stale prototype entry or manifest digest' USING ERRCODE='40001'; END IF;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 expires:=issued+interval '10 minutes';
 INSERT INTO sophia.managed_explore_preview_permits VALUES(encode(sha256(convert_to(token,'UTF8')),'hex'),
  p_project,p_session,p_version,s.founder_id,p_manifest,p_entry,issued,expires);
 result:=jsonb_build_object('token',token,'expiresAt',to_char(expires AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'versionId',v.id,'entrySha256',v.entry_sha256,'manifestSha256',v.manifest_sha256);
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,s.founder_id,p_key,digest,result);
 RETURN result;
END $$;

CREATE FUNCTION sophia.resolve_managed_explore_preview(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('expiresAt',to_char(p.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'entrySha256',p.entry_sha256,'byteLength',r.byte_length,'projectId',p.project_id,
    'sourceId',r.source_id,'storageKey',r.storage_key,'text',r.body)
 FROM sophia.managed_explore_preview_permits p
 JOIN sophia.managed_explore_sessions s ON s.project_id=p.project_id AND s.id=p.session_id AND s.founder_id=p.actor_id
 JOIN sophia.projects proj ON proj.id=s.project_id AND proj.archived_at IS NULL
 JOIN sophia.project_members m ON m.project_id=p.project_id AND m.actor_id=p.actor_id AND m.active AND m.role IN ('admin','editor')
 JOIN sophia.managed_explore_versions v ON v.project_id=p.project_id AND v.session_id=p.session_id
   AND v.id=p.version_id AND v.entry_sha256=p.entry_sha256 AND v.manifest_sha256=p.manifest_sha256
 JOIN LATERAL sophia.managed_explore_seed(s.project_id,s.founder_id,s.seed_entry_id) seed
   ON seed.revision=s.seed_revision AND seed.source_id=s.seed_source_id AND seed.sha256=s.seed_sha256
 CROSS JOIN LATERAL sophia.managed_explore_version_entry(v,p.actor_id) r
 WHERE sophia.actor_id() IS NULL AND p_token ~ '^[a-f0-9]{64}$'
   AND p.token_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND p.expires_at>statement_timestamp()
$$;

CREATE FUNCTION sophia.approve_managed_explore_version(p_project uuid, p_session uuid, p_key text, p_version uuid,
 p_manifest text, p_revision bigint, p_criteria text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; v sophia.managed_explore_versions; a sophia.managed_explore_approvals; result jsonb;
 digest text:=encode(sha256(convert_to(jsonb_build_array('approval',p_session,p_version,p_manifest,p_revision,p_criteria)::text,'UTF8')),'hex');
BEGIN
 s:=sophia.managed_explore_lock_session(p_project,p_session);
 SELECT * INTO v FROM sophia.managed_explore_versions WHERE project_id=p_project AND session_id=p_session AND id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.managed_explore_version_entry(v,s.founder_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=v.entry_source_id
  AND eligible AND state='ready' AND scope='private' AND sha256=v.entry_sha256 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
 result:=sophia.managed_explore_prior(p_project,s.founder_id,p_key,digest);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF v.manifest_sha256 IS DISTINCT FROM p_manifest OR s.revision IS DISTINCT FROM p_revision THEN
  RAISE EXCEPTION 'Stale prototype manifest or session revision' USING ERRCODE='40001'; END IF;
 IF p_criteria IS NULL OR cardinality(p_criteria) NOT BETWEEN 1 AND 40 OR EXISTS(
  SELECT 1 FROM unnest(p_criteria) criterion WHERE criterion IS NULL OR length(criterion) NOT BETWEEN 1 AND 1000
   OR criterion !~ '[^[:space:]]') THEN
  RAISE EXCEPTION 'Invalid prototype acceptance criteria' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.managed_explore_preview_permits
   WHERE project_id=p_project AND session_id=p_session AND version_id=p_version AND actor_id=s.founder_id
     AND manifest_sha256=v.manifest_sha256 AND entry_sha256=v.entry_sha256) THEN
  RAISE EXCEPTION 'Open this exact prototype before approval' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_approvals WHERE project_id=p_project AND session_id=p_session AND version_id=p_version) THEN
  RAISE EXCEPTION 'This prototype already has an approval' USING ERRCODE='40001'; END IF;
 INSERT INTO sophia.managed_explore_approvals(project_id,session_id,actor_id,version_id,manifest_sha256,acceptance_criteria)
 VALUES(p_project,p_session,s.founder_id,p_version,p_manifest,p_criteria) RETURNING * INTO a;
 result:=jsonb_build_object('id',a.id,'versionId',a.version_id,'manifestSha256',a.manifest_sha256,
  'approvedAt',to_char(a.approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'acceptanceCriteria',a.acceptance_criteria);
 UPDATE sophia.managed_explore_sessions SET revision=revision+1 WHERE project_id=p_project AND id=p_session;
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,s.founder_id,p_key,digest,result);
 RETURN result;
END $$;

CREATE FUNCTION sophia.read_managed_explore_handoff(p_project uuid, p_session uuid, p_approval uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; result jsonb;
BEGIN
 s:=sophia.managed_explore_owned_session(p_project,p_session);
 IF s.id IS NULL THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('approvalId',a.id,'versionId',v.id,'manifestSha256',v.manifest_sha256,'seedText',s.seed_text,
    'acceptanceCriteria',a.acceptance_criteria,'mockReplacements',v.mock_replacements,'limitations',v.limitations,
    'files',jsonb_build_array(jsonb_build_object('path','index.html','mime','text/html','byteCount',r.byte_length,'sha256',v.entry_sha256)))
 INTO result FROM sophia.managed_explore_approvals a
 JOIN sophia.managed_explore_versions v ON v.project_id=a.project_id AND v.session_id=a.session_id AND v.id=a.version_id
   AND v.manifest_sha256=a.manifest_sha256
 CROSS JOIN LATERAL sophia.managed_explore_version_entry(v,s.founder_id) r
 WHERE a.project_id=p_project AND a.session_id=p_session AND a.id=p_approval AND a.actor_id=s.founder_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved prototype not found' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION sophia.managed_explore_version_entry(sophia.managed_explore_versions,uuid),
 sophia.read_managed_explore_entry(uuid,uuid,uuid),
 sophia.issue_managed_explore_preview(uuid,uuid,uuid,text,text,text),sophia.resolve_managed_explore_preview(text),
 sophia.approve_managed_explore_version(uuid,uuid,text,uuid,text,bigint,text[]),
 sophia.read_managed_explore_handoff(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.read_managed_explore_entry(uuid,uuid,uuid),
 sophia.issue_managed_explore_preview(uuid,uuid,uuid,text,text,text),
 sophia.resolve_managed_explore_preview(text),sophia.approve_managed_explore_version(uuid,uuid,text,uuid,text,bigint,text[]),
 sophia.read_managed_explore_handoff(uuid,uuid,uuid) TO sophia_api;

COMMIT;
