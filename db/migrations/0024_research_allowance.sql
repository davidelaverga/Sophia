-- SMC-M03 S3 (plan §2.5, §2.6; mission §8; WEB_SOURCE_POLICY §6–§7): the spend authority for research and where each
-- retrieved source came from. Nothing here admits research or calls a provider: S4's runtime routes call these
-- functions after authenticating the runtime and its binding. None of them is granted to the API or worker logins.
-- * A research grant per project holds the gate and the caps (D1: $5 per task, $40 for qualification). No grant, or
--   a closed gate, means no allowance can open and no reservation can be made: absent is never unlimited.
-- * One allowance per research lineage (the original task, its amendments, renditions and repairs). It copies the
--   grant's task cap and the source policy's limits when it opens, and keeps headroom so a partial result can still
--   be written when the rest is spent. Opening it again, also concurrently, returns the same allowance unchanged.
--   Nothing resets it: not Resume, a new format or a new session.
-- * Only a reservation whose purpose is the partial result may use the headroom. That purpose is a model call's
--   alone, at most one is in flight per allowance, and S4's authenticated wrapper sets it from the attempt's own
--   finalize step, never from a tool argument or model output.
-- * A reservation is made before every paid call (model, search, read, render), serialized per allowance by a row
--   lock (the grant's row first, then the allowance's, so allowances under one grant cannot overspend it together).
--   It is idempotent by key (native session and call id). It ends settled from reported usage, released when the
--   call never left, or uncertain when the outcome is unknown, until reconciled. An abort is not a refund.
-- * Provenance records, per retrieved source, the call that produced it, the target it was read from (provenance-
--   bound: a search result, an extracted link or an admitted input), what the provider reported and what it could
--   not (origin status, final URL), coverage and limitations. Readable exactly when the source itself is.
BEGIN;

CREATE TABLE sophia.research_grants (
 project_id uuid NOT NULL PRIMARY KEY REFERENCES sophia.projects(id),
 state text NOT NULL CHECK(state IN ('enabled','disabled')),
 task_cap_usd numeric(12,6) NOT NULL CHECK(task_cap_usd>0),
 total_cap_usd numeric(12,6) NOT NULL CHECK(total_cap_usd>=task_cap_usd),
 source_policy text NOT NULL CHECK(source_policy ~ '^[a-z]+(-[a-z]+)*-v[0-9]+$'),
 approval_ref text NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 300),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sophia.research_allowances (
 project_id uuid NOT NULL REFERENCES sophia.research_grants(project_id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 root_job_id uuid,
 cap_usd numeric(12,6) NOT NULL CHECK(cap_usd>0),
 headroom_usd numeric(12,6) NOT NULL CHECK(headroom_usd>=0 AND headroom_usd<cap_usd),
 reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(reserved_usd>=0),
 spent_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(spent_usd>=0),
 uncertain_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(uncertain_usd>=0),
 source_policy text NOT NULL,
 max_searches integer NOT NULL CHECK(max_searches>=0),
 max_reads integer NOT NULL CHECK(max_reads>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,root_job_id),
 FOREIGN KEY(project_id,root_job_id) REFERENCES sophia.jobs(project_id,id)
);

CREATE TABLE sophia.research_reservations (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 allowance_id uuid NOT NULL,
 reservation_key text NOT NULL CHECK(reservation_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 kind text NOT NULL CHECK(kind IN ('model','search','read','render')),
 provider text NOT NULL CHECK(provider ~ '^[a-z][a-z0-9-]{0,62}$'),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','settled','released','uncertain')),
 purpose text NOT NULL DEFAULT 'call' CHECK(purpose IN ('call','partial_result')),
 reserved_usd numeric(12,6) NOT NULL CHECK(reserved_usd>0),
 settled_usd numeric(12,6) CHECK(settled_usd>=0),
 usage jsonb CHECK(usage IS NULL OR jsonb_typeof(usage)='object'),
 provider_request_id text CHECK(provider_request_id IS NULL OR length(provider_request_id)<=200),
 created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 PRIMARY KEY(project_id,id), UNIQUE(project_id,allowance_id,reservation_key),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id),
 CHECK((state='settled')=(settled_usd IS NOT NULL)), CHECK((state='reserved')=(ended_at IS NULL)),
 -- The partial result is written by a model call; no search, read or render may draw on the headroom.
 CHECK(purpose='call' OR kind='model')
);
-- At most one partial-result call in flight per allowance.
CREATE UNIQUE INDEX research_reservations_one_partial ON sophia.research_reservations(project_id,allowance_id)
 WHERE purpose='partial_result' AND state='reserved';

CREATE TABLE sophia.source_provenance (
 project_id uuid NOT NULL, source_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('search_results','web_read','admitted_input')),
 provider text CHECK(provider IN ('tavily','jina')),
 reservation_id uuid,
 target_ref text CHECK(target_ref IS NULL OR target_ref ~ '^(search|link|input):[0-9a-f-]{36}(#[0-9]{1,4})?$'),
 parent_source_id uuid,
 requested_url text CHECK(requested_url IS NULL OR length(requested_url)<=2048),
 provider_http_status integer CHECK(provider_http_status IS NULL OR provider_http_status BETWEEN 100 AND 599),
 origin_http_status integer CHECK(origin_http_status IS NULL OR origin_http_status BETWEEN 100 AND 599),
 reported_final_url text CHECK(reported_final_url IS NULL OR length(reported_final_url)<=2048),
 provider_request_id text CHECK(provider_request_id IS NULL OR length(provider_request_id)<=200),
 extraction text CHECK(extraction IS NULL OR length(extraction)<=100),
 coverage text NOT NULL CHECK(coverage IN ('complete','partial','unsupported')),
 limitations text[] NOT NULL DEFAULT '{}' CHECK(cardinality(limitations)<=20),
 retrieved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,source_id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,parent_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id),
 -- A paid retrieval names its call; an admitted input names none. A read names the target it was bound to.
 CHECK((kind='admitted_input')=(reservation_id IS NULL)),
 CHECK(kind<>'web_read' OR (target_ref IS NOT NULL AND (parent_source_id IS NOT NULL OR target_ref LIKE 'input:%')))
);

