-- INC01-CC-003 S1a (SOPHIA-INC-2026-11, C02): owner-host enrollment and the durable host channel. docs/plans/owner-host-transport.md.
-- An owner pairs one host of their own (an expiring, one-use code, hashed); the host authenticates with a capability it
-- generated itself (hashed here), says hello once with an identity that never changes, and serves EXCHANGES: the
-- worker's send, reconcile and observe of 0092 owner-runner operations, carried to the host's own gateway and journal.
-- * Additive; 0001-0092 are not edited. Built on 0092 (owner_runner_operations, owner_runner_ineligible,
--   owner_runner_envelope) and 0001 (execution_connections).
-- * No credential, native token or source text is stored: hashes, identities and the 0092 envelope only.
-- * A send is rechecked with 0092's own owner_runner_ineligible when it is delivered and again at GO, immediately before
--   the host's gateway acts; a host may call its gateway only after a GO granted here. A possibly-sent operation is
--   never re-prepared: these functions never change owner_runner_operations.
-- * NOT checked here or in 0092: source manifest, repository base, settings, source withdrawal. Real new work stays off.
-- * Tables: RLS on, no policy, no table grant. Access only through the functions below.
BEGIN;

CREATE TABLE sophia.owner_host_pairings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, connection_id uuid NOT NULL,
 code_sha256 bytea NOT NULL UNIQUE CHECK(length(code_sha256)=32),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 consumed_at timestamptz, host_id uuid, revoked_at timestamptz,
 FOREIGN KEY(connection_id,owner_id) REFERENCES sophia.execution_connections(id,owner_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '600 seconds'),
 CHECK((consumed_at IS NULL)=(host_id IS NULL))
);

CREATE TABLE sophia.owner_hosts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, connection_id uuid NOT NULL, pairing_id uuid NOT NULL UNIQUE REFERENCES sophia.owner_host_pairings(id),
 capability_sha256 bytea NOT NULL UNIQUE CHECK(length(capability_sha256)=32),
 state text NOT NULL DEFAULT 'bound' CHECK(state IN ('bound','active','retired','revoked')),
 -- The hello identity: bound once, then immutable (a changed hello is a conflict, never an update).
 journal_id uuid,
 environment_ref text CHECK(environment_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 adapter_pin text CHECK(adapter_pin ~ '^[0-9a-f]{40}$'),
 profile_id text CHECK(profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 profile_revision bigint CHECK(profile_revision>0),
 account_key text CHECK(account_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 t3_namespace text CHECK(t3_namespace ~ '^client:[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
 hello_ok boolean NOT NULL DEFAULT false, hello_conflict text CHECK(hello_conflict IS NULL OR length(hello_conflict)<=500),
 created_at timestamptz NOT NULL DEFAULT now(), bound_at timestamptz, last_seen_at timestamptz,
 retired_at timestamptz, revoked_at timestamptz,
 FOREIGN KEY(connection_id,owner_id) REFERENCES sophia.execution_connections(id,owner_id),
 CHECK((journal_id IS NULL)=(bound_at IS NULL)),
 CHECK(journal_id IS NULL OR (environment_ref IS NOT NULL AND adapter_pin IS NOT NULL AND profile_id IS NOT NULL
  AND profile_revision IS NOT NULL AND account_key IS NOT NULL AND t3_namespace IS NOT NULL))
);
CREATE INDEX owner_hosts_by_runner ON sophia.owner_hosts(owner_id,environment_ref,journal_id) WHERE state IN ('active','retired');

CREATE TABLE sophia.owner_host_exchanges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 host_id uuid NOT NULL REFERENCES sophia.owner_hosts(id), owner_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('send','reconcile','observe')),
 exchange_key text NOT NULL CHECK(exchange_key ~ '^[a-z]+:[0-9a-f-]{36}(:[0-9a-f-]{36})?$'),
 project_id uuid NOT NULL, operation_id uuid NOT NULL,
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object' AND octet_length(request::text)<=65536),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','delivered','go_granted','answered','denied','lapsed','cancelled')),
 deadline_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, delivery_count integer NOT NULL DEFAULT 0, go_count integer NOT NULL DEFAULT 0,
 answer jsonb CHECK(answer IS NULL OR (jsonb_typeof(answer)='object' AND octet_length(answer::text)<=65536)),
 answered_at timestamptz, reason text CHECK(reason IS NULL OR length(reason)<=500),
 UNIQUE(owner_id,exchange_key),
 FOREIGN KEY(project_id,operation_id) REFERENCES sophia.owner_runner_operations(project_id,id),
 -- Granted GO is never undone: an exchange granted once cannot become denied or cancelled (it may lapse or be answered).
 CHECK(NOT (go_count>0 AND state IN ('denied','cancelled','queued'))),
 CHECK((state='answered')=(answer IS NOT NULL))
);
CREATE INDEX owner_host_exchanges_due ON sophia.owner_host_exchanges(host_id,created_at) WHERE state IN ('queued','delivered','go_granted');

