-- SMC-M03 CX-0007 fixes (M03-RF-0013..0015): what research drew on is the whole closure, and a lineage never forks.
-- * RF-0013. A withdrawal reached only a task's direct inputs and the id of the version it amends, so an amendment
--   kept reading a report that quoted a withdrawn input. The sources a piece of work drew on are now a closure
--   (source_closure): a source's dependencies, a research manifest's base, and for a draft the manifest of the task
--   that wrote it (whose inputs, question and base it may quote), each followed transitively. A source is withdrawn
--   from research (source_withdrawn) when anything in its closure is no longer an eligible, ready project source.
--   Revocation, the Resume, steer and input refusals, and a create's dispatch all use the closure.
-- * RF-0014. A rebuild kept the old base and its derived inputs whatever they drew on, and a task could read and cite
--   its base without any eligibility check. A rebuild now drops an input or a base that is withdrawn (it still writes
--   into the same report: the artifact lineage is kept, the withdrawn text is not), and research_readable requires
--   every source a task reads or cites to be withdrawn from nothing.
-- * RF-0013, after publication. A new amendment of a report that draws on a withdrawn source, or with an input that
--   does, is refused at admission; a fresh request is the way on. A "Try PDF again" of such a version is refused too.
-- * RF-0015. The latest-lineage check compared timestamps, and rebuilds in one transaction share one. A research task
--   now has an explicit successor (an amendment of it, or the task rebuilt from it): an amendment of a task that has
--   one is stale, whatever the clocks say.
-- Published versions are records of what was published and stay readable; what a withdrawal means for them is
-- outside these fixes. 0001–0032 are not edited; attempt_consumed_sources, native_delivery_ineligible,
-- research_rebuild, research_readable and research_rendition_target are replaced with the same signatures.
BEGIN;

-- --- the closure ---------------------------------------------------------------------------------------------------

-- Every source the roots drew on, the roots included: dependencies, a research manifest's base, and a draft's task
-- manifest, transitively (a cycle ends where a source repeats).
CREATE FUNCTION sophia.source_closure(p_project uuid, p_roots uuid[]) RETURNS SETOF uuid LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 WITH RECURSIVE c(id) AS (
  SELECT x FROM unnest(p_roots) x WHERE x IS NOT NULL
  UNION
  SELECT e.next FROM c CROSS JOIN LATERAL (
   SELECT d.source_id AS next FROM sophia.source_dependencies d WHERE d.project_id=p_project AND d.derived_source_id=c.id
   UNION ALL
   SELECT (t.body::jsonb->'base'->>'sourceId')::uuid FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.input_source_id=c.id AND j.kind='research' AND t.body::jsonb->'base'->>'sourceId' IS NOT NULL
   UNION ALL
   SELECT j.input_source_id FROM sophia.research_drafts rd
    JOIN sophia.jobs j ON j.project_id=rd.project_id AND j.attempt_id=rd.attempt_id AND j.kind='research' AND j.parent_job_id IS NULL
    WHERE rd.project_id=p_project AND rd.source_id=c.id) e
  WHERE e.next IS NOT NULL)
 SELECT id FROM c $$;
REVOKE ALL ON FUNCTION sophia.source_closure(uuid,uuid[]) FROM PUBLIC;

-- Whether research may no longer draw on this source: it, or anything it drew on, is not an eligible, ready project
-- source (forgotten, erased, or no longer released).
CREATE FUNCTION sophia.source_withdrawn(p_project uuid, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.source_closure(p_project,ARRAY[p_source]) x
  LEFT JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=x
  WHERE s.id IS NULL OR NOT (s.scope='project' AND s.eligible AND s.state='ready')) $$;
REVOKE ALL ON FUNCTION sophia.source_withdrawn(uuid,uuid) FROM PUBLIC;

