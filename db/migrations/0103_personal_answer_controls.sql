-- INC03-CC-003 A3 (0103, root-allocated to this task only): the owner's control of an automatic Personal answer input,
-- the launch fence before the first possibly external step of a live call, and the late results of withdrawn work.
-- Plan: docs/plans/personal-answers.md ("A3"). Pack v2 INC03-R13/R14, C03-R10/R20, C01-R13/R15/R17.
-- * Control is its own state (personal_answer_controls, revision 0..1000, no row = active 0), never a 0101 decision:
--   admission history, A52/A53 bodies, routes, receipts and replay bytes are unchanged, and an input admitted at
--   decision seq 100 is controllable. An admitted input X is cancelled or replaced (C1/C2); a replacement Y is kept at
--   once as its own automatic input, admitted under current authority or held with a reason, then admitted (C3) or
--   cancelled (C4) only by the owner's own keyed operation. Every operation names the revision it expects.
-- * The launch fence: a call reserved through reserve_personal_answer_controlled is tagged, in the transaction that
--   binds it, with its frozen execution snapshot and the input's control revision. Only begin_personal_answer_launch
--   returning 'granted' (fresh, committed) lets it prepare; it rechecks the claim, epoch, control, admission, frozen
--   profile and payer under the payer's lock, held to COMMIT. A control that wins first denies the tag and releases
--   the reservation (never launched, so no effect). Nothing here says a call was sent; no tag is not proof of no effect.
-- * Withdrawn work is not published: its turn leaves pending/failed (an answered one stays answered), a kept answer is
--   moved to personal_withheld_results, and a late answer of its original call is kept there (settlement below), whether
--   or not its cost was settled already. Financial state stays 0073's own; nothing is refunded, reset or forgiven.
--   One whose cost could not be settled (stopped, or its usage unknown) is kept there too (R1:
--   retain_personal_withheld_answer), its money left as held.
-- * The owner reads it all through the functions below; old unversioned reads are refused by the API (C5).
-- No earlier migration is edited. One existing function is replaced under its own signature, language, search path,
-- SECURITY DEFINER and grants: settle_personal_companion_answer (late retention). Only the turn reply CHECK widens.
BEGIN;

ALTER TABLE sophia.personal_turns DROP CONSTRAINT personal_turns_reply_check;
ALTER TABLE sophia.personal_turns ADD CONSTRAINT personal_turns_reply_check
 CHECK(reply IN ('pending','answered','failed','recorded','withdrawn'));

-- The current control of an automatic input: absent while it is as admitted (active, revision 0).
CREATE TABLE sophia.personal_answer_controls (
 owner_id uuid NOT NULL,
 input_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('held','active','withdrawn')),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000),
 replaces_input_id uuid,
 held_reason text CHECK(held_reason IN ('prior_in_progress','prior_cost_unresolved','admission_off',
  'profile_unavailable','payer_unavailable')),
 withdrawn_phase text CHECK(withdrawn_phase IN ('before_reservation','before_launch','after_launch',
  'after_publication','before_admission')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,input_id),
 UNIQUE(owner_id,turn_id),
 FOREIGN KEY(owner_id,input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,replaces_input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE,
 CHECK((state='held')=(held_reason IS NOT NULL)),
 CHECK((state='withdrawn')=(withdrawn_phase IS NOT NULL))
);
ALTER TABLE sophia.personal_answer_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_answer_controls FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
REVOKE ALL ON sophia.personal_answer_controls FROM PUBLIC;
GRANT SELECT ON sophia.personal_answer_controls TO sophia_api;

