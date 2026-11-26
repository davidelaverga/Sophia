-- INC03-S05: bind a saved input to one exact published project artifact version.
-- The identity is immutable, part of the original idempotency semantic, and carries no execution authority.
BEGIN;

ALTER TABLE sophia.saved_conversation_input_addressing ADD COLUMN artifact_version_id uuid;
ALTER TABLE sophia.saved_conversation_input_addressing ADD CONSTRAINT saved_input_artifact_version
 FOREIGN KEY(project_id,artifact_version_id) REFERENCES sophia.artifact_versions(project_id,id);

-- The same current check serves the UI, fresh writers and the reference's row policy. It returns no body or source URL.
CREATE FUNCTION sophia.conversation_artifact_version(p_project uuid,p_version uuid)
RETURNS TABLE("artifactId" uuid,"versionId" uuid,title text,"versionNumber" integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT a.id,v.id,a.title,v.version_number
 FROM sophia.artifact_versions v
 JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
 JOIN sophia.source_objects s ON s.project_id=v.project_id AND s.id=v.source_id
 WHERE v.project_id=p_project AND v.id=p_version AND sophia.is_member(p_project)
   AND v.state IN ('stable','superseded')
   AND s.scope='project' AND s.eligible AND s.state='ready' AND s.sha256=v.source_hash
$$;
REVOKE ALL ON FUNCTION sophia.conversation_artifact_version(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.conversation_artifact_version(uuid,uuid) TO sophia_api;

ALTER POLICY saved_conversation_input_addressing_read ON sophia.saved_conversation_input_addressing
 USING(sophia.is_member(project_id) AND EXISTS(SELECT 1 FROM sophia.conversations c
  WHERE c.project_id=saved_conversation_input_addressing.project_id
   AND c.id=saved_conversation_input_addressing.conversation_id AND c.state='open')
  AND (artifact_version_id IS NULL OR EXISTS(SELECT 1 FROM
   sophia.conversation_artifact_version(project_id,artifact_version_id))));

-- The writer holds the project lock. Hold the exact version and source through COMMIT, then verify eligibility.
CREATE FUNCTION sophia.require_conversation_artifact_version(p_project uuid,p_version uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 PERFORM 1 FROM sophia.artifact_versions v
 JOIN sophia.source_objects s ON s.project_id=v.project_id AND s.id=v.source_id
 WHERE v.project_id=p_project AND v.id=p_version FOR SHARE OF v,s;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sophia.conversation_artifact_version(p_project,p_version)) THEN
  RAISE EXCEPTION 'Artifact version not found' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.require_conversation_artifact_version(uuid,uuid) FROM PUBLIC;

-- Called only after 0095 recorded this actor's input, in the same transaction under its project/conversation lock.
-- The target metadata was selected by the fresh writer; no body/name/digest or caller-provided author is retained.
CREATE FUNCTION sophia.conversation_input_addressing_record(p_project uuid, p_input uuid, p_mentions uuid[],
 p_target uuid, p_target_seq bigint, p_target_author text, p_target_actor uuid, p_artifact_version uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE i sophia.saved_conversation_inputs;
BEGIN
 SELECT * INTO i FROM sophia.saved_conversation_inputs
  WHERE project_id=p_project AND id=p_input AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Input context unavailable' USING ERRCODE='55000'; END IF;
 INSERT INTO sophia.saved_conversation_input_addressing(project_id,input_id,conversation_id,addressing_version,
  structured_mentions,reply_target,reply_target_seq,reply_target_author,reply_target_actor_id,conversation_revision,erasure_revision,artifact_version_id)
 VALUES(i.project_id,i.id,i.conversation_id,1,p_mentions,p_target,p_target_seq,p_target_author,p_target_actor,
  i.conversation_revision,i.erasure_revision,p_artifact_version);
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_addressing_record(uuid,uuid,uuid[],uuid,bigint,text,uuid,uuid) FROM PUBLIC;

-- A new conversation has no reply target; a reply to an existing thread uses the separate send below.
CREATE FUNCTION sophia.start_conversation_addressed_input(p_project uuid, p_key text, p_contract text, p_title text,
 p_text text, p_name text, p_mentions jsonb, p_artifact_version uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.actor_id(); pol text; title text; body text; semantic jsonb; prior jsonb; recipients uuid[];
 c sophia.conversations; m sophia.conversation_messages; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 PERFORM sophia.conversation_writer(p_project);
 PERFORM sophia.conversation_input_contract(p_contract);
 title:=sophia.conversation_text(p_title,120);
 body:=sophia.conversation_text(p_text,4000);
 recipients:=sophia.conversation_input_addressing_mentions(p_mentions);
 semantic:=jsonb_build_object('operation','start','interactionContract','automatic_v1','contractVersion',1,
  'titleSha256',sophia.conversation_digest(title),'textSha256',sophia.conversation_digest(body),
  'addressingVersion',1,'mentions',to_jsonb(recipients),'replyToMessageId',NULL);
 IF p_artifact_version IS NOT NULL THEN
  semantic:=semantic||jsonb_build_object('artifactVersionId',p_artifact_version);
 END IF;
 prior:=sophia.conversation_prior(p_project,p_key,'start',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 pol:=sophia.conversation_open(p_project);
 IF p_artifact_version IS NOT NULL THEN
  PERFORM sophia.require_conversation_artifact_version(p_project,p_artifact_version);
 END IF;
 PERFORM sophia.mentions_allowed(p_project,'{}'::uuid[],recipients,true);
 INSERT INTO sophia.conversations(project_id,title,policy,created_by,created_at,last_at)
 VALUES(p_project,title,pol,a,clock_timestamp(),clock_timestamp()) RETURNING * INTO c;
 m:=sophia.conversation_append(p_project,c.id,'member',a,p_name,body,NULL);
 out:=sophia.conversation_input_record(p_project,p_key,'start',semantic,m,'conversation.started');
 PERFORM sophia.conversation_input_addressing_record(p_project,(out->>'inputId')::uuid,recipients,NULL,NULL,NULL,NULL,p_artifact_version);
 RETURN out;
END $$;

CREATE FUNCTION sophia.send_conversation_addressed_input(p_conversation uuid, p_key text, p_contract text, p_text text,
 p_name text, p_mentions jsonb, p_reply_target uuid, p_artifact_version uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.conversations; body text; semantic jsonb; prior jsonb; recipients uuid[];
 target_seq bigint; target_author text; target_actor uuid; m sophia.conversation_messages; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 c:=sophia.conversation_locked(p_conversation);
 PERFORM sophia.conversation_writer(c.project_id);
 PERFORM sophia.conversation_input_contract(p_contract);
 body:=sophia.conversation_text(p_text,4000);
 recipients:=sophia.conversation_input_addressing_mentions(p_mentions);
 semantic:=jsonb_build_object('operation','send','conversationId',c.id,'interactionContract','automatic_v1','contractVersion',1,
  'textSha256',sophia.conversation_digest(body),'addressingVersion',1,'mentions',to_jsonb(recipients),
  'replyToMessageId',p_reply_target);
 IF p_artifact_version IS NOT NULL THEN
  semantic:=semantic||jsonb_build_object('artifactVersionId',p_artifact_version);
 END IF;
 prior:=sophia.conversation_prior(c.project_id,p_key,'send',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM sophia.conversation_open(c.project_id);
 IF c.state<>'open' THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 IF p_artifact_version IS NOT NULL THEN
  PERFORM sophia.require_conversation_artifact_version(c.project_id,p_artifact_version);
 END IF;
 PERFORM sophia.mentions_allowed(c.project_id,'{}'::uuid[],recipients,true);
 IF p_reply_target IS NOT NULL THEN
  SELECT t.seq,t.author,t.actor_id INTO target_seq,target_author,target_actor FROM sophia.conversation_messages t
   WHERE t.project_id=c.project_id AND t.conversation_id=c.id AND t.id=p_reply_target AND t.withdrawn_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reply target not found' USING ERRCODE='22023'; END IF;
 END IF;
 m:=sophia.conversation_append(c.project_id,c.id,'member',a,p_name,body,NULL);
 out:=sophia.conversation_input_record(c.project_id,p_key,'send',semantic,m,'conversation.message_recorded');
 PERFORM sophia.conversation_input_addressing_record(c.project_id,(out->>'inputId')::uuid,recipients,
  p_reply_target,target_seq,target_author,target_actor,p_artifact_version);
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb,uuid),
 sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb,uuid),
 sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid,uuid) TO sophia_api;

CREATE OR REPLACE FUNCTION sophia.start_conversation_addressed_input(p_project uuid,p_key text,p_contract text,p_title text,
 p_text text,p_name text,p_mentions jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT sophia.start_conversation_addressed_input(p_project,p_key,p_contract,p_title,p_text,p_name,p_mentions,NULL::uuid)
$$;

CREATE OR REPLACE FUNCTION sophia.send_conversation_addressed_input(p_conversation uuid,p_key text,p_contract text,p_text text,
 p_name text,p_mentions jsonb,p_reply_target uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,sophia,pg_temp AS $$
 SELECT sophia.send_conversation_addressed_input(p_conversation,p_key,p_contract,p_text,p_name,p_mentions,p_reply_target,NULL::uuid)
$$;

-- v1 observation and assessment have no artifact context in their envelopes. They cannot select an attached input.
CREATE OR REPLACE FUNCTION sophia.read_saved_conversation_input_context(uuid,uuid,uuid)
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
    WHERE i.project_id=$1 AND i.conversation_id=$2 AND i.id=$3 AND a.artifact_version_id IS NULL
      AND sophia.actor_id() IS NOT NULL AND sophia.is_member(i.project_id)
      AND NOT EXISTS(SELECT 1 FROM unnest(a.structured_mentions) recipient
        WHERE NOT EXISTS(SELECT 1 FROM sophia.project_members pm
          WHERE pm.project_id=i.project_id AND pm.actor_id=recipient AND pm.active))
      AND (a.reply_target IS NULL OR (t.id IS NOT NULL AND (t.author='sophia' OR EXISTS(
        SELECT 1 FROM sophia.project_members pm WHERE pm.project_id=i.project_id AND pm.actor_id=t.actor_id AND pm.active))));
$$;
COMMIT;
