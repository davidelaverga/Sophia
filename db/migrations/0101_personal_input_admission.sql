-- INC03-CC-003 A1 (0101, root-allocated to this task only): versioned automatic Personal Answer admission, retry and
-- cancel, as an unreachable foundation. Plan: docs/plans/personal-admission.md. Pack v2 INC03-R02/R04/R06/R08/R12/R13,
-- C03-R01/R04/R08/R10. Nothing calls these functions from a request, and nothing here wakes, answers, assesses,
-- enrolls, reserves, notifies or funds anything.
-- * A NEW versioned operation, `personal_answer_v1`, beside 0098's record-only automatic_v1 writer, which is untouched:
--   its route, body and flat receipt mean the same in every state. Each Answer send keeps an automatic_v1 input (0098's
--   table) and appends immutable decisions in sophia.personal_input_decisions: send (seq 1), then only an explicit,
--   separately keyed retry or cancel naming the seq it expects.
-- * Admitted means: the turn goes `recorded` -> `pending` (0021's queue then holds it, durable) with asked_at set once,
--   to the decision's admitted_at. Waiting means: the payer named by the trusted profile has no admission row for this
--   owner (a plain read, no payer lock, no financial promise); nothing else is tried. Cancelled is terminal.
-- * A replay of any mutation returns the receipt that mutation remembered, with its own decision: never the latest,
--   never a refreshed time or profile. The profile is not part of any request semantic and never in a receipt.
-- * One lock order: the space and epoch fence, the request key, the input, its turn, its decisions. reserve_personal_answer
--   (0078-0080) keeps space -> payer; nothing here locks the payer.
-- * Erasure deletes the turns, so inputs and decisions cascade; its request tombstones refuse every older key (40001);
--   0073 usage is not touched.
-- No earlier migration is edited and no existing function or constraint is replaced.
BEGIN;

CREATE TABLE sophia.personal_input_decisions (
 owner_id uuid NOT NULL,
 input_id uuid NOT NULL,
 seq integer NOT NULL CHECK(seq BETWEEN 1 AND 100),
 turn_id uuid NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>=0),
 operation text NOT NULL CHECK(operation IN ('send','retry','cancel')),
 outcome text NOT NULL CHECK(outcome IN ('admitted','waiting','cancelled')),
 reason text CHECK(reason IN ('payer_unavailable','cancelled_by_owner')),
 policy text NOT NULL CHECK(policy='personal-default-answer'),
 policy_version integer NOT NULL CHECK(policy_version=1),
 family text NOT NULL CHECK(family='answer'),
 basis text NOT NULL CHECK(basis='personal_default_addressee'),
 late boolean NOT NULL,
 profile jsonb,
 admitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,input_id,seq),
 FOREIGN KEY(owner_id,input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id) ON DELETE CASCADE,
 CHECK((operation='send')=(seq=1)),
 CHECK((operation='cancel')=(outcome='cancelled')),
 CHECK((operation='cancel')=(profile IS NULL)),
 CHECK((outcome='admitted')=(admitted_at IS NOT NULL)),
 CHECK(CASE outcome WHEN 'admitted' THEN reason IS NULL WHEN 'waiting' THEN reason='payer_unavailable'
  ELSE reason='cancelled_by_owner' END)
);

ALTER TABLE sophia.personal_input_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_input_decisions FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
REVOKE ALL ON sophia.personal_input_decisions FROM PUBLIC;
GRANT SELECT ON sophia.personal_input_decisions TO sophia_api;
-- No write grant on the table, and none to the worker or the assembler: the three writers below are the only writers.

-- Append-only: a decision is never changed, and never removed except by the erasure's cascade (a foreign key action
-- runs inside the referential trigger, so this trigger sees a depth of at least two).
CREATE FUNCTION sophia.personal_input_decision_kept() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND pg_catalog.pg_trigger_depth()>=2 THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'A Personal input decision is kept as it was decided' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION sophia.personal_input_decision_kept() FROM PUBLIC;
CREATE TRIGGER personal_input_decisions_kept BEFORE UPDATE OR DELETE ON sophia.personal_input_decisions
 FOR EACH ROW EXECUTE FUNCTION sophia.personal_input_decision_kept();

