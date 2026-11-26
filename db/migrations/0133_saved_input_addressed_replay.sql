-- DEP-R07/R09: addressed receipt recovery without admitting another saved input.
-- Preserve 0128 semantics, locks, current authorization and prior/erasure checks; only fresh writes are fenced.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.start_conversation_addressed_input(p_project uuid, p_key text, p_contract text, p_title text,
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
 IF current_setting('sophia.addressed_input_replay',true)='on' THEN
  RAISE EXCEPTION 'Addressed input replay has no prior receipt' USING ERRCODE='55000';
 END IF;
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

CREATE OR REPLACE FUNCTION sophia.send_conversation_addressed_input(p_conversation uuid, p_key text, p_contract text, p_text text,
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
 IF current_setting('sophia.addressed_input_replay',true)='on' THEN
  RAISE EXCEPTION 'Addressed input replay has no prior receipt' USING ERRCODE='55000';
 END IF;
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


-- This sentinel is installed atomically with both guards. The API requires it before setting the local replay guard.
CREATE FUNCTION sophia.addressed_input_replay_installed() RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,sophia,pg_temp AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION sophia.addressed_input_replay_installed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.addressed_input_replay_installed() TO sophia_api;
COMMIT;
