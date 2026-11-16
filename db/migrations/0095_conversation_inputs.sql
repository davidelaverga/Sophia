-- INC03-CC-002 S01a (0095, root-leased): a member's message in a saved project conversation retained as a versioned
-- automatic_v1 input, with no effect. Plan: docs/plans/conversation-inputs.md. Pack v2 INC03-R01/R02/R04/R12,
-- C03-R01/R02, C01-R15 (docs commit c43701ab). This is a record, not routing: nothing assesses, addresses, notifies,
-- answers, funds or dispatches an input.
-- * Two new writers, sophia.start_conversation_input and sophia.send_conversation_input, EXECUTE to sophia_api only.
--   Each takes the interaction contract as a required argument and accepts exactly 'automatic_v1' (NULL or anything
--   else: 22023). No boolean, no default: a missing contract is never automatic, and the legacy writers never create
--   an input.
-- * Authority is the server's and current: the actor is sophia.actor_id(); the project row is locked first (send: the
--   project row, then the conversation row, as conversation_locked does, the legacy order); the caller must be an
--   admin or editor now (conversation_writer) before any earlier request under the key is read; a removed or demoted
--   writer's retry is refused.
-- * Idempotency is the legacy table and operations (conversation_requests, 'start'/'send') with a distinct semantic:
--   the contract, its version and the digests of what was asked, never server-resolved context. Same key and semantic:
--   the original receipt (also after later messages, also once read-only); changed words, legacy vs automatic, start vs
--   send: 23505; a key whose text was withdrawn or erased: 40001. The request row names the message, so the existing
--   withdrawal path redacts it.
-- * One write, in one transaction: the message (conversation_append), its request, its input and the existing
--   conversation event. No reply, work attempt, binding, command, outbox, reservation, allowance, grant, inference or
--   notification.
-- * The input row holds ids, the contract, the server-resolved audience (project members, the settings revision) and
--   context references (seq and revisions after the append, the writer's role) — no text, title, digest, summary or
--   history; the text lives once, in the message. Addressing is explicitly absent: no trusted mentions or reply target
--   were supplied in this slice, and '@text' is never read.
-- * Reads: RLS for sophia_api, current members of the project while the conversation is open; no write grant to any
--   login; nothing to sophia_worker or the assembler role.
-- No existing function is replaced: start_conversation, send_conversation_message, conversation_ask,
-- conversation_ask_capability, conversation_prior and conversation_redact keep their definitions, grants and settings.
BEGIN;

CREATE TABLE sophia.saved_conversation_inputs (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL,
 message_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 idempotency_key text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('start','send')),
 interaction_contract text NOT NULL CHECK(interaction_contract='automatic_v1'),
 contract_version integer NOT NULL CHECK(contract_version=1),
 origin text NOT NULL CHECK(origin='text'),
 audience_kind text NOT NULL CHECK(audience_kind='project_members'),
 settings_policy text NOT NULL,
 settings_revision integer NOT NULL CHECK(settings_revision>0),
 message_seq bigint NOT NULL CHECK(message_seq>0),
 conversation_revision bigint NOT NULL CHECK(conversation_revision>0),
 erasure_revision bigint NOT NULL CHECK(erasure_revision>=0),
 writer_role text NOT NULL CHECK(writer_role IN ('admin','editor')),
 structured_mentions uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(structured_mentions)=0),
 reply_target uuid CHECK(reply_target IS NULL),
 addressing_basis text NOT NULL DEFAULT 'none' CHECK(addressing_basis='none'),
 state text NOT NULL DEFAULT 'recorded' CHECK(state='recorded'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,id),
 UNIQUE(project_id,message_id),
 UNIQUE(project_id,actor_id,idempotency_key),
 FOREIGN KEY(project_id,conversation_id) REFERENCES sophia.conversations(project_id,id),
 FOREIGN KEY(project_id,message_id) REFERENCES sophia.conversation_messages(project_id,id),
 FOREIGN KEY(project_id,actor_id,idempotency_key)
  REFERENCES sophia.conversation_requests(project_id,actor_id,idempotency_key)
);
CREATE UNIQUE INDEX saved_conversation_inputs_by_id ON sophia.saved_conversation_inputs(id);
CREATE INDEX saved_conversation_inputs_by_conversation ON sophia.saved_conversation_inputs(project_id,conversation_id,message_seq);

ALTER TABLE sophia.saved_conversation_inputs ENABLE ROW LEVEL SECURITY;
-- As messages: current members, while the conversation is open; an erased conversation's inputs leave every read.
CREATE POLICY members_read ON sophia.saved_conversation_inputs FOR SELECT TO sophia_api
 USING(sophia.is_member(project_id) AND EXISTS(SELECT 1 FROM sophia.conversations c
  WHERE c.project_id=saved_conversation_inputs.project_id AND c.id=saved_conversation_inputs.conversation_id AND c.state='open'));
REVOKE ALL ON sophia.saved_conversation_inputs FROM PUBLIC;
GRANT SELECT ON sophia.saved_conversation_inputs TO sophia_api;

-- The one contract value this boundary accepts; anything else is refused before anything is read or written.
CREATE FUNCTION sophia.conversation_input_contract(p_contract text) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_contract IS DISTINCT FROM 'automatic_v1' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_contract(text) FROM PUBLIC;

