-- S1-05A (contract amendments A04 and A05): the real service side of the runtime bridge, attributed
-- discussion, and one typed native task (draft_brief) admitted through the product records.
-- * Small texts (a contribution, a brief's context manifest, a captured result) are sources like any other
--   (source_objects: owner, scope, SHA-256, eligibility); their bytes live in source_texts until object
--   storage exists. storage_key 'inline/<project>/<id>' says where.
-- * A runtime instance is one registered dsh runtime (project, executor resource, runtime unit) holding a
--   capability whose SHA-256 alone is stored. It is not a member: its functions never set or read an actor,
--   and what it reports is evidence (receipts, observations), never acceptance.
-- * Dispatch rechecks authority when it runs and gives an ineligible row an explicit terminal outcome
--   (denied, with a reason) instead of leaving it pending. A runtime command is written in the same
--   transaction as its outbox result, so an uncertain dispatch is reconciled from the database, never resent.
-- Lock order is unchanged: project, then goal, then the rows under it. 0001–0011 are not edited.
BEGIN;

ALTER TABLE sophia.outbox ADD COLUMN outcome_reason text CHECK(outcome_reason IS NULL OR length(outcome_reason)<=2000);
ALTER TABLE sophia.jobs ADD COLUMN attempt_id uuid, ADD COLUMN reason text CHECK(reason IS NULL OR length(reason)<=2000),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN result_revision integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT jobs_attempt_fk FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id);
ALTER TABLE sophia.usage_records ADD COLUMN provider text, ADD COLUMN model text, ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT usage_provider_call_once UNIQUE(project_id,attempt_id,provider_call_id);
ALTER TABLE sophia.native_observations ADD COLUMN native_seq bigint CHECK(native_seq IS NULL OR native_seq>=0), ADD COLUMN data jsonb;

-- Bytes of small sources. Readable exactly when the source itself is (the policy runs under the reader).
CREATE TABLE sophia.source_texts (
 project_id uuid NOT NULL, source_id uuid NOT NULL,
 body text NOT NULL CHECK(octet_length(body) BETWEEN 1 AND 262144),
 PRIMARY KEY(project_id,source_id), FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);
ALTER TABLE sophia.source_texts ENABLE ROW LEVEL SECURITY;
CREATE POLICY readable_source ON sophia.source_texts FOR SELECT TO sophia_api USING(
 EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=source_texts.project_id AND s.id=source_texts.source_id));
GRANT SELECT ON sophia.source_texts TO sophia_api;

-- Attributed discussion. Its intent never starts work (A05).
CREATE TABLE sophia.contributions (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL, source_id uuid NOT NULL,
 intent text NOT NULL CHECK(intent IN ('discuss','ask_sophia','propose_work')),
 origin text NOT NULL CHECK(origin IN ('composer','voice')),
 thread_id uuid, artifact_version_id uuid,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 semantic_request jsonb NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,actor_id,idempotency_key),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,artifact_version_id) REFERENCES sophia.artifact_versions(project_id,id)
);
ALTER TABLE sophia.contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.contributions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.contributions TO sophia_api;

-- One registered dsh runtime and its lease (A04). Only definer functions read it: the capability hash stays here.
CREATE TABLE sophia.runtime_instances (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 resource_id uuid NOT NULL, runtime_unit_id text NOT NULL CHECK(runtime_unit_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'),
 token_sha256 bytea NOT NULL UNIQUE CHECK(length(token_sha256)=32),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 lease_id uuid, lease_epoch bigint NOT NULL DEFAULT 0 CHECK(lease_epoch>=0), bridge_instance_id text,
 protocol_version integer, bundle text, dsh_version text, hello_at timestamptz,
 ready_state text NOT NULL DEFAULT 'not_ready' CHECK(ready_state IN ('ready','not_ready')),
 ready_reason text, ready_at timestamptz, unrecovered jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(unrecovered)='array'),
 command_sequence bigint NOT NULL DEFAULT 0 CHECK(command_sequence>=0),
 -- Liveness: the last hello, ready report or command poll. A runtime not seen recently is not dispatched to.
 seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,resource_id) REFERENCES sophia.executor_resources(project_id,id)
);
CREATE UNIQUE INDEX one_active_runtime ON sophia.runtime_instances(project_id,resource_id,runtime_unit_id) WHERE state='active';
ALTER TABLE sophia.runtime_instances ENABLE ROW LEVEL SECURITY;

-- The runtime's ordered command queue: exactly what the bridge was sent, once per outbox delivery.
CREATE TABLE sophia.runtime_commands (
 project_id uuid NOT NULL, runtime_id uuid NOT NULL REFERENCES sophia.runtime_instances(id),
 seq bigint NOT NULL CHECK(seq>0), id uuid NOT NULL DEFAULT gen_random_uuid(),
 outbox_id uuid NOT NULL, command_id uuid NOT NULL, binding_id uuid NOT NULL, attempt_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('create','resume','input','steer','hold','stop','inspect')),
 authority_epoch bigint NOT NULL, body jsonb NOT NULL, answered_stage text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(runtime_id,seq), UNIQUE(project_id,id), UNIQUE(project_id,outbox_id),
 FOREIGN KEY(project_id,outbox_id) REFERENCES sophia.outbox(project_id,id),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id),
 FOREIGN KEY(project_id,binding_id) REFERENCES sophia.execution_bindings(project_id,id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id)
);
ALTER TABLE sophia.runtime_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.runtime_commands FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.runtime_commands TO sophia_api;

-- What the bridge observed per command and stage; the first report of a stage is kept.
CREATE TABLE sophia.runtime_receipts (
 project_id uuid NOT NULL, runtime_command_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN ('delivered','incorporation_observed','checked','rejected','failed','outcome_unknown')),
 native_session_id text, native_sequence bigint, evidence_refs jsonb NOT NULL DEFAULT '[]', reason text,
 observed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,runtime_command_id,stage),
 FOREIGN KEY(project_id,runtime_command_id) REFERENCES sophia.runtime_commands(project_id,id)
);
ALTER TABLE sophia.runtime_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.runtime_receipts FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.runtime_receipts TO sophia_api;

-- Wake a long-polling bridge when its queue grows (payload: the runtime id only).
CREATE FUNCTION sophia.notify_runtime_command() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN PERFORM pg_notify('sophia_runtime_commands', NEW.runtime_id::text); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION sophia.notify_runtime_command() FROM PUBLIC;
CREATE TRIGGER runtime_commands_notify AFTER INSERT ON sophia.runtime_commands FOR EACH ROW EXECUTE FUNCTION sophia.notify_runtime_command();

-- ---------------------------------------------------------------------------------------------------
-- Internal helpers (no grant): write a text source; emit an event with no actor (runtime evidence).
CREATE FUNCTION sophia.put_text_source(p_project uuid, p_owner uuid, p_mime text, p_body text) RETURNS sophia.source_objects
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.source_objects; sid uuid:=gen_random_uuid();
BEGIN
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
 VALUES(p_project,sid,p_owner,'project',encode(sha256(convert_to(p_body,'UTF8')),'hex'),p_mime,
  'inline/'||p_project||'/'||sid,octet_length(p_body),true,'ready') RETURNING * INTO s;
 INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES(p_project,sid,p_body);
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION sophia.put_text_source(uuid,uuid,text,text) FROM PUBLIC;

