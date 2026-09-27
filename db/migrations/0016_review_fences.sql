-- S1-05A (Codex review of aba31d5): four fixes to functions of 0012 and 0014, which are applied and cannot change.
-- * A native result is captured only if the turn ran under the goal's current authority. The turn's authority is the
--   epoch of the command last settled in the session before its message (the runtime reports where each command
--   settled). A turn from before a Hold or Stop that is replayed or delayed past a Resume stays withheld. A completed
--   turn that arrives before its command's receipt is judged when that receipt is recorded.
-- * The runtime command poll reads the queue only under the instance row's lock, as the lease holder: a bridge that a
--   concurrent hello superseded gets the superseded refusal, never the commands.
-- * The draft_brief manifest carries only accepted decisions whose source is released, eligible project material, and
--   each one is recorded as a dependency, so a later block or deletion denies the queued delivery.
-- * A removal keeps watch for 630 s after the decision: the same padded token lifetime 0015's fence uses (the token's
--   600 s, plus the step to its mint and clock differences).
-- 0001–0015 are not edited; the functions below are replaced with the same signatures, and one is new.
BEGIN;

-- Judge every completed turn of a binding in order, as capture_native_result would when it arrived; the first that
-- may publish is captured, and a job already captured returns at once.
CREATE FUNCTION sophia.capture_completed_turns(p_project uuid, p_binding uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.native_observations;
BEGIN
 FOR t IN SELECT * FROM sophia.native_observations WHERE project_id=p_project AND binding_id=p_binding AND type='turn/end'
   AND data->'reason'->>'kind'='completed' ORDER BY native_seq LOOP
  PERFORM sophia.capture_native_result(p_project,p_binding,t.native_seq,'completed');
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION sophia.capture_completed_turns(uuid,uuid) FROM PUBLIC;

-- capture_native_result (0012), replaced: the same, and the turn must have run under the goal's current authority.
CREATE OR REPLACE FUNCTION sophia.capture_native_result(p_project uuid, p_binding uuid, p_turn_end_seq bigint, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE b sophia.execution_bindings; g sophia.goals; j sophia.jobs; msg sophia.native_observations; c sophia.commands; src sophia.source_objects;
 owner sophia.runtime_commands;
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
 -- The authority the turn ran under: the command (inspect aside, which reads only) last settled in the session before
 -- its message. Only a turn under the goal's current epoch, begun by a command that grants it, may publish; one from
 -- before a Hold or Stop, replayed or delayed past a Resume, stays withheld. No settled command yet (its receipt still
 -- on its way): nothing is decided, and the receipt tries again when it is recorded.
 SELECT rc.* INTO owner FROM sophia.runtime_commands rc
  JOIN sophia.runtime_receipts r ON r.project_id=rc.project_id AND r.runtime_command_id=rc.id
  WHERE rc.project_id=p_project AND rc.binding_id=p_binding AND rc.kind<>'inspect'
   AND r.stage IN ('delivered','incorporation_observed','checked','outcome_unknown')
   AND coalesce(r.native_sequence,0)<msg.native_seq
  ORDER BY coalesce(r.native_sequence,0) DESC, rc.seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 IF owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
  UPDATE sophia.jobs SET reason='a result from an earlier authority (before a Hold or Stop) arrived; it was withheld, not published'
   WHERE project_id=p_project AND id=j.id;
  RETURN;
 END IF;
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

-- runtime_record_receipts (0012), replaced: the same, and a receipt of a command that grants authority judges the
-- completed turns that arrived before it.
CREATE OR REPLACE FUNCTION sophia.runtime_record_receipts(p_token_sha256 bytea, p_unit text, p_bridge text, p_receipts jsonb) RETURNS integer
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
  IF inserted THEN
   PERFORM sophia.apply_runtime_receipt(rc,r->>'stage',r->>'reason'); n:=n+1;
   -- A command that grants authority has settled: a completed turn that arrived before this receipt is judged now.
   IF rc.kind IN ('create','resume','steer','input') AND r->>'stage' IN ('delivered','incorporation_observed') THEN
    PERFORM sophia.capture_completed_turns(rc.project_id,rc.binding_id);
   END IF;
  END IF;
  inserted:=false;
 END LOOP;
 RETURN n;
END $$;

-- runtime_poll (0012), replaced: the same, under the instance row's lock.
CREATE OR REPLACE FUNCTION sophia.runtime_poll(p_token_sha256 bytea, p_unit text, p_bridge text, p_after bigint, p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_authenticate(p_token_sha256,p_unit); batch jsonb; last_seq bigint;
BEGIN
 -- Under the instance row's lock: a hello that supersedes this bridge either committed first (and is seen here) or
 -- waits until this poll is done, so a superseded bridge never reads the queue.
 SELECT * INTO rt FROM sophia.runtime_instances WHERE id=rt.id FOR UPDATE;
 IF rt.bridge_instance_id IS DISTINCT FROM p_bridge THEN RAISE EXCEPTION 'Runtime lease superseded; say hello again' USING ERRCODE='40001'; END IF;
 IF p_after IS NULL OR p_after<0 OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid poll bounds' USING ERRCODE='22023'; END IF;
 UPDATE sophia.runtime_instances SET seen_at=now() WHERE id=rt.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('seq',q.seq,'command',q.body) ORDER BY q.seq),'[]'), max(q.seq) INTO batch, last_seq
  FROM (SELECT seq, body FROM sophia.runtime_commands WHERE runtime_id=rt.id AND seq>p_after ORDER BY seq LIMIT p_limit) q;
 RETURN jsonb_build_object('commands',batch,'cursor',greatest(p_after,coalesce(last_seq,p_after)),'runtimeId',rt.id);
END $$;

-- compile_brief_manifest (0012), replaced: accepted decisions only from released, eligible project sources.
CREATE OR REPLACE FUNCTION sophia.compile_brief_manifest(p_project uuid, p_instruction sophia.source_objects, p_instruction_text text, p_inputs uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; frame jsonb; decisions jsonb; inputs jsonb; unknown text[]:='{}';
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT r.frame INTO frame FROM sophia.project_revisions r WHERE r.project_id=p_project AND r.revision=pr.mission_revision;
 IF frame IS NULL OR frame='{}'::jsonb THEN frame:=NULL; unknown:=array_append(unknown,'mission'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'sourceId',d.body_source_id,'text',t.body) ORDER BY d.id),'[]')
  INTO decisions FROM sophia.decisions d
  JOIN sophia.source_objects s ON s.project_id=d.project_id AND s.id=d.body_source_id
  JOIN sophia.source_texts t ON t.project_id=d.project_id AND t.source_id=d.body_source_id
  WHERE d.project_id=p_project AND d.state='accepted' AND s.scope='project' AND s.eligible AND s.state='ready';
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

