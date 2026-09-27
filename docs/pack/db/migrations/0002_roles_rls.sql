-- Run as the migration owner, after 0001. Private schemas are not PostgREST exposed.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_api') THEN CREATE ROLE sophia_api NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_worker') THEN CREATE ROLE sophia_worker NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('sophia_api','sophia_worker') AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Existing application role has unsafe superuser/BYPASSRLS attributes'; END IF;
END $$;
GRANT USAGE ON SCHEMA sophia TO sophia_api, sophia_worker;
CREATE FUNCTION sophia.actor_id() RETURNS uuid LANGUAGE sql STABLE
SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('sophia.actor_id',true),'')::uuid $$;
CREATE FUNCTION sophia.is_member(p_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$ SELECT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=sophia.actor_id() AND active) $$;
CREATE FUNCTION sophia.can_edit(p_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$ SELECT EXISTS(SELECT 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=sophia.actor_id() AND active AND role IN ('admin','editor')) $$;
REVOKE ALL ON FUNCTION sophia.actor_id(),sophia.is_member(uuid),sophia.can_edit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.actor_id(),sophia.is_member(uuid),sophia.can_edit(uuid) TO sophia_api,sophia_worker;
ALTER TABLE sophia.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.projects FOR SELECT TO sophia_api USING(sophia.is_member(id));
ALTER TABLE sophia.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.project_members FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.source_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY eligible_sources_read ON sophia.source_objects FOR SELECT TO sophia_api USING(
 sophia.is_member(project_id) AND ((owner_id=sophia.actor_id()) OR (scope='project' AND eligible AND state='ready'))
);
ALTER TABLE sophia.project_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_events_read ON sophia.project_events FOR SELECT TO sophia_api USING(
 sophia.is_member(project_id) AND (visibility_owner IS NULL OR visibility_owner=sophia.actor_id())
);
ALTER TABLE sophia.execution_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_connections_read ON sophia.execution_connections FOR SELECT TO sophia_api USING(owner_id=sophia.actor_id());
ALTER TABLE sophia.viewer_attention ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_attention_read ON sophia.viewer_attention FOR SELECT TO sophia_api USING(sophia.is_member(project_id) AND actor_id=sophia.actor_id());
ALTER TABLE sophia_secrets.execution_credentials ENABLE ROW LEVEL SECURITY;
-- No ordinary query-role secret policy or grant. A distinct trusted credential broker owns encrypted-secret access.
ALTER TABLE sophia.project_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.project_revisions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.goals FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.decisions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.executor_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.executor_resources FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.work_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.work_attempts FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.execution_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.execution_bindings FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.commands FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.outbox FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.native_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.native_observations FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.human_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.human_actions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.review_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.review_intents FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.lead_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.lead_reviews FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.artifacts FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.artifact_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.artifact_versions FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.source_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.source_dependencies FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.jobs FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.knowledge_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.knowledge_pages FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.context_manifests ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.context_manifests FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.usage_records FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.cooperation_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.cooperation_opportunities FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.room_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.room_state FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.previews ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.previews FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.review_intent_preserve_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.review_intent_preserve_sources FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
ALTER TABLE sophia.goal_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.goal_dependencies FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON ALL TABLES IN SCHEMA sophia TO sophia_api;
-- No INSERT/UPDATE/DELETE grants: domain write functions explicitly recheck their authority.
REVOKE ALL ON SCHEMA sophia_secrets FROM sophia_api,sophia_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA sophia_secrets FROM PUBLIC,sophia_api,sophia_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA sophia REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sophia_secrets REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;
