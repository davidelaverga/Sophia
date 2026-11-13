-- INC01-CC-004 S5-a (SOPHIA-INC-2026-11, INC-01 S5; C01, C03): member API contributions for Explore.
-- docs/plans/api-contributions.md.
-- One owner-funded research runtime per contribution. It is operator-hosted on the existing pinned unit, role
-- sophia-research-md-v1 and route research-sol-medium-v1, produces Markdown only, and is registered as its own dsh
-- executor resource. Its host holds the owner's key under the route's existing reference name.
-- * Records: the owner's account (one accounting root per owner and provider unless separate ownership is recorded),
--   connection (references and revisions only), selected-project grants, the requester's explicit funding pin, the
--   frozen task binding, and the link of each contributed model reservation. No key, fingerprint, provider billing ID
--   or token hash is stored.
-- * Payer per meter: model calls of a contributed task are paid by the contributor's API account and bounded by the
--   grant and the account. Search and read keep the project's existing payer and caps.
-- * No pin: legacy behaviour is unchanged, and every legacy runtime picker now excludes contribution resources.
--   Pin: only the pinned contribution, under current authority. It refuses or waits, and never falls back.
-- * Current authority is rechecked at admission, at the dispatch of every queued create, resume and steer (one it no
--   longer permits is denied, never sent), at each new paid model reservation and at publication. A grant, connection,
--   runtime link or membership change also denies queued deliveries in its own transaction. One lock order: the
--   project(s) in id order, then the task, its authority (members, grant, connection), outbox rows, then the account.
-- * Active settlement is `block_new_calls` only. Once authority fails: no new dispatch and no new paid model call. An
--   output already possible may still publish, under the payer and revision it was made under, unless the grant was
--   revoked or admin-disabled, the requester or owner is no longer a member, or a source it read was withdrawn: then
--   it is withheld. Nothing here stops an active provider request; `stop` and `finish` grant policies are refused.
-- * Off: nothing is usable without an operator registration, an operator route qualification (none exists), an
--   owner's grant and a requester's pin.
-- 0001-0093 are not edited. Eleven functions are replaced with their signatures and bodies kept, except the lines
-- marked 0094. Three shared functions pinned byte-for-byte by existing invariant suites (conversation_ask,
-- conversation_ask_capability, native_delivery_ineligible) are not replaced: the role trigger, the change fences and
-- the dispatch recheck in runtime_unavailable and defer_native_delivery enforce the same guarantees.
BEGIN;

-- --- records --------------------------------------------------------------------------------------------------------

CREATE TABLE sophia.api_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider='openai'), category text NOT NULL DEFAULT 'api' CHECK(category='api'),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 -- Who says this account is the owner's: the owner, or nobody yet. No provider-verified identity in this slice.
 provenance text NOT NULL DEFAULT 'owner_declared' CHECK(provenance IN ('owner_declared','unknown')),
 -- A second account for the same owner and provider exists only with the owner's recorded reason; otherwise aliases
 -- are one accounting root.
 separate_ownership_note text CHECK(separate_ownership_note IS NULL OR length(btrim(separate_ownership_note)) BETWEEN 1 AND 300),
 concurrency_limit integer NOT NULL DEFAULT 1 CHECK(concurrency_limit BETWEEN 1 AND 3),
 total_cap_usd numeric(12,6) NOT NULL CHECK(total_cap_usd>0 AND total_cap_usd<=10000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id)
);
CREATE UNIQUE INDEX api_accounts_one_root ON sophia.api_accounts(owner_id,provider) WHERE separate_ownership_note IS NULL;

CREATE TABLE sophia.api_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, account_id uuid NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 -- The one route of this slice, with its pinned model and effort (config/runtime-unit.json model_routes).
 route_id text NOT NULL CHECK(route_id='research-sol-medium-v1'),
 model text NOT NULL CHECK(model='gpt-6.1-sol'), effort text NOT NULL CHECK(effort='medium'),
 -- The reference NAME the route reads its key from; never the key.
 credential_ref text NOT NULL CHECK(credential_ref='OPENAI_RESEARCH_API_KEY'),
 -- 0 until the operator registers custody; advanced by each rotation.
 credential_revision bigint NOT NULL DEFAULT 0 CHECK(credential_revision>=0),
 custodian_kind text NOT NULL DEFAULT 'operator_runtime_host' CHECK(custodian_kind='operator_runtime_host'),
 custodian_label text NOT NULL CHECK(length(btrim(custodian_label)) BETWEEN 1 AND 80),
 -- Custody lifecycle only; readiness is computed separately. `connected` means registered, not verified.
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','connected','paused','revoked')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id), FOREIGN KEY(account_id,owner_id) REFERENCES sophia.api_accounts(id,owner_id),
 CHECK(state<>'connected' OR credential_revision>0)
);

-- An operator's record that a route, model and effort was qualified on real evidence. None exists in production.
CREATE TABLE sophia.api_route_qualifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 route_id text NOT NULL, model text NOT NULL, effort text NOT NULL,
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref)) BETWEEN 1 AND 300),
 qualified_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(expires_at>qualified_at)
);

CREATE TABLE sophia.api_contribution_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES sophia.projects(id), connection_id uuid NOT NULL, owner_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 state text NOT NULL DEFAULT 'enabled' CHECK(state IN ('enabled','paused','revoked')),
 expires_at timestamptz NOT NULL,
 operation text NOT NULL DEFAULT 'research' CHECK(operation='research'),
 output text NOT NULL DEFAULT 'markdown' CHECK(output='markdown'),
 role_id text NOT NULL DEFAULT 'sophia-research-md-v1' CHECK(role_id='sophia-research-md-v1'),
 route_id text NOT NULL DEFAULT 'research-sol-medium-v1' CHECK(route_id='research-sol-medium-v1'),
 model text NOT NULL DEFAULT 'gpt-6.1-sol' CHECK(model='gpt-6.1-sol'),
 effort text NOT NULL DEFAULT 'medium' CHECK(effort='medium'),
 -- Who may use it: every current editor or admin, or only those listed (each still a current editor or admin).
 eligible text NOT NULL DEFAULT 'editors' CHECK(eligible IN ('editors','listed')),
 eligible_actors uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(eligible_actors)<=50),
 task_cap_usd numeric(12,6) NOT NULL CHECK(task_cap_usd>0),
 total_cap_usd numeric(12,6) NOT NULL CHECK(total_cap_usd>=task_cap_usd),
 concurrency integer NOT NULL DEFAULT 1 CHECK(concurrency BETWEEN 1 AND 3),
 unknown_usage_policy text NOT NULL DEFAULT 'hold_uncertain' CHECK(unknown_usage_policy='hold_uncertain'),
 funding_policy text NOT NULL CHECK(funding_policy='bounded_total_spend'),
 funding_ack_ref text NOT NULL CHECK(length(btrim(funding_ack_ref)) BETWEEN 1 AND 300),
 funding_acknowledged_at timestamptz NOT NULL DEFAULT now(),
 active_settlement text NOT NULL DEFAULT 'block_new_calls' CHECK(active_settlement='block_new_calls'),
 admin_disabled_at timestamptz, admin_disabled_by uuid,
 admin_disabled_reason text CHECK(admin_disabled_reason IS NULL OR length(btrim(admin_disabled_reason)) BETWEEN 1 AND 300),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,connection_id), UNIQUE(id,project_id),
 FOREIGN KEY(connection_id,owner_id) REFERENCES sophia.api_connections(id,owner_id),
 CHECK((eligible='listed')=(cardinality(eligible_actors)>0)),
 CHECK((admin_disabled_at IS NULL)=(admin_disabled_by IS NULL))
);

-- The definition of a contribution resource: an executor resource and runtime of one connection revision in one project.
CREATE TABLE sophia.api_contribution_runtimes (
 project_id uuid NOT NULL, resource_id uuid NOT NULL, runtime_id uuid NOT NULL,
 connection_id uuid NOT NULL REFERENCES sophia.api_connections(id), credential_revision bigint NOT NULL CHECK(credential_revision>0),
 -- draining: a rotated revision. Never chosen and no new paid model call, but its token may settle what it already reserved.
 state text NOT NULL DEFAULT 'current' CHECK(state IN ('current','draining')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,resource_id), UNIQUE(project_id,connection_id,credential_revision),
 FOREIGN KEY(project_id,resource_id) REFERENCES sophia.executor_resources(project_id,id)
);

-- The requester's explicit, server-held choice of a grant, at the revision they saw.
CREATE TABLE sophia.research_funding_pins (
 project_id uuid NOT NULL, requester_id uuid NOT NULL, grant_id uuid NOT NULL, grant_revision bigint NOT NULL,
 set_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,requester_id), FOREIGN KEY(grant_id,project_id) REFERENCES sophia.api_contribution_grants(id,project_id)
);

-- The frozen funding binding of a contributed research task. Accepted and observed settings are not stored: unknown.
CREATE TABLE sophia.api_contribution_tasks (
 project_id uuid NOT NULL, job_id uuid NOT NULL, allowance_id uuid NOT NULL,
 grant_id uuid NOT NULL, grant_revision bigint NOT NULL, connection_id uuid NOT NULL, credential_revision bigint NOT NULL,
 account_id uuid NOT NULL REFERENCES sophia.api_accounts(id), owner_id uuid NOT NULL, requester_id uuid NOT NULL, resource_id uuid NOT NULL,
 requested_route text NOT NULL, requested_model text NOT NULL, requested_effort text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,job_id), FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(grant_id,project_id) REFERENCES sophia.api_contribution_grants(id,project_id)
);
CREATE INDEX api_contribution_tasks_by_account ON sophia.api_contribution_tasks(account_id);
CREATE INDEX api_contribution_tasks_by_grant ON sophia.api_contribution_tasks(grant_id);

-- Each model reservation of a contributed task, with the payer it was made under. Amounts stay in research_reservations.
CREATE TABLE sophia.api_contribution_reservations (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL, job_id uuid NOT NULL,
 grant_id uuid NOT NULL, grant_revision bigint NOT NULL, account_id uuid NOT NULL, connection_id uuid NOT NULL,
 credential_revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.api_contribution_tasks(project_id,job_id)
);
CREATE INDEX api_contribution_reservations_by_account ON sophia.api_contribution_reservations(account_id);
CREATE INDEX api_contribution_reservations_by_grant ON sophia.api_contribution_reservations(grant_id);

ALTER TABLE sophia.api_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.api_route_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.api_contribution_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.api_contribution_runtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_funding_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.api_contribution_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.api_contribution_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.api_accounts, sophia.api_connections, sophia.api_route_qualifications, sophia.api_contribution_grants,
 sophia.api_contribution_runtimes, sophia.research_funding_pins, sophia.api_contribution_tasks,
 sophia.api_contribution_reservations FROM PUBLIC;

-- --- shared rules ---------------------------------------------------------------------------------------------------

-- Whether an executor resource is a contribution's. Every legacy runtime picker excludes these.
CREATE FUNCTION sophia.contribution_resource(p_project uuid, p_resource uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=p_project AND x.resource_id=p_resource) $$;

-- What a reservation still commits: reserved and uncertain at their reserved amount, settled at its cost, released nothing.
CREATE FUNCTION sophia.contribution_commit(r sophia.research_reservations) RETURNS numeric LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE r.state WHEN 'reserved' THEN r.reserved_usd WHEN 'uncertain' THEN r.reserved_usd WHEN 'settled' THEN r.settled_usd ELSE 0 END $$;

-- The contributed model commitments inside a project's research allowances (the project does not pay for them).
CREATE FUNCTION sophia.contribution_project_committed(p_project uuid) RETURNS numeric LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.project_id=p_project $$;

-- Slots an account's contributed work holds, across every project and alias: an unfinished task, or one whose model
-- reservation is still reserved or uncertain. An uncertain possible effect keeps its slot until it is reconciled.
CREATE FUNCTION sophia.contribution_slots_held(p_account uuid, p_grant uuid DEFAULT NULL) RETURNS integer LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT count(*)::integer FROM sophia.api_contribution_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
  WHERE t.account_id=p_account AND (p_grant IS NULL OR t.grant_id=p_grant)
   AND (j.state IN ('pending','running','outcome_unknown') OR EXISTS(SELECT 1 FROM sophia.api_contribution_reservations x
    JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
    WHERE x.project_id=t.project_id AND x.job_id=t.job_id AND r.state IN ('reserved','uncertain'))) $$;

CREATE FUNCTION sophia.contribution_member(p_project uuid, p_actor uuid, p_edit boolean) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=p_project AND m.actor_id=p_actor AND m.active
  AND (NOT p_edit OR m.role IN ('admin','editor'))) $$;

CREATE FUNCTION sophia.contribution_requester_eligible(gr sophia.api_contribution_grants, p_actor uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.contribution_member(gr.project_id,p_actor,true) AND (gr.eligible='editors' OR p_actor=ANY(gr.eligible_actors)) $$;

-- Why a grant cannot fund new work now, or NULL. "Now" is the wall clock when this is called (r3): a caller decides
-- after its last lock wait, so an expiry that passed while it waited counts. Never the transaction's start time.
CREATE FUNCTION sophia.contribution_grant_unusable(gr sophia.api_contribution_grants) RETURNS text LANGUAGE sql VOLATILE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN gr.id IS NULL THEN 'grant_missing' WHEN gr.state='revoked' THEN 'grant_revoked'
  WHEN gr.admin_disabled_at IS NOT NULL THEN 'admin_disabled' WHEN gr.state='paused' THEN 'grant_paused'
  WHEN gr.expires_at<=clock_timestamp() THEN 'grant_expired' ELSE NULL END $$;

-- A current route qualification at the wall clock when this is called (r3), as contribution_grant_unusable.
CREATE FUNCTION sophia.contribution_route_qualified(p_route text, p_model text, p_effort text) RETURNS boolean LANGUAGE sql VOLATILE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.api_route_qualifications q WHERE q.route_id=p_route AND q.model=p_model AND q.effort=p_effort
  AND q.revoked_at IS NULL AND q.expires_at>clock_timestamp()) $$;

-- Why a contribution runtime may not take new work now, or NULL; always NULL for a legacy runtime. Read at every
-- dispatch of new work (runtime_unavailable, 0094): its link, connection, credential revision, grant (including a
-- time-only expiry), owner membership and route qualification, and every queued create, resume and steer for it
-- (contribution_delivery_ineligible), so a change whose fence did not run is still caught at dispatch.
CREATE FUNCTION sophia.contribution_runtime_unusable(rt sophia.runtime_instances) RETURNS text LANGUAGE plpgsql VOLATILE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.api_contribution_runtimes; conn sophia.api_connections; gr sophia.api_contribution_grants; why text;
BEGIN
 IF rt.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO x FROM sophia.api_contribution_runtimes WHERE project_id=rt.project_id AND resource_id=rt.resource_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF x.state<>'current' THEN RETURN 'runtime_rotated'; END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=x.connection_id;
 IF conn.state<>'connected' THEN RETURN 'connection_not_connected'; END IF;
 IF conn.credential_revision<>x.credential_revision THEN RETURN 'credential_revision_changed'; END IF;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE project_id=x.project_id AND connection_id=x.connection_id;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN RETURN why; END IF;
 IF NOT sophia.contribution_member(gr.project_id,gr.owner_id,false) THEN RETURN 'owner_not_member'; END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN RETURN 'route_unqualified'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.outbox o JOIN sophia.execution_bindings b ON b.project_id=o.project_id AND b.id=o.binding_id
   WHERE o.project_id=rt.project_id AND b.resource_id=rt.resource_id AND o.state IN ('pending','dispatching')
    AND o.destination IN ('native.create','native.resume','native.steer') AND sophia.contribution_delivery_ineligible(o,b) IS NOT NULL) THEN
  RETURN 'queued_work_unauthorized'; END IF;
 RETURN NULL;
