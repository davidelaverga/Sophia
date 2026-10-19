-- A member mentions other members in a message of the room's discussion, and each is asked to look (docs/plans/
-- mentions.md, A37; #365 section 7, FND-C3b-EXPLICIT-MENTIONS-01). Explicit only: a message names at most five members
-- by their actor ids. No words are parsed (no @name), nothing is inferred, no work is woken, nobody is notified outside
-- the Studio and nothing is spent.
-- * Who may mention: adding or changing a non-empty list of recipients needs can_edit (an editor or an admin). A viewer
--   still writes, corrects and withdraws their own ordinary words with no recipients, and can be mentioned. A
--   recipient must be an active member when named; the author is never their own recipient; duplicates count once.
-- * Compatibility: a submit without `mentions` has none; a correction without `mentions` keeps the message's
--   recipients; an explicit [] clears them. A request without recipients keeps 0068's semantic, so its retries match.
-- * Attention is bound to the message's committed revision (C3a). A correction rebinds it:
--   - a recipient kept and still waiting moves to the new revision, still one item;
--   - a recipient kept who has already looked is not asked again;
--   - a recipient added is asked;
--   - a recipient removed is no longer asked;
--   - a withdrawal ends every one.
--   The same words with other recipients change only who is mentioned: no new revision, nothing erased, rebuilt or
--   woken. Drafts are never recorded, so they never mention anyone. Earlier messages get no recipients.
-- * Each time a recipient is asked anew (named first, or named again after being removed) is its own occurrence, so its
--   need has its own identity, `mention:<project>:<revision>.<occurrence>:<message>` (V on #409): a seen saved for an
--   earlier occurrence or revision answers 204 and clears nothing newer; the current one's seen is idempotent.
-- * A recipient's need (A15, opted in with mentions=1) lists their pending mentions on the message's current revision,
--   while they are an active member, the project is not archived, and the message stands with its words.
-- * Recipients are read by members through contribution_recipients, never their seen state.
-- submit_contribution, correct_contribution and withdraw_contribution are 0068's with the mention steps; 0068 is not
-- edited, nor is anything before it.
BEGIN;

CREATE TABLE sophia.contribution_mentions (
 project_id uuid NOT NULL, contribution_id uuid NOT NULL, recipient_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0), state text NOT NULL CHECK(state IN ('pending','seen','retired')),
 -- Which asking this is: 1 when first named, one more each time named again after being removed.
 occurrence bigint NOT NULL DEFAULT 1 CHECK(occurrence>0),
 mentioned_at timestamptz NOT NULL DEFAULT now(), changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,contribution_id,recipient_id),
 FOREIGN KEY(project_id,contribution_id) REFERENCES sophia.contributions(project_id,id)
);
ALTER TABLE sophia.contribution_mentions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.contribution_mentions FROM PUBLIC;
CREATE INDEX contribution_mentions_waiting ON sophia.contribution_mentions(recipient_id) WHERE state='pending';

