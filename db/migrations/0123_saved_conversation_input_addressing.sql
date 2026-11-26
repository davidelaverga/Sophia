-- INC03-S01: exact trusted addressing references for a separate, versioned saved-input boundary.
-- A49/0095 stay closed and unchanged. These API-only writers keep the original record-only receipt, reuse 0095's
-- bookkeeping/erasure/key namespace, and add an immutable reference-only sidecar. Nothing is routed or notified.
-- Current writer/visibility precede replay. An identical recorded request returns its original receipt without
-- resolving its old targets again; fresh requests validate current members and a visible same-conversation target.
-- Any later assessment/admission must revalidate exact target, membership and audience before using this context.
BEGIN;

CREATE TABLE sophia.saved_conversation_input_addressing (
 project_id uuid NOT NULL,
 input_id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 addressing_version integer NOT NULL CHECK(addressing_version=1),
 structured_mentions uuid[] NOT NULL CHECK(cardinality(structured_mentions)<=5 AND array_position(structured_mentions,NULL) IS NULL),
 reply_target uuid,
 reply_target_seq bigint,
 reply_target_author text,
 reply_target_actor_id uuid,
 conversation_revision bigint NOT NULL CHECK(conversation_revision>0),
 erasure_revision bigint NOT NULL CHECK(erasure_revision>=0),
 PRIMARY KEY(project_id,input_id),
 FOREIGN KEY(project_id,input_id) REFERENCES sophia.saved_conversation_inputs(project_id,id),
 FOREIGN KEY(project_id,conversation_id) REFERENCES sophia.conversations(project_id,id),
 FOREIGN KEY(project_id,reply_target) REFERENCES sophia.conversation_messages(project_id,id),
 CHECK((reply_target IS NULL AND reply_target_seq IS NULL AND reply_target_author IS NULL AND reply_target_actor_id IS NULL)
  OR (reply_target IS NOT NULL AND reply_target_seq IS NOT NULL AND reply_target_seq>0 AND reply_target_author IS NOT NULL AND
   ((reply_target_author='member' AND reply_target_actor_id IS NOT NULL)
    OR (reply_target_author='sophia' AND reply_target_actor_id IS NULL))))
);
CREATE UNIQUE INDEX saved_conversation_input_addressing_by_input ON sophia.saved_conversation_input_addressing(input_id);
ALTER TABLE sophia.saved_conversation_input_addressing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sophia.saved_conversation_input_addressing FROM PUBLIC;
GRANT SELECT ON sophia.saved_conversation_input_addressing TO sophia_api;
CREATE POLICY saved_conversation_input_addressing_read ON sophia.saved_conversation_input_addressing FOR SELECT TO sophia_api
 USING(sophia.is_member(project_id) AND EXISTS(SELECT 1 FROM sophia.conversations c
  WHERE c.project_id=saved_conversation_input_addressing.project_id
   AND c.id=saved_conversation_input_addressing.conversation_id AND c.state='open'));

-- Historical references never become a fresh authority snapshot, including after target withdrawal or member loss.
CREATE FUNCTION sophia.conversation_input_addressing_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'Recorded input addressing is immutable' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_addressing_immutable() FROM PUBLIC;
CREATE TRIGGER saved_conversation_input_addressing_immutable BEFORE UPDATE OR DELETE
 ON sophia.saved_conversation_input_addressing FOR EACH ROW EXECUTE FUNCTION sophia.conversation_input_addressing_immutable();

-- Shape/canonicalization only. Membership is checked later, only for fresh writes under the project's lock.
CREATE FUNCTION sophia.conversation_input_addressing_mentions(p_mentions jsonb) RETURNS uuid[] LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,sophia,pg_temp AS $$
BEGIN
 IF p_mentions IS NULL OR jsonb_typeof(p_mentions)<>'array' THEN
  RAISE EXCEPTION 'Invalid mentions' USING ERRCODE='22023'; END IF;
 RETURN coalesce(sophia.mention_recipients(jsonb_build_object('mentions',p_mentions)),'{}'::uuid[]);
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_addressing_mentions(jsonb) FROM PUBLIC;