ALTER TABLE sophia.owner_host_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.owner_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.owner_host_exchanges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.owner_host_pairings, sophia.owner_hosts, sophia.owner_host_exchanges FROM PUBLIC;

-- --- the owner (sophia_api, actor derived server-side) -------------------------------------------------------------

CREATE FUNCTION sophia.owner_host_create_pairing(p_connection uuid, p_code_sha256 bytea, p_ttl_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); conn sophia.execution_connections; p sophia.owner_host_pairings;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_code_sha256 IS NULL OR length(p_code_sha256)<>32 OR p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 30 AND 600 THEN
  RAISE EXCEPTION 'Invalid pairing request' USING ERRCODE='22023'; END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=p_connection FOR SHARE;
 -- Another owner's connection answers like a missing one.
 IF NOT FOUND OR conn.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF conn.state<>'linked' OR (conn.expires_at IS NOT NULL AND conn.expires_at<=now()) THEN
  RAISE EXCEPTION 'Invalid pairing request: the connection is not linked' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.owner_host_pairings(owner_id,connection_id,code_sha256,expires_at)
 VALUES(a,p_connection,p_code_sha256,now()+make_interval(secs=>p_ttl_seconds)) RETURNING * INTO p;
 RETURN jsonb_build_object('pairingId',p.id,'expiresAt',p.expires_at);
END $$;

CREATE FUNCTION sophia.owner_host_revoke_pairing(p_pairing uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); p sophia.owner_host_pairings;
BEGIN
 SELECT * INTO p FROM sophia.owner_host_pairings WHERE id=p_pairing FOR UPDATE;
 IF a IS NULL OR NOT FOUND OR p.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('result','consumed','hostId',p.host_id); END IF;
 UPDATE sophia.owner_host_pairings SET revoked_at=coalesce(revoked_at,now()) WHERE id=p.id;
 RETURN jsonb_build_object('result','revoked');
END $$;

-- Fence a host's new work: create and input sends not yet granted GO are cancelled. Stops, reconciles and observes stay.
CREATE FUNCTION sophia.owner_host_fence_new_work(p_host uuid, p_reason text) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n integer;
BEGIN
 UPDATE sophia.owner_host_exchanges x SET state='cancelled', reason=left(p_reason,500)
  WHERE x.host_id=p_host AND x.kind='send' AND x.go_count=0 AND x.state IN ('queued','delivered')
   AND x.request->'envelope'->>'kind' IN ('create','input');
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

-- Retire: no new work through this host. Its journal's operations stay observable and stoppable through it.
CREATE FUNCTION sophia.owner_host_retire(p_host uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); h sophia.owner_hosts; n integer;
BEGIN
 SELECT * INTO h FROM sophia.owner_hosts WHERE id=p_host FOR UPDATE;
 IF a IS NULL OR NOT FOUND OR h.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF h.state IN ('bound','active') THEN UPDATE sophia.owner_hosts SET state='retired', retired_at=now() WHERE id=h.id; END IF;
 n:=sophia.owner_host_fence_new_work(h.id,'the owner host was retired before this send was authorized');
 RETURN jsonb_build_object('result','retired','fenced',n);
END $$;

-- Revoke: the capability is dead. Nothing more is delivered to it; exchanges never granted GO are cancelled. Operations
-- bound to its journal keep their state and reservation: revocation settles nothing and proves no native process ended.
CREATE FUNCTION sophia.owner_host_revoke(p_host uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); h sophia.owner_hosts; n integer;
BEGIN
 SELECT * INTO h FROM sophia.owner_hosts WHERE id=p_host FOR UPDATE;
 IF a IS NULL OR NOT FOUND OR h.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 UPDATE sophia.owner_hosts SET state='revoked', revoked_at=coalesce(revoked_at,now()) WHERE id=h.id;
 UPDATE sophia.owner_host_exchanges SET state='cancelled', reason='the owner host was revoked'
  WHERE host_id=h.id AND go_count=0 AND state IN ('queued','delivered');
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('result','revoked','fenced',n);
END $$;

