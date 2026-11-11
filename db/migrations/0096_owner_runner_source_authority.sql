-- INC01-CC-005 (SOPHIA-INC-2026-11, INC01-S1 / C02), contract amendment A50: owner-runner source authority.
-- docs/plans/owner-runner-source-authority.md. A native create or input now freezes what it may read and where and how it
-- runs, and every crossing that can still stop an effect or a disclosure rechecks it:
-- * Its instruction (create: message and title; input: message) is an OWNER-PRIVATE source (owner_runner_put_private;
--   never put_text_source, which publishes to the project). Its selected project sources are frozen with their hashes
--   and revisions (owner_runner_operation_sources) and their dependencies are followed by source_closure (0033). Each
--   create and EACH input has its own payload, selection and context manifest; an input's selection is a subset of its
--   create's, and nothing of an earlier operation is ever appended to.
-- * Repository root, a requested 40-hex base, write scope read_only and the exact requested settings (T3 pin ade47301
--   ModelSelection {instanceId, model, options:[{id, value}]}) inside the route's operator-declared source policy. These
--   are requests: nothing here records what an adapter accepted or what a run used, which stay unknown.
-- * Envelope v2 (content-free: payloadSha256, manifestSha256, baseCommit, writeScope, settings; no message or title).
--   v1 rows keep their 0092 envelope byte for byte. A Stop is always v1: it carries no content and is source-exempt
--   under its existing qualified route only. New creates and inputs are v2; an unsent v1 create or input is denied.
-- * One recheck (owner_runner_source_ineligible inside a replaced owner_runner_ineligible, now judged at
--   clock_timestamp()) serves admission, prepare-send, 0093 host delivery and GO. GO hands the payload to the owner's
--   host only when it grants. mission_erase_source (0041) keeps its research and design revocations and then fences
--   runner work that drew on the erased source, project lock first (every caller already holds it). After a possible
--   send nothing is reset, replayed or refunded, and no unsend is pretended: a delivered native copy cannot be recalled.
-- 0001-0095 are not edited. Replaced with the same signatures: admit_owner_runner_operation, owner_runner_envelope,
-- owner_runner_ineligible, owner_runner_prepare_send (0092), owner_host_go (0093), mission_erase_source (0041).
BEGIN;

-- --- records ---------------------------------------------------------------------------------------------------------

-- The settings a route may be asked for: declared by an operator with the qualification, never by a request.
ALTER TABLE sophia.owner_runner_qualifications ADD COLUMN source_policy jsonb
 CHECK(source_policy IS NULL OR jsonb_typeof(source_policy)='object');

ALTER TABLE sophia.owner_runner_operations
 ADD COLUMN envelope_version smallint NOT NULL DEFAULT 1 CHECK(envelope_version IN (1,2)),
 ADD COLUMN payload_source_id uuid, ADD COLUMN payload_sha256 text CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 ADD COLUMN manifest_id uuid, ADD COLUMN manifest_sha256 text CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 ADD COLUMN repository_root text CHECK(repository_root IS NULL OR length(repository_root) BETWEEN 1 AND 1000),
 ADD COLUMN base_commit text CHECK(base_commit ~ '^[0-9a-f]{40}$'),
 ADD COLUMN write_scope text CHECK(write_scope='read_only'),
 ADD COLUMN requested_settings jsonb CHECK(requested_settings IS NULL OR jsonb_typeof(requested_settings)='object'),
 -- Set once when a source it drew on is erased: a reason and an event, never a state change after a possible send.
 ADD COLUMN source_withdrawn_at timestamptz,
 ADD FOREIGN KEY(project_id,payload_source_id) REFERENCES sophia.source_objects(project_id,id),
 ADD FOREIGN KEY(project_id,manifest_id) REFERENCES sophia.context_manifests(project_id,id);
-- 0092's inline-text checks hold for v1 only: a v2 row keeps no message or title inline.
ALTER TABLE sophia.owner_runner_operations DROP CONSTRAINT owner_runner_operations_check1,
 DROP CONSTRAINT owner_runner_operations_check2;
ALTER TABLE sophia.owner_runner_operations
 ADD CONSTRAINT owner_runner_v1_text CHECK(envelope_version=2 OR ((kind='stop')=(message IS NULL) AND (kind='create')=(title IS NOT NULL))),
 ADD CONSTRAINT owner_runner_v1_no_source_facts CHECK(envelope_version=2 OR (payload_source_id IS NULL AND payload_sha256 IS NULL
  AND manifest_id IS NULL AND manifest_sha256 IS NULL AND repository_root IS NULL AND base_commit IS NULL AND write_scope IS NULL
  AND requested_settings IS NULL AND source_withdrawn_at IS NULL)),
 ADD CONSTRAINT owner_runner_v2_facts CHECK(envelope_version=1 OR (kind IN ('create','input') AND message IS NULL AND title IS NULL
  AND payload_source_id IS NOT NULL AND payload_sha256 IS NOT NULL AND manifest_id IS NOT NULL AND manifest_sha256 IS NOT NULL
  AND repository_root IS NOT NULL AND base_commit IS NOT NULL AND write_scope IS NOT NULL AND requested_settings IS NOT NULL));
CREATE INDEX owner_runner_by_payload ON sophia.owner_runner_operations(project_id,payload_source_id) WHERE payload_source_id IS NOT NULL;