-- The trusted answer profile, exactly: the live companion's own settings without its credential reference or provider
-- profile (never stored). Malformed: 22023. Another owner than the calling one: 42501 (the actor is never taken from
-- it). Internal: no grant.
CREATE FUNCTION sophia.personal_answer_profile(p_profile jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE name_rx constant text:='^[a-z][a-z0-9-]{0,62}[a-z0-9]$'; prices jsonb; k text; price numeric;
 -- A price must also be a finite JavaScript number (A1-LOCAL-F01): JavaScript (IEEE-754 binary64, rounded to nearest,
 -- ties to even) reads every JSON number x >= 2^1024 - 2^970 as Infinity, which the typed guard and the live settings
 -- refuse. That exact bound is refused here too; nothing is rounded, clamped or rewritten, and every negative stays
 -- refused as before.
 js_overflow constant numeric:=179769313486231580793728971405303415079934132710037826936173778980444968292764750946649017977587207096330286416692887910946555547851940402630657488671505820681908902000708383676273854845817711531764475730270069855571366959622842914819860834936475292719074168444365510704342711559699508093042880177904174497792;
BEGIN
 -- Each test is its own statement, types before values: nothing is cast before its type is known.
 IF p_profile IS NULL OR pg_catalog.jsonb_typeof(p_profile)<>'object' THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 IF (SELECT pg_catalog.array_agg(x ORDER BY x) FROM pg_catalog.jsonb_object_keys(p_profile) x)
   IS DISTINCT FROM ARRAY['maxTokens','model','owner','payer','prices','provider','reasoningEffort','roleDigest',
    'routeId','version']::text[] THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['owner','payer','routeId','provider','roleDigest','model'] LOOP
  IF pg_catalog.jsonb_typeof(p_profile->k)<>'string' THEN
   RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_profile->'version'<>'1'::jsonb
  OR p_profile->>'owner' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_profile->>'payer' !~ name_rx OR p_profile->>'routeId' !~ name_rx OR p_profile->>'provider' !~ name_rx
  OR p_profile->>'roleDigest' !~ '^sha256:[0-9a-f]{64}$' OR p_profile->>'model' !~ '^[^[:cntrl:]]{1,200}$' THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p_profile->'reasoningEffort')='string' THEN
  IF p_profile->>'reasoningEffort' !~ '^[^[:cntrl:]]{1,64}$' THEN
   RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 ELSIF pg_catalog.jsonb_typeof(p_profile->'reasoningEffort')<>'null' THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.jsonb_typeof(p_profile->'maxTokens')<>'number' THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 IF (p_profile->>'maxTokens')::numeric<>pg_catalog.trunc((p_profile->>'maxTokens')::numeric)
  OR (p_profile->>'maxTokens')::numeric NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 prices:=p_profile->'prices';
 IF pg_catalog.jsonb_typeof(prices)<>'object' THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 IF (SELECT pg_catalog.array_agg(x ORDER BY x) FROM pg_catalog.jsonb_object_keys(prices) x)
   IS DISTINCT FROM ARRAY['cacheRead','cacheWrite','input','output']::text[] THEN
  RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['cacheRead','cacheWrite','input','output'] LOOP
  IF pg_catalog.jsonb_typeof(prices->k)<>'number' THEN
   RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
  price:=(prices->>k)::numeric;
  IF price<0 OR price>=js_overflow THEN
   RAISE EXCEPTION 'Invalid answer profile' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- The actor is the server's (personal_owner); the profile only has to be for that same owner.
 IF p_profile->>'owner'<>sophia.personal_owner()::text THEN
  RAISE EXCEPTION 'The answer profile is for another owner' USING ERRCODE='42501'; END IF;
 RETURN p_profile;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_profile(jsonb) FROM PUBLIC;

