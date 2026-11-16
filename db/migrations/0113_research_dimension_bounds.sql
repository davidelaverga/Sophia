-- INC04-R07-C2-DIMENSION-BOUNDS-CORE-001 (SOPHIA-INC-2026-11, INC-04 R07 C2, Stage A): the INACTIVE database core of a
-- qualified per-reservation dimension bound (combined contract R0 + R1 + R2E + Root bridge C01-C03). Root reserved 0113.
-- 0001-0112 are not edited; eight existing functions are replaced here (marked, byte for byte plus the marked lines);
-- every other definition is new and private to the migration owner. No API, schema, SDK or emitter reaches it here.
-- R1 (INC04-R07-C2-DIMENSION-BOUNDS-CORE-R1-001, a successor of the frozen 4ed candidate): K4 on late facts (the current
-- 0112 late-fact writer), the shared-lineage funding binding through the maintained resolver in the research, design and
-- source-review reserves, the stored first scope binding every registration conflict, and any sticky conflict of an
-- applicable policy revision refusing before its derived state (C02).
-- R2 (C2R1B-F01): one shared apply / claim / outcome core, with owner-only entry points for research, design and source
-- review, each resolving its OWN maintained authenticated scope and re-running it as the post-last-wait fence.
-- * DOMAINS. Eight closed append domains and three digest helpers, framed d<len>:<domain> k<len>:<n> then per field
--   s<len>:<utf8> or n (typed null); every key required; validation key-set, then grammar (calendar included), then
--   cross-field. A digest is consistency, never authority or outbound truth.
-- * CUSTODY. Profiles and policies are registered and moved only by a dedicated bound_profile_qualification operator
--   authority (approver <> verifier, exact scope and dimension, append-only revocation), checked CURRENT and unrevoked
--   at every manual action under the revision row (FOR UPDATE) and then the authority row (FOR SHARE). Revision content is
--   immutable; an authorized competing registration or event is a sticky conflict; an unauthorized, malformed or
--   wrong-scope request writes nothing. Lifecycle state is derived, never stored: distrust > revoke > auto_hold >
--   conflicted > held (an open manual hold) > active > inactive; a policy: revoke > conflicted > active > inactive.
-- * RESERVE (AS-FP01). Only a NEW tracked model call that opted in (boundProfile), strictly after the existing key/replay
--   and finalizing handling and before the new-call gate: its profile rows, then its applicable policy rows, FOR SHARE in a
--   deterministic order, and the server-derived bounds and expected outbound preimage; an applicable policy revision with
--   any sticky conflict refuses (C02). The same block runs in the design and source-review reserves (R1). After the
--   identity: fresh rows only (one dispatch, four authorize rows), whose foreign keys reach only rows held or created in
--   the transaction. A replay compares the stored client request; it never re-derives.
-- * DISPATCH. One per reservation for every dimension. apply = an immutable receipt (exact replay returns it, never
--   permission; a different apply is a sticky orthogonal conflict); claim = the single at-most-once transition, the only
--   reply with sendPermitted true, after the scope fence and every post-wait recheck; outcome = informational, claim owner
--   only. A claim replay returns history without permission, to the claim owner only.
-- * SETTLE (AS-FP02). The current 0112 writer, plus one hook: a known output count above the authorized bound is a sticky
--   contradiction and the profile's auto_hold, the profile row locked BEFORE research_restriction_cause's first account
--   guard lock. Cause, episode, certificate, recurrence, replay, money, settlement and history are unchanged. R1: the
--   current 0112 late-fact writer carries the same hook at the same place (late knowledge is never laundered).
-- * MONEY. Nothing here creates, reprices, releases or refunds USD; no dollars become native caps.
BEGIN;

-- --- canonical framing and closed domains --------------------------------------------------------------------------

