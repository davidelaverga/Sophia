-- CON-01 G1 (amendment A16; docs/coordination/CON-01/BINDING_MAP.md §4-§6): saved project conversations, the members'
-- text. Named conversations in a project, each with its own ordered messages, written by the project's writers and read
-- by its members, under a per-project setting that names the saved-text policy it was turned on under.
-- * conversation_settings: no row, no new conversation or message (the cohort switch). 'read_only' keeps reads,
--   withdrawal and erasure and refuses new text (the rollback switch). Set only by set_conversation_settings, which no
--   login may call: an operator runs it under a recorded approval.
-- * A conversation and its first message are one write (start_conversation): both, its reply request when Sophia is
--   asked, its idempotency record and its event, or none of them.
-- * Order is the conversation's own: seq is taken under the conversation's row, never from a clock.
-- * Writers are admins and editors (can_edit); every member reads; nobody else does. Each writer checks the caller's
--   current role under the project's row lock before it looks for an earlier request under the key, so a key never
--   replays past a membership that is gone.
-- * Idempotency per (project, actor, key), with the operation and a digest of what was asked (never its text). A key
--   reused for something else is refused; a key whose text was since withdrawn is refused as erased, never re-run.
-- * Asking Sophia records a reply request with the message. No runtime path answers it yet (G2), so it is recorded as
--   blocked, said as such; a message that does not ask records none. Neither writes a goal, attempt, command, job,
--   outbox row or allowance.
-- * Withdrawal (an author, their own message; an admin, any) removes the text and its author's name, removes Sophia's
--   replies whose context reached it, cancels open replies that would read it and redacts the requests that wrote
--   those texts. Erasure (admins) does that to a whole conversation, its title included. Ids and order stay, so
--   replays and late answers are refused rather than written again.
-- * Every table: RLS for members (sophia_api reads); no write grant; the functions below are the only writers.
-- 0001-0045 are not edited. 0046-0047 (PR #190) are neither required nor touched.
BEGIN;

CREATE TABLE sophia.conversation_settings (
 project_id uuid PRIMARY KEY REFERENCES sophia.projects(id),
 policy text NOT NULL CHECK(policy='conversation-text-v1'),
 state text NOT NULL CHECK(state IN ('enabled','read_only')),
 approval_ref text NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 300),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- A conversation: its title (gone once erased), its order (message_seq: the last seq taken), a revision that moves with
-- every write in it, and an erasure revision that moves with every withdrawal or erasure (what a reply read is checked
-- against before it is published, G2).
CREATE TABLE sophia.conversations (
 project_id uuid NOT NULL REFERENCES sophia.projects(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 title text CHECK(title IS NULL OR length(title) BETWEEN 1 AND 120),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','erased')),
 policy text NOT NULL,
 created_by uuid NOT NULL,
 message_seq bigint NOT NULL DEFAULT 0 CHECK(message_seq>=0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 erasure_revision bigint NOT NULL DEFAULT 0 CHECK(erasure_revision>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id),
 CHECK((state='erased')=(title IS NULL))
);
-- Routes name a conversation by its id alone; its project is read from it.
CREATE UNIQUE INDEX conversations_by_id ON sophia.conversations(id);
CREATE INDEX conversations_by_activity ON sophia.conversations(project_id,last_at DESC,id DESC) WHERE state='open';

-- A message: a member's (actor_id, and the name their verified token carried) or Sophia's (reply_id: the request it
-- answers). Withdrawn, it keeps its id, seq, author kind, actor and time, and nothing of its text or name.
CREATE TABLE sophia.conversation_messages (
 project_id uuid NOT NULL, conversation_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 seq bigint NOT NULL CHECK(seq>0),
 author text NOT NULL CHECK(author IN ('member','sophia')),
 actor_id uuid,
 author_name text CHECK(author_name IS NULL OR length(author_name) BETWEEN 1 AND 320),
 body text,
 reply_id uuid,
 withdrawn_at timestamptz,
 withdrawn_by text CHECK(withdrawn_by IN ('author','admin','source')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(conversation_id,seq),
 FOREIGN KEY(project_id,conversation_id) REFERENCES sophia.conversations(project_id,id),
 CHECK((author='member')=(actor_id IS NOT NULL)),
 CHECK(author='sophia' OR reply_id IS NULL),
 CHECK(body IS NULL OR length(body) BETWEEN 1 AND CASE WHEN author='member' THEN 4000 ELSE 16000 END),
 CHECK((body IS NULL)=(withdrawn_at IS NOT NULL)),
 CHECK((withdrawn_at IS NULL)=(withdrawn_by IS NULL)),
 CHECK(withdrawn_at IS NULL OR author_name IS NULL)
);
CREATE UNIQUE INDEX conversation_messages_by_id ON sophia.conversation_messages(id);

-- A reply request: the message that asked Sophia, who asked, the history it may read (up to cutoff_seq), its state and,
-- answered, the message that answers it. G1 records it as blocked: nothing answers yet.
CREATE TABLE sophia.conversation_replies (
 project_id uuid NOT NULL, conversation_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 message_id uuid NOT NULL,
 asked_by uuid NOT NULL,
 cutoff_seq bigint NOT NULL CHECK(cutoff_seq>0),
 state text NOT NULL CHECK(state IN ('pending','running','answered','failed','cancelled','blocked','outcome_unknown')),
 reason text CHECK(reason IS NULL OR reason ~ '^[a-z][a-z_]{0,62}$'),
 answer_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 PRIMARY KEY(project_id,id), UNIQUE(project_id,message_id),
 FOREIGN KEY(project_id,conversation_id) REFERENCES sophia.conversations(project_id,id),
 FOREIGN KEY(project_id,message_id) REFERENCES sophia.conversation_messages(project_id,id),
 FOREIGN KEY(project_id,answer_id) REFERENCES sophia.conversation_messages(project_id,id),
 CHECK((state='answered')=(answer_id IS NOT NULL)),
 CHECK((state IN ('answered','failed','cancelled','blocked'))=(settled_at IS NOT NULL))
);
CREATE UNIQUE INDEX conversation_replies_by_id ON sophia.conversation_replies(id);
CREATE INDEX conversation_replies_open ON sophia.conversation_replies(project_id,conversation_id,cutoff_seq)
 WHERE state IN ('pending','running','outcome_unknown');
ALTER TABLE sophia.conversation_messages ADD FOREIGN KEY(project_id,reply_id) REFERENCES sophia.conversation_replies(project_id,id);

-- Each keyed write: who, under which key, what (operation and digests, never text), its receipt (ids), and the message
-- it wrote (so withdrawing that message redacts it).
CREATE TABLE sophia.conversation_requests (
 project_id uuid NOT NULL REFERENCES sophia.projects(id), actor_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 160),
 operation text NOT NULL CHECK(operation IN ('start','send','withdraw','erase')),
 semantic_request jsonb NOT NULL CHECK(jsonb_typeof(semantic_request)='object'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 message_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id,idempotency_key)
);
CREATE INDEX conversation_requests_by_message ON sophia.conversation_requests(project_id,message_id) WHERE message_id IS NOT NULL;

ALTER TABLE sophia.conversation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.conversation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.conversation_settings FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
-- An erased conversation is gone from every read; its messages and replies with it.
CREATE POLICY members_read ON sophia.conversations FOR SELECT TO sophia_api
 USING(sophia.is_member(project_id) AND state='open');
CREATE POLICY members_read ON sophia.conversation_messages FOR SELECT TO sophia_api
 USING(sophia.is_member(project_id) AND EXISTS(SELECT 1 FROM sophia.conversations c
  WHERE c.project_id=conversation_messages.project_id AND c.id=conversation_messages.conversation_id AND c.state='open'));
CREATE POLICY members_read ON sophia.conversation_replies FOR SELECT TO sophia_api
 USING(sophia.is_member(project_id) AND EXISTS(SELECT 1 FROM sophia.conversations c
  WHERE c.project_id=conversation_replies.project_id AND c.id=conversation_replies.conversation_id AND c.state='open'));
GRANT SELECT ON sophia.conversation_settings, sophia.conversations, sophia.conversation_messages,
 sophia.conversation_replies TO sophia_api;
-- conversation_requests: no grant at all. Only the writers below read it.

-- ---------------------------------------------------------------------------------------------------------------------
-- Internal helpers (no grant).

-- The conversation a request names, with the caller a member of its project; otherwise "not found", whether it does
-- not exist or the caller may not see it (the two answer alike). Locks its project's row first, then its own.
-- Membership is read again once the project's row is held (CON-01-CX-0006): a revocation that committed while this
-- call waited for the row is seen, so a member removed meanwhile neither writes nor withdraws. The first read only
-- keeps a caller who is no member from holding a project's row at all.
CREATE FUNCTION sophia.conversation_locked(p_conversation uuid) RETURNS sophia.conversations LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.conversations; p uuid;
BEGIN
 SELECT project_id INTO p FROM sophia.conversations WHERE id=p_conversation;
 IF p IS NULL OR NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p FOR UPDATE;
 IF NOT sophia.is_member(p) THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM sophia.conversations WHERE project_id=p AND id=p_conversation FOR UPDATE;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_locked(uuid) FROM PUBLIC;

-- The caller writes in the project: an admin or an editor, now. Checked before any earlier request under a key is read.
CREATE FUNCTION sophia.conversation_writer(p_project uuid) RETURNS void LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_writer(uuid) FROM PUBLIC;

-- New text may be written: the project's conversations are on. Checked after a replay had its chance, so a request
-- already written still answers with its receipt when the project has since been made read-only.
CREATE FUNCTION sophia.conversation_open(p_project uuid) RETURNS text LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.conversation_settings;
BEGIN
 SELECT * INTO s FROM sophia.conversation_settings WHERE project_id=p_project;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversations are not turned on for this project' USING ERRCODE='55000'; END IF;
 IF s.state<>'enabled' THEN RAISE EXCEPTION 'Conversations are read-only in this project now' USING ERRCODE='55000'; END IF;
 RETURN s.policy;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_open(uuid) FROM PUBLIC;

-- Submitted text, trimmed: refused when empty or longer than p_max characters.
CREATE FUNCTION sophia.conversation_text(p_value text, p_max integer) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE t text:=btrim(coalesce(p_value,''),E' \t\n\r');
BEGIN
 IF length(t) NOT BETWEEN 1 AND p_max THEN RAISE EXCEPTION 'Invalid text' USING ERRCODE='22023'; END IF;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_text(text,integer) FROM PUBLIC;

CREATE FUNCTION sophia.conversation_digest(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex') $$;
REVOKE ALL ON FUNCTION sophia.conversation_digest(text) FROM PUBLIC;

-- The receipt of an earlier identical request under this key, or NULL. Called after the caller's authority was
-- checked. Another request under the key is refused; one whose text was withdrawn since is refused as erased.
CREATE FUNCTION sophia.conversation_prior(p_project uuid, p_key text, p_operation text, p_semantic jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE prior sophia.conversation_requests;
BEGIN
 IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM sophia.conversation_requests WHERE project_id=p_project AND actor_id=sophia.actor_id() AND idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.operation<>p_operation THEN RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 IF prior.semantic_request ? 'redacted' THEN
  RAISE EXCEPTION 'Stale request: what it wrote has since been erased' USING ERRCODE='40001'; END IF;
 IF prior.semantic_request<>p_semantic THEN
  RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
 RETURN prior.receipt;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_prior(uuid,text,text,jsonb) FROM PUBLIC;

-- The next message of a conversation, in its order. The caller holds the project's and the conversation's rows.
CREATE FUNCTION sophia.conversation_append(p_project uuid, p_conversation uuid, p_author text, p_actor uuid, p_name text,
 p_body text, p_reply uuid) RETURNS sophia.conversation_messages LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
DECLARE c sophia.conversations; m sophia.conversation_messages;
BEGIN
 UPDATE sophia.conversations SET message_seq=message_seq+1, revision=revision+1, last_at=clock_timestamp()
  WHERE project_id=p_project AND id=p_conversation AND state='open' RETURNING * INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.conversation_messages(project_id,conversation_id,seq,author,actor_id,author_name,body,reply_id,created_at)
 VALUES(p_project,p_conversation,c.message_seq,p_author,p_actor,
  left(nullif(btrim(coalesce(p_name,'')),''),320),p_body,p_reply,c.last_at) RETURNING * INTO m;
 RETURN m;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_append(uuid,uuid,text,uuid,text,text,uuid) FROM PUBLIC;

-- Sophia asked about a message: its reply request. Until a runtime path answers conversations (CON-01 G2 replaces this
-- function), the request is recorded as blocked and says why; nothing else is written.
CREATE FUNCTION sophia.conversation_ask(p_project uuid, p_conversation uuid, m sophia.conversation_messages)
RETURNS sophia.conversation_replies LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.conversation_replies;
BEGIN
 INSERT INTO sophia.conversation_replies(project_id,conversation_id,message_id,asked_by,cutoff_seq,state,reason,settled_at)
 VALUES(p_project,p_conversation,m.id,m.actor_id,m.seq,'blocked','replies_not_enabled',clock_timestamp()) RETURNING * INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_ask(uuid,uuid,sophia.conversation_messages) FROM PUBLIC;

-- What a withdrawal reaches past the message itself, from seq on: Sophia's replies whose context reached it are
-- removed, and open requests that would read it are cancelled. CON-01 G2 replaces this function to fence the native
-- work as well; G3 to drop the projections that cover it.
CREATE FUNCTION sophia.conversation_withdrawn_from(p_project uuid, p_conversation uuid, p_seq bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.conversation_messages m SET body=NULL, author_name=NULL, withdrawn_at=clock_timestamp(), withdrawn_by='source'
  FROM sophia.conversation_replies r
  WHERE m.project_id=p_project AND m.conversation_id=p_conversation AND m.author='sophia' AND m.withdrawn_at IS NULL
   AND r.project_id=m.project_id AND r.id=m.reply_id AND r.cutoff_seq>=p_seq;
 UPDATE sophia.conversation_replies SET state='cancelled', reason=p_reason, settled_at=clock_timestamp()
  WHERE project_id=p_project AND conversation_id=p_conversation AND cutoff_seq>=p_seq
   AND state IN ('pending','running','outcome_unknown');
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_withdrawn_from(uuid,uuid,bigint,text) FROM PUBLIC;

-- The requests whose writes put the now-withdrawn texts here forget what they asked: a retry under their keys is refused.
CREATE FUNCTION sophia.conversation_redact(p_project uuid, p_conversation uuid) RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 UPDATE sophia.conversation_requests q SET semantic_request='{"redacted":true}'::jsonb
  FROM sophia.conversation_messages m
  WHERE q.project_id=p_project AND q.message_id=m.id AND m.project_id=p_project AND m.conversation_id=p_conversation
   AND m.withdrawn_at IS NOT NULL AND NOT (q.semantic_request ? 'redacted');
$$;
REVOKE ALL ON FUNCTION sophia.conversation_redact(uuid,uuid) FROM PUBLIC;

-- The conversation moved: its revision (and its erasure revision when text was removed), and the project's feed.
CREATE FUNCTION sophia.conversation_moved(p_project uuid, p_conversation uuid, p_summary text, p_erased boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rev bigint;
BEGIN
 UPDATE sophia.conversations SET revision=revision+1,
  erasure_revision=erasure_revision+CASE WHEN p_erased THEN 1 ELSE 0 END
  WHERE project_id=p_project AND id=p_conversation RETURNING revision INTO rev;
 RETURN sophia.emit_project_event(p_project,'conversation.updated','conversation',p_conversation,rev,p_summary);
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_moved(uuid,uuid,text,boolean) FROM PUBLIC;

CREATE FUNCTION sophia.conversation_receipt(p_conversation uuid, m sophia.conversation_messages, r sophia.conversation_replies)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('conversationId',p_conversation,'messageId',m.id,
  'sophia',CASE WHEN r.id IS NULL THEN 'not_asked' ELSE 'asked' END,'replyId',to_jsonb(r.id)) $$;
REVOKE ALL ON FUNCTION sophia.conversation_receipt(uuid,sophia.conversation_messages,sophia.conversation_replies) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------------------------
-- Writers (sophia_api). Each answers with a receipt of ids; the API reads the records back under the caller.

-- Start a conversation with its first message, Sophia asked or not. p_name is the verified token's name, never the
-- client's, and is not part of the request: the same person renamed is the same request.
CREATE FUNCTION sophia.start_conversation(p_project uuid, p_key text, p_title text, p_text text, p_ask boolean, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); pol text; title text; body text; semantic jsonb; prior jsonb;
 c sophia.conversations; m sophia.conversation_messages; r sophia.conversation_replies; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 PERFORM sophia.conversation_writer(p_project);
 IF p_ask IS NULL THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 title:=sophia.conversation_text(p_title,120);
 body:=sophia.conversation_text(p_text,4000);
 semantic:=jsonb_build_object('operation','start','titleSha256',sophia.conversation_digest(title),
  'textSha256',sophia.conversation_digest(body),'askSophia',p_ask);
 prior:=sophia.conversation_prior(p_project,p_key,'start',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 pol:=sophia.conversation_open(p_project);
 INSERT INTO sophia.conversations(project_id,title,policy,created_by,created_at,last_at)
 VALUES(p_project,title,pol,a,clock_timestamp(),clock_timestamp()) RETURNING * INTO c;
 m:=sophia.conversation_append(p_project,c.id,'member',a,p_name,body,NULL);
 IF p_ask THEN r:=sophia.conversation_ask(p_project,c.id,m); END IF;
 out:=sophia.conversation_receipt(c.id,m,r);
 INSERT INTO sophia.conversation_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt,message_id)
 VALUES(p_project,a,p_key,'start',semantic,out,m.id);
 PERFORM sophia.conversation_moved(p_project,c.id,'conversation.started',false);
 RETURN out;
END $$;

-- A message in a conversation, Sophia asked or not.
CREATE FUNCTION sophia.send_conversation_message(p_conversation uuid, p_key text, p_text text, p_ask boolean, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.conversations; body text; semantic jsonb; prior jsonb;
 m sophia.conversation_messages; r sophia.conversation_replies; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 c:=sophia.conversation_locked(p_conversation);
 PERFORM sophia.conversation_writer(c.project_id);
 IF p_ask IS NULL THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 body:=sophia.conversation_text(p_text,4000);
 semantic:=jsonb_build_object('operation','send','conversationId',c.id,'textSha256',sophia.conversation_digest(body),
  'askSophia',p_ask);
 prior:=sophia.conversation_prior(c.project_id,p_key,'send',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 PERFORM sophia.conversation_open(c.project_id);
 IF c.state<>'open' THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='22023'; END IF;
 m:=sophia.conversation_append(c.project_id,c.id,'member',a,p_name,body,NULL);
 IF p_ask THEN r:=sophia.conversation_ask(c.project_id,c.id,m); END IF;
 out:=sophia.conversation_receipt(c.id,m,r);
 INSERT INTO sophia.conversation_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt,message_id)
 VALUES(c.project_id,a,p_key,'send',semantic,out,m.id);
 PERFORM sophia.conversation_moved(c.project_id,c.id,'conversation.message_recorded',false);
 RETURN out;
END $$;

-- Withdraw a message: its author (while a member, whatever their role now) their own, or an admin any message. Works
-- in a read-only project too: removing text is never switched off.
CREATE FUNCTION sophia.withdraw_conversation_message(p_conversation uuid, p_message uuid, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.conversations; m sophia.conversation_messages; semantic jsonb; prior jsonb;
 who text; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 c:=sophia.conversation_locked(p_conversation);
 SELECT * INTO m FROM sophia.conversation_messages WHERE project_id=c.project_id AND id=p_message AND conversation_id=c.id FOR UPDATE;
 IF NOT FOUND OR c.state<>'open' THEN RAISE EXCEPTION 'Message not found' USING ERRCODE='22023'; END IF;
 IF m.author='member' AND m.actor_id=a THEN who:='author';
 ELSIF sophia.is_admin(c.project_id) THEN who:='admin';
 ELSE RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('operation','withdraw','conversationId',c.id,'messageId',m.id);
 prior:=sophia.conversation_prior(c.project_id,p_key,'withdraw',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 out:=jsonb_build_object('conversationId',c.id,'messageId',m.id);
 INSERT INTO sophia.conversation_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(c.project_id,a,p_key,'withdraw',semantic,out);
 IF m.withdrawn_at IS NOT NULL THEN RETURN out; END IF;
 UPDATE sophia.conversation_messages SET body=NULL, author_name=NULL, withdrawn_at=clock_timestamp(), withdrawn_by=who
  WHERE project_id=c.project_id AND id=m.id;
 PERFORM sophia.conversation_withdrawn_from(c.project_id,c.id,m.seq,'source_withdrawn');
 PERFORM sophia.conversation_redact(c.project_id,c.id);
 PERFORM sophia.conversation_moved(c.project_id,c.id,'conversation.message_withdrawn',true);
 RETURN out;
END $$;

-- Erase a whole conversation (admins): every text in it and its title. It leaves every list and read; its ids stay, so
-- a replay or a late answer is refused rather than written into it again.
CREATE FUNCTION sophia.erase_conversation(p_conversation uuid, p_key text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); c sophia.conversations; semantic jsonb; prior jsonb; out jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 c:=sophia.conversation_locked(p_conversation);
 IF NOT sophia.is_admin(c.project_id) THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('operation','erase','conversationId',c.id);
 prior:=sophia.conversation_prior(c.project_id,p_key,'erase',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 out:=jsonb_build_object('conversationId',c.id);
 INSERT INTO sophia.conversation_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(c.project_id,a,p_key,'erase',semantic,out);
 IF c.state='erased' THEN RETURN out; END IF;
 UPDATE sophia.conversation_messages SET body=NULL, author_name=NULL, withdrawn_at=clock_timestamp(), withdrawn_by='admin'
  WHERE project_id=c.project_id AND conversation_id=c.id AND withdrawn_at IS NULL;
 PERFORM sophia.conversation_withdrawn_from(c.project_id,c.id,1,'conversation_erased');
 PERFORM sophia.conversation_redact(c.project_id,c.id);
 UPDATE sophia.conversations SET title=NULL, state='erased' WHERE project_id=c.project_id AND id=c.id;
 PERFORM sophia.conversation_moved(c.project_id,c.id,'conversation.erased',true);
 RETURN out;
END $$;

-- What the caller may do with a project's conversations, for the list's capability (read under the caller).
CREATE FUNCTION sophia.conversation_access(p_project uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('member',sophia.is_member(p_project),'writer',sophia.can_edit(p_project),
  'admin',sophia.is_admin(p_project),
  'state',(SELECT state FROM sophia.conversation_settings WHERE project_id=p_project AND sophia.is_member(p_project)),
  'policy',(SELECT policy FROM sophia.conversation_settings WHERE project_id=p_project AND sophia.is_member(p_project))) $$;

-- The operator's switch for one project, under a recorded approval. No login may call it.
CREATE FUNCTION sophia.set_conversation_settings(p_project uuid, p_state text, p_approval_ref text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 IF p_state NOT IN ('enabled','read_only') THEN RAISE EXCEPTION 'Invalid state' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.conversation_settings(project_id,policy,state,approval_ref)
 VALUES(p_project,'conversation-text-v1',p_state,p_approval_ref)
 ON CONFLICT(project_id) DO UPDATE SET state=EXCLUDED.state, approval_ref=EXCLUDED.approval_ref,
  revision=sophia.conversation_settings.revision+1, updated_at=now();
END $$;

REVOKE ALL ON FUNCTION sophia.start_conversation(uuid,text,text,text,boolean,text),
 sophia.send_conversation_message(uuid,text,text,boolean,text),
 sophia.withdraw_conversation_message(uuid,uuid,text),
 sophia.erase_conversation(uuid,text),
 sophia.conversation_access(uuid),
 sophia.set_conversation_settings(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.start_conversation(uuid,text,text,text,boolean,text),
 sophia.send_conversation_message(uuid,text,text,boolean,text),
 sophia.withdraw_conversation_message(uuid,uuid,text),
 sophia.erase_conversation(uuid,text),
 sophia.conversation_access(uuid) TO sophia_api;

COMMIT;
