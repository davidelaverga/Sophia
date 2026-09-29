-- SMC-M01 (contract amendment A08): the mission ledger. Notes, proposals and decisions about the team's mission, each
-- a project source with its author and turn, over the canonical records that already exist.
-- * One authoritative ledger. The accepted mission stays in project_revisions and projects.mission_revision; a proposal
--   is a decisions row; a note is a mission_entries row whose text is a project source. projects.ledger_revision moves
--   with every note, proposal and decision, and with every change to note capture or a member's consent, separately
--   from the mission revision: a note is not a mission pivot.
-- * Authority comes from the caller's membership, never from a request field. Writes need admin or editor; a member
--   may always record their own note consent and forget a note made from their own turn. A voice write names its turn
--   (exchange and input epoch), and the functions re-check that it is the open exchange's current epoch and binds the
--   calling actor: a call made before the floor moved commits nothing.
-- * Voice notes are kept only when the project's note capture is on and the speaker's own consent is given. Nothing is
--   enabled by default: no row means capture off and consent unset. No transcript is stored anywhere.
-- * A voice decision binds to the exchange's single confirmation target: the same speaker, the same input epoch, the
--   same provider session, a later utterance than the one the proposal was put to them in, within five minutes. The
--   model never supplies a confirmation. A Studio decision is the member's own action.
-- * Corrections append and supersede; the original stays readable as history. A proposal cites the notes it names and
--   the notes whose words it repeats. Withdrawing a note erases its text and what was derived from it (its versions,
--   the proposals and decisions citing it, an accepted mission's frame), exactly as its preview lists; it keeps no
--   digest that could confirm a guess at it, and advances the project's eligibility revision, so live contexts are
--   rebuilt.
-- * Every write is idempotent per actor and key (mission_requests): the same request returns the stored receipt, a
--   changed request with the same key is refused, and a retry of one whose record was since forgotten is stale. Stale
--   revisions are conflicts, never last-writer-wins.
-- * New brief admission is retired in the API (410); sophia.admit_native_task and every brief record are unchanged.
-- Lock order: project, then the rows under it. 0001–0017 are not edited; media_assignments (0013) is replaced with the
-- same signature, adding the project's mission, ledger and eligibility revisions.
BEGIN;

ALTER TABLE sophia.projects ADD COLUMN ledger_revision bigint NOT NULL DEFAULT 1 CHECK(ledger_revision>0);

-- A proposal is a decisions row. `proposal` holds its immutable content; body_source_id holds the same text as a source.
ALTER TABLE sophia.decisions
 ADD COLUMN proposal jsonb CHECK(proposal IS NULL OR jsonb_typeof(proposal)='object'),
 ADD COLUMN proposed_by uuid,
 ADD COLUMN origin text CHECK(origin IS NULL OR origin IN ('voice','studio')),
 ADD COLUMN exchange_id uuid REFERENCES sophia.room_exchanges(id),
 ADD COLUMN input_epoch bigint CHECK(input_epoch IS NULL OR input_epoch>0),
 ADD COLUMN base_mission_revision bigint CHECK(base_mission_revision IS NULL OR base_mission_revision>0),
 ADD COLUMN supersedes_decision_id uuid,
 ADD COLUMN supporting_entry_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN decided_by uuid,
 ADD COLUMN decided_at timestamptz,
 ADD COLUMN decided_via text CHECK(decided_via IS NULL OR decided_via IN ('voice','studio')),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN ledger_revision bigint CHECK(ledger_revision IS NULL OR ledger_revision>0),
 ADD CONSTRAINT decisions_supersedes_fk FOREIGN KEY(project_id,supersedes_decision_id) REFERENCES sophia.decisions(project_id,id),
 ADD CONSTRAINT decisions_voice_turn CHECK((origin='voice')=(exchange_id IS NOT NULL AND input_epoch IS NOT NULL)),
 -- withdrawn: forgotten with a note it cited; its text is erased and it is neither pending nor standing.
 DROP CONSTRAINT decisions_state_check,
 ADD CONSTRAINT decisions_state_check CHECK(state IN ('proposed','accepted','rejected','superseded','withdrawn'));
CREATE INDEX decisions_by_state ON sophia.decisions(project_id,state,created_at);

-- One note: an observation, expectation, outcome, blocker, explanation hypothesis, scoped lesson candidate or
-- continuity note. By voice it is Sophia's paraphrase of the speaker's admitted turn, never an exact quotation.
CREATE TABLE sophia.mission_entries (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('observation','expectation','outcome','blocker','explanation','lesson_candidate','continuity')),
 epistemic text NOT NULL CHECK(epistemic IN ('reported','observed','inferred')),
 state text NOT NULL DEFAULT 'current' CHECK(state IN ('current','superseded','withdrawn')),
 source_id uuid NOT NULL,
 authored_by text NOT NULL CHECK(authored_by IN ('sophia','member')),
 actor_id uuid NOT NULL,
 origin text NOT NULL CHECK(origin IN ('voice','studio')),
 exchange_id uuid REFERENCES sophia.room_exchanges(id), input_epoch bigint CHECK(input_epoch IS NULL OR input_epoch>0),
 related_entry_id uuid, supersedes_entry_id uuid, goal_id uuid, decision_id uuid,
 ledger_revision bigint NOT NULL CHECK(ledger_revision>0),
 observed_at timestamptz NOT NULL DEFAULT now(), recorded_at timestamptz NOT NULL DEFAULT now(),
 changed_by uuid, changed_at timestamptz,
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,related_entry_id) REFERENCES sophia.mission_entries(project_id,id),
 FOREIGN KEY(project_id,supersedes_entry_id) REFERENCES sophia.mission_entries(project_id,id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,decision_id) REFERENCES sophia.decisions(project_id,id),
 CHECK((origin='voice')=(exchange_id IS NOT NULL AND input_epoch IS NOT NULL)),
 CHECK((origin='voice')=(authored_by='sophia'))
);
CREATE INDEX mission_entries_recent ON sophia.mission_entries(project_id,state,recorded_at DESC);

