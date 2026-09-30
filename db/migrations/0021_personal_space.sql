-- PS-01 (contract amendment A10): the personal space. One private conversation between a person and Sophia, the notes
-- the person keeps from it, and the notes they carry to one of their projects, one at a time.
-- * Owner-only. Every personal row names its owner, and the API role reads only the rows whose owner is the calling
--   actor. No project policy, view, event or function reaches a personal table: being a member or an admin of a
--   project gives no reach here, and nothing here reads project records beyond the membership a release needs.
-- * The only crossing is a release: one note, copied exactly as written into one project where its owner is an active
--   member, readable by that project's members and attributed to the name its owner shows. Taking it back deletes the
--   copy, and the note returns to its owner's notes; the project keeps nothing but the event saying it happened.
-- * The functions below are the only writers (no write grant on any table). Each re-checks the calling actor and is
--   idempotent per owner and key (personal_requests), like the mission ledger's writes. A request keeps a SHA-256 of
--   any text it wrote, never the text, and its receipt keeps ids only.
-- * Sophia's side is written by the companion the API runs, only as the reply to a pending turn of the same owner.
-- * Erasing the space deletes the conversation, suggestions and notes for good, and redacts every request, so a late
--   retry is told its write was forgotten rather than writing again. Releases stay in their projects, as the person
--   was told before erasing, and stay theirs to take back.
-- 0001–0020 are not edited.
BEGIN;

-- One row per person who ever wrote here: the order of their turns and a revision that moves with every write.
CREATE TABLE sophia.personal_spaces (
 owner_id uuid PRIMARY KEY,
 turn_seq bigint NOT NULL DEFAULT 0 CHECK(turn_seq>=0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now()
);

-- The conversation: the person's turns and Sophia's replies, in one order. A person's turn waits for its reply
-- (pending), has it (answered), or the companion could not give one (failed, and the person may ask again).
CREATE TABLE sophia.personal_turns (
 owner_id uuid NOT NULL REFERENCES sophia.personal_spaces(owner_id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 seq bigint NOT NULL CHECK(seq>0),
 author text NOT NULL CHECK(author IN ('person','sophia')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 reply_to uuid,
 reply text CHECK(reply IN ('pending','answered','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id), UNIQUE(owner_id,seq),
 FOREIGN KEY(owner_id,reply_to) REFERENCES sophia.personal_turns(owner_id,id),
 CHECK((author='person')=(reply IS NOT NULL)),
 CHECK(author='sophia' OR reply_to IS NULL)
);
CREATE INDEX personal_turns_pending ON sophia.personal_turns(owner_id,seq) WHERE reply='pending';

-- A note Sophia suggests after one of her replies. It is never kept silently: the person keeps it or lets it go.
CREATE TABLE sophia.personal_suggestions (
 owner_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 turn_id uuid NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 90),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','kept','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
 PRIMARY KEY(owner_id,id), UNIQUE(owner_id,turn_id),
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id)
);

-- What the person keeps: a short line in their own words, or Sophia's suggestion as she worded it (kept_by). A carried
-- note is in one project (personal_releases) until its owner takes it back.
CREATE TABLE sophia.personal_notes (
 owner_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 90),
 kept_by text NOT NULL CHECK(kept_by IN ('person','sophia')),
 from_turn uuid, suggestion_id uuid,
 state text NOT NULL DEFAULT 'kept' CHECK(state IN ('kept','carried')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,from_turn) REFERENCES sophia.personal_turns(owner_id,id),
 FOREIGN KEY(owner_id,suggestion_id) REFERENCES sophia.personal_suggestions(owner_id,id)
);

-- A note carried to a project: its exact words, whose they are, and where. Members of that project read it.
CREATE TABLE sophia.personal_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 owner_name text NOT NULL CHECK(length(owner_name) BETWEEN 1 AND 320),
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 note_id uuid,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 90),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,note_id),
 FOREIGN KEY(owner_id,note_id) REFERENCES sophia.personal_notes(owner_id,id) ON DELETE SET NULL (note_id)
);
CREATE INDEX personal_releases_by_project ON sophia.personal_releases(project_id,created_at);

-- Idempotency for every personal write: per owner and key, the operation, a digest of the request and its receipt.
CREATE TABLE sophia.personal_requests (
 owner_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 operation text NOT NULL, semantic_request jsonb NOT NULL, receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,idempotency_key)
);

