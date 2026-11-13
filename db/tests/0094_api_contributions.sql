-- INC01-CC-004 S5-a (0094): member API contributions at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * No application role reads or writes the eight tables, or calls a helper or an operator function.
-- * Every function that selects from runtime_instances is either a picker that excludes contribution resources or a
--   known binding- or token-scoped function: a new unclassified one fails this file.
-- * One accounting root per owner and provider; expected revisions; only the owner enlarges; unsupported policies refused.
-- * A registered contribution runtime is never chosen by a legacy picker.
-- Admission, dispatch, reservation, settlement and publication are exercised in packages/persistence/src/api-contributions.db.test.ts.
BEGIN;

-- --- reach -----------------------------------------------------------------------------------------------------------
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='sophia'::regnamespace AND relname IN ('api_accounts','api_connections',
   'api_route_qualifications','api_contribution_grants','api_contribution_runtimes','research_funding_pins','api_contribution_tasks',
   'api_contribution_reservations') AND NOT relrowsecurity) THEN RAISE EXCEPTION 'RLS is not enabled on a 0094 table'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='sophia' AND tablename IN ('api_accounts','api_connections','api_route_qualifications',
   'api_contribution_grants','api_contribution_runtimes','research_funding_pins','api_contribution_tasks','api_contribution_reservations')) THEN
  RAISE EXCEPTION 'A 0094 table has a policy'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['api_accounts','api_connections','api_route_qualifications','api_contribution_grants',
   'api_contribution_runtimes','research_funding_pins','api_contribution_tasks','api_contribution_reservations']) t,
   unnest(ARRAY['sophia_api','sophia_worker']) r WHERE has_table_privilege(r,'sophia.'||t,'SELECT') OR has_table_privilege(r,'sophia.'||t,'INSERT')
   OR has_table_privilege(r,'sophia.'||t,'UPDATE')) THEN RAISE EXCEPTION 'An application role holds a 0094 table privilege'; END IF;
 IF has_function_privilege('sophia_api','sophia.register_contribution_runtime(uuid,uuid,text,bytea,boolean)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.register_contribution_runtime(uuid,uuid,text,bytea,boolean)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.qualify_api_route(text,text,text,text,timestamptz)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.retire_contribution_runtime(uuid,uuid)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_resource(uuid,uuid)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_model_reserve(sophia.research_scope,text,numeric)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.api_grant_create(uuid,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'A role holds a 0094 function privilege it must not'; END IF;
END $$;

-- --- every runtime_instances selector is classified ------------------------------------------------------------------
DO $$ DECLARE f record; pickers text[]:=ARRAY['admit_research_task','admit_native_task','role_runtime','work_runtime',
  'source_review_availability','register_runtime'];
 -- Pinned byte-for-byte by existing invariant suites, so not replaced: they filter by the conversation role, and the
 -- 0094 trigger guarantees a contribution runtime never holds that role.
 role_pinned text[]:=ARRAY['conversation_ask','conversation_ask_capability'];
 -- Selectors scoped to a binding, a token, a known resource or a runtime already chosen: they choose no runtime for new work.
 scoped text[]:=ARRAY['conversation_dispatch','conversation_execution_claim','conversation_execution_go','dispatch_runtime_outbox',
  'runtime_authenticate','runtime_conversation_acknowledged','runtime_conversation_claim','runtime_conversation_go',
  'runtime_conversation_reserve','runtime_conversation_settle','runtime_cursor','runtime_record_observations','runtime_record_receipts',
  'runtime_hello','runtime_lease','runtime_poll','runtime_record_ready','runtime_status','contribution_runtime_of',
  'register_contribution_runtime','retire_contribution_runtime'];
BEGIN
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND p.prosrc ~* 'from\s+sophia\.runtime_instances' LOOP
  IF f.proname=ANY(pickers) THEN
   IF position('contribution_resource' IN f.prosrc)=0 THEN RAISE EXCEPTION 'Picker % does not exclude contribution resources', f.proname; END IF;
  ELSIF f.proname=ANY(role_pinned) THEN
   IF position('sophia-conversation-v1' IN f.prosrc)=0 THEN RAISE EXCEPTION 'Pinned picker % no longer filters by its role', f.proname; END IF;
  ELSIF NOT f.proname=ANY(scoped) THEN
   RAISE EXCEPTION 'Unclassified runtime selector %: decide whether it must exclude contribution resources', f.proname;
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT p.proname) FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname=ANY(pickers))<>cardinality(pickers) THEN
  RAISE EXCEPTION 'A listed picker is missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='runtime_instances_contribution_roles' AND tgrelid='sophia.runtime_instances'::regclass AND tgenabled='O') THEN
  RAISE EXCEPTION 'The contribution role trigger is missing'; END IF;
