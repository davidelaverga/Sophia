-- A69. Append exact, independently authorized observations to the founder's reported Build return.
BEGIN;

CREATE TABLE sophia.founder_build_verification_grants (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 approval_id uuid NOT NULL,
 return_id uuid NOT NULL,
 export_id uuid NOT NULL,
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reviewer_id uuid NOT NULL,
 source_author_id uuid NOT NULL CHECK(source_author_id<>reviewer_id),
 kind text NOT NULL CHECK(kind IN ('source_review','deployed_app')),
 target jsonb NOT NULL CHECK(jsonb_typeof(target)='object'),
 authority_ref text NOT NULL CHECK(length(authority_ref) BETWEEN 1 AND 500),
 enabled boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(project_id,session_id,approval_id,return_id)
  REFERENCES sophia.founder_build_returns(project_id,session_id,approval_id,id),
 FOREIGN KEY(project_id,session_id,approval_id,export_id)
  REFERENCES sophia.founder_build_exports(project_id,session_id,approval_id,id)
);
CREATE UNIQUE INDEX founder_build_verification_active_kind
 ON sophia.founder_build_verification_grants(project_id,session_id,approval_id,return_id,kind) WHERE enabled;
CREATE UNIQUE INDEX founder_build_verification_active_reviewer
 ON sophia.founder_build_verification_grants(project_id,session_id,approval_id,return_id,reviewer_id) WHERE enabled;

CREATE TABLE sophia.founder_build_verifications (
 project_id uuid NOT NULL,
 session_id uuid NOT NULL,
 approval_id uuid NOT NULL,
 return_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 grant_id uuid NOT NULL REFERENCES sophia.founder_build_verification_grants(id),
 reviewer_id uuid NOT NULL,
 source_author_id uuid NOT NULL CHECK(source_author_id<>reviewer_id),
 kind text NOT NULL CHECK(kind IN ('source_review','deployed_app')),
 revision bigint NOT NULL CHECK(revision BETWEEN 4 AND 9007199254740991),
 outcome text NOT NULL CHECK(outcome IN ('passed','failed','blocked','unknown')),
 observation_sha256 text NOT NULL CHECK(observation_sha256 ~ '^[a-f0-9]{64}$'),
 evidence_reference text,
 evidence jsonb NOT NULL,
 PRIMARY KEY(project_id,session_id,approval_id,id),
 UNIQUE(project_id,session_id,approval_id,revision),
 UNIQUE(project_id,session_id,approval_id,return_id,kind,observation_sha256),
 FOREIGN KEY(project_id,session_id,approval_id,return_id)
  REFERENCES sophia.founder_build_returns(project_id,session_id,approval_id,id)
);
CREATE UNIQUE INDEX founder_build_verification_one_evidence_reference
 ON sophia.founder_build_verifications(project_id,session_id,approval_id,return_id,kind,evidence_reference)
 WHERE evidence_reference IS NOT NULL;
ALTER TABLE sophia.founder_build_verification_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.founder_build_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sophia.founder_build_verification_grants,sophia.founder_build_verifications
 FROM PUBLIC,sophia_api,sophia_worker;

CREATE TYPE sophia.founder_build_verification_scope AS (
 binding sophia.founder_build_bindings,
 grant_row sophia.founder_build_verification_grants,
 target jsonb
);

