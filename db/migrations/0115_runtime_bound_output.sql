-- INC04-R07-C2-MAINTAINED-BOUND-OUTPUT-001 (SOPHIA-INC-2026-11, INC-04 R07 C2, Root81): the maintained crossing of the
-- frozen 0113 dimension-bound dispatch. Root reserved 0115 (Host only). 0001-0114 are not edited; 0113's nine private
-- runtime entries, its cores, arithmetic, protocol and digests are unchanged and stay ungranted.
-- * NINE NARROW PUBLIC WRAPPERS, one per operation x step: sophia.runtime_bound_output_{apply,claim,outcome} (research),
--   ..._design and ..._review. SECURITY DEFINER, fixed search_path, explicit arguments, EXECUTE to sophia_api only (never
--   PUBLIC, the worker or the assembler). Each wrapper, in this order:
--   1. feature selection: current_setting('sophia.bound_output', true) = 'v1', else bound_output_disabled (absent = OFF).
--      The API's persistence layer sets it transaction-locally ONLY for these calls and ONLY when its server was built
--      with the bound-output option. It is never authority: any role can set a custom setting, and nothing below trusts
--      it for anything but selecting this feature.
--   2. the closed public request: {attemptId, nativeSessionId, <step>} with the step's closed camelCase members.
--   3. the operation's OWN maintained authenticated scope (0025 research_scope_of, 0041 design_scope_of with p_kind NULL
--      as its reserve, 0042 review_scope_of), unfenced (the private core fences after its last wait).
--   4. an opted dispatch must exist for the reservation in that scope's project, else bound_output_not_opted.
--   5. the private 0113 entry of the SAME fixed operation, with project_id, runtime_id (and the apply's attempt_id) taken
--      from the authenticated scope, never from the body. The private entry resolves its scope again and runs every 0113
--      check (identity operation, lease, profile and policy state, generation, emitter, fence, replay, conflict).
-- * NOTHING ELSE: no table, no grant on a table, no replaced function, no money, no reserve change (0113's opt-in reserve
--   is unchanged; the API refuses a boundProfile while its option is off, before the database).
BEGIN;

-- 1. Feature selection only (never authority).
CREATE FUNCTION sophia.runtime_bound_output_enabled() RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('sophia.bound_output',true) IS DISTINCT FROM 'v1' THEN
  RAISE EXCEPTION 'bound_output_disabled' USING ERRCODE='55000'; END IF;
END $$;

-- 2. The closed members of one public step, in key order.
CREATE FUNCTION sophia.runtime_bound_output_members(p_step text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_step
  WHEN 'apply' THEN ARRAY['authorizeSetDigest','callId','dispatchId','emitterIdentityDigest','originalGeneration',
   'outboundParamsDigest','reservationId']
  WHEN 'claim' THEN ARRAY['applyReceiptDigest','dispatchId','originalGeneration','reservationId']
  WHEN 'outcome' THEN ARRAY['dispatchId','evidenceDigest','observedAt','outcomeKind','reservationId'] END $$;

-- The closed public request: exactly {attemptId, nativeSessionId, <step>}; the step's members exactly, each a JSON string
-- (originalGeneration a string or null); the reservation a uuid. Grammar of every other member is the 0113 core's.
CREATE FUNCTION sophia.runtime_bound_output_shape(p_step text, p_request jsonb) RETURNS uuid LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE b jsonb:=p_request->p_step;
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k)
     IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(ARRAY['attemptId','nativeSessionId',p_step]) k)
    OR jsonb_typeof(p_request->'attemptId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_request->'nativeSessionId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(b) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(b) k) IS DISTINCT FROM sophia.runtime_bound_output_members(p_step)
    OR EXISTS(SELECT 1 FROM jsonb_each(b) e WHERE jsonb_typeof(e.value)<>'string'
     AND NOT (e.key='originalGeneration' AND jsonb_typeof(e.value)='null'))
    OR coalesce(b->>'reservationId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 RETURN (b->>'reservationId')::uuid;
END $$;

-- 4. An opted dispatch of the reservation in the authenticated scope's project.
CREATE FUNCTION sophia.runtime_bound_output_opted(p_project uuid, p_reservation uuid) RETURNS void LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sophia.research_bound_dispatches d WHERE d.project_id=p_project AND d.reservation_id=p_reservation) THEN
  RAISE EXCEPTION 'bound_output_not_opted' USING ERRCODE='22023'; END IF;
END $$;

