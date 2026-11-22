-- FOUNDER-EXPLORE-TO-BUILD-001: internal managed worker fence. A lease is scheduling ownership.
-- Only a committed prepare receipt allows one external mutation. An expired possible send can only be observed.
BEGIN;

CREATE TABLE sophia.managed_explore_dispatch_sessions (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 route_id text NOT NULL,
 provider_org text NOT NULL,
 provider_project text NOT NULL,
 credential_generation bigint NOT NULL,
 model text NOT NULL,
 session_limit_cents bigint NOT NULL CHECK(session_limit_cents>=0),
 create_operation_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 create_possible_at timestamptz,
 create_rejected_at timestamptz,
 provider_session_id text,
 provider_environment_id text,
 create_request_id text,
 environment_status text CHECK(environment_status IN ('pending','provisioning','ready','connected','disconnected','suspended','expired','failed')),
 PRIMARY KEY(project_id,session_id),
 FOREIGN KEY(project_id,session_id) REFERENCES sophia.managed_explore_sessions(project_id,id),
 UNIQUE(provider_org,provider_project,provider_session_id),
 CHECK((provider_session_id IS NULL)=(provider_environment_id IS NULL)),
 CHECK(provider_session_id IS NULL OR (create_possible_at IS NOT NULL AND create_rejected_at IS NULL)),
 CHECK(create_rejected_at IS NULL OR create_possible_at IS NOT NULL)
);

CREATE TABLE sophia.managed_explore_dispatch_turns (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 submission_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 lease_allows_send boolean NOT NULL,
 event_possible_at timestamptz,
 predecessor_root_id text,
 payload_sha256 text CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 event_request_id text,
 event_accepted_at timestamptz,
 provider_root_id text,
 provider_root_status text CHECK(provider_root_status IN ('queued','in_progress','waiting','completed','failed','cancelled')),
 usage jsonb,
 PRIMARY KEY(project_id,turn_id),
 UNIQUE(project_id,session_id,provider_root_id),
 FOREIGN KEY(project_id,session_id) REFERENCES sophia.managed_explore_dispatch_sessions(project_id,session_id),
 FOREIGN KEY(project_id,turn_id) REFERENCES sophia.managed_explore_turns(project_id,id),
 CHECK((event_possible_at IS NULL)=(payload_sha256 IS NULL)),
 CHECK(event_possible_at IS NOT NULL OR (predecessor_root_id IS NULL AND event_accepted_at IS NULL AND provider_root_id IS NULL)),
 CHECK((provider_root_id IS NULL)=(provider_root_status IS NULL))
);
ALTER TABLE sophia.managed_explore_dispatch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.managed_explore_dispatch_turns ENABLE ROW LEVEL SECURITY;

-- Preserve the original source, funding policy and qualification revision admitted with the session.
CREATE FUNCTION sophia.managed_explore_grant_revision_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NEW.revision<OLD.revision OR (NEW.revision=OLD.revision AND to_jsonb(NEW)-'enabled'<>to_jsonb(OLD)-'enabled') THEN
  RAISE EXCEPTION 'An Explore grant change requires a new revision' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER managed_explore_grant_revision_guard BEFORE UPDATE ON sophia.managed_explore_grants
 FOR EACH ROW EXECUTE FUNCTION sophia.managed_explore_grant_revision_guard();

CREATE TYPE sophia.managed_explore_dispatch_context AS (
 s sophia.managed_explore_sessions,
 t sophia.managed_explore_turns,
 o sophia.outbox,
 d sophia.managed_explore_dispatch_sessions,
 x sophia.managed_explore_dispatch_turns
);