CREATE FUNCTION sophia.research_c2_frame(p_domain text, p_values text[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT 'd'||octet_length(p_domain)::text||':'||p_domain
  ||'k'||octet_length(coalesce(cardinality(p_values),0)::text)::text||':'||coalesce(cardinality(p_values),0)::text
  ||coalesce((SELECT string_agg(CASE WHEN v IS NULL THEN 'n' ELSE 's'||octet_length(v)::text||':'||v END,'' ORDER BY n)
   FROM unnest(p_values) WITH ORDINALITY x(v,n)),'') $$;
CREATE FUNCTION sophia.research_c2_digest(p_domain text, p_values text[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT encode(sha256(convert_to(sophia.research_c2_frame(p_domain,p_values),'UTF8')),'hex') $$;

CREATE FUNCTION sophia.research_c2_unit_of(p_dimension text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_dimension WHEN 'openai.output_tokens' THEN 'tokens' WHEN 'openai.input_tokens' THEN 'tokens'
  WHEN 'openai.input_cached_tokens' THEN 'tokens' WHEN 'openai.model_requests' THEN 'requests' END $$;

-- The field specifications of the eight append domains, in TLV order: name:grammar, '?' = typed-nullable.
CREATE FUNCTION sophia.research_c2_fields(p_domain text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_domain
  WHEN 'sophia.c2.bound.profile.register.v1' THEN ARRAY['profile_id:uuid','revision:int','dimension:dimension','unit:unit',
   'enforcement_kind:enforcement_kind','param_name:param_name?','max_ceiling:int','provider:ident','route_id:ident',
   'endpoint:ident','model:ident','settings_digest:digest','emitter_identity_digest:digest','semantics_evidence_digest:digest',
   'isolation_evidence_digest:digest','scope_kind:profile_scope_kind','scope_ref:uuid','authority_id:uuid',
   'approval_ref_digest:digest','evidence_digest:digest']
  WHEN 'sophia.c2.bound.profile.event.v1' THEN ARRAY['profile_id:uuid','revision:int','dimension:dimension','event_key:event_key',
   'event_kind:event_kind','target_event_digest:digest?','reason_code:reason_code','authority_id:uuid?',
   'approval_ref_digest:digest?','cause_ref_digest:digest?','evidence_digest:digest']
  WHEN 'sophia.c2.bound.policy.register.v1' THEN ARRAY['policy_id:uuid','revision:int','scope_kind:policy_scope_kind',
   'scope_ref:uuid','dimension:dimension','unit:unit','cap:int','authority_id:uuid','approval_ref_digest:digest','evidence_digest:digest']
  WHEN 'sophia.c2.bound.policy.event.v1' THEN ARRAY['policy_id:uuid','revision:int','event_key:event_key',
   'event_kind:policy_event_kind','authority_id:uuid','approval_ref_digest:digest','evidence_digest:digest']
  WHEN 'sophia.c2.bound.authorize.v1' THEN ARRAY['project_id:uuid','reservation_id:uuid','dispatch_id:uuid','dimension:dimension',
   'unit:unit','bound_kind:bound_kind','bound:int?','enforcement_kind:enforcement_kind?','profile_id:uuid?','profile_revision:int?',
   'policy_set_digest:digest?','unsupported_reason:unsupported_reason?','original_runtime_id:uuid','original_generation:digest?',
   'route_id:ident','model:ident','settings_digest:digest']
  WHEN 'sophia.c2.dispatch.apply.v1' THEN ARRAY['project_id:uuid','reservation_id:uuid','dispatch_id:uuid','attempt_id:uuid',
   'call_id:call_id','runtime_id:uuid','original_generation:digest?','emitter_identity_digest:digest','outbound_params_digest:digest',
   'authorize_set_digest:digest']
  WHEN 'sophia.c2.dispatch.claim.v1' THEN ARRAY['project_id:uuid','reservation_id:uuid','dispatch_id:uuid','runtime_id:uuid',
   'original_generation:digest?','apply_receipt_digest:digest']
  WHEN 'sophia.c2.dispatch.outcome.v1' THEN ARRAY['project_id:uuid','reservation_id:uuid','dispatch_id:uuid',
   'outcome_kind:outcome_kind','evidence_digest:digest','observed_at:timestamp']
 END $$;

-- R2 calendar grammar: YYYY-MM-DDTHH:MM:SS.ffffffZ that is a real UTC instant and re-formats to the identical string.
CREATE FUNCTION sophia.research_c2_instant(p text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' THEN RETURN false; END IF;
 RETURN to_char((p::timestamptz) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')=p;
EXCEPTION WHEN others THEN RETURN false;
END $$;

CREATE FUNCTION sophia.research_c2_grammar(p_grammar text, v text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 RETURN CASE p_grammar
  WHEN 'uuid' THEN v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  WHEN 'int' THEN CASE WHEN v ~ '^(0|[1-9][0-9]{0,9})$' THEN v::bigint<=2147483647 ELSE false END
  WHEN 'digest' THEN v ~ '^[0-9a-f]{64}$'
  WHEN 'ident' THEN v ~ '^[a-z0-9][a-z0-9._:/-]{0,127}$'
  WHEN 'param_name' THEN v ~ '^[a-z][a-z0-9_]{0,63}$'
  WHEN 'event_key' THEN v ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,119}$'
  WHEN 'reason_code' THEN v ~ '^[a-z][a-z0-9_]{0,63}$'
  WHEN 'call_id' THEN v ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  WHEN 'timestamp' THEN sophia.research_c2_instant(v)
  WHEN 'dimension' THEN v IN ('openai.output_tokens','openai.model_requests','openai.input_tokens','openai.input_cached_tokens')
  WHEN 'unit' THEN v IN ('tokens','requests','usd')
  WHEN 'enforcement_kind' THEN v IN ('output_parameter','dispatch_count')
  WHEN 'profile_scope_kind' THEN v IN ('account','project','grant')
  WHEN 'policy_scope_kind' THEN v IN ('project','allowance','account')
  WHEN 'event_kind' THEN v IN ('activate','hold','auto_hold','unhold','revoke','distrust')
  WHEN 'policy_event_kind' THEN v IN ('activate','revoke')
  WHEN 'bound_kind' THEN v IN ('authorized','unsupported')
  WHEN 'unsupported_reason' THEN v IN ('input_estimate_only','no_enforcing_mechanism','route_not_qualified')
  WHEN 'outcome_kind' THEN v IN ('not_sent_after_claim','sent','send_error_before_response')
  ELSE false END;
END $$;

-- Cross-field rules on already-valid values (one fixed code each; nothing of the value is echoed).
CREATE FUNCTION sophia.research_c2_cross(p_domain text, v text[]) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE input_dims text[]:=ARRAY['openai.input_tokens','openai.input_cached_tokens'];
BEGIN
 IF p_domain='sophia.c2.bound.profile.register.v1' THEN
  IF v[3]=ANY(input_dims) THEN RAISE EXCEPTION 'bound_dimension_unsupported' USING ERRCODE='22023'; END IF;
  IF v[4]<>sophia.research_c2_unit_of(v[3]) OR v[2]='0' THEN RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
  IF v[7]='0' THEN RAISE EXCEPTION 'bound_invalid' USING ERRCODE='22023'; END IF;
  IF NOT (CASE WHEN v[5]='output_parameter' THEN v[3]='openai.output_tokens' AND v[6] IS NOT NULL
    ELSE v[3]='openai.model_requests' AND v[6] IS NULL AND v[7]='1' END) THEN
   RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 ELSIF p_domain='sophia.c2.bound.profile.event.v1' THEN
  IF v[3]=ANY(input_dims) THEN RAISE EXCEPTION 'bound_dimension_unsupported' USING ERRCODE='22023'; END IF;
  IF v[2]='0' OR NOT (CASE v[5]
    WHEN 'unhold' THEN v[6] IS NOT NULL AND v[8] IS NOT NULL AND v[9] IS NOT NULL AND v[10] IS NULL
    WHEN 'auto_hold' THEN v[6] IS NULL AND v[8] IS NULL AND v[9] IS NULL AND v[10] IS NOT NULL
    ELSE v[6] IS NULL AND v[8] IS NOT NULL AND v[9] IS NOT NULL AND v[10] IS NULL END) THEN
   RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 ELSIF p_domain='sophia.c2.bound.policy.register.v1' THEN
  IF v[5]=ANY(input_dims) THEN RAISE EXCEPTION 'bound_dimension_unsupported' USING ERRCODE='22023'; END IF;
  IF v[6]<>sophia.research_c2_unit_of(v[5]) THEN RAISE EXCEPTION 'bound_policy_unit_mismatch' USING ERRCODE='22023'; END IF;
  IF v[2]='0' THEN RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
  IF v[7]='0' THEN RAISE EXCEPTION 'bound_invalid' USING ERRCODE='22023'; END IF;
 ELSIF p_domain='sophia.c2.bound.policy.event.v1' THEN
  IF v[2]='0' THEN RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 ELSIF p_domain='sophia.c2.bound.authorize.v1' THEN
  IF v[5]<>sophia.research_c2_unit_of(v[4]) OR NOT (CASE v[6]
    WHEN 'authorized' THEN v[7] IS NOT NULL AND v[8] IS NOT NULL AND v[9] IS NOT NULL AND v[10] IS NOT NULL AND v[12] IS NULL
     AND v[7]<>'0' AND v[10]<>'0' AND NOT v[4]=ANY(input_dims)
     AND (v[8]='output_parameter')=(v[4]='openai.output_tokens') AND (v[8]<>'dispatch_count' OR v[7]='1')
    ELSE v[7] IS NULL AND v[8] IS NULL AND v[9] IS NULL AND v[10] IS NULL AND v[11] IS NULL AND v[12] IS NOT NULL END) THEN
   RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 END IF;
END $$;

-- A closed payload of an append domain, validated in the R2 order, as its TLV values (NULL = typed null).
CREATE FUNCTION sophia.research_c2_payload(p_domain text, p jsonb) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE f text[]:=sophia.research_c2_fields(p_domain); spec text; nm text; gr text; v jsonb; out text[]:='{}'; names text[]:='{}';
BEGIN
 IF f IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 FOREACH spec IN ARRAY f LOOP
  nm:=split_part(spec,':',1); names:=names||nm;
  IF NOT p ? nm THEN RAISE EXCEPTION 'payload_incomplete' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT k=ANY(names)) THEN RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
 FOREACH spec IN ARRAY f LOOP
  nm:=split_part(spec,':',1); gr:=split_part(spec,':',2); v:=p->nm;
  IF jsonb_typeof(v)='null' THEN
   IF right(gr,1)<>'?' THEN RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
   out:=array_append(out,NULL::text);
  ELSIF jsonb_typeof(v)<>'string' OR NOT sophia.research_c2_grammar(rtrim(gr,'?'),v#>>'{}') THEN
   RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023';
  ELSE out:=array_append(out,v#>>'{}'); END IF;
 END LOOP;
 PERFORM sophia.research_c2_cross(p_domain,out);
 RETURN out;
END $$;

-- The values of a domain as its closed JSON object (typed null as JSON null).
CREATE FUNCTION sophia.research_c2_object(p_domain text, v text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_object_agg(split_part(f,':',1),to_jsonb(v[n])) FROM unnest(sophia.research_c2_fields(p_domain)) WITH ORDINALITY x(f,n) $$;

-- The three digest helpers (canonicalizers, not append APIs).
CREATE FUNCTION sophia.research_c2_outbound_digest(p_provider text, p_endpoint text, p_model text, p_settings text, p_emitter text,
 p_items jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_c2_digest('sophia.c2.dispatch.outbound.v1',
  ARRAY[p_provider,p_endpoint,p_model,p_settings,p_emitter,jsonb_array_length(p_items)::text]
  ||coalesce((SELECT array_agg(e ORDER BY i->>0, k) FROM jsonb_array_elements(p_items) i, jsonb_array_elements_text(i) WITH ORDINALITY y(e,k)),'{}'::text[])) $$;
CREATE FUNCTION sophia.research_c2_authorize_set_digest(p_dispatch uuid, p_digests text[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_c2_digest('sophia.c2.bound.authorize.set.v1',
  ARRAY[p_dispatch::text,cardinality(p_digests)::text]||coalesce((SELECT array_agg(d ORDER BY d COLLATE "C") FROM unnest(p_digests) d),'{}'::text[])) $$;
CREATE FUNCTION sophia.research_c2_policy_item(p_register_digest text, p_activate_digest text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to('s64:'||p_register_digest||'s64:'||p_activate_digest,'UTF8')),'hex') $$;
CREATE FUNCTION sophia.research_c2_policy_set_digest(p_dimension text, p_items text[]) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN coalesce(cardinality(p_items),0)=0 THEN NULL ELSE sophia.research_c2_digest('sophia.c2.bound.policy.set.v1',
  ARRAY[p_dimension,cardinality(p_items)::text]||(SELECT array_agg(d ORDER BY d COLLATE "C") FROM unnest(p_items) d)) END $$;

-- --- durable records (private, append-only; dispatch phase monotone) ------------------------------------------------

-- The dedicated C2 operator authority: one exact scope and dimension, approver <> verifier, append-only revocation.
CREATE TABLE sophia.research_bound_authorities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 authority_key text NOT NULL UNIQUE CHECK(authority_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,119}$'),
 kind text NOT NULL CHECK(kind='bound_profile_qualification'),
 scope_kind text NOT NULL CHECK(scope_kind IN ('account','project','grant','allowance')),
 scope_ref uuid NOT NULL,
 dimension text NOT NULL CHECK(dimension IN ('openai.output_tokens','openai.model_requests')),
 approver_ref text NOT NULL CHECK(length(approver_ref) BETWEEN 1 AND 300 AND approver_ref !~ '[[:cntrl:]]'),
 verifier_ref text NOT NULL CHECK(length(verifier_ref) BETWEEN 1 AND 300 AND verifier_ref !~ '[[:cntrl:]]'),
 recorded_by text NOT NULL DEFAULT session_user,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(approver_ref<>verifier_ref)
);
CREATE TABLE sophia.research_bound_authority_revocations (
 authority_id uuid PRIMARY KEY REFERENCES sophia.research_bound_authorities(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300 AND reason !~ '[[:cntrl:]]'),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- One profile revision of one dimension (the lifecycle target L): immutable content.
CREATE TABLE sophia.research_bound_profiles (
 profile_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 dimension text NOT NULL CHECK(dimension IN ('openai.output_tokens','openai.model_requests')),
 unit text NOT NULL CHECK(unit IN ('tokens','requests')),
 enforcement_kind text NOT NULL, param_name text, max_ceiling integer NOT NULL CHECK(max_ceiling>0),
 provider text NOT NULL, route_id text NOT NULL, endpoint text NOT NULL, model text NOT NULL,
 settings_digest text NOT NULL, emitter_identity_digest text NOT NULL, semantics_evidence_digest text NOT NULL,
 isolation_evidence_digest text NOT NULL,
 scope_kind text NOT NULL CHECK(scope_kind IN ('account','project','grant')), scope_ref uuid NOT NULL,
 authority_id uuid NOT NULL REFERENCES sophia.research_bound_authorities(id),
 approval_ref_digest text NOT NULL, evidence_digest text NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(profile_id,revision,dimension),
 CHECK((enforcement_kind='output_parameter' AND dimension='openai.output_tokens' AND param_name IS NOT NULL)
  OR (enforcement_kind='dispatch_count' AND dimension='openai.model_requests' AND param_name IS NULL AND max_ceiling=1))
);
CREATE TABLE sophia.research_bound_profile_events (
 profile_id uuid NOT NULL, revision integer NOT NULL, dimension text NOT NULL,
 event_key text NOT NULL, event_seq integer NOT NULL CHECK(event_seq>0),
 event_kind text NOT NULL CHECK(event_kind IN ('activate','hold','auto_hold','unhold','revoke','distrust')),
 target_event_digest text, reason_code text NOT NULL,
 authority_id uuid REFERENCES sophia.research_bound_authorities(id), approval_ref_digest text, cause_ref_digest text,
 evidence_digest text NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(profile_id,revision,dimension,event_key),
 UNIQUE(profile_id,revision,dimension,event_seq),
 UNIQUE(profile_id,revision,dimension,digest),
 FOREIGN KEY(profile_id,revision,dimension) REFERENCES sophia.research_bound_profiles(profile_id,revision,dimension),
 CHECK((event_kind='auto_hold')=(authority_id IS NULL)), CHECK((event_kind='unhold')=(target_event_digest IS NOT NULL))
);
-- A manual hold is cleared by at most one accepted unhold.
CREATE UNIQUE INDEX research_bound_profile_events_one_unhold ON sophia.research_bound_profile_events(profile_id,revision,dimension,target_event_digest)
 WHERE event_kind='unhold';
CREATE TABLE sophia.research_bound_profile_conflicts (
 profile_id uuid NOT NULL, revision integer NOT NULL, dimension text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('registration','event')), conflict_key text NOT NULL,
 first_digest text NOT NULL CHECK(first_digest ~ '^[0-9a-f]{64}$'), competing_digest text NOT NULL CHECK(competing_digest ~ '^[0-9a-f]{64}$'),
 authority_id uuid NOT NULL REFERENCES sophia.research_bound_authorities(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(profile_id,revision,dimension,kind,conflict_key,competing_digest),
 FOREIGN KEY(profile_id,revision,dimension) REFERENCES sophia.research_bound_profiles(profile_id,revision,dimension),
 CHECK(first_digest<>competing_digest)
);

-- One native-unit policy cap revision (never USD); active only through an accepted activate event.
CREATE TABLE sophia.research_bound_policies (
 policy_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 scope_kind text NOT NULL CHECK(scope_kind IN ('project','allowance','account')), scope_ref uuid NOT NULL,
 dimension text NOT NULL CHECK(dimension IN ('openai.output_tokens','openai.model_requests')),
 unit text NOT NULL CHECK(unit IN ('tokens','requests')), cap integer NOT NULL CHECK(cap>0),
 authority_id uuid NOT NULL REFERENCES sophia.research_bound_authorities(id),
 approval_ref_digest text NOT NULL, evidence_digest text NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(policy_id,revision)
);
CREATE INDEX research_bound_policies_scope ON sophia.research_bound_policies(dimension,scope_kind,scope_ref);
CREATE TABLE sophia.research_bound_policy_events (
 policy_id uuid NOT NULL, revision integer NOT NULL, event_key text NOT NULL, event_seq integer NOT NULL CHECK(event_seq>0),
 event_kind text NOT NULL CHECK(event_kind IN ('activate','revoke')),
 authority_id uuid NOT NULL REFERENCES sophia.research_bound_authorities(id),
 approval_ref_digest text NOT NULL, evidence_digest text NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(policy_id,revision,event_key), UNIQUE(policy_id,revision,event_seq),
 FOREIGN KEY(policy_id,revision) REFERENCES sophia.research_bound_policies(policy_id,revision)
);
CREATE TABLE sophia.research_bound_policy_conflicts (
 policy_id uuid NOT NULL, revision integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('registration','event')), conflict_key text NOT NULL,
 first_digest text NOT NULL, competing_digest text NOT NULL,
 authority_id uuid NOT NULL REFERENCES sophia.research_bound_authorities(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(policy_id,revision,kind,conflict_key,competing_digest),
 FOREIGN KEY(policy_id,revision) REFERENCES sophia.research_bound_policies(policy_id,revision),
 CHECK(first_digest<>competing_digest)
);

-- One server dispatch per tracked opted reservation, shared by all four dimensions; phase monotone.
CREATE TABLE sophia.research_bound_dispatches (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, dispatch_id uuid NOT NULL UNIQUE,
 phase text NOT NULL CHECK(phase IN ('authorized','applied','claimed')),
 profile_id uuid NOT NULL, profile_revision integer NOT NULL, client_request jsonb NOT NULL,
 account_id uuid, grant_id uuid,
 provider text NOT NULL, endpoint text NOT NULL, route_id text NOT NULL, model text NOT NULL, settings_digest text NOT NULL,
 emitter_identity_digest text NOT NULL,
 original_runtime_id uuid NOT NULL, original_generation text CHECK(original_generation ~ '^[0-9a-f]{64}$'),
 authorize_set_digest text NOT NULL CHECK(authorize_set_digest ~ '^[0-9a-f]{64}$'),
 expected_outbound_digest text NOT NULL CHECK(expected_outbound_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_call_identities(project_id,reservation_id)
);
CREATE TABLE sophia.research_bound_authorizations (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 dimension text NOT NULL CHECK(dimension IN ('openai.output_tokens','openai.model_requests','openai.input_tokens','openai.input_cached_tokens')),
 unit text NOT NULL, bound_kind text NOT NULL CHECK(bound_kind IN ('authorized','unsupported')),
 bound integer CHECK(bound>0), enforcement_kind text, profile_id uuid, profile_revision integer,
 policy_set_digest text, policy_items jsonb NOT NULL DEFAULT '[]', unsupported_reason text,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(project_id,reservation_id,dimension),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_bound_dispatches(project_id,reservation_id),
 FOREIGN KEY(profile_id,profile_revision,dimension) REFERENCES sophia.research_bound_profiles(profile_id,revision,dimension),
 CHECK((bound_kind='authorized')=(bound IS NOT NULL AND profile_id IS NOT NULL AND unsupported_reason IS NULL))
);
CREATE TABLE sophia.research_bound_applications (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, dispatch_id uuid NOT NULL,
 runtime_id uuid NOT NULL, payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_bound_dispatches(project_id,reservation_id)
);
CREATE TABLE sophia.research_bound_apply_conflicts (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 first_digest text NOT NULL, competing_digest text NOT NULL, phase_at text NOT NULL CHECK(phase_at IN ('applied','claimed')),
 runtime_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id,competing_digest),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_bound_dispatches(project_id,reservation_id),
 CHECK(first_digest<>competing_digest)
);
CREATE SEQUENCE sophia.research_bound_claim_seq;
CREATE TABLE sophia.research_bound_claims (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, dispatch_id uuid NOT NULL,
 claim_seq bigint NOT NULL UNIQUE DEFAULT nextval('sophia.research_bound_claim_seq'),
 runtime_id uuid NOT NULL, original_generation text, apply_receipt_digest text NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_bound_dispatches(project_id,reservation_id)
);
CREATE TABLE sophia.research_bound_outcomes (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, runtime_id uuid NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_bound_dispatches(project_id,reservation_id)
);
CREATE TABLE sophia.research_bound_outcome_conflicts (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, first_digest text NOT NULL, competing_digest text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id,competing_digest),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_bound_dispatches(project_id,reservation_id),
 CHECK(first_digest<>competing_digest)
);
-- K4: a known count above the authorized bound, per input evidence; sticky. Its keys reach only rows the settle holds.
CREATE TABLE sophia.research_bound_contradictions (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, dimension text NOT NULL,
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
 bound integer NOT NULL, observed_count bigint NOT NULL, CHECK(observed_count>bound),
 profile_id uuid NOT NULL, profile_revision integer NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,reservation_id,dimension,evidence_digest),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id),
 FOREIGN KEY(profile_id,profile_revision,dimension) REFERENCES sophia.research_bound_profiles(profile_id,revision,dimension)
);

CREATE FUNCTION sophia.research_bound_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'Bound records are append-only' USING ERRCODE='55000';
END $$;
-- A dispatch changes only its phase, and only forward: authorized -> applied -> claimed.
CREATE FUNCTION sophia.research_bound_dispatch_phase() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'phase')=(to_jsonb(OLD)-'phase')
    AND ((OLD.phase='authorized' AND NEW.phase='applied') OR (OLD.phase='applied' AND NEW.phase='claimed')) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'A dispatch phase is monotone' USING ERRCODE='55000';
END $$;
CREATE TRIGGER research_bound_dispatches_phase BEFORE UPDATE OR DELETE ON sophia.research_bound_dispatches
 FOR EACH ROW EXECUTE FUNCTION sophia.research_bound_dispatch_phase();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['research_bound_authorities','research_bound_authority_revocations','research_bound_profiles',
   'research_bound_profile_events','research_bound_profile_conflicts','research_bound_policies','research_bound_policy_events',
   'research_bound_policy_conflicts','research_bound_dispatches','research_bound_authorizations','research_bound_applications',
   'research_bound_apply_conflicts','research_bound_claims','research_bound_outcomes','research_bound_outcome_conflicts',
   'research_bound_contradictions'] LOOP
  IF t<>'research_bound_dispatches' THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON sophia.%I FOR EACH ROW EXECUTE FUNCTION sophia.research_bound_frozen()',
    t||'_frozen',t);
  END IF;
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON sophia.%I FOR EACH STATEMENT EXECUTE FUNCTION sophia.research_bound_frozen()',
   t||'_kept',t);
  EXECUTE format('ALTER TABLE sophia.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON sophia.%I FROM PUBLIC, sophia_api, sophia_worker',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
   EXECUTE format('REVOKE ALL ON sophia.%I FROM sophia_conversation_assembler',t); END IF;
 END LOOP;
 REVOKE ALL ON SEQUENCE sophia.research_bound_claim_seq FROM PUBLIC, sophia_api, sophia_worker;
END $$;

-- --- derived lifecycle state ---------------------------------------------------------------------------------------

CREATE FUNCTION sophia.research_bound_profile_state(p_profile uuid, p_revision integer, p_dimension text) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN NOT EXISTS(SELECT 1 FROM sophia.research_bound_profiles p WHERE p.profile_id=p_profile AND p.revision=p_revision AND p.dimension=p_dimension) THEN NULL
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_profile_events e WHERE e.profile_id=p_profile AND e.revision=p_revision
   AND e.dimension=p_dimension AND e.event_kind='distrust') THEN 'distrust'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_profile_events e WHERE e.profile_id=p_profile AND e.revision=p_revision
   AND e.dimension=p_dimension AND e.event_kind='revoke') THEN 'revoke'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_profile_events e WHERE e.profile_id=p_profile AND e.revision=p_revision
   AND e.dimension=p_dimension AND e.event_kind='auto_hold') THEN 'auto_hold'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_profile_conflicts c WHERE c.profile_id=p_profile AND c.revision=p_revision
   AND c.dimension=p_dimension) THEN 'conflicted'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_profile_events h WHERE h.profile_id=p_profile AND h.revision=p_revision
   AND h.dimension=p_dimension AND h.event_kind='hold' AND NOT EXISTS(SELECT 1 FROM sophia.research_bound_profile_events u
    WHERE u.profile_id=h.profile_id AND u.revision=h.revision AND u.dimension=h.dimension AND u.event_kind='unhold'
     AND u.target_event_digest=h.digest)) THEN 'held'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_profile_events e WHERE e.profile_id=p_profile AND e.revision=p_revision
   AND e.dimension=p_dimension AND e.event_kind='activate') THEN 'active'
  ELSE 'inactive' END $$;
CREATE FUNCTION sophia.research_bound_policy_state(p_policy uuid, p_revision integer) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN NOT EXISTS(SELECT 1 FROM sophia.research_bound_policies p WHERE p.policy_id=p_policy AND p.revision=p_revision) THEN NULL
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_policy_events e WHERE e.policy_id=p_policy AND e.revision=p_revision AND e.event_kind='revoke') THEN 'revoke'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_policy_conflicts c WHERE c.policy_id=p_policy AND c.revision=p_revision) THEN 'conflicted'
  WHEN EXISTS(SELECT 1 FROM sophia.research_bound_policy_events e WHERE e.policy_id=p_policy AND e.revision=p_revision AND e.event_kind='activate') THEN 'active'
  ELSE 'inactive' END $$;
