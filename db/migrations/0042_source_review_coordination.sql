-- WBC-02 (SCM-01): one Paperclip-managed source review, admitted by a person, executed by the existing dsh bridge.
-- * Admission. A member who can edit proposes a fixed source-review plan (one item) for one goal, its criteria and 1-3
--   eligible text sources (32 KiB at most in all) with a positive allowance no larger than the project's caps. Proposing
--   runs no model and creates no issue. The plan's definition and its source manifest are immutable; its state is not.
--   The decider answers the plan's decision once (the exact revision, the same operation on retry). Accepting commits
--   the work item, its assignment, its execution goal (hidden from the goal list), its allowance and one commission
--   delivery to Paperclip in the same transaction. Declining or expiry dispatches nothing.
-- * Paperclip owns the operational lifecycle of the admitted work (issue, run, wake); Sophia owns the decision, the
--   allowance, source eligibility and the effect permit. The worker delivers the commission and the mirrored controls
--   to the plugin (coordination_outbox) under a unique server-owned commission key; a lost reply is reconciled by the
--   key, never re-created blind. Nothing here holds a Paperclip credential.
-- * Execution. The external adapter asks for an effect permit for its run (coordination_permit): a run of an unknown,
--   foreign or stale issue, of held, stopped or finished work, or with a withdrawn input is denied before any effect.
--   A live or uncertain attempt is attached to, never duplicated. Only the work's first attempt is started
--   (coordination_start), through the ordinary native path: goal, attempt, binding, command, job, outbox.
-- * The reviewer (sophia-source-review-v1) reads only its manifest's sources and publishes only through
--   submit_source_review: a bounded Markdown report with findings that cite sources it read, stored as an immutable
--   source before result-ready. Every model call is reserved from and settled against the work's allowance through
--   the shared research accounting (reserve_research, end_research_reservation), at most eight. A turn that ends
--   without a result is nudged once, then fails with no_result_submitted.
-- * Control. Hold, Resume and Stop of an assignment act on its execution goal through the existing authority epoch
--   and native.stop/native.resume deliveries; the goal's status is mirrored to Paperclip by trigger. A Paperclip run
--   cancellation holds the work. Withdrawing an input stops affected work and withdraws its result.
-- 0001-0037 are not edited; dispatch_runtime_outbox and capture_native_result are replaced with the same signatures.
BEGIN;

-- --- enrollment ---------------------------------------------------------------------------------------------------