CREATE FUNCTION sophia.emit_service_event(p uuid, p_type text, p_entity_type text, p_entity uuid, p_revision bigint, p_summary text, p_refs jsonb DEFAULT '[]')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cursor_value bigint;
BEGIN
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,references_json,summary_code,actor_id)
 VALUES(p,cursor_value,p_type,p_entity_type,p_entity,p_revision,p_refs,p_summary,sophia.actor_id());
 RETURN cursor_value;
END $$;
REVOKE ALL ON FUNCTION sophia.emit_service_event(uuid,text,text,uuid,bigint,text,jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- submitContribution (A05). Any active member may discuss; the text becomes the author's project source.
CREATE FUNCTION sophia.submit_contribution(p_project uuid, p_key text, p_request jsonb, p_origin text DEFAULT 'composer')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.contributions; semantic jsonb; body text:=p_request->>'text';
 src sophia.source_objects; ref jsonb:=p_request->'source'; cid uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb;
 intent_value text:=p_request->>'intent';
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF intent_value IS NULL OR intent_value NOT IN ('discuss','ask_sophia','propose_work') THEN RAISE EXCEPTION 'Invalid intent' USING ERRCODE='22023'; END IF;
 IF p_origin NOT IN ('composer','voice') THEN RAISE EXCEPTION 'Invalid origin' USING ERRCODE='22023'; END IF;
 IF (body IS NULL) = (ref IS NULL OR jsonb_typeof(ref)='null') THEN
  RAISE EXCEPTION 'A contribution carries either text or a source' USING ERRCODE='22023'; END IF;
 IF body IS NOT NULL AND length(btrim(body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid text' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('intent',intent_value,'threadId',p_request->'threadId','artifactVersionId',p_request->'artifactVersionId',
  'origin',p_origin,'text',CASE WHEN body IS NULL THEN NULL ELSE encode(sha256(convert_to(body,'UTF8')),'hex') END,'source',ref);
 SELECT * INTO prior FROM sophia.contributions WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF body IS NOT NULL THEN
  src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',body);
 ELSE
  SELECT * INTO src FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=(ref->>'sourceId')::uuid
   AND s.sha256=ref->>'sha256' AND s.state='ready' AND (s.owner_id=a OR (s.scope='project' AND s.eligible));
  IF NOT FOUND OR (SELECT eligibility_revision FROM sophia.projects WHERE id=p_project)<>(ref->>'eligibilityRevision')::bigint THEN
   RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 END IF;
 cursor_value:=sophia.emit_project_event(p_project,'contribution.recorded','contribution',cid,1,'contribution.'||intent_value);
 receipt_value:=jsonb_build_object('contributionId',cid,'projectId',p_project,'sourceId',src.id,'sha256',src.sha256,
  'intent',intent_value,'cursor',cursor_value::text,'stage','recorded');
 INSERT INTO sophia.contributions(project_id,id,actor_id,source_id,intent,origin,thread_id,artifact_version_id,idempotency_key,semantic_request,receipt)
 VALUES(p_project,cid,a,src.id,intent_value,p_origin,(p_request->>'threadId')::uuid,(p_request->>'artifactVersionId')::uuid,p_key,semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- The seed context compiler (S1-05A, not S1-08): accepted project facts and the contributions a person chose.
-- Missing facts are listed as unknown; nothing is inferred.
CREATE FUNCTION sophia.compile_brief_manifest(p_project uuid, p_instruction sophia.source_objects, p_instruction_text text, p_inputs uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; frame jsonb; decisions jsonb; inputs jsonb; unknown text[]:='{}';
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT r.frame INTO frame FROM sophia.project_revisions r WHERE r.project_id=p_project AND r.revision=pr.mission_revision;
 IF frame IS NULL OR frame='{}'::jsonb THEN frame:=NULL; unknown:=array_append(unknown,'mission'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'sourceId',d.body_source_id,'text',t.body) ORDER BY d.id),'[]')
  INTO decisions FROM sophia.decisions d LEFT JOIN sophia.source_texts t ON t.project_id=d.project_id AND t.source_id=d.body_source_id
  WHERE d.project_id=p_project AND d.state='accepted';
 IF decisions='[]'::jsonb THEN unknown:=array_append(unknown,'accepted_decisions'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'sourceId',s.id,'sha256',s.sha256,'actorId',c.actor_id,'intent',c.intent,
   'createdAt',c.created_at,'text',t.body) ORDER BY x.ord),'[]')
  INTO inputs FROM unnest(p_inputs) WITH ORDINALITY AS x(cid,ord)
  JOIN sophia.contributions c ON c.project_id=p_project AND c.id=x.cid
  JOIN sophia.source_objects s ON s.project_id=c.project_id AND s.id=c.source_id
  JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id;
 RETURN jsonb_build_object('schema','sophia.context-manifest.v1','compiler','sophia.seed-explicit-inputs.v1',
  'note','Seed context compiler for S1-05A: accepted project facts and explicitly shared contributions only; not the S1-08 compiler.',
  'projectId',p_project,'missionRevision',pr.mission_revision,'audienceRevision',pr.audience_revision,'eligibilityRevision',pr.eligibility_revision,
  'facts',jsonb_build_object('title',pr.title,'mission',frame,'acceptedDecisions',decisions),
  'instruction',jsonb_build_object('sourceId',p_instruction.id,'sha256',p_instruction.sha256,'text',p_instruction_text),
  'inputs',inputs,'unknown',to_jsonb(unknown));
END $$;
REVOKE ALL ON FUNCTION sophia.compile_brief_manifest(uuid,sophia.source_objects,text,uuid[]) FROM PUBLIC;

