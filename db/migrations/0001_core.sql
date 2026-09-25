-- Sophia 0.4 foundation candidate. PostgreSQL 15+. Never run against legacy production.
-- This migration is authored, not executed in the documentation environment.
BEGIN;
DO $$ BEGIN
 IF current_setting('server_version_num')::integer < 150000 THEN RAISE EXCEPTION 'PostgreSQL 15+ required'; END IF;
END $$;
CREATE SCHEMA sophia;
CREATE SCHEMA sophia_secrets;
REVOKE ALL ON SCHEMA sophia, sophia_secrets FROM PUBLIC;
CREATE TABLE sophia.projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 created_by uuid NOT NULL, mission_revision bigint NOT NULL DEFAULT 1 CHECK(mission_revision>0),
 audience_revision bigint NOT NULL DEFAULT 1 CHECK(audience_revision>0),
 eligibility_revision bigint NOT NULL DEFAULT 1 CHECK(eligibility_revision>0),
 event_sequence bigint NOT NULL DEFAULT 0 CHECK(event_sequence>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sophia.project_members (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), actor_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','editor','viewer')), active boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), PRIMARY KEY(project_id,actor_id)
);
CREATE TABLE sophia.project_revisions (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), revision bigint NOT NULL CHECK(revision>0),
 frame jsonb NOT NULL CHECK(jsonb_typeof(frame)='object'), accepted_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,revision)
);
CREATE TABLE sophia.goals (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 title text NOT NULL, state_revision bigint NOT NULL DEFAULT 1 CHECK(state_revision>0), outcome text NOT NULL, criteria jsonb NOT NULL CHECK(jsonb_typeof(criteria)='array'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), authority_epoch bigint NOT NULL DEFAULT 1 CHECK(authority_epoch>0),
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','running','holding','held','stopping','stopped','checking','completed')),
 mission_revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,mission_revision) REFERENCES sophia.project_revisions(project_id,revision)
);
CREATE TABLE sophia.source_objects (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, scope text NOT NULL CHECK(scope IN ('private','project')),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), mime text NOT NULL, storage_key text NOT NULL,
 byte_length bigint NOT NULL CHECK(byte_length>=0), eligible boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready','blocked','deleted','failed')),
 eligibility_revision bigint NOT NULL DEFAULT 1 CHECK(eligibility_revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,id), UNIQUE(storage_key)
);
CREATE TABLE sophia.decisions (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), kind text NOT NULL,
 state text NOT NULL CHECK(state IN ('proposed','accepted','rejected','superseded')),
 body_source_id uuid NOT NULL, accepted_by uuid, PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,body_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.execution_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 upstream_origin text NOT NULL, upstream_subject text,
 state text NOT NULL CHECK(state IN ('pending','linked','expired','denied','revoked','rotation_unknown')),
 revision bigint NOT NULL DEFAULT 1, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id)
);
CREATE TABLE sophia_secrets.execution_credentials (
 connection_id uuid PRIMARY KEY REFERENCES sophia.execution_connections(id),
 ciphertext bytea NOT NULL, key_id text NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 rotation_state text NOT NULL CHECK(rotation_state IN ('current','rotating','unknown','revoked')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sophia.executor_resources (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, connection_id uuid, host_id text,
 harness text NOT NULL CHECK(harness IN ('codex-native','claude-native','dsh')),
 label text NOT NULL, repository_root text NOT NULL,
 allowed_operations text[] NOT NULL DEFAULT '{}', concurrency_limit integer NOT NULL DEFAULT 1 CHECK(concurrency_limit BETWEEN 1 AND 3),
 state text NOT NULL CHECK(state IN ('active','revoked','needs_connection')),
 revision bigint NOT NULL DEFAULT 1, PRIMARY KEY(project_id,id),
 FOREIGN KEY(connection_id,owner_id) REFERENCES sophia.execution_connections(id,owner_id),
 CHECK((harness='dsh' AND connection_id IS NULL) OR (harness<>'dsh' AND connection_id IS NOT NULL))
);
CREATE TABLE sophia.work_attempts (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), goal_id uuid NOT NULL,
 goal_revision bigint NOT NULL, authority_epoch bigint NOT NULL, context_source_id uuid,
 state text NOT NULL CHECK(state IN ('admitted','running','checking','accepted','failed','held','stopped','outcome_unknown')),
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,context_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.execution_bindings (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL, resource_id uuid NOT NULL,
 native_session_id text, native_runner_id text, native_host_id text, runtime_unit_id text NOT NULL,
 continuation_owner text NOT NULL CHECK(continuation_owner IN ('sophia_episode','native_goal')),
 state text NOT NULL CHECK(state IN ('created','launching','running','idle','stopping','settled','lost')),
 observed_at timestamptz, PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,resource_id) REFERENCES sophia.executor_resources(project_id,id)
);
CREATE TABLE sophia.commands (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
 goal_id uuid, goal_revision bigint, authority_epoch bigint,
 kind text NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 semantic_request jsonb NOT NULL, body_source_id uuid,
 state text NOT NULL CHECK(state IN ('admitted','dispatching','acknowledged','checked','denied','outcome_unknown','superseded')),
 receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,id),
 UNIQUE(project_id,actor_id,idempotency_key), FOREIGN KEY(project_id) REFERENCES sophia.projects(id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,body_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.project_events (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), sequence bigint NOT NULL CHECK(sequence>0),
 id uuid NOT NULL DEFAULT gen_random_uuid(), type text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
 entity_revision bigint NOT NULL CHECK(entity_revision>0), references_json jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(references_json)='array'),
 summary_code text NOT NULL, actor_id uuid, visibility_owner uuid,
 occurred_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,sequence), UNIQUE(project_id,id)
);
CREATE TABLE sophia.outbox (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), command_id uuid NOT NULL,
 destination text NOT NULL, destination_key text NOT NULL, binding_id uuid, goal_id uuid NOT NULL,
 authority_epoch bigint NOT NULL, cleanup boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','dispatching','acknowledged','outcome_unknown','settled','superseded','denied')),
 lease_owner text, lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,command_id,destination_key),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id),
 FOREIGN KEY(project_id,binding_id) REFERENCES sophia.execution_bindings(project_id,id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id)
);
CREATE INDEX outbox_pending ON sophia.outbox(available_at,created_at) WHERE state='pending';
CREATE TABLE sophia.native_observations (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), binding_id uuid NOT NULL,
 upstream_key text NOT NULL, type text NOT NULL, body_source_id uuid,
 observed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,id), UNIQUE(project_id,binding_id,upstream_key),
 FOREIGN KEY(project_id,binding_id) REFERENCES sophia.execution_bindings(project_id,id),
 FOREIGN KEY(project_id,body_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.human_actions (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, binding_id uuid NOT NULL,
 native_request_id text NOT NULL, fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL, state text NOT NULL CHECK(state IN ('pending','accepted','declined','cancelled','expired','resolved_unknown','superseded')),
 response_mode text NOT NULL CHECK(response_mode IN ('native_only','in_app_form','in_app_binary')),
 details_source_id uuid, expires_at timestamptz, PRIMARY KEY(project_id,id),
 UNIQUE(project_id,binding_id,native_request_id), FOREIGN KEY(project_id,binding_id) REFERENCES sophia.execution_bindings(project_id,id),
 FOREIGN KEY(project_id,details_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.review_intents (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), goal_id uuid NOT NULL,
 goal_revision bigint NOT NULL, authority_epoch bigint NOT NULL, actor_id uuid NOT NULL,
 artifact_version_id uuid NOT NULL, preview_id uuid NOT NULL, change_source_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('recorded','clarifying','admitted','delivered','checked','superseded')),
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,change_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.lead_reviews (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), state text NOT NULL,
 snapshot_source_id uuid NOT NULL, result_source_id uuid, trigger_kinds text[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,snapshot_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,result_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE UNIQUE INDEX one_active_lead_review ON sophia.lead_reviews(project_id) WHERE state IN ('pending','running');
CREATE TABLE sophia.artifacts (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 title text NOT NULL, format text NOT NULL CHECK(format IN ('html','pdf','pptx','ui')), stable_version_id uuid,
 PRIMARY KEY(project_id,id)
);
CREATE TABLE sophia.artifact_versions (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), artifact_id uuid NOT NULL, parent_id uuid,
 source_id uuid NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),
 goal_id uuid NOT NULL, goal_revision bigint NOT NULL, authority_epoch bigint NOT NULL,
 state text NOT NULL CHECK(state IN ('candidate','validated','stable','rejected','superseded')),
 validation_source_id uuid, checks_passed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,artifact_id,id),
 FOREIGN KEY(project_id,artifact_id) REFERENCES sophia.artifacts(project_id,id),
 FOREIGN KEY(project_id,parent_id) REFERENCES sophia.artifact_versions(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,validation_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id)
);
CREATE TABLE sophia.previews (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), artifact_version_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('static','prototype','integrated_app','remote_browser')),
 state text NOT NULL CHECK(state IN ('preparing','ready','failed','retired')),
 address_source_id uuid NOT NULL, checked_source_hash text NOT NULL CHECK(checked_source_hash ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,artifact_version_id,id),
 FOREIGN KEY(project_id,artifact_version_id) REFERENCES sophia.artifact_versions(project_id,id),
 FOREIGN KEY(project_id,address_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.review_intent_preserve_sources (
 project_id uuid NOT NULL, review_intent_id uuid NOT NULL, source_id uuid NOT NULL,
 PRIMARY KEY(project_id,review_intent_id,source_id),
 FOREIGN KEY(project_id,review_intent_id) REFERENCES sophia.review_intents(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);
ALTER TABLE sophia.review_intents ADD CONSTRAINT reviewed_preview_same_version FOREIGN KEY(project_id,artifact_version_id,preview_id)
 REFERENCES sophia.previews(project_id,artifact_version_id,id);
CREATE TABLE sophia.goal_dependencies (
 project_id uuid NOT NULL, goal_id uuid NOT NULL, depends_on_id uuid NOT NULL,
 PRIMARY KEY(project_id,goal_id,depends_on_id), CHECK(goal_id<>depends_on_id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,depends_on_id) REFERENCES sophia.goals(project_id,id)
);
ALTER TABLE sophia.artifacts ADD CONSTRAINT stable_version_same_artifact FOREIGN KEY(project_id,id,stable_version_id)
 REFERENCES sophia.artifact_versions(project_id,artifact_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sophia.review_intents ADD CONSTRAINT review_version_fk FOREIGN KEY(project_id,artifact_version_id)
 REFERENCES sophia.artifact_versions(project_id,id);
CREATE TABLE sophia.source_dependencies (
 project_id uuid NOT NULL, source_id uuid NOT NULL, derived_source_id uuid NOT NULL,
 PRIMARY KEY(project_id,source_id,derived_source_id), CHECK(source_id<>derived_source_id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,derived_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.jobs (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 kind text NOT NULL, input_source_id uuid, result_source_id uuid, command_id uuid,
 state text NOT NULL CHECK(state IN ('pending','running','succeeded','failed','cancelled','outcome_unknown')),
 available_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,input_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,result_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,command_id) REFERENCES sophia.commands(project_id,id)
);
CREATE TABLE sophia.knowledge_pages (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), body_source_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('draft','current','stale','retired')), kind text NOT NULL,
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,body_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.context_manifests (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), body_source_id uuid NOT NULL,
 audience_revision bigint NOT NULL, eligibility_revision bigint NOT NULL, state text NOT NULL CHECK(state IN ('eligible','retired')),
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,body_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.usage_records (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), attempt_id uuid, provider_call_id text,
 payer_id uuid, billing_kind text NOT NULL CHECK(billing_kind IN ('subscription','api','infrastructure','unknown')),
 input_tokens bigint CHECK(input_tokens>=0), output_tokens bigint CHECK(output_tokens>=0),
 actual_cost numeric(16,8) CHECK(actual_cost>=0), estimated_cost numeric(16,8) CHECK(estimated_cost>=0), currency text,
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id)
);
CREATE TABLE sophia.cooperation_opportunities (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), artifact_version_id uuid NOT NULL,
 body_source_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('open','accepted','declined','later','expired','superseded')),
 valid_until timestamptz, no_response_behavior text NOT NULL,
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,artifact_version_id) REFERENCES sophia.artifact_versions(project_id,id),
 FOREIGN KEY(project_id,body_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.viewer_attention (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), actor_id uuid NOT NULL, last_seen_sequence bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,actor_id), CHECK(last_seen_sequence>=0)
);
CREATE TABLE sophia.room_state (
 project_id uuid PRIMARY KEY REFERENCES sophia.projects(id), id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 revision bigint NOT NULL DEFAULT 1, input_actor_id uuid, guide_actor_id uuid,
 shared_focus_version_id uuid, mode text NOT NULL DEFAULT 'invoked' CHECK(mode IN ('invoked','follow_discussion')),
 FOREIGN KEY(project_id,shared_focus_version_id) REFERENCES sophia.artifact_versions(project_id,id)
);
COMMIT;