-- The single proposal an exchange may currently confirm by voice, and to whom and when it was put.
CREATE TABLE sophia.mission_confirmation_targets (
 exchange_id uuid PRIMARY KEY REFERENCES sophia.room_exchanges(id), project_id uuid NOT NULL,
 decision_id uuid NOT NULL, decision_revision bigint NOT NULL CHECK(decision_revision>0),
 input_epoch bigint NOT NULL CHECK(input_epoch>0), actor_id uuid NOT NULL,
 connection_generation bigint NOT NULL CHECK(connection_generation>0), utterance bigint NOT NULL CHECK(utterance>=0),
 presented_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 FOREIGN KEY(project_id,decision_id) REFERENCES sophia.decisions(project_id,id)
);

-- Note policy: the project's capture (admin) and each member's own consent. No row: capture off, consent unset.
CREATE TABLE sophia.mission_note_policies (
 project_id uuid PRIMARY KEY REFERENCES sophia.projects(id),
 capture text NOT NULL CHECK(capture IN ('off','automatic')),
 revision bigint NOT NULL CHECK(revision>0), changed_by uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sophia.mission_note_consents (
 project_id uuid NOT NULL, actor_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('accepted','declined')),
 revision bigint NOT NULL CHECK(revision>0), changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id), FOREIGN KEY(project_id,actor_id) REFERENCES sophia.project_members(project_id,actor_id)
);

-- Idempotency for every mission write: per actor and key, the operation, its semantic request and its receipt.
CREATE TABLE sophia.mission_requests (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 operation text NOT NULL, semantic_request jsonb NOT NULL, receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,actor_id,idempotency_key)
);

ALTER TABLE sophia.mission_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.mission_entries FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.mission_confirmation_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.mission_confirmation_targets FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.mission_note_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.mission_note_policies FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.mission_note_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.mission_note_consents FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.mission_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON sophia.mission_entries, sophia.mission_confirmation_targets, sophia.mission_note_policies,
 sophia.mission_note_consents TO sophia_api;
-- No write grant on any of these tables: the functions below are the only writers.

-- ---------------------------------------------------------------------------------------------------
-- Internal helpers (no grant).

-- The stored receipt of an earlier identical request, or NULL; a changed request under the same key is refused.
CREATE FUNCTION sophia.mission_prior(p_project uuid, p_key text, p_operation text, p_semantic jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.mission_requests;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.mission_requests WHERE project_id=p_project AND actor_id=sophia.actor_id() AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.operation<>p_operation THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 -- What the key wrote has been forgotten, and the request keeps no digest to compare a retry with: whatever the
 -- retry says, it is told that, never that it was saved.
 IF prior.semantic_request ? 'redacted' THEN
  RAISE EXCEPTION 'Stale request: what it wrote has since been forgotten' USING ERRCODE='40001'; END IF;
 IF prior.semantic_request<>p_semantic THEN
  RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 RETURN prior.receipt;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_prior(uuid,text,text,jsonb) FROM PUBLIC;

-- Advance the ledger revision and emit the write's event; the receipt's common fields.
CREATE FUNCTION sophia.mission_commit(p_project uuid, p_type text, p_entity_type text, p_entity uuid, p_summary text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; cursor_value bigint;
BEGIN
 UPDATE sophia.projects SET ledger_revision=ledger_revision+1 WHERE id=p_project RETURNING * INTO pr;
 cursor_value:=sophia.emit_project_event(p_project,p_type,p_entity_type,p_entity,pr.ledger_revision,p_summary);
 RETURN jsonb_build_object('projectId',p_project,'ledgerRevision',pr.ledger_revision,'missionRevision',pr.mission_revision,
  'eligibilityRevision',pr.eligibility_revision,'cursor',cursor_value::text);
END $$;
REVOKE ALL ON FUNCTION sophia.mission_commit(uuid,text,text,uuid,text) FROM PUBLIC;

-- A voice write's turn: an open exchange of this project whose current input epoch binds the calling actor. A call
-- made in an epoch the floor has since left is stale, even from the same speaker. The caller holds the project lock,
-- which every floor change also takes first, so the epoch read here cannot move before the write commits.
CREATE FUNCTION sophia.mission_turn(p_project uuid, p_turn jsonb) RETURNS sophia.room_exchanges LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges; epoch bigint;
BEGIN
 IF jsonb_typeof(p_turn->'exchangeId')<>'string' OR jsonb_typeof(p_turn->'inputEpoch')<>'number' THEN
  RAISE EXCEPTION 'Invalid turn' USING ERRCODE='22023'; END IF;
 epoch:=(p_turn->>'inputEpoch')::bigint;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=(p_turn->>'exchangeId')::uuid AND project_id=p_project;
 IF NOT FOUND OR e.state='ended' THEN RAISE EXCEPTION 'The exchange has ended' USING ERRCODE='40001'; END IF;
 IF e.state='paused' THEN RAISE EXCEPTION 'The exchange is paused' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.exchange_inputs WHERE exchange_id=e.id AND input_epoch=epoch AND actor_id=sophia.actor_id()) THEN
  RAISE EXCEPTION 'The speaker is not bound to that input epoch' USING ERRCODE='42501'; END IF;
 IF e.input_epoch<>epoch THEN RAISE EXCEPTION 'Stale turn: the floor has moved since this call' USING ERRCODE='40001'; END IF;
 RETURN e;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_turn(uuid,jsonb) FROM PUBLIC;

-- The calling actor's consent to have notes and proposals kept from their own turns.
CREATE FUNCTION sophia.mission_consent(p_project uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT state FROM sophia.mission_note_consents WHERE project_id=p_project AND actor_id=sophia.actor_id()),'unset') $$;
REVOKE ALL ON FUNCTION sophia.mission_consent(uuid) FROM PUBLIC;

CREATE FUNCTION sophia.mission_capture(p_project uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT capture FROM sophia.mission_note_policies WHERE project_id=p_project),'off') $$;
REVOKE ALL ON FUNCTION sophia.mission_capture(uuid) FROM PUBLIC;

