-- INC01-CC-006 (0097, root-assigned), contract amendment A51: the member-safe catalog of a project's native resources.
-- Plan: docs/plans/project-native-resources.md. A read only: it writes, locks, grants, sends and infers nothing.
-- * One reader, sophia.project_native_resources, EXECUTE to sophia_api only. It is SECURITY DEFINER, so it checks the
--   caller's current membership itself, first: a nonmember and a missing project both read NULL.
-- * Native resources only (codex-native, claude-native): the dsh runtime row is Sophia's own, never a member resource.
-- * The owner-only part (connection, live host, recorded qualification) is built by a helper no application role can
--   execute, called only for a row the caller owns: no private join runs for anyone else. It returns states and
--   booleans only, never a label, path, credential, account key, environment, profile, journal or conflict text.
-- * Pages of at most 200 by resource id; a 201st row read is how a next cursor is known. No total is computed.
-- * One clock (clock_timestamp at the read's start) judges every expiry and age, and is returned as observedAt.
-- * r1 (CC006-F01/F02): every record the frozen 0092 qualifier accepts stays readable, as recorded. Its operations are
--   read as the set they name, in the fixed order create, input, stop: a repeat adds nothing and nothing is added. A
--   recorded time is read as itself only when it has an RFC 3339 form as this read renders it (a year 1 to 9999);
--   otherwise (infinity, -infinity, BC, beyond 9999) as null, meaning no representable finite time, and its age as
--   null. Every state is still judged on the recorded value, never on that null.
-- * r2 (CC006-R1-F01): the reader renders every outward time in one fixed zone, UTC (a function-level SET, restored
--   when it returns), so each is YYYY-MM-DDThh:mm:ss[.ffffff]+00:00 whatever the caller's session zone or style: a
--   historical offset with seconds (Asia/Kathmandu 1900: +05:41:16) never reaches the page, and the year guard judges
--   exactly the UTC string written. observedAt is the same clock, in UTC too. No comparison depends on the zone.
-- * The live host is the connection's one bound or active host: 0096's owner_hosts_one_live_per_connection makes it
--   unique. The recorded qualification is 0092's one unrevoked row (owner_runner_one_qualification), else the latest by
--   (qualified_at, id). Both are recorded facts, not online, sign-in or readiness.
-- 0001-0096 are not edited. Additive: two functions.
BEGIN;

-- What a qualification record says now, judged at p_now: current only while every fact it was recorded on still holds.
CREATE FUNCTION sophia.project_native_qualification_state(q sophia.owner_runner_qualifications, r sophia.executor_resources,
 c sophia.execution_connections, p_now timestamptz) RETURNS text LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE
  WHEN q.id IS NULL THEN 'none'
  WHEN q.revoked_at IS NOT NULL THEN 'revoked'
  WHEN q.expires_at<=p_now THEN 'expired'
  WHEN q.owner_id<>r.owner_id OR q.connection_id IS DISTINCT FROM r.connection_id OR q.resource_revision<>r.revision
    OR c.id IS NULL OR q.connection_revision<>c.revision OR c.owner_id<>q.owner_id THEN 'stale'
  WHEN r.state<>'active' OR c.state<>'linked' OR (c.expires_at IS NOT NULL AND c.expires_at<=p_now)
    OR NOT EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=r.project_id AND m.actor_id=r.owner_id
      AND m.active AND m.role IN ('admin','editor')) THEN 'not_applicable'
  ELSE 'current' END $$;