-- Every control operation, applied or refused, as it was decided: the owner's audit log. Its seq is taken after the
-- owner's space is held and kept to COMMIT, so a later page of the same owner never gains a lower one.
CREATE SEQUENCE sophia.personal_answer_control_seq;
REVOKE ALL ON SEQUENCE sophia.personal_answer_control_seq FROM PUBLIC;
CREATE TABLE sophia.personal_answer_control_ops (
 seq bigint PRIMARY KEY DEFAULT nextval('sophia.personal_answer_control_seq'),
 owner_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 operation text NOT NULL CHECK(operation IN ('cancel','replace','admit')),
 outcome text NOT NULL CHECK(outcome IN ('applied','refused')),
 input_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 revision_before integer NOT NULL CHECK(revision_before BETWEEN 0 AND 1000),
 revision_after integer NOT NULL CHECK(revision_after BETWEEN 0 AND 1000),
 phase text CHECK(phase IN ('before_reservation','before_launch','after_launch','after_publication','before_admission')),
 financial text NOT NULL CHECK(financial IN ('none','unresolved','settled')),
 effect text NOT NULL CHECK(effect IN ('none','possible')),
 answer text NOT NULL CHECK(answer IN ('none','in_progress','published','kept_unpublished','withheld','no_answer',
  'unknown')),
 replacement_input_id uuid,
 replacement_state text CHECK(replacement_state IN ('active','held')),
 held_reason text CHECK(held_reason IN ('prior_in_progress','prior_cost_unresolved','admission_off',
  'profile_unavailable','payer_unavailable')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,replacement_input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE,
 CHECK((outcome='refused')=(revision_after=revision_before)),
 CHECK(outcome='applied' OR operation='admit'),
 CHECK((replacement_input_id IS NULL)=(replacement_state IS NULL)),
 CHECK(outcome='applied' OR held_reason IS NOT NULL)
);
ALTER TABLE sophia.personal_answer_control_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON sophia.personal_answer_control_ops FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
REVOKE ALL ON sophia.personal_answer_control_ops FROM PUBLIC;
GRANT SELECT ON sophia.personal_answer_control_ops TO sophia_api;

-- Append-only, as 0101's decisions: never changed, removed only by the erasure's cascade (trigger depth two or more).
CREATE FUNCTION sophia.personal_answer_control_op_kept() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND pg_catalog.pg_trigger_depth()>=2 THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'A Personal answer control is kept as it was decided' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_control_op_kept() FROM PUBLIC;
CREATE TRIGGER personal_answer_control_ops_kept BEFORE UPDATE OR DELETE ON sophia.personal_answer_control_ops
 FOR EACH ROW EXECUTE FUNCTION sophia.personal_answer_control_op_kept();

-- The launch fence of a call reserved through the controlled entry (protocol 1). Function-only: no grant.
CREATE TABLE sophia.personal_answer_launches (
 call_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>=0),
 input_id uuid,
 control_revision integer NOT NULL CHECK(control_revision BETWEEN 0 AND 1000),
 protocol smallint NOT NULL CHECK(protocol=1),
 execution jsonb NOT NULL,
 execution_digest text NOT NULL CHECK(execution_digest ~ '^sha256:[0-9a-f]{64}$'),
 state text NOT NULL CHECK(state IN ('tagged','launching','denied','refused')),
 refused_reason text CHECK(refused_reason ~ '^[a-z][a-z_]{0,39}$'),
 tagged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_at timestamptz,
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id) ON DELETE CASCADE,
 CHECK((state='tagged')=(decided_at IS NULL)),
 CHECK((state='refused')=(refused_reason IS NOT NULL))
);
ALTER TABLE sophia.personal_answer_launches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.personal_answer_launches FROM PUBLIC;

-- An answer of withdrawn work, kept privately for its owner and never published: moved from 0078's kept answers when
-- the input is withdrawn, or kept by a late settlement of the original call. Function-only: no grant.
CREATE TABLE sophia.personal_withheld_results (
 call_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 turn_id uuid NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>=0),
 input_id uuid NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 suggestion text,
 source text NOT NULL CHECK(source IN ('late_settlement','kept_transfer')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,turn_id) REFERENCES sophia.personal_turns(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,input_id) REFERENCES sophia.personal_inputs(owner_id,id) ON DELETE CASCADE
);
ALTER TABLE sophia.personal_withheld_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.personal_withheld_results FROM PUBLIC;

-- A call's frozen execution snapshot, as the live companion builds it from its settings (the answer profile's shape,
-- but as permissive as the settings: an effort of any length up to 64, for a legacy turn). Malformed: 22023; another
-- owner's: 42501. Internal: no grant.
CREATE FUNCTION sophia.personal_answer_execution(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE name_rx constant text:='^[a-z][a-z0-9-]{0,62}[a-z0-9]$'; k text; prices jsonb;
BEGIN
 IF p IS NULL OR pg_catalog.jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF (SELECT pg_catalog.array_agg(x ORDER BY x) FROM pg_catalog.jsonb_object_keys(p) x)
   IS DISTINCT FROM ARRAY['maxTokens','model','owner','payer','prices','provider','reasoningEffort','roleDigest',
    'routeId','version']::text[] THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['owner','payer','routeId','provider','roleDigest','model'] LOOP
  IF pg_catalog.jsonb_typeof(p->k)<>'string' THEN RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p->'version'<>'1'::jsonb OR p->>'payer' !~ name_rx OR p->>'routeId' !~ name_rx OR p->>'provider' !~ name_rx
  OR p->>'roleDigest' !~ '^sha256:[0-9a-f]{64}$' OR p->>'model' !~ '^[^[:cntrl:]]{1,200}$' THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF NOT (pg_catalog.jsonb_typeof(p->'reasoningEffort')='null' OR (pg_catalog.jsonb_typeof(p->'reasoningEffort')='string'
   AND p->>'reasoningEffort' ~ '^[^[:cntrl:]]{0,64}$')) THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p->'maxTokens')<>'number' THEN RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 IF (p->>'maxTokens')::numeric<>pg_catalog.trunc((p->>'maxTokens')::numeric)
  OR (p->>'maxTokens')::numeric NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 prices:=p->'prices';
 IF pg_catalog.jsonb_typeof(prices)<>'object' OR (SELECT pg_catalog.array_agg(x ORDER BY x)
   FROM pg_catalog.jsonb_object_keys(prices) x) IS DISTINCT FROM ARRAY['cacheRead','cacheWrite','input','output']::text[] THEN
  RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['cacheRead','cacheWrite','input','output'] LOOP
  IF pg_catalog.jsonb_typeof(prices->k)<>'number' OR (prices->>k)::numeric<0 THEN
   RAISE EXCEPTION 'Invalid execution' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p->>'owner'<>sophia.personal_owner()::text THEN
  RAISE EXCEPTION 'The execution is for another owner' USING ERRCODE='42501'; END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_execution(jsonb) FROM PUBLIC;