END $$;

-- The runtime_unavailable reason of a contribution runtime that is connected but may not take new work now, or NULL.
CREATE FUNCTION sophia.contribution_wait_reason(rt sophia.runtime_instances) RETURNS text LANGUAGE plpgsql VOLATILE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE why text:=sophia.contribution_runtime_unusable(rt);
BEGIN
 RETURN CASE WHEN why IS NULL THEN NULL ELSE 'waiting for Sophia''s runtime: its contribution is not usable now ('||why||')' END;
END $$;

-- The contribution runtime of a grant's connection at its current credential revision in its project, if connected.
-- Its authority is judged by the caller's explicit checks, so only the runtime's own connection is read here.
CREATE FUNCTION sophia.contribution_runtime_of(gr sophia.api_contribution_grants, conn sophia.api_connections)
RETURNS sophia.runtime_instances LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.* FROM sophia.api_contribution_runtimes x JOIN sophia.runtime_instances r ON r.project_id=x.project_id AND r.resource_id=x.resource_id
  WHERE x.project_id=gr.project_id AND x.connection_id=conn.id AND x.credential_revision=conn.credential_revision AND x.state='current'
   AND r.state='active' AND r.roles @> jsonb_build_array(jsonb_build_object('id',gr.role_id,'route',gr.route_id))
   AND sophia.runtime_unavailable(r) IS NOT DISTINCT FROM sophia.contribution_wait_reason(r)
  ORDER BY r.seen_at DESC LIMIT 1 $$;

-- Readiness for one actor in the grant's project: reason codes, never a single green flag. Empty means ready.
CREATE FUNCTION sophia.contribution_readiness(gr sophia.api_contribution_grants, p_actor uuid) RETURNS text[] LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; acc sophia.api_accounts; rg sophia.research_grants; out text[]:='{}'; why text;
BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=conn.account_id;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=gr.project_id;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN out:=out||why; END IF;
 IF conn.state<>'connected' THEN out:=out||'connection_not_connected'::text; END IF;
 IF NOT sophia.contribution_member(gr.project_id,gr.owner_id,false) THEN out:=out||'owner_not_member'::text; END IF;
 IF p_actor IS NOT NULL AND NOT sophia.contribution_requester_eligible(gr,p_actor) THEN out:=out||'requester_ineligible'::text; END IF;
 IF rg.project_id IS NULL OR rg.state<>'enabled' THEN out:=out||'project_research_gate_closed'::text; END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN out:=out||'route_unqualified'::text; END IF;
 IF conn.state='connected' AND (sophia.contribution_runtime_of(gr,conn)).id IS NULL THEN out:=out||'runtime_unavailable'::text; END IF;
 IF sophia.contribution_slots_held(acc.id)>=acc.concurrency_limit OR sophia.contribution_slots_held(acc.id,gr.id)>=gr.concurrency THEN
  out:=out||'account_busy'::text; END IF;
 RETURN out;
END $$;

-- Raise the stable refusal for a contribution: 55000 (unavailable: wait or choose again) or 42501 (not permitted).
CREATE FUNCTION sophia.contribution_refuse(p_code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_code IN ('requester_ineligible','owner_not_member','grant_missing') THEN
  RAISE EXCEPTION 'Contribution not permitted: %', p_code USING ERRCODE='42501'; END IF;
 RAISE EXCEPTION 'Contribution unavailable: %', p_code USING ERRCODE='55000';
END $$;

-- --- admission, dispatch, reservation and publication fences (called by the replaced functions below) ----------------

-- A pinned admission's checks, under the project lock already held, then the grant, connection and account locks.
-- Returns the grant it binds. Raises a typed refusal and admits nothing otherwise; there is no fallback payer.
CREATE FUNCTION sophia.contribution_admission(p_project uuid, p_actor uuid, pin sophia.research_funding_pins, p_role text,
 p_route text, p_outputs jsonb, p_base_job uuid) RETURNS sophia.api_contribution_grants LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text; base sophia.api_contribution_tasks;
BEGIN
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=pin.grant_id AND project_id=p_project FOR SHARE;
 IF NOT FOUND THEN PERFORM sophia.contribution_refuse('grant_missing'); END IF;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF gr.revision<>pin.grant_revision THEN PERFORM sophia.contribution_refuse('pin_stale'); END IF;
 IF p_role<>gr.role_id OR p_route<>gr.route_id OR p_outputs<>'["markdown"]'::jsonb THEN
  PERFORM sophia.contribution_refuse('operation_not_granted'); END IF;
 IF NOT sophia.contribution_requester_eligible(gr,p_actor) THEN PERFORM sophia.contribution_refuse('requester_ineligible'); END IF;
 -- Source disclosure: project text goes to the owner's provider account, so the owner must be a current member.
 IF NOT sophia.contribution_member(p_project,gr.owner_id,false) THEN PERFORM sophia.contribution_refuse('owner_not_member'); END IF;
 IF p_base_job IS NOT NULL THEN
  SELECT * INTO base FROM sophia.api_contribution_tasks WHERE project_id=p_project AND job_id=p_base_job;
  IF NOT FOUND OR base.grant_id<>gr.id THEN PERFORM sophia.contribution_refuse('lineage_funding_mixed'); END IF;
 END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id FOR SHARE;
 IF conn.state<>'connected' THEN PERFORM sophia.contribution_refuse('connection_not_connected'); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 -- The account row serializes every admission and reservation of this account, across projects and aliases.
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=conn.account_id FOR UPDATE;
 IF sophia.contribution_slots_held(acc.id)>=acc.concurrency_limit OR sophia.contribution_slots_held(acc.id,gr.id)>=gr.concurrency THEN
  PERFORM sophia.contribution_refuse('account_busy'); END IF;
 -- r3: the time-bound authority is decided here, after the last wait (the account), at the wall clock.
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 RETURN gr;
END $$;

CREATE FUNCTION sophia.contribution_admission_runtime(p_project uuid, gr sophia.api_contribution_grants)
RETURNS sophia.runtime_instances LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; rt sophia.runtime_instances;
BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id;
 rt:=sophia.contribution_runtime_of(gr,conn);
 IF rt.id IS NULL OR rt.project_id<>p_project THEN PERFORM sophia.contribution_refuse('runtime_unavailable'); END IF;
 RETURN rt;
END $$;

CREATE FUNCTION sophia.contribution_bind_task(p_project uuid, p_job uuid, p_allowance uuid, p_actor uuid,
 gr sophia.api_contribution_grants, rt sophia.runtime_instances) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections;
BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id;
 INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,credential_revision,
  account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort)
 VALUES(p_project,p_job,p_allowance,gr.id,gr.revision,conn.id,conn.credential_revision,conn.account_id,gr.owner_id,p_actor,
  rt.resource_id,gr.route_id,gr.model,gr.effort);
END $$;

-- Why a contributed binding's new work may not be delivered now, or NULL. Stop and retire are never blocked here.
-- Read by the change fences and, at dispatch, by runtime_unavailable and defer_native_delivery (0094).
CREATE FUNCTION sophia.contribution_delivery_ineligible(o sophia.outbox, b sophia.execution_bindings) RETURNS text LANGUAGE plpgsql VOLATILE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; why text;
BEGIN
 IF o.destination NOT IN ('native.create','native.resume','native.steer') OR b.id IS NULL THEN RETURN NULL; END IF;
 SELECT x.* INTO t FROM sophia.api_contribution_tasks x JOIN sophia.jobs j ON j.project_id=x.project_id AND j.id=x.job_id
  WHERE j.project_id=b.project_id AND j.attempt_id=b.attempt_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id;
 why:=sophia.contribution_grant_unusable(gr);
 IF why IS NOT NULL THEN RETURN 'its contribution is unusable: '||why; END IF;
 IF gr.revision<>t.grant_revision THEN RETURN 'its contribution grant changed since it was admitted'; END IF;
 IF NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN RETURN 'its requester can no longer use this contribution'; END IF;
 IF NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN RETURN 'the contribution owner is no longer a project member'; END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id;
 IF conn.state<>'connected' OR conn.credential_revision<>t.credential_revision THEN
  RETURN 'its contribution''s credential is no longer the one it was admitted with'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=t.project_id AND x.resource_id=t.resource_id AND x.state='current') THEN
  RETURN 'its contribution runtime was rotated'; END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN RETURN 'its contribution is unusable: route_unqualified'; END IF;
 RETURN NULL;
END $$;

-- A NEW paid model reservation of a contributed task: current authority and the owner's caps, under the account lock.
-- Called with the task, the project gate and the allowance already locked (runtime_research_reserve).
CREATE FUNCTION sophia.contribution_model_reserve(s sophia.research_scope, p_provider text, p_amount numeric) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; conn sophia.api_connections; acc sophia.api_accounts; why text;
 used numeric;
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 -- The requester's and owner's member rows, so a removal waits for this reservation's commit (or makes it fail).
 PERFORM 1 FROM sophia.project_members WHERE project_id=t.project_id AND actor_id IN (t.requester_id,t.owner_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF gr.revision<>t.grant_revision THEN PERFORM sophia.contribution_refuse('grant_revision_changed'); END IF;
 IF NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN PERFORM sophia.contribution_refuse('requester_ineligible'); END IF;
 IF NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN PERFORM sophia.contribution_refuse('owner_not_member'); END IF;
 IF p_provider IS DISTINCT FROM 'openai-research' THEN PERFORM sophia.contribution_refuse('provider_not_contributed'); END IF;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=t.connection_id FOR SHARE;
 IF conn.state<>'connected' OR conn.credential_revision<>t.credential_revision
    OR NOT EXISTS(SELECT 1 FROM sophia.api_contribution_runtimes x WHERE x.project_id=t.project_id AND x.resource_id=t.resource_id AND x.state='current') THEN
  PERFORM sophia.contribution_refuse('credential_revision_changed'); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=t.account_id FOR UPDATE;
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
  WHERE r.project_id=s.project_id AND r.allowance_id=s.allowance_id AND x.grant_id=gr.id;
 IF used+p_amount>gr.task_cap_usd THEN PERFORM sophia.contribution_refuse('task_cap_reached'); END IF;
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.grant_id=gr.id;
 IF used+p_amount>gr.total_cap_usd THEN PERFORM sophia.contribution_refuse('grant_exhausted'); END IF;
 SELECT coalesce(sum(sophia.contribution_commit(r)),0) INTO used FROM sophia.api_contribution_reservations x
  JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.account_id=acc.id;
 IF used+p_amount>acc.total_cap_usd THEN PERFORM sophia.contribution_refuse('account_exhausted'); END IF;
 -- r3: the time-bound authority is decided here, after the last wait (the account), at the wall clock, immediately
 -- before reserve_research writes the reservation (every row it locks is already held: no further wait).
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 IF NOT sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort) THEN PERFORM sophia.contribution_refuse('route_unqualified'); END IF;
END $$;

-- Link a contributed task's model reservation to the payer it was made under (idempotent).
CREATE FUNCTION sophia.contribution_link_reservation(s sophia.research_scope, r sophia.research_reservations) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks;
BEGIN
 IF r.kind<>'model' THEN RETURN; END IF;
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO sophia.api_contribution_reservations(project_id,reservation_id,job_id,grant_id,grant_revision,account_id,connection_id,credential_revision)
 VALUES(s.project_id,r.id,t.job_id,t.grant_id,t.grant_revision,t.account_id,t.connection_id,t.credential_revision)
 ON CONFLICT (project_id,reservation_id) DO NOTHING;
END $$;