-- The owner's own hosts and pairings: no hash, no code, no capability.
CREATE FUNCTION sophia.owner_host_list() RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object(
  'hosts',coalesce((SELECT jsonb_agg(jsonb_build_object('hostId',h.id,'connectionId',h.connection_id,'state',h.state,
     'environmentRef',h.environment_ref,'profileId',h.profile_id,'profileRevision',h.profile_revision,
     'helloOk',h.hello_ok,'helloConflict',h.hello_conflict,'createdAt',h.created_at,'boundAt',h.bound_at,
     'lastSeenAt',h.last_seen_at) ORDER BY h.created_at) FROM sophia.owner_hosts h WHERE h.owner_id=sophia.actor_id()),'[]'),
  'pairings',coalesce((SELECT jsonb_agg(jsonb_build_object('pairingId',p.id,'connectionId',p.connection_id,
     'expiresAt',p.expires_at,'consumed',p.consumed_at IS NOT NULL,'revoked',p.revoked_at IS NOT NULL) ORDER BY p.created_at)
   FROM sophia.owner_host_pairings p WHERE p.owner_id=sophia.actor_id()),'[]'))
 WHERE sophia.actor_id() IS NOT NULL
$$;

-- --- the host (sophia_api, no actor: authenticated by its capability hash) ------------------------------------------

-- Redeem a pairing. A retried redemption with the same code and capability (a lost reply) answers the same host.
CREATE FUNCTION sophia.owner_host_redeem(p_code_sha256 bytea, p_capability_sha256 bytea) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p sophia.owner_host_pairings; conn sophia.execution_connections; h sophia.owner_hosts; prior sophia.owner_hosts;
BEGIN
 IF p_code_sha256 IS NULL OR length(p_code_sha256)<>32 OR p_capability_sha256 IS NULL OR length(p_capability_sha256)<>32 THEN
  RAISE EXCEPTION 'Invalid redemption' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM sophia.owner_host_pairings WHERE code_sha256=p_code_sha256 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('result','refused','reason','unknown pairing code'); END IF;
 IF p.consumed_at IS NOT NULL THEN
  SELECT * INTO h FROM sophia.owner_hosts WHERE id=p.host_id;
  IF h.capability_sha256=p_capability_sha256 AND h.state<>'revoked' THEN
   RETURN jsonb_build_object('result','bound','hostId',h.id,'ownerId',h.owner_id,'connectionId',h.connection_id,'replayed',true);
  END IF;
  RETURN jsonb_build_object('result','refused','reason','the pairing code was already used');
 END IF;
 IF p.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('result','refused','reason','the pairing was revoked'); END IF;
 IF p.expires_at<=now() THEN RETURN jsonb_build_object('result','refused','reason','the pairing expired'); END IF;
 SELECT * INTO conn FROM sophia.execution_connections WHERE id=p.connection_id FOR SHARE;
 IF NOT FOUND OR conn.owner_id<>p.owner_id OR conn.state<>'linked' OR (conn.expires_at IS NOT NULL AND conn.expires_at<=now()) THEN
  RETURN jsonb_build_object('result','refused','reason','the connection is no longer linked'); END IF;
 IF EXISTS(SELECT 1 FROM sophia.owner_hosts WHERE capability_sha256=p_capability_sha256) THEN
  RETURN jsonb_build_object('result','refused','reason','this capability is already bound'); END IF;
 -- Re-pairing replaces the host for new work: earlier hosts of the connection are retired, never silently revoked.
 FOR prior IN SELECT * FROM sophia.owner_hosts WHERE owner_id=p.owner_id AND connection_id=p.connection_id
   AND state IN ('bound','active') FOR UPDATE LOOP
  UPDATE sophia.owner_hosts SET state='retired', retired_at=now() WHERE id=prior.id;
  PERFORM sophia.owner_host_fence_new_work(prior.id,'the owner host was replaced by a new pairing before this send was authorized');
 END LOOP;
 INSERT INTO sophia.owner_hosts(owner_id,connection_id,pairing_id,capability_sha256)
 VALUES(p.owner_id,p.connection_id,p.id,p_capability_sha256) RETURNING * INTO h;
 UPDATE sophia.owner_host_pairings SET consumed_at=now(), host_id=h.id WHERE id=p.id;
 RETURN jsonb_build_object('result','bound','hostId',h.id,'ownerId',h.owner_id,'connectionId',h.connection_id,'replayed',false);
