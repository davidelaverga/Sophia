-- INC01-COHERENT-WRITE-003 (0100), finding CW2-REBUILD-F01 (P1): a rebuilt contributed research task keeps its
-- funding binding. Plan: docs/plans/inc01-coherent-composition.md ("WRITE-003"). Append-only: 0001–0099 are not edited.
-- * Cause: source erasure revokes a consuming research task and research_rebuild (0033) queues a replacement on the same
--   resource and allowance, but never writes api_contribution_tasks for it. Every 0094 consumer (dispatch, paid
--   reservation, ledger link, publication, funding read) then read the replacement as project work, so a contributed
--   runtime's paid calls escaped the grant, credential, member and cap checks and were reported as project funded.
-- * Producer: research_rebuild is replaced with the 0033 body plus one call. contribution_rebuild_bind copies the old
--   task's frozen binding (grant and its revision, connection and credential revision, account, owner, requester,
--   resource, allowance, requested settings) to the new task, unchanged. Nothing current is chosen, no revision is
--   rebased, and nothing is decided about authority here, so the erasure, the revocation and its Stop always commit.
--   The existing 0094 gates then decide new work under their own locks: dispatch (contribution_delivery_ineligible)
--   and each paid call (contribution_model_reserve, whose task cap is per allowance, so cumulative across the lineage).
-- * Existing orphans (rebuilt before 0100): contribution_lineage_unbound(project, job) is true for a research job with no
--   binding whose allowance belongs to a contributed task. Dispatch denies it, a paid call is refused
--   (lineage_unbound), publication is withheld and the funding read refuses instead of claiming project funding.
--   Nothing is backfilled or relinked to past charges. A project-funded lineage is unaffected.
-- * A new paid search or read of an unbound contributed lineage is refused too (runtime_research_reserve calls
--   contribution_model_reserve only for a model call); a replay, settlement and reconciliation are unchanged.
-- * WRITE-004 (CW3-REBUILD-CAPACITY-F01): a rebuilt task never passes admission, so its concurrency slot is decided at
--   dispatch and at each new paid model call. Every other held task of its account (every project and alias) and of
--   its grant is counted as contribution_slots_held counts it (the original's reserved or uncertain call keeps its
--   slot); the rebuilt task does not count itself. Over a limit, its delivery is denied (cancelled through the existing
--   deny path; nothing retries it) and its paid call is refused (account_busy). Both read the limits and counts after the
--   account row's wait, in admission's lock order. The erasure decides nothing about capacity and always commits.
-- * Five 0094 functions are replaced with their bodies unchanged except the lines marked 0100; their grants are kept.
BEGIN;

-- A research job that has no funding binding although its allowance belongs to a contributed task.
CREATE FUNCTION sophia.contribution_lineage_unbound(p_project uuid, p_job uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT NOT EXISTS(SELECT 1 FROM sophia.api_contribution_tasks x WHERE x.project_id=p_project AND x.job_id=p_job)
  AND EXISTS(SELECT 1 FROM sophia.research_tasks r JOIN sophia.api_contribution_tasks x
   ON x.project_id=r.project_id AND x.allowance_id=r.allowance_id WHERE r.project_id=p_project AND r.job_id=p_job) $$;

-- The rebuilt task of a contributed task keeps the original frozen binding, exactly; a project-funded task binds nothing.
-- Called by research_rebuild under the project lock its callers hold; it decides no authority and raises nothing.
CREATE FUNCTION sophia.contribution_rebuild_bind(p_project uuid, p_old_job uuid, p_new_job uuid) RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,credential_revision,
  account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort)
 SELECT x.project_id,p_new_job,x.allowance_id,x.grant_id,x.grant_revision,x.connection_id,x.credential_revision,x.account_id,
  x.owner_id,x.requester_id,x.resource_id,x.requested_route,x.requested_model,x.requested_effort
 FROM sophia.api_contribution_tasks x WHERE x.project_id=p_project AND x.job_id=p_old_job
 ON CONFLICT (project_id,job_id) DO NOTHING $$;

-- A task research_rebuild queued: it never passed admission, so its slot is decided at dispatch and at its paid calls.
CREATE FUNCTION sophia.contribution_rebuilt(p_project uuid, p_job uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.research_tasks r WHERE r.project_id=p_project AND r.job_id=p_job AND r.rebuilt_from_job_id IS NOT NULL) $$;

