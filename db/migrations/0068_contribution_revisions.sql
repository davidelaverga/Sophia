-- A member corrects or withdraws their own message in the room's discussion (docs/plans/message-acts.md, A36; #365
-- section 4, FND-C3a). Only its author, an active member (a viewer too: their own ordinary talk, A06), never another
-- person's message, and no work grant comes with it.
-- * What a message is made of decides what it may do, from what its submit kept (0048), never from who owns a source
--   now: a message written as text has words of its own; a message that shares a report or file (its submit named a
--   {source}) has none. Withdrawing a shared one takes it out of the discussion and leaves what it shares untouched,
--   whoever owns it; only a written one can be corrected.
-- * Correcting writes the new words to a new source; the message keeps its id, author and time, and its revision moves.
--   The old words are erased (mission_erase_source: their text goes, and the research and design that read them are
--   revoked, research rebuilt on its goal and allowance as 0028/0033 do). Withdrawing a written message erases its
--   words the same way. Either moves the project's eligibility revision, so a live context that read them is rebuilt.
-- * Erasing is the member's decision on what it reaches: preview_contribution_act lists the running work that read
--   the words, each task with its kind and whether it starts again, and signs (v2), as preview_mission_withdrawal does
--   (0018, under the same key), the member, project, message, act, revision and that list. The act echoes the
--   revision and the list as shown with the proof. Under the project's and the message's locks the proof is checked
--   against the echo (altered: invalid), then the echo against now (a moved revision, or any task added, gone or with
--   another consequence, as after a Stop or a Resume: stale, read again). Nothing is done on either refusal.
-- * Identical words change nothing: no erasure, no rebuild, no event, no paid work woken.
-- * What a request kept of erased words goes with them: the submit's and an earlier correction's text digests are
--   redacted, and a retry of either is refused as erased (request_erased) rather than answered with them. A submit's
--   retry is refused the same way whenever its source has been erased since, by this or any other path. A retry of a
--   withdrawn message's submit is stale. Receipts of these acts carry no text and no digest.
-- * Accepted decisions, published report versions and their files, and sources a message only shares are not touched.
-- submit_contribution is 0048's with those two retries; 0001–0066 are not edited.
BEGIN;

ALTER TABLE sophia.contributions
 ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN state text NOT NULL DEFAULT 'current' CHECK(state IN ('current','withdrawn')),
 ADD COLUMN corrected_at timestamptz,
 ADD COLUMN withdrawn_at timestamptz,
 ADD CONSTRAINT contributions_withdrawn_when CHECK((state='withdrawn')=(withdrawn_at IS NOT NULL));

-- A correction or withdrawal, idempotent per member and key. source_id is the source whose words the act names (the
-- new words of a correction, the unchanged ones of a correction that changed nothing): when they are erased, the
-- act's digest is redacted. Reached only through the functions below.
CREATE TABLE sophia.contribution_acts (
 project_id uuid NOT NULL, actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 contribution_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('correct','withdraw')), source_id uuid,
 semantic_request jsonb NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id,idempotency_key),
 FOREIGN KEY(project_id,contribution_id) REFERENCES sophia.contributions(project_id,id)
);
ALTER TABLE sophia.contribution_acts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.contribution_acts FROM PUBLIC;
CREATE INDEX contribution_acts_by_message ON sophia.contribution_acts(project_id,contribution_id);

-- Whether a message has words of its own: its submit carried text, not a {source} (0048 keeps exactly one), and its
-- current source is a text its author wrote through it. Nothing a message only shares passes.
CREATE FUNCTION sophia.contribution_own_text(c sophia.contributions) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_typeof(c.semantic_request->'source')='null'
  AND (jsonb_typeof(c.semantic_request->'text')='string' OR c.semantic_request->'redacted'='true'::jsonb)
  AND EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=c.project_id AND s.id=c.source_id
   AND s.owner_id=c.actor_id AND s.scope='project' AND s.mime='text/plain; charset=utf-8') $$;
REVOKE ALL ON FUNCTION sophia.contribution_own_text(sophia.contributions) FROM PUBLIC;

