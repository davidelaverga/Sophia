-- A person names themself, and nobody is named by their address (docs/plans/actor-profiles.md, #365 sections 6 and 8,
-- FND-C1-PROFILE). Until now the name a row kept and the room kept was the token's email (0048–0050), and the members
-- (0054), the activity (0057, 0061) and the carried notes (0021) handed it to every member as a name.
--
-- - actor_profiles keeps one display name per account: 1–60 characters, trimmed, no control or invisible characters,
--   never an address. The account's provider name seeds it while the person hasn't chosen one; a name they choose
--   (set_my_profile, compare-and-set on its revision, idempotent per key) is never replaced by a seed.
-- - The API now puts two values in the transaction (name_actor): the display name as sophia.actor_name, which 0048's
--   and 0049's rows keep as before, and the verified address as sophia.actor_contact, which only the room keeps
--   (remember_room_name), for invitations (0055). room_names is therefore an address book, never read as a name.
-- - actor_label is the one reader of a person's name: their current display name, else what a row kept when it isn't
--   an address, else null (the Studio's «A member»). A rename shows on everything they wrote before; who wrote it and
--   when are not touched. It answers only a member of the project, about someone who has been in it.
-- An API from before this migration keeps working on it: the address it still sets as sophia.actor_name is kept by
-- the room as an address and never read as a name. 0001–0061 are not edited.
BEGIN;

-- A name without the spaces around it, Unicode spaces included.
CREATE FUNCTION sophia.trim_name(p_name text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT regexp_replace(p_name, '^[[:space:]\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+|[[:space:]\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+$', '', 'g') $$;

-- A display name: trimmed, 1–60 characters, no control, format or line-separator characters, and no '@', so an
-- address can never be one.
CREATE FUNCTION sophia.display_name_ok(p_name text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT p_name IS NOT NULL AND char_length(p_name) BETWEEN 1 AND 60
  AND p_name = sophia.trim_name(p_name)
  AND p_name !~ '[\u0001-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]'
  AND strpos(p_name, '@') = 0 $$;

-- What a row kept as its author's name, if it may be shown: not an address (0048–0050 kept the token's email).
CREATE FUNCTION sophia.kept_name(p_kept text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT CASE WHEN strpos(p_kept, '@') = 0 THEN nullif(btrim(p_kept), '') END $$;

CREATE TABLE sophia.actor_profiles (
 actor_id uuid PRIMARY KEY,
 display_name text CHECK(display_name IS NULL OR sophia.display_name_ok(display_name)),
 -- The person set it themself; a provider's name never replaces it.
 chosen boolean NOT NULL DEFAULT false CHECK(NOT chosen OR display_name IS NOT NULL),
 -- Counts the person's own edits; a seed does not move it.
 revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sophia.actor_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE sophia.actor_profile_writes (
 actor_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 semantic_request jsonb NOT NULL, receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id, idempotency_key)
);
ALTER TABLE sophia.actor_profile_writes ENABLE ROW LEVEL SECURITY;

-- The caller's own profile, as the API answers it.
CREATE FUNCTION sophia.profile_of(p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('displayName', p.display_name, 'chosen', coalesce(p.chosen, false),
  'revision', coalesce(p.revision, 0))
   FROM (SELECT p_actor AS actor_id) me LEFT JOIN sophia.actor_profiles p ON p.actor_id = me.actor_id $$;
REVOKE ALL ON FUNCTION sophia.profile_of(uuid) FROM PUBLIC;

-- The verified actor's names for this transaction, from their own token (the API's nameActor), never from a request:
-- the provider's name seeds a profile they haven't chosen; their display name becomes sophia.actor_name for the rows
-- that keep one (0048, 0049), and their address sophia.actor_contact for the room's address book (0050, 0055). Answers
-- the display name, or null.
CREATE FUNCTION sophia.name_actor(p_seed text, p_contact text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); seed text:=sophia.trim_name(coalesce(p_seed,''));
 contact text:=left(nullif(btrim(coalesce(p_contact,'')),''),320); shown text;
BEGIN
 IF a IS NULL THEN RETURN NULL; END IF;
 IF sophia.display_name_ok(seed) THEN
  INSERT INTO sophia.actor_profiles(actor_id, display_name) VALUES(a, seed)
  ON CONFLICT (actor_id) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=now()
   WHERE NOT sophia.actor_profiles.chosen AND sophia.actor_profiles.display_name IS DISTINCT FROM EXCLUDED.display_name;
 END IF;
 SELECT display_name INTO shown FROM sophia.actor_profiles WHERE actor_id=a;
 PERFORM set_config('sophia.actor_name', coalesce(shown,''), true);
 PERFORM set_config('sophia.actor_contact', coalesce(contact,''), true);
 RETURN shown;
END $$;
REVOKE ALL ON FUNCTION sophia.name_actor(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.name_actor(text,text) TO sophia_api;

-- getMyProfile: the caller's own name, its revision and whether they chose it.
CREATE FUNCTION sophia.my_profile() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id();
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 RETURN sophia.profile_of(a);
END $$;
REVOKE ALL ON FUNCTION sophia.my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.my_profile() TO sophia_api;

-- updateMyProfile: the caller names themself, compare-and-set on the profile's revision (0 before any edit), idempotent
-- per actor and key: the same key with the same name and revision answers the same receipt, with another it is a
-- conflict. The name is trimmed here; spaces alone, an address, a control character or more than 60 characters are
-- refused. Only the caller's own row can change: there is no actor argument.
CREATE FUNCTION sophia.set_my_profile(p_display_name text, p_expected bigint, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); nm text:=sophia.trim_name(coalesce(p_display_name,''));
 semantic jsonb; prior sophia.actor_profile_writes; cur sophia.actor_profiles; receipt_value jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 IF p_expected IS NULL OR p_expected < 0 THEN RAISE EXCEPTION 'Invalid expected revision' USING ERRCODE='22023'; END IF;
 semantic:=jsonb_build_object('displayName', nm, 'expectedRevision', p_expected);
 INSERT INTO sophia.actor_profile_writes(actor_id, idempotency_key, semantic_request) VALUES(a, p_key, semantic)
  ON CONFLICT (actor_id, idempotency_key) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO prior FROM sophia.actor_profile_writes WHERE actor_id=a AND idempotency_key=p_key;
  IF prior.semantic_request<>semantic THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF nm='' THEN RAISE EXCEPTION 'A display name is needed' USING ERRCODE='22023'; END IF;
 IF strpos(nm,'@')>0 THEN RAISE EXCEPTION 'A display name, not an address' USING ERRCODE='22023'; END IF;
 IF NOT sophia.display_name_ok(nm) THEN RAISE EXCEPTION 'Invalid display name' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.actor_profiles(actor_id) VALUES(a) ON CONFLICT (actor_id) DO NOTHING;
 SELECT * INTO cur FROM sophia.actor_profiles WHERE actor_id=a FOR UPDATE;
 IF cur.revision<>p_expected THEN RAISE EXCEPTION 'Stale profile' USING ERRCODE='40001'; END IF;
 UPDATE sophia.actor_profiles SET display_name=nm, chosen=true, revision=revision+1, updated_at=now() WHERE actor_id=a;
 receipt_value:=sophia.profile_of(a);
 UPDATE sophia.actor_profile_writes SET receipt=receipt_value WHERE actor_id=a AND idempotency_key=p_key;
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION sophia.set_my_profile(text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.set_my_profile(text,bigint,text) TO sophia_api;

-- A person as a project's members see them: their current display name while they have been in the project (a member,
-- now or before, or a guest at its door), else what the row kept (p_kept) when it isn't an address, else null. Null for
-- a caller who isn't a member. The one place a shared reader names a person.
CREATE FUNCTION sophia.actor_label(p_project uuid, p_actor uuid, p_kept text) RETURNS text LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN p_project IS NOT NULL AND sophia.is_member(p_project) THEN coalesce(
  (SELECT p.display_name FROM sophia.actor_profiles p WHERE p.actor_id=p_actor
     AND (EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=p_project AND m.actor_id=p_actor)
       OR EXISTS(SELECT 1 FROM sophia.room_lobby l WHERE l.project_id=p_project AND l.actor_id=p_actor))),
  sophia.kept_name(p_kept)) END $$;
REVOKE ALL ON FUNCTION sophia.actor_label(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.actor_label(uuid,uuid,text) TO sophia_api;

-- 0050's, keeping the actor's address for the project (invitable_people, 0055), never their display name: the address
-- the transaction carries, or from an API before 0062, the name it set when that name is an address.
CREATE OR REPLACE FUNCTION sophia.remember_room_name(p_project uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); legacy text:=nullif(btrim(current_setting('sophia.actor_name',true)),'');
 nm text:=left(coalesce(nullif(btrim(current_setting('sophia.actor_contact',true)),''),
  CASE WHEN strpos(legacy,'@')>0 THEN legacy END),320);
BEGIN
 IF a IS NULL OR nm IS NULL OR NOT sophia.is_member(p_project) THEN RETURN; END IF;
 INSERT INTO sophia.room_names(project_id,actor_id,name) VALUES(p_project,a,nm)
 ON CONFLICT (project_id,actor_id) DO UPDATE SET name=EXCLUDED.name, named_at=now()
  WHERE sophia.room_names.name IS DISTINCT FROM EXCLUDED.name;
END $$;

-- 0050's, for a voice write: the speaker's own display name in the transaction, unless it carries one already. The
-- room's kept address is no longer a name.
CREATE OR REPLACE FUNCTION sophia.name_from_room(p_project uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE nm text;
BEGIN
 IF nullif(btrim(current_setting('sophia.actor_name',true)),'') IS NOT NULL THEN RETURN; END IF;
 IF NOT sophia.is_member(p_project) THEN RETURN; END IF;
 SELECT display_name INTO nm FROM sophia.actor_profiles WHERE actor_id=sophia.actor_id();
 IF nm IS NOT NULL THEN PERFORM set_config('sophia.actor_name',nm,true); END IF;
END $$;

-- 0054's members, named by actor_label instead of the room's address book.
CREATE OR REPLACE FUNCTION sophia.project_members_named(p_project uuid)
RETURNS TABLE(actor_id uuid, role text, name text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT m.actor_id, m.role, n.name FROM sophia.project_members m
   CROSS JOIN LATERAL (SELECT sophia.actor_label(m.project_id, m.actor_id, NULL) AS name) n
  WHERE m.project_id=p_project AND m.active AND sophia.is_member(p_project)
  ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, n.name NULLS LAST, m.actor_id $$;

-- 0061's activity name: the person's label, else the name they gave at the room's door (0010).
CREATE OR REPLACE FUNCTION sophia.activity_name(p_project uuid, p_actor uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT COALESCE(
  sophia.actor_label(p_project, p_actor, NULL),
  (SELECT l.display_name FROM sophia.room_lobby l WHERE l.project_id=p_project AND l.actor_id=p_actor
    ORDER BY l.requested_at DESC LIMIT 1))
$$;

REVOKE ALL ON FUNCTION sophia.trim_name(text), sophia.display_name_ok(text), sophia.kept_name(text) FROM PUBLIC;

COMMIT;