ALTER TABLE sophia.research_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.research_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.source_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.research_grants FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.research_allowances FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.research_reservations FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
-- The subquery runs under the reader's own source_objects policies.
CREATE POLICY readable_with_source ON sophia.source_provenance FOR SELECT TO sophia_api USING(EXISTS(
 SELECT 1 FROM sophia.source_objects s WHERE s.project_id=source_provenance.project_id AND s.id=source_provenance.source_id));
GRANT SELECT ON sophia.research_grants, sophia.research_allowances, sophia.research_reservations, sophia.source_provenance TO sophia_api;

-- The owner's switch (a Codex operation under Davide's approval): set or change a project's grant.
CREATE FUNCTION sophia.set_research_grant(p_project uuid, p_state text, p_task_cap numeric, p_total_cap numeric,
  p_policy text, p_approval_ref text) RETURNS sophia.research_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.research_grants;
BEGIN
 INSERT INTO sophia.research_grants(project_id,state,task_cap_usd,total_cap_usd,source_policy,approval_ref)
 VALUES(p_project,p_state,p_task_cap,p_total_cap,p_policy,p_approval_ref)
 ON CONFLICT (project_id) DO UPDATE SET state=EXCLUDED.state, task_cap_usd=EXCLUDED.task_cap_usd,
  total_cap_usd=EXCLUDED.total_cap_usd, source_policy=EXCLUDED.source_policy, approval_ref=EXCLUDED.approval_ref,
  revision=research_grants.revision+1, updated_at=now()
 RETURNING * INTO g;
 RETURN g;
END $$;