-- The slots of an account (or of one of its grants) held by contributed tasks other than (p_project, p_job), counted
-- exactly as contribution_slots_held (0094) counts them: an unfinished task, or one whose model reservation is still
-- reserved or uncertain.
CREATE FUNCTION sophia.contribution_slots_held_by_others(p_account uuid, p_grant uuid, p_project uuid, p_job uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT count(*)::integer FROM sophia.api_contribution_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
  WHERE t.account_id=p_account AND (p_grant IS NULL OR t.grant_id=p_grant) AND NOT (t.project_id=p_project AND t.job_id=p_job)
   AND (j.state IN ('pending','running','outcome_unknown') OR EXISTS(SELECT 1 FROM sophia.api_contribution_reservations x
    JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
    WHERE x.project_id=t.project_id AND x.job_id=t.job_id AND r.state IN ('reserved','uncertain'))) $$;

-- Which limit other held tasks already fill for a bound task ('account' or 'grant'), or NULL when it has its slot.
-- Callers that write hold the account row first, so the limits and counts read here are current after that wait.
CREATE FUNCTION sophia.contribution_rebuild_capacity(t sophia.api_contribution_tasks, acc sophia.api_accounts, gr sophia.api_contribution_grants)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN sophia.contribution_slots_held_by_others(acc.id,NULL,t.project_id,t.job_id)>=acc.concurrency_limit THEN 'account'
  WHEN sophia.contribution_slots_held_by_others(acc.id,gr.id,t.project_id,t.job_id)>=gr.concurrency THEN 'grant' END $$;

REVOKE ALL ON FUNCTION sophia.contribution_lineage_unbound(uuid,uuid), sophia.contribution_rebuild_bind(uuid,uuid,uuid),
 sophia.contribution_rebuilt(uuid,uuid), sophia.contribution_slots_held_by_others(uuid,uuid,uuid,uuid),
 sophia.contribution_rebuild_capacity(sophia.api_contribution_tasks,sophia.api_accounts,sophia.api_contribution_grants) FROM PUBLIC;

-- research_rebuild (0033), replaced: the same, then the rebuilt task of a contributed task keeps its binding.
CREATE OR REPLACE FUNCTION sophia.research_rebuild(p_project uuid, j sophia.jobs, t sophia.research_tasks, g sophia.goals) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; old jsonb; manifest jsonb; kept jsonb; dropped integer; ctx sophia.source_objects; b sophia.execution_bindings;
 base_gone boolean; att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 cursor_value bigint;
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT body::jsonb INTO old FROM sophia.source_texts WHERE project_id=p_project AND source_id=j.input_source_id;
 SELECT coalesce(jsonb_agg(i ORDER BY n) FILTER (WHERE ok),'[]'), count(*) FILTER (WHERE NOT ok) INTO kept, dropped FROM (
  SELECT i, n, NOT sophia.source_withdrawn(p_project,(i->>'sourceId')::uuid) AS ok
   FROM jsonb_array_elements(coalesce(old->'inputs','[]')) WITH ORDINALITY AS x(i,n)) y;
 base_gone:=old->'base'->>'sourceId' IS NOT NULL AND sophia.source_withdrawn(p_project,(old->'base'->>'sourceId')::uuid);
 manifest:=CASE WHEN base_gone THEN old-'base' ELSE old END||jsonb_build_object('taskId',job,'inputs',kept,
  'lineage',coalesce(old->'lineage','{}')||jsonb_build_object('rebuiltFromTaskId',j.id),
  'withdrawnInputs',coalesce((old->>'withdrawnInputs')::integer,0)+dropped);
 IF base_gone THEN manifest:=manifest||jsonb_build_object('withdrawnBase',true); END IF;
 ctx:=sophia.put_text_source(p_project,t.actor_id,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,t.question_source_id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,(i->>'sourceId')::uuid,ctx.id FROM jsonb_array_elements(kept) i ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND attempt_id=j.attempt_id ORDER BY id LIMIT 1;
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,g.id,g.revision,g.authority_epoch,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,b.resource_id,'sophia-'||att,b.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,t.actor_id,g.id,g.revision,g.authority_epoch,'native_task','rebuild:'||j.id,
  jsonb_build_object('kind','research','rebuiltFromTaskId',j.id),t.question_source_id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state,artifact_id)
 VALUES(p_project,job,'research',ctx.id,cmd,att,'pending',j.artifact_id);
 INSERT INTO sophia.research_tasks(project_id,job_id,root_job_id,amends_job_id,allowance_id,actor_id,exchange_id,role,route,
  question_source_id,urls,rebuilt_from_job_id)
 VALUES(p_project,job,t.root_job_id,t.amends_job_id,t.allowance_id,t.actor_id,t.exchange_id,t.role,t.route,t.question_source_id,t.urls,j.id);
 -- 0100: a contributed task's rebuild keeps the original frozen funding binding (never project funding by omission).
 PERFORM sophia.contribution_rebuild_bind(p_project,j.id,job);
 IF g.status IN ('ready','running','checking') THEN
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
  VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,g.id,g.authority_epoch);
 END IF;
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.rebuilt',jsonb_build_array(g.id,cmd,ctx.id));
 UPDATE sophia.commands SET receipt=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',g.id,'attemptId',att,'projectId',p_project,
  'kind','research','stage','admitted','cursor',cursor_value::text,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,
  'contextSourceId',ctx.id) WHERE project_id=p_project AND id=cmd;
 RETURN job;