CREATE FUNCTION sophia.require_founder_build_context(p_session sophia.managed_explore_sessions, p_approval uuid, p_write boolean)
RETURNS sophia.founder_build_scope LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_scope; project_id_arg uuid:=p_session.project_id; session_id_arg uuid:=p_session.id;
BEGIN
 c.s:=p_session;
 IF (c.s).id IS NULL THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 SELECT a INTO c.a FROM sophia.managed_explore_approvals a WHERE a.project_id=project_id_arg AND a.session_id=session_id_arg
  AND a.id=p_approval AND a.actor_id=(c.s).founder_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 SELECT v INTO c.v FROM sophia.managed_explore_versions v WHERE v.project_id=project_id_arg AND v.session_id=session_id_arg
  AND v.id=(c.a).version_id AND v.manifest_sha256=(c.a).manifest_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 IF p_write THEN
  PERFORM 1 FROM sophia.source_objects WHERE project_id=project_id_arg AND id=(c.v).entry_source_id
   AND state='ready' AND eligible AND scope='private' AND sha256=(c.v).entry_sha256 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM 1 FROM sophia.managed_explore_version_entry(c.v,(c.s).founder_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Build approval not found' USING ERRCODE='22023'; END IF;
 SELECT b INTO c.b FROM sophia.founder_build_bindings b WHERE b.project_id=project_id_arg AND b.session_id=session_id_arg
  AND b.approval_id=p_approval;
 IF (c.b).id IS NOT NULL THEN
  IF p_write THEN
   PERFORM 1 FROM sophia.founder_build_grants WHERE project_id=project_id_arg AND session_id=session_id_arg
    AND approval_id=p_approval AND id=(c.b).grant_id FOR SHARE;
  END IF;
  SELECT g INTO c.g FROM sophia.founder_build_grants g WHERE g.project_id=project_id_arg AND g.session_id=session_id_arg
   AND g.approval_id=p_approval AND g.id=(c.b).grant_id AND g.enabled AND g.private_confirmed
   AND g.expires_at>clock_timestamp() AND g.founder_id=(c.s).founder_id AND g.recipient_id=(c.s).founder_id
   AND sophia.founder_build_grant_pin(g)=(c.b).grant_pin;
  IF NOT FOUND OR (c.b).actor_id<>(c.s).founder_id THEN
   RAISE EXCEPTION 'Build destination not found' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN c;
END $$;

CREATE OR REPLACE FUNCTION sophia.require_founder_build_scope(p_project uuid,p_session uuid,p_approval uuid,p_write boolean)
RETURNS sophia.founder_build_scope LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions;
BEGIN
 IF p_write THEN s:=sophia.managed_explore_lock_session(p_project,p_session);
 ELSE s:=sophia.managed_explore_owned_session(p_project,p_session); END IF;
 RETURN sophia.require_founder_build_context(s,p_approval,p_write);
END $$;

CREATE FUNCTION sophia.current_founder_build_return(e sophia.founder_build_exports)
RETURNS sophia.founder_build_returns LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT r FROM sophia.founder_build_returns r WHERE (r.project_id,r.session_id,r.approval_id,r.export_id)=
  (e.project_id,e.session_id,e.approval_id,e.id) ORDER BY r.revision DESC LIMIT 1
$$;

CREATE FUNCTION sophia.founder_build_verification_target(e sophia.founder_build_exports,r sophia.founder_build_returns)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('returnId',r.id,'exportId',e.id,'exportSha256',e.sha256,
  'repositoryId',e.manifest->'repositoryId','repository',e.manifest->'repository',
  'candidateSha',r.evidence->'candidateSha','pullRequestNumber',r.evidence->'pullRequestNumber',
  'mergeSha',r.evidence->'mergeSha','deploymentReference',r.evidence->'deploymentReference',
  'deployedSha',r.evidence->'deployedSha')
 WHERE r.evidence ?& ARRAY['candidateSha','pullRequestNumber','mergeSha','deploymentReference','deployedSha']
  AND r.evidence->>'repositoryId'=e.manifest->>'repositoryId' AND r.evidence->>'exportSha256'=e.sha256
$$;

-- Reviewer access shares the integrity gates, and never assumes or impersonates the founder's actor.
CREATE FUNCTION sophia.require_founder_build_verification(p_project uuid,p_session uuid,p_approval uuid,
 p_return uuid,p_write boolean)
RETURNS sophia.founder_build_verification_scope LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); result sophia.founder_build_verification_scope;
 s sophia.managed_explore_sessions; c sophia.founder_build_scope; e sophia.founder_build_exports;
 r sophia.founder_build_returns;