-- Optional bounded text: NULL when absent, refused when present but empty or too long.
CREATE FUNCTION sophia.mission_text(p_value jsonb, p_max integer, p_required boolean) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)='null' THEN
  IF p_required THEN RAISE EXCEPTION 'Missing text' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF jsonb_typeof(p_value)<>'string' OR length(btrim(p_value#>>'{}')) NOT BETWEEN 1 AND p_max THEN
  RAISE EXCEPTION 'Invalid text' USING ERRCODE='22023'; END IF;
 RETURN btrim(p_value#>>'{}');
END $$;
REVOKE ALL ON FUNCTION sophia.mission_text(jsonb,integer,boolean) FROM PUBLIC;

-- A text's words: one Unicode form (NFKC, so a composed and a decomposed accent are the same letter), lowercased,
-- split at anything that is not a letter or digit.
CREATE FUNCTION sophia.mission_words(p_text text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT array_remove(regexp_split_to_array(lower(regexp_replace(normalize(coalesce(p_text,''),NFKC),'[^[:alnum:]]+',' ','g')),' '),'') $$;
REVOKE ALL ON FUNCTION sophia.mission_words(text) FROM PUBLIC;

-- Whether a text repeats a note's words: six of them in a row, or the whole of a note of three to five words. A note
-- of one or two words is too common to count.
CREATE FUNCTION sophia.mission_repeats(p_note text, p_text text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE w text[]:=sophia.mission_words(p_note); n integer:=cardinality(w);
 hay text:=' '||array_to_string(sophia.mission_words(p_text),' ')||' ';
BEGIN
 IF n<3 THEN RETURN false; END IF;
 IF n<6 THEN RETURN strpos(hay,' '||array_to_string(w,' ')||' ')>0; END IF;
 FOR i IN 1..n-5 LOOP
  IF strpos(hay,' '||array_to_string(w[i:i+5],' ')||' ')>0 THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_repeats(text,text) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- recordMissionEntry (A08): a note, or with correctsEntryId a correction that supersedes a current note.
CREATE FUNCTION sophia.record_mission_entry(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); body text; semantic jsonb; prior jsonb; turn jsonb:=p_request->'turn';
 corrects sophia.mission_entries; src sophia.source_objects; eid uuid:=gen_random_uuid(); receipt_value jsonb;
 observed timestamptz; related uuid:=(p_request->>'relatedEntryId')::uuid; goal uuid:=(p_request->>'goalId')::uuid;
 decision uuid:=(p_request->>'decisionId')::uuid; corrects_id uuid:=(p_request->>'correctsEntryId')::uuid;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_request->>'kind' IS NULL OR p_request->>'kind' NOT IN ('observation','expectation','outcome','blocker','explanation','lesson_candidate','continuity') THEN
  RAISE EXCEPTION 'Invalid note kind' USING ERRCODE='22023'; END IF;
 IF p_request->>'epistemic' IS NULL OR p_request->>'epistemic' NOT IN ('reported','observed','inferred') THEN
  RAISE EXCEPTION 'Invalid epistemic status' USING ERRCODE='22023'; END IF;
 body:=sophia.mission_text(p_request->'text',2000,true);
 observed:=CASE WHEN turn IS NULL AND p_request ? 'observedAt' AND jsonb_typeof(p_request->'observedAt')='string'
  THEN (p_request->>'observedAt')::timestamptz ELSE now() END;
 IF observed>now()+interval '1 minute' THEN RAISE EXCEPTION 'An observation cannot be in the future' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind',p_request->'kind','epistemic',p_request->'epistemic','text',encode(sha256(convert_to(body,'UTF8')),'hex'),
  'relatedEntryId',related,'goalId',goal,'decisionId',decision,'correctsEntryId',corrects_id,
  'observedAt',CASE WHEN turn IS NULL THEN p_request->'observedAt' END,'turn',turn);
 prior:=sophia.mission_prior(p_project,p_key,'record_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF turn IS NOT NULL THEN
  PERFORM sophia.mission_turn(p_project,turn);
  IF sophia.mission_capture(p_project)<>'automatic' THEN
   RAISE EXCEPTION 'Note capture is off for this project' USING ERRCODE='42501'; END IF;
  IF sophia.mission_consent(p_project)<>'accepted' THEN
   RAISE EXCEPTION 'Consent to keep notes from this speaker is not given' USING ERRCODE='42501'; END IF;
 END IF;
 IF related IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.mission_entries WHERE project_id=p_project AND id=related AND state<>'withdrawn') THEN
  RAISE EXCEPTION 'Related note not found' USING ERRCODE='22023'; END IF;
 IF goal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.goals WHERE project_id=p_project AND id=goal) THEN
  RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 IF decision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.decisions WHERE project_id=p_project AND id=decision) THEN
  RAISE EXCEPTION 'Decision not found' USING ERRCODE='22023'; END IF;
 IF corrects_id IS NOT NULL THEN
  SELECT * INTO corrects FROM sophia.mission_entries WHERE project_id=p_project AND id=corrects_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='22023'; END IF;
  IF corrects.state<>'current' THEN RAISE EXCEPTION 'Stale note: it is already %', corrects.state USING ERRCODE='40001'; END IF;
  -- A correction keeps what the note was about: its links carry over unless the correction names its own.
  related:=coalesce(related,corrects.related_entry_id); goal:=coalesce(goal,corrects.goal_id);
  decision:=coalesce(decision,corrects.decision_id);
 END IF;
 src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',body);
 IF corrects_id IS NOT NULL THEN
  UPDATE sophia.mission_entries SET state='superseded', changed_by=a, changed_at=now() WHERE project_id=p_project AND id=corrects_id;
  INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,corrects.source_id,src.id);
 END IF;
 receipt_value:=sophia.mission_commit(p_project,CASE WHEN corrects_id IS NULL THEN 'mission.entry_recorded' ELSE 'mission.entry_corrected' END,
  'mission_entry',eid,'mission.entry_'||(p_request->>'kind'));
 INSERT INTO sophia.mission_entries(project_id,id,kind,epistemic,source_id,authored_by,actor_id,origin,exchange_id,input_epoch,
  related_entry_id,supersedes_entry_id,goal_id,decision_id,ledger_revision,observed_at)
 VALUES(p_project,eid,p_request->>'kind',p_request->>'epistemic',src.id,CASE WHEN turn IS NULL THEN 'member' ELSE 'sophia' END,a,
  CASE WHEN turn IS NULL THEN 'studio' ELSE 'voice' END,(turn->>'exchangeId')::uuid,(turn->>'inputEpoch')::bigint,
  related,corrects_id,goal,decision,(receipt_value->>'ledgerRevision')::bigint,observed);
 receipt_value:=receipt_value||jsonb_build_object('status','committed','operation',CASE WHEN corrects_id IS NULL THEN 'record_note' ELSE 'correct_note' END,
  'entryId',eid,'decisionId',NULL,'decisionRevision',NULL,'decision',NULL,'sourceId',src.id,'sha256',src.sha256,
  'affected',CASE WHEN corrects_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(corrects_id) END);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'record_note',semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- Erase one source's text: the text is deleted, the source is ineligible, and nothing that could confirm a guess at the
-- text stays. Its SHA-256 becomes a random tombstone value and its length zero; the requests that wrote it keep no
-- digest of it, and their receipts none.
CREATE FUNCTION sophia.mission_erase_source(p_project uuid, p_source uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 DELETE FROM sophia.source_texts WHERE project_id=p_project AND source_id=p_source;
 UPDATE sophia.source_objects SET eligible=false, state='deleted', eligibility_revision=eligibility_revision+1, byte_length=0,
  sha256=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex')
  WHERE project_id=p_project AND id=p_source;
 UPDATE sophia.mission_requests SET semantic_request=(semantic_request-'text'-'proposal')||'{"redacted":true}',
  receipt=receipt||'{"sha256":null}'
  WHERE project_id=p_project AND receipt->>'sourceId'=p_source::text;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_erase_source(uuid,uuid) FROM PUBLIC;

-- What forgetting a note reaches, for this forgetter: the preview and the withdrawal both use it, so the member is shown
-- exactly what will go. A note and its corrections are one note's versions, oldest first.
-- * From the forgetter's own earliest wording in that history (an admin's: its first version) to its latest. A later
--   version is derived from an earlier one, whoever wrote it, so it goes too; another member's wording before the
--   forgetter's first stays theirs.
-- * Every proposal or decision citing any of those versions, pending or decided, the accepted mission included. A
--   proposal cites the notes it names and the notes whose words it repeats (propose_mission_change).
-- Versions and decisions already withdrawn are left out.
CREATE FUNCTION sophia.mission_forget_reach(p_project uuid, p_entry uuid, p_actor uuid, p_admin boolean,
 OUT entry_ids uuid[], OUT decision_ids uuid[]) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE chain uuid[]; authors uuid[]; v sophia.mission_entries; cur uuid; nxt uuid; here integer; first integer;
BEGIN
 SELECT * INTO v FROM sophia.mission_entries WHERE project_id=p_project AND id=p_entry;
 chain:=ARRAY[v.id]; authors:=ARRAY[v.actor_id]; cur:=v.supersedes_entry_id;
 WHILE cur IS NOT NULL LOOP
  SELECT * INTO v FROM sophia.mission_entries WHERE project_id=p_project AND id=cur;
  EXIT WHEN NOT FOUND;
  chain:=ARRAY[v.id]||chain; authors:=ARRAY[v.actor_id]||authors; cur:=v.supersedes_entry_id;
 END LOOP;
 here:=cardinality(chain); first:=here;
 FOR i IN 1..here LOOP
  IF p_admin OR authors[i]=p_actor THEN first:=i; EXIT; END IF;
 END LOOP;
 cur:=p_entry;
 LOOP
  SELECT id INTO nxt FROM sophia.mission_entries WHERE project_id=p_project AND supersedes_entry_id=cur;
  EXIT WHEN nxt IS NULL;
  chain:=chain||nxt; cur:=nxt;
 END LOOP;
 SELECT coalesce(array_agg(x.id ORDER BY x.ord),'{}') INTO entry_ids
  FROM unnest(chain[first:]) WITH ORDINALITY AS x(id,ord)
  JOIN sophia.mission_entries e ON e.project_id=p_project AND e.id=x.id WHERE e.state<>'withdrawn';
 SELECT coalesce(array_agg(d.id ORDER BY d.created_at,d.id),'{}') INTO decision_ids FROM sophia.decisions d
  WHERE d.project_id=p_project AND d.supporting_entry_ids && chain[first:] AND d.state<>'withdrawn';
END $$;
REVOKE ALL ON FUNCTION sophia.mission_forget_reach(uuid,uuid,uuid,boolean) FROM PUBLIC;

-- The note a member may forget: it exists, is not already withdrawn, and is theirs, or they are an admin.
CREATE FUNCTION sophia.mission_forgettable(p_project uuid, p_entry uuid) RETURNS sophia.mission_entries LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.mission_entries;
BEGIN
 SELECT * INTO e FROM sophia.mission_entries WHERE project_id=p_project AND id=p_entry;
 IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='22023'; END IF;
 IF NOT sophia.is_member(p_project) OR (e.actor_id<>sophia.actor_id() AND NOT sophia.is_admin(p_project)) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF e.state='withdrawn' THEN RAISE EXCEPTION 'Stale note: it is already withdrawn' USING ERRCODE='40001'; END IF;
 RETURN e;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_forgettable(uuid,uuid) FROM PUBLIC;

-- previewMissionWithdrawal (A08): what forgetting this note would erase, for the member about to confirm it.
CREATE FUNCTION sophia.preview_mission_withdrawal(p_project uuid, p_entry uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); r record;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM sophia.mission_forgettable(p_project,p_entry);
 SELECT * INTO r FROM sophia.mission_forget_reach(p_project,p_entry,a,sophia.is_admin(p_project));
 RETURN jsonb_build_object('entryId',p_entry,
  'ledgerRevision',(SELECT ledger_revision FROM sophia.projects WHERE id=p_project),
  'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'state',e.state,'text',t.body) ORDER BY x.ord),'[]')
   FROM unnest(r.entry_ids) WITH ORDINALITY AS x(id,ord) JOIN sophia.mission_entries e ON e.project_id=p_project AND e.id=x.id
   JOIN sophia.source_texts t ON t.project_id=e.project_id AND t.source_id=e.source_id),
  'decisions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'state',d.state,
    'statement',d.proposal->>'statement') ORDER BY x.ord),'[]')
   FROM unnest(r.decision_ids) WITH ORDINALITY AS x(id,ord) JOIN sophia.decisions d ON d.project_id=p_project AND d.id=x.id));
