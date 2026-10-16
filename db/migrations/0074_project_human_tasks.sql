-- A project's human tasks (docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md, A39; #365 section 3, FND-C5-HUMAN-TASKS-01):
-- something a person does, for a member or for nobody yet, until it is done. Davide's D-TASKS policy:
-- * Editors and admins create tasks, claim them, assign or reassign them to an active member of any role, release them,
--   and mark any open task done. A viewer reads them and marks done only a task explicitly assigned to them. Nobody
--   outside the project, removed from it, or a guest, does anything.
-- * A task's own revision is compared and set (0054's goal targets): a moved revision is 409 and changes nothing.
--   Creating and finishing are idempotent per actor and key (0006); a key reused for another request is 409.
-- * Done is terminal, and changes only the task: no goal, decision, agent work, allowance, spend or outbox. Nothing here
--   touches work_* (agent work, 0042), which a person's task is not.
-- * Its origin is a LINK ONLY: the published version of a report of this project, and a place in it (block, word,
--   count, as passage-link.ts names it). No words, hash or title of the source are kept, here or in a request, receipt
--   or event, so erasing a source (mission_erase_source, 0041) leaves nothing of it behind. At creation the version
--   must be published (stable or superseded) and its source ready and readable by the person creating the task, under
--   the source rule (0002): their own, or the project's released and eligible. Every read decides again, for its own
--   reader (packages/persistence/src/human-tasks.ts); a private source is never released for a task.
-- * Each act emits one project event with a fixed type and summary (project.task_created, project.task_owner_set,
--   project.task_done), the actor from the session, the task's id and revision; no title or origin. 0057/0061's
--   activity lists 'project.%'. The commit's notification may wake a dispatcher's poll, as every event's does; nothing
--   reads these events as work.
-- 0001–0072 are not edited.
BEGIN;

CREATE TABLE sophia.project_tasks (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 500 AND btrim(title)<>''),
 owner_id uuid,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','done')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 done_by uuid, done_at timestamptz,
 -- The origin, a link only: a version of a report of this project and a place in it.
 origin_artifact_id uuid, origin_version_id uuid,
 origin_block integer CHECK(origin_block BETWEEN 0 AND 9999),
 origin_word integer CHECK(origin_word BETWEEN 0 AND 99999),
 origin_count integer CHECK(origin_count BETWEEN 1 AND 60),
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,origin_artifact_id,origin_version_id) REFERENCES sophia.artifact_versions(project_id,artifact_id,id),
 CHECK((state='done')=(done_by IS NOT NULL AND done_at IS NOT NULL)),
 CHECK(num_nulls(origin_artifact_id,origin_version_id,origin_block,origin_word,origin_count) IN (0,5))
);
CREATE INDEX project_tasks_listed ON sophia.project_tasks(project_id,(state='done'),created_at DESC,id DESC);
CREATE INDEX project_tasks_by_origin ON sophia.project_tasks(project_id,origin_artifact_id) WHERE origin_artifact_id IS NOT NULL;
ALTER TABLE sophia.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.project_tasks FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
REVOKE ALL ON sophia.project_tasks FROM PUBLIC;
GRANT SELECT ON sophia.project_tasks TO sophia_api;

-- Creating and finishing, once per actor and key: the request as understood (ids, numbers and the task's own text,
-- never a source's) and what it answered.
CREATE TABLE sophia.project_task_requests (
 actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 kind text NOT NULL CHECK(kind IN ('create','done')),
 semantic_request jsonb NOT NULL, task_id uuid, receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE sophia.project_task_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.project_task_requests FROM PUBLIC;

-- Who may act on the project's tasks at all: an active member (removed members and guests are not).
CREATE FUNCTION sophia.task_actor(p_project uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Not a member of the project' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;

-- The key claimed for this request, or what it answered before: null when it is new; the same key for another request
-- is a conflict.
CREATE FUNCTION sophia.task_request(p_actor uuid, p_key text, p_project uuid, p_kind text, p_semantic jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.project_task_requests;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.project_task_requests(actor_id,idempotency_key,project_id,kind,semantic_request)
 VALUES(p_actor,p_key,p_project,p_kind,p_semantic) ON CONFLICT (actor_id,idempotency_key) DO NOTHING;
 IF FOUND THEN RETURN NULL; END IF;
 SELECT * INTO prior FROM sophia.project_task_requests WHERE actor_id=p_actor AND idempotency_key=p_key;
 IF prior.project_id<>p_project OR prior.kind<>p_kind OR prior.semantic_request<>p_semantic THEN
  RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 RETURN prior.receipt;
END $$;

-- The owner a task may have: an active member of the project, of any role; or nobody.
CREATE FUNCTION sophia.task_owner_ok(p_project uuid, p_owner uuid) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT p_owner IS NULL OR EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_owner AND active) $$;

-- createProjectTask (A39): an editor or an admin; the origin, if any, a published version of a report of this project
-- whose source this person may read now. Answers {taskId, revision, cursor}; the API reads the task back for its reader.
CREATE FUNCTION sophia.create_project_task(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid; title_value text:=p_request->>'title'; owner_value uuid; o jsonb:=p_request->'origin'; semantic jsonb;
 prior jsonb; task uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb;
BEGIN
 a:=sophia.task_actor(p_project);
 -- Held first: the task and its event are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
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

-- setTaskOwner (A39): an editor or an admin claims (themself), assigns or reassigns (an active member) or releases
-- (null) an open task, compared and set on its revision. The same owner changes nothing and emits nothing.
CREATE FUNCTION sophia.set_project_task_owner(p_project uuid, p_task uuid, p_owner uuid, p_expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid; t sophia.project_tasks; cursor_value bigint;
BEGIN
 a:=sophia.task_actor(p_project);
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
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

-- finishProjectTask (A39): an editor or an admin, any open task; a viewer, only one explicitly theirs. Compared and set
-- on its revision, once per key: the same key answers what it answered. Done changes the task only.
CREATE FUNCTION sophia.finish_project_task(p_project uuid, p_task uuid, p_key text, p_expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid; t sophia.project_tasks; prior jsonb; cursor_value bigint; receipt_value jsonb;
BEGIN
 a:=sophia.task_actor(p_project);
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
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

REVOKE ALL ON FUNCTION sophia.task_actor(uuid), sophia.task_request(uuid,text,uuid,text,jsonb),
 sophia.task_owner_ok(uuid,uuid), sophia.create_project_task(uuid,text,jsonb),
 sophia.set_project_task_owner(uuid,uuid,uuid,bigint), sophia.finish_project_task(uuid,uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.create_project_task(uuid,text,jsonb), sophia.set_project_task_owner(uuid,uuid,uuid,bigint),
 sophia.finish_project_task(uuid,uuid,text,bigint) TO sophia_api;

COMMIT;
