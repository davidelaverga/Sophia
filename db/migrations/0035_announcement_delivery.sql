-- SMC-M03 S6 (plan §2.4 "Delivery"): an announcement says how it reached the room. Sophia says a finished result once;
-- a member in text mode, who does not hear her, gets it as a chat notice instead, and a room where everyone reads gets
-- only the notices. Each announcement is recorded once, with both classes: whether the room heard it, and how many
-- members received it as text. Counts only: who read it is not recorded.
-- * Rows written before this migration were heard (the bridge recorded only what was heard), and an older bridge's
--   call, through the old three-argument function, still records exactly that.
-- * An announcement nobody heard was delivered as text at least once.
-- * A later record of the same announcement keeps the union: heard once heard, and the largest count of text
--   recipients (the bridge reports its running total). In a mixed room the readers' notices are recorded when the
--   room did not hear Sophia, and a later retry the room hears adds "heard" (M03-RF-0017). Nothing is ever taken
--   back, so replays and late receipts in any order leave the same row.
-- 0001–0034 are not edited; media_record_announced(uuid,uuid,integer) keeps its signature and its behaviour.
BEGIN;

ALTER TABLE sophia.exchange_announcements
 ADD COLUMN heard boolean NOT NULL DEFAULT true,
 ADD COLUMN text_recipients integer NOT NULL DEFAULT 0 CHECK (text_recipients BETWEEN 0 AND 1000),
 ADD CONSTRAINT exchange_announcements_delivered CHECK (heard OR text_recipients>0);

-- The bridge announced a finished result in this exchange: record it once, with how it was delivered. A repeat
-- only adds to it (heard, more text recipients); it never takes anything back.
CREATE FUNCTION sophia.media_record_announced(p_exchange uuid, p_job uuid, p_revision integer, p_heard boolean,
 p_text_recipients integer) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges;
BEGIN
 PERFORM sophia.require_service();
 IF p_heard IS NULL OR p_text_recipients IS NULL OR p_text_recipients NOT BETWEEN 0 AND 1000
    OR NOT (p_heard OR p_text_recipients>0) THEN
  RAISE EXCEPTION 'An announcement is heard or delivered as text' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sophia.jobs WHERE project_id=e.project_id AND id=p_job) THEN
  RAISE EXCEPTION 'Announcement names work outside this exchange''s project' USING ERRCODE='42501'; END IF;
 INSERT INTO sophia.exchange_announcements(project_id,exchange_id,job_id,result_revision,heard,text_recipients)
  VALUES(e.project_id,e.id,p_job,p_revision,p_heard,p_text_recipients)
  ON CONFLICT (exchange_id,job_id,result_revision) DO UPDATE
   SET heard=sophia.exchange_announcements.heard OR EXCLUDED.heard,
       text_recipients=greatest(sophia.exchange_announcements.text_recipients,EXCLUDED.text_recipients);
END $$;

REVOKE ALL ON FUNCTION sophia.media_record_announced(uuid,uuid,integer,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.media_record_announced(uuid,uuid,integer,boolean,integer) TO sophia_api;
COMMIT;