-- The recipients a request names: null when it names none (`mentions` absent or null), else at most five member ids,
-- the author left out, each once, in order. Only the shape is checked here; membership under the project's lock.
CREATE FUNCTION sophia.mention_recipients(p_request jsonb) RETURNS uuid[] LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE m jsonb:=p_request->'mentions';
BEGIN
 IF m IS NULL OR jsonb_typeof(m)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(m)<>'array' OR jsonb_array_length(m)>5 THEN
  RAISE EXCEPTION 'Invalid mentions: at most five members' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m) x WHERE jsonb_typeof(x)<>'string'
   OR x #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'Invalid mentions: members are named by their ids' USING ERRCODE='22023'; END IF;
 RETURN ARRAY(SELECT DISTINCT (x #>> '{}')::uuid FROM jsonb_array_elements(m) x
  WHERE (x #>> '{}')::uuid IS DISTINCT FROM sophia.actor_id() ORDER BY 1);
END $$;
REVOKE ALL ON FUNCTION sophia.mention_recipients(jsonb) FROM PUBLIC;

-- Whether the caller may name these recipients now (under the project's lock): a non-empty list that differs from the
-- message's current one only from an editor or an admin; and a list the request names (p_named) every one an active
-- member, kept ones too (Codex on #409). A correction that leaves `mentions` out keeps the current recipients as they
-- are, whoever has left since.
CREATE FUNCTION sophia.mentions_allowed(p_project uuid, p_current uuid[], p_recipients uuid[], p_named boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF cardinality(p_recipients)>0 AND p_recipients IS DISTINCT FROM p_current AND NOT sophia.can_edit(p_project) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_named AND EXISTS(SELECT 1 FROM unnest(p_recipients) r WHERE NOT EXISTS(SELECT 1 FROM sophia.project_members m
   WHERE m.project_id=p_project AND m.actor_id=r AND m.active)) THEN
  RAISE EXCEPTION 'Invalid mentions: someone named is not a member of this project' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.mentions_allowed(uuid,uuid[],uuid[],boolean) FROM PUBLIC;

-- A message's current recipients, in order: everyone still mentioned, whether they have looked or not.
CREATE FUNCTION sophia.mentions_current(c sophia.contributions) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT ARRAY(SELECT m.recipient_id FROM sophia.contribution_mentions m
  WHERE m.project_id=c.project_id AND m.contribution_id=c.id AND m.state<>'retired' ORDER BY 1) $$;
REVOKE ALL ON FUNCTION sophia.mentions_current(sophia.contributions) FROM PUBLIC;

-- Bind a message's mentions to its committed revision (the rules in the header): kept ones move to it as they are
-- (waiting or seen, the same occurrence), added ones wait, a removed one named again waits as a new occurrence, removed
-- ones end.
CREATE FUNCTION sophia.mentions_bind(p_project uuid, p_contribution uuid, p_revision bigint, p_recipients uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.contribution_mentions SET state='retired', changed_at=now()
  WHERE project_id=p_project AND contribution_id=p_contribution AND state<>'retired' AND recipient_id <> ALL(p_recipients);
 UPDATE sophia.contribution_mentions SET revision=p_revision, changed_at=now()
  WHERE project_id=p_project AND contribution_id=p_contribution AND state<>'retired' AND recipient_id = ANY(p_recipients)
   AND revision<>p_revision;
 INSERT INTO sophia.contribution_mentions(project_id,contribution_id,recipient_id,revision,state)
 SELECT p_project,p_contribution,r,p_revision,'pending' FROM unnest(p_recipients) r
 ON CONFLICT (project_id,contribution_id,recipient_id) DO UPDATE
  SET state='pending', revision=EXCLUDED.revision, occurrence=sophia.contribution_mentions.occurrence+1,
   mentioned_at=now(), changed_at=now()
  WHERE sophia.contribution_mentions.state='retired';
END $$;
REVOKE ALL ON FUNCTION sophia.mentions_bind(uuid,uuid,bigint,uuid[]) FROM PUBLIC;

-- Who a message mentions, for a member reading the discussion: the current recipients, never whether they looked.
CREATE FUNCTION sophia.contribution_recipients(p_project uuid, p_contribution uuid) RETURNS uuid[] LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN sophia.is_member(p_project) THEN ARRAY(SELECT m.recipient_id FROM sophia.contribution_mentions m
  JOIN sophia.contributions c ON c.project_id=m.project_id AND c.id=m.contribution_id AND c.state='current'
  WHERE m.project_id=p_project AND m.contribution_id=p_contribution AND m.state<>'retired' ORDER BY 1)
  ELSE '{}'::uuid[] END $$;
REVOKE ALL ON FUNCTION sophia.contribution_recipients(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.contribution_recipients(uuid,uuid) TO sophia_api;

-- submit_contribution (0068), replaced: the request's recipients checked under the lock and recorded on revision 1.
CREATE OR REPLACE FUNCTION sophia.submit_contribution(p_project uuid, p_key text, p_request jsonb, p_origin text DEFAULT 'composer')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); prior sophia.contributions; semantic jsonb; body text:=p_request->>'text';
 src sophia.source_objects; ref jsonb:=p_request->'source'; cid uuid:=gen_random_uuid(); cursor_value bigint; receipt_value jsonb;
 intent_value text:=p_request->>'intent'; recipients uuid[]:=sophia.mention_recipients(p_request);
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
 -- Who it mentions is part of the request (0069); a request with none keeps 0068's semantic, so earlier retries match.
 IF cardinality(recipients)>0 THEN semantic:=semantic||jsonb_build_object('mentions',to_jsonb(recipients)); END IF;
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
 PERFORM sophia.mentions_allowed(p_project,'{}'::uuid[],coalesce(recipients,'{}'::uuid[]),true);
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
 PERFORM sophia.mentions_bind(p_project,cid,1,coalesce(recipients,'{}'::uuid[]));
 RETURN receipt_value;
END $$;

-- correct_contribution (0068), replaced: recipients kept, changed or cleared, bound to the committed revision; the
-- same words with other recipients change only who is mentioned.
CREATE OR REPLACE FUNCTION sophia.correct_contribution(p_project uuid, p_contribution uuid, p_key text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); body text:=p_request->>'text'; digest text; semantic jsonb; prior jsonb;
 c sophia.contributions; old sophia.source_objects; src sophia.source_objects; cursor_value bigint; receipt_value jsonb;
 recipients uuid[]:=sophia.mention_recipients(p_request); current_recipients uuid[];
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
 -- Recipients named (an empty list too) are part of the request; omitted, they are kept, and 0068's semantic stands.
 IF recipients IS NOT NULL THEN semantic:=semantic||jsonb_build_object('mentions',to_jsonb(recipients)); END IF;
 prior:=sophia.contribution_act_prior(p_project,p_key,semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM sophia.contributions WHERE project_id=p_project AND id=p_contribution FOR UPDATE;
 c:=sophia.contribution_actable(p_project,p_contribution,'correct');
 SELECT * INTO old FROM sophia.source_objects WHERE project_id=p_project AND id=c.source_id;
 IF old.state<>'ready' THEN
  RAISE EXCEPTION 'This message''s words are gone already; it can only be withdrawn' USING ERRCODE='22023'; END IF;
 current_recipients:=sophia.mentions_current(c);
 PERFORM sophia.mentions_allowed(p_project,current_recipients,coalesce(recipients,current_recipients),recipients IS NOT NULL);
 recipients:=coalesce(recipients,current_recipients);
 -- The same words with other recipients, on the revision shown: only who is mentioned changes. Nothing is erased,
 -- rebuilt or woken; the revision stays (0069).
 IF old.sha256=digest AND c.revision=(p_request->>'expectedRevision')::bigint AND recipients IS DISTINCT FROM current_recipients THEN
  PERFORM sophia.mentions_bind(p_project,c.id,c.revision,recipients);
  cursor_value:=sophia.emit_project_event(p_project,'contribution.mentioned','contribution',c.id,c.revision,'contribution.mentioned');
  receipt_value:=jsonb_build_object('contributionId',c.id,'projectId',p_project,'operation','correct','revision',c.revision,
   'state','current','changed',true,'cursor',cursor_value::text);
  INSERT INTO sophia.contribution_acts(project_id,actor_id,idempotency_key,contribution_id,operation,source_id,semantic_request,receipt)
  VALUES(p_project,a,p_key,c.id,'correct',c.source_id,semantic,receipt_value);
  RETURN receipt_value;
 END IF;
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
 PERFORM sophia.mentions_bind(p_project,c.id,c.revision+1,recipients);
 UPDATE sophia.projects SET eligibility_revision=eligibility_revision+1 WHERE id=p_project;
 cursor_value:=sophia.emit_project_event(p_project,'contribution.corrected','contribution',c.id,c.revision+1,'contribution.corrected');
 receipt_value:=jsonb_build_object('contributionId',c.id,'projectId',p_project,'operation','correct','revision',c.revision+1,
  'state','current','changed',true,'cursor',cursor_value::text);
 INSERT INTO sophia.contribution_acts(project_id,actor_id,idempotency_key,contribution_id,operation,source_id,semantic_request,receipt)
 VALUES(p_project,a,p_key,c.id,'correct',src.id,semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- withdraw_contribution (0068), replaced: a withdrawal also ends the message's mentions.
CREATE OR REPLACE FUNCTION sophia.withdraw_contribution(p_project uuid, p_contribution uuid, p_key text, p_request jsonb) RETURNS jsonb
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
 -- Its mentions go with it: nobody is waited on for a message that is gone (0069).
 UPDATE sophia.contribution_mentions SET state='retired', changed_at=now()
  WHERE project_id=p_project AND contribution_id=c.id AND state<>'retired';
 UPDATE sophia.projects SET eligibility_revision=eligibility_revision+1 WHERE id=p_project;
 cursor_value:=sophia.emit_project_event(p_project,'contribution.withdrawn','contribution',c.id,c.revision+1,'contribution.withdrawn');
 receipt_value:=jsonb_build_object('contributionId',c.id,'projectId',p_project,'operation','withdraw','revision',c.revision+1,
  'state','withdrawn','changed',true,'cursor',cursor_value::text);
 INSERT INTO sophia.contribution_acts(project_id,actor_id,idempotency_key,contribution_id,operation,source_id,semantic_request,receipt)
 VALUES(p_project,a,p_key,c.id,'withdraw',NULL,semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- listNeeds with mentions (A37's mentions=1): 0065's list_needs, the person's pending mentions among them. 0065's
-- list_needs() is unchanged and still what a reader without the opt-in gets.
CREATE FUNCTION sophia.list_needs(p_mentions boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); read_at timestamptz:=now(); out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 WITH mine AS (
   SELECT m.project_id, p.title FROM sophia.project_members m JOIN sophia.projects p ON p.id=m.project_id
    WHERE m.actor_id=a AND m.active AND p.archived_at IS NULL
 ), found AS (
   -- Decisions the person is to make on the work board, still open and not expired (WorkDecision, A13).
   SELECT 'decision' AS kind, d.question AS title, d.project_id, mine.title AS project_title, d.expires_at,
          NULL::text AS detail, d.created_at AS at, 'work_decision' AS ref_kind, d.id::text AS ref_id,
          d.work_id::text AS within
     FROM sophia.work_decisions d JOIN mine ON mine.project_id=d.project_id
    WHERE d.decider_id=a AND d.state='proposed' AND d.expires_at>read_at
   UNION ALL
   -- Guests waiting at the door of a room the person can let them into (A02, A03: editors and admins).
   SELECT 'guest', l.display_name, l.project_id, mine.title, NULL::timestamptz,
          sophia.waited_words(l.requested_at, read_at), l.requested_at, 'lobby_entry', l.id::text, NULL::text
     FROM sophia.room_lobby l JOIN mine ON mine.project_id=l.project_id
    WHERE l.status='waiting' AND sophia.can_edit(l.project_id)
   UNION ALL
   -- Sophia's replies after the person's seen mark (A10).
   SELECT 'reply', sophia.first_words(t.body), NULL::uuid, NULL::text, NULL::timestamptz, NULL::text, t.created_at,
          'personal_turn', t.id::text, NULL::text
     FROM sophia.personal_turns t
    WHERE t.owner_id=a AND t.author='sophia'
      AND t.seq>coalesce((SELECT s.last_seen_turn_seq FROM sophia.personal_spaces s WHERE s.owner_id=a),0)
   UNION ALL
   -- Messages that mention the person, waiting, on their current revision, the message standing with its words
   -- (0069; only with p_mentions, so a reader before A37 never meets the kind).
   SELECT 'mention', sophia.first_words(t.body), cm.project_id, mine.title, NULL::timestamptz,
          left(coalesce(sophia.actor_label(ct.project_id,ct.actor_id,ct.author_name),'A member')||' mentioned you',200),
          cm.mentioned_at, 'contribution', cm.contribution_id::text, cm.revision::text||'.'||cm.occurrence::text
     FROM sophia.contribution_mentions cm JOIN mine ON mine.project_id=cm.project_id
     JOIN sophia.contributions ct ON ct.project_id=cm.project_id AND ct.id=cm.contribution_id
      AND ct.state='current' AND ct.revision=cm.revision
     JOIN sophia.source_objects s ON s.project_id=ct.project_id AND s.id=ct.source_id AND s.state='ready'
     JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
    WHERE p_mentions AND cm.recipient_id=a AND cm.state='pending'
 ), kept AS (
   SELECT f.*, f.kind||':'||coalesce(f.project_id::text,'personal')||':'||coalesce(sophia.need_part(f.within),'-')
            ||':'||sophia.need_part(f.ref_id) AS id
     FROM found f
    ORDER BY (f.expires_at IS NULL), f.expires_at, f.at DESC, id
    LIMIT 200
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',k.id,'kind',k.kind,'title',k.title,'projectId',k.project_id,
   'projectTitle',k.project_title,'expiresAt',k.expires_at,'detail',k.detail,'at',k.at,
   'ref',jsonb_build_object('kind',k.ref_kind,'id',k.ref_id,'within',k.within,'resourceId',NULL))
   ORDER BY (k.expires_at IS NULL), k.expires_at, k.at DESC, k.id),'[]'::jsonb) INTO out FROM kept k;
 RETURN jsonb_build_object('needs',out,'readAt',read_at);
END $$;
REVOKE ALL ON FUNCTION sophia.list_needs(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.list_needs(boolean) TO sophia_api;

-- markNeedSeen for a mention (A37): the person has looked at the message on that revision, for that occurrence of being
-- asked. A seen for another revision or occurrence changes nothing (a newer one stays asked); the current one's again
-- changes nothing more. False (404) when they are not an active member or are not mentioned.
CREATE FUNCTION sophia.mark_mention_seen(p_project uuid, p_contribution uuid, p_revision bigint, p_occurrence bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); m sophia.contribution_mentions;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF NOT sophia.is_member(p_project) THEN RETURN false; END IF;
 SELECT * INTO m FROM sophia.contribution_mentions
  WHERE project_id=p_project AND contribution_id=p_contribution AND recipient_id=a FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF m.state='pending' AND m.revision=p_revision AND m.occurrence=p_occurrence THEN
  UPDATE sophia.contribution_mentions SET state='seen', changed_at=now()
   WHERE project_id=p_project AND contribution_id=p_contribution AND recipient_id=a;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sophia.mark_mention_seen(uuid,uuid,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.mark_mention_seen(uuid,uuid,bigint,bigint) TO sophia_api;

COMMIT;