-- admit_native_task (0012), replaced: the same, and the manifest's accepted decisions are dependencies too.
CREATE OR REPLACE FUNCTION sophia.admit_native_task(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
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
 -- Each accepted decision the manifest carries is a dependency too: if its source is blocked or deleted before
 -- dispatch, the delivery is denied as for any other input.
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,(d->>'sourceId')::uuid,ctx.id FROM jsonb_array_elements(manifest->'facts'->'acceptedDecisions') AS d
  ON CONFLICT DO NOTHING;
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

-- decide_lobby_entry (0014), replaced: the same, and a removal keeps watch for 630 s.
CREATE OR REPLACE FUNCTION sophia.decide_lobby_entry(p_entry uuid, p_decision text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid; e sophia.room_lobby; prior text; next_status text;
BEGIN
 SELECT project_id INTO p FROM sophia.room_lobby WHERE id=p_entry;
 IF p IS NULL OR NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 next_status:=CASE p_decision WHEN 'admit' THEN 'admitted' WHEN 'deny' THEN 'denied' WHEN 'block' THEN 'blocked'
  WHEN 'unblock' THEN 'left' END;
 IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry FOR UPDATE;
 prior:=e.status;
 IF e.status=next_status THEN RETURN sophia.lobby_entry_json(e); END IF;
 IF p_decision='unblock' AND e.status<>'blocked' THEN RETURN sophia.lobby_entry_json(e); END IF;
 IF e.status='blocked' AND p_decision<>'unblock' THEN
  RAISE EXCEPTION 'Blocked: unblock them first' USING ERRCODE='40001';
 END IF;
 UPDATE sophia.room_lobby SET status=next_status, decided_by=sophia.actor_id(), decided_at=now(), revision=revision+1
  WHERE id=p_entry RETURNING * INTO e;
 IF next_status='admitted' THEN
  UPDATE sophia.room_removals SET state='cancelled', lease_owner=NULL, lease_until=NULL
   WHERE lobby_entry_id=e.id AND state<>'cancelled' AND (state='pending' OR guard_until>now());
 ELSIF next_status IN ('denied','blocked') AND prior IN ('admitted','denied') THEN
  -- Let in (or declined after being let in, with a removal still open): they may hold a token and be in the call.
  INSERT INTO sophia.room_removals(project_id,room_id,lobby_entry_id,identity,reason,guard_until)
  SELECT e.project_id,e.room_id,e.id,e.actor_id::text,next_status,now()+interval '630 seconds'
   WHERE prior='admitted' OR EXISTS(SELECT 1 FROM sophia.room_removals r WHERE r.lobby_entry_id=e.id
    AND r.state<>'cancelled' AND r.settled_at IS NULL)
  ON CONFLICT (lobby_entry_id) WHERE state<>'cancelled' AND settled_at IS NULL
  DO UPDATE SET reason=EXCLUDED.reason, guard_until=greatest(sophia.room_removals.guard_until,EXCLUDED.guard_until);
 END IF;
 PERFORM sophia.emit_project_event(p,'room.lobby_changed','room_lobby',e.id,e.revision,
  CASE next_status WHEN 'admitted' THEN 'room.lobby_admit' WHEN 'denied' THEN 'room.lobby_deny'
   WHEN 'blocked' THEN 'room.lobby_block' ELSE 'room.lobby_unblock' END);
 RETURN sophia.lobby_entry_json(e);
END $$;

COMMIT;
