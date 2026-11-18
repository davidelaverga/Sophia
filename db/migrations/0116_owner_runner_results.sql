-- S-001 / A60. Owner-private retained native results. No execution lifecycle or manager writes.
-- Lock order: project, collection, exchange. One lifetime attempt per operation, eight pages reserved before delivery.
-- No timeout is cancellation: an expired/delivered read stays unknown and cannot obtain a fresh attempt.
BEGIN;
CREATE TABLE sophia.owner_runner_collections (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 operation_id uuid NOT NULL, client_request_id text NOT NULL CHECK(length(client_request_id) BETWEEN 1 AND 160),
 operation_revision bigint NOT NULL, max_pages integer NOT NULL CHECK(max_pages BETWEEN 1 AND 8),
 max_bytes integer NOT NULL CHECK(max_bytes BETWEEN 1 AND 8192),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','collecting','retained','unavailable','unknown','withdrawn')),
 deadline_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 seconds',
 permit uuid NOT NULL DEFAULT gen_random_uuid(), exchange_id uuid UNIQUE, claimed boolean NOT NULL DEFAULT false,
 consume_lease_until timestamptz,
 reserved_pages integer NOT NULL DEFAULT 0 CHECK(reserved_pages BETWEEN 0 AND 8),
 result_id uuid, reason text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,operation_id), UNIQUE(project_id,owner_id,client_request_id),
 FOREIGN KEY(project_id,operation_id) REFERENCES sophia.owner_runner_operations(project_id,id)
);
CREATE TABLE sophia.owner_runner_results (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 collection_id uuid NOT NULL, operation_id uuid NOT NULL, original_create_id uuid NOT NULL,
 goal_id uuid NOT NULL, attempt_id uuid NOT NULL, binding_id uuid NOT NULL, journal_id uuid NOT NULL,
 native_namespace text NOT NULL, thread_id text NOT NULL, run_id text NOT NULL, input_message_id text NOT NULL,
 message_id text NOT NULL, item_id text NOT NULL, source_id uuid NOT NULL,
 version_key text NOT NULL, text_sha256 text NOT NULL, byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 8192),
 state text NOT NULL DEFAULT 'retained' CHECK(state IN ('retained','withdrawn')),
 audience_revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,version_key), UNIQUE(project_id,source_id),
 FOREIGN KEY(project_id,collection_id) REFERENCES sophia.owner_runner_collections(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);
-- Explicit frozen privacy superset: private instructions/manifests and transitive selected-source closure.
CREATE TABLE sophia.owner_runner_result_dependencies (
 project_id uuid NOT NULL, result_id uuid NOT NULL, source_id uuid NOT NULL,
 sha256 text NOT NULL, eligibility_revision bigint NOT NULL, scope text NOT NULL, owner_id uuid NOT NULL,
 PRIMARY KEY(project_id,result_id,source_id),
 FOREIGN KEY(project_id,result_id) REFERENCES sophia.owner_runner_results(project_id,id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE TABLE sophia.owner_runner_result_contexts (
 project_id uuid NOT NULL, result_id uuid NOT NULL, operation_id uuid NOT NULL, qualification_id uuid NOT NULL,
 qualification_revision bigint NOT NULL, profile_id text NOT NULL, profile_revision bigint NOT NULL,
 manifest_id uuid NOT NULL, manifest_sha256 text NOT NULL,
 PRIMARY KEY(project_id,result_id,operation_id),
 FOREIGN KEY(project_id,result_id) REFERENCES sophia.owner_runner_results(project_id,id)
);
ALTER TABLE sophia.owner_runner_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.owner_runner_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.owner_runner_result_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.owner_runner_result_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.owner_runner_collections,sophia.owner_runner_results,
 sophia.owner_runner_result_dependencies,sophia.owner_runner_result_contexts FROM PUBLIC;
ALTER TABLE sophia.owner_host_exchanges DROP CONSTRAINT owner_host_exchanges_kind_check;
ALTER TABLE sophia.owner_host_exchanges ADD CHECK(kind IN ('send','reconcile','observe','collect'));

CREATE FUNCTION sophia.runner_result_canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE out text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(k)::text||':'||sophia.runner_result_canonical(x),',' ORDER BY k COLLATE "C"),'')||'}' INTO out FROM jsonb_each(v) AS e(k,x);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(sophia.runner_result_canonical(x),',' ORDER BY n),'')||']' INTO out FROM jsonb_array_elements(v) WITH ORDINALITY AS e(x,n);
 ELSE out:=v::text;
 END CASE;
 RETURN out;
END $$;

CREATE FUNCTION sophia.runner_result_context_ok(o sophia.owner_runner_operations) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT o.kind IN ('create','input') AND o.envelope_version=2 AND o.native_thread_id IS NOT NULL
 AND o.native_run_id IS NOT NULL AND o.native_message_id IS NOT NULL AND o.gateway_journal_id IS NOT NULL
 AND o.state IN ('received','settled')
 AND NOT EXISTS(SELECT 1 FROM sophia.owner_runner_operations z
  JOIN sophia.owner_runner_operation_sources os ON os.project_id=z.project_id AND os.operation_id=z.id
  CROSS JOIN LATERAL sophia.source_closure(z.project_id,ARRAY[os.source_id]) dep
  LEFT JOIN sophia.source_objects s ON s.project_id=z.project_id AND s.id=dep
  WHERE z.project_id=o.project_id AND z.binding_id=o.binding_id AND z.kind IN ('create','input')
  AND (s.id IS NULL OR s.scope<>'project' OR NOT s.eligible OR s.state<>'ready'))
 AND EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=o.project_id AND m.actor_id=o.owner_id AND m.active)
 AND NOT EXISTS(SELECT 1 FROM sophia.owner_runner_operations x
  LEFT JOIN sophia.context_manifests m ON m.project_id=x.project_id AND m.id=x.manifest_id
  LEFT JOIN sophia.projects p ON p.id=x.project_id
  WHERE x.project_id=o.project_id AND x.binding_id=o.binding_id AND x.kind IN ('create','input')
   AND (x.owner_id<>o.owner_id OR x.envelope_version<>2 OR sophia.owner_runner_context_ineligible(x) IS NOT NULL
    OR m.audience_revision IS DISTINCT FROM p.audience_revision))
$$;

CREATE FUNCTION sophia.runner_result_capture_ok(o sophia.owner_runner_operations) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.runner_result_context_ok(o)
 AND EXISTS(SELECT 1 FROM sophia.owner_runner_qualifications q JOIN sophia.executor_resources r
  ON r.project_id=q.project_id AND r.id=q.resource_id JOIN sophia.execution_connections c ON c.id=q.connection_id
  JOIN sophia.project_members m ON m.project_id=q.project_id AND m.actor_id=q.owner_id
  WHERE q.project_id=o.project_id AND q.id=o.qualification_id AND q.owner_id=o.owner_id
   AND q.revision=o.qualification_revision AND q.revoked_at IS NULL AND q.expires_at>clock_timestamp()
   AND r.state='active' AND r.owner_id=o.owner_id AND r.revision=o.resource_revision
   AND c.state='linked' AND c.revision=o.connection_revision AND (c.expires_at IS NULL OR c.expires_at>clock_timestamp())
   AND m.active AND m.role IN ('admin','editor') AND m.revision=o.member_revision
   AND sophia.owner_runner_settings_refusal(q.source_policy,o.requested_settings) IS NULL)
$$;