-- All mutators acquire the project, session and turn before the outbox. Provider calls happen outside these locks.
CREATE FUNCTION sophia.managed_explore_dispatch_lock(p_project uuid, p_turn uuid, p_token uuid)
RETURNS sophia.managed_explore_dispatch_context LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context; session_id uuid;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Worker role required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT t.session_id INTO session_id FROM sophia.managed_explore_turns t WHERE t.project_id=p_project AND t.id=p_turn;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed Explore lease lost' USING ERRCODE='40001'; END IF;
 SELECT s INTO c.s FROM sophia.managed_explore_sessions s WHERE project_id=p_project AND id=session_id FOR UPDATE;
 SELECT t INTO c.t FROM sophia.managed_explore_turns t WHERE project_id=p_project AND id=p_turn FOR UPDATE;
 SELECT d INTO c.d FROM sophia.managed_explore_dispatch_sessions d WHERE d.project_id=p_project AND d.session_id=(c.t).session_id FOR UPDATE;
 SELECT x INTO c.x FROM sophia.managed_explore_dispatch_turns x WHERE x.project_id=p_project AND x.turn_id=p_turn FOR UPDATE;
 SELECT o INTO c.o FROM sophia.outbox o WHERE project_id=p_project AND managed_explore_turn_id=p_turn
  AND destination='managed_explore.turn' FOR UPDATE;
 IF NOT FOUND OR (c.o).state<>'dispatching' OR p_token IS NULL OR (c.o).lease_token IS DISTINCT FROM p_token
    OR (c.o).lease_until<=clock_timestamp() OR (c.x).turn_id IS NULL THEN
  RAISE EXCEPTION 'Managed Explore lease lost' USING ERRCODE='40001';
 END IF;
 RETURN c;
END $$;

CREATE FUNCTION sophia.managed_explore_previous_root(p_project uuid,p_session uuid,p_sequence bigint)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT x.provider_root_id FROM sophia.managed_explore_dispatch_turns x
 JOIN sophia.managed_explore_turns t ON t.project_id=x.project_id AND t.id=x.turn_id
 WHERE x.project_id=p_project AND x.session_id=p_session AND t.sequence<p_sequence AND x.provider_root_id IS NOT NULL
 ORDER BY t.sequence DESC LIMIT 1
$$;

CREATE FUNCTION sophia.managed_explore_dispatch_view(c sophia.managed_explore_dispatch_context)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('projectId',(c.t).project_id,'sessionId',(c.t).session_id,'turnId',(c.t).id,
 'turnKind',(c.t).kind,'turnStatus',(c.t).status,'outboxId',(c.o).id,'leaseToken',(c.o).lease_token,
 'leaseUntil',(c.o).lease_until,'allowSend',(c.x).lease_allows_send,
 'model',(c.d).model,'sessionLimitCents',(c.d).session_limit_cents,'createOperationId',(c.d).create_operation_id,
 'createPossibleAt',(c.d).create_possible_at,'providerSessionId',(c.d).provider_session_id,
 'environmentId',(c.d).provider_environment_id,'environmentStatus',(c.d).environment_status,
 'submissionId',(c.x).submission_id,'eventPossibleAt',(c.x).event_possible_at,'eventAcceptedAt',(c.x).event_accepted_at,
 'eventRequestId',(c.x).event_request_id,'previousRootId',CASE WHEN (c.x).event_possible_at IS NOT NULL
  THEN (c.x).predecessor_root_id ELSE sophia.managed_explore_previous_root((c.t).project_id,(c.t).session_id,(c.t).sequence) END,
 'rootId',(c.x).provider_root_id,
 'rootStatus',(c.x).provider_root_status,'payloadSha256',(c.x).payload_sha256,'usage',(c.x).usage)
$$;

