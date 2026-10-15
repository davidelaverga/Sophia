-- An admin renames a project (docs/plans/project-rename.md): a typo in a title no longer stays for good. Idempotent per
-- actor and key as create_project is (0006, 0047): the same key with the same title answers the same receipt, with
-- another title it is a conflict. A title is 1–180 characters and not spaces alone. The project's row is held, its
-- title_revision bumped, and project.renamed emitted, so every member's feed reads the new title. 0001–0050 are not
-- edited.
BEGIN;

ALTER TABLE sophia.projects ADD COLUMN title_revision bigint NOT NULL DEFAULT 1 CHECK(title_revision>0);

CREATE TABLE sophia.project_renames (
 actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 project_id uuid NOT NULL REFERENCES sophia.projects(id), semantic_request jsonb NOT NULL, receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE sophia.project_renames ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.rename_project(p_project uuid, p_title text, p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); semantic jsonb; prior sophia.project_renames; revision_value bigint; cursor_value bigint;
 receipt_value jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid title' USING ERRCODE='22023'; END IF;
 -- Held first: the rename and its event are one step in the project's sequence.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only an admin can rename the project' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('projectId',p_project,'title',p_title);
 INSERT INTO sophia.project_renames(actor_id,idempotency_key,project_id,semantic_request) VALUES(a,p_key,p_project,semantic)
  ON CONFLICT (actor_id,idempotency_key) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO prior FROM sophia.project_renames WHERE actor_id=a AND idempotency_key=p_key;
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF btrim(p_title)='' THEN RAISE EXCEPTION 'A project needs a title' USING ERRCODE='22023'; END IF;
 UPDATE sophia.projects SET title=p_title, title_revision=title_revision+1 WHERE id=p_project
  RETURNING title_revision INTO revision_value;
 cursor_value:=sophia.emit_project_event(p_project,'project.renamed','project',p_project,revision_value,'project.renamed');
 receipt_value:=jsonb_build_object('projectId',p_project,'title',p_title,'cursor',cursor_value::text);
 UPDATE sophia.project_renames SET receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.rename_project(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.rename_project(uuid,text,text) TO sophia_api;

COMMIT;
