-- What needs the calling person (A15, docs/plans/needs-served.md, #365 section 2): served from what the service already
-- keeps. A need leaves where it lives: a decision when it is answered, expires or is superseded; a guest when let in,
-- declined or gone. Only a reply has a seen mark, the person's last seen personal turn, which only moves forward and
-- only through markNeedSeen (A15) — a read of the space, a later turn of the person's, an opened need never move it.
-- A reply is unread when it comes after the mark. Spaces that exist at rollout start at the person's own last turn
-- (their last word answered what came before it), once, here: neither all their history unread nor a waiting reply
-- hidden; a space made later starts at 0. The turn order never goes back, erasure included (0021), so the mark stays
-- valid. A permission (a native tool's request) has no record yet: A13's waits are
-- computed (commission, wake, refusal), none of kind native_permission, so none is listed until one is kept.
-- 0001–0064 are not edited.
BEGIN;

ALTER TABLE sophia.personal_spaces ADD COLUMN last_seen_turn_seq bigint NOT NULL DEFAULT 0
 CHECK(last_seen_turn_seq>=0);

-- At rollout only: each existing space starts at its person's own last turn (Codex on #390: after this, only the seen
-- POST moves the mark; a later turn of theirs acknowledges nothing).
UPDATE sophia.personal_spaces s SET last_seen_turn_seq=t.seq
  FROM (SELECT owner_id, max(seq) AS seq FROM sophia.personal_turns WHERE author='person' GROUP BY owner_id) t
 WHERE t.owner_id=s.owner_id;

-- One part of a need's id, escaped so the id stays injective: '%' and ':' inside a part never read as a separator.
CREATE FUNCTION sophia.need_part(p_part text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT replace(replace(p_part,'%','%25'),':','%3A') $$;
REVOKE ALL ON FUNCTION sophia.need_part(text) FROM PUBLIC;

-- How long a guest has waited, said as A15's example says it.
CREATE FUNCTION sophia.waited_words(p_since timestamptz, p_now timestamptz) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT CASE WHEN m<60 THEN 'Waiting '||greatest(m,1)::text||' min' ELSE 'Waiting '||(m/60)::text||' h' END
   FROM (SELECT floor(extract(epoch FROM (p_now-p_since))/60)::bigint AS m) w $$;
REVOKE ALL ON FUNCTION sophia.waited_words(timestamptz,timestamptz) FROM PUBLIC;

-- The first words of a reply, for its need's title: up to 140 characters, cut at a word.
CREATE FUNCTION sophia.first_words(p_body text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT CASE WHEN char_length(b)<=140 THEN b
   ELSE coalesce(nullif(substring(left(b,140) FROM '^(.*\S)\s'),''),left(b,139))||'…' END
   FROM (SELECT btrim(regexp_replace(p_body,'\s+',' ','g')) AS b) t $$;
REVOKE ALL ON FUNCTION sophia.first_words(text) FROM PUBLIC;

-- listNeeds (A15): the calling person's own needs, at most 200, the expiring first (soonest first), then the rest
-- (newest first), always the same 200 for the same records; and the service's clock. Built from the person's active
-- memberships in projects that aren't archived, and their own space: nothing of another person is in it.
CREATE FUNCTION sophia.list_needs() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); read_at timestamptz:=now(); out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 WITH mine AS (
   SELECT m.project_id, p.title FROM sophia.project_members m JOIN sophia.projects p ON p.id=m.project_id
    WHERE m.actor_id=a AND m.active AND p.archived_at IS NULL
 ), found AS (
   -- Decisions the person is to make on the work board, still open and not expired (WorkDecision, A13).
   SELECT 'decision' AS kind, d.question AS title, d.project_id, mine.title AS project_title, d.expires_at,
          NULL::text AS detail, d.created_at AS at, 'work_decision' AS ref_kind, d.id::text AS ref_id,
          d.work_id::text AS within
     FROM sophia.work_decisions d JOIN mine ON mine.project_id=d.project_id
    WHERE d.decider_id=a AND d.state='proposed' AND d.expires_at>read_at
   UNION ALL
   -- Guests waiting at the door of a room the person can let them into (A02, A03: editors and admins).
   SELECT 'guest', l.display_name, l.project_id, mine.title, NULL::timestamptz,
          sophia.waited_words(l.requested_at, read_at), l.requested_at, 'lobby_entry', l.id::text, NULL::text
     FROM sophia.room_lobby l JOIN mine ON mine.project_id=l.project_id
    WHERE l.status='waiting' AND sophia.can_edit(l.project_id)
   UNION ALL
   -- Sophia's replies after the person's seen mark (A10).
   SELECT 'reply', sophia.first_words(t.body), NULL::uuid, NULL::text, NULL::timestamptz, NULL::text, t.created_at,
          'personal_turn', t.id::text, NULL::text
     FROM sophia.personal_turns t
    WHERE t.owner_id=a AND t.author='sophia'
      AND t.seq>coalesce((SELECT s.last_seen_turn_seq FROM sophia.personal_spaces s WHERE s.owner_id=a),0)
 ), kept AS (
   SELECT f.*, f.kind||':'||coalesce(f.project_id::text,'personal')||':'||coalesce(sophia.need_part(f.within),'-')
            ||':'||sophia.need_part(f.ref_id) AS id
     FROM found f
    ORDER BY (f.expires_at IS NULL), f.expires_at, f.at DESC, id
    LIMIT 200
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',k.id,'kind',k.kind,'title',k.title,'projectId',k.project_id,
   'projectTitle',k.project_title,'expiresAt',k.expires_at,'detail',k.detail,'at',k.at,
   'ref',jsonb_build_object('kind',k.ref_kind,'id',k.ref_id,'within',k.within,'resourceId',NULL))
   ORDER BY (k.expires_at IS NULL), k.expires_at, k.at DESC, k.id),'[]'::jsonb) INTO out FROM kept k;
 RETURN jsonb_build_object('needs',out,'readAt',read_at);
END $$;
REVOKE ALL ON FUNCTION sophia.list_needs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.list_needs() TO sophia_api;

-- markNeedSeen for a reply (A15): the person's seen mark moves forward to the reply named, never back; a turn that is
-- not one of Sophia's in the person's own space is not theirs to mark (false: 404). Idempotent.
CREATE FUNCTION sophia.mark_reply_seen(p_turn uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); seen bigint;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='42501'; END IF;
 SELECT t.seq INTO seen FROM sophia.personal_turns t WHERE t.owner_id=a AND t.id=p_turn AND t.author='sophia';
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE sophia.personal_spaces SET last_seen_turn_seq=greatest(last_seen_turn_seq,seen) WHERE owner_id=a;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION sophia.mark_reply_seen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.mark_reply_seen(uuid) TO sophia_api;

COMMIT;