-- C01: a policy's canonical activation is its accepted activate with the smallest event_seq.
CREATE FUNCTION sophia.research_bound_policy_activation(p_policy uuid, p_revision integer) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT e.digest FROM sophia.research_bound_policy_events e WHERE e.policy_id=p_policy AND e.revision=p_revision AND e.event_kind='activate'
 ORDER BY e.event_seq LIMIT 1 $$;

-- --- operator custody (migration owner only) -----------------------------------------------------------------------

-- An authority record: an exact repeat of its key returns it; another input under that key is refused.
CREATE FUNCTION sophia.record_research_bound_authority(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.research_bound_authorities; s jsonb:=p_input->'scope'; k text; ap text; ve text;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object'
  OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(p_input) x)
   IS DISTINCT FROM ARRAY['approverRef','authorityKey','dimension','kind','scope','verifierRef','version']
  OR p_input->>'version' IS DISTINCT FROM 'research-bound-authority-v1' OR p_input->>'kind' IS DISTINCT FROM 'bound_profile_qualification'
  OR jsonb_typeof(s) IS DISTINCT FROM 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(s) x) IS DISTINCT FROM ARRAY['kind','ref']
  OR NOT coalesce(sophia.research_c2_grammar('event_key',p_input->>'authorityKey'),false)
  OR coalesce(s->>'kind','') NOT IN ('account','project','grant','allowance') OR NOT coalesce(sophia.research_c2_grammar('uuid',s->>'ref'),false)
  OR coalesce(p_input->>'dimension','') NOT IN ('openai.output_tokens','openai.model_requests')
  OR jsonb_typeof(p_input->'approverRef') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'verifierRef') IS DISTINCT FROM 'string'
  OR length(p_input->>'approverRef') NOT BETWEEN 1 AND 300 OR length(p_input->>'verifierRef') NOT BETWEEN 1 AND 300
  OR p_input->>'approverRef' ~ '[[:cntrl:]]' OR p_input->>'verifierRef' ~ '[[:cntrl:]]'
  OR p_input->>'approverRef'=p_input->>'verifierRef' THEN
  RAISE EXCEPTION 'Invalid bound authority input' USING ERRCODE='22023'; END IF;
 k:=p_input->>'authorityKey'; ap:=p_input->>'approverRef'; ve:=p_input->>'verifierRef';
 SELECT * INTO a FROM sophia.research_bound_authorities WHERE authority_key=k;
 IF FOUND THEN
  IF a.scope_kind=s->>'kind' AND a.scope_ref=(s->>'ref')::uuid AND a.dimension=p_input->>'dimension' AND a.approver_ref=ap AND a.verifier_ref=ve THEN
   RETURN jsonb_build_object('authorityId',a.id,'kind',a.kind,'replay',true); END IF;
  RAISE EXCEPTION 'Authority key reused for another authority' USING ERRCODE='23505';
 END IF;
 INSERT INTO sophia.research_bound_authorities(authority_key,kind,scope_kind,scope_ref,dimension,approver_ref,verifier_ref)
 VALUES(k,'bound_profile_qualification',s->>'kind',(s->>'ref')::uuid,p_input->>'dimension',ap,ve) RETURNING * INTO a;
 RETURN jsonb_build_object('authorityId',a.id,'kind',a.kind,'replay',false);