END $$;

-- The host a capability authenticates, locked; a revoked or unknown capability is refused as unauthenticated.
CREATE FUNCTION sophia.owner_host_authenticate(p_capability_sha256 bytea) RETURNS sophia.owner_hosts LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts;
BEGIN
 IF p_capability_sha256 IS NULL OR length(p_capability_sha256)<>32 THEN
  RAISE EXCEPTION 'Owner host not authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM sophia.owner_hosts WHERE capability_sha256=p_capability_sha256 FOR UPDATE;
 IF NOT FOUND OR h.state='revoked' THEN RAISE EXCEPTION 'Owner host not authenticated' USING ERRCODE='42501'; END IF;
 RETURN h;
END $$;

-- Whether a JSON value is a string matching a pattern: false (never NULL) for a missing key, JSON null, a number or any
-- other type. Text extraction (->>) alone would accept 5 for "5" and pass NULL through an OR (r5, HOST-S1A-R4-F02).
CREATE FUNCTION sophia.owner_host_json_text(v jsonb, p_pattern text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND (v #>> '{}') ~ p_pattern, false) $$;

-- The protocol version this database speaks: exactly the JSON number 1 (r5). JSON null, a string, a missing key or any
-- other number is not it; IS DISTINCT FROM keeps every case a refusal rather than a NULL that skips the check.
CREATE FUNCTION sophia.owner_host_version_ok(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(jsonb_typeof(v)='number' AND v='1'::jsonb, false) $$;

CREATE FUNCTION sophia.owner_host_hello(p_capability_sha256 bytea, p_hello jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts:=sophia.owner_host_authenticate(p_capability_sha256); diff text[]:='{}';
 keys text[]:=ARRAY['accountKey','adapterPin','environmentRef','journalId','profileId','profileRevision','t3Namespace','v'];
BEGIN
 -- Every predicate is null-safe and typed (r5): a refusal can never become a NULL that skips the check.
 IF jsonb_typeof(p_hello) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_hello) k) IS DISTINCT FROM keys
    OR NOT sophia.owner_host_version_ok(p_hello->'v')
    OR NOT sophia.owner_host_json_text(p_hello->'journalId','^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR NOT sophia.owner_host_json_text(p_hello->'environmentRef','^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$')
    OR NOT sophia.owner_host_json_text(p_hello->'adapterPin','^[0-9a-f]{40}$')
    OR NOT sophia.owner_host_json_text(p_hello->'profileId','^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$')
    OR jsonb_typeof(p_hello->'profileRevision') IS DISTINCT FROM 'number'
    OR coalesce((p_hello->>'profileRevision') !~ '^[1-9][0-9]{0,15}$', true)
    OR NOT sophia.owner_host_json_text(p_hello->'accountKey','^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$')
    OR NOT sophia.owner_host_json_text(p_hello->'t3Namespace','^client:[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$') THEN
  RAISE EXCEPTION 'Invalid hello' USING ERRCODE='22023'; END IF;
 IF h.journal_id IS NULL THEN
  UPDATE sophia.owner_hosts SET journal_id=(p_hello->>'journalId')::uuid, environment_ref=p_hello->>'environmentRef',
   adapter_pin=p_hello->>'adapterPin', profile_id=p_hello->>'profileId', profile_revision=(p_hello->>'profileRevision')::bigint,
   account_key=p_hello->>'accountKey', t3_namespace=p_hello->>'t3Namespace', bound_at=now(), last_seen_at=now(),
   hello_ok=true, hello_conflict=NULL, state=CASE WHEN state='bound' THEN 'active' ELSE state END
   WHERE id=h.id RETURNING * INTO h;
  RETURN jsonb_build_object('result','ok','hostId',h.id,'state',h.state,'first',true);
 END IF;
 IF h.journal_id::text<>p_hello->>'journalId' THEN diff:=diff||'journalId'::text; END IF;
 IF h.environment_ref<>p_hello->>'environmentRef' THEN diff:=diff||'environmentRef'::text; END IF;
 IF h.adapter_pin<>p_hello->>'adapterPin' THEN diff:=diff||'adapterPin'::text; END IF;
 IF h.profile_id<>p_hello->>'profileId' THEN diff:=diff||'profileId'::text; END IF;
 IF h.profile_revision::text<>p_hello->>'profileRevision' THEN diff:=diff||'profileRevision'::text; END IF;
 IF h.account_key<>p_hello->>'accountKey' THEN diff:=diff||'accountKey'::text; END IF;
 IF h.t3_namespace<>p_hello->>'t3Namespace' THEN diff:=diff||'t3Namespace'::text; END IF;
 IF cardinality(diff)>0 THEN
  -- Never adopted: until a matching hello, nothing is delivered to this host. Pair again for a new identity.
  UPDATE sophia.owner_hosts SET hello_ok=false, hello_conflict='changed: '||array_to_string(diff,', ') WHERE id=h.id;
  RETURN jsonb_build_object('result','conflict','hostId',h.id,'changed',to_jsonb(diff));
 END IF;
 UPDATE sophia.owner_hosts SET hello_ok=true, hello_conflict=NULL, last_seen_at=now() WHERE id=h.id RETURNING * INTO h;
 RETURN jsonb_build_object('result','ok','hostId',h.id,'state',h.state,'first',false);
END $$;

-- Why a send exchange may not reach (or act through) this host now, or NULL. 0092's own recheck, plus the binding.
CREATE FUNCTION sophia.owner_host_send_refusal(x sophia.owner_host_exchanges, h sophia.owner_hosts) RETURNS text LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.owner_runner_operations;
BEGIN
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=x.project_id AND id=x.operation_id;
 IF NOT FOUND THEN RETURN 'the operation is gone'; END IF;
 IF o.state<>'possible_send' THEN RETURN 'the operation is '||o.state||', not waiting for this send'; END IF;
 IF o.gateway_journal_id IS DISTINCT FROM h.journal_id OR o.owner_id<>h.owner_id OR o.environment_ref IS DISTINCT FROM h.environment_ref THEN
  RETURN 'the operation is not bound to this host''s journal'; END IF;
 -- The host's bound identity must be the operation's frozen route: no other pin, profile or account acts for it.
 IF o.adapter_pin<>h.adapter_pin OR o.profile_id<>h.profile_id OR o.profile_revision<>h.profile_revision
    OR o.account_key<>h.account_key THEN
  RETURN 'the host''s identity is not the operation''s route'; END IF;
 IF NOT h.hello_ok THEN RETURN 'the host''s last hello did not match its identity'; END IF;
 IF o.kind='stop' THEN
  IF h.state NOT IN ('active','retired') THEN RETURN 'the host is '||h.state; END IF;
 ELSIF h.state<>'active' THEN RETURN 'the host is '||h.state||': no new work';
 END IF;
 RETURN sophia.owner_runner_ineligible(o);
END $$;

-- Deliver due exchanges to this host. A send is rechecked first; a refused one is denied, not delivered.
CREATE FUNCTION sophia.owner_host_poll(p_capability_sha256 bytea, p_limit integer DEFAULT 10, p_redeliver_seconds integer DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts:=sophia.owner_host_authenticate(p_capability_sha256); x sophia.owner_host_exchanges; why text;
 out jsonb:='[]';
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_redeliver_seconds IS NULL OR p_redeliver_seconds NOT BETWEEN 1 AND 300 THEN
  RAISE EXCEPTION 'Invalid poll bounds' USING ERRCODE='22023'; END IF;
 UPDATE sophia.owner_hosts SET last_seen_at=now() WHERE id=h.id;
 IF h.journal_id IS NULL OR NOT h.hello_ok THEN RETURN out; END IF;
 FOR x IN SELECT * FROM sophia.owner_host_exchanges e WHERE e.host_id=h.id AND e.deadline_at>clock_timestamp()
   AND (e.state='queued' OR (e.state IN ('delivered','go_granted') AND e.delivered_at<=now()-make_interval(secs=>p_redeliver_seconds)))
   ORDER BY e.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
 LOOP
  IF x.kind='send' THEN
   why:=sophia.owner_host_send_refusal(x,h);
   IF why IS NOT NULL AND x.go_count=0 THEN
    UPDATE sophia.owner_host_exchanges SET state='denied', reason=left('at delivery: '||why,500) WHERE id=x.id;
    CONTINUE;
   END IF;
  ELSIF h.state NOT IN ('active','retired') THEN CONTINUE;
  END IF;
  UPDATE sophia.owner_host_exchanges SET state=CASE WHEN state='go_granted' THEN 'go_granted' ELSE 'delivered' END,
   delivered_at=now(), delivery_count=delivery_count+1 WHERE id=x.id RETURNING * INTO x;
  out:=out||jsonb_build_array(jsonb_build_object('exchangeId',x.id,'kind',x.kind,'request',x.request,'deadlineAt',x.deadline_at));
 END LOOP;
 RETURN out;
END $$;

-- GO: the last recheck before the host's gateway acts. Rechecked every time; a grant is counted and never undone.
CREATE FUNCTION sophia.owner_host_go(p_capability_sha256 bytea, p_exchange uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts:=sophia.owner_host_authenticate(p_capability_sha256); x sophia.owner_host_exchanges; why text;
BEGIN
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange FOR UPDATE;
 IF NOT FOUND OR x.host_id<>h.id THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF x.kind<>'send' THEN RETURN jsonb_build_object('result','denied','reason','only a send asks for GO'); END IF;
 IF x.state NOT IN ('delivered','go_granted') THEN
  RETURN jsonb_build_object('result','denied','reason','the exchange is '||x.state,'grantedBefore',x.go_count>0); END IF;
 IF x.deadline_at<=clock_timestamp() THEN
  RETURN jsonb_build_object('result','denied','reason','the exchange''s deadline passed','grantedBefore',x.go_count>0); END IF;
 why:=sophia.owner_host_send_refusal(x,h);
 IF why IS NOT NULL THEN
  IF x.go_count=0 THEN UPDATE sophia.owner_host_exchanges SET state='denied', reason=left('at go: '||why,500) WHERE id=x.id;
  ELSE UPDATE sophia.owner_host_exchanges SET reason=left('go refused after an earlier grant: '||why,500) WHERE id=x.id;
  END IF;
  RETURN jsonb_build_object('result','denied','reason',why,'grantedBefore',x.go_count>0);
 END IF;
 UPDATE sophia.owner_host_exchanges SET state='go_granted', go_count=go_count+1, reason=NULL WHERE id=x.id;
 RETURN jsonb_build_object('result','go');
END $$;

CREATE FUNCTION sophia.owner_host_answer(p_capability_sha256 bytea, p_exchange uuid, p_answer jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts:=sophia.owner_host_authenticate(p_capability_sha256); x sophia.owner_host_exchanges; k text;
BEGIN
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange FOR UPDATE;
 IF NOT FOUND OR x.host_id<>h.id THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_answer IS NULL OR jsonb_typeof(p_answer)<>'object' OR octet_length(p_answer::text)>65536 THEN
  RAISE EXCEPTION 'Invalid answer' USING ERRCODE='22023'; END IF;
 -- The answer names its kind as a JSON string of its exchange's vocabulary (r5: a missing or null kind is refused).
 k:=CASE WHEN jsonb_typeof(p_answer->'kind')='string' THEN p_answer->>'kind' END;
 IF k IS NULL
    OR (x.kind IN ('send','reconcile') AND k NOT IN ('received','rejected','refused','conflict','unknown','settled'))
    OR (x.kind='observe' AND k NOT IN ('run','no_active_run','unknown')) THEN
  RAISE EXCEPTION 'Invalid answer' USING ERRCODE='22023'; END IF;
 -- A send never granted GO here was never handed to the gateway: the only honest answer for it is `refused`.
 IF x.kind='send' AND x.go_count=0 AND k IS DISTINCT FROM 'refused' THEN
  RAISE EXCEPTION 'Invalid answer: no GO was granted for this send' USING ERRCODE='22023'; END IF;
 IF x.state='queued' THEN RAISE EXCEPTION 'Invalid answer: the exchange was never delivered' USING ERRCODE='22023'; END IF;
 IF x.state='answered' THEN
  RETURN jsonb_build_object('result',CASE WHEN x.answer=p_answer THEN 'ok' ELSE 'conflict' END);
 END IF;
 UPDATE sophia.owner_host_exchanges SET state='answered', answer=p_answer, answered_at=now() WHERE id=x.id;
 RETURN jsonb_build_object('result','ok');
END $$;

-- --- the worker (sophia_worker) -----------------------------------------------------------------------------------

-- The host serving new work for one owner runner: active, with its identity bound and its hello matching.
CREATE FUNCTION sophia.owner_host_runner(p_owner uuid, p_environment text) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('hostId',h.id,'journalId',h.journal_id,'accountKey',h.account_key,'profileId',h.profile_id,
  'profileRevision',h.profile_revision,'t3Namespace',h.t3_namespace)
 FROM sophia.owner_hosts h WHERE h.owner_id=p_owner AND h.environment_ref=p_environment AND h.state='active' AND h.hello_ok
 ORDER BY h.bound_at DESC LIMIT 1
$$;

CREATE FUNCTION sophia.owner_host_enqueue(p_owner uuid, p_environment text, p_journal uuid, p_kind text, p_key text,
 p_request jsonb, p_deadline_ms integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.owner_runner_operations; h sophia.owner_hosts; x sophia.owner_host_exchanges; digest text;
 env_kind text:=p_request->'envelope'->>'kind';
BEGIN
 -- Every predicate is null-safe and typed (r5): a refusal can never become a NULL that skips the check.
 IF p_owner IS NULL OR p_environment IS NULL OR p_journal IS NULL OR p_kind IS NULL OR p_kind NOT IN ('send','reconcile','observe')
    OR p_deadline_ms IS NULL OR p_deadline_ms NOT BETWEEN 1000 AND 120000 OR p_request IS NULL
    OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k)
     IS DISTINCT FROM ARRAY['digest','envelope','journalId','kind','operationId','projectId','v']
    OR NOT sophia.owner_host_version_ok(p_request->'v')
    OR p_request->'kind' IS DISTINCT FROM to_jsonb(p_kind) OR p_request->'journalId' IS DISTINCT FROM to_jsonb(p_journal::text)
    OR NOT sophia.owner_host_json_text(p_request->'digest','^[0-9a-f]{64}$')
    OR NOT sophia.owner_host_json_text(p_request->'operationId','^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR NOT sophia.owner_host_json_text(p_request->'projectId','^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR jsonb_typeof(p_request->'envelope') IS DISTINCT FROM 'object'
    OR p_key IS NULL OR coalesce(p_key !~ ('^'||p_kind||':'||(p_request->>'operationId')||'(:[0-9a-f-]{36})?$'), true)
    OR (p_kind='send' AND p_key IS DISTINCT FROM 'send:'||(p_request->>'operationId'))
    OR octet_length(p_request::text)>65536 THEN
  RAISE EXCEPTION 'Invalid exchange' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=(p_request->>'projectId')::uuid AND id=(p_request->>'operationId')::uuid;
 IF NOT FOUND OR o.owner_id<>p_owner OR o.environment_ref<>p_environment OR o.gateway_journal_id IS DISTINCT FROM p_journal THEN
  RAISE EXCEPTION 'Invalid exchange: the operation is not this runner''s' USING ERRCODE='22023'; END IF;
 -- The envelope must be Sophia's own, exactly: no field of the caller's choosing reaches a host.
 IF p_request->'envelope' IS DISTINCT FROM sophia.owner_runner_envelope(o) THEN
  RAISE EXCEPTION 'Invalid exchange: the envelope is not the operation''s' USING ERRCODE='22023'; END IF;
 IF p_kind='send' AND o.state<>'possible_send' THEN
  RAISE EXCEPTION 'Invalid exchange: the operation is not waiting for its send' USING ERRCODE='22023'; END IF;
 digest:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE owner_id=p_owner AND exchange_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF x.payload_digest<>digest THEN RETURN jsonb_build_object('result','conflict','exchangeId',x.id); END IF;
  RETURN jsonb_build_object('result','existing','exchangeId',x.id,'state',x.state);
 END IF;
 SELECT * INTO h FROM sophia.owner_hosts WHERE owner_id=p_owner AND environment_ref=p_environment AND journal_id=p_journal
  AND hello_ok AND (state='active' OR (state='retired' AND (p_kind<>'send' OR env_kind='stop')))
  ORDER BY (state='active') DESC, bound_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('result','no_host'); END IF;
 INSERT INTO sophia.owner_host_exchanges(host_id,owner_id,kind,exchange_key,project_id,operation_id,payload_digest,request,deadline_at)
 VALUES(h.id,p_owner,p_kind,p_key,o.project_id,o.id,digest,p_request,clock_timestamp()+make_interval(secs=>p_deadline_ms/1000.0))
 RETURNING * INTO x;
 RETURN jsonb_build_object('result','queued','exchangeId',x.id,'state',x.state);
END $$;

CREATE FUNCTION sophia.owner_host_exchange(p_owner uuid, p_exchange uuid) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('exchangeId',x.id,'state',x.state,'goCount',x.go_count,'answer',x.answer,'reason',x.reason,
  'deadlinePassed',x.deadline_at<=clock_timestamp())
 FROM sophia.owner_host_exchanges x WHERE x.id=p_exchange AND x.owner_id=p_owner
$$;

-- The worker stops waiting. Whatever was granted GO stays a possible send; whatever was not can no longer be sent.
CREATE FUNCTION sophia.owner_host_settle(p_owner uuid, p_exchange uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_host_exchanges;
BEGIN
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid exchange' USING ERRCODE='22023'; END IF;
 IF x.state='answered' THEN RETURN jsonb_build_object('result','answered','answer',x.answer); END IF;
 IF x.go_count>0 THEN
  UPDATE sophia.owner_host_exchanges SET state='lapsed', reason=coalesce(reason,'no answer before the deadline after GO') WHERE id=x.id;
  RETURN jsonb_build_object('result','possible','reason','GO was granted and no answer came: a send may have happened');
 END IF;
 IF x.state IN ('queued','delivered') THEN
  UPDATE sophia.owner_host_exchanges SET state='lapsed', reason=coalesce(reason,'no GO before the worker stopped waiting')
   WHERE id=x.id RETURNING * INTO x;
 END IF;
 RETURN jsonb_build_object('result','not_sent','state',x.state,'reason',coalesce(x.reason,'no GO was granted'));
END $$;

-- Bounded cleanup: never-granted exchanges past their deadline lapse; finished reconcile/observe rows older than a day go.
-- Sends are kept as evidence.
CREATE FUNCTION sophia.owner_host_maintain(p_limit integer DEFAULT 100) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n integer; m integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid bound' USING ERRCODE='22023'; END IF;
 WITH due AS (SELECT id FROM sophia.owner_host_exchanges WHERE state IN ('queued','delivered') AND go_count=0
   AND deadline_at<=clock_timestamp() ORDER BY deadline_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
 UPDATE sophia.owner_host_exchanges x SET state='lapsed', reason=coalesce(x.reason,'its deadline passed before GO')
  FROM due WHERE x.id=due.id;
 GET DIAGNOSTICS n=ROW_COUNT;
 WITH old AS (SELECT id FROM sophia.owner_host_exchanges WHERE kind IN ('reconcile','observe')
   AND state IN ('answered','lapsed','cancelled','denied') AND created_at<now()-interval '1 day' LIMIT p_limit FOR UPDATE SKIP LOCKED)
 DELETE FROM sophia.owner_host_exchanges x USING old WHERE x.id=old.id;
 GET DIAGNOSTICS m=ROW_COUNT;
 RETURN n+m;
END $$;

REVOKE ALL ON FUNCTION sophia.owner_host_create_pairing(uuid,bytea,integer), sophia.owner_host_revoke_pairing(uuid),
 sophia.owner_host_fence_new_work(uuid,text), sophia.owner_host_retire(uuid), sophia.owner_host_revoke(uuid),
 sophia.owner_host_list(), sophia.owner_host_redeem(bytea,bytea), sophia.owner_host_authenticate(bytea),
 sophia.owner_host_json_text(jsonb,text), sophia.owner_host_version_ok(jsonb), sophia.owner_host_hello(bytea,jsonb), sophia.owner_host_send_refusal(sophia.owner_host_exchanges,sophia.owner_hosts),
 sophia.owner_host_poll(bytea,integer,integer), sophia.owner_host_go(bytea,uuid), sophia.owner_host_answer(bytea,uuid,jsonb),
 sophia.owner_host_runner(uuid,text), sophia.owner_host_enqueue(uuid,text,uuid,text,text,jsonb,integer),
 sophia.owner_host_exchange(uuid,uuid), sophia.owner_host_settle(uuid,uuid), sophia.owner_host_maintain(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.owner_host_create_pairing(uuid,bytea,integer), sophia.owner_host_revoke_pairing(uuid),
 sophia.owner_host_retire(uuid), sophia.owner_host_revoke(uuid), sophia.owner_host_list(),
 sophia.owner_host_redeem(bytea,bytea), sophia.owner_host_hello(bytea,jsonb), sophia.owner_host_poll(bytea,integer,integer),
 sophia.owner_host_go(bytea,uuid), sophia.owner_host_answer(bytea,uuid,jsonb) TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.owner_host_runner(uuid,text), sophia.owner_host_enqueue(uuid,text,uuid,text,text,jsonb,integer),
 sophia.owner_host_exchange(uuid,uuid), sophia.owner_host_settle(uuid,uuid), sophia.owner_host_maintain(integer) TO sophia_worker;

COMMIT;
