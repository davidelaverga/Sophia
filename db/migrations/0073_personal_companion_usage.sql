-- FND-B3-PERSONAL-LIVE-01: what a live personal companion's model calls cost, and who pays, kept apart from what was
-- said. One row per call (the call 0021's begin_companion_call registers), written only by the functions below.
-- * Content-free. A row keeps the call, its owner, the admitted payer and route, the amounts and the token counts the
--   provider reported, never a word of the prompt or the answer. Erasing the space (0021) deletes the conversation and
--   leaves these rows: what was spent stays spent, and no erasure gives a payer its allowance back.
-- * Reserved before the provider is asked, from a bound on everything the call can use (its input bytes and its full
--   output ceiling at the configured prices): the payer's settled, reserved and uncertain amounts plus this one must fit
--   its admitted allowance, or nothing is asked. A call whose usage is unknown (it was cut off, or reported none) stays
--   uncertain at its reservation.
-- * One unresolved call per payer (#435 4303867348): while a call of the payer is reserved or uncertain, no further
--   call is asked on it, whoever owns it. A reserved call whose runner is gone (its process died after the provider was
--   asked, or its settlement failed) stays reserved, its full bound counted, until an operator settles it from the
--   provider's record once its call is no longer registered. No unknown usage is ever released as nothing.
-- * The payer first (#435 4303867352): admission and every transition of a call (settle, hold, release, reconcile)
--   lock the payer's row before the call's, then recheck the call's owner and state, so they are seen in one order.
-- * A payer is admitted by an operator (personal_companion_payers, written by no API or worker role), with a finite
--   allowance in micro-USD. The API names its payer in configuration; it cannot admit one or raise an allowance.
-- * One owner per payer (#435 4304103151, P's initial scope): the operator enrolls each payer for exactly one verified
--   owner, and only that owner's calls reserve on it (checked under the payer's lock). Nobody else's call is asked on
--   it, and no API or worker role can enroll, re-enroll or widen a payer.
-- * Only a call begun in the space's current epoch reserves: one from before an erasure asks nothing more.
-- 0001–0072 are not edited.
BEGIN;

CREATE TABLE sophia.personal_companion_payers (
 payer text PRIMARY KEY CHECK (payer ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 owner_id uuid NOT NULL,
 allowance_micros bigint NOT NULL CHECK (allowance_micros > 0),
 admitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sophia.personal_companion_usage (
 call_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 payer text NOT NULL REFERENCES sophia.personal_companion_payers(payer),
 route_id text NOT NULL CHECK (route_id ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 epoch bigint NOT NULL,
 state text NOT NULL CHECK (state IN ('reserved','settled','uncertain','released')),
 reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
 used_micros bigint CHECK (used_micros >= 0),
 usage jsonb,
 reason text CHECK (reason ~ '^[a-z][a-z_]{0,39}$'),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 CHECK ((state IN ('reserved','released','uncertain')) = (used_micros IS NULL)),
 CHECK ((state = 'settled') = (usage IS NOT NULL))
);
CREATE INDEX personal_companion_usage_payer ON sophia.personal_companion_usage(payer, state);

ALTER TABLE sophia.personal_companion_payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.personal_companion_usage ENABLE ROW LEVEL SECURITY;
-- No grant on either table: the functions below are the only readers and writers.

-- Token counts as the provider reported them, and nothing else: only these keys, each a count.
CREATE FUNCTION sophia.personal_companion_counts(p_usage jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(p_usage)='object' AND p_usage ? 'inputTokens' AND p_usage ? 'outputTokens'
  AND NOT EXISTS(SELECT FROM jsonb_each(p_usage) e
   WHERE e.key NOT IN ('inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')
    OR jsonb_typeof(e.value)<>'number' OR (e.value#>>'{}')!~'^[0-9]{1,15}$') $$;
REVOKE ALL ON FUNCTION sophia.personal_companion_counts(jsonb) FROM PUBLIC;

-- Whether the payer is admitted for this owner (the API checks before it starts live, and /ready after).
CREATE FUNCTION sophia.personal_companion_admitted(p_payer text, p_owner uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT FROM sophia.personal_companion_payers WHERE payer=p_payer AND owner_id=p_owner) $$;

-- Reserve `p_micros` for the caller's call `p_call` on `p_payer`, before the provider is asked: 'reserved', or why
-- nothing may be asked ('not_admitted', also for a caller who is not the payer's enrolled owner, 'held' while a call of the payer is unresolved, 'exhausted', 'not_current' for a
-- call from before an erasure or not begun). A call reserves once.
CREATE FUNCTION sophia.reserve_personal_companion(p_call uuid, p_payer text, p_route text, p_micros bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.personal_owner(); e bigint; allowance bigint; enrolled uuid; spent bigint;
BEGIN
 IF p_micros IS NULL OR p_micros<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 SELECT c.epoch INTO e FROM sophia.personal_companion_calls c WHERE c.owner_id=a AND c.call_id=p_call;
 IF NOT FOUND OR e<>coalesce((SELECT s.epoch FROM sophia.personal_spaces s WHERE s.owner_id=a),0) THEN
  RETURN 'not_current';
 END IF;
 -- One payer's reservations are taken in turn, so two calls can't both fit the last of an allowance.
 SELECT allowance_micros, owner_id INTO allowance, enrolled FROM sophia.personal_companion_payers
  WHERE payer=p_payer FOR UPDATE;
 IF NOT FOUND OR enrolled<>a THEN RETURN 'not_admitted'; END IF;
 IF EXISTS(SELECT FROM sophia.personal_companion_usage WHERE call_id=p_call) THEN
  RAISE EXCEPTION 'This call already reserved' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT FROM sophia.personal_companion_usage WHERE payer=p_payer AND state IN ('reserved','uncertain')) THEN
  RETURN 'held';
 END IF;
 SELECT coalesce(sum(CASE state WHEN 'settled' THEN used_micros WHEN 'released' THEN 0 ELSE reserved_micros END),0)
  INTO spent FROM sophia.personal_companion_usage WHERE payer=p_payer;
 IF spent+p_micros>allowance THEN RETURN 'exhausted'; END IF;
 INSERT INTO sophia.personal_companion_usage(call_id,owner_id,payer,route_id,epoch,state,reserved_micros)
  VALUES(p_call,a,p_payer,p_route,e,'reserved',p_micros);
 RETURN 'reserved';
END $$;

-- The caller's reserved call ends: settled from the usage it reported, or held uncertain (no usable report: it was cut
-- off, or reported none), or released (the provider was never asked). Each happens once; true if it did here.
CREATE FUNCTION sophia.settle_personal_companion(p_call uuid, p_used bigint, p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pp text;
BEGIN
 IF p_used IS NULL OR p_used<0 OR NOT sophia.personal_companion_counts(p_usage) THEN
  RAISE EXCEPTION 'A settlement is a used amount and the reported token counts' USING ERRCODE='22023';
 END IF;
 SELECT payer INTO pp FROM sophia.personal_companion_usage WHERE call_id=p_call;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM FROM sophia.personal_companion_payers WHERE payer=pp FOR UPDATE;
 UPDATE sophia.personal_companion_usage SET state='settled', used_micros=p_used, usage=p_usage, settled_at=now()
  WHERE call_id=p_call AND owner_id=sophia.personal_owner() AND state='reserved';
 RETURN FOUND;
END $$;

CREATE FUNCTION sophia.hold_personal_companion(p_call uuid, p_reason text) RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pp text;
BEGIN
 SELECT payer INTO pp FROM sophia.personal_companion_usage WHERE call_id=p_call;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM FROM sophia.personal_companion_payers WHERE payer=pp FOR UPDATE;
 UPDATE sophia.personal_companion_usage SET state='uncertain', reason=p_reason, settled_at=now()
  WHERE call_id=p_call AND owner_id=sophia.personal_owner() AND state='reserved';
 RETURN FOUND;
END $$;

CREATE FUNCTION sophia.release_personal_companion(p_call uuid, p_reason text) RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pp text;
BEGIN
 SELECT payer INTO pp FROM sophia.personal_companion_usage WHERE call_id=p_call;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM FROM sophia.personal_companion_payers WHERE payer=pp FOR UPDATE;
 UPDATE sophia.personal_companion_usage SET state='released', reason=p_reason, settled_at=now()
  WHERE call_id=p_call AND owner_id=sophia.personal_owner() AND state='reserved';
 RETURN FOUND;
END $$;

-- An operator settles an unresolved call from the provider's own record (no API or worker grant): an uncertain one,
-- or a reserved one whose call is no longer registered (its runner is gone; a registered call is still its runner's).
-- The payer's next call may then be asked, if its allowance still fits. Once only.
CREATE FUNCTION sophia.reconcile_personal_companion(p_call uuid, p_used bigint, p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pp text;
BEGIN
 IF p_used IS NULL OR p_used<0 OR NOT sophia.personal_companion_counts(p_usage) THEN
  RAISE EXCEPTION 'A settlement is a used amount and the reported token counts' USING ERRCODE='22023';
 END IF;
 SELECT payer INTO pp FROM sophia.personal_companion_usage WHERE call_id=p_call;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM FROM sophia.personal_companion_payers WHERE payer=pp FOR UPDATE;
 UPDATE sophia.personal_companion_usage SET state='settled', used_micros=p_used, usage=p_usage, settled_at=now()
  WHERE call_id=p_call AND (state='uncertain' OR (state='reserved'
   AND NOT EXISTS(SELECT FROM sophia.personal_companion_calls c WHERE c.call_id=p_call)));
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION sophia.personal_companion_admitted(text,uuid), sophia.reserve_personal_companion(uuid,text,text,bigint),
 sophia.settle_personal_companion(uuid,bigint,jsonb), sophia.hold_personal_companion(uuid,text),
 sophia.release_personal_companion(uuid,text), sophia.reconcile_personal_companion(uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.personal_companion_admitted(text,uuid), sophia.reserve_personal_companion(uuid,text,text,bigint),
 sophia.settle_personal_companion(uuid,bigint,jsonb), sophia.hold_personal_companion(uuid,text),
 sophia.release_personal_companion(uuid,text) TO sophia_api;

COMMIT;