-- What each call bound to the caller's turn in an epoch stands at: its money (0073), its launch (above) and its answer.
-- Internal: no grant; read under the caller's locks.
CREATE FUNCTION sophia.personal_answer_call_effects(p_turn uuid, p_epoch bigint)
RETURNS TABLE(call_id uuid, financial text, reason text, launch text, answer text, possible boolean)
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT b.call_id,
  CASE WHEN u.state='reserved' AND r.call_id IS NOT NULL THEN 'reserved_active'
   WHEN u.state='reserved' THEN 'reserved_orphan' ELSE u.state END,
  u.reason,
  coalesce(l.state,'untagged'),
  CASE WHEN w.call_id IS NOT NULL THEN 'withheld'
   WHEN k.call_id IS NOT NULL THEN 'kept_unpublished'
   WHEN u.state='released' THEN 'none'
   WHEN u.state='reserved' AND r.call_id IS NOT NULL THEN 'in_progress'
   WHEN u.state IN ('reserved','uncertain') THEN 'unknown'
   WHEN u.reason='settled_without_answer' THEN 'no_answer'
   WHEN u.reason IS NULL AND t.reply='answered' THEN 'published'
   ELSE 'unknown' END,
  -- Possibly external: launched or never tagged, unless released (proved never asked), or uncertain or settled.
  (u.state<>'released' AND coalesce(l.state,'launching')='launching') OR u.state IN ('uncertain','settled')
 FROM sophia.personal_answer_calls b
 JOIN sophia.personal_companion_usage u ON u.call_id=b.call_id
 JOIN sophia.personal_turns t ON t.owner_id=b.owner_id AND t.id=b.turn_id
 LEFT JOIN sophia.personal_answer_launches l ON l.call_id=b.call_id
 LEFT JOIN sophia.personal_withheld_results w ON w.call_id=b.call_id
 LEFT JOIN sophia.personal_settled_answers k ON k.call_id=b.call_id
 LEFT JOIN sophia.personal_companion_calls r ON r.call_id=b.call_id
 WHERE b.owner_id=sophia.personal_owner() AND b.turn_id=p_turn AND b.epoch=p_epoch
 ORDER BY u.reserved_at, b.call_id $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_call_effects(uuid,bigint) FROM PUBLIC;

-- One turn's calls summed up: their money (none, unresolved, settled), whether any may have had an external effect, and
-- what became of the answer, in that order of precedence. Internal: no grant.
CREATE FUNCTION sophia.personal_answer_prior(p_turn uuid, p_epoch bigint, OUT financial text, OUT effect text,
 OUT answer text, OUT bound boolean) LANGUAGE plpgsql STABLE SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE unresolved boolean; possible boolean; answers text[];
BEGIN
 SELECT count(*)>0, coalesce(bool_or(x.financial IN ('reserved_active','reserved_orphan','uncertain')),false),
  coalesce(bool_or(x.possible),false), coalesce(array_agg(x.answer),'{}')
  INTO bound, unresolved, possible, answers FROM sophia.personal_answer_call_effects(p_turn,p_epoch) x;
 financial:=CASE WHEN NOT bound THEN 'none' WHEN unresolved THEN 'unresolved' ELSE 'settled' END;
 effect:=CASE WHEN possible THEN 'possible' ELSE 'none' END;
 answer:=coalesce((SELECT o.a FROM unnest(ARRAY['published','withheld','kept_unpublished','in_progress','unknown',
  'no_answer']) WITH ORDINALITY o(a,n) WHERE o.a=ANY(answers) ORDER BY o.n LIMIT 1),'none');
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_prior(uuid,bigint) FROM PUBLIC;

