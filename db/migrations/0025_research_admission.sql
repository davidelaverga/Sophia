-- SMC-M03 S4 part 1 (plan §2.4, §2.5; binding §4): research admission and the runtime research operations, the
-- writers over 0022's readers and 0024's spend authority.
-- * A runtime advertises the specialist roles its unit carries (id, route, preset digest) in its hello. Research is
--   admitted only onto a ready runtime that advertises the specialist and its route.
-- * admit_research_task admits one research task with the ordinary records (goal, attempt, binding, command, job,
--   outbox) plus its lineage row and, for a new lineage, its allowance. A second call from the same person in the same
--   exchange returns the running task unless the request says it is new; an amendment is a new attempt under the same
--   goal and allowance once the amended task has ended. Several tasks may be admitted; dispatch runs one research
--   task per project at a time and keeps the others visibly queued.
-- * Dispatch takes the role and route of a research create from its manifest; every other command is built as before.
-- * The runtime research operations (context, reserve, settle, capture, draft) authenticate like observations (the
--   runtime lease, then a binding this runtime owns), and every one but settle is fenced like a result: the goal is
--   active and the session's last command is a create, resume, steer or input under the goal's current authority
--   epoch, so Hold and Stop apply at once. Settle is never fenced, so a call already paid for is always accounted.
-- * A paid read names its target, never a free URL: a search result, a link a read page carried, or a URL the
--   person gave when admitting the task. The URL is resolved here, inside the task's lineage only.
BEGIN;

-- --- runtime roles ------------------------------------------------------------------------------------------

ALTER TABLE sophia.runtime_instances ADD COLUMN roles jsonb NOT NULL DEFAULT '[]'
 CHECK(jsonb_typeof(roles)='array' AND jsonb_array_length(roles)<=32);

