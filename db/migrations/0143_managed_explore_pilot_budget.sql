-- A single operator-owned USD ceiling for the founder pilot. Provider sessions draw their full allowance once.
-- Local reservation is separate from payment-source and final-charge verification.
BEGIN;

CREATE TABLE sophia.managed_explore_pilot_budget (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 cap_micros bigint NOT NULL DEFAULT 0 CHECK(cap_micros BETWEEN 0 AND 100000000),
 reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros BETWEEN 0 AND 100000000),
 historical_hold boolean NOT NULL DEFAULT false
);
ALTER TABLE sophia.managed_explore_pilot_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sophia.managed_explore_pilot_budget FROM PUBLIC,sophia_api,sophia_worker;

-- Exclude concurrent starts and lease-locked sends while the pre-migration admissions are counted. A matching
-- immutable grant revision proves its original envelope. For an unknown amount keep the entire authorized ceiling
-- committed, so a replacement grant or lost historical amount cannot introduce new funding.
LOCK TABLE sophia.managed_explore_sessions,sophia.managed_explore_turns IN EXCLUSIVE MODE;
WITH legacy AS (
 SELECT CASE WHEN g.revision=s.grant_revision AND g.currency='USD'
  AND (g.founder_id,g.route_id,g.credential_generation)=(s.founder_id,s.route_id,s.credential_generation)
  AND g.per_session_micros>=s.reserved_micros THEN g.per_session_micros END AS amount
 FROM sophia.managed_explore_sessions s
 LEFT JOIN sophia.managed_explore_grants g ON (g.project_id,g.id)=(s.project_id,s.grant_id)
), measured AS (
 SELECT coalesce(sum(amount),0) AS total,count(*) FILTER (WHERE amount IS NULL)>0 AS unknown FROM legacy
)
INSERT INTO sophia.managed_explore_pilot_budget(reserved_micros,historical_hold)
SELECT CASE WHEN unknown THEN 100000000 ELSE least(100000000,total) END,
 unknown OR total>100000000 FROM measured;

-- Protect the insert itself as well. A transaction already inside the old start function at migration time
-- must still debit the shared allowance under the same lock before its session can become visible.
CREATE FUNCTION sophia.reserve_managed_explore_pilot_budget()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.managed_explore_grants;
BEGIN
 SELECT * INTO g FROM sophia.managed_explore_grants
 WHERE project_id=NEW.project_id AND id=NEW.grant_id AND founder_id=NEW.founder_id
  AND revision=NEW.grant_revision AND route_id=NEW.route_id AND credential_generation=NEW.credential_generation
  AND currency='USD' AND enabled AND grant_only_verified AND NOT paid_spillover
  AND per_session_micros>=10000 AND per_session_micros>=NEW.reserved_micros FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed Explore pilot funding unavailable' USING ERRCODE='55000'; END IF;

 PERFORM 1 FROM sophia.managed_explore_pilot_budget WHERE singleton FOR UPDATE;
 IF NOT FOUND OR g.expires_at<=clock_timestamp() OR g.credential_expires_at<=clock_timestamp()
  OR NOT sophia.managed_explore_worker_ready(g,clock_timestamp()) THEN
  RAISE EXCEPTION 'Managed Explore pilot funding unavailable' USING ERRCODE='55000'; END IF;
 UPDATE sophia.managed_explore_pilot_budget SET reserved_micros=reserved_micros+g.per_session_micros
 WHERE singleton AND NOT historical_hold AND reserved_micros+g.per_session_micros<=cap_micros;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed Explore pilot funding unavailable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.reserve_managed_explore_pilot_budget() FROM PUBLIC,sophia_api,sophia_worker;
CREATE TRIGGER reserve_managed_explore_pilot_budget BEFORE INSERT ON sophia.managed_explore_sessions
 FOR EACH ROW EXECUTE FUNCTION sophia.reserve_managed_explore_pilot_budget();

