-- S1-02 race suite fixes (db/README "source-withdrawal races", "lease expiry during an actual HTTP
-- call"). Found by packages/persistence/src/races.db.test.ts against migrations 0001–0006:
--  1. claim_outbox dispatched a queued steer whose brief source had been withdrawn, including one
--     admitted while an unlocked withdrawal was committing. The pack's reference rule is that a
--     revoked source denies even a fresh queued dispatch. Non-cleanup rows now also require every
--     body source to be eligible, released project scope and ready. Cleanup (Hold/Stop) is never gated.
--  2. Nothing recorded a dispatch outcome under its lease, so a worker whose lease had expired
--     could not be fenced. record_dispatch_result only accepts the live lease token; an expired
--     lease records outcome_unknown instead of the late result.
BEGIN;
CREATE OR REPLACE FUNCTION sophia.claim_outbox(p_worker text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF sophia.outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 160 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Invalid claim bounds' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH eligible AS (
  SELECT o.project_id,o.id FROM sophia.outbox o
  JOIN sophia.goals g ON g.project_id=o.project_id AND g.id=o.goal_id
  JOIN sophia.commands c ON c.project_id=o.project_id AND c.id=o.command_id
  WHERE o.state='pending' AND o.available_at<=now()
   AND (o.cleanup OR (g.authority_epoch=o.authority_epoch AND g.status IN ('ready','running','checking')
    AND EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=o.project_id AND m.actor_id=c.actor_id AND m.active AND m.role IN ('admin','editor'))
    AND (c.body_source_id IS NULL OR EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=c.project_id AND s.id=c.body_source_id AND s.eligible AND s.scope='project' AND s.state='ready'))))
  ORDER BY o.cleanup DESC,o.available_at,o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT p_limit
 ) UPDATE sophia.outbox o SET state='dispatching',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
 FROM eligible e WHERE o.project_id=e.project_id AND o.id=e.id RETURNING o.*;
END $$;

CREATE FUNCTION sophia.record_dispatch_result(p_project uuid,p_outbox uuid,p_lease_token uuid,p_result text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox;
BEGIN
 IF p_result IS NULL OR p_result NOT IN ('acknowledged','denied') THEN RAISE EXCEPTION 'Unsupported dispatch result' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 -- Only the lease holder may write, and only once.
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN
  RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 -- The holder outlived its lease: whatever it observed is no longer authoritative.
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN 'outcome_unknown';
 END IF;
 UPDATE sophia.outbox SET state=p_result,lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
 RETURN p_result;
END $$;
REVOKE ALL ON FUNCTION sophia.record_dispatch_result(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.record_dispatch_result(uuid,uuid,uuid,text) TO sophia_worker;
COMMIT;
