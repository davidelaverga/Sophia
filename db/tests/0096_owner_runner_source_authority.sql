-- INC01-CC-005 (0096): owner-runner source authority at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * No application role reads the admitted sources table or calls the fence, the private writer or the policy
--   declaration; the API reads content only through owner_runner_content.
-- * The instruction body is Sophia's canonical JSON; the policy and settings checks refuse anything undeclared.
-- * A v1 row's envelope is the 0092 expression byte for byte; a v2 row's carries no instruction text.
-- * mission_erase_source keeps its research and design revocations and calls the runner fence after them.
-- Admission, the rechecks at every crossing and withdrawal over real operations are exercised in
-- packages/persistence/src/runner-operations.db.test.ts, apps/worker/src/runner-dispatch.db.test.ts and
-- packages/persistence/src/owner-host-enrollment.db.test.ts.
BEGIN;

-- --- the roles -------------------------------------------------------------------------------------------------------
SET LOCAL ROLE sophia_api;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM sophia.owner_runner_operation_sources; RAISE EXCEPTION 'The API reads admitted sources directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_runner_source_withdrawn(gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'The API calls the fence';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_runner_put_private(gen_random_uuid(),gen_random_uuid(),'text/plain','x');
  RAISE EXCEPTION 'The API writes a private source';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.declare_owner_runner_source_policy(gen_random_uuid(),gen_random_uuid(),'{}');
  RAISE EXCEPTION 'The API declares a source policy';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_runner_private_text(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),repeat('0',64));
  RAISE EXCEPTION 'The API reads private text past the guard';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Its one read: no actor, nothing.
 IF sophia.owner_runner_content(gen_random_uuid(),gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Content without an actor'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE sophia_worker;
DO $$ BEGIN
 BEGIN PERFORM sophia.owner_runner_content(gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'The worker reads owner content';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.owner_runner_source_withdrawn(gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'The worker calls the fence';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- --- the instruction body and the settings policy --------------------------------------------------------------------
DO $$ DECLARE body text; BEGIN
 body:=sophia.owner_runner_payload_body(E'Say "hi"\\\n\t\u0001 é', 'T');
 IF body<>E'{"message":"Say \\"hi\\"\\\\\\n\\t\\u0001 é","title":"T"}' THEN RAISE EXCEPTION 'Not canonical: %', body; END IF;
 IF sophia.owner_runner_payload_body('m',NULL)<>'{"message":"m","title":null}' THEN RAISE EXCEPTION 'An input body has a title'; END IF;
 IF sophia.owner_runner_sha256('abc')<>'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' THEN
  RAISE EXCEPTION 'Not SHA-256 over UTF-8'; END IF;
END $$;

DO $$ DECLARE p jsonb:='{"v":1,"instanceId":"codex","models":[{"model":"gpt-5-codex","options":[{"id":"reasoningEffort","values":["low","high"]},{"id":"fast","values":[true]}]}]}';
BEGIN
 IF sophia.owner_runner_policy_refusal(p) IS NOT NULL THEN RAISE EXCEPTION 'A good policy refused: %', sophia.owner_runner_policy_refusal(p); END IF;
 IF sophia.owner_runner_policy_refusal(p||'{"v":2}') IS NULL THEN RAISE EXCEPTION 'Another policy version'; END IF;
 IF sophia.owner_runner_policy_refusal(p||'{"instanceId":"9bad"}') IS NULL THEN RAISE EXCEPTION 'A non-slug instance'; END IF;
 IF sophia.owner_runner_policy_refusal(p||'{"extra":1}') IS NULL THEN RAISE EXCEPTION 'An extra policy key'; END IF;
 IF sophia.owner_runner_policy_refusal(jsonb_set(p,'{models,0,options,0,values}','[]')) IS NULL THEN RAISE EXCEPTION 'No values'; END IF;
 IF sophia.owner_runner_policy_refusal(jsonb_set(p,'{models,0,options,0,values}','[" "]')) IS NULL THEN RAISE EXCEPTION 'A blank value'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"fast","value":true},{"id":"reasoningEffort","value":"high"}]}') IS NOT NULL THEN
  RAISE EXCEPTION 'Allowed settings refused'; END IF;
 IF sophia.owner_runner_settings_refusal(NULL,'{"instanceId":"codex","model":"gpt-5-codex","options":[]}') IS NULL THEN
  RAISE EXCEPTION 'Settings allowed with no policy'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"claude","model":"gpt-5-codex","options":[{"id":"fast","value":true},{"id":"reasoningEffort","value":"high"}]}') IS NULL THEN
  RAISE EXCEPTION 'Another provider instance'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-6","options":[{"id":"fast","value":true},{"id":"reasoningEffort","value":"high"}]}') IS NULL THEN
  RAISE EXCEPTION 'An undeclared model'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"fast","value":true},{"id":"reasoningEffort","value":"xhigh"}]}') IS NULL THEN
  RAISE EXCEPTION 'An undeclared effort value'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"fast","value":"true"},{"id":"reasoningEffort","value":"high"}]}') IS NULL THEN
  RAISE EXCEPTION 'A string for a boolean'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"reasoningEffort","value":"high"}]}') IS NULL THEN
  RAISE EXCEPTION 'A declared option left to a default'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"reasoningEffort","value":"high"},{"id":"fast","value":true}]}') IS NULL THEN
  RAISE EXCEPTION 'Unsorted options'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"effort","value":"high"},{"id":"fast","value":true}]}') IS NULL THEN
  RAISE EXCEPTION 'Another provider''s option id'; END IF;
 IF sophia.owner_runner_settings_refusal(p,'{"instanceId":"codex","model":"gpt-5-codex","options":[{"id":"fast","value":true},{"id":"reasoningEffort","value":"high"}],"extra":1}') IS NULL THEN
  RAISE EXCEPTION 'An extra settings key'; END IF;
