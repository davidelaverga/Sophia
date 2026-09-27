-- Review of #4: a worker whose record_dispatch_result committed but whose reply was lost retries with
-- the same lease token and result, and got "Lease lost" although its result was recorded. The holder's
-- own identical retry now returns the stored result. A different result, another token, or a row that
-- the sweeper moved to outcome_unknown is still refused. 0007 stays as applied (forward-only).
BEGIN;
CREATE OR REPLACE FUNCTION sophia.record_dispatch_result(p_project uuid,p_outbox uuid,p_lease_token uuid,p_result text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox;
BEGIN
 IF p_result IS NULL OR p_result NOT IN ('acknowledged','denied') THEN RAISE EXCEPTION 'Unsupported dispatch result' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 -- The same holder repeating the same result: already recorded, answer as the first call did.
 IF o.state=p_result AND o.lease_token IS NOT DISTINCT FROM p_lease_token THEN RETURN p_result; END IF;
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
COMMIT;