-- A decision as its receipt carries it: no profile, admitted_at in UTC.
CREATE FUNCTION sophia.personal_answer_decision(d sophia.personal_input_decisions) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT pg_catalog.jsonb_build_object('seq',d.seq,'operation',d.operation,'outcome',d.outcome,'reason',d.reason,
  'late',d.late,'epoch',d.epoch,
  'admittedAt',pg_catalog.to_char(d.admitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'policy',d.policy,'policyVersion',d.policy_version,'family',d.family,'basis',d.basis) $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_decision(sophia.personal_input_decisions) FROM PUBLIC;

-- Decide for the caller's input and its turn, both already locked by the caller (space, key, input, turn, decisions):
-- append decision `p_seq`, and on admission move the turn from recorded to pending, asked_at at the decision's time.
-- Internal: no grant.
CREATE FUNCTION sophia.personal_answer_decide(p_input uuid, p_turn sophia.personal_turns, p_seq integer,
 p_operation text, p_profile jsonb) RETURNS sophia.personal_input_decisions LANGUAGE plpgsql
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE v_owner uuid:=sophia.personal_owner(); d sophia.personal_input_decisions; v_at timestamptz; v_outcome text;
 v_late boolean; v_epoch bigint;
BEGIN
 IF p_seq>100 THEN RAISE EXCEPTION 'Too many decisions for one input' USING ERRCODE='54000'; END IF;
 SELECT s.epoch INTO v_epoch FROM sophia.personal_spaces s WHERE s.owner_id=v_owner;
 v_late:=EXISTS(SELECT FROM sophia.personal_turns o WHERE o.owner_id=v_owner AND o.author='person'
  AND o.seq>p_turn.seq);
 IF p_operation='cancel' THEN v_outcome:='cancelled';
 -- Eligibility only: whether an operator admitted this payer for this owner. No lock, no reservation.
 ELSIF sophia.personal_companion_admitted(p_profile->>'payer',v_owner) THEN v_outcome:='admitted';
 ELSE v_outcome:='waiting'; END IF;
 -- The decision's own time, after every lock this transaction waited for.
 IF v_outcome='admitted' THEN v_at:=pg_catalog.clock_timestamp(); END IF;
 INSERT INTO sophia.personal_input_decisions(owner_id,input_id,seq,turn_id,epoch,operation,outcome,reason,policy,
  policy_version,family,basis,late,profile,admitted_at)
 VALUES(v_owner,p_input,p_seq,p_turn.id,v_epoch,p_operation,v_outcome,
  CASE v_outcome WHEN 'waiting' THEN 'payer_unavailable' WHEN 'cancelled' THEN 'cancelled_by_owner' END,
  'personal-default-answer',1,'answer','personal_default_addressee',v_late,
  CASE WHEN p_operation='cancel' THEN NULL ELSE p_profile END,v_at)
 RETURNING * INTO d;
 IF v_outcome='admitted' THEN
  UPDATE sophia.personal_turns SET reply='pending', asked_at=v_at, answering_since=NULL, answering_claim=NULL
   WHERE owner_id=v_owner AND id=p_turn.id AND author='person' AND reply='recorded';
  IF NOT FOUND THEN RAISE EXCEPTION 'The input''s turn is not held' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_decide(uuid,sophia.personal_turns,integer,text,jsonb) FROM PUBLIC;

-- A receipt of the Answer operation: the 0021 receipt fields, the input, and the decision this operation made.
CREATE FUNCTION sophia.personal_answer_receipt(p_operation text, p_revision bigint, t sophia.personal_turns,
 p_input uuid, d sophia.personal_input_decisions) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT sophia.personal_receipt(p_operation,p_revision,pg_catalog.jsonb_build_object('turnId',t.id,'seq',t.seq))
  ||pg_catalog.jsonb_build_object('inputId',p_input,'answerContract','personal_answer_v1',
   'interactionContract','automatic_v1','contractVersion',1,'decision',sophia.personal_answer_decision(d)) $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_receipt(text,bigint,sophia.personal_turns,uuid,sophia.personal_input_decisions)
 FROM PUBLIC;

-- The caller's own input, its turn and its latest decision, locked in that order for a retry or a cancel expecting
-- `p_expected`: none (a record-only input) 55000; another latest seq 40001; not waiting 55000.
CREATE FUNCTION sophia.personal_answer_waiting(p_input uuid, p_expected integer, OUT t sophia.personal_turns,
 OUT latest sophia.personal_input_decisions) LANGUAGE plpgsql
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); i sophia.personal_inputs;
BEGIN
 SELECT * INTO i FROM sophia.personal_inputs WHERE owner_id=a AND id=p_input FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=i.turn_id FOR UPDATE;
 PERFORM 1 FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=p_input FOR UPDATE;
 SELECT * INTO latest FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=p_input
  ORDER BY seq DESC LIMIT 1;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'This input was kept without an answer admission' USING ERRCODE='55000'; END IF;
 IF latest.seq<>p_expected THEN
  RAISE EXCEPTION 'Stale decision: expected % but it is %', p_expected, latest.seq USING ERRCODE='40001'; END IF;
 IF latest.outcome<>'waiting' THEN
  RAISE EXCEPTION 'The input is not waiting: it is %', latest.outcome USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_waiting(uuid,integer) FROM PUBLIC;

-- An expected seq as given: 1..100, else 22023.
CREATE FUNCTION sophia.personal_answer_expected(p_expected integer) RETURNS integer LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 IF p_expected IS NULL OR p_expected NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid expected decision' USING ERRCODE='22023'; END IF;
 RETURN p_expected;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_expected(integer) FROM PUBLIC;