-- Open the allowance of a research lineage under the project's grant. The source policy's limits are resolved here
-- and recorded, never read again from the policy. Idempotent by root job, also when two open it at once: the loser
-- of the insert waits for the winner and returns the winner's row, its caps and counters untouched.
CREATE FUNCTION sophia.open_research_allowance(p_project uuid, p_root_job uuid, p_headroom numeric)
RETURNS sophia.research_allowances LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.research_grants; a sophia.research_allowances;
BEGIN
 IF p_root_job IS NULL THEN RAISE EXCEPTION 'An allowance belongs to a research job' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.research_grants WHERE project_id=p_project FOR SHARE;
 IF NOT FOUND OR g.state<>'enabled' THEN RAISE EXCEPTION 'Research gate closed' USING ERRCODE='55000'; END IF;
 IF g.source_policy<>'web-pilot-v1' THEN RAISE EXCEPTION 'Unknown source policy %', g.source_policy USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.research_allowances(project_id,root_job_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
 VALUES(p_project,p_root_job,g.task_cap_usd,p_headroom,g.source_policy,5,8)
 ON CONFLICT (project_id,root_job_id) DO NOTHING RETURNING * INTO a;
 IF FOUND THEN RETURN a; END IF;
 SELECT * INTO STRICT a FROM sophia.research_allowances WHERE project_id=p_project AND root_job_id=p_root_job;
 RETURN a;
END $$;

-- Reserve before one paid call. Refused when the gate is closed, the allowance or the grant's total would be
-- exceeded, or the source policy's limit is reached. Only the partial-result purpose may use headroom: a model call,
-- one in flight per allowance. An ordinary call ('call') stops at the cap less headroom, whatever its kind.
CREATE FUNCTION sophia.reserve_research(p_project uuid, p_allowance uuid, p_key text, p_kind text, p_provider text,
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
 IF committed+p_amount>g.total_cap_usd THEN RAISE EXCEPTION 'Research grant exhausted' USING ERRCODE='55000'; END IF;
 INSERT INTO sophia.research_reservations(project_id,allowance_id,reservation_key,kind,provider,purpose,reserved_usd)
 VALUES(p_project,p_allowance,p_key,p_kind,p_provider,p_purpose,p_amount) RETURNING * INTO r;
 UPDATE sophia.research_allowances SET reserved_usd=reserved_usd+p_amount WHERE project_id=p_project AND id=p_allowance;
 RETURN r;
END $$;

-- End a reservation: settled at the reported cost, released when the call never left, or uncertain when the outcome
-- is unknown (its reserved amount stays committed until reconciled). Repeating the same end is a no-op; an uncertain
-- reservation can later be settled or released by reconciliation, never the other way round.
CREATE FUNCTION sophia.end_research_reservation(p_project uuid, p_reservation uuid, p_outcome text, p_cost numeric,
  p_usage jsonb, p_request_id text)
RETURNS sophia.research_reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.research_reservations; a sophia.research_allowances;
BEGIN
 IF p_outcome NOT IN ('settled','released','uncertain') THEN RAISE EXCEPTION 'Unknown reservation outcome' USING ERRCODE='22023'; END IF;
 IF (p_outcome='settled')<>(p_cost IS NOT NULL) OR p_cost<0 THEN
  RAISE EXCEPTION 'A settled reservation has a non-negative cost, and only it' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research reservation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM sophia.research_allowances WHERE project_id=p_project AND id=r.allowance_id FOR UPDATE;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=p_project AND id=p_reservation FOR UPDATE;
 IF r.state=p_outcome AND (p_outcome<>'settled' OR r.settled_usd=p_cost) THEN RETURN r; END IF;
 IF r.state IN ('settled','released') THEN
  RAISE EXCEPTION 'Reservation already ended as %', r.state USING ERRCODE='40001'; END IF;
 UPDATE sophia.research_allowances SET
  reserved_usd=reserved_usd-CASE WHEN r.state='reserved' THEN r.reserved_usd ELSE 0 END,
  uncertain_usd=uncertain_usd-CASE WHEN r.state='uncertain' THEN r.reserved_usd ELSE 0 END
   +CASE WHEN p_outcome='uncertain' THEN r.reserved_usd ELSE 0 END,
  spent_usd=spent_usd+coalesce(p_cost,0)
 WHERE project_id=p_project AND id=r.allowance_id;
 UPDATE sophia.research_reservations SET state=p_outcome, settled_usd=p_cost, ended_at=now(),
  usage=coalesce(p_usage,usage), provider_request_id=coalesce(left(p_request_id,200),provider_request_id)
 WHERE project_id=p_project AND id=p_reservation RETURNING * INTO r;
 RETURN r;
END $$;

REVOKE ALL ON FUNCTION sophia.set_research_grant(uuid,text,numeric,numeric,text,text),
 sophia.open_research_allowance(uuid,uuid,numeric),
 sophia.reserve_research(uuid,uuid,text,text,text,numeric,text),
 sophia.end_research_reservation(uuid,uuid,text,numeric,jsonb,text) FROM PUBLIC;

COMMIT;
