-- CON-01 G2-S1: a reply request's terminal set, in SQL (BINDING_MAP §8.2.1, «States, as 0049 binds them»; CX-0091 N3),
-- a review-only candidate. NOT a migration: it sits outside db/migrations so no runner applies it, and its number waits
-- for the final census (G2_IMPACT_INVENTORY §7.1). Its own test applies it to a disposable database after every
-- migration. The Studio already reads this set (G2-S1: `replyOpen` is `pending` or `running`).
-- * `outcome_unknown` is terminal: its `settled_at` is set when it is entered, as for answered, failed, cancelled and
--   blocked. 0048 counted it open; G1 never writes it.
-- * The open-requests index stays what it is, a plain (non-unique) partial index under its name and columns; it covers
--   `pending` and `running` only.
-- * A withdrawal or an erasure cancels only an open request (`pending`, `running`). One already ended, `outcome_unknown`
--   included, stays as it ended. What it scrubs is unchanged: the Sophia answers whose context reached the message.
-- * 0048 is not edited. No row is inserted or changed, nothing is granted, and the replaced helper keeps 0048's owner,
--   SECURITY DEFINER, search_path and privileges (no EXECUTE but the owner's).

-- A request still recorded as an open `outcome_unknown` (0048's reading) has no settled time to give it, and none is
-- invented: over such a row the candidate is refused before it changes anything.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM sophia.conversation_replies WHERE state='outcome_unknown') THEN
  RAISE EXCEPTION 'conversation_replies holds outcome_unknown requests recorded as open; none is settled here'
   USING ERRCODE='55000';
 END IF;
END $$;

-- The settled time goes with the terminal set: 0048's CHECK, found by what it says rather than by its generated name, is
-- replaced under that same name in one statement.
DO $$
DECLARE n text;
BEGIN
 SELECT conname INTO STRICT n FROM pg_catalog.pg_constraint
  WHERE conrelid='sophia.conversation_replies'::regclass AND contype='c'
   AND pg_catalog.pg_get_constraintdef(oid) LIKE '%(settled_at IS NOT NULL)%';
 EXECUTE format('ALTER TABLE sophia.conversation_replies DROP CONSTRAINT %I, ADD CONSTRAINT %I CHECK('
  '(state IN (''answered'',''failed'',''cancelled'',''blocked'',''outcome_unknown''))=(settled_at IS NOT NULL))', n, n);
END $$;

-- The open requests: pending and running.
DROP INDEX sophia.conversation_replies_open;
CREATE INDEX conversation_replies_open ON sophia.conversation_replies(project_id,conversation_id,cutoff_seq)
 WHERE state IN ('pending','running');

-- What a withdrawal reaches past the message itself, from seq on: Sophia's replies whose context reached it are
-- removed, and open requests that would read it are cancelled. One already ended stays as it ended. CON-01 G2 replaces
-- this function to fence the native work as well; G3 to drop the projections that cover it.
CREATE OR REPLACE FUNCTION sophia.conversation_withdrawn_from(p_project uuid, p_conversation uuid, p_seq bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.conversation_messages m SET body=NULL, author_name=NULL, withdrawn_at=clock_timestamp(), withdrawn_by='source'
  FROM sophia.conversation_replies r
  WHERE m.project_id=p_project AND m.conversation_id=p_conversation AND m.author='sophia' AND m.withdrawn_at IS NULL
   AND r.project_id=m.project_id AND r.id=m.reply_id AND r.cutoff_seq>=p_seq;
 UPDATE sophia.conversation_replies SET state='cancelled', reason=p_reason, settled_at=clock_timestamp()
  WHERE project_id=p_project AND conversation_id=p_conversation AND cutoff_seq>=p_seq
   AND state IN ('pending','running');
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_withdrawn_from(uuid,uuid,bigint,text) FROM PUBLIC;