BEGIN
 IF actor IS NULL OR p_return IS NULL OR NOT EXISTS(SELECT 1 FROM sophia.founder_build_verification_grants g
   WHERE (g.project_id,g.session_id,g.approval_id,g.reviewer_id)=(p_project,p_session,p_approval,actor)
    AND g.enabled AND g.expires_at>clock_timestamp() AND (p_return IS NULL OR g.return_id=p_return))
 THEN RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 IF p_write THEN PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE; END IF;
 SELECT * INTO s FROM sophia.managed_explore_sessions
 WHERE (project_id,id)=(p_project,p_session) AND founder_id<>actor;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sophia.projects WHERE id=p_project AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.project_members m WHERE m.project_id=p_project AND m.actor_id=actor AND m.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.project_members m WHERE m.project_id=p_project AND m.actor_id=s.founder_id AND m.active
  AND m.role IN ('admin','editor');
 IF NOT FOUND THEN RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 IF p_write THEN
  PERFORM 1 FROM sophia.project_members m WHERE m.project_id=p_project AND m.active AND
   (m.actor_id=actor OR (m.actor_id=s.founder_id AND m.role IN ('admin','editor'))) ORDER BY m.actor_id FOR SHARE;
  IF (SELECT count(*) FROM sophia.project_members m WHERE m.project_id=p_project AND m.active AND
   (m.actor_id=actor OR (m.actor_id=s.founder_id AND m.role IN ('admin','editor'))))<>2 THEN
   RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=s.seed_source_id
   AND state='ready' AND eligible AND scope='project' AND sha256=s.seed_sha256 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM 1 FROM sophia.managed_explore_seed(p_project,s.founder_id,s.seed_entry_id) seed
  WHERE (seed.revision,seed.source_id,seed.sha256)=(s.seed_revision,s.seed_source_id,s.seed_sha256);
 IF NOT FOUND THEN RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;

 c:=sophia.require_founder_build_context(s,p_approval,p_write);
 e:=sophia.require_founder_build_export(c,NULL);
 r:=sophia.current_founder_build_return(e);
 result.target:=sophia.founder_build_verification_target(e,r);
 IF result.target IS NULL OR (p_return IS NOT NULL AND p_return IS DISTINCT FROM r.id) OR r.actor_id<>s.founder_id THEN
  RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 IF p_write THEN
  SELECT g INTO result.grant_row FROM sophia.founder_build_verification_grants g
  WHERE (g.project_id,g.session_id,g.approval_id,g.return_id,g.export_id,g.reviewer_id)
    =(p_project,p_session,p_approval,r.id,e.id,actor)
   AND g.target=result.target AND g.enabled FOR SHARE;
 ELSE
  SELECT g INTO result.grant_row FROM sophia.founder_build_verification_grants g
  WHERE (g.project_id,g.session_id,g.approval_id,g.return_id,g.export_id,g.reviewer_id)
    =(p_project,p_session,p_approval,r.id,e.id,actor)
   AND g.target=result.target AND g.enabled;
 END IF;
 IF NOT FOUND OR (result.grant_row).expires_at<=clock_timestamp() OR (c.g).expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 result.binding:=c.b;
 RETURN result;
END $$;