-- At publication of a contributed result: withhold it (fail the job, keep the draft as restricted evidence) unless the
-- requester, the owner and the grant still permit it and no source it read was withdrawn. NULL: publish as usual.
CREATE FUNCTION sophia.contribution_withhold(s sophia.research_scope, p_key text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; gr sophia.api_contribution_grants; j sophia.jobs; why text;
BEGIN
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Lock order: the project is already held (runtime_lease, at the start of every runtime research call), then the
 -- task, then its authority (members, grant).
 PERFORM 1 FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.project_members WHERE project_id=t.project_id AND actor_id IN (t.requester_id,t.owner_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=t.grant_id FOR SHARE;
 why:=CASE WHEN gr.state='revoked' THEN 'the contribution was revoked'
  WHEN gr.admin_disabled_at IS NOT NULL THEN 'the contribution was disabled for this project'
  WHEN NOT sophia.contribution_requester_eligible(gr,t.requester_id) THEN 'the requester can no longer use this contribution'
  WHEN NOT sophia.contribution_member(t.project_id,t.owner_id,false) THEN 'the contribution owner is no longer a project member'
  WHEN sophia.source_withdrawn(s.project_id,s.manifest_source_id) THEN 'a source it read was withdrawn'
  ELSE NULL END;
 IF why IS NULL THEN RETURN NULL; END IF;
 UPDATE sophia.jobs SET state='failed', reason=left('withheld: '||why,2000), result_revision=result_revision+1
  WHERE project_id=s.project_id AND id=s.job_id RETURNING * INTO j;
 UPDATE sophia.research_tasks SET closed_by_call=p_key WHERE project_id=s.project_id AND job_id=s.job_id;
 UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
 -- The existing 'denied' summary: publication was denied under current authority (the job's reason says withheld).
 PERFORM sophia.emit_service_event(s.project_id,'native_task.failed','job',j.id,j.result_revision+3,'native_task.denied');
 RETURN jsonb_build_object('taskId',j.id,'outcome','withheld','reason',why);
END $$;

-- Whether a research allowance funds a contributed lineage (its model calls are the contributor's, not the project's).
CREATE FUNCTION sophia.contribution_allowance(p_project uuid, p_allowance uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.api_contribution_tasks t WHERE t.project_id=p_project AND t.allowance_id=p_allowance) $$;

-- --- the conversation pickers: excluded structurally ---------------------------------------------------------------
-- conversation_ask (0071) and conversation_ask_capability (0089) are pinned byte-for-byte by existing invariant suites,
-- so they are not replaced. Instead a contribution runtime can only ever HOLD the one contributed role, whatever it
-- advertises: every role-filtered picker, conversation included, can never choose it. Not a role or digest coincidence.
CREATE FUNCTION sophia.contribution_runtime_roles() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF sophia.contribution_resource(NEW.project_id,NEW.resource_id) THEN
  NEW.roles:=coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(NEW.roles) x
   WHERE x->>'id'='sophia-research-md-v1' AND x->>'route'='research-sol-medium-v1'),'[]'::jsonb);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER runtime_instances_contribution_roles BEFORE INSERT OR UPDATE OF roles ON sophia.runtime_instances
 FOR EACH ROW EXECUTE FUNCTION sophia.contribution_runtime_roles();

-- --- dispatch: queued new work is judged at dispatch, and fenced when its authority changes ------------------------
-- native_delivery_ineligible and dispatch_runtime_outbox are pinned byte-for-byte by an existing invariant suite, so the
-- dispatch recheck is in what they call: runtime_unavailable (read for every create, resume and steer, never for a stop,
-- hold or retire) reports a contribution runtime whose current authority fails, and defer_native_delivery then DENIES
-- a contributed delivery that its own current authority no longer permits (time-only expiry and a withdrawn or expired
-- route qualification included), under the project lock dispatch holds. In addition, a change denies the contributed
-- task's queued create, resume and steer deliveries in the same transaction: a grant, connection, runtime link or
-- membership change. Every such change holds the project lock(s) first, as dispatch and admission do.
CREATE FUNCTION sophia.contribution_fence(p_project uuid, p_job uuid) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; c sophia.commands; b sophia.execution_bindings; why text; n integer:=0;
BEGIN
 FOR o IN SELECT ob.* FROM sophia.outbox ob JOIN sophia.execution_bindings eb ON eb.project_id=ob.project_id AND eb.id=ob.binding_id
   JOIN sophia.jobs j ON j.project_id=eb.project_id AND j.attempt_id=eb.attempt_id
   WHERE j.project_id=p_project AND j.id=p_job AND ob.state IN ('pending','dispatching')
    AND ob.destination IN ('native.create','native.resume','native.steer') ORDER BY ob.id FOR UPDATE OF ob
 LOOP
  SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=o.project_id AND id=o.binding_id;
  why:=sophia.contribution_delivery_ineligible(o,b);
  IF why IS NOT NULL THEN
   SELECT * INTO c FROM sophia.commands WHERE project_id=o.project_id AND id=o.command_id;
   PERFORM sophia.deny_native_delivery(o,c,why);
   n:=n+1;
  END IF;
 END LOOP;
 RETURN n;
END $$;

CREATE FUNCTION sophia.contribution_fence_changed() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t record; v_grant uuid; v_connection uuid; v_project uuid; v_resource uuid; v_actor uuid;
BEGIN
 -- Each table's own key, read only where that table has it.
 IF TG_TABLE_NAME='api_contribution_grants' THEN v_grant:=NEW.id;
 ELSIF TG_TABLE_NAME='api_connections' THEN v_connection:=NEW.id;
 ELSIF TG_TABLE_NAME='api_contribution_runtimes' THEN v_project:=NEW.project_id; v_resource:=NEW.resource_id;
 ELSE v_project:=NEW.project_id; v_actor:=NEW.actor_id;
 END IF;
 FOR t IN SELECT x.project_id, x.job_id FROM sophia.api_contribution_tasks x JOIN sophia.jobs j ON j.project_id=x.project_id AND j.id=x.job_id
   WHERE j.state IN ('pending','running','outcome_unknown')
    AND (v_grant IS NULL OR x.grant_id=v_grant) AND (v_connection IS NULL OR x.connection_id=v_connection)
    AND (v_project IS NULL OR x.project_id=v_project) AND (v_resource IS NULL OR x.resource_id=v_resource)
    AND (v_actor IS NULL OR v_actor IN (x.requester_id,x.owner_id))
 LOOP
  PERFORM sophia.contribution_fence(t.project_id,t.job_id);
 END LOOP;
 RETURN NULL;
END $$;
-- The lock order of a connection change (state, rotation, registration): every project it may fence, in id order, then
-- the connection. A project that gained a grant or link on the connection meanwhile makes the change refuse (40001)
-- rather than lock a project out of order.
CREATE FUNCTION sophia.contribution_lock_connection(p_connection uuid, p_project uuid DEFAULT NULL) RETURNS sophia.api_connections
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE locked uuid[]; current_set uuid[]; conn sophia.api_connections;
BEGIN
 SELECT coalesce(array_agg(p ORDER BY p),'{}') INTO locked FROM (
  SELECT project_id p FROM sophia.api_contribution_grants WHERE connection_id=p_connection
  UNION SELECT project_id FROM sophia.api_contribution_runtimes WHERE connection_id=p_connection
  UNION SELECT p_project WHERE p_project IS NOT NULL) x;
 PERFORM 1 FROM sophia.projects WHERE id=ANY(locked) ORDER BY id FOR UPDATE;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=p_connection FOR UPDATE;
 SELECT coalesce(array_agg(p ORDER BY p),'{}') INTO current_set FROM (
  SELECT project_id p FROM sophia.api_contribution_grants WHERE connection_id=p_connection
  UNION SELECT project_id FROM sophia.api_contribution_runtimes WHERE connection_id=p_connection) x;
 IF NOT current_set<@locked THEN
  RAISE EXCEPTION 'The contribution changed while it was being edited; try again' USING ERRCODE='40001'; END IF;
 RETURN conn;
END $$;

CREATE TRIGGER api_contribution_grants_fence AFTER UPDATE ON sophia.api_contribution_grants
 FOR EACH ROW EXECUTE FUNCTION sophia.contribution_fence_changed();
CREATE TRIGGER api_connections_fence AFTER UPDATE OF state, credential_revision ON sophia.api_connections
 FOR EACH ROW EXECUTE FUNCTION sophia.contribution_fence_changed();
CREATE TRIGGER api_contribution_runtimes_fence AFTER UPDATE OF state ON sophia.api_contribution_runtimes
 FOR EACH ROW EXECUTE FUNCTION sophia.contribution_fence_changed();
CREATE TRIGGER project_members_contribution_fence AFTER UPDATE OF active, role ON sophia.project_members
 FOR EACH ROW WHEN (OLD.active IS DISTINCT FROM NEW.active OR OLD.role IS DISTINCT FROM NEW.role)
 EXECUTE FUNCTION sophia.contribution_fence_changed();

-- --- grant settings ------------------------------------------------------------------------------------------------

-- Apply a settings patch to a grant record. Narrow-only (a project admin) may only lower caps, shorten expiry or
-- shrink who may use it. Unsupported policies are refused as unsupported, never stored or approximated.
CREATE FUNCTION sophia.contribution_apply_settings(gr sophia.api_contribution_grants, p jsonb, p_narrow_only boolean)
RETURNS sophia.api_contribution_grants LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE keys text[]:=ARRAY['expiresAt','eligible','eligibleActors','taskCapUsd','totalCapUsd','concurrency','fundingPolicy',
  'fundingAcknowledgementRef','activeSettlement','unknownUsagePolicy','operation','outputs','role','route','model','effort'];
 narrow_keys text[]:=ARRAY['expiresAt','eligible','eligibleActors','taskCapUsd','totalCapUsd','concurrency'];
 k text; v_actors uuid[]; old sophia.api_contribution_grants:=gr; acc sophia.api_accounts;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Invalid contribution settings' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF NOT k=ANY(keys) THEN RAISE EXCEPTION 'Unknown contribution setting %', k USING ERRCODE='22023'; END IF;
  IF p_narrow_only AND NOT k=ANY(narrow_keys) THEN
   RAISE EXCEPTION 'A project admin may only narrow or disable a contribution, not change %', k USING ERRCODE='42501'; END IF;
 END LOOP;
 IF p ? 'activeSettlement' AND p->>'activeSettlement' IS DISTINCT FROM 'block_new_calls' THEN
  RAISE EXCEPTION 'Unsupported active-settlement policy %: no qualified Stop or finish control exists for contribution runtimes; only block_new_calls', p->>'activeSettlement'
   USING ERRCODE='0A000'; END IF;
 IF p ? 'fundingPolicy' AND p->>'fundingPolicy' IS DISTINCT FROM 'bounded_total_spend' THEN
  RAISE EXCEPTION 'Unsupported funding policy %: benefit-only use cannot be enforced or proven here; only bounded_total_spend', p->>'fundingPolicy'
   USING ERRCODE='0A000'; END IF;
 IF p ? 'unknownUsagePolicy' AND p->>'unknownUsagePolicy' IS DISTINCT FROM 'hold_uncertain' THEN
  RAISE EXCEPTION 'Unsupported unknown-usage policy %', p->>'unknownUsagePolicy' USING ERRCODE='0A000'; END IF;
 IF (p ? 'operation' AND p->>'operation' IS DISTINCT FROM 'research') OR (p ? 'outputs' AND p->'outputs'<>'["markdown"]'::jsonb)
    OR (p ? 'role' AND p->>'role' IS DISTINCT FROM 'sophia-research-md-v1') OR (p ? 'route' AND p->>'route' IS DISTINCT FROM 'research-sol-medium-v1')
    OR (p ? 'model' AND p->>'model' IS DISTINCT FROM 'gpt-6.1-sol') OR (p ? 'effort' AND p->>'effort' IS DISTINCT FROM 'medium') THEN
  RAISE EXCEPTION 'Only Markdown research on research-sol-medium-v1 (gpt-6.1-sol, medium) can be contributed' USING ERRCODE='0A000'; END IF;
 IF p ? 'expiresAt' THEN
  gr.expires_at:=(p->>'expiresAt')::timestamptz;
  IF gr.expires_at<=now() OR gr.expires_at>now()+interval '366 days' THEN
   RAISE EXCEPTION 'A contribution expires within a year from now' USING ERRCODE='22023'; END IF;
 END IF;
 IF p ? 'eligibleActors' THEN
  IF jsonb_typeof(p->'eligibleActors')<>'array' THEN RAISE EXCEPTION 'Invalid eligible requesters' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT x::uuid),'{}') INTO v_actors FROM jsonb_array_elements_text(p->'eligibleActors') x;
  gr.eligible_actors:=v_actors;
 END IF;
 IF p ? 'eligible' THEN gr.eligible:=p->>'eligible'; END IF;
 IF gr.eligible='editors' THEN gr.eligible_actors:='{}'; END IF;
 IF p ? 'taskCapUsd' THEN gr.task_cap_usd:=(p->>'taskCapUsd')::numeric; END IF;
 IF p ? 'totalCapUsd' THEN gr.total_cap_usd:=(p->>'totalCapUsd')::numeric; END IF;
 IF p ? 'concurrency' THEN gr.concurrency:=(p->>'concurrency')::integer; END IF;
 IF p ? 'fundingAcknowledgementRef' THEN gr.funding_ack_ref:=p->>'fundingAcknowledgementRef'; gr.funding_acknowledged_at:=now(); END IF;
 IF p ? 'fundingPolicy' THEN gr.funding_policy:=p->>'fundingPolicy'; END IF;
 IF gr.eligible NOT IN ('editors','listed') OR (gr.eligible='listed')<>(cardinality(gr.eligible_actors)>0) OR cardinality(gr.eligible_actors)>50 THEN
  RAISE EXCEPTION 'Eligible requesters are every editor, or a list of 1 to 50 members' USING ERRCODE='22023'; END IF;
 IF gr.task_cap_usd IS NULL OR gr.task_cap_usd<=0 OR gr.total_cap_usd<gr.task_cap_usd OR gr.concurrency NOT BETWEEN 1 AND 3 THEN
  RAISE EXCEPTION 'Invalid contribution caps' USING ERRCODE='22023'; END IF;
 SELECT a.* INTO acc FROM sophia.api_accounts a JOIN sophia.api_connections c ON c.account_id=a.id WHERE c.id=gr.connection_id;
 IF gr.total_cap_usd>acc.total_cap_usd OR gr.concurrency>acc.concurrency_limit THEN
  RAISE EXCEPTION 'A contribution cannot exceed its account''s total cap or concurrency' USING ERRCODE='22023'; END IF;
 IF p_narrow_only AND (gr.task_cap_usd>old.task_cap_usd OR gr.total_cap_usd>old.total_cap_usd OR gr.concurrency>old.concurrency
    OR gr.expires_at>old.expires_at
    OR (old.eligible='listed' AND (gr.eligible<>'listed' OR NOT gr.eligible_actors<@old.eligible_actors))) THEN
  RAISE EXCEPTION 'A project admin may only narrow a contribution; only its owner may enlarge it' USING ERRCODE='42501'; END IF;
 RETURN gr;
END $$;

CREATE FUNCTION sophia.contribution_store(gr sophia.api_contribution_grants) RETURNS sophia.api_contribution_grants LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.api_contribution_grants SET revision=revision+1, state=gr.state, expires_at=gr.expires_at, eligible=gr.eligible,
  eligible_actors=gr.eligible_actors, task_cap_usd=gr.task_cap_usd, total_cap_usd=gr.total_cap_usd, concurrency=gr.concurrency,
  funding_policy=gr.funding_policy, funding_ack_ref=gr.funding_ack_ref, funding_acknowledged_at=gr.funding_acknowledged_at,
  admin_disabled_at=gr.admin_disabled_at, admin_disabled_by=gr.admin_disabled_by, admin_disabled_reason=gr.admin_disabled_reason,
  updated_at=now()
 WHERE id=gr.id RETURNING * INTO gr;
 RETURN gr;
END $$;

-- The grant an actor may edit, locked, at the expected revision. Another owner's grant answers like a missing one.
CREATE FUNCTION sophia.contribution_grant_for_edit(p_grant uuid, p_expected bigint, p_as text) RETURNS sophia.api_contribution_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); gr sophia.api_contribution_grants; v_project uuid;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 -- The project first (its fence emits project events, and admission and dispatch hold the project), then the grant.
 SELECT project_id INTO v_project FROM sophia.api_contribution_grants WHERE id=p_grant;
 PERFORM 1 FROM sophia.projects WHERE id=v_project FOR UPDATE;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=p_grant FOR UPDATE;
 IF NOT FOUND OR (p_as='owner' AND gr.owner_id<>a)
    OR (p_as='admin' AND NOT EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=gr.project_id AND m.actor_id=a AND m.active AND m.role='admin')) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_expected IS NULL OR p_expected<>gr.revision THEN RAISE EXCEPTION 'Stale contribution revision' USING ERRCODE='40001'; END IF;
 IF gr.state='revoked' THEN RAISE EXCEPTION 'The contribution was revoked' USING ERRCODE='40001'; END IF;
 RETURN gr;
END $$;

CREATE FUNCTION sophia.contribution_grant_receipt(gr sophia.api_contribution_grants) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('grantId',gr.id,'projectId',gr.project_id,'revision',gr.revision,'state',gr.state,
  'adminDisabled',gr.admin_disabled_at IS NOT NULL,'expiresAt',gr.expires_at) $$;

-- --- the owner (sophia_api, actor derived server-side) -------------------------------------------------------------

CREATE FUNCTION sophia.api_account_create(p_label text, p_total_cap_usd numeric, p_concurrency integer DEFAULT 1,
 p_provenance text DEFAULT 'owner_declared', p_separate_ownership_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); acc sophia.api_accounts;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 BEGIN
  INSERT INTO sophia.api_accounts(owner_id,provider,label,provenance,separate_ownership_note,concurrency_limit,total_cap_usd)
  VALUES(a,'openai',p_label,coalesce(p_provenance,'owner_declared'),p_separate_ownership_note,coalesce(p_concurrency,1),p_total_cap_usd)
  RETURNING * INTO acc;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'You already have an API account for this provider: aliases share it unless you record separate ownership'
   USING ERRCODE='23505';
 WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023';
 END;
 RETURN jsonb_build_object('accountId',acc.id,'revision',acc.revision);