-- Why a replacement for the input whose turn is p_turn may not be admitted now, or NULL: the original's money first
-- (nothing reserved and still registered, nothing unresolved: no commitment is ignored or forgiven), then the paid
-- admission gates the server passes (both flags), a profile 0101 accepts, and its payer admitted for the owner.
-- Internal: no grant; under the caller's locks.
CREATE FUNCTION sophia.personal_answer_replacement_hold(p_turn uuid, p_epoch bigint, p_profile jsonb,
 p_admission boolean) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT FROM sophia.personal_answer_call_effects(p_turn,p_epoch) x WHERE x.financial='reserved_active') THEN
  RETURN 'prior_in_progress'; END IF;
 IF EXISTS(SELECT FROM sophia.personal_answer_call_effects(p_turn,p_epoch) x
  WHERE x.financial IN ('reserved_orphan','uncertain')) THEN RETURN 'prior_cost_unresolved'; END IF;
 IF NOT coalesce(p_admission,false) THEN RETURN 'admission_off'; END IF;
 IF p_profile IS NULL THEN RETURN 'profile_unavailable'; END IF;
 BEGIN
  PERFORM sophia.personal_answer_profile(p_profile);
 EXCEPTION WHEN invalid_parameter_value THEN RETURN 'profile_unavailable';
 END;
 IF NOT sophia.personal_companion_admitted(p_profile->>'payer',sophia.personal_owner()) THEN
  RETURN 'payer_unavailable'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_replacement_hold(uuid,bigint,jsonb,boolean) FROM PUBLIC;

-- The marker the API reads to know 0103 is installed: its absence, read without error, is the only "not installed".
CREATE FUNCTION sophia.personal_answer_controls_protocol() RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_controls_protocol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.personal_answer_controls_protocol() TO sophia_api;

