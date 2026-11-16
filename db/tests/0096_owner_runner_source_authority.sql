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

-- --- repair 13 (NATIVE12-F02, F02-W1): a declared model or string value is 1 to 200 code points, no trim() edge -------
-- The gateway keeps a model or string value only if it equals its own JavaScript trim() and is at most 200 code points.
-- The policy declares nothing the gateway would refuse: the same 25 characters as owner_runner_blank, whatever the
-- database's locale, and code points. Every disagreement is collected, then reported at once.
DO $$ DECLARE
 trims text[]:=ARRAY[E'\u0009',E'\u000a',E'\u000b',E'\u000c',E'\u000d',E' ',E' ',E' ',E' ',E' ',
  E' ',E' ',E' ',E' ',E' ',E' ',E' ',E' ',E' ',E' ',E' ',E' ',
  E' ',E'　',E'﻿'];
 c text; v text; bad text[]:='{}';
BEGIN
 IF cardinality(trims)<>25 OR EXISTS(SELECT 1 FROM unnest(trims) x WHERE NOT sophia.owner_runner_blank(x)) THEN
  RAISE EXCEPTION 'Not the 25 characters owner_runner_blank takes as blank'; END IF;
 CREATE TEMP TABLE r13_values(label text, value text, allowed boolean) ON COMMIT DROP;
 FOREACH c IN ARRAY trims LOOP
  INSERT INTO r13_values VALUES ('leading U+'||lpad(upper(to_hex(ascii(c))),4,'0'), c||'m', false),
   ('trailing U+'||lpad(upper(to_hex(ascii(c))),4,'0'), 'm'||c, false),
   ('inside U+'||lpad(upper(to_hex(ascii(c))),4,'0'), 'm'||c||'m', true);
 END LOOP;
 -- Characters trim() keeps may stand at an edge.
 INSERT INTO r13_values VALUES ('leading U+0085', E'\u0085m', true), ('leading U+200B', E'​m', true),
  ('leading U+180E', E'᠎m', true),
  ('200 supplementary', repeat(E'\U0001F680',200), true), ('201 supplementary', repeat(E'\U0001F680',201), false),
  ('200 mixed', repeat(E'é\U0001F680',100), true), ('200 ASCII', repeat('m',200), true),
  ('201 ASCII', repeat('m',201), false), ('one character', 'm', true), ('empty', '', false);
 FOR v, c IN SELECT value, label FROM r13_values LOOP
  IF (sophia.owner_runner_policy_refusal(jsonb_build_object('v',1,'instanceId','codex','models',
       jsonb_build_array(jsonb_build_object('model',v,'options','[]'::jsonb)))) IS NULL)
     IS DISTINCT FROM (SELECT allowed FROM r13_values WHERE label=c) THEN bad:=bad||('model, '||c); END IF;
  IF (sophia.owner_runner_policy_refusal(jsonb_build_object('v',1,'instanceId','codex','models',
       jsonb_build_array(jsonb_build_object('model','m','options',
        jsonb_build_array(jsonb_build_object('id','effort','values',jsonb_build_array(v))))))) IS NULL)
     IS DISTINCT FROM (SELECT allowed FROM r13_values WHERE label=c) THEN bad:=bad||('value, '||c); END IF;
 END LOOP;
 IF cardinality(bad)>0 THEN
  RAISE EXCEPTION 'The policy disagrees with the gateway (lc_ctype %) on %: %',
   (SELECT datctype FROM pg_database WHERE datname=current_database()), cardinality(bad), bad; END IF;
 -- A declared 200-point model and value are requested as declared; an undeclared value of that length is refused.
 IF sophia.owner_runner_settings_refusal(jsonb_build_object('v',1,'instanceId','codex','models',jsonb_build_array(
      jsonb_build_object('model',repeat(E'\U0001F680',200),'options',jsonb_build_array(
       jsonb_build_object('id','effort','values',jsonb_build_array(repeat(E'é\U0001F680',100))))))),
    jsonb_build_object('instanceId','codex','model',repeat(E'\U0001F680',200),'options',jsonb_build_array(
     jsonb_build_object('id','effort','value',repeat(E'é\U0001F680',100))))) IS NOT NULL THEN
  RAISE EXCEPTION 'Declared 200-point settings were refused'; END IF;
 IF sophia.owner_runner_settings_refusal(jsonb_build_object('v',1,'instanceId','codex','models',jsonb_build_array(
      jsonb_build_object('model','m','options',jsonb_build_array(
       jsonb_build_object('id','effort','values',jsonb_build_array(repeat(E'é\U0001F680',100))))))),
    jsonb_build_object('instanceId','codex','model','m','options',jsonb_build_array(
     jsonb_build_object('id','effort','value',repeat(E'\U0001F680',200))))) IS NULL THEN
  RAISE EXCEPTION 'An undeclared 200-point value was allowed'; END IF;
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
-- --- one live host per connection (repair 3, PR505-33-73-F03) -----------------------------------------------------
-- The concurrent redemptions themselves are exercised in packages/persistence/src/owner-host-enrollment.db.test.ts.
DO $$ DECLARE d text:=pg_get_functiondef('sophia.owner_host_redeem(bytea,bytea)'::regprocedure); f pg_proc; BEGIN
 SELECT * INTO f FROM pg_proc WHERE oid='sophia.owner_host_redeem(bytea,bytea)'::regprocedure;
 IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia'] THEN
  RAISE EXCEPTION 'The redemption lost its definer or its search_path: %', f.proconfig; END IF;
 IF NOT has_function_privilege('sophia_api','sophia.owner_host_redeem(bytea,bytea)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.owner_host_redeem(bytea,bytea)','EXECUTE')
    OR EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0) THEN
  RAISE EXCEPTION 'The redemption''s execute privileges changed'; END IF;
 -- Lock order: pairing, the connection's redemption lock, its live hosts, the connection; the decision clock after them.
 IF NOT (strpos(d,'owner_host_pairings WHERE code_sha256')<strpos(d,'pg_advisory_xact_lock')
    AND strpos(d,'pg_advisory_xact_lock')<strpos(d,'ORDER BY id FOR UPDATE')
    AND strpos(d,'ORDER BY id FOR UPDATE')<strpos(d,'execution_connections WHERE id=p.connection_id FOR SHARE')
    AND strpos(d,'execution_connections WHERE id=p.connection_id FOR SHARE')<strpos(d,'INSERT INTO sophia.owner_hosts')) THEN
  RAISE EXCEPTION 'The redemption''s lock order changed'; END IF;
 IF d ~ 'now\(\)\s*THEN' OR d ~ 'expires_at<=now' THEN RAISE EXCEPTION 'An expiry is judged at transaction start'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='sophia' AND indexname='owner_hosts_one_live_per_connection'
   AND indexdef ~ 'UNIQUE' AND indexdef ~ 'bound' AND indexdef ~ 'active') THEN RAISE EXCEPTION 'No one-live-host index'; END IF;
