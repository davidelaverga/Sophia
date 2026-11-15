-- INC04-R07-C2B-DURABLE-001 (SOPHIA-INC-2026-11, INC-04 R07 C2B durable backend half, Stage A; task 8725260d, root SI01-SI04
-- on the shared 022d interface): an opted-in tracked call's closed optional OBSERVED facts, persisted on the same original
-- call ledger as 0109's facts. Root allocated 0110 (with amendment A58). 0001-0109 and every retained row are not edited.
-- * Opt-in (SI01). A tracked reserve may name `facts: observed_v1`; the identity freezes facts_version 2 and the closed ACK
--   binding echoes `facts`, and only then. Without it (facts_version 1) the request, reply, binding, settlement, receipt and
--   digest are byte-identical to 0109: its code path is unchanged. Another opt-in under the same key is another reservation.
-- * Observation. Only an opted-in settlement may carry `evidence.observed`, one closed object: sent, httpStatus, n1 (the
--   provider response id, the same namespace as A57's responseId) and n2 (the request id, never equated with n1) each with
--   its sources, the provider terminal, its raw counts, at most eight first witnesses and the REQUIRED delivery stage.
--   Every member is closed; null, unknown keys, duplicates, unsafe or fractional counts and invalid ids are refused with one
--   fixed message that echoes nothing. Absent members are unknown; an absent observation leaves 0109's facts as they are.
-- * Merge (022d J01/J02, SI02). First-known and monotone: unknown never erases a known value; the same id with new sources
--   unions them; unsupported -> supported is a gain and supported -> unsupported keeps the supported id; a different known
--   value keeps the first and adds ONE sticky witness for its dimension (n1, n2, http_status, provider_terminal,
--   input_total, cache_read, output, cross_c1p), never rewritten. Counts merge only under the same provider terminal: a
--   different terminal is a conflict and its counts are not merged (no invented incomplete -> completed). Delivery is the
--   greatest proven stage, no_frame_delivered < closed_before_terminal_frame < none; it is neither a provider terminal nor
--   a consumer ending. Raw counts never make nonCachedInput or cacheRead known (R3).
-- * Cross namespace (SI04). A known supported A57 responseId and a known supported n1 that differ, or known A57 counts
--   (nonCachedInput+cacheRead vs inputTotal, cacheRead, output, in exact integers) that differ from the raw counts, are a
--   cross_c1p contradiction. Its witness preimage is the Root-frozen grouped tuple
--   a57_n1=..|observed_n1=..|a57_noncached_input=..|a57_cache_read=..|a57_output=..|observed_input_total=..|
--   observed_cache_read=..|observed_output=.. ('-' unknown; ids as s:<sha256> or u:<reason>; no raw id).
-- * Money. Every contradiction (a merge conflict, a reported witness, a cross mismatch, on a first settlement too) is
--   classified BEFORE any money helper: it is a retained conflict, restricts the original scope (guard LAST, as 0109) and
--   moves no money. An observation that only adds metadata never calls the money path, even with every raw count known; no
--   header, id or raw count creates, reprices, refunds or releases USD. 0109's facts settle money exactly as before.
-- * Digest. An absent or all-unknown observation keeps the EXACT 0109 research-call-facts-v1 digest and receipt; any other
--   uses research-call-facts-v2 over the same 0109 field list plus the observation's fixed-order canonical (022d §6). The
--   settlement reply keeps A57's closed shape. History keeps the input observation's canonical only (ids by digest).
BEGIN;

-- --- the opt-in, frozen with the identity ---------------------------------------------------------------------------------

-- Every retained identity is facts_version 1 (no row is rewritten: a constant default fires no row trigger).
ALTER TABLE sophia.research_call_identities ADD COLUMN facts_version smallint NOT NULL DEFAULT 1 CHECK(facts_version IN (1,2));

-- --- the observed truth, on the original truth row --------------------------------------------------------------------------

ALTER TABLE sophia.research_call_truth
 DROP CONSTRAINT research_call_truth_provider_terminal_check,
 DROP CONSTRAINT research_call_truth_header_id_status_check,
 DROP CONSTRAINT research_call_truth_outcome_check,
 DROP CONSTRAINT research_call_truth_first_conflict_reason_check,
 ADD CONSTRAINT research_call_truth_provider_terminal_check
  CHECK(provider_terminal IN ('unknown','completed','incomplete','failed','error_event')),
 ADD CONSTRAINT research_call_truth_header_id_status_check CHECK(header_id_status IN ('unknown','supported','identity_unsupported')),
 -- 'reserved': a first settlement whose observation contradicted itself moved no money; the reservation is as it was.
 ADD CONSTRAINT research_call_truth_outcome_check CHECK(outcome IN ('settled','uncertain','released','reserved')),
 ADD CONSTRAINT research_call_truth_first_conflict_reason_check CHECK(first_conflict_reason IS NULL OR first_conflict_reason IN
  ('count_changed','id_changed','cost_changed','outcome_changed','report_changed','ending_changed','observed_changed','cross_changed')),
 ADD COLUMN delivery text CHECK(delivery IN ('no_frame_delivered','closed_before_terminal_frame','none')),
 ADD COLUMN sent text NOT NULL DEFAULT 'unknown' CHECK(sent IN ('unknown','observable_transport_response')),
 ADD COLUMN http_status integer CHECK(http_status BETWEEN 100 AND 599),
 ADD COLUMN n1_status text NOT NULL DEFAULT 'unknown' CHECK(n1_status IN ('unknown','supported','identity_unsupported')),
 ADD COLUMN n1 text CHECK(n1 IS NULL OR octet_length(n1) BETWEEN 1 AND 8192),
 ADD COLUMN n1_reason text CHECK(n1_reason IS NULL OR n1_reason IN ('empty','not_string','nul','unpaired_surrogate','over_bound')),
 ADD COLUMN n1_sources text[] CHECK(n1_sources IS NULL OR (cardinality(n1_sources) BETWEEN 1 AND 4
  AND n1_sources <@ ARRAY['created','completed','incomplete','failed'])),
 ADD COLUMN header_id text CHECK(header_id IS NULL OR octet_length(header_id) BETWEEN 1 AND 8192),
 ADD COLUMN header_id_reason text CHECK(header_id_reason IS NULL OR header_id_reason IN ('empty','not_string','nul','unpaired_surrogate','over_bound')),
 ADD COLUMN header_id_sources text[] CHECK(header_id_sources IS NULL OR (cardinality(header_id_sources) BETWEEN 1 AND 2
  AND header_id_sources <@ ARRAY['response_header','typed_error'])),
 ADD COLUMN raw_input_total bigint CHECK(raw_input_total BETWEEN 0 AND 9007199254740991),
 ADD COLUMN raw_cache_read bigint CHECK(raw_cache_read BETWEEN 0 AND 9007199254740991),
 ADD COLUMN raw_output bigint CHECK(raw_output BETWEEN 0 AND 9007199254740991),
 ADD COLUMN w_n1 text CHECK(w_n1 ~ '^[0-9a-f]{64}$'), ADD COLUMN w_n2 text CHECK(w_n2 ~ '^[0-9a-f]{64}$'),
 ADD COLUMN w_http_status text CHECK(w_http_status ~ '^[0-9a-f]{64}$'),
 ADD COLUMN w_provider_terminal text CHECK(w_provider_terminal ~ '^[0-9a-f]{64}$'),
 ADD COLUMN w_input_total text CHECK(w_input_total ~ '^[0-9a-f]{64}$'), ADD COLUMN w_cache_read text CHECK(w_cache_read ~ '^[0-9a-f]{64}$'),
 ADD COLUMN w_output text CHECK(w_output ~ '^[0-9a-f]{64}$'), ADD COLUMN w_cross_c1p text CHECK(w_cross_c1p ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT research_call_truth_n1_shape CHECK((n1_status='supported')=(n1 IS NOT NULL)
  AND (n1_status='identity_unsupported')=(n1_reason IS NOT NULL) AND (n1_status='unknown')=(n1_sources IS NULL)),
 ADD CONSTRAINT research_call_truth_header_id_shape CHECK((header_id_status='supported')=(header_id IS NOT NULL)
  AND (header_id_status='identity_unsupported')=(header_id_reason IS NOT NULL) AND (header_id_status='unknown')=(header_id_sources IS NULL)),
 ADD CONSTRAINT research_call_truth_raw_counts_terminal CHECK(provider_terminal<>'unknown'
  OR (raw_input_total IS NULL AND raw_cache_read IS NULL AND raw_output IS NULL)),
 ADD CONSTRAINT research_call_truth_observed_needs_delivery CHECK(delivery IS NOT NULL OR (sent='unknown' AND http_status IS NULL
  AND n1_status='unknown' AND header_id_status='unknown' AND provider_terminal='unknown'));

-- At most 16 retained inputs keep their observation's canonical only (ids by digest; NULL when absent or all-unknown).
ALTER TABLE sophia.research_call_history ADD COLUMN observed text CHECK(observed IS NULL OR (octet_length(observed)<=2048
 AND observed LIKE 'c2b-facts-v2|%'));

-- The observed truth is monotone at the row: a stage never goes back, a known value never becomes unknown or changes, and a
-- witness, once written, is never rewritten.
CREATE FUNCTION sophia.research_call_observed_monotone() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE stages text[]:=ARRAY['no_frame_delivered','closed_before_terminal_frame','none'];
BEGIN
 IF (OLD.delivery IS NOT NULL AND (NEW.delivery IS NULL OR array_position(stages,NEW.delivery)<array_position(stages,OLD.delivery)))
    OR (OLD.sent<>'unknown' AND NEW.sent IS DISTINCT FROM OLD.sent)
    OR (OLD.http_status IS NOT NULL AND NEW.http_status IS DISTINCT FROM OLD.http_status)
    OR (OLD.n1_status='supported' AND (NEW.n1 IS DISTINCT FROM OLD.n1 OR NOT NEW.n1_sources @> OLD.n1_sources))
    OR (OLD.n1_status='identity_unsupported' AND NEW.n1_status='unknown')
    OR (OLD.header_id_status='supported' AND (NEW.header_id IS DISTINCT FROM OLD.header_id OR NOT NEW.header_id_sources @> OLD.header_id_sources))
    OR (OLD.header_id_status='identity_unsupported' AND NEW.header_id_status='unknown')
    OR (OLD.provider_terminal<>'unknown' AND NEW.provider_terminal IS DISTINCT FROM OLD.provider_terminal)
    OR (OLD.raw_input_total IS NOT NULL AND NEW.raw_input_total IS DISTINCT FROM OLD.raw_input_total)
    OR (OLD.raw_cache_read IS NOT NULL AND NEW.raw_cache_read IS DISTINCT FROM OLD.raw_cache_read)
    OR (OLD.raw_output IS NOT NULL AND NEW.raw_output IS DISTINCT FROM OLD.raw_output)
    OR (OLD.w_n1 IS NOT NULL AND NEW.w_n1 IS DISTINCT FROM OLD.w_n1) OR (OLD.w_n2 IS NOT NULL AND NEW.w_n2 IS DISTINCT FROM OLD.w_n2)
    OR (OLD.w_http_status IS NOT NULL AND NEW.w_http_status IS DISTINCT FROM OLD.w_http_status)
    OR (OLD.w_provider_terminal IS NOT NULL AND NEW.w_provider_terminal IS DISTINCT FROM OLD.w_provider_terminal)
    OR (OLD.w_input_total IS NOT NULL AND NEW.w_input_total IS DISTINCT FROM OLD.w_input_total)
    OR (OLD.w_cache_read IS NOT NULL AND NEW.w_cache_read IS DISTINCT FROM OLD.w_cache_read)
    OR (OLD.w_output IS NOT NULL AND NEW.w_output IS DISTINCT FROM OLD.w_output)
    OR (OLD.w_cross_c1p IS NOT NULL AND NEW.w_cross_c1p IS DISTINCT FROM OLD.w_cross_c1p) THEN
  RAISE EXCEPTION 'Observed call facts are monotone' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER research_call_truth_observed_monotone BEFORE UPDATE ON sophia.research_call_truth
 FOR EACH ROW EXECUTE FUNCTION sophia.research_call_observed_monotone();

-- The fact type carries the sanitized canonical of an input's observation (NULL when absent or all-unknown).
ALTER TYPE sophia.research_call_fact ADD ATTRIBUTE observed text;

-- --- the opt-in at reserve (SI01) ------------------------------------------------------------------------------------------

-- research_call_request (0109), replaced: the same, plus the optional `facts: observed_v1` of a tracked request only.
CREATE OR REPLACE FUNCTION sophia.research_call_request(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE d jsonb:=coalesce(p_request->'declared','{}'::jsonb);
BEGIN
 IF NOT (p_request ? 'mode') THEN
  IF p_request ? 'contract' OR p_request ? 'declared' THEN RAISE EXCEPTION 'A contract is named only by a tracked request' USING ERRCODE='22023'; END IF;
  IF p_request ? 'facts' THEN RAISE EXCEPTION 'Observed facts are named only by a tracked request' USING ERRCODE='22023'; END IF; -- 0110
  RETURN NULL;
 END IF;
 IF p_request->>'mode' IS DISTINCT FROM 'tracked_v1' THEN RAISE EXCEPTION 'Unknown evidence mode' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call is tracked' USING ERRCODE='22023'; END IF;
 IF coalesce(p_request->>'contract','') NOT IN ('c1p_complete_report','legacy_report') THEN
  RAISE EXCEPTION 'Unknown evidence contract' USING ERRCODE='22023'; END IF;
 IF p_request ? 'facts' AND p_request->'facts' IS DISTINCT FROM '"observed_v1"'::jsonb THEN -- 0110
  RAISE EXCEPTION 'Unknown facts version' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(d)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(d) k WHERE k NOT IN ('routeId','model','reasoningEffort','prices'))
    OR (d ? 'routeId' AND coalesce(d->>'routeId','') !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$')
    OR (d ? 'model' AND coalesce(d->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$')
    OR (d ? 'reasoningEffort' AND jsonb_typeof(d->'reasoningEffort')<>'null' AND coalesce(d->>'reasoningEffort','') !~ '^[a-z]{1,16}$')
    OR (d ? 'prices' AND (jsonb_typeof(d->'prices')<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_each(d->'prices') e WHERE e.key NOT IN ('input','cacheRead','cacheWrite','output')
      OR jsonb_typeof(e.value)<>'number' OR (e.value#>>'{}')::numeric<0 OR (e.value#>>'{}')::numeric>10000))) THEN
  RAISE EXCEPTION 'Invalid declared route metadata' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('mode','tracked_v1','contract',p_request->>'contract','declared',d)
  ||CASE WHEN p_request ? 'facts' THEN jsonb_build_object('facts','observed_v1') ELSE '{}'::jsonb END; -- 0110
END $$;

-- The facts version a normalized tracked request asks for.
CREATE FUNCTION sophia.research_call_facts_version(p_tracked jsonb) RETURNS smallint LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$ SELECT (CASE WHEN p_tracked ? 'facts' THEN 2 ELSE 1 END)::smallint $$;

-- research_call_identify (0109), replaced: the same, plus the frozen facts version.
CREATE OR REPLACE FUNCTION sophia.research_call_identify(p_project uuid, r sophia.research_reservations, p_tracked jsonb, p_operation text,
 p_scope jsonb, p_route text, p_fund jsonb) RETURNS sophia.research_call_identities LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities; b sophia.execution_bindings:=sophia.research_call_bound(p_project,(p_scope->>'bindingId')::uuid);
BEGIN
 PERFORM sophia.research_call_contract_check(p_tracked->>'contract',p_route,r.provider);
 INSERT INTO sophia.research_call_identities(project_id,reservation_id,mode,contract,operation,runtime_id,runtime_unit_id,resource_id,
  binding_id,attempt_id,native_session_id,call_id,job_id,allowance_id,route_id,provider,declared,payer,account_id,grant_id,grant_revision,
  connection_id,credential_revision,qualification_id,qualification_revision,facts_version)
 VALUES(p_project,r.id,'tracked_v1',p_tracked->>'contract',p_operation,(p_scope->>'runtimeId')::uuid,b.runtime_unit_id,b.resource_id,
  (p_scope->>'bindingId')::uuid,(p_scope->>'attemptId')::uuid,p_scope->>'nativeSessionId',p_scope->>'callId',(p_scope->>'jobId')::uuid,
  r.allowance_id,p_route,r.provider,p_tracked->'declared',
  CASE WHEN p_fund IS NULL THEN 'project' ELSE 'contributor_api_account' END,(p_fund->>'accountId')::uuid,(p_fund->>'grantId')::uuid,
  (p_fund->>'grantRevision')::bigint,(p_fund->>'connectionId')::uuid,(p_fund->>'credentialRevision')::bigint,
  (p_fund->>'qualificationId')::uuid,(p_fund->>'qualificationRevision')::bigint,sophia.research_call_facts_version(p_tracked))
 RETURNING * INTO i;
 RETURN i;
END $$;

-- research_call_replay (0109), replaced: the same, plus the facts version (another opt-in is another reservation).
CREATE OR REPLACE FUNCTION sophia.research_call_replay(p_project uuid, r sophia.research_reservations, p_tracked jsonb) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE i sophia.research_call_identities;
BEGIN
 SELECT * INTO i FROM sophia.research_call_identities WHERE project_id=p_project AND reservation_id=r.id;
 IF (i.reservation_id IS NULL)<>(p_tracked IS NULL) OR (p_tracked IS NOT NULL AND (i.contract<>p_tracked->>'contract'
    OR i.declared<>p_tracked->'declared' OR i.facts_version<>sophia.research_call_facts_version(p_tracked))) THEN
  RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
END $$;

-- research_call_ack (0109), replaced: the same closed echo, plus `facts` only for an opted-in reservation.
CREATE OR REPLACE FUNCTION sophia.research_call_ack(p_project uuid, p_reservation uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('mode',i.mode,'contract',i.contract,'evidenceId',i.evidence_id,'callId',i.call_id,'attemptId',i.attempt_id,
  'nativeSessionId',i.native_session_id,'projectId',i.project_id,'runtimeUnitId',i.runtime_unit_id,'resourceId',i.resource_id)
  ||CASE WHEN i.facts_version=2 THEN jsonb_build_object('facts','observed_v1') ELSE '{}'::jsonb END
 FROM sophia.research_call_identities i WHERE i.project_id=p_project AND i.reservation_id=p_reservation $$;

-- --- the closed observation (022d §2, SI02, SI03) --------------------------------------------------------------------------

-- One closed raw count: a JSON integer 0..2^53-1, or the fixed refusal.
CREATE FUNCTION sophia.research_call_observed_count(p jsonb) RETURNS bigint LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p)<>'number' OR (p#>>'{}')::numeric<>trunc((p#>>'{}')::numeric) OR (p#>>'{}')::numeric<0
    OR (p#>>'{}')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023'; END IF;
 RETURN (p#>>'{}')::numeric::bigint; -- R1 F02: the validated integral value (1.0, 1e3), never the original text
END $$;

-- One closed observed id with its sources, normalized: {status, value|reason, sources in the fixed order}.
CREATE FUNCTION sophia.research_call_observed_id(p jsonb, p_order text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE id jsonb:=p->'id'; s jsonb:=p->'sources'; n integer;
BEGIN
 IF jsonb_typeof(p)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('id','sources'))
    OR jsonb_typeof(id)<>'object' OR jsonb_typeof(s)<>'array' THEN RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023'; END IF;
 n:=jsonb_array_length(s);
 IF n NOT BETWEEN 1 AND cardinality(p_order)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(s) e WHERE jsonb_typeof(e)<>'string' OR NOT (e#>>'{}')=ANY(p_order))
    OR (SELECT count(DISTINCT e#>>'{}') FROM jsonb_array_elements(s) e)<>n THEN
  RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023'; END IF;
 s:=(SELECT jsonb_agg(x ORDER BY array_position(p_order,x)) FROM unnest(p_order) x
     WHERE x IN (SELECT e#>>'{}' FROM jsonb_array_elements(p->'sources') e));
 IF id->>'status'='supported' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(id) k WHERE k NOT IN ('status','value'))
    AND jsonb_typeof(id->'value')='string' AND octet_length(id->>'value') BETWEEN 1 AND 8192 THEN
  RETURN jsonb_build_object('status','supported','value',id->'value','sources',s);
 ELSIF id->>'status'='identity_unsupported' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(id) k WHERE k NOT IN ('status','reason'))
    AND jsonb_typeof(id->'reason')='string' AND id->>'reason' IN ('empty','not_string','nul','unpaired_surrogate','over_bound') THEN
  RETURN jsonb_build_object('status','identity_unsupported','reason',id->'reason','sources',s);
 END IF;
 RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023';
END $$;

-- The eight conflict dimensions in their fixed order.
CREATE FUNCTION sophia.research_call_observed_dimensions() RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT ARRAY['n1','n2','http_status','provider_terminal','input_total','cache_read','output','cross_c1p'] $$;

-- The reported first witnesses: at most eight, one per dimension, each 64 lowercase hex: {dimension: witness}.
CREATE FUNCTION sophia.research_call_observed_conflicts(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE dims text[]:=sophia.research_call_observed_dimensions();
BEGIN
 IF jsonb_typeof(p)<>'array' OR jsonb_array_length(p)>8
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p) e WHERE jsonb_typeof(e)<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) k WHERE k NOT IN ('dimension','witness'))
     OR jsonb_typeof(e->'dimension')<>'string' OR NOT (e->>'dimension')=ANY(dims)
     OR jsonb_typeof(e->'witness')<>'string' OR (e->>'witness') !~ '^[0-9a-f]{64}$')
    OR (SELECT count(DISTINCT e->>'dimension') FROM jsonb_array_elements(p) e)<>jsonb_array_length(p) THEN
  RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(e->>'dimension',e->>'witness') FROM jsonb_array_elements(p) e),'{}'::jsonb);
END $$;

-- The closed observation, normalized (private: it holds whole ids): {sent, status, n1, n2, term, in, cr, out, cf, dr}, every
-- key present, unknown as JSON null. Fixed message only; nothing of the value is echoed.
CREATE FUNCTION sophia.research_call_observed(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE c jsonb:=p->'rawCounts';
BEGIN
 IF jsonb_typeof(p)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN
     ('sent','httpStatus','n1','n2','providerTerminal','rawCounts','conflicts','deliveryUnknownReason'))
    OR jsonb_typeof(p->'deliveryUnknownReason') IS DISTINCT FROM 'string'
    OR p->>'deliveryUnknownReason' NOT IN ('no_frame_delivered','closed_before_terminal_frame','none')
    OR (p ? 'sent' AND (jsonb_typeof(p->'sent')<>'string' OR p->>'sent' NOT IN ('unknown','observable_transport_response')))
    OR (p ? 'providerTerminal' AND (jsonb_typeof(p->'providerTerminal')<>'string'
     OR p->>'providerTerminal' NOT IN ('completed','incomplete','failed','error_event')))
    OR (p ? 'rawCounts' AND (NOT (p ? 'providerTerminal') OR jsonb_typeof(c)<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('inputTotal','cacheRead','output')))) THEN
  RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023'; END IF;
 IF p ? 'httpStatus' AND sophia.research_call_observed_count(p->'httpStatus') NOT BETWEEN 100 AND 599 THEN
  RAISE EXCEPTION 'Invalid observed facts' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('sent',coalesce(p->>'sent','unknown'),
  'status',CASE WHEN p ? 'httpStatus' THEN to_jsonb(sophia.research_call_observed_count(p->'httpStatus')) END,
  'n1',CASE WHEN p ? 'n1' THEN sophia.research_call_observed_id(p->'n1',ARRAY['created','completed','incomplete','failed']) END,
  'n2',CASE WHEN p ? 'n2' THEN sophia.research_call_observed_id(p->'n2',ARRAY['response_header','typed_error']) END,
  'term',p->'providerTerminal',
  'in',CASE WHEN c ? 'inputTotal' THEN to_jsonb(sophia.research_call_observed_count(c->'inputTotal')) END,
  'cr',CASE WHEN c ? 'cacheRead' THEN to_jsonb(sophia.research_call_observed_count(c->'cacheRead')) END,
  'out',CASE WHEN c ? 'output' THEN to_jsonb(sophia.research_call_observed_count(c->'output')) END,
  'cf',CASE WHEN p ? 'conflicts' THEN sophia.research_call_observed_conflicts(p->'conflicts') ELSE '{}'::jsonb END,
  'dr',p->'deliveryUnknownReason');
END $$;

-- An id's canonical form: s:<sha256 of its UTF-8> or u:<reason>; '-' unknown. Never the id.
CREATE FUNCTION sophia.research_call_observed_id_canonical(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN p IS NULL OR jsonb_typeof(p)='null' THEN '-'
  WHEN p->>'status'='supported' THEN 's:'||encode(sha256(convert_to(p->>'value','UTF8')),'hex') ELSE 'u:'||(p->>'reason') END $$;

-- An observation's fixed-order canonical (022d §6): c2b-facts-v2|sent=|status=|n1=<id>@<sources>|n2=|term=|in=|cr=|out=|
-- cf=<dimension:witness;... in the fixed order>|dr=. Integers base 10, enums exact, ids canonical.
CREATE FUNCTION sophia.research_call_observed_canonical(o jsonb) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT 'c2b-facts-v2|sent='||(o->>'sent')||'|status='||coalesce(o->>'status','-')
  ||'|n1='||CASE WHEN jsonb_typeof(o->'n1')='object' THEN sophia.research_call_observed_id_canonical(o->'n1')||'@'
    ||(SELECT string_agg(e#>>'{}',',' ORDER BY n) FROM jsonb_array_elements(o->'n1'->'sources') WITH ORDINALITY x(e,n)) ELSE '-' END
  ||'|n2='||CASE WHEN jsonb_typeof(o->'n2')='object' THEN sophia.research_call_observed_id_canonical(o->'n2')||'@'
    ||(SELECT string_agg(e#>>'{}',',' ORDER BY n) FROM jsonb_array_elements(o->'n2'->'sources') WITH ORDINALITY x(e,n)) ELSE '-' END
  ||'|term='||coalesce(o->>'term','-')||'|in='||coalesce(o->>'in','-')||'|cr='||coalesce(o->>'cr','-')||'|out='||coalesce(o->>'out','-')
  ||'|cf='||coalesce((SELECT string_agg(d||':'||(o->'cf'->>d),';' ORDER BY n)
    FROM unnest(sophia.research_call_observed_dimensions()) WITH ORDINALITY x(d,n) WHERE o->'cf' ? d),'-')
  ||'|dr='||(o->>'dr') $$;

-- The canonical of an observation that knows nothing: it keeps the exact v1 digest and receipt (V02).
CREATE FUNCTION sophia.research_call_observed_unknown() RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT 'c2b-facts-v2|sent=unknown|status=-|n1=-|n2=-|term=-|in=-|cr=-|out=-|cf=-|dr=no_frame_delivered'::text $$;

-- An opted-in settlement's observation, normalized, or NULL when it carries none or only the all-unknown one.
CREATE FUNCTION sophia.research_call_observed_of(p_evidence jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE o jsonb;
BEGIN
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' OR NOT (p_evidence ? 'observed') THEN RETURN NULL; END IF;
 o:=sophia.research_call_observed(p_evidence->'observed');
 RETURN CASE WHEN sophia.research_call_observed_canonical(o)=sophia.research_call_observed_unknown() THEN NULL ELSE o END;
END $$;

-- An opted-in settlement without its observation, for 0109's closed A57 facts (anything else is left to them to refuse).
CREATE FUNCTION sophia.research_call_without_observed(p_request jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN jsonb_typeof(p_request->'evidence')='object' THEN jsonb_set(p_request,'{evidence}',(p_request->'evidence')-'observed')
  ELSE p_request END $$;

-- research_call_fact_digest (0109), replaced: the EXACT v1 digest when the facts carry no observation; otherwise
-- research-call-facts-v2 over the same field list plus the observation's canonical.
CREATE OR REPLACE FUNCTION sophia.research_call_fact_digest(i sophia.research_call_identities, f sophia.research_call_fact) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT encode(sha256(convert_to(concat_ws('|',CASE WHEN f.observed IS NULL THEN 'research-call-facts-v1' ELSE 'research-call-facts-v2' END,
  i.evidence_id::text,i.mode,i.contract,f.report,
  f.noncached_input_class,coalesce(f.noncached_input::text,'-'),f.cache_read_class,coalesce(f.cache_read::text,'-'),
  f.cache_write_class,coalesce(f.cache_write::text,'-'),f.output_class,coalesce(f.output::text,'-'),f.consumer_ending,
  'provider_terminal=unknown',f.outcome,coalesce(f.cost_usd::text,'-'),f.response_id_status,coalesce(f.response_id_sha256,'-'),
  coalesce(f.response_id_reason,'-'),coalesce(f.response_id_correlation,'-'),'header=unknown',f.observed),'UTF8')),'hex') $$;

-- --- merge, cross check and witnesses (022d §3, SI02, SI04) ---------------------------------------------------------------

-- A conflict witness: sha256("c2b-conflict-v1|<dimension>|<competing canonical>"); never the raw competing value.
CREATE FUNCTION sophia.research_call_observed_witness(p_dimension text, p_competing text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT encode(sha256(convert_to('c2b-conflict-v1|'||p_dimension||'|'||p_competing,'UTF8')),'hex') $$;

-- The observed truth of a truth row, in the normalized form (cf = its retained witnesses; dr NULL when never observed).
CREATE FUNCTION sophia.research_call_truth_observed(t sophia.research_call_truth) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('sent',t.sent,'status',t.http_status,
  'n1',CASE t.n1_status WHEN 'supported' THEN jsonb_build_object('status','supported','value',t.n1,'sources',to_jsonb(t.n1_sources))
   WHEN 'identity_unsupported' THEN jsonb_build_object('status','identity_unsupported','reason',t.n1_reason,'sources',to_jsonb(t.n1_sources)) END,
  'n2',CASE t.header_id_status WHEN 'supported' THEN jsonb_build_object('status','supported','value',t.header_id,'sources',to_jsonb(t.header_id_sources))
   WHEN 'identity_unsupported' THEN jsonb_build_object('status','identity_unsupported','reason',t.header_id_reason,'sources',to_jsonb(t.header_id_sources)) END,
  'term',CASE WHEN t.provider_terminal<>'unknown' THEN t.provider_terminal END,'in',t.raw_input_total,'cr',t.raw_cache_read,'out',t.raw_output,
  'cf',jsonb_strip_nulls(jsonb_build_object('n1',t.w_n1,'n2',t.w_n2,'http_status',t.w_http_status,'provider_terminal',t.w_provider_terminal,
   'input_total',t.w_input_total,'cache_read',t.w_cache_read,'output',t.w_output,'cross_c1p',t.w_cross_c1p)),
  'dr',t.delivery) $$;

-- Merge one observed id into the known one: {id, gained, competing} (competing: the new canonical when they contradict).
CREATE FUNCTION sophia.research_call_observed_id_merge(p_old jsonb, p_new jsonb, p_order text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE c_old text:=sophia.research_call_observed_id_canonical(p_old); c_new text:=sophia.research_call_observed_id_canonical(p_new);
 u jsonb;
BEGIN
 IF c_new='-' THEN RETURN jsonb_build_object('id',p_old,'gained',false); END IF;
 IF c_old='-' THEN RETURN jsonb_build_object('id',p_new,'gained',true); END IF;
 IF c_old=c_new THEN -- the same id: its sources are unioned (a provenance gain), in the fixed order
  u:=(SELECT jsonb_agg(x ORDER BY array_position(p_order,x)) FROM unnest(p_order) x
   WHERE p_old->'sources' ? x OR p_new->'sources' ? x);
  RETURN jsonb_build_object('id',jsonb_set(p_old,'{sources}',u),'gained',u<>(p_old->'sources'));
 END IF;
 IF p_old->>'status'='identity_unsupported' AND p_new->>'status'='supported' THEN RETURN jsonb_build_object('id',p_new,'gained',true); END IF;
 IF p_old->>'status'='supported' AND p_new->>'status'='identity_unsupported' THEN RETURN jsonb_build_object('id',p_old,'gained',false); END IF;
 RETURN jsonb_build_object('id',p_old,'gained',false,'competing',c_new);
END $$;

-- Merge a new observation into the known one, first-known and monotone. Returns {o: the merged observation, gained: any
-- knowledge gain, w: {dimension: witness} of every contradiction this input shows against the known truth or reports}.
CREATE FUNCTION sophia.research_call_observed_merge(p_old jsonb, p_new jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE o jsonb:=p_old; n jsonb:=p_new; w jsonb:='{}'; gained boolean:=false; m jsonb; d text; k text;
 stages text[]:=ARRAY['no_frame_delivered','closed_before_terminal_frame','none'];
BEGIN
 IF o->>'sent'='unknown' AND n->>'sent'<>'unknown' THEN o:=jsonb_set(o,'{sent}',n->'sent'); gained:=true; END IF;
 IF jsonb_typeof(n->'status')='number' THEN
  IF jsonb_typeof(o->'status')<>'number' THEN o:=jsonb_set(o,'{status}',n->'status'); gained:=true;
  ELSIF o->'status'<>n->'status' THEN w:=w||jsonb_build_object('http_status',sophia.research_call_observed_witness('http_status',n->>'status'));
  END IF;
 END IF;
 FOREACH d IN ARRAY ARRAY['n1','n2'] LOOP
  m:=sophia.research_call_observed_id_merge(o->d,n->d,CASE d WHEN 'n1' THEN ARRAY['created','completed','incomplete','failed']
   ELSE ARRAY['response_header','typed_error'] END);
  o:=jsonb_set(o,ARRAY[d],m->'id'); gained:=gained OR (m->>'gained')::boolean;
  IF m ? 'competing' THEN w:=w||jsonb_build_object(d,sophia.research_call_observed_witness(d,m->>'competing')); END IF;
 END LOOP;
 IF jsonb_typeof(n->'term')='string' THEN
  IF jsonb_typeof(o->'term')<>'string' THEN -- a first terminal brings its own counts (none were known without it)
   o:=o||jsonb_build_object('term',n->'term','in',n->'in','cr',n->'cr','out',n->'out'); gained:=true;
  ELSIF o->'term'<>n->'term' THEN -- another terminal: a contradiction; its counts are not merged
   w:=w||jsonb_build_object('provider_terminal',sophia.research_call_observed_witness('provider_terminal',n->>'term'));
  ELSE
   FOREACH k IN ARRAY ARRAY['in','cr','out'] LOOP
    IF jsonb_typeof(n->k)='number' THEN
     IF jsonb_typeof(o->k)<>'number' THEN o:=jsonb_set(o,ARRAY[k],n->k); gained:=true;
     ELSIF o->k<>n->k THEN d:=CASE k WHEN 'in' THEN 'input_total' WHEN 'cr' THEN 'cache_read' ELSE 'output' END;
      w:=w||jsonb_build_object(d,sophia.research_call_observed_witness(d,n->>k));
     END IF;
    END IF;
   END LOOP;
  END IF;
 END IF;
 IF jsonb_typeof(o->'dr')<>'string' OR array_position(stages,n->>'dr')>array_position(stages,o->>'dr') THEN
  o:=jsonb_set(o,'{dr}',n->'dr'); gained:=true; END IF;
 -- A reported witness is a contradiction the producer saw, kept for any of the eight dimensions (R1 F01, cross_c1p
 -- included); the service's own witness of the same dimension in this input comes first (the service cross is added by
 -- research_call_observe over it).
 FOR k IN SELECT jsonb_object_keys(n->'cf') LOOP
  IF NOT w ? k THEN w:=w||jsonb_build_object(k,n->'cf'->>k); END IF;
 END LOOP;
 RETURN jsonb_build_object('o',o,'gained',gained,'w',w,'reported',n->'cf'<>'{}'::jsonb);
END $$;

-- The A57 side of a cross check: {n1: id canonical or null, nci, cr, out: known counts or null}.
CREATE FUNCTION sophia.research_call_a57_side(p_status text, p_id text, p_reason text, p_nci bigint, p_cr bigint, p_out bigint)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('n1',CASE p_status WHEN 'supported' THEN 's:'||encode(sha256(convert_to(p_id,'UTF8')),'hex')
   WHEN 'identity_unsupported' THEN 'u:'||p_reason END,'nci',p_nci,'cr',p_cr,'out',p_out) $$;

-- The A57 side of a truth merged with new facts as 0109's extension would merge them (known values first).
CREATE FUNCTION sophia.research_call_a57_merged(t sophia.research_call_truth, f sophia.research_call_fact, p_extends boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.research_call_a57_side(
  CASE WHEN p_extends AND (t.response_id_status='unknown' OR (t.response_id_status='identity_unsupported' AND f.response_id_status='supported'))
   THEN f.response_id_status ELSE t.response_id_status END,
  CASE WHEN p_extends AND (t.response_id_status='unknown' OR (t.response_id_status='identity_unsupported' AND f.response_id_status='supported'))
   THEN f.response_id ELSE t.response_id END,
  CASE WHEN p_extends AND t.response_id_status='unknown' THEN f.response_id_reason ELSE t.response_id_reason END,
  CASE WHEN t.noncached_input_class='known' THEN t.noncached_input WHEN p_extends AND f.noncached_input_class='known' THEN f.noncached_input END,
  CASE WHEN t.cache_read_class='known' THEN t.cache_read WHEN p_extends AND f.cache_read_class='known' THEN f.cache_read END,
  CASE WHEN t.output_class='known' THEN t.output WHEN p_extends AND f.output_class='known' THEN f.output END) $$;

-- SI04: the grouped cross_c1p competing canonical of the two sides compared when they contradict, else NULL. N1 is the
-- same namespace as A57's responseId (both supported and different contradict); counts compare in exact integers and an
-- unknown side is never subtracted or assumed zero (R3).
CREATE FUNCTION sophia.research_call_cross(a jsonb, o jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE on1 text:=sophia.research_call_observed_id_canonical(o->'n1');
BEGIN
 -- Each side is checked only when both of its values are known; an unknown side is never a contradiction (no NULL logic).
 IF NOT (coalesce(a->>'n1' LIKE 's:%' AND on1 LIKE 's:%' AND a->>'n1'<>on1,false)
    OR coalesce(jsonb_typeof(a->'nci')='number' AND jsonb_typeof(a->'cr')='number' AND jsonb_typeof(o->'in')='number'
     AND (a->>'nci')::numeric+(a->>'cr')::numeric<>(o->>'in')::numeric,false)
    OR coalesce(jsonb_typeof(a->'cr')='number' AND jsonb_typeof(o->'cr')='number' AND a->'cr'<>o->'cr',false)
    OR coalesce(jsonb_typeof(a->'out')='number' AND jsonb_typeof(o->'out')='number' AND a->'out'<>o->'out',false)) THEN
  RETURN NULL; END IF;
 RETURN 'a57_n1='||coalesce(a->>'n1','-')||'|observed_n1='||on1||'|a57_noncached_input='||coalesce(a->>'nci','-')
  ||'|a57_cache_read='||coalesce(a->>'cr','-')||'|a57_output='||coalesce(a->>'out','-')||'|observed_input_total='||coalesce(o->>'in','-')
  ||'|observed_cache_read='||coalesce(o->>'cr','-')||'|observed_output='||coalesce(o->>'out','-');
END $$;

-- Merge an opted-in input's observation into the truth's and classify it BEFORE any money: {o, gained, w, conflict}, where
-- conflict is 'observed_changed' (a contradiction or a reported witness), 'cross_changed' (SI04) or absent.
CREATE FUNCTION sophia.research_call_observe(p_truth jsonb, o jsonb, p_a57 jsonb, p_changes boolean) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE m jsonb:=CASE WHEN o IS NULL THEN jsonb_build_object('o',p_truth,'gained',false,'w','{}'::jsonb,'reported',false)
  ELSE sophia.research_call_observed_merge(p_truth,o) END;
 x text:=CASE WHEN m->'o'->>'dr' IS NULL THEN NULL ELSE sophia.research_call_cross(p_a57,m->'o') END;
 -- R1 F01: the service's grouped cross witness, over a producer's cross of the same input (a stored one still wins).
 sx jsonb:=CASE WHEN x IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('cross_c1p',sophia.research_call_observed_witness('cross_c1p',x)) END;
BEGIN
 IF m->'w'<>'{}'::jsonb OR (m->>'reported')::boolean THEN
  RETURN m||jsonb_build_object('conflict','observed_changed','w',(m->'w')||sx); END IF;
 -- A cross contradiction already retained is not a new one when this input adds nothing.
 IF x IS NOT NULL AND (p_changes OR (m->>'gained')::boolean) THEN
  RETURN m||jsonb_build_object('conflict','cross_changed','w',jsonb_build_object('cross_c1p',sophia.research_call_observed_witness('cross_c1p',x)));
 END IF;
 RETURN m;
END $$;

-- Write a merge into the truth: its knowledge when p_apply (never on a later contradiction), and every witness whose
-- dimension has none yet (sticky); then the truth's digest over its merged facts and observation.
CREATE FUNCTION sophia.research_call_observed_write(i sophia.research_call_identities, t sophia.research_call_truth, m jsonb, p_apply boolean)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE o jsonb:=CASE WHEN p_apply THEN m->'o' ELSE sophia.research_call_truth_observed(t) END; w jsonb:=m->'w';
 n sophia.research_call_truth; f sophia.research_call_fact;
BEGIN
 UPDATE sophia.research_call_truth SET delivery=o->>'dr', sent=o->>'sent', http_status=(o->>'status')::integer,
  n1_status=coalesce(o->'n1'->>'status','unknown'), n1=o->'n1'->>'value', n1_reason=o->'n1'->>'reason',
  n1_sources=(SELECT array_agg(e ORDER BY x) FROM jsonb_array_elements_text(o->'n1'->'sources') WITH ORDINALITY y(e,x)),
  header_id_status=coalesce(o->'n2'->>'status','unknown'), header_id=o->'n2'->>'value', header_id_reason=o->'n2'->>'reason',
  header_id_sources=(SELECT array_agg(e ORDER BY x) FROM jsonb_array_elements_text(o->'n2'->'sources') WITH ORDINALITY y(e,x)),
  provider_terminal=coalesce(o->>'term','unknown'), raw_input_total=(o->>'in')::bigint, raw_cache_read=(o->>'cr')::bigint,
  raw_output=(o->>'out')::bigint,
  w_n1=coalesce(w_n1,w->>'n1'), w_n2=coalesce(w_n2,w->>'n2'), w_http_status=coalesce(w_http_status,w->>'http_status'),
  w_provider_terminal=coalesce(w_provider_terminal,w->>'provider_terminal'), w_input_total=coalesce(w_input_total,w->>'input_total'),
  w_cache_read=coalesce(w_cache_read,w->>'cache_read'), w_output=coalesce(w_output,w->>'output'),
  w_cross_c1p=coalesce(w_cross_c1p,w->>'cross_c1p'), updated_at=clock_timestamp()
 WHERE project_id=t.project_id AND reservation_id=t.reservation_id RETURNING * INTO n;
 f:=(n.digest,n.report,n.noncached_input_class,n.noncached_input,n.cache_read_class,n.cache_read,n.cache_write_class,n.cache_write,
  n.output_class,n.output,n.consumer_ending,n.outcome,n.cost_usd,n.response_id_status,n.response_id,
  CASE WHEN n.response_id IS NULL THEN NULL ELSE encode(sha256(convert_to(n.response_id,'UTF8')),'hex') END,n.response_id_reason,
  n.response_id_correlation,NULL)::sophia.research_call_fact;
 f.observed:=CASE WHEN n.delivery IS NULL THEN NULL ELSE sophia.research_call_observed_canonical(sophia.research_call_truth_observed(n)) END;
 IF f.observed=sophia.research_call_observed_unknown() THEN f.observed:=NULL; END IF;
 UPDATE sophia.research_call_truth SET digest=sophia.research_call_fact_digest(i,f) WHERE project_id=t.project_id AND reservation_id=t.reservation_id;
END $$;

-- research_call_retain (0109), replaced: the same, plus the input observation's canonical (ids by digest only).
CREATE OR REPLACE FUNCTION sophia.research_call_retain(t sophia.research_call_truth, f sophia.research_call_fact, p_disposition text) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF t.history_count>=16 THEN
  UPDATE sophia.research_call_truth SET first_overflow_digest=coalesce(first_overflow_digest,f.digest),
   first_overflow_at=coalesce(first_overflow_at,clock_timestamp()) WHERE project_id=t.project_id AND reservation_id=t.reservation_id;
  RETURN true;
 END IF;
 INSERT INTO sophia.research_call_history(project_id,reservation_id,ordinal,digest,disposition,report,noncached_input_class,noncached_input,
  cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status,
  response_id_sha256,response_id_reason,observed)
 VALUES(t.project_id,t.reservation_id,t.history_count+1,f.digest,p_disposition,f.report,f.noncached_input_class,f.noncached_input,
  f.cache_read_class,f.cache_read,f.cache_write_class,f.cache_write,f.output_class,f.output,f.consumer_ending,f.outcome,f.cost_usd,
  f.response_id_status,f.response_id_sha256,f.response_id_reason,f.observed);
 UPDATE sophia.research_call_truth SET history_count=history_count+1 WHERE project_id=t.project_id AND reservation_id=t.reservation_id;
 RETURN false;
END $$;

-- --- the fact writer -------------------------------------------------------------------------------------------------------

-- research_call_settle (0109), replaced: identical for a facts_version 1 call (no observation is read or written; its
-- digests are the literal v1 ones). An opted-in call's observation is merged and classified BEFORE any money helper: a
-- contradiction is a retained conflict that moves no money; an observation-only gain is 'extended' and never calls the money
-- path. The lock order is 0109's: allowance -> reservation (end_research_reservation's order) -> truth, then the account
-- guard LAST on a conflict or past the cap.
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
 -- A conflict, or an input past the cap (the first overflow, valid or not: F01), restricts its original scope, sticky.
 IF disposition='conflict' OR capped THEN
  PERFORM sophia.research_call_restrict_allowance(i);
  -- LAST: the account's guard (initialized at reserve under the account row); no lock is taken after it.
  IF i.account_id IS NOT NULL THEN
   UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=clock_timestamp(), first_project_id=p_project,
    first_reservation_id=p_reservation WHERE account_id=i.account_id AND NOT restricted;
  END IF;
 END IF;
 RETURN jsonb_build_object('disposition',CASE WHEN capped AND disposition='subsumed' THEN 'capped' ELSE disposition END,
  'replay',false,'capped',capped,'digest',f.digest);
END $$;

-- --- privileges ------------------------------------------------------------------------------------------------------------
-- Replaced functions keep their grants (CREATE OR REPLACE). The new helpers are reachable only through the SECURITY
-- DEFINER wrappers that call them; the evidence tables stay readable by no application role.
REVOKE ALL ON FUNCTION sophia.research_call_observed_monotone(), sophia.research_call_facts_version(jsonb),
 sophia.research_call_observed_count(jsonb), sophia.research_call_observed_id(jsonb,text[]), sophia.research_call_observed_dimensions(),
 sophia.research_call_observed_conflicts(jsonb), sophia.research_call_observed(jsonb), sophia.research_call_observed_id_canonical(jsonb),
 sophia.research_call_observed_canonical(jsonb), sophia.research_call_observed_unknown(), sophia.research_call_observed_of(jsonb),
 sophia.research_call_without_observed(jsonb), sophia.research_call_observed_witness(text,text),
 sophia.research_call_truth_observed(sophia.research_call_truth), sophia.research_call_observed_id_merge(jsonb,jsonb,text[]),
 sophia.research_call_observed_merge(jsonb,jsonb), sophia.research_call_a57_side(text,text,text,bigint,bigint,bigint),
 sophia.research_call_a57_merged(sophia.research_call_truth,sophia.research_call_fact,boolean), sophia.research_call_cross(jsonb,jsonb),
 sophia.research_call_observe(jsonb,jsonb,jsonb,boolean),
 sophia.research_call_observed_write(sophia.research_call_identities,sophia.research_call_truth,jsonb,boolean) FROM PUBLIC;

COMMIT;
