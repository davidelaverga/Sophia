-- Voice qualification evidence for the Studio G7 episode (docs/plans/voice-qualification-g7.md, sophia.voice-
-- qualification.v1). Off unless the migration owner grants it. Nothing here records speech.
-- * A grant per project, made and revoked by the migration owner only: the synthetic principal it records (an active
--   editor or admin), the Lab run's binding hash, the approval it rests on, and hard limits: an exchange's length, the
--   provider connections a session may open, the model turns, the output tokens a turn may produce (the bridge sets
--   it as the session's maxOutputTokens) and a token budget. It ends at most two hours after it is made. It covers the
--   exchanges opened in its project while it is active, never one opened before it.
-- * Each Live turn bills the whole context again, and a turn's usage is reported only once it ends. So the budget is
--   held with the next turn's worst case reserved: an exchange ends once what it may have cost so far, plus the last
--   prompt's size (the context the next turn bills again) and one turn's output cap, would reach the budget.
-- * The bound is the exchange's, held here, never a session's: before the bridge opens a provider connection or lets a
--   generation start, it reserves it, and before it sends input it pays for it (media_voice_reserve). Connections and
--   generations are durable counters only a reservation adds to, and each connection keeps what was charged to it (each
--   generation at its worst case, and the input paid ahead) and what the provider reported of it; the exchange may
--   have cost the sum, connection by connection, of the greater of the two. A session that replaces a lost one, or a
--   restarted bridge, starts from the exchange's true counts. A reservation that does not fit ends the exchange, as
--   the guard would, and so does a bridge's own stop (its session_closed receipt says guard). A receipt names only a
--   connection that was reserved.
-- * The guard ends an exchange under a grant, as End would (ended_by stays null), at its deadline, when the grant is
--   revoked or expires, past its connection or turn limit, or at its budget, and records why. The API runs it on every
--   bridge presence report and assignment poll, so it acts whether or not the Lab is still there, and every receipt and
--   reservation checks the same limits for its own exchange; the event wakes the bridge's poll, and the bridge closes
--   the session and its provider connection.
-- * The bridge's receipts (input windows, input turns, the provider's lifecycle, replies, the session's close) are
--   kept 24 hours, readable only by the grant's principal, then deleted (voice_evidence_expire: the worker's periodic
--   pass, whatever the API's switch says and whether or not a bridge reports; the guard too). They carry counts, booleans, ids, timings and SHA-256
--   chains over PCM the bridge forwards or plays: the API's schemas refuse any free text. Nothing is kept of a
--   transcript, a caption or typed words.
-- * The canonical exchange of a voice-created task: the service records the exchange each bound voice tool call of a
--   grant's principal ran in, in an exchange under that grant (live_tool_calls), and the command the call admitted is
--   linked to it in the transaction that inserts it, never by its key; then marks the call answered. A member reads each task's exchange from it (native_task_exchanges), and their own calls in an exchange,
--   in order, each with its tool, the command it admitted and the task it created (exchange_calls). A member's own
--   command, under any key, links to no call.
-- * What a withdrawal reached of a task, for a member (task_withdrawn_sources): the sources a research, design or review
--   task's attempt drew on that are withdrawn now. Computed live from the very closure a withdrawal revokes work by, so
--   the Lab joins its own withdrawn note to the work it ended.
-- * A member reads the room as the bridge last saw it (room_live_presence): only whether they are in it, the counts,
--   the bridge's voice and the report's age; nobody else's identity.
-- * media_assignments (0022) is replaced with the same signature: an assignment under an active grant also names it
--   (`qualification`), so the bridge records only then, and only while the grant's principal holds the floor.
-- 0001-0045 are not edited.
BEGIN;

CREATE TABLE sophia.voice_qualification_grants (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 principal_actor_id uuid NOT NULL,
 run_binding_sha256 text NOT NULL CHECK(run_binding_sha256 ~ '^[0-9a-f]{64}$'),
 approval_ref text NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 300),
 max_exchange_seconds integer NOT NULL CHECK(max_exchange_seconds BETWEEN 60 AND 1800),
 max_provider_connections integer NOT NULL CHECK(max_provider_connections BETWEEN 1 AND 10),
 max_turns integer NOT NULL CHECK(max_turns BETWEEN 1 AND 200),
 max_output_tokens_per_turn integer NOT NULL CHECK(max_output_tokens_per_turn BETWEEN 64 AND 8192),
 max_usage_tokens bigint NOT NULL CHECK(max_usage_tokens BETWEEN 1000 AND 5000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 revoke_reason text CHECK(revoke_reason IS NULL OR revoke_reason ~ '^[a-z][a-z0-9_]{0,62}$'),
 PRIMARY KEY(project_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '2 hours'),
 CHECK((revoked_at IS NULL)=(revoke_reason IS NULL)),
 FOREIGN KEY(project_id,principal_actor_id) REFERENCES sophia.project_members(project_id,actor_id)
);
CREATE UNIQUE INDEX one_open_voice_grant ON sophia.voice_qualification_grants(project_id) WHERE revoked_at IS NULL;

-- What the bridge reserved of an exchange under a grant, and why the exchange ended. The connections opened and the
-- generations started (turns) are durable counters: only a reservation adds to them.
CREATE TABLE sophia.voice_qualification_exchanges (
 exchange_id uuid NOT NULL PRIMARY KEY REFERENCES sophia.room_exchanges(id),
 project_id uuid NOT NULL, grant_id uuid NOT NULL REFERENCES sophia.voice_qualification_grants(id),
 connections_opened integer NOT NULL DEFAULT 0 CHECK(connections_opened>=0),
 turns integer NOT NULL DEFAULT 0 CHECK(turns>=0),
 ended_reason text CHECK(ended_reason IS NULL OR ended_reason IN ('deadline','expired','revoked','connections','turns','usage','bridge')),
 ended_at timestamptz,
 CHECK((ended_reason IS NULL)=(ended_at IS NULL))
);

-- Each provider connection reserved for an exchange, by its durable ordinal: what was charged to it (each generation it
-- started, at its worst case) and what the provider reported of its session (cumulative), with the last prompt's size.
CREATE TABLE sophia.voice_qualification_connections (
 exchange_id uuid NOT NULL REFERENCES sophia.voice_qualification_exchanges(exchange_id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 64),
 reported_usage bigint NOT NULL DEFAULT 0 CHECK(reported_usage>=0),
 charged bigint NOT NULL DEFAULT 0 CHECK(charged>=0),
 last_prompt bigint NOT NULL DEFAULT 0 CHECK(last_prompt>=0),
 opened_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(exchange_id,ordinal)
);

CREATE TABLE sophia.voice_qualification_evidence (
 exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id),
 project_id uuid NOT NULL, grant_id uuid NOT NULL REFERENCES sophia.voice_qualification_grants(id),
 source text NOT NULL CHECK(source IN ('bridge','service')),
 seq integer NOT NULL CHECK(seq BETWEEN 0 AND 99999),
 kind text NOT NULL CHECK(kind IN ('input_window','input_turn','provider','output_reply','session_closed','guard')),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=4096),
 received_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 PRIMARY KEY(exchange_id,grant_id,source,seq),
 CHECK((source='service')=(kind='guard'))
);
CREATE INDEX voice_evidence_expiry ON sophia.voice_qualification_evidence(expires_at);