-- The controlled reservation: 0102's guard, unchanged, decides; a reserved call is tagged in the same transaction with
-- its frozen execution snapshot (its digest returned) and its input's control revision. A withdrawn input reserves
-- nothing ('withdrawn'). The execution must be the call's payer and route, and an automatic turn's answer profile.
CREATE FUNCTION sophia.reserve_personal_answer_controlled(p_call uuid, p_payer text, p_route text, p_micros bigint,
 p_turn uuid, p_claim uuid, p_profile jsonb, p_execution jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; x jsonb; digest text; outcome text; v_input uuid;
 k sophia.personal_answer_controls;
BEGIN
 PERFORM sophia.personal_hold();
 x:=sophia.personal_answer_execution(p_execution);
 IF x->>'payer' IS DISTINCT FROM p_payer OR x->>'routeId' IS DISTINCT FROM p_route THEN
  RAISE EXCEPTION 'The call''s execution is not its payer and route' USING ERRCODE='22023'; END IF;
 digest:='sha256:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(x::text,'UTF8')),'hex');
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 SELECT i.id INTO v_input FROM sophia.personal_inputs i WHERE i.owner_id=a AND i.turn_id=p_turn;
 IF v_input IS NOT NULL THEN
  SELECT * INTO k FROM sophia.personal_answer_controls c WHERE c.owner_id=a AND c.input_id=v_input;
  IF k.state='withdrawn' THEN
   RETURN pg_catalog.jsonb_build_object('outcome','withdrawn','protocol',1,'executionDigest',digest); END IF;
  IF p_profile IS NOT NULL AND x IS DISTINCT FROM p_profile THEN
   RAISE EXCEPTION 'The call''s execution is not its answer profile' USING ERRCODE='22023'; END IF;
 END IF;
 outcome:=sophia.reserve_personal_answer_guarded(p_call,p_payer,p_route,p_micros,p_turn,p_claim,p_profile);
 IF outcome='reserved' THEN
  INSERT INTO sophia.personal_answer_launches(call_id,owner_id,turn_id,epoch,input_id,control_revision,protocol,
   execution,execution_digest,state)
  VALUES(p_call,a,p_turn,e,v_input,coalesce(k.revision,0),1,x,digest,'tagged');
 END IF;
 RETURN pg_catalog.jsonb_build_object('outcome',outcome,'protocol',1,'executionDigest',digest);
END $$;
REVOKE ALL ON FUNCTION sophia.reserve_personal_answer_controlled(uuid,text,text,bigint,uuid,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.reserve_personal_answer_controlled(uuid,text,text,bigint,uuid,uuid,jsonb,jsonb)
 TO sophia_api;

-- The one-shot launch intent of a tagged call: 'granted' (committed: the only permission to prepare it, once) after
-- every recheck passes with the payer's row held to COMMIT (the space, then the payer). A tag already decided answers
-- what it is ('already_launched', 'withdrawn', 'refused'), never a grant; no tag answers 'not_tagged' and changes
-- nothing (no tag is not proof of no effect). A failed recheck refuses it and releases its reservation: it never ran.
CREATE FUNCTION sophia.begin_personal_answer_launch(p_call uuid, p_claim uuid, p_digest text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); l sophia.personal_answer_launches; t sophia.personal_turns;
 k sophia.personal_answer_controls; d sophia.personal_input_decisions; u sophia.personal_companion_usage; e bigint;
 why text;
BEGIN
 PERFORM sophia.personal_hold();
 SELECT * INTO l FROM sophia.personal_answer_launches WHERE call_id=p_call AND owner_id=a FOR UPDATE;
 IF NOT FOUND THEN RETURN 'not_tagged'; END IF;
 IF l.state='launching' THEN RETURN 'already_launched'; END IF;
 IF l.state='denied' THEN RETURN 'withdrawn'; END IF;
 IF l.state='refused' THEN RETURN 'refused'; END IF;
 e:=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0);
 IF p_digest IS DISTINCT FROM l.execution_digest THEN why:='execution_changed';
 ELSIF l.epoch<>e THEN why:='not_current';
 ELSE
  SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=l.turn_id;
  IF NOT FOUND OR t.reply<>'pending' OR t.answering_claim IS DISTINCT FROM p_claim THEN why:='not_current'; END IF;
 END IF;
 IF why IS NULL AND l.input_id IS NOT NULL THEN
  SELECT * INTO k FROM sophia.personal_answer_controls WHERE owner_id=a AND input_id=l.input_id;
  IF coalesce(k.state,'active')<>'active' OR coalesce(k.revision,0)<>l.control_revision THEN why:='withdrawn';
  ELSE
   SELECT * INTO d FROM sophia.personal_input_decisions WHERE owner_id=a AND input_id=l.input_id
    ORDER BY seq DESC LIMIT 1;
   IF NOT FOUND OR d.outcome<>'admitted' OR d.turn_id<>l.turn_id OR d.epoch<>e
    OR d.profile IS DISTINCT FROM l.execution THEN why:='not_admitted'; END IF;
  END IF;
 END IF;
 IF why IS NULL THEN
  -- The payer's authority, its row held from here to COMMIT: the space first, then the payer (0073's order).
  PERFORM 1 FROM sophia.personal_companion_payers WHERE payer=l.execution->>'payer' AND owner_id=a FOR UPDATE;
  IF NOT FOUND THEN why:='not_admitted'; END IF;
 END IF;
 IF why IS NULL THEN
  SELECT * INTO u FROM sophia.personal_companion_usage WHERE call_id=p_call AND owner_id=a;
  IF NOT FOUND OR u.state<>'reserved' OR u.payer<>l.execution->>'payer' OR u.route_id<>l.execution->>'routeId' THEN
   why:='not_reserved'; END IF;
 END IF;
 IF why IS NULL THEN
  UPDATE sophia.personal_answer_launches SET state='launching', decided_at=pg_catalog.clock_timestamp()
   WHERE call_id=p_call;
  RETURN 'granted';
 END IF;
 UPDATE sophia.personal_answer_launches SET state='refused', refused_reason=why, decided_at=pg_catalog.clock_timestamp()
  WHERE call_id=p_call;
 PERFORM sophia.release_personal_companion(p_call,'refused_before_launch');
 RETURN CASE WHEN why='withdrawn' THEN 'withdrawn' ELSE 'refused' END;
