-- Known terminal sessions admit no new turns. Drain previously admitted unsent turns with the original scope.
BEGIN;

CREATE FUNCTION sophia.managed_explore_session_terminal(d sophia.managed_explore_dispatch_sessions)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT d.create_rejected_at IS NOT NULL OR d.input_refused_status IS NOT NULL
  OR coalesce(d.environment_status IN ('failed','expired'),false)
$$;
REVOKE ALL ON FUNCTION sophia.managed_explore_session_terminal(sophia.managed_explore_dispatch_sessions) FROM PUBLIC;

CREATE OR REPLACE FUNCTION sophia.managed_explore_dispatch_view(c sophia.managed_explore_dispatch_context)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('projectId',(c.t).project_id,'sessionId',(c.t).session_id,'turnId',(c.t).id,
 'turnKind',(c.t).kind,'turnStatus',(c.t).status,'outboxId',(c.o).id,'leaseToken',(c.o).lease_token,
 'leaseUntil',(c.o).lease_until,'allowSend',(c.x).lease_allows_send,
 'model',(c.d).model,'sessionLimitCents',(c.d).session_limit_cents,'createOperationId',(c.d).create_operation_id,
 'createPossibleAt',(c.d).create_possible_at,'createRejectedAt',(c.d).create_rejected_at,
 'providerSessionId',(c.d).provider_session_id,
 'environmentId',(c.d).provider_environment_id,'environmentStatus',(c.d).environment_status,
 'sessionRefusalStatus',(c.d).input_refused_status,
 'submissionId',(c.x).submission_id,'eventPossibleAt',(c.x).event_possible_at,'eventAcceptedAt',(c.x).event_accepted_at,
 'eventRequestId',(c.x).event_request_id,'previousRootId',CASE WHEN (c.x).event_possible_at IS NOT NULL
  THEN (c.x).predecessor_root_id ELSE sophia.managed_explore_previous_root((c.t).project_id,(c.t).session_id,(c.t).sequence) END,
 'rootId',(c.x).provider_root_id,
 'rootStatus',(c.x).provider_root_status,'rootCompletedSeenAt',(c.x).root_completed_seen_at,'payloadSha256',(c.x).payload_sha256,'usage',(c.x).usage)
$$;

CREATE OR REPLACE FUNCTION sophia.claim_managed_explore_dispatch(p_worker text, p_route text, p_generation bigint,
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
 SELECT o.project_id, t.session_id, t.id AS turn_id, recovery.possible_effect,recovery.terminal_session INTO selected
 FROM sophia.outbox o JOIN sophia.projects p ON p.id=o.project_id
 JOIN sophia.managed_explore_turns t ON t.project_id=o.project_id AND t.id=o.managed_explore_turn_id
 JOIN sophia.managed_explore_sessions s ON s.project_id=t.project_id AND s.id=t.session_id
 JOIN sophia.managed_explore_grants g ON g.project_id=s.project_id AND g.id=s.grant_id
 LEFT JOIN sophia.managed_explore_dispatch_sessions d ON d.project_id=s.project_id AND d.session_id=s.id
 LEFT JOIN sophia.managed_explore_dispatch_turns x ON x.project_id=t.project_id AND x.turn_id=t.id
 CROSS JOIN LATERAL (SELECT x.event_possible_at IS NOT NULL
   OR (d.create_possible_at IS NOT NULL AND d.provider_session_id IS NULL AND d.create_rejected_at IS NULL
       AND t.status<>'queued') AS possible_effect,
   sophia.managed_explore_session_terminal(d) AS terminal_session) recovery
 WHERE o.destination='managed_explore.turn' AND o.available_at<=clock_timestamp()
  AND (o.state IN ('pending','outcome_unknown') OR (o.state='dispatching' AND o.lease_until<=clock_timestamp()))
  AND t.status IN ('queued','running','retaining','outcome_unknown')
  AND s.route_id=p_route AND s.credential_generation=p_generation
  AND coalesce(d.provider_org,g.provider_org)=p_org AND coalesce(d.provider_project,g.provider_project)=p_provider_project
  AND (recovery.possible_effect OR recovery.terminal_session OR (p_allow_send AND g.revision=s.grant_revision
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
 -- Possible effects and terminal cleanup keep the original scope without requiring new send authority.
 current_grant:=grant_row.revision=(c.s).grant_revision AND grant_row.route_id=p_route
  AND grant_row.credential_generation=p_generation AND grant_row.provider_org=p_org
  AND grant_row.provider_project=p_provider_project;
 IF NOT current_grant AND NOT selected.possible_effect AND NOT selected.terminal_session THEN RETURN NULL; END IF;
 INSERT INTO sophia.managed_explore_dispatch_sessions(project_id,session_id,route_id,provider_org,provider_project,
   credential_generation,model,session_limit_cents)
 VALUES(selected.project_id,selected.session_id,p_route,p_org,p_provider_project,p_generation,grant_row.model,
   CASE WHEN grant_row.currency='USD' THEN grant_row.per_session_micros/10000 ELSE 0 END)
 ON CONFLICT(project_id,session_id) DO NOTHING;
 SELECT d INTO c.d FROM sophia.managed_explore_dispatch_sessions d
 WHERE project_id=selected.project_id AND session_id=selected.session_id FOR UPDATE;
 IF (c.d).provider_org<>p_org OR (c.d).provider_project<>p_provider_project THEN RETURN NULL; END IF;
 INSERT INTO sophia.managed_explore_dispatch_turns AS inserted(project_id,session_id,turn_id,lease_allows_send)
 VALUES(selected.project_id,selected.session_id,selected.turn_id,p_allow_send AND current_grant AND NOT sophia.managed_explore_session_terminal(c.d))
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
   WHERE d.project_id=p_project AND d.session_id=p_session AND sophia.managed_explore_session_terminal(d))
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

COMMIT;
