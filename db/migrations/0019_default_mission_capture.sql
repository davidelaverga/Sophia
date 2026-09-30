-- Owner amendment: structured project notes are on by default. Explicit project off rows and each member's
-- own consent remain authoritative. No note, transcript or member consent is created by this migration.
BEGIN;
CREATE FUNCTION sophia.mission_capture_default() RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT 'automatic'::text $$;
REVOKE ALL ON FUNCTION sophia.mission_capture_default() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.mission_capture_default() TO sophia_api;
CREATE OR REPLACE FUNCTION sophia.mission_capture(p_project uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce((SELECT capture FROM sophia.mission_note_policies WHERE project_id=p_project),sophia.mission_capture_default())
$$;
REVOKE ALL ON FUNCTION sophia.mission_capture(uuid) FROM PUBLIC;
-- Existing no-policy projects now have a different effective policy. Move their revision so live readers refresh.
UPDATE sophia.projects SET ledger_revision=ledger_revision+1
WHERE NOT EXISTS(SELECT 1 FROM sophia.mission_note_policies p WHERE p.project_id=projects.id);
COMMIT;
