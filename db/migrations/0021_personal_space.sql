-- PS-01 (contract amendment A10): the personal space. One private conversation between a person and Sophia, the notes
-- the person keeps from it, and the notes they carry to one of their projects, one at a time.
-- * Owner-only. Every personal row names its owner, and the API role reads only the rows whose owner is the calling
--   actor. No project policy, view, event or function reaches a personal table: being a member or an admin of a
--   project gives no reach here, and nothing here reads project records beyond the membership a release needs.
-- * The only crossing is a release: one note, copied exactly as written into one project where its owner is an active
--   member, readable by that project's members and attributed to the name its owner shows. Taking it back deletes the
--   copy, and the note returns to its owner's notes; the project keeps nothing but the event saying it happened.
-- * The functions below are the only writers (no write grant on any table). Each re-checks the calling actor and is
--   idempotent per owner and key (personal_requests), like the mission ledger's writes: it holds the owner's space
--   before it reads the key, so a retry racing its first attempt gets the same receipt. A request keeps a SHA-256 of
--   any text it wrote, never the text, and its receipt keeps ids only.
-- * Sophia's side is written by the companion the API runs: the reply to a pending turn of the same owner, or her
--   welcome back after a quiet spell of more than an hour. A suggestion she makes is kept as a note or deleted. The
--   API claims a turn before it asks the companion, and a welcome under the request's key, so only one process asks,
--   whichever process a retry reaches (a claim lapses after two minutes, as a wait does).
-- * Erasing the space deletes the conversation, suggestions and notes for good, and every request keeps only its key
--   (the key as the client chose it; the Studio's are random), so a retry from before the erasure, however late, is
--   told its write was erased rather than writing again. What survives is a count and a version: the space's revision
--   and its turn order (the next turn comes after every earlier one). Releases stay in their projects, as the person
--   was told before erasing, and stay theirs to take back.
-- * A space keeps at most 2000 notes (kept or carried) and a person carries at most 2000 notes (also those whose note
--   was erased): every one is listed, so nothing they keep or carry is ever out of their reach.
-- * Only the API role may call a writer: each is revoked from PUBLIC (the worker and every other role) before it is
--   granted to sophia_api.
-- 0001–0020 are not edited.
BEGIN;

-- One row per person who ever wrote here: the order of their turns, a revision that moves with every write, and an
-- epoch that moves with each erasure (a write made against an older one is refused: personal_fence). It keeps no
-- date: nothing says when the person first wrote.
CREATE TABLE sophia.personal_spaces (
 owner_id uuid PRIMARY KEY,
 turn_seq bigint NOT NULL DEFAULT 0 CHECK(turn_seq>=0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0)
);

-- The conversation: the person's turns and Sophia's replies, in one order. A person's turn waits for its reply
-- (pending), has it (answered), or the companion could not give one (failed, and the person may ask again). asked_at
-- is when the person last asked for the reply: when they sent the turn, or asked again (personal_reply_state).
-- answering_since and answering_claim: since when an API process answers it, and the claim its reply or failure must
-- carry (claim_personal_reply).
CREATE TABLE sophia.personal_turns (
 owner_id uuid NOT NULL REFERENCES sophia.personal_spaces(owner_id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 seq bigint NOT NULL CHECK(seq>0),
 author text NOT NULL CHECK(author IN ('person','sophia')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 reply_to uuid,
 reply text CHECK(reply IN ('pending','answered','failed')),
 asked_at timestamptz,
 answering_since timestamptz,
 answering_claim uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id), UNIQUE(owner_id,seq),
 FOREIGN KEY(owner_id,reply_to) REFERENCES sophia.personal_turns(owner_id,id),
 CHECK((author='person')=(reply IS NOT NULL)),
 CHECK((author='person')=(asked_at IS NOT NULL)),
 CHECK(author='sophia' OR reply_to IS NULL)
);
CREATE INDEX personal_turns_pending ON sophia.personal_turns(owner_id,seq) WHERE reply='pending';

-- A note Sophia suggests after one of her replies. It is never kept silently: the person keeps it (a note in her words)
-- or lets it go, and then it is deleted: nothing of a suggestion the person declined is kept.
CREATE TABLE sophia.personal_suggestions (
 owner_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 turn_id uuid NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 90),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','kept')),
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
CREATE INDEX personal_releases_by_project ON sophia.personal_releases(project_id,created_at,id);

-- The request getting a person's welcome back, while it asks the companion for one: one at a time, whichever API
-- process a request reaches. Each attempt holds a claim of its own; only that attempt writes the welcome or lets the
-- claim go (claim NULL: let go, and the request, its key and whom it greets, kept). A claim lapses after two minutes;
-- written and read only by the functions below.
CREATE TABLE sophia.personal_greeting_claims (
 owner_id uuid PRIMARY KEY,
 request_key text NOT NULL,
 semantic jsonb NOT NULL,
 claim uuid,
 claimed_at timestamptz NOT NULL DEFAULT now()
);

-- The calls to the companion in flight for a person, whichever API process makes them, each with the epoch of the space
-- it began in, so an erasure is acknowledged only once none begun before it is left (each call watches its claim and
-- stops once an erasure takes it), and then forgets them. A call has 60 s; a row older than two minutes is a process
-- that went away mid-call. No words: an id, an epoch and a time.
CREATE TABLE sophia.personal_companion_calls (
 owner_id uuid NOT NULL,
 call_id uuid NOT NULL,
 epoch bigint NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,call_id)
);

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
ALTER TABLE sophia.personal_greeting_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.personal_companion_calls ENABLE ROW LEVEL SECURITY;
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

-- The owner's space, created on their first write, and locked for this transaction before anything is read: two writes
-- under one key (a retry racing its first attempt) are taken in turn, so the second finds the first's receipt instead
-- of failing on the key. Every keyed write starts here; a project it locks comes after.
CREATE FUNCTION sophia.personal_hold() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 INSERT INTO sophia.personal_spaces(owner_id) VALUES(sophia.personal_owner()) ON CONFLICT (owner_id) DO NOTHING;
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=sophia.personal_owner() FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_hold() FROM PUBLIC;

-- Before every personal write the API makes but erasure, in its transaction: the space is held, and a write made
-- against an epoch other than the space's (one issued before an erasure, however late it reaches the database) is
-- refused as erased: nothing written before an erasure comes back after it.
CREATE FUNCTION sophia.personal_fence(p_epoch bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.personal_hold();
 IF p_epoch IS DISTINCT FROM (SELECT epoch FROM sophia.personal_spaces WHERE owner_id=sophia.personal_owner()) THEN
  RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
END $$;

-- The stored receipt of an earlier identical request, or NULL; a changed request under the same key is refused, a
-- request whose writes were erased is told so, whatever it says now, and so is the keep of a note since forgotten (it
-- keeps no digest to compare with, as 0018's forgotten requests). Called with the space held (personal_hold).
CREATE FUNCTION sophia.personal_prior(p_key text, p_operation text, p_semantic jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.personal_requests;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.personal_requests WHERE owner_id=sophia.personal_owner() AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.semantic_request ? 'redacted' THEN
  RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
 IF prior.semantic_request ? 'forgotten' THEN
  RAISE EXCEPTION 'Stale request: the note it kept has since been forgotten' USING ERRCODE='40001'; END IF;
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

-- Text without the whitespace around it, of every kind (newlines and tabs too, not only spaces).
CREATE FUNCTION sophia.personal_trim(p_value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT regexp_replace(p_value, '^[[:space:]]+|[[:space:]]+$', '', 'g') $$;
REVOKE ALL ON FUNCTION sophia.personal_trim(text) FROM PUBLIC;

-- Bounded, trimmed text; refused when empty (whitespace only) or too long.
CREATE FUNCTION sophia.personal_text(p_value text, p_max integer) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE trimmed text:=sophia.personal_trim(p_value);
BEGIN
 IF trimmed IS NULL OR length(trimmed) NOT BETWEEN 1 AND p_max THEN
  RAISE EXCEPTION 'Text must be 1 to % characters', p_max USING ERRCODE='22023'; END IF;
 RETURN trimmed;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_text(text,integer) FROM PUBLIC;

-- Room for one more note: a space keeps at most 2000 (kept or carried), so every one of them is listed.
CREATE FUNCTION sophia.personal_note_room() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF (SELECT count(*) FROM sophia.personal_notes WHERE owner_id=sophia.personal_owner())>=2000 THEN
  RAISE EXCEPTION 'Notes are full: a personal space keeps at most 2000 notes' USING ERRCODE='54000'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_note_room() FROM PUBLIC;

CREATE FUNCTION sophia.personal_digest(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex') $$;
REVOKE ALL ON FUNCTION sophia.personal_digest(text) FROM PUBLIC;

-- A turn appended after the owner's last one. A person's turn asks for a reply from now.
CREATE FUNCTION sophia.personal_append(p_author text, p_body text, p_reply_to uuid) RETURNS sophia.personal_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE seq_value bigint; t sophia.personal_turns; person boolean:=p_author='person';
BEGIN
 UPDATE sophia.personal_spaces SET turn_seq=turn_seq+1 WHERE owner_id=sophia.personal_owner() RETURNING turn_seq INTO seq_value;
 INSERT INTO sophia.personal_turns(owner_id,seq,author,body,reply_to,reply,asked_at)
 VALUES(sophia.personal_owner(),seq_value,p_author,p_body,p_reply_to,CASE WHEN person THEN 'pending' END,
  CASE WHEN person THEN now() END)
 RETURNING * INTO t;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_append(text,text,uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- The conversation.

-- A reply as it stands, for every read and for asking again. The API gives an answer 60 s and then marks the turn
-- failed (ANSWER_LIMIT_MS in apps/api/src/companion.ts); a reply still pending two minutes after it was asked for, or
-- after a process last claimed or renewed its claim on it (whichever is later), was lost with the process answering it
-- (a deploy, a crash), so it reads as failed and may be asked for again.
CREATE FUNCTION sophia.personal_reply_state(p_reply text, p_asked_at timestamptz, p_answering_since timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_reply='pending' AND greatest(p_asked_at,coalesce(p_answering_since,p_asked_at))<now()-interval '2 minutes'
  THEN 'failed' ELSE p_reply END $$;
REVOKE ALL ON FUNCTION sophia.personal_reply_state(text,timestamptz,timestamptz) FROM PUBLIC;

-- sendPersonalTurn: the person says something; Sophia's reply is pending until the companion writes it. Asked only to
-- replay (p_replay_only: where no companion runs), it returns the key's kept receipt, or NULL, and writes nothing; so do
-- retry_personal_turn and begin_personal_greeting.
CREATE FUNCTION sophia.send_personal_turn(p_key text, p_text text, p_replay_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE body text:=sophia.personal_text(p_text,4000); semantic jsonb; prior jsonb; s sophia.personal_spaces; t sophia.personal_turns;
BEGIN
 semantic:=jsonb_build_object('text',sophia.personal_digest(body));
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'send_turn',semantic);
 IF prior IS NOT NULL OR p_replay_only THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 t:=sophia.personal_append('person',body,NULL);
 RETURN sophia.personal_remember(p_key,'send_turn',semantic,
  sophia.personal_receipt('send_turn',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq)));
END $$;

-- The companion's reply to a pending turn of the calling owner, and at most one note it suggests. A turn already
-- answered keeps its reply: the call changes nothing and says which reply that is. Only the attempt holding the turn's
-- claim writes it (claim_personal_reply): one whose claim lapsed and went to another, or was cleared by asking again,
-- writes nothing (NULL).
CREATE FUNCTION sophia.record_personal_reply(p_turn uuid, p_claim uuid, p_text text, p_suggestion text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); asked sophia.personal_turns; s sophia.personal_spaces; t sophia.personal_turns;
 suggestion text:=nullif(sophia.personal_trim(coalesce(p_suggestion,'')),''); suggestion_id uuid;
BEGIN
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=a FOR UPDATE;
 SELECT * INTO asked FROM sophia.personal_turns WHERE owner_id=a AND id=p_turn;
 IF NOT FOUND OR asked.author<>'person' THEN RAISE EXCEPTION 'Turn not found' USING ERRCODE='22023'; END IF;
 IF asked.reply='answered' THEN
  SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND reply_to=p_turn ORDER BY seq LIMIT 1;
  RETURN sophia.personal_receipt('reply',(SELECT revision FROM sophia.personal_spaces WHERE owner_id=a),
   jsonb_build_object('turnId',t.id,'seq',t.seq));
 END IF;
 IF asked.reply<>'pending' OR NOT coalesce(asked.answering_claim=p_claim,false) THEN RETURN NULL; END IF;
 s:=sophia.personal_touch();
 t:=sophia.personal_append('sophia',sophia.personal_text(p_text,4000),p_turn);
 UPDATE sophia.personal_turns SET reply='answered' WHERE owner_id=a AND id=p_turn;
 -- A suggestion that repeats a note the person keeps, or one already offered, is not offered again.
 IF suggestion IS NOT NULL AND length(suggestion)<=90
  AND NOT EXISTS(SELECT 1 FROM sophia.personal_notes WHERE owner_id=a AND lower(body)=lower(suggestion))
  AND NOT EXISTS(SELECT 1 FROM sophia.personal_suggestions WHERE owner_id=a AND lower(body)=lower(suggestion)) THEN
  INSERT INTO sophia.personal_suggestions(owner_id,turn_id,body) VALUES(a,t.id,suggestion) RETURNING id INTO suggestion_id;
 END IF;
 RETURN sophia.personal_receipt('reply',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq,'suggestionId',suggestion_id));
END $$;

-- A welcome back is due: the last turn is more than an hour old and is not already such a welcome.
CREATE FUNCTION sophia.personal_welcome_due() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT t.created_at<now()-interval '1 hour' AND NOT (t.author='sophia' AND t.reply_to IS NULL)
   FROM sophia.personal_turns t WHERE t.owner_id=sophia.personal_owner() ORDER BY t.seq DESC LIMIT 1), false) $$;
REVOKE ALL ON FUNCTION sophia.personal_welcome_due() FROM PUBLIC;

-- What a welcome request is, for its key: whom it greets, as a digest (no name is kept in the request log).
CREATE FUNCTION sophia.personal_greeting_request(p_name text) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$ SELECT jsonb_build_object('name',sophia.personal_digest(coalesce(p_name,''))) $$;
REVOKE ALL ON FUNCTION sophia.personal_greeting_request(text) FROM PUBLIC;

-- resumePersonalSpace, first step, under the request's key: the key's receipt, once kept, answers every retry of it.
-- Otherwise, when a welcome is due and no attempt is getting one, this one claims it ({"claim": id}: the API then asks
-- the companion and records it under that claim); while an earlier attempt of this same request still holds the
-- claim, it says so ('{"writing":true}') and keeps nothing; when none is due, or another request has it, the receipt
-- saying nothing was written is kept under the key. The same key greeting someone else is another request: refused,
-- while its attempt runs, once let go and once kept.
CREATE FUNCTION sophia.begin_personal_greeting(p_key text, p_name text, p_replay_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=sophia.personal_greeting_request(p_name); prior jsonb;
 held_by sophia.personal_greeting_claims; held boolean; taken uuid;
BEGIN
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'resume',semantic);
 IF prior IS NOT NULL OR p_replay_only THEN RETURN prior; END IF;
 SELECT * INTO held_by FROM sophia.personal_greeting_claims WHERE owner_id=a;
 held:=FOUND;
 IF held AND held_by.request_key=p_key AND held_by.semantic<>semantic THEN
  RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 IF sophia.personal_welcome_due() THEN
  IF NOT held OR held_by.claim IS NULL OR held_by.claimed_at<now()-interval '2 minutes' THEN
   INSERT INTO sophia.personal_greeting_claims(owner_id,request_key,semantic,claim)
   VALUES(a,p_key,semantic,gen_random_uuid())
   ON CONFLICT (owner_id) DO UPDATE SET request_key=EXCLUDED.request_key, semantic=EXCLUDED.semantic,
    claim=EXCLUDED.claim, claimed_at=now()
   RETURNING claim INTO taken;
   RETURN jsonb_build_object('claim',taken);
  END IF;
  IF held_by.request_key=p_key THEN RETURN '{"writing":true}'; END IF;
 END IF;
 RETURN sophia.personal_remember(p_key,'resume',semantic,
  sophia.personal_receipt('resume',(SELECT revision FROM sophia.personal_spaces WHERE owner_id=a),'{}'));
END $$;

-- Sophia's welcome back after a quiet spell, second step, under the claim the first step gave: a turn of hers that
-- answers no message, written only by the attempt still holding the claim and only while one is still due; otherwise
-- nothing (turnId null). Either way the receipt is kept under the key, so a retry, however late, gets the same answer
-- and never a second welcome. An attempt whose claim lapsed and went to a later attempt of the same request, or was
-- let go after it, settles nothing ('{"writing":true}'): the request's next attempt does.
CREATE FUNCTION sophia.record_personal_greeting(p_key text, p_claim uuid, p_name text, p_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=sophia.personal_greeting_request(p_name); prior jsonb;
 held_by sophia.personal_greeting_claims; held boolean; s sophia.personal_spaces; t sophia.personal_turns; result jsonb;
BEGIN
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'resume',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO held_by FROM sophia.personal_greeting_claims WHERE owner_id=a;
 held:=FOUND;
 IF held AND held_by.claim=p_claim AND sophia.personal_welcome_due() THEN
  s:=sophia.personal_touch();
  t:=sophia.personal_append('sophia',sophia.personal_text(p_text,4000),NULL);
  result:=sophia.personal_receipt('resume',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq));
 ELSIF held AND held_by.claim IS DISTINCT FROM p_claim AND held_by.request_key=p_key THEN
  RETURN '{"writing":true}';
 ELSE
  result:=sophia.personal_receipt('resume',(SELECT revision FROM sophia.personal_spaces WHERE owner_id=a),'{}');
 END IF;
 DELETE FROM sophia.personal_greeting_claims WHERE owner_id=a AND claim=p_claim;
 RETURN sophia.personal_remember(p_key,'resume',semantic,result);
END $$;

-- The companion could not write the welcome: the attempt lets its claim go, so the same request may ask again at once;
-- the request (its key, whom it greets) stays, so the key can't come back greeting someone else. Only that claim goes; a
-- later attempt's stays.
CREATE FUNCTION sophia.release_personal_greeting(p_claim uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.personal_hold();
 UPDATE sophia.personal_greeting_claims SET claim=NULL WHERE owner_id=sophia.personal_owner() AND claim=p_claim;
END $$;

-- An attempt renews its claim's lease as it hands what to answer from to the companion, and every few seconds while the
-- companion answers, and goes on only while it holds the claim: so no other attempt takes the claim over meanwhile (the
-- companion has 60 s; a lease, two minutes), only one attempt asks, and one whose claim went (an erasure took it) is told
-- to stop. For a reply (renew_personal_reply) and a welcome (renew_personal_greeting).
CREATE FUNCTION sophia.renew_personal_reply(p_turn uuid, p_claim uuid) RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.personal_turns SET answering_since=now()
  WHERE owner_id=sophia.personal_owner() AND id=p_turn AND reply='pending' AND answering_claim=p_claim;
 RETURN FOUND;
END $$;

CREATE FUNCTION sophia.renew_personal_greeting(p_claim uuid) RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.personal_greeting_claims SET claimed_at=now() WHERE owner_id=sophia.personal_owner() AND claim=p_claim;
 RETURN FOUND;
END $$;

-- A call to the companion begins, in the space's epoch, which it returns (clearing the caller's calls a process that
-- went away left behind), and ends. erased_companion_calls says how many begun before the space's latest erasure are still in flight,
-- in any process, for the erasure to wait on; once none is, forget_erased_companion_calls lets every one of them go.
CREATE FUNCTION sophia.begin_companion_call(p_call uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 DELETE FROM sophia.personal_companion_calls
  WHERE owner_id=sophia.personal_owner() AND started_at<=now()-interval '2 minutes';
 INSERT INTO sophia.personal_companion_calls(owner_id,call_id,epoch)
  VALUES(sophia.personal_owner(),p_call,
   coalesce((SELECT epoch FROM sophia.personal_spaces WHERE owner_id=sophia.personal_owner()),0))
  RETURNING epoch $$;

CREATE FUNCTION sophia.end_companion_call(p_call uuid) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 DELETE FROM sophia.personal_companion_calls WHERE owner_id=sophia.personal_owner() AND call_id=p_call $$;

CREATE FUNCTION sophia.erased_companion_calls() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT count(*)::integer FROM sophia.personal_companion_calls c
  WHERE c.owner_id=sophia.personal_owner() AND c.started_at>now()-interval '2 minutes'
   AND c.epoch<coalesce((SELECT epoch FROM sophia.personal_spaces s WHERE s.owner_id=c.owner_id),0) $$;

CREATE FUNCTION sophia.forget_erased_companion_calls() RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 DELETE FROM sophia.personal_companion_calls c
  WHERE c.owner_id=sophia.personal_owner()
   AND c.epoch<coalesce((SELECT epoch FROM sophia.personal_spaces s WHERE s.owner_id=c.owner_id),0) $$;

-- The person's next turn for the companion to answer: the oldest one waiting (its wait not lapsed), while none is being
-- answered; or NULL. A conversation is answered one turn at a time, in order, each with the answers before it,
-- whichever processes are asked.
CREATE FUNCTION sophia.next_personal_reply() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT t.id FROM sophia.personal_turns t
  WHERE t.owner_id=sophia.personal_owner() AND t.author='person'
   AND sophia.personal_reply_state(t.reply,t.asked_at,t.answering_since)='pending'
   AND NOT EXISTS (SELECT 1 FROM sophia.personal_turns o
    WHERE o.owner_id=t.owner_id AND o.reply='pending' AND o.answering_claim IS NOT NULL
     AND o.answering_since>now()-interval '2 minutes')
  ORDER BY t.seq LIMIT 1 $$;

-- The API process about to ask the companion claims the pending turn first: its claim, which the reply or the failure
-- must carry, or NULL when another process is answering it (a retry reached another process, a restart), or it is not
-- the person's next turn to answer (next_personal_reply: one at a time, in order). Claims of a person are taken one at
-- a time (the space is held). A claim lapses after two minutes, as the wait does (personal_reply_state); asking again
-- clears it.
CREATE FUNCTION sophia.claim_personal_reply(p_turn uuid) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE taken uuid;
BEGIN
 PERFORM sophia.personal_hold();
 IF p_turn IS DISTINCT FROM sophia.next_personal_reply() THEN RETURN NULL; END IF;
 UPDATE sophia.personal_turns SET answering_since=now(), answering_claim=gen_random_uuid()
  WHERE owner_id=sophia.personal_owner() AND id=p_turn AND author='person' AND reply='pending'
   AND (answering_since IS NULL OR answering_since<now()-interval '2 minutes')
  RETURNING answering_claim INTO taken;
 RETURN taken;
END $$;

-- The companion could not answer: the turn says so, and the person may ask again. Only under the turn's claim: an
-- attempt whose claim lapsed fails nothing another attempt is answering.
CREATE FUNCTION sophia.fail_personal_reply(p_turn uuid, p_claim uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner();
BEGIN
 PERFORM 1 FROM sophia.personal_spaces WHERE owner_id=a FOR UPDATE;
 UPDATE sophia.personal_turns SET reply='failed'
  WHERE owner_id=a AND id=p_turn AND reply='pending' AND answering_claim=p_claim;
 IF FOUND THEN PERFORM sophia.personal_touch(); END IF;
END $$;

-- askPersonalAgain: a turn whose reply failed, or was lost (personal_reply_state), waits for one again from now.
CREATE FUNCTION sophia.retry_personal_turn(p_key text, p_turn uuid, p_replay_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('turnId',p_turn); prior jsonb;
 t sophia.personal_turns; s sophia.personal_spaces; stands text;
BEGIN
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'retry_turn',semantic);
 IF prior IS NOT NULL OR p_replay_only THEN RETURN prior; END IF;
 SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=p_turn;
 IF NOT FOUND OR t.author<>'person' THEN RAISE EXCEPTION 'Turn not found' USING ERRCODE='22023'; END IF;
 stands:=sophia.personal_reply_state(t.reply,t.asked_at,t.answering_since);
 IF stands<>'failed' THEN RAISE EXCEPTION 'Stale turn: it is %', stands USING ERRCODE='40001'; END IF;
 UPDATE sophia.personal_turns SET reply='pending', asked_at=now(), answering_since=NULL, answering_claim=NULL
  WHERE owner_id=a AND id=p_turn;
 s:=sophia.personal_touch();
 RETURN sophia.personal_remember(p_key,'retry_turn',semantic,
  sophia.personal_receipt('retry_turn',s.revision,jsonb_build_object('turnId',t.id,'seq',t.seq)));
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Notes.

-- decidePersonalSuggestion: keep Sophia's suggestion as a note in her words, or let it go (deleted). A suggestion
-- already let go reads as gone.
CREATE FUNCTION sophia.decide_personal_suggestion(p_key text, p_suggestion uuid, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb; prior jsonb; sg sophia.personal_suggestions; s sophia.personal_spaces;
 note_id uuid; asked uuid;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('keep','dismiss') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('suggestionId',p_suggestion,'decision',p_decision);
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'decide_suggestion',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 SELECT * INTO sg FROM sophia.personal_suggestions WHERE owner_id=a AND id=p_suggestion FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale suggestion: it is gone' USING ERRCODE='40001'; END IF;
 IF sg.state<>'open' THEN RAISE EXCEPTION 'Stale suggestion: it is already %', sg.state USING ERRCODE='40001'; END IF;
 IF p_decision='keep' THEN
  PERFORM sophia.personal_note_room();
  UPDATE sophia.personal_suggestions SET state='kept', decided_at=now() WHERE owner_id=a AND id=p_suggestion;
  SELECT reply_to INTO asked FROM sophia.personal_turns WHERE owner_id=a AND id=sg.turn_id;
  INSERT INTO sophia.personal_notes(owner_id,body,kept_by,from_turn,suggestion_id) VALUES(a,sg.body,'sophia',asked,sg.id)
  RETURNING id INTO note_id;
 ELSE
  DELETE FROM sophia.personal_suggestions WHERE owner_id=a AND id=p_suggestion;
 END IF;
 RETURN sophia.personal_remember(p_key,'decide_suggestion',semantic,
  sophia.personal_receipt('decide_suggestion',s.revision,jsonb_build_object('suggestionId',sg.id,'noteId',note_id)));
END $$;

-- keepPersonalNote: a line the person keeps from one of their own turns, in their words. Keeping exactly what Sophia
-- suggested for that turn keeps her suggestion (a suggestion of another turn doesn't count); a suggestion let go
-- meanwhile leaves the note theirs.
CREATE FUNCTION sophia.keep_personal_note(p_key text, p_text text, p_from_turn uuid, p_suggestion uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); body text:=sophia.personal_text(p_text,90); semantic jsonb; prior jsonb;
 s sophia.personal_spaces; sg sophia.personal_suggestions; kept_by text:='person'; note_id uuid;
BEGIN
 semantic:=jsonb_build_object('text',sophia.personal_digest(body),'fromTurn',p_from_turn,'suggestionId',p_suggestion);
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'keep_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 IF p_from_turn IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.personal_turns WHERE owner_id=a AND id=p_from_turn AND author='person') THEN
  RAISE EXCEPTION 'Turn not found' USING ERRCODE='22023'; END IF;
 PERFORM sophia.personal_note_room();
 IF p_suggestion IS NOT NULL THEN
  SELECT * INTO sg FROM sophia.personal_suggestions WHERE owner_id=a AND id=p_suggestion FOR UPDATE;
  IF FOUND AND sg.state='open' AND sg.body=body
   AND EXISTS(SELECT 1 FROM sophia.personal_turns WHERE owner_id=a AND id=sg.turn_id AND reply_to=p_from_turn) THEN
   UPDATE sophia.personal_suggestions SET state='kept', decided_at=now() WHERE owner_id=a AND id=sg.id;
   kept_by:='sophia';
  END IF;
 END IF;
 INSERT INTO sophia.personal_notes(owner_id,body,kept_by,from_turn,suggestion_id)
 VALUES(a,body,kept_by,p_from_turn,CASE WHEN kept_by='sophia' THEN p_suggestion END) RETURNING id INTO note_id;
 RETURN sophia.personal_remember(p_key,'keep_note',semantic,sophia.personal_receipt('keep_note',s.revision,
  jsonb_build_object('noteId',note_id,'suggestionId',CASE WHEN kept_by='sophia' THEN p_suggestion END)));
END $$;

-- forgetPersonalNote: a kept note is deleted (the undo of keeping it). A suggestion it kept is open again, and the keep
-- that wrote it keeps no digest of its words: a retry of that keep is told the note was forgotten.
CREATE FUNCTION sophia.forget_personal_note(p_key text, p_note uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('noteId',p_note); prior jsonb;
 s sophia.personal_spaces; n sophia.personal_notes;
BEGIN
 PERFORM sophia.personal_hold();
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
 UPDATE sophia.personal_requests SET semantic_request='{"forgotten":true}', receipt='{}'
  WHERE owner_id=a AND operation='keep_note' AND receipt->>'noteId'=p_note::text;
 RETURN sophia.personal_remember(p_key,'forget_note',semantic,
  sophia.personal_receipt('forget_note',s.revision,jsonb_build_object('noteId',p_note)));
END $$;

-- ---------------------------------------------------------------------------------------------------
-- The crossing.

-- carryPersonalNote: one kept note, exactly as written, to one project where its owner is an active member. A person
-- carries at most 2000 notes (those whose note was erased count too), so their carried notes are listed whole.
CREATE FUNCTION sophia.carry_personal_note(p_key text, p_note uuid, p_project uuid, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('noteId',p_note,'projectId',p_project); prior jsonb;
 s sophia.personal_spaces; n sophia.personal_notes; release_id uuid:=gen_random_uuid();
 shown text:=left(coalesce(nullif(sophia.personal_trim(coalesce(p_name,'')),''),'A member'),320);
BEGIN
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'carry_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM sophia.personal_releases WHERE owner_id=a)>=2000 THEN
  RAISE EXCEPTION 'Carried notes are full: one person carries at most 2000 notes' USING ERRCODE='54000'; END IF;
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
-- the owner's notes (as a new note when the space was erased since, which needs room for one: personal_note_room).
CREATE FUNCTION sophia.take_back_personal_release(p_key text, p_release uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('releaseId',p_release); prior jsonb;
 s sophia.personal_spaces; r sophia.personal_releases; note_id uuid;
BEGIN
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'take_back',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO r FROM sophia.personal_releases WHERE id=p_release AND owner_id=a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Release not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
 IF r.note_id IS NULL THEN PERFORM sophia.personal_note_room(); END IF;
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
-- carried. Every request keeps only its key, so a retry of any write from before, however late, can't write again: its
-- operation reads 'redacted', and it is dated at the erasure. No record of when or how the person wrote outlives the
-- erasure; what stays is a count and a version: the space's revision (it never goes back) and its turn order (the next
-- turn comes after every earlier one, so a reader's cursor stays valid), and this erasure's own request and receipt
-- (how many turns, notes and suggestions it deleted), for its own retries.
CREATE FUNCTION sophia.erase_personal_space(p_key text, p_confirm text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb:=jsonb_build_object('confirm',p_confirm); prior jsonb;
 s sophia.personal_spaces; turns bigint; notes bigint; suggestions bigint;
BEGIN
 IF p_confirm IS DISTINCT FROM 'delete' THEN RAISE EXCEPTION 'Erasing needs the word delete' USING ERRCODE='22023'; END IF;
 PERFORM sophia.personal_hold();
 prior:=sophia.personal_prior(p_key,'erase',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 UPDATE sophia.personal_spaces SET epoch=epoch+1 WHERE owner_id=a;
 UPDATE sophia.personal_releases SET note_id=NULL WHERE owner_id=a;
 DELETE FROM sophia.personal_greeting_claims WHERE owner_id=a;
 -- Calls in flight stay for the erasure to wait on (it forgets them after); one a process that went away left goes.
 DELETE FROM sophia.personal_companion_calls WHERE owner_id=a AND started_at<=now()-interval '2 minutes';
 DELETE FROM sophia.personal_notes WHERE owner_id=a;
 GET DIAGNOSTICS notes=ROW_COUNT;
 DELETE FROM sophia.personal_suggestions WHERE owner_id=a;
 GET DIAGNOSTICS suggestions=ROW_COUNT;
 DELETE FROM sophia.personal_turns WHERE owner_id=a;
 GET DIAGNOSTICS turns=ROW_COUNT;
 UPDATE sophia.personal_requests SET operation='redacted', semantic_request='{"redacted":true}', receipt='{}',
  created_at=now() WHERE owner_id=a;
 RETURN sophia.personal_remember(p_key,'erase',semantic,sophia.personal_receipt('erase',s.revision,
  jsonb_build_object('erased',jsonb_build_object('turns',turns,'notes',notes,'suggestions',suggestions))));
END $$;

REVOKE ALL ON FUNCTION sophia.personal_fence(bigint), sophia.renew_personal_reply(uuid,uuid), sophia.renew_personal_greeting(uuid),
 sophia.next_personal_reply(),
 sophia.begin_companion_call(uuid), sophia.end_companion_call(uuid), sophia.erased_companion_calls(),
 sophia.forget_erased_companion_calls(),
 sophia.send_personal_turn(text,text,boolean), sophia.record_personal_reply(uuid,uuid,text,text),
 sophia.claim_personal_reply(uuid), sophia.begin_personal_greeting(text,text,boolean), sophia.release_personal_greeting(uuid),
 sophia.fail_personal_reply(uuid,uuid), sophia.retry_personal_turn(text,uuid,boolean),
 sophia.record_personal_greeting(text,uuid,text,text),
 sophia.decide_personal_suggestion(text,uuid,text), sophia.keep_personal_note(text,text,uuid,uuid),
 sophia.forget_personal_note(text,uuid), sophia.carry_personal_note(text,uuid,uuid,text),
 sophia.take_back_personal_release(text,uuid), sophia.erase_personal_space(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.personal_fence(bigint), sophia.renew_personal_reply(uuid,uuid), sophia.renew_personal_greeting(uuid),
 sophia.next_personal_reply(),
 sophia.begin_companion_call(uuid), sophia.end_companion_call(uuid), sophia.erased_companion_calls(),
 sophia.forget_erased_companion_calls(),
 sophia.send_personal_turn(text,text,boolean), sophia.record_personal_reply(uuid,uuid,text,text),
 sophia.claim_personal_reply(uuid), sophia.begin_personal_greeting(text,text,boolean), sophia.release_personal_greeting(uuid),
 sophia.fail_personal_reply(uuid,uuid), sophia.retry_personal_turn(text,uuid,boolean),
 sophia.record_personal_greeting(text,uuid,text,text),
 sophia.personal_reply_state(text,timestamptz,timestamptz),
 sophia.decide_personal_suggestion(text,uuid,text), sophia.keep_personal_note(text,text,uuid,uuid),
 sophia.forget_personal_note(text,uuid), sophia.carry_personal_note(text,uuid,uuid,text),
 sophia.take_back_personal_release(text,uuid), sophia.erase_personal_space(text,text) TO sophia_api;

COMMIT;