ALTER TABLE sophia.personal_spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_spaces FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
ALTER TABLE sophia.personal_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_turns FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
ALTER TABLE sophia.personal_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_suggestions FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
ALTER TABLE sophia.personal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_notes FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
ALTER TABLE sophia.personal_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_or_member_read ON sophia.personal_releases FOR SELECT TO sophia_api
 USING(owner_id=sophia.actor_id() OR sophia.is_member(project_id));
ALTER TABLE sophia.personal_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sophia.personal_spaces, sophia.personal_turns, sophia.personal_suggestions, sophia.personal_notes,
 sophia.personal_releases TO sophia_api;
-- No write grant on any of these tables, and none to the worker: the functions below are the only writers.

-- ---------------------------------------------------------------------------------------------------
-- Internal helpers (no grant).

-- The calling person. A personal write always has one.
CREATE FUNCTION sophia.personal_owner() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_owner() FROM PUBLIC;

-- The stored receipt of an earlier identical request, or NULL; a changed request under the same key is refused, and a
-- request whose writes were erased is told so, whatever it says now.
CREATE FUNCTION sophia.personal_prior(p_key text, p_operation text, p_semantic jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.personal_requests;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.personal_requests WHERE owner_id=sophia.personal_owner() AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.semantic_request ? 'redacted' THEN
  RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
 IF prior.operation<>p_operation OR prior.semantic_request<>p_semantic THEN
  RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 RETURN prior.receipt;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_prior(text,text,jsonb) FROM PUBLIC;

-- Record a request's receipt, with the space's new revision in it.
CREATE FUNCTION sophia.personal_remember(p_key text, p_operation text, p_semantic jsonb, p_receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 INSERT INTO sophia.personal_requests(owner_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(sophia.personal_owner(),p_key,p_operation,p_semantic,p_receipt);
 RETURN p_receipt;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_remember(text,text,jsonb,jsonb) FROM PUBLIC;

-- A receipt: the operation, the space's revision and the ids it touched, with every other field present and null.
CREATE FUNCTION sophia.personal_receipt(p_operation text, p_revision bigint, p_fields jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('operation',p_operation,'revision',p_revision,'turnId',NULL,'seq',NULL,'suggestionId',NULL,
  'noteId',NULL,'releaseId',NULL,'projectId',NULL,'erased',NULL)||p_fields $$;
REVOKE ALL ON FUNCTION sophia.personal_receipt(text,bigint,jsonb) FROM PUBLIC;

-- The owner's space, created on first write and locked for this one; its revision moves.
CREATE FUNCTION sophia.personal_touch() RETURNS sophia.personal_spaces LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.personal_spaces;
BEGIN
 INSERT INTO sophia.personal_spaces(owner_id) VALUES(sophia.personal_owner()) ON CONFLICT (owner_id) DO NOTHING;
 UPDATE sophia.personal_spaces SET revision=revision+1 WHERE owner_id=sophia.personal_owner() RETURNING * INTO s;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_touch() FROM PUBLIC;

-- Bounded, trimmed text; refused when empty or too long.
CREATE FUNCTION sophia.personal_text(p_value text, p_max integer) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL OR length(btrim(p_value)) NOT BETWEEN 1 AND p_max THEN
  RAISE EXCEPTION 'Text must be 1 to % characters', p_max USING ERRCODE='22023'; END IF;
 RETURN btrim(p_value);
END $$;
REVOKE ALL ON FUNCTION sophia.personal_text(text,integer) FROM PUBLIC;

CREATE FUNCTION sophia.personal_digest(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex') $$;
REVOKE ALL ON FUNCTION sophia.personal_digest(text) FROM PUBLIC;

-- A turn appended after the owner's last one.
CREATE FUNCTION sophia.personal_append(p_author text, p_body text, p_reply_to uuid) RETURNS sophia.personal_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE seq_value bigint; t sophia.personal_turns;
BEGIN
 UPDATE sophia.personal_spaces SET turn_seq=turn_seq+1 WHERE owner_id=sophia.personal_owner() RETURNING turn_seq INTO seq_value;
 INSERT INTO sophia.personal_turns(owner_id,seq,author,body,reply_to,reply)
 VALUES(sophia.personal_owner(),seq_value,p_author,p_body,p_reply_to,CASE WHEN p_author='person' THEN 'pending' END)
 RETURNING * INTO t;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_append(text,text,uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- The conversation.

-- sendPersonalTurn: the person says something; Sophia's reply is pending until the companion writes it.
CREATE FUNCTION sophia.send_personal_turn(p_key text, p_text text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE body text:=sophia.personal_text(p_text,4000); semantic jsonb; prior jsonb; s sophia.personal_spaces; t sophia.personal_turns;
BEGIN
 semantic:=jsonb_build_object('text',sophia.personal_digest(body));
 prior:=sophia.personal_prior(p_key,'send_turn',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 t:=sophia.personal_append('person',body,NULL);
 RETURN sophia.personal_remember(p_key,'send_turn',semantic,
  sophia.personal_receipt('send_turn',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq)));
END $$;

-- The companion's reply to a pending turn of the calling owner, and at most one note it suggests. A turn already
-- answered keeps its reply: the call changes nothing and says which reply that is.
CREATE FUNCTION sophia.record_personal_reply(p_turn uuid, p_text text, p_suggestion text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); asked sophia.personal_turns; s sophia.personal_spaces; t sophia.personal_turns;
 suggestion text:=nullif(btrim(coalesce(p_suggestion,'')),''); suggestion_id uuid;
BEGIN
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=a FOR UPDATE;
 SELECT * INTO asked FROM sophia.personal_turns WHERE owner_id=a AND id=p_turn;
 IF NOT FOUND OR asked.author<>'person' THEN RAISE EXCEPTION 'Turn not found' USING ERRCODE='22023'; END IF;
 IF asked.reply='answered' THEN
  SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND reply_to=p_turn ORDER BY seq LIMIT 1;
  RETURN sophia.personal_receipt('reply',(SELECT revision FROM sophia.personal_spaces WHERE owner_id=a),
   jsonb_build_object('turnId',t.id,'seq',t.seq));
 END IF;
 s:=sophia.personal_touch();
 t:=sophia.personal_append('sophia',sophia.personal_text(p_text,4000),p_turn);
 UPDATE sophia.personal_turns SET reply='answered' WHERE owner_id=a AND id=p_turn;
 -- A suggestion that repeats a note the person keeps, or one already offered, is not offered again.
 IF suggestion IS NOT NULL AND length(suggestion)<=90
  AND NOT EXISTS(SELECT 1 FROM sophia.personal_notes WHERE owner_id=a AND lower(body)=lower(suggestion))
  AND NOT EXISTS(SELECT 1 FROM sophia.personal_suggestions WHERE owner_id=a AND lower(body)=lower(suggestion) AND state<>'dismissed') THEN
  INSERT INTO sophia.personal_suggestions(owner_id,turn_id,body) VALUES(a,t.id,suggestion) RETURNING id INTO suggestion_id;
 END IF;
 RETURN sophia.personal_receipt('reply',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq,'suggestionId',suggestion_id));
END $$;

-- The companion could not answer: the turn says so, and the person may ask again.
CREATE FUNCTION sophia.fail_personal_reply(p_turn uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner();
BEGIN
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=a FOR UPDATE;
 UPDATE sophia.personal_turns SET reply='failed' WHERE owner_id=a AND id=p_turn AND reply='pending';
 IF FOUND THEN PERFORM sophia.personal_touch(); END IF;
END $$;

-- askPersonalAgain: a turn whose reply failed waits for one again.
CREATE FUNCTION sophia.retry_personal_turn(p_key text, p_turn uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('turnId',p_turn); prior jsonb;
 t sophia.personal_turns; s sophia.personal_spaces;
BEGIN
 prior:=sophia.personal_prior(p_key,'retry_turn',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=a FOR UPDATE;
 SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=p_turn;
 IF NOT FOUND OR t.author<>'person' THEN RAISE EXCEPTION 'Turn not found' USING ERRCODE='22023'; END IF;
 IF t.reply<>'failed' THEN RAISE EXCEPTION 'Stale turn: it is %', t.reply USING ERRCODE='40001'; END IF;
 UPDATE sophia.personal_turns SET reply='pending' WHERE owner_id=a AND id=p_turn;
 s:=sophia.personal_touch();
 RETURN sophia.personal_remember(p_key,'retry_turn',semantic,
  sophia.personal_receipt('retry_turn',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq)));
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Notes.

-- decidePersonalSuggestion: keep Sophia's suggestion as a note in her words, or let it go.
CREATE FUNCTION sophia.decide_personal_suggestion(p_key text, p_suggestion uuid, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb; prior jsonb; sg sophia.personal_suggestions; s sophia.personal_spaces;
 note_id uuid; asked uuid;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('keep','dismiss') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('suggestionId',p_suggestion,'decision',p_decision);
 prior:=sophia.personal_prior(p_key,'decide_suggestion',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 SELECT * INTO sg FROM sophia.personal_suggestions WHERE owner_id=a AND id=p_suggestion FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found' USING ERRCODE='22023'; END IF;
 IF sg.state<>'open' THEN RAISE EXCEPTION 'Stale suggestion: it is already %', sg.state USING ERRCODE='40001'; END IF;
 UPDATE sophia.personal_suggestions SET state=CASE WHEN p_decision='keep' THEN 'kept' ELSE 'dismissed' END, decided_at=now()
 WHERE owner_id=a AND id=p_suggestion;
 IF p_decision='keep' THEN
  SELECT reply_to INTO asked FROM sophia.personal_turns WHERE owner_id=a AND id=sg.turn_id;
  INSERT INTO sophia.personal_notes(owner_id,body,kept_by,from_turn,suggestion_id) VALUES(a,sg.body,'sophia',asked,sg.id)
  RETURNING id INTO note_id;
 END IF;
 RETURN sophia.personal_remember(p_key,'decide_suggestion',semantic,
  sophia.personal_receipt('decide_suggestion',s.revision,jsonb_build_object('suggestionId',sg.id,'noteId',note_id)));
END $$;

-- keepPersonalNote: a line the person keeps from one of their own turns, in their words. Keeping exactly what Sophia
-- suggested for that turn keeps her suggestion.
CREATE FUNCTION sophia.keep_personal_note(p_key text, p_text text, p_from_turn uuid, p_suggestion uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); body text:=sophia.personal_text(p_text,90); semantic jsonb; prior jsonb;
 s sophia.personal_spaces; sg sophia.personal_suggestions; kept_by text:='person'; note_id uuid;
BEGIN
 semantic:=jsonb_build_object('text',sophia.personal_digest(body),'fromTurn',p_from_turn,'suggestionId',p_suggestion);
 prior:=sophia.personal_prior(p_key,'keep_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 IF p_from_turn IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.personal_turns WHERE owner_id=a AND id=p_from_turn AND author='person') THEN
  RAISE EXCEPTION 'Turn not found' USING ERRCODE='22023'; END IF;
 IF p_suggestion IS NOT NULL THEN
  SELECT * INTO sg FROM sophia.personal_suggestions WHERE owner_id=a AND id=p_suggestion FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found' USING ERRCODE='22023'; END IF;
  IF sg.state='open' AND sg.body=body THEN
   UPDATE sophia.personal_suggestions SET state='kept', decided_at=now() WHERE owner_id=a AND id=sg.id;
   kept_by:='sophia';
  END IF;
 END IF;
 INSERT INTO sophia.personal_notes(owner_id,body,kept_by,from_turn,suggestion_id)
 VALUES(a,body,kept_by,p_from_turn,CASE WHEN kept_by='sophia' THEN p_suggestion END) RETURNING id INTO note_id;
 RETURN sophia.personal_remember(p_key,'keep_note',semantic,sophia.personal_receipt('keep_note',s.revision,
  jsonb_build_object('noteId',note_id,'suggestionId',CASE WHEN kept_by='sophia' THEN p_suggestion END)));
END $$;

-- forgetPersonalNote: a kept note is deleted (the undo of keeping it). A suggestion it kept is open again.
CREATE FUNCTION sophia.forget_personal_note(p_key text, p_note uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('noteId',p_note); prior jsonb;
 s sophia.personal_spaces; n sophia.personal_notes;
BEGIN
 prior:=sophia.personal_prior(p_key,'forget_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 SELECT * INTO n FROM sophia.personal_notes WHERE owner_id=a AND id=p_note FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='22023'; END IF;
 IF n.state<>'kept' THEN RAISE EXCEPTION 'Stale note: it is carried to a project' USING ERRCODE='40001'; END IF;
 DELETE FROM sophia.personal_notes WHERE owner_id=a AND id=p_note;
 IF n.suggestion_id IS NOT NULL THEN
  UPDATE sophia.personal_suggestions SET state='open', decided_at=NULL WHERE owner_id=a AND id=n.suggestion_id;
 END IF;
 RETURN sophia.personal_remember(p_key,'forget_note',semantic,
  sophia.personal_receipt('forget_note',s.revision,jsonb_build_object('noteId',p_note)));
END $$;

-- ---------------------------------------------------------------------------------------------------
-- The crossing.

-- carryPersonalNote: one kept note, exactly as written, to one project where its owner is an active member.
CREATE FUNCTION sophia.carry_personal_note(p_key text, p_note uuid, p_project uuid, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('noteId',p_note,'projectId',p_project); prior jsonb;
 s sophia.personal_spaces; n sophia.personal_notes; release_id uuid:=gen_random_uuid();
 shown text:=left(coalesce(nullif(btrim(coalesce(p_name,'')),''),'A member'),320);
BEGIN
 prior:=sophia.personal_prior(p_key,'carry_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 s:=sophia.personal_touch();
 SELECT * INTO n FROM sophia.personal_notes WHERE owner_id=a AND id=p_note FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='22023'; END IF;
 IF n.state<>'kept' THEN RAISE EXCEPTION 'Stale note: it is already carried' USING ERRCODE='40001'; END IF;
 UPDATE sophia.personal_notes SET state='carried' WHERE owner_id=a AND id=p_note;
 INSERT INTO sophia.personal_releases(id,owner_id,owner_name,project_id,note_id,body) VALUES(release_id,a,shown,p_project,p_note,n.body);
 PERFORM sophia.emit_project_event(p_project,'personal.note_carried','personal_release',release_id,1,'personal.note_carried');
 RETURN sophia.personal_remember(p_key,'carry_note',semantic,sophia.personal_receipt('carry_note',s.revision,
  jsonb_build_object('noteId',p_note,'releaseId',release_id,'projectId',p_project)));
END $$;

-- takeBackPersonalRelease: the owner takes a carried note back. The project's copy is deleted; the note returns to
-- the owner's notes (as a new note when the space was erased since).
CREATE FUNCTION sophia.take_back_personal_release(p_key text, p_release uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('releaseId',p_release); prior jsonb;
 s sophia.personal_spaces; r sophia.personal_releases; note_id uuid;
BEGIN
 prior:=sophia.personal_prior(p_key,'take_back',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO r FROM sophia.personal_releases WHERE id=p_release AND owner_id=a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Release not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
 s:=sophia.personal_touch();
 DELETE FROM sophia.personal_releases WHERE id=p_release AND owner_id=a;
 IF r.note_id IS NOT NULL THEN
  UPDATE sophia.personal_notes SET state='kept' WHERE owner_id=a AND id=r.note_id RETURNING id INTO note_id;
 END IF;
 IF note_id IS NULL THEN
  INSERT INTO sophia.personal_notes(owner_id,body,kept_by) VALUES(a,r.body,'person') RETURNING id INTO note_id;
 END IF;
 PERFORM sophia.emit_project_event(r.project_id,'personal.note_taken_back','personal_release',p_release,2,'personal.note_taken_back');
 RETURN sophia.personal_remember(p_key,'take_back',semantic,sophia.personal_receipt('take_back',s.revision,
  jsonb_build_object('noteId',note_id,'releaseId',p_release,'projectId',r.project_id)));
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Erasure.

-- erasePersonalSpace: the conversation, suggestions and notes are deleted for good; releases stay where they were
-- carried. Every earlier request is redacted, so a late retry of one can't write again.
CREATE FUNCTION sophia.erase_personal_space(p_key text, p_confirm text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('confirm',p_confirm); prior jsonb;
 s sophia.personal_spaces; turns bigint; notes bigint; suggestions bigint;
BEGIN
 IF p_confirm IS DISTINCT FROM 'delete' THEN RAISE EXCEPTION 'Erasing needs the word delete' USING ERRCODE='22023'; END IF;
 prior:=sophia.personal_prior(p_key,'erase',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 UPDATE sophia.personal_releases SET note_id=NULL WHERE owner_id=a;
 DELETE FROM sophia.personal_notes WHERE owner_id=a;
 GET DIAGNOSTICS notes=ROW_COUNT;
 DELETE FROM sophia.personal_suggestions WHERE owner_id=a;
 GET DIAGNOSTICS suggestions=ROW_COUNT;
 DELETE FROM sophia.personal_turns WHERE owner_id=a;
 GET DIAGNOSTICS turns=ROW_COUNT;
 UPDATE sophia.personal_requests SET semantic_request='{"redacted":true}', receipt='{}' WHERE owner_id=a;
 RETURN sophia.personal_remember(p_key,'erase',semantic,sophia.personal_receipt('erase',s.revision,
  jsonb_build_object('erased',jsonb_build_object('turns',turns,'notes',notes,'suggestions',suggestions))));
END $$;

GRANT EXECUTE ON FUNCTION sophia.send_personal_turn(text,text), sophia.record_personal_reply(uuid,text,text),
 sophia.fail_personal_reply(uuid), sophia.retry_personal_turn(text,uuid),
 sophia.decide_personal_suggestion(text,uuid,text), sophia.keep_personal_note(text,text,uuid,uuid),
 sophia.forget_personal_note(text,uuid), sophia.carry_personal_note(text,uuid,uuid,text),
 sophia.take_back_personal_release(text,uuid), sophia.erase_personal_space(text,text) TO sophia_api;

COMMIT;