ALTER TABLE sophia.voice_qualification_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.voice_qualification_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.voice_qualification_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.voice_qualification_evidence ENABLE ROW LEVEL SECURITY;

-- The grant covering an exchange: the one active in its project when it opened.
CREATE FUNCTION sophia.voice_grant_of(p_project uuid, p_opened_at timestamptz) RETURNS sophia.voice_qualification_grants
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT g.* FROM sophia.voice_qualification_grants g
  WHERE g.project_id=p_project AND p_opened_at>=g.created_at
   AND p_opened_at<least(g.expires_at, coalesce(g.revoked_at,'infinity'::timestamptz))
  ORDER BY g.created_at DESC LIMIT 1 $$;

-- When an exchange under a grant must have ended: its own length, and never past the grant's end.
CREATE FUNCTION sophia.voice_deadline(g sophia.voice_qualification_grants, p_opened_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT least(g.expires_at, p_opened_at+make_interval(secs=>g.max_exchange_seconds)) $$;

-- Whether the next turn could pass the budget: what the exchange may have cost, plus the context it bills again and one
-- turn's output cap.
CREATE FUNCTION sophia.voice_budget_reached(g sophia.voice_qualification_grants, p_usage bigint, p_last_prompt bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT p_usage+p_last_prompt+g.max_output_tokens_per_turn>=g.max_usage_tokens $$;

-- What an exchange may have cost: each connection at the greater of what was charged to it and what it reported.
CREATE FUNCTION sophia.voice_committed(p_exchange uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(sum(greatest(c.reported_usage,c.charged)),0)::bigint
 FROM sophia.voice_qualification_connections c WHERE c.exchange_id=p_exchange $$;

-- The prompt size the exchange's latest connection reported: the context its next generation bills again.
CREATE FUNCTION sophia.voice_last_prompt(p_exchange uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT c.last_prompt FROM sophia.voice_qualification_connections c WHERE c.exchange_id=p_exchange
  ORDER BY c.ordinal DESC LIMIT 1),0) $$;

-- Why an exchange under a grant must end now, or null: the grant revoked or expired, the exchange's deadline, or a
-- limit passed by what was reserved (connections or turns past the grant's: the last one allowed runs to its end) or
-- the next turn that could pass the budget. A reservation is held to the same rules, so the guard never cuts a
-- generation it granted.
CREATE FUNCTION sophia.voice_limit_reached(g sophia.voice_qualification_grants, p_opened_at timestamptz, p_exchange uuid)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
   WHEN g.revoked_at IS NOT NULL THEN 'revoked'
   WHEN g.expires_at<=now() THEN 'expired'
   WHEN sophia.voice_deadline(g, p_opened_at)<=now() THEN 'deadline'
   WHEN coalesce(q.connections_opened,0)>g.max_provider_connections THEN 'connections'
   WHEN coalesce(q.turns,0)>g.max_turns THEN 'turns'
   WHEN sophia.voice_budget_reached(g, sophia.voice_committed(p_exchange), sophia.voice_last_prompt(p_exchange)) THEN 'usage'
   ELSE NULL END
 FROM (SELECT 1) one LEFT JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=p_exchange $$;

-- The migration owner's grant. A new grant supersedes the project's open one.
CREATE FUNCTION sophia.voice_qualification_grant(p_project uuid, p_principal uuid, p_run_binding_sha256 text,
  p_approval_ref text, p_max_exchange_seconds integer, p_max_provider_connections integer, p_max_turns integer,
  p_max_output_tokens_per_turn integer, p_max_usage_tokens bigint, p_ttl_seconds integer)
RETURNS sophia.voice_qualification_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.voice_qualification_grants;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A grant is the operator''s, never a member''s' USING ERRCODE='42501'; END IF;
 IF p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 60 AND 7200 THEN
  RAISE EXCEPTION 'A grant lasts 1 minute to 2 hours' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_principal AND active
   AND role IN ('admin','editor')) THEN
  RAISE EXCEPTION 'The principal must be an active editor or admin of the project' USING ERRCODE='22023'; END IF;
 UPDATE sophia.voice_qualification_grants SET revoked_at=now(), revoke_reason='superseded'
  WHERE project_id=p_project AND revoked_at IS NULL;
 INSERT INTO sophia.voice_qualification_grants(project_id,principal_actor_id,run_binding_sha256,approval_ref,
  max_exchange_seconds,max_provider_connections,max_turns,max_output_tokens_per_turn,max_usage_tokens,expires_at)
 VALUES(p_project,p_principal,p_run_binding_sha256,p_approval_ref,p_max_exchange_seconds,p_max_provider_connections,
  p_max_turns,p_max_output_tokens_per_turn,p_max_usage_tokens,now()+make_interval(secs=>p_ttl_seconds))
 RETURNING * INTO g;
 RETURN g;
END $$;

-- The migration owner's revocation: the grant's exchanges end at the next guard.
CREATE FUNCTION sophia.voice_qualification_revoke(p_project uuid, p_grant uuid, p_reason text)
RETURNS sophia.voice_qualification_grants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.voice_qualification_grants;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'A grant is the operator''s, never a member''s' USING ERRCODE='42501'; END IF;
 UPDATE sophia.voice_qualification_grants SET revoked_at=now(), revoke_reason=p_reason
  WHERE project_id=p_project AND id=p_grant AND revoked_at IS NULL RETURNING * INTO g;
 IF g.id IS NULL THEN RAISE EXCEPTION 'No open grant' USING ERRCODE='P0002'; END IF;
 RETURN g;
END $$;

-- End an exchange under a grant as End would (ended_by stays null), once, and record why: the guard's receipt (service,
-- seq 0) and the room's event, which wakes the bridge's poll. Whether this call ended it.
CREATE FUNCTION sophia.voice_end_exchange(p_exchange uuid, g sophia.voice_qualification_grants, p_why text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE ended sophia.room_exchanges;
BEGIN
 UPDATE sophia.room_exchanges SET state='ended', pause_reason=NULL, ended_at=now(), revision=revision+1
  WHERE id=p_exchange AND state<>'ended' RETURNING * INTO ended;
 IF ended.id IS NULL THEN RETURN false; END IF;
 INSERT INTO sophia.voice_qualification_exchanges(exchange_id,project_id,grant_id,ended_reason,ended_at)
 VALUES(ended.id,ended.project_id,g.id,p_why,now())
 ON CONFLICT (exchange_id) DO UPDATE SET ended_reason=EXCLUDED.ended_reason, ended_at=EXCLUDED.ended_at;
 INSERT INTO sophia.voice_qualification_evidence(exchange_id,project_id,grant_id,source,seq,kind,receipt)
 VALUES(ended.id,ended.project_id,g.id,'service',0,'guard',jsonb_build_object('kind','guard',
  'schema','sophia.service.guard.v1','grantId',g.id,'runBindingSha256',g.run_binding_sha256,
  'reason',p_why,'atMs',floor(extract(epoch FROM now())*1000)::bigint))
 ON CONFLICT DO NOTHING;
 PERFORM sophia.emit_service_event(ended.project_id,'room.exchange_changed','room_exchange',ended.id,ended.revision,
  'room.exchange_qualification_limit');
 RETURN true;
END $$;

-- Receipts past their 24 hours, the bridge's and the guard's, deleted: how many. The worker's periodic pass calls it
-- (apps/worker dispatchOnce, at least every 2 s, on the sophia_worker login), so retention holds without bridge traffic
-- and whatever the API's voice qualification switch says; the guard calls it too. Nothing else of 0046 expires: the
-- exchanges' counters and the connections' charges are the durable bound (deleting a live exchange's would reset its
-- spend) and an ended one's is the audit of what the grant spent; live_tool_calls is the canonical join from a task to
-- its exchange, kept as long as the task; the grants are the operator's record. None holds speech, a digest or a timing
-- of anyone's input: the receipts do.
CREATE FUNCTION sophia.voice_evidence_expire() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n integer;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Expiry is the service''s, never a member''s' USING ERRCODE='42501'; END IF;
 DELETE FROM sophia.voice_qualification_evidence WHERE expires_at<=now();
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END $$;

-- End every exchange under a grant that is past its deadline, revoked, expired or over a limit, as End would.
-- Returns how many it ended. Expired evidence goes too (voice_evidence_expire).
-- Lock order (0003): a due exchange's project, then the exchange, as control_exchange takes them. A row another
-- transaction holds is skipped, never waited on, so the guard is never part of a deadlock: a reservation or a receipt
-- holding it checks its own exchange under its locks, and the next run (each presence report, each assignment read)
-- takes up what is left. The fixed order only makes the guard's locks predictable; skipping is what keeps it apart.
CREATE FUNCTION sophia.voice_qualification_guard() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r record; e sophia.room_exchanges; g sophia.voice_qualification_grants; why text; n integer:=0;
BEGIN
 PERFORM sophia.require_service();
 PERFORM sophia.voice_evidence_expire();
 FOR r IN SELECT x.id, x.project_id FROM sophia.room_exchanges x
   CROSS JOIN LATERAL sophia.voice_grant_of(x.project_id, x.opened_at) c
   WHERE x.state<>'ended' AND c.id IS NOT NULL AND sophia.voice_limit_reached(c, x.opened_at, x.id) IS NOT NULL
   ORDER BY x.project_id, x.id LOOP
  PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE SKIP LOCKED;
  CONTINUE WHEN NOT FOUND;
  SELECT * INTO e FROM sophia.room_exchanges WHERE id=r.id AND state<>'ended' FOR UPDATE SKIP LOCKED;
  CONTINUE WHEN NOT FOUND;
  -- Read again under the locks: a reservation, a receipt or another run may have moved it since.
  g:=sophia.voice_grant_of(e.project_id, e.opened_at);
  why:=sophia.voice_limit_reached(g, e.opened_at, e.id);
  CONTINUE WHEN g.id IS NULL OR why IS NULL;
  IF sophia.voice_end_exchange(e.id, g, why) THEN n:=n+1; END IF;
 END LOOP;
 RETURN n;
END $$;

-- What the bridge's assignment names of the grant covering an exchange, while it is active.
CREATE FUNCTION sophia.voice_assignment_qualification(p_project uuid, p_opened_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN g.id IS NULL OR g.revoked_at IS NOT NULL OR g.expires_at<=now() THEN NULL
  ELSE jsonb_build_object('grantId',g.id,'runBindingSha256',g.run_binding_sha256,'principalActorId',g.principal_actor_id,
   'deadline',sophia.voice_deadline(g,p_opened_at),'maxProviderConnections',g.max_provider_connections,
   'maxTurns',g.max_turns,'maxOutputTokensPerTurn',g.max_output_tokens_per_turn,'maxUsageTokens',g.max_usage_tokens) END
 FROM sophia.voice_grant_of(p_project,p_opened_at) g $$;

-- media_assignments (0022) with the grant an exchange is under. Otherwise 0022's text.
CREATE OR REPLACE FUNCTION sophia.media_assignments() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('exchangeId',e.id,'projectId',e.project_id,'roomId',e.room_id,'state',e.state,
   'pauseReason',e.pause_reason,'inputEpoch',e.input_epoch,'inputActorId',i.actor_id,'playbackEpoch',e.playback_epoch,
   'observationEpoch',e.observation_epoch,'allowVision',e.allow_vision,
   'looking',CASE WHEN e.look_identity IS NULL THEN NULL ELSE jsonb_build_object('participantIdentity',e.look_identity,'source',e.look_source) END,
   'roomRevision',r.revision,'quiesceRequestId',q.id,
   'missionRevision',pr.mission_revision,'ledgerRevision',pr.ledger_revision,'eligibilityRevision',pr.eligibility_revision,
   'results',(SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',j.id,'resultRevision',j.result_revision,'kind',j.kind)
      ORDER BY src.created_at),'[]')
     FROM sophia.jobs j JOIN sophia.source_objects src ON src.project_id=j.project_id AND src.id=j.result_source_id
     WHERE j.project_id=e.project_id AND sophia.is_task_kind(j.kind) AND j.parent_job_id IS NULL AND j.state='succeeded'
      AND src.created_at>=e.opened_at
      AND NOT EXISTS(SELECT 1 FROM sophia.exchange_announcements x WHERE x.exchange_id=e.id AND x.job_id=j.id
       AND x.result_revision=j.result_revision)))
   || CASE WHEN qual IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('qualification',qual) END ORDER BY e.room_id),'[]')
  FROM sophia.room_exchanges e JOIN sophia.room_state r ON r.id=e.room_id JOIN sophia.projects pr ON pr.id=e.project_id
  LEFT JOIN sophia.exchange_inputs i ON i.exchange_id=e.id AND i.input_epoch=e.input_epoch
  LEFT JOIN LATERAL (SELECT id FROM sophia.room_quiesce_requests q WHERE q.exchange_id=e.id AND q.acked_at IS NULL
   ORDER BY q.requested_at DESC LIMIT 1) q ON true
  CROSS JOIN LATERAL sophia.voice_assignment_qualification(e.project_id,e.opened_at) qual
  WHERE e.state<>'ended');
