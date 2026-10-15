-- The brief names who wrote a note and who decided, in a call or not (docs/plans/mission-author-names.md). The Studio
-- named them from the call's participants, so with nobody in the call they read «A member»; the service kept no name.
-- A note now keeps its author's name, and a decision its proposer's and its decider's: the API puts the token's own name
-- in the transaction (sophia.actor_name), and these triggers keep it for the transaction's own actor (sophia.actor_id)
-- only, so a row written for anyone else (a voice turn, a service) keeps none. They overwrite whatever a write sets, and
-- an update keeps the names already kept; the ledger's functions (0018, 0020) are not copied. 0001–0048 are not edited.
BEGIN;

ALTER TABLE sophia.mission_entries ADD COLUMN author_name text
 CHECK(author_name IS NULL OR length(author_name) BETWEEN 1 AND 320);
ALTER TABLE sophia.decisions
 ADD COLUMN proposed_by_name text CHECK(proposed_by_name IS NULL OR length(proposed_by_name) BETWEEN 1 AND 320),
 ADD COLUMN decided_by_name text CHECK(decided_by_name IS NULL OR length(decided_by_name) BETWEEN 1 AND 320);

-- The name the transaction's actor gave, for that actor only; null for anyone else or when none was given. Only the
-- triggers call it, as its owner.
CREATE FUNCTION sophia.transaction_actor_name(p_actor uuid) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_actor IS NOT NULL AND p_actor = nullif(current_setting('sophia.actor_id',true),'')::uuid
  THEN left(nullif(btrim(current_setting('sophia.actor_name',true)),''),320) END $$;
REVOKE ALL ON FUNCTION sophia.transaction_actor_name(uuid) FROM PUBLIC;

CREATE FUNCTION sophia.name_mission_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.author_name := sophia.transaction_actor_name(NEW.actor_id);
 ELSE
  NEW.author_name := OLD.author_name;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.name_mission_entry() FROM PUBLIC;
CREATE TRIGGER mission_entries_author_name BEFORE INSERT OR UPDATE ON sophia.mission_entries
 FOR EACH ROW EXECUTE FUNCTION sophia.name_mission_entry();

CREATE FUNCTION sophia.name_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.proposed_by_name := sophia.transaction_actor_name(NEW.proposed_by);
  NEW.decided_by_name := sophia.transaction_actor_name(NEW.decided_by);
 ELSE
  NEW.proposed_by_name := OLD.proposed_by_name;
  NEW.decided_by_name := CASE WHEN NEW.decided_by IS NOT DISTINCT FROM OLD.decided_by THEN OLD.decided_by_name
   ELSE sophia.transaction_actor_name(NEW.decided_by) END;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sophia.name_decision() FROM PUBLIC;
CREATE TRIGGER decisions_author_names BEFORE INSERT OR UPDATE ON sophia.decisions
 FOR EACH ROW EXECUTE FUNCTION sophia.name_decision();

COMMIT;