END $$;

-- withdrawMissionEntry (A08): forget a note and what was derived from it (mission_forget_reach). Its author or an
-- admin. With p_expected, the ids the member's preview listed (its versions, then the decisions), it erases only if
-- that is still exactly what it reaches, and is otherwise a stale conflict: nothing goes that they were not shown. Every proposal or decision reached becomes withdrawn with its text erased; an accepted mission's frame keeps
-- only its decision id, and the mission revision does not move: the frame is erased, not replaced. Every erased text
-- follows mission_erase_source. The project's eligibility revision moves, so a live provider context that read any of
-- it is rebuilt.
CREATE FUNCTION sophia.withdraw_mission_entry(p_project uuid, p_entry uuid, p_key text, p_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); semantic jsonb:=jsonb_strip_nulls(jsonb_build_object('entryId',p_entry,'expected',p_expected));
 prior jsonb; e sophia.mission_entries;
 v sophia.mission_entries; d sophia.decisions; receipt_value jsonb; r record; affected jsonb:='[]';
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 prior:=sophia.mission_prior(p_project,p_key,'withdraw_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 e:=sophia.mission_forgettable(p_project,p_entry);
 SELECT * INTO r FROM sophia.mission_forget_reach(p_project,p_entry,a,sophia.is_admin(p_project));
 IF p_expected IS NOT NULL AND p_expected IS DISTINCT FROM to_jsonb(r.entry_ids)||to_jsonb(r.decision_ids) THEN
  RAISE EXCEPTION 'Stale withdrawal: what it would erase changed since it was shown' USING ERRCODE='40001'; END IF;
 FOR v IN SELECT m.* FROM unnest(r.entry_ids) WITH ORDINALITY AS x(id,ord)
   JOIN sophia.mission_entries m ON m.project_id=p_project AND m.id=x.id ORDER BY x.ord LOOP
  UPDATE sophia.mission_entries SET state='withdrawn', changed_by=a, changed_at=now() WHERE project_id=p_project AND id=v.id;
  PERFORM sophia.mission_erase_source(p_project,v.source_id);
  affected:=affected||to_jsonb(v.id);
 END LOOP;
 FOR d IN SELECT m.* FROM unnest(r.decision_ids) WITH ORDINALITY AS x(id,ord)
   JOIN sophia.decisions m ON m.project_id=p_project AND m.id=x.id ORDER BY x.ord LOOP
  UPDATE sophia.decisions SET state='withdrawn', proposal=NULL, revision=revision+1 WHERE project_id=p_project AND id=d.id;
  PERFORM sophia.mission_erase_source(p_project,d.body_source_id);
  DELETE FROM sophia.mission_confirmation_targets WHERE project_id=p_project AND decision_id=d.id;
  IF d.kind='mission' THEN
   UPDATE sophia.project_revisions SET frame=jsonb_build_object('decisionId',d.id,'withdrawn',true)
    WHERE project_id=p_project AND frame->>'decisionId'=d.id::text;
  END IF;
  affected:=affected||to_jsonb(d.id);
 END LOOP;
 UPDATE sophia.projects SET eligibility_revision=eligibility_revision+1 WHERE id=p_project;
 receipt_value:=sophia.mission_commit(p_project,'mission.entry_withdrawn','mission_entry',p_entry,'mission.entry_withdrawn');
 receipt_value:=receipt_value||jsonb_build_object('status','committed','operation','withdraw_note','entryId',p_entry,'decisionId',NULL,
  'decisionRevision',NULL,'decision',NULL,'sourceId',e.source_id,'sha256',NULL,'affected',affected);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'withdraw_note',semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- The readable text of a proposal: its statement, then its optional fields.
CREATE FUNCTION sophia.proposal_text(p_kind text, p_proposal jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT concat_ws(E'\n', 'Proposed '||replace(p_kind,'_',' ')||': '||(p_proposal->>'statement'),
  'Purpose: '||(p_proposal->>'purpose'), 'Destination: '||(p_proposal->>'destination'), 'Starting point: '||(p_proposal->>'origin')) $$;
REVOKE ALL ON FUNCTION sophia.proposal_text(text,jsonb) FROM PUBLIC;

-- Make a pending proposal the exchange's single confirmation target, put to the calling speaker at this utterance.
CREATE FUNCTION sophia.mission_present(p_project uuid, d sophia.decisions, p_turn jsonb) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p_turn->'connectionGeneration')<>'number' OR jsonb_typeof(p_turn->'utterance')<>'number' THEN
  RAISE EXCEPTION 'Invalid turn' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.mission_confirmation_targets(exchange_id,project_id,decision_id,decision_revision,input_epoch,actor_id,
  connection_generation,utterance,presented_at,expires_at)
 VALUES((p_turn->>'exchangeId')::uuid,p_project,d.id,d.revision,(p_turn->>'inputEpoch')::bigint,sophia.actor_id(),
  (p_turn->>'connectionGeneration')::bigint,(p_turn->>'utterance')::bigint,now(),now()+interval '5 minutes')
 ON CONFLICT (exchange_id) DO UPDATE SET decision_id=EXCLUDED.decision_id, decision_revision=EXCLUDED.decision_revision,
  input_epoch=EXCLUDED.input_epoch, actor_id=EXCLUDED.actor_id, connection_generation=EXCLUDED.connection_generation,
  utterance=EXCLUDED.utterance, presented_at=EXCLUDED.presented_at, expires_at=EXCLUDED.expires_at;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_present(uuid,sophia.decisions,jsonb) FROM PUBLIC;

-- proposeMissionChange (A08): a mission, constraint or lesson proposal. Creating it accepts nothing.
CREATE FUNCTION sophia.propose_mission_change(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); kind text:=p_request->>'kind'; turn jsonb:=p_request->'turn'; proposal jsonb; semantic jsonb;
 prior jsonb; pr sophia.projects; src sophia.source_objects; did uuid:=gen_random_uuid(); d sophia.decisions; receipt_value jsonb;
 supersedes uuid:=(p_request->>'supersedesDecisionId')::uuid; supporting uuid[]; cited uuid[]; bad uuid;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF kind IS NULL OR kind NOT IN ('mission','constraint','lesson') THEN RAISE EXCEPTION 'Invalid proposal kind' USING ERRCODE='22023'; END IF;
 proposal:=jsonb_strip_nulls(jsonb_build_object('statement',sophia.mission_text(p_request->'statement',2000,true),
  'purpose',sophia.mission_text(p_request->'purpose',1000,false),'destination',sophia.mission_text(p_request->'destination',1000,false),
  'origin',sophia.mission_text(p_request->'origin',1000,false)));
 SELECT coalesce(array_agg(DISTINCT v::uuid),'{}') INTO supporting FROM jsonb_array_elements_text(coalesce(p_request->'supportingEntryIds','[]')) AS x(v);
 IF cardinality(supporting)>8 THEN RAISE EXCEPTION 'At most 8 supporting notes' USING ERRCODE='22023'; END IF;
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind',kind,'proposal',encode(sha256(convert_to(proposal::text,'UTF8')),'hex'),
  'supersedesDecisionId',supersedes,'supportingEntryIds',to_jsonb((SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM unnest(supporting) x)),'turn',turn);
 prior:=sophia.mission_prior(p_project,p_key,'propose',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF turn IS NOT NULL THEN
  PERFORM sophia.mission_turn(p_project,turn);
  IF sophia.mission_consent(p_project)<>'accepted' THEN
   RAISE EXCEPTION 'Consent to keep proposals from this speaker is not given' USING ERRCODE='42501'; END IF;
 END IF;
 -- A proposal replaces only an accepted decision of its own kind: a constraint or a lesson never retires the mission,
 -- whose projection only a mission acceptance moves.
 IF supersedes IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.decisions s WHERE s.project_id=p_project AND s.id=supersedes
   AND s.state='accepted' AND s.kind=(p_request->>'kind')) THEN
  RAISE EXCEPTION 'A proposal can replace only an accepted decision of its own kind' USING ERRCODE='22023'; END IF;
 SELECT x INTO bad FROM unnest(supporting) x WHERE NOT EXISTS(
  SELECT 1 FROM sophia.mission_entries e WHERE e.project_id=p_project AND e.id=x AND e.state<>'withdrawn') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Supporting note not found' USING ERRCODE='22023'; END IF;
 -- It cites the notes it names, and every note whose words one of its fields repeats, named or not (mission_repeats):
 -- forgetting any of them forgets it too. A run split across two fields is not a repeat, and a paraphrase that names
 -- nothing cites nothing.
 SELECT supporting||coalesce(array_agg(e.id ORDER BY e.recorded_at),'{}') INTO cited
  FROM sophia.mission_entries e JOIN sophia.source_texts t ON t.project_id=e.project_id AND t.source_id=e.source_id
  WHERE e.project_id=p_project AND e.state<>'withdrawn' AND NOT e.id=ANY(supporting)
   AND (sophia.mission_repeats(t.body,proposal->>'statement') OR sophia.mission_repeats(t.body,proposal->>'purpose')
    OR sophia.mission_repeats(t.body,proposal->>'destination') OR sophia.mission_repeats(t.body,proposal->>'origin'));
 IF cardinality(cited)>64 THEN RAISE EXCEPTION 'A proposal can rest on at most 64 notes' USING ERRCODE='22023'; END IF;
 src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',sophia.proposal_text(kind,proposal));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,e.source_id,src.id FROM sophia.mission_entries e WHERE e.project_id=p_project AND e.id=ANY(cited);
 receipt_value:=sophia.mission_commit(p_project,'mission.proposal_created','decision',did,'mission.proposal_'||kind);
 INSERT INTO sophia.decisions(project_id,id,revision,kind,state,body_source_id,proposal,proposed_by,origin,exchange_id,input_epoch,
  base_mission_revision,supersedes_decision_id,supporting_entry_ids,ledger_revision)
 VALUES(p_project,did,1,kind,'proposed',src.id,proposal,a,CASE WHEN turn IS NULL THEN 'studio' ELSE 'voice' END,
  (turn->>'exchangeId')::uuid,(turn->>'inputEpoch')::bigint,CASE WHEN kind='mission' THEN pr.mission_revision END,supersedes,cited,
  (receipt_value->>'ledgerRevision')::bigint) RETURNING * INTO d;
 IF turn IS NOT NULL THEN PERFORM sophia.mission_present(p_project,d,turn); END IF;
 receipt_value:=receipt_value||jsonb_build_object('status','proposed','operation','propose','entryId',NULL,'decisionId',did,
  'decisionRevision',1,'decision',NULL,'sourceId',src.id,'sha256',src.sha256,'affected','[]'::jsonb);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'propose',semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- presentMissionProposal (A08): Sophia read a pending proposal back to the speaker by voice; it becomes the target.
