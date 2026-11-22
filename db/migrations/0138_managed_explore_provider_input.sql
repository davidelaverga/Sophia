-- Founder Explore provider inputs. The existing user-request SHA remains the admission identity.
-- Compute the exact outbound SHA only while committing the first possible-send fence under the current lease.
BEGIN;

CREATE FUNCTION sophia.managed_explore_provider_input(c sophia.managed_explore_dispatch_context,
 OUT payload text, OUT denial text)
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE
 detail jsonb;
 selected sophia.managed_explore_directions;
 parent sophia.managed_explore_versions;
 parent_body text;
BEGIN
 IF (c.t).kind='text' AND (c.t).sequence=1 THEN
  payload:=(c.t).instruction;
  RETURN;
 END IF;

 IF (c.t).kind IN ('prototype','revision') THEN
  SELECT d.* INTO selected FROM sophia.managed_explore_directions d
  WHERE d.project_id=(c.t).project_id AND d.session_id=(c.t).session_id AND d.id=(c.t).direction_id
   AND d.id=(c.s).selected_direction_id AND d.revision=(
    SELECT max(active.revision) FROM sophia.managed_explore_directions active
    WHERE active.project_id=d.project_id AND active.session_id=d.session_id
   );
  IF NOT FOUND THEN denial:='direction_unavailable'; RETURN; END IF;
 END IF;

 IF (c.t).kind='revision' THEN
  SELECT v.* INTO parent FROM sophia.managed_explore_versions v
  WHERE v.project_id=(c.t).project_id AND v.session_id=(c.t).session_id
   AND v.id=(c.t).parent_version_id AND v.direction_id=selected.id;
  IF NOT FOUND THEN denial:='parent_unavailable'; RETURN; END IF;
  SELECT original.body INTO parent_body FROM sophia.managed_explore_version_entry(parent,(c.s).founder_id) original;
  IF parent_body IS NULL THEN denial:='parent_unavailable'; RETURN; END IF;
 END IF;

 detail:=jsonb_build_object('format','sophia.managed-explore.input.v1','operation',(c.t).kind,
  'brief',jsonb_build_object('text',(c.s).seed_text,'sha256',(c.s).seed_sha256),'request',(c.t).instruction);
 IF (c.t).kind IN ('prototype','revision') THEN
  detail:=detail||jsonb_build_object('direction',selected.candidate||jsonb_build_object('id',selected.id,'revision',selected.revision),
   'outputPath','/workspace/outputs/index.html');
 END IF;
 IF (c.t).kind='revision' THEN
  detail:=detail||jsonb_build_object('parent',jsonb_build_object('id',parent.id,'entrySha256',parent.entry_sha256,
   'html',parent_body),'componentId',(c.t).component_id);
 END IF;

 payload:=detail::text;
 -- Same byte limit as the HTTP provider input bound. Never truncate approved parent source or possible-send bytes.
 IF octet_length(payload)>1048576 THEN payload:=NULL; denial:='input_too_large'; END IF;
END $$;

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

REVOKE ALL ON FUNCTION sophia.managed_explore_provider_input(sophia.managed_explore_dispatch_context) FROM PUBLIC;
COMMIT;
