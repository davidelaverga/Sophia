-- FOUNDER-EXPLORE-TO-BUILD-001: retain validated outputs and settle the exact leased operation together.
BEGIN;

-- Prototype bodies use the existing private source identity and a separate inline store. Ordinary inline text keeps
-- its established limit, and older Explore versions can still use the original inline or object-store backing.
CREATE TABLE sophia.managed_explore_entry_bodies (
 project_id uuid NOT NULL,
 source_id uuid NOT NULL,
 body text NOT NULL CHECK(octet_length(body) BETWEEN 1 AND 2097152),
 PRIMARY KEY(project_id,source_id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);
ALTER TABLE sophia.managed_explore_entry_bodies ENABLE ROW LEVEL SECURITY;

-- Everything in this receipt is worker-internal. Provider session, environment, root and usage remain in the dispatch
-- journal. The output fingerprint permits an exact replay after an ambiguous COMMIT without reopening the lease.
CREATE TABLE sophia.managed_explore_retention_receipts (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 replay_sha256 bytea NOT NULL CHECK(octet_length(replay_sha256)=32),
 result jsonb NOT NULL,
 direction_revision bigint CHECK(direction_revision BETWEEN 1 AND 9007199254740991),
 version_id uuid,
 provider_artifact_id text,
 provider_artifact_request_id text,
 provider_artifact_path text,
 byte_length bigint,
 byte_sha256 text,
 PRIMARY KEY(project_id,turn_id),
 UNIQUE(project_id,session_id,provider_artifact_id),
 UNIQUE(project_id,session_id,version_id),
 FOREIGN KEY(project_id,turn_id) REFERENCES sophia.managed_explore_dispatch_turns(project_id,turn_id),
 FOREIGN KEY(project_id,session_id) REFERENCES sophia.managed_explore_dispatch_sessions(project_id,session_id),
 FOREIGN KEY(project_id,session_id,version_id) REFERENCES sophia.managed_explore_versions(project_id,session_id,id),
 CHECK((result->>'kind'='denied' AND num_nonnulls(direction_revision,version_id)=0)
    OR (result->>'kind'='completed' AND num_nonnulls(direction_revision,version_id)=1)),
 CHECK((version_id IS NULL AND num_nonnulls(provider_artifact_id,provider_artifact_request_id,provider_artifact_path,
          byte_length,byte_sha256)=0)
    OR (version_id IS NOT NULL AND num_nonnulls(provider_artifact_id,provider_artifact_path,byte_length,byte_sha256)=4))
);
ALTER TABLE sophia.managed_explore_retention_receipts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.managed_explore_manifest(v sophia.managed_explore_versions,p_bytes bigint)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('artifactId',v.session_id,'directionId',v.direction_id,'entry','index.html',
  'files',jsonb_build_array(jsonb_build_object('bytes',p_bytes,'mime','text/html','path','index.html',
   'sha256',v.entry_sha256,'sourceId',v.entry_source_id)),
  'format','sophia.prototype.v1','parentVersionId',v.parent_version_id,'versionId',v.id)
$$;

-- This is the canonical field and file order used by 0134 and the existing preview/Build contract.
CREATE FUNCTION sophia.managed_explore_manifest_digest(v sophia.managed_explore_versions,p_bytes bigint)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT encode(sha256(convert_to(
  '{"artifactId":'||to_json(v.session_id)::text||',"directionId":'||to_json(v.direction_id)::text
  ||',"entry":"index.html","files":[{"bytes":'||p_bytes::text||',"mime":"text/html","path":"index.html","sha256":'
  ||to_json(v.entry_sha256)::text||',"sourceId":'||to_json(v.entry_source_id)::text||'}],"format":"sophia.prototype.v1","parentVersionId":'
  ||coalesce(to_json(v.parent_version_id)::text,'null')||',"versionId":'||to_json(v.id)::text||'}','UTF8')),'hex')
$$;

CREATE OR REPLACE FUNCTION sophia.managed_explore_version_entry(v sophia.managed_explore_versions,p_actor uuid)
RETURNS TABLE(source_id uuid,byte_length bigint,storage_key text,body text)
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT src.id,src.byte_length,src.storage_key,entry.body
 FROM sophia.source_objects src
 LEFT JOIN sophia.source_texts legacy ON legacy.project_id=src.project_id AND legacy.source_id=src.id
 LEFT JOIN sophia.managed_explore_entry_bodies inline ON inline.project_id=src.project_id AND inline.source_id=src.id
 CROSS JOIN LATERAL (SELECT coalesce(inline.body,legacy.body) AS body) entry
 WHERE src.project_id=v.project_id AND src.id=v.entry_source_id AND src.owner_id=p_actor AND src.scope='private'
   AND src.eligible AND src.state='ready' AND src.sha256=v.entry_sha256 AND src.byte_length BETWEEN 1 AND 2097152
   AND src.mime IN ('text/html','text/html; charset=utf-8')
   AND ((src.storage_key='objects/'||src.project_id||'/'||src.id AND entry.body IS NULL)
     OR (src.storage_key='inline/'||src.project_id||'/'||src.id AND octet_length(entry.body)=src.byte_length
       AND encode(sha256(convert_to(entry.body,'UTF8')),'hex')=src.sha256))
   AND v.manifest=sophia.managed_explore_manifest(v,src.byte_length)
   AND v.manifest_sha256=sophia.managed_explore_manifest_digest(v,src.byte_length)
$$;

CREATE FUNCTION sophia.managed_explore_output_text(p_value jsonb,p_limit integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(p_value)='string' AND length(p_value#>>'{}') BETWEEN 1 AND p_limit
  AND (p_value#>>'{}') ~ '[^[:space:]]',false)
$$;

CREATE FUNCTION sophia.managed_explore_output_texts(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 RETURN jsonb_array_length(p_value)<=40 AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_value) a WHERE NOT sophia.managed_explore_output_text(a,1000));
END $$;

CREATE FUNCTION sophia.managed_explore_direction_output(p_card jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE step_ids text[];
BEGIN
 IF jsonb_typeof(p_card) IS DISTINCT FROM 'object'
  OR p_card-ARRAY['label','firstActor','nextStep','rationale','tradeoff','steps','edges']<>'{}'::jsonb
  OR NOT sophia.managed_explore_output_text(p_card->'label',1000)
  OR NOT sophia.managed_explore_output_text(p_card->'firstActor',1000)
  OR NOT sophia.managed_explore_output_text(p_card->'nextStep',1000)
  OR NOT sophia.managed_explore_output_text(p_card->'rationale',1000)
  OR NOT sophia.managed_explore_output_text(p_card->'tradeoff',1000)
  OR jsonb_typeof(p_card->'steps') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_card->'edges') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_card->'steps') NOT BETWEEN 2 AND 6
  OR jsonb_array_length(p_card->'edges') NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;

 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_card->'steps') j(v) WHERE
   jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT (v ?& ARRAY['id','label','lane'])
   OR v-ARRAY['id','label','lane']<>'{}'::jsonb OR NOT sophia.managed_explore_output_text(v->'label',1000)
   OR jsonb_typeof(v->'id') IS DISTINCT FROM 'string' OR v->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$'
   OR coalesce(v->>'lane','') NOT IN ('vessel','shore')) THEN RETURN false; END IF;
 SELECT array_agg(DISTINCT v->>'id') INTO step_ids FROM jsonb_array_elements(p_card->'steps') j(v);
 IF cardinality(step_ids)<>jsonb_array_length(p_card->'steps') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_card->'edges') j(v) WHERE
   jsonb_typeof(v) IS DISTINCT FROM 'object' OR v-ARRAY['from','to']<>'{}'::jsonb
   OR jsonb_typeof(v->'from') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'to') IS DISTINCT FROM 'string'
   OR NOT (v->>'from'=ANY(step_ids) AND v->>'to'=ANY(step_ids)) OR v->>'from'=v->>'to') THEN RETURN false; END IF;
 RETURN (SELECT count(DISTINCT v)=count(*) FROM jsonb_array_elements(p_card->'edges') j(v));
