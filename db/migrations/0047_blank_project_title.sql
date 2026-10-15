-- E2E-S2 (docs/plans/api-blank-title.md): a project's title of spaces alone is no title. Three spaces pass the
-- contract's length (1–180) and create_project's (0006). The refusal lives here, after the key's replay, so a retry of
-- a creation an earlier build admitted (a blank title, its receipt recorded under its key) still answers its stored
-- receipt, and only a new creation is refused (Codex P1 on #327). The body is 0006's, with that one check added.
-- 0001–0046 are not edited.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.create_project(p_title text, p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
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
 -- A new creation only: a replay above answered what was admitted then (the claim rolls back with the refusal).
 IF btrim(p_title)='' THEN RAISE EXCEPTION 'A project needs a title' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.projects(id,title,created_by) VALUES(p,p_title,a);
 INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES(p,a,'admin');
 INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by) VALUES(p,1,'{}',a);
 receipt_value:=jsonb_build_object('projectId',p,'cursor','0');
 UPDATE sophia.project_creations SET project_id=p, receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;

COMMIT;