-- runtime_hello (0012), replaced: the same, and it records the roles the runtime advertises (absent: none).
CREATE OR REPLACE FUNCTION sophia.runtime_hello(p_token_sha256 bytea, p_unit text, p_bridge text, p_hello jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit); bindings jsonb; advertised jsonb:='[]';
BEGIN
 IF p_bridge IS NULL OR length(p_bridge) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Invalid bridge instance' USING ERRCODE='22023'; END IF;
 IF (p_hello->>'protocolVersion')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Unsupported runtime protocol' USING ERRCODE='22023'; END IF;
 IF p_hello ? 'roles' THEN
  IF jsonb_typeof(p_hello->'roles')<>'array' OR jsonb_array_length(p_hello->'roles')>32 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_hello->'roles') r
    WHERE jsonb_typeof(r)<>'object' OR NOT coalesce(r->>'id' ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$',false)
     OR NOT coalesce(r->>'route' ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$',false)
     OR NOT coalesce(r->>'presetDigest' ~ '^[A-Za-z0-9:+/=_-]{1,120}$',false)) THEN
   RAISE EXCEPTION 'Invalid runtime roles' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','route',r->>'route','presetDigest',r->>'presetDigest') ORDER BY r->>'id'),'[]')
   INTO advertised FROM jsonb_array_elements(p_hello->'roles') r;
 END IF;
 PERFORM 1 FROM sophia.projects WHERE id=rt.project_id FOR UPDATE;
 UPDATE sophia.runtime_instances SET lease_id=gen_random_uuid(), lease_epoch=lease_epoch+1, bridge_instance_id=p_bridge,
  protocol_version=1, bundle=left(p_hello->>'bundle',200), dsh_version=left(p_hello->>'dshVersion',100), hello_at=now(),
  ready_state='not_ready', ready_reason='hello received; waiting for the ready report', ready_at=NULL, seen_at=now(), roles=advertised
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

-- --- research lineage, reads and drafts -----------------------------------------------------------------------

-- One row per research task job: its lineage (the root task and the task it amends), its allowance, who admitted it
-- in which exchange, the specialist and route it runs on, its question and the URLs the person gave.
CREATE TABLE sophia.research_tasks (
 project_id uuid NOT NULL, job_id uuid NOT NULL,
 root_job_id uuid NOT NULL, amends_job_id uuid,
 allowance_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 exchange_id text CHECK(exchange_id IS NULL OR exchange_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
 role text NOT NULL CHECK(role ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$'),
 route text NOT NULL CHECK(route ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 question_source_id uuid NOT NULL,
 urls text[] NOT NULL DEFAULT '{}' CHECK(cardinality(urls)<=8),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,job_id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,root_job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,amends_job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id),
 FOREIGN KEY(project_id,question_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE INDEX research_tasks_lineage ON sophia.research_tasks(project_id,root_job_id);

-- A paid read's target, resolved at reservation; a search's query (it passed the host's disclosure guard).
ALTER TABLE sophia.research_reservations
 ADD COLUMN target_ref text CHECK(target_ref IS NULL OR target_ref ~ '^(search|link|input):[0-9a-f-]{36}(#[0-9]{1,4})?$'),
 ADD COLUMN target_url text CHECK(target_url IS NULL OR length(target_url) BETWEEN 1 AND 2048),
 ADD COLUMN query text CHECK(query IS NULL OR length(query) BETWEEN 1 AND 400),
 -- Only a read has a target (runtime_research_reserve sets it on every read it reserves, before it returns).
 ADD CONSTRAINT research_reservations_target CHECK((kind='read' OR target_ref IS NULL) AND (target_ref IS NULL)=(target_url IS NULL)),
 ADD CONSTRAINT research_reservations_query CHECK(kind='search' OR query IS NULL);

-- The links a read page carried, in order: `link:<source>#n` names the n-th. One capture per paid call.
ALTER TABLE sophia.source_provenance ADD COLUMN links text[] NOT NULL DEFAULT '{}' CHECK(cardinality(links)<=200);
CREATE UNIQUE INDEX source_provenance_one_per_call ON sophia.source_provenance(project_id,reservation_id) WHERE reservation_id IS NOT NULL;

-- The attempt's draft, as successive sources: each write names the hash it replaces.
CREATE TABLE sophia.research_drafts (
 project_id uuid NOT NULL, attempt_id uuid NOT NULL, seq integer NOT NULL CHECK(seq>0),
 call_key text NOT NULL CHECK(call_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 source_id uuid NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,attempt_id,seq), UNIQUE(project_id,attempt_id,call_key),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);

ALTER TABLE sophia.research_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.research_tasks FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.research_drafts FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.research_tasks, sophia.research_drafts TO sophia_api;

-- --- admission ------------------------------------------------------------------------------------------------

-- The research create's task statement. The research-base section and the evidence rules are the preset's prompt
-- sections (S4 part 2); this is the request alone, with the manifest it was admitted with.
CREATE FUNCTION sophia.research_prompt(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Research task. Answer the question below with a sourced report in the requested formats.'||E'\n'
 || 'Start with research_read_context: it holds the request, the inputs you may read, your remaining allowance and '
 || 'any draft. Use only what research_read_context, research_search and research_read_source return; when the sources '
 || 'do not settle something, say so. Finish with research_submit_result, or research_report_blocker when you cannot.'||E'\n\n'
 || 'Question: '||(p_manifest->>'question')||E'\n'
 || 'Outputs: '||(SELECT string_agg(o,', ' ORDER BY n) FROM jsonb_array_elements_text(p_manifest->'outputs') WITH ORDINALITY AS x(o,n))||E'\n\n'
 || 'Manifest ('||(p_manifest->>'schema')||'):'||E'\n'||jsonb_pretty(p_manifest) $$;
REVOKE ALL ON FUNCTION sophia.research_prompt(jsonb) FROM PUBLIC;

-- Admit one research task (start_research). The API resolves the specialist and its route from the registry; the
-- request carries what the model supplied. Under an idempotency key, like every command.
CREATE FUNCTION sophia.admit_research_task(p_project uuid, p_key text, p_exchange text, p_request jsonb, p_role text, p_route text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; gr sophia.research_grants; prior sophia.commands; semantic jsonb;
 rt sophia.runtime_instances; question text:=btrim(p_request->>'question'); outputs jsonb; inputs uuid[]; urls text[];
 prefs jsonb; assumptions jsonb; amends uuid; base sophia.research_tasks; base_job sophia.jobs; g sophia.goals;
 running sophia.jobs; q sophia.source_objects; manifest jsonb; ctx sophia.source_objects; al sophia.research_allowances;
 goal uuid; att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 root uuid; cursor_value bigint; receipt_value jsonb; bad uuid; artifact jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_exchange IS NOT NULL AND p_exchange !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN RAISE EXCEPTION 'Invalid exchange' USING ERRCODE='22023'; END IF;
 IF p_role IS NULL OR p_role !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$' OR p_route IS NULL OR p_route !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$' THEN
  RAISE EXCEPTION 'Invalid research specialist' USING ERRCODE='22023'; END IF;
 IF question IS NULL OR length(question) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid research question' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'outputs')<>'array' OR NOT (p_request->'outputs' ? 'markdown') OR jsonb_array_length(p_request->'outputs')>2
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'outputs') o WHERE o NOT IN ('"markdown"','"pdf"'))
  OR (SELECT count(DISTINCT o) FROM jsonb_array_elements(p_request->'outputs') o)<>jsonb_array_length(p_request->'outputs') THEN
  RAISE EXCEPTION 'Invalid research outputs' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(o ORDER BY CASE o WHEN '"markdown"' THEN 0 ELSE 1 END) INTO outputs FROM jsonb_array_elements(p_request->'outputs') o;
 SELECT coalesce(array_agg(v::uuid ORDER BY n),'{}') INTO inputs
  FROM jsonb_array_elements_text(coalesce(p_request->'inputSourceIds','[]')) WITH ORDINALITY AS e(v,n);
 IF cardinality(inputs)>8 OR cardinality(inputs)<>(SELECT count(DISTINCT x) FROM unnest(inputs) x) THEN
  RAISE EXCEPTION 'At most 8 distinct inputs' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(v ORDER BY n),'{}') INTO urls FROM jsonb_array_elements_text(coalesce(p_request->'urls','[]')) WITH ORDINALITY AS e(v,n);
 IF cardinality(urls)>8 OR EXISTS(SELECT 1 FROM unnest(urls) u WHERE length(u)>2048 OR u !~* '^https?://[^\s/?#]+[^\s]*$') THEN
  RAISE EXCEPTION 'At most 8 web addresses, each an http or https URL' USING ERRCODE='22023'; END IF;
 prefs:=jsonb_strip_nulls(jsonb_build_object('depth',p_request->'preferences'->'depth','sourceConstraints',p_request->'preferences'->'sourceConstraints'));
 IF (prefs ? 'depth' AND prefs->>'depth' NOT IN ('brief','standard','deep'))
  OR (prefs ? 'sourceConstraints' AND (jsonb_typeof(prefs->'sourceConstraints')<>'string' OR length(prefs->>'sourceConstraints') NOT BETWEEN 1 AND 500)) THEN
  RAISE EXCEPTION 'Invalid research preferences' USING ERRCODE='22023'; END IF;
 assumptions:=coalesce(p_request->'assumptions','[]');
 IF jsonb_typeof(assumptions)<>'array' OR jsonb_array_length(assumptions)>8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(assumptions) x
   WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 200) THEN
  RAISE EXCEPTION 'Invalid research assumptions' USING ERRCODE='22023'; END IF;
 amends:=nullif(p_request->>'amendsTaskId','')::uuid;
 IF amends IS NOT NULL AND coalesce((p_request->>'newRequest')::boolean,false) THEN
  RAISE EXCEPTION 'An amendment is not a new request' USING ERRCODE='22023'; END IF;

 -- Lock order: project first; authority is checked again under the lock.
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','research','question',encode(sha256(convert_to(question,'UTF8')),'hex'),'outputs',outputs,
  'inputSourceIds',to_jsonb(inputs),'urls',to_jsonb(urls),'preferences',prefs,'assumptions',assumptions,'amendsTaskId',amends,
  'newRequest',coalesce((p_request->>'newRequest')::boolean,false),'role',p_role,'route',p_route,'exchangeId',p_exchange);
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 SELECT * INTO gr FROM sophia.research_grants WHERE project_id=p_project FOR SHARE;
 IF NOT FOUND OR gr.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;

 -- The same person in the same exchange already has research under way: that task, unless this one is declared new.
 IF amends IS NULL AND NOT coalesce((p_request->>'newRequest')::boolean,false) AND p_exchange IS NOT NULL THEN
  SELECT j.* INTO running FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
   WHERE t.project_id=p_project AND t.actor_id=a AND t.exchange_id=p_exchange AND j.state IN ('pending','running','outcome_unknown')
   ORDER BY t.created_at DESC LIMIT 1;
  IF FOUND THEN
   RETURN jsonb_build_object('existingTaskId',running.id,'receipt',(SELECT receipt FROM sophia.commands WHERE project_id=p_project AND id=running.command_id));
  END IF;
 END IF;

 SELECT x INTO bad FROM unnest(inputs) x WHERE NOT EXISTS(SELECT 1 FROM sophia.source_objects s
  WHERE s.project_id=p_project AND s.id=x AND s.scope='project' AND s.eligible AND s.state='ready') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;

 IF amends IS NOT NULL THEN
  SELECT * INTO base FROM sophia.research_tasks WHERE project_id=p_project AND job_id=amends;
  IF NOT FOUND THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO base_job FROM sophia.jobs WHERE project_id=p_project AND id=amends;
  IF base_job.state IN ('pending','running','outcome_unknown') THEN
   RAISE EXCEPTION 'The research task is still under way; steer it instead' USING ERRCODE='40001'; END IF;
  -- An amendment continues the lineage it amends: the latest task of it, so two amendments of one task cannot fork it.
  IF EXISTS(SELECT 1 FROM sophia.research_tasks t WHERE t.project_id=p_project AND t.root_job_id=base.root_job_id AND t.created_at>base.created_at) THEN
   RAISE EXCEPTION 'Stale research task: a later task continues this lineage' USING ERRCODE='40001'; END IF;
  SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
   WHERE wa.project_id=p_project AND wa.id=base_job.attempt_id FOR UPDATE OF g2;
  IF g.status IN ('holding','stopping') THEN RAISE EXCEPTION 'The research goal is settling a Hold or Stop' USING ERRCODE='40001'; END IF;
  goal:=g.id; root:=base.root_job_id;
  SELECT * INTO al FROM sophia.research_allowances WHERE project_id=p_project AND id=base.allowance_id;
  IF base_job.artifact_id IS NOT NULL THEN
   SELECT jsonb_build_object('artifactId',ar.id,'versionId',v.id,'sourceId',v.source_id) INTO artifact
    FROM sophia.artifacts ar JOIN sophia.artifact_versions v ON v.project_id=ar.project_id AND v.id=ar.stable_version_id
    WHERE ar.project_id=p_project AND ar.id=base_job.artifact_id;
  END IF;
 END IF;

 SELECT * INTO rt FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
   AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL
  ORDER BY r.seen_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No research runtime is ready for this project' USING ERRCODE='55000'; END IF;

 q:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',question);
 manifest:=jsonb_build_object('schema','sophia.research-manifest.v1','projectId',p_project,'taskId',job,'role',p_role,'route',p_route,
  'question',question,'questionSourceId',q.id,'outputs',outputs,'preferences',prefs,'assumptions',assumptions,
  'inputs',(SELECT coalesce(jsonb_agg(jsonb_build_object('ref','input:'||s.id,'sourceId',s.id,'sha256',s.sha256,'mime',s.mime,
     'byteLength',s.byte_length) ORDER BY x.n),'[]')
   FROM unnest(inputs) WITH ORDINALITY AS x(sid,n) JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=x.sid),
  'urls',(SELECT coalesce(jsonb_agg(jsonb_build_object('ref','input:'||q.id||'#'||n,'url',u) ORDER BY n),'[]') FROM unnest(urls) WITH ORDINALITY AS x(u,n)),
  'lineage',jsonb_build_object('rootTaskId',coalesce(root,job),'amendsTaskId',amends),'base',artifact);
 ctx:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,q.id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ctx.id FROM unnest(inputs) x ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 IF goal IS NULL THEN
  goal:=gen_random_uuid();
  INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
  VALUES(p_project,goal,left('Research: '||regexp_replace(question,'\s+',' ','g'),120),
   'A sourced research report in the requested formats, drafted by the dsh runtime from the web and the chosen inputs',
   jsonb_build_array(jsonb_build_object('id','report-sourced','description',
    'Every claim cites a retrieved or admitted source; what the sources do not settle is stated','required',true,'verification','human_review')),
   pr.mission_revision,'ready') RETURNING * INTO g;
 ELSE
  UPDATE sophia.goals SET revision=revision+1, state_revision=state_revision+1, status='ready'
   WHERE project_id=p_project AND id=goal RETURNING * INTO g;
 END IF;
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,goal,g.revision,g.authority_epoch,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,rt.resource_id,'sophia-'||att,rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,goal,g.revision,g.authority_epoch,'native_task',p_key,semantic,q.id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state,artifact_id)
 VALUES(p_project,job,'research',ctx.id,cmd,att,'pending',base_job.artifact_id);
 IF al.id IS NULL THEN
  al:=sophia.open_research_allowance(p_project,job,round(gr.task_cap_usd*0.1,6));
 END IF;
 INSERT INTO sophia.research_tasks(project_id,job_id,root_job_id,amends_job_id,allowance_id,actor_id,exchange_id,role,route,question_source_id,urls)
 VALUES(p_project,job,coalesce(root,job),amends,al.id,a,p_exchange,p_role,p_route,q.id,urls);
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,goal,g.authority_epoch);
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.research',
  jsonb_build_array(goal,cmd,ctx.id));
 receipt_value:=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',goal,'attemptId',att,'projectId',p_project,'kind','research',
  'stage','admitted','cursor',cursor_value::text,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,'contextSourceId',ctx.id);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