END $$;

-- --- fixtures (as the migration owner) -------------------------------------------------------------------------------
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('94000000-0000-0000-0000-0000000000a1','Project A','00000000-0000-0000-0000-0000000094a1'),
 ('94000000-0000-0000-0000-0000000000b1','Project B','00000000-0000-0000-0000-0000000094b1');
INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES
 ('94000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000094a1','admin'),
 ('94000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000094c1','editor'),
 ('94000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000094d1','admin'),
 ('94000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000094b1','admin');

-- --- the owner: one accounting root, connection, grant ----------------------------------------------------------------
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000094a1',true);
DO $$ DECLARE r jsonb; acc uuid; conn uuid; g jsonb; BEGIN
 BEGIN PERFORM 1 FROM sophia.api_accounts; RAISE EXCEPTION 'The API reads accounts directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=sophia.api_account_create('My OpenAI API',20,1,'owner_declared',NULL); acc:=(r->>'accountId')::uuid;
 -- An alias of the same owner and provider is the same accounting root unless separate ownership is recorded.
 BEGIN PERFORM sophia.api_account_create('Another key',20,1,'owner_declared',NULL); RAISE EXCEPTION 'A second root without a reason';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM sophia.api_account_create('Company account',5,1,'owner_declared','My employer''s organisation, billed separately');
 BEGIN PERFORM sophia.api_account_create('Verified?',5,1,'provider_verified','x'); RAISE EXCEPTION 'A provider-verified identity was claimed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 r:=sophia.api_connection_create(acc,'Research key','Operator runtime host');
 conn:=(r->>'connectionId')::uuid;
 IF r->>'state'<>'draft' THEN RAISE EXCEPTION 'A new connection is a draft: %', r; END IF;
 -- No key, fingerprint or token material is part of a connection.
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='sophia' AND table_name IN ('api_accounts','api_connections')
   AND column_name ~ '(key|secret|token|fingerprint|sha|billing)' AND column_name<>'credential_ref') THEN
  RAISE EXCEPTION 'A secret-shaped column exists'; END IF;
 -- Unsupported policies are refused, never stored.
 BEGIN PERFORM sophia.api_grant_create(conn,'94000000-0000-0000-0000-0000000000a1',jsonb_build_object('expiresAt',now()+interval '30 days',
   'taskCapUsd',1,'totalCapUsd',5,'fundingPolicy','bounded_total_spend','fundingAcknowledgementRef','ack-1','activeSettlement','stop'));
  RAISE EXCEPTION 'Stop settlement was accepted'; EXCEPTION WHEN feature_not_supported THEN NULL; END;
 BEGIN PERFORM sophia.api_grant_create(conn,'94000000-0000-0000-0000-0000000000a1',jsonb_build_object('expiresAt',now()+interval '30 days',
   'taskCapUsd',1,'totalCapUsd',5,'fundingPolicy','benefit_only','fundingAcknowledgementRef','ack-1'));
  RAISE EXCEPTION 'Benefit-only funding was accepted'; EXCEPTION WHEN feature_not_supported THEN NULL; END;
 BEGIN PERFORM sophia.api_grant_create(conn,'94000000-0000-0000-0000-0000000000a1',jsonb_build_object('expiresAt',now()+interval '30 days',
   'taskCapUsd',1,'totalCapUsd',50,'fundingPolicy','bounded_total_spend','fundingAcknowledgementRef','ack-1'));
  RAISE EXCEPTION 'A grant above its account cap was accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.api_grant_create(conn,'94000000-0000-0000-0000-0000000000a1',jsonb_build_object('expiresAt',now()+interval '30 days',
   'taskCapUsd',1,'totalCapUsd',5,'fundingPolicy','bounded_total_spend','fundingAcknowledgementRef','ack-1','model','gpt-other'));
  RAISE EXCEPTION 'Another model was accepted'; EXCEPTION WHEN feature_not_supported THEN NULL; END;
 -- Not a member of project B: no grant there.
 BEGIN PERFORM sophia.api_grant_create(conn,'94000000-0000-0000-0000-0000000000b1',jsonb_build_object('expiresAt',now()+interval '30 days',
   'taskCapUsd',1,'totalCapUsd',5,'fundingPolicy','bounded_total_spend','fundingAcknowledgementRef','ack-1'));
  RAISE EXCEPTION 'Granted a project the owner is not in'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 g:=sophia.api_grant_create(conn,'94000000-0000-0000-0000-0000000000a1',jsonb_build_object('expiresAt',now()+interval '30 days',
   'taskCapUsd',1,'totalCapUsd',5,'fundingPolicy','bounded_total_spend','fundingAcknowledgementRef','ack-1'));
 PERFORM set_config('t94.grant',g->>'grantId',true); PERFORM set_config('t94.conn',conn::text,true);
 IF (g->>'revision')::int<>1 THEN RAISE EXCEPTION 'Grant receipt: %', g; END IF;
 BEGIN PERFORM sophia.api_grant_update((g->>'grantId')::uuid,7,'{"taskCapUsd":2}'); RAISE EXCEPTION 'A stale revision was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 g:=sophia.api_grant_update((g->>'grantId')::uuid,1,'{"taskCapUsd":2}');
 IF (g->>'revision')::int<>2 THEN RAISE EXCEPTION 'The owner could not enlarge: %', g; END IF;