END $$;

-- --- repair 1 (F03): blank exactly as JavaScript trim() judges it ------------------------------------------------------
DO $$ BEGIN
 IF NOT sophia.owner_runner_blank(E'\u00a0\u2003\u3000') OR NOT sophia.owner_runner_blank(E'\n\t\r\u000b\u000c')
    OR NOT sophia.owner_runner_blank(E'\ufeff\u2028\u2029\u1680\u202f\u205f') OR NOT sophia.owner_runner_blank('') THEN
  RAISE EXCEPTION 'A blank that trim() removes was not blank'; END IF;
 IF sophia.owner_runner_blank(E'\u0085') OR sophia.owner_runner_blank(E'\u200b') OR sophia.owner_runner_blank(' a ') THEN
  RAISE EXCEPTION 'A character trim() keeps was taken as blank'; END IF;
 IF length(repeat(E'\U0001F680',8000))<>8000 THEN RAISE EXCEPTION 'length() is not code points'; END IF;
END $$;

-- --- the envelope ----------------------------------------------------------------------------------------------------
DO $$ DECLARE o sophia.owner_runner_operations; e jsonb; BEGIN
 o:=jsonb_populate_record(NULL::sophia.owner_runner_operations, jsonb_build_object('project_id',gen_random_uuid(),'id',gen_random_uuid(),
  'owner_id',gen_random_uuid(),'kind','create','resource_id',gen_random_uuid(),'binding_id',gen_random_uuid(),'goal_id',gen_random_uuid(),
  'qualification_id',gen_random_uuid(),'qualification_revision',3,'adapter_pin',repeat('a',40),'environment_ref','env',
  'native_project_ref','np','profile_id','prof','profile_revision',2,'account_key','acct','authority_epoch',1,
  'message','hello','title','T','native_thread_id','ignored-for-a-create','envelope_version',1));
 -- The 0092 expression, verbatim.
 IF sophia.owner_runner_envelope(o) IS DISTINCT FROM jsonb_build_object('v',1,'operationId',o.id,'kind',o.kind,'projectId',o.project_id,'ownerId',o.owner_id,
  'resourceId',o.resource_id,'bindingId',o.binding_id,'goalId',o.goal_id,'qualificationId',o.qualification_id,
  'qualificationRevision',o.qualification_revision,'adapterPin',o.adapter_pin,'environmentRef',o.environment_ref,
  'nativeProjectRef',o.native_project_ref,'profileId',o.profile_id,'profileRevision',o.profile_revision,
  'accountKey',o.account_key,'authorityEpoch',o.authority_epoch,'message',o.message,'title',o.title,
  'targetOperationId',o.target_operation_id,'nativeThreadId',CASE WHEN o.kind='create' THEN NULL ELSE o.native_thread_id END) THEN
  RAISE EXCEPTION 'A v1 envelope changed: %', sophia.owner_runner_envelope(o); END IF;
 o.envelope_version:=2; o.message:=NULL; o.title:=NULL; o.payload_sha256:=repeat('b',64); o.manifest_sha256:=repeat('c',64);
 o.base_commit:=repeat('d',40); o.write_scope:='read_only'; o.requested_settings:='{"instanceId":"codex","model":"m","options":[]}';
 e:=sophia.owner_runner_envelope(o);
 IF e->'v'<>'2' OR e ?| ARRAY['message','title'] OR e->>'payloadSha256'<>repeat('b',64) OR e->>'manifestSha256'<>repeat('c',64)
    OR e->>'baseCommit'<>repeat('d',40) OR e->>'writeScope'<>'read_only' OR e->'settings'<>o.requested_settings
    OR (SELECT count(*) FROM jsonb_object_keys(e))<>24 THEN
  RAISE EXCEPTION 'A v2 envelope is not content-free with its facts: %', e; END IF;
END $$;

-- --- the erase hook keeps its earlier revocations ---------------------------------------------------------------------
DO $$ DECLARE d text:=pg_get_functiondef('sophia.mission_erase_source(uuid,uuid)'::regprocedure); BEGIN
 IF d !~ 'research_revoke_source' OR d !~ 'design_revoke_source' OR d !~ 'owner_runner_source_withdrawn' THEN
  RAISE EXCEPTION 'mission_erase_source lost a hook'; END IF;
 IF strpos(d,'design_revoke_source')>strpos(d,'owner_runner_source_withdrawn') THEN RAISE EXCEPTION 'The runner fence runs first'; END IF;
END $$;
ROLLBACK;
