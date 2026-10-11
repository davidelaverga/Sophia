-- CON-01 Phase A (Q12; CX-0116 and its recheck, reproduced on PostgreSQL 17.6 at main fec45a0e): the reconcile pass
-- counts rows it does not change, and those rows starve the ones it can change.
-- * reconcile_runtime_outbox (0012) selects outcome_unknown native rows in created_at order, LIMIT p_limit, and counts
--   every row selected. A row whose runtime command was answered failed or outcome_unknown maps to outcome_unknown
--   again, so it never leaves: each pass counts it, the worker's dispatcher (runtime-dispatch.ts, run) passes again at
--   once instead of waiting idleMs, and once p_limit such rows are older than a row it could return to pending (or
--   settle), that row is never selected.
-- * Replaced: the pass works out each row's target state once, in the selection, and selects only rows whose target
--   is another state, so the rule that leaves a row outcome_unknown and the rule that keeps it out of the window are one
--   expression. A recoverable row is reached however many unchangeable rows are older than it. The count is of rows the
--   UPDATE actually changed.
-- * Unchanged: the signature, its default of 50, SECURITY DEFINER, the search_path, the owner and the grants (only
--   sophia_worker may execute it); the destinations (native.* and control.settle); the mapping (no command: pending,
--   available a second later; unanswered: acknowledged; delivered or checked: settled; rejected: denied; failed or
--   outcome_unknown: stays outcome_unknown, with its one command, its reason and its accounting); the lease clearing,
--   the created_at order and SKIP LOCKED. Nothing is ever queued twice: a row with a runtime command never goes back
--   to pending.
-- * Not bounded here: the cost of scanning past rows that stay outcome_unknown until an operator settles them.
-- 0001-0052 are not edited. Additive: the same signature and grants; the worker calls it unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.reconcile_runtime_outbox(p_limit integer DEFAULT 50) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o record; n integer:=0;
BEGIN
 FOR o IN SELECT ob.project_id, ob.id, rc.id AS rc_id, t.target FROM sophia.outbox ob
  LEFT JOIN sophia.runtime_commands rc ON rc.project_id=ob.project_id AND rc.outbox_id=ob.id
  CROSS JOIN LATERAL (SELECT CASE WHEN rc.id IS NULL THEN 'pending'
    WHEN rc.answered_stage IN ('delivered','checked') THEN 'settled' WHEN rc.answered_stage='rejected' THEN 'denied'
    WHEN rc.answered_stage IS NULL THEN 'acknowledged' ELSE 'outcome_unknown' END AS target) t
  WHERE ob.state='outcome_unknown' AND (ob.destination LIKE 'native.%' OR ob.destination='control.settle')
   AND t.target<>'outcome_unknown'
  ORDER BY ob.created_at LIMIT p_limit FOR UPDATE OF ob SKIP LOCKED
 LOOP
  UPDATE sophia.outbox SET state=o.target,
   available_at=CASE WHEN o.rc_id IS NULL THEN now()+interval '1 second' ELSE available_at END, lease_token=NULL, lease_until=NULL
   WHERE project_id=o.project_id AND id=o.id AND state='outcome_unknown';
  IF FOUND THEN n:=n+1; END IF;
 END LOOP;
 RETURN n;
END $$;

COMMIT;
