-- Resume bounded scans under the exact possible-send fence. Partial history is only identity evidence, never output.
BEGIN;

ALTER TABLE sophia.managed_explore_dispatch_turns
 ADD COLUMN input_scan_root_id text,
 ADD COLUMN input_scan_after text,
 ADD COLUMN input_scan_digest text,
 ADD CHECK((input_scan_root_id IS NULL)=(input_scan_after IS NULL)),
 ADD CHECK(input_scan_root_id IS NOT NULL OR input_scan_digest IS NULL),
 ADD CHECK(input_scan_digest IS NULL OR (payload_sha256 IS NOT NULL AND input_scan_digest=payload_sha256));

CREATE FUNCTION sophia.checkpoint_managed_explore_input(c sophia.managed_explore_dispatch_context,p_observation jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE root_id text:=p_observation->>'rootId'; after_id text:=p_observation->>'after';
 digest text:=p_observation->>'digest';
BEGIN
 IF (c.x).event_possible_at IS NULL OR (c.d).provider_session_id IS DISTINCT FROM p_observation->>'providerSessionId'
  OR (c.x).submission_id::text IS DISTINCT FROM p_observation->>'submissionId'
  OR (c.x).payload_sha256 IS DISTINCT FROM p_observation->>'payloadSha256'
  OR NOT (p_observation ?& ARRAY['previousRootId','priorAfter','digest'])
  OR (c.x).predecessor_root_id IS DISTINCT FROM p_observation->>'previousRootId' THEN
  RAISE EXCEPTION 'Stale managed Explore history event' USING ERRCODE='40001'; END IF;
 IF NOT sophia.managed_explore_provider_id(root_id) OR root_id IS NOT DISTINCT FROM (c.x).predecessor_root_id
  OR after_id IS NULL OR length(after_id)>512 OR after_id !~ '^[A-Za-z0-9_-]+$'
  OR (digest IS NOT NULL AND digest IS DISTINCT FROM (c.x).payload_sha256) THEN
  RAISE EXCEPTION 'Invalid managed Explore history checkpoint' USING ERRCODE='22023'; END IF;
 IF ((c.x).provider_root_id IS NOT NULL AND (c.x).provider_root_id IS DISTINCT FROM root_id)
  OR (c.x).provider_root_status IN ('completed','failed','cancelled')
  OR ((c.x).input_scan_root_id IS NOT NULL AND (c.x).input_scan_root_id IS DISTINCT FROM root_id)
  OR ((c.x).input_scan_digest IS NOT NULL AND (c.x).input_scan_digest IS DISTINCT FROM digest)
  OR (c.x).input_scan_after IS DISTINCT FROM p_observation->>'priorAfter'
  OR (c.x).input_scan_after IS NOT DISTINCT FROM after_id THEN
  RAISE EXCEPTION 'Stale managed Explore history checkpoint' USING ERRCODE='40001'; END IF;
 UPDATE sophia.managed_explore_dispatch_turns
 SET input_scan_root_id=root_id,input_scan_after=after_id,input_scan_digest=digest
 WHERE project_id=(c.t).project_id AND turn_id=(c.t).id;
END $$;

REVOKE ALL ON FUNCTION sophia.checkpoint_managed_explore_input(sophia.managed_explore_dispatch_context,jsonb) FROM PUBLIC;

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
 'inputScan',CASE WHEN (c.x).input_scan_root_id IS NOT NULL THEN
  jsonb_build_object('rootId',(c.x).input_scan_root_id,'after',(c.x).input_scan_after,'digest',(c.x).input_scan_digest) END,
 'rootStatus',(c.x).provider_root_status,'rootCompletedSeenAt',(c.x).root_completed_seen_at,'payloadSha256',(c.x).payload_sha256,'usage',(c.x).usage)
$$;

CREATE OR REPLACE FUNCTION sophia.record_managed_explore_dispatch(p_project uuid,p_turn uuid,p_token uuid,p_observation jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context; k text:=p_observation->>'kind'; reason text:=p_observation->>'reason';
 delay_seconds integer; unknown_effect boolean;
BEGIN
 c:=sophia.managed_explore_dispatch_lock(p_project,p_turn,p_token);
 IF k IS NULL OR k NOT IN ('created','createRejected','environment','eventAccepted','eventRejected','root','settle','outputRejected','defer','inputScan') THEN
  RAISE EXCEPTION 'Invalid managed Explore observation' USING ERRCODE='22023'; END IF;
 IF (k='outputRejected' AND (reason IS NULL OR reason NOT IN ('output_invalid','output_missing','output_history_limit')))
  OR (k IN ('createRejected','eventRejected') AND reason IS NULL)
  OR (k<>'outputRejected' AND reason IS NOT NULL AND reason NOT IN ('authorization','model_unavailable','credit_exhausted','budget_exceeded',
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
 ELSIF k='inputScan' THEN
  PERFORM sophia.checkpoint_managed_explore_input(c,p_observation);
 ELSE
  IF k='root' AND (c.x).input_scan_root_id IS NOT NULL
     AND ((c.x).input_scan_root_id IS DISTINCT FROM p_observation->>'rootId'
      OR (c.x).input_scan_after IS DISTINCT FROM p_observation->>'inputScanAfter'
      OR p_observation->>'status' NOT IN ('completed','failed','cancelled')) THEN
   RAISE EXCEPTION 'Stale managed Explore history root' USING ERRCODE='40001'; END IF;
  PERFORM sophia.record_managed_explore_event(c,k,p_observation);
  IF k='root' AND (c.x).input_scan_root_id IS NOT NULL THEN
   UPDATE sophia.managed_explore_dispatch_turns
   SET input_scan_root_id=NULL,input_scan_after=NULL,input_scan_digest=NULL
   WHERE project_id=p_project AND turn_id=p_turn;
  END IF;
 END IF;
END $$;

COMMIT;