-- The project sources one operation was admitted with, as they were. Immutable: an input has its own rows.
CREATE TABLE sophia.owner_runner_operation_sources (
 project_id uuid NOT NULL, operation_id uuid NOT NULL, source_id uuid NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), eligibility_revision bigint NOT NULL CHECK(eligibility_revision>0),
 PRIMARY KEY(project_id,operation_id,source_id),
 FOREIGN KEY(project_id,operation_id) REFERENCES sophia.owner_runner_operations(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE INDEX owner_runner_sources_by_source ON sophia.owner_runner_operation_sources(project_id,source_id);
ALTER TABLE sophia.owner_runner_operation_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.owner_runner_operation_sources FROM PUBLIC;

-- What admission froze never changes: the version, the payload, the context, the base, the scope, the settings, the
-- request and any inline text. A withdrawal mark is set once.
CREATE FUNCTION sophia.owner_runner_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_TABLE_NAME='owner_runner_operation_sources' THEN
  RAISE EXCEPTION 'An operation''s admitted sources are immutable' USING ERRCODE='55000'; END IF;
 IF NEW.envelope_version IS DISTINCT FROM OLD.envelope_version OR NEW.payload_source_id IS DISTINCT FROM OLD.payload_source_id
    OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256 OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
    OR NEW.manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256 OR NEW.repository_root IS DISTINCT FROM OLD.repository_root
    OR NEW.base_commit IS DISTINCT FROM OLD.base_commit OR NEW.write_scope IS DISTINCT FROM OLD.write_scope
    OR NEW.requested_settings IS DISTINCT FROM OLD.requested_settings OR NEW.semantic IS DISTINCT FROM OLD.semantic
    OR NEW.payload_digest IS DISTINCT FROM OLD.payload_digest OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.title IS DISTINCT FROM OLD.title
    OR (OLD.source_withdrawn_at IS NOT NULL AND NEW.source_withdrawn_at IS DISTINCT FROM OLD.source_withdrawn_at) THEN
  RAISE EXCEPTION 'An operation''s admitted facts are immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.owner_runner_frozen() FROM PUBLIC;
CREATE TRIGGER owner_runner_frozen BEFORE UPDATE ON sophia.owner_runner_operations
 FOR EACH ROW EXECUTE FUNCTION sophia.owner_runner_frozen();
CREATE TRIGGER owner_runner_sources_frozen BEFORE UPDATE OR DELETE ON sophia.owner_runner_operation_sources
 FOR EACH ROW EXECUTE FUNCTION sophia.owner_runner_frozen();

-- --- helpers ---------------------------------------------------------------------------------------------------------

-- The instruction's canonical JSON (Sophia's canonicalJson: sorted keys, no whitespace; to_json escapes as
-- JSON.stringify does). Its SHA-256 is the payload digest; the gateway hashes these exact bytes.
CREATE FUNCTION sophia.owner_runner_payload_body(p_message text, p_title text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT '{"message":'||to_json(p_message)::text||',"title":'||coalesce(to_json(p_title)::text,'null')||'}' $$;

-- Repair 1 (CC005-E7-F03): blank as the gateway judges it (JavaScript's String.prototype.trim removes exactly these
-- characters: tab to carriage return, space, no-break space, the Zs separators and the line and paragraph separators,
-- and the byte-order mark). Lengths are length(), code points, as the declared maxLength and the gateway count them.
CREATE FUNCTION sophia.owner_runner_blank(p_text text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$ SELECT p_text ~ '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$' $$;

CREATE FUNCTION sophia.owner_runner_sha256(p_text text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$ SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex') $$;

-- An owner-private source: readable by its owner alone (0002 eligible_sources_read), never eligible for the project.
CREATE FUNCTION sophia.owner_runner_put_private(p_project uuid, p_owner uuid, p_mime text, p_body text) RETURNS sophia.source_objects
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.source_objects; sid uuid:=gen_random_uuid();
BEGIN
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
 VALUES(p_project,sid,p_owner,'private',sophia.owner_runner_sha256(p_body),p_mime,'inline/'||p_project||'/'||sid,
  octet_length(p_body),false,'ready') RETURNING * INTO s;
 INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES(p_project,sid,p_body);
 RETURN s;
END $$;

-- A private source's text, only while it is exactly what was frozen: present, ready, private, its owner's, and hashing
-- to the digest kept with the operation. NULL otherwise (erased, altered, or never this).
CREATE FUNCTION sophia.owner_runner_private_text(p_project uuid, p_source uuid, p_owner uuid, p_sha256 text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT t.body FROM sophia.source_objects s JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
 WHERE s.project_id=p_project AND s.id=p_source AND s.owner_id=p_owner AND s.scope='private' AND s.state='ready'
  AND s.sha256=p_sha256 AND sophia.owner_runner_sha256(t.body)=p_sha256 $$;

CREATE FUNCTION sophia.owner_runner_json_string(v jsonb, p_pattern text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$ SELECT coalesce(jsonb_typeof(v)='string' AND (v #>> '{}') ~ p_pattern, false) $$;

-- Why a route's declared source policy is malformed, or NULL. {v:1, instanceId, models:[{model, options:[{id, values}]}]}:
-- the T3 pin's ProviderInstanceId slug, model names and provider option ids (Codex reasoningEffort, Claude effort) with
-- the values the qualified profile's catalog declared. No value is invented here.
CREATE FUNCTION sophia.owner_runner_policy_refusal(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE m jsonb; o jsonb; v jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) IS DISTINCT FROM ARRAY['instanceId','models','v']
    OR p->'v' IS DISTINCT FROM '1'::jsonb THEN RETURN 'a policy is {v:1, instanceId, models}'; END IF;
 IF NOT sophia.owner_runner_json_string(p->'instanceId','^[a-zA-Z][a-zA-Z0-9_-]{0,63}$') THEN RETURN 'instanceId is not a provider instance id'; END IF;
 IF jsonb_typeof(p->'models') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'models') NOT BETWEEN 1 AND 20 THEN
  RETURN 'models is a list of 1 to 20'; END IF;
 IF (SELECT count(DISTINCT x->'model') FROM jsonb_array_elements(p->'models') x)<>jsonb_array_length(p->'models') THEN
  RETURN 'a model is declared once'; END IF;
 FOR m IN SELECT x FROM jsonb_array_elements(p->'models') x LOOP
  IF jsonb_typeof(m) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(m) k) IS DISTINCT FROM ARRAY['model','options']
     OR NOT sophia.owner_runner_json_string(m->'model','^\S(.{0,198}\S)?$')
     OR jsonb_typeof(m->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(m->'options')>10 THEN
   RETURN 'a model is {model, options}'; END IF;
  IF (SELECT count(DISTINCT x->'id') FROM jsonb_array_elements(m->'options') x)<>jsonb_array_length(m->'options') THEN
   RETURN 'an option is declared once per model'; END IF;
  FOR o IN SELECT x FROM jsonb_array_elements(m->'options') x LOOP
   IF jsonb_typeof(o) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(o) k) IS DISTINCT FROM ARRAY['id','values']
      OR NOT sophia.owner_runner_json_string(o->'id','^[A-Za-z][A-Za-z0-9_.-]{0,99}$')
      OR jsonb_typeof(o->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(o->'values') NOT BETWEEN 1 AND 20
      OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(o->'values') x)<>jsonb_array_length(o->'values') THEN
    RETURN 'an option is {id, values}'; END IF;
   FOR v IN SELECT x FROM jsonb_array_elements(o->'values') x LOOP
    IF NOT (jsonb_typeof(v)='boolean' OR sophia.owner_runner_json_string(v,'^\S(.{0,198}\S)?$')) THEN
     RETURN 'an option value is a non-blank string or a boolean'; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN NULL;
END $$;

-- Why requested settings are not allowed by a policy, or NULL. Exactly {instanceId, model, options}; options sorted by
-- id, each declared option of the model given exactly once with one of its declared values (strings and booleans are
-- distinct). No default and no fallback: anything the policy does not declare is refused.
CREATE FUNCTION sophia.owner_runner_settings_refusal(p_policy jsonb, s jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE m jsonb; ids text[];
BEGIN
 IF p_policy IS NULL THEN RETURN 'no source policy is declared for this route'; END IF;
 IF sophia.owner_runner_policy_refusal(p_policy) IS NOT NULL THEN RETURN 'its declared source policy is malformed'; END IF;
 IF jsonb_typeof(s) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s) k) IS DISTINCT FROM ARRAY['instanceId','model','options']
    OR jsonb_typeof(s->'options') IS DISTINCT FROM 'array' THEN RETURN 'settings are {instanceId, model, options}'; END IF;
 IF s->'instanceId' IS DISTINCT FROM p_policy->'instanceId' THEN RETURN 'its provider instance is not the route''s'; END IF;
 SELECT x INTO m FROM jsonb_array_elements(p_policy->'models') x WHERE x->'model'=s->'model';
 IF m IS NULL THEN RETURN 'its model is not declared for the route'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'options') o WHERE jsonb_typeof(o) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(o) k) IS DISTINCT FROM ARRAY['id','value']
    OR jsonb_typeof(o->'id') IS DISTINCT FROM 'string') THEN
  RETURN 'an option is {id, value}'; END IF;
 ids:=ARRAY(SELECT o->>'id' FROM jsonb_array_elements(s->'options') WITH ORDINALITY AS e(o,n) ORDER BY n);
 IF ids IS DISTINCT FROM ARRAY(SELECT x FROM unnest(ids) x ORDER BY x COLLATE "C")
    OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN
  RETURN 'options are sorted by id, each once'; END IF;
 IF ids IS DISTINCT FROM ARRAY(SELECT o->>'id' FROM jsonb_array_elements(m->'options') o ORDER BY o->>'id' COLLATE "C") THEN
  RETURN 'its options are not exactly the model''s declared options'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'options') o WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(m->'options') d WHERE d->'id'=o->'id' AND d->'values' @> jsonb_build_array(o->'value'))) THEN
  RETURN 'an option value is not declared for the route'; END IF;
 RETURN NULL;
END $$;