-- --- dispatch -------------------------------------------------------------------------------------------------

-- dispatch_runtime_outbox (0012), replaced: the same, except that a research create takes its role and route from
-- its manifest and waits while another research task of the project is under way (one research worker).
CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
 job_kind text; job_id uuid;
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
   SELECT j.kind, j.id, t.body::jsonb INTO job_kind, job_id, manifest FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   IF job_kind='research' THEN
    -- One research worker: another research task already started and not yet ended keeps this one queued.
    IF EXISTS(SELECT 1 FROM sophia.jobs j2 JOIN sophia.execution_bindings b2 ON b2.project_id=j2.project_id AND b2.attempt_id=j2.attempt_id
      JOIN sophia.work_attempts w2 ON w2.project_id=j2.project_id AND w2.id=j2.attempt_id
      JOIN sophia.goals g2 ON g2.project_id=w2.project_id AND g2.id=w2.goal_id
      WHERE j2.project_id=p_project AND j2.kind='research' AND j2.id<>job_id AND j2.state IN ('pending','running','outcome_unknown')
       AND b2.state IN ('launching','running','idle') AND g2.status IN ('ready','running','checking')) THEN
     RETURN sophia.defer_native_delivery(o,c,'waiting for the research worker: another research task is under way');
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.research_prompt(manifest));
   ELSE
    payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
   END IF;
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
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending'
   AND (reason LIKE 'waiting for Sophia''s runtime%' OR reason LIKE 'waiting for the research worker%');
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;

