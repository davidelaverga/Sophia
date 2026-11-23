-- A68. One operator-installed exact private destination for an approved founder prototype.
-- This migration installs no grant and has no repository, provider or deployment effect.
BEGIN;

CREATE TABLE sophia.founder_build_grants (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 approval_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 founder_id uuid NOT NULL,
 recipient_id uuid NOT NULL CHECK(recipient_id=founder_id),
 repository_id text NOT NULL CHECK(repository_id ~ '^[1-9][0-9]{0,19}$'),
 repository text NOT NULL CHECK(repository ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$'),
 default_branch text NOT NULL CHECK(default_branch ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$'
   AND default_branch !~ '(\.\.|//|/\.|\.lock(/|$)|[./]$)'),
 seed_commit text NOT NULL CHECK(seed_commit ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 private_confirmed boolean NOT NULL CHECK(private_confirmed),
 provenance text NOT NULL CHECK(provenance IN ('reported','independently_checked')),
 authority_ref text NOT NULL CHECK(length(authority_ref) BETWEEN 1 AND 500),
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(project_id,session_id,approval_id,id),
 FOREIGN KEY(project_id,session_id,approval_id) REFERENCES sophia.managed_explore_approvals(project_id,session_id,id)
);
CREATE UNIQUE INDEX founder_build_one_enabled_grant ON sophia.founder_build_grants(project_id,session_id,approval_id)
 WHERE enabled;

CREATE TABLE sophia.founder_build_bindings (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 approval_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 grant_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 grant_pin jsonb NOT NULL,
 binding jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 2 CHECK(revision BETWEEN 2 AND 9007199254740991),
 PRIMARY KEY(project_id,session_id,approval_id),
 UNIQUE(project_id,session_id,approval_id,id),
 FOREIGN KEY(project_id,session_id,approval_id,grant_id) REFERENCES sophia.founder_build_grants(project_id,session_id,approval_id,id)
);
CREATE TABLE sophia.founder_build_exports (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 approval_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 binding_id uuid NOT NULL,
 recipient_id uuid NOT NULL,
 manifest jsonb NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 revision bigint NOT NULL CHECK(revision BETWEEN 3 AND 9007199254740991),
 PRIMARY KEY(project_id,session_id,approval_id),
 UNIQUE(project_id,session_id,approval_id,id),
 FOREIGN KEY(project_id,session_id,approval_id,binding_id) REFERENCES sophia.founder_build_bindings(project_id,session_id,approval_id,id)
);
CREATE TABLE sophia.founder_build_returns (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 approval_id uuid NOT NULL,
 export_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 4 AND 9007199254740991),
 evidence jsonb NOT NULL,
 reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,session_id,approval_id,id),
 UNIQUE(project_id,session_id,approval_id,revision),
 FOREIGN KEY(project_id,session_id,approval_id,export_id) REFERENCES sophia.founder_build_exports(project_id,session_id,approval_id,id)
);
ALTER TABLE sophia.founder_build_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.founder_build_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.founder_build_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.founder_build_returns ENABLE ROW LEVEL SECURITY;

CREATE TYPE sophia.founder_build_scope AS (
 s sophia.managed_explore_sessions,
 a sophia.managed_explore_approvals,
 v sophia.managed_explore_versions,
 b sophia.founder_build_bindings,
 g sophia.founder_build_grants
);