END $$;

-- The bridge's durable reservation, before it spends anything on an exchange under a grant, under the exchange's lock:
-- * 'connection', before it opens a provider connection: refused past the grant's connections; otherwise the next
--   durable ordinal, which every receipt of that connection names.
-- * 'generation', before it sends what can start one (input after a turn ended, a tool response, a notice, a typed
--   message), on a reserved connection: refused past the grant's turns, or when what the exchange may have cost plus
--   this charge would pass the budget; otherwise the turn is counted and the charge kept on that connection.
-- * 'unasked', when a generation nobody asked for has started (its output arrived): it is already spent, so it is
--   counted and charged whatever the limits, and the exchange ends if they are now reached.
-- * 'spend', before the bridge sends input (audio, a frame) its connection's prepaid allowance does not cover, or as a
--   transcription's cost passes it: a top-up of that allowance on a reserved connection. It is a charge only: it counts
--   no turn and opens no ordinal, and it fits as a generation's charge does, by the budget alone. So what the bridge
--   sends is paid for here before it is sent, and a crash loses only allowance already paid, never unpaid spend.
-- The charge is the bridge's worst case for a generation (the context again and its output twice), with the text it
-- sends and, for the generation input asks for, what fills the connection's input allowance; or a top-up's amount. A
-- generation fits while it leaves the turns within the grant's and, charged, the exchange's next turn could still not
-- pass the budget (voice_budget_reached, the guard's own rule): so the guard never cuts one it granted; a top-up fits by
-- the same budget rule. A reservation that does not fit ends the exchange as the guard would; so does a limit the
-- guard would end it at. An exchange already ended is refused (40001), whatever the kind but a stop. A 'stop' is the
-- bridge's own stop (its bound, or the deadline), whoever holds the floor: it reserves nothing, records nothing, and
-- ends the exchange (reason bridge), once; an exchange already ended answers it the same.
CREATE FUNCTION sophia.media_voice_reserve(p_exchange uuid, p_grant uuid, p_kind text, p_ordinal integer, p_charge bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges; g sophia.voice_qualification_grants; q sophia.voice_qualification_exchanges; why text;
 p uuid;
BEGIN
 PERFORM sophia.require_service();
 IF p_kind IS NULL OR p_kind NOT IN ('connection','generation','unasked','spend','stop') THEN
  RAISE EXCEPTION 'Not a reservation' USING ERRCODE='22023'; END IF;
 IF p_kind IN ('generation','unasked','spend') AND (p_ordinal IS NULL OR p_ordinal NOT BETWEEN 1 AND 64 OR p_charge IS NULL
   OR p_charge NOT BETWEEN 0 AND 5000000) THEN
  RAISE EXCEPTION 'A charge names its connection and is 0 to 5,000,000' USING ERRCODE='22023'; END IF;
 -- Lock order (0003): the project, then its exchange, as control_exchange takes them; ending the exchange emits the
 -- project's event under both.
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL THEN RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR UPDATE;
 g:=sophia.voice_grant_of(e.project_id, e.opened_at);
 IF g.id IS NULL OR g.id<>p_grant THEN RAISE EXCEPTION 'The exchange is not under this grant' USING ERRCODE='42501'; END IF;
 IF p_kind='stop' THEN
  PERFORM sophia.voice_end_exchange(e.id, g, 'bridge');
  RETURN jsonb_build_object('ok',true,'ordinal',NULL,'stop',NULL,'ended',true);
 END IF;
 IF e.state='ended' THEN RAISE EXCEPTION 'The exchange has ended' USING ERRCODE='40001'; END IF;
 -- The exchange's row lock above makes a reservation atomic: the counters are read and moved under it.
 SELECT * INTO q FROM sophia.voice_qualification_exchanges WHERE exchange_id=e.id;
 IF q.exchange_id IS NULL THEN
  INSERT INTO sophia.voice_qualification_exchanges(exchange_id,project_id,grant_id) VALUES(e.id,e.project_id,g.id)
  RETURNING * INTO q;
 END IF;
 IF p_kind<>'connection' AND NOT EXISTS(SELECT 1 FROM sophia.voice_qualification_connections
   WHERE exchange_id=e.id AND ordinal=p_ordinal) THEN
  RAISE EXCEPTION 'The generation names a connection that was not reserved' USING ERRCODE='22023'; END IF;
 IF p_kind='unasked' THEN
  UPDATE sophia.voice_qualification_exchanges SET turns=turns+1 WHERE exchange_id=e.id;
  UPDATE sophia.voice_qualification_connections SET charged=charged+p_charge WHERE exchange_id=e.id AND ordinal=p_ordinal;
  why:=sophia.voice_limit_reached(g, e.opened_at, e.id);
 ELSE
  why:=coalesce(sophia.voice_limit_reached(g, e.opened_at, e.id), CASE
   WHEN p_kind='connection' AND q.connections_opened+1>g.max_provider_connections THEN 'connections'
   WHEN p_kind='generation' AND q.turns+1>g.max_turns THEN 'turns'
   WHEN p_kind IN ('generation','spend') AND sophia.voice_budget_reached(g, sophia.voice_committed(e.id)+p_charge,
    sophia.voice_last_prompt(e.id)) THEN 'usage'
   ELSE NULL END);
  IF why IS NULL AND p_kind='connection' THEN
   UPDATE sophia.voice_qualification_exchanges SET connections_opened=q.connections_opened+1 WHERE exchange_id=e.id;
   INSERT INTO sophia.voice_qualification_connections(exchange_id,ordinal) VALUES(e.id,q.connections_opened+1);
   RETURN jsonb_build_object('ok',true,'ordinal',q.connections_opened+1,'stop',NULL,'ended',false);
  ELSIF why IS NULL THEN
   -- A top-up counts no turn: only a generation does.
   IF p_kind='generation' THEN
    UPDATE sophia.voice_qualification_exchanges SET turns=q.turns+1 WHERE exchange_id=e.id;
   END IF;
   UPDATE sophia.voice_qualification_connections SET charged=charged+p_charge WHERE exchange_id=e.id AND ordinal=p_ordinal;
  END IF;
 END IF;
 IF why IS NULL THEN RETURN jsonb_build_object('ok',true,'ordinal',p_ordinal,'stop',NULL,'ended',false); END IF;
 PERFORM sophia.voice_end_exchange(e.id, g, why);
 RETURN jsonb_build_object('ok',false,'ordinal',NULL,'stop',why,'ended',true);
END $$;

-- A bridge receipt for an exchange under a grant: bound to that grant and its run, once per sequence number (the
-- same receipt again is a no-op; another under the same number is refused), naming only a connection that was
-- reserved. A provider receipt carries what the provider reported of its connection's session, kept as that
-- connection's highest report with its prompt size; a session_closed receipt that says guard (the bridge's own bound
-- or the deadline stopped it) ends the exchange. Then the guard's limits are checked for this exchange alone, under its
-- locks: another exchange is the guard's to end, never a receipt's (holding one exchange while waiting on another's
-- lock was a deadlock).
CREATE FUNCTION sophia.media_record_evidence(p_exchange uuid, p_grant uuid, p_seq integer, p_kind text, p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges; g sophia.voice_qualification_grants; prior jsonb; q sophia.voice_qualification_exchanges;
 v_usage bigint:=(p_receipt->>'usageTokens')::bigint; p uuid; why text;
BEGIN
 PERFORM sophia.require_service();
 IF p_kind NOT IN ('input_window','input_turn','provider','output_reply','session_closed') THEN
  RAISE EXCEPTION 'Not a bridge receipt' USING ERRCODE='22023'; END IF;
 -- Lock order (0003): the project, then its exchange, as for a reservation.
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL THEN RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR UPDATE;
 g:=sophia.voice_grant_of(e.project_id, e.opened_at);
 IF g.id IS NULL OR g.id<>p_grant THEN RAISE EXCEPTION 'The exchange is not under this grant' USING ERRCODE='42501'; END IF;
 IF p_receipt->>'kind' IS DISTINCT FROM p_kind OR p_receipt->>'grantId' IS DISTINCT FROM g.id::text
   OR p_receipt->>'runBindingSha256' IS DISTINCT FROM g.run_binding_sha256 THEN
  RAISE EXCEPTION 'The receipt is not bound to this grant and run' USING ERRCODE='22023'; END IF;
 IF p_receipt ? 'connection' AND NOT EXISTS(SELECT 1 FROM sophia.voice_qualification_connections
   WHERE exchange_id=e.id AND ordinal=(p_receipt->>'connection')::integer) THEN
  RAISE EXCEPTION 'The receipt names a connection that was not reserved' USING ERRCODE='22023'; END IF;
 SELECT receipt INTO prior FROM sophia.voice_qualification_evidence
  WHERE exchange_id=e.id AND grant_id=g.id AND source='bridge' AND seq=p_seq;
 IF prior IS NOT NULL THEN
  IF prior<>p_receipt THEN RAISE EXCEPTION 'Idempotency key reused: another receipt holds this sequence number' USING ERRCODE='23505'; END IF;
 ELSE
  INSERT INTO sophia.voice_qualification_evidence(exchange_id,project_id,grant_id,source,seq,kind,receipt)
  VALUES(e.id,e.project_id,g.id,'bridge',p_seq,p_kind,p_receipt);
 END IF;
 INSERT INTO sophia.voice_qualification_exchanges(exchange_id,project_id,grant_id) VALUES(e.id,e.project_id,g.id)
 ON CONFLICT (exchange_id) DO NOTHING;
 IF p_kind='provider' AND v_usage IS NOT NULL THEN
  UPDATE sophia.voice_qualification_connections SET
   last_prompt=CASE WHEN v_usage>=reported_usage THEN coalesce((p_receipt->>'lastPromptTokens')::bigint,last_prompt)
    ELSE last_prompt END,
   reported_usage=greatest(reported_usage,v_usage)
   WHERE exchange_id=e.id AND ordinal=(p_receipt->>'connection')::integer;
 END IF;
 IF p_kind='session_closed' AND p_receipt->>'reason'='guard' THEN PERFORM sophia.voice_end_exchange(e.id, g, 'bridge'); END IF;
 why:=sophia.voice_limit_reached(g, e.opened_at, e.id);
 IF why IS NOT NULL THEN PERFORM sophia.voice_end_exchange(e.id, g, why); END IF;
 SELECT * INTO q FROM sophia.voice_qualification_exchanges WHERE exchange_id=e.id;
 RETURN jsonb_build_object('ended',(SELECT state='ended' FROM sophia.room_exchanges WHERE id=e.id),
  'reason',q.ended_reason);
END $$;

-- What the grant's principal may read of an exchange their grant covered; anyone else finds nothing.
CREATE FUNCTION sophia.voice_qualification_evidence_read(p_exchange uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); e sophia.room_exchanges; g sophia.voice_qualification_grants;
 q sophia.voice_qualification_exchanges;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'A member reads this' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange;
 IF e.id IS NOT NULL THEN g:=sophia.voice_grant_of(e.project_id, e.opened_at); END IF;
 IF e.id IS NULL OR g.id IS NULL OR g.principal_actor_id<>a OR NOT sophia.is_member(e.project_id) THEN
  RAISE EXCEPTION 'Qualification evidence not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO q FROM sophia.voice_qualification_exchanges WHERE exchange_id=e.id;
 RETURN jsonb_build_object('exchangeId',e.id,'state',e.state,
  'grant',jsonb_build_object('grantId',g.id,'runBindingSha256',g.run_binding_sha256,
   'deadline',sophia.voice_deadline(g,e.opened_at),'expiresAt',g.expires_at,'revokedAt',g.revoked_at,
   'maxExchangeSeconds',g.max_exchange_seconds,'maxProviderConnections',g.max_provider_connections,
   'maxTurns',g.max_turns,'maxOutputTokensPerTurn',g.max_output_tokens_per_turn,'maxUsageTokens',g.max_usage_tokens,
   'connectionsOpened',coalesce(q.connections_opened,0),'turns',coalesce(q.turns,0),
   'usageTokens',(SELECT coalesce(sum(c.reported_usage),0) FROM sophia.voice_qualification_connections c
    WHERE c.exchange_id=e.id),
   'committedTokens',sophia.voice_committed(e.id),'lastPromptTokens',sophia.voice_last_prompt(e.id),
   'endedReason',q.ended_reason),
  'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',v.source,'seq',v.seq,'kind',v.kind,
    'receivedAt',v.received_at,'receipt',v.receipt) ORDER BY v.source, v.seq),'[]')
   FROM sophia.voice_qualification_evidence v WHERE v.exchange_id=e.id AND v.grant_id=g.id AND v.expires_at>now()));
