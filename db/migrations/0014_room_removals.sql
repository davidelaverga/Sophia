-- S1-05A (contract amendment A07): taking a guest out of the call is a durable obligation, not a best-effort call.
-- * Declining or blocking a guest who was let in records a pending removal in the same transaction as the decision.
--   The database already refuses them a new token; the pending removal is what takes away the one they may hold.
-- * A removal settles only on evidence: the LiveKit server removed them, or it verifiably lists them absent. A
--   failed call (the helper returning false, an unreachable server) stays pending, visibly, and is retried with
--   backoff by the worker; never treated as done, and never left to the token's expiry.
-- * After it settles, the removal keeps watch until any token issued before the decision has expired, so a guest
--   who reconnects with it is taken out again.
-- * Letting the guest in again cancels a pending removal.
-- 0001–0013 are not edited; decide_lobby_entry (0011) is replaced to record the obligation.
BEGIN;

CREATE TABLE sophia.room_removals (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES sophia.room_state(id),
 lobby_entry_id uuid NOT NULL REFERENCES sophia.room_lobby(id),
 identity text NOT NULL CHECK(length(identity) BETWEEN 1 AND 128),
 reason text NOT NULL CHECK(reason IN ('denied','blocked')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','removed','absent','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 last_error text CHECK(last_error IS NULL OR length(last_error)<=500),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 -- Tokens issued before the decision live at most this long (ROOM_TOKEN_TTL_SECONDS): watch until then.
 guard_until timestamptz NOT NULL,
 lease_owner text, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 PRIMARY KEY(project_id,id),
 CHECK((state='pending')=(settled_at IS NULL) OR state='cancelled')
);
CREATE UNIQUE INDEX room_removals_one_open ON sophia.room_removals(lobby_entry_id) WHERE state<>'cancelled' AND settled_at IS NULL;
CREATE INDEX room_removals_due ON sophia.room_removals(next_attempt_at) WHERE state<>'cancelled';

ALTER TABLE sophia.room_removals ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.room_removals FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.room_removals TO sophia_api;

-- decide_lobby_entry (0011), replaced: the same rules, plus the removal obligation of a guest who was let in.
CREATE OR REPLACE FUNCTION sophia.decide_lobby_entry(p_entry uuid, p_decision text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid; e sophia.room_lobby; prior text; next_status text;
BEGIN
 SELECT project_id INTO p FROM sophia.room_lobby WHERE id=p_entry;
 IF p IS NULL OR NOT sophia.can_edit(p) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 next_status:=CASE p_decision WHEN 'admit' THEN 'admitted' WHEN 'deny' THEN 'denied' WHEN 'block' THEN 'blocked'
  WHEN 'unblock' THEN 'left' END;
 IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_lobby WHERE id=p_entry FOR UPDATE;
 prior:=e.status;
 IF e.status=next_status THEN RETURN sophia.lobby_entry_json(e); END IF;
 IF p_decision='unblock' AND e.status<>'blocked' THEN RETURN sophia.lobby_entry_json(e); END IF;
 IF e.status='blocked' AND p_decision<>'unblock' THEN
  RAISE EXCEPTION 'Blocked: unblock them first' USING ERRCODE='40001';
 END IF;
 UPDATE sophia.room_lobby SET status=next_status, decided_by=sophia.actor_id(), decided_at=now(), revision=revision+1
  WHERE id=p_entry RETURNING * INTO e;
 IF next_status='admitted' THEN
  UPDATE sophia.room_removals SET state='cancelled', lease_owner=NULL, lease_until=NULL
   WHERE lobby_entry_id=e.id AND state<>'cancelled' AND (state='pending' OR guard_until>now());
 ELSIF next_status IN ('denied','blocked') AND prior IN ('admitted','denied') THEN
  -- Let in (or declined after being let in, with a removal still open): they may hold a token and be in the call.
  INSERT INTO sophia.room_removals(project_id,room_id,lobby_entry_id,identity,reason,guard_until)
  SELECT e.project_id,e.room_id,e.id,e.actor_id::text,next_status,now()+interval '10 minutes'
   WHERE prior='admitted' OR EXISTS(SELECT 1 FROM sophia.room_removals r WHERE r.lobby_entry_id=e.id
    AND r.state<>'cancelled' AND r.settled_at IS NULL)
  ON CONFLICT (lobby_entry_id) WHERE state<>'cancelled' AND settled_at IS NULL
  DO UPDATE SET reason=EXCLUDED.reason, guard_until=greatest(sophia.room_removals.guard_until,EXCLUDED.guard_until);
 END IF;
 PERFORM sophia.emit_project_event(p,'room.lobby_changed','room_lobby',e.id,e.revision,
  CASE next_status WHEN 'admitted' THEN 'room.lobby_admit' WHEN 'denied' THEN 'room.lobby_deny'
   WHEN 'blocked' THEN 'room.lobby_block' ELSE 'room.lobby_unblock' END);
 RETURN sophia.lobby_entry_json(e);
END $$;

-- The removals due now: pending ones whose backoff has passed, and settled ones still on watch. A claim is a
-- short lease; a worker that dies holding it is simply retried when the lease passes.
CREATE FUNCTION sophia.claim_room_removals(p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 30)
RETURNS TABLE(id uuid, room_id uuid, identity text, state text, attempts integer) LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A removal claim cannot carry a member identity' USING ERRCODE='42501'; END IF;
 IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 160 OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Invalid claim bounds' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH due AS (
  SELECT r.project_id, r.id FROM sophia.room_removals r
   WHERE r.next_attempt_at<=now() AND (r.lease_until IS NULL OR r.lease_until<=now())
     AND (r.state='pending' OR (r.state IN ('removed','absent') AND r.guard_until>now()))
   ORDER BY r.next_attempt_at FOR UPDATE OF r SKIP LOCKED LIMIT p_limit
 ) UPDATE sophia.room_removals r SET lease_owner=p_worker, lease_until=now()+make_interval(secs=>p_lease_seconds)
   FROM due WHERE r.project_id=due.project_id AND r.id=due.id
   RETURNING r.id, r.room_id, r.identity, r.state, r.attempts;
END $$;

-- What the LiveKit server said. 'removed' and 'absent' are evidence; 'failed' is not, and the removal stays pending
-- with a backoff. Fenced by the lease: a caller that lost it (or never had it, when another worker holds it) changes
-- nothing. Returns the removal's state afterwards, or 'stale'.
CREATE FUNCTION sophia.settle_room_removal(p_id uuid, p_worker text, p_outcome text, p_error text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.room_removals; l sophia.room_lobby; backoff integer; was text;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A removal settlement cannot carry a member identity' USING ERRCODE='42501'; END IF;
 IF p_outcome NOT IN ('removed','absent','failed') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.room_removals WHERE id=p_id;
 IF NOT FOUND THEN RETURN 'stale'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
 SELECT * INTO r FROM sophia.room_removals WHERE id=p_id FOR UPDATE;
 IF r.state='cancelled' OR (r.lease_owner IS NOT NULL AND r.lease_owner<>p_worker AND r.lease_until>now()) THEN RETURN 'stale'; END IF;
 was:=r.state;
 IF p_outcome='failed' THEN
  backoff:=least(60, 2^least(r.attempts,6))::integer;
  UPDATE sophia.room_removals SET state='pending', settled_at=NULL, attempts=attempts+1, last_error=left(coalesce(p_error,'failed'),500),
   next_attempt_at=now()+make_interval(secs=>backoff), lease_owner=NULL, lease_until=NULL WHERE id=r.id RETURNING * INTO r;
 ELSE
  -- On watch after settling: check again shortly while an earlier token could still bring them back.
  UPDATE sophia.room_removals SET state=CASE WHEN was='removed' AND p_outcome='absent' THEN 'removed' ELSE p_outcome END,
   settled_at=coalesce(settled_at,now()), attempts=attempts+CASE WHEN p_outcome='removed' THEN 1 ELSE 0 END,
   last_error=CASE WHEN p_outcome='removed' OR was='pending' THEN NULL ELSE last_error END,
   next_attempt_at=now()+interval '15 seconds', lease_owner=NULL, lease_until=NULL WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF r.state<>was OR p_outcome<>'absent' THEN
  UPDATE sophia.room_lobby SET revision=revision+1 WHERE id=r.lobby_entry_id RETURNING * INTO l;
  PERFORM sophia.emit_service_event(r.project_id,'room.lobby_changed','room_lobby',l.id,l.revision,'room.lobby_removal_'||r.state);
 END IF;
 RETURN r.state;
END $$;

REVOKE ALL ON FUNCTION sophia.claim_room_removals(text,integer,integer), sophia.settle_room_removal(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.claim_room_removals(text,integer,integer), sophia.settle_room_removal(uuid,text,text,text)
 TO sophia_worker, sophia_api;
COMMIT;