-- What a recorded input answers: ids, the contract, and that nothing follows from it.
CREATE FUNCTION sophia.conversation_input_receipt(p_conversation uuid, p_message uuid, p_input uuid) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT pg_catalog.jsonb_build_object('conversationId',p_conversation,'messageId',p_message,'inputId',p_input,
  'interactionContract','automatic_v1','contractVersion',1,'input','recorded','effect','none') $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_receipt(uuid,uuid,uuid) FROM PUBLIC;

-- The request, the input and the event for a message just appended. The caller holds the project's row (and, for a
-- send, the conversation's), has checked the writer and the contract, and found no earlier request under the key.
CREATE FUNCTION sophia.conversation_input_record(p_project uuid, p_key text, p_operation text, p_semantic jsonb,
 m sophia.conversation_messages, p_summary text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE input_id uuid:=pg_catalog.gen_random_uuid(); c sophia.conversations; s sophia.conversation_settings;
 role_now text; out jsonb;
BEGIN
 SELECT * INTO c FROM sophia.conversations WHERE project_id=p_project AND id=m.conversation_id;
 SELECT * INTO s FROM sophia.conversation_settings WHERE project_id=p_project;
 SELECT pm.role INTO role_now FROM sophia.project_members pm
  WHERE pm.project_id=p_project AND pm.actor_id=m.actor_id AND pm.active;
 out:=sophia.conversation_input_receipt(c.id,m.id,input_id);
 INSERT INTO sophia.conversation_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt,message_id)
 VALUES(p_project,m.actor_id,p_key,p_operation,p_semantic,out,m.id);
 INSERT INTO sophia.saved_conversation_inputs(project_id,id,conversation_id,message_id,actor_id,idempotency_key,operation,
  interaction_contract,contract_version,origin,audience_kind,settings_policy,settings_revision,message_seq,
  conversation_revision,erasure_revision,writer_role)
 VALUES(p_project,input_id,c.id,m.id,m.actor_id,p_key,p_operation,'automatic_v1',1,'text','project_members',s.policy,
  s.revision,m.seq,c.revision,c.erasure_revision,role_now);
 PERFORM sophia.conversation_moved(p_project,c.id,p_summary,false);
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_input_record(uuid,text,text,jsonb,sophia.conversation_messages,text) FROM PUBLIC;

-- Start a conversation with its first message, as an automatic_v1 input. p_name is the verified token's name.
CREATE FUNCTION sophia.start_conversation_input(p_project uuid, p_key text, p_contract text, p_title text, p_text text,
 p_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.actor_id(); pol text; title text; body text; semantic jsonb; prior jsonb;
 c sophia.conversations; m sophia.conversation_messages;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 PERFORM sophia.conversation_writer(p_project);
 PERFORM sophia.conversation_input_contract(p_contract);
 title:=sophia.conversation_text(p_title,120);
 body:=sophia.conversation_text(p_text,4000);
 semantic:=pg_catalog.jsonb_build_object('operation','start','interactionContract','automatic_v1','contractVersion',1,
  'titleSha256',sophia.conversation_digest(title),'textSha256',sophia.conversation_digest(body));
 prior:=sophia.conversation_prior(p_project,p_key,'start',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 pol:=sophia.conversation_open(p_project);
 INSERT INTO sophia.conversations(project_id,title,policy,created_by,created_at,last_at)
 VALUES(p_project,title,pol,a,pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()) RETURNING * INTO c;
 m:=sophia.conversation_append(p_project,c.id,'member',a,p_name,body,NULL);
 RETURN sophia.conversation_input_record(p_project,p_key,'start',semantic,m,'conversation.started');
END $$;

-- A message in a conversation, as an automatic_v1 input.
CREATE FUNCTION sophia.send_conversation_input(p_conversation uuid, p_key text, p_contract text, p_text text,
 p_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia,pg_temp AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.conversations; body text; semantic jsonb; prior jsonb;
 m sophia.conversation_messages;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 c:=sophia.conversation_locked(p_conversation);
 PERFORM sophia.conversation_writer(c.project_id);
 PERFORM sophia.conversation_input_contract(p_contract);
 body:=sophia.conversation_text(p_text,4000);
 semantic:=pg_catalog.jsonb_build_object('operation','send','conversationId',c.id,'interactionContract','automatic_v1',
  'contractVersion',1,'textSha256',sophia.conversation_digest(body));
 prior:=sophia.conversation_prior(c.project_id,p_key,'send',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM sophia.conversation_open(c.project_id);
 IF c.state<>'open' THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 m:=sophia.conversation_append(c.project_id,c.id,'member',a,p_name,body,NULL);
 RETURN sophia.conversation_input_record(c.project_id,p_key,'send',semantic,m,'conversation.message_recorded');
END $$;

REVOKE ALL ON FUNCTION sophia.start_conversation_input(uuid,text,text,text,text,text),
 sophia.send_conversation_input(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.start_conversation_input(uuid,text,text,text,text,text),
 sophia.send_conversation_input(uuid,text,text,text,text) TO sophia_api;

COMMIT;