END $$;

CREATE FUNCTION sophia.api_account_update(p_account uuid, p_expected_revision bigint, p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); acc sophia.api_accounts; k text;
BEGIN
 SELECT * INTO acc FROM sophia.api_accounts WHERE id=p_account FOR UPDATE;
 IF a IS NULL OR NOT FOUND OR acc.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS DISTINCT FROM acc.revision THEN RAISE EXCEPTION 'Stale contribution revision' USING ERRCODE='40001'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF k NOT IN ('label','totalCapUsd','concurrency','provenance') THEN RAISE EXCEPTION 'Unknown account setting %', k USING ERRCODE='22023'; END IF;
 END LOOP;
 BEGIN
  UPDATE sophia.api_accounts SET label=coalesce(p_patch->>'label',label),
   total_cap_usd=coalesce((p_patch->>'totalCapUsd')::numeric,total_cap_usd),
   concurrency_limit=coalesce((p_patch->>'concurrency')::integer,concurrency_limit),
   provenance=coalesce(p_patch->>'provenance',provenance), revision=revision+1, updated_at=now()
  WHERE id=acc.id RETURNING * INTO acc;
 EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'Invalid API account' USING ERRCODE='22023';
 END;
 RETURN jsonb_build_object('accountId',acc.id,'revision',acc.revision);
END $$;

CREATE FUNCTION sophia.api_connection_create(p_account uuid, p_label text, p_custodian_label text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); conn sophia.api_connections;
BEGIN
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM sophia.api_accounts WHERE id=p_account AND owner_id=a) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 BEGIN
  INSERT INTO sophia.api_connections(owner_id,account_id,label,route_id,model,effort,credential_ref,custodian_label)
  VALUES(a,p_account,p_label,'research-sol-medium-v1','gpt-6.1-sol','medium','OPENAI_RESEARCH_API_KEY',p_custodian_label) RETURNING * INTO conn;
 EXCEPTION WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'Invalid API connection' USING ERRCODE='22023';
 END;
 RETURN jsonb_build_object('connectionId',conn.id,'revision',conn.revision,'state',conn.state);
END $$;

-- Owner: pause, resume or revoke custody use. Revoked is final. Resuming needs a registered credential.
CREATE FUNCTION sophia.api_connection_set_state(p_connection uuid, p_expected_revision bigint, p_state text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); conn sophia.api_connections;
BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=p_connection;
 IF a IS NULL OR NOT FOUND OR conn.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 -- Every project it may fence, in id order, then the connection.
 conn:=sophia.contribution_lock_connection(p_connection);
 IF p_expected_revision IS DISTINCT FROM conn.revision THEN RAISE EXCEPTION 'Stale contribution revision' USING ERRCODE='40001'; END IF;
 IF conn.state='revoked' THEN RAISE EXCEPTION 'The connection was revoked' USING ERRCODE='40001'; END IF;
 IF p_state NOT IN ('paused','connected','revoked') OR (p_state='connected' AND (conn.state<>'paused' OR conn.credential_revision=0)) THEN
  RAISE EXCEPTION 'Invalid connection state change' USING ERRCODE='22023'; END IF;
 UPDATE sophia.api_connections SET state=p_state, revision=revision+1, updated_at=now() WHERE id=conn.id RETURNING * INTO conn;
 RETURN jsonb_build_object('connectionId',conn.id,'revision',conn.revision,'state',conn.state);
END $$;