END $$;

-- What a room token names of the grant, for its principal only, while it is active: the Studio's page receipts.
CREATE FUNCTION sophia.voice_room_qualification(p_room uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('grantId',g.id,'runBindingSha256',g.run_binding_sha256)
 FROM sophia.room_state r JOIN sophia.voice_qualification_grants g ON g.project_id=r.project_id
 WHERE r.id=p_room AND g.revoked_at IS NULL AND g.expires_at>now() AND g.principal_actor_id=sophia.actor_id()
  AND sophia.is_member(r.project_id) $$;

-- The voice tool calls of a grant's principal in an exchange under that grant, recorded by the service once it bound
-- each to its speaker (media_tool_speaker), with the tool it named; nobody else's call and no call outside a grant is
-- kept. The command a call admitted is set only by the transaction that inserted that command while the API admitted
-- it for this call (live_call_admits, below): the canonical join from a native task to the exchange that asked for it.
-- A key never joins by itself: a member's own command under the very key of a recorded call, or under any key that
-- reads live:..., is not the call's. Once the API has answered the call (its admission, if any, committed), the
-- service marks it answered with the answer's status (media_answer_live_call).
CREATE TABLE sophia.live_tool_calls (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^live:[0-9a-f-]{36}:[0-9]{1,16}:[A-Za-z0-9._:-]{1,120}$'),
 exchange_id uuid NOT NULL REFERENCES sophia.room_exchanges(id),
 input_epoch bigint NOT NULL CHECK(input_epoch>0),
 tool text NOT NULL CHECK(tool ~ '^[a-z][a-z_]{0,63}$'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 command_id uuid,
 answered_at timestamptz,
 outcome text CHECK(outcome IN ('ok','admitted','refused','clarify','error','committed','proposed','conflict','denied','unknown')),
 CHECK((answered_at IS NULL)=(outcome IS NULL)),
 PRIMARY KEY(project_id,actor_id,idempotency_key), UNIQUE(project_id,command_id),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id)
);
CREATE INDEX live_tool_calls_exchange ON sophia.live_tool_calls(exchange_id,actor_id,seq);
ALTER TABLE sophia.live_tool_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.live_tool_calls FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.live_tool_calls TO sophia_api;

-- Record a bound voice tool call's exchange, under the key the API gives its command (live:<exchange>:<generation>:
-- <call>). The service checks again what media_tool_speaker bound: the exchange has not ended and the actor held the
-- input epoch the call names; a key naming another exchange is refused. Whether the call is (now or already) recorded:
-- only one of the grant's principal, in an exchange opened under that grant, is. The same call again (the bridge's
-- retry of a lost answer: the same exchange, epoch and tool) is a no-op. Another call under a recorded key (a provider
-- call id reused for another operation, or under another epoch) is refused (23505, idempotency_conflict), so the API
-- runs nothing for it: the command it would admit must never link to the call that holds the key.
CREATE FUNCTION sophia.media_record_live_call(p_exchange uuid, p_input_epoch bigint, p_actor uuid, p_key text, p_tool text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges; g sophia.voice_qualification_grants; p uuid;
BEGIN
 PERFORM sophia.require_service();
 -- End is a durable boundary for the calls: the recording takes the project's lock, as control_exchange does (0003:
 -- the project, then its exchange), and the exchange's row, before it reads the exchange's state, and holds both to its
 -- commit. An End waits for a recording that passed its checks; a recording after an End is refused.
 SELECT project_id INTO p FROM sophia.room_exchanges WHERE id=p_exchange;
 IF p IS NULL THEN RAISE EXCEPTION 'The exchange has ended' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR SHARE;
 IF e.state='ended' THEN RAISE EXCEPTION 'The exchange has ended' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.exchange_inputs i WHERE i.exchange_id=e.id AND i.input_epoch=p_input_epoch AND i.actor_id=p_actor) THEN
  RAISE EXCEPTION 'The speaker is not bound to that input epoch' USING ERRCODE='42501'; END IF;
 IF p_key NOT LIKE 'live:'||e.id::text||':%' THEN RAISE EXCEPTION 'The key names another exchange' USING ERRCODE='22023'; END IF;
 g:=sophia.voice_grant_of(e.project_id, e.opened_at);
 IF g.id IS NULL OR g.principal_actor_id<>p_actor THEN RETURN false; END IF;
 INSERT INTO sophia.live_tool_calls(project_id,actor_id,idempotency_key,exchange_id,input_epoch,tool)
 VALUES(e.project_id,p_actor,p_key,e.id,p_input_epoch,p_tool) ON CONFLICT DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM sophia.live_tool_calls WHERE project_id=e.project_id AND actor_id=p_actor
   AND idempotency_key=p_key AND exchange_id=e.id AND input_epoch=p_input_epoch AND tool=p_tool) THEN
  RAISE EXCEPTION 'Idempotency key reused: another voice call holds this key' USING ERRCODE='23505'; END IF;
 RETURN true;