-- The owner's own view of one resource: its connection, its connection's one live host and its recorded qualification.
CREATE FUNCTION sophia.project_native_resource_mine(r sophia.executor_resources, p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.execution_connections; h sophia.owner_hosts; q sophia.owner_runner_qualifications; host jsonb;
BEGIN
 SELECT * INTO c FROM sophia.execution_connections WHERE id=r.connection_id AND owner_id=r.owner_id;
 SELECT * INTO h FROM sophia.owner_hosts
  WHERE owner_id=r.owner_id AND connection_id=r.connection_id AND state IN ('bound','active');
 IF h.id IS NOT NULL THEN
  host:=jsonb_build_object('state',h.state,'helloOk',h.hello_ok,'helloConflict',h.hello_conflict IS NOT NULL,
   'lastSeenAt',CASE WHEN extract(year FROM h.last_seen_at) BETWEEN 1 AND 9999 THEN h.last_seen_at END,
   'secondsSinceSeen',CASE WHEN extract(year FROM h.last_seen_at) BETWEEN 1 AND 9999 AND h.last_seen_at<=p_now
    THEN floor(extract(epoch FROM p_now-h.last_seen_at))::bigint END);
 END IF;
 SELECT * INTO q FROM sophia.owner_runner_qualifications
  WHERE project_id=r.project_id AND resource_id=r.id AND revoked_at IS NULL;
 IF NOT FOUND THEN
  SELECT * INTO q FROM sophia.owner_runner_qualifications WHERE project_id=r.project_id AND resource_id=r.id
   ORDER BY qualified_at DESC, id DESC LIMIT 1;
 END IF;
 RETURN jsonb_build_object(
  'connection',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('state',c.state,
   'expired',c.expires_at IS NOT NULL AND c.expires_at<=p_now) END,
  'host',host,
  'recordedQualification',jsonb_build_object('state',sophia.project_native_qualification_state(q,r,c,p_now),
   'operations',to_jsonb(ARRAY(SELECT o FROM unnest(ARRAY['create','input','stop']) WITH ORDINALITY k(o,n)
    WHERE o=ANY(q.operations) ORDER BY n)),
   'qualifiedAt',CASE WHEN extract(year FROM q.qualified_at) BETWEEN 1 AND 9999 THEN q.qualified_at END,
   'expiresAt',CASE WHEN extract(year FROM q.expires_at) BETWEEN 1 AND 9999 THEN q.expires_at END));
END $$;

-- One page of the project's native resources as the caller may see them now, or NULL for a nonmember or no project.
CREATE FUNCTION sophia.project_native_resources(p_project uuid, p_after uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE a uuid:=sophia.actor_id(); now_ timestamptz:=clock_timestamp(); r sophia.executor_resources; n integer:=0;
 page jsonb:='[]'; next_ uuid;
BEGIN
 IF a IS NULL OR p_project IS NULL OR NOT sophia.is_member(p_project) THEN RETURN NULL; END IF;
 FOR r IN SELECT * FROM sophia.executor_resources WHERE project_id=p_project AND harness IN ('codex-native','claude-native')
   AND (p_after IS NULL OR id>p_after) ORDER BY id LIMIT 201 LOOP
  n:=n+1;
  IF n>200 THEN next_:=(page->-1->>'id')::uuid; EXIT; END IF;
  page:=page||jsonb_build_array(jsonb_build_object(
   'id',r.id,'tool',CASE r.harness WHEN 'codex-native' THEN 'codex' ELSE 'claude' END,'state',r.state,
   'owner',jsonb_build_object('id',r.owner_id,'label',sophia.actor_label(p_project,r.owner_id,NULL),'isYou',r.owner_id=a,
    'isMember',EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=p_project AND m.actor_id=r.owner_id AND m.active)),
   'mine',CASE WHEN r.owner_id=a THEN sophia.project_native_resource_mine(r,now_) END));
 END LOOP;
 RETURN jsonb_build_object('observedAt',now_,'resources',page,'nextCursor',next_,'complete',next_ IS NULL,
  'notReported',jsonb_build_array('sessions','assignments','models','efforts','capacity','readiness','signIn','accounts'));
END $$;

REVOKE ALL ON FUNCTION sophia.project_native_qualification_state(sophia.owner_runner_qualifications,sophia.executor_resources,
 sophia.execution_connections,timestamptz), sophia.project_native_resource_mine(sophia.executor_resources,timestamptz),
 sophia.project_native_resources(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.project_native_resources(uuid,uuid) TO sophia_api;

COMMIT;