-- --- runtime research operations ------------------------------------------------------------------------------

CREATE TYPE sophia.research_scope AS (
 project_id uuid, runtime_id uuid, binding_id uuid, attempt_id uuid, native_session_id text, goal_id uuid, job_id uuid,
 allowance_id uuid, actor_id uuid, root_job_id uuid, manifest_source_id uuid, question_source_id uuid
);

-- Authenticate a research operation: the runtime's lease, then a research binding it owns (attempt and native
-- session). With p_fence, the work must also be active under the goal's current authority (see the header).
CREATE FUNCTION sophia.research_scope_of(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_fence boolean)
RETURNS sophia.research_scope LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); b sophia.execution_bindings; g sophia.goals;
 j sophia.jobs; t sophia.research_tasks; owner sophia.runtime_commands; s sophia.research_scope;
BEGIN
 IF coalesce(p_request->>'attemptId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Research operation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rt.project_id AND resource_id=rt.resource_id
  AND runtime_unit_id=rt.runtime_unit_id AND attempt_id=(p_request->>'attemptId')::uuid AND native_session_id=p_request->>'nativeSessionId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Research operation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=rt.project_id AND attempt_id=b.attempt_id AND kind='research';
 IF NOT FOUND THEN RAISE EXCEPTION 'Research operation names an attempt that is not research' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=rt.project_id AND job_id=j.id;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=rt.project_id AND wa.id=b.attempt_id FOR UPDATE OF g2;
 IF p_fence THEN
  IF g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'Research work is not active: the goal is %', g.status USING ERRCODE='40001'; END IF;
  IF j.state NOT IN ('pending','running') THEN RAISE EXCEPTION 'Research work is not active: the task has ended' USING ERRCODE='40001'; END IF;
  IF b.state IN ('settled','lost','stopping') THEN RAISE EXCEPTION 'Research work is not active: the session is %', b.state USING ERRCODE='40001'; END IF;
  SELECT * INTO owner FROM sophia.runtime_commands WHERE project_id=rt.project_id AND binding_id=b.id AND kind<>'inspect' ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
   RAISE EXCEPTION 'Research work is not active: its authority moved on (a Hold or Stop)' USING ERRCODE='40001'; END IF;
 END IF;
 s:=ROW(rt.project_id,rt.id,b.id,b.attempt_id,b.native_session_id,g.id,j.id,t.allowance_id,t.actor_id,t.root_job_id,j.input_source_id,t.question_source_id);
 RETURN s;
END $$;

-- Whether a stored source may be read by this task: one of its admitted inputs, its manifest or question, the stable
-- version it amends, a capture made under its allowance, or one of its own drafts.
CREATE FUNCTION sophia.research_readable(s sophia.research_scope, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT p_source=s.manifest_source_id OR p_source=s.question_source_id
  OR EXISTS(SELECT 1 FROM sophia.source_dependencies d JOIN sophia.source_objects o ON o.project_id=d.project_id AND o.id=d.source_id
   WHERE d.project_id=s.project_id AND d.derived_source_id=s.manifest_source_id AND d.source_id=p_source
    AND o.scope='project' AND o.eligible AND o.state='ready')
  OR EXISTS(SELECT 1 FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id
   AND t.body::jsonb->'base'->>'sourceId'=p_source::text)
  OR EXISTS(SELECT 1 FROM sophia.source_provenance p JOIN sophia.research_reservations r ON r.project_id=p.project_id AND r.id=p.reservation_id
   WHERE p.project_id=s.project_id AND p.source_id=p_source AND r.allowance_id=s.allowance_id)
  OR EXISTS(SELECT 1 FROM sophia.research_drafts d WHERE d.project_id=s.project_id AND d.attempt_id=s.attempt_id AND d.source_id=p_source) $$;
REVOKE ALL ON FUNCTION sophia.research_readable(sophia.research_scope,uuid) FROM PUBLIC;

-- POST /v1/runtime/research/context: without a source, the task (request, inputs, URLs, allowance, latest draft) and
-- the disclosure guard's roster; with one, a page of that stored source (a re-read costs no paid call).
CREATE FUNCTION sophia.runtime_research_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); manifest jsonb;
 al sophia.research_allowances; draft sophia.research_drafts; body text; src uuid; off integer; size integer; total integer;
 searches integer; reads integer;
BEGIN
 IF p_request ? 'sourceId' THEN
  IF coalesce(p_request->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Research source not found' USING ERRCODE='22023'; END IF;
  src:=(p_request->>'sourceId')::uuid;
  IF NOT sophia.research_readable(s,src) THEN RAISE EXCEPTION 'Research source not found' USING ERRCODE='22023'; END IF;
  SELECT t.body INTO body FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=src;
  IF body IS NULL THEN RAISE EXCEPTION 'Research source has no stored text' USING ERRCODE='22023'; END IF;
  off:=coalesce((p_request->>'offset')::integer,0); size:=least(coalesce((p_request->>'limit')::integer,6000),6000);
  IF off<0 OR size<1 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  total:=char_length(body); off:=least(off,total);
  RETURN jsonb_build_object('sourceId',src,'offset',off,'nextOffset',CASE WHEN off+size<total THEN to_jsonb(off+size) ELSE 'null'::jsonb END,
   'totalChars',total,'truncated',off+size<total,'text',substr(body,off+1,size));
 END IF;
 SELECT t.body::jsonb INTO manifest FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id;
 SELECT * INTO al FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id;
 SELECT count(*) FILTER (WHERE kind='search'), count(*) FILTER (WHERE kind='read') INTO searches, reads
  FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND state<>'released';
 SELECT * INTO draft FROM sophia.research_drafts WHERE project_id=s.project_id AND attempt_id=s.attempt_id ORDER BY seq DESC LIMIT 1;
 RETURN jsonb_build_object('taskId',s.job_id,'rootTaskId',s.root_job_id,'question',manifest->'question','outputs',manifest->'outputs',
  'preferences',manifest->'preferences','assumptions',manifest->'assumptions','inputs',manifest->'inputs','urls',manifest->'urls',
  'base',manifest->'base',
  'allowance',jsonb_build_object('capUsd',al.cap_usd,'headroomUsd',al.headroom_usd,
   'committedUsd',al.reserved_usd+al.spent_usd+al.uncertain_usd,'searchesLeft',greatest(al.max_searches-searches,0),
   'readsLeft',greatest(al.max_reads-reads,0)),
  'draft',CASE WHEN draft.source_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('sourceId',draft.source_id,'sha256',draft.sha256,'seq',draft.seq) END,
  -- The disclosure guard's roster, as far as the database holds it: member invitation addresses and the names
  -- people gave in the lobby. Names held only by the identity provider are not here.
  'roster',(SELECT coalesce(jsonb_agg(m ORDER BY m->>'name', m->>'email'),'[]') FROM (
    SELECT DISTINCT jsonb_build_object('name',coalesce(l.display_name,''),'email',NULL) AS m FROM sophia.room_lobby l
     WHERE l.project_id=s.project_id AND l.status='admitted'
    UNION
    SELECT DISTINCT jsonb_build_object('name','','email',lower(i.email)) FROM sophia.room_invitations i
     WHERE i.project_id=s.project_id AND i.kind='member' AND i.email IS NOT NULL AND i.revoked_at IS NULL) x));
END $$;

-- The URL a read target names, within the task's lineage; null when it names nothing the task may read.
CREATE FUNCTION sophia.research_target_url(s sophia.research_scope, p_ref text) RETURNS text LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE kind text:=split_part(p_ref,':',1); rest text:=substr(p_ref,length(split_part(p_ref,':',1))+2);
 sid uuid; n integer; url text;
BEGIN
 IF p_ref IS NULL OR p_ref !~ '^(search|link|input):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#[0-9]{1,4}$' THEN RETURN NULL; END IF;
 sid:=split_part(rest,'#',1)::uuid; n:=split_part(rest,'#',2)::integer;
 IF n<1 THEN RETURN NULL; END IF;
 IF kind='input' THEN
  SELECT t.urls[n] INTO url FROM sophia.research_tasks t WHERE t.project_id=s.project_id AND t.root_job_id=s.root_job_id AND t.question_source_id=sid;
 ELSIF kind='search' THEN
  SELECT x.body::jsonb->'results'->(n-1)->>'url' INTO url FROM sophia.source_provenance p
   JOIN sophia.research_reservations r ON r.project_id=p.project_id AND r.id=p.reservation_id
   JOIN sophia.source_texts x ON x.project_id=p.project_id AND x.source_id=p.source_id
   WHERE p.project_id=s.project_id AND p.source_id=sid AND p.kind='search_results' AND r.allowance_id=s.allowance_id;
 ELSE
  SELECT p.links[n] INTO url FROM sophia.source_provenance p
   JOIN sophia.research_reservations r ON r.project_id=p.project_id AND r.id=p.reservation_id
   WHERE p.project_id=s.project_id AND p.source_id=sid AND p.kind='web_read' AND r.allowance_id=s.allowance_id;
 END IF;
 RETURN url;
END $$;
REVOKE ALL ON FUNCTION sophia.research_target_url(sophia.research_scope,text) FROM PUBLIC;

-- POST /v1/runtime/research/reserve: before one paid call. A read names its target, resolved here; a search names its
-- query. Idempotent by native session and call id; a replay returns the same reservation and target.
CREATE FUNCTION sophia.runtime_research_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 k text:=p_request->>'kind'; key text; ref text:=p_request->>'targetRef'; url text; q text:=p_request->>'query';
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
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND AND (r.target_ref IS DISTINCT FROM ref OR r.query IS DISTINCT FROM q) THEN
  RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,k,p_request->>'provider',(p_request->>'amountUsd')::numeric,
  coalesce(p_request->>'purpose','call'));
 IF r.target_ref IS NULL AND r.query IS NULL AND (ref IS NOT NULL OR q IS NOT NULL) THEN
  UPDATE sophia.research_reservations SET target_ref=ref, target_url=url, query=q WHERE project_id=s.project_id AND id=r.id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,
  'target',CASE WHEN r.target_ref IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('ref',r.target_ref,'url',r.target_url) END);