END $$;

-- The API answered a recorded call, after anything it admitted for it committed: the answer's status, once. A call the
-- API never answered (it stopped on the way) stays unanswered, and proves nothing. It reads no exchange state and takes
-- no lock of the exchange: a call recorded before an End is still answered after it.
CREATE FUNCTION sophia.media_answer_live_call(p_exchange uuid, p_actor uuid, p_key text, p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM sophia.require_service();
 UPDATE sophia.live_tool_calls SET answered_at=clock_timestamp(), outcome=p_outcome
  WHERE exchange_id=p_exchange AND actor_id=p_actor AND idempotency_key=p_key AND answered_at IS NULL;
END $$;

-- The API admits a recorded call's command in the transaction that calls this first, for the call's speaker and key;
-- the trigger below then links that command to the call as it is inserted. The marker is the transaction's own
-- (set_config(..., true)) and names one recorded call of the speaker's: the API sets it only on a voice tool call's
-- path, never on a member's request, so a command a member sends, under any key, links to nothing.
CREATE FUNCTION sophia.live_call_admits(p_project uuid, p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM sophia.live_tool_calls WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key) THEN
  RAISE EXCEPTION 'No such voice call' USING ERRCODE='42501'; END IF;
 PERFORM set_config('sophia.live_call',p_key,true);
END $$;

-- Link a command to the recorded call it was admitted for: only one this transaction inserts, under the marker's key,
-- by the call's own speaker. A retried call admits nothing new (its first command is answered), so it links nothing
-- new, and a call whose command came from anywhere else keeps none.
CREATE FUNCTION sophia.live_call_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NEW.idempotency_key=current_setting('sophia.live_call',true) THEN
  UPDATE sophia.live_tool_calls SET command_id=NEW.id
   WHERE project_id=NEW.project_id AND actor_id=NEW.actor_id AND idempotency_key=NEW.idempotency_key AND command_id IS NULL;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER live_call_command AFTER INSERT ON sophia.commands
 FOR EACH ROW WHEN (NEW.idempotency_key LIKE 'live:%') EXECUTE FUNCTION sophia.live_call_command();

-- A scoped edit of a published page asked for by a voice call (revise_html_page): its command is keyed by its task
-- (design_attempt, 0040), not by the call, so the edit links its call to that command when its design task is
-- inserted under the call's key and the transaction's mark, as a command under the call's key does above.
CREATE FUNCTION sophia.live_call_design_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NEW.request_key=current_setting('sophia.live_call',true) THEN
  UPDATE sophia.live_tool_calls lt SET command_id=j.command_id FROM sophia.jobs j
   WHERE j.project_id=NEW.project_id AND j.id=NEW.job_id AND lt.project_id=NEW.project_id AND lt.actor_id=NEW.actor_id
    AND lt.idempotency_key=NEW.request_key AND lt.command_id IS NULL;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER live_call_design_edit AFTER INSERT ON sophia.design_tasks
 FOR EACH ROW WHEN (NEW.request_key LIKE 'live:%') EXECUTE FUNCTION sophia.live_call_design_edit();

-- The exchange each of a project's tasks was created in by a voice tool call, for a member: the call that admitted the
-- task's command. A task no such call created is not listed. Read only by an API with voice qualification on, so
-- native_task_view (0022) is unchanged and an API with it off needs none of 0046.
CREATE FUNCTION sophia.native_task_exchanges(p_project uuid, p_tasks uuid[])
RETURNS TABLE(task_id uuid, exchange_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,sophia AS $$
 SELECT j.id, lt.exchange_id
 FROM sophia.jobs j JOIN sophia.live_tool_calls lt ON lt.project_id=j.project_id AND lt.command_id=j.command_id
 WHERE j.project_id=p_project AND j.id=ANY(p_tasks) AND sophia.is_member(p_project) $$;

-- A member's own voice tool calls in an exchange, in the order the service recorded them (seq), each with the tool it
-- named, the command it admitted (its kind, goal, the authority epoch it took, its state), the task that command
-- created, and when the API answered it and how. The command is none for a call that admitted nothing (a read, a
-- refusal: a Hold on work that is not active admits no command), and for one not answered yet. Another member's calls,
-- and another exchange's, are never listed; a retried call is the one entry it was. readAt is when this was read; with
-- p_after (an earlier read's readAt), only calls whose recording began after it are listed: a call already on its way
-- at that read, committed or not, never is.
CREATE FUNCTION sophia.exchange_calls(p_exchange uuid, p_after timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); e sophia.room_exchanges;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'A member reads this' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange;
 IF e.id IS NULL OR NOT sophia.is_member(e.project_id) THEN RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('exchangeId',e.id,'readAt',clock_timestamp(),'calls',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'seq',lt.seq,'recordedAt',lt.recorded_at,'inputEpoch',lt.input_epoch,'tool',lt.tool,
   'answeredAt',lt.answered_at,'outcome',lt.outcome,
   'command',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('commandId',c.id,'kind',c.kind,'goalId',c.goal_id,
     'authorityEpoch',c.authority_epoch,'goalRevision',c.goal_revision,'state',c.state,'createdAt',c.created_at) END,
   'taskId',(SELECT j.id FROM sophia.jobs j WHERE j.project_id=c.project_id AND j.command_id=c.id AND j.parent_job_id IS NULL
     ORDER BY j.created_at LIMIT 1))
   ORDER BY lt.seq),'[]')
  FROM sophia.live_tool_calls lt
  LEFT JOIN sophia.commands c ON c.project_id=lt.project_id AND c.id=lt.command_id
  WHERE lt.exchange_id=e.id AND lt.actor_id=a AND (p_after IS NULL OR lt.recorded_at>p_after)));