-- The draft_brief prompt the runtime receives. Fixed text plus the manifest: the model gets no other context.
CREATE FUNCTION sophia.draft_brief_prompt(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'You are drafting a candidate implementation brief for a small product team. Use ONLY the inputs in the context manifest below. '
 || 'Do not invent facts: when something is not in the inputs, say it is unknown.'||E'\n\n'
 || 'Write Markdown with exactly these sections, in this order:'||E'\n'
 || '## Intended outcome'||E'\n'||'## Retained decisions'||E'\n'||'## Proposed next implementation step'||E'\n'
 || '## Open questions'||E'\n'||'## Cited inputs'||E'\n\n'
 || 'Cite inputs by id in square brackets, e.g. [input:<id>], where you use them, and list every input you used under "Cited inputs". '
 || 'This is a candidate for the team to review, not an accepted plan and not evidence that anything is implemented.'||E'\n\n'
 || 'The request: '||(p_manifest->'instruction'->>'text')||E'\n\n'
 || 'Context manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest) $$;
REVOKE ALL ON FUNCTION sophia.draft_brief_prompt(jsonb) FROM PUBLIC;

-- admitNativeTask (A05): one draft_brief admitted with the ordinary records, under an Idempotency-Key.
CREATE FUNCTION sophia.admit_native_task(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; prior sophia.commands; semantic jsonb; rt sophia.runtime_instances;
 instruction_text text:=p_request->>'instruction'; inputs uuid[]; instr sophia.source_objects; manifest jsonb; ctx sophia.source_objects;
 goal uuid:=gen_random_uuid(); att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 cursor_value bigint; receipt_value jsonb; bad uuid;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'draft_brief' THEN RAISE EXCEPTION 'Unsupported native task kind' USING ERRCODE='22023'; END IF;
 IF instruction_text IS NULL OR length(btrim(instruction_text)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid instruction' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(v::uuid ORDER BY o),'{}') INTO inputs FROM jsonb_array_elements_text(coalesce(p_request->'contributionIds','[]')) WITH ORDINALITY AS e(v,o);
 IF cardinality(inputs)>8 THEN RAISE EXCEPTION 'At most 8 inputs' USING ERRCODE='22023'; END IF;
 -- Lock order: project first; authority is checked again under the lock.
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','draft_brief','instruction',encode(sha256(convert_to(instruction_text,'UTF8')),'hex'),
  'contributionIds',to_jsonb(inputs),'expectedMissionRevision',p_request->'expectedMissionRevision');
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF pr.mission_revision IS DISTINCT FROM (p_request->>'expectedMissionRevision')::bigint THEN
  RAISE EXCEPTION 'Stale mission revision' USING ERRCODE='40001'; END IF;
 SELECT x.cid INTO bad FROM unnest(inputs) AS x(cid) WHERE NOT EXISTS(
  SELECT 1 FROM sophia.contributions c JOIN sophia.source_objects s ON s.project_id=c.project_id AND s.id=c.source_id
   WHERE c.project_id=p_project AND c.id=x.cid AND s.scope='project' AND s.eligible AND s.state='ready') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND state='active' ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No native runtime is registered for this project' USING ERRCODE='55000'; END IF;
 instr:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',instruction_text);
 manifest:=sophia.compile_brief_manifest(p_project,instr,instruction_text,inputs);
 ctx:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,instr.id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,c.source_id,ctx.id FROM sophia.contributions c WHERE c.project_id=p_project AND c.id=ANY(inputs) ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
 VALUES(p_project,goal,'Draft an implementation brief',
  'A candidate implementation brief the team can review, drafted by the dsh runtime from the chosen inputs',
  jsonb_build_array(jsonb_build_object('id','brief-sections','description',
   'Intended outcome, retained decisions, proposed next implementation step, open questions and cited input ids',
   'required',true,'verification','human_review')),pr.mission_revision,'ready');
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,goal,1,1,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,rt.resource_id,'sophia-'||att,rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,goal,1,1,'native_task',p_key,semantic,instr.id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state) VALUES(p_project,job,'draft_brief',ctx.id,cmd,att,'pending');
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,goal,1);
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.draft_brief',
  jsonb_build_array(goal,cmd,ctx.id));
 receipt_value:=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',goal,'attemptId',att,'projectId',p_project,'kind','draft_brief',
  'stage','admitted','cursor',cursor_value::text,'goalRevision',1,'authorityEpoch',1,'contextSourceId',ctx.id);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

-- admit_goal_command (0003), with one change: a goal worked by a native episode binding (a native task)
-- steers and resumes that binding through native deliveries instead of the lead (S1-11), which does not
-- exist yet. Everything else is 0003's text.
CREATE OR REPLACE FUNCTION sophia.admit_goal_command(p_project uuid,p_goal uuid,p_kind text,p_key text,p_expected_revision bigint,p_expected_epoch bigint,p_body_source uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); g sophia.goals; prior sophia.commands; semantic jsonb;
 cmd uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb; b record; target_count integer:=0;
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('steer','request_review','hold','stop','resume') OR p_kind IS NULL THEN RAISE EXCEPTION 'Unsupported command' USING ERRCODE='22023'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('kind',p_kind,'goalId',p_goal,'expectedGoalRevision',p_expected_revision,'expectedAuthorityEpoch',p_expected_epoch,'bodySourceId',p_body_source);
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF p_expected_revision IS NULL OR p_expected_epoch IS NULL OR g.revision<>p_expected_revision OR g.authority_epoch<>p_expected_epoch THEN
  RAISE EXCEPTION 'Stale goal revision or epoch' USING ERRCODE='40001'; END IF;
 IF p_kind='steer' AND p_body_source IS NULL THEN RAISE EXCEPTION 'Steer requires a source-backed brief' USING ERRCODE='22023'; END IF;
 IF p_body_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=p_body_source AND s.eligible AND s.state='ready' AND s.scope='project') THEN
  RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 IF p_kind='resume' AND g.status<>'held' THEN RAISE EXCEPTION 'Hold is not settled' USING ERRCODE='40001'; END IF;
 IF p_kind='hold' AND g.status NOT IN ('running','checking') THEN RAISE EXCEPTION 'Goal is not active' USING ERRCODE='40001'; END IF;
 IF p_kind IN ('steer','request_review') AND g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Goal not admitted for work' USING ERRCODE='40001'; END IF;
 IF p_kind='stop' AND g.status IN ('stopping','stopped','completed') THEN RAISE EXCEPTION 'Goal already terminal or stopping' USING ERRCODE='40001'; END IF;
 IF p_kind IN ('hold','stop','resume') THEN
  UPDATE sophia.goals SET authority_epoch=authority_epoch+1, state_revision=state_revision+1,
   status=CASE p_kind WHEN 'hold' THEN 'holding' WHEN 'stop' THEN 'stopping' ELSE 'running' END
   WHERE project_id=p_project AND id=p_goal RETURNING * INTO g;
 END IF;
 IF p_kind IN ('hold','stop') THEN
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=p_project AND goal_id=p_goal AND state='pending' AND NOT cleanup;
 END IF;
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,p_goal,g.revision,g.authority_epoch,p_kind,p_key,semantic,p_body_source,'admitted');
 UPDATE sophia.projects SET event_sequence=event_sequence+1 WHERE id=p_project RETURNING event_sequence INTO cursor_value;
 INSERT INTO sophia.project_events(project_id,sequence,type,entity_type,entity_id,entity_revision,summary_code,actor_id)
 VALUES(p_project,cursor_value,'command.admitted','command',cmd,1,'command.'||p_kind,a);
 IF p_kind IN ('hold','stop') THEN
  FOR b IN SELECT eb.id FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
   WHERE wa.project_id=p_project AND wa.goal_id=p_goal AND eb.state<>'settled'
  LOOP
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
    VALUES(p_project,cmd,'native.stop','binding/'||b.id,b.id,p_goal,g.authority_epoch,true);
   target_count:=target_count+1;
  END LOOP;
  IF target_count=0 THEN INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch,cleanup)
   VALUES(p_project,cmd,'control.settle','control/empty',p_goal,g.authority_epoch,true); END IF;
 ELSE
  IF p_kind IN ('steer','resume') THEN
   FOR b IN SELECT eb.id FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
    WHERE wa.project_id=p_project AND wa.goal_id=p_goal AND eb.continuation_owner='sophia_episode' AND eb.state NOT IN ('settled','lost')
   LOOP
    INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
     VALUES(p_project,cmd,'native.'||p_kind,'binding/'||b.id,b.id,p_goal,g.authority_epoch);
    target_count:=target_count+1;
   END LOOP;
  END IF;
  IF target_count=0 THEN
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch)
   VALUES(p_project,cmd,CASE p_kind WHEN 'steer' THEN 'lead.amend_goal' WHEN 'request_review' THEN 'lead.review' ELSE 'lead.resume_goal' END,'lead',p_goal,g.authority_epoch);
  END IF;
 END IF;
 receipt_value:=jsonb_build_object('commandId',cmd,'projectId',p_project,'cursor',cursor_value::text,'stage','admitted','goalId',p_goal,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Operator provisioning (no grant): register a runtime for a project, creating its dsh executor resource.
-- Run with the migration owner (scripts/register-runtime.ts); the capability itself is never stored.
CREATE FUNCTION sophia.register_runtime(p_project uuid, p_owner uuid, p_runtime_unit text, p_token_sha256 bytea, p_label text DEFAULT 'Sophia runtime (dsh)')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE res uuid; rid uuid;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_owner AND active AND role='admin') THEN
  RAISE EXCEPTION 'The runtime owner must be an admin of the project' USING ERRCODE='22023'; END IF;
 SELECT id INTO res FROM sophia.executor_resources WHERE project_id=p_project AND harness='dsh' AND state='active' ORDER BY id LIMIT 1;
 IF res IS NULL THEN
  INSERT INTO sophia.executor_resources(project_id,owner_id,harness,label,repository_root,state)
  VALUES(p_project,p_owner,'dsh',p_label,'project-workspace','active') RETURNING id INTO res;
 END IF;
 UPDATE sophia.runtime_instances SET state='revoked', revoked_at=now()
  WHERE project_id=p_project AND resource_id=res AND runtime_unit_id=p_runtime_unit AND state='active';
 INSERT INTO sophia.runtime_instances(project_id,resource_id,runtime_unit_id,token_sha256) VALUES(p_project,res,p_runtime_unit,p_token_sha256)
  RETURNING id INTO rid;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION sophia.register_runtime(uuid,uuid,text,bytea,text) FROM PUBLIC;