-- 5. The private 0113 request: the public members in 0113's snake_case domain, the scope's values where 0113 names the
--    caller's project, runtime and (apply) attempt.
CREATE FUNCTION sophia.runtime_bound_output_request(p_step text, p_request jsonb, p_project uuid, p_runtime uuid, p_attempt uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('attemptId',p_request->'attemptId','nativeSessionId',p_request->'nativeSessionId',p_step,
  CASE p_step
   WHEN 'apply' THEN jsonb_build_object('project_id',p_project::text,'reservation_id',b->'reservationId','dispatch_id',b->'dispatchId',
    'attempt_id',p_attempt::text,'call_id',b->'callId','runtime_id',p_runtime::text,'original_generation',b->'originalGeneration',
    'emitter_identity_digest',b->'emitterIdentityDigest','outbound_params_digest',b->'outboundParamsDigest',
    'authorize_set_digest',b->'authorizeSetDigest')
   WHEN 'claim' THEN jsonb_build_object('project_id',p_project::text,'reservation_id',b->'reservationId','dispatch_id',b->'dispatchId',
    'runtime_id',p_runtime::text,'original_generation',b->'originalGeneration','apply_receipt_digest',b->'applyReceiptDigest')
   WHEN 'outcome' THEN jsonb_build_object('project_id',p_project::text,'reservation_id',b->'reservationId','dispatch_id',b->'dispatchId',
    'outcome_kind',b->'outcomeKind','evidence_digest',b->'evidenceDigest','observed_at',b->'observedAt') END)
 FROM (SELECT p_request->p_step AS b) x $$;

-- --- the nine public wrappers (research, design, source review x apply, claim, outcome) ------------------------------

CREATE FUNCTION sophia.runtime_bound_output_apply(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('apply',p_request);
 s:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_apply(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('apply',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;
CREATE FUNCTION sophia.runtime_bound_output_claim(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('claim',p_request);
 s:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_claim(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('claim',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;
CREATE FUNCTION sophia.runtime_bound_output_outcome(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('outcome',p_request);
 s:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_outcome(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('outcome',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;

CREATE FUNCTION sophia.runtime_bound_output_apply_design(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('apply',p_request);
 s:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_apply_design(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('apply',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;
CREATE FUNCTION sophia.runtime_bound_output_claim_design(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('claim',p_request);
 s:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_claim_design(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('claim',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;
CREATE FUNCTION sophia.runtime_bound_output_outcome_design(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('outcome',p_request);
 s:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_outcome_design(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('outcome',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;

CREATE FUNCTION sophia.runtime_bound_output_apply_review(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('apply',p_request);
 s:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_apply_review(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('apply',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;
CREATE FUNCTION sophia.runtime_bound_output_claim_review(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('claim',p_request);
 s:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_claim_review(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('claim',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;
CREATE FUNCTION sophia.runtime_bound_output_outcome_review(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope; r uuid;
BEGIN
 PERFORM sophia.runtime_bound_output_enabled();
 r:=sophia.runtime_bound_output_shape('outcome',p_request);
 s:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 PERFORM sophia.runtime_bound_output_opted(s.project_id,r);
 RETURN sophia.runtime_research_bound_outcome_review(p_token_sha256,p_unit,p_bridge,
  sophia.runtime_bound_output_request('outcome',p_request,s.project_id,s.runtime_id,s.attempt_id));
END $$;

-- --- privileges ------------------------------------------------------------------------------------------------------
-- Every new function: revoked from PUBLIC, the API, the worker and (when it exists) the assembler; then EXECUTE on the
-- nine wrappers ONLY, to sophia_api ONLY. The helpers stay the migration owner's. 0113's private entries are not touched.
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia'
   AND p.proname ~ '^runtime_bound_output_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, sophia_api, sophia_worker',f);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sophia_conversation_assembler',f); END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION
 sophia.runtime_bound_output_apply(bytea,text,text,jsonb), sophia.runtime_bound_output_claim(bytea,text,text,jsonb),
 sophia.runtime_bound_output_outcome(bytea,text,text,jsonb),
 sophia.runtime_bound_output_apply_design(bytea,text,text,jsonb), sophia.runtime_bound_output_claim_design(bytea,text,text,jsonb),
 sophia.runtime_bound_output_outcome_design(bytea,text,text,jsonb),
 sophia.runtime_bound_output_apply_review(bytea,text,text,jsonb), sophia.runtime_bound_output_claim_review(bytea,text,text,jsonb),
 sophia.runtime_bound_output_outcome_review(bytea,text,text,jsonb)
TO sophia_api;

COMMIT;