-- Operator: declare a qualification's source policy. Migration owner only. A declaration is a new revision of the
-- route, so work admitted under the earlier one is denied at its next recheck, never moved.
CREATE FUNCTION sophia.declare_owner_runner_source_policy(p_project uuid, p_qualification uuid, p_policy jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE why text:=sophia.owner_runner_policy_refusal(p_policy);
BEGIN
 IF why IS NOT NULL THEN RAISE EXCEPTION 'Invalid source policy: %', why USING ERRCODE='22023'; END IF;
 UPDATE sophia.owner_runner_qualifications SET source_policy=p_policy, revision=revision+1
  WHERE project_id=p_project AND id=p_qualification AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Qualification not found' USING ERRCODE='22023'; END IF;
END $$;

-- --- the recheck -----------------------------------------------------------------------------------------------------

-- Why one v2 create's or input's own frozen context is no longer intact, or NULL: its withdrawal mark, its private
-- instruction, its context manifest, and each source it selected (as frozen: hash and revision) with everything that
-- source drew on (source_closure, 0033). Private payload eligibility is its own check, distinct from the project-only
-- source_withdrawn, which still judges the selected sources.
CREATE FUNCTION sophia.owner_runner_context_ineligible(o sophia.owner_runner_operations) RETURNS text LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE man sophia.context_manifests;
BEGIN
 IF o.source_withdrawn_at IS NOT NULL THEN RETURN 'a source it was admitted with was withdrawn'; END IF;
 IF sophia.owner_runner_private_text(o.project_id,o.payload_source_id,o.owner_id,o.payload_sha256) IS NULL THEN
  RETURN 'its private instruction was withdrawn or altered'; END IF;
 SELECT * INTO man FROM sophia.context_manifests WHERE project_id=o.project_id AND id=o.manifest_id;
 IF NOT FOUND OR man.state<>'eligible'
    OR sophia.owner_runner_private_text(o.project_id,man.body_source_id,o.owner_id,o.manifest_sha256) IS NULL THEN
  RETURN 'its context manifest was retired or altered'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.owner_runner_operation_sources os
    LEFT JOIN sophia.source_objects s ON s.project_id=os.project_id AND s.id=os.source_id
    WHERE os.project_id=o.project_id AND os.operation_id=o.id
     AND (s.id IS NULL OR NOT (s.scope='project' AND s.eligible AND s.state='ready') OR s.sha256<>os.sha256
      OR s.eligibility_revision<>os.eligibility_revision OR sophia.source_withdrawn(os.project_id,os.source_id))) THEN
  RETURN 'a source it was admitted with was withdrawn or changed'; END IF;
 RETURN NULL;
END $$;