END $$;
INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state)
 VALUES('96000000-0000-0000-0000-0000000000c1','96000000-0000-0000-0000-0000000000a1','synthetic-owner-host','synthetic-account','linked');
INSERT INTO sophia.owner_host_pairings(owner_id,connection_id,code_sha256,expires_at)
 SELECT '96000000-0000-0000-0000-0000000000a1','96000000-0000-0000-0000-0000000000c1',sha256(c::bytea),now()+interval '300 seconds'
 FROM unnest(ARRAY['r3-one','r3-two','r3-three']) c;
SET LOCAL ROLE sophia_api;
DO $$ DECLARE r jsonb; one jsonb; BEGIN
 one:=sophia.owner_host_redeem(sha256('r3-one'),sha256('r3-cap-one'));
 r:=sophia.owner_host_redeem(sha256('r3-two'),sha256('r3-cap-two'));
 IF one->>'result'<>'bound' OR r->>'result'<>'bound' THEN RAISE EXCEPTION 'Sequential replacement: % %', one, r; END IF;
 -- Replay and the used-code conflict are unchanged, and a replay retires nothing.
 r:=sophia.owner_host_redeem(sha256('r3-one'),sha256('r3-cap-one'));
 IF r->>'result'<>'bound' OR NOT (r->>'replayed')::boolean OR r->>'hostId'<>one->>'hostId' THEN RAISE EXCEPTION 'Replay: %', r; END IF;
 r:=sophia.owner_host_redeem(sha256('r3-one'),sha256('r3-cap-other'));
 IF r->>'result'<>'refused' OR r->>'reason' !~ 'already used' THEN RAISE EXCEPTION 'Used code: %', r; END IF;
 -- A capability already bound is refused before anything is retired.
 r:=sophia.owner_host_redeem(sha256('r3-three'),sha256('r3-cap-two'));
 IF r->>'result'<>'refused' OR r->>'reason' !~ 'already bound' THEN RAISE EXCEPTION 'Bound capability: %', r; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT array_agg(state ORDER BY state) FROM sophia.owner_hosts
     WHERE connection_id='96000000-0000-0000-0000-0000000000c1') IS DISTINCT FROM ARRAY['bound','retired'] THEN
  RAISE EXCEPTION 'Not one live host: %', (SELECT array_agg(state) FROM sophia.owner_hosts
   WHERE connection_id='96000000-0000-0000-0000-0000000000c1'); END IF;
 -- The constraint: a second live host for the connection is refused, whatever path writes it.
 BEGIN UPDATE sophia.owner_hosts SET state='active' WHERE connection_id='96000000-0000-0000-0000-0000000000c1' AND state='retired';
  RAISE EXCEPTION 'Two live hosts for one connection'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
