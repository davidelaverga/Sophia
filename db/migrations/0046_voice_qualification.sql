-- Voice qualification evidence for the Studio G7 episode (docs/plans/voice-qualification-g7.md, sophia.voice-
-- qualification.v1). Off unless the migration owner grants it. Nothing here records speech.
-- * A grant per project, made and revoked by the migration owner only: the synthetic principal it records (an active
--   editor or admin), the Lab run's binding hash, the approval it rests on, and hard limits: an exchange's length, the
--   provider connections a session may open, the model turns, the output tokens a turn may produce (the bridge sets
--   it as the session's maxOutputTokens) and a token budget. It ends at most two hours after it is made. It covers the
--   exchanges opened in its project while it is active, never one opened before it.
-- * Each Live turn bills the whole context again, and a turn's usage is reported only once it ends. So the budget is
--   held with the next turn's worst case reserved: an exchange ends once the tokens reported so far, plus the last
--   prompt's size (the context the next turn bills again) and one turn's output cap, would reach the budget. The
--   bridge refuses to start a turn by the same rule, so a turn already running is the most that can follow.
-- * The guard ends an exchange under a grant, as End would (ended_by stays null), at its deadline, when the grant is
--   revoked or expires, past its connection or turn limit, or at its budget, and records why. The API runs it on every
--   bridge presence report, assignment poll and evidence write, so it acts whether or not the Lab is still there; the
--   event wakes the bridge's poll, and the bridge closes the session and its provider connection.
-- * The bridge's receipts (input windows, input turns, the provider's lifecycle, replies, the session's close) are
--   kept 24 hours, readable only by the grant's principal. They carry counts, booleans, ids, timings and SHA-256
--   chains over PCM the bridge forwards or plays: the API's schemas refuse any free text. Nothing is kept of a
--   transcript, a caption or typed words.
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

-- What the bridge reported of an exchange under a grant, and why the guard ended it.
CREATE TABLE sophia.voice_qualification_exchanges (
 exchange_id uuid NOT NULL PRIMARY KEY REFERENCES sophia.room_exchanges(id),
 project_id uuid NOT NULL, grant_id uuid NOT NULL REFERENCES sophia.voice_qualification_grants(id),
 connections_opened integer NOT NULL DEFAULT 0 CHECK(connections_opened>=0),
 turns integer NOT NULL DEFAULT 0 CHECK(turns>=0),
 usage_tokens bigint NOT NULL DEFAULT 0 CHECK(usage_tokens>=0),
 last_prompt_tokens bigint NOT NULL DEFAULT 0 CHECK(last_prompt_tokens>=0),
 ended_reason text CHECK(ended_reason IS NULL OR ended_reason IN ('deadline','expired','revoked','connections','turns','usage')),
 ended_at timestamptz,
 CHECK((ended_reason IS NULL)=(ended_at IS NULL))
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

-- Whether the next turn could pass the budget: what was reported, plus the context it bills again and one turn's
-- output cap.
CREATE FUNCTION sophia.voice_budget_reached(g sophia.voice_qualification_grants, p_usage bigint, p_last_prompt bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT p_usage+p_last_prompt+g.max_output_tokens_per_turn>=g.max_usage_tokens $$;

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

-- End every exchange under a grant that is past its deadline, revoked, expired or over a limit, as End would.
-- Returns how many it ended. Expired evidence goes too.
CREATE FUNCTION sophia.voice_qualification_guard() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r record; ended sophia.room_exchanges; why text; n integer:=0;
BEGIN
 PERFORM sophia.require_service();
 DELETE FROM sophia.voice_qualification_evidence WHERE expires_at<now();
 FOR r IN SELECT e.id AS exchange_id, e.project_id, e.opened_at, g AS grant_row, q.connections_opened, q.turns,
   q.usage_tokens, q.last_prompt_tokens
   FROM sophia.room_exchanges e
   CROSS JOIN LATERAL sophia.voice_grant_of(e.project_id, e.opened_at) g
   LEFT JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id
   WHERE e.state<>'ended' AND g.id IS NOT NULL LOOP
  why:=CASE
   WHEN (r.grant_row).revoked_at IS NOT NULL THEN 'revoked'
   WHEN (r.grant_row).expires_at<=now() THEN 'expired'
   WHEN sophia.voice_deadline(r.grant_row, r.opened_at)<=now() THEN 'deadline'
   WHEN coalesce(r.connections_opened,0)>(r.grant_row).max_provider_connections THEN 'connections'
   WHEN coalesce(r.turns,0)>=(r.grant_row).max_turns THEN 'turns'
   WHEN sophia.voice_budget_reached(r.grant_row, coalesce(r.usage_tokens,0), coalesce(r.last_prompt_tokens,0)) THEN 'usage'
   ELSE NULL END;
  CONTINUE WHEN why IS NULL;
  UPDATE sophia.room_exchanges SET state='ended', pause_reason=NULL, ended_at=now(), revision=revision+1
   WHERE id=r.exchange_id AND state<>'ended' RETURNING * INTO ended;
  CONTINUE WHEN ended.id IS NULL;
  n:=n+1;
  INSERT INTO sophia.voice_qualification_exchanges(exchange_id,project_id,grant_id,ended_reason,ended_at)
  VALUES(ended.id,ended.project_id,(r.grant_row).id,why,now())
  ON CONFLICT (exchange_id) DO UPDATE SET ended_reason=EXCLUDED.ended_reason, ended_at=EXCLUDED.ended_at;
  INSERT INTO sophia.voice_qualification_evidence(exchange_id,project_id,grant_id,source,seq,kind,receipt)
  VALUES(ended.id,ended.project_id,(r.grant_row).id,'service',0,'guard',jsonb_build_object('kind','guard',
   'schema','sophia.service.guard.v1','grantId',(r.grant_row).id,'runBindingSha256',(r.grant_row).run_binding_sha256,
   'reason',why,'atMs',floor(extract(epoch FROM now())*1000)::bigint))
  ON CONFLICT DO NOTHING;
  PERFORM sophia.emit_service_event(ended.project_id,'room.exchange_changed','room_exchange',ended.id,ended.revision,
   'room.exchange_qualification_limit');
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

-- A bridge receipt for an exchange under a grant: bound to that grant and its run, once per sequence number (the
-- same receipt again is a no-op; another under the same number is refused). A provider receipt carries the
-- connections opened and the tokens reported, which the guard holds to the grant's limits at once.
CREATE FUNCTION sophia.media_record_evidence(p_exchange uuid, p_grant uuid, p_seq integer, p_kind text, p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE e sophia.room_exchanges; g sophia.voice_qualification_grants; prior jsonb; q sophia.voice_qualification_exchanges;
BEGIN
 PERFORM sophia.require_service();
 IF p_kind NOT IN ('input_window','input_turn','provider','output_reply','session_closed') THEN
  RAISE EXCEPTION 'Not a bridge receipt' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM sophia.room_exchanges WHERE id=p_exchange FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Exchange not found' USING ERRCODE='22023'; END IF;
 g:=sophia.voice_grant_of(e.project_id, e.opened_at);
 IF g.id IS NULL OR g.id<>p_grant THEN RAISE EXCEPTION 'The exchange is not under this grant' USING ERRCODE='42501'; END IF;
 IF p_receipt->>'kind' IS DISTINCT FROM p_kind OR p_receipt->>'grantId' IS DISTINCT FROM g.id::text
   OR p_receipt->>'runBindingSha256' IS DISTINCT FROM g.run_binding_sha256 THEN
  RAISE EXCEPTION 'The receipt is not bound to this grant and run' USING ERRCODE='22023'; END IF;
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
 IF p_kind='provider' THEN
  UPDATE sophia.voice_qualification_exchanges SET
   connections_opened=greatest(connections_opened, coalesce((p_receipt->>'connectionsOpened')::integer,0)),
   turns=greatest(turns, coalesce((p_receipt->>'turns')::integer,0)),
   usage_tokens=greatest(usage_tokens, coalesce((p_receipt->>'usageTokens')::bigint,0)),
   last_prompt_tokens=CASE WHEN coalesce((p_receipt->>'usageTokens')::bigint,0)>=usage_tokens
    THEN coalesce((p_receipt->>'lastPromptTokens')::bigint,last_prompt_tokens) ELSE last_prompt_tokens END
   WHERE exchange_id=e.id;
 END IF;
 PERFORM sophia.voice_qualification_guard();
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
   'usageTokens',coalesce(q.usage_tokens,0),'lastPromptTokens',coalesce(q.last_prompt_tokens,0),
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

REVOKE ALL ON FUNCTION sophia.voice_grant_of(uuid,timestamptz), sophia.voice_deadline(sophia.voice_qualification_grants,timestamptz),
 sophia.voice_budget_reached(sophia.voice_qualification_grants,bigint,bigint),
 sophia.voice_qualification_grant(uuid,uuid,text,text,integer,integer,integer,integer,bigint,integer),
 sophia.voice_qualification_revoke(uuid,uuid,text), sophia.voice_qualification_guard(),
 sophia.voice_assignment_qualification(uuid,timestamptz), sophia.media_record_evidence(uuid,uuid,integer,text,jsonb),
 sophia.voice_qualification_evidence_read(uuid), sophia.voice_room_qualification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.voice_qualification_guard(), sophia.media_record_evidence(uuid,uuid,integer,text,jsonb),
 sophia.voice_qualification_evidence_read(uuid), sophia.voice_room_qualification(uuid) TO sophia_api;

COMMIT;