-- Authenticate a runtime call: a known, active capability for this unit. The lease check is separate.
CREATE FUNCTION sophia.runtime_authenticate(p_token_sha256 bytea, p_unit text) RETURNS sophia.runtime_instances LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A runtime call cannot carry a member identity' USING ERRCODE='42501'; END IF;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE token_sha256=p_token_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Runtime capability not recognized' USING ERRCODE='28000'; END IF;
 IF rt.state<>'active' THEN RAISE EXCEPTION 'Runtime capability revoked' USING ERRCODE='42501'; END IF;
 IF p_unit IS DISTINCT FROM rt.runtime_unit_id THEN RAISE EXCEPTION 'Runtime unit mismatch' USING ERRCODE='42501'; END IF;
 RETURN rt;
END $$;
REVOKE ALL ON FUNCTION sophia.runtime_authenticate(bytea,text) FROM PUBLIC;

-- The lease holder, locked: the project first (lock order), then the instance row.
CREATE FUNCTION sophia.runtime_lease(p_token_sha256 bytea, p_unit text, p_bridge text) RETURNS sophia.runtime_instances LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit);
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=rt.project_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE id=rt.id FOR UPDATE;
 IF rt.bridge_instance_id IS DISTINCT FROM p_bridge THEN RAISE EXCEPTION 'Runtime lease superseded; say hello again' USING ERRCODE='40001'; END IF;
 RETURN rt;
END $$;
REVOKE ALL ON FUNCTION sophia.runtime_lease(bytea,text,text) FROM PUBLIC;

-- Highest seq up to which every command has an answer: a reconnect replays only what may be unanswered.
CREATE FUNCTION sophia.runtime_cursor(p_runtime uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT min(seq)-1 FROM sophia.runtime_commands WHERE runtime_id=p_runtime AND answered_stage IS NULL),
  (SELECT command_sequence FROM sophia.runtime_instances WHERE id=p_runtime)) $$;
REVOKE ALL ON FUNCTION sophia.runtime_cursor(uuid) FROM PUBLIC;

-- POST /v1/runtime/hello: take the lease; the bindings this runtime must own (their create was delivered).
CREATE FUNCTION sophia.runtime_hello(p_token_sha256 bytea, p_unit text, p_bridge text, p_hello jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit); bindings jsonb;
BEGIN
 IF p_bridge IS NULL OR length(p_bridge) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Invalid bridge instance' USING ERRCODE='22023'; END IF;
 IF (p_hello->>'protocolVersion')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Unsupported runtime protocol' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=rt.project_id FOR UPDATE;
 UPDATE sophia.runtime_instances SET lease_id=gen_random_uuid(), lease_epoch=lease_epoch+1, bridge_instance_id=p_bridge,
  protocol_version=1, bundle=left(p_hello->>'bundle',200), dsh_version=left(p_hello->>'dshVersion',100), hello_at=now(),
  ready_state='not_ready', ready_reason='hello received; waiting for the ready report', ready_at=NULL, seen_at=now()
  WHERE id=rt.id RETURNING * INTO rt;
 SELECT coalesce(jsonb_agg(jsonb_build_object('attemptId',b.attempt_id,'nativeSessionId',b.native_session_id,'authorityEpoch',g.authority_epoch,
   'state',CASE WHEN g.status IN ('holding','held') THEN 'held' WHEN g.status IN ('stopping','stopped') THEN 'stopped' ELSE 'active' END)
   ORDER BY b.attempt_id),'[]') INTO bindings
  FROM sophia.execution_bindings b JOIN sophia.work_attempts wa ON wa.project_id=b.project_id AND wa.id=b.attempt_id
  JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id
  WHERE b.project_id=rt.project_id AND b.resource_id=rt.resource_id AND b.runtime_unit_id=rt.runtime_unit_id
   AND b.state IN ('running','idle','stopping');
 PERFORM sophia.emit_service_event(rt.project_id,'runtime.hello','executor_resource',rt.resource_id,rt.lease_epoch,'runtime.hello');
 RETURN jsonb_build_object('projectId',rt.project_id,'leaseId',rt.lease_id,'authorityEpoch',rt.lease_epoch,'bindings',bindings,
  'cursor',sophia.runtime_cursor(rt.id));
END $$;

-- GET /v1/runtime/commands: the queue after the cursor, in order (the API waits for new rows).
CREATE FUNCTION sophia.runtime_poll(p_token_sha256 bytea, p_unit text, p_bridge text, p_after bigint, p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit); batch jsonb; last_seq bigint;
BEGIN
 IF rt.bridge_instance_id IS DISTINCT FROM p_bridge THEN RAISE EXCEPTION 'Runtime lease superseded; say hello again' USING ERRCODE='40001'; END IF;
 IF p_after IS NULL OR p_after<0 OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid poll bounds' USING ERRCODE='22023'; END IF;
 UPDATE sophia.runtime_instances SET seen_at=now() WHERE id=rt.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('seq',q.seq,'command',q.body) ORDER BY q.seq),'[]'), max(q.seq) INTO batch, last_seq
  FROM (SELECT seq, body FROM sophia.runtime_commands WHERE runtime_id=rt.id AND seq>p_after ORDER BY seq LIMIT p_limit) q;
 RETURN jsonb_build_object('commands',batch,'cursor',greatest(p_after,coalesce(last_seq,p_after)),'runtimeId',rt.id);
END $$;