-- --- the last write, then the decision (repair 4, CC005-R3-F01) ----------------------------------------------------
-- The races themselves run through the actual dispatcher, host channel, agent, gateway and FakeT3 in
-- apps/worker/src/runner-dispatch.db.test.ts. Here: in both functions the final check follows the last write that can
-- wait, inside the block that rolls the writes back, and refuses with the private SQLSTATE that block catches.
DO $$ DECLARE p text:=pg_get_functiondef('sophia.owner_runner_prepare_send(uuid,uuid,uuid,uuid)'::regprocedure);
 g text:=pg_get_functiondef('sophia.owner_host_go(bytea,uuid)'::regprocedure); last_check integer; BEGIN
 last_check:=length(p)-strpos(reverse(p),reverse('sophia.owner_runner_send_check(o)'))+1;
 IF NOT (strpos(p,'BEGIN
  -- Bound to the journal')>0 AND strpos(p,'runner_operation.sending')<last_check
    AND strpos(p,'UPDATE sophia.commands SET state=''dispatching''')<last_check
    AND last_check<strpos(p,'EXCEPTION WHEN SQLSTATE ''SR4F1''')) THEN
  RAISE EXCEPTION 'prepare-send decides before its last write'; END IF;
 IF NOT (strpos(g,'SET state=''go_granted''')<strpos(g,'x.deadline_at<=clock_timestamp() THEN lapsed')
    AND strpos(g,'x.deadline_at<=clock_timestamp() THEN lapsed')<strpos(g,'RAISE EXCEPTION ''refused at the grant''')
    AND strpos(g,'RAISE EXCEPTION ''refused at the grant''')<strpos(g,'EXCEPTION WHEN SQLSTATE ''SR4F1''')) THEN
  RAISE EXCEPTION 'GO decides before its grant''s write'; END IF;
 IF NOT has_function_privilege('sophia_worker','sophia.owner_runner_prepare_send(uuid,uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.owner_runner_prepare_send(uuid,uuid,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('sophia_api','sophia.owner_host_go(bytea,uuid)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.owner_host_go(bytea,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'prepare-send or GO privileges changed'; END IF;
END $$;
ROLLBACK;