-- Called only after 0095 recorded this actor's input, in the same transaction under its project/conversation lock.
-- The target metadata was selected by the fresh writer; no body/name/digest or caller-provided author is retained.
CREATE FUNCTION sophia.conversation_input_addressing_record(p_project uuid, p_input uuid, p_mentions uuid[],
 p_target uuid, p_target_seq bigint, p_target_author text, p_target_actor uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE i sophia.saved_conversation_inputs;
BEGIN
 SELECT * INTO i FROM sophia.saved_conversation_inputs
  WHERE project_id=p_project AND id=p_input AND actor_id=sophia.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'Input context unavailable' USING ERRCODE='55000'; END IF;
 INSERT INTO sophia.saved_conversation_input_addressing(project_id,input_id,conversation_id,addressing_version,
  structured_mentions,reply_target,reply_target_seq,reply_target_author,reply_target_actor_id,conversation_revision,erasure_revision)
 VALUES(i.project_id,i.id,i.conversation_id,1,p_mentions,p_target,p_target_seq,p_target_author,p_target_actor,
  i.conversation_revision,i.erasure_revision);
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_addressing_record(uuid,uuid,uuid[],uuid,bigint,text,uuid) FROM PUBLIC;

-- A new conversation has no reply target; a reply to an existing thread uses the separate send below.
CREATE FUNCTION sophia.start_conversation_addressed_input(p_project uuid, p_key text, p_contract text, p_title text,
 p_text text, p_name text, p_mentions jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
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
 prior:=sophia.conversation_prior(p_project,p_key,'start',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 pol:=sophia.conversation_open(p_project);
 PERFORM sophia.mentions_allowed(p_project,'{}'::uuid[],recipients,true);
 INSERT INTO sophia.conversations(project_id,title,policy,created_by,created_at,last_at)
 VALUES(p_project,title,pol,a,clock_timestamp(),clock_timestamp()) RETURNING * INTO c;
 m:=sophia.conversation_append(p_project,c.id,'member',a,p_name,body,NULL);
 out:=sophia.conversation_input_record(p_project,p_key,'start',semantic,m,'conversation.started');
 PERFORM sophia.conversation_input_addressing_record(p_project,(out->>'inputId')::uuid,recipients,NULL,NULL,NULL,NULL);
 RETURN out;
END $$;

CREATE FUNCTION sophia.send_conversation_addressed_input(p_conversation uuid, p_key text, p_contract text, p_text text,
 p_name text, p_mentions jsonb, p_reply_target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
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
 prior:=sophia.conversation_prior(c.project_id,p_key,'send',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM sophia.conversation_open(c.project_id);
 IF c.state<>'open' THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 PERFORM sophia.mentions_allowed(c.project_id,'{}'::uuid[],recipients,true);
 IF p_reply_target IS NOT NULL THEN
  SELECT t.seq,t.author,t.actor_id INTO target_seq,target_author,target_actor FROM sophia.conversation_messages t
   WHERE t.project_id=c.project_id AND t.conversation_id=c.id AND t.id=p_reply_target AND t.withdrawn_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reply target not found' USING ERRCODE='22023'; END IF;
 END IF;
 m:=sophia.conversation_append(c.project_id,c.id,'member',a,p_name,body,NULL);
 out:=sophia.conversation_input_record(c.project_id,p_key,'send',semantic,m,'conversation.message_recorded');
 PERFORM sophia.conversation_input_addressing_record(c.project_id,(out->>'inputId')::uuid,recipients,
  p_reply_target,target_seq,target_author,target_actor);
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb),
 sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.start_conversation_addressed_input(uuid,text,text,text,text,text,jsonb),
 sophia.send_conversation_addressed_input(uuid,text,text,text,text,jsonb,uuid) TO sophia_api;

COMMIT;