CREATE FUNCTION sophia.read_founder_build_verification(p_project uuid,p_session uuid,p_approval uuid,p_return uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_verification_scope;
BEGIN
 c:=sophia.require_founder_build_verification(p_project,p_session,p_approval,p_return,false);
 RETURN jsonb_build_object('revision',(c.binding).revision,'kind',(c.grant_row).kind,'target',c.target);
END $$;

-- Compare normalized text while keeping the submitted wording in each receipt.
-- Match ECMAScript trim, including localized spaces, and use LF for line endings.
CREATE FUNCTION sophia.normalize_founder_build_observation(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT btrim(replace(replace(p_text,E'\r\n',E'\n'),E'\r',E'\n'),
  U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;

CREATE FUNCTION sophia.founder_build_observed_deployment_matches(p_observation jsonb,p_target jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_observation->>'mappingSourceSha' IS NOT DISTINCT FROM p_target->>'mergeSha'
  AND p_observation->>'observedDeployedSha' IS NOT DISTINCT FROM p_target->>'deployedSha'
  AND p_observation->>'observedDeploymentReference' IS NOT DISTINCT FROM p_target->>'deploymentReference'
$$;

CREATE FUNCTION sophia.validate_founder_build_verification(p_body jsonb,c sophia.founder_build_verification_scope)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR
  p_body-ARRAY['expectedRevision','returnId','kind','outcome','scenario','expected','observed','evidenceReference','mappingSourceSha',
    'observedDeployedSha','observedDeploymentReference']<>'{}'::jsonb OR
  jsonb_typeof(p_body->'expectedRevision') IS DISTINCT FROM 'number' OR
  p_body->>'expectedRevision' !~ '^[1-9][0-9]{0,15}$' OR (p_body->>'expectedRevision')::numeric>9007199254740991 OR
  p_body->>'outcome' IS NULL OR
  p_body->>'outcome' NOT IN ('passed','failed','blocked','unknown') THEN
  RAISE EXCEPTION 'Invalid Build verification' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['scenario','expected','observed']) AS fields(field)
   WHERE jsonb_typeof(p_body->field) IS DISTINCT FROM 'string' OR char_length(p_body->>field) NOT BETWEEN 1 AND 2000
    OR sophia.normalize_founder_build_observation(p_body->>field)='') THEN
  RAISE EXCEPTION 'Invalid Build verification observations' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['evidenceReference','observedDeploymentReference']) AS fields(field)
  WHERE p_body?field AND (jsonb_typeof(p_body->field) IS DISTINCT FROM 'string'
    OR length(p_body->>field)>500 OR p_body->>field !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._/%~:+-]*)?$')) THEN
  RAISE EXCEPTION 'Invalid Build verification evidence reference' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['mappingSourceSha','observedDeployedSha']) AS fields(field)
  WHERE p_body?field AND (jsonb_typeof(p_body->field) IS DISTINCT FROM 'string'
   OR p_body->>field !~ '^([a-f0-9]{40}|[a-f0-9]{64})$')) THEN
  RAISE EXCEPTION 'Invalid Build verification observed commit' USING ERRCODE='22023'; END IF;
 IF (c.grant_row).kind='source_review' AND p_body?|ARRAY['mappingSourceSha','observedDeployedSha','observedDeploymentReference'] THEN
  RAISE EXCEPTION 'Invalid deployment observation for source review' USING ERRCODE='22023'; END IF;
 IF (c.grant_row).kind='deployed_app' AND p_body->>'outcome'='passed'
  AND NOT sophia.founder_build_observed_deployment_matches(p_body,c.target) THEN
  RAISE EXCEPTION 'Stale Build verification observed deployment' USING ERRCODE='40001'; END IF;
END $$;