END $$;

-- The reservation a call of this session made, locked: settle and capture act only on their own session's calls.
CREATE FUNCTION sophia.research_own_reservation(s sophia.research_scope, p_reservation text) RETURNS sophia.research_reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.research_reservations;
BEGIN
 IF coalesce(p_reservation,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=p_reservation::uuid AND allowance_id=s.allowance_id
  AND starts_with(reservation_key,s.native_session_id||':');
 IF NOT FOUND THEN RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION sophia.research_own_reservation(sophia.research_scope,text) FROM PUBLIC;

-- POST /v1/runtime/research/settle: end a reservation from the call's reported usage. Never fenced.
CREATE FUNCTION sophia.runtime_research_settle(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 r sophia.research_reservations:=sophia.research_own_reservation(s,p_request->>'reservationId');
BEGIN
 IF p_request ? 'usage' AND jsonb_typeof(p_request->'usage')<>'object' THEN RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023'; END IF;
 r:=sophia.end_research_reservation(s.project_id,r.id,p_request->>'outcome',(p_request->>'costUsd')::numeric,p_request->'usage',
  p_request->>'providerRequestId');
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd);
END $$;

-- POST /v1/runtime/research/capture: keep what one paid search or read returned, with its provenance. One capture per
-- call; a replay returns it. Search results are kept as JSON (`search:<source>#n` names the n-th), a page as Markdown.
CREATE FUNCTION sophia.runtime_research_capture(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 r sophia.research_reservations:=sophia.research_own_reservation(s,p_request->>'reservationId'); p sophia.source_provenance;
 src sophia.source_objects; k text:=p_request->>'kind'; body text; parent uuid; links text[]; lims text[]; n integer;
BEGIN
 SELECT * INTO p FROM sophia.source_provenance WHERE project_id=s.project_id AND reservation_id=r.id;
 IF FOUND THEN
  IF p.kind IS DISTINCT FROM k THEN RAISE EXCEPTION 'Idempotency key reused for another capture' USING ERRCODE='23505'; END IF;
  SELECT * INTO src FROM sophia.source_objects WHERE project_id=s.project_id AND id=p.source_id;
 ELSE
  IF r.state='released' THEN RAISE EXCEPTION 'A released call has nothing to capture' USING ERRCODE='22023'; END IF;
  IF NOT ((k='search_results' AND r.kind='search') OR (k='web_read' AND r.kind='read')) THEN
   RAISE EXCEPTION 'The capture does not match its call' USING ERRCODE='22023'; END IF;
  IF p_request->>'provider' IS DISTINCT FROM r.provider THEN RAISE EXCEPTION 'The capture does not match its call' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(v ORDER BY i),'{}') INTO lims FROM jsonb_array_elements_text(coalesce(p_request->'limitations','[]')) WITH ORDINALITY AS e(v,i);
  IF cardinality(lims)>20 OR EXISTS(SELECT 1 FROM unnest(lims) l WHERE length(l) NOT BETWEEN 1 AND 300) THEN
   RAISE EXCEPTION 'Invalid limitations' USING ERRCODE='22023'; END IF;
  IF k='search_results' THEN
   IF jsonb_typeof(p_request->'results')<>'array' OR jsonb_array_length(p_request->'results')>5 OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(p_request->'results') x WHERE jsonb_typeof(x)<>'object'
      OR coalesce(length(x->>'url'),0) NOT BETWEEN 1 AND 2048 OR x->>'url' !~* '^https?://') THEN
    RAISE EXCEPTION 'Invalid search results' USING ERRCODE='22023'; END IF;
   body:=jsonb_pretty(jsonb_build_object('schema','sophia.search-results.v1','query',r.query,
    'results',(SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('rank',i,'url',x->>'url','title',left(x->>'title',300),
      'snippet',left(x->>'snippet',1000),'publishedAt',left(x->>'publishedAt',64),'score',x->'score')) ORDER BY i),'[]')
     FROM jsonb_array_elements(p_request->'results') WITH ORDINALITY AS e(x,i))));
   src:=sophia.put_text_source(s.project_id,s.actor_id,'application/json',body);
  ELSE
   body:=p_request->>'text';
   IF body IS NULL OR octet_length(body)>262144 THEN RAISE EXCEPTION 'A read capture is 0 to 262144 bytes of text' USING ERRCODE='22023'; END IF;
   SELECT coalesce(array_agg(v ORDER BY i),'{}') INTO links FROM jsonb_array_elements_text(coalesce(p_request->'links','[]')) WITH ORDINALITY AS e(v,i);
   IF cardinality(links)>200 OR EXISTS(SELECT 1 FROM unnest(links) l WHERE length(l) NOT BETWEEN 1 AND 2048 OR l !~* '^https?://') THEN
    RAISE EXCEPTION 'Invalid links' USING ERRCODE='22023'; END IF;
   IF r.target_ref LIKE 'search:%' OR r.target_ref LIKE 'link:%' THEN parent:=split_part(split_part(r.target_ref,':',2),'#',1)::uuid; END IF;
   src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',body);
  END IF;
  INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,reservation_id,target_ref,parent_source_id,requested_url,
   provider_http_status,origin_http_status,reported_final_url,provider_request_id,extraction,coverage,limitations,links)
  VALUES(s.project_id,src.id,k,r.provider,r.id,r.target_ref,parent,r.target_url,
   (p_request->>'providerHttpStatus')::integer,(p_request->>'originHttpStatus')::integer,p_request->>'reportedFinalUrl',
   left(p_request->>'providerRequestId',200),p_request->>'extraction',p_request->>'coverage',lims,coalesce(links,'{}'))
  RETURNING * INTO p;
 END IF;
 SELECT CASE WHEN p.kind='search_results' THEN jsonb_array_length(t.body::jsonb->'results') ELSE cardinality(p.links) END
  INTO n FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=src.id;
 RETURN jsonb_build_object('sourceId',src.id,'sha256',src.sha256,'byteLength',src.byte_length,'kind',p.kind,
  'refs',(SELECT coalesce(jsonb_agg((CASE WHEN p.kind='search_results' THEN 'search:' ELSE 'link:' END)||src.id||'#'||i ORDER BY i),'[]')
   FROM generate_series(1,n) i));