END $$;
-- Revocation takes the authority row FOR UPDATE: an action holding it FOR SHARE commits first, or sees the revocation.
CREATE FUNCTION sophia.revoke_research_bound_authority(p_authority uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM 1 FROM sophia.research_bound_authorities WHERE id=p_authority FOR UPDATE;
 IF NOT FOUND OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 300 OR p_reason ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'Invalid bound authority revocation' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.research_bound_authority_revocations(authority_id,reason) VALUES(p_authority,p_reason) ON CONFLICT DO NOTHING;
END $$;
-- The CURRENT action authority, read after the target row's lock: kind, exact scope and dimension, unrevoked now.
CREATE FUNCTION sophia.research_bound_authority_check(p_authority uuid, p_scope_kind text, p_scope_ref uuid, p_dimension text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.research_bound_authorities;
BEGIN
 SELECT * INTO a FROM sophia.research_bound_authorities WHERE id=p_authority FOR SHARE;
 IF NOT FOUND OR a.kind<>'bound_profile_qualification' OR a.scope_kind<>p_scope_kind OR a.scope_ref<>p_scope_ref
    OR a.dimension<>p_dimension OR EXISTS(SELECT 1 FROM sophia.research_bound_authority_revocations v WHERE v.authority_id=p_authority) THEN
  RAISE EXCEPTION 'bound_authority_refused' USING ERRCODE='42501'; END IF;
END $$;

-- A profile revision of one dimension. First registration: its row (locked by its own insert), then the authority; an
-- exact repeat returns the stored receipt; an authorized competing payload is a sticky conflict, never an update.
CREATE FUNCTION sophia.register_research_bound_profile(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.bound.profile.register.v1'; v text[]:=sophia.research_c2_payload(dom,p_input);
 dg text:=sophia.research_c2_digest(dom,v); x sophia.research_bound_profiles;
BEGIN
 INSERT INTO sophia.research_bound_profiles(profile_id,revision,dimension,unit,enforcement_kind,param_name,max_ceiling,provider,route_id,
  endpoint,model,settings_digest,emitter_identity_digest,semantics_evidence_digest,isolation_evidence_digest,scope_kind,scope_ref,
  authority_id,approval_ref_digest,evidence_digest,payload,digest)
 SELECT v[1]::uuid,v[2]::integer,v[3],v[4],v[5],v[6],v[7]::integer,v[8],v[9],v[10],v[11],v[12],v[13],v[14],v[15],v[16],v[17]::uuid,
  v[18]::uuid,v[19],v[20],sophia.research_c2_object(dom,v),dg
 WHERE EXISTS(SELECT 1 FROM sophia.research_bound_authorities a WHERE a.id=v[18]::uuid)
 ON CONFLICT (profile_id,revision,dimension) DO NOTHING RETURNING * INTO x;
 IF FOUND THEN -- a first registration: its authority, now (no authority: the insert rolls back with the refusal)
  PERFORM sophia.research_bound_authority_check(v[18]::uuid,v[16],v[17]::uuid,v[3]);
  RETURN jsonb_build_object('profileId',x.profile_id,'revision',x.revision,'dimension',x.dimension,'digest',x.digest,'replay',false);
 END IF;
 SELECT * INTO x FROM sophia.research_bound_profiles WHERE profile_id=v[1]::uuid AND revision=v[2]::integer AND dimension=v[3] FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'bound_authority_refused' USING ERRCODE='42501'; END IF; -- an unknown authority id
 IF x.digest=dg THEN
  RETURN jsonb_build_object('profileId',x.profile_id,'revision',x.revision,'dimension',x.dimension,'digest',x.digest,'replay',true);
 END IF;
 -- R1 (finding A): the STORED target's first scope binds the action, before any conflict effect. A payload naming
 -- another scope, or an authority of another scope, is refused like no authority (no row, no conflict, no digest).
 IF v[16] IS DISTINCT FROM x.scope_kind OR v[17]::uuid IS DISTINCT FROM x.scope_ref THEN
  RAISE EXCEPTION 'bound_authority_refused' USING ERRCODE='42501'; END IF;
 PERFORM sophia.research_bound_authority_check(v[18]::uuid,x.scope_kind,x.scope_ref,x.dimension);
 INSERT INTO sophia.research_bound_profile_conflicts(profile_id,revision,dimension,kind,conflict_key,first_digest,competing_digest,authority_id)
 VALUES(x.profile_id,x.revision,x.dimension,'registration','',x.digest,dg,v[18]::uuid) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('profileId',x.profile_id,'revision',x.revision,'dimension',x.dimension,'conflict',true,
  'firstDigest',x.digest,'competingDigest',dg);
END $$;

-- One lifecycle event of one triple L, under L FOR UPDATE then its CURRENT authority. event_seq is a server receipt.
CREATE FUNCTION sophia.record_research_bound_profile_event(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.bound.profile.event.v1'; v text[]:=sophia.research_c2_payload(dom,p_input);
 dg text:=sophia.research_c2_digest(dom,v); x sophia.research_bound_profiles; e sophia.research_bound_profile_events; n integer;
BEGIN
 IF v[5]='auto_hold' THEN RAISE EXCEPTION 'lifecycle_auto_hold_writer_only' USING ERRCODE='42501'; END IF;
 SELECT * INTO x FROM sophia.research_bound_profiles WHERE profile_id=v[1]::uuid AND revision=v[2]::integer AND dimension=v[3] FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lifecycle_target_unknown' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM sophia.research_bound_profile_events WHERE profile_id=x.profile_id AND revision=x.revision AND dimension=x.dimension
  AND event_key=v[4];
 IF FOUND AND e.digest=dg THEN
  RETURN jsonb_build_object('eventSeq',e.event_seq,'eventKey',e.event_key,'eventKind',e.event_kind,'targetEventDigest',e.target_event_digest,
   'digest',e.digest,'replay',true);
 END IF;
 PERFORM sophia.research_bound_authority_check(v[8]::uuid,x.scope_kind,x.scope_ref,x.dimension);
 IF e.event_key IS NOT NULL THEN -- the same key, another payload: an authorized sticky conflict
  INSERT INTO sophia.research_bound_profile_conflicts(profile_id,revision,dimension,kind,conflict_key,first_digest,competing_digest,authority_id)
  VALUES(x.profile_id,x.revision,x.dimension,'event',v[4],e.digest,dg,v[8]::uuid) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('eventKey',v[4],'conflict',true,'firstDigest',e.digest,'competingDigest',dg);
 END IF;
 IF v[5]='unhold' THEN
  IF NOT EXISTS(SELECT 1 FROM sophia.research_bound_profile_events h WHERE h.profile_id=x.profile_id AND h.revision=x.revision
    AND h.dimension=x.dimension AND h.event_kind='hold' AND h.digest=v[6]) THEN
   RAISE EXCEPTION 'lifecycle_target_invalid' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM sophia.research_bound_profile_events u WHERE u.profile_id=x.profile_id AND u.revision=x.revision
    AND u.dimension=x.dimension AND u.event_kind='unhold' AND u.target_event_digest=v[6]) THEN
   RAISE EXCEPTION 'lifecycle_target_already_cleared' USING ERRCODE='55000'; END IF;
 END IF;
 SELECT coalesce(max(event_seq),0)+1 INTO n FROM sophia.research_bound_profile_events
  WHERE profile_id=x.profile_id AND revision=x.revision AND dimension=x.dimension;
 INSERT INTO sophia.research_bound_profile_events(profile_id,revision,dimension,event_key,event_seq,event_kind,target_event_digest,reason_code,
  authority_id,approval_ref_digest,cause_ref_digest,evidence_digest,payload,digest)
 VALUES(x.profile_id,x.revision,x.dimension,v[4],n,v[5],v[6],v[7],v[8]::uuid,v[9],v[10],v[11],sophia.research_c2_object(dom,v),dg)
 RETURNING * INTO e;
 RETURN jsonb_build_object('eventSeq',e.event_seq,'eventKey',e.event_key,'eventKind',e.event_kind,'targetEventDigest',e.target_event_digest,
  'digest',e.digest,'replay',false);
END $$;

-- A native-unit policy cap revision (never active by registration alone); the same custody as a profile.
CREATE FUNCTION sophia.register_research_bound_policy(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.bound.policy.register.v1'; v text[]:=sophia.research_c2_payload(dom,p_input);
 dg text:=sophia.research_c2_digest(dom,v); x sophia.research_bound_policies;
BEGIN
 INSERT INTO sophia.research_bound_policies(policy_id,revision,scope_kind,scope_ref,dimension,unit,cap,authority_id,approval_ref_digest,
  evidence_digest,payload,digest)
 SELECT v[1]::uuid,v[2]::integer,v[3],v[4]::uuid,v[5],v[6],v[7]::integer,v[8]::uuid,v[9],v[10],sophia.research_c2_object(dom,v),dg
 WHERE EXISTS(SELECT 1 FROM sophia.research_bound_authorities a WHERE a.id=v[8]::uuid)
 ON CONFLICT (policy_id,revision) DO NOTHING RETURNING * INTO x;
 IF FOUND THEN
  PERFORM sophia.research_bound_authority_check(v[8]::uuid,v[3],v[4]::uuid,v[5]);
  RETURN jsonb_build_object('policyId',x.policy_id,'revision',x.revision,'digest',x.digest,'replay',false);
 END IF;
 SELECT * INTO x FROM sophia.research_bound_policies WHERE policy_id=v[1]::uuid AND revision=v[2]::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'bound_authority_refused' USING ERRCODE='42501'; END IF;
 IF x.digest=dg THEN RETURN jsonb_build_object('policyId',x.policy_id,'revision',x.revision,'digest',x.digest,'replay',true); END IF;
 -- R1 (finding A): the STORED revision's first scope and dimension bind the action, before any conflict effect.
 IF v[3] IS DISTINCT FROM x.scope_kind OR v[4]::uuid IS DISTINCT FROM x.scope_ref OR v[5] IS DISTINCT FROM x.dimension THEN
  RAISE EXCEPTION 'bound_authority_refused' USING ERRCODE='42501'; END IF;
 PERFORM sophia.research_bound_authority_check(v[8]::uuid,x.scope_kind,x.scope_ref,x.dimension);
 INSERT INTO sophia.research_bound_policy_conflicts(policy_id,revision,kind,conflict_key,first_digest,competing_digest,authority_id)
 VALUES(x.policy_id,x.revision,'registration','',x.digest,dg,v[8]::uuid) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('policyId',x.policy_id,'revision',x.revision,'conflict',true,'firstDigest',x.digest,'competingDigest',dg);
END $$;

CREATE FUNCTION sophia.record_research_bound_policy_event(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.bound.policy.event.v1'; v text[]:=sophia.research_c2_payload(dom,p_input);
 dg text:=sophia.research_c2_digest(dom,v); x sophia.research_bound_policies; e sophia.research_bound_policy_events; n integer;
BEGIN
 SELECT * INTO x FROM sophia.research_bound_policies WHERE policy_id=v[1]::uuid AND revision=v[2]::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lifecycle_target_unknown' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM sophia.research_bound_policy_events WHERE policy_id=x.policy_id AND revision=x.revision AND event_key=v[3];
 IF FOUND AND e.digest=dg THEN
  RETURN jsonb_build_object('eventSeq',e.event_seq,'eventKey',e.event_key,'eventKind',e.event_kind,'digest',e.digest,'replay',true);
 END IF;
 PERFORM sophia.research_bound_authority_check(v[5]::uuid,x.scope_kind,x.scope_ref,x.dimension);
 IF e.event_key IS NOT NULL THEN
  INSERT INTO sophia.research_bound_policy_conflicts(policy_id,revision,kind,conflict_key,first_digest,competing_digest,authority_id)
  VALUES(x.policy_id,x.revision,'event',v[3],e.digest,dg,v[5]::uuid) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('eventKey',v[3],'conflict',true,'firstDigest',e.digest,'competingDigest',dg);
 END IF;
 SELECT coalesce(max(event_seq),0)+1 INTO n FROM sophia.research_bound_policy_events WHERE policy_id=x.policy_id AND revision=x.revision;
 INSERT INTO sophia.research_bound_policy_events(policy_id,revision,event_key,event_seq,event_kind,authority_id,approval_ref_digest,
  evidence_digest,payload,digest)
 VALUES(x.policy_id,x.revision,v[3],n,v[4],v[5]::uuid,v[6],v[7],sophia.research_c2_object(dom,v),dg) RETURNING * INTO e;
 RETURN jsonb_build_object('eventSeq',e.event_seq,'eventKey',e.event_key,'eventKind',e.event_kind,'digest',e.digest,'replay',false);
END $$;

-- --- the reserve: pre-gate plan (AS-FP01) and fresh rows after the identity -----------------------------------------

-- The applicable policy revisions of a reservation scope (project, allowance, account) and dimensions, FOR SHARE in
-- (policy_id, revision) order, resolved from their FIRST immutable registration BEFORE any filtering (C02):
-- {conflicted, items: {dimension: [{item, cap}]}}. Only derived-active revisions are items. R1 (finding B): ANY sticky
-- authorized conflict of an applicable revision refuses, read from the conflict rows BEFORE the derived state: a revoked
-- revision that also carries a conflict is never filtered into a no-cap fallback (revoke stays terminal and never caps).
CREATE FUNCTION sophia.research_bound_policy_lock(p_project uuid, p_allowance uuid, p_account uuid, p_dims text[]) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE y sophia.research_bound_policies; st text; conflicted boolean:=false; items jsonb:='{}';
BEGIN
 FOR y IN SELECT * FROM sophia.research_bound_policies p WHERE p.dimension=ANY(p_dims)
   AND ((p.scope_kind='project' AND p.scope_ref=p_project) OR (p.scope_kind='allowance' AND p.scope_ref=p_allowance)
    OR (p.scope_kind='account' AND p.scope_ref=p_account))
   ORDER BY p.policy_id, p.revision FOR SHARE LOOP
  st:=sophia.research_bound_policy_state(y.policy_id,y.revision);
  IF EXISTS(SELECT 1 FROM sophia.research_bound_policy_conflicts c WHERE c.policy_id=y.policy_id AND c.revision=y.revision)
  THEN conflicted:=true;
  ELSIF st='active' THEN
   items:=jsonb_set(items,ARRAY[y.dimension],coalesce(items->y.dimension,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'item',sophia.research_c2_policy_item(y.digest,sophia.research_bound_policy_activation(y.policy_id,y.revision)),'cap',y.cap,
    'policyId',y.policy_id,'revision',y.revision)));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('conflicted',conflicted,'items',items);
END $$;

-- The bound plan of a NEW tracked opted model call, before the gate: the profile rows (FOR SHARE, dimension order), then
-- the applicable policy rows; every refusal here happens before any effect. R1 (C02 shared lineage): the account and
-- grant are the ORIGINAL funding binding as the maintained server resolver gives it (sophia.research_call_binding, 0109:
-- the job's own contribution task, else a refusal for an unbound contributed lineage, else its allowance's lineage
-- binding; STABLE, plain reads, no lock), never a caller value, never a project payer assumed from a missing task. The
-- gate resolves the same binding afterwards and the reserve refuses unless the funding it judged is this one.
CREATE FUNCTION sophia.research_bound_prepare(p_project uuid, p_allowance uuid, p_job uuid, p_binding uuid, p_route text,
 p_tracked jsonb, p_provider text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE pid uuid:=(p_tracked->'boundProfile'->>'profileId')::uuid; rev integer:=(p_tracked->'boundProfile'->>'revision')::integer;
 d jsonb:=p_tracked->'declared'; acc uuid; gr uuid; x sophia.research_bound_profiles; first sophia.research_bound_profiles;
 profiles jsonb:='[]'; dims text[]:='{}'; pol jsonb; dims_out jsonb:='{}'; e jsonb; caps integer; items text[]; res uuid;
 fb sophia.api_contribution_tasks; -- the funding binding (not the bindings alias b)
BEGIN
 fb:=sophia.research_call_binding(p_project,p_allowance,p_job); acc:=fb.account_id; gr:=fb.grant_id;
 FOR x IN SELECT * FROM sophia.research_bound_profiles p WHERE p.profile_id=pid AND p.revision=rev ORDER BY p.dimension FOR SHARE LOOP
  IF first.profile_id IS NULL THEN first:=x;
  ELSIF (x.provider,x.endpoint,x.route_id,x.model,x.settings_digest,x.emitter_identity_digest,x.scope_kind,x.scope_ref)
     IS DISTINCT FROM (first.provider,first.endpoint,first.route_id,first.model,first.settings_digest,first.emitter_identity_digest,
      first.scope_kind,first.scope_ref) THEN
   RAISE EXCEPTION 'bound_profile_route_mismatch' USING ERRCODE='22023'; END IF;
  IF sophia.research_bound_profile_state(x.profile_id,x.revision,x.dimension) IS DISTINCT FROM 'active' THEN
   RAISE EXCEPTION 'bound_profile_inactive' USING ERRCODE='55000'; END IF;
  dims:=dims||x.dimension;
  profiles:=profiles||jsonb_build_array(jsonb_build_object('dimension',x.dimension,'enforcement',x.enforcement_kind,'param',x.param_name,
   'ceiling',x.max_ceiling));
 END LOOP;
 IF first.profile_id IS NULL THEN RAISE EXCEPTION 'bound_profile_unknown' USING ERRCODE='22023'; END IF;
 IF first.provider IS DISTINCT FROM p_provider OR first.route_id IS DISTINCT FROM p_route OR first.route_id IS DISTINCT FROM d->>'routeId'
    OR first.model IS DISTINCT FROM d->>'model' THEN
  RAISE EXCEPTION 'bound_route_mismatch' USING ERRCODE='22023'; END IF;
 IF NOT coalesce(CASE first.scope_kind WHEN 'project' THEN first.scope_ref=p_project WHEN 'account' THEN first.scope_ref=acc
    WHEN 'grant' THEN first.scope_ref=gr END,false) THEN
  RAISE EXCEPTION 'bound_profile_scope_mismatch' USING ERRCODE='42501'; END IF;
 pol:=sophia.research_bound_policy_lock(p_project,p_allowance,acc,dims);
 IF (pol->>'conflicted')::boolean THEN RAISE EXCEPTION 'bound_policy_conflicted' USING ERRCODE='55000'; END IF;
 FOR e IN SELECT * FROM jsonb_array_elements(profiles) LOOP
  SELECT min((c->>'cap')::integer), array_agg(c->>'item') INTO caps, items FROM jsonb_array_elements(pol->'items'->(e->>'dimension')) c;
  dims_out:=dims_out||jsonb_build_object(e->>'dimension',jsonb_build_object('enforcement',e->>'enforcement','param',e->>'param',
   'bound',least((e->>'ceiling')::integer,caps),'policySet',sophia.research_c2_policy_set_digest(e->>'dimension',items),
   'policyItems',coalesce(pol->'items'->(e->>'dimension'),'[]'::jsonb)));
 END LOOP;
 SELECT b.resource_id INTO res FROM sophia.execution_bindings b WHERE b.project_id=p_project AND b.id=p_binding;
 RETURN jsonb_build_object('profileId',first.profile_id,'revision',first.revision,'account',acc,'grant',gr,
  'generation',sophia.contribution_runtime_generation(p_project,res),'provider',first.provider,'endpoint',first.endpoint,
  'route',first.route_id,'model',first.model,'settings',first.settings_digest,'emitter',first.emitter_identity_digest,
  'client',p_tracked->'boundProfile','dims',dims_out);
END $$;

-- The fresh rows of an opted reservation, after its identity: one dispatch and its four authorize rows (stored for every
-- replay). The original funding the gate judged must be the scope the plan was locked under.
CREATE FUNCTION sophia.research_bound_record(p_project uuid, p_runtime uuid, r sophia.research_reservations, p jsonb, p_fund jsonb)
RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.bound.authorize.v1'; did uuid:=gen_random_uuid(); dim text; e jsonb; v text[]; dg text;
 digs text[]:='{}'; rws jsonb:='[]'; items jsonb:='[]';
BEGIN
 IF (p_fund->>'accountId') IS DISTINCT FROM (p->>'account') OR (p_fund->>'grantId') IS DISTINCT FROM (p->>'grant') THEN
  RAISE EXCEPTION 'bound_profile_scope_mismatch' USING ERRCODE='42501'; END IF;
 FOREACH dim IN ARRAY ARRAY['openai.input_cached_tokens','openai.input_tokens','openai.model_requests','openai.output_tokens'] LOOP
  e:=p->'dims'->dim;
  v:=ARRAY[p_project::text,r.id::text,did::text,dim,sophia.research_c2_unit_of(dim),
   CASE WHEN e IS NULL THEN 'unsupported' ELSE 'authorized' END,e->>'bound',e->>'enforcement',
   CASE WHEN e IS NOT NULL THEN p->>'profileId' END,CASE WHEN e IS NOT NULL THEN p->>'revision' END,e->>'policySet',
   CASE WHEN e IS NOT NULL THEN NULL WHEN dim='openai.input_tokens' THEN 'input_estimate_only'
    WHEN dim='openai.input_cached_tokens' THEN 'no_enforcing_mechanism' ELSE 'route_not_qualified' END,
   p_runtime::text,p->>'generation',p->>'route',p->>'model',p->>'settings'];
  PERFORM sophia.research_c2_cross(dom,v);
  dg:=sophia.research_c2_digest(dom,v); digs:=digs||dg;
  rws:=rws||jsonb_build_array(jsonb_build_object('v',to_jsonb(v),'digest',dg,'items',coalesce(e->'policyItems','[]'::jsonb)));
  IF e->>'enforcement'='output_parameter' THEN items:=items||jsonb_build_array(jsonb_build_array(dim,e->>'param',e->>'bound')); END IF;
 END LOOP;
 INSERT INTO sophia.research_bound_dispatches(project_id,reservation_id,dispatch_id,phase,profile_id,profile_revision,client_request,
  account_id,grant_id,provider,endpoint,route_id,model,settings_digest,emitter_identity_digest,original_runtime_id,original_generation,
  authorize_set_digest,expected_outbound_digest)
 VALUES(p_project,r.id,did,'authorized',(p->>'profileId')::uuid,(p->>'revision')::integer,p->'client',(p->>'account')::uuid,
  (p->>'grant')::uuid,p->>'provider',p->>'endpoint',p->>'route',p->>'model',p->>'settings',p->>'emitter',p_runtime,p->>'generation',
  sophia.research_c2_authorize_set_digest(did,digs),
  sophia.research_c2_outbound_digest(p->>'provider',p->>'endpoint',p->>'model',p->>'settings',p->>'emitter',items));
 INSERT INTO sophia.research_bound_authorizations(project_id,reservation_id,dimension,unit,bound_kind,bound,enforcement_kind,profile_id,
  profile_revision,policy_set_digest,policy_items,unsupported_reason,payload,digest)
 SELECT p_project,r.id,x->'v'->>3,x->'v'->>4,x->'v'->>5,(x->'v'->>6)::integer,x->'v'->>7,(x->'v'->>8)::uuid,(x->'v'->>9)::integer,
  x->'v'->>10,x->'items',x->'v'->>11,
  sophia.research_c2_object(dom,ARRAY(SELECT y.val FROM jsonb_array_elements_text(x->'v') WITH ORDINALITY y(val,ord) ORDER BY y.ord)),x->>'digest'
 FROM jsonb_array_elements(rws) x;
END $$;

-- The stored bounds of an opted reservation, as its reply carries them (stored rows only; never recomputed).
CREATE FUNCTION sophia.research_bound_reply(p_project uuid, p_reservation uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('dispatchId',d.dispatch_id,'profileId',d.profile_id,'profileRevision',d.profile_revision::text,
  'authorizeSetDigest',d.authorize_set_digest,'originalGeneration',d.original_generation,
  'items',(SELECT jsonb_agg(jsonb_build_object('dimension',a.dimension,'unit',a.unit,'boundKind',a.bound_kind,'bound',a.bound::text,
    'enforcementKind',a.enforcement_kind,'policySetDigest',a.policy_set_digest,'unsupportedReason',a.unsupported_reason,
    'authorizeDigest',a.digest) ORDER BY a.dimension)
   FROM sophia.research_bound_authorizations a WHERE a.project_id=d.project_id AND a.reservation_id=d.reservation_id))
 FROM sophia.research_bound_dispatches d WHERE d.project_id=p_project AND d.reservation_id=p_reservation $$;

-- A boundProfile reference: exactly {profileId, revision}. A caller number (a bound, a ceiling, maxTokens) is never one.
CREATE FUNCTION sophia.research_bound_profile_ref(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'bound_profile_invalid' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('profileId','revision')) THEN
  RAISE EXCEPTION 'bound_caller_supplied' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'profileId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'revision') IS DISTINCT FROM 'string'
    OR NOT sophia.research_c2_grammar('uuid',p->>'profileId') OR NOT sophia.research_c2_grammar('int',p->>'revision') OR p->>'revision'='0' THEN
  RAISE EXCEPTION 'bound_profile_invalid' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('profileId',p->'profileId','revision',p->'revision');
END $$;

-- --- the dispatch: apply, claim, outcome (runtime entries; migration owner only in this inactive slice) -------------

-- The bound's profile rows of a dispatch, FOR SHARE in dimension order; true when every one is derived-active now.
CREATE FUNCTION sophia.research_bound_dispatch_profiles(p_project uuid, p_reservation uuid) RETURNS boolean LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE x record; ok boolean:=true;
BEGIN
 FOR x IN SELECT p.profile_id,p.revision,p.dimension FROM sophia.research_bound_authorizations a JOIN sophia.research_bound_profiles p
   ON p.profile_id=a.profile_id AND p.revision=a.profile_revision AND p.dimension=a.dimension
   WHERE a.project_id=p_project AND a.reservation_id=p_reservation AND a.bound_kind='authorized' ORDER BY p.dimension FOR SHARE OF p LOOP
  ok:=ok AND coalesce(sophia.research_bound_profile_state(x.profile_id,x.revision,x.dimension)='active',false);
 END LOOP;
 RETURN ok;
END $$;
CREATE FUNCTION sophia.research_bound_dispatch_dims(p_project uuid, p_reservation uuid) RETURNS text[] LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(a.dimension ORDER BY a.dimension),'{}') FROM sophia.research_bound_authorizations a
 WHERE a.project_id=p_project AND a.reservation_id=p_reservation AND a.bound_kind='authorized' $$;
-- Emitter consistency (not proof): the original runtime's server-stored lease roles claim exactly the profile's emitter.
CREATE FUNCTION sophia.research_bound_emitter_consistent(p_runtime uuid, p_route text, p_emitter text) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.runtime_instances rt, jsonb_array_elements(coalesce(rt.roles,'[]'::jsonb)) r
  WHERE rt.id=p_runtime AND r->>'route'=p_route AND r->'executor'->>'execution'='service' AND r->'executor'->>'routeId'=p_route
   AND r->'executor'->>'executorArtifactDigest'=p_emitter) $$;
-- The request of a dispatch operation: the caller's attempt and session (scope), and one payload.
CREATE FUNCTION sophia.research_bound_request(p_request jsonb, p_member text) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k)
     FROM unnest(ARRAY['attemptId','nativeSessionId',p_member]) k) THEN
  RAISE EXCEPTION 'payload_invalid' USING ERRCODE='22023'; END IF;
END $$;
-- The common prefix of apply and claim: the identity the caller's scope owns (R2: its project, allowance, attempt and
-- native session, and the operation of the entry point, which must equal the reservation's immutable identity
-- operation), then the locks in order: allowance, the bound's profile rows, its applicable policy rows, the dispatch (all
-- after the scope's project, runtime and goal). {active, policyConflicted} are read after those waits.
CREATE FUNCTION sophia.research_bound_dispatch_lock(p_op text, p_project uuid, p_allowance uuid, p_attempt uuid, p_session text,
 p_reservation uuid) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE d sophia.research_bound_dispatches; i sophia.research_call_identities; act boolean; pc boolean;
BEGIN
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=p_project AND id=p_allowance FOR UPDATE;
 SELECT * INTO d FROM sophia.research_bound_dispatches WHERE project_id=p_project AND reservation_id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch_unknown' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=p_reservation;
 IF i.allowance_id<>p_allowance OR i.attempt_id<>p_attempt OR i.native_session_id<>p_session OR i.operation IS DISTINCT FROM p_op THEN
  RAISE EXCEPTION 'bound_identity_mismatch' USING ERRCODE='42501'; END IF;
 act:=sophia.research_bound_dispatch_profiles(p_project,p_reservation);
 pc:=(sophia.research_bound_policy_lock(p_project,p_allowance,d.account_id,
  sophia.research_bound_dispatch_dims(p_project,p_reservation))->>'conflicted')::boolean;
 PERFORM 1 FROM sophia.research_bound_dispatches WHERE project_id=p_project AND reservation_id=p_reservation FOR UPDATE;
 RETURN jsonb_build_object('active',act,'policyConflicted',pc);
END $$;

-- R2: the post-last-wait fence of the entry point's OWN maintained scope (Stop, Hold, epoch, task and session state),
-- re-run with p_fence. Design uses the maintained reserve's own p_kind (NULL: a design or design-review job).
CREATE FUNCTION sophia.research_bound_fence(p_op text, p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_op='research' THEN PERFORM sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 ELSIF p_op='design' THEN PERFORM sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,true);
 ELSIF p_op='source_review' THEN PERFORM sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 ELSE RAISE EXCEPTION 'bound_identity_mismatch' USING ERRCODE='42501'; END IF;
END $$;

-- apply: the emitter's commitment to the server-derived expected outbound preimage. A receipt only, never send authority.
-- R2: the shared core over the entry point's scope values and operation (research, design or source review).
CREATE FUNCTION sophia.research_bound_apply_core(p_op text, p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb,
 p_project uuid, p_runtime uuid, p_allowance uuid, p_attempt uuid, p_session text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.dispatch.apply.v1'; v text[]; dg text; k jsonb; d sophia.research_bound_dispatches; i sophia.research_call_identities;
 ap sophia.research_bound_applications; r sophia.research_reservations;
BEGIN
 PERFORM sophia.research_bound_request(p_request,'apply');
 v:=sophia.research_c2_payload(dom,p_request->'apply'); dg:=sophia.research_c2_digest(dom,v);
 IF v[1]::uuid<>p_project THEN RAISE EXCEPTION 'bound_identity_mismatch' USING ERRCODE='42501'; END IF;
 k:=sophia.research_bound_dispatch_lock(p_op,p_project,p_allowance,p_attempt,p_session,v[2]::uuid);
 SELECT * INTO d FROM sophia.research_bound_dispatches WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 IF i.runtime_id<>p_runtime THEN RAISE EXCEPTION 'dispatch_runtime_revoked' USING ERRCODE='55000'; END IF;
 IF v[3]::uuid<>d.dispatch_id OR v[4]::uuid<>i.attempt_id OR v[5]<>i.call_id OR v[6]::uuid<>i.runtime_id THEN
  RAISE EXCEPTION 'bound_identity_mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO ap FROM sophia.research_bound_applications WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 IF FOUND THEN
  IF ap.digest=dg THEN -- an exact replay, any phase: the original receipt, never permission, never re-validated
   RETURN jsonb_build_object('dispatchId',ap.dispatch_id,'applyReceiptDigest',ap.digest,'phase',d.phase,'replay',true,'sendPermitted',false);
  END IF;
  INSERT INTO sophia.research_bound_apply_conflicts(project_id,reservation_id,first_digest,competing_digest,phase_at,runtime_id)
  VALUES(p_project,v[2]::uuid,ap.digest,dg,d.phase,p_runtime) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('dispatchId',ap.dispatch_id,'conflict',true,'applyConflicted',true,'phase',d.phase,
   'firstDigest',ap.digest,'competingDigest',dg,'sendPermitted',false);
 END IF;
 -- A first apply: the scope fence (Stop, hold, epoch) and every live check, after the last wait.
 PERFORM sophia.research_bound_fence(p_op,p_token_sha256,p_unit,p_bridge,p_request);
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=v[2]::uuid;
 IF r.state<>'reserved' THEN RAISE EXCEPTION 'bound_reservation_not_open' USING ERRCODE='55000'; END IF;
 IF NOT (k->>'active')::boolean THEN RAISE EXCEPTION 'bound_profile_inactive' USING ERRCODE='55000'; END IF;
 IF (k->>'policyConflicted')::boolean THEN RAISE EXCEPTION 'bound_policy_conflicted' USING ERRCODE='55000'; END IF;
 IF sophia.contribution_runtime_generation(p_project,i.resource_id) IS DISTINCT FROM d.original_generation THEN
  RAISE EXCEPTION 'dispatch_runtime_revoked' USING ERRCODE='55000'; END IF;
 -- C03: any inequality against the server's own values is one generic refusal, naming no field.
 IF v[7] IS DISTINCT FROM d.original_generation OR v[8]<>d.emitter_identity_digest OR v[9]<>d.expected_outbound_digest
    OR v[10]<>d.authorize_set_digest THEN
  RAISE EXCEPTION 'bound_param_mismatch' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.research_bound_applications(project_id,reservation_id,dispatch_id,runtime_id,payload,digest)
 VALUES(p_project,v[2]::uuid,d.dispatch_id,p_runtime,sophia.research_c2_object(dom,v),dg) RETURNING * INTO ap;
 UPDATE sophia.research_bound_dispatches SET phase='applied' WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 RETURN jsonb_build_object('dispatchId',ap.dispatch_id,'applyReceiptDigest',ap.digest,'phase','applied','replay',false,'sendPermitted',false);
END $$;


-- claim: the single linearizable at-most-once consumption. Only the transitioning call's reply permits a send.
-- R2: the shared core over the entry point's scope values and operation.
CREATE FUNCTION sophia.research_bound_claim_core(p_op text, p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb,
 p_project uuid, p_runtime uuid, p_allowance uuid, p_attempt uuid, p_session text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.dispatch.claim.v1'; v text[]; dg text; k jsonb; d sophia.research_bound_dispatches; i sophia.research_call_identities;
 c sophia.research_bound_claims; ap sophia.research_bound_applications;
 r sophia.research_reservations;
BEGIN
 PERFORM sophia.research_bound_request(p_request,'claim');
 v:=sophia.research_c2_payload(dom,p_request->'claim'); dg:=sophia.research_c2_digest(dom,v);
 IF v[1]::uuid<>p_project THEN RAISE EXCEPTION 'bound_identity_mismatch' USING ERRCODE='42501'; END IF;
 k:=sophia.research_bound_dispatch_lock(p_op,p_project,p_allowance,p_attempt,p_session,v[2]::uuid);
 SELECT * INTO d FROM sophia.research_bound_dispatches WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 SELECT * INTO c FROM sophia.research_bound_claims WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 IF FOUND THEN -- history, never permission; only to the claim owner (anyone else learns nothing)
  -- R1 (F06): an exact replay is the SAME canonical claim payload (its digest: dispatch, runtime, original generation and
  -- apply receipt); a changed input is refused like a foreign caller, never relabelled as the stored no-send history.
  IF c.runtime_id=p_runtime AND c.digest=dg THEN
   RETURN jsonb_build_object('dispatchId',c.dispatch_id,'sendPermitted',false,'history','claimed','claimSeq',c.claim_seq::text,
    'applyReceiptDigest',c.apply_receipt_digest,'claimedAt',c.claimed_at,'replay',true);
  END IF;
  RAISE EXCEPTION 'dispatch_claim_refused' USING ERRCODE='42501';
 END IF;
 PERFORM sophia.research_bound_fence(p_op,p_token_sha256,p_unit,p_bridge,p_request);
 IF i.runtime_id<>p_runtime THEN RAISE EXCEPTION 'dispatch_runtime_revoked' USING ERRCODE='55000'; END IF;
 IF v[3]::uuid<>d.dispatch_id OR v[4]::uuid<>p_runtime THEN RAISE EXCEPTION 'bound_identity_mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=v[2]::uuid;
 IF r.state<>'reserved' THEN RAISE EXCEPTION 'dispatch_reservation_not_open' USING ERRCODE='55000'; END IF;
 IF d.phase<>'applied' THEN RAISE EXCEPTION 'dispatch_not_applied' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.research_bound_apply_conflicts x WHERE x.project_id=p_project AND x.reservation_id=v[2]::uuid) THEN
  RAISE EXCEPTION 'dispatch_apply_conflict' USING ERRCODE='55000'; END IF;
 SELECT * INTO ap FROM sophia.research_bound_applications WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 IF v[6]<>ap.digest THEN RAISE EXCEPTION 'bound_param_mismatch' USING ERRCODE='22023'; END IF;
 IF NOT (k->>'active')::boolean THEN RAISE EXCEPTION 'dispatch_profile_inactive' USING ERRCODE='55000'; END IF;
 IF (k->>'policyConflicted')::boolean THEN RAISE EXCEPTION 'bound_policy_conflicted' USING ERRCODE='55000'; END IF;
 IF sophia.contribution_runtime_generation(p_project,i.resource_id) IS DISTINCT FROM d.original_generation
    OR v[5] IS DISTINCT FROM d.original_generation THEN
  RAISE EXCEPTION 'dispatch_runtime_revoked' USING ERRCODE='55000'; END IF;
 IF NOT sophia.research_bound_emitter_consistent(p_runtime,d.route_id,d.emitter_identity_digest) THEN
  RAISE EXCEPTION 'bound_emitter_identity_mismatch' USING ERRCODE='42501'; END IF;
 INSERT INTO sophia.research_bound_claims(project_id,reservation_id,dispatch_id,runtime_id,original_generation,apply_receipt_digest,payload,digest)
 VALUES(p_project,v[2]::uuid,d.dispatch_id,p_runtime,d.original_generation,ap.digest,sophia.research_c2_object(dom,v),dg)
 RETURNING * INTO c;
 UPDATE sophia.research_bound_dispatches SET phase='claimed' WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 RETURN jsonb_build_object('dispatchId',c.dispatch_id,'sendPermitted',true,'history','claimed','claimSeq',c.claim_seq::text,
  'applyReceiptDigest',c.apply_receipt_digest,'claimedAt',c.claimed_at,'replay',false);
END $$;


-- outcome: informational emitter evidence from the claim owner only; never money, uncertainty or a re-arm.
-- R2: the shared core; the reservation's identity operation must be the entry point's.
CREATE FUNCTION sophia.research_bound_outcome_core(p_op text, p_request jsonb, p_project uuid, p_runtime uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE dom text:='sophia.c2.dispatch.outcome.v1'; v text[]; dg text; d sophia.research_bound_dispatches; c sophia.research_bound_claims;
 o sophia.research_bound_outcomes;
BEGIN
 PERFORM sophia.research_bound_request(p_request,'outcome');
 v:=sophia.research_c2_payload(dom,p_request->'outcome'); dg:=sophia.research_c2_digest(dom,v);
 SELECT * INTO d FROM sophia.research_bound_dispatches WHERE project_id=p_project AND reservation_id=v[2]::uuid FOR UPDATE;
 SELECT * INTO c FROM sophia.research_bound_claims WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 IF v[1]::uuid<>p_project OR d.dispatch_id IS NULL OR c.runtime_id IS DISTINCT FROM p_runtime OR v[3]::uuid<>d.dispatch_id
    OR (SELECT i.operation FROM sophia.research_call_identities i WHERE i.project_id=p_project AND i.reservation_id=v[2]::uuid)
     IS DISTINCT FROM p_op THEN
  RAISE EXCEPTION 'dispatch_outcome_refused' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM sophia.research_bound_outcomes WHERE project_id=p_project AND reservation_id=v[2]::uuid;
 IF FOUND THEN
  IF o.digest=dg THEN RETURN jsonb_build_object('dispatchId',d.dispatch_id,'outcomeDigest',o.digest,'replay',true); END IF;
  INSERT INTO sophia.research_bound_outcome_conflicts(project_id,reservation_id,first_digest,competing_digest)
  VALUES(p_project,v[2]::uuid,o.digest,dg) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('dispatchId',d.dispatch_id,'conflict',true,'firstDigest',o.digest,'competingDigest',dg);
 END IF;
 INSERT INTO sophia.research_bound_outcomes(project_id,reservation_id,runtime_id,payload,digest)
 VALUES(p_project,v[2]::uuid,p_runtime,sophia.research_c2_object(dom,v),dg) RETURNING * INTO o;
 RETURN jsonb_build_object('dispatchId',d.dispatch_id,'outcomeDigest',o.digest,'replay',false);
END $$;

-- The runtime entry points (owner-only in this slice). Each resolves its OWN maintained authenticated scope (never an
-- operation chosen from the request), then the shared core with the scope's server values and its operation.
CREATE FUNCTION sophia.runtime_research_bound_apply(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
BEGIN
 RETURN sophia.research_bound_apply_core('research',p_token_sha256,p_unit,p_bridge,p_request,s.project_id,s.runtime_id,s.allowance_id,
  s.attempt_id,s.native_session_id);
END $$;
CREATE FUNCTION sophia.runtime_research_bound_claim(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
BEGIN
 RETURN sophia.research_bound_claim_core('research',p_token_sha256,p_unit,p_bridge,p_request,s.project_id,s.runtime_id,s.allowance_id,
  s.attempt_id,s.native_session_id);
END $$;
CREATE FUNCTION sophia.runtime_research_bound_outcome(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
BEGIN
 RETURN sophia.research_bound_outcome_core('research',p_request,s.project_id,s.runtime_id);
END $$;
-- R2 (C2R1B-F01): design, through the maintained design scope (0041 design_scope_of, p_kind NULL as its reserve).
CREATE FUNCTION sophia.runtime_research_bound_apply_design(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false);
BEGIN
 RETURN sophia.research_bound_apply_core('design',p_token_sha256,p_unit,p_bridge,p_request,s.project_id,s.runtime_id,s.allowance_id,
  s.attempt_id,s.native_session_id);
END $$;
CREATE FUNCTION sophia.runtime_research_bound_claim_design(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false);
BEGIN
 RETURN sophia.research_bound_claim_core('design',p_token_sha256,p_unit,p_bridge,p_request,s.project_id,s.runtime_id,s.allowance_id,
  s.attempt_id,s.native_session_id);
END $$;
CREATE FUNCTION sophia.runtime_research_bound_outcome_design(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,false);
BEGIN
 RETURN sophia.research_bound_outcome_core('design',p_request,s.project_id,s.runtime_id);
END $$;
-- R2 (C2R1B-F01): source review, through the maintained review scope (0042 review_scope_of: its 10 fields, its own
-- work-item allowance).
CREATE FUNCTION sophia.runtime_research_bound_apply_review(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
BEGIN
 RETURN sophia.research_bound_apply_core('source_review',p_token_sha256,p_unit,p_bridge,p_request,s.project_id,s.runtime_id,
  s.allowance_id,s.attempt_id,s.native_session_id);
END $$;
CREATE FUNCTION sophia.runtime_research_bound_claim_review(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
BEGIN
 RETURN sophia.research_bound_claim_core('source_review',p_token_sha256,p_unit,p_bridge,p_request,s.project_id,s.runtime_id,
  s.allowance_id,s.attempt_id,s.native_session_id);
END $$;
CREATE FUNCTION sophia.runtime_research_bound_outcome_review(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
BEGIN
 RETURN sophia.research_bound_outcome_core('source_review',p_request,s.project_id,s.runtime_id);
END $$;

-- --- K4 at settle (AS-FP02) and the bounded read model ---------------------------------------------------------------

-- A known output count above the authorized output bound: one sticky contradiction per input evidence and the
-- profile's auto_hold (no authority; cause = that evidence), the profile row locked FOR UPDATE here, which the settle
-- calls BEFORE research_restriction_cause takes the account guard. Nothing else (money, truth, history) is touched.
CREATE FUNCTION sophia.research_bound_observe(i sophia.research_call_identities, p_count bigint, p_evidence text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.research_bound_authorizations; dom text:='sophia.c2.bound.profile.event.v1'; v text[]; n integer;
BEGIN
 IF p_count IS NULL THEN RETURN; END IF;
 SELECT * INTO a FROM sophia.research_bound_authorizations WHERE project_id=i.project_id AND reservation_id=i.reservation_id
  AND dimension='openai.output_tokens' AND bound_kind='authorized';
 IF NOT FOUND OR p_count<=a.bound THEN RETURN; END IF;
 PERFORM 1 FROM sophia.research_bound_profiles WHERE profile_id=a.profile_id AND revision=a.profile_revision AND dimension=a.dimension FOR UPDATE;
 INSERT INTO sophia.research_bound_contradictions(project_id,reservation_id,dimension,evidence_digest,bound,observed_count,profile_id,profile_revision)
 VALUES(i.project_id,i.reservation_id,a.dimension,p_evidence,a.bound,p_count,a.profile_id,a.profile_revision) ON CONFLICT DO NOTHING;
 v:=ARRAY[a.profile_id::text,a.profile_revision::text,a.dimension,'k4:'||p_evidence,'auto_hold',NULL,'bound_contradicted',NULL,NULL,
  p_evidence,p_evidence];
 SELECT coalesce(max(event_seq),0)+1 INTO n FROM sophia.research_bound_profile_events
  WHERE profile_id=a.profile_id AND revision=a.profile_revision AND dimension=a.dimension;
 INSERT INTO sophia.research_bound_profile_events(profile_id,revision,dimension,event_key,event_seq,event_kind,target_event_digest,reason_code,
  authority_id,approval_ref_digest,cause_ref_digest,evidence_digest,payload,digest)
 VALUES(a.profile_id,a.profile_revision,a.dimension,v[4],n,'auto_hold',NULL,v[7],NULL,NULL,p_evidence,p_evidence,
  sophia.research_c2_object(dom,v),sophia.research_c2_digest(dom,v)) ON CONFLICT DO NOTHING;
END $$;

-- The bounded read of one reservation's bounds (server mechanics only; never G-PROFILE or a live qualification).
-- Per dimension: unknown (no rows: legacy) | unsupported | contradicted (a K4 row, an apply conflict, or a known count above
-- the bound) | applied_unqualified (distrusted after apply, or applied and not claimed) | authorized_not_applied | qualified.
CREATE FUNCTION sophia.research_bound_status(p_project uuid, p_reservation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE d sophia.research_bound_dispatches; c sophia.research_bound_claims; known bigint; conflicted boolean; out jsonb:='[]'; a record;
BEGIN
 SELECT * INTO d FROM sophia.research_bound_dispatches WHERE project_id=p_project AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('dispatchId',NULL,'qualification','server_mechanics_only','dimensions',(SELECT jsonb_agg(jsonb_build_object(
   'dimension',x,'status','unknown') ORDER BY x) FROM unnest(ARRAY['openai.input_cached_tokens','openai.input_tokens',
   'openai.model_requests','openai.output_tokens']) x));
 END IF;
 SELECT * INTO c FROM sophia.research_bound_claims WHERE project_id=p_project AND reservation_id=p_reservation;
 conflicted:=EXISTS(SELECT 1 FROM sophia.research_bound_apply_conflicts x WHERE x.project_id=p_project AND x.reservation_id=p_reservation);
 SELECT greatest(CASE WHEN t.output_class='known' THEN t.output END,t.raw_output) INTO known FROM sophia.research_call_truth t
  WHERE t.project_id=p_project AND t.reservation_id=p_reservation;
 FOR a IN SELECT z.*, sophia.research_bound_profile_state(z.profile_id,z.profile_revision,z.dimension) AS st,
   EXISTS(SELECT 1 FROM sophia.research_bound_contradictions k WHERE k.project_id=z.project_id AND k.reservation_id=z.reservation_id
    AND k.dimension=z.dimension) AS k4
   FROM sophia.research_bound_authorizations z WHERE z.project_id=p_project AND z.reservation_id=p_reservation ORDER BY z.dimension LOOP
  out:=out||jsonb_build_array(jsonb_build_object('dimension',a.dimension,'unit',a.unit,'boundKind',a.bound_kind,'bound',a.bound::text,
   'profileState',a.st,'status',CASE
    WHEN a.bound_kind='unsupported' THEN 'unsupported'
    WHEN a.k4 OR conflicted OR (a.dimension='openai.output_tokens' AND known>a.bound) THEN 'contradicted'
    WHEN d.phase='authorized' THEN 'authorized_not_applied'
    WHEN a.st='distrust' OR d.phase='applied' THEN 'applied_unqualified'
    ELSE 'qualified' END,
   'reason',CASE WHEN a.bound_kind='unsupported' THEN a.unsupported_reason WHEN a.k4 THEN 'bound_contradicted'
    WHEN conflicted THEN 'apply_conflicted' WHEN a.dimension='openai.output_tokens' AND known>a.bound THEN 'known_count_above_bound'
    WHEN d.phase<>'authorized' AND a.st='distrust' THEN 'distrusted' WHEN d.phase='applied' THEN 'not_claimed' END));
 END LOOP;
 RETURN jsonb_build_object('dispatchId',d.dispatch_id,'phase',d.phase,'applyConflicted',conflicted,'qualification','server_mechanics_only',
  'claim',CASE WHEN c.dispatch_id IS NULL THEN NULL ELSE jsonb_build_object('claimSeq',c.claim_seq::text,'runtimeId',c.runtime_id,
   'originalGeneration',c.original_generation,'applyReceiptDigest',c.apply_receipt_digest,'claimedAt',c.claimed_at) END,
  'outcome',(SELECT o.payload FROM sophia.research_bound_outcomes o WHERE o.project_id=p_project AND o.reservation_id=p_reservation),
  'dimensions',out);
END $$;

-- --- replaced functions (marked) ---------------------------------------------------------------------------------

-- research_call_request (0110), replaced: byte for byte, plus 0113 BOUND-OPT-IN (marked): the optional `boundProfile`
-- {profileId, revision} of a tracked model request only; no caller number is ever a bound.
CREATE OR REPLACE FUNCTION sophia.research_call_request(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE d jsonb:=coalesce(p_request->'declared','{}'::jsonb);
BEGIN
 IF NOT (p_request ? 'mode') THEN
  IF p_request ? 'contract' OR p_request ? 'declared' THEN RAISE EXCEPTION 'A contract is named only by a tracked request' USING ERRCODE='22023'; END IF;
  IF p_request ? 'facts' THEN RAISE EXCEPTION 'Observed facts are named only by a tracked request' USING ERRCODE='22023'; END IF; -- 0110
  IF p_request ? 'boundProfile' THEN RAISE EXCEPTION 'bound_profile_untracked' USING ERRCODE='22023'; END IF; -- 0113
  RETURN NULL;
 END IF;
 IF p_request->>'mode' IS DISTINCT FROM 'tracked_v1' THEN RAISE EXCEPTION 'Unknown evidence mode' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call is tracked' USING ERRCODE='22023'; END IF;
 IF coalesce(p_request->>'contract','') NOT IN ('c1p_complete_report','legacy_report') THEN
  RAISE EXCEPTION 'Unknown evidence contract' USING ERRCODE='22023'; END IF;
 IF p_request ? 'facts' AND p_request->'facts' IS DISTINCT FROM '"observed_v1"'::jsonb THEN -- 0110
  RAISE EXCEPTION 'Unknown facts version' USING ERRCODE='22023'; END IF;
 IF p_request ? 'boundProfile' AND EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k -- 0113: a bound is never the caller's
   WHERE k IN ('bound','bounds','maxTokens','maxOutputTokens','max_output_tokens','outputCeiling','ceiling')) THEN
  RAISE EXCEPTION 'bound_caller_supplied' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(d)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(d) k WHERE k NOT IN ('routeId','model','reasoningEffort','prices'))
    OR (d ? 'routeId' AND coalesce(d->>'routeId','') !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$')
    OR (d ? 'model' AND coalesce(d->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$')
    OR (d ? 'reasoningEffort' AND jsonb_typeof(d->'reasoningEffort')<>'null' AND coalesce(d->>'reasoningEffort','') !~ '^[a-z]{1,16}$')
    OR (d ? 'prices' AND (jsonb_typeof(d->'prices')<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_each(d->'prices') e WHERE e.key NOT IN ('input','cacheRead','cacheWrite','output')
      OR jsonb_typeof(e.value)<>'number' OR (e.value#>>'{}')::numeric<0 OR (e.value#>>'{}')::numeric>10000))) THEN
  RAISE EXCEPTION 'Invalid declared route metadata' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('mode','tracked_v1','contract',p_request->>'contract','declared',d)
  ||CASE WHEN p_request ? 'facts' THEN jsonb_build_object('facts','observed_v1') ELSE '{}'::jsonb END -- 0110
  ||CASE WHEN p_request ? 'boundProfile' THEN jsonb_build_object('boundProfile',sophia.research_bound_profile_ref(p_request->'boundProfile'))
   ELSE '{}'::jsonb END; -- 0113
END $$;

-- research_call_replay (0110), replaced: byte for byte, plus 0113 BOUND-REPLAY (marked): the stored original client
-- boundProfile; a changed client request is the same refusal, a later server policy or profile change never is one.
CREATE OR REPLACE FUNCTION sophia.research_call_replay(p_project uuid, r sophia.research_reservations, p_tracked jsonb) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities;
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=r.id;
 IF (i.reservation_id IS NULL)<>(p_tracked IS NULL) OR (p_tracked IS NOT NULL AND (i.contract<>p_tracked->>'contract'
    OR i.declared<>p_tracked->'declared' OR i.facts_version<>sophia.research_call_facts_version(p_tracked))) THEN
  RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
 IF p_tracked IS NOT NULL AND (SELECT d.client_request FROM sophia.research_bound_dispatches d -- 0113
   WHERE d.project_id=p_project AND d.reservation_id=r.id) IS DISTINCT FROM p_tracked->'boundProfile' THEN
  RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
END $$;

-- research_call_ack (0110), replaced: byte for byte, plus 0113 BOUND-ECHO (marked): the STORED bounds of an opted
-- reservation only (never recomputed); without the opt-in the binding is unchanged.
CREATE OR REPLACE FUNCTION sophia.research_call_ack(p_project uuid, p_reservation uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('mode',i.mode,'contract',i.contract,'evidenceId',i.evidence_id,'callId',i.call_id,'attemptId',i.attempt_id,
  'nativeSessionId',i.native_session_id,'projectId',i.project_id,'runtimeUnitId',i.runtime_unit_id,'resourceId',i.resource_id)
  ||CASE WHEN i.facts_version=2 THEN jsonb_build_object('facts','observed_v1') ELSE '{}'::jsonb END
  ||coalesce((SELECT jsonb_build_object('bounds',sophia.research_bound_reply(i.project_id,i.reservation_id)) -- 0113
    WHERE EXISTS(SELECT 1 FROM sophia.research_bound_dispatches d WHERE d.project_id=i.project_id AND d.reservation_id=i.reservation_id)),
   '{}'::jsonb)
 FROM sophia.research_call_identities i WHERE i.project_id=p_project AND i.reservation_id=p_reservation $$;

-- runtime_research_reserve (0109), replaced: byte for byte, plus 0113 AS-FP01 (marked): the bound plan of a NEW tracked
-- opted model call strictly after the key/replay and finalizing handling and before the new-call gate; its fresh rows
-- after the identity. Without the opt-in the reserve is unchanged.
CREATE OR REPLACE FUNCTION sophia.runtime_research_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 k text:=p_request->>'kind'; key text; ref text:=p_request->>'targetRef'; url text; q text:=p_request->>'query';
 purpose text:=coalesce(p_request->>'purpose','call'); amount numeric; a sophia.research_allowances; t sophia.research_tasks;
 tracked jsonb:=sophia.research_call_request(p_request); fund jsonb; fresh boolean:=false; -- 0109
 c2 jsonb; -- 0113: the server-derived bound plan of a new opted call, or NULL
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 IF k='read' THEN
  url:=sophia.research_target_url(s,ref);
  IF url IS NULL THEN RAISE EXCEPTION 'Read target not found' USING ERRCODE='22023'; END IF;
 ELSIF ref IS NOT NULL THEN RAISE EXCEPTION 'Only a read names a target' USING ERRCODE='22023';
 END IF;
 IF (k='search')<>(q IS NOT NULL) OR (q IS NOT NULL AND length(btrim(q)) NOT BETWEEN 1 AND 400) THEN
  RAISE EXCEPTION 'A search names its query, and only a search' USING ERRCODE='22023'; END IF;
 amount:=(p_request->>'amountUsd')::numeric;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN
  IF r.target_ref IS DISTINCT FROM ref OR r.query IS DISTINCT FROM q THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
  PERFORM sophia.research_call_replay(s.project_id,r,tracked); -- 0109
 ELSE
  IF purpose='partial_result' THEN
   IF k IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
   IF t.finalizing_at IS NULL AND amount>0
     AND a.reserved_usd+a.spent_usd+a.uncertain_usd+amount<=a.cap_usd-a.headroom_usd THEN
    RAISE EXCEPTION 'A partial-result call needs the allowance spent: an ordinary call still fits' USING ERRCODE='22023'; END IF;
   IF t.finalize_calls>=4 THEN RAISE EXCEPTION 'Research finalize step has used its calls' USING ERRCODE='55000'; END IF;
   UPDATE sophia.research_tasks SET finalizing_at=coalesce(finalizing_at,now()), finalize_calls=finalize_calls+1
    WHERE project_id=s.project_id AND job_id=s.job_id;
  ELSIF t.finalizing_at IS NOT NULL THEN
   RAISE EXCEPTION 'Research is finalizing: no more searches, reads or ordinary calls' USING ERRCODE='55000';
  END IF;
 END IF;
 -- 0113 AS-FP01: a NEW tracked model call that opted in: its profile and policy rows FOR SHARE (deterministic order) and
 -- its server-derived bounds and expected preimage, before the gate (no account or guard lock yet). A replay never.
 IF r.id IS NULL AND k='model' AND tracked ? 'boundProfile' THEN
  c2:=sophia.research_bound_prepare(s.project_id,s.allowance_id,s.job_id,s.binding_id,t.route,tracked,p_request->>'provider');
 END IF;
 -- 0109: a new model call reaches the original account's gate (guard initialized when tracked, read last).
 IF r.id IS NULL AND k='model' THEN
  fund:=sophia.research_model_gate(s.project_id,s.allowance_id,s.job_id,p_request->>'provider',amount,tracked IS NOT NULL);
  fresh:=true;
 END IF;
 IF r.id IS NULL AND k<>'model' AND sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN
  PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,k,p_request->>'provider',amount,purpose);
 PERFORM sophia.contribution_link_reservation(s,r);
 IF r.target_ref IS NULL AND r.query IS NULL AND (ref IS NOT NULL OR q IS NOT NULL) THEN
  UPDATE sophia.research_reservations SET target_ref=ref, target_url=url, query=q WHERE project_id=s.project_id AND id=r.id RETURNING * INTO r;
 END IF;
 IF fresh AND tracked IS NOT NULL THEN -- 0109
  PERFORM sophia.research_call_identify(s.project_id,r,tracked,'research',jsonb_build_object('runtimeId',s.runtime_id,'bindingId',s.binding_id,
   'attemptId',s.attempt_id,'nativeSessionId',s.native_session_id,'callId',p_request->>'callId','jobId',s.job_id),t.route,fund);
  IF c2 IS NOT NULL THEN PERFORM sophia.research_bound_record(s.project_id,s.runtime_id,r,c2,fund); END IF; -- 0113: fresh rows only
 END IF;
 RETURN sophia.research_call_reply(s.project_id,r,
  CASE WHEN r.target_ref IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('ref',r.target_ref,'url',r.target_url) END);
END $$;

-- runtime_design_reserve (0109), replaced: byte for byte, plus 0113 AS-FP01 (marked): a NEW tracked design call that
-- opted in gets the same server-derived plan, after the key/replay branch and before the gate; its fresh rows after the
-- identity. The design route is the STABLE route reader the identity already uses (no row lock).
CREATE OR REPLACE FUNCTION sophia.runtime_design_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,NULL,true);
 key text:=sophia.design_call_key(s,p_request); r sophia.research_reservations;
 tracked jsonb:=sophia.research_call_request(p_request); fund jsonb; amount numeric:=(p_request->>'amountUsd')::numeric; -- 0109
 c2 jsonb; -- 0113
BEGIN
 IF p_request->>'kind' IS DISTINCT FROM 'model' OR coalesce(p_request->>'purpose','call')<>'call' THEN
  RAISE EXCEPTION 'A design or review reserves model calls only' USING ERRCODE='22023'; END IF;
 -- 0109: reserve_research's own lock order (the grant, then the allowance), then the funding gate.
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN PERFORM sophia.research_call_replay(s.project_id,r,tracked);
 ELSE
  IF tracked ? 'boundProfile' THEN -- 0113 AS-FP01: after the key/replay branch, before the gate
   c2:=sophia.research_bound_prepare(s.project_id,s.allowance_id,s.job_id,s.binding_id,sophia.research_call_design_route(s),tracked,
    p_request->>'provider');
  END IF;
  fund:=sophia.research_model_gate(s.project_id,s.allowance_id,s.job_id,p_request->>'provider',amount,tracked IS NOT NULL);
 END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,'model',p_request->>'provider',amount,'call');
 IF NOT EXISTS(SELECT 1 FROM sophia.research_call_identities i WHERE i.project_id=s.project_id AND i.reservation_id=r.id) AND tracked IS NOT NULL THEN
  PERFORM sophia.research_call_link(s.project_id,r,fund);
  PERFORM sophia.research_call_identify(s.project_id,r,tracked,'design',jsonb_build_object('runtimeId',s.runtime_id,'bindingId',s.binding_id,
   'attemptId',s.attempt_id,'nativeSessionId',s.native_session_id,'callId',p_request->>'callId','jobId',s.job_id),
   sophia.research_call_design_route(s),fund);
  IF c2 IS NOT NULL THEN PERFORM sophia.research_bound_record(s.project_id,s.runtime_id,r,c2,fund); END IF; -- 0113: fresh rows only
 ELSIF fund IS NOT NULL THEN
  PERFORM sophia.research_call_link(s.project_id,r,fund);
 END IF;
 RETURN sophia.research_call_reply(s.project_id,r,'null'::jsonb);
END $$;

-- runtime_source_review_reserve (0109), replaced: byte for byte, plus 0113 AS-FP01 (marked): the same plan as a research
-- call, after the key/replay branch and the call limit, before the gate; fresh rows after the identity.
CREATE OR REPLACE FUNCTION sophia.runtime_source_review_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 key text; calls integer;
 tracked jsonb:=sophia.research_call_request(p_request); fund jsonb; route text; -- 0109
 c2 jsonb; -- 0113
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'model' OR coalesce(p_request->>'purpose','call')<>'call' OR p_request ? 'targetRef' OR p_request ? 'query' THEN
  RAISE EXCEPTION 'A review reserves model calls only' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF NOT FOUND THEN
  SELECT count(*) INTO calls FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id
   AND kind='model' AND state<>'released';
  IF calls>=(sophia.source_review_limits()->>'maxModelRequests')::integer THEN
   RAISE EXCEPTION 'Review model request limit reached: % calls', calls USING ERRCODE='55000'; END IF;
  IF tracked ? 'boundProfile' THEN -- 0113 AS-FP01: the review's own route (a plain read), before the gate
   SELECT t.body::jsonb->'route'->>'id' INTO route FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id;
   c2:=sophia.research_bound_prepare(s.project_id,s.allowance_id,s.job_id,s.binding_id,route,tracked,p_request->>'provider');
  END IF;
  fund:=sophia.research_model_gate(s.project_id,s.allowance_id,s.job_id,p_request->>'provider',(p_request->>'amountUsd')::numeric,tracked IS NOT NULL); -- 0109
 ELSE
  PERFORM sophia.research_call_replay(s.project_id,r,tracked); -- 0109
 END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,'model',p_request->>'provider',(p_request->>'amountUsd')::numeric,'call');
 IF fund IS NOT NULL THEN PERFORM sophia.research_call_link(s.project_id,r,fund); END IF; -- 0109
 IF tracked IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.research_call_identities i WHERE i.project_id=s.project_id AND i.reservation_id=r.id) THEN
  SELECT t.body::jsonb->'route'->>'id' INTO route FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id;
  PERFORM sophia.research_call_identify(s.project_id,r,tracked,'source_review',jsonb_build_object('runtimeId',s.runtime_id,'bindingId',s.binding_id,
   'attemptId',s.attempt_id,'nativeSessionId',s.native_session_id,'callId',p_request->>'callId','jobId',s.job_id),route,fund);
  IF c2 IS NOT NULL THEN PERFORM sophia.research_bound_record(s.project_id,s.runtime_id,r,c2,fund); END IF; -- 0113: fresh rows only
 END IF;
 RETURN sophia.research_call_reply(s.project_id,r,'null'::jsonb);
END $$;

-- research_call_settle: effective 0112 byte for byte (0110 plus 0112 CAUSE-WRITER), plus 0113 AS-FP02 (marked).
CREATE OR REPLACE FUNCTION sophia.research_call_settle(p_project uuid, p_reservation uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; r sophia.research_reservations; t sophia.research_call_truth; f sophia.research_call_fact;
 h sophia.research_call_history; disposition text; reason text; capped boolean:=false;
 o jsonb; m jsonb; v1 text; -- 0110: the input observation (private), its merge, and the A57-only disposition
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF p_request ? 'evidence' THEN RAISE EXCEPTION 'A legacy reservation settles without evidence' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF NOT (p_request ? 'evidence') THEN RAISE EXCEPTION 'A tracked reservation settles only with its evidence' USING ERRCODE='22023'; END IF;
 IF p_request ? 'providerRequestId' THEN RAISE EXCEPTION 'A tracked reservation keeps no provider request id' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=p_project AND id=i.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE;
 IF i.facts_version=2 THEN -- 0110: the observation apart from the A57 facts; absent or all-unknown keeps the v1 digest
  f:=sophia.research_call_facts(i,sophia.research_call_without_observed(p_request));
  o:=sophia.research_call_observed_of(p_request->'evidence');
  IF o IS NOT NULL THEN f.observed:=sophia.research_call_observed_canonical(o); f.digest:=sophia.research_call_fact_digest(i,f); END IF;
 ELSE
  f:=sophia.research_call_facts(i,p_request);
 END IF;
 SELECT * INTO h FROM sophia.research_call_history WHERE project_id=p_project AND reservation_id=p_reservation AND digest=f.digest;
 IF FOUND THEN -- a retained input: its original disposition, nothing changes
  RETURN jsonb_build_object('disposition',h.disposition,'replay',true,'capped',false,'digest',f.digest);
 END IF;
 SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN
  IF o IS NOT NULL THEN -- 0110: a first observation's contradiction (reported, or against its own A57 facts) moves no money
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(jsonb_populate_record(NULL::sophia.research_call_truth,
    '{"sent":"unknown","n1_status":"unknown","header_id_status":"unknown","provider_terminal":"unknown"}')),o,
    sophia.research_call_a57_side(f.response_id_status,f.response_id,f.response_id_reason,f.noncached_input,f.cache_read,f.output),true);
   IF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict'; END IF;
  END IF;
  IF disposition='conflict' THEN NULL;
  ELSIF NOT sophia.research_call_money(r,f,p_request->'usage') THEN disposition:='conflict'; reason:='outcome_changed';
  ELSE disposition:='accepted'; END IF;
  INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,cache_read_class,cache_read,
   cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status,response_id,response_id_reason,
   response_id_correlation,first_conflict_digest,first_conflict_reason,first_conflict_at)
  VALUES(p_project,p_reservation,f.digest,f.report,f.noncached_input_class,f.noncached_input,f.cache_read_class,f.cache_read,
   f.cache_write_class,f.cache_write,f.output_class,f.output,f.consumer_ending,
   CASE WHEN disposition='conflict' THEN r.state ELSE f.outcome END,CASE WHEN disposition='conflict' THEN r.settled_usd ELSE f.cost_usd END,
   f.response_id_status,f.response_id,f.response_id_reason,f.response_id_correlation,
   CASE WHEN disposition='conflict' THEN f.digest END,reason,CASE WHEN disposition='conflict' THEN clock_timestamp() END)
  RETURNING * INTO t;
  IF m IS NOT NULL THEN -- 0110: the first observation is the truth's, with its witnesses
   PERFORM sophia.research_call_observed_write(i,t,m,true);
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 ELSIF t.digest=f.digest THEN
  -- The current truth again: below the cap nothing changes. Once the cap is reached, an input that is the current truth
  -- but was never retained is an unretained post-cap input (F02): stably capped through the tail below, never a replay.
  IF t.history_count<16 THEN
   RETURN jsonb_build_object('disposition','current','replay',true,'capped',false,'digest',f.digest);
  END IF;
  disposition:='subsumed';
 ELSE
  SELECT * INTO disposition, reason FROM sophia.research_call_compare(t,f);
  IF i.facts_version=2 THEN -- 0110: classified BEFORE any money helper
   v1:=disposition;
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(t),o,sophia.research_call_a57_merged(t,f,v1='extended'),v1='extended');
   IF v1='conflict' THEN NULL; -- R1 F01: 0109's own conflict and reason stand; this input's witnesses are still kept below
   ELSIF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict';
   ELSIF v1<>'extended' AND (m->>'gained')::boolean THEN disposition:='extended'; -- metadata only: no money path
   END IF;
  END IF;
  IF disposition='extended' AND (v1 IS NULL OR v1='extended') THEN
   IF NOT sophia.research_call_money(r,f,p_request->'usage') THEN disposition:='conflict'; reason:='outcome_changed';
   ELSE PERFORM sophia.research_call_extend(i,t,f); END IF;
  END IF;
  IF disposition='conflict' THEN
   UPDATE sophia.research_call_truth SET first_conflict_digest=coalesce(first_conflict_digest,f.digest),
    first_conflict_reason=coalesce(first_conflict_reason,reason),first_conflict_at=coalesce(first_conflict_at,clock_timestamp())
   WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
  SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  IF m IS NOT NULL THEN -- 0110: knowledge only without a contradiction; a witness always (first per dimension, sticky)
   PERFORM sophia.research_call_observed_write(i,t,m,disposition<>'conflict');
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 END IF;
 capped:=sophia.research_call_retain(t,f,disposition);
 -- 0113 AS-FP02 (K4): a known output count above the call's authorized bound is a sticky contradiction and its profile's
 -- auto_hold; the profile row is locked HERE, before research_restriction_cause takes the account guard (even when
 -- already restricted). Money, truth, history, causes and certificates are as before.
 PERFORM sophia.research_bound_observe(i,greatest(CASE WHEN f.output_class='known' THEN f.output END,
  CASE WHEN t.output_class='known' THEN t.output END,t.raw_output,(o->>'out')::bigint),f.digest);
 -- A conflict, or an input past the cap (the first overflow, valid or not: F01), restricts its original scope, sticky.
 IF disposition='conflict' OR capped THEN
  -- 0112 CAUSE-WRITER: every conflict or overflow is first recorded as one cause of its original scope (the account's under
  -- its guard, locked LAST even when it is already restricted); only a genuinely new cause restricts, anew.
  IF sophia.research_restriction_cause(i,CASE WHEN disposition='conflict' THEN 'conflict' ELSE 'overflow' END,f.digest) THEN
  PERFORM sophia.research_call_restrict_allowance(i);
  -- LAST: the account's guard (initialized at reserve under the account row); no lock is taken after it.
  IF i.account_id IS NOT NULL THEN
   UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=clock_timestamp(), first_project_id=p_project,
    first_reservation_id=p_reservation WHERE account_id=i.account_id AND NOT restricted;
  END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('disposition',CASE WHEN capped AND disposition='subsumed' THEN 'capped' ELSE disposition END,
  'replay',false,'capped',capped,'digest',f.digest);
END $$;

-- research_call_record_late_facts (current 0112 R1 C3REC-F01 FACT-ONLY writer), replaced: byte for byte, plus 0113 K4-LATE
-- (marked): newly accepted late count knowledge above the authorized bound is the same sticky contradiction and auto_hold.
CREATE OR REPLACE FUNCTION sophia.research_call_record_late_facts(p_project uuid, p_reservation uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; r sophia.research_reservations; t sophia.research_call_truth; f sophia.research_call_fact;
 h sophia.research_call_history; disposition text; reason text; capped boolean:=false;
 o jsonb; m jsonb; v1 text; -- 0110: the input observation (private), its merge, and the A57-only disposition
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF p_request ? 'evidence' THEN RAISE EXCEPTION 'A legacy reservation settles without evidence' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF NOT (p_request ? 'evidence') THEN RAISE EXCEPTION 'A tracked reservation settles only with its evidence' USING ERRCODE='22023'; END IF;
 IF p_request ? 'providerRequestId' THEN RAISE EXCEPTION 'A tracked reservation keeps no provider request id' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=p_project AND id=i.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE;
 IF i.facts_version=2 THEN -- 0110: the observation apart from the A57 facts; absent or all-unknown keeps the v1 digest
  f:=sophia.research_call_facts(i,sophia.research_call_without_observed(p_request));
  o:=sophia.research_call_observed_of(p_request->'evidence');
  IF o IS NOT NULL THEN f.observed:=sophia.research_call_observed_canonical(o); f.digest:=sophia.research_call_fact_digest(i,f); END IF;
 ELSE
  f:=sophia.research_call_facts(i,p_request);
 END IF;
 -- R2 P02: while the money is OPEN the report's outcome and cost are a claim, not the call's financial truth; the truth's
 -- financial pair stays the money's (unknown). The facts, their digest, history and witnesses stay exactly as reported.
 IF r.state IN ('reserved','uncertain') THEN f.outcome:='uncertain'; f.cost_usd:=NULL; END IF; /* R2 P02 OPEN-MONEY */
 SELECT * INTO h FROM sophia.research_call_history WHERE project_id=p_project AND reservation_id=p_reservation AND digest=f.digest;
 IF FOUND THEN -- a retained input: its original disposition, nothing changes
  RETURN jsonb_build_object('disposition',h.disposition,'replay',true,'capped',false,'digest',f.digest);
 END IF;
 SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN
  IF o IS NOT NULL THEN -- 0110: a first observation's contradiction (reported, or against its own A57 facts) moves no money
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(jsonb_populate_record(NULL::sophia.research_call_truth,
    '{"sent":"unknown","n1_status":"unknown","header_id_status":"unknown","provider_terminal":"unknown"}')),o,
    sophia.research_call_a57_side(f.response_id_status,f.response_id,f.response_id_reason,f.noncached_input,f.cache_read,f.output),true);
   IF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict'; END IF;
  END IF;
  IF disposition='conflict' THEN NULL;
  ELSIF NOT sophia.research_call_money_unchanged(r,f) /* R1 FACT-ONLY */ THEN disposition:='conflict'; reason:='outcome_changed';
  ELSE disposition:='accepted'; END IF;
  INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,cache_read_class,cache_read,
   cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status,response_id,response_id_reason,
   response_id_correlation,first_conflict_digest,first_conflict_reason,first_conflict_at)
  VALUES(p_project,p_reservation,f.digest,f.report,f.noncached_input_class,f.noncached_input,f.cache_read_class,f.cache_read,
   f.cache_write_class,f.cache_write,f.output_class,f.output,f.consumer_ending,
   CASE WHEN disposition='conflict' THEN r.state ELSE f.outcome END,CASE WHEN disposition='conflict' THEN r.settled_usd ELSE f.cost_usd END,
   f.response_id_status,f.response_id,f.response_id_reason,f.response_id_correlation,
   CASE WHEN disposition='conflict' THEN f.digest END,reason,CASE WHEN disposition='conflict' THEN clock_timestamp() END)
  RETURNING * INTO t;
  IF m IS NOT NULL THEN -- 0110: the first observation is the truth's, with its witnesses
   PERFORM sophia.research_call_observed_write(i,t,m,true);
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 ELSIF t.digest=f.digest THEN
  -- The current truth again: below the cap nothing changes. Once the cap is reached, an input that is the current truth
  -- but was never retained is an unretained post-cap input (F02): stably capped through the tail below, never a replay.
  IF t.history_count<16 THEN
   RETURN jsonb_build_object('disposition','current','replay',true,'capped',false,'digest',f.digest);
  END IF;
  disposition:='subsumed';
 ELSE
  SELECT * INTO disposition, reason FROM sophia.research_call_compare(t,f);
  IF i.facts_version=2 THEN -- 0110: classified BEFORE any money helper
   v1:=disposition;
   m:=sophia.research_call_observe(sophia.research_call_truth_observed(t),o,sophia.research_call_a57_merged(t,f,v1='extended'),v1='extended');
   IF v1='conflict' THEN NULL; -- R1 F01: 0109's own conflict and reason stand; this input's witnesses are still kept below
   ELSIF m ? 'conflict' THEN disposition:='conflict'; reason:=m->>'conflict';
   ELSIF v1<>'extended' AND (m->>'gained')::boolean THEN disposition:='extended'; -- metadata only: no money path
   END IF;
  END IF;
  IF disposition='extended' AND (v1 IS NULL OR v1='extended') THEN
   IF NOT sophia.research_call_money_unchanged(r,f) /* R1 FACT-ONLY */ THEN disposition:='conflict'; reason:='outcome_changed';
   ELSE PERFORM sophia.research_call_extend(i,t,f); END IF;
  END IF;
  IF disposition='conflict' THEN
   UPDATE sophia.research_call_truth SET first_conflict_digest=coalesce(first_conflict_digest,f.digest),
    first_conflict_reason=coalesce(first_conflict_reason,reason),first_conflict_at=coalesce(first_conflict_at,clock_timestamp())
   WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
  SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  IF m IS NOT NULL THEN -- 0110: knowledge only without a contradiction; a witness always (first per dimension, sticky)
   PERFORM sophia.research_call_observed_write(i,t,m,disposition<>'conflict');
   SELECT * INTO t FROM sophia.research_call_truth WHERE project_id=p_project AND reservation_id=p_reservation;
  END IF;
 END IF;
 capped:=sophia.research_call_retain(t,f,disposition);
 -- 0113 K4-LATE: the profile row is locked HERE, before research_restriction_cause takes the account guard; money,
 -- truth, history, causes, episodes and certificates are as before (an exact or history replay returned above).
 PERFORM sophia.research_bound_observe(i,greatest(CASE WHEN f.output_class='known' THEN f.output END,
  CASE WHEN t.output_class='known' THEN t.output END,t.raw_output,(o->>'out')::bigint),f.digest);
 -- A conflict, or an input past the cap (the first overflow, valid or not: F01), restricts its original scope, sticky.
 IF disposition='conflict' OR capped THEN
  -- 0112 CAUSE-WRITER: every conflict or overflow is first recorded as one cause of its original scope (the account's under
  -- its guard, locked LAST even when it is already restricted); only a genuinely new cause restricts, anew.
  IF sophia.research_restriction_cause(i,CASE WHEN disposition='conflict' THEN 'conflict' ELSE 'overflow' END,f.digest) THEN
  PERFORM sophia.research_call_restrict_allowance(i);
  -- LAST: the account's guard (initialized at reserve under the account row); no lock is taken after it.
  IF i.account_id IS NOT NULL THEN
   UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=clock_timestamp(), first_project_id=p_project,
    first_reservation_id=p_reservation WHERE account_id=i.account_id AND NOT restricted;
  END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('disposition',CASE WHEN capped AND disposition='subsumed' THEN 'capped' ELSE disposition END,
  'replay',false,'capped',capped,'digest',f.digest);
END $$;

-- --- privileges ------------------------------------------------------------------------------------------------------
-- Replaced functions keep their grants (CREATE OR REPLACE). Every new function is the migration owner's only: no
-- application, worker or assembler role executes it; the runtime entries are inactive in this slice.
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia'
   AND p.proname ~ '^(research_c2_|research_bound_|record_research_bound_|revoke_research_bound_|register_research_bound_|runtime_research_bound_)' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, sophia_api, sophia_worker',f);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sophia_conversation_assembler',f); END IF;
 END LOOP;
END $$;

COMMIT;