CREATE FUNCTION sophia.write_founder_build_verification(p_project uuid,p_session uuid,p_approval uuid,p_key text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_verification_scope; actor uuid:=sophia.actor_id(); result jsonb;
 digest text; observation_digest text; reference text:=p_body->>'evidenceReference'; target_return uuid:=(p_body->>'returnId')::uuid; receipt_id uuid:=gen_random_uuid();
BEGIN
 IF target_return IS NULL THEN RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 c:=sophia.require_founder_build_verification(p_project,p_session,p_approval,target_return,true);
 IF p_body->>'kind' IS DISTINCT FROM (c.grant_row).kind THEN
  RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
 digest:=sophia.founder_build_sha256(jsonb_build_array('founder-build-verification',p_session,p_approval,p_body));
 result:=sophia.managed_explore_prior(p_project,actor,p_key,digest);
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM sophia.founder_build_verifications v
    WHERE (v.project_id,v.session_id,v.approval_id,v.return_id,v.reviewer_id)
      =(p_project,p_session,p_approval,target_return,actor) AND v.id::text=result->>'id'
      AND v.grant_id=(c.grant_row).id AND v.kind=(c.grant_row).kind AND v.source_author_id=(c.grant_row).source_author_id
      AND v.evidence->'target'=c.target) THEN
   RAISE EXCEPTION 'Build verification not found' USING ERRCODE='22023'; END IF;
  RETURN result;
 END IF;
 PERFORM sophia.validate_founder_build_verification(p_body,c);
 IF (p_body->>'expectedRevision')::numeric<>(c.binding).revision THEN
  RAISE EXCEPTION 'Stale Build handoff revision' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.founder_build_verifications v WHERE
  (v.project_id,v.session_id,v.approval_id,v.return_id)=(p_project,p_session,p_approval,target_return)
  AND (v.source_author_id<>(c.grant_row).source_author_id OR
   (v.reviewer_id=actor AND v.kind<>(c.grant_row).kind))) THEN
  RAISE EXCEPTION 'Conflicting Build review authority' USING ERRCODE='40001'; END IF;
 -- A fresh key, attachment or disposition cannot turn an older observation into a new retest.
 observation_digest:=sophia.founder_build_sha256(jsonb_build_array(c.target,(c.grant_row).kind,
  sophia.normalize_founder_build_observation(p_body->>'scenario'),
  sophia.normalize_founder_build_observation(p_body->>'expected'),
  sophia.normalize_founder_build_observation(p_body->>'observed'),p_body->'mappingSourceSha',
  p_body->'observedDeployedSha',p_body->'observedDeploymentReference'));
 IF EXISTS(SELECT 1 FROM sophia.founder_build_verifications v WHERE
  (v.project_id,v.session_id,v.approval_id,v.return_id,v.kind)=(p_project,p_session,p_approval,target_return,(c.grant_row).kind)
   AND v.observation_sha256=observation_digest) THEN
  RAISE EXCEPTION 'Build verification observation already recorded' USING ERRCODE='40001'; END IF;
 IF reference IS NOT NULL AND EXISTS(SELECT 1 FROM sophia.founder_build_verifications v WHERE
  (v.project_id,v.session_id,v.approval_id,v.return_id,v.kind)=(p_project,p_session,p_approval,target_return,(c.grant_row).kind)
   AND v.evidence_reference=reference) THEN
  RAISE EXCEPTION 'Build verification evidence reference conflicts with a recorded observation' USING ERRCODE='40001'; END IF;
 result:=(p_body-ARRAY['expectedRevision','returnId'])||jsonb_build_object(
  'id',receipt_id,'target',c.target,'recordedAt',clock_timestamp());
 INSERT INTO sophia.founder_build_verifications(project_id,session_id,approval_id,return_id,id,
  grant_id,reviewer_id,source_author_id,kind,revision,outcome,observation_sha256,evidence_reference,evidence)
 VALUES(p_project,p_session,p_approval,target_return,receipt_id,(c.grant_row).id,actor,(c.grant_row).source_author_id,
  (c.grant_row).kind,(c.binding).revision+1,p_body->>'outcome',observation_digest,reference,result);
 UPDATE sophia.founder_build_bindings SET revision=revision+1
  WHERE (project_id,session_id,approval_id)=(p_project,p_session,p_approval);
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,actor,p_key,digest,result);
 RETURN result;
END $$;

CREATE FUNCTION sophia.founder_build_verification_projection(e sophia.founder_build_exports)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.founder_build_returns:=sophia.current_founder_build_return(e);
 target_doc jsonb:=sophia.founder_build_verification_target(e,r); history jsonb; verified boolean; source_check text; app_check text;