CREATE FUNCTION sophia.present_mission_proposal(p_project uuid, p_decision uuid, p_turn jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); d sophia.decisions;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM sophia.mission_turn(p_project,p_turn);
 SELECT * INTO d FROM sophia.decisions WHERE project_id=p_project AND id=p_decision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE='22023'; END IF;
 IF d.state<>'proposed' THEN RAISE EXCEPTION 'Stale proposal: it is already %', d.state USING ERRCODE='40001'; END IF;
 PERFORM sophia.mission_present(p_project,d,p_turn);
 RETURN jsonb_build_object('decisionId',d.id,'decisionRevision',d.revision,'expiresAt',now()+interval '5 minutes');
END $$;

-- The voice decision's binding (§4.3 of the M01 contract binding). Raises when the answer cannot be bound.
CREATE FUNCTION sophia.mission_bound(p_project uuid, d sophia.decisions, p_turn jsonb) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.mission_confirmation_targets;
BEGIN
 PERFORM sophia.mission_turn(p_project,p_turn);
 IF jsonb_typeof(p_turn->'connectionGeneration')<>'number' OR jsonb_typeof(p_turn->'utterance')<>'number' THEN
  RAISE EXCEPTION 'Confirmation required: this answer cannot be bound to a turn' USING ERRCODE='40001'; END IF;
 SELECT * INTO t FROM sophia.mission_confirmation_targets WHERE exchange_id=(p_turn->>'exchangeId')::uuid FOR UPDATE;
 IF NOT FOUND OR t.decision_id<>d.id THEN
  RAISE EXCEPTION 'Confirmation required: this proposal is not the one currently put to the room' USING ERRCODE='40001'; END IF;
 IF t.decision_revision<>d.revision THEN
  RAISE EXCEPTION 'Confirmation required: the proposal changed since it was put to the room' USING ERRCODE='40001'; END IF;
 IF t.expires_at<=now() THEN RAISE EXCEPTION 'Confirmation required: the proposal was put too long ago' USING ERRCODE='40001'; END IF;
 IF t.actor_id<>sophia.actor_id() OR t.input_epoch<>(p_turn->>'inputEpoch')::bigint THEN
  RAISE EXCEPTION 'Confirmation required: it was put to another speaker' USING ERRCODE='40001'; END IF;
 IF t.connection_generation<>(p_turn->>'connectionGeneration')::bigint THEN
  RAISE EXCEPTION 'Confirmation required: the conversation restarted since it was put' USING ERRCODE='40001'; END IF;
 IF (p_turn->>'utterance')::bigint<=t.utterance THEN
  RAISE EXCEPTION 'Confirmation required: the speaker has not answered it yet' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_bound(uuid,sophia.decisions,jsonb) FROM PUBLIC;

