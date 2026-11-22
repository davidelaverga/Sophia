-- Stop new mutations after a verified provider session refusal. Possible sends stay on the original reconciliation path.
BEGIN;

ALTER TABLE sophia.managed_explore_dispatch_sessions
 ADD COLUMN input_refused_status text CHECK(input_refused_status IN ('failed','budget_reached')),
 ADD COLUMN input_refused_request_id text;

CREATE FUNCTION sophia.managed_explore_session_refusal_reason(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_status WHEN 'failed' THEN 'provider_failed' WHEN 'budget_reached' THEN 'budget_exceeded' END
$$;

CREATE FUNCTION sophia.refuse_managed_explore_session(p_project uuid,p_turn uuid,p_token uuid,
 p_remote text,p_environment text,p_status text,p_request text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context;
 denial text:=sophia.managed_explore_session_refusal_reason(p_status);
BEGIN
 IF denial IS NULL OR NOT sophia.managed_explore_provider_id(p_remote)
  OR NOT sophia.managed_explore_provider_id(p_environment)
  OR (p_request IS NOT NULL AND NOT sophia.managed_explore_provider_id(p_request)) THEN
  RAISE EXCEPTION 'Invalid managed Explore session refusal' USING ERRCODE='22023';
 END IF;
 c:=sophia.managed_explore_dispatch_lock(p_project,p_turn,p_token);
 IF (c.x).event_possible_at IS NOT NULL OR (c.d).provider_session_id IS DISTINCT FROM p_remote
  OR (c.d).provider_environment_id IS DISTINCT FROM p_environment THEN
  RAISE EXCEPTION 'Stale managed Explore session refusal' USING ERRCODE='40001';
 END IF;
 UPDATE sophia.managed_explore_dispatch_sessions SET input_refused_status=p_status,input_refused_request_id=p_request
 WHERE project_id=p_project AND session_id=(c.s).id AND input_refused_status IS NULL;
 -- Subsequent observations cannot overwrite the first durable refusal.
 denial:=sophia.managed_explore_session_refusal_reason(coalesce((c.d).input_refused_status,p_status));
 PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,denial);
END $$;

REVOKE ALL ON FUNCTION sophia.managed_explore_session_refusal_reason(text),
 sophia.refuse_managed_explore_session(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.refuse_managed_explore_session(uuid,uuid,uuid,text,text,text,text) TO sophia_worker;

CREATE OR REPLACE FUNCTION sophia.managed_explore_dispatch_view(c sophia.managed_explore_dispatch_context)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('projectId',(c.t).project_id,'sessionId',(c.t).session_id,'turnId',(c.t).id,
 'turnKind',(c.t).kind,'turnStatus',(c.t).status,'outboxId',(c.o).id,'leaseToken',(c.o).lease_token,
 'leaseUntil',(c.o).lease_until,'allowSend',(c.x).lease_allows_send,
 'model',(c.d).model,'sessionLimitCents',(c.d).session_limit_cents,'createOperationId',(c.d).create_operation_id,
 'createPossibleAt',(c.d).create_possible_at,'providerSessionId',(c.d).provider_session_id,
 'environmentId',(c.d).provider_environment_id,'environmentStatus',(c.d).environment_status,
 'sessionRefusalStatus',(c.d).input_refused_status,
 'submissionId',(c.x).submission_id,'eventPossibleAt',(c.x).event_possible_at,'eventAcceptedAt',(c.x).event_accepted_at,
 'eventRequestId',(c.x).event_request_id,'previousRootId',CASE WHEN (c.x).event_possible_at IS NOT NULL
  THEN (c.x).predecessor_root_id ELSE sophia.managed_explore_previous_root((c.t).project_id,(c.t).session_id,(c.t).sequence) END,
 'rootId',(c.x).provider_root_id,
 'rootStatus',(c.x).provider_root_status,'rootCompletedSeenAt',(c.x).root_completed_seen_at,'payloadSha256',(c.x).payload_sha256,'usage',(c.x).usage)
$$;

CREATE OR REPLACE FUNCTION sophia.prepare_managed_explore_dispatch(p_project uuid,p_turn uuid,p_token uuid,
 p_kind text,p_previous_root text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context; denial text; previous_root text; payload_digest text; input record;
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
 IF (c.d).input_refused_status IS NOT NULL THEN
  denial:=sophia.managed_explore_session_refusal_reason((c.d).input_refused_status);
  PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,denial);
  RETURN jsonb_build_object('kind','denied','reason',denial);
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
 IF encode(sha256(convert_to((c.t).instruction,'UTF8')),'hex')<>(c.t).request_digest THEN
  RAISE EXCEPTION 'Stale managed Explore input digest' USING ERRCODE='40001'; END IF;
 SELECT * INTO input FROM sophia.managed_explore_provider_input(c);
 IF input.denial IS NOT NULL THEN
  PERFORM sophia.finish_managed_explore_dispatch(c,'failed',NULL,input.denial);
  RETURN jsonb_build_object('kind','denied','reason',input.denial);
 END IF;
 IF (c.o).lease_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'Managed Explore lease lost' USING ERRCODE='40001'; END IF;
 payload_digest:=encode(sha256(convert_to(input.payload,'UTF8')),'hex');
 UPDATE sophia.managed_explore_dispatch_turns SET event_possible_at=clock_timestamp(),predecessor_root_id=previous_root,
  payload_sha256=payload_digest WHERE project_id=p_project AND turn_id=p_turn;
 RETURN jsonb_build_object('kind','event','providerSessionId',(c.d).provider_session_id,'submissionId',(c.x).submission_id,
  'instruction',input.payload,'payloadSha256',payload_digest,'previousRootId',previous_root,'leaseUntil',(c.o).lease_until);
END $$;

COMMIT;
