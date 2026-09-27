-- Narrow cross-project scheduler operations. Trusted worker role only.
BEGIN;
CREATE FUNCTION sophia.claim_outbox(p_worker text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
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
    AND EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=o.project_id AND m.actor_id=c.actor_id AND m.active AND m.role IN ('admin','editor'))))
  ORDER BY o.cleanup DESC,o.available_at,o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT p_limit
 ) UPDATE sophia.outbox o SET state='dispatching',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1
 FROM eligible e WHERE o.project_id=e.project_id AND o.id=e.id RETURNING o.*;
END $$;
CREATE FUNCTION sophia.expire_dispatch_leases() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$ DECLARE n integer; BEGIN
 UPDATE sophia.outbox SET state='outcome_unknown' WHERE state='dispatching' AND lease_until<clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
CREATE FUNCTION sophia.settle_goal_control(p_project uuid,p_goal uuid,p_epoch bigint,p_proof_source uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal FOR UPDATE;
 IF NOT FOUND OR p_epoch IS NULL OR g.authority_epoch<>p_epoch OR g.status NOT IN ('holding','stopping') THEN RAISE EXCEPTION 'Stale control' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.source_objects WHERE project_id=p_project AND id=p_proof_source AND eligible AND scope='project' AND state='ready') THEN
  RAISE EXCEPTION 'Settlement evidence missing' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id WHERE a.project_id=p_project AND a.goal_id=p_goal AND b.state<>'settled')
 OR EXISTS(SELECT 1 FROM sophia.outbox WHERE project_id=p_project AND goal_id=p_goal AND state IN ('dispatching','outcome_unknown') AND NOT cleanup) THEN
  RAISE EXCEPTION 'Native targets or old writes remain unsettled' USING ERRCODE='40001'; END IF;
 -- The caller must already have reconciled independent effects and recorded that proof; a file id alone does not establish its truth.
 UPDATE sophia.goals SET state_revision=state_revision+1,status=CASE g.status WHEN 'holding' THEN 'held' ELSE 'stopped' END WHERE project_id=p_project AND id=p_goal RETURNING status INTO g.status;
 RETURN g.status;
END $$;
REVOKE ALL ON FUNCTION sophia.claim_outbox(text,integer,integer),sophia.expire_dispatch_leases(),sophia.settle_goal_control(uuid,uuid,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.claim_outbox(text,integer,integer),sophia.expire_dispatch_leases(),sophia.settle_goal_control(uuid,uuid,bigint,uuid) TO sophia_worker;
COMMIT;