-- attempt_consumed_sources (0028), replaced: the closure of the attempt's task manifest (its question, inputs and
-- base, and everything those drew on), not only its direct inputs and its base's id.
CREATE OR REPLACE FUNCTION sophia.attempt_consumed_sources(p_project uuid, p_attempt uuid) RETURNS SETOF uuid LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT x FROM sophia.jobs j CROSS JOIN LATERAL sophia.source_closure(p_project,ARRAY[j.input_source_id]) x
  WHERE j.project_id=p_project AND j.attempt_id=p_attempt AND j.parent_job_id IS NULL $$;

-- native_delivery_ineligible (0028), replaced: the same, and a create is refused when anything its task would read
-- was withdrawn (its inputs are still checked first, with their own reason).
CREATE OR REPLACE FUNCTION sophia.native_delivery_ineligible(o sophia.outbox, g sophia.goals, c sophia.commands, b sophia.execution_bindings, rt sophia.runtime_instances)
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
  WHEN o.destination='native.create' AND EXISTS(SELECT 1 FROM sophia.jobs j WHERE j.project_id=c.project_id AND j.command_id=c.id
    AND j.kind='research' AND sophia.source_withdrawn(j.project_id,j.input_source_id))
   THEN 'a source its work would read was withdrawn'
  WHEN o.destination IN ('native.resume','native.steer','native.input') AND (
    EXISTS(SELECT 1 FROM sophia.work_attempts wa WHERE wa.project_id=b.project_id AND wa.id=b.attempt_id AND wa.state='revoked')
    OR EXISTS(SELECT 1 FROM sophia.attempt_consumed_sources(b.project_id,b.attempt_id) x
     LEFT JOIN sophia.source_objects s ON s.project_id=b.project_id AND s.id=x
     WHERE s.id IS NULL OR NOT (s.eligible AND s.scope='project' AND s.state='ready')))
   THEN 'a source its work read was withdrawn'
  WHEN rt.id IS NULL THEN 'no active runtime for its executor resource and runtime unit'
  WHEN b.state IN ('settled','lost') THEN 'its native binding is '||b.state
  ELSE NULL END $$;