-- The running work erasing a source would revoke, in task order: research (0028, through the closure of 0033), and
-- whether it starts again without it (its goal still working or held), and designs and their reviews (0041). The same
-- predicates as research_revoke_source and design_revoke_source.
CREATE FUNCTION sophia.contribution_reach(p_project uuid, p_source uuid)
RETURNS TABLE(task_id uuid, kind text, restarts boolean) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT x.task_id, x.kind, x.restarts FROM (
  SELECT jj.id AS task_id, 'research'::text AS kind, g.status IN ('ready','running','checking','holding','held') AS restarts
   FROM sophia.jobs jj JOIN sophia.work_attempts wa ON wa.project_id=jj.project_id AND wa.id=jj.attempt_id
   JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id
   WHERE jj.project_id=p_project AND jj.kind='research' AND jj.parent_job_id IS NULL AND jj.state IN ('pending','running','outcome_unknown')
    AND wa.state<>'revoked' AND p_source IN (SELECT sophia.attempt_consumed_sources(p_project,jj.attempt_id))
  UNION
  SELECT DISTINCT coalesce(r.design_job_id,j.id), 'design', false FROM sophia.jobs j
   JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
   LEFT JOIN sophia.design_reviews r ON r.project_id=j.project_id AND r.job_id=j.id
   WHERE j.project_id=p_project AND j.kind IN ('design','design_review') AND j.state IN ('pending','running','outcome_unknown')
    AND wa.state<>'revoked' AND p_source IN (SELECT sophia.attempt_consumed_sources(p_project,j.attempt_id))) x
 ORDER BY x.task_id $$;
REVOKE ALL ON FUNCTION sophia.contribution_reach(uuid,uuid) FROM PUBLIC;

-- What an act on this message would do to running work, as a preview shows it and its proof binds it: each task as
-- taskId:kind:restarts, in task order. A Stop or a Resume can change what happens to the same task, so the
-- consequence is part of what was shown (Codex on #396). Nothing for a message that only shares a source, since
-- withdrawing it erases nothing.
CREATE FUNCTION sophia.contribution_reach_shown(c sophia.contributions) RETURNS text[] LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN sophia.contribution_own_text(c)
  THEN ARRAY(SELECT r.task_id::text||':'||r.kind||':'||r.restarts::text
   FROM sophia.contribution_reach(c.project_id,c.source_id) r ORDER BY r.task_id)
  ELSE '{}'::text[] END $$;
REVOKE ALL ON FUNCTION sophia.contribution_reach_shown(sophia.contributions) FROM PUBLIC;

-- An act preview's proof (v2): an HMAC, under 0018's preview key and its own versioned label, of the member, the
-- project, the message, the act, the message's revision (every change of its source moves it), the expiry and exactly
-- the reach shown, as taskId:kind:restarts in task order. No text goes into it.
CREATE FUNCTION sophia.contribution_act_tag(p_project uuid, p_contribution uuid, p_actor uuid, p_action text,
 p_revision bigint, p_expires bigint, p_reach text[]) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.mission_hmac((SELECT k.secret FROM sophia_secrets.mission_preview_keys k WHERE k.id=1),
  concat_ws('|','sophia.contribution-act-preview.v2',p_project::text,p_contribution::text,p_actor::text,p_action,
   p_revision::text,p_expires::text,array_to_string(p_reach,','))) $$;
REVOKE ALL ON FUNCTION sophia.contribution_act_tag(uuid,uuid,uuid,text,bigint,bigint,text[]) FROM PUBLIC;

-- The message an act names, if the calling member may act on it: theirs, still in the discussion, and for a
-- correction one with words of its own. Callers hold the locks they need.
CREATE FUNCTION sophia.contribution_actable(p_project uuid, p_contribution uuid, p_action text) RETURNS sophia.contributions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.contributions;
BEGIN
 SELECT * INTO c FROM sophia.contributions WHERE project_id=p_project AND id=p_contribution;
 IF NOT FOUND THEN RAISE EXCEPTION 'Message not found' USING ERRCODE='22023'; END IF;
 IF c.actor_id IS DISTINCT FROM sophia.actor_id() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF c.state='withdrawn' THEN RAISE EXCEPTION 'Stale message: it has been withdrawn' USING ERRCODE='40001'; END IF;
 IF p_action='correct' AND NOT sophia.contribution_own_text(c) THEN
  RAISE EXCEPTION 'A message that shares a report or file can''t be corrected; withdraw it instead' USING ERRCODE='22023'; END IF;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION sophia.contribution_actable(uuid,uuid,text) FROM PUBLIC;

-- GET .../contributions/{id}/preview?action=correct|withdraw (A36): what the act would do, for the author about to
-- confirm it, and the proof, valid 15 minutes, it must carry: previewToken, v2.<expiry in epoch seconds>.<tag>.
CREATE FUNCTION sophia.preview_contribution_act(p_project uuid, p_contribution uuid, p_action text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.contributions; own boolean;
 expires bigint:=floor(extract(epoch FROM now()))::bigint+900;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('correct','withdraw') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 c:=sophia.contribution_actable(p_project,p_contribution,p_action);
 own:=sophia.contribution_own_text(c);
 RETURN jsonb_build_object('contributionId',c.id,'action',p_action,'revision',c.revision,'erases',own,
  'reach',CASE WHEN own THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',r.task_id,'kind',r.kind,'restarts',r.restarts)
    ORDER BY r.task_id),'[]') FROM sophia.contribution_reach(p_project,c.source_id) r) ELSE '[]'::jsonb END,
  'previewToken','v2.'||expires::text||'.'||sophia.contribution_act_tag(p_project,c.id,a,p_action,c.revision,expires,
    sophia.contribution_reach_shown(c)),
  'expiresAt',to_jsonb(to_timestamp(expires)));