-- Settle a goal's Hold/Stop once none of its bindings can still run (hold: idle or settled; stop: settled).
CREATE FUNCTION sophia.settle_native_control(p_project uuid, p_goal uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals;
BEGIN
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal FOR UPDATE;
 IF g.status='holding' AND NOT EXISTS(SELECT 1 FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id
   WHERE a.project_id=p_project AND a.goal_id=p_goal AND b.state NOT IN ('idle','settled','lost')) THEN
  UPDATE sophia.goals SET status='held', state_revision=state_revision+1 WHERE project_id=p_project AND id=p_goal RETURNING * INTO g;
  PERFORM sophia.emit_service_event(p_project,'goal.held','goal',p_goal,g.state_revision,'goal.held');
 ELSIF g.status='stopping' AND NOT EXISTS(SELECT 1 FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id
   WHERE a.project_id=p_project AND a.goal_id=p_goal AND b.state NOT IN ('settled','lost')) THEN
  UPDATE sophia.goals SET status='stopped', state_revision=state_revision+1 WHERE project_id=p_project AND id=p_goal RETURNING * INTO g;
  UPDATE sophia.work_attempts SET state='stopped' WHERE project_id=p_project AND goal_id=p_goal AND state NOT IN ('accepted','failed');
  UPDATE sophia.jobs j SET state='cancelled', reason=coalesce(j.reason,'stopped') FROM sophia.work_attempts a
   WHERE j.project_id=p_project AND a.project_id=j.project_id AND a.id=j.attempt_id AND a.goal_id=p_goal AND j.state IN ('pending','running');
  PERFORM sophia.emit_service_event(p_project,'goal.stopped','goal',p_goal,g.state_revision,'goal.stopped');
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.settle_native_control(uuid,uuid) FROM PUBLIC;

-- The effect of one newly recorded receipt on the product records. Receipts are evidence of the native
-- side only: they move delivery state and settle controls, never accept a result.
CREATE FUNCTION sophia.apply_runtime_receipt(rc sophia.runtime_commands, p_stage text, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals; j sophia.jobs; done boolean:=p_stage IN ('delivered','checked','rejected','failed','outcome_unknown');
BEGIN
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts a ON a.project_id=g2.project_id AND a.goal_id=g2.id
  WHERE a.project_id=rc.project_id AND a.id=rc.attempt_id FOR UPDATE OF g2;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=rc.project_id AND attempt_id=rc.attempt_id FOR UPDATE;
 IF done THEN
  UPDATE sophia.runtime_commands SET answered_stage=coalesce(answered_stage,p_stage) WHERE project_id=rc.project_id AND id=rc.id;
  UPDATE sophia.outbox SET state=CASE p_stage WHEN 'rejected' THEN 'denied' WHEN 'delivered' THEN 'settled' WHEN 'checked' THEN 'settled' ELSE 'outcome_unknown' END,
   outcome_reason=CASE WHEN p_stage IN ('delivered','checked') THEN outcome_reason ELSE left(p_reason,2000) END
   WHERE project_id=rc.project_id AND id=rc.outbox_id AND state='acknowledged';
  UPDATE sophia.commands SET state=CASE p_stage WHEN 'rejected' THEN 'denied' WHEN 'delivered' THEN 'acknowledged' WHEN 'checked' THEN 'checked' ELSE 'outcome_unknown' END
   WHERE project_id=rc.project_id AND id=rc.command_id AND state IN ('admitted','dispatching');
 ELSIF p_stage='incorporation_observed' THEN
  UPDATE sophia.commands SET state='checked' WHERE project_id=rc.project_id AND id=rc.command_id AND state IN ('admitted','dispatching','acknowledged');
  PERFORM sophia.emit_service_event(rc.project_id,'command.incorporated','command',rc.command_id,2,'command.'||rc.kind);
  RETURN;
 END IF;
 IF rc.kind='create' AND p_stage='delivered' THEN
  UPDATE sophia.execution_bindings SET state='running', observed_at=now() WHERE project_id=rc.project_id AND id=rc.binding_id AND state IN ('created','launching');
  UPDATE sophia.work_attempts SET state='running' WHERE project_id=rc.project_id AND id=rc.attempt_id AND state='admitted';
  IF g.status='ready' THEN
   UPDATE sophia.goals SET status='running', state_revision=state_revision+1 WHERE project_id=g.project_id AND id=g.id RETURNING * INTO g;
  END IF;
  IF j.id IS NOT NULL AND j.state='pending' THEN
   UPDATE sophia.jobs SET state='running' WHERE project_id=j.project_id AND id=j.id;
   PERFORM sophia.emit_service_event(rc.project_id,'native_task.running','job',j.id,2,'native_task.running');
  END IF;
 ELSIF rc.kind='create' AND p_stage IN ('rejected','failed','outcome_unknown') THEN
  UPDATE sophia.execution_bindings SET state=CASE p_stage WHEN 'rejected' THEN 'settled' ELSE 'lost' END, observed_at=now()
   WHERE project_id=rc.project_id AND id=rc.binding_id;
  UPDATE sophia.work_attempts SET state=CASE p_stage WHEN 'rejected' THEN 'failed' ELSE 'outcome_unknown' END WHERE project_id=rc.project_id AND id=rc.attempt_id;
  IF j.id IS NOT NULL AND j.state IN ('pending','running') THEN
   UPDATE sophia.jobs SET state=CASE p_stage WHEN 'rejected' THEN 'failed' ELSE 'outcome_unknown' END, reason=left(coalesce(p_reason,p_stage),2000)
    WHERE project_id=j.project_id AND id=j.id;
   PERFORM sophia.emit_service_event(rc.project_id,'native_task.failed','job',j.id,3,'native_task.'||p_stage);
  END IF;
 ELSIF rc.kind='resume' AND p_stage='delivered' THEN
  UPDATE sophia.execution_bindings SET state='running', observed_at=now() WHERE project_id=rc.project_id AND id=rc.binding_id AND state IN ('idle','running');
 ELSIF rc.kind IN ('hold','stop') AND p_stage='checked' THEN
  UPDATE sophia.execution_bindings SET state=CASE rc.kind WHEN 'hold' THEN 'idle' ELSE 'settled' END, observed_at=now()
   WHERE project_id=rc.project_id AND id=rc.binding_id AND state<>'settled';
  PERFORM sophia.settle_native_control(rc.project_id,g.id);
 ELSIF rc.kind IN ('hold','stop') AND p_stage IN ('outcome_unknown','failed','rejected') THEN
  -- The control stays pending and visible: a later Stop, a restart's reconcile, or an operator settles it.
  UPDATE sophia.execution_bindings SET state='stopping', observed_at=now() WHERE project_id=rc.project_id AND id=rc.binding_id AND state<>'settled';
  PERFORM sophia.emit_service_event(rc.project_id,'command.outcome_unknown','command',rc.command_id,2,'command.'||rc.kind);
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.apply_runtime_receipt(sophia.runtime_commands,text,text) FROM PUBLIC;

-- POST /v1/runtime/receipts. A receipt for a command this runtime was not sent, or naming another
-- attempt or native session, refuses the whole batch.
CREATE FUNCTION sophia.runtime_record_receipts(p_token_sha256 bytea, p_unit text, p_bridge text, p_receipts jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); r jsonb; rc sophia.runtime_commands;
 b sophia.execution_bindings; n integer:=0; inserted boolean;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(p_receipts) LOOP
  SELECT * INTO rc FROM sophia.runtime_commands WHERE runtime_id=rt.id
   AND id=CASE WHEN r->>'commandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'commandId')::uuid END;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt names a command this runtime was not sent' USING ERRCODE='42501'; END IF;
  IF coalesce(r->>'attemptId','')<>'' AND r->>'attemptId'<>rc.attempt_id::text THEN
   RAISE EXCEPTION 'Receipt names another attempt' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rc.project_id AND id=rc.binding_id;
  IF r->>'nativeSessionId' IS NOT NULL AND r->>'nativeSessionId' IS DISTINCT FROM b.native_session_id THEN
   RAISE EXCEPTION 'Receipt names another native session' USING ERRCODE='42501'; END IF;
  INSERT INTO sophia.runtime_receipts(project_id,runtime_command_id,stage,native_session_id,native_sequence,evidence_refs,reason,observed_at)
  VALUES(rc.project_id,rc.id,r->>'stage',r->>'nativeSessionId',(r->>'nativeSequence')::bigint,coalesce(r->'evidenceRefs','[]'),
   left(r->>'reason',16000),(r->>'observedAt')::timestamptz)
  ON CONFLICT DO NOTHING RETURNING true INTO inserted;
  IF inserted THEN PERFORM sophia.apply_runtime_receipt(rc,r->>'stage',r->>'reason'); n:=n+1; END IF;
  inserted:=false;
 END LOOP;
 RETURN n;
END $$;

-- A draft_brief result: the last complete assistant message of a completed turn, while the goal may still
-- publish (running or checking). Under Hold or Stop the result is withheld, never published. A brief is
-- captured once: a later turn on the same session (a steer after the result, say) answers another command,
-- so it stays an observation and never replaces the brief. An uncertain delivery that did run is captured.
CREATE FUNCTION sophia.capture_native_result(p_project uuid, p_binding uuid, p_turn_end_seq bigint, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE b sophia.execution_bindings; g sophia.goals; j sophia.jobs; msg sophia.native_observations; c sophia.commands; src sophia.source_objects;
BEGIN
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=p_binding;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts a ON a.project_id=g2.project_id AND a.goal_id=g2.id
  WHERE a.project_id=p_project AND a.id=b.attempt_id FOR UPDATE OF g2;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind='draft_brief' FOR UPDATE;
 IF j.id IS NULL OR j.state NOT IN ('pending','running','outcome_unknown') THEN RETURN; END IF;
 IF p_reason IS DISTINCT FROM 'completed' THEN
  IF p_reason IN ('error','max-tokens','blocked') AND j.state IN ('pending','running') AND g.status IN ('running','checking') THEN
   UPDATE sophia.jobs SET state='failed', reason='the native turn ended: '||p_reason WHERE project_id=p_project AND id=j.id;
   PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.'||p_reason);
  END IF;
  RETURN;
 END IF;
 SELECT * INTO msg FROM sophia.native_observations WHERE project_id=p_project AND binding_id=p_binding AND type='assistant/message'
  AND native_seq<p_turn_end_seq AND coalesce((data->>'interrupted')::boolean,false)=false AND coalesce(data->>'text','')<>''
  ORDER BY native_seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 IF g.status NOT IN ('running','checking') THEN
  UPDATE sophia.jobs SET reason='a result arrived while the work was '||g.status||'; it was withheld, not published' WHERE project_id=p_project AND id=j.id;
  RETURN;
 END IF;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=j.command_id;
 src:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',msg.data->>'text');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,j.input_source_id,src.id);
 UPDATE sophia.jobs SET state='succeeded', result_source_id=src.id, result_revision=result_revision+1, reason=NULL
  WHERE project_id=p_project AND id=j.id RETURNING * INTO j;
 UPDATE sophia.work_attempts SET state='checking' WHERE project_id=p_project AND id=b.attempt_id AND state IN ('running','admitted');
 IF g.status='running' THEN UPDATE sophia.goals SET status='checking', state_revision=state_revision+1 WHERE project_id=g.project_id AND id=g.id; END IF;
 PERFORM sophia.emit_service_event(p_project,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(src.id,j.input_source_id));
END $$;
REVOKE ALL ON FUNCTION sophia.capture_native_result(uuid,uuid,bigint,text) FROM PUBLIC;

-- POST /v1/runtime/observations: once per (unit, session, seq). Never an actor, never acceptance.
CREATE FUNCTION sophia.runtime_record_observations(p_token_sha256 bytea, p_unit text, p_bridge text, p_observations jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); o jsonb; b sophia.execution_bindings;
 obs_id uuid; n integer:=0; seq bigint;
BEGIN
 FOR o IN SELECT value FROM jsonb_array_elements(p_observations) ORDER BY (value->>'nativeSeq')::bigint LOOP
  IF o->>'runtimeUnitId' IS DISTINCT FROM rt.runtime_unit_id THEN RAISE EXCEPTION 'Observation names another runtime unit' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rt.project_id AND resource_id=rt.resource_id AND runtime_unit_id=rt.runtime_unit_id
   AND attempt_id=CASE WHEN o->>'attemptId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (o->>'attemptId')::uuid END;
  IF NOT FOUND OR o->>'nativeSessionId' IS DISTINCT FROM b.native_session_id THEN
   RAISE EXCEPTION 'Observation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
  seq:=(o->>'nativeSeq')::bigint;
  INSERT INTO sophia.native_observations(project_id,binding_id,upstream_key,type,native_seq,data)
  VALUES(rt.project_id,b.id,rt.runtime_unit_id||':'||b.native_session_id||':'||seq,left(o->>'type',64),seq,o->'data')
  ON CONFLICT (project_id,binding_id,upstream_key) DO NOTHING RETURNING id INTO obs_id;
  IF obs_id IS NULL THEN CONTINUE; END IF;
  n:=n+1;
  IF o->>'type'='assistant/message' AND (o->'data'->>'model' IS NOT NULL OR o->'data'->>'inputTokens' IS NOT NULL) THEN
   INSERT INTO sophia.usage_records(project_id,attempt_id,provider_call_id,billing_kind,input_tokens,output_tokens,provider,model)
   VALUES(rt.project_id,b.attempt_id,b.native_session_id||'#'||seq,'api',(o->'data'->>'inputTokens')::bigint,(o->'data'->>'outputTokens')::bigint,
    left(o->'data'->>'provider',200),left(o->'data'->>'model',200)) ON CONFLICT DO NOTHING;
  ELSIF o->>'type'='turn/end' THEN
   PERFORM sophia.capture_native_result(rt.project_id,b.id,seq,o->'data'->'reason'->>'kind');
  END IF;
  obs_id:=NULL;
 END LOOP;
 RETURN n;
END $$;

-- POST /v1/runtime/ready: bridge readiness for this lease, with what it could not restore.
CREATE FUNCTION sophia.runtime_record_ready(p_token_sha256 bytea, p_unit text, p_bridge text, p_ready jsonb) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge);
BEGIN
 IF p_ready->>'state' NOT IN ('ready','not_ready') THEN RAISE EXCEPTION 'Invalid readiness' USING ERRCODE='22023'; END IF;
 UPDATE sophia.runtime_instances SET ready_state=p_ready->>'state', ready_reason=left(p_ready->>'reason',2000), ready_at=now(),
  unrecovered=coalesce(p_ready->'unrecovered','[]'), seen_at=now() WHERE id=rt.id;
 PERFORM sophia.emit_service_event(rt.project_id,'runtime.'||(p_ready->>'state'),'executor_resource',rt.resource_id,rt.lease_epoch,
  CASE WHEN jsonb_array_length(coalesce(p_ready->'unrecovered','[]'))>0 THEN 'runtime.unrecovered' ELSE 'runtime.'||(p_ready->>'state') END);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Dispatch (trusted worker). Claims only native deliveries and empty-control settlements, cleanup first,
-- whatever their eligibility: the dispatch step decides and records denied rows explicitly.
CREATE FUNCTION sophia.claim_runtime_outbox(p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 60)
RETURNS SETOF sophia.outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 160 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Invalid claim bounds' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH eligible AS (
  SELECT o.project_id,o.id FROM sophia.outbox o
  WHERE o.state='pending' AND o.available_at<=now() AND (o.destination LIKE 'native.%' OR o.destination='control.settle')
  ORDER BY o.cleanup DESC,o.available_at,o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT p_limit
 ) UPDATE sophia.outbox o SET state='dispatching',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
 FROM eligible e WHERE o.project_id=e.project_id AND o.id=e.id RETURNING o.*;
END $$;

-- Why a queued native delivery may no longer run, or null when it may. Checked at dispatch, under the locks.
CREATE FUNCTION sophia.native_delivery_ineligible(o sophia.outbox, g sophia.goals, c sophia.commands, b sophia.execution_bindings, rt sophia.runtime_instances)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN g.authority_epoch<>o.authority_epoch THEN 'the goal''s authority epoch moved on'
  WHEN g.status NOT IN ('ready','running','checking') AND o.destination<>'native.resume' THEN 'the goal is '||g.status
  WHEN o.destination='native.resume' AND g.status<>'running' THEN 'the goal is '||g.status
  WHEN NOT EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=c.project_id AND m.actor_id=c.actor_id AND m.active AND m.role IN ('admin','editor'))
   THEN 'the person who admitted it can no longer start work here'
  WHEN c.body_source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=c.project_id AND s.id=c.body_source_id AND s.eligible AND s.scope='project' AND s.state='ready')
   THEN 'its instruction source is no longer eligible'
  WHEN o.destination='native.create' AND EXISTS(SELECT 1 FROM sophia.jobs j JOIN sophia.source_dependencies d ON d.project_id=j.project_id AND d.derived_source_id=j.input_source_id
    JOIN sophia.source_objects s ON s.project_id=d.project_id AND s.id=d.source_id
    WHERE j.project_id=c.project_id AND j.command_id=c.id AND NOT (s.eligible AND s.scope='project' AND s.state='ready'))
   THEN 'an input it was admitted with is no longer eligible'
  WHEN rt.id IS NULL THEN 'no active runtime for its executor resource and runtime unit'
  WHEN b.state IN ('settled','lost') THEN 'its native binding is '||b.state
  ELSE NULL END $$;
