-- A voice write names its speaker (docs/plans/voice-author-names.md). The API signs each member's room token with
-- their account name; the database now keeps it for the project then (remember_room_name), and a voice write by that
-- member puts it in its own transaction (name_from_room), so 0048's and 0049's names fill for it as for a typed write.
-- Only a member's own name is kept or read, a name the transaction already carries wins, and no name leaves the
-- database. 0001–0049 are not edited.
BEGIN;

CREATE TABLE sophia.room_names (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), actor_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 320), named_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id)
);
ALTER TABLE sophia.room_names ENABLE ROW LEVEL SECURITY;

-- The name the transaction carries (the API's nameActor, from the verified token), kept for the actor in this project
-- while they are an active member; nothing for anyone else or without a name.
CREATE FUNCTION sophia.remember_room_name(p_project uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); nm text:=left(nullif(btrim(current_setting('sophia.actor_name',true)),''),320);
BEGIN
 IF a IS NULL OR nm IS NULL OR NOT sophia.is_member(p_project) THEN RETURN; END IF;
 INSERT INTO sophia.room_names(project_id,actor_id,name) VALUES(p_project,a,nm)
 ON CONFLICT (project_id,actor_id) DO UPDATE SET name=EXCLUDED.name, named_at=now()
  WHERE sophia.room_names.name IS DISTINCT FROM EXCLUDED.name;
END $$;

-- The actor's own kept name, put in the transaction for the rows that keep a name, unless it carries one already.
CREATE FUNCTION sophia.name_from_room(p_project uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE nm text;
BEGIN
 IF nullif(btrim(current_setting('sophia.actor_name',true)),'') IS NOT NULL THEN RETURN; END IF;
 SELECT name INTO nm FROM sophia.room_names WHERE project_id=p_project AND actor_id=sophia.actor_id();
 IF nm IS NOT NULL THEN PERFORM set_config('sophia.actor_name',nm,true); END IF;
END $$;

REVOKE ALL ON FUNCTION sophia.remember_room_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.remember_room_name(uuid) TO sophia_api;
REVOKE ALL ON FUNCTION sophia.name_from_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.name_from_room(uuid) TO sophia_api;

COMMIT;