-- Accepting a mission proposal: append the accepted frame and move the mission revision, from the proposal's base only.
CREATE FUNCTION sophia.mission_accept(p_project uuid, d sophia.decisions) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; src sophia.source_objects; affected jsonb:='[]'; old uuid; named uuid;
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 IF d.kind='mission' THEN
  IF d.base_mission_revision IS DISTINCT FROM pr.mission_revision THEN
   RAISE EXCEPTION 'Stale mission revision: the accepted mission changed since this proposal' USING ERRCODE='40001'; END IF;
  SELECT * INTO src FROM sophia.source_objects WHERE project_id=p_project AND id=d.body_source_id;
  INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by)
  VALUES(p_project,pr.mission_revision+1,d.proposal||jsonb_build_object('decisionId',d.id,'sourceId',src.id,'sha256',src.sha256),sophia.actor_id());
  UPDATE sophia.projects SET mission_revision=mission_revision+1 WHERE id=p_project;
  FOR old IN UPDATE sophia.decisions SET state='superseded', revision=revision+1
   WHERE project_id=p_project AND kind='mission' AND state='accepted' AND id<>d.id RETURNING id LOOP
   affected:=affected||to_jsonb(old);
  END LOOP;
 END IF;
 IF d.supersedes_decision_id IS NOT NULL THEN
  -- Its own variable: a zero-row UPDATE ... INTO would leave a value from the loop above in place.
  UPDATE sophia.decisions SET state='superseded', revision=revision+1
   WHERE project_id=p_project AND id=d.supersedes_decision_id AND state='accepted' AND kind=d.kind RETURNING id INTO named;
  -- The decision it replaces must still stand (a mission's is already superseded above): if another acceptance
  -- replaced it first, this proposal no longer replaces anything, and accepting it would leave two in its place.
  IF named IS NULL AND NOT affected @> to_jsonb(ARRAY[d.supersedes_decision_id]) THEN
   RAISE EXCEPTION 'Stale proposal: the decision it replaces was already replaced' USING ERRCODE='40001'; END IF;
  IF named IS NOT NULL AND NOT affected @> to_jsonb(ARRAY[named]) THEN affected:=affected||to_jsonb(named); END IF;
 END IF;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION sophia.mission_accept(uuid,sophia.decisions) FROM PUBLIC;

-- decideMissionChange (A08): accept or reject one pending proposal at its current revision.
CREATE FUNCTION sophia.decide_mission_change(p_project uuid, p_decision uuid, p_key text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); choice text:=p_request->>'decision'; turn jsonb:=p_request->'turn'; semantic jsonb; prior jsonb;
 d sophia.decisions; affected jsonb:='[]'; receipt_value jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF choice IS NULL OR choice NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'expectedRevision')<>'number' THEN RAISE EXCEPTION 'Missing expected revision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('decisionId',p_decision,'decision',choice,'expectedRevision',p_request->'expectedRevision','turn',turn);
 prior:=sophia.mission_prior(p_project,p_key,'decide',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO d FROM sophia.decisions WHERE project_id=p_project AND id=p_decision FOR UPDATE;
 -- A withdrawn proposal's content is erased; it is still that proposal, and deciding it is stale.
 IF NOT FOUND OR (d.proposal IS NULL AND d.state<>'withdrawn') THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE='22023'; END IF;
 IF d.state<>'proposed' THEN RAISE EXCEPTION 'Stale proposal: it is already %', d.state USING ERRCODE='40001'; END IF;
 IF d.revision<>(p_request->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'Stale proposal revision' USING ERRCODE='40001'; END IF;
 IF turn IS NOT NULL THEN PERFORM sophia.mission_bound(p_project,d,turn); END IF;
 IF choice='accept' THEN affected:=sophia.mission_accept(p_project,d); END IF;
 UPDATE sophia.decisions SET state=CASE choice WHEN 'accept' THEN 'accepted' ELSE 'rejected' END, revision=revision+1,
  accepted_by=CASE choice WHEN 'accept' THEN a END, decided_by=a, decided_at=now(),
  decided_via=CASE WHEN turn IS NULL THEN 'studio' ELSE 'voice' END
  WHERE project_id=p_project AND id=p_decision RETURNING * INTO d;
 DELETE FROM sophia.mission_confirmation_targets WHERE project_id=p_project AND decision_id=p_decision;
 receipt_value:=sophia.mission_commit(p_project,'mission.decision_'||d.state,'decision',d.id,'mission.'||d.kind||'_'||d.state);
 receipt_value:=receipt_value||jsonb_build_object('status','committed','operation','decide','entryId',NULL,'decisionId',d.id,
  'decisionRevision',d.revision,'decision',d.state,'sourceId',d.body_source_id,'sha256',NULL,'affected',affected);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'decide',semantic,receipt_value);
 RETURN receipt_value;
END $$;

-- setMissionNotePolicy (A08): an admin turns the project's note capture on or off, at the revision they saw.
CREATE FUNCTION sophia.set_mission_note_policy(p_project uuid, p_capture text, p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pol sophia.mission_note_policies; current_revision bigint;
BEGIN
 IF a IS NULL OR NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only a project admin can change note capture' USING ERRCODE='42501'; END IF;
 IF p_capture IS NULL OR p_capture NOT IN ('off','automatic') THEN RAISE EXCEPTION 'Invalid capture' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.is_admin(p_project) THEN RAISE EXCEPTION 'Only a project admin can change note capture' USING ERRCODE='42501'; END IF;
 SELECT * INTO pol FROM sophia.mission_note_policies WHERE project_id=p_project FOR UPDATE;
 current_revision:=coalesce(pol.revision,0);
 IF p_expected_revision IS DISTINCT FROM current_revision THEN RAISE EXCEPTION 'Stale note policy revision' USING ERRCODE='40001'; END IF;
 INSERT INTO sophia.mission_note_policies(project_id,capture,revision,changed_by) VALUES(p_project,p_capture,current_revision+1,a)
 ON CONFLICT (project_id) DO UPDATE SET capture=EXCLUDED.capture, revision=EXCLUDED.revision, changed_by=EXCLUDED.changed_by, changed_at=now()
 RETURNING * INTO pol;
 -- The ledger revision moves too: a live guide re-reads the policy it speaks from (MediaAssignment.ledgerRevision).
 PERFORM sophia.mission_commit(p_project,'mission.note_policy_changed','project',p_project,'mission.capture_'||p_capture);
 RETURN jsonb_build_object('capture',pol.capture,'revision',pol.revision);
END $$;

-- setMissionNoteConsent (A08): a member accepts or declines notes and proposals kept from their own turns.
CREATE FUNCTION sophia.set_mission_note_consent(p_project uuid, p_state text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.mission_note_consents; before text;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Invalid consent' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT state INTO before FROM sophia.mission_note_consents WHERE project_id=p_project AND actor_id=a;
 INSERT INTO sophia.mission_note_consents(project_id,actor_id,state,revision) VALUES(p_project,a,p_state,1)
 ON CONFLICT (project_id,actor_id) DO UPDATE SET state=EXCLUDED.state,
  revision=sophia.mission_note_consents.revision+CASE WHEN sophia.mission_note_consents.state=EXCLUDED.state THEN 0 ELSE 1 END,
  changed_at=CASE WHEN sophia.mission_note_consents.state=EXCLUDED.state THEN sophia.mission_note_consents.changed_at ELSE now() END
 RETURNING * INTO c;
 -- A change moves the ledger revision, so a live guide re-reads what it may keep from this speaker; the same choice
 -- again changes nothing and says nothing.
 IF before IS DISTINCT FROM p_state THEN
  PERFORM sophia.mission_commit(p_project,'mission.note_consent_changed','project',p_project,'mission.consent_'||p_state);
 END IF;
 RETURN jsonb_build_object('state',c.state,'revision',c.revision);
END $$;

REVOKE ALL ON FUNCTION sophia.record_mission_entry(uuid,text,jsonb), sophia.withdraw_mission_entry(uuid,uuid,text,jsonb),
 sophia.preview_mission_withdrawal(uuid,uuid),
 sophia.propose_mission_change(uuid,text,jsonb), sophia.present_mission_proposal(uuid,uuid,jsonb),
 sophia.decide_mission_change(uuid,uuid,text,jsonb), sophia.set_mission_note_policy(uuid,text,bigint),
 sophia.set_mission_note_consent(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.record_mission_entry(uuid,text,jsonb), sophia.withdraw_mission_entry(uuid,uuid,text,jsonb),
 sophia.preview_mission_withdrawal(uuid,uuid),
 sophia.propose_mission_change(uuid,text,jsonb), sophia.present_mission_proposal(uuid,uuid,jsonb),
 sophia.decide_mission_change(uuid,uuid,text,jsonb), sophia.set_mission_note_policy(uuid,text,bigint),
 sophia.set_mission_note_consent(uuid,text) TO sophia_api;

-- ---------------------------------------------------------------------------------------------------
-- media_assignments (0013) with the project's mission, ledger and eligibility revisions: the bridge refreshes Sophia's
-- context when the ledger moves and rebuilds it when eligibility narrows. Otherwise 0013's text.
CREATE OR REPLACE FUNCTION sophia.media_assignments() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('exchangeId',e.id,'projectId',e.project_id,'roomId',e.room_id,'state',e.state,
   'pauseReason',e.pause_reason,'inputEpoch',e.input_epoch,'inputActorId',i.actor_id,'playbackEpoch',e.playback_epoch,
   'observationEpoch',e.observation_epoch,'allowVision',e.allow_vision,
   'looking',CASE WHEN e.look_identity IS NULL THEN NULL ELSE jsonb_build_object('participantIdentity',e.look_identity,'source',e.look_source) END,
   'roomRevision',r.revision,'quiesceRequestId',q.id,
   'missionRevision',pr.mission_revision,'ledgerRevision',pr.ledger_revision,'eligibilityRevision',pr.eligibility_revision,
   'results',(SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',j.id,'resultRevision',j.result_revision,'kind','draft_brief')
      ORDER BY src.created_at),'[]')
     FROM sophia.jobs j JOIN sophia.source_objects src ON src.project_id=j.project_id AND src.id=j.result_source_id
     WHERE j.project_id=e.project_id AND j.kind='draft_brief' AND j.state='succeeded' AND src.created_at>=e.opened_at
      AND NOT EXISTS(SELECT 1 FROM sophia.exchange_announcements x WHERE x.exchange_id=e.id AND x.job_id=j.id
       AND x.result_revision=j.result_revision))) ORDER BY e.room_id),'[]')
  FROM sophia.room_exchanges e JOIN sophia.room_state r ON r.id=e.room_id JOIN sophia.projects pr ON pr.id=e.project_id
  LEFT JOIN sophia.exchange_inputs i ON i.exchange_id=e.id AND i.input_epoch=e.input_epoch
  LEFT JOIN LATERAL (SELECT id FROM sophia.room_quiesce_requests q WHERE q.exchange_id=e.id AND q.acked_at IS NULL
   ORDER BY q.requested_at DESC LIMIT 1) q ON true
  WHERE e.state<>'ended');
END $$;

-- Wake the bridge's assignment poll (0013's channel and payload: a room id) when a project with a live exchange moves
-- its mission, ledger or eligibility revision. Above all a withdrawal: the bridge rebuilds its provider context at
-- once, instead of when the poll's wait runs out. Delivered at commit, like every NOTIFY.
CREATE FUNCTION sophia.notify_media_revisions() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE r uuid;
BEGIN
 FOR r IN SELECT DISTINCT room_id FROM sophia.room_exchanges WHERE project_id=NEW.id AND state<>'ended' LOOP
  PERFORM pg_notify('sophia_media', r::text);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.notify_media_revisions() FROM PUBLIC;
CREATE TRIGGER projects_media_revisions AFTER UPDATE OF mission_revision, ledger_revision, eligibility_revision
 ON sophia.projects FOR EACH ROW
 WHEN ((OLD.mission_revision, OLD.ledger_revision, OLD.eligibility_revision)
  IS DISTINCT FROM (NEW.mission_revision, NEW.ledger_revision, NEW.eligibility_revision))
 EXECUTE FUNCTION sophia.notify_media_revisions();

COMMIT;
