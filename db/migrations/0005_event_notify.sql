-- S1-02: wake SSE followers after an event commits (architecture 12 §7). The payload is only the
-- project UUID; followers re-read events under their own actor and RLS. NOTIFY is delivered at
-- COMMIT, so a rolled-back admission never wakes anyone. No Redis or second broker (D06).
BEGIN;
CREATE FUNCTION sophia.notify_project_event() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_notify('sophia_project_events', NEW.project_id::text);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.notify_project_event() FROM PUBLIC;
CREATE TRIGGER project_events_notify AFTER INSERT ON sophia.project_events
 FOR EACH ROW EXECUTE FUNCTION sophia.notify_project_event();
COMMIT;