-- The stored manifest is built internally with fixed ASCII field names and safe integer counts.
-- JSONB equality and this compact lexical encoding both preserve semantic array order.
CREATE FUNCTION sophia.founder_build_canonical_json(p_value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE encoded text;
BEGIN
 CASE jsonb_typeof(p_value)
  WHEN 'object' THEN
   SELECT string_agg(to_json(key)::text||':'||sophia.founder_build_canonical_json(value),',' ORDER BY key COLLATE "C")
    INTO encoded FROM jsonb_each(p_value);
   RETURN '{'||coalesce(encoded,'')||'}';
  WHEN 'array' THEN
   SELECT string_agg(sophia.founder_build_canonical_json(value),',' ORDER BY position)
    INTO encoded FROM jsonb_array_elements(p_value) WITH ORDINALITY AS element(value,position);
   RETURN '['||coalesce(encoded,'')||']';
  ELSE RETURN p_value::text;
 END CASE;
END $$;

CREATE FUNCTION sophia.founder_build_sha256(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT encode(sha256(convert_to(sophia.founder_build_canonical_json(p_value),'UTF8')),'hex')
$$;

CREATE FUNCTION sophia.founder_build_grant_pin(g sophia.founder_build_grants)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('founderId',g.founder_id,'recipient',g.recipient_id,'repositoryId',g.repository_id,
  'repository',g.repository,'defaultBranch',g.default_branch,'seedCommit',g.seed_commit,
  'privateConfirmed',g.private_confirmed,'provenance',g.provenance,'authorityReference',g.authority_ref)
$$;

CREATE FUNCTION sophia.require_founder_build_scope(p_project uuid, p_session uuid, p_approval uuid, p_write boolean)
RETURNS sophia.founder_build_scope LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_scope;
BEGIN
 IF p_write THEN
  c.s:=sophia.managed_explore_lock_session(p_project,p_session);
 ELSE
  c.s:=sophia.managed_explore_owned_session(p_project,p_session);
 END IF;
 IF (c.s).id IS NULL THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 SELECT a INTO c.a FROM sophia.managed_explore_approvals a WHERE a.project_id=p_project AND a.session_id=p_session
  AND a.id=p_approval AND a.actor_id=(c.s).founder_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 SELECT v INTO c.v FROM sophia.managed_explore_versions v WHERE v.project_id=p_project AND v.session_id=p_session
  AND v.id=(c.a).version_id AND v.manifest_sha256=(c.a).manifest_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 IF p_write THEN
  PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=(c.v).entry_source_id
   AND state='ready' AND eligible AND scope='private' AND sha256=(c.v).entry_sha256 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM 1 FROM sophia.managed_explore_version_entry(c.v,(c.s).founder_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 SELECT b INTO c.b FROM sophia.founder_build_bindings b WHERE b.project_id=p_project AND b.session_id=p_session
  AND b.approval_id=p_approval;
 IF (c.b).id IS NOT NULL THEN
  IF p_write THEN
   PERFORM 1 FROM sophia.founder_build_grants WHERE project_id=p_project AND session_id=p_session
    AND approval_id=p_approval AND id=(c.b).grant_id FOR SHARE;
  END IF;
  SELECT g INTO c.g FROM sophia.founder_build_grants g WHERE g.project_id=p_project AND g.session_id=p_session
   AND g.approval_id=p_approval AND g.id=(c.b).grant_id AND g.enabled AND g.private_confirmed
   AND g.expires_at>clock_timestamp() AND g.founder_id=(c.s).founder_id AND g.recipient_id=(c.s).founder_id
   AND sophia.founder_build_grant_pin(g)=(c.b).grant_pin;
  IF NOT FOUND OR (c.b).actor_id<>(c.s).founder_id THEN
   RAISE EXCEPTION 'Build destination not found' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN c;
END $$;

CREATE FUNCTION sophia.founder_build_export_manifest(c sophia.founder_build_scope)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('approvalId',(c.a).id,'versionId',(c.v).id,'prototypeManifestSha256',(c.a).manifest_sha256,
  'bindingId',(c.b).id,'repositoryId',(c.g).repository_id,'repository',(c.g).repository,'defaultBranch',(c.g).default_branch,
  'seedCommit',(c.g).seed_commit,'recipient',(c.g).recipient_id,'transport','manual_owner_codex',
  'acceptanceCriteria',(c.a).acceptance_criteria,'files',jsonb_build_array(jsonb_build_object('id',r.source_id,'sourceId',r.source_id,
   'path','index.html','mime','text/html','byteCount',r.byte_length,'sha256',(c.v).entry_sha256)))
 FROM sophia.managed_explore_version_entry(c.v,(c.s).founder_id) r
$$;

CREATE FUNCTION sophia.founder_build_export_view(e sophia.founder_build_exports)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',e.id,'revision',e.revision,'sha256',e.sha256,'manifest',e.manifest)
$$;

CREATE FUNCTION sophia.require_founder_build_export(c sophia.founder_build_scope, p_export uuid)
RETURNS sophia.founder_build_exports LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.founder_build_exports;
BEGIN
 SELECT * INTO e FROM sophia.founder_build_exports WHERE project_id=(c.s).project_id AND session_id=(c.s).id AND approval_id=(c.a).id;
 IF NOT FOUND AND p_export IS NULL THEN RETURN NULL; END IF;
 IF NOT FOUND OR (p_export IS NOT NULL AND e.id<>p_export) OR e.binding_id IS DISTINCT FROM (c.b).id
   OR e.recipient_id IS DISTINCT FROM (c.g).recipient_id
   OR e.manifest IS DISTINCT FROM sophia.founder_build_export_manifest(c)
   OR e.sha256 IS DISTINCT FROM sophia.founder_build_sha256(e.manifest) THEN
  RAISE EXCEPTION 'Build export not found' USING ERRCODE='22023'; END IF;
 RETURN e;
END $$;

CREATE FUNCTION sophia.read_founder_build(p_project uuid,p_session uuid,p_approval uuid,p_kind text,p_target uuid,p_file uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_scope; e sophia.founder_build_exports; returns jsonb; retained jsonb;
BEGIN
 c:=sophia.require_founder_build_scope(p_project,p_session,p_approval,false);
 IF p_kind='destination' THEN
  e:=sophia.require_founder_build_export(c,NULL);
  SELECT jsonb_agg(r.evidence ORDER BY r.revision) INTO returns FROM sophia.founder_build_returns r
   WHERE r.project_id=p_project AND r.session_id=p_session AND r.approval_id=p_approval AND r.export_id=e.id;
  RETURN jsonb_build_object('revision',coalesce((c.b).revision,1),'binding',(c.b).binding,
   'export',CASE WHEN e.id IS NULL THEN NULL ELSE sophia.founder_build_export_view(e) END,'returns',coalesce(returns,'[]'::jsonb));
 END IF;
 IF p_kind='binding_entry' THEN
  IF p_target IS NULL OR (c.b).id IS DISTINCT FROM p_target THEN
   RAISE EXCEPTION 'Build binding not found' USING ERRCODE='22023'; END IF;
 ELSIF p_kind IN ('manifest','file') AND p_target IS NOT NULL THEN
  e:=sophia.require_founder_build_export(c,p_target);
  IF p_kind='manifest' THEN RETURN sophia.founder_build_export_view(e); END IF;
  IF (c.v).entry_source_id IS DISTINCT FROM p_file THEN
   RAISE EXCEPTION 'Build file not found' USING ERRCODE='22023'; END IF;
 ELSE
  RAISE EXCEPTION 'Invalid Build read' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object('projectId',p_project,'sourceId',r.source_id,'byteLength',r.byte_length,
  'entrySha256',(c.v).entry_sha256,'storageKey',r.storage_key,'text',r.body)
 INTO retained FROM sophia.managed_explore_version_entry(c.v,(c.s).founder_id) r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build file not found' USING ERRCODE='22023'; END IF;
 RETURN retained;
END $$;

CREATE FUNCTION sophia.bind_founder_build_repository(c sophia.founder_build_scope,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.founder_build_grants; b_id uuid:=gen_random_uuid(); result jsonb;
BEGIN
 IF (c.b).id IS NOT NULL THEN RAISE EXCEPTION 'Build destination already bound' USING ERRCODE='40001'; END IF;
 IF p_body-ARRAY['repositoryId','repository','defaultBranch','seedCommit','privateConfirmed','expectedRevision']<>'{}'::jsonb
    OR p_body->'privateConfirmed' IS DISTINCT FROM 'true'::jsonb THEN
  RAISE EXCEPTION 'Confirm the private Build destination' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.founder_build_grants WHERE project_id=(c.s).project_id AND session_id=(c.s).id AND approval_id=(c.a).id
   AND founder_id=(c.s).founder_id AND recipient_id=(c.s).founder_id AND enabled AND private_confirmed
   AND expires_at>clock_timestamp() AND repository_id=p_body->>'repositoryId' AND lower(repository)=lower(p_body->>'repository')
   AND default_branch=p_body->>'defaultBranch' AND seed_commit=p_body->>'seedCommit' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build destination not found' USING ERRCODE='22023'; END IF;
 result:=jsonb_build_object('id',b_id,'revision',2,'repositoryId',g.repository_id,'repository',g.repository,
  'defaultBranch',g.default_branch,'seedCommit',g.seed_commit,'privateConfirmed',true,'provenance',g.provenance);
 INSERT INTO sophia.founder_build_bindings(project_id,session_id,approval_id,id,grant_id,actor_id,grant_pin,binding)
 VALUES((c.s).project_id,(c.s).id,(c.a).id,b_id,g.id,(c.s).founder_id,sophia.founder_build_grant_pin(g),result);
 RETURN result;
END $$;

CREATE FUNCTION sophia.prepare_founder_build_export(c sophia.founder_build_scope,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.founder_build_exports; manifest_payload jsonb;
BEGIN
 IF p_body-ARRAY['bindingId','expectedRevision']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Invalid Build export request' USING ERRCODE='22023'; END IF;
 IF (c.b).id IS NULL OR (c.b).id::text IS DISTINCT FROM p_body->>'bindingId' THEN
  RAISE EXCEPTION 'Build binding not found' USING ERRCODE='22023'; END IF;
 e:=sophia.require_founder_build_export(c,NULL);
 IF e.id IS NOT NULL THEN RAISE EXCEPTION 'Build export already prepared' USING ERRCODE='40001'; END IF;
 manifest_payload:=sophia.founder_build_export_manifest(c);
 IF manifest_payload IS NULL THEN RAISE EXCEPTION 'Build export file not found' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.founder_build_exports(project_id,session_id,approval_id,binding_id,recipient_id,manifest,sha256,revision)
 VALUES((c.s).project_id,(c.s).id,(c.a).id,(c.b).id,(c.g).recipient_id,manifest_payload,
  sophia.founder_build_sha256(manifest_payload),(c.b).revision+1) RETURNING * INTO e;
 RETURN sophia.founder_build_export_view(e);
END $$;

CREATE FUNCTION sophia.record_founder_build_return(c sophia.founder_build_scope,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.founder_build_exports; evidence jsonb; result jsonb; id uuid:=gen_random_uuid();
BEGIN
 IF p_body-ARRAY['expectedRevision','exportId','exportSha256','repositoryId','candidateSha',
    'pullRequestNumber','mergeSha','deploymentReference','deployedSha']<>'{}'::jsonb OR p_body->>'exportId' IS NULL THEN
  RAISE EXCEPTION 'Invalid Build return request' USING ERRCODE='22023'; END IF;
 e:=sophia.require_founder_build_export(c,(p_body->>'exportId')::uuid);
 IF e.sha256 IS DISTINCT FROM p_body->>'exportSha256' OR (c.g).repository_id IS DISTINCT FROM p_body->>'repositoryId' THEN
  RAISE EXCEPTION 'Stale Build export or repository binding' USING ERRCODE='40001'; END IF;
 evidence:=p_body-ARRAY['expectedRevision','exportId','exportSha256','repositoryId'];
 IF evidence='{}'::jsonb OR EXISTS(
   SELECT 1 FROM jsonb_each(evidence) f WHERE
    CASE
     WHEN f.key IN ('candidateSha','mergeSha','deployedSha') THEN
      jsonb_typeof(f.value)<>'string' OR (f.value #>> '{}') !~ '^[a-f0-9]+$'
       OR length(f.value #>> '{}')<>length((c.g).seed_commit)
     WHEN f.key='pullRequestNumber' THEN
      jsonb_typeof(f.value)<>'number' OR f.value::text !~ '^[1-9][0-9]{0,15}$' OR f.value::numeric>9007199254740991
     ELSE jsonb_typeof(f.value)<>'string' OR length(f.value #>> '{}')>500
      OR (f.value #>> '{}') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._/%~:+-]*)?$'
    END) THEN
  RAISE EXCEPTION 'Supply at least one valid Build evidence field' USING ERRCODE='22023'; END IF;
 result:=evidence||jsonb_build_object('id',id,'exportId',e.id,'exportSha256',e.sha256,
  'repositoryId',(c.g).repository_id,'status','reported');
 INSERT INTO sophia.founder_build_returns(project_id,session_id,approval_id,export_id,id,actor_id,revision,evidence)
 VALUES((c.s).project_id,(c.s).id,(c.a).id,e.id,id,(c.s).founder_id,(c.b).revision+1,result);
 RETURN result;
END $$;

CREATE FUNCTION sophia.write_founder_build(p_project uuid,p_session uuid,p_approval uuid,p_kind text,p_key text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_scope; result jsonb; request_digest text; current_revision bigint;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('binding','export','return') OR p_body IS NULL OR jsonb_typeof(p_body)<>'object'
   OR jsonb_typeof(p_body->'expectedRevision') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'Invalid Build request' USING ERRCODE='22023'; END IF;
 c:=sophia.require_founder_build_scope(p_project,p_session,p_approval,true);
 IF p_kind='binding' AND jsonb_typeof(p_body->'repository')='string' THEN
  p_body:=p_body||jsonb_build_object('repository',lower(p_body->>'repository'));
 END IF;
 request_digest:=sophia.founder_build_sha256(jsonb_build_array('founder-build',p_kind,p_session,p_approval,p_body));
 result:=sophia.managed_explore_prior(p_project,(c.s).founder_id,p_key,request_digest);
 IF result IS NOT NULL THEN
  IF p_kind<>'binding' THEN PERFORM sophia.require_founder_build_export(c,(result->>CASE WHEN p_kind='export' THEN 'id' ELSE 'exportId' END)::uuid); END IF;
  RETURN result;
 END IF;
 current_revision:=coalesce((c.b).revision,1);
 IF (p_body->>'expectedRevision')::numeric<>current_revision THEN
  RAISE EXCEPTION 'Stale Build handoff revision' USING ERRCODE='40001'; END IF;
 CASE p_kind
  WHEN 'binding' THEN result:=sophia.bind_founder_build_repository(c,p_body);
  WHEN 'export' THEN result:=sophia.prepare_founder_build_export(c,p_body);
  ELSE result:=sophia.record_founder_build_return(c,p_body);
 END CASE;
 IF p_kind<>'binding' THEN
  UPDATE sophia.founder_build_bindings SET revision=revision+1
    WHERE project_id=p_project AND session_id=p_session AND approval_id=p_approval;
 END IF;
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,(c.s).founder_id,p_key,request_digest,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION sophia.founder_build_canonical_json(jsonb),sophia.founder_build_sha256(jsonb),
 sophia.founder_build_grant_pin(sophia.founder_build_grants),sophia.require_founder_build_scope(uuid,uuid,uuid,boolean),
 sophia.founder_build_export_manifest(sophia.founder_build_scope),sophia.founder_build_export_view(sophia.founder_build_exports),
 sophia.require_founder_build_export(sophia.founder_build_scope,uuid),sophia.read_founder_build(uuid,uuid,uuid,text,uuid,uuid),
 sophia.bind_founder_build_repository(sophia.founder_build_scope,jsonb),sophia.prepare_founder_build_export(sophia.founder_build_scope,jsonb),
 sophia.record_founder_build_return(sophia.founder_build_scope,jsonb),sophia.write_founder_build(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.read_founder_build(uuid,uuid,uuid,text,uuid,uuid),
 sophia.write_founder_build(uuid,uuid,uuid,text,text,jsonb) TO sophia_api;

COMMIT;
