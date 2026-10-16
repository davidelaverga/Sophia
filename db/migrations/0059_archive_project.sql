-- An admin archives a project, or brings it back (docs/plans/archive-project.md, A30): a finished project leaves
-- everyone's list, stays readable and writable, and an admin can bring it back. Kept in the project's row
-- (archived_at, null while active); the snapshot, the mission and the runtime see nothing new. Idempotent per actor
-- and key as a rename is (0051): the same key with the same choice answers the same receipt, with the other choice it
-- is a conflict. A change emits project.archived or project.unarchived; asking for the state it has changes nothing
-- and emits nothing. 0001–0058 are not edited.
BEGIN;

ALTER TABLE sophia.projects ADD COLUMN archived_at timestamptz;

CREATE TABLE sophia.project_archives (
 actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 project_id uuid NOT NULL REFERENCES sophia.projects(id), semantic_request jsonb NOT NULL, receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE sophia.project_archives ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.set_project_archived(p_project uuid, p_archived boolean, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); semantic jsonb; prior sophia.project_archives; was timestamptz; cursor_value bigint;
 receipt_value jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_archived IS NULL THEN RAISE EXCEPTION 'Archived or not' USING ERRCODE='22023'; END IF;
 -- Held first: the change and its event are one step in the project's sequence.
 SELECT archived_at INTO was FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin can archive the project' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('projectId',p_project,'archived',p_archived);
 INSERT INTO sophia.project_archives(actor_id,idempotency_key,project_id,semantic_request) VALUES(a,p_key,p_project,semantic)
  ON CONFLICT (actor_id,idempotency_key) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO prior FROM sophia.project_archives WHERE actor_id=a AND idempotency_key=p_key;
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF (was IS NOT NULL) = p_archived THEN
  cursor_value:=(SELECT event_sequence FROM sophia.projects WHERE id=p_project);
 ELSE
  UPDATE sophia.projects SET archived_at=CASE WHEN p_archived THEN now() END WHERE id=p_project;
  cursor_value:=sophia.emit_project_event(p_project, CASE WHEN p_archived THEN 'project.archived' ELSE 'project.unarchived' END,
   'project', p_project, (SELECT title_revision FROM sophia.projects WHERE id=p_project),
   CASE WHEN p_archived THEN 'project.archived' ELSE 'project.unarchived' END);
 END IF;
 receipt_value:=jsonb_build_object('projectId',p_project,'archived',p_archived,'cursor',cursor_value::text);
 UPDATE sophia.project_archives SET receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.set_project_archived(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.set_project_archived(uuid,boolean,text) TO sophia_api;

COMMIT;