-- Read current permission for an existing envelope under the same lock used by the operator and new sessions.
CREATE FUNCTION sophia.lock_managed_explore_pilot_budget_for_send()
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 PERFORM 1 FROM sophia.managed_explore_pilot_budget
 WHERE singleton AND NOT historical_hold AND reserved_micros>0 AND reserved_micros<=cap_micros FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION sophia.lock_managed_explore_pilot_budget_for_send() FROM PUBLIC,sophia_api,sophia_worker;

-- Fence a continuation already inside an older admission function, at the write every path must perform.
-- A new session has already debited its full envelope in this same transaction when its first turn is inserted.
CREATE FUNCTION sophia.require_managed_explore_pilot_budget_for_turn()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NOT sophia.lock_managed_explore_pilot_budget_for_send() THEN
  RAISE EXCEPTION 'Managed Explore pilot funding unavailable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.require_managed_explore_pilot_budget_for_turn() FROM PUBLIC,sophia_api,sophia_worker;
CREATE TRIGGER require_managed_explore_pilot_budget_for_turn BEFORE INSERT ON sophia.managed_explore_turns
 FOR EACH ROW EXECUTE FUNCTION sophia.require_managed_explore_pilot_budget_for_turn();

CREATE OR REPLACE FUNCTION sophia.read_managed_explore_preflight(p_project uuid, p_entry uuid, p_revision bigint, p_admissions boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); seed record; grant_row sophia.managed_explore_grants;
 session_row sophia.managed_explore_sessions;
BEGIN
 IF NOT sophia.can_edit(p_project) OR EXISTS(SELECT 1 FROM sophia.projects WHERE id=p_project AND archived_at IS NOT NULL)
 THEN RETURN NULL; END IF;
 IF p_admissions THEN
  grant_row:=sophia.managed_explore_eligible_grant(p_project,actor);
  IF grant_row.id IS NOT NULL AND (grant_row.currency<>'USD' OR grant_row.per_session_micros<10000
    OR NOT sophia.managed_explore_worker_ready(grant_row,statement_timestamp())
    OR NOT EXISTS(SELECT 1 FROM sophia.managed_explore_pilot_budget b WHERE b.singleton AND NOT b.historical_hold
      AND b.reserved_micros+grant_row.per_session_micros<=b.cap_micros))
  THEN grant_row:=NULL; END IF;
 END IF;
 SELECT * INTO seed FROM sophia.managed_explore_seed(p_project,actor,p_entry);
 IF NOT FOUND THEN
  IF grant_row.id IS NULL THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Brief not found' USING ERRCODE='22023';
 END IF;
 SELECT s.* INTO session_row FROM sophia.managed_explore_sessions s
 WHERE s.project_id=p_project AND s.founder_id=actor AND s.seed_entry_id=p_entry AND s.seed_revision=seed.revision
   AND s.seed_source_id=seed.source_id AND s.seed_sha256=seed.sha256;
 IF session_row.id IS NULL AND grant_row.id IS NULL THEN RETURN NULL; END IF;
 IF seed.revision IS DISTINCT FROM p_revision THEN
  RAISE EXCEPTION 'Stale saved brief revision' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('seed',sophia.managed_explore_seed_view(seed.entry_id,seed.revision,seed.body,seed.sha256),
  'funding',sophia.managed_explore_funding_view(coalesce(session_row.route_id,grant_row.route_id)),'sessionId',session_row.id);
END $$;