BEGIN
 SELECT jsonb_agg(v.evidence ORDER BY v.revision) INTO history FROM sophia.founder_build_verifications v
  WHERE (v.project_id,v.session_id,v.approval_id)=(e.project_id,e.session_id,e.approval_id);
 WITH latest AS (
  SELECT DISTINCT ON (v.kind) v.* FROM sophia.founder_build_verifications v
  WHERE (v.project_id,v.session_id,v.approval_id,v.return_id)=(e.project_id,e.session_id,e.approval_id,r.id)
   AND v.evidence->'target'=target_doc ORDER BY v.kind,v.revision DESC
 ), evaluated AS (
  SELECT v.*,CASE WHEN g.enabled AND g.target=target_doc AND g.source_author_id=v.source_author_id
   AND g.kind=v.kind AND g.reviewer_id=v.reviewer_id
   AND (g.project_id,g.session_id,g.approval_id,g.return_id,g.export_id)=(e.project_id,e.session_id,e.approval_id,r.id,e.id)
   THEN CASE WHEN v.kind='deployed_app' AND v.outcome='passed'
    AND NOT sophia.founder_build_observed_deployment_matches(v.evidence,target_doc) THEN 'unknown'
    ELSE v.outcome END ELSE 'authority_withdrawn' END AS check_state
  FROM latest v LEFT JOIN sophia.founder_build_verification_grants g ON g.id=v.grant_id
 )
 SELECT (SELECT check_state FROM evaluated WHERE kind='source_review'),
  (SELECT check_state FROM evaluated WHERE kind='deployed_app'),
  EXISTS(SELECT 1 FROM evaluated s JOIN evaluated d
   ON s.kind='source_review' AND d.kind='deployed_app' AND s.reviewer_id<>d.reviewer_id
    AND s.source_author_id=d.source_author_id WHERE s.check_state='passed' AND d.check_state='passed')
   INTO source_check,app_check,verified;
 RETURN jsonb_build_object('currentReturnId',r.id,'receipts',coalesce(history,'[]'::jsonb),
  'checks',jsonb_build_object('sourceReview',coalesce(source_check,'pending'),'deployedApp',coalesce(app_check,'pending')),
  'status',
  CASE WHEN verified THEN 'verified_in_app' WHEN target_doc IS NOT NULL THEN 'awaiting_verification' ELSE 'reported' END);
END $$;

CREATE OR REPLACE FUNCTION sophia.read_founder_build(p_project uuid,p_session uuid,p_approval uuid,p_kind text,p_target uuid,p_file uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.founder_build_scope; e sophia.founder_build_exports; returns jsonb; retained jsonb;
BEGIN
 c:=sophia.require_founder_build_scope(p_project,p_session,p_approval,false);
 IF p_kind='destination' THEN
  e:=sophia.require_founder_build_export(c,NULL);
  SELECT jsonb_agg(r.evidence ORDER BY r.revision) INTO returns FROM sophia.founder_build_returns r
   WHERE r.project_id=p_project AND r.session_id=p_session AND r.approval_id=p_approval AND r.export_id=e.id;
  RETURN jsonb_build_object('revision',coalesce((c.b).revision,1),'binding',(c.b).binding,
   'export',CASE WHEN e.id IS NULL THEN NULL ELSE sophia.founder_build_export_view(e) END,'returns',coalesce(returns,'[]'::jsonb))
   ||CASE WHEN returns IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('verification',sophia.founder_build_verification_projection(e)) END;
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

REVOKE ALL ON FUNCTION
 sophia.require_founder_build_context(sophia.managed_explore_sessions,uuid,boolean),
 sophia.current_founder_build_return(sophia.founder_build_exports),
 sophia.founder_build_verification_target(sophia.founder_build_exports,sophia.founder_build_returns),
 sophia.require_founder_build_verification(uuid,uuid,uuid,uuid,boolean),
 sophia.normalize_founder_build_observation(text),
 sophia.founder_build_observed_deployment_matches(jsonb,jsonb),
 sophia.validate_founder_build_verification(jsonb,sophia.founder_build_verification_scope),
 sophia.founder_build_verification_projection(sophia.founder_build_exports),
 sophia.read_founder_build_verification(uuid,uuid,uuid,uuid),
 sophia.write_founder_build_verification(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,sophia_api,sophia_worker;
GRANT EXECUTE ON FUNCTION sophia.read_founder_build_verification(uuid,uuid,uuid,uuid),
 sophia.write_founder_build_verification(uuid,uuid,uuid,text,jsonb) TO sophia_api;

COMMIT;