END $$;
REVOKE ALL ON FUNCTION sophia.begin_personal_answer_launch(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.begin_personal_answer_launch(uuid,uuid,text) TO sophia_api;

-- The receipt of a control operation (its own decision, never the latest), and the replacement's part of it.
CREATE FUNCTION sophia.personal_answer_control_receipt(p_operation text, p_revision bigint, p_epoch bigint,
 o sophia.personal_answer_control_ops, p_decision jsonb) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT pg_catalog.jsonb_build_object('operation',p_operation,'controlContract','personal_answer_control_v1',
  'revision',p_revision,'epoch',p_epoch,'controlId',o.id,'controlSeq',o.seq,'inputId',o.input_id,'turnId',o.turn_id,
  'action',o.operation,'outcome',o.outcome,'revisionBefore',o.revision_before,'revisionAfter',o.revision_after,
  'phase',o.phase,'prior',pg_catalog.jsonb_build_object('financial',o.financial,'effect',o.effect,'answer',o.answer),
  'heldReason',CASE WHEN o.operation='admit' THEN o.held_reason END,
  'replacement',CASE WHEN o.replacement_input_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
   'inputId',o.replacement_input_id,
   'turnId',(SELECT c.turn_id FROM sophia.personal_answer_controls c
     WHERE c.owner_id=o.owner_id AND c.input_id=o.replacement_input_id),
   'seq',(SELECT t.seq FROM sophia.personal_answer_controls c JOIN sophia.personal_turns t
     ON t.owner_id=c.owner_id AND t.id=c.turn_id WHERE c.owner_id=o.owner_id AND c.input_id=o.replacement_input_id),
   'state',o.replacement_state,'heldReason',o.held_reason,'decision',p_decision) END) $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_control_receipt(text,bigint,bigint,sophia.personal_answer_control_ops,jsonb)
 FROM PUBLIC;

-- C1/C2/C4: cancel or replace the caller's admitted input, or cancel a held replacement, expecting revision p_expected.
-- The space is fenced to p_epoch and the key read first: a replay returns its receipt, before any profile, flag or
-- state is read, and says it was one ({replayed, receipt}). Then input, turn, decisions and control are locked.
CREATE FUNCTION sophia.control_personal_answer_input(p_key text, p_input uuid, p_action text, p_expected integer,
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
    y_decision:=sophia.personal_answer_decide(y_input,y_turn,1,'send',p_profile);
    y_state:='active';
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
CREATE FUNCTION sophia.admit_personal_answer_input(p_key text, p_input uuid, p_control uuid, p_expected integer,
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
  d:=sophia.personal_answer_decide(p_input,t,1,'send',p_profile);
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

-- The caller's input as it stands now: its turn, its whole admission history (each decision as A53 shows it, no
-- profile), the one non-secret reference to the frozen profile it was admitted under (route and digest), its control,
-- what each of its calls stands at (no amounts), the answers withheld from it, and its replacement links. 22023 when
-- the caller has no such input.
CREATE FUNCTION sophia.personal_answer_control_view(p_input uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); i sophia.personal_inputs; t sophia.personal_turns;
 k sophia.personal_answer_controls; e bigint; adm jsonb; p record; replaced uuid;
BEGIN
 SELECT * INTO i FROM sophia.personal_inputs WHERE owner_id=a AND id=p_input;
 IF NOT FOUND THEN RAISE EXCEPTION 'Input not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.personal_turns WHERE owner_id=a AND id=i.turn_id;
 SELECT * INTO k FROM sophia.personal_answer_controls WHERE owner_id=a AND input_id=p_input;
 e:=coalesce((SELECT sp.epoch FROM sophia.personal_spaces sp WHERE sp.owner_id=a),0);
 SELECT d.profile INTO adm FROM sophia.personal_input_decisions d
  WHERE d.owner_id=a AND d.input_id=p_input AND d.outcome='admitted' ORDER BY d.seq DESC LIMIT 1;
 SELECT * INTO p FROM sophia.personal_answer_prior(t.id,e);
 replaced:=k.replaces_input_id;
 RETURN pg_catalog.jsonb_build_object(
  'inputId',i.id,'turnId',t.id,'seq',t.seq,'createdAt',
  pg_catalog.to_char(i.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'reply',sophia.personal_reply_state(t.reply,t.asked_at,t.answering_since),
  'decisions',coalesce((SELECT pg_catalog.jsonb_agg(sophia.personal_answer_decision(d) ORDER BY d.seq)
    FROM sophia.personal_input_decisions d WHERE d.owner_id=a AND d.input_id=p_input),'[]'::jsonb),
  'route',CASE WHEN adm IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('routeId',adm->>'routeId',
    'profileDigest','sha256:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(adm::text,'UTF8')),'hex')) END,
  'control',pg_catalog.jsonb_build_object('state',coalesce(k.state,'active'),'revision',coalesce(k.revision,0),
   'heldReason',k.held_reason,'withdrawnPhase',k.withdrawn_phase,'replaces',replaced,
   'replacedBy',coalesce((SELECT pg_catalog.jsonb_agg(c.input_id ORDER BY c.input_id) FROM sophia.personal_answer_controls c
     WHERE c.owner_id=a AND c.replaces_input_id=p_input),'[]'::jsonb)),
  'prior',pg_catalog.jsonb_build_object('financial',p.financial,'effect',p.effect,'answer',p.answer),
  'calls',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('callId',x.call_id,'financial',x.financial,
    'reason',x.reason,'launch',x.launch,'answer',x.answer,'possibleEffect',x.possible))
    FROM sophia.personal_answer_call_effects(t.id,e) x),'[]'::jsonb),
  'withheld',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('callId',w.call_id,'text',w.body,
    'suggestion',w.suggestion,'source',w.source,
    'at',pg_catalog.to_char(w.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY w.created_at, w.call_id)
    FROM sophia.personal_withheld_results w WHERE w.owner_id=a AND w.input_id=p_input),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_control_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.personal_answer_control_view(uuid) TO sophia_api;

-- The caller's control operations after p_after (a seq), oldest first, at most p_limit (1..100), and where the next
-- page starts (null on the last).
CREATE FUNCTION sophia.personal_answer_control_log(p_after bigint, p_limit integer) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.personal_owner(); items jsonb; more boolean;
BEGIN
 IF p_after IS NULL OR p_after<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('controlId',o.id,'controlSeq',o.seq,
   'action',o.operation,'outcome',o.outcome,'inputId',o.input_id,'turnId',o.turn_id,'revisionBefore',o.revision_before,
   'revisionAfter',o.revision_after,'phase',o.phase,
   'prior',pg_catalog.jsonb_build_object('financial',o.financial,'effect',o.effect,'answer',o.answer),
   'replacementInputId',o.replacement_input_id,'replacementState',o.replacement_state,'heldReason',o.held_reason,
   'at',pg_catalog.to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY o.seq),'[]'::jsonb)
  INTO items
  FROM (SELECT * FROM sophia.personal_answer_control_ops WHERE owner_id=a AND seq>p_after ORDER BY seq LIMIT p_limit) o;
 more:=EXISTS(SELECT FROM sophia.personal_answer_control_ops WHERE owner_id=a AND seq>p_after
  ORDER BY seq OFFSET p_limit LIMIT 1);
 RETURN pg_catalog.jsonb_build_object('items',items,'next',
  CASE WHEN more THEN (items->(pg_catalog.jsonb_array_length(items)-1)->>'controlSeq')::bigint END);