END $$;

-- contribution_delivery_ineligible (0094), replaced: the same, an unbound contributed lineage is not delivered, and a
-- rebuilt task is delivered only within its account's and grant's concurrency (WRITE-004).
CREATE OR REPLACE FUNCTION sophia.contribution_delivery_ineligible(o sophia.outbox, b sophia.execution_bindings) RETURNS text LANGUAGE plpgsql VOLATILE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; why text;
 acc sophia.api_accounts; rebuilt boolean;
BEGIN
 IF o.destination NOT IN ('native.create','native.resume','native.steer') OR b.id IS NULL THEN RETURN NULL; END IF;
 SELECT x.* INTO t FROM sophia.api_contribution_tasks x JOIN sophia.jobs j ON j.project_id=x.project_id AND j.id=x.job_id
  WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id;
 IF NOT FOUND THEN
  -- 0100: a contributed lineage without its binding (a rebuild before 0100) is never delivered as project work.
  IF EXISTS(SELECT 1 FROM sophia.jobs j WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id
     AND sophia.contribution_lineage_unbound(j.project_id,j.id)) THEN
   RETURN 'its contributed lineage has no funding binding'; END IF;
  RETURN NULL;
 END IF;
 -- WRITE-004: a rebuilt task's slot is decided here. Under the project lock dispatch holds, a writable transaction takes
 -- its grant, connection and account rows in admission's order; every check below reads after that wait. A read-only
 -- transaction (a read) only reads.
 rebuilt:=sophia.contribution_rebuilt(t.project_id,t.job_id);
 IF rebuilt AND current_setting('transaction_read_only')='off' THEN
  PERFORM 1 FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
  PERFORM 1 FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
  PERFORM 1 FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 END IF;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id;
 why:=sophia.contribution_grant_unusable(gr);
 IF why IS NOT NULL THEN RETURN 'its contribution is unusable: '||why; END IF;
 IF gr.revision<>t.grant_revision THEN RETURN 'its contribution grant changed since it was admitted'; END IF;
 IF NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN RETURN 'its requester can no longer use this contribution'; END IF;
 IF NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN RETURN 'the contribution owner is no longer a project member'; END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id;
 IF conn.state<>'connected' OR conn.credential_revision<>t.credential_revision THEN
  RETURN 'its contribution''s credential is no longer the one it was admitted with'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=t.project_id AND x.resource_id=t.resource_id AND x.state='current') THEN
  RETURN 'its contribution runtime was rotated'; END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN RETURN 'its contribution is unusable: route_unqualified'; END IF;
 IF rebuilt THEN
  SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id;
  CASE sophia.contribution_rebuild_capacity(t,acc,gr)
   WHEN 'account' THEN RETURN 'its contribution''s account capacity is held by earlier work';
   WHEN 'grant' THEN RETURN 'its contribution''s grant capacity is held by earlier work';
   ELSE NULL;
  END CASE;
 END IF;
 RETURN NULL;
END $$;