END $$;

-- The room as the bridge last saw it, for a member: whether the caller is in it, how many are and how many of them are
-- guests, the bridge's voice and when it reported (fresh within 15 s: it reports every 5 s while it is in the room).
-- Nobody else's identity is answered. No report, or a stale one, proves nothing either way.
CREATE FUNCTION sophia.room_live_presence(p_room uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); r sophia.room_state; p sophia.room_ai_presence;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'A member reads this' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM sophia.room_state WHERE id=p_room;
 IF r.id IS NULL OR NOT sophia.is_member(r.project_id) THEN RAISE EXCEPTION 'Room not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM sophia.room_ai_presence WHERE room_id=r.id;
 RETURN jsonb_build_object('roomId',r.id,'observed',p.room_id IS NOT NULL,'reportedAt',p.reported_at,
  'fresh',coalesce(p.reported_at>now()-interval '15 seconds',false),'voice',p.voice,'exchangeId',p.exchange_id,
  'selfPresent',coalesce((SELECT bool_or(x->>'identity'=a::text) FROM jsonb_array_elements(p.participants) x),false),
  'participants',coalesce(jsonb_array_length(p.participants),0),
  'guests',coalesce((SELECT count(*) FROM jsonb_array_elements(p.participants) x WHERE x->>'standing' IN ('guest','unknown')),0),
  'emptySince',p.empty_since);