END $$;

-- --- an admin narrows or disables, never enlarges; another member edits nothing -----------------------------------------
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000094d1',true);
DO $$ DECLARE gid uuid:=current_setting('t94.grant')::uuid; g jsonb; BEGIN
 BEGIN PERFORM sophia.api_grant_update(gid,2,'{"taskCapUsd":1}'); RAISE EXCEPTION 'An admin edited as the owner';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.api_grant_admin_narrow(gid,2,'{"taskCapUsd":3}'); RAISE EXCEPTION 'An admin enlarged a grant';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.api_grant_admin_narrow(gid,2,'{"fundingPolicy":"bounded_total_spend"}'); RAISE EXCEPTION 'An admin changed the funding policy';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 g:=sophia.api_grant_admin_narrow(gid,2,'{"taskCapUsd":0.5}');
 g:=sophia.api_grant_admin_disable(gid,3,'Paused while we review spend');
 IF NOT (g->>'adminDisabled')::boolean THEN RAISE EXCEPTION 'Disable: %', g; END IF;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000094c1',true);
DO $$ DECLARE gid uuid:=current_setting('t94.grant')::uuid; v jsonb; BEGIN
 BEGIN PERFORM sophia.api_grant_admin_lift(gid,4); RAISE EXCEPTION 'An editor lifted a team disable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM sophia.research_funding_pin_set('94000000-0000-0000-0000-0000000000a1',gid,4); RAISE EXCEPTION 'Pinned a disabled grant';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 -- The teammate view has limits and readiness, and no account, usage or eligible list.
 v:=sophia.api_contributions_for_project('94000000-0000-0000-0000-0000000000a1');
 IF jsonb_array_length(v->'contributions')<>1 OR v::text ~ '(accountId|committedUsd|eligibleActors|slotsHeld|custodian|credential)' THEN
  RAISE EXCEPTION 'Unsafe teammate view: %', v; END IF;
 IF NOT (v->'contributions'->0->'readiness') ? 'admin_disabled' OR NOT (v->'contributions'->0->'readiness') ? 'route_unqualified' THEN
  RAISE EXCEPTION 'Readiness: %', v; END IF;
 -- The owner's private view answers nothing of theirs to another member.
 IF jsonb_array_length(sophia.api_contributions_mine()->'grants')<>0 THEN RAISE EXCEPTION 'Another member read the owner''s grants'; END IF;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-0000000094b1',true);
DO $$ BEGIN
 BEGIN PERFORM sophia.api_contributions_for_project('94000000-0000-0000-0000-0000000000a1'); RAISE EXCEPTION 'An outsider read the project''s contributions';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- --- a registered contribution runtime is never chosen by a legacy picker ----------------------------------------------