-- A person's message under the Answer operation: kept as an automatic_v1 input and decided at once (seq 1).
CREATE FUNCTION sophia.send_personal_answer_input(p_key text, p_contract text, p_epoch bigint, p_text text,
 p_profile jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); body text; semantic jsonb; prior jsonb; s sophia.personal_spaces;
 t sophia.personal_turns; v_input uuid:=pg_catalog.gen_random_uuid(); d sophia.personal_input_decisions; receipt jsonb;
BEGIN
 PERFORM sophia.personal_fence(p_epoch);
 IF p_contract IS DISTINCT FROM 'personal_answer_v1' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 PERFORM sophia.personal_answer_profile(p_profile);
 body:=sophia.personal_text(p_text,4000);
 semantic:=pg_catalog.jsonb_build_object('text',sophia.personal_digest(body),'answerContract','personal_answer_v1',
  'contractVersion',1);
 prior:=sophia.personal_prior(p_key,'send_answer_input',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 s:=sophia.personal_touch();
 t:=sophia.personal_append_recorded(body);
 INSERT INTO sophia.personal_inputs(owner_id,id,turn_id,idempotency_key,interaction_contract,contract_version,origin,
  audience,addressing_basis)
 VALUES(a,v_input,t.id,p_key,'automatic_v1',1,'text','personal_owner','personal_default');
 d:=sophia.personal_answer_decide(v_input,t,1,'send',p_profile);
 receipt:=sophia.personal_answer_receipt('send_answer_input',s.revision,t,v_input,d);
 RETURN sophia.personal_remember(p_key,'send_answer_input',semantic,receipt);
END $$;

-- An explicit retry of a waiting input, under its own key and the decision seq the caller last saw.
CREATE FUNCTION sophia.retry_personal_answer_input(p_key text, p_input uuid, p_expected integer, p_epoch bigint,
 p_profile jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE semantic jsonb; prior jsonb; s sophia.personal_spaces; w record; d sophia.personal_input_decisions;
BEGIN
 PERFORM sophia.personal_fence(p_epoch);
 PERFORM sophia.personal_answer_profile(p_profile);
 semantic:=pg_catalog.jsonb_build_object('inputId',p_input,'expectedSeq',sophia.personal_answer_expected(p_expected));
 prior:=sophia.personal_prior(p_key,'retry_answer_input',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF p_input IS NULL THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO w FROM sophia.personal_answer_waiting(p_input,p_expected);
 d:=sophia.personal_answer_decide(p_input,w.t,p_expected+1,'retry',p_profile);
 s:=sophia.personal_touch();
 RETURN sophia.personal_remember(p_key,'retry_answer_input',semantic,
  sophia.personal_answer_receipt('retry_answer_input',s.revision,w.t,p_input,d));
END $$;

-- An explicit cancel of a waiting input, under its own key and expected seq. Terminal; the words stay held.
CREATE FUNCTION sophia.cancel_personal_answer_input(p_key text, p_input uuid, p_expected integer, p_epoch bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE semantic jsonb; prior jsonb; s sophia.personal_spaces; w record; d sophia.personal_input_decisions;
BEGIN
 PERFORM sophia.personal_fence(p_epoch);
 semantic:=pg_catalog.jsonb_build_object('inputId',p_input,'expectedSeq',sophia.personal_answer_expected(p_expected));
 prior:=sophia.personal_prior(p_key,'cancel_answer_input',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF p_input IS NULL THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO w FROM sophia.personal_answer_waiting(p_input,p_expected);
 d:=sophia.personal_answer_decide(p_input,w.t,p_expected+1,'cancel',NULL);
 s:=sophia.personal_touch();
 RETURN sophia.personal_remember(p_key,'cancel_answer_input',semantic,
  sophia.personal_answer_receipt('cancel_answer_input',s.revision,w.t,p_input,d));
END $$;

REVOKE ALL ON FUNCTION sophia.send_personal_answer_input(text,text,bigint,text,jsonb),
 sophia.retry_personal_answer_input(text,uuid,integer,bigint,jsonb),
 sophia.cancel_personal_answer_input(text,uuid,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.send_personal_answer_input(text,text,bigint,text,jsonb),
 sophia.retry_personal_answer_input(text,uuid,integer,bigint,jsonb),
 sophia.cancel_personal_answer_input(text,uuid,integer,bigint) TO sophia_api;

COMMIT;
