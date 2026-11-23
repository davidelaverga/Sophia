-- 0121: replacement control follows its actual admission decision, not an earlier payer eligibility read.
-- Both 0103 mutators can observe a payer reassignment between their positive precheck and 0101's decision.
-- A non-admitted seq 1 is rolled back inside a narrow subtransaction, leaving the replacement held and retryable.
-- Only the local sentinel is caught; unexpected database failures still abort the whole operation.
-- No payer locks are added: releasing an old payer and selecting a newly assigned payer keeps its existing order.
-- Earlier migrations, signatures, effective owners, receipt/replay formats, epoch and revision rules stay unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.control_personal_answer_input(p_key text, p_input uuid, p_action text, p_expected integer,
 p_epoch bigint, p_text text, p_profile jsonb, p_admission boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); body text; semantic jsonb; prior jsonb; i sophia.personal_inputs;
 t sophia.personal_turns; k sophia.personal_answer_controls; d sophia.personal_input_decisions; rev integer; st text;
 e bigint; v_phase text; p record; released uuid; s sophia.personal_spaces; y_turn sophia.personal_turns; y_input uuid;
 y_state text; y_reason text; y_decision sophia.personal_input_decisions; o sophia.personal_answer_control_ops;
BEGIN
 PERFORM sophia.personal_fence(p_epoch);
 IF p_action IS NULL OR p_action NOT IN ('cancel','replace') THEN
  RAISE EXCEPTION 'Invalid control' USING ERRCODE='22023'; END IF;
 IF p_expected IS NULL OR p_expected NOT BETWEEN 0 AND 1000 THEN
  RAISE EXCEPTION 'Invalid expected revision' USING ERRCODE='22023'; END IF;
 IF p_action='replace' THEN body:=sophia.personal_text(p_text,4000);
 ELSIF p_text IS NOT NULL THEN RAISE EXCEPTION 'A cancel has no text' USING ERRCODE='22023'; END IF;
 semantic:=pg_catalog.jsonb_build_object('controlContract','personal_answer_control_v1','inputId',p_input,
  'action',p_action,'expectedRevision',p_expected,'text',CASE WHEN body IS NULL THEN NULL ELSE sophia.personal_digest(body) END);
 prior:=sophia.personal_prior(p_key,'control_answer_input',semantic);
 IF prior IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('replayed',true,'receipt',prior); END IF;
 IF p_input IS NULL THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM sophia.personal_inputs WHERE owner_id=a AND id=p_input FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=i.turn_id FOR UPDATE;
 PERFORM 1 FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=p_input FOR UPDATE;
 SELECT * INTO k FROM sophia.personal_answer_controls WHERE owner_id=a AND input_id=p_input FOR UPDATE;
 rev:=coalesce(k.revision,0);
 st:=coalesce(k.state,'active');
 IF rev<>p_expected THEN
  RAISE EXCEPTION 'Stale control: expected % but it is %', p_expected, rev USING ERRCODE='40001'; END IF;
 IF st='withdrawn' THEN RAISE EXCEPTION 'The input is withdrawn' USING ERRCODE='55000'; END IF;
 e:=coalesce((SELECT sp.epoch FROM sophia.personal_spaces sp WHERE sp.owner_id=a),0);
 IF st='held' THEN
  -- C4: a replacement never admitted is withdrawn as it is: its turn stays recorded (kept, never asked).
  IF p_action<>'cancel' THEN
   RAISE EXCEPTION 'A held replacement is only admitted or cancelled' USING ERRCODE='55000'; END IF;
  UPDATE sophia.personal_answer_controls SET state='withdrawn', revision=rev+1, held_reason=NULL,
   withdrawn_phase='before_admission', updated_at=pg_catalog.clock_timestamp() WHERE owner_id=a AND input_id=p_input;
  v_phase:='before_admission';
  SELECT * INTO p FROM sophia.personal_answer_prior(t.id,e);
 ELSE
  SELECT * INTO d FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=p_input ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR d.outcome<>'admitted' THEN
   RAISE EXCEPTION 'The input is not admitted' USING ERRCODE='55000'; END IF;
  -- A tagged call that never launched is denied and its reservation released: it can never prepare.
  FOR released IN UPDATE sophia.personal_answer_launches SET state='denied', decided_at=pg_catalog.clock_timestamp()
   WHERE owner_id=a AND turn_id=t.id AND epoch=e AND state='tagged' RETURNING call_id LOOP
   PERFORM sophia.release_personal_companion(released,'withdrawn_before_launch');
  END LOOP;
  -- An answer kept for the turn and not yet written is withheld, never written.
  INSERT INTO sophia.personal_withheld_results(call_id,owner_id,turn_id,epoch,input_id,body,suggestion,source)
   SELECT ka.call_id,a,ka.turn_id,ka.epoch,p_input,ka.body,ka.suggestion,'kept_transfer'
   FROM sophia.personal_settled_answers ka WHERE ka.owner_id=a AND ka.turn_id=t.id AND ka.epoch=e
   ON CONFLICT (call_id) DO NOTHING;
  DELETE FROM sophia.personal_settled_answers WHERE owner_id=a AND turn_id=t.id AND epoch=e;
  -- R2: a whole answer staged for the turn's original call, in any phase (published first included), is withheld here,
  -- never written. One already withheld differently stays staged: never overwritten, never lost.
  INSERT INTO sophia.personal_withheld_results(call_id,owner_id,turn_id,epoch,input_id,body,suggestion,source)
   SELECT sr.call_id,a,sr.turn_id,sr.epoch,p_input,sr.body,sr.suggestion,'late_settlement'
   FROM sophia.personal_answer_staged_results sr
   WHERE sr.owner_id=a AND sr.turn_id=t.id AND sr.epoch=e AND sr.input_id=p_input
   ON CONFLICT (call_id) DO NOTHING;
  DELETE FROM sophia.personal_answer_staged_results sr USING sophia.personal_withheld_results w
   WHERE sr.owner_id=a AND sr.turn_id=t.id AND sr.epoch=e AND sr.input_id=p_input AND w.call_id=sr.call_id
    AND w.owner_id=a AND w.body=sr.body AND w.suggestion IS NOT DISTINCT FROM sr.suggestion;
  SELECT * INTO p FROM sophia.personal_answer_prior(t.id,e);
  v_phase:=CASE WHEN t.reply='answered' THEN 'after_publication' WHEN p.effect='possible' THEN 'after_launch'
   WHEN p.bound THEN 'before_launch' ELSE 'before_reservation' END;
  IF t.reply IN ('pending','failed') THEN
   UPDATE sophia.personal_turns SET reply='withdrawn', answering_since=NULL, answering_claim=NULL
    WHERE owner_id=a AND id=t.id;
  END IF;
  INSERT INTO sophia.personal_answer_controls(owner_id,input_id,turn_id,state,revision,withdrawn_phase)
   VALUES(a,p_input,t.id,'withdrawn',rev+1,v_phase)
   ON CONFLICT (owner_id,input_id) DO UPDATE SET state='withdrawn', revision=EXCLUDED.revision, held_reason=NULL,
    withdrawn_phase=EXCLUDED.withdrawn_phase, updated_at=pg_catalog.clock_timestamp();
  IF p_action='replace' THEN
   y_turn:=sophia.personal_append_recorded(body);
   y_input:=pg_catalog.gen_random_uuid();
   INSERT INTO sophia.personal_inputs(owner_id,id,turn_id,idempotency_key,interaction_contract,contract_version,origin,
    audience,addressing_basis)
   VALUES(a,y_input,y_turn.id,p_key,'automatic_v1',1,'text','personal_owner','personal_default');
   y_reason:=sophia.personal_answer_replacement_hold(t.id,e,p_profile,p_admission);
   IF y_reason IS NULL THEN
    -- Eligibility may change between the precheck and the decision under READ COMMITTED. Roll back a waiting
    -- decision instead of stranding a held replacement with an immutable seq 1 that C3 cannot admit again.
    BEGIN
     y_decision:=sophia.personal_answer_decide(y_input,y_turn,1,'send',p_profile);
     IF y_decision.outcome IS DISTINCT FROM 'admitted' THEN
      RAISE EXCEPTION 'Replacement was not admitted' USING ERRCODE='P0A01';
     END IF;
     y_state:='active';
    EXCEPTION WHEN SQLSTATE 'P0A01' THEN
     y_decision:=NULL;
     y_state:='held';
     y_reason:='payer_unavailable';
    END;
   ELSE
    y_state:='held';
   END IF;
   INSERT INTO sophia.personal_answer_controls(owner_id,input_id,turn_id,state,revision,replaces_input_id,held_reason)
   VALUES(a,y_input,y_turn.id,y_state,1,p_input,y_reason);
  END IF;
 END IF;
 s:=sophia.personal_touch();
 INSERT INTO sophia.personal_answer_control_ops(owner_id,idempotency_key,operation,outcome,input_id,turn_id,
  revision_before,revision_after,phase,financial,effect,answer,replacement_input_id,replacement_state,held_reason)
 VALUES(a,p_key,p_action,'applied',p_input,t.id,rev,rev+1,v_phase,p.financial,p.effect,p.answer,y_input,y_state,y_reason)
 RETURNING * INTO o;
 RETURN pg_catalog.jsonb_build_object('replayed',false,'receipt',sophia.personal_remember(p_key,'control_answer_input',
  semantic,sophia.personal_answer_control_receipt('control_answer_input',s.revision,e,o,
   CASE WHEN y_decision.seq IS NULL THEN NULL ELSE sophia.personal_answer_decision(y_decision) END)));