-- contribution_model_reserve (0094), replaced: the same, an unbound contributed lineage reserves no paid call, and a
-- rebuilt task's new paid call needs its slot (WRITE-004).
CREATE OR REPLACE FUNCTION sophia.contribution_model_reserve(s sophia.research_scope, p_provider text, p_amount numeric) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text;
 used numeric;
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN
  -- 0100: no new paid call for a contributed lineage without its binding; nothing else would bound it.
  IF sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
  RETURN;
 END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 -- The requester's and owner's member rows, so a removal waits for this reservation's commit (or makes it fail).
 PERFORM 1 FROM sophia.project_members WHERE project_id=t.project_id AND actor_id IN (t.requester_id,t.owner_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF gr.revision<>t.grant_revision THEN PERFORM sophia.contribution_refuse('grant_revision_changed'); END IF;
 IF NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN PERFORM sophia.contribution_refuse('requester_ineligible'); END IF;
 IF NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN PERFORM sophia.contribution_refuse('owner_not_member'); END IF;
 IF p_provider IS DISTINCT FROM 'openai-research' THEN PERFORM sophia.contribution_refuse('provider_not_contributed'); END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
 IF conn.state<>'connected' OR conn.credential_revision<>t.credential_revision
    OR NOT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=t.project_id AND x.resource_id=t.resource_id AND x.state='current') THEN
  PERFORM sophia.contribution_refuse('credential_revision_changed'); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 -- WRITE-004: after the account row's wait, a rebuilt task's call needs its slot (current limits and counts).
 IF sophia.contribution_rebuilt(t.project_id,t.job_id) AND sophia.contribution_rebuild_capacity(t,acc,gr) IS NOT NULL THEN
  PERFORM sophia.contribution_refuse('account_busy'); END IF;
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
  WHERE r.project_id=s.project_id AND r.allowance_id=s.allowance_id AND x.grant_id=gr.id;
 IF used+p_amount>gr.task_cap_usd THEN PERFORM sophia.contribution_refuse('task_cap_reached'); END IF;
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.grant_id=gr.id;
 IF used+p_amount>gr.total_cap_usd THEN PERFORM sophia.contribution_refuse('grant_exhausted'); END IF;
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.account_id=acc.id;
 IF used+p_amount>acc.total_cap_usd THEN PERFORM sophia.contribution_refuse('account_exhausted'); END IF;
 -- r3: the time-bound authority is decided here, after the last wait (the account), at the wall clock, immediately
 -- before reserve_research writes the reservation (every row it locks is already held: no further wait).
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
END $$;