DO $$ DECLARE r jsonb; legacy uuid;
 v_roles jsonb:=jsonb_build_array(jsonb_build_object('id','sophia-research-md-v1','route','research-sol-medium-v1'),
  jsonb_build_object('id','sophia-html-designer-v1','route','research-sol-medium-v1'),
  jsonb_build_object('id','sophia-visual-review-v1','route','research-sol-medium-v1'),
  jsonb_build_object('id','sophia-source-review-v1','route','source-review-luna-high-v1'));
BEGIN
 r:=sophia.register_contribution_runtime('94000000-0000-0000-0000-0000000000a1',current_setting('t94.conn')::uuid,'unit-test',sha256('contribution'),false);
 IF (r->>'credentialRevision')::int<>1 OR r->>'connectionState'<>'connected' THEN RAISE EXCEPTION 'Registration: %', r; END IF;
 -- The contribution runtime is connected, ready and advertises every role on the shared routes: the most capable here.
 UPDATE sophia.runtime_instances SET roles=v_roles, lease_id=gen_random_uuid(), seen_at=now(), ready_state='ready'
  WHERE id=(r->>'runtimeId')::uuid;
 -- Whatever it advertises, a contribution runtime holds only the contributed role: no conversation, design or review role.
 IF (SELECT roles FROM sophia.runtime_instances WHERE id=(r->>'runtimeId')::uuid)
    <>jsonb_build_array(jsonb_build_object('id','sophia-research-md-v1','route','research-sol-medium-v1')) THEN
  RAISE EXCEPTION 'A contribution runtime holds more than its contributed role'; END IF;
 UPDATE sophia.runtime_instances SET roles=jsonb_build_array(jsonb_build_object('id','sophia-conversation-v1','route','research-sol-medium-v1'))
  WHERE id=(r->>'runtimeId')::uuid;
 IF (SELECT roles FROM sophia.runtime_instances WHERE id=(r->>'runtimeId')::uuid)<>'[]'::jsonb THEN
  RAISE EXCEPTION 'A contribution runtime took the conversation role'; END IF;
 UPDATE sophia.runtime_instances SET roles=v_roles WHERE id=(r->>'runtimeId')::uuid;
 IF (sophia.role_runtime('94000000-0000-0000-0000-0000000000a1','sophia-html-designer-v1','research-sol-medium-v1')).id IS NOT NULL
    OR (sophia.role_runtime('94000000-0000-0000-0000-0000000000a1','sophia-visual-review-v1','research-sol-medium-v1')).id IS NOT NULL THEN
  RAISE EXCEPTION 'A design picker chose a contribution runtime'; END IF;
 IF (sophia.work_runtime('94000000-0000-0000-0000-0000000000a1','sophia-source-review-v1','source-review-luna-high-v1')).id IS NOT NULL THEN
  RAISE EXCEPTION 'The source-review picker chose a contribution runtime'; END IF;
 -- register_runtime never reuses a contribution's executor resource for the project's own dsh runtime.
 PERFORM sophia.register_runtime('94000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000094a1','unit-test',sha256('legacy'));
 SELECT resource_id INTO legacy FROM sophia.runtime_instances WHERE token_sha256=sha256('legacy');
 IF sophia.contribution_resource('94000000-0000-0000-0000-0000000000a1',legacy) THEN RAISE EXCEPTION 'register_runtime reused a contribution resource'; END IF;
 IF (SELECT state FROM sophia.runtime_instances WHERE token_sha256=sha256('contribution'))<>'active' THEN
  RAISE EXCEPTION 'Registering the project runtime revoked the contribution runtime'; END IF;
 -- Rotation advances the credential revision and drains the old runtime; it does not revoke its token.
 r:=sophia.register_contribution_runtime('94000000-0000-0000-0000-0000000000a1',current_setting('t94.conn')::uuid,'unit-test',sha256('rotated'),true);
 IF (r->>'credentialRevision')::int<>2 THEN RAISE EXCEPTION 'Rotation: %', r; END IF;
 IF (SELECT x.state FROM sophia.api_contribution_runtimes x JOIN sophia.runtime_instances i ON i.resource_id=x.resource_id AND i.project_id=x.project_id
   WHERE i.token_sha256=sha256('contribution'))<>'draining'
    OR (SELECT state FROM sophia.runtime_instances WHERE token_sha256=sha256('contribution'))<>'active' THEN
  RAISE EXCEPTION 'The rotated runtime is not draining with a live token'; END IF;
