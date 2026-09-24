-- S1-02: createProject requires an Idempotency-Key (api/openapi.json) but the pack's
-- sophia.create_project(text) has none, so a retry after a lost reply would create a second
-- project. Command keys are project-scoped and cannot serve creation, so creations get their own
-- per-actor key register. The non-idempotent function stays (migrations are forward-only) but is
-- no longer callable by the API role.
BEGIN;
CREATE TABLE sophia.project_creations (
 actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 semantic_request jsonb NOT NULL,
 project_id uuid REFERENCES sophia.projects(id),
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id, idempotency_key)
);
-- No policy and no grant: only the definer function below reads or writes it.
ALTER TABLE sophia.project_creations ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION sophia.create_project(p_title text, p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p uuid:=gen_random_uuid(); semantic jsonb; prior sophia.project_creations; receipt_value jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid title' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('title',p_title);
 -- Claim the key. A concurrent duplicate blocks on the primary key until the first transaction
 -- ends: after a commit it finds the receipt, after a rollback it claims the key itself.
 INSERT INTO sophia.project_creations(actor_id,idempotency_key,semantic_request) VALUES(a,p_key,semantic)
  ON CONFLICT (actor_id,idempotency_key) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO prior FROM sophia.project_creations WHERE actor_id=a AND idempotency_key=p_key;
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 INSERT INTO sophia.projects(id,title,created_by) VALUES(p,p_title,a);
 INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES(p,a,'admin');
 INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by) VALUES(p,1,'{}',a);
 receipt_value:=jsonb_build_object('projectId',p,'cursor','0');
 UPDATE sophia.project_creations SET project_id=p, receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;

REVOKE ALL ON FUNCTION sophia.create_project(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.create_project(text,text) TO sophia_api;
REVOKE EXECUTE ON FUNCTION sophia.create_project(text) FROM sophia_api;
COMMIT;