-- Repair 1 (CC005-E7-F02): why a native session may take no new input, or NULL. Its thread already holds the context of
-- its create and of every earlier input that may have reached it (possible_send, unknown, received, settled); each of
-- them must still be intact, and the project's audience must be the one its create was admitted for. Read under the
-- caller's locks (admission and prepare-send hold the project first; GO reads committed state as it grants).
CREATE FUNCTION sophia.owner_runner_lineage_ineligible(p_project uuid, p_binding uuid, p_create uuid, p_self uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_runner_operations; why text; created_for bigint; now_for bigint;
BEGIN
 FOR x IN SELECT o.* FROM sophia.owner_runner_operations o WHERE o.project_id=p_project AND o.binding_id=p_binding
   AND (o.id=p_create OR (o.kind='input' AND o.id IS DISTINCT FROM p_self AND o.state IN ('possible_send','unknown','received','settled')))
   ORDER BY o.id
 LOOP
  IF x.envelope_version<>2 THEN RETURN 'its native session was not admitted with source authority'; END IF;
  why:=sophia.owner_runner_context_ineligible(x);
  IF why IS NOT NULL THEN RETURN 'its native session''s context was withdrawn or changed ('||why||')'; END IF;
 END LOOP;
 SELECT m.audience_revision INTO created_for FROM sophia.owner_runner_operations c
  JOIN sophia.context_manifests m ON m.project_id=c.project_id AND m.id=c.manifest_id WHERE c.project_id=p_project AND c.id=p_create;
 SELECT audience_revision INTO now_for FROM sophia.projects WHERE id=p_project;
 IF created_for IS DISTINCT FROM now_for THEN RETURN 'the project''s audience changed since its native session was created'; END IF;
 RETURN NULL;
END $$;

-- Why a v2 create or input may no longer reach a native runner or its host, or NULL: its own context, the project's
-- revisions since it was admitted (refused, never re-snapshotted), an input's whole native session (repair 1), and the
-- route's declared settings.
CREATE FUNCTION sophia.owner_runner_source_ineligible(o sophia.owner_runner_operations) RETURNS text LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE man sophia.context_manifests; p sophia.projects; q sophia.owner_runner_qualifications; why text;
BEGIN
 IF o.envelope_version<>2 OR o.kind='stop' THEN RETURN NULL; END IF;
 why:=sophia.owner_runner_context_ineligible(o);
 IF why IS NOT NULL THEN RETURN why; END IF;
 SELECT * INTO man FROM sophia.context_manifests WHERE project_id=o.project_id AND id=o.manifest_id;
 SELECT * INTO p FROM sophia.projects WHERE id=o.project_id;
 IF p.audience_revision<>man.audience_revision THEN RETURN 'the project''s audience changed since it was admitted'; END IF;
 IF p.eligibility_revision<>man.eligibility_revision THEN RETURN 'the project''s source eligibility changed since it was admitted'; END IF;
 IF o.kind='input' THEN
  why:=sophia.owner_runner_lineage_ineligible(o.project_id,o.binding_id,o.target_operation_id,o.id);
  IF why IS NOT NULL THEN RETURN why; END IF;
 END IF;
 SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=o.project_id AND id=o.qualification_id;
 IF sophia.owner_runner_settings_refusal(q.source_policy,o.requested_settings) IS NOT NULL THEN
  RETURN 'its settings are outside the route''s declared source policy'; END IF;
 RETURN NULL;
END $$;

-- owner_runner_ineligible (0092), replaced: the same checks in the same order, every expiry judged at the actual time
-- (clock_timestamp(): a caller that waited on a lock is not judged at its transaction's start), then an unsent v1
-- create or input is refused (it carries no source authority), then the source recheck.
CREATE OR REPLACE FUNCTION sophia.owner_runner_ineligible(o sophia.owner_runner_operations) RETURNS text LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals; r sophia.executor_resources; conn sophia.execution_connections; q sophia.owner_runner_qualifications;
 b sophia.execution_bindings; m sophia.project_members;
BEGIN
 SELECT * INTO g FROM sophia.goals WHERE project_id=o.project_id AND id=o.goal_id;
 IF o.kind<>'stop' THEN
  IF g.authority_epoch<>o.authority_epoch THEN RETURN 'the goal''s authority epoch moved on'; END IF;
  IF g.revision<>o.goal_revision THEN RETURN 'the goal changed since it was admitted'; END IF;
  IF g.status NOT IN ('ready','running','checking') THEN RETURN 'the goal is '||g.status; END IF;
 END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=o.project_id AND actor_id=o.owner_id;
 IF NOT FOUND OR NOT m.active OR m.role NOT IN ('admin','editor') THEN RETURN 'the owner can no longer start work here'; END IF;
 IF m.revision<>o.member_revision THEN RETURN 'the owner''s membership changed since it was admitted'; END IF;
 SELECT * INTO r FROM sophia.executor_resources WHERE project_id=o.project_id AND id=o.resource_id;
 IF r.state<>'active' OR r.owner_id<>o.owner_id OR r.revision<>o.resource_revision THEN RETURN 'the resource changed or was revoked'; END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=o.connection_id;
 IF conn.state<>'linked' OR conn.revision<>o.connection_revision OR r.connection_id IS DISTINCT FROM o.connection_id THEN
  RETURN 'the connection changed or was revoked'; END IF;
 IF conn.expires_at IS NOT NULL AND conn.expires_at<=clock_timestamp() THEN RETURN 'the connection''s authentication expired'; END IF;
 SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=o.project_id AND id=o.qualification_id;
 IF q.revoked_at IS NOT NULL OR q.expires_at<=clock_timestamp() OR q.revision<>o.qualification_revision OR NOT (o.kind=ANY(q.operations))
    OR q.account_key<>o.account_key OR q.profile_id<>o.profile_id OR q.profile_revision<>o.profile_revision
    OR q.environment_ref<>o.environment_ref OR q.adapter_pin<>o.adapter_pin THEN
  RETURN 'the route''s qualification was revoked, expired or changed'; END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=o.project_id AND id=o.binding_id;
 IF b.state IN ('settled','lost') THEN RETURN 'its native session is settled'; END IF;
 IF o.kind<>'stop' AND b.state='stopping' THEN RETURN 'its native session is stopping'; END IF;
 IF o.kind<>'stop' AND o.envelope_version=1 THEN
  RETURN 'it was admitted before source authority: new work needs its sources, base and settings'; END IF;
 RETURN sophia.owner_runner_source_ineligible(o);
END $$;

-- owner_runner_envelope (0092), replaced: a v1 row's envelope is the 0092 expression, byte for byte; a v2 row's is
-- content-free (runner-port.ts RunnerEnvelopeV2): its instruction travels only as a payload checked against payloadSha256.
CREATE OR REPLACE FUNCTION sophia.owner_runner_envelope(o sophia.owner_runner_operations) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN o.envelope_version=2 THEN jsonb_build_object('v',2,'operationId',o.id,'kind',o.kind,'projectId',o.project_id,
  'ownerId',o.owner_id,'resourceId',o.resource_id,'bindingId',o.binding_id,'goalId',o.goal_id,'qualificationId',o.qualification_id,
  'qualificationRevision',o.qualification_revision,'adapterPin',o.adapter_pin,'environmentRef',o.environment_ref,
  'nativeProjectRef',o.native_project_ref,'profileId',o.profile_id,'profileRevision',o.profile_revision,
  'accountKey',o.account_key,'authorityEpoch',o.authority_epoch,'payloadSha256',o.payload_sha256,
  'manifestSha256',o.manifest_sha256,'baseCommit',o.base_commit,'writeScope',o.write_scope,'settings',o.requested_settings,
  'targetOperationId',o.target_operation_id,'nativeThreadId',CASE WHEN o.kind='create' THEN NULL ELSE o.native_thread_id END)
 ELSE jsonb_build_object('v',1,'operationId',o.id,'kind',o.kind,'projectId',o.project_id,'ownerId',o.owner_id,
  'resourceId',o.resource_id,'bindingId',o.binding_id,'goalId',o.goal_id,'qualificationId',o.qualification_id,
  'qualificationRevision',o.qualification_revision,'adapterPin',o.adapter_pin,'environmentRef',o.environment_ref,
  'nativeProjectRef',o.native_project_ref,'profileId',o.profile_id,'profileRevision',o.profile_revision,
  'accountKey',o.account_key,'authorityEpoch',o.authority_epoch,'message',o.message,'title',o.title,
  'targetOperationId',o.target_operation_id,'nativeThreadId',CASE WHEN o.kind='create' THEN NULL ELSE o.native_thread_id END)
 END
$$;

-- --- admission -------------------------------------------------------------------------------------------------------

-- admit_owner_runner_operation (0092), replaced. The same checks and writes, every expiry judged at the actual time, and:
-- a create or input is v2. A create names its project sources, a 40-hex base, write scope read_only and settings inside
-- the route's declared source policy; an input names a subset of its create's sources and inherits the rest. Each one's
-- instruction becomes an owner-private source and its context a manifest of its own. A Stop stays v1 and names no
-- source. A key first admitted before this migration keeps its 0092 comparison.
CREATE OR REPLACE FUNCTION sophia.admit_owner_runner_operation(p_project uuid, p_key text, p_request jsonb, p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); k text; prior sophia.owner_runner_operations; r sophia.executor_resources;
 conn sophia.execution_connections; q sophia.owner_runner_qualifications; g sophia.goals; t sophia.owner_runner_operations;
 b sophia.execution_bindings; mrev bigint; o sophia.owner_runner_operations; pending sophia.owner_runner_operations;
 op uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); ob uuid:=gen_random_uuid(); att uuid; bnd uuid;
 msg text; ttl text; thread text; uuid_re text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 sem jsonb; body text; sha text; ids uuid[]; sel jsonb:='[]'; s sophia.source_objects; pay sophia.source_objects;
 mbody sophia.source_objects; man uuid:=gen_random_uuid(); pr sophia.projects; base text; scope text; settings jsonb; why text;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid payload digest' USING ERRCODE='22023'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' THEN RAISE EXCEPTION 'Invalid runner operation' USING ERRCODE='22023'; END IF;
 k:=p_request->>'kind';
 IF k IN ('hold','resume','resolve_permission','answer_question') THEN
  RAISE EXCEPTION 'Owner runner operation unsupported: %', k USING ERRCODE='0A000'; END IF;
 IF k IS NULL OR k NOT IN ('create','input','stop') THEN RAISE EXCEPTION 'Invalid runner operation kind' USING ERRCODE='22023'; END IF;
 IF coalesce(p_request->>'resourceId','') !~ uuid_re THEN RAISE EXCEPTION 'Resource not found' USING ERRCODE='22023'; END IF;
 -- What is kept to compare a retry: the request without its instruction text, and the instruction's digest.
 sem:=CASE WHEN k='stop' THEN p_request ELSE (p_request-'message'-'title')||jsonb_build_object('payloadSha256',
  sophia.owner_runner_sha256(sophia.owner_runner_payload_body(p_request->>'message',p_request->>'title'))) END;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM sophia.owner_runner_operations WHERE project_id=p_project AND owner_id=a AND client_request_id=p_key;
 IF FOUND THEN
  IF (CASE WHEN prior.envelope_version=1 THEN prior.semantic<>p_request ELSE prior.semantic<>sem END)
     OR prior.payload_digest<>p_digest THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN sophia.owner_runner_receipt(prior);
 END IF;
 -- Owner-bound: only the resource's own owner may use it. Another's resource answers like a missing one.
 SELECT * INTO r FROM sophia.executor_resources WHERE project_id=p_project AND id=(p_request->>'resourceId')::uuid FOR SHARE;
 IF NOT FOUND OR r.owner_id<>a THEN RAISE EXCEPTION 'Resource not found' USING ERRCODE='22023'; END IF;
 IF r.harness NOT IN ('codex-native','claude-native') OR r.state<>'active' THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: the resource is not an active native resource' USING ERRCODE='55000'; END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=r.connection_id FOR SHARE;
 IF conn.state<>'linked' THEN RAISE EXCEPTION 'Owner runner route is not qualified: its connection is not linked' USING ERRCODE='55000'; END IF;
 IF conn.expires_at IS NOT NULL AND conn.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: its connection''s authentication expired' USING ERRCODE='55000'; END IF;
 SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=p_project AND resource_id=r.id AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner runner route is not qualified: no qualification for this resource' USING ERRCODE='55000'; END IF;
 IF q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Owner runner route is not qualified: its qualification expired' USING ERRCODE='55000'; END IF;
 IF q.connection_revision<>conn.revision OR q.resource_revision<>r.revision THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: the resource or connection changed since it was qualified' USING ERRCODE='55000'; END IF;
 IF NOT (k=ANY(q.operations)) THEN RAISE EXCEPTION 'Owner runner route is not qualified: % is not a qualified operation', k USING ERRCODE='55000'; END IF;
 -- New work only: a Stop is never refused, used or refunded by the work allowance.
 IF k<>'stop' AND q.used_operations>=q.allowance_operations THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: its operation allowance is used' USING ERRCODE='55000'; END IF;
 SELECT revision INTO mrev FROM sophia.project_members WHERE project_id=p_project AND actor_id=a;
 IF k='create' THEN
  IF coalesce(p_request->>'goalId','') !~ uuid_re THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=(p_request->>'goalId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
  ttl:=p_request->>'title';
  IF ttl IS NULL OR sophia.owner_runner_blank(ttl) OR length(ttl)>120 THEN RAISE EXCEPTION 'A create needs a title of at most 120 characters' USING ERRCODE='22023'; END IF;
 ELSE
  IF coalesce(p_request->>'targetOperationId','') !~ uuid_re THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO t FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=(p_request->>'targetOperationId')::uuid AND owner_id=a FOR UPDATE;
  IF NOT FOUND OR t.resource_id<>r.id THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
  IF t.kind<>'create' THEN RAISE EXCEPTION 'An input or stop targets a create operation' USING ERRCODE='22023'; END IF;
  IF t.state NOT IN ('received','settled') OR t.native_thread_id IS NULL THEN
   RAISE EXCEPTION 'Its native thread is not known yet' USING ERRCODE='40001'; END IF;
  IF NOT sophia.owner_runner_same_route(t,q,conn,r) THEN
   RAISE EXCEPTION 'Owner runner route is not qualified: the binding''s original account, connection, profile or qualification changed; a follow-up cannot move it' USING ERRCODE='55000'; END IF;
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=t.binding_id FOR UPDATE;
  IF b.state IN ('settled','lost') THEN RAISE EXCEPTION 'Its native session is settled' USING ERRCODE='40001'; END IF;
  IF k='input' AND b.state='stopping' THEN RAISE EXCEPTION 'Its native session is stopping' USING ERRCODE='40001'; END IF;
  IF k='stop' THEN
   -- One Stop at a time per binding (integrated r2, F02): another, under a fresh key, is refused and binds nothing,
   -- unless an earlier input landed after the pending Stop was sent (overtaken, F01): its run may have started after
   -- that interrupt, so the owner may Stop again.
   SELECT s2.* INTO pending FROM sophia.owner_runner_operations s2 WHERE s2.project_id=p_project AND s2.binding_id=t.binding_id
    AND s2.kind='stop' AND s2.state IN ('admitted','possible_send','received','unknown')
    AND NOT (s2.possible_send_at IS NOT NULL AND EXISTS (SELECT 1 FROM sophia.owner_runner_operations i
     WHERE i.project_id=p_project AND i.binding_id=s2.binding_id AND i.kind='input' AND i.received_at>s2.possible_send_at))
    ORDER BY s2.created_at LIMIT 1;
   IF FOUND THEN RAISE EXCEPTION 'A Stop is already pending for this native session: %', pending.id USING ERRCODE='40001'; END IF;
  END IF;
  SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=t.goal_id FOR UPDATE;
  att:=t.attempt_id; bnd:=t.binding_id; thread:=t.native_thread_id;
 END IF;
 IF k IN ('create','input') THEN
  IF NOT (p_request ? 'expectedGoalRevision') OR NOT (p_request ? 'expectedAuthorityEpoch')
     OR jsonb_typeof(p_request->'expectedGoalRevision')<>'number' OR jsonb_typeof(p_request->'expectedAuthorityEpoch')<>'number'
     OR g.revision<>(p_request->>'expectedGoalRevision')::numeric OR g.authority_epoch<>(p_request->>'expectedAuthorityEpoch')::numeric THEN
   RAISE EXCEPTION 'Stale goal revision or epoch' USING ERRCODE='40001'; END IF;
  IF g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Goal not admitted for work' USING ERRCODE='40001'; END IF;
  msg:=p_request->>'message';
  IF msg IS NULL OR sophia.owner_runner_blank(msg) OR length(msg)>8000 THEN RAISE EXCEPTION 'A create or input needs a message of at most 8000 characters' USING ERRCODE='22023'; END IF;
 ELSIF p_request ? 'message' THEN RAISE EXCEPTION 'A stop carries no message' USING ERRCODE='22023';
 END IF;
 -- Source authority (v2). A Stop names none.
 IF k='stop' THEN
  IF p_request ?| ARRAY['sourceIds','baseCommit','writeScope','settings'] THEN
   RAISE EXCEPTION 'A stop names no sources, base, scope or settings' USING ERRCODE='22023'; END IF;
 ELSE
  IF jsonb_typeof(p_request->'sourceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'sourceIds')>20
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'sourceIds') x WHERE NOT sophia.owner_runner_json_string(x,uuid_re)) THEN
   RAISE EXCEPTION 'A create or input names its project sources: at most 20 source ids' USING ERRCODE='22023'; END IF;
  ids:=ARRAY(SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(p_request->'sourceIds') x);
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN
   RAISE EXCEPTION 'A source is named once' USING ERRCODE='22023'; END IF;
  IF k='create' THEN
   IF NOT sophia.owner_runner_json_string(p_request->'baseCommit','^[0-9a-f]{40}$') THEN
    RAISE EXCEPTION 'A create needs its base: a full 40-hex commit' USING ERRCODE='22023'; END IF;
   IF p_request->'writeScope' IS DISTINCT FROM '"read_only"'::jsonb THEN
    RAISE EXCEPTION 'A create''s write scope is read_only' USING ERRCODE='22023'; END IF;
   IF q.source_policy IS NULL THEN
    RAISE EXCEPTION 'Owner runner route is not qualified: no source policy is declared for this route' USING ERRCODE='55000'; END IF;
   why:=sophia.owner_runner_settings_refusal(q.source_policy,p_request->'settings');
   IF why IS NOT NULL THEN RAISE EXCEPTION 'Owner runner route is not qualified: the settings are not allowed: %', why USING ERRCODE='55000'; END IF;
   base:=p_request->>'baseCommit'; scope:='read_only'; settings:=p_request->'settings';
  ELSE
   IF p_request ?| ARRAY['baseCommit','writeScope','settings','title'] THEN
    RAISE EXCEPTION 'An input inherits its create''s base, scope and settings, and has no title' USING ERRCODE='22023'; END IF;
   -- A create admitted before source authority has no selection to bound an input: start a new create.
   IF t.envelope_version<>2 THEN
    RAISE EXCEPTION 'An input needs a create admitted with its sources, base and settings: start a new create' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM sophia.owner_runner_operation_sources os
      WHERE os.project_id=p_project AND os.operation_id=t.id AND os.source_id=x)) THEN
    RAISE EXCEPTION 'An input names only sources its create was admitted with' USING ERRCODE='22023'; END IF;
   base:=t.base_commit; scope:=t.write_scope; settings:=t.requested_settings;
  END IF;
  -- Each selected source as it is now: project-scoped, eligible, ready, and withdrawn from nothing it drew on. A source
  -- the owner may not select answers like a missing one.
  FOR s IN SELECT so.* FROM unnest(ids) x JOIN sophia.source_objects so ON so.project_id=p_project AND so.id=x
    ORDER BY so.id FOR SHARE OF so LOOP
   IF NOT (s.scope='project' AND s.eligible AND s.state='ready') OR sophia.source_withdrawn(p_project,s.id) THEN
    RAISE EXCEPTION 'A selected source is not an eligible project source' USING ERRCODE='22023'; END IF;
   -- Repair 1 (F02): an input's source is its create's selection as it was frozen, never a new revision under its id.
   IF k='input' AND NOT EXISTS(SELECT 1 FROM sophia.owner_runner_operation_sources os WHERE os.project_id=p_project
      AND os.operation_id=t.id AND os.source_id=s.id AND os.sha256=s.sha256 AND os.eligibility_revision=s.eligibility_revision) THEN
    RAISE EXCEPTION 'A selected source changed since its create selected it: start a new create' USING ERRCODE='22023'; END IF;
   sel:=sel||jsonb_build_array(jsonb_build_object('id',s.id,'sha256',s.sha256,'eligibilityRevision',s.eligibility_revision));
  END LOOP;
  IF jsonb_array_length(sel)<>cardinality(ids) THEN
   RAISE EXCEPTION 'A selected source is not an eligible project source' USING ERRCODE='22023'; END IF;
  -- Repair 1 (F02): the native session's whole disclosed context must still be intact for new work on it.
  IF k='input' THEN
   why:=sophia.owner_runner_lineage_ineligible(p_project,t.binding_id,t.id,NULL);
   IF why IS NOT NULL THEN
    RAISE EXCEPTION 'An input cannot continue this native session: %', why USING ERRCODE='22023'; END IF;
  END IF;
  SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 END IF;
 -- The decision clock (INC01-30813-EXPIRY-F01): the connection and qualification rows are locked above and cannot
 -- change, but time can pass while this admission waits on the goal, target, binding and source locks. Expiry is judged
 -- again at the actual time, after the last of those waits and immediately before the first write.
 IF (conn.expires_at IS NOT NULL AND conn.expires_at<=clock_timestamp()) OR q.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: its connection''s authentication or its qualification expired while it waited'
   USING ERRCODE='55000'; END IF;
 IF k='create' THEN
  att:=gen_random_uuid(); bnd:=gen_random_uuid();
  INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,state)
   VALUES(p_project,att,g.id,g.revision,g.authority_epoch,'admitted');
  INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,runtime_unit_id,continuation_owner,state)
   VALUES(p_project,bnd,att,r.id,'owner-runner:t3','native_goal','launching');
 END IF;
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,state)
  VALUES(p_project,cmd,a,g.id,g.revision,g.authority_epoch,'runner.'||k,'runner:'||op,
   jsonb_build_object('kind','runner.'||k,'operationId',op,'payloadDigest',p_digest),'admitted');
 INSERT INTO sophia.outbox(project_id,id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
  VALUES(p_project,ob,cmd,'runner.'||k,'operation/'||op,bnd,g.id,g.authority_epoch,k='stop');
 IF k='stop' THEN
  -- A Stop freezes its create's lineage (equal to the current route, checked above). Version 1, no content.
  INSERT INTO sophia.owner_runner_operations(project_id,id,owner_id,client_request_id,kind,qualification_id,qualification_revision,
   resource_id,goal_id,attempt_id,binding_id,command_id,outbox_id,target_operation_id,semantic,payload_digest,message,title,
   goal_revision,authority_epoch,member_revision,connection_id,connection_revision,resource_revision,adapter_pin,environment_ref,
   native_project_ref,profile_id,profile_revision,account_key,native_thread_id)
  VALUES(p_project,op,a,p_key,k,q.id,q.revision,r.id,g.id,att,bnd,cmd,ob,t.id,p_request,p_digest,NULL,NULL,
   g.revision,g.authority_epoch,mrev,conn.id,conn.revision,r.revision,q.adapter_pin,q.environment_ref,
   q.native_project_ref,q.profile_id,q.profile_revision,q.account_key,thread)
  RETURNING * INTO o;
  PERFORM sophia.owner_runner_fence(p_project,bnd);
 ELSE
  -- The instruction, privately; then this operation's own context: its selection, base, scope, settings and the
  -- revisions it was admitted under. Nothing of another operation is changed.
  body:=sophia.owner_runner_payload_body(msg,CASE WHEN k='create' THEN ttl END);
  pay:=sophia.owner_runner_put_private(p_project,a,'application/vnd.sophia.runner-instruction+json',body);
  sha:=pay.sha256;
  mbody:=sophia.owner_runner_put_private(p_project,a,'application/vnd.sophia.runner-context+json',
   jsonb_build_object('v',1,'kind',k,'operationId',op,'ownerId',a,'payloadSha256',sha,
    'sources',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(sel) x),
    'repositoryRoot',r.repository_root,'baseCommit',base,'writeScope',scope,'settings',settings,
    'qualificationId',q.id,'qualificationRevision',q.revision,'profileId',q.profile_id,'profileRevision',q.profile_revision,
    'audienceRevision',pr.audience_revision,'eligibilityRevision',pr.eligibility_revision,'targetOperationId',t.id)::text);
  INSERT INTO sophia.context_manifests(project_id,id,body_source_id,audience_revision,eligibility_revision,state)
   VALUES(p_project,man,mbody.id,pr.audience_revision,pr.eligibility_revision,'eligible');
  INSERT INTO sophia.owner_runner_operations(project_id,id,owner_id,client_request_id,kind,qualification_id,qualification_revision,
   resource_id,goal_id,attempt_id,binding_id,command_id,outbox_id,target_operation_id,semantic,payload_digest,message,title,
   goal_revision,authority_epoch,member_revision,connection_id,connection_revision,resource_revision,adapter_pin,environment_ref,
   native_project_ref,profile_id,profile_revision,account_key,native_thread_id,envelope_version,payload_source_id,payload_sha256,
   manifest_id,manifest_sha256,repository_root,base_commit,write_scope,requested_settings)
  VALUES(p_project,op,a,p_key,k,q.id,q.revision,r.id,g.id,att,bnd,cmd,ob,t.id,sem,p_digest,NULL,NULL,
   g.revision,g.authority_epoch,mrev,conn.id,conn.revision,r.revision,q.adapter_pin,q.environment_ref,
   q.native_project_ref,q.profile_id,q.profile_revision,q.account_key,thread,2,pay.id,sha,
   man,mbody.sha256,r.repository_root,base,scope,settings)
  RETURNING * INTO o;
  INSERT INTO sophia.owner_runner_operation_sources(project_id,operation_id,source_id,sha256,eligibility_revision)
   SELECT p_project,op,(x->>'id')::uuid,x->>'sha256',(x->>'eligibilityRevision')::bigint FROM jsonb_array_elements(sel) x;
  -- The allowance counts admitted new work, cumulatively: never refunded by a timeout, a Stop or a retry.
  UPDATE sophia.owner_runner_qualifications SET used_operations=used_operations+1 WHERE project_id=p_project AND id=q.id;
 END IF;
 PERFORM sophia.owner_runner_event(o,'runner_operation.admitted');
 RETURN sophia.owner_runner_receipt(o);
