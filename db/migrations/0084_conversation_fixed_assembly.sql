-- FND-B-ASK-ALTERNATIVE-01: a reply's context assembled through FIXED claim-bound reader functions, a versioned mode
-- selected by a separate operator act and OFF until then. The login route (0070/0071, Q13) cannot be activated on a
-- managed cluster whose PUBLIC defaults every login inherits (template1 CONNECT, not revocable by the customer owner):
-- Q13 confines the execution login AND the assembler, PUBLIC-derived authority included, and is not changed here; its
-- activation stays held. This mode has NO execution login: no session can act as the assembler at all.
-- * Eight readers, one per statement the assembly path issues today (mission-context.ts 'assembly' labels and the
--   window read), with the same columns and types. Each is SECURITY DEFINER, search_path pg_catalog,sophia,pg_temp
--   (pg_temp last: a caller's temporary relation shadows nothing), and refuses unless it runs as the assembler, i.e.
--   unless the assembler owns it: the assembler's grants and its claim-bound policies (0070) are the read control,
--   never an owner's. A caller passes the claim (reply, attempt, token) and, for three, a fixed variant word; project,
--   asker, conversation and window come from server records through conversation_assembly_bind, which accepts only a
--   current claim begun in THIS transaction (conversation_assembly_begin) and sets the asker as the transaction's
--   actor itself, on every call, so a caller's own sophia.actor_id is overwritten; the asker stays the actor for the
--   record that follows, as the login route sets it (the record rebuilds every item from its rows and accepts only
--   what matches, 0064). No reader takes SQL, a relation, a function, a role, an actor or a project from its caller.
-- * Installed OFF: the readers are owned by the installation owner (so they refuse) and executable by sophia_worker
--   alone; the worker holds no entry point, so it can begin no claim; the assembler gains nothing (its grants, members
--   and dependencies are 0070's, so the login route's Q13 check reads them as before); conversation_assembler_admitted()
--   keeps the login rule unchanged.
-- * conversation_enable_fixed_assembly(), the separate operator act (trusted installation owner postgres, or a
--   superuser installation): refused while the assembler has any member but its recorded creator edge (no login route
--   may coexist) or belongs to any role. It gives the readers to the assembler, grants the assembler EXECUTE on the
--   bind helper and the reader guard, and grants sophia_worker EXECUTE on the five entry points. Giving a function to a role needs SET on it and CREATE for it on the schema: a non-superuser
--   owner grants itself SET (no INHERIT) and the assembler CREATE on schema sophia for the transfer, and revokes both
--   before it returns. conversation_disable_fixed_assembly() reverses it (taking the functions back needs the owner's
--   privileges, so its own temporary edge carries INHERIT, likewise revoked). These temporary edges are effects of the
--   acts, recorded here; a clean final state is not an approval to run them.
-- * conversation_assembler_admitted() (0071), replaced: while sophia_worker holds the begin entry point it answers for
--   the fixed mode alone (every reader owned by the assembler, the assembler a bare NOLOGIN role belonging to none and
--   with no member but its creator edge); otherwise its 0071 login rule, byte for byte. Both at once is never true.
-- * New authority, stated (not a fix of Q13, which stays held): sophia_worker may claim, begin, close, fail and record
--   a reply's context and call the readers; the assembler owns the eight readers. Everything else, and 0001-0083, is
--   unchanged.
BEGIN;

-- The claim a reader is bound to: current (no outcome, lease live, token and attempt matching) and begun in this very
-- transaction, the reply still pending. The asker becomes the actor here, from the reply, never from the caller.
CREATE FUNCTION sophia.conversation_assembly_bind(p_reply uuid, p_attempt integer, p_token uuid, OUT project_id uuid,
 OUT conversation_id uuid, OUT asked_by uuid, OUT message_id uuid, OUT window_ids uuid[]) LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE r sophia.conversation_replies; k sophia.conversation_assembly_claims;
BEGIN
 SELECT * INTO r FROM sophia.conversation_replies x WHERE x.id=p_reply;
 IF NOT FOUND THEN RAISE EXCEPTION 'claim_not_current' USING ERRCODE='55000'; END IF;
 k:=sophia.conversation_assembly_current(r,p_attempt,p_token);
 IF k.begun_xid IS NULL OR k.begun_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() OR r.state<>'pending' THEN
  RAISE EXCEPTION 'claim_not_current' USING ERRCODE='55000'; END IF;
 PERFORM set_config('sophia.actor_id',r.asked_by::text,true);
 project_id:=r.project_id; conversation_id:=r.conversation_id; asked_by:=r.asked_by; message_id:=r.message_id;
 window_ids:=k.window_ids;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_assembly_bind(uuid,integer,uuid) FROM PUBLIC;

-- A reader runs only as the assembler: owned by any other role it refuses before it reads.
CREATE FUNCTION sophia.conversation_assembly_reader() RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'sophia_conversation_assembler' THEN
  RAISE EXCEPTION 'fixed assembly is not enabled' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_assembly_reader() FROM PUBLIC;

CREATE FUNCTION sophia.conversation_assembly_read_project(p_reply uuid, p_attempt integer, p_token uuid)
RETURNS TABLE(id uuid, title text, mission_revision bigint, ledger_revision bigint, eligibility_revision bigint, frame jsonb,
 accepted_by uuid, accepted_at timestamptz, role text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 RETURN QUERY SELECT p.id, p.title, p.mission_revision, p.ledger_revision, p.eligibility_revision, r.frame, r.accepted_by,
            r.created_at AS accepted_at,
            (SELECT m.role FROM sophia.project_members m WHERE m.project_id = p.id AND m.actor_id = b.asked_by AND m.active) AS role
       FROM sophia.projects p
       JOIN sophia.project_revisions r ON r.project_id = p.id AND r.revision = p.mission_revision
      WHERE p.id = b.project_id;
END $$;
CREATE FUNCTION sophia.conversation_assembly_read_decisions(p_reply uuid, p_attempt integer, p_token uuid, p_which text)
RETURNS TABLE(id uuid, revision bigint, kind text, state text, proposal jsonb, proposed_by uuid, origin text, created_at timestamptz,
 base_mission_revision bigint, supersedes_decision_id uuid, supporting_entry_ids uuid[], decided_by uuid,
 decided_at timestamptz, decided_via text, proposed_by_name text, decided_by_name text, body_source_id uuid, sha256 text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 IF p_which='constraints' THEN
  RETURN QUERY SELECT * FROM (SELECT d.id, d.revision, d.kind, d.state, d.proposal, d.proposed_by, d.origin, d.created_at,
  d.base_mission_revision, d.supersedes_decision_id, d.supporting_entry_ids, d.decided_by, d.decided_at, d.decided_via,
  sophia.conversation_actor_label(d.project_id, d.proposed_by, d.proposed_by_name) AS proposed_by_name,
  sophia.conversation_actor_label(d.project_id, d.decided_by, d.decided_by_name) AS decided_by_name, d.body_source_id, s.sha256 FROM sophia.decisions d
        JOIN sophia.source_objects s ON s.project_id = d.project_id AND s.id = d.body_source_id
       WHERE d.project_id = b.project_id AND d.proposal IS NOT NULL AND d.state = 'accepted' AND d.kind IN ('constraint', 'lesson')
       ORDER BY d.created_at DESC, d.id DESC LIMIT 50) latest
      ORDER BY created_at, id;
 ELSIF p_which='pending' THEN
  RETURN QUERY SELECT * FROM (SELECT d.id, d.revision, d.kind, d.state, d.proposal, d.proposed_by, d.origin, d.created_at,
  d.base_mission_revision, d.supersedes_decision_id, d.supporting_entry_ids, d.decided_by, d.decided_at, d.decided_via,
  sophia.conversation_actor_label(d.project_id, d.proposed_by, d.proposed_by_name) AS proposed_by_name,
  sophia.conversation_actor_label(d.project_id, d.decided_by, d.decided_by_name) AS decided_by_name, d.body_source_id, s.sha256 FROM sophia.decisions d
        JOIN sophia.source_objects s ON s.project_id = d.project_id AND s.id = d.body_source_id
       WHERE d.project_id = b.project_id AND d.proposal IS NOT NULL AND d.state = 'proposed'
       ORDER BY d.created_at DESC, d.id DESC LIMIT 50) latest
      ORDER BY created_at, id;
 ELSIF p_which='decided' THEN
  RETURN QUERY SELECT * FROM (SELECT d.id, d.revision, d.kind, d.state, d.proposal, d.proposed_by, d.origin, d.created_at,
  d.base_mission_revision, d.supersedes_decision_id, d.supporting_entry_ids, d.decided_by, d.decided_at, d.decided_via,
  sophia.conversation_actor_label(d.project_id, d.proposed_by, d.proposed_by_name) AS proposed_by_name,
  sophia.conversation_actor_label(d.project_id, d.decided_by, d.decided_by_name) AS decided_by_name, d.body_source_id, s.sha256 FROM sophia.decisions d
        JOIN sophia.source_objects s ON s.project_id = d.project_id AND s.id = d.body_source_id
       WHERE d.project_id = b.project_id AND d.proposal IS NOT NULL AND d.state IN ('rejected', 'superseded', 'accepted')
       ORDER BY d.decided_at DESC, d.id DESC LIMIT 10) latest
      ORDER BY decided_at, id;
 ELSE RAISE EXCEPTION 'unknown reader variant' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION sophia.conversation_assembly_read_entries(p_reply uuid, p_attempt integer, p_token uuid, p_which text)
RETURNS TABLE(id uuid, kind text, epistemic text, state text, body text, authored_by text, actor_id uuid, author_name text,
 origin text, exchange_id uuid, input_epoch bigint, related_entry_id uuid, supersedes_entry_id uuid, superseded_by uuid,
 goal_id uuid, decision_id uuid, source_id uuid, sha256 text, ledger_revision bigint, observed_at timestamptz,
 recorded_at timestamptz, changed_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 IF p_which='current' THEN
  RETURN QUERY SELECT * FROM (SELECT e.id, e.kind, e.epistemic, e.state, t.body, e.authored_by, e.actor_id,
  sophia.conversation_actor_label(e.project_id, e.actor_id, e.author_name) AS author_name, e.origin,
  e.exchange_id,
  e.input_epoch, e.related_entry_id, e.supersedes_entry_id,
  (SELECT n.id FROM sophia.mission_entries n WHERE n.project_id = e.project_id AND n.supersedes_entry_id = e.id LIMIT 1) AS superseded_by,
  e.goal_id, e.decision_id, e.source_id, s.sha256, e.ledger_revision, e.observed_at, e.recorded_at, e.changed_at FROM sophia.mission_entries e
        LEFT JOIN sophia.source_objects s ON s.project_id = e.project_id AND s.id = e.source_id
        LEFT JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
       WHERE e.project_id = b.project_id AND e.state = ANY(ARRAY['current']::text[])
       ORDER BY e.recorded_at DESC, e.id DESC LIMIT 50) latest
      ORDER BY recorded_at, id;
 ELSIF p_which='past' THEN
  RETURN QUERY SELECT * FROM (SELECT e.id, e.kind, e.epistemic, e.state, t.body, e.authored_by, e.actor_id,
  sophia.conversation_actor_label(e.project_id, e.actor_id, e.author_name) AS author_name, e.origin,
  e.exchange_id,
  e.input_epoch, e.related_entry_id, e.supersedes_entry_id,
  (SELECT n.id FROM sophia.mission_entries n WHERE n.project_id = e.project_id AND n.supersedes_entry_id = e.id LIMIT 1) AS superseded_by,
  e.goal_id, e.decision_id, e.source_id, s.sha256, e.ledger_revision, e.observed_at, e.recorded_at, e.changed_at FROM sophia.mission_entries e
        LEFT JOIN sophia.source_objects s ON s.project_id = e.project_id AND s.id = e.source_id
        LEFT JOIN sophia.source_texts t ON t.project_id = s.project_id AND t.source_id = s.id
       WHERE e.project_id = b.project_id AND e.state = ANY(ARRAY['superseded','withdrawn']::text[])
       ORDER BY e.recorded_at DESC, e.id DESC LIMIT 20) latest
      ORDER BY recorded_at, id;
 ELSE RAISE EXCEPTION 'unknown reader variant' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION sophia.conversation_assembly_count_entries(p_reply uuid, p_attempt integer, p_token uuid, p_which text)
RETURNS TABLE(n bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 IF p_which='current' THEN
  RETURN QUERY SELECT count(*) AS n FROM sophia.mission_entries e WHERE e.project_id = b.project_id AND e.state = ANY(ARRAY['current']::text[]);
 ELSIF p_which='past' THEN
  RETURN QUERY SELECT count(*) AS n FROM sophia.mission_entries e WHERE e.project_id = b.project_id AND e.state = ANY(ARRAY['superseded','withdrawn']::text[]);
 ELSE RAISE EXCEPTION 'unknown reader variant' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION sophia.conversation_assembly_read_work(p_reply uuid, p_attempt integer, p_token uuid)
RETURNS TABLE(goal_id uuid, title text, status text, task_id uuid, phase text, kind text, created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 RETURN QUERY SELECT * FROM (SELECT g.id AS goal_id, g.title, g.status, t.id AS task_id, t.phase, t.kind, g.created_at
        FROM sophia.goals g LEFT JOIN sophia.native_task_view t ON t.project_id = g.project_id AND t.goal_id = g.id
       WHERE g.project_id = b.project_id ORDER BY g.created_at DESC, g.id DESC LIMIT 10) latest
      ORDER BY created_at, goal_id;
END $$;
CREATE FUNCTION sophia.conversation_assembly_read_note_policy(p_reply uuid, p_attempt integer, p_token uuid)
RETURNS TABLE(capture text, revision bigint, consent text, consent_revision bigint, accepted bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 RETURN QUERY SELECT coalesce(p.capture,sophia.mission_capture_default()) AS capture, p.revision, c.state AS consent, c.revision AS consent_revision,
            (SELECT count(*) FROM sophia.mission_note_consents a JOIN sophia.project_members m
               ON m.project_id = a.project_id AND m.actor_id = a.actor_id AND m.active
              WHERE a.project_id = b.project_id AND a.state = 'accepted') AS accepted
       FROM (SELECT 1) one
       LEFT JOIN sophia.mission_note_policies p ON p.project_id = b.project_id
       LEFT JOIN sophia.mission_note_consents c ON c.project_id = b.project_id AND c.actor_id = b.asked_by;
END $$;
CREATE FUNCTION sophia.conversation_assembly_has_history(p_reply uuid, p_attempt integer, p_token uuid)
RETURNS TABLE(found boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 RETURN QUERY SELECT EXISTS (SELECT 1 FROM sophia.contributions x WHERE x.project_id = b.project_id)
         OR EXISTS (SELECT 1 FROM sophia.goals x WHERE x.project_id = b.project_id)
         OR EXISTS (SELECT 1 FROM sophia.decisions x WHERE x.project_id = b.project_id AND x.proposal IS NOT NULL)
         OR EXISTS (SELECT 1 FROM sophia.mission_entries x WHERE x.project_id = b.project_id AND x.state <> 'withdrawn') AS found;
END $$;
CREATE FUNCTION sophia.conversation_assembly_read_window(p_reply uuid, p_attempt integer, p_token uuid)
RETURNS TABLE(id uuid, conversation_id uuid, seq text, author text, author_name text, body text, created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
#variable_conflict use_column
DECLARE b record;
BEGIN
 PERFORM sophia.conversation_assembly_reader();
 b:=sophia.conversation_assembly_bind(p_reply,p_attempt,p_token);
 RETURN QUERY SELECT m.id, m.conversation_id, m.seq::text AS seq, m.author,
            CASE WHEN m.author = 'member' THEN sophia.conversation_actor_label(m.project_id, m.actor_id, m.author_name) END AS author_name,
            m.body, m.created_at
       FROM sophia.conversation_messages m
      WHERE m.project_id = b.project_id AND m.conversation_id = b.conversation_id
        AND m.id = ANY(b.window_ids || b.message_id);
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_assembly_read_project(uuid,integer,uuid), sophia.conversation_assembly_read_decisions(uuid,integer,uuid,text), sophia.conversation_assembly_read_entries(uuid,integer,uuid,text), sophia.conversation_assembly_count_entries(uuid,integer,uuid,text), sophia.conversation_assembly_read_work(uuid,integer,uuid), sophia.conversation_assembly_read_note_policy(uuid,integer,uuid), sophia.conversation_assembly_has_history(uuid,integer,uuid), sophia.conversation_assembly_read_window(uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.conversation_assembly_read_project(uuid,integer,uuid), sophia.conversation_assembly_read_decisions(uuid,integer,uuid,text), sophia.conversation_assembly_read_entries(uuid,integer,uuid,text), sophia.conversation_assembly_count_entries(uuid,integer,uuid,text), sophia.conversation_assembly_read_work(uuid,integer,uuid), sophia.conversation_assembly_read_note_policy(uuid,integer,uuid), sophia.conversation_assembly_has_history(uuid,integer,uuid), sophia.conversation_assembly_read_window(uuid,integer,uuid) TO sophia_worker;

-- Whether the fixed mode is selected (the worker holds the begin entry point) and whether it is whole: every reader the
-- assembler's, which is a bare NOLOGIN role belonging to none and with no member but its recorded creator edge (D-Q13).
CREATE FUNCTION sophia.conversation_fixed_assembly_selected() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $$
 SELECT has_function_privilege('sophia_worker','sophia.conversation_assembly_begin(uuid,integer,uuid)','EXECUTE') $$;
CREATE FUNCTION sophia.conversation_fixed_assembly_whole() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM pg_roles a WHERE a.rolname='sophia_conversation_assembler'
   AND NOT (a.rolcanlogin OR a.rolsuper OR a.rolbypassrls OR a.rolcreatedb OR a.rolcreaterole OR a.rolreplication)
   AND NOT EXISTS(SELECT FROM pg_auth_members o WHERE o.member=a.oid)
   AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.roleid=a.oid
    AND NOT (m.grantor=10 AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     AND EXISTS(SELECT FROM pg_roles g WHERE g.oid=m.grantor AND g.rolsuper)
     AND EXISTS(SELECT FROM pg_roles i WHERE i.oid=m.member AND i.rolname='postgres' AND NOT i.rolsuper
      AND i.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
      AND i.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='sophia'))
     AND shobj_description(a.oid,'pg_authid') IS NOT DISTINCT FROM
      'con01-q13-fresh-creator v1 edge='||m.oid||' installer='||m.member))
   AND (SELECT count(*) FROM unnest(ARRAY['sophia.conversation_assembly_read_project(uuid,integer,uuid)','sophia.conversation_assembly_read_decisions(uuid,integer,uuid,text)','sophia.conversation_assembly_read_entries(uuid,integer,uuid,text)','sophia.conversation_assembly_count_entries(uuid,integer,uuid,text)','sophia.conversation_assembly_read_work(uuid,integer,uuid)','sophia.conversation_assembly_read_note_policy(uuid,integer,uuid)','sophia.conversation_assembly_has_history(uuid,integer,uuid)','sophia.conversation_assembly_read_window(uuid,integer,uuid)']::text[]) f
     JOIN pg_proc p ON p.oid=to_regprocedure(f) WHERE p.proowner=a.oid AND p.prosecdef)=8) $$;
REVOKE ALL ON FUNCTION sophia.conversation_fixed_assembly_selected(), sophia.conversation_fixed_assembly_whole() FROM PUBLIC;

-- conversation_assembler_admitted (0071), replaced: the fixed mode alone while selected; otherwise 0071's rule, unchanged.
CREATE OR REPLACE FUNCTION sophia.conversation_assembler_admitted() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $$
 SELECT CASE WHEN sophia.conversation_fixed_assembly_selected() THEN sophia.conversation_fixed_assembly_whole() ELSE
 EXISTS(SELECT FROM pg_roles a JOIN pg_auth_members m ON m.roleid=a.oid JOIN pg_roles r ON r.oid=m.member
  WHERE a.rolname='sophia_conversation_assembler' AND NOT a.rolcanlogin AND r.rolcanlogin
   AND m.set_option AND NOT m.admin_option
   AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
   AND NOT EXISTS(SELECT FROM pg_auth_members o WHERE o.member=r.oid AND o.roleid<>a.oid)
   -- No member, but (D-Q13) the trusted installation owner's own creator edge, made with the login by
   -- conversation_admit_assembler_login and recorded on it there: ADMIN, granted by the bootstrap superuser, no INHERIT,
   -- no SET, from postgres still owning this database and schema sophia.
   AND NOT EXISTS(SELECT FROM pg_auth_members o WHERE o.roleid=r.oid
    AND NOT (o.grantor=10 AND o.admin_option AND NOT o.inherit_option AND NOT o.set_option
     AND EXISTS(SELECT FROM pg_roles g WHERE g.oid=o.grantor AND g.rolsuper)
     AND EXISTS(SELECT FROM pg_roles i WHERE i.oid=o.member AND i.rolname='postgres' AND NOT i.rolsuper
      AND i.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
      AND i.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='sophia'))
     AND shobj_description(r.oid,'pg_authid') IS NOT DISTINCT FROM
      'con01-q13-fresh-creator v1 edge='||o.oid||' installer='||o.member))
   AND has_database_privilege(r.oid,current_database(),'CONNECT')) END $$;

-- The trusted installation owner (as 0071's admission names it) or a superuser installation: who may switch the mode.
CREATE FUNCTION sophia.conversation_fixed_assembly_operator() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
  OR (current_user='postgres' AND session_user='postgres' AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname='postgres'
   AND NOT r.rolsuper AND r.rolcreaterole AND r.oid=(SELECT datdba FROM pg_database WHERE datname=current_database())
   AND r.oid=(SELECT nspowner FROM pg_namespace WHERE nspname='sophia'))) $$;

-- Give the readers to the assembler (or take them back) through a temporary edge, revoked before returning.
CREATE FUNCTION sophia.conversation_fixed_assembly_owner(p_to name) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE su boolean:=(SELECT rolsuper FROM pg_roles WHERE rolname=current_user); f text; back boolean:=p_to='postgres';
BEGIN
 IF NOT su THEN
  EXECUTE format('GRANT sophia_conversation_assembler TO postgres WITH ADMIN FALSE, INHERIT %s, SET TRUE',
   CASE WHEN back THEN 'TRUE' ELSE 'FALSE' END);
 END IF;
 IF NOT back THEN GRANT CREATE ON SCHEMA sophia TO sophia_conversation_assembler; END IF;
 FOREACH f IN ARRAY ARRAY['sophia.conversation_assembly_read_project(uuid,integer,uuid)','sophia.conversation_assembly_read_decisions(uuid,integer,uuid,text)','sophia.conversation_assembly_read_entries(uuid,integer,uuid,text)','sophia.conversation_assembly_count_entries(uuid,integer,uuid,text)','sophia.conversation_assembly_read_work(uuid,integer,uuid)','sophia.conversation_assembly_read_note_policy(uuid,integer,uuid)','sophia.conversation_assembly_has_history(uuid,integer,uuid)','sophia.conversation_assembly_read_window(uuid,integer,uuid)']::text[] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I', f, p_to);
 END LOOP;
 IF NOT back THEN REVOKE CREATE ON SCHEMA sophia FROM sophia_conversation_assembler; END IF;
 IF NOT su THEN EXECUTE 'REVOKE sophia_conversation_assembler FROM postgres GRANTED BY postgres'; END IF;
END $$;

-- The separate operator act: refused unless the assembler stands alone (no login route), then the mode is whole.
CREATE FUNCTION sophia.conversation_enable_fixed_assembly() RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f text;
BEGIN
 IF NOT sophia.conversation_fixed_assembly_operator() THEN
  RAISE EXCEPTION 'only the trusted installation owner switches the assembly mode' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
  RAISE EXCEPTION 'no assembler role' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.roleid WHERE a.rolname='sophia_conversation_assembler'
   AND NOT (m.grantor=10 AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option))
  OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.member WHERE a.rolname='sophia_conversation_assembler') THEN
  RAISE EXCEPTION 'the assembler has a member or a membership: retire the login route first' USING ERRCODE='42501'; END IF;
 PERFORM sophia.conversation_fixed_assembly_owner('sophia_conversation_assembler');
 GRANT EXECUTE ON FUNCTION sophia.conversation_assembly_bind(uuid,integer,uuid), sophia.conversation_assembly_reader()
  TO sophia_conversation_assembler;
 FOREACH f IN ARRAY ARRAY['sophia.conversation_assembly_claim(uuid,integer)','sophia.conversation_assembly_begin(uuid,integer,uuid)','sophia.conversation_assembly_close(uuid,integer,uuid,text)','sophia.conversation_assembly_fail(uuid,integer,uuid,text)','sophia.conversation_record_context(uuid,integer,uuid,jsonb)']::text[] LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO sophia_worker', f);
 END LOOP;
 IF NOT sophia.conversation_assembler_admitted() THEN
  RAISE EXCEPTION 'the fixed assembly is not whole' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;

-- And back: the worker loses the entry points, the installation owner takes the readers back.
CREATE FUNCTION sophia.conversation_disable_fixed_assembly() RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f text;
BEGIN
 IF NOT sophia.conversation_fixed_assembly_operator() THEN
  RAISE EXCEPTION 'only the trusted installation owner switches the assembly mode' USING ERRCODE='42501'; END IF;
 FOREACH f IN ARRAY ARRAY['sophia.conversation_assembly_claim(uuid,integer)','sophia.conversation_assembly_begin(uuid,integer,uuid)','sophia.conversation_assembly_close(uuid,integer,uuid,text)','sophia.conversation_assembly_fail(uuid,integer,uuid,text)','sophia.conversation_record_context(uuid,integer,uuid,jsonb)']::text[] LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM sophia_worker', f);
 END LOOP;
 REVOKE EXECUTE ON FUNCTION sophia.conversation_assembly_bind(uuid,integer,uuid), sophia.conversation_assembly_reader()
  FROM sophia_conversation_assembler;
 PERFORM sophia.conversation_fixed_assembly_owner('postgres');
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_fixed_assembly_operator(), sophia.conversation_fixed_assembly_owner(name),
 sophia.conversation_enable_fixed_assembly(), sophia.conversation_disable_fixed_assembly() FROM PUBLIC;

COMMIT;