END $$;

-- The sources a research, design or review task drew on that are withdrawn now, for a member, in order: its attempt's
-- consumed closure (attempt_consumed_sources, 0033: the task's manifest and everything it drew on, transitively; for a
-- design or an edit, the report version it lays out and so the research that wrote it, its inputs, a mission note's
-- version among them), the very set a withdrawal revokes work by (research_revoke_source, 0028; design_revoke_source,
-- 0041), less every source in it that is still an eligible, ready project source. Computed live, never stored: a task
-- that ended before the withdrawal lists it as well. Null for any other kind of task; a task the caller cannot see is
-- not found. Read only by an API with voice qualification on.
CREATE FUNCTION sophia.task_withdrawn_sources(p_project uuid, p_task uuid) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Task not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND id=p_task AND parent_job_id IS NULL AND sophia.is_task_kind(kind);
 IF j.id IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE='22023'; END IF;
 IF j.kind NOT IN ('research','design','design_review') THEN RETURN NULL; END IF;
 RETURN ARRAY(SELECT DISTINCT x FROM sophia.attempt_consumed_sources(p_project,j.attempt_id) x
  WHERE NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=x
   AND s.eligible AND s.scope='project' AND s.state='ready') ORDER BY x);
END $$;

REVOKE ALL ON FUNCTION sophia.voice_grant_of(uuid,timestamptz), sophia.voice_deadline(sophia.voice_qualification_grants,timestamptz),
 sophia.voice_budget_reached(sophia.voice_qualification_grants,bigint,bigint), sophia.voice_committed(uuid),
 sophia.voice_last_prompt(uuid), sophia.voice_limit_reached(sophia.voice_qualification_grants,timestamptz,uuid),
 sophia.voice_end_exchange(uuid,sophia.voice_qualification_grants,text),
 sophia.media_voice_reserve(uuid,uuid,text,integer,bigint),
 sophia.voice_qualification_grant(uuid,uuid,text,text,integer,integer,integer,integer,bigint,integer),
 sophia.voice_qualification_revoke(uuid,uuid,text), sophia.voice_qualification_guard(), sophia.voice_evidence_expire(),
 sophia.voice_assignment_qualification(uuid,timestamptz), sophia.media_record_evidence(uuid,uuid,integer,text,jsonb),
 sophia.voice_qualification_evidence_read(uuid), sophia.voice_room_qualification(uuid),
 sophia.media_record_live_call(uuid,bigint,uuid,text,text), sophia.room_live_presence(uuid),
 sophia.native_task_exchanges(uuid,uuid[]), sophia.exchange_calls(uuid,timestamptz), sophia.live_call_admits(uuid,text),
 sophia.live_call_command(), sophia.live_call_design_edit(), sophia.media_answer_live_call(uuid,uuid,text,text),
 sophia.task_withdrawn_sources(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.voice_qualification_guard(), sophia.media_record_evidence(uuid,uuid,integer,text,jsonb),
 sophia.media_voice_reserve(uuid,uuid,text,integer,bigint),
 sophia.voice_qualification_evidence_read(uuid), sophia.voice_room_qualification(uuid),
 sophia.media_record_live_call(uuid,bigint,uuid,text,text), sophia.room_live_presence(uuid),
 sophia.native_task_exchanges(uuid,uuid[]), sophia.exchange_calls(uuid,timestamptz), sophia.live_call_admits(uuid,text),
 sophia.media_answer_live_call(uuid,uuid,text,text), sophia.task_withdrawn_sources(uuid,uuid) TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.voice_evidence_expire() TO sophia_worker;

COMMIT;