END $$;

-- POST /v1/runtime/research/draft: replace the attempt's draft. The write names the hash it replaces (null for the
-- first); a stale one is refused, a replay of the same call returns its draft.
CREATE FUNCTION sophia.runtime_research_draft(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); d sophia.research_drafts;
 cur sophia.research_drafts; key text; body text:=p_request->>'text'; src sophia.source_objects;
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 SELECT * INTO d FROM sophia.research_drafts WHERE project_id=s.project_id AND attempt_id=s.attempt_id AND call_key=key;
 IF FOUND THEN
  IF d.sha256<>encode(sha256(convert_to(coalesce(body,''),'UTF8')),'hex') THEN
   RAISE EXCEPTION 'Idempotency key reused for another draft' USING ERRCODE='23505'; END IF;
 ELSE
  IF body IS NULL OR octet_length(body) NOT BETWEEN 1 AND 262144 THEN RAISE EXCEPTION 'A draft is 1 to 262144 bytes of text' USING ERRCODE='22023'; END IF;
  SELECT * INTO cur FROM sophia.research_drafts WHERE project_id=s.project_id AND attempt_id=s.attempt_id ORDER BY seq DESC LIMIT 1;
  IF cur.sha256 IS DISTINCT FROM p_request->>'expectedSha256' THEN RAISE EXCEPTION 'Stale draft: it changed since it was read' USING ERRCODE='40001'; END IF;
  src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',body);
  INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256)
  VALUES(s.project_id,s.attempt_id,coalesce(cur.seq,0)+1,key,src.id,src.sha256) RETURNING * INTO d;
 END IF;
 RETURN jsonb_build_object('sourceId',d.source_id,'sha256',d.sha256,'seq',d.seq);
END $$;

REVOKE ALL ON FUNCTION sophia.research_scope_of(bytea,text,text,jsonb,boolean),
 sophia.admit_research_task(uuid,text,text,jsonb,text,text),
 sophia.runtime_research_context(bytea,text,text,jsonb), sophia.runtime_research_reserve(bytea,text,text,jsonb),
 sophia.runtime_research_settle(bytea,text,text,jsonb), sophia.runtime_research_capture(bytea,text,text,jsonb),
 sophia.runtime_research_draft(bytea,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.admit_research_task(uuid,text,text,jsonb,text,text),
 sophia.runtime_research_context(bytea,text,text,jsonb), sophia.runtime_research_reserve(bytea,text,text,jsonb),
 sophia.runtime_research_settle(bytea,text,text,jsonb), sophia.runtime_research_capture(bytea,text,text,jsonb),
 sophia.runtime_research_draft(bytea,text,text,jsonb) TO sophia_api;

COMMIT;