-- Owner: grant one selected project. The owner must be a current member (its provider account receives project text).
CREATE FUNCTION sophia.api_grant_create(p_connection uuid, p_project uuid, p_settings jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); conn sophia.api_connections; gr sophia.api_contribution_grants;
BEGIN
 -- r3: the project first (a registered runtime link already puts it in every connection change's project set), then
 -- the connection, then the INSERT's own references; ownership and membership are checked under both locks.
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO conn FROM sophia.api_connections WHERE id=p_connection FOR SHARE;
 IF a IS NULL OR NOT FOUND OR conn.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT sophia.contribution_member(p_project,a,false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF conn.state='revoked' THEN RAISE EXCEPTION 'The connection was revoked' USING ERRCODE='40001'; END IF;
 IF p_settings IS NULL OR NOT (p_settings ?& ARRAY['expiresAt','taskCapUsd','totalCapUsd','fundingPolicy','fundingAcknowledgementRef']) THEN
  RAISE EXCEPTION 'A contribution names its expiry, caps, funding policy and its acknowledgement' USING ERRCODE='22023'; END IF;
 gr.id:=gen_random_uuid(); gr.project_id:=p_project; gr.connection_id:=p_connection; gr.owner_id:=a; gr.state:='enabled';
 gr.eligible:='editors'; gr.eligible_actors:='{}'; gr.concurrency:=1;
 gr:=sophia.contribution_apply_settings(gr,p_settings,false);
 BEGIN
  INSERT INTO sophia.api_contribution_grants(id,project_id,connection_id,owner_id,state,expires_at,eligible,eligible_actors,task_cap_usd,
   total_cap_usd,concurrency,funding_policy,funding_ack_ref,created_by)
  VALUES(gr.id,p_project,p_connection,a,'enabled',gr.expires_at,gr.eligible,gr.eligible_actors,gr.task_cap_usd,gr.total_cap_usd,
   gr.concurrency,gr.funding_policy,gr.funding_ack_ref,a) RETURNING * INTO gr;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This connection already has a contribution in this project: edit it' USING ERRCODE='23505';
 END;
 RETURN sophia.contribution_grant_receipt(gr);
END $$;

CREATE FUNCTION sophia.api_grant_update(p_grant uuid, p_expected_revision bigint, p_settings jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants:=sophia.contribution_grant_for_edit(p_grant,p_expected_revision,'owner');
BEGIN
 RETURN sophia.contribution_grant_receipt(sophia.contribution_store(sophia.contribution_apply_settings(gr,p_settings,false)));
END $$;

-- Owner: enable, pause or revoke (final). Revocation blocks queued and new effects; what already ran stays recorded.
CREATE FUNCTION sophia.api_grant_set_state(p_grant uuid, p_expected_revision bigint, p_state text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants:=sophia.contribution_grant_for_edit(p_grant,p_expected_revision,'owner');
BEGIN
 IF p_state NOT IN ('enabled','paused','revoked') THEN RAISE EXCEPTION 'Invalid contribution state' USING ERRCODE='22023'; END IF;
 gr.state:=p_state;
 RETURN sophia.contribution_grant_receipt(sophia.contribution_store(gr));
END $$;

-- --- a project admin: narrow or disable only -----------------------------------------------------------------------

CREATE FUNCTION sophia.api_grant_admin_disable(p_grant uuid, p_expected_revision bigint, p_reason text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants:=sophia.contribution_grant_for_edit(p_grant,p_expected_revision,'admin');
BEGIN
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'A reason of 1 to 300 characters' USING ERRCODE='22023'; END IF;
 IF gr.admin_disabled_at IS NOT NULL THEN RAISE EXCEPTION 'Already disabled for this project' USING ERRCODE='40001'; END IF;
 gr.admin_disabled_at:=now(); gr.admin_disabled_by:=sophia.actor_id(); gr.admin_disabled_reason:=btrim(p_reason);
 RETURN sophia.contribution_grant_receipt(sophia.contribution_store(gr));
END $$;

-- Lifting a team disable restores the owner's grant as the owner set it; it never enlarges it.
CREATE FUNCTION sophia.api_grant_admin_lift(p_grant uuid, p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants:=sophia.contribution_grant_for_edit(p_grant,p_expected_revision,'admin');
BEGIN
 IF gr.admin_disabled_at IS NULL THEN RAISE EXCEPTION 'Not disabled for this project' USING ERRCODE='40001'; END IF;
 gr.admin_disabled_at:=NULL; gr.admin_disabled_by:=NULL; gr.admin_disabled_reason:=NULL;
 RETURN sophia.contribution_grant_receipt(sophia.contribution_store(gr));
END $$;

CREATE FUNCTION sophia.api_grant_admin_narrow(p_grant uuid, p_expected_revision bigint, p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE gr sophia.api_contribution_grants:=sophia.contribution_grant_for_edit(p_grant,p_expected_revision,'admin');
BEGIN
 RETURN sophia.contribution_grant_receipt(sophia.contribution_store(sophia.contribution_apply_settings(gr,p_patch,true)));
END $$;

-- --- a member: the explicit funding pin ----------------------------------------------------------------------------

CREATE FUNCTION sophia.research_funding_pin_set(p_project uuid, p_grant uuid, p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); gr sophia.api_contribution_grants; why text;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=p_grant AND project_id=p_project FOR SHARE;
 -- A grant that is not shared with this requester answers like a missing one.
 IF NOT FOUND OR NOT sophia.contribution_requester_eligible(gr,a) THEN PERFORM sophia.contribution_refuse('grant_missing'); END IF;
 IF p_expected_revision IS DISTINCT FROM gr.revision THEN RAISE EXCEPTION 'Stale contribution revision' USING ERRCODE='40001'; END IF;
 why:=sophia.contribution_grant_unusable(gr); IF why IS NOT NULL THEN PERFORM sophia.contribution_refuse(why); END IF;
 INSERT INTO sophia.research_funding_pins(project_id,requester_id,grant_id,grant_revision) VALUES(p_project,a,gr.id,gr.revision)
 ON CONFLICT (project_id,requester_id) DO UPDATE SET grant_id=EXCLUDED.grant_id, grant_revision=EXCLUDED.grant_revision, set_at=now();
 RETURN jsonb_build_object('projectId',p_project,'grantId',gr.id,'grantRevision',gr.revision);
END $$;

CREATE FUNCTION sophia.research_funding_pin_clear(p_project uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 DELETE FROM sophia.research_funding_pins WHERE project_id=p_project AND requester_id=a;
 RETURN jsonb_build_object('projectId',p_project,'grantId',NULL);
END $$;

-- --- safe projections ----------------------------------------------------------------------------------------------

-- The owner's own accounts, connections and grants, with Sophia-metered commitments. Nobody else's.
CREATE FUNCTION sophia.api_contributions_mine() RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object(
  'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('accountId',x.id,'label',x.label,'provider',x.provider,'category',x.category,
     'provenance',x.provenance,'separateOwnership',x.separate_ownership_note IS NOT NULL,'concurrencyLimit',x.concurrency_limit,
     'totalCapUsd',x.total_cap_usd,'revision',x.revision,'slotsHeld',sophia.contribution_slots_held(x.id),
     'committedUsd',(SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations l
       JOIN sophia.research_reservations r ON r.project_id=l.project_id AND r.id=l.reservation_id WHERE l.account_id=x.id),
     'providerBalance','unknown') ORDER BY x.created_at) FROM sophia.api_accounts x WHERE x.owner_id=sophia.actor_id()),'[]'),
  'connections',coalesce((SELECT jsonb_agg(jsonb_build_object('connectionId',c.id,'accountId',c.account_id,'label',c.label,
     'route',c.route_id,'model',c.model,'effort',c.effort,'credentialRef',c.credential_ref,'credentialRevision',c.credential_revision,
     'custodianKind',c.custodian_kind,'custodianLabel',c.custodian_label,'state',c.state,'revision',c.revision) ORDER BY c.created_at)
   FROM sophia.api_connections c WHERE c.owner_id=sophia.actor_id()),'[]'),
  'grants',coalesce((SELECT jsonb_agg(sophia.contribution_grant_receipt(g)||jsonb_build_object('connectionId',g.connection_id,
     'eligible',g.eligible,'eligibleActors',to_jsonb(g.eligible_actors),'taskCapUsd',g.task_cap_usd,'totalCapUsd',g.total_cap_usd,
     'concurrency',g.concurrency,'fundingPolicy',g.funding_policy,'activeSettlement',g.active_settlement,
     'adminDisabledReason',g.admin_disabled_reason,'readiness',to_jsonb(sophia.contribution_readiness(g,NULL)),
     'committedUsd',(SELECT coalesce(sum(sophia.contribution_commit(r)),0) FROM sophia.api_contribution_reservations l
       JOIN sophia.research_reservations r ON r.project_id=l.project_id AND r.id=l.reservation_id WHERE l.grant_id=g.id)) ORDER BY g.created_at)
   FROM sophia.api_contribution_grants g WHERE g.owner_id=sophia.actor_id()),'[]'))
 WHERE sophia.actor_id() IS NOT NULL $$;

-- What a project member may see of the contributions shared with the project: limits, state and their own readiness.
-- No account totals or labels, no usage, no other projects, no other members' pins or the eligible list.
CREATE FUNCTION sophia.api_contributions_for_project(p_project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'contributions',coalesce((SELECT jsonb_agg(jsonb_build_object('grantId',g.id,'revision',g.revision,'ownerId',g.owner_id,
     'label',c.label,'route',g.route_id,'model',g.model,'effort',g.effort,'output',g.output,'taskCapUsd',g.task_cap_usd,
     'totalCapUsd',g.total_cap_usd,'concurrency',g.concurrency,'expiresAt',g.expires_at,'state',g.state,
     'adminDisabled',g.admin_disabled_at IS NOT NULL,'fundingPolicy',g.funding_policy,'activeSettlement',g.active_settlement,
     'eligibleForMe',sophia.contribution_requester_eligible(g,a),'readiness',to_jsonb(sophia.contribution_readiness(g,a))) ORDER BY g.created_at)
   FROM sophia.api_contribution_grants g JOIN sophia.api_connections c ON c.id=g.connection_id
   WHERE g.project_id=p_project AND g.state<>'revoked'),'[]'),
  'myPin',(SELECT jsonb_build_object('grantId',p.grant_id,'grantRevision',p.grant_revision,
     'stale',p.grant_revision<>(SELECT g.revision FROM sophia.api_contribution_grants g WHERE g.id=p.grant_id))
   FROM sophia.research_funding_pins p WHERE p.project_id=p_project AND p.requester_id=a));
END $$;

-- A research task's funding, for any member of its project: who paid which meter, and the settings, each kept apart.
CREATE FUNCTION sophia.research_task_funding(p_project uuid, p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.api_contribution_tasks; observed jsonb;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.research_tasks WHERE project_id=p_project AND job_id=p_job) THEN
  RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM sophia.api_contribution_tasks WHERE project_id=p_project AND job_id=p_job;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('taskId',p_job,'funding','project','payers',jsonb_build_object('model','project','search','project','read','project'));
 END IF;
 SELECT CASE WHEN count(DISTINCT r.usage->>'model')=0 THEN '"unknown"'::jsonb
   ELSE to_jsonb(array_agg(DISTINCT r.usage->>'model') FILTER (WHERE r.usage->>'model' IS NOT NULL)) END INTO observed
  FROM sophia.api_contribution_reservations l JOIN sophia.research_reservations r ON r.project_id=l.project_id AND r.id=l.reservation_id
  WHERE l.project_id=p_project AND l.job_id=p_job AND r.state='settled';
 RETURN jsonb_build_object('taskId',p_job,'funding','contribution','ownerId',t.owner_id,'grantId',t.grant_id,
  'grantRevision',t.grant_revision,'credentialRevision',t.credential_revision,'requesterId',t.requester_id,
  'payers',jsonb_build_object('model','contributor_api_account','search','project','read','project'),
  'settings',jsonb_build_object('requested',jsonb_build_object('route',t.requested_route,'model',t.requested_model,'effort',t.requested_effort),
   'accepted','unknown','observedModels',coalesce(observed,'"unknown"'::jsonb),'observedEffort','unknown'));
END $$;

-- --- the operator (migration owner only: no application role can execute these) ------------------------------------

-- Register a contribution runtime for one project at the connection's current credential revision. With p_rotate
-- (or on first registration) the credential revision advances and every older runtime of the connection drains.
-- The capability's SHA-256 only; the key itself stays in the runtime host's environment under the route's reference.
CREATE FUNCTION sophia.register_contribution_runtime(p_project uuid, p_connection uuid, p_runtime_unit text, p_token_sha256 bytea,
 p_rotate boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE conn sophia.api_connections; link sophia.api_contribution_runtimes; res uuid; rid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sophia.projects WHERE id=p_project) THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='22023'; END IF;
 -- This project and every project a rotation may fence, in id order, then the connection.
 conn:=sophia.contribution_lock_connection(p_connection,p_project);
 IF conn.id IS NULL OR conn.state='revoked' THEN RAISE EXCEPTION 'The connection is missing or revoked' USING ERRCODE='22023'; END IF;
 IF NOT sophia.contribution_member(p_project,conn.owner_id,false) THEN
  RAISE EXCEPTION 'The contribution owner must be a project member' USING ERRCODE='22023'; END IF;
 IF p_token_sha256 IS NULL OR length(p_token_sha256)<>32 THEN RAISE EXCEPTION 'Invalid capability hash' USING ERRCODE='22023'; END IF;
 IF coalesce(p_rotate,false) OR conn.credential_revision=0 THEN
  UPDATE sophia.api_contribution_runtimes SET state='draining' WHERE connection_id=conn.id AND state='current';
  UPDATE sophia.api_connections SET credential_revision=credential_revision+1, revision=revision+1,
   state=CASE WHEN state='draft' THEN 'connected' ELSE state END, updated_at=now()
   WHERE id=conn.id RETURNING * INTO conn;
 END IF;
 SELECT * INTO link FROM sophia.api_contribution_runtimes
  WHERE project_id=p_project AND connection_id=conn.id AND credential_revision=conn.credential_revision FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO sophia.executor_resources(project_id,owner_id,harness,label,repository_root,state)
  VALUES(p_project,conn.owner_id,'dsh',left('API contribution: '||conn.label,120),'project-workspace','active') RETURNING id INTO res;
 ELSE res:=link.resource_id;
 END IF;
 UPDATE sophia.runtime_instances SET state='revoked', revoked_at=now()
  WHERE project_id=p_project AND resource_id=res AND runtime_unit_id=p_runtime_unit AND state='active';
 INSERT INTO sophia.runtime_instances(project_id,resource_id,runtime_unit_id,token_sha256) VALUES(p_project,res,p_runtime_unit,p_token_sha256)
  RETURNING id INTO rid;
 INSERT INTO sophia.api_contribution_runtimes(project_id,resource_id,runtime_id,connection_id,credential_revision)
 VALUES(p_project,res,rid,conn.id,conn.credential_revision)
 ON CONFLICT (project_id,resource_id) DO UPDATE SET runtime_id=EXCLUDED.runtime_id;
 RETURN jsonb_build_object('runtimeId',rid,'resourceId',res,'credentialRevision',conn.credential_revision,'connectionState',conn.state);
END $$;

-- Retire a drained runtime's capability. Its unresolved commitments stay counted; nothing is settled by retiring.
CREATE FUNCTION sophia.retire_contribution_runtime(p_project uuid, p_resource uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE link sophia.api_contribution_runtimes; open_count integer;
BEGIN
 SELECT * INTO link FROM sophia.api_contribution_runtimes WHERE project_id=p_project AND resource_id=p_resource FOR UPDATE;
 IF NOT FOUND OR link.state<>'draining' THEN RAISE EXCEPTION 'Only a drained contribution runtime is retired' USING ERRCODE='22023'; END IF;
 UPDATE sophia.runtime_instances SET state='revoked', revoked_at=now() WHERE project_id=p_project AND resource_id=p_resource AND state='active';
 SELECT count(*) INTO open_count FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r
  ON r.project_id=x.project_id AND r.id=x.reservation_id JOIN sophia.api_contribution_tasks t ON t.project_id=x.project_id AND t.job_id=x.job_id
  WHERE t.project_id=p_project AND t.resource_id=p_resource AND r.state IN ('reserved','uncertain');
 RETURN jsonb_build_object('resourceId',p_resource,'unresolvedReservations',open_count);
END $$;

CREATE FUNCTION sophia.qualify_api_route(p_route text, p_model text, p_effort text, p_evidence_ref text, p_expires_at timestamptz)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 INSERT INTO sophia.api_route_qualifications(route_id,model,effort,evidence_ref,expires_at) VALUES(p_route,p_model,p_effort,p_evidence_ref,p_expires_at)
 RETURNING id $$;

CREATE FUNCTION sophia.revoke_api_route_qualification(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 UPDATE sophia.api_route_qualifications SET revoked_at=coalesce(revoked_at,now()) WHERE id=p_id $$;

-- --- the HTTP boundary's writes: one idempotent entry (S5b) --------------------------------------------------------
-- Every HTTP write goes through api_contribution_write(operation, key, request). Its ledger is keyed by the actor, the
-- operation, its target and the caller's Idempotency-Key, and holds the request's semantic hash and its receipt only:
-- never the request body or any key value. The ledger row is the first lock taken, before the operation's own
-- project, grant, connection and account order. A concurrent duplicate waits on it, then replays; a rollback leaves
-- nothing. The functions it calls are the ones above, unchanged; they decide authority under their own locks.
CREATE TABLE sophia.api_contribution_requests (
 actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('account_create','account_update','connection_create','connection_state',
  'grant_create','grant_update','grant_state','admin_disable','admin_lift','admin_narrow','pin_set','pin_clear')),
 target text NOT NULL CHECK(length(target)<=80),
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 160),
 semantic_sha256 bytea NOT NULL CHECK(length(semantic_sha256)=32),
 receipt jsonb CHECK(receipt IS NULL OR jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id, operation, target, request_key)
);
ALTER TABLE sophia.api_contribution_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.api_contribution_requests FROM PUBLIC;

-- A request field that must be a UUID, or a 22023 refusal (never a cast error that would read as an outage).
CREATE FUNCTION sophia.contribution_request_uuid(p jsonb, k text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p->k) IS DISTINCT FROM 'string'
    OR (p->>k) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Invalid request: % is not an id', k USING ERRCODE='22023'; END IF;
 RETURN (p->>k)::uuid;
END $$;

-- One spelling for an accepted UUID (r2). A48's `format: uuid` (ajv-formats) accepts the 8-4-4-4-12 hex form in any case,
-- optionally prefixed `urn:uuid:`. Such a string becomes lowercase hex without the prefix; any other value is returned as
-- sent, so the strict checks after it still refuse it (never a cast: PostgreSQL's uuid input accepts more than A48).
CREATE FUNCTION sophia.contribution_uuid_spelling(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN jsonb_typeof(v)='string'
   AND (v#>>'{}') ~* '^(urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN to_jsonb(lower(right(v#>>'{}',36))) ELSE v END $$;

-- The request with each accepted UUID in that one spelling (r2): the scalar ids, and the eligibleActors items of the
-- settings the operation carries, in their order. No other field, text or array is read or changed.
CREATE FUNCTION sophia.contribution_request_canonical(p_operation text, p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
DECLARE k text; s text;
BEGIN
 FOREACH k IN ARRAY ARRAY['accountId','connectionId','projectId','grantId'] LOOP
  IF p ? k THEN p:=jsonb_set(p,ARRAY[k],sophia.contribution_uuid_spelling(p->k)); END IF;
 END LOOP;
 s:=CASE WHEN p_operation IN ('grant_create','grant_update') THEN 'settings' WHEN p_operation='admin_narrow' THEN 'patch' END;
 IF s IS NOT NULL AND jsonb_typeof(p->s)='object' AND jsonb_typeof(p->s->'eligibleActors')='array' THEN
  p:=jsonb_set(p,ARRAY[s,'eligibleActors'],(SELECT coalesce(jsonb_agg(sophia.contribution_uuid_spelling(e.x) ORDER BY e.i),'[]')
   FROM jsonb_array_elements(p->s->'eligibleActors') WITH ORDINALITY AS e(x,i)));
 END IF;
 RETURN p;
END $$;

-- A request field that must be a positive whole revision, or a 22023 refusal.
CREATE FUNCTION sophia.contribution_request_revision(p jsonb) RETURNS bigint LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number' OR (p->>'expectedRevision') !~ '^[1-9][0-9]{0,15}$' THEN
  RAISE EXCEPTION 'Invalid request: expectedRevision' USING ERRCODE='22023'; END IF;
 RETURN (p->>'expectedRevision')::bigint;
END $$;

-- The current authority a replay needs before it may return a stored receipt: what the operation itself requires.
CREATE FUNCTION sophia.contribution_replay_allowed(p_operation text, p jsonb, p_receipt jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); gr sophia.api_contribution_grants;
BEGIN
 IF a IS NULL THEN RETURN false; END IF;
 CASE p_operation
 WHEN 'account_create' THEN
  RETURN EXISTS(SELECT 1 FROM sophia.api_accounts WHERE id=(p_receipt->>'accountId')::uuid AND owner_id=a);
 WHEN 'account_update', 'connection_create' THEN
  RETURN EXISTS(SELECT 1 FROM sophia.api_accounts WHERE id=(p->>'accountId')::uuid AND owner_id=a);
 WHEN 'connection_state' THEN
  RETURN EXISTS(SELECT 1 FROM sophia.api_connections WHERE id=(p->>'connectionId')::uuid AND owner_id=a);
 WHEN 'grant_create' THEN
  RETURN EXISTS(SELECT 1 FROM sophia.api_connections WHERE id=(p->>'connectionId')::uuid AND owner_id=a)
   AND sophia.contribution_member((p->>'projectId')::uuid,a,false);
 WHEN 'grant_update', 'grant_state' THEN
  RETURN EXISTS(SELECT 1 FROM sophia.api_contribution_grants WHERE id=(p->>'grantId')::uuid AND owner_id=a);
 WHEN 'admin_disable', 'admin_lift', 'admin_narrow' THEN
  SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=(p->>'grantId')::uuid;
  RETURN FOUND AND EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=gr.project_id AND m.actor_id=a
   AND m.active AND m.role='admin');
 WHEN 'pin_set', 'pin_clear' THEN
  RETURN sophia.contribution_member((p->>'projectId')::uuid,a,true);
 ELSE RETURN false;
 END CASE;
END $$;

-- The one HTTP write. Exact fields per operation; the actor is derived; a key replays its first receipt only for the same
-- request and only while the actor still has the operation's authority; another request under the key is a conflict.
CREATE FUNCTION sophia.api_contribution_write(p_operation text, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); allowed text[]; required text[]; k text; v_target text; h bytea;
 r sophia.api_contribution_requests; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid request: Idempotency-Key' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 -- r2: one spelling per accepted UUID before the target, the authority check, the hash and the call read the request.
 p_request:=sophia.contribution_request_canonical(p_operation,p_request);
 CASE p_operation
 WHEN 'account_create' THEN required:='{label,totalCapUsd}'; allowed:='{label,totalCapUsd,concurrency,provenance,separateOwnershipNote}';
 WHEN 'account_update' THEN required:='{accountId,expectedRevision,patch}'; allowed:=required;
 WHEN 'connection_create' THEN required:='{accountId,label,custodianLabel}'; allowed:=required;
 WHEN 'connection_state' THEN required:='{connectionId,expectedRevision,state}'; allowed:=required;
 WHEN 'grant_create' THEN required:='{connectionId,projectId,settings}'; allowed:=required;
 WHEN 'grant_update' THEN required:='{grantId,expectedRevision,settings}'; allowed:=required;
 WHEN 'grant_state' THEN required:='{grantId,expectedRevision,state}'; allowed:=required;
 WHEN 'admin_disable' THEN required:='{grantId,expectedRevision,reason}'; allowed:=required;
 WHEN 'admin_lift' THEN required:='{grantId,expectedRevision}'; allowed:=required;
 WHEN 'admin_narrow' THEN required:='{grantId,expectedRevision,patch}'; allowed:=required;
 WHEN 'pin_set' THEN required:='{projectId,grantId,expectedRevision}'; allowed:=required;
 WHEN 'pin_clear' THEN required:='{projectId}'; allowed:=required;
 ELSE RAISE EXCEPTION 'Invalid request: unknown operation' USING ERRCODE='22023';
 END CASE;
 FOR k IN SELECT jsonb_object_keys(p_request) LOOP
  IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'Invalid request: unknown field %', k USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT p_request ?& required THEN RAISE EXCEPTION 'Invalid request: a required field is missing' USING ERRCODE='22023'; END IF;
 IF p_operation='account_create' AND (jsonb_typeof(p_request->'totalCapUsd') IS DISTINCT FROM 'number'
    OR (p_request ? 'concurrency' AND coalesce((p_request->>'concurrency') !~ '^[0-9]{1,4}$',true))) THEN
  RAISE EXCEPTION 'Invalid request: totalCapUsd or concurrency' USING ERRCODE='22023'; END IF;
 v_target:=CASE p_operation
  WHEN 'account_create' THEN ''
  WHEN 'account_update' THEN sophia.contribution_request_uuid(p_request,'accountId')::text
  WHEN 'connection_create' THEN sophia.contribution_request_uuid(p_request,'accountId')::text
  WHEN 'connection_state' THEN sophia.contribution_request_uuid(p_request,'connectionId')::text
  WHEN 'grant_create' THEN sophia.contribution_request_uuid(p_request,'connectionId')::text||':'||sophia.contribution_request_uuid(p_request,'projectId')::text
  WHEN 'pin_set' THEN sophia.contribution_request_uuid(p_request,'projectId')::text
  WHEN 'pin_clear' THEN sophia.contribution_request_uuid(p_request,'projectId')::text
  ELSE sophia.contribution_request_uuid(p_request,'grantId')::text END;
 h:=sha256(convert_to(p_operation||'|'||v_target||'|'||p_request::text,'UTF8'));
 -- The ledger row first: a concurrent duplicate waits here, then sees the committed row and replays.
 INSERT INTO sophia.api_contribution_requests(actor_id,operation,target,request_key,semantic_sha256)
 VALUES(a,p_operation,v_target,p_key,h) ON CONFLICT DO NOTHING RETURNING * INTO r;
 IF NOT FOUND THEN
  SELECT * INTO r FROM sophia.api_contribution_requests WHERE actor_id=a AND operation=p_operation AND target=v_target AND request_key=p_key;
  IF r.semantic_sha256<>h THEN
   RAISE EXCEPTION 'Idempotency key reused for another request' USING ERRCODE='23505'; END IF;
  -- A replay is answered only under the operation's current authority: no stored receipt bypasses a revocation.
  IF NOT sophia.contribution_replay_allowed(p_operation,p_request,r.receipt) THEN
   RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN r.receipt;
 END IF;
 out:=CASE p_operation
  WHEN 'account_create' THEN sophia.api_account_create(p_request->>'label',(p_request->>'totalCapUsd')::numeric,
   coalesce((p_request->>'concurrency')::integer,1),coalesce(p_request->>'provenance','owner_declared'),p_request->>'separateOwnershipNote')
  WHEN 'account_update' THEN sophia.api_account_update(v_target::uuid,sophia.contribution_request_revision(p_request),p_request->'patch')
  WHEN 'connection_create' THEN sophia.api_connection_create(v_target::uuid,p_request->>'label',p_request->>'custodianLabel')
  WHEN 'connection_state' THEN sophia.api_connection_set_state(v_target::uuid,sophia.contribution_request_revision(p_request),p_request->>'state')
  WHEN 'grant_create' THEN sophia.api_grant_create(sophia.contribution_request_uuid(p_request,'connectionId'),
   sophia.contribution_request_uuid(p_request,'projectId'),p_request->'settings')
  WHEN 'grant_update' THEN sophia.api_grant_update(v_target::uuid,sophia.contribution_request_revision(p_request),p_request->'settings')
  WHEN 'grant_state' THEN sophia.api_grant_set_state(v_target::uuid,sophia.contribution_request_revision(p_request),p_request->>'state')
  WHEN 'admin_disable' THEN sophia.api_grant_admin_disable(v_target::uuid,sophia.contribution_request_revision(p_request),p_request->>'reason')
  WHEN 'admin_lift' THEN sophia.api_grant_admin_lift(v_target::uuid,sophia.contribution_request_revision(p_request))
  WHEN 'admin_narrow' THEN sophia.api_grant_admin_narrow(v_target::uuid,sophia.contribution_request_revision(p_request),p_request->'patch')
  WHEN 'pin_set' THEN sophia.research_funding_pin_set(v_target::uuid,sophia.contribution_request_uuid(p_request,'grantId'),
   sophia.contribution_request_revision(p_request))
  WHEN 'pin_clear' THEN sophia.research_funding_pin_clear(v_target::uuid) END;
 UPDATE sophia.api_contribution_requests SET receipt=out
  WHERE actor_id=a AND operation=p_operation AND target=v_target AND request_key=p_key;
 RETURN out;
END $$;

-- --- replaced functions: each its latest definition, unchanged except the lines marked 0094 ----------------------

-- runtime_unavailable: from 0012_runtime_service.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.runtime_unavailable(rt sophia.runtime_instances) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN rt.lease_id IS NULL OR rt.seen_at IS NULL THEN 'waiting for Sophia''s runtime to connect'
  WHEN rt.ready_state<>'ready' THEN 'waiting for Sophia''s runtime to report ready'
  WHEN rt.seen_at<now()-interval '90 seconds' THEN 'waiting for Sophia''s runtime to reconnect'
  -- 0094: a contribution runtime takes new work only under its contribution's current authority (dispatch reads this).
  WHEN sophia.contribution_wait_reason(rt) IS NOT NULL THEN sophia.contribution_wait_reason(rt)
  ELSE NULL END $$;

-- defer_native_delivery: from 0012_runtime_service.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.defer_native_delivery(o sophia.outbox, c sophia.commands, p_reason text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs; why text;
BEGIN
 -- 0094: a contributed delivery its current authority no longer permits is denied, never left waiting on a slot.
 why:=sophia.contribution_delivery_ineligible(o,(SELECT b FROM sophia.execution_bindings b WHERE b.project_id=o.project_id AND b.id=o.binding_id));
 IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
 UPDATE sophia.outbox SET state='pending', lease_owner=NULL, lease_token=NULL, lease_until=NULL,
  available_at=now()+interval '5 seconds', outcome_reason=left(p_reason,2000) WHERE project_id=o.project_id AND id=o.id;
 UPDATE sophia.jobs SET reason=left(p_reason,2000)
  WHERE project_id=o.project_id AND command_id=c.id AND state='pending' AND reason IS DISTINCT FROM left(p_reason,2000) RETURNING * INTO j;
 IF j.id IS NOT NULL THEN PERFORM sophia.emit_service_event(o.project_id,'native_task.waiting','job',j.id,1,'native_task.waiting'); END IF;
 RETURN jsonb_build_object('result','deferred','reason',p_reason);
END $$;

-- register_runtime: from 0012_runtime_service.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.register_runtime(p_project uuid, p_owner uuid, p_runtime_unit text, p_token_sha256 bytea, p_label text DEFAULT 'Sophia runtime (dsh)')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE res uuid; rid uuid;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=p_owner AND active AND role='admin') THEN
  RAISE EXCEPTION 'The runtime owner must be an admin of the project' USING ERRCODE='22023'; END IF;
 SELECT id INTO res FROM sophia.executor_resources WHERE project_id=p_project AND harness='dsh' AND state='active'
  AND NOT sophia.contribution_resource(p_project,id) ORDER BY id LIMIT 1;
 IF res IS NULL THEN
  INSERT INTO sophia.executor_resources(project_id,owner_id,harness,label,repository_root,state)
  VALUES(p_project,p_owner,'dsh',p_label,'project-workspace','active') RETURNING id INTO res;
 END IF;
 UPDATE sophia.runtime_instances SET state='revoked', revoked_at=now()
  WHERE project_id=p_project AND resource_id=res AND runtime_unit_id=p_runtime_unit AND state='active';
 INSERT INTO sophia.runtime_instances(project_id,resource_id,runtime_unit_id,token_sha256) VALUES(p_project,res,p_runtime_unit,p_token_sha256)
  RETURNING id INTO rid;
 RETURN rid;
END $$;

-- role_runtime: from 0039_design_runtime.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.role_runtime(p_project uuid, p_role text, p_route text) RETURNS sophia.runtime_instances LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.* FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL
 AND NOT sophia.contribution_resource(r.project_id,r.resource_id)
 ORDER BY r.seen_at DESC LIMIT 1 $$;

-- work_runtime: from 0042_source_review_coordination.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.work_runtime(p_project uuid, p_role text, p_route text) RETURNS sophia.runtime_instances LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.* FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route))
  AND NOT sophia.contribution_resource(r.project_id,r.resource_id)
  ORDER BY (sophia.runtime_unavailable(r) IS NULL) DESC, r.seen_at DESC NULLS LAST LIMIT 1 $$;

-- source_review_availability: from 0083_source_review_html_renditions.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.source_review_availability(p_project uuid, p_role text, p_route text) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cg sophia.coordination_grants; rg sophia.research_grants; reason text; ready boolean;
 cap bigint:=(sophia.source_review_limits()->>'maxInputBytes')::bigint;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=p_project;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 ready:=EXISTS(SELECT 1 FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL AND NOT sophia.contribution_resource(r.project_id,r.resource_id));
 reason:=CASE WHEN cg.project_id IS NULL OR cg.state<>'enabled' THEN 'Source review is not enabled for this project.'
  WHEN rg.project_id IS NULL OR rg.state<>'enabled' THEN 'This project has no spend authority for reviews.'
  WHEN NOT sophia.can_edit(p_project) THEN 'Only members who can edit start reviews.' END;
 RETURN jsonb_build_object('enabled',reason IS NULL,'reason',reason,'runtimeReady',ready,
  'maxAllowanceUsd',CASE WHEN reason IS NULL THEN least(cg.review_cap_usd,rg.task_cap_usd) END,'limits',sophia.source_review_limits(),
  -- What the entry offers to review: the sources report versions carry (their text, and a published HTML page),
  -- each once, newest first. Manifests, drafts and other internal sources are not offered.
  'sources',(WITH carried AS (
   -- What each offerable report version carries: its own text, and the HTML page a design published for it.
   SELECT 'text' AS kind, v.source_id, v.source_id AS version_source_id, v.id AS version_id, v.version_number, v.created_at, a.title
    FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
    WHERE v.project_id=p_project AND v.state IN ('stable','superseded','validated')
   UNION ALL
   SELECT 'html', r.source_id, v.source_id, v.id, v.version_number, v.created_at, a.title
    FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
     JOIN sophia.artifact_renditions r ON r.project_id=v.project_id AND r.artifact_version_id=v.id AND r.format='html'
    WHERE v.project_id=p_project AND v.state IN ('stable','superseded','validated')),
  sources AS (
   -- Each readable source once: the newest version that carries it names it, with every version number that does.
   SELECT c.source_id, (array_agg(c.kind ORDER BY c.created_at DESC, c.version_id))[1] AS kind,
    (array_agg(c.title ORDER BY c.created_at DESC, c.version_id))[1] AS title,
    array_agg(DISTINCT c.version_number ORDER BY c.version_number) FILTER (WHERE c.version_number IS NOT NULL) AS numbers,
    array_agg(DISTINCT c.version_source_id) AS cites_from, max(c.created_at) AS created_at
   FROM carried c JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=c.source_id
   WHERE s.byte_length<=cap AND sophia.review_source_readable(p_project,c.source_id)
   GROUP BY c.source_id),
  offered AS (
   SELECT o.source_id, o.kind, o.title, o.numbers, o.cites_from, o.created_at, s.mime, s.byte_length
   FROM sources o JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=o.source_id
   ORDER BY o.created_at DESC, o.kind='html' DESC, o.source_id LIMIT 50)
  SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') FROM (
   SELECT jsonb_build_object('sourceId',o.source_id,
    'label',left(o.title||CASE coalesce(cardinality(o.numbers),0) WHEN 0 THEN '' WHEN 1 THEN ' · version '||o.numbers[1]
      ELSE ' · versions '||array_to_string(o.numbers,', ') END,CASE o.kind WHEN 'html' THEN 188 ELSE 200 END)
     ||CASE o.kind WHEN 'html' THEN ' · HTML page' ELSE '' END,'mime',o.mime,
    'byteLength',o.byte_length,'createdAt',to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    -- A43: the sources the versions it represents cite, as recorded, that the caller and a review may read now.
    'supporting',(SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',c.id,'label',c.label,'mime',c.mime,'byteLength',c.byte_length)
       ORDER BY c.label, c.id),'[]') FROM (
      SELECT d.source_id AS id, cs.mime, cs.byte_length,
       left(coalesce(
        (SELECT 'Project note · '||replace(me.kind,'_',' ') FROM sophia.mission_entries me
          WHERE me.project_id=p_project AND me.source_id=d.source_id ORDER BY me.recorded_at DESC LIMIT 1),
        -- A page's host, and only a host: the whole authority (up to the first /, ? or #) must be a DNS name, with at
        -- most a port, which is dropped. A user or password (an @), a bracketed or malformed authority, or no URL at
        -- all gives the neutral label: a stored reported URL is not checked for its authority (R2-482-R1).
        (SELECT CASE sp.kind WHEN 'web_read' THEN 'Web page'||coalesce(' · '||lower(substring(
            substring(coalesce(sp.reported_final_url,sp.requested_url) FROM '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)')
            FROM '^([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)(?::[0-9]{1,5})?$')),'')
           WHEN 'search_results' THEN 'Search results' ELSE 'Admitted input' END
          FROM sophia.source_provenance sp WHERE sp.project_id=p_project AND sp.source_id=d.source_id),
        (SELECT 'Research question' FROM sophia.research_tasks q WHERE q.project_id=p_project AND q.question_source_id=d.source_id LIMIT 1),
        'Cited source'),200) AS label
      FROM sophia.source_dependencies d
       JOIN sophia.source_objects cs ON cs.project_id=d.project_id AND cs.id=d.source_id
      WHERE d.project_id=p_project AND d.derived_source_id=ANY(o.cites_from) AND d.source_id<>o.source_id
       AND d.source_id<>ALL(o.cites_from)
       -- Readable by the caller now: eligible_sources_read, restated (a member; a released project source), not its
       -- owner's private one.
       AND sophia.is_member(p_project) AND cs.scope='project' AND cs.eligible AND cs.state='ready'
       -- And by a review: with text, nothing it draws on withdrawn, within what a review reads.
       AND sophia.review_source_readable(p_project,d.source_id) AND cs.byte_length<=cap
       -- A cited report version: not again when the offer returns it; listed when the bound leaves it out; never one
       -- the offer does not show (a candidate or a rejected version).
       AND NOT EXISTS(SELECT 1 FROM offered r WHERE r.source_id=d.source_id)
       AND (NOT EXISTS(SELECT 1 FROM sophia.artifact_versions av WHERE av.project_id=p_project AND av.source_id=d.source_id)
        OR EXISTS(SELECT 1 FROM sophia.artifact_versions av WHERE av.project_id=p_project AND av.source_id=d.source_id
         AND av.state IN ('stable','superseded','validated')))
      ORDER BY label, d.source_id LIMIT 50) c)) AS x,
    row_number() OVER (ORDER BY o.created_at DESC, o.kind='html' DESC, o.source_id) AS n
   FROM offered o) q));
END $$;

-- admit_native_task: from 0016_review_fences.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.admit_native_task(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; prior sophia.commands; semantic jsonb; rt sophia.runtime_instances;
 instruction_text text:=p_request->>'instruction'; inputs uuid[]; instr sophia.source_objects; manifest jsonb; ctx sophia.source_objects;
 goal uuid:=gen_random_uuid(); att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 cursor_value bigint; receipt_value jsonb; bad uuid;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'draft_brief' THEN RAISE EXCEPTION 'Unsupported native task kind' USING ERRCODE='22023'; END IF;
 IF instruction_text IS NULL OR length(btrim(instruction_text)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid instruction' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(v::uuid ORDER BY o),'{}') INTO inputs FROM jsonb_array_elements_text(coalesce(p_request->'contributionIds','[]')) WITH ORDINALITY AS e(v,o);
 IF cardinality(inputs)>8 THEN RAISE EXCEPTION 'At most 8 inputs' USING ERRCODE='22023'; END IF;
 -- Lock order: project first; authority is checked again under the lock.
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','draft_brief','instruction',encode(sha256(convert_to(instruction_text,'UTF8')),'hex'),
  'contributionIds',to_jsonb(inputs),'expectedMissionRevision',p_request->'expectedMissionRevision');
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF pr.mission_revision IS DISTINCT FROM (p_request->>'expectedMissionRevision')::bigint THEN
  RAISE EXCEPTION 'Stale mission revision' USING ERRCODE='40001'; END IF;
 SELECT x.cid INTO bad FROM unnest(inputs) AS x(cid) WHERE NOT EXISTS(
  SELECT 1 FROM sophia.contributions c JOIN sophia.source_objects s ON s.project_id=c.project_id AND s.id=c.source_id
   WHERE c.project_id=p_project AND c.id=x.cid AND s.scope='project' AND s.eligible AND s.state='ready') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND state='active'
  AND NOT sophia.contribution_resource(project_id,resource_id) ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No native runtime is registered for this project' USING ERRCODE='55000'; END IF;
 instr:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',instruction_text);
 manifest:=sophia.compile_brief_manifest(p_project,instr,instruction_text,inputs);
 ctx:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,instr.id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,c.source_id,ctx.id FROM sophia.contributions c WHERE c.project_id=p_project AND c.id=ANY(inputs) ON CONFLICT DO NOTHING;
 -- Each accepted decision the manifest carries is a dependency too: if its source is blocked or deleted before
 -- dispatch, the delivery is denied as for any other input.
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,(d->>'sourceId')::uuid,ctx.id FROM jsonb_array_elements(manifest->'facts'->'acceptedDecisions') AS d
  ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
 VALUES(p_project,goal,'Draft an implementation brief',
  'A candidate implementation brief the team can review, drafted by the dsh runtime from the chosen inputs',
  jsonb_build_array(jsonb_build_object('id','brief-sections','description',
   'Intended outcome, retained decisions, proposed next implementation step, open questions and cited input ids',
   'required',true,'verification','human_review')),pr.mission_revision,'ready');
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,goal,1,1,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,rt.resource_id,'sophia-'||att,rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,goal,1,1,'native_task',p_key,semantic,instr.id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state) VALUES(p_project,job,'draft_brief',ctx.id,cmd,att,'pending');
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,goal,1);
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.draft_brief',
  jsonb_build_array(goal,cmd,ctx.id));
 receipt_value:=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',goal,'attemptId',att,'projectId',p_project,'kind','draft_brief',
  'stage','admitted','cursor',cursor_value::text,'goalRevision',1,'authorityEpoch',1,'contextSourceId',ctx.id);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