END $$;

-- --- prepare-send and GO: the payload crosses only after the recheck --------------------------------------------------

-- Deny an operation at its prepare-send: the operation, its outbox row and command, a create's binding, the account's
-- reservation if nothing of the binding is unsettled, and the owner's event. Called under prepare-send's locks.
CREATE FUNCTION sophia.owner_runner_deny_prepared(o sophia.owner_runner_operations, p_why text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.owner_runner_operations SET state='denied', reason=left(p_why,500), revision=revision+1
  WHERE project_id=o.project_id AND id=o.id RETURNING * INTO o;
 UPDATE sophia.outbox SET state='denied', lease_until=NULL, outcome_reason=left(p_why,500) WHERE project_id=o.project_id AND id=o.outbox_id;
 UPDATE sophia.commands SET state='denied' WHERE project_id=o.project_id AND id=o.command_id;
 IF o.kind='create' THEN PERFORM sophia.owner_runner_end_binding(o,'failed'); END IF;
 PERFORM sophia.owner_runner_release(o);
 PERFORM sophia.owner_runner_event(o,'runner_operation.denied');
 RETURN jsonb_build_object('result','denied','reason',p_why);
END $$;

-- What prepare-send may still send, judged now: the whole recheck at the actual time, and a v2 send's intact payload.
-- Returns the denial reason, or NULL with the payload (NULL for v1) in p_body.
CREATE FUNCTION sophia.owner_runner_send_check(o sophia.owner_runner_operations, OUT why text, OUT body text) LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 why:=sophia.owner_runner_ineligible(o);
 IF why IS NULL AND o.envelope_version=2 THEN
  body:=sophia.owner_runner_private_text(o.project_id,o.payload_source_id,o.owner_id,o.payload_sha256);
  IF body IS NULL THEN why:='its private instruction was withdrawn or altered'; END IF;
 END IF;
END $$;

-- owner_runner_prepare_send (0092), replaced: the same, and a v2 send's result carries its payload (the instruction's
-- exact canonical bytes), read in the same transaction as the recheck. INC01-30813-EXPIRY-F01: every recheck runs at
-- the actual time (clock_timestamp in owner_runner_ineligible), after the project, outbox and operation locks; a create
-- or input is rechecked once more after the account reservation's lock, immediately before its possible send. A Stop
-- takes no reservation, so its one recheck already follows its last wait. The owner-host proxy drops it: the host receives
-- it only with a granted GO.
CREATE OR REPLACE FUNCTION sophia.owner_runner_prepare_send(p_project uuid, p_outbox uuid, p_lease uuid, p_journal uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE ob sophia.outbox; o sophia.owner_runner_operations; why text; res sophia.owner_runner_reservations; body text;
BEGIN
 IF p_journal IS NULL THEN RAISE EXCEPTION 'A send must name the gateway journal it goes through' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO ob FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND OR ob.destination NOT IN ('runner.create','runner.input','runner.stop') THEN
  RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF ob.state<>'dispatching' OR ob.lease_token IS DISTINCT FROM p_lease THEN
  RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF ob.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','expired','reason','the dispatch lease expired before the send was prepared');
 END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND outbox_id=p_outbox FOR UPDATE;
 IF o.state<>'admitted' THEN RAISE EXCEPTION 'Operation is not waiting to be sent' USING ERRCODE='40001'; END IF;
 SELECT c.why, c.body INTO why, body FROM sophia.owner_runner_send_check(o) c;
 IF why IS NOT NULL THEN RETURN sophia.owner_runner_deny_prepared(o,why); END IF;
 -- A stop starts no inference: it never waits behind the account's reservation. A create or input takes it, or waits.
 IF o.kind<>'stop' THEN
  INSERT INTO sophia.owner_runner_reservations(account_key,project_id,binding_id) VALUES(o.account_key,p_project,o.binding_id)
   ON CONFLICT (account_key) DO NOTHING;
  SELECT * INTO res FROM sophia.owner_runner_reservations WHERE account_key=o.account_key FOR UPDATE;
 END IF;
 IF o.kind<>'stop' AND (res.project_id<>p_project OR res.binding_id<>o.binding_id) THEN
  UPDATE sophia.owner_runner_operations SET deferrals=deferrals+1, reason='waiting: the account is busy with another assignment'
   WHERE project_id=p_project AND id=o.id;
  UPDATE sophia.outbox SET state='pending', lease_token=NULL, lease_until=NULL, available_at=now()+interval '5 seconds'
   WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','deferred','reason','the account is busy with another assignment');
 END IF;
 -- The decision clock (INC01-30813-EXPIRY-F01): the account reservation above may have waited, and expiry, revocation
 -- or a withdrawal may have happened meanwhile. Everything is judged again at the actual time, after the last lock wait
 -- and immediately before the possible send is committed; the payload is the one read under this last recheck.
 IF o.kind<>'stop' THEN
  SELECT c.why, c.body INTO why, body FROM sophia.owner_runner_send_check(o) c;
  IF why IS NOT NULL THEN RETURN sophia.owner_runner_deny_prepared(o,why); END IF;
 END IF;
 -- Bound to the journal it goes through (R1-F01): only that journal speaks for it later. No journal proves it was never
 -- sent (r3, R2-F01): a possible send never returns to admitted. Its time is the actual time of this commitment.
 UPDATE sophia.owner_runner_operations SET state='possible_send', possible_send_at=clock_timestamp(), reason=NULL, gateway_journal_id=p_journal,
  revision=revision+1 WHERE project_id=p_project AND id=o.id RETURNING * INTO o;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=o.command_id AND state='admitted';
 PERFORM sophia.owner_runner_event(o,'runner_operation.sending');
 RETURN jsonb_build_object('result','send','envelope',sophia.owner_runner_envelope(o))
  ||CASE WHEN body IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('payload',body) END;
END $$;

-- owner_host_go (0093), replaced: the same recheck and ledger; when it grants a v2 send it also returns the payload, read
-- under the same recheck. Nothing of the instruction is ever stored in an exchange, delivered by a poll or returned
-- with a refusal: a withdrawal before GO keeps the body from the host.
CREATE OR REPLACE FUNCTION sophia.owner_host_go(p_capability_sha256 bytea, p_exchange uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts:=sophia.owner_host_authenticate(p_capability_sha256); x sophia.owner_host_exchanges; why text;
 o sophia.owner_runner_operations; body text;
BEGIN
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange FOR UPDATE;
 IF NOT FOUND OR x.host_id<>h.id THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF x.kind<>'send' THEN RETURN jsonb_build_object('result','denied','reason','only a send asks for GO'); END IF;
 IF x.state NOT IN ('delivered','go_granted') THEN
  RETURN jsonb_build_object('result','denied','reason','the exchange is '||x.state,'grantedBefore',x.go_count>0); END IF;
 IF x.deadline_at<=clock_timestamp() THEN
  RETURN jsonb_build_object('result','denied','reason','the exchange''s deadline passed','grantedBefore',x.go_count>0); END IF;
 why:=sophia.owner_host_send_refusal(x,h);
 IF why IS NULL THEN
  SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=x.project_id AND id=x.operation_id;
  IF o.envelope_version=2 THEN
   body:=sophia.owner_runner_private_text(o.project_id,o.payload_source_id,o.owner_id,o.payload_sha256);
   IF body IS NULL THEN why:='its private instruction was withdrawn or altered'; END IF;
  END IF;
 END IF;
 IF why IS NOT NULL THEN
  IF x.go_count=0 THEN UPDATE sophia.owner_host_exchanges SET state='denied', reason=left('at go: '||why,500) WHERE id=x.id;
  ELSE UPDATE sophia.owner_host_exchanges SET reason=left('go refused after an earlier grant: '||why,500) WHERE id=x.id;
  END IF;
  RETURN jsonb_build_object('result','denied','reason',why,'grantedBefore',x.go_count>0);
 END IF;
 UPDATE sophia.owner_host_exchanges SET state='go_granted', go_count=go_count+1, reason=NULL WHERE id=x.id;
 RETURN jsonb_build_object('result','go')||CASE WHEN body IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('payload',body) END;
END $$;

-- --- withdrawal ------------------------------------------------------------------------------------------------------

-- A source was erased: fence the runner work that drew on it (its payload, its manifest body, or anything in the closure
-- of a source it selected). Under the project lock, which every caller of mission_erase_source already holds first
-- (0018 mission_withdraw; 0068 and 0069 correct_contribution and withdraw_contribution); then operations in id order,
-- then their outbox rows (integrated r2 F03 order). An admitted operation not yet claimed is denied now (a claimed one is
-- denied by its prepare-send). Every affected operation's manifest is retired and it is marked once, with an owner
-- event. A possible, unknown or received operation keeps its state, reservation, binding and identities: nothing is
-- reset, re-prepared, replayed or refunded, and a native copy already delivered is not recalled.
-- Whether a v2 operation drew on a source: its private instruction, its context manifest's body, or anything in the
-- closure of a source it selected.
CREATE FUNCTION sophia.owner_runner_draws_on(o sophia.owner_runner_operations, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT o.payload_source_id=p_source
  OR EXISTS(SELECT 1 FROM sophia.context_manifests m WHERE m.project_id=o.project_id AND m.id=o.manifest_id AND m.body_source_id=p_source)
  OR EXISTS(SELECT 1 FROM sophia.owner_runner_operation_sources os WHERE os.project_id=o.project_id AND os.operation_id=o.id
   AND p_source IN (SELECT sophia.source_closure(o.project_id,ARRAY[os.source_id]))) $$;

CREATE FUNCTION sophia.owner_runner_source_withdrawn(p_project uuid, p_source uuid) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_runner_operations; ob sophia.outbox; n integer:=0; denied boolean; direct boolean;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 -- Drawn on directly, or (repair 1, F02) an admitted input of a native session whose create or earlier possibly-sent
 -- input drew on it: that session's context is withdrawn for new work too.
 FOR x IN SELECT o.* FROM sophia.owner_runner_operations o WHERE o.project_id=p_project AND o.envelope_version=2
   AND o.kind IN ('create','input') AND (sophia.owner_runner_draws_on(o,p_source)
    OR (o.kind='input' AND o.state='admitted' AND EXISTS(SELECT 1 FROM sophia.owner_runner_operations y
     WHERE y.project_id=o.project_id AND y.binding_id=o.binding_id AND y.id<>o.id AND y.envelope_version=2
      AND (y.id=o.target_operation_id OR (y.kind='input' AND y.state IN ('possible_send','unknown','received','settled')))
      AND sophia.owner_runner_draws_on(y,p_source))))
   ORDER BY o.id FOR UPDATE OF o
 LOOP
  denied:=false;
  direct:=sophia.owner_runner_draws_on(x,p_source);
  IF x.state='admitted' THEN
   SELECT * INTO ob FROM sophia.outbox WHERE project_id=p_project AND id=x.outbox_id FOR UPDATE;
   IF ob.state='pending' THEN
    UPDATE sophia.owner_runner_operations SET state='denied', reason=CASE WHEN direct
      THEN 'a source it was admitted with was withdrawn before it was sent'
      ELSE 'its native session''s context was withdrawn before it was sent' END,
     source_withdrawn_at=CASE WHEN direct THEN coalesce(source_withdrawn_at,clock_timestamp()) ELSE source_withdrawn_at END,
     revision=revision+1
     WHERE project_id=p_project AND id=x.id RETURNING * INTO x;
    UPDATE sophia.outbox SET state='denied', outcome_reason=x.reason WHERE project_id=p_project AND id=x.outbox_id;
    UPDATE sophia.commands SET state='denied' WHERE project_id=p_project AND id=x.command_id;
    IF x.kind='create' THEN PERFORM sophia.owner_runner_end_binding(x,'failed'); END IF;
    PERFORM sophia.owner_runner_release(x);
    PERFORM sophia.owner_runner_event(x,'runner_operation.denied');
    denied:=true;
   END IF;
  END IF;
  CONTINUE WHEN NOT direct;
  UPDATE sophia.context_manifests SET state='retired' WHERE project_id=p_project AND id=x.manifest_id AND state<>'retired';
  IF NOT denied AND x.source_withdrawn_at IS NULL THEN
   UPDATE sophia.owner_runner_operations SET source_withdrawn_at=clock_timestamp(), revision=revision+1
    WHERE project_id=p_project AND id=x.id RETURNING * INTO x;
   PERFORM sophia.owner_runner_event(x,'runner_operation.updated');
  END IF;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- mission_erase_source (0041), replaced: the same erase, research and design revocations, then the runner fence.
CREATE OR REPLACE FUNCTION sophia.mission_erase_source(p_project uuid, p_source uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 DELETE FROM sophia.source_texts WHERE project_id=p_project AND source_id=p_source;
 UPDATE sophia.source_objects SET eligible=false, state='deleted', eligibility_revision=eligibility_revision+1, byte_length=0,
  sha256=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex')
  WHERE project_id=p_project AND id=p_source;
 UPDATE sophia.mission_requests SET semantic_request=(semantic_request-'text'-'proposal')||'{"redacted":true}',
  receipt=receipt||'{"sha256":null}'
  WHERE project_id=p_project AND receipt->>'sourceId'=p_source::text;
 PERFORM sophia.research_revoke_source(p_project,p_source);
 PERFORM sophia.design_revoke_source(p_project,p_source);
 PERFORM sophia.owner_runner_source_withdrawn(p_project,p_source);
END $$;

-- --- the owner's content read ----------------------------------------------------------------------------------------

-- The owner's view of one operation's source facts and instruction (sophia_api, actor derived server-side). Owner-only
-- RLS is not reauthorization: a v2 instruction is returned only while it is intact, its context is not retired, nothing
-- it drew on was withdrawn and the reader is still a member; otherwise `withdrawn`, with its safe metadata. A v1 row's
-- text stays inline in its row, unchanged. Another member's operation, or none, is NULL.
CREATE FUNCTION sophia.owner_runner_content(p_project uuid, p_operation uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); o sophia.owner_runner_operations; man sophia.context_manifests; body text; facts jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RETURN NULL; END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=p_operation AND owner_id=a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF o.envelope_version=1 THEN
  RETURN jsonb_build_object('envelopeVersion',1,'content','inline','sourceIds',NULL,'baseCommit',NULL,'writeScope',NULL,'settings',NULL);
 END IF;
 facts:=jsonb_build_object('envelopeVersion',2,'baseCommit',o.base_commit,'writeScope',o.write_scope,'settings',o.requested_settings,
  'sourceIds',(SELECT coalesce(jsonb_agg(os.source_id ORDER BY os.source_id),'[]') FROM sophia.owner_runner_operation_sources os
   WHERE os.project_id=o.project_id AND os.operation_id=o.id));
 SELECT * INTO man FROM sophia.context_manifests WHERE project_id=o.project_id AND id=o.manifest_id;
 IF o.source_withdrawn_at IS NULL AND man.state='eligible' THEN
  body:=sophia.owner_runner_private_text(o.project_id,o.payload_source_id,o.owner_id,o.payload_sha256);
 END IF;
 IF body IS NULL THEN RETURN facts||jsonb_build_object('content','withdrawn','message',NULL,'title',NULL); END IF;
 RETURN facts||jsonb_build_object('content','available','message',body::jsonb->>'message','title',body::jsonb->>'title');
END $$;

REVOKE ALL ON FUNCTION sophia.owner_runner_payload_body(text,text), sophia.owner_runner_sha256(text),
 sophia.owner_runner_put_private(uuid,uuid,text,text), sophia.owner_runner_private_text(uuid,uuid,uuid,text),
 sophia.owner_runner_json_string(jsonb,text), sophia.owner_runner_policy_refusal(jsonb),
 sophia.owner_runner_settings_refusal(jsonb,jsonb), sophia.declare_owner_runner_source_policy(uuid,uuid,jsonb),
 sophia.owner_runner_source_ineligible(sophia.owner_runner_operations), sophia.owner_runner_source_withdrawn(uuid,uuid),
 sophia.owner_runner_content(uuid,uuid), sophia.owner_runner_deny_prepared(sophia.owner_runner_operations,text),
 sophia.owner_runner_send_check(sophia.owner_runner_operations), sophia.owner_runner_blank(text),
 sophia.owner_runner_context_ineligible(sophia.owner_runner_operations), sophia.owner_runner_lineage_ineligible(uuid,uuid,uuid,uuid),
 sophia.owner_runner_draws_on(sophia.owner_runner_operations,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.owner_runner_content(uuid,uuid) TO sophia_api;

COMMIT;
