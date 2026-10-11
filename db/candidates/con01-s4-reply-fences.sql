-- CON-01 G2-S4: a reply's answer published under its fences, and a source's withdrawal reaching what read it, a
-- review-only candidate (CX-0100/CX-0101 N4: CC-0100). NOT a migration: it sits outside db/migrations so no runner
-- applies it, and its number waits for the final census (G2_IMPACT_INVENTORY §7.1). Its own test applies it to a
-- disposable database after every migration and the S1, S2 and S3 candidates.
-- * Dormant. No role, login, grant or caller: nothing calls these functions and no row is inserted. Both tables are
--   closed (row security on, no policy, no grant). The text a test publishes is supplied by the test (L1), not by a
--   native result or a provider.
-- * A publication is its saved reply, that reply's recorded assembly attempt, and the reference of the trusted native
--   result capture will supply. Project, conversation and asker are read from the reply row, never from a caller.
-- * Locks, in one order (N2's, extended): the project (FOR UPDATE to write, FOR SHARE to check), its conversation (the
--   same), the messages the attempt read (FOR SHARE, by seq), the reply (FOR UPDATE), the asker's membership (FOR SHARE),
--   the reply's claims and contexts (FOR UPDATE), the sources the attempt read (FOR SHARE, by id), then its answer and
--   suppressions. Check and publication run in READ COMMITTED and decide only after every lock: a source change that
--   committed first is seen, and one that did not waits until this transaction ends. Writers that lock the project first
--   are serialized there; a source or membership writer that does not is held by those rows' own locks.
-- * A source trigger would run with its source row held and then need the project: the reverse of this order, unless
--   every source writer locks the project FOR UPDATE before it changes a source. That protocol, and its owner's
--   acknowledgment, come before any such trigger. Here `conversation_source_out` is only called directly.
-- * Privacy dominates replay: once a reply has an answer, nothing is written for it again, and an answer whose text went
--   replays as withdrawn, for any input. A suppression is permanent: re-eligibility never revives what it reached, and
--   it only ever gains a tombstone. A source's withdrawal reaches the answers derived from an answer it withdraws, by
--   0048's rule for a withdrawn message. The
--   allowance ledger (S2) is never touched: no settlement, release or reconciliation, so an uncertain call stays counted.
-- * N2's invariants change here and nowhere else (CC-0100 §3, CC-0101, CX-0101); N2's own file is unchanged.
--   `conversation_context_kept()` is replaced, adding three rules, and the context length CHECK is replaced under its
--   own name. A dependency's retained source hash can go, once, to the tombstone its suppression recorded. A context's
--   digest can go, once, to the tombstone its erasure recorded, and its length to 0 with it, once its body is gone: when
--   a message it read loses its text or a source it read is suppressed, whatever the context's state (recorded,
--   scrubbed or superseded). A body still held keeps a length of 1 to 126976 bytes, as before. After a privacy erasure
--   nothing that could confirm a guess at the text stays (0018's rule): ids, seqs, revisions and coverage counts stay,
--   as governed delivery metadata, with the permanent suppression and erasure rows.

-- One answer per reply: what published it, its message, its text's hash until that text goes, and whether the project's
-- ledger had moved since the context was recorded (an ordinary replacement, never a privacy failure).
CREATE TABLE sophia.conversation_reply_answers (
 project_id uuid NOT NULL, reply_id uuid NOT NULL, attempt smallint NOT NULL,
 result_ref uuid NOT NULL UNIQUE,
 answer_id uuid NOT NULL,
 text_sha256 text CHECK(text_sha256 ~ '^[0-9a-f]{64}$'),
 context_changed boolean NOT NULL,
 published_at timestamptz NOT NULL,
 withdrawn_at timestamptz,
 withdrawn_by text CHECK(withdrawn_by IN ('author','admin','source')),
 PRIMARY KEY(project_id,reply_id), UNIQUE(project_id,answer_id),
 FOREIGN KEY(project_id,reply_id,attempt) REFERENCES sophia.conversation_reply_contexts(project_id,reply_id,attempt),
 FOREIGN KEY(project_id,answer_id) REFERENCES sophia.conversation_messages(project_id,id),
 CHECK((text_sha256 IS NULL)=(withdrawn_at IS NOT NULL)),
 CHECK((withdrawn_at IS NULL)=(withdrawn_by IS NULL))
);

-- A dependency a source's withdrawal reached: the reply's attempt that read it, why, and the tombstone its retained hash
-- became when the source no longer holds that hash. Permanent.
CREATE TABLE sophia.conversation_reply_suppressions (
 project_id uuid NOT NULL, reply_id uuid NOT NULL, attempt smallint NOT NULL, source_id uuid NOT NULL,
 reason text NOT NULL CHECK(reason IN ('source_withdrawn','source_out_of_scope')),
 tombstone text CHECK(tombstone ~ '^[0-9a-f]{64}$'),
 suppressed_at timestamptz NOT NULL,
 PRIMARY KEY(project_id,reply_id,attempt,source_id),
 FOREIGN KEY(project_id,reply_id,attempt) REFERENCES sophia.conversation_reply_contexts(project_id,reply_id,attempt),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);

-- A context whose digest was erased: why, and the tombstone it became. Permanent, one per attempt (the first cause).
CREATE TABLE sophia.conversation_context_erasures (
 project_id uuid NOT NULL, reply_id uuid NOT NULL, attempt smallint NOT NULL,
 reason text NOT NULL CHECK(reason IN ('message_withdrawn','source_withdrawn','source_out_of_scope')),
 tombstone text NOT NULL CHECK(tombstone ~ '^[0-9a-f]{64}$'),
 erased_at timestamptz NOT NULL,
 PRIMARY KEY(project_id,reply_id,attempt),
 FOREIGN KEY(project_id,reply_id,attempt) REFERENCES sophia.conversation_reply_contexts(project_id,reply_id,attempt)
);

-- An answer's identity never changes; its hash goes only once, with when and by whom. A suppression changes only once, to
-- take a tombstone when the source it reached later stops holding the hash (CX-0102); an erasure never changes. Nothing
-- here is deleted or truncated.
CREATE FUNCTION sophia.conversation_fences_kept() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE was jsonb; now jsonb;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE')
    OR TG_TABLE_NAME NOT IN ('conversation_reply_answers','conversation_reply_suppressions') THEN
  RAISE EXCEPTION 'fences_kept' USING ERRCODE='55000'; END IF;
 was:=to_jsonb(OLD); now:=to_jsonb(NEW);
 IF TG_TABLE_NAME='conversation_reply_suppressions' THEN
  IF ((was-'tombstone')=(now-'tombstone') AND OLD.tombstone IS NULL AND NEW.tombstone IS NOT NULL) IS NOT TRUE THEN
   RAISE EXCEPTION 'fences_kept' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 END IF;
 IF ((was-'text_sha256'-'withdrawn_at'-'withdrawn_by')<>(now-'text_sha256'-'withdrawn_at'-'withdrawn_by')
   OR (now->'text_sha256' IS DISTINCT FROM was->'text_sha256' AND jsonb_typeof(now->'text_sha256')<>'null')
   OR (OLD.withdrawn_at IS NOT NULL AND (was->'withdrawn_at',was->'withdrawn_by')
     IS DISTINCT FROM (now->'withdrawn_at',now->'withdrawn_by'))) IS NOT FALSE THEN
  RAISE EXCEPTION 'fences_kept' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversation_reply_answers_kept BEFORE UPDATE OR DELETE ON sophia.conversation_reply_answers
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_fences_kept();
CREATE TRIGGER conversation_reply_suppressions_kept BEFORE UPDATE OR DELETE ON sophia.conversation_reply_suppressions
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_fences_kept();
CREATE TRIGGER conversation_fences_tables_kept BEFORE TRUNCATE ON sophia.conversation_reply_answers
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.conversation_fences_kept();
CREATE TRIGGER conversation_fences_tables_kept BEFORE TRUNCATE ON sophia.conversation_reply_suppressions
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.conversation_fences_kept();
CREATE TRIGGER conversation_context_erasures_kept BEFORE UPDATE OR DELETE ON sophia.conversation_context_erasures
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_fences_kept();
CREATE TRIGGER conversation_fences_tables_kept BEFORE TRUNCATE ON sophia.conversation_context_erasures
 FOR EACH STATEMENT EXECUTE FUNCTION sophia.conversation_fences_kept();

-- N2's guard (con01-s3), replaced with three rules added. A context's context_hash may change once, only to the
-- tombstone its erasure recorded, and its byte_length only to 0, only with that erasure and no body (N2 refused any
-- change to either). A dependency's sha256 may change once, only to the tombstone its suppression recorded, and
-- nothing else in the row (N2 refused every update). Every other rule is N2's, unchanged.
CREATE OR REPLACE FUNCTION sophia.conversation_context_kept() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia AS $$
DECLARE was jsonb; now jsonb;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'context_kept' USING ERRCODE='55000'; END IF;
 was:=to_jsonb(OLD); now:=to_jsonb(NEW);
 IF TG_TABLE_NAME='conversation_assembly_claims' THEN
  IF (was->'project_id',was->'reply_id',was->'attempt',was->'lease_token',was->'claimed_at',was->'lease_expires_at')
     IS DISTINCT FROM (now->'project_id',now->'reply_id',now->'attempt',now->'lease_token',now->'claimed_at',now->'lease_expires_at')
   OR (OLD.outcome IS NOT NULL AND (was->'outcome',was->'outcome_reason',was->'outcome_at')
     IS DISTINCT FROM (now->'outcome',now->'outcome_reason',now->'outcome_at'))
   OR (OLD.begun_xid IS NOT NULL AND (was-'outcome'-'outcome_reason'-'outcome_at')<>(now-'outcome'-'outcome_reason'-'outcome_at'))
  THEN RAISE EXCEPTION 'context_kept' USING ERRCODE='55000'; END IF;
 ELSIF TG_TABLE_NAME='conversation_reply_contexts' THEN
  IF (was-'body'-'state'-'scrubbed_at'-'scrubbed_by'-'context_hash'-'byte_length')
     <>(now-'body'-'state'-'scrubbed_at'-'scrubbed_by'-'context_hash'-'byte_length')
   OR (now->'body' IS DISTINCT FROM was->'body' AND jsonb_typeof(now->'body')<>'null')
   OR (OLD.scrubbed_at IS NOT NULL AND (was->'scrubbed_at',was->'scrubbed_by') IS DISTINCT FROM (now->'scrubbed_at',now->'scrubbed_by'))
   OR (was->>'state'<>now->>'state' AND NOT (was->>'state'='recorded' AND now->>'state'='superseded'))
   -- N4 (CX-0101): the one change a context's digest admits, and the one its length admits.
   OR (OLD.context_hash IS DISTINCT FROM NEW.context_hash AND NOT EXISTS(SELECT 1 FROM sophia.conversation_context_erasures e
     WHERE e.project_id=OLD.project_id AND e.reply_id=OLD.reply_id AND e.attempt=OLD.attempt
      AND e.tombstone=NEW.context_hash))
   OR (OLD.byte_length IS DISTINCT FROM NEW.byte_length AND NOT (NEW.byte_length=0 AND NEW.body IS NULL
     AND EXISTS(SELECT 1 FROM sophia.conversation_context_erasures e
      WHERE e.project_id=OLD.project_id AND e.reply_id=OLD.reply_id AND e.attempt=OLD.attempt)))
  THEN RAISE EXCEPTION 'context_kept' USING ERRCODE='55000'; END IF;
 ELSIF TG_TABLE_NAME='conversation_reply_messages' THEN
  IF (was-'body_sha256')<>(now-'body_sha256') OR (now->'body_sha256' IS DISTINCT FROM was->'body_sha256'
    AND jsonb_typeof(now->'body_sha256')<>'null') THEN
   RAISE EXCEPTION 'context_kept' USING ERRCODE='55000'; END IF;
 ELSIF TG_TABLE_NAME='conversation_reply_sources' THEN
  -- N4 (CC-0100 §3): the one change a dependency admits.
  IF ((was-'sha256')=(now-'sha256') AND OLD.sha256 IS DISTINCT FROM NEW.sha256
    AND EXISTS(SELECT 1 FROM sophia.conversation_reply_suppressions s WHERE s.project_id=OLD.project_id
     AND s.reply_id=OLD.reply_id AND s.attempt=OLD.attempt AND s.source_id=OLD.source_id AND s.tombstone=NEW.sha256))
    IS NOT TRUE THEN
   RAISE EXCEPTION 'context_kept' USING ERRCODE='55000'; END IF;
 ELSE
  RAISE EXCEPTION 'context_kept' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;

-- N2's length CHECK, replaced under its own name (found by what it says, as N3 does for 0048's): a context with its body
-- is 1 to 126976 bytes, as before; 0 only without one. The guard above admits 0 only with the context's erasure.
DO $$
DECLARE n text;
BEGIN
 SELECT conname INTO STRICT n FROM pg_catalog.pg_constraint
  WHERE conrelid='sophia.conversation_reply_contexts'::regclass AND contype='c'
   AND pg_catalog.pg_get_constraintdef(oid)='CHECK (((byte_length >= 1) AND (byte_length <= 126976)))';
 EXECUTE format('ALTER TABLE sophia.conversation_reply_contexts DROP CONSTRAINT %I, ADD CONSTRAINT %I CHECK('
  '(byte_length BETWEEN 1 AND 126976) OR (byte_length=0 AND body IS NULL))', n, n);