-- FIRST-capture fence: the trigger relevance guard cannot see an uncommitted first collection.
-- Lock all context/authority roots BEFORE that collection is inserted, under the project lock.
-- A source-only legacy withdrawal already in flight either wins these row locks (capture waits,
-- then rechecks its commit), or waits for capture's commit and sees the now-relevant S state.
-- Existing application writers serialize dependency topology/admitted inputs with the same project.
CREATE FUNCTION sophia.runner_result_capture_fence(p_project uuid,p_operation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.owner_runner_operations; ctx sophia.owner_runner_operations; roots uuid[];
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=p_operation FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM 1 FROM sophia.project_members WHERE project_id=p_project AND actor_id=o.owner_id FOR SHARE;
 -- Include queued/uncertain contexts too: this is a privacy superset, never actual-read evidence.
 FOR ctx IN SELECT * FROM sophia.owner_runner_operations WHERE project_id=p_project AND binding_id=o.binding_id
  AND kind IN ('create','input') ORDER BY id FOR SHARE LOOP
  PERFORM sophia.owner_runner_lock_authority(ctx);
 END LOOP;
 PERFORM m.id FROM sophia.context_manifests m JOIN sophia.owner_runner_operations z
  ON z.project_id=m.project_id AND z.manifest_id=m.id
  WHERE z.project_id=p_project AND z.binding_id=o.binding_id AND z.kind IN ('create','input')
  ORDER BY m.id FOR SHARE OF m;
 SELECT array_agg(DISTINCT source_id) INTO roots FROM (
  SELECT z.payload_source_id AS source_id FROM sophia.owner_runner_operations z
   WHERE z.project_id=p_project AND z.binding_id=o.binding_id AND z.kind IN ('create','input')
  UNION SELECT m.body_source_id FROM sophia.owner_runner_operations z JOIN sophia.context_manifests m
   ON m.project_id=z.project_id AND m.id=z.manifest_id
   WHERE z.project_id=p_project AND z.binding_id=o.binding_id AND z.kind IN ('create','input')
  UNION SELECT os.source_id FROM sophia.owner_runner_operations z JOIN sophia.owner_runner_operation_sources os
   ON os.project_id=z.project_id AND os.operation_id=z.id
   WHERE z.project_id=p_project AND z.binding_id=o.binding_id AND z.kind IN ('create','input')) all_roots;
 PERFORM s.id FROM sophia.source_objects s WHERE s.project_id=p_project
  AND s.id IN (SELECT sophia.source_closure(p_project,roots)) ORDER BY s.id FOR SHARE;
 -- Text can be changed/deleted without an object update. It needs its own fence, not only the object FK lock.
 PERFORM t.source_id FROM sophia.source_texts t WHERE t.project_id=p_project
  AND t.source_id IN (SELECT sophia.source_closure(p_project,roots)) ORDER BY t.source_id FOR SHARE;
END $$;

-- Only committed/own S retention state is relevant. FIRST capture is protected separately by the fence above.
-- Include any staged raw alias defensively, even if its collection is already terminal.
CREATE FUNCTION sophia.runner_result_relevant(p_project uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.owner_runner_collections WHERE project_id=p_project AND state IN ('pending','collecting'))
 OR EXISTS(SELECT 1 FROM sophia.owner_runner_results WHERE project_id=p_project AND state='retained')
 OR EXISTS(SELECT 1 FROM sophia.owner_host_exchanges WHERE project_id=p_project AND kind='collect' AND answer IS NOT NULL)
$$;

CREATE FUNCTION sophia.runner_result_collection_view(c sophia.owner_runner_collections) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('collectionId',c.id,'projectId',c.project_id,'operationId',c.operation_id,
 'state',c.state,'reason',c.reason,'resultId',c.result_id,'reservedPages',c.reserved_pages,'maxPages',c.max_pages,
 'maxBytes',c.max_bytes,'deadlineAt',c.deadline_at)
$$;

CREATE FUNCTION sophia.request_runner_result(p_project uuid,p_operation uuid,p_key text,p_revision bigint,p_pages integer,p_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE o sophia.owner_runner_operations; c sophia.owner_runner_collections; a uuid:=sophia.actor_id();
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF a IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 OR p_revision IS NULL OR p_revision<1
  OR p_pages IS NULL OR p_pages NOT BETWEEN 1 AND 8 OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 8192 THEN
  RAISE EXCEPTION 'Invalid result request' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p_project AND owner_id=a AND client_request_id=p_key;
 IF FOUND THEN
  IF c.operation_id<>p_operation OR c.operation_revision<>p_revision OR c.max_pages<>p_pages OR c.max_bytes<>p_bytes THEN
   RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
  RETURN sophia.runner_result_collection_view(c);
 END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=p_operation;
 IF NOT FOUND OR o.owner_id<>a THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM sophia.runner_result_capture_fence(p_project,p_operation);
 -- Fresh statement after every possible fence wait; no earlier snapshot/timestamp is authority.
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=p_operation;
 IF o.revision<>p_revision OR NOT sophia.runner_result_capture_ok(o) THEN
  RAISE EXCEPTION 'Result capture unavailable' USING ERRCODE='22023'; END IF;
 -- A new key never buys a second read, even after unknown. The first request remains discoverable.
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p_project AND operation_id=p_operation;
 IF FOUND THEN RETURN sophia.runner_result_collection_view(c); END IF;
 INSERT INTO sophia.owner_runner_collections(project_id,owner_id,operation_id,client_request_id,operation_revision,max_pages,max_bytes)
 VALUES(p_project,a,o.id,p_key,p_revision,p_pages,p_bytes) RETURNING * INTO c;
 RETURN sophia.runner_result_collection_view(c);
END $$;

CREATE FUNCTION sophia.runner_result_retained_ok(r sophia.owner_runner_results) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT r.state='retained'
 AND EXISTS(SELECT 1 FROM sophia.project_members m WHERE m.project_id=r.project_id AND m.actor_id=r.owner_id AND m.active)
 AND EXISTS(SELECT 1 FROM sophia.projects p WHERE p.id=r.project_id AND p.audience_revision=r.audience_revision)
 AND sophia.owner_runner_private_text(r.project_id,r.source_id,r.owner_id,r.text_sha256) IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM sophia.owner_runner_result_dependencies d LEFT JOIN sophia.source_objects s
  ON s.project_id=d.project_id AND s.id=d.source_id WHERE d.project_id=r.project_id AND d.result_id=r.id
   AND (s.id IS NULL OR s.state<>'ready' OR s.sha256<>d.sha256 OR s.eligibility_revision<>d.eligibility_revision
    OR s.scope<>d.scope OR s.owner_id<>d.owner_id OR (d.scope='project' AND NOT s.eligible)
    OR (d.scope='private' AND sophia.owner_runner_private_text(d.project_id,d.source_id,d.owner_id,d.sha256) IS NULL)))
 AND NOT EXISTS(SELECT 1 FROM sophia.owner_runner_result_contexts c LEFT JOIN sophia.context_manifests m
  ON m.project_id=c.project_id AND m.id=c.manifest_id WHERE c.project_id=r.project_id AND c.result_id=r.id
   AND (m.id IS NULL OR m.state<>'eligible'))
$$;

CREATE FUNCTION sophia.runner_result_descriptor(r sophia.owner_runner_results) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('resultId',r.id,'projectId',r.project_id,'goalId',r.goal_id,'operationId',r.operation_id,
 'originalCreateId',r.original_create_id,'attemptId',r.attempt_id,'bindingId',r.binding_id,'acceptedRunId',r.run_id,
 'sourceId',r.source_id,'versionId',r.source_id,'sha256',r.text_sha256,'byteLength',r.byte_length,
 'audience','owner_private','dependencyPolicy','binding_context_privacy_superset_v1',
 'state',CASE WHEN sophia.runner_result_retained_ok(r) THEN 'retained' ELSE 'withdrawn' END,'retainedAt',r.created_at)
$$;

CREATE FUNCTION sophia.read_runner_result(p_project uuid,p_result uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.owner_runner_results;
BEGIN
 SELECT * INTO r FROM sophia.owner_runner_results WHERE project_id=p_project AND id=p_result;
 IF NOT FOUND OR r.owner_id IS DISTINCT FROM sophia.actor_id() OR NOT sophia.is_member(p_project) THEN
  RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('result',sophia.runner_result_descriptor(r),'text',CASE WHEN sophia.runner_result_retained_ok(r)
  THEN sophia.owner_runner_private_text(r.project_id,r.source_id,r.owner_id,r.text_sha256) ELSE NULL END);
END $$;

-- The worker claims once. No lease requeue: transport uncertainty is never erased by a new worker or caller key.
CREATE FUNCTION sophia.claim_runner_result() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections; o sophia.owner_runner_operations; p uuid;
BEGIN
 SELECT project_id INTO p FROM sophia.owner_runner_collections WHERE state='pending' AND NOT claimed ORDER BY created_at LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p AND state='pending' AND NOT claimed ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p AND id=c.operation_id;
 IF c.deadline_at<=clock_timestamp() OR NOT sophia.runner_result_capture_ok(o) THEN
  UPDATE sophia.owner_runner_collections SET state='unavailable',reason='authority_or_deadline' WHERE project_id=p AND id=c.id;
  RETURN NULL;
 END IF;
 UPDATE sophia.owner_runner_collections SET claimed=true,state='collecting',consume_lease_until=clock_timestamp()+interval '5 seconds' WHERE project_id=p AND id=c.id;
 RETURN jsonb_build_object('projectId',p,'collectionId',c.id,'permit',c.permit,'ownerId',c.owner_id,
 'environmentRef',o.environment_ref,'journalId',o.gateway_journal_id,'namespace',o.native_namespace,
 'envelope',sophia.owner_runner_envelope(o),'maxPages',c.max_pages,'maxBytes',c.max_bytes);
END $$;

-- Restart recovery consumes an already completed staged answer only. It authorizes NO new native read.
-- A lease rotates the scoped permit, fencing a delayed predecessor; deadline and spent budget never move.
CREATE FUNCTION sophia.resume_runner_result() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections; o sophia.owner_runner_operations; p uuid;
BEGIN
 SELECT z.project_id INTO p FROM sophia.owner_runner_collections z JOIN sophia.owner_host_exchanges x ON x.id=z.exchange_id
 WHERE z.state='collecting' AND z.consume_lease_until<=clock_timestamp() AND z.deadline_at>clock_timestamp()
 AND x.state='answered' AND x.answer->>'kind'='collected' ORDER BY z.created_at LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT z.* INTO c FROM sophia.owner_runner_collections z JOIN sophia.owner_host_exchanges x ON x.id=z.exchange_id
 WHERE z.project_id=p AND z.state='collecting' AND z.consume_lease_until<=clock_timestamp() AND z.deadline_at>clock_timestamp()
 AND x.state='answered' AND x.answer->>'kind'='collected' ORDER BY z.created_at LIMIT 1 FOR UPDATE OF z;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p AND id=c.operation_id;
 IF NOT sophia.runner_result_capture_ok(o) THEN RETURN NULL; END IF;
 UPDATE sophia.owner_runner_collections SET permit=gen_random_uuid(),consume_lease_until=clock_timestamp()+interval '5 seconds'
 WHERE project_id=p AND id=c.id RETURNING * INTO c;
 RETURN jsonb_build_object('projectId',p,'collectionId',c.id,'permit',c.permit,'ownerId',c.owner_id,
 'environmentRef',o.environment_ref,'journalId',o.gateway_journal_id,'namespace',o.native_namespace,
 'envelope',sophia.owner_runner_envelope(o),'maxPages',c.max_pages,'maxBytes',c.max_bytes);
END $$;

CREATE FUNCTION sophia.enqueue_runner_result(p_project uuid,p_collection uuid,p_permit uuid,p_request jsonb,p_digest text,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections; o sophia.owner_runner_operations; h sophia.owner_hosts; x sophia.owner_host_exchanges;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p_project AND id=p_collection FOR UPDATE;
 IF NOT FOUND OR c.permit IS DISTINCT FROM p_permit THEN RAISE EXCEPTION 'Result permit refused' USING ERRCODE='42501'; END IF;
 IF c.exchange_id IS NOT NULL THEN
  RETURN jsonb_build_object('result','existing','exchangeId',c.exchange_id,'state',(SELECT state FROM sophia.owner_host_exchanges WHERE id=c.exchange_id)); END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=c.operation_id;
 IF c.state<>'collecting' OR c.deadline_at<=clock_timestamp() OR NOT sophia.runner_result_capture_ok(o) THEN
  RETURN jsonb_build_object('result','no_host'); END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k)
   IS DISTINCT FROM ARRAY['collection','digest','envelope','journalId','kind','operationId','projectId','v']
  OR p_request->'v' IS DISTINCT FROM '2'::jsonb OR p_request->>'kind' IS DISTINCT FROM 'collect'
  OR p_request->>'projectId' IS DISTINCT FROM p_project::text OR p_request->>'operationId' IS DISTINCT FROM o.id::text
  OR p_request->>'journalId' IS DISTINCT FROM o.gateway_journal_id::text
  OR p_request->'envelope' IS DISTINCT FROM sophia.owner_runner_envelope(o)
  OR p_request->'collection' IS DISTINCT FROM jsonb_build_object('v',1,'maxPages',c.max_pages,'maxBytes',c.max_bytes)
  OR p_request->>'digest' IS DISTINCT FROM p_digest OR p_digest IS DISTINCT FROM sophia.owner_runner_sha256(sophia.runner_result_canonical(sophia.owner_runner_envelope(o)))
  OR p_key !~ ('^collect:'||o.id||':[0-9a-f-]{36}$') OR p_key IS NULL THEN
  RAISE EXCEPTION 'Invalid result exchange' USING ERRCODE='22023'; END IF;
 SELECT * INTO h FROM sophia.owner_hosts WHERE owner_id=c.owner_id AND environment_ref=o.environment_ref
  AND journal_id=o.gateway_journal_id AND t3_namespace=o.native_namespace AND adapter_pin=o.adapter_pin
  AND profile_id=o.profile_id AND profile_revision=o.profile_revision AND account_key=o.account_key AND hello_ok AND state IN ('active','retired')
  ORDER BY bound_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('result','no_host'); END IF;
 INSERT INTO sophia.owner_host_exchanges(host_id,owner_id,kind,exchange_key,project_id,operation_id,payload_digest,request,deadline_at)
 VALUES(h.id,c.owner_id,'collect',p_key,p_project,o.id,p_digest,p_request,c.deadline_at) RETURNING * INTO x;
 -- The FK can wait behind a revoker whose initial project set was empty.
 -- Its KEY SHARE now fences a later host authenticator/revoker; recheck the
 -- committed host after that wait before publishing the collection's exchange.
 SELECT * INTO h FROM sophia.owner_hosts WHERE id=h.id AND owner_id=c.owner_id AND environment_ref=o.environment_ref
  AND journal_id=o.gateway_journal_id AND t3_namespace=o.native_namespace AND adapter_pin=o.adapter_pin
  AND profile_id=o.profile_id AND profile_revision=o.profile_revision AND account_key=o.account_key
  AND hello_ok AND state IN ('active','retired');
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner host not authenticated' USING ERRCODE='42501'; END IF;
 UPDATE sophia.owner_runner_collections SET exchange_id=x.id WHERE project_id=p_project AND id=c.id;
 RETURN jsonb_build_object('result','queued','exchangeId',x.id,'state',x.state);
END $$;

CREATE FUNCTION sophia.runner_result_exchange_ok(x sophia.owner_host_exchanges) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.owner_runner_collections c JOIN sophia.owner_runner_operations o
 ON o.project_id=c.project_id AND o.id=c.operation_id JOIN sophia.owner_hosts h ON h.id=x.host_id
 WHERE c.project_id=x.project_id AND c.exchange_id=x.id AND c.state='collecting' AND c.deadline_at>clock_timestamp()
 AND x.deadline_at>clock_timestamp() AND h.state IN ('active','retired') AND h.hello_ok
 AND h.journal_id=o.gateway_journal_id AND h.owner_id=o.owner_id AND h.environment_ref=o.environment_ref
 AND h.t3_namespace=o.native_namespace AND h.adapter_pin=o.adapter_pin AND h.profile_id=o.profile_id
 AND h.profile_revision=o.profile_revision AND h.account_key=o.account_key AND sophia.runner_result_capture_ok(o))
$$;

-- Freeze bounded exchange IDs before waiting. Every project precedes the host and
-- exchanges; new candidates wait for the next poll, never a late project lock.
CREATE FUNCTION sophia.poll_runner_results(p_cap bytea,p_limit integer) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_host_exchanges; h sophia.owner_hosts; out jsonb:='[]'; ids uuid[]; projects uuid[]; p uuid;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid poll bounds' USING ERRCODE='22023'; END IF;
 SELECT * INTO h FROM sophia.owner_hosts WHERE capability_sha256=p_cap AND state<>'revoked';
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner host not authenticated' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(e.id ORDER BY e.created_at,e.id),'{}'),coalesce(array_agg(DISTINCT e.project_id),'{}') INTO ids,projects
 FROM (SELECT id,project_id,created_at FROM sophia.owner_host_exchanges WHERE host_id=h.id AND kind='collect'
  AND state='queued' ORDER BY created_at,id LIMIT p_limit) e;
 FOR p IN SELECT unnest(projects) ORDER BY 1 LOOP
  PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 END LOOP;
 h:=sophia.owner_host_authenticate(p_cap);
 UPDATE sophia.owner_hosts SET last_seen_at=now() WHERE id=h.id;
 -- Candidate identity is fixed. Recheck membership after the last host wait,
 -- before touching exchanges; never follow a changed project while holding H.
 IF EXISTS(SELECT 1 FROM sophia.owner_host_exchanges e WHERE e.id=ANY(ids)
  AND (e.host_id<>h.id OR e.kind<>'collect' OR NOT e.project_id=ANY(projects))) THEN
  RAISE EXCEPTION 'Collection poll targets changed; retry' USING ERRCODE='40001'; END IF;
 FOR x IN SELECT e.* FROM sophia.owner_host_exchanges e WHERE e.id=ANY(ids) ORDER BY e.created_at,e.id LOOP
  SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=x.id FOR UPDATE;
  IF x.state<>'queued' OR x.delivery_count<>0 OR NOT sophia.runner_result_exchange_ok(x) THEN CONTINUE; END IF;
  UPDATE sophia.owner_runner_collections SET reserved_pages=max_pages WHERE project_id=x.project_id AND exchange_id=x.id;
  UPDATE sophia.owner_host_exchanges SET state='delivered',delivered_at=clock_timestamp(),delivery_count=1 WHERE id=x.id;
  out:=out||jsonb_build_array(jsonb_build_object('exchangeId',x.id,'kind','collect','request',x.request,'deadlineAt',x.deadline_at));
 END LOOP;
 RETURN out;
END $$;

-- Revoke uses the same project order as collection polling. A concurrent enqueue
-- includes answered collections, so consume and revoke serialize on P. Enqueue
-- may add a project while we wait: refuse before cancellation rather than taking
-- a new project lock under H. The caller can retry the complete transaction.
CREATE OR REPLACE FUNCTION sophia.owner_host_revoke(p_host uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); h sophia.owner_hosts; n integer; projects uuid[]; p uuid;
BEGIN
 SELECT * INTO h FROM sophia.owner_hosts WHERE id=p_host;
 IF a IS NULL OR NOT FOUND OR h.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(DISTINCT project_id),'{}') INTO projects FROM sophia.owner_host_exchanges
  WHERE host_id=p_host AND kind='collect' AND state IN ('queued','delivered','answered');
 FOR p IN SELECT unnest(projects) ORDER BY 1 LOOP
  PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 END LOOP;
 SELECT * INTO h FROM sophia.owner_hosts WHERE id=p_host FOR UPDATE;
 IF NOT FOUND OR h.owner_id<>a THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM sophia.owner_host_exchanges WHERE host_id=p_host AND kind='collect'
  AND state IN ('queued','delivered','answered') AND NOT project_id=ANY(projects)) THEN
  RAISE EXCEPTION 'Host revocation targets changed; retry' USING ERRCODE='40001'; END IF;
 UPDATE sophia.owner_hosts SET state='revoked',revoked_at=coalesce(revoked_at,now()) WHERE id=h.id;
 UPDATE sophia.owner_host_exchanges SET state='cancelled',reason='the owner host was revoked'
  WHERE host_id=h.id AND go_count=0 AND state IN ('queued','delivered');
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('result','revoked','fenced',n);
END $$;

