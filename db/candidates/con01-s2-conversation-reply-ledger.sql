-- CON-01 G2-S2: the conversation reply ledger, a review-only candidate (BINDING_MAP §8.7.1; CX45, CX49 and the CC-0054
-- review). NOT a migration: it sits outside db/migrations so no runner applies it, and its number waits for the final
-- census (G2_IMPACT_INVENTORY §7.1). Its own test applies it to a disposable database after every migration.
-- * No row is inserted, nothing is granted, and nothing calls it: every table and function is closed to PUBLIC,
--   sophia_api and sophia_worker, and no route, credential, unit or allowance is bound.
-- * Release and reconcile refuse every call (`no_proof_source`) until their proofs and the never-claimed fence (0049's
--   shared runtime tables) are wired in the shared window: a reservation can only end settled or uncertain here.
-- * Locks are taken in one order, project → reply → grant → reservation, each function a suffix of it.

-- One allowance per project and lineage, at most one current. The unit is fixed for its lineage; another unit is a
-- new lineage. The references are opaque identifiers, never values.
CREATE TABLE sophia.conversation_grants (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 lineage_id uuid NOT NULL DEFAULT gen_random_uuid(),
 current boolean NOT NULL DEFAULT true,
 unit text NOT NULL CHECK(unit IN ('calls_tokens','usd')),
 grant_revision bigint NOT NULL DEFAULT 1 CHECK(grant_revision>0),
 state text NOT NULL CHECK(state IN ('enabled','disabled')),
 route_id text NOT NULL CHECK(route_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
 credential_ref text NOT NULL CHECK(credential_ref ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
 owner_resource_ref text NOT NULL CHECK(owner_resource_ref ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
 approval_ref text NOT NULL CHECK(approval_ref ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
 expires_at timestamptz NOT NULL CHECK(expires_at < 'infinity'),
 max_calls_per_reply smallint NOT NULL CHECK(max_calls_per_reply BETWEEN 1 AND 2),
 total_call_cap bigint NOT NULL CHECK(total_call_cap>=0),
 reply_token_cap bigint CHECK(reply_token_cap>=0),
 total_token_cap bigint CHECK(total_token_cap>=0),
 reply_price_cap_micros bigint CHECK(reply_price_cap_micros>=0),
 total_price_cap_micros bigint CHECK(total_price_cap_micros>=0),
 reserved_calls bigint NOT NULL DEFAULT 0 CHECK(reserved_calls>=0),
 reserved_tokens bigint NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0),
 reserved_price_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_price_micros>=0),
 spent_calls bigint NOT NULL DEFAULT 0 CHECK(spent_calls>=0),
 spent_tokens bigint NOT NULL DEFAULT 0 CHECK(spent_tokens>=0),
 spent_price_micros bigint NOT NULL DEFAULT 0 CHECK(spent_price_micros>=0),
 uncertain_calls bigint NOT NULL DEFAULT 0 CHECK(uncertain_calls>=0),
 uncertain_tokens bigint NOT NULL DEFAULT 0 CHECK(uncertain_tokens>=0),
 uncertain_price_micros bigint NOT NULL DEFAULT 0 CHECK(uncertain_price_micros>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,lineage_id),
 CHECK(unit<>'calls_tokens' OR (reply_token_cap IS NOT NULL AND total_token_cap IS NOT NULL
  AND reply_price_cap_micros IS NULL AND total_price_cap_micros IS NULL
  AND reserved_price_micros=0 AND spent_price_micros=0 AND uncertain_price_micros=0)),
 CHECK(unit<>'usd' OR (reply_price_cap_micros IS NOT NULL AND total_price_cap_micros IS NOT NULL
  AND reply_token_cap IS NULL AND total_token_cap IS NULL
  AND reserved_tokens=0 AND spent_tokens=0 AND uncertain_tokens=0))
);
CREATE UNIQUE INDEX conversation_grants_current ON sophia.conversation_grants(project_id) WHERE current;

-- The asking subjects a lineage lends the owner's resource to: a project grant alone lends nobody anything.
CREATE TABLE sophia.conversation_grant_subjects (
 project_id uuid NOT NULL, lineage_id uuid NOT NULL, actor_id uuid NOT NULL,
 added_revision bigint NOT NULL CHECK(added_revision>0),
 PRIMARY KEY(project_id,lineage_id,actor_id),
 FOREIGN KEY(project_id,lineage_id) REFERENCES sophia.conversation_grants(project_id,lineage_id)
);

-- A logical reply bound, at its first reservation, to that lineage and unit, for good.
CREATE TABLE sophia.conversation_reply_allowances (
 project_id uuid NOT NULL, reply_id uuid NOT NULL, lineage_id uuid NOT NULL,
 unit text NOT NULL CHECK(unit IN ('calls_tokens','usd')),
 first_reserved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,reply_id),
 FOREIGN KEY(project_id,reply_id) REFERENCES sophia.conversation_replies(project_id,id),
 FOREIGN KEY(project_id,lineage_id) REFERENCES sophia.conversation_grants(project_id,lineage_id)
);

-- One model call of a reply, by its logical key, with the fingerprint it was reserved under, never changed.
CREATE TABLE sophia.conversation_reservations (
 project_id uuid NOT NULL, reply_id uuid NOT NULL,
 call_ordinal smallint NOT NULL CHECK(call_ordinal BETWEEN 1 AND 2),
 lineage_id uuid NOT NULL,
 grant_revision bigint NOT NULL CHECK(grant_revision>0),
 unit text NOT NULL CHECK(unit IN ('calls_tokens','usd')),
 route_id text NOT NULL, credential_ref text NOT NULL, owner_resource_ref text NOT NULL,
 amount_calls bigint NOT NULL DEFAULT 1 CHECK(amount_calls=1),
 amount_tokens bigint NOT NULL CHECK(amount_tokens>=0),
 amount_price_micros bigint NOT NULL CHECK(amount_price_micros>=0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','settled','released','uncertain')),
 used_calls bigint CHECK(used_calls>=0),
 used_tokens bigint CHECK(used_tokens>=0),
 used_price_micros bigint CHECK(used_price_micros>=0),
 proof_kind text CHECK(proof_kind IN ('create_rejected','never_claimed','usage_record')),
 proof_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 PRIMARY KEY(project_id,reply_id,call_ordinal),
 FOREIGN KEY(project_id,reply_id) REFERENCES sophia.conversation_reply_allowances(project_id,reply_id),
 FOREIGN KEY(project_id,lineage_id) REFERENCES sophia.conversation_grants(project_id,lineage_id),
 CHECK(unit<>'calls_tokens' OR (amount_tokens>0 AND amount_price_micros=0)),
 CHECK(unit<>'usd' OR (amount_price_micros>0 AND amount_tokens=0)),
 CHECK((state IN ('settled','released'))=(used_calls IS NOT NULL AND used_tokens IS NOT NULL AND used_price_micros IS NOT NULL)),
 CHECK((state IN ('settled','released'))=(ended_at IS NOT NULL)),
 CHECK((proof_kind IS NULL)=(proof_id IS NULL))
);

-- What a lineage, a reply's binding and a reservation's fingerprint were made with never changes, and nothing in the
-- ledger is deleted.
CREATE FUNCTION sophia.conversation_ledger_kept() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ledger_kept' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME='conversation_grants' THEN
  IF (NEW.project_id,NEW.lineage_id,NEW.unit)<>(OLD.project_id,OLD.lineage_id,OLD.unit) THEN
   RAISE EXCEPTION 'unit_is_fixed' USING ERRCODE='55000'; END IF;
  IF NEW.current AND NOT OLD.current THEN RAISE EXCEPTION 'lineage_closed' USING ERRCODE='55000'; END IF;
 ELSIF TG_TABLE_NAME='conversation_reply_allowances' THEN
  RAISE EXCEPTION 'ledger_kept' USING ERRCODE='55000';
 ELSIF TG_TABLE_NAME='conversation_reservations' THEN
  IF (NEW.project_id,NEW.reply_id,NEW.call_ordinal,NEW.lineage_id,NEW.grant_revision,NEW.unit,NEW.route_id,
      NEW.credential_ref,NEW.owner_resource_ref,NEW.amount_calls,NEW.amount_tokens,NEW.amount_price_micros)
   <>(OLD.project_id,OLD.reply_id,OLD.call_ordinal,OLD.lineage_id,OLD.grant_revision,OLD.unit,OLD.route_id,
      OLD.credential_ref,OLD.owner_resource_ref,OLD.amount_calls,OLD.amount_tokens,OLD.amount_price_micros) THEN
   RAISE EXCEPTION 'fingerprint_fixed' USING ERRCODE='55000'; END IF;
  IF NOT ((OLD.state='reserved' AND NEW.state IN ('settled','released','uncertain'))
       OR (OLD.state='uncertain' AND NEW.state='settled')) THEN
   RAISE EXCEPTION 'outcome_conflict' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversation_grants_kept BEFORE UPDATE OR DELETE ON sophia.conversation_grants
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_ledger_kept();
CREATE TRIGGER conversation_reply_allowances_kept BEFORE UPDATE OR DELETE ON sophia.conversation_reply_allowances
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_ledger_kept();
CREATE TRIGGER conversation_reservations_kept BEFORE UPDATE OR DELETE ON sophia.conversation_reservations
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_ledger_kept();

-- An amount in a request: a non-negative whole JSON number that fits a bigint, else refused.
CREATE FUNCTION sophia.conversation_ledger_amount(p jsonb, k text) RETURNS bigint LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p IS NULL OR jsonb_typeof(p->k) IS DISTINCT FROM 'number' OR (p->>k) !~ '^(0|[1-9][0-9]{0,17})$' THEN
  RAISE EXCEPTION 'invalid_amount' USING ERRCODE='22023'; END IF;
 RETURN (p->>k)::bigint;
END $$;

-- A reservation as its caller may read it back: ids, state and amounts, never a reference's value.
CREATE FUNCTION sophia.conversation_reservation_receipt(r sophia.conversation_reservations) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('replyId',r.reply_id,'ordinal',r.call_ordinal,'state',r.state,'lineageId',r.lineage_id,
  'grantRevision',r.grant_revision,'unit',r.unit,
  'amount',jsonb_build_object('calls',r.amount_calls,'tokens',r.amount_tokens,'priceMicros',r.amount_price_micros),
  'used',CASE WHEN r.used_calls IS NULL THEN NULL
   ELSE jsonb_build_object('calls',r.used_calls,'tokens',r.used_tokens,'priceMicros',r.used_price_micros) END) $$;

-- The subjects a lineage lends to, replaced by the spec's list where it names one.
CREATE FUNCTION sophia.conversation_grant_subjects_set(g sophia.conversation_grants, p_spec jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE wanted uuid[];
BEGIN
 IF NOT (p_spec ? 'subjects') THEN RETURN; END IF;
 IF jsonb_typeof(p_spec->'subjects')<>'array' THEN RAISE EXCEPTION 'invalid_spec' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT v::uuid),'{}') INTO wanted FROM jsonb_array_elements_text(p_spec->'subjects') v;
 DELETE FROM sophia.conversation_grant_subjects
  WHERE project_id=g.project_id AND lineage_id=g.lineage_id AND NOT (actor_id=ANY(wanted));
 INSERT INTO sophia.conversation_grant_subjects(project_id,lineage_id,actor_id,added_revision)
  SELECT g.project_id,g.lineage_id,x,g.grant_revision FROM unnest(wanted) x ON CONFLICT DO NOTHING;
END $$;

-- Operator only: a new lineage, in a unit of its own, with a new approval, only while nothing is outstanding on the
-- current one; the old lineage keeps its counters, no longer current. Nothing converts one unit into another.
CREATE FUNCTION sophia.conversation_new_lineage(p_project uuid, p_spec jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.conversation_grants; was sophia.conversation_grants; unit text:=p_spec->>'unit';
BEGIN
 SELECT * INTO was FROM sophia.conversation_grants WHERE project_id=p_project AND current FOR UPDATE;
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM sophia.conversation_reservations r WHERE r.project_id=p_project
     AND r.lineage_id=was.lineage_id AND r.state IN ('reserved','uncertain')) THEN
   RAISE EXCEPTION 'outstanding' USING ERRCODE='55000'; END IF;
  IF p_spec->>'approvalRef' IS NOT DISTINCT FROM was.approval_ref THEN
   RAISE EXCEPTION 'approval_reused' USING ERRCODE='22023'; END IF;
  UPDATE sophia.conversation_grants SET current=false WHERE project_id=p_project AND lineage_id=was.lineage_id;
 END IF;
 INSERT INTO sophia.conversation_grants(project_id,unit,state,route_id,credential_ref,owner_resource_ref,approval_ref,
  expires_at,max_calls_per_reply,total_call_cap,reply_token_cap,total_token_cap,reply_price_cap_micros,
  total_price_cap_micros)
 VALUES(p_project,unit,coalesce(p_spec->>'state','enabled'),p_spec->>'routeId',p_spec->>'credentialRef',
  p_spec->>'ownerResourceRef',p_spec->>'approvalRef',(p_spec->>'expiresAt')::timestamptz,
  (p_spec->>'maxCallsPerReply')::smallint,sophia.conversation_ledger_amount(p_spec,'totalCallCap'),
  CASE WHEN unit='calls_tokens' THEN sophia.conversation_ledger_amount(p_spec,'replyTokenCap') END,
  CASE WHEN unit='calls_tokens' THEN sophia.conversation_ledger_amount(p_spec,'totalTokenCap') END,
  CASE WHEN unit='usd' THEN sophia.conversation_ledger_amount(p_spec,'replyPriceCapMicros') END,
  CASE WHEN unit='usd' THEN sophia.conversation_ledger_amount(p_spec,'totalPriceCapMicros') END)
 RETURNING * INTO g;
 PERFORM sophia.conversation_grant_subjects_set(g,p_spec);
 RETURN jsonb_build_object('lineageId',g.lineage_id,'grantRevision',g.grant_revision,'unit',g.unit,'state',g.state);
END $$;

-- Operator only: the current lineage's configuration (state, route and references, expiry, caps, subjects). Its
-- lineage, unit and counters are never written here, and no reservation is touched: an outstanding one keeps the route,
-- credential and revision it was made under. Lowering a cap below what is used only refuses new reservations.
CREATE FUNCTION sophia.conversation_set_grant(p_project uuid, p_spec jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.conversation_grants;
BEGIN
 SELECT * INTO g FROM sophia.conversation_grants WHERE project_id=p_project AND current FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_grant' USING ERRCODE='55000'; END IF;
 IF p_spec ? 'unit' AND p_spec->>'unit' IS DISTINCT FROM g.unit THEN
  RAISE EXCEPTION 'unit_is_fixed' USING ERRCODE='55000'; END IF;
 UPDATE sophia.conversation_grants SET
  state=coalesce(p_spec->>'state',state),
  route_id=coalesce(p_spec->>'routeId',route_id),
  credential_ref=coalesce(p_spec->>'credentialRef',credential_ref),
  owner_resource_ref=coalesce(p_spec->>'ownerResourceRef',owner_resource_ref),
  approval_ref=coalesce(p_spec->>'approvalRef',approval_ref),
  expires_at=coalesce((p_spec->>'expiresAt')::timestamptz,expires_at),
  max_calls_per_reply=coalesce((p_spec->>'maxCallsPerReply')::smallint,max_calls_per_reply),
  total_call_cap=CASE WHEN p_spec ? 'totalCallCap' THEN sophia.conversation_ledger_amount(p_spec,'totalCallCap')
   ELSE total_call_cap END,
  reply_token_cap=CASE WHEN p_spec ? 'replyTokenCap' THEN sophia.conversation_ledger_amount(p_spec,'replyTokenCap')
   ELSE reply_token_cap END,
  total_token_cap=CASE WHEN p_spec ? 'totalTokenCap' THEN sophia.conversation_ledger_amount(p_spec,'totalTokenCap')
   ELSE total_token_cap END,
  reply_price_cap_micros=CASE WHEN p_spec ? 'replyPriceCapMicros'
   THEN sophia.conversation_ledger_amount(p_spec,'replyPriceCapMicros') ELSE reply_price_cap_micros END,
  total_price_cap_micros=CASE WHEN p_spec ? 'totalPriceCapMicros'
   THEN sophia.conversation_ledger_amount(p_spec,'totalPriceCapMicros') ELSE total_price_cap_micros END,
  grant_revision=grant_revision+1
 WHERE project_id=p_project AND lineage_id=g.lineage_id RETURNING * INTO g;
 -- Enabled only with its expiry still ahead (a disabled grant enabled again, or a renewal that already lapsed).
 IF g.state='enabled' AND g.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'grant_expired' USING ERRCODE='55000'; END IF;
 PERFORM sophia.conversation_grant_subjects_set(g,p_spec);
 RETURN jsonb_build_object('lineageId',g.lineage_id,'grantRevision',g.grant_revision,'unit',g.unit,'state',g.state);
END $$;

-- One model call of a running reply, reserved against the current lineage under its lock; expiry is read after it.
-- An existing key replays its receipt when the call is the same (even after expiry, disable or a new lineage), and is
-- refused when it isn't. A logical call is never used twice: ordinals run 1, 2 in order, never reused.
CREATE FUNCTION sophia.conversation_reserve(p_project uuid, p_reply uuid, p_ordinal integer, p_call jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE q sophia.conversation_replies; g sophia.conversation_grants; a sophia.conversation_reply_allowances;
 r sophia.conversation_reservations; t timestamptz; tokens bigint; price bigint; last_ordinal integer;
 reply_tokens bigint; reply_price bigint;
BEGIN
 IF p_ordinal IS NULL OR p_ordinal NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'invalid_ordinal' USING ERRCODE='22023'; END IF;
 tokens:=sophia.conversation_ledger_amount(p_call,'tokens');
 price:=sophia.conversation_ledger_amount(p_call,'priceMicros');
 SELECT * INTO q FROM sophia.conversation_replies WHERE project_id=p_project AND id=p_reply FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_reply' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.conversation_grants WHERE project_id=p_project AND current FOR UPDATE;
 t:=clock_timestamp();
 SELECT * INTO r FROM sophia.conversation_reservations
  WHERE project_id=p_project AND reply_id=p_reply AND call_ordinal=p_ordinal;
 IF FOUND THEN
  IF r.route_id IS DISTINCT FROM p_call->>'routeId' OR r.credential_ref IS DISTINCT FROM p_call->>'credentialRef'
     OR r.owner_resource_ref IS DISTINCT FROM p_call->>'ownerResourceRef' OR r.unit IS DISTINCT FROM p_call->>'unit'
     OR r.amount_tokens<>tokens OR r.amount_price_micros<>price THEN
   RAISE EXCEPTION 'key_reused' USING ERRCODE='23505'; END IF;
  RETURN sophia.conversation_reservation_receipt(r);
 END IF;
 IF g.project_id IS NULL THEN RAISE EXCEPTION 'no_grant' USING ERRCODE='55000'; END IF;
 IF g.state<>'enabled' THEN RAISE EXCEPTION 'grant_disabled' USING ERRCODE='55000'; END IF;
 IF g.expires_at<=t THEN RAISE EXCEPTION 'grant_expired' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM sophia.conversation_reply_allowances WHERE project_id=p_project AND reply_id=p_reply;
 IF FOUND AND a.lineage_id<>g.lineage_id THEN RAISE EXCEPTION 'lineage_changed' USING ERRCODE='55000'; END IF;
 IF p_call->>'routeId' IS DISTINCT FROM g.route_id OR p_call->>'credentialRef' IS DISTINCT FROM g.credential_ref
    OR p_call->>'ownerResourceRef' IS DISTINCT FROM g.owner_resource_ref THEN
  RAISE EXCEPTION 'route_mismatch' USING ERRCODE='42501'; END IF;
 IF p_call->>'unit' IS DISTINCT FROM g.unit THEN RAISE EXCEPTION 'unit_mismatch' USING ERRCODE='22023'; END IF;
 IF (g.unit='calls_tokens' AND (tokens=0 OR price<>0)) OR (g.unit='usd' AND (price=0 OR tokens<>0)) THEN
  RAISE EXCEPTION 'invalid_amount' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.conversation_grant_subjects s
    WHERE s.project_id=p_project AND s.lineage_id=g.lineage_id AND s.actor_id=q.asked_by) THEN
  RAISE EXCEPTION 'asker_not_authorized' USING ERRCODE='42501'; END IF;
 IF q.state<>'running' THEN RAISE EXCEPTION 'reply_not_running' USING ERRCODE='55000'; END IF;
 IF p_ordinal>g.max_calls_per_reply THEN RAISE EXCEPTION 'calls_exhausted' USING ERRCODE='55000'; END IF;
 SELECT coalesce(max(call_ordinal),0),
        coalesce(sum(CASE WHEN state IN ('reserved','uncertain') THEN amount_tokens WHEN state='settled' THEN used_tokens
         ELSE 0 END),0),
        coalesce(sum(CASE WHEN state IN ('reserved','uncertain') THEN amount_price_micros
         WHEN state='settled' THEN used_price_micros ELSE 0 END),0)
   INTO last_ordinal,reply_tokens,reply_price
   FROM sophia.conversation_reservations WHERE project_id=p_project AND reply_id=p_reply;
 IF p_ordinal<>last_ordinal+1 THEN RAISE EXCEPTION 'ordinal_out_of_order' USING ERRCODE='22023'; END IF;
 IF (g.unit='calls_tokens' AND reply_tokens+tokens>g.reply_token_cap)
    OR (g.unit='usd' AND reply_price+price>g.reply_price_cap_micros)
    OR g.spent_calls+g.reserved_calls+g.uncertain_calls+1>g.total_call_cap
    OR (g.unit='calls_tokens' AND g.spent_tokens+g.reserved_tokens+g.uncertain_tokens+tokens>g.total_token_cap)
    OR (g.unit='usd' AND g.spent_price_micros+g.reserved_price_micros+g.uncertain_price_micros+price>g.total_price_cap_micros)
 THEN RAISE EXCEPTION 'limit_reached' USING ERRCODE='55000'; END IF;
 IF a.project_id IS NULL THEN
  INSERT INTO sophia.conversation_reply_allowances(project_id,reply_id,lineage_id,unit)
  VALUES(p_project,p_reply,g.lineage_id,g.unit);
 END IF;
 INSERT INTO sophia.conversation_reservations(project_id,reply_id,call_ordinal,lineage_id,grant_revision,unit,route_id,
  credential_ref,owner_resource_ref,amount_tokens,amount_price_micros)
 VALUES(p_project,p_reply,p_ordinal,g.lineage_id,g.grant_revision,g.unit,g.route_id,g.credential_ref,
  g.owner_resource_ref,tokens,price)
 RETURNING * INTO r;
 UPDATE sophia.conversation_grants SET reserved_calls=reserved_calls+1, reserved_tokens=reserved_tokens+tokens,
  reserved_price_micros=reserved_price_micros+price
 WHERE project_id=p_project AND lineage_id=g.lineage_id;
 RETURN sophia.conversation_reservation_receipt(r);
END $$;

-- A reservation settled from the call's reported usage (an overrun recorded at what it used). The same outcome
-- replays; a different one, or a reservation not open, is refused. Locks: the reservation's lineage, then the row.
CREATE FUNCTION sophia.conversation_settle(p_project uuid, p_reply uuid, p_ordinal integer, p_used jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_reservations; calls bigint; tokens bigint; price bigint;
BEGIN
 calls:=sophia.conversation_ledger_amount(p_used,'calls');
 tokens:=sophia.conversation_ledger_amount(p_used,'tokens');
 price:=sophia.conversation_ledger_amount(p_used,'priceMicros');
 SELECT * INTO r FROM sophia.conversation_reservations
  WHERE project_id=p_project AND reply_id=p_reply AND call_ordinal=p_ordinal;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_reservation' USING ERRCODE='22023'; END IF;
 IF calls<>1 OR (r.unit='calls_tokens' AND price<>0) OR (r.unit='usd' AND tokens<>0) THEN
  RAISE EXCEPTION 'invalid_amount' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.conversation_grants WHERE project_id=p_project AND lineage_id=r.lineage_id FOR UPDATE;
 SELECT * INTO r FROM sophia.conversation_reservations
  WHERE project_id=p_project AND reply_id=p_reply AND call_ordinal=p_ordinal FOR UPDATE;
 IF r.state='settled' AND (r.used_calls,r.used_tokens,r.used_price_micros)=(calls,tokens,price) THEN
  RETURN sophia.conversation_reservation_receipt(r); END IF;
 IF r.state<>'reserved' THEN RAISE EXCEPTION 'outcome_conflict' USING ERRCODE='23505'; END IF;
 UPDATE sophia.conversation_reservations SET state='settled', used_calls=calls, used_tokens=tokens,
  used_price_micros=price, ended_at=clock_timestamp()
 WHERE project_id=p_project AND reply_id=p_reply AND call_ordinal=p_ordinal RETURNING * INTO r;
 UPDATE sophia.conversation_grants SET reserved_calls=reserved_calls-r.amount_calls,
  reserved_tokens=reserved_tokens-r.amount_tokens, reserved_price_micros=reserved_price_micros-r.amount_price_micros,
  spent_calls=spent_calls+calls, spent_tokens=spent_tokens+tokens, spent_price_micros=spent_price_micros+price
 WHERE project_id=p_project AND lineage_id=r.lineage_id;
 RETURN sophia.conversation_reservation_receipt(r);
END $$;

-- At a terminal receipt: every reservation of the reply still open becomes uncertain, counted against the total until
-- an operator reconciles it. A restart, a fresh home, a retry or a deploy never releases it. How many moved.
CREATE FUNCTION sophia.conversation_mark_uncertain(p_project uuid, p_reply uuid) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a sophia.conversation_reply_allowances; moved integer; calls bigint; tokens bigint; price bigint;
BEGIN
 SELECT * INTO a FROM sophia.conversation_reply_allowances WHERE project_id=p_project AND reply_id=p_reply;
 IF NOT FOUND THEN RETURN 0; END IF;
 PERFORM 1 FROM sophia.conversation_grants WHERE project_id=p_project AND lineage_id=a.lineage_id FOR UPDATE;
 WITH m AS (
  UPDATE sophia.conversation_reservations SET state='uncertain'
   WHERE project_id=p_project AND reply_id=p_reply AND state='reserved'
   RETURNING amount_calls,amount_tokens,amount_price_micros)
 SELECT count(*),coalesce(sum(amount_calls),0),coalesce(sum(amount_tokens),0),coalesce(sum(amount_price_micros),0)
   INTO moved,calls,tokens,price FROM m;
 UPDATE sophia.conversation_grants SET reserved_calls=reserved_calls-calls, reserved_tokens=reserved_tokens-tokens,
  reserved_price_micros=reserved_price_micros-price, uncertain_calls=uncertain_calls+calls,
  uncertain_tokens=uncertain_tokens+tokens, uncertain_price_micros=uncertain_price_micros+price
 WHERE project_id=p_project AND lineage_id=a.lineage_id;
 RETURN moved;
END $$;

-- A release needs an authoritative proof that the call never left (a rejected create's receipt, or the outbox row
-- never claimed, fenced in the same transaction), and a reconcile needs the attempt's recorded usage. Both proof sources
-- are 0049's shared runtime tables, wired only in the shared window: until then, every call is refused.
CREATE FUNCTION sophia.conversation_release(p_project uuid, p_reply uuid, p_ordinal integer, p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'no_proof_source' USING ERRCODE='55000';
END $$;
CREATE FUNCTION sophia.conversation_reconcile(p_project uuid, p_reply uuid, p_ordinal integer, p_used jsonb,
 p_proof jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 RAISE EXCEPTION 'no_proof_source' USING ERRCODE='55000';
END $$;

-- Closed to every login: no grant here, row security on with no policy.
ALTER TABLE sophia.conversation_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_grant_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_reply_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.conversation_grants, sophia.conversation_grant_subjects, sophia.conversation_reply_allowances,
 sophia.conversation_reservations FROM PUBLIC, sophia_api, sophia_worker;
REVOKE ALL ON FUNCTION sophia.conversation_ledger_kept(), sophia.conversation_ledger_amount(jsonb,text),
 sophia.conversation_reservation_receipt(sophia.conversation_reservations),
 sophia.conversation_grant_subjects_set(sophia.conversation_grants,jsonb), sophia.conversation_new_lineage(uuid,jsonb),
 sophia.conversation_set_grant(uuid,jsonb), sophia.conversation_reserve(uuid,uuid,integer,jsonb),
 sophia.conversation_settle(uuid,uuid,integer,jsonb), sophia.conversation_mark_uncertain(uuid,uuid),
 sophia.conversation_release(uuid,uuid,integer,jsonb), sophia.conversation_reconcile(uuid,uuid,integer,jsonb,jsonb)
 FROM PUBLIC, sophia_api, sophia_worker;
