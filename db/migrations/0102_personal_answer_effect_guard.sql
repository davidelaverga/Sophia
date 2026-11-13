-- INC03-CC-003 A2 (0102, root-allocated to this task only): the effect guard every fresh Personal answer reservation
-- passes, and its bounded refusal diagnostics. Plan: docs/plans/personal-answers.md. Study A2-P01..P04.
-- * One chokepoint: the live companion reserves through sophia.reserve_personal_answer_guarded. Under personal_hold()
--   (the space, then the payer only inside 0073, as 0080) it first reproduces 0080's no-effect prefix in 0080's order:
--   a kept answer ('kept'), a lost or unusable completion ('lost'), a stale claim ('not_current'). None of these compares,
--   writes or reserves anything, so a kept answer is recovered whatever the fresh profile is (NULL included).
-- * Origin is positive: a turn with no 0098 personal_inputs row is legacy and goes to 0080 unchanged. A turn with one is
--   automatic, whatever its decisions: it needs its input's latest 0101 decision to be admitted, for this turn and the
--   current epoch, before anything is reserved. No decision, waiting, cancelled or another turn/epoch refuses
--   'not_admitted'; nothing falls through to 0080.
-- * The fresh branch only: the server's profile, built from its live settings for this call, must be one 0101 accepts
--   ('profile_unsupported' otherwise) and must equal the admitted decision's frozen profile, field by field (jsonb value
--   equality, no normalization), with the payer and route arguments the ones it names ('profile_mismatch' otherwise).
--   Then 0080 decides, unchanged: its ledger, binding and outcomes are its own.
-- * A refusal is returned, never raised, so its diagnostic commits with the caller's transaction; the API throws only
--   after. One row per owner, input, decision (0 = none) and epoch, upserted: a repeated wake or replay touches the same
--   row. Finite reasons and field names only: no body, profile, value, route, payer or credential. Owner-only reads,
--   no write grant, deleted with the input, the turn and the decision (erasure).
-- * Nothing here appends a 0101 decision or changes a stored profile. No earlier migration is edited and no existing
--   function, table or constraint is replaced.
BEGIN;

CREATE TABLE sophia.personal_answer_effect_refusals (
 owner_id uuid NOT NULL,
 input_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 -- The input's latest decision when it was refused; 0 when it had none (record-only or never decided).
 decision_seq integer NOT NULL CHECK(decision_seq BETWEEN 0 AND 100),
 decision integer GENERATED ALWAYS AS (NULLIF(decision_seq,0)) STORED,
 epoch bigint NOT NULL CHECK(epoch>=0),
 reason text NOT NULL CHECK(reason IN ('no_decision','waiting','cancelled','decision_stale','profile_unsupported',
  'profile_mismatch')),
 -- The names of the fields that differed (profile_mismatch only), never their values. A NULL element is not contained.
 fields text[] NOT NULL DEFAULT '{}' CHECK(cardinality(fields)<=15 AND fields<@ARRAY['owner','payer','routeId',
  'roleDigest','provider','model','reasoningEffort','maxTokens','prices.input','prices.cacheRead','prices.cacheWrite',
  'prices.output','version','payerArgument','routeArgument']::text[]),
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 1000),
 first_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,input_id,decision_seq,epoch),
 FOREIGN KEY(owner_id,input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,input_id,decision) REFERENCES sophia.personal_input_decisions(owner_id,input_id,seq)
  ON DELETE CASCADE,
 CHECK((decision_seq=0)=(reason='no_decision')),
 CHECK((reason='profile_mismatch')=(cardinality(fields)>0)),
 CHECK(last_at>=first_at)
);

ALTER TABLE sophia.personal_answer_effect_refusals ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_answer_effect_refusals FOR SELECT TO sophia_api
 USING(owner_id=sophia.actor_id());
REVOKE ALL ON sophia.personal_answer_effect_refusals FROM PUBLIC;
GRANT SELECT ON sophia.personal_answer_effect_refusals TO sophia_api;
-- No write grant on the table: the guard below is its only writer.

-- One refusal of the caller's input, kept once per identity: a repeat updates its reason, fields, count and time.
-- Internal: no grant; called with the space held.
CREATE FUNCTION sophia.personal_answer_refuse(p_input sophia.personal_inputs, p_seq integer, p_epoch bigint,
 p_reason text, p_fields text[]) RETURNS text LANGUAGE plpgsql
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 INSERT INTO sophia.personal_answer_effect_refusals AS r(owner_id,input_id,turn_id,decision_seq,epoch,reason,fields)
 VALUES(p_input.owner_id,p_input.id,p_input.turn_id,p_seq,p_epoch,p_reason,coalesce(p_fields,'{}'))
 ON CONFLICT (owner_id,input_id,decision_seq,epoch) DO UPDATE
  SET reason=EXCLUDED.reason, fields=EXCLUDED.fields, attempts=LEAST(r.attempts+1,1000),
   last_at=GREATEST(r.last_at,pg_catalog.clock_timestamp());
 RETURN CASE p_reason WHEN 'profile_unsupported' THEN 'profile_unsupported' WHEN 'profile_mismatch'
  THEN 'profile_mismatch' ELSE 'not_admitted' END;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_refuse(sophia.personal_inputs,integer,bigint,text,text[]) FROM PUBLIC;