END $$;
REVOKE ALL ON FUNCTION sophia.preview_contribution_act(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.preview_contribution_act(uuid,uuid,text) TO sophia_api;

-- The shape every act request shares: {expectedRevision, reach: [{taskId, kind, restarts}], previewToken}, the
-- revision and the reach exactly as the member's preview showed them, and its proof. A proof of another version (v1)
-- is refused before anything is read or done.
CREATE FUNCTION sophia.contribution_act_request(p_key text, p_request jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'expectedRevision') IS DISTINCT FROM 'number' OR (p_request->>'expectedRevision') !~ '^[1-9][0-9]{0,17}$'
   OR jsonb_typeof(p_request->'reach') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Invalid request: it must name the revision and the reach the member was shown' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'reach') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
   OR (x->>'taskId') IS NULL OR (x->>'taskId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (x->>'kind') IS NULL OR (x->>'kind') NOT IN ('research','design') OR jsonb_typeof(x->'restarts') IS DISTINCT FROM 'boolean') THEN
  RAISE EXCEPTION 'Invalid request: the reach lists the tasks as shown' USING ERRCODE='22023'; END IF;
 IF (p_request->>'previewToken') IS NULL OR (p_request->>'previewToken') !~ '^v2\.[0-9]{1,12}\.[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid request: it must carry the preview shown to the member' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.contribution_act_request(text,jsonb) FROM PUBLIC;

-- An earlier act under this member's key: its receipt for the same request; a conflict for another; refused as erased
-- when the words it named have been erased since, since its digest went with them.
CREATE FUNCTION sophia.contribution_act_prior(p_project uuid, p_key text, p_semantic jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.contribution_acts;
BEGIN
 SELECT * INTO prior FROM sophia.contribution_acts WHERE project_id=p_project AND actor_id=sophia.actor_id() AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.semantic_request ? 'redacted' THEN
  RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
 IF prior.semantic_request<>p_semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 RETURN prior.receipt;
END $$;
REVOKE ALL ON FUNCTION sophia.contribution_act_prior(uuid,text,jsonb) FROM PUBLIC;

-- The act is what the member was shown, now, under the locks. First the proof, against the snapshot the act echoes
-- (revision and reach as shown): one the server didn't sign for this member, message and act, or a snapshot altered
-- since, is invalid (422). Then the snapshot against now: expired, a moved revision, or any task added, gone, or
-- changed in kind or restart (a Stop or a Resume since) is stale (409): authentic, but no longer true, so read again.
CREATE FUNCTION sophia.contribution_act_confirmed(c sophia.contributions, p_action text, p_request jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE token text:=p_request->>'previewToken'; expires bigint:=split_part(token,'.',2)::bigint;
 echoed text[]:=ARRAY(SELECT lower(x->>'taskId')||':'||(x->>'kind')||':'||(x->>'restarts')
  FROM jsonb_array_elements(p_request->'reach') x ORDER BY (x->>'taskId')::uuid);
BEGIN
 IF split_part(token,'.',3) IS DISTINCT FROM sophia.contribution_act_tag(c.project_id,c.id,sophia.actor_id(),p_action,
   (p_request->>'expectedRevision')::bigint,expires,echoed) THEN
  RAISE EXCEPTION 'Invalid request: this was not shown to this member for this message' USING ERRCODE='22023'; END IF;
 IF expires<extract(epoch FROM now()) THEN
  RAISE EXCEPTION 'Stale message: what was shown has expired' USING ERRCODE='40001'; END IF;
 IF c.revision IS DISTINCT FROM (p_request->>'expectedRevision')::bigint THEN
  RAISE EXCEPTION 'Stale message: it changed since it was shown' USING ERRCODE='40001'; END IF;
 IF echoed IS DISTINCT FROM sophia.contribution_reach_shown(c) THEN
  RAISE EXCEPTION 'Stale message: what it would change changed since it was shown' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.contribution_act_confirmed(sophia.contributions,text,jsonb) FROM PUBLIC;

-- Erase a written message's current words (mission_erase_source: text, hash, research and design that read them), and
-- what requests kept of them: the submit's digest once, the digest of any correction that named these words, and the
-- hash any other message that shares them kept in its submit and receipt (V on #396). That message stays as it is,
-- its author's and detach-only; a retry of its submit is refused as erased. No other message's own words are touched.
CREATE FUNCTION sophia.contribution_erase(c sophia.contributions) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.mission_erase_source(c.project_id,c.source_id);
 UPDATE sophia.contributions SET semantic_request=(semantic_request-'text')||'{"text":null,"redacted":true}',
  receipt=receipt||'{"sha256":null}'
  WHERE project_id=c.project_id AND id=c.id AND NOT semantic_request ? 'redacted';
 UPDATE sophia.contributions SET semantic_request=jsonb_set(semantic_request,'{source,sha256}','null'::jsonb)||'{"redacted":true}',
  receipt=receipt||'{"sha256":null}'
  WHERE project_id=c.project_id AND id<>c.id AND jsonb_typeof(semantic_request->'source')='object'
   AND semantic_request->'source'->>'sourceId'=c.source_id::text AND NOT semantic_request ? 'redacted';
 UPDATE sophia.contribution_acts SET semantic_request=(semantic_request-'text')||'{"redacted":true}'
  WHERE project_id=c.project_id AND contribution_id=c.id AND source_id=c.source_id;
END $$;
REVOKE ALL ON FUNCTION sophia.contribution_erase(sophia.contributions) FROM PUBLIC;

-- POST .../contributions/{id}/correction (A36): new words for the author's written message, p_request {text,
-- expectedRevision, reach, previewToken}. Words identical to the current ones change nothing and need no proof.
CREATE FUNCTION sophia.correct_contribution(p_project uuid, p_contribution uuid, p_key text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); body text:=p_request->>'text'; digest text; semantic jsonb; prior jsonb;
 c sophia.contributions; old sophia.source_objects; src sophia.source_objects; cursor_value bigint; receipt_value jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM sophia.contribution_act_request(p_key,p_request);
 IF jsonb_typeof(p_request->'text') IS DISTINCT FROM 'string' OR length(btrim(body)) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'Invalid text' USING ERRCODE='22023'; END IF;
 digest:=encode(sha256(convert_to(body,'UTF8')),'hex');
 -- Lock order: project, then the message; authority is checked again under the locks.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('operation','correct','contributionId',p_contribution,
  'expectedRevision',p_request->'expectedRevision','text',digest);
 prior:=sophia.contribution_act_prior(p_project,p_key,semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM sophia.contributions WHERE project_id=p_project AND id=p_contribution FOR UPDATE;
 c:=sophia.contribution_actable(p_project,p_contribution,'correct');
 SELECT * INTO old FROM sophia.source_objects WHERE project_id=p_project AND id=c.source_id;
 IF old.state<>'ready' THEN
  RAISE EXCEPTION 'This message''s words are gone already; it can only be withdrawn' USING ERRCODE='22023'; END IF;
 -- The same words on the revision shown change nothing, and need no proof.
 IF old.sha256=digest AND c.revision=(p_request->>'expectedRevision')::bigint THEN
  receipt_value:=jsonb_build_object('contributionId',c.id,'projectId',p_project,'operation','correct','revision',c.revision,
   'state','current','changed',false,'cursor',NULL);
  INSERT INTO sophia.contribution_acts(project_id,actor_id,idempotency_key,contribution_id,operation,source_id,semantic_request,receipt)
  VALUES(p_project,a,p_key,c.id,'correct',c.source_id,semantic,receipt_value);
  RETURN receipt_value;
 END IF;
 PERFORM sophia.contribution_act_confirmed(c,'correct',p_request);
 src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',body);
 UPDATE sophia.contributions SET source_id=src.id, revision=revision+1, corrected_at=now()
  WHERE project_id=p_project AND id=c.id;
 PERFORM sophia.contribution_erase(c);
 UPDATE sophia.projects SET eligibility_revision=eligibility_revision+1 WHERE id=p_project;
 cursor_value:=sophia.emit_project_event(p_project,'contribution.corrected','contribution',c.id,c.revision+1,'contribution.corrected');
 receipt_value:=jsonb_build_object('contributionId',c.id,'projectId',p_project,'operation','correct','revision',c.revision+1,
  'state','current','changed',true,'cursor',cursor_value::text);
 INSERT INTO sophia.contribution_acts(project_id,actor_id,idempotency_key,contribution_id,operation,source_id,semantic_request,receipt)
 VALUES(p_project,a,p_key,c.id,'correct',src.id,semantic,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.correct_contribution(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.correct_contribution(uuid,uuid,text,jsonb) TO sophia_api;

-- POST .../contributions/{id}/withdrawal (A36): the author takes their message out of the discussion, p_request
-- {expectedRevision, reach, previewToken}. A written message's words are erased; a shared source stays as it is.
CREATE FUNCTION sophia.withdraw_contribution(p_project uuid, p_contribution uuid, p_key text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); semantic jsonb; prior jsonb; c sophia.contributions; cursor_value bigint; receipt_value jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM sophia.contribution_act_request(p_key,p_request);
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('operation','withdraw','contributionId',p_contribution,'expectedRevision',p_request->'expectedRevision');
 prior:=sophia.contribution_act_prior(p_project,p_key,semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM sophia.contributions WHERE project_id=p_project AND id=p_contribution FOR UPDATE;
 c:=sophia.contribution_actable(p_project,p_contribution,'withdraw');
 PERFORM sophia.contribution_act_confirmed(c,'withdraw',p_request);
 UPDATE sophia.contributions SET state='withdrawn', withdrawn_at=now(), revision=revision+1
  WHERE project_id=p_project AND id=c.id;
 IF sophia.contribution_own_text(c) THEN PERFORM sophia.contribution_erase(c); END IF;
 UPDATE sophia.projects SET eligibility_revision=eligibility_revision+1 WHERE id=p_project;
 cursor_value:=sophia.emit_project_event(p_project,'contribution.withdrawn','contribution',c.id,c.revision+1,'contribution.withdrawn');
 receipt_value:=jsonb_build_object('contributionId',c.id,'projectId',p_project,'operation','withdraw','revision',c.revision+1,
  'state','withdrawn','changed',true,'cursor',cursor_value::text);
 INSERT INTO sophia.contribution_acts(project_id,actor_id,idempotency_key,contribution_id,operation,source_id,semantic_request,receipt)
 VALUES(p_project,a,p_key,c.id,'withdraw',NULL,semantic,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.withdraw_contribution(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.withdraw_contribution(uuid,uuid,text,jsonb) TO sophia_api;

-- submit_contribution (0048), replaced: a retry of a message whose words have been erased is refused as erased, never
-- answered with the digest it kept: its request redacted here, or its source erased by any other path (a forgotten
-- note's mission_erase_source, a withdrawn input), whose hash its receipt no longer matches. A retry of a withdrawn
-- message is stale. Otherwise 0048's text.
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
  IF prior.semantic_request ? 'redacted' THEN
   RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
  -- Its source erased by any path (a forgotten note, a withdrawn source; V on #396): the receipt's hash is gone with it.
  IF NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=prior.source_id
    AND s.state<>'deleted' AND s.sha256=prior.receipt->>'sha256') THEN
   RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  IF prior.state='withdrawn' THEN RAISE EXCEPTION 'Stale request: that message has since been withdrawn' USING ERRCODE='40001'; END IF;
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