-- research_readable (0025), replaced: the same sources, and only while the source is withdrawn from nothing (it and
-- everything it drew on still eligible). A base or an input that drew on a withdrawn source is no longer read or
-- cited.
CREATE OR REPLACE FUNCTION sophia.research_readable(s sophia.research_scope, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT (p_source=s.manifest_source_id OR p_source=s.question_source_id
  OR EXISTS(SELECT 1 FROM sophia.source_dependencies d WHERE d.project_id=s.project_id AND d.derived_source_id=s.manifest_source_id
   AND d.source_id=p_source)
  OR EXISTS(SELECT 1 FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id
   AND t.body::jsonb->'base'->>'sourceId'=p_source::text)
  OR EXISTS(SELECT 1 FROM sophia.source_provenance p JOIN sophia.research_reservations r ON r.project_id=p.project_id AND r.id=p.reservation_id
   WHERE p.project_id=s.project_id AND p.source_id=p_source AND r.allowance_id=s.allowance_id)
  OR EXISTS(SELECT 1 FROM sophia.research_drafts d WHERE d.project_id=s.project_id AND d.attempt_id=s.attempt_id AND d.source_id=p_source))
  AND NOT sophia.source_withdrawn(s.project_id,p_source) $$;

-- --- rebuild and admission -----------------------------------------------------------------------------------------

-- research_rebuild (0028), replaced: the same, and an input or a base that is withdrawn (it, or anything it drew on)
-- is dropped. The rebuilt task still writes into the same report.
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

-- Every new research task, admitted or rebuilt: its lineage never forks, and it never starts from a base or an input
-- that is withdrawn. An amendment of a task that already has a successor (another amendment of it, or the task rebuilt
-- from it) is stale, whatever the clocks say; rebuilds in one transaction share a timestamp, so the order is explicit.
CREATE FUNCTION sophia.research_task_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE m jsonb;
BEGIN
 IF NEW.amends_job_id IS NOT NULL AND NEW.rebuilt_from_job_id IS NULL AND EXISTS(SELECT 1 FROM sophia.research_tasks x
   WHERE x.project_id=NEW.project_id AND x.job_id<>NEW.job_id
    AND (x.amends_job_id=NEW.amends_job_id OR x.rebuilt_from_job_id=NEW.amends_job_id)) THEN
  RAISE EXCEPTION 'Stale research task: a later task continues this lineage' USING ERRCODE='40001'; END IF;
 SELECT t.body::jsonb INTO m FROM sophia.jobs j JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
  WHERE j.project_id=NEW.project_id AND j.id=NEW.job_id;
 IF m->'base'->>'sourceId' IS NOT NULL AND sophia.source_withdrawn(NEW.project_id,(m->'base'->>'sourceId')::uuid) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: the report it amends draws on a withdrawn source' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(m->'inputs','[]')) i WHERE sophia.source_withdrawn(NEW.project_id,(i->>'sourceId')::uuid)) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: an input draws on a withdrawn source' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.research_task_guard() FROM PUBLIC;
CREATE TRIGGER research_tasks_guard BEFORE INSERT ON sophia.research_tasks FOR EACH ROW EXECUTE FUNCTION sophia.research_task_guard();

-- --- Try PDF again -------------------------------------------------------------------------------------------------

-- research_rendition_target (0032), replaced: the same, and a version that draws on a withdrawn source is not printed
-- again.
CREATE OR REPLACE FUNCTION sophia.research_rendition_target(p_project uuid, p_task uuid, OUT t sophia.research_tasks,
 OUT v sophia.artifact_versions, OUT g sophia.goals) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs; a sophia.artifacts; outputs jsonb;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=p_task AND kind='research' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=p_project AND job_id=j.id;
 SELECT x.body::jsonb->'outputs' INTO outputs FROM sophia.source_texts x WHERE x.project_id=p_project AND x.source_id=j.input_source_id;
 IF NOT coalesce(outputs ? 'pdf',false) THEN RAISE EXCEPTION 'This research task does not produce a PDF' USING ERRCODE='22023'; END IF;
 IF j.state<>'succeeded' THEN RAISE EXCEPTION 'This research has published no report to print' USING ERRCODE='22023'; END IF;
 IF t.pdf_state IS DISTINCT FROM 'not_produced' THEN RAISE EXCEPTION 'This report already has its PDF' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=p_project AND job_id=j.id ORDER BY version_number DESC LIMIT 1;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=p_project AND id=v.artifact_id FOR UPDATE;
 IF a.stable_version_id IS DISTINCT FROM v.id THEN
  RAISE EXCEPTION 'Stale report version: a newer version of this report exists' USING ERRCODE='40001'; END IF;
 IF sophia.source_withdrawn(p_project,v.source_id) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: this report draws on a withdrawn source' USING ERRCODE='42501'; END IF;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=p_project AND wa.id=j.attempt_id FOR UPDATE OF g2;
 IF g.status IN ('holding','held') THEN RAISE EXCEPTION 'The research is held: resume it first' USING ERRCODE='40001'; END IF;
 IF g.status IN ('stopping','stopped') THEN RAISE EXCEPTION 'The research was stopped' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs rj ON rj.project_id=r.project_id AND rj.id=r.job_id
   WHERE r.project_id=p_project AND r.parent_job_id=j.id AND r.kind='rendition' AND rj.state IN ('pending','running')) THEN
  RAISE EXCEPTION 'A PDF of this report is already being rendered' USING ERRCODE='40001'; END IF;
 IF g.status<>'completed' THEN RAISE EXCEPTION 'Research on this report is under way' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM sophia.render_jobs r WHERE r.project_id=p_project AND r.base_version_id=v.id)>=3 THEN
  RAISE EXCEPTION 'Research render limit reached' USING ERRCODE='55000'; END IF;
 IF NOT sophia.pdf_renderer_ready() THEN RAISE EXCEPTION 'No PDF renderer is running' USING ERRCODE='55000'; END IF;
END $$;

COMMIT;