-- reserve_research: from 0029_research_spend_bounds.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.reserve_research(p_project uuid, p_allowance uuid, p_key text, p_kind text, p_provider text,
  p_amount numeric, p_purpose text DEFAULT 'call')
RETURNS sophia.research_reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.research_grants; a sophia.research_allowances; r sophia.research_reservations; committed numeric; n integer;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'A reservation is a positive amount' USING ERRCODE='22023'; END IF;
 IF p_purpose IS NULL OR p_purpose NOT IN ('call','partial_result') THEN
  RAISE EXCEPTION 'Unknown reservation purpose' USING ERRCODE='22023'; END IF;
 IF p_purpose='partial_result' AND p_kind IS DISTINCT FROM 'model' THEN
  RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.research_grants WHERE project_id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=p_project AND id=p_allowance FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research allowance not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND allowance_id=p_allowance AND reservation_key=p_key;
 IF FOUND THEN
  IF r.kind<>p_kind OR r.provider<>p_provider OR r.reserved_usd<>p_amount OR r.purpose<>p_purpose THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
  RETURN r;
 END IF;
 IF g.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 IF a.overrun_usd>a.reconciled_overrun_usd THEN
  RAISE EXCEPTION 'Research allowance overrun: a call cost more than it reserved; nothing more until it is reconciled'
   USING ERRCODE='55000'; END IF;
 IF p_kind IN ('search','read') THEN
  SELECT count(*) INTO n FROM sophia.research_reservations
   WHERE project_id=p_project AND allowance_id=p_allowance AND kind=p_kind AND state<>'released';
  IF n>=(CASE p_kind WHEN 'search' THEN a.max_searches ELSE a.max_reads END) THEN
   RAISE EXCEPTION 'Research source policy limit reached: %', p_kind USING ERRCODE='55000'; END IF;
 END IF;
 IF p_purpose='partial_result' AND EXISTS(SELECT 1 FROM sophia.research_reservations
   WHERE project_id=p_project AND allowance_id=p_allowance AND purpose='partial_result' AND state='reserved') THEN
  RAISE EXCEPTION 'A partial-result call is already in flight' USING ERRCODE='55000'; END IF;
 committed:=a.reserved_usd+a.spent_usd+a.uncertain_usd;
 IF committed+p_amount>a.cap_usd-(CASE WHEN p_purpose='partial_result' THEN 0 ELSE a.headroom_usd END) THEN
  RAISE EXCEPTION 'Research allowance exhausted' USING ERRCODE='55000'; END IF;
 SELECT coalesce(sum(x.reserved_usd+x.spent_usd+x.uncertain_usd),0) INTO committed
  FROM sophia.research_allowances x WHERE x.project_id=p_project;
 -- 0094: the project does not pay for a contributed model call; it is bounded by the owner's grant and account instead.
 committed:=committed-sophia.contribution_project_committed(p_project);
 IF committed+(CASE WHEN p_kind='model' AND sophia.contribution_allowance(p_project,p_allowance) THEN 0 ELSE p_amount END)>g.total_cap_usd THEN RAISE EXCEPTION 'Research grant exhausted' USING ERRCODE='55000'; END IF;
 INSERT INTO sophia.research_reservations(project_id,allowance_id,reservation_key,kind,provider,purpose,reserved_usd)
 VALUES(p_project,p_allowance,p_key,p_kind,p_provider,p_purpose,p_amount) RETURNING * INTO r;
 UPDATE sophia.research_allowances SET reserved_usd=reserved_usd+p_amount WHERE project_id=p_project AND id=p_allowance;
 RETURN r;