-- The names of the fields where the fresh profile and the call's arguments differ from the admitted profile, in a fixed
-- order. Both profiles are 0101-shaped. Internal: no grant.
CREATE FUNCTION sophia.personal_answer_profile_diff(p_admitted jsonb, p_fresh jsonb, p_payer text, p_route text)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE diff text[]:='{}'; k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['owner','payer','routeId','roleDigest','provider','model','reasoningEffort','maxTokens'] LOOP
  IF p_admitted->k IS DISTINCT FROM p_fresh->k THEN diff:=diff||k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['input','cacheRead','cacheWrite','output'] LOOP
  IF p_admitted->'prices'->k IS DISTINCT FROM p_fresh->'prices'->k THEN diff:=diff||('prices.'||k); END IF;
 END LOOP;
 IF p_admitted->'version' IS DISTINCT FROM p_fresh->'version' THEN diff:=diff||'version'::text; END IF;
 IF p_payer IS DISTINCT FROM p_fresh->>'payer' THEN diff:=diff||'payerArgument'::text; END IF;
 IF p_route IS DISTINCT FROM p_fresh->>'routeId' THEN diff:=diff||'routeArgument'::text; END IF;
 RETURN diff;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_profile_diff(jsonb,jsonb,text,text) FROM PUBLIC;

-- The guarded reservation of a fresh answer (see the header). p_profile is the server's own, built for this call; NULL
-- when its live settings make no profile 0101 accepts. Returns 0080's outcomes, or 'profile_unsupported' or
-- 'profile_mismatch'; an automatic turn without a valid admission answers 'not_admitted'.
CREATE FUNCTION sophia.reserve_personal_answer_guarded(p_call uuid, p_payer text, p_route text, p_micros bigint,
 p_turn uuid, p_claim uuid, p_profile jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; i sophia.personal_inputs; d sophia.personal_input_decisions;
 shaped boolean:=true; diff text[];
BEGIN
 PERFORM sophia.personal_hold();
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 -- 0080's prefix, in its order and words: nothing compared, written or reserved.
 IF EXISTS(SELECT FROM sophia.personal_settled_answers k WHERE k.owner_id=a AND k.turn_id=p_turn AND k.epoch=e) THEN
  RETURN 'kept';
 END IF;
 IF EXISTS(SELECT FROM sophia.personal_answer_calls b JOIN sophia.personal_companion_usage u ON u.call_id=b.call_id
  WHERE b.owner_id=a AND b.turn_id=p_turn AND b.epoch=e
   AND ((u.state='reserved' AND NOT EXISTS(SELECT FROM sophia.personal_companion_calls c WHERE c.call_id=u.call_id))
    OR u.state='uncertain'
    OR (u.state='settled' AND u.reason IN ('unfinished_call','usage_unknown','stopped_usage_unknown','settled_before_fence',
     'settled_without_answer')))) THEN
  RETURN 'lost';
 END IF;
 IF NOT EXISTS(SELECT FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=p_turn AND t.author='person'
  AND t.reply='pending' AND t.answering_claim=p_claim) THEN
  RETURN 'not_current';
 END IF;
 -- Origin, positively: no automatic_v1 input for this turn is a legacy turn.
 SELECT * INTO i FROM sophia.personal_inputs WHERE owner_id=a AND turn_id=p_turn;
 IF NOT FOUND THEN
  RETURN sophia.reserve_personal_answer(p_call,p_payer,p_route,p_micros,p_turn,p_claim);
 END IF;
 -- Automatic: its current (latest) decision, read with the space held (0101's writers and erasure hold it first).
 SELECT * INTO d FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=i.id ORDER BY seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN sophia.personal_answer_refuse(i,0,e,'no_decision',NULL); END IF;
 IF d.outcome<>'admitted' THEN RETURN sophia.personal_answer_refuse(i,d.seq,e,d.outcome,NULL); END IF;
 IF d.turn_id<>p_turn OR d.epoch<>e OR d.profile IS NULL THEN
  RETURN sophia.personal_answer_refuse(i,d.seq,e,'decision_stale',NULL);
 END IF;
 -- The fresh profile as 0101 accepts it; another owner's is well formed (42501) and is compared below.
 BEGIN
  PERFORM sophia.personal_answer_profile(p_profile);
 EXCEPTION
  WHEN invalid_parameter_value THEN shaped:=false;
  WHEN insufficient_privilege THEN NULL;
 END;
 IF NOT shaped THEN RETURN sophia.personal_answer_refuse(i,d.seq,e,'profile_unsupported',NULL); END IF;
 diff:=sophia.personal_answer_profile_diff(d.profile,p_profile,p_payer,p_route);
 IF cardinality(diff)>0 THEN RETURN sophia.personal_answer_refuse(i,d.seq,e,'profile_mismatch',diff); END IF;
 RETURN sophia.reserve_personal_answer(p_call,p_payer,p_route,p_micros,p_turn,p_claim);
END $$;
REVOKE ALL ON FUNCTION sophia.reserve_personal_answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.reserve_personal_answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb) TO sophia_api;

COMMIT;