END $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Internal helpers (no grant).

-- The reply and the rows its verdict reads, locked in the order above. Which rows those are is read first, unlocked:
-- the reply's project, conversation, asking message and asker never change, and an attempt's recorded messages and
-- sources are immutable but for a scrubbed hash.
CREATE FUNCTION sophia.conversation_fences_locked(p_reply uuid, p_attempt integer, p_write boolean)
RETURNS sophia.conversation_replies LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies;
BEGIN
 SELECT * INTO r FROM sophia.conversation_replies WHERE id=p_reply;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_reply' USING ERRCODE='22023'; END IF;
 IF p_write THEN
  PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
  PERFORM 1 FROM sophia.conversations WHERE project_id=r.project_id AND id=r.conversation_id FOR UPDATE;
 ELSE
  PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR SHARE;
  PERFORM 1 FROM sophia.conversations WHERE project_id=r.project_id AND id=r.conversation_id FOR SHARE;
 END IF;
 PERFORM 1 FROM sophia.conversation_messages m
  WHERE m.project_id=r.project_id AND (m.id=r.message_id OR m.id IN (SELECT x.message_id
   FROM sophia.conversation_reply_messages x WHERE x.project_id=r.project_id AND x.reply_id=r.id AND x.attempt=p_attempt))
  ORDER BY m.seq FOR SHARE;
 SELECT * INTO r FROM sophia.conversation_replies WHERE project_id=r.project_id AND id=p_reply FOR UPDATE;
 PERFORM 1 FROM sophia.project_members WHERE project_id=r.project_id AND actor_id=r.asked_by FOR SHARE;
 PERFORM 1 FROM sophia.conversation_assembly_claims WHERE project_id=r.project_id AND reply_id=r.id
  ORDER BY attempt FOR UPDATE;
 PERFORM 1 FROM sophia.conversation_reply_contexts WHERE project_id=r.project_id AND reply_id=r.id
  ORDER BY attempt FOR UPDATE;
 PERFORM 1 FROM sophia.source_objects o
  WHERE o.project_id=r.project_id AND o.id IN (SELECT s.source_id FROM sophia.conversation_reply_sources s
   WHERE s.project_id=r.project_id AND s.reply_id=r.id AND s.attempt=p_attempt)
  ORDER BY o.id FOR SHARE;
 RETURN r;