END $$;

-- runtime_research_reserve: from 0029_research_spend_bounds.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.runtime_research_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 k text:=p_request->>'kind'; key text; ref text:=p_request->>'targetRef'; url text; q text:=p_request->>'query';
 purpose text:=coalesce(p_request->>'purpose','call'); amount numeric; a sophia.research_allowances; t sophia.research_tasks;
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 IF k='read' THEN
  url:=sophia.research_target_url(s,ref);
  IF url IS NULL THEN RAISE EXCEPTION 'Read target not found' USING ERRCODE='22023'; END IF;
 ELSIF ref IS NOT NULL THEN RAISE EXCEPTION 'Only a read names a target' USING ERRCODE='22023';
 END IF;
 IF (k='search')<>(q IS NOT NULL) OR (q IS NOT NULL AND length(btrim(q)) NOT BETWEEN 1 AND 400) THEN
  RAISE EXCEPTION 'A search names its query, and only a search' USING ERRCODE='22023'; END IF;
 amount:=(p_request->>'amountUsd')::numeric;
 -- Locks in the order the turn-end rules (0026) and revocation (0028) take them: the task, then the grant and the
 -- allowance (as reserve_research does). The phase is then read with the allowance it is judged against.
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key;
 IF FOUND THEN
  IF r.target_ref IS DISTINCT FROM ref OR r.query IS DISTINCT FROM q THEN
   RAISE EXCEPTION 'Idempotency key reused for another reservation' USING ERRCODE='23505'; END IF;
 ELSE
  IF purpose='partial_result' THEN
   IF k IS DISTINCT FROM 'model' THEN RAISE EXCEPTION 'Only a model call writes the partial result' USING ERRCODE='22023'; END IF;
   -- The trusted transition: the finalize step begins only when an ordinary call of this size no longer fits.
   IF t.finalizing_at IS NULL AND amount>0
     AND a.reserved_usd+a.spent_usd+a.uncertain_usd+amount<=a.cap_usd-a.headroom_usd THEN
    RAISE EXCEPTION 'A partial-result call needs the allowance spent: an ordinary call still fits' USING ERRCODE='22023'; END IF;
   IF t.finalize_calls>=4 THEN RAISE EXCEPTION 'Research finalize step has used its calls' USING ERRCODE='55000'; END IF;
   UPDATE sophia.research_tasks SET finalizing_at=coalesce(finalizing_at,now()), finalize_calls=finalize_calls+1
    WHERE project_id=s.project_id AND job_id=s.job_id;
  ELSIF t.finalizing_at IS NOT NULL THEN
   RAISE EXCEPTION 'Research is finalizing: no more searches, reads or ordinary calls' USING ERRCODE='55000';
  END IF;
 END IF;
 -- 0094: a new model call of a contributed task rechecks current authority and the owner's caps first.
 IF r.id IS NULL AND k='model' THEN PERFORM sophia.contribution_model_reserve(s,p_request->>'provider',amount); END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,k,p_request->>'provider',amount,purpose);
 PERFORM sophia.contribution_link_reservation(s,r);
 IF r.target_ref IS NULL AND r.query IS NULL AND (ref IS NOT NULL OR q IS NOT NULL) THEN
  UPDATE sophia.research_reservations SET target_ref=ref, target_url=url, query=q WHERE project_id=s.project_id AND id=r.id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,
  'target',CASE WHEN r.target_ref IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('ref',r.target_ref,'url',r.target_url) END);
END $$;

-- runtime_research_submit: from 0040_design_flow.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.runtime_research_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.research_scope:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false); t sophia.research_tasks;
 j sophia.jobs; key text; v sophia.artifact_versions; src sophia.source_objects; v_reason text:=btrim(p_request->'blocker'->>'reason');
 v_remaining text:=nullif(btrim(coalesce(p_request->'blocker'->>'remainingWork','')),''); out jsonb;
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF (p_request ? 'result')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a result or a blocker' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 SELECT * INTO t FROM sophia.research_tasks WHERE project_id=s.project_id AND job_id=s.job_id;
 IF t.closed_by_call=key THEN
  SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id;
  IF j.state='succeeded' AND p_request ? 'result' THEN
   SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND job_id=j.id ORDER BY version_number DESC LIMIT 1;
   RETURN sophia.without_null_members(jsonb_build_object('taskId',j.id,'outcome','published','artifactId',v.artifact_id,'versionId',v.id,
    'versionNumber',v.version_number,'sourceId',v.source_id,'sha256',v.source_hash,'resultSourceId',j.result_source_id,
    'notesFromFacts',coalesce((v.change_facts->>'notesFromFacts')::boolean,false),
    'pdf',CASE WHEN t.pdf_state IS NULL THEN NULL ELSE sophia.without_null_members(jsonb_build_object('state',t.pdf_state,'reason',t.pdf_reason,
     'sourceId',(SELECT r.source_id FROM sophia.artifact_renditions r WHERE r.project_id=s.project_id AND r.artifact_version_id=v.id AND r.format='pdf'),
     'renderJobId',(SELECT r.job_id FROM sophia.artifact_renditions r WHERE r.project_id=s.project_id AND r.artifact_version_id=v.id AND r.format='pdf'))) END,
    'html',CASE WHEN t.design_state IS NULL THEN NULL ELSE sophia.without_null_members(jsonb_build_object(
     'state',CASE WHEN t.design_state='not_started' THEN 'not_started' ELSE 'designing' END,
     'reason',CASE WHEN t.design_state='not_started' THEN t.design_reason END,'taskId',t.design_job_id)) END));
  ELSIF j.state='failed' AND p_request ? 'result' AND j.reason LIKE 'withheld: %' THEN
   RETURN jsonb_build_object('taskId',j.id,'outcome','withheld','reason',substr(j.reason,11));
  ELSIF j.state='failed' AND p_request ? 'blocker' THEN
   RETURN jsonb_build_object('taskId',j.id,'outcome','blocked','resultSourceId',j.result_source_id);
  END IF;
  RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505';
 END IF;
 IF t.closed_by_call IS NOT NULL THEN RAISE EXCEPTION 'The research task has already ended' USING ERRCODE='40001'; END IF;
 s:=sophia.research_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 IF p_request ? 'result' THEN
  -- 0094: a contributed result is published only under current authority; otherwise it is withheld, not published.
  out:=sophia.contribution_withhold(s,key);
  IF out IS NOT NULL THEN RETURN out; END IF;
  IF t.finalizing_at IS NULL AND EXISTS(SELECT 1 FROM sophia.render_jobs r JOIN sophia.jobs rj ON rj.project_id=r.project_id AND rj.id=r.job_id
    WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND rj.state IN ('pending','running') AND r.created_at>now()-interval '10 minutes') THEN
   RAISE EXCEPTION 'A PDF render of this task is still running: wait for its result, then submit' USING ERRCODE='40001'; END IF;
  UPDATE sophia.jobs rj SET state='cancelled', lease_until=NULL, reason='cancelled: the report was submitted while the PDF was still rendering'
   FROM sophia.render_jobs r WHERE r.project_id=s.project_id AND r.parent_job_id=s.job_id AND rj.project_id=r.project_id AND rj.id=r.job_id
    AND rj.state IN ('pending','running');
  out:=sophia.research_publish(s,key,sophia.research_draft_citations(s,p_request->'result',p_request->'draftCitations'));
  IF out->>'outcome'='published' THEN
   out:=sophia.without_null_members(out||jsonb_build_object('pdf',sophia.research_attach_pdf(s,(out->>'versionId')::uuid)));
   out:=sophia.without_null_members(out||jsonb_build_object('html',sophia.design_handoff(s,(out->>'versionId')::uuid)));
  END IF;
  RETURN out;
 END IF;
 IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 500 OR length(v_remaining)>2000 THEN
  RAISE EXCEPTION 'A blocker has a reason of 1 to 500 characters and at most 2000 of remaining work' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id FOR UPDATE;
 src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8',
  'Blocked: '||v_reason||CASE WHEN v_remaining IS NULL THEN '' ELSE E'\n\nRemaining work:\n'||v_remaining END);
 UPDATE sophia.jobs SET state='failed', reason=left('blocked: '||v_reason,2000), result_source_id=src.id, result_revision=result_revision+1
  WHERE project_id=s.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.research_tasks SET closed_by_call=key WHERE project_id=s.project_id AND job_id=j.id;
 UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
 PERFORM sophia.emit_service_event(s.project_id,'native_task.failed','job',j.id,j.result_revision+3,'native_task.blocked',jsonb_build_array(src.id));
 RETURN jsonb_build_object('taskId',j.id,'outcome','blocked','resultSourceId',src.id);
END $$;