END $$;

CREATE FUNCTION sophia.managed_explore_direction_pair(p_pair jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE first_card jsonb:=p_pair->0; second_card jsonb:=p_pair->1;
BEGIN
 IF jsonb_typeof(p_pair) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 RETURN jsonb_array_length(p_pair)=2
  AND sophia.managed_explore_direction_output(first_card) AND sophia.managed_explore_direction_output(second_card)
  AND lower(btrim(first_card->>'label'))<>lower(btrim(second_card->>'label'))
  AND (lower(btrim(first_card->>'firstActor'))<>lower(btrim(second_card->>'firstActor'))
   OR lower(btrim(first_card->>'nextStep'))<>lower(btrim(second_card->>'nextStep')));
END $$;

-- Scope can change during provider I/O. Funding and credentials gate new possible sends, while publication checks
-- the current project, founder, source and artifact lineage of the already-recorded external effect.
CREATE FUNCTION sophia.managed_explore_retention_denial(c sophia.managed_explore_dispatch_context)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE parent sophia.managed_explore_versions;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=(c.s).project_id AND archived_at IS NULL;
 IF NOT FOUND THEN RETURN 'project_unavailable'; END IF;
 PERFORM 1 FROM sophia.project_members WHERE project_id=(c.s).project_id AND actor_id=(c.s).founder_id
  AND (c.t).actor_id=(c.s).founder_id AND active AND role IN ('admin','editor')
  AND revision=(c.s).member_revision FOR SHARE;
 IF NOT FOUND THEN RETURN 'membership_changed'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=(c.s).project_id AND id=(c.s).seed_source_id
  AND eligible AND state='ready' AND scope='project' AND sha256=(c.s).seed_sha256 FOR SHARE;
 IF NOT FOUND THEN RETURN 'source_unavailable'; END IF;
 PERFORM 1 FROM sophia.managed_explore_seed((c.s).project_id,(c.s).founder_id,(c.s).seed_entry_id) seed
  WHERE seed.source_id=(c.s).seed_source_id AND seed.revision=(c.s).seed_revision AND seed.sha256=(c.s).seed_sha256;
 IF NOT FOUND THEN RETURN 'source_unavailable'; END IF;
 IF (c.t).direction_id IS NOT NULL THEN
  PERFORM 1 FROM sophia.managed_explore_directions d WHERE d.project_id=(c.s).project_id AND d.session_id=(c.s).id
   AND d.id=(c.t).direction_id AND d.id=(c.s).selected_direction_id
   AND d.revision=(SELECT max(revision) FROM sophia.managed_explore_directions
    WHERE project_id=(c.s).project_id AND session_id=(c.s).id);
  IF NOT FOUND THEN RETURN 'direction_unavailable'; END IF;
 END IF;
 IF (c.t).parent_version_id IS NOT NULL THEN
  SELECT * INTO parent FROM sophia.managed_explore_versions WHERE project_id=(c.s).project_id
   AND session_id=(c.s).id AND id=(c.t).parent_version_id AND direction_id=(c.t).direction_id;
  PERFORM 1 FROM sophia.source_objects WHERE project_id=(c.s).project_id AND id=parent.entry_source_id
   AND eligible AND state='ready' AND scope='private' AND sha256=parent.entry_sha256 FOR SHARE;
  IF NOT FOUND THEN RETURN 'parent_unavailable'; END IF;
  PERFORM 1 FROM sophia.managed_explore_version_entry(parent,(c.s).founder_id);
  IF NOT FOUND OR ((c.t).component_id IS NOT NULL AND NOT (c.t).component_id=ANY(parent.component_ids)) THEN
   RETURN 'parent_unavailable';
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION sophia.managed_explore_prototype_body(p_output jsonb,p_bytes bytea)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE body text;
BEGIN
 IF p_output-ARRAY['kind','providerSessionId','submissionId','payloadSha256','previousRootId','rootId','environmentId',
    'artifactId','artifactRequestId','path','byteLength','sha256','changeSummary','acceptanceCriteria','mockReplacements',
    'limitations']<>'{}'::jsonb
  OR NOT sophia.managed_explore_provider_id(p_output->>'artifactId')
  OR jsonb_typeof(p_output->'artifactId') IS DISTINCT FROM 'string'
  OR (p_output?'artifactRequestId' AND (jsonb_typeof(p_output->'artifactRequestId') IS DISTINCT FROM 'string'
    OR NOT sophia.managed_explore_provider_id(p_output->>'artifactRequestId')))
  OR p_output->>'path' IS DISTINCT FROM '/workspace/outputs/index.html'
  OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 1 AND 2097152
  OR p_output->'byteLength' IS DISTINCT FROM to_jsonb(octet_length(p_bytes))
  OR p_output->>'sha256' IS DISTINCT FROM encode(sha256(p_bytes),'hex')
  OR NOT sophia.managed_explore_output_text(p_output->'changeSummary',2000)
  OR NOT sophia.managed_explore_output_texts(p_output->'acceptanceCriteria')
  OR NOT sophia.managed_explore_output_texts(p_output->'mockReplacements')
  OR NOT sophia.managed_explore_output_texts(coalesce(p_output->'limitations','[]'::jsonb)) THEN
  RAISE EXCEPTION 'Invalid managed Explore prototype output' USING ERRCODE='22023';
 END IF;
 -- PostgreSQL text deliberately rejects NUL. Round-trip the exact UTF-8 bytes without normalization.
 BEGIN
  body:=convert_from(p_bytes,'UTF8');
 EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN
  RAISE EXCEPTION 'Invalid managed Explore prototype encoding' USING ERRCODE='22023';
 END;
 IF body !~ '[^[:space:]]' OR convert_to(body,'UTF8')<>p_bytes THEN
  RAISE EXCEPTION 'Invalid managed Explore prototype output' USING ERRCODE='22023';
 END IF;
 RETURN body;
END $$;

CREATE FUNCTION sophia.managed_explore_keep_prototype(c sophia.managed_explore_dispatch_context,p_output jsonb,p_body text)
RETURNS sophia.managed_explore_versions LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE v sophia.managed_explore_versions; size bigint:=octet_length(convert_to(p_body,'UTF8'));
BEGIN
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_retention_receipts r WHERE r.project_id=(c.s).project_id
   AND r.session_id=(c.s).id AND r.provider_artifact_id=p_output->>'artifactId') THEN
  RAISE EXCEPTION 'Stale managed Explore artifact identity' USING ERRCODE='40001';
 END IF;
 v.project_id:=(c.s).project_id;
 v.session_id:=(c.s).id;
 v.id:=gen_random_uuid();
 v.entry_source_id:=gen_random_uuid();
 v.entry_sha256:=p_output->>'sha256';
 v.direction_id:=(c.t).direction_id;
 v.parent_version_id:=(c.t).parent_version_id;
 v.change_summary:=p_output->>'changeSummary';
 v.acceptance_criteria:=ARRAY(SELECT jsonb_array_elements_text(p_output->'acceptanceCriteria'));
 v.mock_replacements:=ARRAY(SELECT jsonb_array_elements_text(p_output->'mockReplacements'));
 v.limitations:=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_output->'limitations','[]'::jsonb)));
 v.component_ids:='{}';
 SELECT coalesce(max(number),0)+1 INTO v.number FROM sophia.managed_explore_versions
  WHERE project_id=v.project_id AND session_id=v.session_id;
 v.manifest:=sophia.managed_explore_manifest(v,size);
 v.manifest_sha256:=sophia.managed_explore_manifest_digest(v,size);
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
 VALUES(v.project_id,v.entry_source_id,(c.s).founder_id,'private',v.entry_sha256,'text/html',
  'inline/'||v.project_id||'/'||v.entry_source_id,size,true,'ready');
 INSERT INTO sophia.managed_explore_entry_bodies(project_id,source_id,body) VALUES(v.project_id,v.entry_source_id,p_body);
 INSERT INTO sophia.managed_explore_versions SELECT (v).*;
 UPDATE sophia.managed_explore_turns SET result_version_id=v.id WHERE project_id=v.project_id AND id=(c.t).id;
 RETURN v;