END $$;
REVOKE ALL ON FUNCTION sophia.personal_answer_control_log(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.personal_answer_control_log(bigint,integer) TO sophia_api;

-- The answer withheld for the caller's call, or NULL: how a settlement whose acknowledgement was lost knows its own
-- answer was kept, though never for publication.
CREATE FUNCTION sophia.personal_withheld_answer(p_call uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT pg_catalog.jsonb_build_object('text',w.body,'suggestion',w.suggestion)
 FROM sophia.personal_withheld_results w WHERE w.owner_id=sophia.personal_owner() AND w.call_id=p_call $$;
REVOKE ALL ON FUNCTION sophia.personal_withheld_answer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.personal_withheld_answer(uuid) TO sophia_api;

-- 0080's settlement, unchanged for every call but the original call of a withdrawn input (current epoch): that one's
-- answer is kept withheld (never in 0078's kept answers, never written), whether its turn was withdrawn or already
-- answered, and whether or not its cost was settled already; its money is settled by 0073's own rule (an outcome of
-- 'not_settled' stays that). A second, identical keep changes nothing; a different one is refused, never overwritten.
CREATE OR REPLACE FUNCTION sophia.settle_personal_companion_answer(p_call uuid, p_used bigint, p_usage jsonb, p_body text,
 p_suggestion text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); b sophia.personal_answer_calls; kept uuid; settled boolean; v_input uuid;
 w sophia.personal_withheld_results;
BEGIN
 IF p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'A kept answer has its words' USING ERRCODE='22023';
 END IF;
 PERFORM sophia.personal_hold();
 -- 0103: the original call of a withdrawn input.
 SELECT * INTO b FROM sophia.personal_answer_calls WHERE call_id=p_call AND owner_id=a;
 IF FOUND AND b.epoch=coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0) THEN
  SELECT c.input_id INTO v_input FROM sophia.personal_answer_controls c
   WHERE c.owner_id=a AND c.turn_id=b.turn_id AND c.state='withdrawn';
  IF v_input IS NOT NULL THEN
   settled:=EXISTS(SELECT FROM sophia.personal_companion_usage WHERE call_id=p_call AND owner_id=a)
    AND sophia.settle_personal_companion(p_call, p_used, p_usage);
   SELECT * INTO w FROM sophia.personal_withheld_results WHERE call_id=p_call FOR UPDATE;
   IF FOUND THEN
    IF w.owner_id<>a OR w.body<>p_body OR w.suggestion IS DISTINCT FROM p_suggestion THEN
     RAISE EXCEPTION 'A withheld answer is kept as it was' USING ERRCODE='23505'; END IF;
   ELSE
    INSERT INTO sophia.personal_withheld_results(call_id,owner_id,turn_id,epoch,input_id,body,suggestion,source)
    VALUES(p_call,a,b.turn_id,b.epoch,v_input,p_body,p_suggestion,'late_settlement');
   END IF;
   -- Its answer is retained (withheld), so its cost is not one settled without an answer: only when it settled here.
   IF settled THEN
    UPDATE sophia.personal_companion_usage SET reason=NULL WHERE call_id=p_call AND reason='settled_without_answer';
   END IF;
   RETURN CASE WHEN settled THEN 'settled' ELSE 'not_settled' END;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT FROM sophia.personal_companion_usage WHERE call_id=p_call AND owner_id=a)
  OR NOT sophia.settle_personal_companion(p_call, p_used, p_usage) THEN
  RETURN 'not_settled';
 END IF;
 SELECT * INTO b FROM sophia.personal_answer_calls WHERE call_id=p_call AND owner_id=a;
 IF NOT FOUND OR b.epoch<>coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0)
  OR NOT EXISTS(SELECT FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=b.turn_id AND t.author='person'
   AND t.reply IN ('pending','failed')) THEN
  RETURN 'settled';
 END IF;
 INSERT INTO sophia.personal_settled_answers(owner_id,turn_id,call_id,epoch,body,suggestion)
  VALUES(a,b.turn_id,p_call,b.epoch,p_body,p_suggestion)
  ON CONFLICT (owner_id,turn_id) DO NOTHING
  RETURNING call_id INTO kept;
 -- 0080: this call's own answer retained: its cost is no longer one settled without an answer.
 IF kept=p_call THEN
  UPDATE sophia.personal_companion_usage SET reason=NULL WHERE call_id=p_call AND reason='settled_without_answer';
 END IF;
 RETURN CASE WHEN kept IS NULL THEN 'settled' ELSE 'kept' END;