END $$;
REVOKE ALL ON FUNCTION sophia.control_personal_answer_input(text,uuid,text,integer,bigint,text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.control_personal_answer_input(text,uuid,text,integer,bigint,text,jsonb,boolean)
 TO sophia_api;

-- C3/C3': the owner admits the held replacement p_input that their own replace p_control created, expecting revision
-- p_expected. Admitted (0101 seq 1 send, under the current profile) only when every check of
-- personal_answer_replacement_hold passes now; otherwise its refusal is remembered as its receipt (outcome refused),
-- so the first answer and every replay are the same. The fence and the key come first, as for a control.
CREATE OR REPLACE FUNCTION sophia.admit_personal_answer_input(p_key text, p_input uuid, p_control uuid, p_expected integer,
 p_epoch bigint, p_profile jsonb, p_admission boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); semantic jsonb; prior jsonb; i sophia.personal_inputs; t sophia.personal_turns;
 k sophia.personal_answer_controls; r sophia.personal_answer_control_ops; rev integer; e bigint; why text; p record;
 d sophia.personal_input_decisions; s sophia.personal_spaces; o sophia.personal_answer_control_ops; v_revision bigint;
BEGIN
 PERFORM sophia.personal_fence(p_epoch);
 IF p_expected IS NULL OR p_expected NOT BETWEEN 0 AND 1000 THEN
  RAISE EXCEPTION 'Invalid expected revision' USING ERRCODE='22023'; END IF;
 semantic:=pg_catalog.jsonb_build_object('controlContract','personal_answer_control_v1','inputId',p_input,
  'controlId',p_control,'expectedRevision',p_expected);
 prior:=sophia.personal_prior(p_key,'admit_answer_input',semantic);
 IF prior IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('replayed',true,'receipt',prior); END IF;
 IF p_input IS NULL OR p_control IS NULL THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM sophia.personal_inputs WHERE owner_id=a AND id=p_input FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 -- The path names the replacement the owner's own replace created: an owner-scoped id alone is not enough.
 SELECT * INTO r FROM sophia.personal_answer_control_ops WHERE owner_id=a AND id=p_control AND operation='replace'
  AND outcome='applied' AND replacement_input_id=p_input;
 IF NOT FOUND THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=i.turn_id FOR UPDATE;
 PERFORM 1 FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=p_input FOR UPDATE;
 SELECT * INTO k FROM sophia.personal_answer_controls WHERE owner_id=a AND input_id=p_input FOR UPDATE;
 rev:=coalesce(k.revision,0);
 IF rev<>p_expected THEN
  RAISE EXCEPTION 'Stale control: expected % but it is %', p_expected, rev USING ERRCODE='40001'; END IF;
 IF coalesce(k.state,'active')<>'held' OR t.reply IS DISTINCT FROM 'recorded'
  OR EXISTS(SELECT FROM sophia.personal_input_decisions x WHERE x.owner_id=a AND x.input_id=p_input) THEN
  RAISE EXCEPTION 'The replacement is not held' USING ERRCODE='55000'; END IF;
 e:=coalesce((SELECT sp.epoch FROM sophia.personal_spaces sp WHERE sp.owner_id=a),0);
 why:=sophia.personal_answer_replacement_hold(r.turn_id,e,p_profile,p_admission);
 SELECT * INTO p FROM sophia.personal_answer_prior(r.turn_id,e);
 IF why IS NULL THEN
  BEGIN
   d:=sophia.personal_answer_decide(p_input,t,1,'send',p_profile);
   IF d.outcome IS DISTINCT FROM 'admitted' THEN
    RAISE EXCEPTION 'Replacement was not admitted' USING ERRCODE='P0A01';
   END IF;
  EXCEPTION WHEN SQLSTATE 'P0A01' THEN
   -- PL/pgSQL variables survive subtransaction rollback: never return a rolled-back decision in the receipt.
   d:=NULL;
   why:='payer_unavailable';
  END;
 END IF;
 IF why IS NULL THEN
  UPDATE sophia.personal_answer_controls SET state='active', revision=rev+1, held_reason=NULL,
   updated_at=pg_catalog.clock_timestamp() WHERE owner_id=a AND input_id=p_input;
  s:=sophia.personal_touch();
  v_revision:=s.revision;
 ELSE
  v_revision:=(SELECT sp.revision FROM sophia.personal_spaces sp WHERE sp.owner_id=a);
 END IF;
 INSERT INTO sophia.personal_answer_control_ops(owner_id,idempotency_key,operation,outcome,input_id,turn_id,
  revision_before,revision_after,financial,effect,answer,held_reason)
 VALUES(a,p_key,'admit',CASE WHEN why IS NULL THEN 'applied' ELSE 'refused' END,p_input,t.id,rev,
  CASE WHEN why IS NULL THEN rev+1 ELSE rev END,p.financial,p.effect,p.answer,why)
 RETURNING * INTO o;
 RETURN pg_catalog.jsonb_build_object('replayed',false,'receipt',sophia.personal_remember(p_key,'admit_answer_input',
  semantic,sophia.personal_answer_control_receipt('admit_answer_input',v_revision,e,o,NULL)
   ||pg_catalog.jsonb_build_object('decision',CASE WHEN d.seq IS NULL THEN NULL ELSE sophia.personal_answer_decision(d) END)));
END $$;
REVOKE ALL ON FUNCTION sophia.admit_personal_answer_input(text,uuid,uuid,integer,bigint,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.admit_personal_answer_input(text,uuid,uuid,integer,bigint,jsonb,boolean) TO sophia_api;


COMMIT;