END $$;

-- S5b: the HTTP boundary's idempotency ledger is reachable only through its one write entry.
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='sophia.api_contribution_requests'::regclass) THEN
  RAISE EXCEPTION 'RLS is not enabled on the contribution request ledger'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='sophia' AND tablename='api_contribution_requests') THEN
  RAISE EXCEPTION 'The contribution request ledger has a policy'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['sophia_api','sophia_worker']) r WHERE has_table_privilege(r,'sophia.api_contribution_requests','SELECT')
    OR has_table_privilege(r,'sophia.api_contribution_requests','INSERT') OR has_table_privilege(r,'sophia.api_contribution_requests','UPDATE')
    OR has_table_privilege(r,'sophia.api_contribution_requests','DELETE')) THEN
  RAISE EXCEPTION 'An application role reads or writes the contribution request ledger directly'; END IF;
 IF NOT has_function_privilege('sophia_api','sophia.api_contribution_write(text,text,jsonb)','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.api_contribution_write(text,text,jsonb)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_replay_allowed(text,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_request_uuid(jsonb,text)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_request_revision(jsonb)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_uuid_spelling(jsonb)','EXECUTE')
    OR has_function_privilege('sophia_api','sophia.contribution_request_canonical(text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'The contribution write entry or its helpers have the wrong grants'; END IF;
END $$;

-- r2: every UUID spelling A48 accepts becomes one spelling; nothing else is touched or accepted.
DO $$
DECLARE u text:='0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'; got jsonb;
BEGIN
 IF (SELECT array_agg(sophia.contribution_uuid_spelling(to_jsonb(v))#>>'{}' ORDER BY v) FROM unnest(ARRAY[upper(u),
     'urn:uuid:'||u,'URN:UUID:'||upper(u),'Urn:Uuid:0F1e2D3c-4B5a-6978-8796-A5b4C3d2E1f0',u]) v) <> array_fill(u,ARRAY[5]) THEN
  RAISE EXCEPTION 'An accepted UUID spelling did not become the one spelling'; END IF;
 -- PostgreSQL's uuid input accepts these, A48 does not: they stay as sent, so contribution_request_uuid refuses them.
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['{'||u||'}',replace(u,'-',''),'urn:uuid:'||replace(u,'-',''),' '||u,u||' ',
     'uuid:'||u,u||E'\n','urn:uuid:{'||u||'}']) v WHERE sophia.contribution_uuid_spelling(to_jsonb(v))<>to_jsonb(v)) THEN
  RAISE EXCEPTION 'A spelling outside A48 was rewritten'; END IF;
 IF sophia.contribution_uuid_spelling('7'::jsonb)<>'7'::jsonb OR sophia.contribution_uuid_spelling('null'::jsonb)<>'null'::jsonb THEN
  RAISE EXCEPTION 'A non-string was rewritten'; END IF;
 got:=sophia.contribution_request_canonical('grant_update',jsonb_build_object('grantId',upper(u),'expectedRevision',1,
  'settings',jsonb_build_object('label','Keep ME '||upper(u),'eligibleActors',jsonb_build_array('B'||u,upper(u),'{'||u||'}'))));
 IF got<>jsonb_build_object('grantId',u,'expectedRevision',1,'settings',jsonb_build_object('label','Keep ME '||upper(u),
     'eligibleActors',jsonb_build_array('B'||u,u,'{'||u||'}'))) THEN
  RAISE EXCEPTION 'The request was not respelled exactly: %', got; END IF;
 -- eligibleActors is respelled only under the operation's own settings.
 got:=sophia.contribution_request_canonical('account_update',jsonb_build_object('accountId','urn:uuid:'||u,'expectedRevision',1,
  'patch',jsonb_build_object('eligibleActors',jsonb_build_array(upper(u)))));
 IF got->'patch'->'eligibleActors'->>0<>upper(u) OR got->>'accountId'<>u THEN
  RAISE EXCEPTION 'The respelling crossed its operation: %', got; END IF;
 BEGIN
  PERFORM sophia.contribution_request_uuid(sophia.contribution_request_canonical('pin_set',jsonb_build_object('grantId','{'||u||'}')),'grantId');
  RAISE EXCEPTION 'A braced id was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
ROLLBACK;