REVOKE ALL ON FUNCTION sophia.native_delivery_ineligible(sophia.outbox,sophia.goals,sophia.commands,sophia.execution_bindings,sophia.runtime_instances) FROM PUBLIC;

-- Record a terminal denial of a claimed row and of what it was delivering.
CREATE FUNCTION sophia.deny_native_delivery(o sophia.outbox, c sophia.commands, p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs;
BEGIN
 UPDATE sophia.outbox SET state='denied', lease_until=NULL, outcome_reason=left(p_reason,2000) WHERE project_id=o.project_id AND id=o.id;
 UPDATE sophia.commands SET state='denied' WHERE project_id=o.project_id AND id=c.id AND state IN ('admitted','dispatching');
 IF o.destination='native.create' THEN
  UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=o.project_id AND id=o.binding_id AND state='created';
  UPDATE sophia.work_attempts a SET state='failed' FROM sophia.execution_bindings b
   WHERE b.project_id=o.project_id AND b.id=o.binding_id AND a.project_id=b.project_id AND a.id=b.attempt_id AND a.state='admitted';
  UPDATE sophia.jobs SET state='cancelled', reason=left('not dispatched: '||p_reason,2000)
   WHERE project_id=o.project_id AND command_id=c.id AND state='pending' RETURNING * INTO j;
  IF j.id IS NOT NULL THEN PERFORM sophia.emit_service_event(o.project_id,'native_task.denied','job',j.id,2,'native_task.denied'); END IF;
 ELSE
  PERFORM sophia.emit_service_event(o.project_id,'command.denied','command',c.id,2,'command.'||c.kind);
 END IF;
 RETURN jsonb_build_object('result','denied','reason',p_reason);
END $$;
REVOKE ALL ON FUNCTION sophia.deny_native_delivery(sophia.outbox,sophia.commands,text) FROM PUBLIC;

-- Why a runtime cannot take a delivery yet, or null when it can: it must have reported ready on its current lease
-- and been seen (hello, ready or a command poll) within 90 seconds; a long poll returns at least every 25.
CREATE FUNCTION sophia.runtime_unavailable(rt sophia.runtime_instances) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN rt.lease_id IS NULL OR rt.seen_at IS NULL THEN 'waiting for Sophia''s runtime to connect'
  WHEN rt.ready_state<>'ready' THEN 'waiting for Sophia''s runtime to report ready'
  WHEN rt.seen_at<now()-interval '90 seconds' THEN 'waiting for Sophia''s runtime to reconnect'
  ELSE NULL END $$;
REVOKE ALL ON FUNCTION sophia.runtime_unavailable(sophia.runtime_instances) FROM PUBLIC;

-- A delivery the runtime cannot take yet goes back to pending, visibly: the task stays queued with the reason,
-- and the worker tries again shortly. Nothing is queued to a runtime that is not there, and nothing is denied.
CREATE FUNCTION sophia.defer_native_delivery(o sophia.outbox, c sophia.commands, p_reason text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs;
BEGIN
 UPDATE sophia.outbox SET state='pending', lease_owner=NULL, lease_token=NULL, lease_until=NULL,
  available_at=now()+interval '5 seconds', outcome_reason=left(p_reason,2000) WHERE project_id=o.project_id AND id=o.id;
 UPDATE sophia.jobs SET reason=left(p_reason,2000)
  WHERE project_id=o.project_id AND command_id=c.id AND state='pending' AND reason IS DISTINCT FROM left(p_reason,2000) RETURNING * INTO j;
 IF j.id IS NOT NULL THEN PERFORM sophia.emit_service_event(o.project_id,'native_task.waiting','job',j.id,1,'native_task.waiting'); END IF;
 RETURN jsonb_build_object('result','deferred','reason',p_reason);
END $$;
REVOKE ALL ON FUNCTION sophia.defer_native_delivery(sophia.outbox,sophia.commands,text) FROM PUBLIC;

-- Dispatch one claimed row: recheck, then either enqueue exactly one runtime command (recording the
-- outbox result in the same transaction), defer it while the runtime is not ready, or record the terminal
-- outcome. Only the live lease may write. Hold/Stop are not deferred: their fence is already in the database,
-- and the runtime's journal replays them when it comes back.
CREATE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','outcome_unknown','reason','the dispatch lease expired');
 END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
 IF o.destination='control.settle' THEN
  PERFORM sophia.settle_native_control(p_project,g.id);
  UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=o.binding_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND resource_id=b.resource_id AND runtime_unit_id=b.runtime_unit_id AND state='active';
 IF o.cleanup THEN
  kind:=c.kind;  -- hold or stop (admit_goal_command writes native.stop rows for both)
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   -- Nothing native was ever started (or it is already settled): the fence is the whole effect.
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
  why:=sophia.native_delivery_ineligible(o,g,c,b,rt);
  IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  why:=sophia.runtime_unavailable(rt);
  IF why IS NOT NULL THEN RETURN sophia.defer_native_delivery(o,c,why); END IF;
  kind:=substr(o.destination,8);
  IF kind='create' THEN
   SELECT t.body::jsonb INTO manifest FROM sophia.jobs j JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
  ELSIF kind IN ('steer','input') THEN
   SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=c.body_source_id;
   IF txt IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'its instruction has no readable text'); END IF;
   payload:=jsonb_build_object('text',txt);
  END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 command_body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',p_project,'goalId',g.id,'goalRevision',g.revision,'attemptId',b.attempt_id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',CASE WHEN kind='resume' THEN to_jsonb(b.native_session_id) ELSE 'null'::jsonb END,
  'contextPacketId',CASE WHEN kind='create' THEN to_jsonb((SELECT input_source_id::text FROM sophia.jobs WHERE project_id=p_project AND command_id=c.id)) ELSE 'null'::jsonb END,
  'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(p_project,rt.id,next_seq,rc_id,o.id,c.id,b.id,b.attempt_id,kind,o.authority_epoch,command_body);
 UPDATE sophia.outbox SET state='acknowledged', lease_until=NULL, outcome_reason=NULL WHERE project_id=p_project AND id=p_outbox;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=c.id AND state='admitted';
 IF kind='create' THEN
  UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=p_project AND id=b.id AND state='created';
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending' AND reason LIKE 'waiting for Sophia''s runtime%';
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;

-- Reconcile native rows whose dispatch outcome is unknown (an expired lease). The runtime command and the
-- outbox result commit together, so the database itself says whether the delivery was queued: queued rows
-- take the result they had, and rows that never queued return to pending. Nothing is sent twice.
CREATE FUNCTION sophia.reconcile_runtime_outbox(p_limit integer DEFAULT 50) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE o record; n integer:=0;
BEGIN
 FOR o IN SELECT ob.project_id, ob.id, rc.id AS rc_id, rc.answered_stage FROM sophia.outbox ob
  LEFT JOIN sophia.runtime_commands rc ON rc.project_id=ob.project_id AND rc.outbox_id=ob.id
  WHERE ob.state='outcome_unknown' AND (ob.destination LIKE 'native.%' OR ob.destination='control.settle')
  ORDER BY ob.created_at LIMIT p_limit FOR UPDATE OF ob SKIP LOCKED
 LOOP
  UPDATE sophia.outbox SET state=CASE WHEN o.rc_id IS NULL THEN 'pending'
    WHEN o.answered_stage IN ('delivered','checked') THEN 'settled' WHEN o.answered_stage='rejected' THEN 'denied'
    WHEN o.answered_stage IS NULL THEN 'acknowledged' ELSE 'outcome_unknown' END,
   available_at=CASE WHEN o.rc_id IS NULL THEN now()+interval '1 second' ELSE available_at END, lease_token=NULL, lease_until=NULL
   WHERE project_id=o.project_id AND id=o.id AND state='outcome_unknown';
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Reads for members (the snapshot and getNativeTask), each under the member's RLS.
CREATE VIEW sophia.native_task_view WITH (security_barrier, security_invoker) AS
 SELECT j.project_id, j.id, j.kind, a.goal_id, j.attempt_id, j.command_id, c.actor_id, j.state, j.created_at, j.input_source_id,
  j.result_source_id, j.reason, c.body_source_id AS instruction_source_id,
  CASE WHEN c.state='denied' AND j.state IN ('pending','cancelled') THEN 'denied'
   WHEN g.status='holding' THEN 'holding' WHEN g.status='held' THEN 'held'
   WHEN g.status='stopping' THEN 'stopping' WHEN g.status='stopped' THEN 'stopped'
   WHEN j.state='succeeded' THEN 'result_ready' WHEN j.state='failed' THEN 'failed' WHEN j.state='outcome_unknown' THEN 'outcome_unknown'
   WHEN b.state='created' THEN 'queued' WHEN b.state='launching' THEN 'dispatched' ELSE 'running' END AS phase,
  (SELECT coalesce(array_agg(d.source_id ORDER BY d.source_id),'{}') FROM sophia.source_dependencies d JOIN sophia.contributions ct
    ON ct.project_id=d.project_id AND ct.source_id=d.source_id WHERE d.project_id=j.project_id AND d.derived_source_id=j.input_source_id) AS input_source_ids
 FROM sophia.jobs j JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id
 JOIN sophia.goals g ON g.project_id=a.project_id AND g.id=a.goal_id
 JOIN sophia.commands c ON c.project_id=j.project_id AND c.id=j.command_id
 LEFT JOIN sophia.execution_bindings b ON b.project_id=a.project_id AND b.attempt_id=a.id
 WHERE j.kind='draft_brief';
GRANT SELECT ON sophia.native_task_view TO sophia_api;

-- Runtime readiness for the snapshot's resources, without exposing the capability rows.
CREATE FUNCTION sophia.runtime_status(p_project uuid) RETURNS TABLE(resource_id uuid, ready_state text, hello_at timestamptz, ready_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.resource_id, r.ready_state, r.hello_at, r.ready_at FROM sophia.runtime_instances r
  WHERE r.project_id=p_project AND r.state='active' AND sophia.is_member(p_project) $$;

REVOKE ALL ON FUNCTION
 sophia.submit_contribution(uuid,text,jsonb,text), sophia.admit_native_task(uuid,text,jsonb),
 sophia.runtime_hello(bytea,text,text,jsonb), sophia.runtime_poll(bytea,text,text,bigint,integer),
 sophia.runtime_record_receipts(bytea,text,text,jsonb), sophia.runtime_record_observations(bytea,text,text,jsonb),
 sophia.runtime_record_ready(bytea,text,text,jsonb), sophia.runtime_status(uuid),
 sophia.claim_runtime_outbox(text,integer,integer), sophia.dispatch_runtime_outbox(uuid,uuid,uuid), sophia.reconcile_runtime_outbox(integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 sophia.submit_contribution(uuid,text,jsonb,text), sophia.admit_native_task(uuid,text,jsonb),
 sophia.runtime_hello(bytea,text,text,jsonb), sophia.runtime_poll(bytea,text,text,bigint,integer),
 sophia.runtime_record_receipts(bytea,text,text,jsonb), sophia.runtime_record_observations(bytea,text,text,jsonb),
 sophia.runtime_record_ready(bytea,text,text,jsonb), sophia.runtime_status(uuid)
TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.claim_runtime_outbox(text,integer,integer), sophia.dispatch_runtime_outbox(uuid,uuid,uuid),
 sophia.reconcile_runtime_outbox(integer), sophia.expire_dispatch_leases() TO sophia_worker;
COMMIT;
