-- INC03 S02: immutable deterministic observation metadata only. No admission or dispatch.
BEGIN;

-- Same reviewed context predicate for the ordinary RLS read and bounded definer writer.
-- Explicit membership remains required when invoked under the writer's owner identity.
CREATE FUNCTION sophia.read_saved_conversation_input_context(uuid,uuid,uuid)
RETURNS TABLE("inputId" uuid,"projectId" uuid,"conversationId" uuid,"messageId" uuid,"actorId" uuid,
 text text,"messageSeq" text,"conversationRevision" text,"erasureRevision" text,
 "observedConversationRevision" text,mentions uuid[],"replyTarget" jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,sophia,pg_temp AS $$
SELECT i.id AS "inputId", i.project_id AS "projectId", i.conversation_id AS "conversationId",
      i.message_id AS "messageId", i.actor_id AS "actorId", m.body AS text, i.message_seq::text AS "messageSeq",
      a.conversation_revision::text AS "conversationRevision", a.erasure_revision::text AS "erasureRevision",
      c.revision::text AS "observedConversationRevision", a.structured_mentions AS mentions,
      CASE WHEN a.reply_target IS NOT NULL THEN jsonb_build_object(
        'messageId',t.id,'seq',t.seq::text,'author',t.author,'actorId',t.actor_id) END AS "replyTarget"
    FROM sophia.saved_conversation_inputs i
    JOIN sophia.saved_conversation_input_addressing a ON a.project_id=i.project_id AND a.input_id=i.id
      AND a.conversation_id=i.conversation_id
    JOIN sophia.conversations c ON c.project_id=i.project_id AND c.id=i.conversation_id AND c.state='open'
    JOIN sophia.conversation_messages m ON m.project_id=i.project_id AND m.conversation_id=i.conversation_id
      AND m.id=i.message_id AND m.seq=i.message_seq AND m.actor_id=i.actor_id AND m.author='member'
      AND m.withdrawn_at IS NULL AND m.body IS NOT NULL
    LEFT JOIN sophia.conversation_messages t ON t.project_id=i.project_id AND t.conversation_id=i.conversation_id
      AND t.id=a.reply_target AND t.seq=a.reply_target_seq AND t.author=a.reply_target_author
      AND t.actor_id IS NOT DISTINCT FROM a.reply_target_actor_id AND t.withdrawn_at IS NULL
    WHERE i.project_id=$1 AND i.conversation_id=$2 AND i.id=$3
      AND sophia.actor_id() IS NOT NULL AND sophia.is_member(i.project_id)
      AND NOT EXISTS(SELECT 1 FROM unnest(a.structured_mentions) recipient
        WHERE NOT EXISTS(SELECT 1 FROM sophia.project_members pm
          WHERE pm.project_id=i.project_id AND pm.actor_id=recipient AND pm.active))
      AND (a.reply_target IS NULL OR (t.id IS NOT NULL AND (t.author='sophia' OR EXISTS(
        SELECT 1 FROM sophia.project_members pm WHERE pm.project_id=i.project_id AND pm.actor_id=t.actor_id AND pm.active))));
$$;
REVOKE ALL ON FUNCTION sophia.read_saved_conversation_input_context(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.read_saved_conversation_input_context(uuid,uuid,uuid) TO sophia_api;

-- Canonical JSON matches the existing pure policy's recursive key ordering; these helpers have no login grants.
CREATE FUNCTION sophia.saved_input_observation_canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE out text;
BEGIN
 IF jsonb_typeof(v)='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||sophia.saved_input_observation_canonical(value),',' ORDER BY key COLLATE "C"),'')||'}'
   INTO out FROM jsonb_each(v);
 ELSIF jsonb_typeof(v)='array' THEN
  SELECT '['||coalesce(string_agg(sophia.saved_input_observation_canonical(value),',' ORDER BY ord),'')||']'
   INTO out FROM jsonb_array_elements(v) WITH ORDINALITY e(value,ord);
 ELSE out:=v::text;
 END IF;
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.saved_input_observation_canonical(jsonb) FROM PUBLIC;
CREATE FUNCTION sophia.saved_input_observation_object(v jsonb,keys text[]) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 RETURN v ?& keys AND v-keys='{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION sophia.saved_input_observation_object(jsonb,text[]) FROM PUBLIC;

-- Closed metadata only. Context identities and digests are checked against the locked source below.
CREATE FUNCTION sophia.saved_input_observation_shape(o jsonb,p_transient boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE target jsonb:=o#>'{proposal,target}'; ids jsonb:=o#>'{addressee,ids}'; u jsonb:=o->'uncertainty';
BEGIN
 IF NOT sophia.saved_input_observation_object(o,ARRAY['policy','contract','audience','provenance',
  'addressee','proposal','uncertainty','fenced','assessment','admission','effects']||
  CASE WHEN p_transient THEN ARRAY['observationId','inputSha256'] ELSE '{}'::text[] END) THEN RETURN false; END IF;
 IF (o->>'policy'='sophia.intake-observation.policy.v26' AND o->>'contract'='automatic_v1'
  AND (NOT p_transient OR (o->>'observationId' ~ '^[0-9a-f]{64}$' AND o->>'inputSha256' ~ '^[0-9a-f]{64}$'))
  AND sophia.saved_input_observation_object(o->'audience',ARRAY['scope','change','attention','exactness'])
  AND o#>>'{audience,scope}'='project' AND o#>>'{audience,change}'='unchanged'
  AND o#>>'{audience,exactness}'='scope_only' AND o#>>'{audience,attention}' IN ('none','audience_members')
  AND sophia.saved_input_observation_object(o->'provenance',ARRAY['origin','humanInstruction','correlation'])
  AND o#>'{provenance,humanInstruction}'='true'::jsonb AND o#>>'{provenance,origin}'='human'
  AND sophia.saved_input_observation_object(o->'addressee',ARRAY['ids','basis'])
  AND o#>>'{addressee,basis}' IN ('structured_mention','reply_target','direct_address','clear_request','unresolved')
  AND sophia.saved_input_observation_object(o->'proposal',ARRAY['kind','target','targetBasis','route','rule'])
  AND o#>>'{proposal,kind}' IN ('answer','explore','work_read','manager_inquiry','manager_followup','build_start',
   'control_hold','control_stop','control_resume','publish_existing','clarify','no_action','human_message','recorded_only','abstain')
  AND o#>>'{proposal,targetBasis}' IN ('reply_target','current_thread','text_objective','unresolved')
  AND o#>>'{proposal,route}' IN ('api','native','none')
  AND (o#>>'{proposal,rule}'='abstain' OR o#>>'{proposal,rule}' ~ '^[a-z_]+\.[a-z_.]{1,100}$')
  AND sophia.saved_input_observation_object(o->'fenced',ARRAY['quotedSpans','generatedOrigin'])
  AND o#>'{fenced,generatedOrigin}'='false'::jsonb AND o#>>'{fenced,quotedSpans}' ~ '^[0-9]{1,4}$'
  AND jsonb_typeof(o#>'{fenced,quotedSpans}')='number'
  AND o->>'assessment' IN ('not_needed','absent_abstained')
  AND sophia.saved_input_observation_object(o->'admission',ARRAY['outcome','reason','authority'])
  AND o#>>'{admission,authority}'='none' AND o#>>'{admission,outcome}' IN ('recorded_only','clarification_required','waiting','denied')
  AND o#>>'{admission,reason}' ~ '^[a-z_]{1,100}$'
  AND o->'effects'='{"providerInferences":0,"nativeInputs":0,"codingMissions":0,"humanNotifications":0,"nativeControls":0,"GitHubWrites":0,"deployments":0,"networkRequests":0}'::jsonb
 ) IS NOT TRUE THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(o) e WHERE e.key=ANY(ARRAY['policy','observationId','inputSha256','contract','assessment'])
  AND jsonb_typeof(e.value)<>'string')
 OR jsonb_typeof(o#>'{provenance,correlation}') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 IF jsonb_typeof(ids) IS DISTINCT FROM 'array' OR jsonb_typeof(u) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(ids)>6 OR jsonb_array_length(u)>32 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(ids) e WHERE jsonb_typeof(e)<>'string' OR
  (e#>>'{}'<>'sophia' AND e#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(u) e WHERE jsonb_typeof(e)<>'string' OR e#>>'{}' !~ '^[a-z_]{1,100}$')
 THEN RETURN false; END IF;
 RETURN (CASE target->>'kind'
  WHEN 'thread' THEN sophia.saved_input_observation_object(target,ARRAY['kind','scope']) AND target->>'scope'='project'
  WHEN 'message' THEN sophia.saved_input_observation_object(target,ARRAY['kind','id']) AND target->>'id' ~ '^[0-9a-f-]{36}$'
  WHEN 'unresolved' THEN sophia.saved_input_observation_object(target,ARRAY['kind'])
  WHEN 'text_objective' THEN sophia.saved_input_observation_object(target,ARRAY['kind'])
  WHEN 'native_history' THEN sophia.saved_input_observation_object(target,ARRAY['kind'])
  ELSE false END) IS TRUE;
END $$;
REVOKE ALL ON FUNCTION sophia.saved_input_observation_shape(jsonb,boolean) FROM PUBLIC;

CREATE TABLE sophia.saved_conversation_input_observations (
 project_id uuid NOT NULL,
 input_id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 context_manifest jsonb NOT NULL,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,input_id), UNIQUE(id),
 FOREIGN KEY(project_id,input_id) REFERENCES sophia.saved_conversation_inputs(project_id,id),
 FOREIGN KEY(project_id,conversation_id) REFERENCES sophia.conversations(project_id,id),
 CHECK(sophia.saved_input_observation_object(payload,ARRAY['source','observation'])),
 CHECK(sophia.saved_input_observation_shape(payload->'observation',false))
);
ALTER TABLE sophia.saved_conversation_input_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.saved_conversation_input_observations FROM PUBLIC;
GRANT SELECT ON sophia.saved_conversation_input_observations TO sophia_api;
CREATE POLICY observation_current_context ON sophia.saved_conversation_input_observations FOR SELECT TO sophia_api
 USING(EXISTS(SELECT 1 FROM sophia.read_saved_conversation_input_context(project_id,conversation_id,input_id)));
CREATE TRIGGER saved_input_observations_immutable BEFORE UPDATE OR DELETE ON sophia.saved_conversation_input_observations
 FOR EACH ROW EXECUTE FUNCTION sophia.conversation_input_addressing_immutable();

CREATE FUNCTION sophia.saved_input_observation_receipt(r sophia.saved_conversation_input_observations) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT jsonb_build_object('recordId',r.id,'schemaVersion',r.schema_version,'recordedAt',r.created_at,
  'context',r.context_manifest,'payload',r.payload,'state','observed','effect','none')
$$;
REVOKE ALL ON FUNCTION sophia.saved_input_observation_receipt(sophia.saved_conversation_input_observations) FROM PUBLIC;

-- SQL NULL probes are used only inside the trusted application's same write transaction. EXECUTE is API-role-wide;
-- it grants neither direct table writes nor a permit to dispatch. Both probe and insert recheck the same authority.
CREATE FUNCTION sophia.record_saved_conversation_input_observation(p_project uuid,p_conversation uuid,p_input uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE c sophia.conversations; ctx record; prior sophia.saved_conversation_input_observations;
 source jsonb; context jsonb; members uuid[]; expected_hash text; o jsonb; ids jsonb; audience_rev bigint;
BEGIN
 c:=sophia.conversation_locked(p_conversation);
 IF c.project_id IS DISTINCT FROM p_project THEN RAISE EXCEPTION 'Input unavailable' USING ERRCODE='22023'; END IF;
 PERFORM sophia.conversation_writer(p_project);
 SELECT audience_revision INTO audience_rev FROM sophia.projects WHERE id=p_project;
 SELECT * INTO ctx FROM sophia.read_saved_conversation_input_context(p_project,p_conversation,p_input);
 IF NOT FOUND THEN RAISE EXCEPTION 'Input unavailable' USING ERRCODE='22023'; END IF;
 IF ctx."actorId" IS DISTINCT FROM sophia.actor_id() THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM sophia.saved_conversation_input_observations WHERE project_id=p_project AND input_id=p_input;
 IF FOUND THEN RETURN sophia.saved_input_observation_receipt(prior); END IF;
 IF p_payload IS NULL THEN RETURN NULL; END IF;
 source:=(to_jsonb(ctx)-ARRAY['text','mentions','replyTarget'])||jsonb_build_object('origin','text');
 IF NOT sophia.saved_input_observation_object(p_payload,ARRAY['source','observation'])
  OR p_payload->'source' IS DISTINCT FROM source THEN
  RAISE EXCEPTION 'Invalid observation source' USING ERRCODE='22023'; END IF;
 o:=p_payload->'observation';
 IF NOT sophia.saved_input_observation_shape(o,true) THEN RAISE EXCEPTION 'Invalid observation metadata' USING ERRCODE='22023'; END IF;
 IF o#>>'{provenance,correlation}' IS DISTINCT FROM p_input::text THEN
  RAISE EXCEPTION 'Invalid observation provenance' USING ERRCODE='22023'; END IF;
 SELECT array_agg(id ORDER BY first) INTO members FROM (
  SELECT id,min(ord) AS first FROM unnest(ctx.mentions||CASE WHEN ctx."replyTarget"->>'actorId' IS NOT NULL
   THEN ARRAY[(ctx."replyTarget"->>'actorId')::uuid] ELSE '{}'::uuid[] END) WITH ORDINALITY e(id,ord) GROUP BY id) unique_members;
 context:=jsonb_build_object('audience','project','originalAudience','project','origin','human','operationId',p_input,
  'trustedMentions',to_jsonb(ctx.mentions),'currentMembers',to_jsonb(coalesce(members,'{}'::uuid[])));
 IF ctx."replyTarget" IS NOT NULL THEN
  context:=context||jsonb_build_object('replyTo',ctx."replyTarget"->>'messageId','replyAuthor',
   CASE WHEN ctx."replyTarget"->>'author'='sophia' THEN 'sophia' ELSE ctx."replyTarget"->>'actorId' END);
 END IF;
 expected_hash:=sophia.conversation_digest(sophia.saved_input_observation_canonical(jsonb_build_object(
  'interaction',jsonb_build_object('contract','automatic_v1'),'text',ctx.text,'context',context)));
 IF o->>'inputSha256' IS DISTINCT FROM expected_hash OR o->>'observationId' IS DISTINCT FROM
  sophia.conversation_digest(sophia.saved_input_observation_canonical(jsonb_build_object('policy',o->>'policy','input',expected_hash)))
 THEN RAISE EXCEPTION 'Observation digest mismatch' USING ERRCODE='22023'; END IF;
 ids:=o#>'{addressee,ids}';
 IF (cardinality(ctx.mentions)>0 AND (ids IS DISTINCT FROM to_jsonb(ctx.mentions) OR o#>>'{addressee,basis}'<>'structured_mention'))
  OR (cardinality(ctx.mentions)=0 AND ctx."replyTarget"->>'author'='member' AND
   (ids IS DISTINCT FROM jsonb_build_array(ctx."replyTarget"->>'actorId') OR o#>>'{addressee,basis}'<>'reply_target'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(ids) id WHERE id<>'sophia' AND NOT(id=ANY(coalesce(members,'{}'::uuid[])::text[])))
  OR (o#>>'{proposal,target,kind}'='message' AND o#>>'{proposal,target,id}' IS DISTINCT FROM ctx."replyTarget"->>'messageId')
 THEN RAISE EXCEPTION 'Observation address mismatch' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.saved_conversation_input_observations(project_id,input_id,conversation_id,context_manifest,payload)
 VALUES(p_project,p_input,p_conversation,
  jsonb_build_object('audienceKind','project_members','audienceRevision',audience_rev::text,
   'mentions',ctx.mentions,'replyTarget',ctx."replyTarget"),
  jsonb_set(p_payload,'{observation}',o-ARRAY['inputSha256','observationId'])) RETURNING * INTO prior;
 RETURN sophia.saved_input_observation_receipt(prior);
END $$;
REVOKE ALL ON FUNCTION sophia.record_saved_conversation_input_observation(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.record_saved_conversation_input_observation(uuid,uuid,uuid,jsonb) TO sophia_api;
COMMIT;
