-- The room's chat names who wrote each message, in a call or not (docs/plans/discussion-author-names.md). The Studio
-- names an author from the call's participants, so a chat read with nobody in the call said «A member»; the service kept
-- no name. A message now keeps its author's name: the API puts the token's own name in the transaction
-- (sophia.actor_name) just before submit_contribution, never from a request field. Messages written before, by voice or
-- by a tool keep none. The function's body is 0012's, with that one column added to its insert. 0001–0047 are not edited.
BEGIN;

ALTER TABLE sophia.contributions ADD COLUMN author_name text
 CHECK(author_name IS NULL OR length(author_name) BETWEEN 1 AND 320);

CREATE OR REPLACE FUNCTION sophia.submit_contribution(p_project uuid, p_key text, p_request jsonb, p_origin text DEFAULT 'composer')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.contributions; semantic jsonb; body text:=p_request->>'text';
 src sophia.source_objects; ref jsonb:=p_request->'source'; cid uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb;
 intent_value text:=p_request->>'intent';
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF intent_value IS NULL OR intent_value NOT IN ('discuss','ask_sophia','propose_work') THEN RAISE EXCEPTION 'Invalid intent' USING ERRCODE='22023'; END IF;
 IF p_origin NOT IN ('composer','voice') THEN RAISE EXCEPTION 'Invalid origin' USING ERRCODE='22023'; END IF;
 IF (body IS NULL) = (ref IS NULL OR jsonb_typeof(ref)='null') THEN
  RAISE EXCEPTION 'A contribution carries either text or a source' USING ERRCODE='22023'; END IF;
 IF body IS NOT NULL AND length(btrim(body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid text' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('intent',intent_value,'threadId',p_request->'threadId','artifactVersionId',p_request->'artifactVersionId',
  'origin',p_origin,'text',CASE WHEN body IS NULL THEN NULL ELSE encode(sha256(convert_to(body,'UTF8')),'hex') END,'source',ref);
 SELECT * INTO prior FROM sophia.contributions WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF body IS NOT NULL THEN
  src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',body);
 ELSE
  SELECT * INTO src FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=(ref->>'sourceId')::uuid
   AND s.sha256=ref->>'sha256' AND s.state='ready' AND (s.owner_id=a OR (s.scope='project' AND s.eligible));
  IF NOT FOUND OR (SELECT eligibility_revision FROM sophia.projects WHERE id=p_project)<>(ref->>'eligibilityRevision')::bigint THEN
   RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 END IF;
 cursor_value:=sophia.emit_project_event(p_project,'contribution.recorded','contribution',cid,1,'contribution.'||intent_value);
 receipt_value:=jsonb_build_object('contributionId',cid,'projectId',p_project,'sourceId',src.id,'sha256',src.sha256,
  'intent',intent_value,'cursor',cursor_value::text,'stage','recorded');
 INSERT INTO sophia.contributions(project_id,id,actor_id,source_id,intent,origin,thread_id,artifact_version_id,idempotency_key,semantic_request,receipt,author_name)
 VALUES(p_project,cid,a,src.id,intent_value,p_origin,(p_request->>'threadId')::uuid,(p_request->>'artifactVersionId')::uuid,p_key,semantic,receipt_value,
  left(nullif(btrim(current_setting('sophia.actor_name',true)),''),320));
 RETURN receipt_value;
END $$;

COMMIT;