-- The pilot gate of one project, and the Paperclip company and project its work is commissioned in. Absent or
-- disabled: nothing is proposed or admitted. Set by the owner (a Codex operation under Davide's approval).
CREATE TABLE sophia.coordination_grants (
 project_id uuid NOT NULL PRIMARY KEY REFERENCES sophia.projects(id),
 state text NOT NULL CHECK(state IN ('enabled','disabled')),
 review_cap_usd numeric(12,6) NOT NULL CHECK(review_cap_usd>0),
 paperclip_company_id text NOT NULL CHECK(paperclip_company_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
 paperclip_project_id text NOT NULL CHECK(paperclip_project_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
 approval_ref text NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 300),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- The Paperclip side's service credential (the dsh adapter), by hash, bound to one Paperclip company.
CREATE TABLE sophia.coordination_integrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_sha256 bytea NOT NULL UNIQUE CHECK(octet_length(token_sha256)=32),
 paperclip_company_id text NOT NULL CHECK(paperclip_company_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CHECK((state='revoked')=(revoked_at IS NOT NULL))
);

-- --- plans and decisions -------------------------------------------------------------------------------------------

-- One proposed plan (sophia.work.plan.v2 without its live state). Everything but state and state_revision is fixed
-- when it is proposed (work_plans_immutable).
CREATE TABLE sophia.work_plans (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 goal_id uuid NOT NULL, goal_revision bigint NOT NULL CHECK(goal_revision>0),
 criteria_ref text NOT NULL CHECK(length(criteria_ref) BETWEEN 1 AND 160),
 mission_revision bigint NOT NULL CHECK(mission_revision>0),
 recipe text NOT NULL CHECK(recipe ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$'),
 route text NOT NULL CHECK(route ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 work_id uuid NOT NULL, assignment_id uuid NOT NULL,
 source_ids uuid[] NOT NULL CHECK(cardinality(source_ids) BETWEEN 1 AND 3),
 manifest_source_id uuid NOT NULL,
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 allowance_usd numeric(12,6) NOT NULL CHECK(allowance_usd>0),
 proposed_by uuid NOT NULL,
 decision_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','declined','expired','superseded','withdrawn')),
 state_revision integer NOT NULL DEFAULT 1 CHECK(state_revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,decision_id), UNIQUE(project_id,work_id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,manifest_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE INDEX work_plans_by_goal ON sophia.work_plans(project_id,goal_id,created_at);

CREATE FUNCTION sophia.work_plans_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF (to_jsonb(NEW)-'state'-'state_revision')<>(to_jsonb(OLD)-'state'-'state_revision') THEN
  RAISE EXCEPTION 'A plan''s definition is immutable; propose a new plan' USING ERRCODE='55000'; END IF;
 IF OLD.state<>'proposed' AND NEW.state<>OLD.state AND NOT (OLD.state='accepted' AND NEW.state IN ('superseded','withdrawn')) THEN
  RAISE EXCEPTION 'Plan % is %; its state does not change to %', OLD.id, OLD.state, NEW.state USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.work_plans_immutable() FROM PUBLIC;
CREATE TRIGGER work_plans_immutable BEFORE UPDATE ON sophia.work_plans FOR EACH ROW EXECUTE FUNCTION sophia.work_plans_immutable();

-- A work decision: the exact question a person answers about one plan revision (here: admit the plan or not).
-- Expiry is read from expires_at; a decision answered after it is recorded as expired.
CREATE TABLE sophia.work_decisions (
 project_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN ('plan_admission')),
 plan_id uuid NOT NULL, plan_revision integer NOT NULL CHECK(plan_revision>0), work_id uuid NOT NULL,
 question text NOT NULL CHECK(length(question) BETWEEN 1 AND 500),
 decider_id uuid NOT NULL,
 choices jsonb NOT NULL CHECK(jsonb_typeof(choices)='array' AND jsonb_array_length(choices) BETWEEN 1 AND 4),
 expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','declined','expired','superseded')),
 selected_choice text, answered_by uuid, answered_at timestamptz,
 choice_operation text CHECK(choice_operation IS NULL OR length(choice_operation) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,plan_id) REFERENCES sophia.work_plans(project_id,id),
 CHECK((state IN ('accepted','declined'))=(selected_choice IS NOT NULL AND answered_by IS NOT NULL))
);

-- --- admitted work -------------------------------------------------------------------------------------------------

-- The accepted plan's item: the stable obligation (its id is the plan item's id). Its control runs through its own
-- execution goal; its spend through one allowance under the project's research grant.
CREATE TABLE sophia.work_items (
 project_id uuid NOT NULL, id uuid NOT NULL,
 plan_id uuid NOT NULL, plan_revision integer NOT NULL,
 execution_goal_id uuid NOT NULL, allowance_id uuid NOT NULL,
 accepted_by uuid NOT NULL,
 closed_reason text CHECK(closed_reason IS NULL OR length(closed_reason) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,execution_goal_id), UNIQUE(project_id,plan_id),
 FOREIGN KEY(project_id,plan_id) REFERENCES sophia.work_plans(project_id,id),
 FOREIGN KEY(project_id,execution_goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id)
);

-- Who is responsible for the work now, and its control generation. One active assignment per work item.
CREATE TABLE sophia.work_assignments (
 project_id uuid NOT NULL, id uuid NOT NULL, work_id uuid NOT NULL,
 generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 executor_kind text NOT NULL CHECK(executor_kind IN ('sophia_native')),
 role text NOT NULL CHECK(role ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$'),
 route text NOT NULL CHECK(route ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','ended')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,work_id,generation),
 FOREIGN KEY(project_id,work_id) REFERENCES sophia.work_items(project_id,id)
);
CREATE UNIQUE INDEX work_assignments_one_active ON sophia.work_assignments(project_id,work_id) WHERE state='active';

-- The work's commission in Paperclip: the server-owned key, and the core issue once the plugin reported it.
CREATE TABLE sophia.work_commissions (
 project_id uuid NOT NULL, work_id uuid NOT NULL,
 commission_key text NOT NULL UNIQUE CHECK(commission_key ~ '^sophia-wbc02-[0-9a-f-]{36}$'),
 paperclip_company_id text NOT NULL, paperclip_project_id text NOT NULL,
 paperclip_issue_id text CHECK(paperclip_issue_id IS NULL OR paperclip_issue_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','created','outcome_unknown','failed','superseded')),
 reason text CHECK(reason IS NULL OR length(reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,work_id), UNIQUE(paperclip_company_id,paperclip_issue_id),
 FOREIGN KEY(project_id,work_id) REFERENCES sophia.work_items(project_id,id),
 CHECK((state='created')=(paperclip_issue_id IS NOT NULL))
);

-- Deliveries to the Paperclip plugin: the commission and the controls mirrored from the work's execution goal.
-- delivery_key is the plugin's idempotency key; a lost reply leaves outcome_unknown, which the worker reconciles.
-- seq orders a work item's deliveries as they were written. Each is written under its commission's lock (work_mirror;
-- the commission itself with the work), so a later control has a larger seq even when its transaction began first.
-- created_at is a transaction's start, and orders nothing (Codex on #107).
CREATE TABLE sophia.coordination_outbox (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 work_id uuid NOT NULL,
 op text NOT NULL CHECK(op IN ('commission','hold','resume','stop','complete','fail')),
 delivery_key text NOT NULL CHECK(delivery_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivering','delivered','outcome_unknown','failed','superseded')),
 lease_owner text, lease_token uuid, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 available_at timestamptz NOT NULL DEFAULT now(),
 reason text CHECK(reason IS NULL OR length(reason)<=500), result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,delivery_key),
 FOREIGN KEY(project_id,work_id) REFERENCES sophia.work_items(project_id,id)
);
CREATE INDEX coordination_outbox_due ON sophia.coordination_outbox(available_at,seq) WHERE state IN ('pending','outcome_unknown');

-- One Paperclip run's effect permit and what it led to: a new attempt (start), an existing one (attach), or nothing.
CREATE TABLE sophia.work_runs (
 paperclip_company_id text NOT NULL, paperclip_run_id text NOT NULL CHECK(paperclip_run_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
 project_id uuid NOT NULL, work_id uuid NOT NULL, integration_id uuid NOT NULL REFERENCES sophia.coordination_integrations(id),
 paperclip_issue_id text NOT NULL, paperclip_agent_id text CHECK(paperclip_agent_id IS NULL OR length(paperclip_agent_id)<=128),
 assignment_id uuid NOT NULL, assignment_generation integer NOT NULL,
 decision text NOT NULL CHECK(decision IN ('start','attach')),
 permit_expires_at timestamptz NOT NULL,
 attempt_id uuid,
 state text NOT NULL CHECK(state IN ('permitted','started','attached','ended')),
 created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 PRIMARY KEY(paperclip_company_id,paperclip_run_id),
 FOREIGN KEY(project_id,work_id) REFERENCES sophia.work_items(project_id,id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 CHECK((state IN ('started','attached'))<=(attempt_id IS NOT NULL))
);

-- The receipts of the pages an attempt was served: each page carries a fresh one, kept here only as its hash, with the
-- page it was served with (its offset, length and text hash, and the source's length). A page whose reply was lost
-- never reached the model, so neither did its receipt (Codex on #107).
CREATE TABLE sophia.work_review_receipts (
 project_id uuid NOT NULL, attempt_id uuid NOT NULL, source_id uuid NOT NULL, receipt_sha256 bytea NOT NULL,
 page_offset integer NOT NULL CHECK(page_offset>=0), page_chars integer NOT NULL CHECK(page_chars>=0),
 total_chars integer NOT NULL CHECK(total_chars>=page_offset+page_chars), page_sha256 bytea NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,receipt_sha256),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);

-- Which manifest sources an attempt read (a finding may cite only these): recorded at the submit, from the receipts it
-- presents, so only a page that reached the model counts as read.
CREATE TABLE sophia.work_review_reads (
 project_id uuid NOT NULL, attempt_id uuid NOT NULL, source_id uuid NOT NULL,
 first_read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,attempt_id,source_id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);

-- The review's published result: immutable but for being withdrawn. One per attempt.
CREATE TABLE sophia.work_results (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), work_id uuid NOT NULL, attempt_id uuid NOT NULL,
 submission_key text NOT NULL CHECK(submission_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 source_id uuid NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 verdict text NOT NULL CHECK(verdict IN ('supported','changes_required','insufficient_evidence')),
 findings jsonb NOT NULL CHECK(jsonb_typeof(findings)='array'),
 inspected_source_ids uuid[] NOT NULL,
 checks jsonb NOT NULL CHECK(jsonb_typeof(checks)='object'),
 state text NOT NULL DEFAULT 'current' CHECK(state IN ('current','withdrawn')),
 withdrawn_reason text CHECK(withdrawn_reason IS NULL OR length(withdrawn_reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,attempt_id), UNIQUE(project_id,work_id,submission_key),
 FOREIGN KEY(project_id,work_id) REFERENCES sophia.work_items(project_id,id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 CHECK((state='withdrawn')=(withdrawn_reason IS NOT NULL))
);

CREATE FUNCTION sophia.work_results_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF (to_jsonb(NEW)-'state'-'withdrawn_reason')<>(to_jsonb(OLD)-'state'-'withdrawn_reason') OR OLD.state='withdrawn' THEN
  RAISE EXCEPTION 'A published review result is immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.work_results_immutable() FROM PUBLIC;
CREATE TRIGGER work_results_immutable BEFORE UPDATE ON sophia.work_results FOR EACH ROW EXECUTE FUNCTION sophia.work_results_immutable();

-- A member's operation on the work (a proposal, a decision answer, a command), under its idempotency key.
CREATE TABLE sophia.work_operations (
 project_id uuid NOT NULL, actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 operation text NOT NULL CHECK(operation IN ('propose_source_review','answer_decision','command')),
 semantic_request jsonb NOT NULL,
 kind text CHECK(kind IS NULL OR kind IN ('guidance','hold','resume','stop','decision')),
 work_id uuid, assignment_id uuid, assignment_generation integer, command_id uuid,
 outcome text NOT NULL CHECK(outcome IN ('recorded','rejected')),
 rejection text CHECK(rejection IS NULL OR rejection IN ('conflict','denied','unavailable','expired')),
 result jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id,idempotency_key),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id),
 CHECK((outcome='rejected')=(rejection IS NOT NULL))
);

-- Which Paperclip run reported a settled call's usage: each reservation is reported once, per run.
CREATE TABLE sophia.work_usage_claims (
 project_id uuid NOT NULL, reservation_id uuid NOT NULL,
 paperclip_company_id text NOT NULL, paperclip_run_id text NOT NULL,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,reservation_id),
 FOREIGN KEY(project_id,reservation_id) REFERENCES sophia.research_reservations(project_id,id),
 FOREIGN KEY(paperclip_company_id,paperclip_run_id) REFERENCES sophia.work_runs(paperclip_company_id,paperclip_run_id)
);

ALTER TABLE sophia.coordination_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.coordination_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.coordination_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_review_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_review_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.work_usage_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.coordination_grants FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.work_plans FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.work_decisions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.work_items FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.work_assignments FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.work_commissions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.work_results FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.coordination_outbox FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
-- An operation is its author's own record.
CREATE POLICY own_read ON sophia.work_operations FOR SELECT TO sophia_api USING(sophia.is_member(project_id) AND actor_id=sophia.actor_id());
-- No write grant: every write is one of the functions below. Integrations, runs, reads and claims are service records.
GRANT SELECT ON sophia.coordination_grants, sophia.work_plans, sophia.work_decisions, sophia.work_items, sophia.work_assignments,
 sophia.work_commissions, sophia.work_results, sophia.coordination_outbox, sophia.work_operations TO sophia_api;

ALTER TABLE sophia.work_items ADD COLUMN nudge_command_id uuid,
 ADD CONSTRAINT work_items_nudge_fk FOREIGN KEY(project_id,nudge_command_id) REFERENCES sophia.commands(project_id,id);

-- --- the owner's operations (no grant: run by the migration owner, under Davide's approval) ------------------------

CREATE FUNCTION sophia.set_coordination_grant(p_project uuid, p_state text, p_review_cap numeric, p_company text,
  p_paperclip_project text, p_approval_ref text) RETURNS sophia.coordination_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.coordination_grants;
BEGIN
 INSERT INTO sophia.coordination_grants(project_id,state,review_cap_usd,paperclip_company_id,paperclip_project_id,approval_ref)
 VALUES(p_project,p_state,p_review_cap,p_company,p_paperclip_project,p_approval_ref)
 ON CONFLICT (project_id) DO UPDATE SET state=EXCLUDED.state, review_cap_usd=EXCLUDED.review_cap_usd,
  paperclip_company_id=EXCLUDED.paperclip_company_id, paperclip_project_id=EXCLUDED.paperclip_project_id,
  approval_ref=EXCLUDED.approval_ref, revision=coordination_grants.revision+1, updated_at=now()
 RETURNING * INTO g;
 RETURN g;
END $$;
REVOKE ALL ON FUNCTION sophia.set_coordination_grant(uuid,text,numeric,text,text,text) FROM PUBLIC;

-- The adapter's credential: only its hash is stored, as for a runtime (0012).
CREATE FUNCTION sophia.register_coordination_integration(p_company text, p_token_sha256 bytea, p_label text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 INSERT INTO sophia.coordination_integrations(paperclip_company_id,token_sha256,label) VALUES(p_company,p_token_sha256,p_label) RETURNING id $$;
REVOKE ALL ON FUNCTION sophia.register_coordination_integration(text,bytea,text) FROM PUBLIC;

CREATE FUNCTION sophia.revoke_coordination_integration(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 UPDATE sophia.coordination_integrations SET state='revoked', revoked_at=now() WHERE id=p_id AND state='active' $$;
REVOKE ALL ON FUNCTION sophia.revoke_coordination_integration(uuid) FROM PUBLIC;

-- --- the pilot's fixed bounds ---------------------------------------------------------------------------------------

-- Selected pilot limits (WBC-02 §G2), not upstream defaults. A lower existing cap wins (the grants' caps).
CREATE FUNCTION sophia.source_review_limits() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('maxSources',3,'maxInputBytes',32768,'maxModelRequests',8,'maxReportBytes',16384,
  'web',false,'shell',false,'connectors',false) $$;
REVOKE ALL ON FUNCTION sophia.source_review_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.source_review_limits() TO sophia_api;

-- The id the integration and the source guard act under: never a member, so never mistaken for a person.
CREATE FUNCTION sophia.integration_actor() RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;
REVOKE ALL ON FUNCTION sophia.integration_actor() FROM PUBLIC;

-- A source a review may admit and read: a released, eligible, ready project text source that draws on nothing
-- withdrawn (0033's closure).
CREATE FUNCTION sophia.review_source_readable(p_project uuid, p_source uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.source_objects s JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
   WHERE s.project_id=p_project AND s.id=p_source AND s.scope='project' AND s.eligible AND s.state='ready')
  AND NOT sophia.source_withdrawn(p_project,p_source) $$;
REVOKE ALL ON FUNCTION sophia.review_source_readable(uuid,uuid) FROM PUBLIC;

-- The manifest of a work item's plan (its stored JSON).
CREATE FUNCTION sophia.work_manifest(p_project uuid, p_work uuid) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT t.body::jsonb FROM sophia.work_plans p JOIN sophia.source_texts t ON t.project_id=p.project_id AND t.source_id=p.manifest_source_id
  WHERE p.project_id=p_project AND p.work_id=p_work $$;
REVOKE ALL ON FUNCTION sophia.work_manifest(uuid,uuid) FROM PUBLIC;

-- Whether every source a work item's plan names can still be read.
CREATE FUNCTION sophia.work_inputs_readable(p_project uuid, p_work uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT NOT EXISTS(SELECT 1 FROM sophia.work_plans p CROSS JOIN LATERAL unnest(p.source_ids) x
  WHERE p.project_id=p_project AND p.work_id=p_work AND NOT sophia.review_source_readable(p_project,x)) $$;
REVOKE ALL ON FUNCTION sophia.work_inputs_readable(uuid,uuid) FROM PUBLIC;

-- The create's task statement: the request and its manifest. The reviewer's instruction (prompts/SOURCE_REVIEW.md, v1)
-- is the role's prompt section in the bridge; this is the task alone.
CREATE FUNCTION sophia.source_review_statement(p_manifest jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Source review task. Review the sources below against the goal and its criteria, and only those sources.'||E'\n'
 || 'Read each source with read_review_source (by its sourceId; long sources come in pages). Publish the review with '
 || 'submit_source_review, or name precisely what is missing with report_review_blocker. A final chat message is not '
 || 'publication.'||E'\n\n'
 || 'Goal: '||(p_manifest->'goal'->>'title')||E'\n'
 || 'Outcome: '||(p_manifest->'goal'->>'outcome')||E'\n'
 || 'Criteria ('||(p_manifest->'goal'->>'criteriaRef')||'):'||E'\n'
 || (SELECT string_agg('- '||(c->>'id')||': '||(c->>'description'),E'\n' ORDER BY n)
     FROM jsonb_array_elements(p_manifest->'goal'->'criteria') WITH ORDINALITY AS x(c,n))||E'\n\n'
 || 'Sources:'||E'\n'
 || (SELECT string_agg('- '||(s->>'ref')||' sourceId '||(s->>'sourceId')||' ('||(s->>'mime')||', '||(s->>'byteLength')||' bytes, sha256 '
      ||(s->>'sha256')||')',E'\n' ORDER BY n)
     FROM jsonb_array_elements(p_manifest->'sources') WITH ORDINALITY AS x(s,n))||E'\n\n'
 || 'Limits: at most '||(p_manifest->'limits'->>'maxModelRequests')||' model requests in all and '
 || (p_manifest->'limits'->>'maxReportBytes')||' bytes of report text. No web, shell or connector access.' $$;
REVOKE ALL ON FUNCTION sophia.source_review_statement(jsonb) FROM PUBLIC;

-- The one input a review session gets when a turn completes without a result.
CREATE FUNCTION sophia.source_review_nudge_text() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'Your turn ended without a published review. If the review is ready, call submit_source_review; if it cannot '
 || 'be finished, call report_review_blocker with what is missing. Do not start a new review.' $$;
REVOKE ALL ON FUNCTION sophia.source_review_nudge_text() FROM PUBLIC;

-- --- control ---------------------------------------------------------------------------------------------------------

-- Queue a delivery of a work item's control to the plugin, unless its commission was never delivered (then a Stop
-- withdraws the commission instead of creating an issue only to cancel it). A newer control supersedes an older one
-- not yet delivered; the plugin applies the latest.
CREATE FUNCTION sophia.work_mirror(p_project uuid, p_work uuid, p_op text, p_epoch bigint) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cm sophia.work_commissions; key text:='work-'||p_work||':'||p_op||':'||p_epoch;
BEGIN
 SELECT * INTO cm FROM sophia.work_commissions WHERE project_id=p_project AND work_id=p_work FOR UPDATE;
 IF NOT FOUND OR cm.state IN ('failed','superseded') THEN RETURN; END IF;
 IF p_op='stop' AND cm.state='pending' AND NOT EXISTS(SELECT 1 FROM sophia.coordination_outbox o WHERE o.project_id=p_project
   AND o.work_id=p_work AND o.op='commission' AND o.state IN ('delivering','delivered','outcome_unknown')) THEN
  UPDATE sophia.coordination_outbox SET state='superseded', updated_at=now() WHERE project_id=p_project AND work_id=p_work AND state='pending';
  UPDATE sophia.work_commissions SET state='superseded', reason='stopped before it was commissioned', updated_at=now()
   WHERE project_id=p_project AND work_id=p_work;
  RETURN;
 END IF;
 IF p_op IN ('hold','resume','stop') THEN
  UPDATE sophia.coordination_outbox SET state='superseded', updated_at=now() WHERE project_id=p_project AND work_id=p_work
   AND op IN ('hold','resume','stop') AND state='pending';
 END IF;
 INSERT INTO sophia.coordination_outbox(project_id,work_id,op,delivery_key) VALUES(p_project,p_work,p_op,key)
 ON CONFLICT (project_id,delivery_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION sophia.work_mirror(uuid,uuid,text,bigint) FROM PUBLIC;

-- Hold, Resume or Stop a work item's execution goal for p_actor (a member, or integration_actor() for a Paperclip
-- cancellation or the source guard). The same effect admit_goal_command (0012) has on a native episode goal, with
-- the work's own rules: a Hold may come before anything started, and a Resume queues again an attempt whose create
-- never reached the runtime. Raises 40001 when the goal's state does not allow it.
CREATE FUNCTION sophia.work_control(p_project uuid, w sophia.work_items, p_kind text, p_actor uuid, p_key text, p_origin text)
RETURNS sophia.commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals; c sophia.commands; b record; n integer:=0;
BEGIN
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=w.execution_goal_id FOR UPDATE;
 IF p_kind='hold' AND g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'The work is not running: it is %', g.status USING ERRCODE='40001'; END IF;
 IF p_kind='resume' AND g.status<>'held' THEN RAISE EXCEPTION 'The work is not held: it is %', g.status USING ERRCODE='40001'; END IF;
 IF p_kind='stop' AND g.status IN ('stopping','stopped','completed') THEN RAISE EXCEPTION 'The work has ended or is stopping' USING ERRCODE='40001'; END IF;
 IF p_kind='resume' AND NOT sophia.work_inputs_readable(p_project,w.id) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work: an input of this review was withdrawn' USING ERRCODE='42501'; END IF;
 UPDATE sophia.goals SET authority_epoch=authority_epoch+1, state_revision=state_revision+1,
  status=CASE p_kind WHEN 'hold' THEN 'holding' WHEN 'stop' THEN 'stopping' ELSE 'running' END
  WHERE project_id=p_project AND id=g.id RETURNING * INTO g;
 IF p_kind IN ('hold','stop') THEN
  UPDATE sophia.outbox SET state='superseded' WHERE project_id=p_project AND goal_id=g.id AND state='pending' AND NOT cleanup;
 END IF;
 INSERT INTO sophia.commands(project_id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,state)
 VALUES(p_project,p_actor,g.id,g.revision,g.authority_epoch,p_kind,p_key,
  jsonb_build_object('kind',p_kind,'workId',w.id,'origin',p_origin),'admitted') RETURNING * INTO c;
 PERFORM sophia.emit_service_event(p_project,'command.admitted','command',c.id,1,'command.'||p_kind,jsonb_build_array(w.id));
 IF p_kind IN ('hold','stop') THEN
  FOR b IN SELECT eb.id FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
   WHERE wa.project_id=p_project AND wa.goal_id=g.id AND eb.state<>'settled' LOOP
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch,cleanup)
   VALUES(p_project,c.id,'native.stop','binding/'||b.id,b.id,g.id,g.authority_epoch,true);
   n:=n+1;
  END LOOP;
 ELSE
  -- An attempt held before its create reached the runtime is queued again, under the new epoch (as 0028 does for
  -- research); one the runtime holds is resumed.
  FOR b IN SELECT j.command_id, eb.id AS binding_id FROM sophia.jobs j
    JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
    JOIN sophia.execution_bindings eb ON eb.project_id=j.project_id AND eb.attempt_id=j.attempt_id
    WHERE j.project_id=p_project AND wa.goal_id=g.id AND j.kind='source_review' AND j.state='pending' AND wa.state='admitted'
     AND eb.state IN ('created','settled')
     AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands rc WHERE rc.project_id=eb.project_id AND rc.binding_id=eb.id) LOOP
   UPDATE sophia.execution_bindings SET state='created' WHERE project_id=p_project AND id=b.binding_id;
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
   VALUES(p_project,b.command_id,'native.create','binding/'||b.binding_id||'/'||g.authority_epoch,b.binding_id,g.id,g.authority_epoch);
   n:=n+1;
  END LOOP;
  FOR b IN SELECT eb.id FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
   WHERE wa.project_id=p_project AND wa.goal_id=g.id AND eb.continuation_owner='sophia_episode' AND eb.state IN ('launching','running','idle') LOOP
   INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
   VALUES(p_project,c.id,'native.resume','binding/'||b.id,b.id,g.id,g.authority_epoch);
   n:=n+1;
  END LOOP;
 END IF;
 IF n=0 THEN
  INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,goal_id,authority_epoch,cleanup)
  VALUES(p_project,c.id,'control.settle','control/empty',g.id,g.authority_epoch,true);
 END IF;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION sophia.work_control(uuid,sophia.work_items,text,uuid,text,text) FROM PUBLIC;

-- Every change of an execution goal's status that Paperclip must know of is mirrored, whichever path made it.
CREATE FUNCTION sophia.work_goal_mirror() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE w sophia.work_items; op text;
BEGIN
 SELECT * INTO w FROM sophia.work_items WHERE project_id=NEW.project_id AND execution_goal_id=NEW.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 op:=CASE WHEN NEW.status='holding' THEN 'hold' WHEN NEW.status='stopping' THEN 'stop'
  WHEN NEW.status='running' AND OLD.status IN ('holding','held') THEN 'resume' WHEN NEW.status='completed' THEN 'complete' END;
 IF op IS NOT NULL THEN PERFORM sophia.work_mirror(NEW.project_id,w.id,op,NEW.authority_epoch); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.work_goal_mirror() FROM PUBLIC;
CREATE TRIGGER goals_mirror_work AFTER UPDATE OF status ON sophia.goals FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION sophia.work_goal_mirror();

-- A work item that can no longer succeed: its reason, and Paperclip told (the issue is closed as failed).
CREATE FUNCTION sophia.work_fail(p_project uuid, p_work uuid, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE g sophia.goals;
BEGIN
 UPDATE sophia.work_items SET closed_reason=coalesce(closed_reason,left(p_reason,500)) WHERE project_id=p_project AND id=p_work;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_items w ON w.project_id=g2.project_id AND w.execution_goal_id=g2.id
  WHERE w.project_id=p_project AND w.id=p_work;
 PERFORM sophia.work_mirror(p_project,p_work,'fail',g.authority_epoch);
 PERFORM sophia.emit_service_event(p_project,'work.failed','work_item',p_work,g.state_revision,'work.failed');
END $$;
REVOKE ALL ON FUNCTION sophia.work_fail(uuid,uuid,text) FROM PUBLIC;

-- --- admission ---------------------------------------------------------------------------------------------------

-- A stored operation of the caller under this key, checked against the request it now carries. Null when new.
CREATE FUNCTION sophia.work_prior(p_project uuid, p_key text, p_operation text, p_semantic jsonb) RETURNS sophia.work_operations
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.work_operations;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.work_operations WHERE project_id=p_project AND actor_id=sophia.actor_id() AND idempotency_key=p_key;
 IF FOUND AND (prior.operation<>p_operation OR prior.semantic_request<>p_semantic) THEN
  RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 RETURN prior;
END $$;
REVOKE ALL ON FUNCTION sophia.work_prior(uuid,text,text,jsonb) FROM PUBLIC;

-- The proposal's checked request: goal, criteria and sources, as the plan will name them.
CREATE FUNCTION sophia.source_review_request(p_project uuid, p_request jsonb, OUT g sophia.goals, OUT criteria jsonb,
 OUT sources uuid[], OUT allowance numeric, OUT purpose text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE wanted text[]; total bigint;
BEGIN
 IF jsonb_typeof(p_request)<>'object' OR coalesce(p_request->>'goalId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_request->'goalRevision')<>'number' THEN RAISE EXCEPTION 'A review names its goal and the goal''s revision' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'sourceIds')<>'array' OR jsonb_array_length(p_request->'sourceIds') NOT BETWEEN 1 AND 3
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'sourceIds') x
   WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'A review reads one to three sources' USING ERRCODE='22023'; END IF;
 SELECT array_agg(v::uuid ORDER BY n) INTO sources FROM jsonb_array_elements_text(p_request->'sourceIds') WITH ORDINALITY AS x(v,n);
 IF cardinality(sources)<>(SELECT count(DISTINCT s) FROM unnest(sources) s) THEN RAISE EXCEPTION 'A source is named twice' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'allowanceUsd')<>'number' THEN RAISE EXCEPTION 'A review names a positive allowance' USING ERRCODE='22023'; END IF;
 allowance:=(p_request->>'allowanceUsd')::numeric;
 IF allowance<=0 OR allowance>1000 OR allowance<>round(allowance,6) THEN RAISE EXCEPTION 'A review names a positive allowance' USING ERRCODE='22023'; END IF;
 purpose:=nullif(btrim(coalesce(p_request->>'purpose','')),'');
 IF purpose IS NOT NULL AND length(purpose)>300 THEN RAISE EXCEPTION 'A review''s purpose is at most 300 characters' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=(p_request->>'goalId')::uuid FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM sophia.work_items w WHERE w.project_id=p_project AND w.execution_goal_id=g.id) THEN
  RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 IF g.revision<>(p_request->>'goalRevision')::bigint THEN RAISE EXCEPTION 'Stale goal revision: review its current criteria' USING ERRCODE='40001'; END IF;
 IF p_request ? 'criterionIds' THEN
  IF jsonb_typeof(p_request->'criterionIds')<>'array' OR jsonb_array_length(p_request->'criterionIds') NOT BETWEEN 1 AND 20 THEN
   RAISE EXCEPTION 'Invalid criteria selection' USING ERRCODE='22023'; END IF;
  SELECT array_agg(v ORDER BY n) INTO wanted FROM jsonb_array_elements_text(p_request->'criterionIds') WITH ORDINALITY AS x(v,n);
  IF EXISTS(SELECT 1 FROM unnest(wanted) v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.criteria) c WHERE c->>'id'=v)) THEN
   RAISE EXCEPTION 'A selected criterion is not one of the goal''s' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c->>'id','description',left(coalesce(c->>'description',c->>'id'),500),
   'required',coalesce((c->>'required')::boolean,true)) ORDER BY n),'[]') INTO criteria
  FROM jsonb_array_elements(g.criteria) WITH ORDINALITY AS x(c,n)
  WHERE c->>'id' IS NOT NULL AND (wanted IS NULL OR c->>'id'=ANY(wanted));
 IF jsonb_array_length(criteria)=0 THEN RAISE EXCEPTION 'The goal has no criteria to review against' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(sources) s WHERE NOT sophia.review_source_readable(p_project,s)) THEN
  RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 SELECT sum(octet_length(t.body)) INTO total FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=ANY(sources);
 IF total>(sophia.source_review_limits()->>'maxInputBytes')::bigint THEN
  RAISE EXCEPTION 'The selected sources hold % bytes of text; a review reads at most 32 KiB', total USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.source_review_request(uuid,jsonb) FROM PUBLIC;

-- POST /api/v1/projects/{projectId}/plans/source-review: one deterministic proposed review plan and its decision.
-- p_route is the registry's specialist (role, route id, provider, model, effort, output ceiling, prices), resolved by
-- the API; nothing in it comes from the request. No model, issue or provider work happens here.
CREATE FUNCTION sophia.propose_source_review(p_project uuid, p_key text, p_request jsonb, p_route jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pr sophia.projects; cg sophia.coordination_grants; rg sophia.research_grants; prior sophia.work_operations;
 req record; semantic jsonb; plan uuid:=gen_random_uuid(); work uuid:=gen_random_uuid(); asg uuid:=gen_random_uuid();
 decision uuid:=gen_random_uuid(); criteria_ref text; manifest jsonb; ms sophia.source_objects; definition jsonb;
 cursor_value bigint; result jsonb; cap numeric;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_route IS NULL OR p_route->>'role' !~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$' OR p_route->>'id' !~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$' THEN
  RAISE EXCEPTION 'Invalid review specialist' USING ERRCODE='22023'; END IF;
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind','source_review','goalId',p_request->'goalId','goalRevision',p_request->'goalRevision',
  'criterionIds',p_request->'criterionIds','sourceIds',p_request->'sourceIds','allowanceUsd',p_request->'allowanceUsd',
  'purpose',encode(sha256(convert_to(coalesce(p_request->>'purpose',''),'UTF8')),'hex'),'role',p_route->>'role','route',p_route->>'id');
 prior:=sophia.work_prior(p_project,p_key,'propose_source_review',semantic);
 IF prior.project_id IS NOT NULL THEN RETURN prior.result; END IF;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=p_project;
 IF NOT FOUND OR cg.state<>'enabled' THEN RAISE EXCEPTION 'Source review is not enabled for this project' USING ERRCODE='55000'; END IF;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 IF NOT FOUND OR rg.state<>'enabled' THEN RAISE EXCEPTION 'Source review is not enabled for this project: it has no spend authority' USING ERRCODE='55000'; END IF;
 SELECT * INTO req FROM sophia.source_review_request(p_project,p_request);
 cap:=least(cg.review_cap_usd,rg.task_cap_usd);
 IF req.allowance>cap THEN RAISE EXCEPTION 'The allowance is above this project''s cap of % USD for one review', cap USING ERRCODE='22023'; END IF;
 criteria_ref:='criteria:'||(req.g).id||'@'||(req.g).revision||':'||left(encode(sha256(convert_to(req.criteria::text,'UTF8')),'hex'),16);
 manifest:=jsonb_build_object('schema','sophia.source-review-manifest.v1','projectId',p_project,'planId',plan,'workId',work,
  'recipe',p_route->>'role','role',p_route->>'role','route',p_route,'promptVersion','sophia-source-review-instruction-v1',
  'goal',jsonb_build_object('id',(req.g).id,'revision',(req.g).revision,'title',(req.g).title,'outcome',(req.g).outcome,
   'criteriaRef',criteria_ref,'criteria',req.criteria),
  'missionRevision',pr.mission_revision,'purpose',req.purpose,
  'sources',(SELECT jsonb_agg(jsonb_build_object('ref','S'||x.n,'sourceId',s.id,'sha256',s.sha256,'mime',s.mime,'byteLength',s.byte_length) ORDER BY x.n)
   FROM unnest(req.sources) WITH ORDINALITY AS x(sid,n) JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=x.sid),
  'limits',sophia.source_review_limits(),'allowanceUsd',req.allowance);
 ms:=sophia.put_text_source(p_project,a,'application/json',jsonb_pretty(manifest));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT p_project,x,ms.id FROM unnest(req.sources) x;
 definition:=jsonb_build_object('schema_version','sophia.work.plan.v2','plan_id',plan,'project_id',p_project,'goal_id',(req.g).id,
  'goal_revision',(req.g).revision,'criteria_ref',criteria_ref,'revision',1,'mission_revision',pr.mission_revision,
  'source_manifest_ref',ms.id,
  'assumptions',jsonb_build_array(jsonb_build_object('id','selected-sources-only','text',
   'The selected sources are the evidence this review may use; nothing else is read.','status','unresolved','evidence_refs','[]'::jsonb)),
  'items',jsonb_build_array(jsonb_build_object('id',work,
   'purpose',coalesce(req.purpose,'Review the selected sources against the goal''s criteria'),
   'deliverable_ref','deliverable:source-review-report-v1','criteria_ref',criteria_ref,'parent_id',NULL,'blocked_by','[]'::jsonb,
   'assignee_kind','assignment','assignee_id',asg,'source_scope_ref',ms.id,'review_policy_ref','policy:source-review-structural-v1',
   'recipe_ref',p_route->>'role','activation',jsonb_build_object('kind','immediate','producer_work_id',NULL))));
 INSERT INTO sophia.work_plans(project_id,id,goal_id,goal_revision,criteria_ref,mission_revision,recipe,route,work_id,assignment_id,
  source_ids,manifest_source_id,definition,allowance_usd,proposed_by,decision_id)
 VALUES(p_project,plan,(req.g).id,(req.g).revision,criteria_ref,pr.mission_revision,p_route->>'role',p_route->>'id',work,asg,
  req.sources,ms.id,definition,req.allowance,a,decision);
 INSERT INTO sophia.work_decisions(project_id,id,kind,plan_id,plan_revision,work_id,question,decider_id,choices,expires_at)
 VALUES(p_project,decision,'plan_admission',plan,1,work,
  left('Start this source review? It reads '||cardinality(req.sources)||CASE WHEN cardinality(req.sources)=1 THEN ' source' ELSE ' sources' END
   ||' against '||jsonb_array_length(req.criteria)||CASE WHEN jsonb_array_length(req.criteria)=1 THEN ' criterion' ELSE ' criteria' END
   ||' with an allowance of '||req.allowance||' USD.',500),
  a,jsonb_build_array(jsonb_build_object('key','accept','label','Start the review'),jsonb_build_object('key','decline','label','Not now')),
  now()+interval '24 hours');
 cursor_value:=sophia.emit_service_event(p_project,'plan.proposed','work_plan',plan,1,'plan.proposed',jsonb_build_array((req.g).id,decision,ms.id));
 result:=jsonb_build_object('projectId',p_project,'planId',plan,'planRevision',1,'decisionId',decision,'decisionRevision',1,
  'workId',work,'goalId',(req.g).id,'goalRevision',(req.g).revision,'criteriaRef',criteria_ref,'manifestSourceId',ms.id,
  'allowanceUsd',req.allowance,'limits',sophia.source_review_limits(),'route',p_route,'cursor',cursor_value::text);
 INSERT INTO sophia.work_operations(project_id,actor_id,idempotency_key,operation,semantic_request,work_id,outcome,result)
 VALUES(p_project,a,p_key,'propose_source_review',semantic,work,'recorded',result);
 RETURN result;
END $$;

-- The receipt (sophia.work.receipt.v1) of a stored operation, as its effect stands now. Its revision rises with what
-- is known: 1 recorded or refused, 2 delivered, 3 uncertain, 4 settled; a settled effect is final.
CREATE FUNCTION sophia.work_receipt(op sophia.work_operations) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.commands; g sophia.goals; delivery text:='not_applicable'; effect text:='not_applicable'; rev integer:=1;
 settled boolean; unsure boolean; delivered boolean; queued boolean;
BEGIN
 IF op.outcome='rejected' THEN
  delivery:='not_sent';
 ELSIF op.operation='answer_decision' THEN
  effect:='choice_recorded';
 ELSIF op.operation='command' THEN
  SELECT * INTO c FROM sophia.commands WHERE project_id=op.project_id AND id=op.command_id;
  SELECT * INTO g FROM sophia.goals WHERE project_id=c.project_id AND id=c.goal_id;
  queued:=EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=c.project_id AND o.command_id=c.id AND o.state IN ('pending','dispatching'));
  delivered:=EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=c.project_id AND o.command_id=c.id
   AND o.state IN ('acknowledged','settled') AND o.destination<>'control.settle');
  unsure:=c.state IN ('outcome_unknown','denied') OR EXISTS(SELECT 1 FROM sophia.outbox o WHERE o.project_id=c.project_id AND o.command_id=c.id
   AND o.state IN ('outcome_unknown','denied'));
  settled:=CASE c.kind WHEN 'hold' THEN c.state='checked' OR (g.status='held' AND g.authority_epoch=c.authority_epoch)
   WHEN 'stop' THEN g.status='stopped' AND g.authority_epoch=c.authority_epoch
   ELSE c.state IN ('acknowledged','checked') END;
  delivery:=CASE WHEN delivered THEN 'delivered' WHEN queued THEN 'queued' WHEN unsure THEN 'unknown'
   WHEN settled THEN 'not_applicable' ELSE 'queued' END;
  effect:=CASE WHEN settled THEN CASE c.kind WHEN 'hold' THEN 'held' WHEN 'stop' THEN 'stopped' ELSE 'resumed' END
   WHEN unsure THEN 'unknown' ELSE 'pending' END;
  rev:=CASE WHEN settled THEN 4 WHEN unsure THEN 3 WHEN delivered THEN 2 ELSE 1 END;
 END IF;
 RETURN jsonb_build_object('schema_version','sophia.work.receipt.v1','operation_id',op.idempotency_key,
  'receipt_id','receipt:'||md5(op.project_id::text||op.actor_id::text||op.idempotency_key)||':'||rev,
  'project_id',op.project_id,'work_id',coalesce(op.work_id::text,'none'),'assignment_id',op.assignment_id,
  'assignment_generation',op.assignment_generation,'kind',coalesce(op.kind,'decision'),'revision',rev,
  'observed_at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'admission',op.outcome,'delivery',delivery,
  'effect',effect,'rejection',op.rejection,
  'evidence_refs',CASE WHEN op.command_id IS NOT NULL THEN jsonb_build_array('command:'||op.command_id)
   WHEN op.operation='answer_decision' THEN jsonb_build_array('decision:'||(op.semantic_request->>'decisionId'))
   ELSE '[]'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION sophia.work_receipt(sophia.work_operations) FROM PUBLIC;

-- Store a refused operation (it changed nothing) and answer with its receipt.
CREATE FUNCTION sophia.work_refuse(p_project uuid, p_key text, p_operation text, p_semantic jsonb, p_kind text, p_work uuid,
 p_assignment uuid, p_generation integer, p_rejection text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE op sophia.work_operations;
BEGIN
 INSERT INTO sophia.work_operations(project_id,actor_id,idempotency_key,operation,semantic_request,kind,work_id,assignment_id,
  assignment_generation,outcome,rejection)
 VALUES(p_project,sophia.actor_id(),p_key,p_operation,p_semantic,p_kind,p_work,p_assignment,p_generation,'rejected',p_rejection)
 RETURNING * INTO op;
 RETURN sophia.work_receipt(op);
END $$;
REVOKE ALL ON FUNCTION sophia.work_refuse(uuid,text,text,jsonb,text,uuid,uuid,integer,text) FROM PUBLIC;

-- Commit an accepted plan: its work item, assignment, execution goal, allowance and commission, in one transaction.
CREATE FUNCTION sophia.work_admit(p_project uuid, p sophia.work_plans, p_actor uuid, cg sophia.coordination_grants) RETURNS sophia.work_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE pr sophia.projects; reviewed sophia.goals; eg uuid:=gen_random_uuid(); al sophia.research_allowances; w sophia.work_items;
BEGIN
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT * INTO reviewed FROM sophia.goals WHERE project_id=p_project AND id=p.goal_id;
 INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,mission_revision,status)
 VALUES(p_project,eg,left('Source review: '||regexp_replace(reviewed.title,'\s+',' ','g'),120),
  'A stored review of the selected sources against the goal''s criteria. Completing the review accepts nothing it reviews.',
  jsonb_build_array(jsonb_build_object('id','review-stored','description',
   'A bounded review report is stored, and every finding cites a manifest source the reviewer read','required',true,'verification','structural')),
  pr.mission_revision,'ready');
 INSERT INTO sophia.research_allowances(project_id,root_job_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
 VALUES(p_project,NULL,p.allowance_usd,0,'source-review-v1',0,0) RETURNING * INTO al;
 INSERT INTO sophia.work_items(project_id,id,plan_id,plan_revision,execution_goal_id,allowance_id,accepted_by)
 VALUES(p_project,p.work_id,p.id,p.revision,eg,al.id,p_actor) RETURNING * INTO w;
 INSERT INTO sophia.work_assignments(project_id,id,work_id,generation,executor_kind,role,route)
 VALUES(p_project,p.assignment_id,p.work_id,1,'sophia_native',p.recipe,p.route);
 INSERT INTO sophia.work_commissions(project_id,work_id,commission_key,paperclip_company_id,paperclip_project_id)
 VALUES(p_project,p.work_id,'sophia-wbc02-'||p.work_id,cg.paperclip_company_id,cg.paperclip_project_id);
 INSERT INTO sophia.coordination_outbox(project_id,work_id,op,delivery_key) VALUES(p_project,p.work_id,'commission','commission-'||p.work_id);
 PERFORM sophia.emit_service_event(p_project,'assignment.changed','work_item',p.work_id,1,'work.admitted',
  jsonb_build_array(p.id,p.assignment_id,eg));
 RETURN w;
END $$;
REVOKE ALL ON FUNCTION sophia.work_admit(uuid,sophia.work_plans,uuid,sophia.coordination_grants) FROM PUBLIC;

-- Why an accepted plan cannot be admitted now (definitely, so nothing is dispatched), or null.
CREATE FUNCTION sophia.work_admission_refusal(p_project uuid, p sophia.work_plans, cg sophia.coordination_grants) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN cg.project_id IS NULL OR cg.state<>'enabled' THEN 'unavailable'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.research_grants r WHERE r.project_id=p_project AND r.state='enabled'
    AND p.allowance_usd<=least(r.task_cap_usd,cg.review_cap_usd)) THEN 'unavailable'
  WHEN EXISTS(SELECT 1 FROM unnest(p.source_ids) x WHERE NOT sophia.review_source_readable(p_project,x)) THEN 'unavailable'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.goals g WHERE g.project_id=p_project AND g.id=p.goal_id AND g.revision=p.goal_revision) THEN 'conflict'
  -- One review of a goal runs at a time: another accepted plan's work that has not ended blocks this one.
  WHEN EXISTS(SELECT 1 FROM sophia.work_plans o JOIN sophia.work_items w ON w.project_id=o.project_id AND w.plan_id=o.id
    JOIN sophia.goals eg ON eg.project_id=w.project_id AND eg.id=w.execution_goal_id
    WHERE o.project_id=p_project AND o.goal_id=p.goal_id AND o.state='accepted' AND o.id<>p.id
     AND eg.status NOT IN ('stopped','completed') AND w.closed_reason IS NULL) THEN 'conflict'
  ELSE NULL END $$;
REVOKE ALL ON FUNCTION sophia.work_admission_refusal(uuid,sophia.work_plans,sophia.coordination_grants) FROM PUBLIC;

-- POST /api/v1/projects/{projectId}/decisions/{decisionId}/answer: the exact answer, once, and its receipt. Accepting
-- the plan admits its one work item and enqueues its one commission; declining or expiry dispatches nothing.
CREATE FUNCTION sophia.answer_work_decision(p_project uuid, p_decision uuid, p_key text, p_answer jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); d sophia.work_decisions; p sophia.work_plans; cg sophia.coordination_grants;
 prior sophia.work_operations; semantic jsonb; choice text:=p_answer->>'choice'; refusal text; op sophia.work_operations; w sophia.work_items;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_answer)<>'object' OR choice IS NULL OR jsonb_typeof(p_answer->'revision')<>'number' THEN
  RAISE EXCEPTION 'An answer names the decision''s revision and a choice' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 semantic:=jsonb_build_object('decisionId',p_decision,'revision',p_answer->'revision','choice',choice,'workId',p_answer->'work_id',
  'planId',p_answer->'plan_id','planRevision',p_answer->'plan_revision','candidateVersionRef',p_answer->'candidate_version_ref');
 prior:=sophia.work_prior(p_project,p_key,'answer_decision',semantic);
 IF prior.project_id IS NOT NULL THEN RETURN sophia.work_receipt(prior); END IF;
 SELECT * INTO d FROM sophia.work_decisions WHERE project_id=p_project AND id=p_decision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Decision not found' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.choices) c WHERE c->>'key'=choice) THEN RAISE EXCEPTION 'Not one of the decision''s choices' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM sophia.work_plans WHERE project_id=p_project AND id=d.plan_id FOR UPDATE;
 refusal:=CASE
  WHEN (p_answer->>'revision')::integer<>d.revision OR p_answer->>'work_id' IS DISTINCT FROM d.work_id::text
   OR p_answer->>'plan_id' IS DISTINCT FROM d.plan_id::text OR (p_answer->>'plan_revision')::integer IS DISTINCT FROM d.plan_revision
   OR d.state NOT IN ('proposed') THEN 'conflict'
  WHEN d.decider_id<>a OR NOT sophia.can_edit(p_project) THEN 'denied'
  WHEN d.expires_at<=now() THEN 'expired' END;
 IF refusal='expired' THEN
  UPDATE sophia.work_decisions SET state='expired' WHERE project_id=p_project AND id=d.id;
  UPDATE sophia.work_plans SET state='expired', state_revision=state_revision+1 WHERE project_id=p_project AND id=p.id;
  PERFORM sophia.emit_service_event(p_project,'decision.resolved','work_decision',d.id,d.revision,'decision.expired',jsonb_build_array(p.id));
 END IF;
 IF refusal IS NULL AND choice='accept' THEN
  SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=p_project;
  refusal:=sophia.work_admission_refusal(p_project,p,cg);
 END IF;
 IF refusal IS NOT NULL THEN
  RETURN sophia.work_refuse(p_project,p_key,'answer_decision',semantic,'decision',d.work_id,NULL,NULL,refusal);
 END IF;
 UPDATE sophia.work_decisions SET state=CASE choice WHEN 'accept' THEN 'accepted' ELSE 'declined' END, selected_choice=choice,
  answered_by=a, answered_at=now(), choice_operation=p_key WHERE project_id=p_project AND id=d.id;
 UPDATE sophia.work_plans SET state=CASE choice WHEN 'accept' THEN 'accepted' ELSE 'declined' END, state_revision=state_revision+1
  WHERE project_id=p_project AND id=p.id RETURNING * INTO p;
 IF choice='accept' THEN
  -- The goal's earlier accepted plan, whose work has ended, is no longer its current plan.
  UPDATE sophia.work_plans SET state='superseded', state_revision=state_revision+1
   WHERE project_id=p_project AND goal_id=p.goal_id AND state='accepted' AND id<>p.id;
  w:=sophia.work_admit(p_project,p,a,cg);
 END IF;
 PERFORM sophia.emit_service_event(p_project,'decision.resolved','work_decision',d.id,d.revision,'decision.'||choice,jsonb_build_array(p.id));
 PERFORM sophia.emit_service_event(p_project,'plan.revised','work_plan',p.id,p.state_revision,'plan.'||p.state,jsonb_build_array(p.goal_id));
 INSERT INTO sophia.work_operations(project_id,actor_id,idempotency_key,operation,semantic_request,kind,work_id,outcome,result)
 VALUES(p_project,a,p_key,'answer_decision',semantic,'decision',d.work_id,'recorded',
  jsonb_build_object('decisionId',d.id,'revision',d.revision,'choice',choice,'planId',p.id,'planState',p.state))
 RETURNING * INTO op;
 RETURN sophia.work_receipt(op);
END $$;

-- POST /api/v1/projects/{projectId}/assignments/{assignmentId}/commands: Hold, Resume or Stop of the assignment's work,
-- bound to its generation. Guidance is refused as unavailable before anything is sent. A refusal changes nothing.
CREATE FUNCTION sophia.work_command(p_project uuid, p_assignment uuid, p_key text, p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); kind text:=p_command->>'kind'; asg sophia.work_assignments; w sophia.work_items;
 prior sophia.work_operations; semantic jsonb; c sophia.commands; op sophia.work_operations; refusal text;
 generation integer;
BEGIN
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF kind IS NULL OR kind NOT IN ('guidance','hold','resume','stop') OR jsonb_typeof(p_command->'assignment_generation')<>'number'
  OR coalesce(p_command->>'work_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'A command names its kind, its work and its assignment''s generation' USING ERRCODE='22023'; END IF;
 generation:=(p_command->>'assignment_generation')::integer;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 semantic:=jsonb_build_object('assignmentId',p_assignment,'kind',kind,'workId',p_command->'work_id','generation',generation,
  'attemptId',p_command->'attempt_id','text',CASE WHEN p_command ? 'text' THEN encode(sha256(convert_to(p_command->>'text','UTF8')),'hex') END);
 prior:=sophia.work_prior(p_project,p_key,'command',semantic);
 IF prior.project_id IS NOT NULL THEN RETURN sophia.work_receipt(prior); END IF;
 SELECT * INTO asg FROM sophia.work_assignments WHERE project_id=p_project AND id=p_assignment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=p_project AND id=asg.work_id FOR UPDATE;
 refusal:=CASE
  WHEN kind='guidance' THEN 'unavailable'
  WHEN asg.work_id::text<>p_command->>'work_id' OR asg.state<>'active' OR asg.generation<>generation THEN 'conflict'
  WHEN NOT sophia.can_edit(p_project) THEN 'denied' END;
 IF refusal IS NULL THEN
  BEGIN
   c:=sophia.work_control(p_project,w,kind,a,'work:'||p_key,'studio');
  EXCEPTION WHEN SQLSTATE '40001' THEN refusal:='conflict';
   WHEN SQLSTATE '42501' THEN refusal:='unavailable';
  END;
 END IF;
 IF refusal IS NOT NULL THEN
  RETURN sophia.work_refuse(p_project,p_key,'command',semantic,kind,w.id,asg.id,generation,refusal);
 END IF;
 INSERT INTO sophia.work_operations(project_id,actor_id,idempotency_key,operation,semantic_request,kind,work_id,assignment_id,
  assignment_generation,command_id,outcome)
 VALUES(p_project,a,p_key,'command',semantic,kind,w.id,asg.id,generation,c.id,'recorded') RETURNING * INTO op;
 RETURN sophia.work_receipt(op);
END $$;

-- GET /api/v1/projects/{projectId}/work/operations/{operationId}: the caller's own operation, as it stands now.
CREATE FUNCTION sophia.work_operation_receipt(p_project uuid, p_key text) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE op sophia.work_operations;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO op FROM sophia.work_operations WHERE project_id=p_project AND actor_id=sophia.actor_id() AND idempotency_key=p_key;
 IF NOT FOUND OR op.operation='propose_source_review' THEN RAISE EXCEPTION 'Operation not found' USING ERRCODE='22023'; END IF;
 RETURN sophia.work_receipt(op);
END $$;

-- GET /api/v1/projects/{projectId}/work/{workId}/result: the exact result version, while every source it drew on can
-- still be read; otherwise pending, withdrawn or unavailable. Never a URL, never another version.
CREATE FUNCTION sophia.read_work_result(p_project uuid, p_work uuid, p_version uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE w sophia.work_items; r sophia.work_results; j sophia.jobs; body text;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=p_project AND id=p_work;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.work_results WHERE project_id=p_project AND work_id=p_work AND (p_version IS NULL OR source_id=p_version)
  ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN
  IF p_version IS NOT NULL THEN RETURN jsonb_build_object('state','unavailable','workId',p_work,'reason','No such result version'); END IF;
  SELECT j2.* INTO j FROM sophia.jobs j2 JOIN sophia.work_attempts wa ON wa.project_id=j2.project_id AND wa.id=j2.attempt_id
   WHERE wa.project_id=p_project AND wa.goal_id=w.execution_goal_id AND j2.kind='source_review' ORDER BY wa.id LIMIT 1;
  RETURN jsonb_build_object('state',CASE WHEN w.closed_reason IS NOT NULL OR j.state IN ('failed','cancelled') THEN 'unavailable' ELSE 'pending' END,
   'workId',p_work,'reason',coalesce(w.closed_reason,j.reason));
 END IF;
 IF r.state='withdrawn' OR NOT sophia.review_source_readable(p_project,r.source_id) OR NOT sophia.work_inputs_readable(p_project,p_work) THEN
  RETURN jsonb_build_object('state','withdrawn','workId',p_work,'sourceId',r.source_id,'reason',coalesce(r.withdrawn_reason,'An input of this review was withdrawn'));
 END IF;
 SELECT t.body INTO body FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=r.source_id;
 RETURN jsonb_build_object('state','ready','workId',p_work,'resultId',r.id,'sourceId',r.source_id,'versionId',r.source_id,
  'sha256',r.sha256,'mediaType','text/markdown','verdict',r.verdict,'findings',r.findings,'text',body,
  'createdAt',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;

-- What the pilot entry may offer the caller now (GET .../plans/source-review): enabled or why not, and the bounds.
CREATE FUNCTION sophia.source_review_availability(p_project uuid, p_role text, p_route text) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cg sophia.coordination_grants; rg sophia.research_grants; reason text; ready boolean;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=p_project;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 ready:=EXISTS(SELECT 1 FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL);
 reason:=CASE WHEN cg.project_id IS NULL OR cg.state<>'enabled' THEN 'Source review is not enabled for this project.'
  WHEN rg.project_id IS NULL OR rg.state<>'enabled' THEN 'This project has no spend authority for reviews.'
  WHEN NOT sophia.can_edit(p_project) THEN 'Only members who can edit start reviews.' END;
 RETURN jsonb_build_object('enabled',reason IS NULL,'reason',reason,'runtimeReady',ready,
  'maxAllowanceUsd',CASE WHEN reason IS NULL THEN least(cg.review_cap_usd,rg.task_cap_usd) END,'limits',sophia.source_review_limits(),
  -- What the entry offers to review: report versions whose text can be read, newest first. Manifests, drafts and
  -- other internal sources are not offered.
  'sources',(SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') FROM (
   SELECT jsonb_build_object('sourceId',v.source_id,'label',left(a.title||coalesce(' · version '||v.version_number,''),200),'mime',s.mime,
    'byteLength',s.byte_length,'createdAt',to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS x,
    row_number() OVER (ORDER BY v.created_at DESC, v.id) AS n
   FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
    JOIN sophia.source_objects s ON s.project_id=v.project_id AND s.id=v.source_id
   WHERE v.project_id=p_project AND v.state IN ('stable','superseded','validated')
    AND s.byte_length<=(sophia.source_review_limits()->>'maxInputBytes')::bigint
    AND sophia.review_source_readable(p_project,v.source_id)
   ORDER BY v.created_at DESC, v.id LIMIT 50) q));
END $$;

-- --- the Paperclip adapter's effect permit ---------------------------------------------------------------------------

-- Authenticate the adapter's credential for one Paperclip company. Never a member identity.
CREATE FUNCTION sophia.coordination_caller(p_token_sha256 bytea, p_company text) RETURNS sophia.coordination_integrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE ci sophia.coordination_integrations;
BEGIN
 IF sophia.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'Integration calls cannot carry a member identity' USING ERRCODE='42501'; END IF;
 SELECT * INTO ci FROM sophia.coordination_integrations WHERE token_sha256=p_token_sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'Integration credential not recognized' USING ERRCODE='28000'; END IF;
 IF ci.state<>'active' THEN RAISE EXCEPTION 'Integration credential revoked' USING ERRCODE='42501'; END IF;
 IF p_company IS DISTINCT FROM ci.paperclip_company_id THEN
  RAISE EXCEPTION 'Integration credential belongs to another company' USING ERRCODE='42501'; END IF;
 RETURN ci;
END $$;
REVOKE ALL ON FUNCTION sophia.coordination_caller(bytea,text) FROM PUBLIC;

-- The attempt of a work item that is live or whose state is unknown (one may still be running): never a second one.
CREATE FUNCTION sophia.work_live_attempt(p_project uuid, w sophia.work_items) RETURNS uuid LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT wa.id FROM sophia.work_attempts wa JOIN sophia.execution_bindings b ON b.project_id=wa.project_id AND b.attempt_id=wa.id
  JOIN sophia.jobs j ON j.project_id=wa.project_id AND j.attempt_id=wa.id AND j.kind='source_review'
  WHERE wa.project_id=p_project AND wa.goal_id=w.execution_goal_id
   AND (b.state IN ('created','launching','running','idle','stopping') OR j.state='outcome_unknown' OR wa.state='outcome_unknown')
  ORDER BY wa.id LIMIT 1 $$;
REVOKE ALL ON FUNCTION sophia.work_live_attempt(uuid,sophia.work_items) FROM PUBLIC;

-- A runtime of the project that carries the work's role on its route (it may still be connecting).
CREATE FUNCTION sophia.work_runtime(p_project uuid, p_role text, p_route text) RETURNS sophia.runtime_instances LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.* FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route))
  ORDER BY (sophia.runtime_unavailable(r) IS NULL) DESC, r.seen_at DESC NULLS LAST LIMIT 1 $$;
REVOKE ALL ON FUNCTION sophia.work_runtime(uuid,text,text) FROM PUBLIC;

-- Whether the work's allowance can still pay one model call, by the pilot's count and its money.
CREATE FUNCTION sophia.work_allowance_left(p_project uuid, w sophia.work_items) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT a.reserved_usd+a.spent_usd+a.uncertain_usd<a.cap_usd AND a.overrun_usd=a.reconciled_overrun_usd
  AND (SELECT count(*) FROM sophia.research_reservations r WHERE r.project_id=a.project_id AND r.allowance_id=a.id
   AND r.kind='model' AND r.state<>'released')<(sophia.source_review_limits()->>'maxModelRequests')::integer
  FROM sophia.research_allowances a WHERE a.project_id=p_project AND a.id=w.allowance_id $$;
REVOKE ALL ON FUNCTION sophia.work_allowance_left(uuid,sophia.work_items) FROM PUBLIC;

-- Why this run may not act on the work now, or null. A held, stopped or finished work, a withdrawn input, an ended
-- attempt or a spent allowance each stop it before any effect.
CREATE FUNCTION sophia.work_denial(p_project uuid, w sophia.work_items, g sophia.goals, cg sophia.coordination_grants, p_company text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN cg.project_id IS NULL OR cg.state<>'enabled' OR cg.paperclip_company_id<>p_company THEN 'not_enrolled'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.work_plans p WHERE p.project_id=p_project AND p.id=w.plan_id AND p.state='accepted') THEN 'plan_not_accepted'
  WHEN NOT EXISTS(SELECT 1 FROM sophia.work_assignments x WHERE x.project_id=p_project AND x.work_id=w.id AND x.state='active') THEN 'no_assignment'
  WHEN g.status IN ('holding','held') THEN 'held'
  WHEN g.status IN ('stopping','stopped') THEN 'stopped'
  WHEN g.status='completed' THEN 'complete'
  WHEN w.closed_reason IS NOT NULL THEN 'closed'
  WHEN NOT sophia.work_inputs_readable(p_project,w.id) THEN 'source_withdrawn'
  ELSE NULL END $$;
REVOKE ALL ON FUNCTION sophia.work_denial(uuid,sophia.work_items,sophia.goals,sophia.coordination_grants,text) FROM PUBLIC;

CREATE FUNCTION sophia.work_denial_text(p_code text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_code
  WHEN 'not_commissioned' THEN 'This issue is not work Sophia commissioned.'
  WHEN 'not_enrolled' THEN 'Source review is not enabled for this work''s project and company.'
  WHEN 'plan_not_accepted' THEN 'The plan of this work is not accepted.'
  WHEN 'no_assignment' THEN 'This work has no active assignment.'
  WHEN 'held' THEN 'The work is held in Sophia. Only an explicit Resume there continues it.'
  WHEN 'stopped' THEN 'The work was stopped in Sophia.'
  WHEN 'complete' THEN 'The work is complete.'
  WHEN 'closed' THEN 'The work ended without a result; a new attempt needs a new decision.'
  WHEN 'source_withdrawn' THEN 'An input of this review was withdrawn.'
  WHEN 'attempt_ended' THEN 'This work''s attempt ended; a new attempt needs a new decision.'
  WHEN 'runtime_unavailable' THEN 'No Sophia runtime carries the source reviewer.'
  WHEN 'allowance_spent' THEN 'The work''s allowance is spent.'
  WHEN 'stale_assignment' THEN 'The run belongs to an earlier assignment of this work.'
  ELSE p_code END $$;
REVOKE ALL ON FUNCTION sophia.work_denial_text(text) FROM PUBLIC;

-- POST /v1/coordination/permit: may this Paperclip run act on its issue's work, and how. A live or uncertain attempt
-- is attached to; only a work item with no attempt yet is started; anything else is denied before any effect. A run
-- that started, attached or ended is answered as recorded, with its attempt. A start permit the run has not used is
-- decided again under current authority (Codex on #107: an expired one was otherwise replayed forever): still
-- startable, it is kept, renewed once expired; attached to the attempt another run started meanwhile; or denied, with
-- the run's record left as it was. Only the run's own credential asks for it again.
CREATE FUNCTION sophia.coordination_permit(p_token_sha256 bytea, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE company text:=p_request->>'companyId'; issue text:=p_request->>'issueId'; run_id text:=p_request->>'runId';
 ci sophia.coordination_integrations:=sophia.coordination_caller(p_token_sha256,company); cm sophia.work_commissions;
 w sophia.work_items; g sophia.goals; cg sophia.coordination_grants; asg sophia.work_assignments; r sophia.work_runs;
 code text; live uuid; chosen text; b sophia.execution_bindings;
BEGIN
 IF coalesce(issue,'') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' OR coalesce(run_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' THEN
  RAISE EXCEPTION 'A permit names its issue and its run' USING ERRCODE='22023'; END IF;
 SELECT * INTO cm FROM sophia.work_commissions WHERE paperclip_company_id=company AND paperclip_issue_id=issue;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('decision','deny','code','not_commissioned','reason',sophia.work_denial_text('not_commissioned'));
 END IF;
 PERFORM 1 FROM sophia.projects WHERE id=cm.project_id FOR UPDATE;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=cm.project_id AND id=cm.work_id FOR UPDATE;
 SELECT * INTO r FROM sophia.work_runs WHERE paperclip_company_id=company AND paperclip_run_id=run_id FOR UPDATE;
 IF FOUND THEN
  IF r.work_id<>w.id OR r.paperclip_issue_id<>issue THEN RAISE EXCEPTION 'Integration run names another issue' USING ERRCODE='42501'; END IF;
  IF r.integration_id<>ci.id THEN RAISE EXCEPTION 'Integration run belongs to another credential' USING ERRCODE='42501'; END IF;
  IF r.state<>'permitted' THEN
   SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=r.project_id AND attempt_id=r.attempt_id;
   RETURN jsonb_build_object('decision',r.decision,'workId',w.id,'assignmentId',r.assignment_id,'generation',r.assignment_generation,
    'attemptId',r.attempt_id,'nativeSessionId',b.native_session_id,'permitExpiresAt',r.permit_expires_at,'state',r.state);
  END IF;
 END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=cm.project_id AND id=w.execution_goal_id FOR UPDATE;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=cm.project_id;
 SELECT * INTO asg FROM sophia.work_assignments WHERE project_id=cm.project_id AND work_id=w.id AND state='active';
 code:=sophia.work_denial(cm.project_id,w,g,cg,company);
 IF code IS NULL AND r.paperclip_run_id IS NOT NULL
  AND (asg.id IS DISTINCT FROM r.assignment_id OR asg.generation<>r.assignment_generation) THEN code:='stale_assignment'; END IF;
 IF code IS NULL THEN
  live:=sophia.work_live_attempt(cm.project_id,w);
  IF live IS NOT NULL THEN chosen:='attach';
  ELSIF EXISTS(SELECT 1 FROM sophia.work_attempts wa WHERE wa.project_id=cm.project_id AND wa.goal_id=w.execution_goal_id) THEN code:='attempt_ended';
  ELSIF (sophia.work_runtime(cm.project_id,asg.role,asg.route)).id IS NULL THEN code:='runtime_unavailable';
  ELSIF NOT sophia.work_allowance_left(cm.project_id,w) THEN code:='allowance_spent';
  ELSE chosen:='start';
  END IF;
 END IF;
 IF code IS NOT NULL THEN
  PERFORM sophia.emit_service_event(cm.project_id,'work.permit_denied','work_item',w.id,g.state_revision,'work.permit_denied.'||code);
  RETURN jsonb_build_object('decision','deny','code',code,'reason',sophia.work_denial_text(code),'workId',w.id);
 END IF;
 IF r.paperclip_run_id IS NULL THEN
  INSERT INTO sophia.work_runs(paperclip_company_id,paperclip_run_id,project_id,work_id,integration_id,paperclip_issue_id,paperclip_agent_id,
   assignment_id,assignment_generation,decision,permit_expires_at,attempt_id,state)
  VALUES(company,run_id,cm.project_id,w.id,ci.id,issue,left(p_request->>'agentId',128),asg.id,asg.generation,chosen,
   now()+interval '5 minutes',live,CASE chosen WHEN 'attach' THEN 'attached' ELSE 'permitted' END) RETURNING * INTO r;
 ELSE
  UPDATE sophia.work_runs SET decision=chosen, attempt_id=live, state=CASE chosen WHEN 'attach' THEN 'attached' ELSE 'permitted' END,
   permit_expires_at=CASE WHEN chosen='start' AND permit_expires_at>=now() THEN permit_expires_at ELSE now()+interval '5 minutes' END
   WHERE paperclip_company_id=company AND paperclip_run_id=run_id RETURNING * INTO r;
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=cm.project_id AND attempt_id=live;
 RETURN jsonb_build_object('decision',chosen,'workId',w.id,'assignmentId',asg.id,'generation',asg.generation,'attemptId',live,
  'nativeSessionId',b.native_session_id,'permitExpiresAt',r.permit_expires_at,'state',r.state);
END $$;

-- POST /v1/coordination/start: the permitted run starts the work's one attempt through the ordinary native path. Called
-- immediately after the adapter's onDispatch; the same run asking again gets the same attempt, even once the run ended.
-- A run that ended without starting one starts nothing: a new run asks for its own permit.
CREATE FUNCTION sophia.coordination_start(p_token_sha256 bytea, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE company text:=p_request->>'companyId'; ci sophia.coordination_integrations:=sophia.coordination_caller(p_token_sha256,company);
 r sophia.work_runs; w sophia.work_items; g sophia.goals; cg sophia.coordination_grants; asg sophia.work_assignments; p sophia.work_plans;
 rt sophia.runtime_instances; code text; att uuid:=gen_random_uuid(); bnd uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid();
 job uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO r FROM sophia.work_runs WHERE paperclip_company_id=company AND paperclip_run_id=p_request->>'runId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Permit not found' USING ERRCODE='22023'; END IF;
 IF r.integration_id<>ci.id THEN RAISE EXCEPTION 'Integration run belongs to another credential' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
 SELECT * INTO r FROM sophia.work_runs WHERE paperclip_company_id=company AND paperclip_run_id=p_request->>'runId' FOR UPDATE;
 IF r.decision='start' AND r.attempt_id IS NOT NULL THEN
  RETURN jsonb_build_object('attemptId',r.attempt_id,'nativeSessionId','sophia-'||r.attempt_id,'workId',r.work_id,'started',false);
 END IF;
 IF r.decision<>'start' THEN RAISE EXCEPTION 'This run attaches to an attempt; it starts none' USING ERRCODE='40001'; END IF;
 IF r.state='ended' THEN RAISE EXCEPTION 'This run ended without starting the work; a new run asks for its own permit' USING ERRCODE='40001'; END IF;
 IF r.permit_expires_at<now() THEN RAISE EXCEPTION 'Stale permit: ask for a permit again' USING ERRCODE='40001'; END IF;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=r.project_id AND id=r.work_id FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=r.project_id AND id=w.execution_goal_id FOR UPDATE;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=r.project_id;
 SELECT * INTO asg FROM sophia.work_assignments WHERE project_id=r.project_id AND work_id=w.id AND state='active';
 code:=sophia.work_denial(r.project_id,w,g,cg,company);
 IF code IS NULL AND (asg.id IS DISTINCT FROM r.assignment_id OR asg.generation<>r.assignment_generation) THEN code:='stale_assignment'; END IF;
 IF code IS NULL AND EXISTS(SELECT 1 FROM sophia.work_attempts wa WHERE wa.project_id=r.project_id AND wa.goal_id=w.execution_goal_id) THEN
  RAISE EXCEPTION 'Stale permit: another run started this work; ask for a permit again' USING ERRCODE='40001'; END IF;
 IF code IS NULL AND NOT sophia.work_allowance_left(r.project_id,w) THEN code:='allowance_spent'; END IF;
 rt:=sophia.work_runtime(r.project_id,asg.role,asg.route);
 IF code IS NULL AND rt.id IS NULL THEN code:='runtime_unavailable'; END IF;
 IF code IS NOT NULL THEN
  UPDATE sophia.work_runs SET state='ended', ended_at=now() WHERE paperclip_company_id=company AND paperclip_run_id=r.paperclip_run_id;
  RETURN jsonb_build_object('denied',true,'code',code,'reason',sophia.work_denial_text(code),'workId',w.id);
 END IF;
 SELECT * INTO p FROM sophia.work_plans WHERE project_id=r.project_id AND id=w.plan_id;
 INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
 VALUES(r.project_id,att,g.id,g.revision,g.authority_epoch,p.manifest_source_id,'admitted');
 INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
 VALUES(r.project_id,bnd,att,rt.resource_id,'sophia-'||att,rt.runtime_unit_id,'sophia_episode','created');
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,state)
 VALUES(r.project_id,cmd,w.accepted_by,g.id,g.revision,g.authority_epoch,'native_task','work-start:'||company||':'||r.paperclip_run_id,
  jsonb_build_object('kind','source_review','workId',w.id,'paperclipCompanyId',company,'paperclipRunId',r.paperclip_run_id),'admitted');
 INSERT INTO sophia.jobs(project_id,id,kind,input_source_id,command_id,attempt_id,state)
 VALUES(r.project_id,job,'source_review',p.manifest_source_id,cmd,att,'pending');
 UPDATE sophia.research_allowances SET root_job_id=job WHERE project_id=r.project_id AND id=w.allowance_id AND root_job_id IS NULL;
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(r.project_id,cmd,'native.create','binding/'||bnd,bnd,g.id,g.authority_epoch);
 UPDATE sophia.work_runs SET state='started', attempt_id=att WHERE paperclip_company_id=company AND paperclip_run_id=r.paperclip_run_id;
 PERFORM sophia.emit_service_event(r.project_id,'assignment.changed','work_item',w.id,g.state_revision,'work.attempt_started',
  jsonb_build_array(att,job));
 RETURN jsonb_build_object('attemptId',att,'nativeSessionId','sophia-'||att,'workId',w.id,'started',true);
END $$;

-- The phase of a work item's attempt as the adapter reports it, from Sophia's own records.
CREATE FUNCTION sophia.work_phase(p_project uuid, w sophia.work_items, g sophia.goals, p_attempt uuid) RETURNS text LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM sophia.work_results r WHERE r.project_id=p_project AND r.work_id=w.id AND r.state='withdrawn') THEN 'withdrawn'
  WHEN EXISTS(SELECT 1 FROM sophia.work_results r WHERE r.project_id=p_project AND r.work_id=w.id AND r.state='current') THEN 'result_ready'
  WHEN g.status IN ('holding','held','stopping','stopped') THEN g.status
  WHEN j.state='failed' THEN CASE WHEN j.reason LIKE 'blocked:%' THEN 'blocked' ELSE 'failed' END
  WHEN j.state='cancelled' THEN 'stopped'
  WHEN j.state='outcome_unknown' OR wa.state='outcome_unknown' THEN 'unknown'
  WHEN p_attempt IS NULL OR j.state='pending' THEN 'queued'
  ELSE 'running' END
 FROM (SELECT 1) one
 LEFT JOIN sophia.jobs j ON j.project_id=p_project AND j.attempt_id=p_attempt AND j.kind='source_review'
 LEFT JOIN sophia.work_attempts wa ON wa.project_id=p_project AND wa.id=p_attempt $$;
REVOKE ALL ON FUNCTION sophia.work_phase(uuid,sophia.work_items,sophia.goals,uuid) FROM PUBLIC;

-- POST /v1/coordination/observe: the run's attempt as Sophia knows it. With final, the run reports its usage: the
-- calls of the attempt that ended and that no earlier run reported (usageBasis per_run), and its cost only when every
-- one of them settled at a known cost (an uncertain call makes it null, never zero).
CREATE FUNCTION sophia.coordination_observe(p_token_sha256 bytea, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE company text:=p_request->>'companyId'; ci sophia.coordination_integrations:=sophia.coordination_caller(p_token_sha256,company);
 r sophia.work_runs; w sophia.work_items; g sophia.goals; phase text; res sophia.work_results; usage jsonb:=NULL; b sophia.execution_bindings;
 final boolean:=coalesce((p_request->>'final')::boolean,false); j sophia.jobs;
BEGIN
 SELECT * INTO r FROM sophia.work_runs WHERE paperclip_company_id=company AND paperclip_run_id=p_request->>'runId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Permit not found' USING ERRCODE='22023'; END IF;
 IF r.integration_id<>ci.id THEN RAISE EXCEPTION 'Integration run belongs to another credential' USING ERRCODE='42501'; END IF;
 IF final THEN SELECT * INTO r FROM sophia.work_runs WHERE paperclip_company_id=company AND paperclip_run_id=r.paperclip_run_id FOR UPDATE; END IF;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=r.project_id AND id=r.work_id;
 SELECT * INTO g FROM sophia.goals WHERE project_id=r.project_id AND id=w.execution_goal_id;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=r.project_id AND attempt_id=r.attempt_id;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=r.project_id AND attempt_id=r.attempt_id AND kind='source_review';
 phase:=sophia.work_phase(r.project_id,w,g,r.attempt_id);
 SELECT * INTO res FROM sophia.work_results WHERE project_id=r.project_id AND work_id=w.id ORDER BY created_at DESC LIMIT 1;
 IF final AND r.attempt_id IS NOT NULL THEN
  INSERT INTO sophia.work_usage_claims(project_id,reservation_id,paperclip_company_id,paperclip_run_id)
  SELECT x.project_id,x.id,company,r.paperclip_run_id FROM sophia.research_reservations x
   WHERE x.project_id=r.project_id AND x.allowance_id=w.allowance_id AND x.state IN ('settled','uncertain')
    AND starts_with(x.reservation_key,b.native_session_id||':')
  ON CONFLICT (project_id,reservation_id) DO NOTHING;
  SELECT jsonb_build_object('calls',count(*),'uncertainCalls',count(*) FILTER (WHERE x.state='uncertain'),
   'inputTokens',coalesce(sum((x.usage->>'inputTokens')::bigint),0),'outputTokens',coalesce(sum((x.usage->>'outputTokens')::bigint),0),
   'cachedInputTokens',coalesce(sum((x.usage->>'cacheReadTokens')::bigint),0),
   'costUsd',CASE WHEN count(*) FILTER (WHERE x.state='uncertain')>0 THEN NULL ELSE coalesce(sum(x.settled_usd),0) END,
   'models',coalesce(jsonb_agg(DISTINCT x.usage->>'model') FILTER (WHERE x.usage ? 'model'),'[]'),
   'providers',coalesce(jsonb_agg(DISTINCT x.usage->>'provider') FILTER (WHERE x.usage ? 'provider'),'[]'),'basis','per_run')
   INTO usage
   FROM sophia.work_usage_claims c JOIN sophia.research_reservations x ON x.project_id=c.project_id AND x.id=c.reservation_id
   WHERE c.paperclip_company_id=company AND c.paperclip_run_id=r.paperclip_run_id;
  UPDATE sophia.work_runs SET state='ended', ended_at=coalesce(ended_at,now())
   WHERE paperclip_company_id=company AND paperclip_run_id=r.paperclip_run_id;
 END IF;
 RETURN jsonb_build_object('phase',phase,'workId',w.id,'attemptId',r.attempt_id,'nativeSessionId',b.native_session_id,
  'reason',coalesce(w.closed_reason,j.reason),
  'result',CASE WHEN res.id IS NULL THEN NULL ELSE jsonb_build_object('resultId',res.id,'sourceId',res.source_id,'sha256',res.sha256,
   'verdict',res.verdict,'findings',jsonb_array_length(res.findings),'state',res.state) END,
  'usage',usage);
END $$;

-- POST /v1/coordination/cancel: Paperclip cancelled the run. The work is held (never stopped, never lost): its
-- attempt is fenced and settled through the native path, and only an explicit Resume in Sophia continues it.
CREATE FUNCTION sophia.coordination_cancel(p_token_sha256 bytea, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE company text:=p_request->>'companyId'; ci sophia.coordination_integrations:=sophia.coordination_caller(p_token_sha256,company);
 r sophia.work_runs; w sophia.work_items; g sophia.goals;
BEGIN
 SELECT * INTO r FROM sophia.work_runs WHERE paperclip_company_id=company AND paperclip_run_id=p_request->>'runId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Permit not found' USING ERRCODE='22023'; END IF;
 IF r.integration_id<>ci.id THEN RAISE EXCEPTION 'Integration run belongs to another credential' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=r.project_id FOR UPDATE;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=r.project_id AND id=r.work_id FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=r.project_id AND id=w.execution_goal_id FOR UPDATE;
 IF g.status IN ('ready','running','checking') AND w.closed_reason IS NULL
  AND NOT EXISTS(SELECT 1 FROM sophia.work_results x WHERE x.project_id=w.project_id AND x.work_id=w.id) THEN
  PERFORM sophia.work_control(r.project_id,w,'hold',sophia.integration_actor(),
   'paperclip-cancel:'||company||':'||r.paperclip_run_id,'paperclip_cancel');
 END IF;
 RETURN sophia.coordination_observe(p_token_sha256,jsonb_build_object('companyId',company,'runId',r.paperclip_run_id));
END $$;

-- --- the worker's deliveries to the plugin ----------------------------------------------------------------------------

-- Claim due deliveries, oldest first: a work item's commission before its controls, a control only once its issue
-- exists, and nothing of a work item while an earlier delivery of it (by seq) is still unsettled. Each row carries
-- what the worker signs and sends; an outcome_unknown row is claimed to be reconciled.
CREATE FUNCTION sophia.claim_coordination_outbox(p_worker text, p_limit integer, p_lease_secs integer) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.coordination_outbox; cm sophia.work_commissions; w sophia.work_items; g sophia.goals; p sophia.work_plans;
 reviewed sophia.goals; token uuid; reconcile boolean; initiator jsonb;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 50 OR p_lease_secs NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'Invalid claim bounds' USING ERRCODE='22023'; END IF;
 FOR o IN SELECT x.* FROM sophia.coordination_outbox x JOIN sophia.work_commissions c ON c.project_id=x.project_id AND c.work_id=x.work_id
   WHERE x.state IN ('pending','outcome_unknown') AND x.available_at<=now()
    AND (x.op='commission' OR c.state='created')
    AND NOT EXISTS(SELECT 1 FROM sophia.coordination_outbox e WHERE e.project_id=x.project_id AND e.work_id=x.work_id
     AND e.seq<x.seq AND e.state IN ('pending','delivering','outcome_unknown'))
   ORDER BY x.available_at, x.seq LIMIT p_limit FOR UPDATE OF x SKIP LOCKED LOOP
  token:=gen_random_uuid(); reconcile:=o.state='outcome_unknown';
  UPDATE sophia.coordination_outbox SET state='delivering', lease_owner=left(p_worker,100), lease_token=token,
   lease_until=now()+make_interval(secs=>p_lease_secs), attempts=attempts+1, updated_at=now()
   WHERE project_id=o.project_id AND id=o.id;
  SELECT * INTO cm FROM sophia.work_commissions WHERE project_id=o.project_id AND work_id=o.work_id;
  SELECT * INTO w FROM sophia.work_items WHERE project_id=o.project_id AND id=o.work_id;
  SELECT * INTO g FROM sophia.goals WHERE project_id=o.project_id AND id=w.execution_goal_id;
  SELECT * INTO p FROM sophia.work_plans WHERE project_id=o.project_id AND id=w.plan_id;
  SELECT * INTO reviewed FROM sophia.goals WHERE project_id=o.project_id AND id=p.goal_id;
  -- Who initiated it: the member who accepted the plan for a commission; for a mirrored control the actor of the
  -- execution goal's latest control (a member, or Sophia itself); Sophia for a completion or a failure.
  SELECT CASE WHEN o.op='commission' THEN jsonb_build_object('kind','member','id',w.accepted_by)
    WHEN o.op IN ('hold','resume','stop') THEN (SELECT jsonb_build_object('kind',CASE WHEN c.actor_id=sophia.integration_actor() THEN 'sophia' ELSE 'member' END,
      'id',c.actor_id) FROM sophia.commands c WHERE c.project_id=o.project_id AND c.goal_id=w.execution_goal_id AND c.kind=o.op
      ORDER BY c.created_at DESC, c.id LIMIT 1)
    END INTO initiator;
  RETURN NEXT jsonb_build_object('projectId',o.project_id,'id',o.id,'workId',o.work_id,'op',o.op,'deliveryKey',o.delivery_key,
   'leaseToken',token,'reconcile',reconcile,'attempts',o.attempts+1,
   'initiator',coalesce(initiator,jsonb_build_object('kind','sophia','id',sophia.integration_actor())),
   'commission',jsonb_build_object('key',cm.commission_key,'companyId',cm.paperclip_company_id,
    'paperclipProjectId',cm.paperclip_project_id,'issueId',cm.paperclip_issue_id,
    'title',left('Source review: '||regexp_replace(reviewed.title,'\s+',' ','g'),200),
    'description','Managed by Sophia (work '||w.id||', plan '||p.id||' r'||p.revision||'). It reviews '||cardinality(p.source_ids)
     ||' selected project sources against the goal''s criteria with an allowance of '||p.allowance_usd||' USD. Hold, Resume and Stop '
     ||'are Sophia''s; this issue mirrors them. Source text stays in Sophia.',
    'initialStatus',CASE WHEN g.status IN ('holding','held') THEN 'blocked' WHEN g.status IN ('stopping','stopped') THEN 'cancelled' ELSE 'todo' END,
    'wake',g.status IN ('ready','running')));
 END LOOP;
END $$;

-- Record a delivery's outcome under its lease. delivered: the plugin answered (a commission names its issue).
-- rejected: the plugin definitely refused (nothing was created). unknown: no answer or an unclear one; the row is
-- reconciled by its key before anything is sent again. absent: a reconciliation proved no issue exists for the key,
-- so the commission may be sent again.
CREATE FUNCTION sophia.record_coordination_delivery(p_project uuid, p_id uuid, p_lease_token uuid, p_outcome text, p_result jsonb, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.coordination_outbox; issue text:=p_result->>'issueId'; backoff interval;
BEGIN
 SELECT * INTO o FROM sophia.coordination_outbox WHERE project_id=p_project AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'delivering' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 backoff:=make_interval(secs=>least(300,5*power(2,least(o.attempts,6))::integer));
 IF p_outcome='delivered' THEN
  IF o.op='commission' AND coalesce(issue,'') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' THEN
   RAISE EXCEPTION 'A delivered commission names its issue' USING ERRCODE='22023'; END IF;
  UPDATE sophia.coordination_outbox SET state='delivered', lease_until=NULL, result=p_result, reason=NULL, updated_at=now() WHERE project_id=p_project AND id=p_id;
  IF o.op='commission' THEN
   UPDATE sophia.work_commissions SET state='created', paperclip_issue_id=issue, reason=NULL, updated_at=now() WHERE project_id=p_project AND work_id=o.work_id;
   PERFORM sophia.emit_service_event(p_project,'assignment.changed','work_item',o.work_id,1,'work.commissioned');
  END IF;
 ELSIF p_outcome='rejected' THEN
  UPDATE sophia.coordination_outbox SET state='failed', lease_until=NULL, result=p_result, reason=left(p_reason,500), updated_at=now() WHERE project_id=p_project AND id=p_id;
  IF o.op='commission' THEN
   UPDATE sophia.work_commissions SET state='failed', reason=left(coalesce(p_reason,'refused'),500), updated_at=now() WHERE project_id=p_project AND work_id=o.work_id;
   UPDATE sophia.work_items SET closed_reason=coalesce(closed_reason,left('Paperclip refused the commission: '||coalesce(p_reason,'no reason'),500))
    WHERE project_id=p_project AND id=o.work_id;
   PERFORM sophia.emit_service_event(p_project,'assignment.changed','work_item',o.work_id,1,'work.commission_failed');
  END IF;
 ELSIF p_outcome IN ('unknown','absent') THEN
  IF p_outcome='absent' AND o.op<>'commission' THEN RAISE EXCEPTION 'Only a commission is reconciled as absent' USING ERRCODE='22023'; END IF;
  UPDATE sophia.coordination_outbox SET state=CASE p_outcome WHEN 'absent' THEN 'pending' ELSE 'outcome_unknown' END,
   lease_until=NULL, reason=left(p_reason,500), available_at=now()+backoff, updated_at=now() WHERE project_id=p_project AND id=p_id;
  IF o.op='commission' THEN
   UPDATE sophia.work_commissions SET state=CASE p_outcome WHEN 'absent' THEN 'pending' ELSE 'outcome_unknown' END, reason=left(p_reason,500), updated_at=now()
    WHERE project_id=p_project AND work_id=o.work_id;
  END IF;
 ELSE RAISE EXCEPTION 'Unknown delivery outcome' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('state',(SELECT state FROM sophia.coordination_outbox WHERE project_id=p_project AND id=p_id));
END $$;

-- A lease that ran out leaves its delivery unknown (it may have reached the plugin), to be reconciled.
CREATE FUNCTION sophia.expire_coordination_leases() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 WITH x AS (UPDATE sophia.coordination_outbox SET state='outcome_unknown', lease_until=NULL, reason='the delivery lease expired', updated_at=now()
  WHERE state='delivering' AND lease_until<now() RETURNING 1) SELECT count(*)::integer FROM x $$;

-- --- the reviewer's runtime operations ------------------------------------------------------------------------------

CREATE TYPE sophia.review_scope AS (
 project_id uuid, runtime_id uuid, binding_id uuid, attempt_id uuid, native_session_id text, goal_id uuid, job_id uuid,
 work_id uuid, allowance_id uuid, manifest_source_id uuid
);

-- Authenticate a review operation like a research one (0025): the runtime's lease, then a source-review binding it
-- owns. With p_fence the work must be active under the goal's current authority, so Hold and Stop apply at once.
CREATE FUNCTION sophia.review_scope_of(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_fence boolean)
RETURNS sophia.review_scope LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rt sophia.runtime_instances:=sophia.runtime_lease(p_token_sha256,p_unit,p_bridge); b sophia.execution_bindings; g sophia.goals;
 j sophia.jobs; w sophia.work_items; owner sophia.runtime_commands;
BEGIN
 IF coalesce(p_request->>'attemptId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Review operation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=rt.project_id AND resource_id=rt.resource_id
  AND runtime_unit_id=rt.runtime_unit_id AND attempt_id=(p_request->>'attemptId')::uuid AND native_session_id=p_request->>'nativeSessionId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Review operation names an attempt or native session this runtime does not own' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=rt.project_id AND attempt_id=b.attempt_id AND kind='source_review';
 IF NOT FOUND THEN RAISE EXCEPTION 'Review operation names an attempt that is not a source review' USING ERRCODE='42501'; END IF;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts wa ON wa.project_id=g2.project_id AND wa.goal_id=g2.id
  WHERE wa.project_id=rt.project_id AND wa.id=b.attempt_id FOR UPDATE OF g2;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=rt.project_id AND execution_goal_id=g.id;
 IF p_fence THEN
  IF g.status NOT IN ('ready','running','checking') THEN RAISE EXCEPTION 'The review is not active: the work is %', g.status USING ERRCODE='40001'; END IF;
  IF j.state NOT IN ('pending','running') THEN RAISE EXCEPTION 'The review is not active: its attempt has ended' USING ERRCODE='40001'; END IF;
  IF b.state IN ('settled','lost','stopping') THEN RAISE EXCEPTION 'The review is not active: the session is %', b.state USING ERRCODE='40001'; END IF;
  SELECT * INTO owner FROM sophia.runtime_commands WHERE project_id=rt.project_id AND binding_id=b.id AND kind<>'inspect' ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
   RAISE EXCEPTION 'The review is not active: its authority moved on (a Hold or Stop)' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN ROW(rt.project_id,rt.id,b.id,b.attempt_id,b.native_session_id,g.id,j.id,w.id,w.allowance_id,j.input_source_id)::sophia.review_scope;
END $$;
REVOKE ALL ON FUNCTION sophia.review_scope_of(bytea,text,text,jsonb,boolean) FROM PUBLIC;

-- POST /v1/runtime/source-review/context: without a source, the task (goal, criteria, sources, limits, allowance); with one, a
-- page of that manifest source, while it can still be read, with its receipt. A source may be cited once the submit
-- presents a receipt of it: serving a page records nothing as read (Codex on #107).
CREATE FUNCTION sophia.runtime_source_review_context(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); manifest jsonb;
 al sophia.research_allowances; body text; src uuid; off integer; size integer; total integer; calls integer;
 receipt text:=replace(gen_random_uuid()::text,'-',''); page text;
BEGIN
 SELECT t.body::jsonb INTO manifest FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.manifest_source_id;
 IF p_request ? 'sourceId' THEN
  IF coalesce(p_request->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Review source not found' USING ERRCODE='22023'; END IF;
  src:=(p_request->>'sourceId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest->'sources') x WHERE x->>'sourceId'=src::text) THEN
   RAISE EXCEPTION 'Review source not found' USING ERRCODE='22023'; END IF;
  IF NOT sophia.review_source_readable(s.project_id,src) THEN
   RAISE EXCEPTION 'Source not released and eligible for project work: this source was withdrawn' USING ERRCODE='42501'; END IF;
  SELECT t.body INTO body FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=src;
  off:=coalesce((p_request->>'offset')::integer,0); size:=least(coalesce((p_request->>'limit')::integer,16000),16000);
  IF off<0 OR size<1 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  total:=char_length(body); off:=least(off,total);
  page:=substr(body,off+1,size);
  INSERT INTO sophia.work_review_receipts(project_id,attempt_id,source_id,receipt_sha256,page_offset,page_chars,total_chars,page_sha256)
   VALUES(s.project_id,s.attempt_id,src,sha256(convert_to(receipt,'UTF8')),off,char_length(page),total,sha256(convert_to(page,'UTF8')));
  RETURN jsonb_build_object('sourceId',src,'offset',off,'nextOffset',CASE WHEN off+size<total THEN to_jsonb(off+size) ELSE 'null'::jsonb END,
   'totalChars',total,'truncated',off+size<total,'text',page,'receipt',receipt);
 END IF;
 SELECT * INTO al FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id;
 SELECT count(*) INTO calls FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id
  AND kind='model' AND state<>'released';
 RETURN jsonb_build_object('workId',s.work_id,'goal',manifest->'goal','purpose',manifest->'purpose',
  'sources',(SELECT jsonb_agg(x||jsonb_build_object('readable',sophia.review_source_readable(s.project_id,(x->>'sourceId')::uuid)) ORDER BY n)
   FROM jsonb_array_elements(manifest->'sources') WITH ORDINALITY AS y(x,n)),
  'limits',manifest->'limits',
  'allowance',jsonb_build_object('capUsd',al.cap_usd,'committedUsd',al.reserved_usd+al.spent_usd+al.uncertain_usd,
   'modelCallsLeft',greatest((manifest->'limits'->>'maxModelRequests')::integer-calls,0)));
END $$;

-- POST /v1/runtime/source-review/reserve: before one model call (the only paid call a review makes), from the work's
-- allowance through the shared accounting (reserve_research), and at most maxModelRequests of them in all, including
-- compaction and retries. Idempotent by native session and call id.
CREATE FUNCTION sophia.runtime_source_review_reserve(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true); r sophia.research_reservations;
 key text; calls integer;
BEGIN
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF p_request->>'kind' IS DISTINCT FROM 'model' OR coalesce(p_request->>'purpose','call')<>'call' OR p_request ? 'targetRef' OR p_request ? 'query' THEN
  RAISE EXCEPTION 'A review reserves model calls only' USING ERRCODE='22023'; END IF;
 key:=s.native_session_id||':'||(p_request->>'callId');
 -- The lock order of reserve_research: the grant, then the allowance; the count is read under them.
 PERFORM 1 FROM sophia.research_grants WHERE project_id=s.project_id FOR UPDATE;
 PERFORM 1 FROM sophia.research_allowances WHERE project_id=s.project_id AND id=s.allowance_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id AND reservation_key=key) THEN
  SELECT count(*) INTO calls FROM sophia.research_reservations WHERE project_id=s.project_id AND allowance_id=s.allowance_id
   AND kind='model' AND state<>'released';
  IF calls>=(sophia.source_review_limits()->>'maxModelRequests')::integer THEN
   RAISE EXCEPTION 'Review model request limit reached: % calls', calls USING ERRCODE='55000'; END IF;
 END IF;
 r:=sophia.reserve_research(s.project_id,s.allowance_id,key,'model',p_request->>'provider',(p_request->>'amountUsd')::numeric,'call');
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'kind',r.kind,'purpose',r.purpose,'amountUsd',r.reserved_usd,'target','null'::jsonb);
END $$;

-- POST /v1/runtime/source-review/settle: end a model call's reservation from its reported usage. Never fenced: a call already
-- paid for is always accounted, also after a Hold or Stop.
CREATE FUNCTION sophia.runtime_source_review_settle(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false); r sophia.research_reservations;
BEGIN
 IF coalesce(p_request->>'reservationId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Review reservation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.research_reservations WHERE project_id=s.project_id AND id=(p_request->>'reservationId')::uuid
  AND allowance_id=s.allowance_id AND starts_with(reservation_key,s.native_session_id||':');
 IF NOT FOUND THEN RAISE EXCEPTION 'Review reservation not found' USING ERRCODE='22023'; END IF;
 IF p_request ? 'usage' AND jsonb_typeof(p_request->'usage')<>'object' THEN RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023'; END IF;
 r:=sophia.end_research_reservation(s.project_id,r.id,p_request->>'outcome',(p_request->>'costUsd')::numeric,p_request->'usage',
  p_request->>'providerRequestId');
 RETURN jsonb_build_object('reservationId',r.id,'state',r.state,'settledUsd',r.settled_usd);
END $$;

-- The structural and reference checks of a submitted review (the review's own completion policy): its size, its five
-- sections, and findings that cite manifest sources this attempt read and still can, against the goal's criteria.
-- Raises 22023 with what to fix; returns the checks it passed.
CREATE FUNCTION sophia.review_checks(s sophia.review_scope, p_manifest jsonb, p_result jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE report text:=p_result->>'report'; f jsonb; sid text; missing text; heading text; cited text[]:='{}';
BEGIN
 IF p_result->>'verdict' IS NULL OR p_result->>'verdict' NOT IN ('supported','changes_required','insufficient_evidence') THEN
  RAISE EXCEPTION 'The verdict is supported, changes_required or insufficient_evidence' USING ERRCODE='22023'; END IF;
 IF report IS NULL OR octet_length(report) NOT BETWEEN 1 AND (p_manifest->'limits'->>'maxReportBytes')::integer THEN
  RAISE EXCEPTION 'The report is 1 to % bytes of Markdown', p_manifest->'limits'->>'maxReportBytes' USING ERRCODE='22023'; END IF;
 FOREACH heading IN ARRAY ARRAY['Goal','Evidence inspected','Findings','What remains unknown','Suggested next action'] LOOP
  IF report !~* ('(^|\n)#{1,6}[ \t]+'||heading||'[ \t]*(\n|$)') THEN missing:=coalesce(missing||', ','')||heading; END IF;
 END LOOP;
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'The report needs a heading for each section; missing: %', missing USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_result->'findings')<>'array' OR jsonb_array_length(p_result->'findings') NOT BETWEEN 1 AND 40 THEN
  RAISE EXCEPTION 'A review has 1 to 40 findings' USING ERRCODE='22023'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_result->'findings') LOOP
  IF jsonb_typeof(f)<>'object' OR f->>'status' IS NULL OR f->>'status' NOT IN ('supported','contradicted','not_established')
   OR length(coalesce(f->>'statement','')) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(f->'sourceIds')<>'array'
   OR jsonb_array_length(f->'sourceIds') NOT BETWEEN 1 AND 10 THEN
   RAISE EXCEPTION 'Each finding has a status (supported, contradicted or not_established), a statement and 1 to 10 sourceIds' USING ERRCODE='22023'; END IF;
  IF f ? 'criterionId' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_manifest->'goal'->'criteria') c WHERE c->>'id'=f->>'criterionId') THEN
   RAISE EXCEPTION 'A finding names a criterion this review does not have: %', f->>'criterionId' USING ERRCODE='22023'; END IF;
  FOR sid IN SELECT jsonb_array_elements_text(f->'sourceIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_manifest->'sources') x WHERE x->>'sourceId'=sid)
    OR NOT EXISTS(SELECT 1 FROM sophia.work_review_reads r WHERE r.project_id=s.project_id AND r.attempt_id=s.attempt_id AND r.source_id::text=sid) THEN
    RAISE EXCEPTION 'A finding cites a source this review did not read: %', sid USING ERRCODE='22023'; END IF;
   IF NOT sophia.review_source_readable(s.project_id,sid::uuid) THEN
    RAISE EXCEPTION 'Source not released and eligible for project work: a cited source was withdrawn' USING ERRCODE='42501'; END IF;
   cited:=cited||sid;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('policy','policy:source-review-structural-v1','size','passed','sections','passed','references','passed',
  'reportBytes',octet_length(report),'findings',jsonb_array_length(p_result->'findings'),
  'citedSources',(SELECT to_jsonb(array_agg(DISTINCT c ORDER BY c)) FROM unnest(cited) c));
END $$;
REVOKE ALL ON FUNCTION sophia.review_checks(sophia.review_scope,jsonb,jsonb) FROM PUBLIC;

-- The reads a submit's receipts prove: each must be a receipt served to this attempt (a page that reached the model);
-- the sources they are of are recorded as read, and only those may be cited (review_checks). A page with no text of a
-- source that has some (asked past its end) brought the model nothing: its receipt proves no read (Codex on #107).
-- Returns what the pages cover of each source, in characters: one page is not the whole source, and the result says
-- which were read whole.
CREATE FUNCTION sophia.review_receipts_read(s sophia.review_scope, p_receipts jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r text; x sophia.work_review_receipts; seen bytea[]:='{}'; coverage jsonb;
BEGIN
 IF jsonb_typeof(p_receipts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_receipts) NOT BETWEEN 1 AND 400 THEN
  RAISE EXCEPTION 'A review presents the receipts of the pages it read: 1 to 400' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT jsonb_array_elements_text(p_receipts) LOOP
  IF r !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'A receipt is the 32 characters a page carried' USING ERRCODE='22023'; END IF;
  SELECT * INTO x FROM sophia.work_review_receipts
   WHERE project_id=s.project_id AND receipt_sha256=sha256(convert_to(r,'UTF8')) AND attempt_id=s.attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'A receipt was not served to this review' USING ERRCODE='22023'; END IF;
  CONTINUE WHEN x.page_chars=0 AND x.total_chars>0;
  seen:=seen||x.receipt_sha256;
  INSERT INTO sophia.work_review_reads(project_id,attempt_id,source_id,first_read_at) VALUES(s.project_id,s.attempt_id,x.source_id,x.issued_at)
   ON CONFLICT(project_id,attempt_id,source_id) DO UPDATE SET first_read_at=least(work_review_reads.first_read_at,EXCLUDED.first_read_at);
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('sourceId',t.source_id,'deliveredChars',d.delivered,'totalChars',t.total,'complete',d.delivered>=t.total)
   ORDER BY t.source_id) INTO coverage
  FROM (SELECT source_id, max(total_chars) AS total, range_agg(int4range(page_offset,page_offset+page_chars)) AS pages
         FROM sophia.work_review_receipts WHERE project_id=s.project_id AND attempt_id=s.attempt_id AND receipt_sha256=ANY(seen)
         GROUP BY source_id) t
  CROSS JOIN LATERAL (SELECT coalesce(sum(upper(g)-lower(g)),0)::integer AS delivered FROM unnest(t.pages) g) d;
 RETURN coalesce(coverage,'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION sophia.review_receipts_read(sophia.review_scope,jsonb) FROM PUBLIC;

-- POST /v1/runtime/source-review/submit: publish the review (result) or record what blocks it (blocker). Fenced: a review
-- held or stopped publishes nothing. The result is stored as an immutable source before result-ready, and an attempt
-- publishes once: a repeated or retried submit answers with the result already published.
CREATE FUNCTION sophia.runtime_source_review_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.review_scope; j sophia.jobs; w sophia.work_items; manifest jsonb; res sophia.work_results; checks jsonb;
 src sophia.source_objects; key text; inspected uuid[]; blocker text; g sophia.goals; coverage jsonb;
BEGIN
 -- Unfenced first: a submit retried after its answer was lost finds the published result even if the goal moved on,
 -- and a blocker sent again finds the blocker recorded (the bridge sends either again under its callId, Codex on #107).
 s:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,false);
 SELECT * INTO res FROM sophia.work_results WHERE project_id=s.project_id AND attempt_id=s.attempt_id;
 IF FOUND THEN
  RETURN jsonb_build_object('outcome','published','resultId',res.id,'sourceId',res.source_id,'sha256',res.sha256,'verdict',res.verdict,'replayed',true);
 END IF;
 IF p_request ? 'blocker' THEN
  SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id;
  IF j.state='failed' AND j.reason LIKE 'blocked: %' AND j.result_source_id IS NOT NULL THEN
   RETURN jsonb_build_object('outcome','blocked','reason',substr(j.reason,10),'sourceId',j.result_source_id,'replayed',true);
  END IF;
 END IF;
 s:=sophia.review_scope_of(p_token_sha256,p_unit,p_bridge,p_request,true);
 IF coalesce(p_request->>'callId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN RAISE EXCEPTION 'Invalid call id' USING ERRCODE='22023'; END IF;
 IF (p_request ? 'result')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a result or a blocker' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=s.job_id FOR UPDATE;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=s.project_id AND id=s.work_id FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=s.project_id AND id=s.goal_id;
 key:=s.native_session_id||':'||(p_request->>'callId');
 IF p_request ? 'blocker' THEN
  blocker:=btrim(coalesce(p_request->'blocker'->>'reason',''));
  IF length(blocker) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'A blocker names what is missing in at most 500 characters' USING ERRCODE='22023'; END IF;
  src:=sophia.put_text_source(s.project_id,w.accepted_by,'text/plain; charset=utf-8',
   blocker||CASE WHEN p_request->'blocker'->>'missing' IS NOT NULL THEN E'\n\nMissing: '||left(p_request->'blocker'->>'missing',1000) ELSE '' END);
  UPDATE sophia.jobs SET state='failed', reason=left('blocked: '||blocker,2000), result_source_id=src.id WHERE project_id=s.project_id AND id=j.id;
  UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id AND state IN ('admitted','running','checking');
  PERFORM sophia.work_fail(s.project_id,w.id,'blocked: '||blocker);
  RETURN jsonb_build_object('outcome','blocked','reason',blocker,'sourceId',src.id);
 END IF;
 manifest:=sophia.work_manifest(s.project_id,s.work_id);
 coverage:=sophia.review_receipts_read(s,p_request->'result'->'receipts');
 checks:=sophia.review_checks(s,manifest,p_request->'result')||jsonb_build_object('coverage',coverage);
 SELECT coalesce(array_agg(source_id ORDER BY first_read_at,source_id),'{}') INTO inspected FROM sophia.work_review_reads
  WHERE project_id=s.project_id AND attempt_id=s.attempt_id;
 src:=sophia.put_text_source(s.project_id,w.accepted_by,'text/markdown; charset=utf-8',p_request->'result'->>'report');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(s.project_id,s.manifest_source_id,src.id);
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT s.project_id,x,src.id FROM unnest(inspected) x ON CONFLICT DO NOTHING;
 INSERT INTO sophia.work_results(project_id,work_id,attempt_id,submission_key,source_id,sha256,verdict,findings,inspected_source_ids,checks)
 VALUES(s.project_id,s.work_id,s.attempt_id,key,src.id,src.sha256,p_request->'result'->>'verdict',p_request->'result'->'findings',inspected,checks)
 RETURNING * INTO res;
 UPDATE sophia.jobs SET state='succeeded', result_source_id=src.id, result_revision=result_revision+1, reason=NULL WHERE project_id=s.project_id AND id=j.id;
 UPDATE sophia.work_attempts SET state='accepted' WHERE project_id=s.project_id AND id=s.attempt_id;
 -- The review's goal completes; the goal it reviewed is untouched (a review accepts nothing).
 UPDATE sophia.goals SET status='completed', state_revision=state_revision+1 WHERE project_id=s.project_id AND id=s.goal_id RETURNING * INTO g;
 PERFORM sophia.emit_service_event(s.project_id,'work.result_ready','work_item',s.work_id,g.state_revision,'work.result_ready',
  jsonb_build_array(src.id,res.id));
 RETURN jsonb_build_object('outcome','published','resultId',res.id,'sourceId',src.id,'sha256',src.sha256,'verdict',res.verdict,'replayed',false);
END $$;

-- How a review turn ends without a submit (called by capture_native_result with the job locked), as research does
-- (0026): an error ends the attempt and leaves its in-flight calls uncertain; a completed turn is nudged once, and a
-- second completed turn without a result fails the work with no_result_submitted. Judged under the turn's authority.
CREATE FUNCTION sophia.review_turn_end(p_project uuid, b sophia.execution_bindings, g sophia.goals, j sophia.jobs, p_turn_end_seq bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE w sophia.work_items; owner sophia.runtime_commands; src sophia.source_objects; cmd uuid:=gen_random_uuid();
BEGIN
 IF j.state NOT IN ('pending','running','outcome_unknown') THEN RETURN; END IF;
 SELECT * INTO w FROM sophia.work_items WHERE project_id=p_project AND execution_goal_id=g.id FOR UPDATE;
 IF p_reason IS DISTINCT FROM 'completed' THEN
  IF p_reason IN ('error','max-tokens','blocked') AND g.status IN ('ready','running','checking') THEN
   UPDATE sophia.jobs SET state='failed', reason='the native turn ended: '||p_reason WHERE project_id=p_project AND id=j.id;
   UPDATE sophia.research_allowances al SET reserved_usd=al.reserved_usd-x.amount, uncertain_usd=al.uncertain_usd+x.amount
    FROM (SELECT sum(r.reserved_usd) AS amount FROM sophia.research_reservations r WHERE r.project_id=p_project
     AND r.allowance_id=w.allowance_id AND r.state='reserved' AND starts_with(r.reservation_key,b.native_session_id||':')) x
    WHERE al.project_id=p_project AND al.id=w.allowance_id AND x.amount IS NOT NULL;
   UPDATE sophia.research_reservations SET state='uncertain', ended_at=now() WHERE project_id=p_project AND allowance_id=w.allowance_id
    AND state='reserved' AND starts_with(reservation_key,b.native_session_id||':');
   PERFORM sophia.work_fail(p_project,w.id,'the review''s turn ended: '||p_reason);
  END IF;
  RETURN;
 END IF;
 SELECT rc.* INTO owner FROM sophia.runtime_commands rc
  JOIN sophia.runtime_receipts r ON r.project_id=rc.project_id AND r.runtime_command_id=rc.id
  WHERE rc.project_id=p_project AND rc.binding_id=b.id AND rc.kind<>'inspect'
   AND r.stage IN ('delivered','incorporation_observed','checked','outcome_unknown') AND coalesce(r.native_sequence,0)<p_turn_end_seq
  ORDER BY coalesce(r.native_sequence,0) DESC, rc.seq DESC LIMIT 1;
 IF NOT FOUND OR owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input')
  OR g.status NOT IN ('ready','running','checking') THEN RETURN; END IF;
 IF w.nudge_command_id IS NOT NULL THEN
  IF owner.command_id=w.nudge_command_id THEN
   UPDATE sophia.jobs SET state='failed', reason='no_result_submitted' WHERE project_id=p_project AND id=j.id;
   UPDATE sophia.work_attempts SET state='failed' WHERE project_id=p_project AND id=b.attempt_id AND state IN ('admitted','running','checking');
   PERFORM sophia.work_fail(p_project,w.id,'no_result_submitted: the review ended without publishing a result');
  END IF;
  RETURN;
 END IF;
 src:=sophia.put_text_source(p_project,w.accepted_by,'text/plain; charset=utf-8',sophia.source_review_nudge_text());
 INSERT INTO sophia.commands(project_id,id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,semantic_request,body_source_id,state)
 VALUES(p_project,cmd,w.accepted_by,g.id,g.revision,g.authority_epoch,'input','review-nudge:'||b.attempt_id,
  jsonb_build_object('kind','input','nudge','source_review_submit','attemptId',b.attempt_id),src.id,'admitted');
 INSERT INTO sophia.outbox(project_id,command_id,destination,destination_key,binding_id,goal_id,authority_epoch)
 VALUES(p_project,cmd,'native.input','binding/'||b.id,b.id,g.id,g.authority_epoch);
 UPDATE sophia.work_items SET nudge_command_id=cmd WHERE project_id=p_project AND id=w.id;
 PERFORM sophia.emit_service_event(p_project,'work.nudged','work_item',w.id,g.state_revision,'work.no_result_yet');
END $$;
REVOKE ALL ON FUNCTION sophia.review_turn_end(uuid,sophia.execution_bindings,sophia.goals,sophia.jobs,bigint,text) FROM PUBLIC;


-- --- the native path, extended -----------------------------------------------------------------------------------------

-- capture_native_result (0040), replaced from 0040's body: a source review's turn end follows review_turn_end; research,
-- a design or a design review (SDD-01) and a brief are as before.
CREATE OR REPLACE FUNCTION sophia.capture_native_result(p_project uuid, p_binding uuid, p_turn_end_seq bigint, p_reason text) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE b sophia.execution_bindings; g sophia.goals; j sophia.jobs; msg sophia.native_observations; c sophia.commands; src sophia.source_objects;
 owner sophia.runtime_commands;
BEGIN
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=p_binding;
 SELECT g2.* INTO g FROM sophia.goals g2 JOIN sophia.work_attempts a ON a.project_id=g2.project_id AND a.goal_id=g2.id
  WHERE a.project_id=p_project AND a.id=b.attempt_id FOR UPDATE OF g2;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind='research' FOR UPDATE;
 IF FOUND THEN PERFORM sophia.research_turn_end(p_project,b,g,j,p_turn_end_seq,p_reason); RETURN; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind IN ('design','design_review') FOR UPDATE;
 IF FOUND THEN PERFORM sophia.design_turn_end(p_project,b,g,j,p_turn_end_seq,p_reason); RETURN; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind='source_review' FOR UPDATE;
 IF FOUND THEN PERFORM sophia.review_turn_end(p_project,b,g,j,p_turn_end_seq,p_reason); RETURN; END IF;
 SELECT * INTO j FROM sophia.jobs WHERE project_id=p_project AND attempt_id=b.attempt_id AND kind='draft_brief' FOR UPDATE;
 IF j.id IS NULL OR j.state NOT IN ('pending','running','outcome_unknown') THEN RETURN; END IF;
 IF p_reason IS DISTINCT FROM 'completed' THEN
  IF p_reason IN ('error','max-tokens','blocked') AND j.state IN ('pending','running') AND g.status IN ('running','checking') THEN
   UPDATE sophia.jobs SET state='failed', reason='the native turn ended: '||p_reason WHERE project_id=p_project AND id=j.id;
   PERFORM sophia.emit_service_event(p_project,'native_task.failed','job',j.id,j.result_revision+3,'native_task.'||p_reason);
  END IF;
  RETURN;
 END IF;
 SELECT * INTO msg FROM sophia.native_observations WHERE project_id=p_project AND binding_id=p_binding AND type='assistant/message'
  AND native_seq<p_turn_end_seq AND coalesce((data->>'interrupted')::boolean,false)=false AND coalesce(data->>'text','')<>''
  ORDER BY native_seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT rc.* INTO owner FROM sophia.runtime_commands rc
  JOIN sophia.runtime_receipts r ON r.project_id=rc.project_id AND r.runtime_command_id=rc.id
  WHERE rc.project_id=p_project AND rc.binding_id=p_binding AND rc.kind<>'inspect'
   AND r.stage IN ('delivered','incorporation_observed','checked','outcome_unknown')
   AND coalesce(r.native_sequence,0)<msg.native_seq
  ORDER BY coalesce(r.native_sequence,0) DESC, rc.seq DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 IF owner.authority_epoch<>g.authority_epoch OR owner.kind NOT IN ('create','resume','steer','input') THEN
  UPDATE sophia.jobs SET reason='a result from an earlier authority (before a Hold or Stop) arrived; it was withheld, not published'
   WHERE project_id=p_project AND id=j.id;
  RETURN;
 END IF;
 IF g.status NOT IN ('running','checking') THEN
  UPDATE sophia.jobs SET reason='a result arrived while the work was '||g.status||'; it was withheld, not published' WHERE project_id=p_project AND id=j.id;
  RETURN;
 END IF;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=j.command_id;
 src:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',msg.data->>'text');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,j.input_source_id,src.id);
 UPDATE sophia.jobs SET state='succeeded', result_source_id=src.id, result_revision=result_revision+1, reason=NULL
  WHERE project_id=p_project AND id=j.id RETURNING * INTO j;
 UPDATE sophia.work_attempts SET state='checking' WHERE project_id=p_project AND id=b.attempt_id AND state IN ('running','admitted');
 IF g.status='running' THEN UPDATE sophia.goals SET status='checking', state_revision=state_revision+1 WHERE project_id=g.project_id AND id=g.id; END IF;
 PERFORM sophia.emit_service_event(p_project,'native_task.result_ready','job',j.id,j.result_revision+3,'native_task.result_ready',
  jsonb_build_array(src.id,j.input_source_id));
END $$;

-- Whether an attempt is a review's, which acts on what it is given and takes no steer: a visual review of a design
-- candidate (SDD-01) or a source review (WBC-02).
CREATE FUNCTION sophia.reviews_only(p_project uuid, p_attempt uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.jobs j WHERE j.project_id=p_project AND j.attempt_id=p_attempt
  AND j.kind IN ('design_review','source_review'));
$$;
REVOKE ALL ON FUNCTION sophia.reviews_only(uuid,uuid) FROM PUBLIC;

-- A steer's delivery to a reviewer's session, passed by: settled undelivered, the reason recorded. The steer stays with
-- the sessions that can act on it (a designer's, whose next revision takes it). When it reached none of them, nothing
-- is left to deliver and its command is checked, as a Hold with no session to fence is (0012).
CREATE FUNCTION sophia.pass_steer_by(o sophia.outbox, c sophia.commands) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.outbox SET state='settled', lease_until=NULL, outcome_reason='a reviewer takes no steer'
  WHERE project_id=o.project_id AND id=o.id;
 UPDATE sophia.commands SET state='checked' WHERE project_id=o.project_id AND id=c.id AND state='admitted'
  AND NOT EXISTS(SELECT 1 FROM sophia.outbox o2 WHERE o2.project_id=o.project_id AND o2.command_id=c.id AND o2.id<>o.id
   AND o2.state IN ('pending','dispatching','outcome_unknown'));
 RETURN jsonb_build_object('result','settled','reason','a reviewer takes no steer');
END $$;
REVOKE ALL ON FUNCTION sophia.pass_steer_by(sophia.outbox,sophia.commands) FROM PUBLIC;

-- dispatch_runtime_outbox (0040), replaced from 0040's body: a source review's create takes its role and route from its
-- manifest and its task statement from source_review_statement; a steer reaches no reviewer's session, a design
-- review's (SDD-01, which leaves it to the combined branch: PRODUCTION_BATCH section 4) or a source review's. Research,
-- a design, a design review's create and a brief are as before.
CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(p_project uuid, p_outbox uuid, p_lease_token uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.outbox; g sophia.goals; c sophia.commands; b sophia.execution_bindings; rt sophia.runtime_instances; why text;
 kind text; payload jsonb:='{}'; next_seq bigint; command_body jsonb; rc_id uuid:=gen_random_uuid(); manifest jsonb; txt text;
 job_kind text; job_id uuid; base uuid; seed sophia.source_objects; design_job uuid;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.outbox WHERE project_id=p_project AND id=p_outbox FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbox row not found' USING ERRCODE='22023'; END IF;
 IF o.state<>'dispatching' OR o.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'Lease lost; reconcile before recording' USING ERRCODE='40001'; END IF;
 IF o.lease_until<clock_timestamp() THEN
  UPDATE sophia.outbox SET state='outcome_unknown' WHERE project_id=p_project AND id=p_outbox;
  RETURN jsonb_build_object('result','outcome_unknown','reason','the dispatch lease expired');
 END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=o.goal_id FOR UPDATE;
 SELECT * INTO c FROM sophia.commands WHERE project_id=p_project AND id=o.command_id FOR UPDATE;
 IF o.destination='control.settle' THEN
  PERFORM sophia.settle_native_control(p_project,g.id);
  UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
  UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
  RETURN jsonb_build_object('result','settled');
 END IF;
 SELECT * INTO b FROM sophia.execution_bindings WHERE project_id=p_project AND id=o.binding_id FOR UPDATE;
 SELECT * INTO rt FROM sophia.runtime_instances WHERE project_id=p_project AND resource_id=b.resource_id AND runtime_unit_id=b.runtime_unit_id AND state='active';
 IF o.cleanup THEN
  kind:=c.kind;  -- hold or stop (admit_goal_command writes native.stop rows for both)
  IF b.state IN ('settled','lost') OR (b.state='created' AND NOT EXISTS(SELECT 1 FROM sophia.runtime_commands WHERE project_id=p_project AND binding_id=b.id)) THEN
   UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=p_project AND id=b.id AND state<>'lost';
   UPDATE sophia.outbox SET state='settled', lease_until=NULL WHERE project_id=p_project AND id=p_outbox;
   UPDATE sophia.commands SET state='checked' WHERE project_id=p_project AND id=c.id AND state IN ('admitted','dispatching');
   PERFORM sophia.settle_native_control(p_project,g.id);
   RETURN jsonb_build_object('result','settled','reason','no native session to fence');
  END IF;
  IF rt.id IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'no active runtime for its executor resource and runtime unit'); END IF;
 ELSE
  IF o.destination='native.steer' AND sophia.reviews_only(p_project,b.attempt_id) THEN RETURN sophia.pass_steer_by(o,c); END IF;
  why:=sophia.native_delivery_ineligible(o,g,c,b,rt);
  IF why IS NOT NULL THEN RETURN sophia.deny_native_delivery(o,c,why); END IF;
  why:=sophia.runtime_unavailable(rt);
  IF why IS NOT NULL THEN RETURN sophia.defer_native_delivery(o,c,why); END IF;
  kind:=substr(o.destination,8);
  IF kind='create' THEN
   SELECT j.kind, j.id, t.body::jsonb INTO job_kind, job_id, manifest FROM sophia.jobs j
    JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
    WHERE j.project_id=p_project AND j.command_id=c.id;
   IF job_kind='research' THEN
    IF EXISTS(SELECT 1 FROM sophia.jobs j2 JOIN sophia.execution_bindings b2 ON b2.project_id=j2.project_id AND b2.attempt_id=j2.attempt_id
      JOIN sophia.work_attempts w2 ON w2.project_id=j2.project_id AND w2.id=j2.attempt_id
      JOIN sophia.goals g2 ON g2.project_id=w2.project_id AND g2.id=w2.goal_id
      WHERE j2.project_id=p_project AND j2.kind='research' AND j2.id<>job_id AND j2.state IN ('pending','running','outcome_unknown')
       AND b2.state IN ('launching','running','idle') AND g2.status IN ('ready','running','checking')) THEN
     RETURN sophia.defer_native_delivery(o,c,'waiting for the research worker: another research task is under way');
    END IF;
    base:=(manifest->'base'->>'sourceId')::uuid;
    IF base IS NOT NULL THEN
     SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=base;
     seed:=sophia.put_text_source(p_project,c.actor_id,'text/markdown; charset=utf-8',txt);
     INSERT INTO sophia.research_drafts(project_id,attempt_id,seq,call_key,source_id,sha256)
     VALUES(p_project,b.attempt_id,1,'base:'||(manifest->'base'->>'versionId'),seed.id,seed.sha256);
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.research_task_statement(p_project,manifest));
   ELSIF job_kind='design' THEN
    design_job:=job_id;
    IF NOT EXISTS(SELECT 1 FROM sophia.design_tasks dt WHERE dt.project_id=p_project AND dt.job_id=design_job AND dt.package_source_id IS NOT NULL) THEN
     RETURN sophia.deny_native_delivery(o,c,'the design has no frozen content package');
    END IF;
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.design_task_statement(manifest));
   ELSIF job_kind='design_review' THEN
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->>'route','text',sophia.review_task_statement(manifest));
   ELSIF job_kind='source_review' THEN
    payload:=jsonb_build_object('role',manifest->>'role','route',manifest->'route'->>'id','text',sophia.source_review_statement(manifest));
   ELSE
    payload:=jsonb_build_object('role','sophia-brief-v1','text',sophia.draft_brief_prompt(manifest));
   END IF;
  ELSIF kind IN ('steer','input') THEN
   SELECT t.body INTO txt FROM sophia.source_texts t WHERE t.project_id=p_project AND t.source_id=c.body_source_id;
   IF txt IS NULL THEN RETURN sophia.deny_native_delivery(o,c,'its instruction has no readable text'); END IF;
   payload:=jsonb_build_object('text',txt);
  END IF;
 END IF;
 UPDATE sophia.runtime_instances SET command_sequence=command_sequence+1 WHERE id=rt.id RETURNING command_sequence INTO next_seq;
 command_body:=jsonb_build_object('schema','sophia.runtime-command.v1','commandId',rc_id,
  'binding',jsonb_build_object('projectId',p_project,'goalId',g.id,'goalRevision',g.revision,'attemptId',b.attempt_id,
   'resourceId',b.resource_id,'authorityEpoch',o.authority_epoch,'runtimeUnitId',b.runtime_unit_id),
  'kind',kind,'expectedNativeSessionId',CASE WHEN kind='resume' THEN to_jsonb(b.native_session_id) ELSE 'null'::jsonb END,
  'contextPacketId',CASE WHEN kind='create' THEN to_jsonb((SELECT input_source_id::text FROM sophia.jobs WHERE project_id=p_project AND command_id=c.id)) ELSE 'null'::jsonb END,
  'payload',payload);
 INSERT INTO sophia.runtime_commands(project_id,runtime_id,seq,id,outbox_id,command_id,binding_id,attempt_id,kind,authority_epoch,body)
 VALUES(p_project,rt.id,next_seq,rc_id,o.id,c.id,b.id,b.attempt_id,kind,o.authority_epoch,command_body);
 UPDATE sophia.outbox SET state='acknowledged', lease_until=NULL, outcome_reason=NULL WHERE project_id=p_project AND id=p_outbox;
 UPDATE sophia.commands SET state='dispatching' WHERE project_id=p_project AND id=c.id AND state='admitted';
 IF kind='create' THEN
  UPDATE sophia.execution_bindings SET state='launching' WHERE project_id=p_project AND id=b.id AND state='created';
  UPDATE sophia.jobs SET reason=NULL WHERE project_id=p_project AND command_id=c.id AND state='pending'
   AND (reason LIKE 'waiting for Sophia''s runtime%' OR reason LIKE 'waiting for the research worker%');
 END IF;
 RETURN jsonb_build_object('result','enqueued','runtimeId',rt.id,'seq',next_seq,'runtimeCommandId',rc_id);
END $$;

-- --- source withdrawal ------------------------------------------------------------------------------------------------

-- An input of a work item was withdrawn (it, or anything it drew on, stopped being an eligible, ready project source):
-- its result is no longer served, and work that has not ended is stopped. No replacement review starts on what is left.
CREATE FUNCTION sophia.work_withdraw(p_project uuid, p_work uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE w sophia.work_items; g sophia.goals;
BEGIN
 SELECT * INTO w FROM sophia.work_items WHERE project_id=p_project AND id=p_work FOR UPDATE;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=w.execution_goal_id FOR UPDATE;
 UPDATE sophia.work_results SET state='withdrawn', withdrawn_reason='An input of this review was withdrawn'
  WHERE project_id=p_project AND work_id=p_work AND state='current';
 IF g.status NOT IN ('stopping','stopped','completed') THEN
  PERFORM sophia.work_control(p_project,w,'stop',sophia.integration_actor(),'work-withdraw:'||p_work||':'||g.authority_epoch,'source_withdrawn');
 END IF;
 UPDATE sophia.work_items SET closed_reason=coalesce(closed_reason,'An input of this review was withdrawn') WHERE project_id=p_project AND id=p_work;
 PERFORM sophia.emit_service_event(p_project,'work.withdrawn','work_item',p_work,g.state_revision,'work.source_withdrawn');
END $$;
REVOKE ALL ON FUNCTION sophia.work_withdraw(uuid,uuid) FROM PUBLIC;

-- Whichever path withdraws a source (forgetting, erasure, a release taken back), every work item whose inputs drew on
-- it is withdrawn too, and a proposed plan over it can no longer be accepted (answer_work_decision checks again).
CREATE FUNCTION sophia.work_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE w record;
BEGIN
 IF NOT (OLD.scope='project' AND OLD.eligible AND OLD.state='ready') OR (NEW.scope='project' AND NEW.eligible AND NEW.state='ready') THEN
  RETURN NULL; END IF;
 FOR w IN SELECT wi.id FROM sophia.work_items wi JOIN sophia.work_plans p ON p.project_id=wi.project_id AND p.id=wi.plan_id
   WHERE wi.project_id=NEW.project_id AND EXISTS(SELECT 1 FROM unnest(p.source_ids) x
    WHERE NEW.id IN (SELECT sophia.source_closure(NEW.project_id,ARRAY[x])))
   AND (wi.closed_reason IS NULL OR EXISTS(SELECT 1 FROM sophia.work_results r WHERE r.project_id=wi.project_id AND r.work_id=wi.id AND r.state='current'))
   ORDER BY wi.id LOOP
  PERFORM sophia.work_withdraw(NEW.project_id,w.id);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.work_source_guard() FROM PUBLIC;
CREATE TRIGGER source_objects_withdraw_work AFTER UPDATE OF scope, eligible, state ON sophia.source_objects
 FOR EACH ROW EXECUTE FUNCTION sophia.work_source_guard();

-- A commission Paperclip refused leaves nothing to control: the work's other deliveries are superseded with it.
CREATE FUNCTION sophia.work_commission_failed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.coordination_outbox SET state='superseded', updated_at=now()
  WHERE project_id=NEW.project_id AND work_id=NEW.work_id AND state='pending';
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.work_commission_failed() FROM PUBLIC;
CREATE TRIGGER work_commissions_failed AFTER UPDATE OF state ON sophia.work_commissions
 FOR EACH ROW WHEN (NEW.state='failed' AND OLD.state<>'failed') EXECUTE FUNCTION sophia.work_commission_failed();

-- --- grants ---------------------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION sophia.propose_source_review(uuid,text,jsonb,jsonb), sophia.answer_work_decision(uuid,uuid,text,jsonb),
 sophia.work_command(uuid,uuid,text,jsonb), sophia.work_operation_receipt(uuid,text), sophia.read_work_result(uuid,uuid,uuid),
 sophia.source_review_availability(uuid,text,text),
 sophia.coordination_permit(bytea,jsonb), sophia.coordination_start(bytea,jsonb), sophia.coordination_observe(bytea,jsonb),
 sophia.coordination_cancel(bytea,jsonb),
 sophia.runtime_source_review_context(bytea,text,text,jsonb), sophia.runtime_source_review_reserve(bytea,text,text,jsonb),
 sophia.runtime_source_review_settle(bytea,text,text,jsonb), sophia.runtime_source_review_submit(bytea,text,text,jsonb),
 sophia.claim_coordination_outbox(text,integer,integer), sophia.record_coordination_delivery(uuid,uuid,uuid,text,jsonb,text),
 sophia.expire_coordination_leases() FROM PUBLIC;
-- Members, through the API's actor context.
GRANT EXECUTE ON FUNCTION sophia.propose_source_review(uuid,text,jsonb,jsonb), sophia.answer_work_decision(uuid,uuid,text,jsonb),
 sophia.work_command(uuid,uuid,text,jsonb), sophia.work_operation_receipt(uuid,text), sophia.read_work_result(uuid,uuid,uuid),
 sophia.source_review_availability(uuid,text,text) TO sophia_api;
-- The adapter and the runtime, through the API with their own capabilities (never a member identity).
GRANT EXECUTE ON FUNCTION sophia.coordination_permit(bytea,jsonb), sophia.coordination_start(bytea,jsonb),
 sophia.coordination_observe(bytea,jsonb), sophia.coordination_cancel(bytea,jsonb),
 sophia.runtime_source_review_context(bytea,text,text,jsonb), sophia.runtime_source_review_reserve(bytea,text,text,jsonb),
 sophia.runtime_source_review_settle(bytea,text,text,jsonb), sophia.runtime_source_review_submit(bytea,text,text,jsonb) TO sophia_api;
-- The worker delivers to the plugin.
GRANT EXECUTE ON FUNCTION sophia.claim_coordination_outbox(text,integer,integer), sophia.record_coordination_delivery(uuid,uuid,uuid,text,jsonb,text),
 sophia.expire_coordination_leases() TO sophia_worker;

COMMIT;