-- admit_research_task: from 0091_research_scope_review_context.sql, unchanged except the 0094 lines.
CREATE OR REPLACE FUNCTION sophia.admit_research_task(p_project uuid, p_key text, p_exchange text, p_request jsonb, p_role text, p_route text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; gr sophia.research_grants; prior sophia.commands; semantic jsonb;
 rt sophia.runtime_instances; question text:=btrim(p_request->>'question'); outputs jsonb; inputs uuid[]; urls text[];
 prefs jsonb; assumptions jsonb; amends uuid; base sophia.research_tasks; base_job sophia.jobs; g sophia.goals;
 running sophia.jobs; q sophia.source_objects; manifest jsonb; ctx sophia.source_objects; al sophia.research_allowances;
 goal uuid; att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 root uuid; cursor_value bigint; receipt_value jsonb; bad uuid; artifact jsonb;
 pin sophia.research_funding_pins; funded sophia.api_contribution_grants;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_exchange IS NOT NULL AND p_exchange !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN RAISE EXCEPTION 'Invalid exchange' USING ERRCODE='22023'; END IF;
 IF p_role IS NULL OR p_role !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$' OR p_route IS NULL OR p_route !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$' THEN
  RAISE EXCEPTION 'Invalid research specialist' USING ERRCODE='22023'; END IF;
 IF question IS NULL OR length(question) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid research question' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'outputs')<>'array' OR NOT (p_request->'outputs' ? 'markdown') OR jsonb_array_length(p_request->'outputs')>2
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'outputs') o WHERE o NOT IN ('"markdown"','"pdf"'))
  OR (SELECT count(DISTINCT o) FROM jsonb_array_elements(p_request->'outputs') o)<>jsonb_array_length(p_request->'outputs') THEN
  RAISE EXCEPTION 'Invalid research outputs' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(o ORDER BY CASE o WHEN '"markdown"' THEN 0 ELSE 1 END) INTO outputs FROM jsonb_array_elements(p_request->'outputs') o;
 SELECT coalesce(array_agg(v::uuid ORDER BY n),'{}') INTO inputs
  FROM jsonb_array_elements_text(coalesce(p_request->'inputSourceIds','[]')) WITH ORDINALITY AS e(v,n);
 IF cardinality(inputs)>8 OR cardinality(inputs)<>(SELECT count(DISTINCT x) FROM unnest(inputs) x) THEN
  RAISE EXCEPTION 'At most 8 distinct inputs' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(v ORDER BY n),'{}') INTO urls FROM jsonb_array_elements_text(coalesce(p_request->'urls','[]')) WITH ORDINALITY AS e(v,n);
 IF cardinality(urls)>8 OR EXISTS(SELECT 1 FROM unnest(urls) u WHERE length(u)>2048 OR u !~* '^https?://[^\s/?#]+[^\s]*$') THEN
  RAISE EXCEPTION 'At most 8 web addresses, each an http or https URL' USING ERRCODE='22023'; END IF;
 prefs:=jsonb_strip_nulls(jsonb_build_object('depth',p_request->'preferences'->'depth','sourceConstraints',p_request->'preferences'->'sourceConstraints'));
 IF (prefs ? 'depth' AND prefs->>'depth' NOT IN ('brief','standard','deep'))
  OR (prefs ? 'sourceConstraints' AND (jsonb_typeof(prefs->'sourceConstraints')<>'string' OR length(prefs->>'sourceConstraints') NOT BETWEEN 1 AND 500)) THEN
  RAISE EXCEPTION 'Invalid research preferences' USING ERRCODE='22023'; END IF;
 assumptions:=coalesce(p_request->'assumptions','[]');
 IF jsonb_typeof(assumptions)<>'array' OR jsonb_array_length(assumptions)>8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(assumptions) x
   WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 200) THEN
  RAISE EXCEPTION 'Invalid research assumptions' USING ERRCODE='22023'; END IF;
 amends:=nullif(p_request->>'amendsTaskId','')::uuid;
 IF amends IS NOT NULL AND coalesce((p_request->>'newRequest')::boolean,false) THEN
  RAISE EXCEPTION 'An amendment is not a new request' USING ERRCODE='22023'; END IF;

 -- Lock order: project first; authority is checked again under the lock.
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','research','question',encode(sha256(convert_to(question,'UTF8')),'hex'),'outputs',outputs,
  'inputSourceIds',to_jsonb(inputs),'urls',to_jsonb(urls),'preferences',prefs,'assumptions',assumptions,'amendsTaskId',amends,
  'newRequest',coalesce((p_request->>'newRequest')::boolean,false),'role',p_role,'route',p_route,'exchangeId',p_exchange);
 -- 0094: the requester's explicit funding pin is part of the request; without one the semantics are unchanged.
 SELECT * INTO pin FROM sophia.research_funding_pins WHERE project_id=p_project AND requester_id=a;
 IF FOUND THEN
  semantic:=semantic||jsonb_build_object('funding',jsonb_build_object('grantId',pin.grant_id,'grantRevision',pin.grant_revision));
 END IF;
 SELECT * INTO prior FROM sophia.commands WHERE project_id=p_project AND actor_id=a AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 SELECT * INTO gr FROM sophia.research_grants WHERE project_id=p_project FOR SHARE;
 IF NOT FOUND OR gr.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;

 -- The same person in the same exchange already has research under way: that task, unless this one is declared new.
 IF amends IS NULL AND NOT coalesce((p_request->>'newRequest')::boolean,false) AND p_exchange IS NOT NULL THEN
  SELECT j.* INTO running FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
   WHERE t.project_id=p_project AND t.actor_id=a AND t.exchange_id=p_exchange AND j.state IN ('pending','running','outcome_unknown')
   ORDER BY t.created_at DESC LIMIT 1;
  IF FOUND THEN
   RETURN jsonb_build_object('existingTaskId',running.id,'receipt',(SELECT receipt FROM sophia.commands WHERE project_id=p_project AND id=running.command_id));
  END IF;
 END IF;

 SELECT x INTO bad FROM unnest(inputs) x WHERE NOT EXISTS(SELECT 1 FROM sophia.source_objects s
  WHERE s.project_id=p_project AND s.id=x AND s.scope='project' AND s.eligible AND s.state='ready') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;

 IF amends IS NOT NULL THEN
  SELECT * INTO base FROM sophia.research_tasks WHERE project_id=p_project AND job_id=amends;
  IF NOT FOUND THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO base_job FROM sophia.jobs WHERE project_id=p_project AND id=amends;
  IF base_job.state IN ('pending','running','outcome_unknown') THEN
   RAISE EXCEPTION 'The research task is still under way; steer it instead' USING ERRCODE='40001'; END IF;
  -- An amendment continues the lineage it amends: the latest task of it, so two amendments of one task cannot fork it.
  IF EXISTS(SELECT 1 FROM sophia.research_tasks t WHERE t.project_id=p_project AND t.root_job_id=base.root_job_id AND t.created_at>base.created_at) THEN
   RAISE EXCEPTION 'Stale research task: a later task continues this lineage' USING ERRCODE='40001'; END IF;
  SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
   WHERE wa.project_id=p_project AND wa.id=base_job.attempt_id FOR UPDATE OF g2;
  IF g.status IN ('holding','stopping') THEN RAISE EXCEPTION 'The research goal is settling a Hold or Stop' USING ERRCODE='40001'; END IF;
  goal:=g.id; root:=base.root_job_id;
  SELECT * INTO al FROM sophia.research_allowances WHERE project_id=p_project AND id=base.allowance_id;
  IF base_job.artifact_id IS NOT NULL THEN
   SELECT jsonb_build_object('artifactId',ar.id,'versionId',v.id,'sourceId',v.source_id) INTO artifact
    FROM sophia.artifacts ar JOIN sophia.artifact_versions v ON v.project_id=ar.project_id AND v.id=ar.stable_version_id
    WHERE ar.project_id=p_project AND ar.id=base_job.artifact_id;
  END IF;
 END IF;

 IF pin.grant_id IS NOT NULL THEN
  -- 0094: pinned. Only the pinned contribution's runtime, under current authority; never the project payer.
  SELECT * INTO funded FROM sophia.contribution_admission(p_project,a,pin,p_role,p_route,outputs,base.job_id);
  rt:=sophia.contribution_admission_runtime(p_project,funded);
 ELSE
  IF base.job_id IS NOT NULL AND EXISTS(SELECT 1 FROM sophia.api_contribution_tasks x WHERE x.project_id=p_project AND x.job_id=base.job_id) THEN
   RAISE EXCEPTION 'Contribution unavailable: lineage_funding_mixed' USING ERRCODE='55000'; END IF;
  SELECT * INTO rt FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
    AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL
    AND NOT sophia.contribution_resource(r.project_id,r.resource_id)
   ORDER BY r.seen_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No research runtime is ready for this project' USING ERRCODE='55000'; END IF;
 END IF;

 q:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',question);
 manifest:=jsonb_build_object('schema','sophia.research-manifest.v1','projectId',p_project,'taskId',job,'role',p_role,'route',p_route,
  'question',question,'questionSourceId',q.id,'outputs',outputs,'preferences',prefs,'assumptions',assumptions,
  'inputs',(SELECT coalesce(jsonb_agg(jsonb_build_object('ref','input:'||s.id,'sourceId',s.id,'sha256',s.sha256,'mime',s.mime,
     'byteLength',s.byte_length) ORDER BY x.n),'[]')
   FROM unnest(inputs) WITH ORDINALITY AS x(sid,n) JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=x.sid),
  'urls',(SELECT coalesce(jsonb_agg(jsonb_build_object('ref','input:'||q.id||'#'||n,'url',u) ORDER BY n),'[]') FROM unnest(urls) WITH ORDINALITY AS x(u,n)),
  'lineage',jsonb_build_object('rootTaskId',coalesce(root,job),'amendsTaskId',amends),'base',artifact);
 ctx:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,q.id,ctx.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ctx.id FROM unnest(inputs) x ON CONFLICT DO NOTHING;
 INSERT INTO sophia.context_manifests(project_id,body_source_id,audience_revision,eligibility_revision,state)
 VALUES(p_project,ctx.id,pr.audience_revision,pr.eligibility_revision,'eligible');
 IF goal IS NULL THEN
  goal:=gen_random_uuid();
  INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
  VALUES(p_project,goal,left('Research: '||regexp_replace(question,'\s+',' ','g'),120),
   'A sourced research report in the requested formats, drafted by the dsh runtime from the sources its request authorizes',
   jsonb_build_array(jsonb_build_object('id','report-sourced','description',
    'Every claim cites a retrieved or admitted source; what the sources do not settle is stated','required',true,'verification','human_review')),
   pr.mission_revision,'ready') RETURNING * INTO g;
 ELSE
  UPDATE sophia.goals SET revision=revision+1, state_revision=state_revision+1, status='ready'
   WHERE project_id=p_project AND id=goal RETURNING * INTO g;
 END IF;
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(p_project,att,goal,g.revision,g.authority_epoch,ctx.id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(p_project,bnd,att,rt.resource_id,'sophia-'||att,rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,a,goal,g.revision,g.authority_epoch,'native_task',p_key,semantic,q.id,'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state,artifact_id)
 VALUES(p_project,job,'research',ctx.id,cmd,att,'pending',base_job.artifact_id);
 IF al.id IS NULL THEN
  al:=sophia.open_research_allowance(p_project,job,round(gr.task_cap_usd*0.1,6));
 END IF;
 INSERT INTO sophia.research_tasks(project_id,job_id,root_job_id,amends_job_id,allowance_id,actor_id,exchange_id,role,route,question_source_id,urls)
 VALUES(p_project,job,coalesce(root,job),amends,al.id,a,p_exchange,p_role,p_route,q.id,urls);
 IF funded.id IS NOT NULL THEN PERFORM sophia.contribution_bind_task(p_project,job,al.id,a,funded,rt); END IF;
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.create','binding/'||bnd,bnd,goal,g.authority_epoch);
 cursor_value:=sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.research',
  jsonb_build_array(goal,cmd,ctx.id));
 receipt_value:=jsonb_build_object('taskId',job,'commandId',cmd,'goalId',goal,'attemptId',att,'projectId',p_project,'kind','research',
  'stage','admitted','cursor',cursor_value::text,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,'contextSourceId',ctx.id);
 UPDATE sophia.commands SET receipt=receipt_value WHERE project_id=p_project AND id=cmd;
 RETURN receipt_value;
END $$;

-- --- privileges -----------------------------------------------------------------------------------------------------
-- Replaced functions keep their existing grants (CREATE OR REPLACE). Helpers are reachable only through the
-- SECURITY DEFINER functions that call them. The operator functions are migration-owner only.
REVOKE ALL ON FUNCTION sophia.contribution_resource(uuid,uuid), sophia.contribution_commit(sophia.research_reservations),
 sophia.contribution_project_committed(uuid), sophia.contribution_slots_held(uuid,uuid), sophia.contribution_member(uuid,uuid,boolean),
 sophia.contribution_requester_eligible(sophia.api_contribution_grants,uuid), sophia.contribution_grant_unusable(sophia.api_contribution_grants),
 sophia.contribution_route_qualified(text,text,text), sophia.contribution_runtime_of(sophia.api_contribution_grants,sophia.api_connections),
 sophia.contribution_readiness(sophia.api_contribution_grants,uuid), sophia.contribution_refuse(text),
 sophia.contribution_admission(uuid,uuid,sophia.research_funding_pins,text,text,jsonb,uuid),
 sophia.contribution_admission_runtime(uuid,sophia.api_contribution_grants),
 sophia.contribution_bind_task(uuid,uuid,uuid,uuid,sophia.api_contribution_grants,sophia.runtime_instances),
 sophia.contribution_delivery_ineligible(sophia.outbox,sophia.execution_bindings),
 sophia.contribution_runtime_unusable(sophia.runtime_instances), sophia.contribution_wait_reason(sophia.runtime_instances),
 sophia.contribution_lock_connection(uuid,uuid),
 sophia.contribution_allowance(uuid,uuid), sophia.contribution_fence(uuid,uuid), sophia.contribution_fence_changed(),
 sophia.contribution_runtime_roles(),
 sophia.contribution_model_reserve(sophia.research_scope,text,numeric),
 sophia.contribution_link_reservation(sophia.research_scope,sophia.research_reservations),
 sophia.contribution_withhold(sophia.research_scope,text),
 sophia.contribution_apply_settings(sophia.api_contribution_grants,jsonb,boolean), sophia.contribution_store(sophia.api_contribution_grants),
 sophia.contribution_grant_for_edit(uuid,bigint,text), sophia.contribution_grant_receipt(sophia.api_contribution_grants),
 sophia.api_account_create(text,numeric,integer,text,text), sophia.api_account_update(uuid,bigint,jsonb),
 sophia.api_connection_create(uuid,text,text), sophia.api_connection_set_state(uuid,bigint,text),
 sophia.api_grant_create(uuid,uuid,jsonb), sophia.api_grant_update(uuid,bigint,jsonb), sophia.api_grant_set_state(uuid,bigint,text),
 sophia.api_grant_admin_disable(uuid,bigint,text), sophia.api_grant_admin_lift(uuid,bigint), sophia.api_grant_admin_narrow(uuid,bigint,jsonb),
 sophia.research_funding_pin_set(uuid,uuid,bigint), sophia.research_funding_pin_clear(uuid),
 sophia.api_contributions_mine(), sophia.api_contributions_for_project(uuid), sophia.research_task_funding(uuid,uuid),
 sophia.register_contribution_runtime(uuid,uuid,text,bytea,boolean), sophia.retire_contribution_runtime(uuid,uuid),
 sophia.qualify_api_route(text,text,text,text,timestamptz), sophia.revoke_api_route_qualification(uuid),
 sophia.contribution_request_uuid(jsonb,text), sophia.contribution_request_revision(jsonb),
 sophia.contribution_uuid_spelling(jsonb), sophia.contribution_request_canonical(text,jsonb),
 sophia.contribution_replay_allowed(text,jsonb,jsonb), sophia.api_contribution_write(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.api_account_create(text,numeric,integer,text,text), sophia.api_account_update(uuid,bigint,jsonb),
 sophia.api_connection_create(uuid,text,text), sophia.api_connection_set_state(uuid,bigint,text),
 sophia.api_grant_create(uuid,uuid,jsonb), sophia.api_grant_update(uuid,bigint,jsonb), sophia.api_grant_set_state(uuid,bigint,text),
 sophia.api_grant_admin_disable(uuid,bigint,text), sophia.api_grant_admin_lift(uuid,bigint), sophia.api_grant_admin_narrow(uuid,bigint,jsonb),
 sophia.research_funding_pin_set(uuid,uuid,bigint), sophia.research_funding_pin_clear(uuid),
 sophia.api_contributions_mine(), sophia.api_contributions_for_project(uuid), sophia.research_task_funding(uuid,uuid),
 sophia.api_contribution_write(text,text,jsonb) TO sophia_api;

COMMIT;
