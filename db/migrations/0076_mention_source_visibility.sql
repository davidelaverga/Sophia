-- 0076 Mention source visibility (FND-B-MENTION-PRIVATE-SOURCE-REPAIR-01, R 4308307168).
-- 0069's list_needs(boolean) is SECURITY DEFINER, and its mention branch took the first words of the message's source
-- with no source read check: a recipient whose ordinary read of that source is refused (a private source not theirs,
-- or a project source no longer eligible) still met its words as the need's title. The mention branch now joins only a
-- source the recipient may read by the same rule as RLS (0002 eligible_sources_read: their own, or a ready eligible
-- project source; membership via `mine`). Every other branch, the call shape, owner, search_path and grants are as in
-- 0069, which is unchanged; list_needs() without the opt-in is untouched.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.list_needs(p_mentions boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
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
   UNION ALL
   -- Messages that mention the person, waiting, on their current revision, the message standing with its words
   -- (0069; only with p_mentions, so a reader before A37 never meets the kind).
   SELECT 'mention', sophia.first_words(t.body), cm.project_id, mine.title, NULL::timestamptz,
          left(coalesce(sophia.actor_label(ct.project_id,ct.actor_id,ct.author_name),'A member')||' mentioned you',200),
          cm.mentioned_at, 'contribution', cm.contribution_id::text, cm.revision::text||'.'||cm.occurrence::text
     FROM sophia.contribution_mentions cm JOIN mine ON mine.project_id=cm.project_id
     JOIN sophia.contributions ct ON ct.project_id=cm.project_id AND ct.id=cm.contribution_id
      AND ct.state='current' AND ct.revision=cm.revision
     JOIN sophia.source_objects s ON s.project_id=ct.project_id AND s.id=ct.source_id AND s.state='ready'
      AND (s.owner_id=a OR (s.scope='project' AND s.eligible))
     JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
    WHERE p_mentions AND cm.recipient_id=a AND cm.state='pending'
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
REVOKE ALL ON FUNCTION sophia.list_needs(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.list_needs(boolean) TO sophia_api;

COMMIT;