CREATE OR REPLACE FUNCTION sophia.start_managed_explore(p_project uuid, p_entry uuid, p_revision bigint, p_route text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); grant_row sophia.managed_explore_grants; seed record;
 s sophia.managed_explore_sessions; member_revision bigint; new_reservation bigint; result jsonb;
 digest text:=encode(sha256(convert_to(jsonb_build_array('start',p_entry,p_revision,p_route)::text,'UTF8')),'hex');
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT m.revision INTO member_revision FROM sophia.project_members m
 WHERE project_id=p_project AND actor_id=actor AND active AND role IN ('admin','editor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
 grant_row:=sophia.managed_explore_eligible_grant(p_project,actor);
 IF grant_row.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO seed FROM sophia.managed_explore_seed(p_project,actor,p_entry);
 IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=p_project AND id=seed.source_id
  AND eligible AND state='ready' AND scope='project' AND sha256=seed.sha256 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Brief not found' USING ERRCODE='22023'; END IF;

 result:=sophia.managed_explore_prior(p_project,actor,p_key,digest);
 IF result IS NOT NULL THEN
  s:=sophia.managed_explore_owned_session(p_project,(result->>'sessionId')::uuid);
  IF s.id IS NULL THEN RAISE EXCEPTION 'Explore session not found' USING ERRCODE='22023'; END IF;
  RETURN result;
 END IF;
 IF seed.revision IS DISTINCT FROM p_revision THEN
  RAISE EXCEPTION 'Stale saved brief revision' USING ERRCODE='40001'; END IF;
 IF grant_row.route_id IS DISTINCT FROM p_route OR grant_row.currency<>'USD'
  OR grant_row.per_session_micros<10000 THEN RETURN NULL; END IF;
 PERFORM 1 FROM sophia.managed_explore_grants WHERE project_id=p_project AND id=grant_row.id AND revision=grant_row.revision
  AND enabled AND grant_only_verified AND NOT paid_spillover AND route_id=p_route
  AND credential_generation=grant_row.credential_generation AND expires_at>clock_timestamp() AND credential_expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND OR NOT sophia.managed_explore_worker_ready(grant_row,clock_timestamp()) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_sessions
   WHERE project_id=p_project AND founder_id=actor AND seed_entry_id=p_entry AND seed_revision=p_revision) THEN
  RAISE EXCEPTION 'An Explore session already exists for the saved brief' USING ERRCODE='40001'; END IF;
 new_reservation:=grant_row.per_turn_micros+grant_row.environment_micros;
 IF new_reservation>grant_row.per_session_micros THEN
  RAISE EXCEPTION 'Explore session allowance does not cover the first turn and environment' USING ERRCODE='40001'; END IF;
 -- A different project can take the same allowance. Keep the shared lock until the session, turn and receipt commit.
 PERFORM 1 FROM sophia.managed_explore_pilot_budget
 WHERE singleton AND NOT historical_hold AND reserved_micros+grant_row.per_session_micros<=cap_micros FOR UPDATE;
 IF NOT FOUND OR grant_row.expires_at<=clock_timestamp() OR grant_row.credential_expires_at<=clock_timestamp()
  OR NOT sophia.managed_explore_worker_ready(grant_row,clock_timestamp()) THEN RETURN NULL; END IF;
 INSERT INTO sophia.managed_explore_sessions(project_id,founder_id,member_revision,grant_id,grant_revision,route_id,
  credential_generation,seed_entry_id,seed_revision,seed_source_id,seed_sha256,seed_text,reserved_micros)
 VALUES(p_project,actor,member_revision,grant_row.id,grant_row.revision,p_route,grant_row.credential_generation,p_entry,
  p_revision,seed.source_id,seed.sha256,seed.body,new_reservation) RETURNING * INTO s;
 PERFORM sophia.enqueue_managed_explore_turn(s,1,'text',seed.body,seed.sha256,new_reservation,NULL,NULL,NULL);
 result:=jsonb_build_object('sessionId',s.id);
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,actor,p_key,digest,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION sophia.managed_explore_dispatch_denial(c sophia.managed_explore_dispatch_context)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
DECLARE parent sophia.managed_explore_versions; grant_row sophia.managed_explore_grants;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=(c.s).project_id AND archived_at IS NULL;
 IF NOT FOUND THEN RETURN 'project_unavailable'; END IF;
 PERFORM 1 FROM sophia.project_members WHERE project_id=(c.s).project_id AND actor_id=(c.s).founder_id
  AND active AND role IN ('admin','editor') AND revision=(c.s).member_revision FOR SHARE;
 IF NOT FOUND THEN RETURN 'membership_changed'; END IF;
 SELECT g.* INTO grant_row FROM sophia.managed_explore_grants g WHERE g.project_id=(c.s).project_id AND g.id=(c.s).grant_id
  AND g.founder_id=(c.s).founder_id AND g.revision=(c.s).grant_revision AND g.route_id=(c.d).route_id
  AND g.credential_generation=(c.d).credential_generation AND g.provider_org=(c.d).provider_org
  AND g.provider_project=(c.d).provider_project AND g.model=(c.d).model
  AND g.currency='USD' AND g.per_session_micros/10000=(c.d).session_limit_cents AND (c.d).session_limit_cents>=1
  AND g.per_session_micros>=(c.s).reserved_micros AND g.enabled AND g.grant_only_verified AND NOT g.paid_spillover
  AND g.expires_at>clock_timestamp() AND g.credential_expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN 'funding_unavailable'; END IF;
 -- The prepare function routes possible effects to observation before asking for new send authority.
 IF NOT sophia.lock_managed_explore_pilot_budget_for_send() OR grant_row.expires_at<=clock_timestamp()
  OR grant_row.credential_expires_at<=clock_timestamp() THEN RETURN 'funding_unavailable'; END IF;
 PERFORM 1 FROM sophia.source_objects WHERE project_id=(c.s).project_id AND id=(c.s).seed_source_id
   AND eligible AND state='ready' AND scope='project' AND sha256=(c.s).seed_sha256 FOR SHARE;
 IF NOT FOUND THEN RETURN 'source_unavailable'; END IF;
 PERFORM 1 FROM sophia.managed_explore_seed((c.s).project_id,(c.s).founder_id,(c.s).seed_entry_id) seed
   WHERE seed.source_id=(c.s).seed_source_id AND seed.revision=(c.s).seed_revision AND seed.sha256=(c.s).seed_sha256;
 IF NOT FOUND THEN RETURN 'source_unavailable'; END IF;
 IF (c.t).parent_version_id IS NOT NULL THEN
  SELECT * INTO parent FROM sophia.managed_explore_versions WHERE project_id=(c.s).project_id
   AND session_id=(c.s).id AND id=(c.t).parent_version_id;
  PERFORM 1 FROM sophia.source_objects WHERE project_id=(c.s).project_id AND id=parent.entry_source_id
   AND eligible AND state='ready' AND scope='private' AND sha256=parent.entry_sha256 FOR SHARE;
  IF NOT FOUND THEN RETURN 'parent_unavailable'; END IF;
  PERFORM 1 FROM sophia.managed_explore_version_entry(parent,(c.s).founder_id);
  IF NOT FOUND THEN RETURN 'parent_unavailable'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION sophia.admit_managed_explore_turn(p_project uuid, p_session uuid, p_key text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.managed_explore_sessions; grant_row sophia.managed_explore_grants; parent sophia.managed_explore_versions;
 k text:=p_request->>'kind'; instruction text:=btrim(p_request->>'instruction',E' \t\r\n');
 direction uuid:=(p_request->>'directionId')::uuid; parent_id uuid:=(p_request->>'parentVersionId')::uuid;
 component text:=p_request->>'componentId'; expected_revision bigint:=(p_request->>'expectedSessionRevision')::bigint;
 digest text:=encode(sha256(convert_to(jsonb_build_array('turn',p_session,
  (p_request-'instruction')||jsonb_build_object('instruction',instruction))::text,'UTF8')),'hex');
 result jsonb; turn_id uuid; turn_sequence bigint;
BEGIN
 s:=sophia.managed_explore_lock_session(p_project,p_session);
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR
   p_request-ARRAY['kind','instruction','expectedSessionRevision','directionId','parentVersionId','componentId']<>'{}'::jsonb
   OR k IS NULL OR k NOT IN ('text','directions','prototype','revision') OR instruction IS NULL
   OR length(instruction) NOT BETWEEN 1 AND 8000 OR instruction !~ '[^[:space:]]'
   OR expected_revision IS NULL OR expected_revision NOT BETWEEN 1 AND 9007199254740991
   OR (k IN ('prototype','revision'))<>(direction IS NOT NULL) OR (k='revision')<>(parent_id IS NOT NULL)
   OR (p_request ? 'componentId' AND (k<>'revision' OR component IS NULL OR component !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'))
   OR (p_request ? 'directionId' AND direction IS NULL) OR (p_request ? 'parentVersionId' AND parent_id IS NULL) THEN
  RAISE EXCEPTION 'Invalid Explore turn' USING ERRCODE='22023'; END IF;
 result:=sophia.managed_explore_prior(p_project,s.founder_id,p_key,digest);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF s.revision<>expected_revision THEN RAISE EXCEPTION 'Stale Explore session revision' USING ERRCODE='40001'; END IF;
 SELECT g.* INTO grant_row FROM sophia.managed_explore_grants g
 JOIN sophia.project_members m ON m.project_id=g.project_id AND m.actor_id=g.founder_id
 WHERE g.project_id=p_project AND g.id=s.grant_id AND g.founder_id=s.founder_id AND g.revision=s.grant_revision
  AND g.route_id=s.route_id AND g.credential_generation=s.credential_generation AND g.enabled
  AND g.currency='USD' AND g.per_session_micros>=10000
  AND g.grant_only_verified AND NOT g.paid_spillover AND g.expires_at>clock_timestamp()
  AND g.credential_expires_at>clock_timestamp() AND m.revision=s.member_revision FOR SHARE OF g;
 IF NOT FOUND OR NOT sophia.managed_explore_worker_ready(grant_row,clock_timestamp()) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_dispatch_sessions d
   WHERE d.project_id=p_project AND d.session_id=p_session AND sophia.managed_explore_session_terminal(d))
 THEN RETURN NULL; END IF;
 IF NOT sophia.lock_managed_explore_pilot_budget_for_send() OR grant_row.expires_at<=clock_timestamp()
  OR grant_row.credential_expires_at<=clock_timestamp()
  OR NOT sophia.managed_explore_worker_ready(grant_row,clock_timestamp()) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM sophia.managed_explore_turns WHERE project_id=p_project AND session_id=p_session AND status='queued') THEN
  RAISE EXCEPTION 'Explore already has a waiting turn' USING ERRCODE='40001'; END IF;
 IF direction IS NOT NULL AND direction IS DISTINCT FROM s.selected_direction_id THEN
  RAISE EXCEPTION 'Stale selected Explore direction' USING ERRCODE='40001'; END IF;
 IF parent_id IS NOT NULL THEN
  SELECT * INTO parent FROM sophia.managed_explore_versions WHERE project_id=p_project AND session_id=p_session AND id=parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
  IF parent.direction_id<>direction THEN RAISE EXCEPTION 'Stale parent prototype direction' USING ERRCODE='40001'; END IF;
  PERFORM 1 FROM sophia.managed_explore_version_entry(parent,s.founder_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Prototype version not found' USING ERRCODE='22023'; END IF;
  IF component IS NOT NULL AND NOT component=ANY(parent.component_ids) THEN
   RAISE EXCEPTION 'Prototype component not found' USING ERRCODE='22023'; END IF;
 END IF;
 IF s.reserved_micros+grant_row.per_turn_micros>grant_row.per_session_micros THEN
  RAISE EXCEPTION 'Explore session allowance exhausted' USING ERRCODE='40001'; END IF;
 SELECT coalesce(max(sequence),0)+1 INTO turn_sequence FROM sophia.managed_explore_turns
 WHERE project_id=p_project AND session_id=p_session;
 turn_id:=sophia.enqueue_managed_explore_turn(s,turn_sequence,k,instruction,encode(sha256(convert_to(instruction,'UTF8')),'hex'),
  grant_row.per_turn_micros,direction,parent_id,component);
 UPDATE sophia.managed_explore_sessions SET revision=revision+1,reserved_micros=reserved_micros+grant_row.per_turn_micros
 WHERE project_id=p_project AND id=p_session;
 result:=jsonb_build_object('turnId',turn_id);
 INSERT INTO sophia.managed_explore_requests VALUES(p_project,s.founder_id,p_key,digest,result);
 RETURN result;
END $$;

COMMIT;
