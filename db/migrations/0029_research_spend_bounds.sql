-- SMC-M03 CX-0006: two bounds on research spending that 0024 and 0025 left to the caller.
-- * M03-RF-0010. A call that settles above its reservation is an overrun. Its billed cost is kept as reported (never
--   clipped, never dropped): the reservation's settled amount, the allowance's spend and the grant's total all carry
--   it, and the reservation and the allowance record by how much the call overran. An allowance with an overrun
--   not yet reconciled reserves nothing more, of any kind or purpose, until the owner reconciles it (a Codex
--   operation under Davide's approval, which names its approval): the cap is only a cap while every call stays
--   within what it reserved. The bridge reserves each call at its worst case, so an overrun means a meter is wrong.
-- * M03-RF-0011. The headroom is for the finalize step, and the finalize step is a phase of the task, not a label
--   on one call. The first partial-result reservation of a task enters it, and only when an ordinary call of that
--   size no longer fits the allowance (the trusted transition: the service checks it, the runtime cannot claim it).
--   From then on the task reserves no ordinary call (no search, no read, no ordinary model call) and at most four
--   partial-result calls in all (write the draft, submit, and a retry each), one in flight at a time (0024). The
--   bridge also restricts the tools a finalizing task may run and tells the model to write up.
BEGIN;

-- M03-RF-0010: what each call overran, and the allowance's overruns and their reconciliation.
ALTER TABLE sophia.research_reservations
 ADD COLUMN overrun_usd numeric(12,6) GENERATED ALWAYS AS
  (CASE WHEN settled_usd>reserved_usd THEN settled_usd-reserved_usd ELSE 0 END) STORED;
ALTER TABLE sophia.research_allowances
 ADD COLUMN overrun_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(overrun_usd>=0),
 ADD COLUMN reconciled_overrun_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(reconciled_overrun_usd>=0),
 ADD COLUMN reconciliation_ref text CHECK(reconciliation_ref IS NULL OR length(reconciliation_ref) BETWEEN 1 AND 300),
 ADD COLUMN reconciled_at timestamptz,
 ADD CONSTRAINT research_allowances_reconciled_within CHECK(reconciled_overrun_usd<=overrun_usd),
 ADD CONSTRAINT research_allowances_reconciliation_named CHECK((reconciled_overrun_usd>0)=(reconciliation_ref IS NOT NULL)
  AND (reconciliation_ref IS NULL)=(reconciled_at IS NULL));

-- M03-RF-0011: the task's finalize step.
ALTER TABLE sophia.research_tasks
 ADD COLUMN finalizing_at timestamptz,
 ADD COLUMN finalize_calls integer NOT NULL DEFAULT 0 CHECK(finalize_calls BETWEEN 0 AND 4),
 ADD CONSTRAINT research_tasks_finalize_step CHECK((finalize_calls=0)=(finalizing_at IS NULL));

-- 0024's reservation, unchanged except that an allowance with an unreconciled overrun reserves nothing more.
CREATE OR REPLACE FUNCTION sophia.reserve_research(p_project uuid, p_allowance uuid, p_key text, p_kind text, p_provider text,
  p_amount numeric, p_purpose text DEFAULT 'call')
RETURNS sophia.research_reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.research_grants; a sophia.research_allowances; r sophia.research_reservations; committed numeric; n integer;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 IF p_purpose IS NULL OR p_purpose NOT IN ('call','partial_result') THEN
  RAISE EXCEPTION 'Unknown reservation purpose' USING ERRCODE='22023'; END IF;
 IF p_purpose='partial_result' AND p_kind IS DISTINCT FROM 'model' THEN
  RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.research_grants WHERE project_id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=p_project AND id=p_allowance FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research allowance not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND allowance_id=p_allowance AND reservation_key=p_key;
 IF FOUND THEN
  IF r.kind<>p_kind OR r.provider<>p_provider OR r.reserved_usd<>p_amount OR r.purpose<>p_purpose THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
  RETURN r;
 END IF;
 IF g.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 IF a.overrun_usd>a.reconciled_overrun_usd THEN
  RAISE EXCEPTION 'Research allowance overrun: a call cost more than it reserved; nothing more until it is reconciled'
   USING ERRCODE='55000'; END IF;
 IF p_kind IN ('search','read') THEN
  SELECT count(*) INTO n FROM sophia.research_reservations
   WHERE project_id=p_project AND allowance_id=p_allowance AND kind=p_kind AND state<>'released';
  IF n>=(CASE p_kind WHEN 'search' THEN a.max_searches ELSE a.max_reads END) THEN
   RAISE EXCEPTION 'Research source policy limit reached: %', p_kind USING ERRCODE='55000'; END IF;
 END IF;
 IF p_purpose='partial_result' AND EXISTS(SELECT 1 FROM sophia.research_reservations
   WHERE project_id=p_project AND allowance_id=p_allowance AND purpose='partial_result' AND state='reserved') THEN
  RAISE EXCEPTION 'A partial-result call is already in flight' USING ERRCODE='55000'; END IF;
 committed:=a.reserved_usd+a.spent_usd+a.uncertain_usd;
 IF committed+p_amount>a.cap_usd-(CASE WHEN p_purpose='partial_result' THEN 0 ELSE a.headroom_usd END) THEN
  RAISE EXCEPTION 'Research allowance exhausted' USING ERRCODE='55000'; END IF;
 SELECT coalesce(sum(x.reserved_usd+x.spent_usd+x.uncertain_usd),0) INTO committed
  FROM sophia.research_allowances x WHERE x.project_id=p_project;
 IF committed+p_amount>g.total_cap_usd THEN RAISE EXCEPTION 'Research grant exhausted' USING ERRCODE='55000'; END IF;
 INSERT INTO sophia.research_reservations(project_id,allowance_id,reservation_key,kind,provider,purpose,reserved_usd)
 VALUES(p_project,p_allowance,p_key,p_kind,p_provider,p_purpose,p_amount) RETURNING * INTO r;
 UPDATE sophia.research_allowances SET reserved_usd=reserved_usd+p_amount WHERE project_id=p_project AND id=p_allowance;
 RETURN r;
END $$;

-- 0024's end of a reservation. A settlement above the reserved amount is kept at the reported cost and recorded as
-- the allowance's overrun, which stops further reservations until it is reconciled. Repeating the same end is still
-- a no-op, so an overrun is counted once.
CREATE OR REPLACE FUNCTION sophia.end_research_reservation(p_project uuid, p_reservation uuid, p_outcome text, p_cost numeric,
  p_usage jsonb, p_request_id text)
RETURNS sophia.research_reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.research_reservations; a sophia.research_allowances;
BEGIN
 IF p_outcome NOT IN ('settled','released','uncertain') THEN RAISE EXCEPTION 'Unknown reservation outcome' USING ERRCODE='22023'; END IF;
 IF (p_outcome='settled')<>(p_cost IS NOT NULL) OR p_cost<0 THEN
  RAISE EXCEPTION 'A settled reservation has a non-negative cost, and only it' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=p_project AND id=r.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE;
 IF r.state=p_outcome AND (p_outcome<>'settled' OR r.settled_usd=p_cost) THEN RETURN r; END IF;
 IF r.state IN ('settled','released') THEN
  RAISE EXCEPTION 'Reservation already ended as %', r.state USING ERRCODE='40001'; END IF;
 UPDATE sophia.research_allowances SET
  reserved_usd=reserved_usd-CASE WHEN r.state='reserved' THEN r.reserved_usd ELSE 0 END,
  uncertain_usd=uncertain_usd-CASE WHEN r.state='uncertain' THEN r.reserved_usd ELSE 0 END
   +CASE WHEN p_outcome='uncertain' THEN r.reserved_usd ELSE 0 END,
  spent_usd=spent_usd+coalesce(p_cost,0),
  overrun_usd=overrun_usd+greatest(coalesce(p_cost,0)-r.reserved_usd,0)
 WHERE project_id=p_project AND id=r.allowance_id;
 UPDATE sophia.research_reservations SET state=p_outcome, settled_usd=p_cost, ended_at=now(),
  usage=coalesce(p_usage,usage), provider_request_id=coalesce(left(p_request_id,200),provider_request_id)
 WHERE project_id=p_project AND id=p_reservation RETURNING * INTO r;
 RETURN r;
END $$;

-- The owner's reconciliation of an allowance's overruns (a Codex operation under Davide's approval): the billed
-- costs stay spent, and reservations resume within the cap. Idempotent: nothing to reconcile returns the row as is.
CREATE FUNCTION sophia.reconcile_research_overrun(p_project uuid, p_allowance uuid, p_approval_ref text)
RETURNS sophia.research_allowances LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.research_allowances;
BEGIN
 IF p_approval_ref IS NULL OR length(p_approval_ref) NOT BETWEEN 1 AND 300 THEN
  RAISE EXCEPTION 'A reconciliation names its approval' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.research_grants WHERE project_id=p_project FOR UPDATE;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=p_project AND id=p_allowance FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research allowance not found' USING ERRCODE='22023'; END IF;
 IF a.overrun_usd=a.reconciled_overrun_usd THEN RETURN a; END IF;
 UPDATE sophia.research_allowances SET reconciled_overrun_usd=overrun_usd, reconciliation_ref=p_approval_ref, reconciled_at=now()
 WHERE project_id=p_project AND id=p_allowance RETURNING * INTO a;
 RETURN a;
END $$;

-- 0025's POST /v1/runtime/research/reserve, with the finalize step. A replay returns its reservation before any
-- phase rule, so a retried call never changes what it was granted.
CREATE OR REPLACE FUNCTION sophia.runtime_research_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 k text:=p_request->>'kind'; key text; ref text:=p_request->>'targetRef'; url text; q text:=p_request->>'query';
 purpose text:=coalesce(p_request->>'purpose','call'); amount numeric; a sophia.research_allowances; t sophia.research_tasks;
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 IF k='read' THEN
  url:=sophia.research_target_url(s,ref);
  IF url IS NULL THEN RAISE EXCEPTION 'Read target not found' USING ERRCODE='22023'; END IF;
 ELSIF ref IS NOT NULL THEN RAISE EXCEPTION 'Only a read names a target' USING ERRCODE='22023';
 END IF;
 IF (k='search')<>(q IS NOT NULL) OR (q IS NOT NULL AND length(btrim(q)) NOT BETWEEN 1 AND 400) THEN
  RAISE EXCEPTION 'A search names its query, and only a search' USING ERRCODE='22023'; END IF;
 amount:=(p_request->>'amountUsd')::numeric;
 -- Locks in the order the turn-end rules (0026) and revocation (0028) take them: the task, then the grant and the
 -- allowance (as reserve_research does). The phase is then read with the allowance it is judged against.
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN
  IF r.target_ref IS DISTINCT FROM ref OR r.query IS DISTINCT FROM q THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
 ELSE
  IF purpose='partial_result' THEN
   IF k IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
   -- The trusted transition: the finalize step begins only when an ordinary call of this size no longer fits.
   IF t.finalizing_at IS NULL AND amount>0
     AND a.reserved_usd+a.spent_usd+a.uncertain_usd+amount<=a.cap_usd-a.headroom_usd THEN
    RAISE EXCEPTION 'A partial-result call needs the allowance spent: an ordinary call still fits' USING ERRCODE='22023'; END IF;
   IF t.finalize_calls>=4 THEN RAISE EXCEPTION 'Research finalize step has used its calls' USING ERRCODE='55000'; END IF;
   UPDATE sophia.research_tasks SET finalizing_at=coalesce(finalizing_at,now()), finalize_calls=finalize_calls+1
    WHERE project_id=s.project_id AND job_id=s.job_id;
  ELSIF t.finalizing_at IS NOT NULL THEN
   RAISE EXCEPTION 'Research is finalizing: no more searches, reads or ordinary calls' USING ERRCODE='55000';
  END IF;
 END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,k,p_request->>'provider',amount,purpose);
 IF r.target_ref IS NULL AND r.query IS NULL AND (ref IS NOT NULL OR q IS NOT NULL) THEN
  UPDATE sophia.research_reservations SET target_ref=ref, target_url=url, query=q WHERE project_id=s.project_id AND id=r.id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,
  'target',CASE WHEN r.target_ref IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('ref',r.target_ref,'url',r.target_url) END);
END $$;

REVOKE ALL ON FUNCTION sophia.reconcile_research_overrun(uuid,uuid,text) FROM PUBLIC;

COMMIT;