CREATE FUNCTION sophia.claim_managed_explore_dispatch(p_worker text, p_route text, p_generation bigint,
 p_org text, p_provider_project text, p_lease_seconds integer, p_allow_send boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE selected record; c sophia.managed_explore_dispatch_context; grant_row sophia.managed_explore_grants;
 next_status text; current_grant boolean;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Worker role required' USING ERRCODE='42501'; END IF;
 IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 160 OR p_route IS NULL
    OR p_route !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' OR p_generation IS NULL OR p_generation<1
    OR p_org IS NULL OR length(p_org) NOT BETWEEN 1 AND 200 OR p_provider_project IS NULL OR length(p_provider_project) NOT BETWEEN 1 AND 200
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 OR p_allow_send IS NULL THEN
  RAISE EXCEPTION 'Invalid managed Explore worker scope' USING ERRCODE='22023';
 END IF;
 SELECT o.project_id, t.session_id, t.id AS turn_id, recovery.possible_effect INTO selected
 FROM sophia.outbox o JOIN sophia.projects p ON p.id=o.project_id
 JOIN sophia.managed_explore_turns t ON t.project_id=o.project_id AND t.id=o.managed_explore_turn_id
 JOIN sophia.managed_explore_sessions s ON s.project_id=t.project_id AND s.id=t.session_id
 JOIN sophia.managed_explore_grants g ON g.project_id=s.project_id AND g.id=s.grant_id
 LEFT JOIN sophia.managed_explore_dispatch_sessions d ON d.project_id=s.project_id AND d.session_id=s.id
 LEFT JOIN sophia.managed_explore_dispatch_turns x ON x.project_id=t.project_id AND x.turn_id=t.id
 CROSS JOIN LATERAL (SELECT x.event_possible_at IS NOT NULL
   OR (d.create_possible_at IS NOT NULL AND d.provider_session_id IS NULL AND d.create_rejected_at IS NULL
       AND t.status<>'queued') AS possible_effect) recovery
 WHERE o.destination='managed_explore.turn' AND o.available_at<=clock_timestamp()
  AND (o.state IN ('pending','outcome_unknown') OR (o.state='dispatching' AND o.lease_until<=clock_timestamp()))
  AND t.status IN ('queued','running','retaining','outcome_unknown')
  AND s.route_id=p_route AND s.credential_generation=p_generation
  AND coalesce(d.provider_org,g.provider_org)=p_org AND coalesce(d.provider_project,g.provider_project)=p_provider_project
  AND (recovery.possible_effect OR (p_allow_send AND g.revision=s.grant_revision
    AND g.route_id=p_route AND g.credential_generation=p_generation
    AND g.provider_org=p_org AND g.provider_project=p_provider_project))
  AND (t.status<>'queued' OR NOT EXISTS(SELECT 1 FROM sophia.managed_explore_turns root
    WHERE root.project_id=t.project_id AND root.session_id=t.session_id AND root.status IN ('running','retaining','outcome_unknown')))
 ORDER BY (t.status='queued'),o.available_at,o.created_at,o.id FOR UPDATE OF p SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;

 SELECT s INTO c.s FROM sophia.managed_explore_sessions s WHERE project_id=selected.project_id AND id=selected.session_id FOR UPDATE;
 SELECT t INTO c.t FROM sophia.managed_explore_turns t WHERE project_id=selected.project_id AND id=selected.turn_id FOR UPDATE;
 SELECT * INTO grant_row FROM sophia.managed_explore_grants WHERE project_id=selected.project_id AND id=(c.s).grant_id FOR SHARE;
 -- A binding created merely by an expired lease cannot keep stale unsent work at the front of the queue.
 -- An actual possible effect keeps its original credential scope, with no permission for another mutation.
 current_grant:=grant_row.revision=(c.s).grant_revision AND grant_row.route_id=p_route
  AND grant_row.credential_generation=p_generation AND grant_row.provider_org=p_org
  AND grant_row.provider_project=p_provider_project;
 IF NOT current_grant AND NOT selected.possible_effect THEN RETURN NULL; END IF;
 INSERT INTO sophia.managed_explore_dispatch_sessions(project_id,session_id,route_id,provider_org,provider_project,
   credential_generation,model,session_limit_cents)
 VALUES(selected.project_id,selected.session_id,p_route,p_org,p_provider_project,p_generation,grant_row.model,
   CASE WHEN grant_row.currency='USD' THEN grant_row.per_session_micros/10000 ELSE 0 END)
 ON CONFLICT(project_id,session_id) DO NOTHING;
 SELECT d INTO c.d FROM sophia.managed_explore_dispatch_sessions d
 WHERE project_id=selected.project_id AND session_id=selected.session_id FOR UPDATE;
 IF (c.d).provider_org<>p_org OR (c.d).provider_project<>p_provider_project THEN RETURN NULL; END IF;
 INSERT INTO sophia.managed_explore_dispatch_turns AS inserted(project_id,session_id,turn_id,lease_allows_send)
 VALUES(selected.project_id,selected.session_id,selected.turn_id,p_allow_send AND current_grant)
 ON CONFLICT(project_id,turn_id) DO UPDATE SET lease_allows_send=EXCLUDED.lease_allows_send
 RETURNING inserted INTO c.x;
 UPDATE sophia.outbox AS claimed SET state='dispatching',lease_owner=p_worker,lease_token=gen_random_uuid(),
  lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=attempts+1
 WHERE project_id=selected.project_id AND managed_explore_turn_id=selected.turn_id RETURNING claimed INTO c.o;
 next_status:=CASE
  WHEN ((c.d).create_possible_at IS NOT NULL AND (c.d).provider_session_id IS NULL AND (c.d).create_rejected_at IS NULL)
   OR ((c.x).event_possible_at IS NOT NULL AND (c.x).provider_root_id IS NULL) THEN 'outcome_unknown'
  WHEN (c.t).status='retaining' THEN 'retaining'
  ELSE 'running' END;
 IF (c.t).status<>next_status THEN
  UPDATE sophia.managed_explore_turns AS claimed SET status=next_status
  WHERE project_id=selected.project_id AND id=selected.turn_id RETURNING claimed INTO c.t;
  UPDATE sophia.managed_explore_sessions SET revision=revision+1 WHERE project_id=selected.project_id AND id=selected.session_id;
 END IF;
 UPDATE sophia.commands SET state=CASE WHEN next_status='outcome_unknown' THEN 'outcome_unknown' ELSE 'dispatching' END
 WHERE project_id=selected.project_id AND id=(c.t).command_id;
 RETURN sophia.managed_explore_dispatch_view(c);
END $$;

CREATE FUNCTION sophia.read_managed_explore_dispatch(p_project uuid,p_turn uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 RETURN sophia.managed_explore_dispatch_view(sophia.managed_explore_dispatch_lock(p_project,p_turn,p_token));
END $$;

CREATE FUNCTION sophia.managed_explore_dispatch_denial(c sophia.managed_explore_dispatch_context)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE parent sophia.managed_explore_versions;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=(c.s).project_id AND archived_at IS NULL;
 IF NOT FOUND THEN RETURN 'project_unavailable'; END IF;
 PERFORM 1 FROM sophia.project_members WHERE project_id=(c.s).project_id AND actor_id=(c.s).founder_id
  AND active AND role IN ('admin','editor') AND revision=(c.s).member_revision FOR SHARE;
 IF NOT FOUND THEN RETURN 'membership_changed'; END IF;
 PERFORM 1 FROM sophia.managed_explore_grants g WHERE g.project_id=(c.s).project_id AND g.id=(c.s).grant_id
  AND g.founder_id=(c.s).founder_id AND g.revision=(c.s).grant_revision AND g.route_id=(c.d).route_id
  AND g.credential_generation=(c.d).credential_generation AND g.provider_org=(c.d).provider_org
  AND g.provider_project=(c.d).provider_project AND g.model=(c.d).model
  AND g.currency='USD' AND g.per_session_micros/10000=(c.d).session_limit_cents AND (c.d).session_limit_cents>=1
  AND g.per_session_micros>=(c.s).reserved_micros AND g.enabled AND g.grant_only_verified AND NOT g.paid_spillover
  AND g.expires_at>clock_timestamp() AND g.credential_expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN 'funding_unavailable'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=(c.s).project_id AND id=(c.s).seed_source_id
   AND eligible AND state='ready' AND scope='project' AND sha256=(c.s).seed_sha256 FOR SHARE;
 IF NOT FOUND THEN RETURN 'source_unavailable'; END IF;
 PERFORM 1 FROM sophia.managed_explore_seed((c.s).project_id,(c.s).founder_id,(c.s).seed_entry_id) seed
   WHERE seed.source_id=(c.s).seed_source_id AND seed.revision=(c.s).seed_revision AND seed.sha256=(c.s).seed_sha256;
 IF NOT FOUND THEN RETURN 'source_unavailable'; END IF;
 IF (c.t).parent_version_id IS NOT NULL THEN
  SELECT * INTO parent FROM sophia.managed_explore_versions WHERE project_id=(c.s).project_id
   AND session_id=(c.s).id AND id=(c.t).parent_version_id;
  PERFORM 1 FROM sophia.source_objects WHERE project_id=(c.s).project_id AND id=parent.entry_source_id
   AND eligible AND state='ready' AND scope='private' AND sha256=parent.entry_sha256 FOR SHARE;
  IF NOT FOUND THEN RETURN 'parent_unavailable'; END IF;
  PERFORM 1 FROM sophia.managed_explore_version_entry(parent,(c.s).founder_id);
  IF NOT FOUND THEN RETURN 'parent_unavailable'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION sophia.finish_managed_explore_dispatch(c sophia.managed_explore_dispatch_context, p_status text,
 p_reply text,p_error text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.managed_explore_turns SET status=p_status,reply=p_reply,error=p_error
 WHERE project_id=(c.t).project_id AND id=(c.t).id;
 UPDATE sophia.managed_explore_sessions SET revision=revision+1 WHERE project_id=(c.s).project_id AND id=(c.s).id;
 UPDATE sophia.outbox SET state=CASE WHEN p_status='completed' THEN 'settled' ELSE 'denied' END,
  lease_until=NULL,lease_token=NULL,lease_owner=NULL
 WHERE project_id=(c.o).project_id AND id=(c.o).id;
 UPDATE sophia.commands SET state=CASE WHEN p_status='completed' THEN 'checked' ELSE 'denied' END
 WHERE project_id=(c.t).project_id AND id=(c.t).command_id;
END $$;

CREATE FUNCTION sophia.prepare_managed_explore_dispatch(p_project uuid,p_turn uuid,p_token uuid,
 p_kind text,p_previous_root text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context; denial text; previous_root text; payload_digest text;
BEGIN
 c:=sophia.managed_explore_dispatch_lock(p_project,p_turn,p_token);
 IF p_kind IS NULL OR p_kind NOT IN ('create','event') OR (p_kind='create' AND p_previous_root IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid managed Explore mutation' USING ERRCODE='22023'; END IF;
 IF (c.d).create_rejected_at IS NOT NULL THEN
  PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,'provider_session_unavailable');
  RETURN jsonb_build_object('kind','denied','reason','provider_session_unavailable');
 END IF;
 IF (p_kind='create' AND (c.d).create_possible_at IS NOT NULL)
   OR (p_kind='event' AND (c.x).event_possible_at IS NOT NULL) THEN
  RETURN jsonb_build_object('kind','observe');
 END IF;
 IF NOT (c.x).lease_allows_send THEN RETURN jsonb_build_object('kind','blocked','reason','worker_send_disabled'); END IF;
 IF p_kind='event' AND ((c.d).provider_session_id IS NULL OR coalesce((c.d).environment_status,'pending') NOT IN ('ready','connected')) THEN
  RETURN jsonb_build_object('kind','blocked','reason','environment_unavailable');
 END IF;
 denial:=sophia.managed_explore_dispatch_denial(c);
 IF denial IS NOT NULL THEN
  PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,denial);
  RETURN jsonb_build_object('kind','denied','reason',denial);
 END IF;
 IF (c.o).lease_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'Managed Explore lease lost' USING ERRCODE='40001'; END IF;
 IF p_kind='create' THEN
  UPDATE sophia.managed_explore_dispatch_sessions SET create_possible_at=clock_timestamp()
  WHERE project_id=p_project AND session_id=(c.s).id;
  RETURN jsonb_build_object('kind','create','operationId',(c.d).create_operation_id,'model',(c.d).model,
   'sessionLimitCents',(c.d).session_limit_cents,'leaseUntil',(c.o).lease_until);
 END IF;
 previous_root:=sophia.managed_explore_previous_root(p_project,(c.s).id,(c.t).sequence);
 IF p_previous_root IS DISTINCT FROM previous_root THEN RAISE EXCEPTION 'Stale managed Explore predecessor' USING ERRCODE='40001'; END IF;
 payload_digest:=encode(sha256(convert_to((c.t).instruction,'UTF8')),'hex');
 IF payload_digest<>(c.t).request_digest THEN RAISE EXCEPTION 'Stale managed Explore input digest' USING ERRCODE='40001'; END IF;
 UPDATE sophia.managed_explore_dispatch_turns SET event_possible_at=clock_timestamp(),predecessor_root_id=previous_root,
  payload_sha256=payload_digest WHERE project_id=p_project AND turn_id=p_turn;
 RETURN jsonb_build_object('kind','event','providerSessionId',(c.d).provider_session_id,'submissionId',(c.x).submission_id,
  'instruction',(c.t).instruction,'payloadSha256',payload_digest,'previousRootId',previous_root,'leaseUntil',(c.o).lease_until);
END $$;

CREATE FUNCTION sophia.managed_explore_provider_id(p_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',false)
$$;

CREATE FUNCTION sophia.record_managed_explore_session(c sophia.managed_explore_dispatch_context, p_kind text, p_observation jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE remote text:=p_observation->>'providerSessionId'; environment text:=p_observation->>'environmentId';
 request_id text:=p_observation->>'requestId'; observed_status text:=p_observation->>'status';
BEGIN
 IF p_kind='created' THEN
  IF (c.d).create_possible_at IS NULL OR (c.d).create_rejected_at IS NOT NULL
   OR (c.d).create_operation_id::text IS DISTINCT FROM p_observation->>'operationId'
   OR (c.d).model IS DISTINCT FROM p_observation->>'model'
   OR (c.d).session_limit_cents::text IS DISTINCT FROM p_observation->>'sessionLimitCents'
   OR p_observation->>'networkAccess' IS DISTINCT FROM 'disabled'
   OR NOT sophia.managed_explore_provider_id(remote) OR NOT sophia.managed_explore_provider_id(environment)
   OR (request_id IS NOT NULL AND NOT sophia.managed_explore_provider_id(request_id))
   OR ((c.d).provider_session_id IS NOT NULL AND
     ((c.d).provider_session_id<>remote OR (c.d).provider_environment_id<>environment)) THEN
   RAISE EXCEPTION 'Stale managed Explore create receipt' USING ERRCODE='40001'; END IF;
  UPDATE sophia.managed_explore_dispatch_sessions SET provider_session_id=remote,provider_environment_id=environment,
   create_request_id=coalesce(create_request_id,request_id)
  WHERE project_id=(c.s).project_id AND session_id=(c.s).id;
  IF (c.t).status='outcome_unknown' AND (c.x).event_possible_at IS NULL THEN
   UPDATE sophia.managed_explore_turns SET status='running' WHERE project_id=(c.t).project_id AND id=(c.t).id;
   UPDATE sophia.managed_explore_sessions SET revision=revision+1 WHERE project_id=(c.s).project_id AND id=(c.s).id;
   UPDATE sophia.commands SET state='dispatching' WHERE project_id=(c.t).project_id AND id=(c.t).command_id;
  END IF;
 ELSIF p_kind='environment' THEN
  IF remote IS NULL OR environment IS NULL OR (c.d).provider_session_id IS DISTINCT FROM remote
   OR (c.d).provider_environment_id IS DISTINCT FROM environment OR observed_status IS NULL
   OR observed_status NOT IN ('pending','provisioning','ready','connected','disconnected','suspended','expired','failed')
   OR ((c.d).environment_status IN ('expired','failed') AND (c.d).environment_status<>observed_status) THEN
   RAISE EXCEPTION 'Stale managed Explore environment observation' USING ERRCODE='40001'; END IF;
  UPDATE sophia.managed_explore_dispatch_sessions SET environment_status=observed_status
  WHERE project_id=(c.s).project_id AND session_id=(c.s).id;
  IF observed_status IN ('failed','expired') AND (c.x).event_possible_at IS NULL THEN
   PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,'provider_environment_unavailable');
  END IF;
 ELSE
  IF (c.d).create_possible_at IS NULL OR (c.d).provider_session_id IS NOT NULL OR (c.d).create_rejected_at IS NOT NULL
   OR (c.d).create_operation_id::text IS DISTINCT FROM p_observation->>'operationId' THEN
   RAISE EXCEPTION 'Stale managed Explore create rejection' USING ERRCODE='40001'; END IF;
  IF request_id IS NOT NULL AND NOT sophia.managed_explore_provider_id(request_id) THEN
   RAISE EXCEPTION 'Invalid managed Explore provider request identity' USING ERRCODE='22023'; END IF;
  UPDATE sophia.managed_explore_dispatch_sessions SET create_rejected_at=clock_timestamp(),create_request_id=request_id
  WHERE project_id=(c.s).project_id AND session_id=(c.s).id;
  PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,p_observation->>'reason');
 END IF;
END $$;

CREATE FUNCTION sophia.record_managed_explore_event(c sophia.managed_explore_dispatch_context, p_kind text, p_observation jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE request_id text:=p_observation->>'requestId'; root_id text:=p_observation->>'rootId';
 root_status text:=p_observation->>'status'; root_usage jsonb:=nullif(p_observation->'usage','null'::jsonb);
 next_status text; answer text:=p_observation->>'reply';
BEGIN
 IF (c.x).event_possible_at IS NULL OR (c.d).provider_session_id IS DISTINCT FROM p_observation->>'providerSessionId'
  OR (c.x).submission_id::text IS DISTINCT FROM p_observation->>'submissionId'
  OR (c.x).payload_sha256 IS DISTINCT FROM p_observation->>'payloadSha256'
  OR NOT (p_observation?'previousRootId')
  OR (c.x).predecessor_root_id IS DISTINCT FROM p_observation->>'previousRootId' THEN
  RAISE EXCEPTION 'Stale managed Explore event identity' USING ERRCODE='40001'; END IF;
 IF request_id IS NOT NULL AND NOT sophia.managed_explore_provider_id(request_id) THEN
  RAISE EXCEPTION 'Invalid managed Explore provider request identity' USING ERRCODE='22023'; END IF;
 IF p_kind='eventAccepted' THEN
  IF request_id IS NOT NULL AND (c.x).event_request_id IS NOT NULL AND request_id<>(c.x).event_request_id THEN
   RAISE EXCEPTION 'Stale managed Explore event request' USING ERRCODE='40001'; END IF;
  UPDATE sophia.managed_explore_dispatch_turns SET event_accepted_at=coalesce(event_accepted_at,clock_timestamp()),
   event_request_id=coalesce(event_request_id,request_id) WHERE project_id=(c.t).project_id AND turn_id=(c.t).id;
 ELSIF p_kind='eventRejected' THEN
  IF (c.x).event_accepted_at IS NOT NULL OR (c.x).provider_root_id IS NOT NULL THEN
   RAISE EXCEPTION 'An acknowledged event cannot be rejected' USING ERRCODE='40001'; END IF;
  UPDATE sophia.managed_explore_dispatch_turns SET event_request_id=request_id WHERE project_id=(c.t).project_id AND turn_id=(c.t).id;
  PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,p_observation->>'reason');
 ELSIF p_kind='root' THEN
  IF NOT sophia.managed_explore_provider_id(root_id) OR root_id IS NOT DISTINCT FROM (c.x).predecessor_root_id
   OR ((c.x).provider_root_id IS NOT NULL AND root_id<>(c.x).provider_root_id)
   OR root_status IS NULL OR root_status NOT IN ('queued','in_progress','waiting','completed','failed','cancelled')
   OR ((c.x).provider_root_status IN ('failed','cancelled','completed') AND (c.x).provider_root_status<>root_status)
   OR ((c.x).provider_root_status IN ('in_progress','waiting') AND root_status='queued') THEN
   RAISE EXCEPTION 'Stale managed Explore root observation' USING ERRCODE='40001'; END IF;
  IF root_usage IS NOT NULL AND (jsonb_typeof(root_usage)<>'object'
    OR root_usage-ARRAY['inputTokens','outputTokens','totalTokens']<>'{}'::jsonb
    OR NOT (root_usage ?& ARRAY['inputTokens','outputTokens','totalTokens'])
    OR EXISTS(SELECT 1 FROM jsonb_each(root_usage) j WHERE jsonb_typeof(j.value)<>'number'
      OR j.value::text !~ '^(0|[1-9][0-9]{0,15})$' OR j.value::numeric>9007199254740991)) THEN
   RAISE EXCEPTION 'Invalid managed Explore token usage' USING ERRCODE='22023'; END IF;
  UPDATE sophia.managed_explore_dispatch_turns SET provider_root_id=root_id,provider_root_status=root_status,
   usage=coalesce(root_usage,usage) WHERE project_id=(c.t).project_id AND turn_id=(c.t).id;
  next_status:=CASE WHEN root_status='completed' AND (c.t).kind<>'text' THEN 'retaining' ELSE 'running' END;
  IF (c.t).status<>next_status THEN
   UPDATE sophia.managed_explore_turns SET status=next_status WHERE project_id=(c.t).project_id AND id=(c.t).id;
   UPDATE sophia.managed_explore_sessions SET revision=revision+1 WHERE project_id=(c.s).project_id AND id=(c.s).id;
   UPDATE sophia.commands SET state='dispatching' WHERE project_id=(c.t).project_id AND id=(c.t).command_id;
  END IF;
 ELSE
  IF (c.x).provider_root_id IS NULL OR (c.x).provider_root_id IS DISTINCT FROM root_id
   OR (c.x).provider_root_status IS DISTINCT FROM root_status OR root_status NOT IN ('completed','failed','cancelled') THEN
   RAISE EXCEPTION 'Stale managed Explore settlement' USING ERRCODE='40001'; END IF;
  IF root_status='completed' AND ((c.t).kind<>'text' OR answer IS NULL OR octet_length(answer) NOT BETWEEN 1 AND 65536
    OR answer !~ '[^[:space:]]') THEN
   RAISE EXCEPTION 'This managed Explore turn needs separately validated retained output' USING ERRCODE='40001'; END IF;
  IF root_status<>'completed' AND answer IS NOT NULL THEN
   RAISE EXCEPTION 'An unsuccessful managed Explore turn cannot carry a text result' USING ERRCODE='22023'; END IF;
  PERFORM sophia.finish_managed_explore_dispatch(c,root_status,answer,p_observation->>'reason');
 END IF;
END $$;

CREATE FUNCTION sophia.record_managed_explore_dispatch(p_project uuid,p_turn uuid,p_token uuid,p_observation jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context; k text:=p_observation->>'kind'; reason text:=p_observation->>'reason';
 delay_seconds integer; unknown_effect boolean;
BEGIN
 c:=sophia.managed_explore_dispatch_lock(p_project,p_turn,p_token);
 IF k IS NULL OR k NOT IN ('created','createRejected','environment','eventAccepted','eventRejected','root','settle','defer') THEN
  RAISE EXCEPTION 'Invalid managed Explore observation' USING ERRCODE='22023'; END IF;
 IF (k IN ('createRejected','eventRejected') AND reason IS NULL)
  OR (reason IS NOT NULL AND reason NOT IN ('authorization','model_unavailable','credit_exhausted','budget_exceeded',
    'billing_unavailable','declined','provider_failed','cancelled')) THEN
  RAISE EXCEPTION 'Invalid managed Explore observation reason' USING ERRCODE='22023'; END IF;
 IF k='defer' THEN
  delay_seconds:=(p_observation->>'delaySeconds')::integer;
  IF delay_seconds IS NULL OR delay_seconds NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid retry delay' USING ERRCODE='22023'; END IF;
  unknown_effect:=((c.d).create_possible_at IS NOT NULL AND (c.d).provider_session_id IS NULL AND (c.d).create_rejected_at IS NULL)
   OR ((c.x).event_possible_at IS NOT NULL AND (c.x).provider_root_id IS NULL);
  UPDATE sophia.outbox SET state=CASE WHEN unknown_effect THEN 'outcome_unknown' ELSE 'pending' END,
    lease_until=NULL,lease_token=NULL,lease_owner=NULL,available_at=clock_timestamp()+make_interval(secs=>delay_seconds)
   WHERE project_id=p_project AND id=(c.o).id;
  IF unknown_effect AND (c.t).status<>'outcome_unknown' THEN
   UPDATE sophia.managed_explore_turns SET status='outcome_unknown' WHERE project_id=p_project AND id=p_turn;
   UPDATE sophia.managed_explore_sessions SET revision=revision+1 WHERE project_id=p_project AND id=(c.s).id;
   UPDATE sophia.commands SET state='outcome_unknown' WHERE project_id=p_project AND id=(c.t).command_id;
  END IF;
 ELSIF k IN ('created','createRejected','environment') THEN
  PERFORM sophia.record_managed_explore_session(c,k,p_observation);
 ELSE
  PERFORM sophia.record_managed_explore_event(c,k,p_observation);
 END IF;
END $$;

REVOKE ALL ON FUNCTION sophia.managed_explore_grant_revision_guard(),
 sophia.managed_explore_dispatch_lock(uuid,uuid,uuid),
 sophia.managed_explore_previous_root(uuid,uuid,bigint),
 sophia.managed_explore_dispatch_view(sophia.managed_explore_dispatch_context),
 sophia.claim_managed_explore_dispatch(text,text,bigint,text,text,integer,boolean),
 sophia.read_managed_explore_dispatch(uuid,uuid,uuid),
 sophia.managed_explore_dispatch_denial(sophia.managed_explore_dispatch_context),
 sophia.finish_managed_explore_dispatch(sophia.managed_explore_dispatch_context,text,text,text),
 sophia.prepare_managed_explore_dispatch(uuid,uuid,uuid,text,text),
 sophia.managed_explore_provider_id(text),
 sophia.record_managed_explore_session(sophia.managed_explore_dispatch_context,text,jsonb),
 sophia.record_managed_explore_event(sophia.managed_explore_dispatch_context,text,jsonb),
 sophia.record_managed_explore_dispatch(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.claim_managed_explore_dispatch(text,text,bigint,text,text,integer,boolean),
 sophia.read_managed_explore_dispatch(uuid,uuid,uuid),sophia.prepare_managed_explore_dispatch(uuid,uuid,uuid,text,text),
 sophia.record_managed_explore_dispatch(uuid,uuid,uuid,jsonb) TO sophia_worker;

COMMIT;
