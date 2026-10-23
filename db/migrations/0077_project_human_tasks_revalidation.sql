-- 0077 Task revalidation (FND-C50). Source only, not applied.
-- 1. Each Task write takes the project lock FIRST, then reads the current actor: a member removed (or who left) while
--    the write waited for the lock is no longer an actor. The published 0074 checked membership before waiting, so an
--    assigned viewer's Done could commit after their removal. can_edit, the owner rule, CAS, once-per-key and events
--    are unchanged.
-- 2. A new task's origin must be a version of a MARKDOWN report; other formats are refused. Stored origins are kept;
--    the reader shows a non-Markdown one unavailable.
-- The published 0074 is not edited; these three functions are replaced whole (same signatures, owner and grants), each
-- its 0074 body with only the lines named above moved or added.

BEGIN;

CREATE OR REPLACE FUNCTION sophia.create_project_task(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid; title_value text:=p_request->>'title'; owner_value uuid; o jsonb:=p_request->'origin'; semantic jsonb;
 prior jsonb; task uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb;
BEGIN
 -- Held first: the task and its event are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 -- Locked first, then the current actor (0077): a membership revoked while this waited for the lock is seen.
 a:=sophia.task_actor(p_project);
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Only editors and admins create tasks' USING ERRCODE='42501'; END IF;
 IF title_value IS NULL OR char_length(title_value) NOT BETWEEN 1 AND 500 OR btrim(title_value)='' THEN
  RAISE EXCEPTION 'A task needs words, at most 500 characters' USING ERRCODE='22023'; END IF;
 owner_value:=nullif(p_request->>'ownerId','')::uuid;
 IF o IS NOT NULL AND jsonb_typeof(o)<>'null' THEN
  o:=jsonb_build_object('artifactId',(o->>'artifactId')::uuid,'versionId',(o->>'versionId')::uuid,
   'block',(o->>'block')::integer,'word',(o->>'word')::integer,'count',(o->>'count')::integer);
 ELSE o:=NULL; END IF;
 -- The request as understood, then the key: a retry answers what its first request did (the API reads the task back,
 -- so an origin since made unreadable or erased reads as unavailable), before anything is checked again.
 semantic:=jsonb_build_object('title',title_value,'ownerId',owner_value,'origin',o);
 prior:=sophia.task_request(a,p_key,p_project,'create',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF NOT sophia.task_owner_ok(p_project,owner_value) THEN RAISE EXCEPTION 'The owner must be a member of the project' USING ERRCODE='22023'; END IF;
 IF o IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.artifact_versions v
    JOIN sophia.artifacts r ON r.project_id=v.project_id AND r.id=v.artifact_id AND r.format='markdown'
    JOIN sophia.source_objects s ON s.project_id=v.project_id AND s.id=v.source_id
   WHERE v.project_id=p_project AND v.artifact_id=(o->>'artifactId')::uuid AND v.id=(o->>'versionId')::uuid
     AND v.state IN ('stable','superseded') AND s.state='ready'
     AND (s.owner_id=a OR (s.scope='project' AND s.eligible))) THEN
  RAISE EXCEPTION 'The passage can''t be linked' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.project_tasks(project_id,id,title,owner_id,created_by,origin_artifact_id,origin_version_id,
  origin_block,origin_word,origin_count)
 VALUES(p_project,task,title_value,owner_value,a,(o->>'artifactId')::uuid,(o->>'versionId')::uuid,
  (o->>'block')::integer,(o->>'word')::integer,(o->>'count')::integer);
 cursor_value:=sophia.emit_project_event(p_project,'project.task_created','project_task',task,1,'task.created');
 receipt_value:=jsonb_build_object('taskId',task,'revision',1,'cursor',cursor_value::text);
 UPDATE sophia.project_task_requests SET task_id=task, receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION sophia.set_project_task_owner(p_project uuid, p_task uuid, p_owner uuid, p_expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid; t sophia.project_tasks; cursor_value bigint;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 -- Locked first, then the current actor (0077): a membership revoked while this waited for the lock is seen.
 a:=sophia.task_actor(p_project);
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Only editors and admins assign tasks' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM sophia.project_tasks WHERE project_id=p_project AND id=p_task FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task not found' USING ERRCODE='22023'; END IF;
 IF t.revision<>p_expected THEN RAISE EXCEPTION 'Stale task revision' USING ERRCODE='40001'; END IF;
 IF t.state='done' THEN RAISE EXCEPTION 'The task is done' USING ERRCODE='40001'; END IF;
 IF NOT sophia.task_owner_ok(p_project,p_owner) THEN RAISE EXCEPTION 'The owner must be a member of the project' USING ERRCODE='22023'; END IF;
 IF t.owner_id IS NOT DISTINCT FROM p_owner THEN
  RETURN jsonb_build_object('taskId',p_task,'revision',t.revision,'cursor',(SELECT event_sequence FROM sophia.projects WHERE id=p_project)::text);
 END IF;
 UPDATE sophia.project_tasks SET owner_id=p_owner, revision=revision+1 WHERE project_id=p_project AND id=p_task;
 cursor_value:=sophia.emit_project_event(p_project,'project.task_owner_set','project_task',p_task,t.revision+1,'task.owner_set');
 RETURN jsonb_build_object('taskId',p_task,'revision',t.revision+1,'cursor',cursor_value::text);
END $$;

CREATE OR REPLACE FUNCTION sophia.finish_project_task(p_project uuid, p_task uuid, p_key text, p_expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid; t sophia.project_tasks; prior jsonb; cursor_value bigint; receipt_value jsonb;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 -- Locked first, then the current actor (0077): a membership revoked while this waited for the lock is seen.
 a:=sophia.task_actor(p_project);
 SELECT * INTO t FROM sophia.project_tasks WHERE project_id=p_project AND id=p_task FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task not found' USING ERRCODE='22023'; END IF;
 -- NULL-safe: a task for nobody is no viewer's (owner_id=a would be NULL, and IF NOT NULL never raises).
 IF NOT (sophia.can_edit(p_project) OR t.owner_id IS NOT DISTINCT FROM a) THEN
  RAISE EXCEPTION 'Only its owner, an editor or an admin marks a task done' USING ERRCODE='42501'; END IF;
 prior:=sophia.task_request(a,p_key,p_project,'done',jsonb_build_object('taskId',p_task,'expectedRevision',p_expected));
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF t.revision<>p_expected THEN RAISE EXCEPTION 'Stale task revision' USING ERRCODE='40001'; END IF;
 IF t.state='done' THEN RAISE EXCEPTION 'The task is done' USING ERRCODE='40001'; END IF;
 UPDATE sophia.project_tasks SET state='done', done_by=a, done_at=now(), revision=revision+1 WHERE project_id=p_project AND id=p_task;
 cursor_value:=sophia.emit_project_event(p_project,'project.task_done','project_task',p_task,t.revision+1,'task.done');
 receipt_value:=jsonb_build_object('taskId',p_task,'revision',t.revision+1,'cursor',cursor_value::text);
 UPDATE sophia.project_task_requests SET task_id=p_task, receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;

COMMIT;