-- contribution_withhold (0094), replaced: the same, and an unbound contributed lineage is withheld.
CREATE OR REPLACE FUNCTION sophia.contribution_withhold(s sophia.research_scope, p_key text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; j sophia.jobs; why text;
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN
  -- 0100: a contributed lineage without its binding never publishes as project work.
  IF NOT sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN RETURN NULL; END IF;
  why:='its contributed lineage has no funding binding';
  PERFORM 1 FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
  UPDATE sophia.jobs SET state='failed', reason=left('withheld: '||why,2000), result_revision=result_revision+1
   WHERE project_id=s.project_id AND id=s.job_id RETURNING * INTO j;
  UPDATE sophia.research_tasks SET closed_by_call=p_key WHERE project_id=s.project_id AND job_id=s.job_id;
  UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
  PERFORM sophia.emit_service_event(s.project_id,'native_task.failed','job',j.id,j.result_revision+3,'native_task.denied');
  RETURN jsonb_build_object('taskId',j.id,'outcome','withheld','reason',why);
 END IF;
 -- Lock order: the project is already held (runtime_lease, at the start of every runtime research call), then the
 -- task, then its authority (members, grant).
 PERFORM 1 FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.project_members WHERE project_id=t.project_id AND actor_id IN (t.requester_id,t.owner_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 why:=CASE WHEN gr.state='revoked' THEN 'the contribution was revoked'
  WHEN gr.admin_disabled_at IS NOT NULL THEN 'the contribution was disabled for this project'
  WHEN NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN 'the requester can no longer use this contribution'
  WHEN NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN 'the contribution owner is no longer a project member'
  WHEN sophia.source_withdrawn(s.project_id,s.manifest_source_id) THEN 'a source it read was withdrawn'
  ELSE NULL END;
 IF why IS NULL THEN RETURN NULL; END IF;
 UPDATE sophia.jobs SET state='failed', reason=left('withheld: '||why,2000), result_revision=result_revision+1
  WHERE project_id=s.project_id AND id=s.job_id RETURNING * INTO j;
 UPDATE sophia.research_tasks SET closed_by_call=p_key WHERE project_id=s.project_id AND job_id=s.job_id;
 UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
 -- The existing 'denied' summary: publication was denied under current authority (the job's reason says withheld).
 PERFORM sophia.emit_service_event(s.project_id,'native_task.failed','job',j.id,j.result_revision+3,'native_task.denied');
 RETURN jsonb_build_object('taskId',j.id,'outcome','withheld','reason',why);
END $$;

-- research_task_funding (0094), replaced: the same, and an unbound contributed lineage is refused, not called project funded.
CREATE OR REPLACE FUNCTION sophia.research_task_funding(p_project uuid, p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; observed jsonb;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.research_tasks WHERE project_id=p_project AND job_id=p_job) THEN
  RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=p_project AND job_id=p_job;
 IF NOT FOUND THEN
  -- 0100: never report project funding for a contributed lineage that lost its binding.
  IF sophia.contribution_lineage_unbound(p_project,p_job) THEN PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
  RETURN jsonb_build_object('taskId',p_job,'funding','project','payers',jsonb_build_object('model','project','search','project','read','project'));
 END IF;
 SELECT CASE WHEN count(DISTINCT r.usage->>'model')=0 THEN '"unknown"'::jsonb
   ELSE to_jsonb(array_agg(DISTINCT r.usage->>'model') FILTER (WHERE r.usage->>'model' IS NOT NULL)) END INTO observed
  FROM sophia.api_contribution_reservations l JOIN sophia.research_reservations r ON r.project_id=l.project_id AND r.id=l.reservation_id
  WHERE l.project_id=p_project AND l.job_id=p_job AND r.state='settled';
 RETURN jsonb_build_object('taskId',p_job,'funding','contribution','ownerId',t.owner_id,'grantId',t.grant_id,
  'grantRevision',t.grant_revision,'credentialRevision',t.credential_revision,'requesterId',t.requester_id,
  'payers',jsonb_build_object('model','contributor_api_account','search','project','read','project'),
  'settings',jsonb_build_object('requested',jsonb_build_object('route',t.requested_route,'model',t.requested_model,'effort',t.requested_effort),
   'accepted','unknown','observedModels',coalesce(observed,'"unknown"'::jsonb),'observedEffort','unknown'));
END $$;

-- runtime_research_reserve (0094), replaced: the same, and an unbound contributed lineage reserves no new search or read.
CREATE OR REPLACE FUNCTION sophia.runtime_research_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 k text:=p_request->>'kind'; key text; ref text:=p_request->>'targetRef'; url text; q text:=p_request->>'query';
 purpose text:=coalesce(p_request->>'purpose','call'); amount numeric; a sophia.research_allowances; t sophia.research_tasks;
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
 -- Locks in the order the turn-end rules (0026) and revocation (0028) take them: the task, then the grant and the
 -- allowance (as reserve_research does). The phase is then read with the allowance it is judged against.
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN
  IF r.target_ref IS DISTINCT FROM ref OR r.query IS DISTINCT FROM q THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
 ELSE
  IF purpose='partial_result' THEN
   IF k IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
   -- The trusted transition: the finalize step begins only when an ordinary call of this size no longer fits.
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
 -- 0094: a new model call of a contributed task rechecks current authority and the owner's caps first.
 IF r.id IS NULL AND k='model' THEN PERFORM sophia.contribution_model_reserve(s,p_request->>'provider',amount); END IF;
 -- 0100: an unbound contributed lineage reserves no new paid search or read either (its model calls are refused by
 -- contribution_model_reserve). Checked under the locks above, before anything is reserved; a replay is not new.
 IF r.id IS NULL AND k<>'model' AND sophia.contribution_lineage_unbound(s.project_id,s.job_id) THEN
  PERFORM sophia.contribution_refuse('lineage_unbound'); END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,k,p_request->>'provider',amount,purpose);
 PERFORM sophia.contribution_link_reservation(s,r);
 IF r.target_ref IS NULL AND r.query IS NULL AND (ref IS NOT NULL OR q IS NOT NULL) THEN
  UPDATE sophia.research_reservations SET target_ref=ref, target_url=url, query=q WHERE project_id=s.project_id AND id=r.id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,
  'target',CASE WHEN r.target_ref IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('ref',r.target_ref,'url',r.target_url) END);
END $$;

COMMIT;