END $$;

CREATE FUNCTION sophia.managed_explore_check_retention_identity(c sophia.managed_explore_dispatch_context,p_output jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF (c.t).status<>'retaining' OR (c.t).result_version_id IS NOT NULL
  OR (c.x).event_possible_at IS NULL OR (c.x).root_completed_seen_at IS NULL
  OR (c.x).provider_root_status IS DISTINCT FROM 'completed'
  OR NOT (p_output?'previousRootId') OR (c.x).predecessor_root_id IS DISTINCT FROM p_output->>'previousRootId'
  OR (p_output->'previousRootId'<>'null'::jsonb AND jsonb_typeof(p_output->'previousRootId')<>'string')
  OR p_output->'providerSessionId' IS DISTINCT FROM to_jsonb((c.d).provider_session_id)
  OR p_output->'environmentId' IS DISTINCT FROM to_jsonb((c.d).provider_environment_id)
  OR p_output->'submissionId' IS DISTINCT FROM to_jsonb((c.x).submission_id)
  OR p_output->'payloadSha256' IS DISTINCT FROM to_jsonb((c.x).payload_sha256)
  OR p_output->'rootId' IS DISTINCT FROM to_jsonb((c.x).provider_root_id) THEN
  RAISE EXCEPTION 'Stale managed Explore output identity' USING ERRCODE='40001';
 END IF;
 IF ((c.t).kind='directions' AND p_output->>'kind' IS DISTINCT FROM 'directions')
  OR ((c.t).kind IN ('prototype','revision') AND p_output->>'kind' IS DISTINCT FROM 'prototype')
  OR (c.t).kind NOT IN ('directions','prototype','revision') THEN
  RAISE EXCEPTION 'Wrong managed Explore output kind' USING ERRCODE='22023';
 END IF;
END $$;

CREATE FUNCTION sophia.retain_managed_explore_output(p_project uuid,p_turn uuid,p_token uuid,p_output jsonb,p_bytes bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.managed_explore_dispatch_context; prior sophia.managed_explore_retention_receipts;
 fingerprint bytea; body text; denial text; revision bigint; version sophia.managed_explore_versions; result jsonb;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Worker role required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_output) IS DISTINCT FROM 'object' OR octet_length(p_output::text)>262144
  OR coalesce(octet_length(p_bytes),0)>2097152 THEN
  RAISE EXCEPTION 'Invalid managed Explore output' USING ERRCODE='22023';
 END IF;
 fingerprint:=sha256(convert_to(jsonb_build_array(p_token,p_output,encode(sha256(p_bytes),'hex'))::text,'UTF8'));
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.managed_explore_retention_receipts WHERE project_id=p_project AND turn_id=p_turn;
 IF FOUND THEN
  IF p_token IS NOT NULL AND prior.replay_sha256=fingerprint THEN RETURN prior.result; END IF;
  RAISE EXCEPTION 'Stale managed Explore output replay' USING ERRCODE='40001';
 END IF;

 c:=sophia.managed_explore_dispatch_lock(p_project,p_turn,p_token);
 PERFORM sophia.managed_explore_check_retention_identity(c,p_output);
 IF (c.t).kind='directions' THEN
  IF p_bytes IS NOT NULL OR p_output-ARRAY['kind','providerSessionId','submissionId','payloadSha256','previousRootId',
    'rootId','environmentId','directions']<>'{}'::jsonb
   OR NOT sophia.managed_explore_direction_pair(p_output->'directions') THEN
   RAISE EXCEPTION 'Invalid managed Explore direction pair' USING ERRCODE='22023';
  END IF;
 ELSE
  body:=sophia.managed_explore_prototype_body(p_output,p_bytes);
 END IF;

 denial:=sophia.managed_explore_retention_denial(c);
 IF denial IS NULL AND (c.t).kind='directions' THEN
  revision:=(c.s).revision+1;
  INSERT INTO sophia.managed_explore_directions(project_id,session_id,id,revision,position,candidate)
  SELECT p_project,(c.s).id,gen_random_uuid(),revision,position,card
  FROM jsonb_array_elements(p_output->'directions') WITH ORDINALITY d(card,position);
  UPDATE sophia.managed_explore_sessions SET selected_direction_id=NULL WHERE project_id=p_project AND id=(c.s).id;
 ELSIF denial IS NULL THEN
  version:=sophia.managed_explore_keep_prototype(c,p_output,body);
 END IF;
 IF (c.o).lease_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'Managed Explore lease lost' USING ERRCODE='40001';
 END IF;
 result:=CASE WHEN denial IS NULL THEN jsonb_build_object('kind','completed')
  ELSE jsonb_build_object('kind','denied','reason',denial) END;
 INSERT INTO sophia.managed_explore_retention_receipts(project_id,session_id,turn_id,replay_sha256,result,
  direction_revision,version_id,provider_artifact_id,provider_artifact_request_id,provider_artifact_path,byte_length,byte_sha256)
 VALUES(p_project,(c.s).id,p_turn,fingerprint,result,revision,version.id,
  CASE WHEN version.id IS NOT NULL THEN p_output->>'artifactId' END,
  CASE WHEN version.id IS NOT NULL THEN p_output->>'artifactRequestId' END,
  CASE WHEN version.id IS NOT NULL THEN p_output->>'path' END,
  CASE WHEN version.id IS NOT NULL THEN octet_length(p_bytes) END,version.entry_sha256);
 PERFORM sophia.finish_managed_explore_dispatch(c,CASE WHEN denial IS NULL THEN 'completed' ELSE 'failed' END,NULL,denial);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION sophia.managed_explore_manifest(sophia.managed_explore_versions,bigint),
 sophia.managed_explore_manifest_digest(sophia.managed_explore_versions,bigint),
 sophia.managed_explore_output_text(jsonb,integer),sophia.managed_explore_output_texts(jsonb),
 sophia.managed_explore_direction_output(jsonb),sophia.managed_explore_direction_pair(jsonb),
 sophia.managed_explore_retention_denial(sophia.managed_explore_dispatch_context),
 sophia.managed_explore_prototype_body(jsonb,bytea),
 sophia.managed_explore_keep_prototype(sophia.managed_explore_dispatch_context,jsonb,text),
 sophia.managed_explore_check_retention_identity(sophia.managed_explore_dispatch_context,jsonb),
 sophia.retain_managed_explore_output(uuid,uuid,uuid,jsonb,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.retain_managed_explore_output(uuid,uuid,uuid,jsonb,bytea) TO sophia_worker;

COMMIT;