CREATE FUNCTION sophia.answer_runner_result(p_cap bytea,p_exchange uuid,p_answer jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_host_exchanges; o sophia.owner_runner_operations; c sophia.owner_runner_collections; h sophia.owner_hosts; p uuid; k text;
BEGIN
 SELECT project_id INTO p FROM sophia.owner_host_exchanges WHERE id=p_exchange AND kind='collect';
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange FOR UPDATE;
 SELECT * INTO h FROM sophia.owner_hosts WHERE id=x.host_id AND capability_sha256=p_cap AND state<>'revoked';
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner host not authenticated' USING ERRCODE='42501'; END IF;
 IF NOT sophia.runner_result_exchange_ok(x) OR x.state NOT IN ('delivered','answered') OR x.delivery_count<>1 THEN
  RETURN jsonb_build_object('result','conflict'); END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p AND id=x.operation_id;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p AND exchange_id=x.id;
 IF p_answer IS NULL OR jsonb_typeof(p_answer) IS DISTINCT FROM 'object' OR octet_length(p_answer::text)>65536
  OR p_answer->'v' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Invalid result answer' USING ERRCODE='22023'; END IF;
 k:=p_answer->>'kind';
 IF k='collection_unavailable' THEN
  IF (SELECT array_agg(t ORDER BY t) FROM jsonb_object_keys(p_answer) t) IS DISTINCT FROM ARRAY['kind','reason','v']
   OR p_answer->>'reason' IS NULL OR p_answer->>'reason' NOT IN ('unsupported','invalid_request','unavailable','scope','unaccepted','incomplete','invalid_result') THEN
   RAISE EXCEPTION 'Invalid result answer' USING ERRCODE='22023'; END IF;
 ELSIF k='collected' THEN
  IF (SELECT array_agg(t ORDER BY t) FROM jsonb_object_keys(p_answer) t) IS DISTINCT FROM
   ARRAY['bindingId','byteLength','coverageDigest','envelopeDigest','inputMessageId','itemId','journalId','kind','lastPosition','messageId','operationId','pages','resultDigest','runId','text','textSha256','threadId','v']
   OR p_answer->>'operationId' IS DISTINCT FROM o.id::text OR p_answer->>'bindingId' IS DISTINCT FROM o.binding_id::text
   OR p_answer->>'journalId' IS DISTINCT FROM o.gateway_journal_id::text OR p_answer->>'envelopeDigest' IS DISTINCT FROM x.request->>'digest'
   OR p_answer->>'threadId' IS DISTINCT FROM o.native_thread_id OR p_answer->>'runId' IS DISTINCT FROM o.native_run_id
   OR p_answer->>'inputMessageId' IS DISTINCT FROM o.native_message_id
   OR NOT sophia.owner_host_json_text(p_answer->'messageId','^.+$')
   OR NOT sophia.owner_host_json_text(p_answer->'itemId','^.+$')
   OR length(p_answer->>'messageId')>1000 OR length(p_answer->>'itemId')>1000
   OR p_answer->>'messageId'=o.native_message_id OR jsonb_typeof(p_answer->'text') IS DISTINCT FROM 'string'
   OR btrim(p_answer->>'text')='' OR octet_length(p_answer->>'text') NOT BETWEEN 1 AND c.max_bytes
   OR p_answer->'byteLength' IS DISTINCT FROM to_jsonb(octet_length(p_answer->>'text'))
   OR p_answer->>'textSha256' IS DISTINCT FROM sophia.owner_runner_sha256(p_answer->>'text')
   OR jsonb_typeof(p_answer->'pages') IS DISTINCT FROM 'number' OR (p_answer->>'pages') !~ '^[2-8]$'
   OR (p_answer->>'pages')::integer>c.max_pages
   OR NOT (CASE WHEN jsonb_typeof(p_answer->'lastPosition')='number' THEN
    (p_answer->>'lastPosition')::numeric BETWEEN 0 AND 9007199254740991
    AND (p_answer->>'lastPosition')::numeric=trunc((p_answer->>'lastPosition')::numeric)
    ELSE false END)
   OR NOT sophia.owner_host_json_text(p_answer->'coverageDigest','^[0-9a-f]{64}$')
   OR p_answer->>'resultDigest' IS DISTINCT FROM sophia.owner_runner_sha256(sophia.runner_result_canonical(p_answer-'resultDigest')) THEN
   RAISE EXCEPTION 'Invalid result answer' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'Invalid result answer' USING ERRCODE='22023'; END IF;
 IF x.state='answered' THEN RETURN jsonb_build_object('result',CASE WHEN x.answer=p_answer THEN 'ok' ELSE 'conflict' END); END IF;
 UPDATE sophia.owner_host_exchanges SET state='answered',answer=p_answer,answered_at=clock_timestamp() WHERE id=x.id;
 RETURN jsonb_build_object('result','ok');
END $$;

CREATE FUNCTION sophia.read_runner_result_exchange(p_project uuid,p_collection uuid,p_permit uuid,p_exchange uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections; x sophia.owner_host_exchanges;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR SHARE;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p_project AND id=p_collection;
 IF NOT FOUND OR c.permit IS DISTINCT FROM p_permit OR c.exchange_id IS DISTINCT FROM p_exchange THEN
  RAISE EXCEPTION 'Result permit refused' USING ERRCODE='42501'; END IF;
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange;
 RETURN jsonb_build_object('exchangeId',x.id,'state',x.state,'goCount',0,'deadlinePassed',x.deadline_at<=clock_timestamp(),
 'reason',NULL,'answer',CASE WHEN sophia.runner_result_exchange_ok(x) THEN x.answer ELSE NULL END);
END $$;

CREATE FUNCTION sophia.consume_runner_result(p_project uuid,p_collection uuid,p_permit uuid,p_exchange uuid,p_sha text,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections; x sophia.owner_host_exchanges; o sophia.owner_runner_operations;
 r sophia.owner_runner_results; s sophia.source_objects; a jsonb; ctx sophia.owner_runner_operations; roots uuid[];
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p_project AND id=p_collection FOR UPDATE;
 IF NOT FOUND OR c.permit IS DISTINCT FROM p_permit OR c.exchange_id IS DISTINCT FROM p_exchange THEN
  RAISE EXCEPTION 'Result permit refused' USING ERRCODE='42501'; END IF;
 IF c.state='retained' THEN SELECT * INTO r FROM sophia.owner_runner_results WHERE project_id=p_project AND id=c.result_id;
  RETURN sophia.runner_result_descriptor(r); END IF;
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange FOR UPDATE;
 IF x.state<>'answered' OR NOT sophia.runner_result_exchange_ok(x) THEN RETURN NULL; END IF;
 a:=x.answer;
 IF a->>'kind'<>'collected' OR a->>'textSha256' IS DISTINCT FROM p_sha OR p_sha IS DISTINCT FROM sophia.owner_runner_sha256(a->>'text') THEN
  RETURN NULL; END IF;
 SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=c.operation_id;
 -- Version key uses only native immutable identity, never a cursor/page/observation/attempt id.
 IF p_version IS DISTINCT FROM sophia.owner_runner_sha256(jsonb_build_array(o.id,o.binding_id,o.gateway_journal_id,
  o.native_namespace,o.native_thread_id,o.native_run_id,o.native_message_id,a->>'messageId',a->>'itemId')::text) THEN
  RAISE EXCEPTION 'Invalid result version' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.owner_runner_results WHERE project_id=p_project AND version_key=p_version;
 IF FOUND THEN
  IF r.text_sha256<>p_sha THEN RAISE EXCEPTION 'Result version conflict' USING ERRCODE='23505'; END IF;
 ELSE
  s:=sophia.owner_runner_put_private(p_project,c.owner_id,'text/plain; charset=utf-8',a->>'text');
  INSERT INTO sophia.owner_runner_results(project_id,owner_id,collection_id,operation_id,original_create_id,goal_id,attempt_id,binding_id,
   journal_id,native_namespace,thread_id,run_id,input_message_id,message_id,item_id,source_id,version_key,text_sha256,byte_length,audience_revision)
  SELECT p_project,c.owner_id,c.id,o.id,coalesce(o.target_operation_id,o.id),o.goal_id,o.attempt_id,o.binding_id,o.gateway_journal_id,
   o.native_namespace,o.native_thread_id,o.native_run_id,o.native_message_id,a->>'messageId',a->>'itemId',s.id,p_version,p_sha,s.byte_length,p.audience_revision
   FROM sophia.projects p WHERE p.id=p_project RETURNING * INTO r;
  FOR ctx IN SELECT z.* FROM sophia.owner_runner_operations z WHERE z.project_id=p_project AND z.binding_id=o.binding_id
   AND z.kind IN ('create','input') ORDER BY z.id LOOP
   INSERT INTO sophia.owner_runner_result_contexts VALUES(p_project,r.id,ctx.id,ctx.qualification_id,ctx.qualification_revision,
    ctx.profile_id,ctx.profile_revision,ctx.manifest_id,ctx.manifest_sha256);
   SELECT ARRAY[ctx.payload_source_id,m.body_source_id]||coalesce(array_agg(os.source_id) FILTER(WHERE os.source_id IS NOT NULL),'{}'::uuid[])
    INTO roots FROM sophia.context_manifests m LEFT JOIN sophia.owner_runner_operation_sources os
    ON os.project_id=m.project_id AND os.operation_id=ctx.id WHERE m.project_id=p_project AND m.id=ctx.manifest_id GROUP BY m.body_source_id;
   INSERT INTO sophia.owner_runner_result_dependencies
    SELECT p_project,r.id,src.id,src.sha256,src.eligibility_revision,src.scope,src.owner_id
    FROM sophia.source_closure(p_project,roots) dep JOIN sophia.source_objects src ON src.project_id=p_project AND src.id=dep
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
   SELECT p_project,d.source_id,s.id FROM sophia.owner_runner_result_dependencies d WHERE d.project_id=p_project AND d.result_id=r.id;
 END IF;
 UPDATE sophia.owner_runner_collections SET state='retained',result_id=r.id WHERE project_id=p_project AND id=c.id;
 UPDATE sophia.owner_host_exchanges SET state='lapsed',answer=NULL,reason='result consumed' WHERE id=x.id;
 RETURN sophia.runner_result_descriptor(r);
END $$;

-- Fixed outcome, no raw driver/provider reason. Raw answer removed atomically, including unsupported/error outcomes.
CREATE FUNCTION sophia.finish_runner_result(p_project uuid,p_collection uuid,p_permit uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections;
BEGIN
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO c FROM sophia.owner_runner_collections WHERE project_id=p_project AND id=p_collection FOR UPDATE;
 IF NOT FOUND OR c.permit IS DISTINCT FROM p_permit THEN RAISE EXCEPTION 'Result permit refused' USING ERRCODE='42501'; END IF;
 IF c.state IN ('retained','withdrawn') THEN RETURN; END IF;
 IF c.exchange_id IS NOT NULL AND c.deadline_at>clock_timestamp() AND EXISTS(SELECT 1 FROM sophia.owner_host_exchanges WHERE id=c.exchange_id AND delivery_count=0 AND state='queued') THEN
  UPDATE sophia.owner_host_exchanges SET state='cancelled',answer=NULL,reason='never delivered; original root retained' WHERE id=c.exchange_id;
  UPDATE sophia.owner_runner_collections SET exchange_id=NULL,claimed=false,state='pending',permit=gen_random_uuid() WHERE project_id=p_project AND id=c.id;
  RETURN;
 END IF;
 IF c.exchange_id IS NULL AND c.deadline_at>clock_timestamp() THEN
  UPDATE sophia.owner_runner_collections SET state='pending',claimed=false,permit=gen_random_uuid() WHERE project_id=p_project AND id=c.id;
  RETURN;
 END IF;
 UPDATE sophia.owner_runner_collections SET state=CASE WHEN exchange_id IS NULL THEN 'unavailable' ELSE 'unknown' END,
  reason='collection_unavailable' WHERE project_id=p_project AND id=c.id;
 UPDATE sophia.owner_host_exchanges SET state='lapsed',answer=NULL,reason='result unavailable' WHERE id=c.exchange_id;
END $$;

CREATE FUNCTION sophia.maintain_runner_results() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.owner_runner_collections; n integer:=0;
BEGIN
 FOR c IN SELECT * FROM sophia.owner_runner_collections WHERE state IN ('pending','collecting') AND (deadline_at<=clock_timestamp()
   OR (state='collecting' AND consume_lease_until<=clock_timestamp() AND reserved_pages=0
    AND (exchange_id IS NULL OR EXISTS(SELECT 1 FROM sophia.owner_host_exchanges x WHERE x.id=exchange_id AND x.state='queued' AND x.delivery_count=0))))
  ORDER BY project_id,id LIMIT 100 LOOP
  PERFORM sophia.finish_runner_result(c.project_id,c.id,c.permit); n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- Synchronous purge, no SKIP LOCKED. Tombstone first makes recursive derived-source triggers finite.
CREATE FUNCTION sophia.purge_runner_results(p_project uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.owner_runner_results; c sophia.owner_runner_collections; o sophia.owner_runner_operations;
BEGIN
 -- Preserve the existing source-only race behavior of wholly unrelated legacy projects.
 -- This guard alone would be unsafe: the first insertion is protected by capture_fence's row locks.
 IF NOT sophia.runner_result_relevant(p_project) THEN RETURN; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 FOR r IN SELECT * FROM sophia.owner_runner_results WHERE project_id=p_project AND state='retained' ORDER BY id FOR UPDATE LOOP
  IF NOT sophia.runner_result_retained_ok(r) THEN
   UPDATE sophia.owner_runner_results SET state='withdrawn' WHERE project_id=p_project AND id=r.id;
   UPDATE sophia.owner_runner_collections SET state='withdrawn',reason='retention_revoked' WHERE project_id=p_project AND result_id=r.id;
   UPDATE sophia.owner_host_exchanges SET state='lapsed',answer=NULL,reason='retention revoked'
    WHERE kind='collect' AND project_id=p_project AND operation_id=r.operation_id;
   DELETE FROM sophia.source_texts WHERE project_id=p_project AND source_id=r.source_id;
   UPDATE sophia.source_objects SET state='deleted',eligible=false WHERE project_id=p_project AND id=r.source_id;
  END IF;
 END LOOP;
 FOR c IN SELECT * FROM sophia.owner_runner_collections WHERE project_id=p_project AND state IN ('pending','collecting') ORDER BY id FOR UPDATE LOOP
  SELECT * INTO o FROM sophia.owner_runner_operations WHERE project_id=p_project AND id=c.operation_id;
  IF NOT sophia.runner_result_capture_ok(o) THEN
   UPDATE sophia.owner_runner_collections SET state='withdrawn',reason='retention_revoked' WHERE project_id=p_project AND id=c.id;
   UPDATE sophia.owner_host_exchanges SET state='lapsed',answer=NULL,reason='retention revoked' WHERE id=c.exchange_id;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION sophia.runner_results_purge_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE p uuid;
BEGIN
 IF TG_TABLE_NAME='projects' THEN PERFORM sophia.purge_runner_results(NEW.id);
 ELSIF TG_TABLE_NAME='execution_connections' THEN
  FOR p IN SELECT DISTINCT project_id FROM sophia.owner_runner_operations WHERE connection_id=OLD.id ORDER BY project_id LOOP
   PERFORM sophia.purge_runner_results(p); END LOOP;
 ELSE PERFORM sophia.purge_runner_results(OLD.project_id); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER runner_results_source_purge AFTER UPDATE OF state,eligible,scope,sha256,eligibility_revision,owner_id ON sophia.source_objects
 FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION sophia.runner_results_purge_trigger();
CREATE TRIGGER runner_results_text_purge AFTER UPDATE OR DELETE ON sophia.source_texts FOR EACH ROW EXECUTE FUNCTION sophia.runner_results_purge_trigger();
CREATE TRIGGER runner_results_member_purge AFTER UPDATE OR DELETE ON sophia.project_members FOR EACH ROW EXECUTE FUNCTION sophia.runner_results_purge_trigger();
CREATE TRIGGER runner_results_manifest_purge AFTER UPDATE OR DELETE ON sophia.context_manifests FOR EACH ROW EXECUTE FUNCTION sophia.runner_results_purge_trigger();
CREATE TRIGGER runner_results_audience_purge AFTER UPDATE OF audience_revision ON sophia.projects FOR EACH ROW WHEN(OLD.audience_revision<>NEW.audience_revision)
 EXECUTE FUNCTION sophia.runner_results_purge_trigger();

CREATE TRIGGER runner_results_qualification_purge AFTER UPDATE OR DELETE ON sophia.owner_runner_qualifications FOR EACH ROW EXECUTE FUNCTION sophia.runner_results_purge_trigger();
CREATE TRIGGER runner_results_resource_purge AFTER UPDATE OR DELETE ON sophia.executor_resources FOR EACH ROW EXECUTE FUNCTION sophia.runner_results_purge_trigger();
CREATE TRIGGER runner_results_connection_purge AFTER UPDATE ON sophia.execution_connections FOR EACH ROW EXECUTE FUNCTION sophia.runner_results_purge_trigger();

-- Ordinary channel behavior preserved; collect has a distinct scoped authority boundary.
CREATE OR REPLACE FUNCTION sophia.owner_host_poll(p_capability_sha256 bytea, p_limit integer DEFAULT 10, p_redeliver_seconds integer DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts; x sophia.owner_host_exchanges; why text;
 out jsonb:='[]';
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_redeliver_seconds IS NULL OR p_redeliver_seconds NOT BETWEEN 1 AND 300 THEN
  RAISE EXCEPTION 'Invalid poll bounds' USING ERRCODE='22023'; END IF;
 out:=sophia.poll_runner_results(p_capability_sha256,p_limit);
 -- poll_runner_results already holds the authenticated host, including an empty
 -- delivery batch. Do not acquire a new host lock after collection exchange locks.
 SELECT * INTO h FROM sophia.owner_hosts WHERE capability_sha256=p_capability_sha256;
 IF h.journal_id IS NULL OR NOT h.hello_ok THEN RETURN out; END IF;
 FOR x IN SELECT * FROM sophia.owner_host_exchanges e WHERE e.host_id=h.id AND e.kind<>'collect' AND e.deadline_at>clock_timestamp()
   AND (e.state='queued' OR (e.state IN ('delivered','go_granted') AND e.delivered_at<=now()-make_interval(secs=>p_redeliver_seconds)))
   ORDER BY e.created_at LIMIT greatest(0,p_limit-jsonb_array_length(out)) FOR UPDATE SKIP LOCKED
 LOOP
  IF x.kind='send' THEN
   why:=sophia.owner_host_send_refusal(x,h);
   IF why IS NOT NULL AND x.go_count=0 THEN
    UPDATE sophia.owner_host_exchanges SET state='denied', reason=left('at delivery: '||why,500) WHERE id=x.id;
    CONTINUE;
   END IF;
  ELSIF h.state NOT IN ('active','retired') THEN CONTINUE;
  END IF;
  UPDATE sophia.owner_host_exchanges SET state=CASE WHEN state='go_granted' THEN 'go_granted' ELSE 'delivered' END,
   delivered_at=now(), delivery_count=delivery_count+1 WHERE id=x.id RETURNING * INTO x;
  out:=out||jsonb_build_array(jsonb_build_object('exchangeId',x.id,'kind',x.kind,'request',x.request,'deadlineAt',x.deadline_at));
 END LOOP;
 RETURN out;
END $$;

-- Ordinary channel behavior preserved; collect has a distinct scoped authority boundary.
CREATE OR REPLACE FUNCTION sophia.owner_host_answer(p_capability_sha256 bytea, p_exchange uuid, p_answer jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE h sophia.owner_hosts; x sophia.owner_host_exchanges; k text;
BEGIN
 IF EXISTS(SELECT 1 FROM sophia.owner_host_exchanges WHERE id=p_exchange AND kind='collect') THEN
  RETURN sophia.answer_runner_result(p_capability_sha256,p_exchange,p_answer); END IF;
 h:=sophia.owner_host_authenticate(p_capability_sha256);
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange FOR UPDATE;
 IF NOT FOUND OR x.host_id<>h.id THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_answer IS NULL OR jsonb_typeof(p_answer)<>'object' OR octet_length(p_answer::text)>65536 THEN
  RAISE EXCEPTION 'Invalid answer' USING ERRCODE='22023'; END IF;
 -- The answer names its kind as a JSON string of its exchange's vocabulary (r5: a missing or null kind is refused).
 k:=CASE WHEN jsonb_typeof(p_answer->'kind')='string' THEN p_answer->>'kind' END;
 IF k IS NULL
    OR (x.kind IN ('send','reconcile') AND k NOT IN ('received','rejected','refused','conflict','unknown','settled'))
    OR (x.kind='observe' AND k NOT IN ('run','no_active_run','unknown')) THEN
  RAISE EXCEPTION 'Invalid answer' USING ERRCODE='22023'; END IF;
 -- A send never granted GO here was never handed to the gateway: the only honest answer for it is `refused`.
 IF x.kind='send' AND x.go_count=0 AND k IS DISTINCT FROM 'refused' THEN
  RAISE EXCEPTION 'Invalid answer: no GO was granted for this send' USING ERRCODE='22023'; END IF;
 IF x.state='queued' THEN RAISE EXCEPTION 'Invalid answer: the exchange was never delivered' USING ERRCODE='22023'; END IF;
 IF x.state='answered' THEN
  RETURN jsonb_build_object('result',CASE WHEN x.answer=p_answer THEN 'ok' ELSE 'conflict' END);
 END IF;
 UPDATE sophia.owner_host_exchanges SET state='answered', answer=p_answer, answered_at=now() WHERE id=x.id;
 RETURN jsonb_build_object('result','ok');
END $$;

-- Ordinary channel behavior preserved; collect has a distinct scoped authority boundary.
CREATE OR REPLACE FUNCTION sophia.owner_host_exchange(p_owner uuid, p_exchange uuid) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('exchangeId',x.id,'state',x.state,'goCount',x.go_count,'answer',CASE WHEN x.kind='collect' THEN NULL ELSE x.answer END,'reason',x.reason,
  'deadlinePassed',x.deadline_at<=clock_timestamp())
 FROM sophia.owner_host_exchanges x WHERE x.id=p_exchange AND x.owner_id=p_owner
$$;

-- Ordinary channel behavior preserved; collect has a distinct scoped authority boundary.
CREATE OR REPLACE FUNCTION sophia.owner_host_settle(p_owner uuid, p_exchange uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE x sophia.owner_host_exchanges;
BEGIN
 SELECT * INTO x FROM sophia.owner_host_exchanges WHERE id=p_exchange AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid exchange' USING ERRCODE='22023'; END IF;
 IF x.kind='collect' THEN RETURN jsonb_build_object('result','possible','reason','collection requires its scoped permit'); END IF;
 IF x.state='answered' THEN RETURN jsonb_build_object('result','answered','answer',x.answer); END IF;
 IF x.go_count>0 THEN
  UPDATE sophia.owner_host_exchanges SET state='lapsed', reason=coalesce(reason,'no answer before the deadline after GO') WHERE id=x.id;
  RETURN jsonb_build_object('result','possible','reason','GO was granted and no answer came: a send may have happened');
 END IF;
 IF x.state IN ('queued','delivered') THEN
  UPDATE sophia.owner_host_exchanges SET state='lapsed', reason=coalesce(reason,'no GO before the worker stopped waiting')
   WHERE id=x.id RETURNING * INTO x;
 END IF;
 RETURN jsonb_build_object('result','not_sent','state',x.state,'reason',coalesce(x.reason,'no GO was granted'));
END $$;

-- Ordinary channel behavior preserved; collect has a distinct scoped authority boundary.
CREATE OR REPLACE FUNCTION sophia.owner_host_maintain(p_limit integer DEFAULT 100) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE n integer; m integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid bound' USING ERRCODE='22023'; END IF;
 WITH due AS (SELECT id FROM sophia.owner_host_exchanges WHERE kind<>'collect' AND state IN ('queued','delivered') AND go_count=0
   AND deadline_at<=clock_timestamp() ORDER BY deadline_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
 UPDATE sophia.owner_host_exchanges x SET state='lapsed', reason=coalesce(x.reason,'its deadline passed before GO')
  FROM due WHERE x.id=due.id;
 GET DIAGNOSTICS n=ROW_COUNT;
 WITH old AS (SELECT id FROM sophia.owner_host_exchanges WHERE kind IN ('reconcile','observe')
   AND state IN ('answered','lapsed','cancelled','denied') AND created_at<now()-interval '1 day' LIMIT p_limit FOR UPDATE SKIP LOCKED)
 DELETE FROM sophia.owner_host_exchanges x USING old WHERE x.id=old.id;
 GET DIAGNOSTICS m=ROW_COUNT;
 RETURN n+m;
END $$;

-- Metadata only, current owner's exact selected goal. UUID cursor is an opaque page token, never native authority.
CREATE FUNCTION sophia.runner_work_operation(o sophia.owner_runner_operations) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('operationId',o.id,'projectId',o.project_id,'goalId',o.goal_id,'kind',o.kind,'state',o.state,
 'revision',o.revision,'resourceId',o.resource_id,'attemptId',o.attempt_id,'bindingId',o.binding_id,
 'originalCreateId',coalesce(o.target_operation_id,o.id),'acceptedRunId',o.native_run_id,'admittedAt',o.created_at,
 'collection',(SELECT sophia.runner_result_collection_view(c) FROM sophia.owner_runner_collections c
  WHERE c.project_id=o.project_id AND c.operation_id=o.id),
 'result',(SELECT sophia.runner_result_descriptor(r) FROM sophia.owner_runner_results r
  WHERE r.project_id=o.project_id AND r.operation_id=o.id))
$$;
CREATE FUNCTION sophia.runner_work_page(p_project uuid,p_goal uuid,p_after uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE items jsonb; last_id uuid; more boolean;
BEGIN
 IF NOT sophia.is_member(p_project) OR NOT EXISTS(SELECT 1 FROM sophia.goals WHERE project_id=p_project AND id=p_goal) THEN
  RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(sophia.runner_work_operation(o) ORDER BY o.id),'[]'),(array_agg(o.id ORDER BY o.id DESC))[1]
 INTO items,last_id FROM (SELECT * FROM sophia.owner_runner_operations WHERE project_id=p_project AND goal_id=p_goal
  AND owner_id=sophia.actor_id() AND (p_after IS NULL OR id>p_after) ORDER BY id LIMIT 100) o;
 SELECT EXISTS(SELECT 1 FROM sophia.owner_runner_operations WHERE project_id=p_project AND goal_id=p_goal AND owner_id=sophia.actor_id() AND id>last_id) INTO more;
 RETURN jsonb_build_object('projectId',p_project,'goalId',p_goal,'operations',items,'complete',NOT more,
 'nextCursor',CASE WHEN more THEN last_id::text ELSE NULL END,'observedAt',clock_timestamp());
END $$;
CREATE FUNCTION sophia.runner_work_lookup(p_project uuid,p_goal uuid,p_key text,p_kind text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE item jsonb;
BEGIN
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 IF p_kind='operation' THEN
  SELECT sophia.runner_work_operation(o) INTO item FROM sophia.owner_runner_operations o
   WHERE project_id=p_project AND goal_id=p_goal AND owner_id=sophia.actor_id() AND client_request_id=p_key;
 ELSIF p_kind='collection' THEN
  SELECT sophia.runner_result_collection_view(c) INTO item FROM sophia.owner_runner_collections c JOIN sophia.owner_runner_operations o
   ON o.project_id=c.project_id AND o.id=c.operation_id WHERE c.project_id=p_project AND o.goal_id=p_goal
   AND c.owner_id=sophia.actor_id() AND c.client_request_id=p_key;
 ELSE RAISE EXCEPTION 'Invalid lookup kind' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('kind',p_kind,'state',CASE WHEN item IS NULL THEN 'not_observed' ELSE 'found' END,
  'operation',CASE WHEN p_kind='operation' THEN item ELSE NULL END,'collection',CASE WHEN p_kind='collection' THEN item ELSE NULL END,
  'absenceProvesNoCommit',false,'observedAt',clock_timestamp());
END $$;
-- Existing managed work remains on its legitimate assignment. This slice supplies no managed continuation.
CREATE FUNCTION sophia.runner_work_managed(p_project uuid,p_goal uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT EXISTS(SELECT 1 FROM sophia.work_items wi JOIN sophia.work_assignments wa ON wa.project_id=wi.project_id AND wa.work_id=wi.id
 JOIN sophia.work_plans wp ON wp.project_id=wi.project_id AND wp.id=wi.plan_id
 WHERE wi.project_id=p_project AND (wi.execution_goal_id=p_goal OR wp.goal_id=p_goal) AND wa.state='active')
$$;
CREATE FUNCTION sophia.runner_work_no_parallel_create() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NEW.kind='create' AND sophia.runner_work_managed(NEW.project_id,NEW.goal_id) THEN
  RAISE EXCEPTION 'Owner runner route is not qualified: this goal already has managed work' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER runner_work_no_parallel_create BEFORE INSERT ON sophia.owner_runner_operations FOR EACH ROW EXECUTE FUNCTION sophia.runner_work_no_parallel_create();

CREATE FUNCTION sophia.runner_work_availability(p_project uuid,p_goal uuid,p_after uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE resources jsonb; sources jsonb; g sophia.goals; can_act boolean; last_id uuid; more boolean;
BEGIN
 IF NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=p_project AND id=p_goal;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 can_act:=sophia.can_edit(p_project) AND g.status IN ('ready','running','checking')
 AND NOT sophia.runner_work_managed(p_project,p_goal);
 SELECT coalesce(jsonb_agg(jsonb_build_object('resourceId',r.id,'profileId',q.profile_id,'profileRevision',q.profile_revision,
  'qualificationRevision',q.revision,'operations',to_jsonb(q.operations),'sourcePolicy',q.source_policy,
  'repositoryRoot',r.repository_root,'writeScope','read_only','remainingOperations',q.allowance_operations-q.used_operations,
  'hostState',CASE WHEN EXISTS(SELECT 1 FROM sophia.owner_hosts h WHERE h.owner_id=q.owner_id AND h.connection_id=q.connection_id
   AND h.environment_ref=q.environment_ref AND h.state='active' AND h.hello_ok) THEN 'recorded_active' ELSE 'not_recorded_active' END)
  ORDER BY r.id),'[]') INTO resources
 FROM sophia.executor_resources r JOIN sophia.owner_runner_qualifications q ON q.project_id=r.project_id AND q.resource_id=r.id
 JOIN sophia.execution_connections c ON c.id=q.connection_id WHERE r.project_id=p_project AND r.owner_id=sophia.actor_id()
 AND r.state='active' AND c.state='linked' AND (c.expires_at IS NULL OR c.expires_at>clock_timestamp())
 AND q.revoked_at IS NULL AND q.expires_at>clock_timestamp() AND q.connection_revision=c.revision AND q.resource_revision=r.revision
 AND q.used_operations<q.allowance_operations AND sophia.owner_runner_policy_refusal(q.source_policy) IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',s.id,'sha256',s.sha256,'revision',s.eligibility_revision) ORDER BY s.id),'[]'),
 (array_agg(s.id ORDER BY s.id DESC))[1] INTO sources,last_id FROM (SELECT * FROM sophia.source_objects s
 WHERE project_id=p_project AND scope='project' AND eligible AND state='ready' AND NOT sophia.source_withdrawn(project_id,id)
 AND (p_after IS NULL OR id>p_after) ORDER BY id LIMIT 100) s;
 SELECT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE project_id=p_project AND scope='project' AND eligible AND state='ready'
 AND NOT sophia.source_withdrawn(project_id,id) AND id>last_id) INTO more;
 RETURN jsonb_build_object('projectId',p_project,'goalId',p_goal,'goalRevision',g.revision,'authorityEpoch',g.authority_epoch,
 'canAdmit',can_act AND jsonb_array_length(resources)>0,'reason',CASE WHEN sophia.runner_work_managed(p_project,p_goal) THEN 'managed_goal' WHEN NOT can_act THEN 'role_or_goal'
 WHEN jsonb_array_length(resources)=0 THEN 'no_qualified_route' ELSE NULL END,'resources',resources,'sources',sources,
 'sourcesComplete',NOT more,'nextSourceCursor',CASE WHEN more THEN last_id::text ELSE NULL END,
 'baseCommitPolicy','caller_supplied_exact_commit','managedContinuation','not_provided','observedAt',clock_timestamp());
END $$;

-- No public helper/definer access. Only the exact owner-facing reads/admission and scoped worker boundary are granted.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sophia' AND p.proname IN ('runner_result_canonical','runner_result_context_ok','runner_result_capture_ok',
 'runner_result_capture_fence','runner_result_relevant','runner_result_collection_view','request_runner_result','runner_result_retained_ok','runner_result_descriptor','read_runner_result',
 'claim_runner_result','resume_runner_result','enqueue_runner_result','runner_result_exchange_ok','poll_runner_results','answer_runner_result',
 'read_runner_result_exchange','consume_runner_result','finish_runner_result','maintain_runner_results','purge_runner_results',
 'runner_results_purge_trigger','runner_work_operation','runner_work_page','runner_work_lookup','runner_work_availability','runner_work_managed','runner_work_no_parallel_create')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION sophia.request_runner_result(uuid,uuid,text,bigint,integer,integer),sophia.read_runner_result(uuid,uuid),
 sophia.runner_work_page(uuid,uuid,uuid),sophia.runner_work_lookup(uuid,uuid,text,text),sophia.runner_work_availability(uuid,uuid,uuid) TO sophia_api;
GRANT EXECUTE ON FUNCTION sophia.claim_runner_result(),sophia.resume_runner_result(),sophia.enqueue_runner_result(uuid,uuid,uuid,jsonb,text,text),
 sophia.read_runner_result_exchange(uuid,uuid,uuid,uuid),sophia.consume_runner_result(uuid,uuid,uuid,uuid,text,text),
 sophia.finish_runner_result(uuid,uuid,uuid),sophia.maintain_runner_results() TO sophia_worker;
COMMIT;