END $$;

-- Why the attempt's recorded context may not reach anyone now, or NULL, and whether the project's ledger moved since it
-- was recorded. Read under the locks above. Every check that comes out NULL refuses.
CREATE FUNCTION sophia.conversation_reply_verdict(r sophia.conversation_replies, x sophia.conversation_reply_contexts,
 OUT o_privacy text, OUT o_changed boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE p sophia.projects; c sophia.conversations;
BEGIN
 SELECT * INTO p FROM sophia.projects WHERE id=x.project_id;
 SELECT * INTO c FROM sophia.conversations WHERE project_id=x.project_id AND id=r.conversation_id;
 SELECT s.reason INTO o_privacy FROM sophia.conversation_reply_suppressions s
  WHERE s.project_id=x.project_id AND s.reply_id=x.reply_id AND s.attempt=x.attempt
  ORDER BY s.suppressed_at, s.source_id LIMIT 1;
 IF o_privacy IS NULL AND EXISTS(SELECT 1 FROM sophia.conversation_context_erasures e
   WHERE e.project_id=x.project_id AND e.reply_id=x.reply_id AND e.attempt=x.attempt) THEN
  o_privacy:='source_withdrawn';
 END IF;
 IF o_privacy IS NULL THEN
  o_privacy:=CASE
   WHEN c.state IS DISTINCT FROM 'open' THEN 'conversation_erased'
   WHEN NOT EXISTS(SELECT 1 FROM sophia.conversation_messages m WHERE m.project_id=r.project_id AND m.id=r.message_id
     AND m.conversation_id=r.conversation_id AND m.seq=r.cutoff_seq AND m.author='member' AND m.body IS NOT NULL)
    THEN 'source_withdrawn'
   WHEN c.erasure_revision IS DISTINCT FROM x.erasure_revision THEN 'source_withdrawn'
   WHEN EXISTS(SELECT 1 FROM sophia.conversation_reply_messages m
     LEFT JOIN sophia.conversation_messages cm ON cm.project_id=m.project_id AND cm.id=m.message_id
    WHERE m.project_id=x.project_id AND m.reply_id=x.reply_id AND m.attempt=x.attempt AND cm.body IS NULL)
    THEN 'source_withdrawn'
   WHEN EXISTS(SELECT 1 FROM sophia.conversation_reply_sources s
     LEFT JOIN sophia.source_objects o ON o.project_id=s.project_id AND o.id=s.source_id
    WHERE s.project_id=x.project_id AND s.reply_id=x.reply_id AND s.attempt=x.attempt
     AND NOT coalesce(o.scope='project', false))
    THEN 'source_out_of_scope'
   WHEN EXISTS(SELECT 1 FROM sophia.conversation_reply_sources s
     LEFT JOIN sophia.source_objects o ON o.project_id=s.project_id AND o.id=s.source_id
    WHERE s.project_id=x.project_id AND s.reply_id=x.reply_id AND s.attempt=x.attempt
     AND NOT coalesce(o.eligible AND o.state='ready' AND o.sha256=s.sha256
      AND o.eligibility_revision=s.eligibility_revision, false))
    THEN 'source_withdrawn'
   WHEN NOT EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=r.project_id AND m.actor_id=r.asked_by
     AND m.active AND m.role IN ('admin','editor'))
    THEN 'asker_removed'
   WHEN p.audience_revision IS DISTINCT FROM x.audience_revision THEN 'audience_changed'
  END;
 END IF;
 o_changed:=(p.mission_revision,p.ledger_revision,p.eligibility_revision)
  IS DISTINCT FROM (x.mission_revision,x.ledger_revision,x.eligibility_revision);