END $$;

-- R1 (A3-CC87-F01): the whole answer of a withdrawn input's original call whose cost could not be settled here (it was
-- stopped, or its usage was missing or ambiguous): the settlement above cannot take it, since 0073's settler requires a
-- used amount and its counts. It is kept withheld as the settlement keeps one (once; an identical replay changes
-- nothing; a different one is refused, 23505), only for the caller's own call, granted ('launching') for that same
-- input, at the current epoch, its turn's control withdrawn; anything else is 'not_withdrawn' and writes nothing. Its
-- money is never read or written here: the call stays as it was held (uncertain, no amount) until reconciled.
CREATE FUNCTION sophia.retain_personal_withheld_answer(p_call uuid, p_body text, p_suggestion text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); b sophia.personal_answer_calls; v_input uuid; w sophia.personal_withheld_results;
BEGIN
 IF p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'A kept answer has its words' USING ERRCODE='22023';
 END IF;
 PERFORM sophia.personal_hold();
 SELECT * INTO b FROM sophia.personal_answer_calls WHERE call_id=p_call AND owner_id=a;
 IF NOT FOUND OR b.epoch<>coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0)
  OR NOT EXISTS(SELECT FROM sophia.personal_companion_usage u WHERE u.call_id=p_call AND u.owner_id=a) THEN
  RETURN 'not_withdrawn';
 END IF;
 SELECT c.input_id INTO v_input FROM sophia.personal_answer_controls c
  JOIN sophia.personal_answer_launches l ON l.call_id=p_call AND l.owner_id=a AND l.turn_id=b.turn_id AND l.epoch=b.epoch
   AND l.state='launching' AND l.input_id=c.input_id
  WHERE c.owner_id=a AND c.turn_id=b.turn_id AND c.state='withdrawn';
 IF v_input IS NULL THEN RETURN 'not_withdrawn'; END IF;
 SELECT * INTO w FROM sophia.personal_withheld_results WHERE call_id=p_call FOR UPDATE;
 IF FOUND THEN
  IF w.owner_id<>a OR w.body<>p_body OR w.suggestion IS DISTINCT FROM p_suggestion THEN
   RAISE EXCEPTION 'A withheld answer is kept as it was' USING ERRCODE='23505'; END IF;
 ELSE
  INSERT INTO sophia.personal_withheld_results(call_id,owner_id,turn_id,epoch,input_id,body,suggestion,source)
  VALUES(p_call,a,b.turn_id,b.epoch,v_input,p_body,p_suggestion,'late_settlement');
 END IF;
 RETURN 'retained';
END $$;
REVOKE ALL ON FUNCTION sophia.retain_personal_withheld_answer(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.retain_personal_withheld_answer(uuid,text,text) TO sophia_api;

COMMIT;