END $$;

-- The attempt's recorded context, when the attempt is the reply's recorded one: its claim recorded, its context recorded.
CREATE FUNCTION sophia.conversation_fences_recorded(r sophia.conversation_replies, p_attempt integer)
RETURNS sophia.conversation_reply_contexts LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.conversation_reply_contexts;
BEGIN
 SELECT * INTO x FROM sophia.conversation_reply_contexts
  WHERE project_id=r.project_id AND reply_id=r.id AND attempt=p_attempt AND state='recorded';
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sophia.conversation_assembly_claims k WHERE k.project_id=r.project_id
   AND k.reply_id=r.id AND k.attempt=p_attempt AND k.outcome='recorded') THEN
  RAISE EXCEPTION 'not_recorded' USING ERRCODE='55000'; END IF;
 RETURN x;
END $$;

-- An answer's receipt: its identity and its current visibility, the same for the publication and every replay of it.
CREATE FUNCTION sophia.conversation_answer_receipt(a sophia.conversation_reply_answers, p_verdict text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('verdict',p_verdict,'replyId',a.reply_id,'attempt',a.attempt,'resultRef',a.result_ref,
  'answerId',a.answer_id,'contextChanged',a.context_changed,'publishedAt',a.published_at,
  'visible',a.text_sha256 IS NOT NULL,'withdrawnBy',a.withdrawn_by) $$;

-- A context's digest and length erased, once: the erasure recorded with a fresh random tombstone, then the digest
-- replaced by it and the length set to 0. Its body must already be gone (the CHECK refuses otherwise); any state:
-- recorded, scrubbed or superseded. A second cause finds the first and changes nothing.
CREATE FUNCTION sophia.conversation_context_digest_erase(p_project uuid, p_reply uuid, p_attempt integer, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE tomb text;
BEGIN
 INSERT INTO sophia.conversation_context_erasures(project_id,reply_id,attempt,reason,tombstone,erased_at)
 VALUES(p_project,p_reply,p_attempt,p_reason,
  encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),clock_timestamp())
 ON CONFLICT DO NOTHING RETURNING tombstone INTO tomb;
 IF tomb IS NOT NULL THEN
  UPDATE sophia.conversation_reply_contexts SET context_hash=tomb, byte_length=0
   WHERE project_id=p_project AND reply_id=p_reply AND attempt=p_attempt;
 END IF;
END $$;

-- A message lost its text (its author's or an admin's withdrawal, an erasure, or its source): every context that read it
-- is scrubbed (as N2's own trigger does, whichever runs first) and its digest and length go, in any state; a Sophia
-- answer's hash goes with its text.
CREATE FUNCTION sophia.conversation_fences_text_gone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE x record;
BEGIN
 FOR x IN SELECT DISTINCT reply_id, attempt FROM sophia.conversation_reply_messages
   WHERE project_id=NEW.project_id AND message_id=NEW.id ORDER BY reply_id, attempt LOOP
  PERFORM sophia.conversation_context_scrub(NEW.project_id,x.reply_id,x.attempt,'message_withdrawn');
  PERFORM sophia.conversation_context_digest_erase(NEW.project_id,x.reply_id,x.attempt,'message_withdrawn');
 END LOOP;
 IF NEW.author='sophia' THEN
  UPDATE sophia.conversation_reply_answers SET text_sha256=NULL, withdrawn_at=NEW.withdrawn_at, withdrawn_by=NEW.withdrawn_by
   WHERE project_id=NEW.project_id AND answer_id=NEW.id AND text_sha256 IS NOT NULL;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER conversation_fences_text_gone AFTER UPDATE OF body ON sophia.conversation_messages
 FOR EACH ROW WHEN (OLD.body IS NOT NULL AND NEW.body IS NULL)
 EXECUTE FUNCTION sophia.conversation_fences_text_gone();

-- ---------------------------------------------------------------------------------------------------------------------
-- Entry points (no grant: callable by their owner only, until a caller is agreed with the owners CC-0100 names).

-- Whether the attempt's recorded context may still reach the reply's audience: `ok` (with contextChanged when the ledger
-- moved) or `privacy` with its reason. Writes nothing. A writer composing it locks the project FOR UPDATE first.
CREATE FUNCTION sophia.conversation_reply_check(p_reply uuid, p_attempt integer) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies; x sophia.conversation_reply_contexts; v record;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'read_committed_required' USING ERRCODE='25000'; END IF;
 IF p_attempt IS NULL THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023'; END IF;
 r:=sophia.conversation_fences_locked(p_reply,p_attempt,false);
 x:=sophia.conversation_fences_recorded(r,p_attempt);
 v:=sophia.conversation_reply_verdict(r,x);
 RETURN jsonb_build_object('verdict',CASE WHEN v.o_privacy IS NULL THEN 'ok' ELSE 'privacy' END,'reason',v.o_privacy,
  'contextChanged',v.o_changed,'state',r.state);
END $$;

-- Publish the answer of a running reply from its recorded attempt and the native result it names, in one READ COMMITTED
-- transaction. A reply that has an answer is never written again: the same attempt, result and text replay its receipt;
-- an answer whose text went replays as withdrawn, whatever is sent; anything else conflicts. A reply not running is
-- refused, writing nothing. A privacy verdict cancels the reply with its reason and publishes nothing; an ordinary
-- replacement publishes, marked contextChanged.
CREATE FUNCTION sophia.conversation_publish_answer(p_reply uuid, p_attempt integer, p_result uuid, p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies; x sophia.conversation_reply_contexts; a sophia.conversation_reply_answers;
 m sophia.conversation_messages; v record; h text; t timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'read_committed_required' USING ERRCODE='25000'; END IF;
 IF p_attempt IS NULL OR p_result IS NULL OR p_text IS NULL OR (length(p_text) BETWEEN 1 AND 16000) IS NOT TRUE THEN
  RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
 r:=sophia.conversation_fences_locked(p_reply,p_attempt,true);
 SELECT * INTO a FROM sophia.conversation_reply_answers WHERE project_id=r.project_id AND reply_id=r.id FOR UPDATE;
 IF FOUND THEN
  IF a.text_sha256 IS NULL THEN RETURN sophia.conversation_answer_receipt(a,'answer_withdrawn'); END IF;
  IF (a.attempt=p_attempt AND a.result_ref=p_result AND a.text_sha256=h) IS NOT TRUE THEN
   RAISE EXCEPTION 'answer_conflict' USING ERRCODE='22023'; END IF;
  RETURN sophia.conversation_answer_receipt(a,'already_answered');
 END IF;
 IF EXISTS(SELECT 1 FROM sophia.conversation_reply_answers WHERE result_ref=p_result) THEN
  RAISE EXCEPTION 'answer_conflict' USING ERRCODE='22023'; END IF;
 IF r.state<>'running' THEN RETURN jsonb_build_object('verdict','not_running','state',r.state); END IF;
 x:=sophia.conversation_fences_recorded(r,p_attempt);
 v:=sophia.conversation_reply_verdict(r,x);
 t:=clock_timestamp();
 IF v.o_privacy IS NOT NULL THEN
  UPDATE sophia.conversation_replies SET state='cancelled', reason=v.o_privacy, settled_at=t
   WHERE project_id=r.project_id AND id=r.id;
  RETURN jsonb_build_object('verdict','cancelled','reason',v.o_privacy);
 END IF;
 m:=sophia.conversation_append(r.project_id,r.conversation_id,'sophia',NULL,NULL,p_text,r.id);
 UPDATE sophia.conversation_replies SET state='answered', reason=NULL, answer_id=m.id, settled_at=t
  WHERE project_id=r.project_id AND id=r.id;
 INSERT INTO sophia.conversation_reply_answers(project_id,reply_id,attempt,result_ref,answer_id,text_sha256,
  context_changed,published_at)
 VALUES(r.project_id,r.id,p_attempt,p_result,m.id,h,v.o_changed,t) RETURNING * INTO a;
 PERFORM sophia.conversation_moved(r.project_id,r.conversation_id,'conversation.message_recorded',false);
 RETURN sophia.conversation_answer_receipt(a,'published');
END $$;

-- A completed turn whose answer publication can't take (CON-01 G2_CON_ONLY_PLAN Step B): an empty one, one longer than
-- 0048's 16,000 characters, or one that isn't storable. Capture's reply branch calls this instead of publishing, so
-- nothing raises inside an observation batch. Under publication's locks, and only through the attempt the reply stands
-- on, a running reply ends failed with the reason: no message, answer, suppression or receipt is written here. Like
-- every terminal move it fires S3's context scrub, which is kept. Anything else (a reply already ended, a stale attempt,
-- a replay) is answered with its state, unchanged.
CREATE FUNCTION sophia.conversation_refuse_answer(p_reply uuid, p_attempt integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'read_committed_required' USING ERRCODE='25000'; END IF;
 IF p_attempt IS NULL OR p_reason IS NULL OR p_reason NOT IN ('answer_empty','answer_too_long','answer_invalid_text') THEN
  RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023'; END IF;
 r:=sophia.conversation_fences_locked(p_reply,p_attempt,true);
 IF r.state<>'running' OR NOT EXISTS(SELECT 1 FROM sophia.conversation_reply_contexts x
     WHERE x.project_id=r.project_id AND x.reply_id=r.id AND x.attempt=p_attempt AND x.state='recorded')
   OR NOT EXISTS(SELECT 1 FROM sophia.conversation_assembly_claims k
     WHERE k.project_id=r.project_id AND k.reply_id=r.id AND k.attempt=p_attempt AND k.outcome='recorded') THEN
  RETURN jsonb_build_object('verdict','unchanged','state',r.state,'reason',r.reason);
 END IF;
 UPDATE sophia.conversation_replies SET state='failed', reason=p_reason, settled_at=clock_timestamp()
  WHERE project_id=r.project_id AND id=r.id;
 RETURN jsonb_build_object('verdict','refused','state','failed','reason',p_reason);
END $$;

-- A source left its predicate: every reply attempt that read it, whatever its state and whether or not its context is
-- already scrubbed, is suppressed once and for good. The reply itself is reached only through the attempt it stands on:
-- an open reply whose recorded attempt read the source is cancelled (so its context is scrubbed); a published answer
-- whose own attempt read it loses its text, and so does every answer derived from it, by 0048's rule for a withdrawn
-- message (N3's conversation_withdrawn_from): each Sophia answer in the conversation asked at or after it, every hop at
-- once, and each open request that would read it is cancelled. The context's digest and length are erased; a retained
-- hash the source no longer holds becomes a tombstone, at once or, for a suppression made while the source still held
-- it, when a later call finds it gone (CX-0102). Why is read from the source row, never given. `withdrawn` counts the
-- answers it reached directly; the derived ones show in their rows. The body a held source_objects trigger would run, in
-- the source writer's transaction; called directly here.
CREATE FUNCTION sophia.conversation_source_out(p_project uuid, p_source uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.source_objects; d record; r sophia.conversation_replies; why text; tomb text; aseq bigint;
 t timestamptz:=clock_timestamp(); moved uuid[]:='{}'; cv uuid; n_suppressed integer:=0; n_cancelled integer:=0;
 n_withdrawn integer:=0;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_project' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM sophia.source_objects WHERE project_id=p_project AND id=p_source;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_source' USING ERRCODE='22023'; END IF;
 why:=CASE WHEN o.scope IS DISTINCT FROM 'project' THEN 'source_out_of_scope' ELSE 'source_withdrawn' END;
 FOR d IN SELECT s.reply_id, s.attempt, bool_or(o.sha256 IS DISTINCT FROM s.sha256) AS hash_gone,
   (SELECT x.tombstone IS NULL FROM sophia.conversation_reply_suppressions x WHERE x.project_id=p_project
     AND x.reply_id=s.reply_id AND x.attempt=s.attempt AND x.source_id=p_source) AS untombstoned
   FROM sophia.conversation_reply_sources s
  WHERE s.project_id=p_project AND s.source_id=p_source
   AND NOT coalesce(o.scope='project' AND o.eligible AND o.state='ready' AND o.sha256=s.sha256
    AND o.eligibility_revision=s.eligibility_revision, false)
  GROUP BY s.reply_id, s.attempt ORDER BY s.reply_id, s.attempt LOOP
  -- Suppressed already: only a hash the source has since stopped holding can still go. The suppression's reason and
  -- time stay, and nothing else is touched: nothing restored, nothing reset.
  IF d.untombstoned IS NOT NULL THEN
   IF d.untombstoned AND d.hash_gone THEN
    tomb:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
    UPDATE sophia.conversation_reply_suppressions SET tombstone=tomb
     WHERE project_id=p_project AND reply_id=d.reply_id AND attempt=d.attempt AND source_id=p_source AND tombstone IS NULL;
    UPDATE sophia.conversation_reply_sources SET sha256=tomb
     WHERE project_id=p_project AND reply_id=d.reply_id AND attempt=d.attempt AND source_id=p_source;
   END IF;
   CONTINUE;
  END IF;
  SELECT * INTO r FROM sophia.conversation_replies WHERE project_id=p_project AND id=d.reply_id;
  PERFORM 1 FROM sophia.conversations WHERE project_id=p_project AND id=r.conversation_id FOR UPDATE;
  SELECT * INTO r FROM sophia.conversation_replies WHERE project_id=p_project AND id=d.reply_id FOR UPDATE;
  tomb:=CASE WHEN d.hash_gone
   THEN encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex') END;
  INSERT INTO sophia.conversation_reply_suppressions(project_id,reply_id,attempt,source_id,reason,tombstone,suppressed_at)
  VALUES(p_project,d.reply_id,d.attempt,p_source,why,tomb,t);
  n_suppressed:=n_suppressed+1;
  -- A superseded attempt reached no one (only a pending reply is ever superseded), and the reply goes on, or was
  -- answered, from an attempt that did not read the source: that attempt is suppressed and its digest erased, and no
  -- more. An answer with no answers row (none is written but by publication) is taken as its own attempt's.
  IF r.state IN ('pending','running') AND EXISTS(SELECT 1 FROM sophia.conversation_reply_contexts x
    WHERE x.project_id=p_project AND x.reply_id=d.reply_id AND x.attempt=d.attempt AND x.state='recorded') THEN
   UPDATE sophia.conversation_replies SET state='cancelled', reason=why, settled_at=t
    WHERE project_id=p_project AND id=r.id;
   n_cancelled:=n_cancelled+1;
  ELSIF r.state='answered' AND NOT EXISTS(SELECT 1 FROM sophia.conversation_reply_answers a
    WHERE a.project_id=p_project AND a.reply_id=d.reply_id AND a.attempt<>d.attempt) THEN
   UPDATE sophia.conversation_messages SET body=NULL, author_name=NULL, withdrawn_at=t, withdrawn_by='source'
    WHERE project_id=p_project AND id=r.answer_id AND withdrawn_at IS NULL RETURNING seq INTO aseq;
   IF FOUND THEN
    n_withdrawn:=n_withdrawn+1;
    PERFORM sophia.conversation_withdrawn_from(p_project,r.conversation_id,aseq,'source_withdrawn');
    IF NOT r.conversation_id=ANY(moved) THEN moved:=moved||r.conversation_id; END IF;
   END IF;
  END IF;
  -- Ended now if it was open, so every context of it is scrubbed: its digest and length go, then the retained hash.
  PERFORM sophia.conversation_context_digest_erase(p_project,d.reply_id,d.attempt,why);
  IF tomb IS NOT NULL THEN
   UPDATE sophia.conversation_reply_sources SET sha256=tomb
    WHERE project_id=p_project AND reply_id=d.reply_id AND attempt=d.attempt AND source_id=p_source;
  END IF;
 END LOOP;
 FOREACH cv IN ARRAY moved LOOP
  PERFORM sophia.conversation_moved(p_project,cv,'conversation.message_withdrawn',true);
 END LOOP;
 RETURN jsonb_build_object('verdict','source_out','reason',why,'suppressed',n_suppressed,'cancelled',n_cancelled,
  'withdrawn',n_withdrawn);
END $$;

-- Closed to every login: row security on with no policy, no table grant, and no function executable but by its owner.
ALTER TABLE sophia.conversation_reply_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_reply_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_context_erasures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.conversation_reply_answers, sophia.conversation_reply_suppressions, sophia.conversation_context_erasures
 FROM PUBLIC, sophia_api, sophia_worker, sophia_conversation_assembler;
REVOKE ALL ON FUNCTION sophia.conversation_fences_kept(), sophia.conversation_context_kept(),
 sophia.conversation_fences_locked(uuid,integer,boolean),
 sophia.conversation_reply_verdict(sophia.conversation_replies,sophia.conversation_reply_contexts),
 sophia.conversation_fences_recorded(sophia.conversation_replies,integer),
 sophia.conversation_answer_receipt(sophia.conversation_reply_answers,text),
 sophia.conversation_context_digest_erase(uuid,uuid,integer,text), sophia.conversation_fences_text_gone(),
 sophia.conversation_reply_check(uuid,integer), sophia.conversation_publish_answer(uuid,integer,uuid,text),
 sophia.conversation_refuse_answer(uuid,integer,text), sophia.conversation_source_out(uuid,uuid)
 FROM PUBLIC, sophia_api, sophia_worker, sophia_conversation_assembler;
