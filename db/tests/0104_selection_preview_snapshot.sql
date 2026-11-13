-- INC04-S01b (0104): the selection preview's snapshot and its owner/operator facts at the SQL boundary. Run against a
-- disposable database with every migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * Only sophia_api executes the snapshot; no application role executes a helper or an operator function, or reads
--   the qualification table. Definer, fixed search_path, UTC.
-- * Owner protection: whole, scoped, owner-only, withdrawn by null; a cap edit that conflicts is refused.
-- * Account qualification: current only for the account's own connection at its current credential revision; expiry
--   at its exact instant; revoked; stale after a rotation; global qualification judged separately.
-- * The snapshot: nonmember NULL; sources; the revoked Pin kept; protection witnesses; more than 200 is incomplete.
-- The money, uncertainty and slot ledgers are exercised on real admissions in selection-snapshot.db.test.ts.
BEGIN;

-- --- privileges ------------------------------------------------------------------------------------------------------
DO $$ DECLARE f record; BEGIN
 IF NOT has_function_privilege('sophia_api','sophia.selection_snapshot(uuid,uuid[])','EXECUTE')
    OR has_function_privilege('sophia_worker','sophia.selection_snapshot(uuid,uuid[])','EXECUTE') THEN
  RAISE EXCEPTION 'The snapshot is not sophia_api''s alone'; END IF;
 FOR f IN SELECT p.oid::regprocedure AS sig, p.proname, p.prosecdef, p.proconfig, p.proacl FROM pg_proc p
   WHERE p.pronamespace='sophia'::regnamespace AND p.proname IN ('account_protection_refusal','account_protection_view',
    'qualify_api_account','revoke_api_account_qualification','selection_grant_unusable_at','selection_global_route_at',
    'selection_account_qualification_at','selection_runtime_ready_at','selection_account_committed','selection_protection_at',
    'selection_project_budget','selection_api_candidate','selection_native_candidate','selection_source','selection_snapshot',
    'account_qualification_view') LOOP
  IF f.proname<>'selection_snapshot' AND (has_function_privilege('sophia_api',f.sig,'EXECUTE')
     OR has_function_privilege('sophia_worker',f.sig,'EXECUTE') OR has_function_privilege('sophia_conversation_assembler',f.sig,'EXECUTE')) THEN
   RAISE EXCEPTION 'An application role executes %', f.sig; END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0) THEN RAISE EXCEPTION '% is executable by PUBLIC', f.sig; END IF;
  IF f.proname='selection_snapshot' AND (NOT f.prosecdef
     OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, sophia','TimeZone=UTC']) THEN
   RAISE EXCEPTION 'The snapshot is not a definer with a fixed search_path in UTC: %', f.proconfig; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND proname IN ('selection_snapshot','qualify_api_account',
   'revoke_api_account_qualification'))<>3 THEN RAISE EXCEPTION 'A 0104 entry point is missing'; END IF;
 IF has_table_privilege('sophia_api','sophia.api_account_qualifications','SELECT')
    OR has_table_privilege('sophia_worker','sophia.api_account_qualifications','SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='sophia.api_account_qualifications'::regclass) THEN
  RAISE EXCEPTION 'The qualification table is readable or without RLS'; END IF;
END $$;

-- --- the 0104 runtime_instances reader: scoped to one known contribution link --------------------------------------------
-- The global detector is 0094's selector classification (FROM or JOIN), which lists selection_runtime_ready_at as scoped.
-- This block covers only the 0104 functions it names: of them, only that helper may mention the table, and it stays a
-- boolean availability fact for a grant's OWN contribution runtime (its project, connection and current credential
-- revision) that chooses no runtime for any work. It does not detect a new function left off its list.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.proname, p.prosrc, p.prorettype, p.prosecdef, p.oid::regprocedure AS sig FROM pg_proc p
   WHERE p.pronamespace='sophia'::regnamespace AND p.prosrc ~* 'runtime_instances'
    AND p.proname IN ('account_protection_refusal','account_protection_view','account_qualification_view','qualify_api_account',
     'revoke_api_account_qualification','selection_grant_unusable_at','selection_global_route_at','selection_account_qualification_at',
     'selection_runtime_ready_at','selection_account_committed','selection_protection_at','selection_project_budget',
     'selection_api_candidate','selection_native_candidate','selection_source','selection_snapshot') LOOP
  IF f.proname<>'selection_runtime_ready_at' THEN RAISE EXCEPTION 'Unlisted runtime_instances reader in 0104: %', f.proname; END IF;
  IF f.prorettype<>'boolean'::regtype OR f.prosecdef
     OR position('x.connection_id=conn.id AND x.credential_revision=conn.credential_revision' IN f.prosrc)=0
     OR position('x.project_id=gr.project_id' IN f.prosrc)=0 OR position('sophia.api_contribution_runtimes x' IN f.prosrc)=0
     OR f.prosrc ~* 'order\s+by|limit\s' THEN
   RAISE EXCEPTION '% is no longer a scoped boolean fact of the grant''s own contribution runtime', f.sig; END IF;
 END LOOP;
END $$;

-- --- fixtures (migration owner) ----------------------------------------------------------------------------------------
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('a4000000-0000-0000-0000-000000000001','Project A','a4000000-0000-0000-0000-0000000000a1'),
 ('a4000000-0000-0000-0000-000000000002','Project B','a4000000-0000-0000-0000-0000000000b1');
INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES
 ('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-0000000000a1','admin'),
 ('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-0000000000a2','editor'),
 ('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-0000000000a3','viewer'),
 ('a4000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-0000000000b1','admin');
SELECT sophia.set_research_grant('a4000000-0000-0000-0000-000000000001','enabled',5,40,'web-pilot-v1','approval:test');
SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',
 now()+interval '1 day');

-- The owner (a1): an account, a connection, a grant to project A.
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a1',true);
CREATE TEMP TABLE ids(k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
DO $$ DECLARE acc uuid; conn uuid; g jsonb; BEGIN
 acc:=(sophia.api_account_create('My API',10,2,'owner_declared',NULL)->>'accountId')::uuid;
 conn:=(sophia.api_connection_create(acc,'Research key','Operator host')->>'connectionId')::uuid;
 g:=sophia.api_grant_create(conn,'a4000000-0000-0000-0000-000000000001',jsonb_build_object('expiresAt',now()+interval '30 days',
  'taskCapUsd',1,'totalCapUsd',5,'fundingPolicy','bounded_total_spend','fundingAcknowledgementRef','ack-1'));
 INSERT INTO ids VALUES('acc',acc),('conn',conn),('grant',g->>'grantId');
END $$;
RESET ROLE;
-- The operator registers custody (credential revision 1) and the runtime reports ready (synthetic).
SELECT sophia.register_contribution_runtime('a4000000-0000-0000-0000-000000000001',(SELECT v::uuid FROM ids WHERE k='conn'),
 'sophia-runtime-test',sha256('synthetic-token-1'::bytea));
UPDATE sophia.runtime_instances SET lease_id=gen_random_uuid(), seen_at=now(), ready_state='ready',
 roles='[{"id":"sophia-research-md-v1","route":"research-sol-medium-v1"}]'
 WHERE project_id='a4000000-0000-0000-0000-000000000001' AND state='active';

-- --- owner protection: whole, scoped, owner-only ------------------------------------------------------------------------
DO $$ DECLARE acc uuid:=(SELECT v::uuid FROM ids WHERE k='acc'); bad jsonb; BEGIN
 -- Absent by default: no declaration, no backfill.
 IF (SELECT protection_applicability FROM sophia.api_accounts WHERE id=acc) IS NOT NULL THEN RAISE EXCEPTION 'A default declaration'; END IF;
 -- The table refuses a partial or unscoped declaration even from the migration owner.
 BEGIN UPDATE sophia.api_accounts SET protection_applicability='none_applicable' WHERE id=acc;
  RAISE EXCEPTION 'A partial declaration was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE sophia.api_accounts SET protection_applicability='none_applicable', protection_operations='{research,review}',
   protection_roles='{sophia-research-md-v1}', protection_declared_at=now() WHERE id=acc;
  RAISE EXCEPTION 'A wider scope was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE sophia.api_accounts SET protection_applicability='protected', protection_operations='{research}',
   protection_roles='{sophia-research-md-v1}', protection_declared_at=now() WHERE id=acc;
  RAISE EXCEPTION 'A protected declaration without an amount was stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 -- The refusal names every malformed shape, and accepts both closed forms.
 FOREACH bad IN ARRAY ARRAY['[]','{"applicability":"protected","operations":["research"]}',
   '{"applicability":"maybe","operations":["research"],"roles":["sophia-research-md-v1"]}',
   '{"applicability":"none_applicable","operations":["research","review"],"roles":["sophia-research-md-v1"]}',
   '{"applicability":"protected","operations":["research"],"roles":["sophia-research-md-v1"],"protectedConcurrency":1.5}',
   '{"applicability":"protected","operations":["research"],"roles":["sophia-research-md-v1"],"protectedSpendUsd":0}',
   '{"applicability":"protected","operations":["research"],"roles":["sophia-research-md-v1"],"validUntil":"tomorrow"}',
   '{"applicability":"none_applicable","operations":["research"],"roles":["sophia-research-md-v1"],"owner":"x"}']::jsonb[] LOOP
  IF sophia.account_protection_refusal(bad) IS NULL THEN RAISE EXCEPTION 'Accepted %', bad; END IF;
 END LOOP;
 IF sophia.account_protection_refusal('{"applicability":"none_applicable","operations":["research"],"roles":["sophia-research-md-v1"]}') IS NOT NULL
    OR sophia.account_protection_refusal('{"applicability":"protected","operations":["research"],"roles":["sophia-research-md-v1"],
     "protectedConcurrency":1,"protectedSpendUsd":2.5,"validUntil":"2099-01-01T00:00:00Z"}') IS NOT NULL THEN
  RAISE EXCEPTION 'A closed declaration was refused'; END IF;
END $$;

SET LOCAL ROLE sophia_api;
-- Another member cannot declare for the owner's account.
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a2',true);
DO $$ BEGIN
 PERFORM sophia.api_contribution_write('account_update','k-other',jsonb_build_object('accountId',(SELECT v FROM ids WHERE k='acc'),
  'expectedRevision',1,'patch',jsonb_build_object('protection',jsonb_build_object('applicability','none_applicable',
  'operations',jsonb_build_array('research'),'roles',jsonb_build_array('sophia-research-md-v1')))));
 RAISE EXCEPTION 'A non-owner declared protection';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a1',true);
DO $$ DECLARE r jsonb; acc text:=(SELECT v FROM ids WHERE k='acc'); req jsonb; BEGIN
 req:=jsonb_build_object('accountId',acc,'expectedRevision',1,'patch',jsonb_build_object('protection',jsonb_build_object(
  'applicability','protected','operations',jsonb_build_array('research'),'roles',jsonb_build_array('sophia-research-md-v1'),
  'protectedConcurrency',1)));
 r:=sophia.api_contribution_write('account_update','k-protect',req);
 IF (r->>'revision')::bigint<>2 THEN RAISE EXCEPTION 'The declaration did not advance the revision: %', r; END IF;
 -- The same key and request replays; another request under the key conflicts (unchanged 0094 semantics).
 IF sophia.api_contribution_write('account_update','k-protect',req)<>r THEN RAISE EXCEPTION 'No replay'; END IF;
 BEGIN PERFORM sophia.api_contribution_write('account_update','k-protect',jsonb_set(req,'{patch,protection,protectedConcurrency}','2'));
  RAISE EXCEPTION 'A changed request under the key'; EXCEPTION WHEN unique_violation THEN NULL; END;
 -- A stale revision is refused; a cap edit below the declared amount is refused as any invalid account is.
 BEGIN PERFORM sophia.api_contribution_write('account_update','k-stale',jsonb_build_object('accountId',acc,'expectedRevision',1,
   'patch',jsonb_build_object('label','x'))); RAISE EXCEPTION 'A stale revision'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM sophia.api_contribution_write('account_update','k-cap',jsonb_build_object('accountId',acc,'expectedRevision',2,
   'patch',jsonb_build_object('concurrency',1,'protection',jsonb_build_object('applicability','protected',
   'operations',jsonb_build_array('research'),'roles',jsonb_build_array('sophia-research-md-v1'),'protectedConcurrency',2))));
  RAISE EXCEPTION 'A protected amount above the account limit'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.api_contribution_write('account_update','k-bad',jsonb_build_object('accountId',acc,'expectedRevision',2,
   'patch',jsonb_build_object('protection',jsonb_build_object('applicability','none_applicable',
   'operations',jsonb_build_array('research'),'roles',jsonb_build_array('sophia-research-md-v1'),'protectedSpendUsd',1))));
  RAISE EXCEPTION 'none_applicable with an amount'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- The owner's own readout shows it; the existing fields are unchanged.
 r:=(sophia.api_contributions_mine()->'accounts'->0);
 IF r->'protection'->>'applicability'<>'protected' OR (r->'protection'->>'protectedConcurrency')::int<>1
    OR r->'protection'->'declaredAt' IS NULL OR r->>'providerBalance'<>'unknown' OR (r->>'revision')::int<>2 THEN
  RAISE EXCEPTION 'Readout: %', r; END IF;
END $$;
RESET ROLE;

-- --- account qualification (operator) ----------------------------------------------------------------------------------
DO $$ DECLARE conn sophia.api_connections; q jsonb; t0 timestamptz:='2026-01-01T00:00:00Z'; BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=(SELECT v::uuid FROM ids WHERE k='conn');
 IF sophia.selection_account_qualification_at(conn,now())->>'state'<>'none' THEN RAISE EXCEPTION 'A qualification by default'; END IF;
 BEGIN PERFORM sophia.qualify_api_account(conn.id,'{research}','operator_verified_call','evidence:synthetic',now()+interval '1 hour',
   now()+interval '2 hours'); RAISE EXCEPTION 'A future observation'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sophia.qualify_api_account(conn.id,'{review}','operator_verified_call','evidence:synthetic',t0,t0+interval '1 day');
  RAISE EXCEPTION 'Another operation'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 q:=sophia.qualify_api_account(conn.id,'{research}','operator_verified_call','evidence:synthetic',t0,t0+interval '1 day');
 IF (q->>'credentialRevision')::int<>1 THEN RAISE EXCEPTION 'Not bound to the current revision: %', q; END IF;
 BEGIN PERFORM sophia.qualify_api_account(conn.id,'{research}','operator_verified_call','evidence:synthetic',t0,t0+interval '2 days');
  RAISE EXCEPTION 'Two live qualifications'; EXCEPTION WHEN unique_violation THEN NULL; END;
 -- Current from its observation to just before its expiry; expired at the exact instant (one explicit clock).
 IF sophia.selection_account_qualification_at(conn,t0-interval '1 microsecond')->>'state'<>'none'
    OR sophia.selection_account_qualification_at(conn,t0)->>'state'<>'current'
    OR sophia.selection_account_qualification_at(conn,t0+interval '1 day'-interval '1 microsecond')->>'state'<>'current'
    OR sophia.selection_account_qualification_at(conn,t0+interval '1 day')->>'state'<>'expired' THEN
  RAISE EXCEPTION 'Boundary'; END IF;
 IF sophia.selection_account_qualification_at(conn,t0)->'operations'<>'["research"]' THEN RAISE EXCEPTION 'Operations'; END IF;
 PERFORM sophia.revoke_api_account_qualification((q->>'qualificationId')::uuid,'synthetic revocation');
 -- Revocation is stamped at the clock, so it is judged at a later instant than the transaction's start.
 IF sophia.selection_account_qualification_at(conn,clock_timestamp())->>'state'<>'revoked' THEN RAISE EXCEPTION 'Not revoked'; END IF;
 -- A rotation: a fresh qualification at the new revision is current; the old record alone would be stale.
 PERFORM sophia.qualify_api_account(conn.id,'{research}','operator_verified_console','evidence:synthetic-2',now()-interval '1 minute',
  now()+interval '1 day');
END $$;
SELECT sophia.register_contribution_runtime('a4000000-0000-0000-0000-000000000001',(SELECT v::uuid FROM ids WHERE k='conn'),
 'sophia-runtime-test',sha256('synthetic-token-2'::bytea),true);
DO $$ DECLARE conn sophia.api_connections; BEGIN
 SELECT * INTO conn FROM sophia.api_connections WHERE id=(SELECT v::uuid FROM ids WHERE k='conn');
 IF conn.credential_revision<>2 OR sophia.selection_account_qualification_at(conn,now())->>'state'<>'stale' THEN
  RAISE EXCEPTION 'A rotation did not stale the account qualification: %', sophia.selection_account_qualification_at(conn,now()); END IF;
 PERFORM sophia.qualify_api_account(conn.id,'{research}','operator_verified_call','evidence:synthetic-3',now()-interval '1 minute',
  now()+interval '1 day');
 IF sophia.selection_account_qualification_at(conn,now())->>'state'<>'current' THEN RAISE EXCEPTION 'Not current at revision 2'; END IF;
END $$;
UPDATE sophia.runtime_instances SET lease_id=gen_random_uuid(), seen_at=now(), ready_state='ready',
 roles='[{"id":"sophia-research-md-v1","route":"research-sol-medium-v1"}]'
 WHERE project_id='a4000000-0000-0000-0000-000000000001' AND state='active';

-- The owner alone reads their connection's account qualification: state and provenance, never the evidence reference.
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a1',true);
DO $$ DECLARE m jsonb; q jsonb; BEGIN
 m:=sophia.api_contributions_mine(); q:=m->'connections'->0->'accountQualification';
 IF q->>'state'<>'current' OR q->>'verification'<>'operator_verified_call' OR q->>'recordedBy'<>'operator'
    OR (q->>'credentialRevision')::int<>2 OR q->'expiresAt' IS NULL OR (q->>'revoked')::boolean THEN
  RAISE EXCEPTION 'Owner qualification readout: %', q; END IF;
 IF m::text ~ 'evidence' THEN RAISE EXCEPTION 'The evidence reference leaked: %', m; END IF;
END $$;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a2',true);
DO $$ BEGIN
 IF sophia.api_contributions_mine()->'connections'<>'[]' THEN RAISE EXCEPTION 'Another member read the owner''s connection'; END IF;
END $$;
RESET ROLE;

-- --- at-time helpers: one explicit instant, deterministic boundaries -------------------------------------------------------
DO $$ DECLARE gr sophia.api_contribution_grants; conn sophia.api_connections; t timestamptz; BEGIN
 SELECT * INTO gr FROM sophia.api_contribution_grants WHERE id=(SELECT v::uuid FROM ids WHERE k='grant');
 SELECT * INTO conn FROM sophia.api_connections WHERE id=gr.connection_id;
 IF sophia.selection_grant_unusable_at(gr,gr.expires_at-interval '1 microsecond') IS NOT NULL
    OR sophia.selection_grant_unusable_at(gr,gr.expires_at)<>'grant_expired' THEN RAISE EXCEPTION 'Grant expiry boundary'; END IF;
 -- Parity away from the boundary with the unchanged wall-clock helpers.
 IF sophia.selection_grant_unusable_at(gr,clock_timestamp()) IS DISTINCT FROM sophia.contribution_grant_unusable(gr)
    OR (sophia.selection_global_route_at(gr.route_id,gr.model,gr.effort,clock_timestamp())='current')
     <>sophia.contribution_route_qualified(gr.route_id,gr.model,gr.effort)
    OR sophia.selection_runtime_ready_at(gr,conn,clock_timestamp())<>((sophia.contribution_runtime_of(gr,conn)).id IS NOT NULL) THEN
  RAISE EXCEPTION 'Parity with the existing helpers'; END IF;
 -- The runtime's 90-second liveness at an explicit instant.
 SELECT seen_at INTO t FROM sophia.runtime_instances WHERE project_id=gr.project_id AND state='active' AND lease_id IS NOT NULL LIMIT 1;
 IF NOT sophia.selection_runtime_ready_at(gr,conn,t+interval '90 seconds')
    OR sophia.selection_runtime_ready_at(gr,conn,t+interval '90 seconds'+interval '1 microsecond') THEN
  RAISE EXCEPTION 'Runtime liveness boundary'; END IF;
 IF sophia.selection_global_route_at(gr.route_id,gr.model,'high',now())<>'none' THEN RAISE EXCEPTION 'Another effort is qualified'; END IF;
END $$;

-- --- the snapshot ------------------------------------------------------------------------------------------------------
INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state) VALUES
 ('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-00000000f001','a4000000-0000-0000-0000-0000000000a1','project',
  repeat('a',64),'text/plain','k/f1',1,true,'ready'),
 ('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-00000000f002','a4000000-0000-0000-0000-0000000000a1','project',
  repeat('b',64),'text/plain','k/f2',1,false,'deleted'),
 ('a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-00000000f003','a4000000-0000-0000-0000-0000000000a2','private',
  repeat('c',64),'text/plain','k/f3',1,true,'ready');
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000b1',true);
DO $$ BEGIN
 IF sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}') IS NOT NULL
    OR sophia.selection_snapshot('a4000000-0000-0000-0000-0000000000ff','{}') IS NOT NULL THEN
  RAISE EXCEPTION 'A nonmember or a missing project read a snapshot'; END IF;
END $$;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a2',true);
DO $$ DECLARE s jsonb; c jsonb; BEGIN
 BEGIN PERFORM sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001',
   ARRAY['a4000000-0000-0000-0000-00000000f001','a4000000-0000-0000-0000-00000000f001']::uuid[]);
  RAISE EXCEPTION 'Duplicate sources'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 s:=sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001',ARRAY['a4000000-0000-0000-0000-00000000f001',
  'a4000000-0000-0000-0000-00000000f002','a4000000-0000-0000-0000-00000000f003','a4000000-0000-0000-0000-00000000f0ff']::uuid[]);
 IF s->>'evaluatedAt' !~ '\+00:00$' OR NOT (s->>'complete')::boolean OR s->'member'->>'role'<>'editor' OR s->'gate'->>'state'<>'enabled'
    OR NOT (s->>'projectBudget')::boolean OR s->'pin'<>'null' THEN RAISE EXCEPTION 'Snapshot head: %', s; END IF;
 IF (SELECT array_agg(x->>'state' ORDER BY n) FROM jsonb_array_elements(s->'sources') WITH ORDINALITY AS e(x,n))
    <>ARRAY['eligible','withdrawn','ineligible','missing'] THEN RAISE EXCEPTION 'Sources: %', s->'sources'; END IF;
 c:=s->'candidates'->0;
 IF jsonb_array_length(s->'candidates')<>1 OR c->>'kind'<>'api' OR c->>'globalRoute'<>'current'
    OR c->'accountQualification'->>'state'<>'current' OR NOT (c->>'runtimeReady')::boolean OR c->>'proofStatus'<>'valid'
    OR c->'unusable'<>'[]' OR NOT (c->>'requesterEligible')::boolean OR NOT (c->'capacity'->>'admits')::boolean
    OR (c->>'uncertainEffects')::boolean OR c->>'connectionState'<>'connected' THEN RAISE EXCEPTION 'Candidate: %', c; END IF;
 -- protectedConcurrency 1 of 2: one more task leaves the protected slot free.
 IF c->'protection'<>'{"witness":"covered","dimensions":[{"ref":"account_concurrency","verdict":"preserves_protected"}]}' THEN
  RAISE EXCEPTION 'Protection: %', c->'protection'; END IF;
 -- No amount, label, list or evidence reaches the snapshot.
 IF s::text ~* 'Usd"|"label"|eligibleActors|evidence|Research key|My API|Operator host|"[0-9]+\.[0-9]+"|: [0-9]+\.[0-9]+' THEN
  RAISE EXCEPTION 'A private value: %', s; END IF;
END $$;
RESET ROLE;

-- Protection variants: a full protected slot, none_applicable, expiry, withdrawal.
UPDATE sophia.api_accounts SET concurrency_limit=1, protected_concurrency=1 WHERE id=(SELECT v::uuid FROM ids WHERE k='acc');
SET LOCAL ROLE sophia_api;
DO $$ DECLARE c jsonb; BEGIN
 c:=sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}')->'candidates'->0;
 IF c->'protection'->'dimensions'->0->>'verdict'<>'would_violate' THEN RAISE EXCEPTION 'Violation: %', c->'protection'; END IF;
END $$;
RESET ROLE;
UPDATE sophia.api_accounts SET protection_applicability='none_applicable', protected_concurrency=NULL
 WHERE id=(SELECT v::uuid FROM ids WHERE k='acc');
SET LOCAL ROLE sophia_api;
DO $$ BEGIN
 IF sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}')->'candidates'->0->'protection'<>'{"witness":"none_applicable"}' THEN
  RAISE EXCEPTION 'none_applicable'; END IF;
END $$;
RESET ROLE;
UPDATE sophia.api_accounts SET protection_declared_at=now()-interval '2 days', protection_valid_until=now()-interval '1 day'
 WHERE id=(SELECT v::uuid FROM ids WHERE k='acc');
SET LOCAL ROLE sophia_api;
DO $$ BEGIN
 IF sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}')->'candidates'->0->'protection'<>'{"witness":"policy_absent"}' THEN
  RAISE EXCEPTION 'An expired declaration still counted'; END IF;
END $$;
-- Withdrawn by the owner: policy_absent again.
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a1',true);
DO $$ DECLARE rev bigint; BEGIN
 SELECT (x->>'revision')::bigint INTO rev FROM jsonb_array_elements(sophia.api_contributions_mine()->'accounts') x LIMIT 1;
 PERFORM sophia.api_contribution_write('account_update','k-withdraw-2',jsonb_build_object('accountId',(SELECT v FROM ids WHERE k='acc'),
  'expectedRevision',rev,'patch','{"protection":null}'::jsonb));
 IF sophia.api_contributions_mine()->'accounts'->0->'protection'<>'null'
    OR sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}')->'candidates'->0->'protection'<>'{"witness":"policy_absent"}' THEN
  RAISE EXCEPTION 'Withdrawal'; END IF;
END $$;
RESET ROLE;

-- The requester's Pin to a grant that is then revoked stays in the pool, with its refusal.
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a2',true);
SELECT sophia.research_funding_pin_set('a4000000-0000-0000-0000-000000000001',(SELECT v::uuid FROM ids WHERE k='grant'),
 (SELECT revision FROM sophia.api_contributions_for_project('a4000000-0000-0000-0000-000000000001') p,
  jsonb_to_recordset(p->'contributions') AS x(revision bigint) LIMIT 1));
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a1',true);
SELECT sophia.api_grant_set_state((SELECT v::uuid FROM ids WHERE k='grant'),
 (SELECT revision FROM sophia.api_contributions_mine() m, jsonb_to_recordset(m->'grants') AS x(revision bigint) LIMIT 1),'revoked');
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a2',true);
DO $$ DECLARE s jsonb; BEGIN
 s:=sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}');
 IF jsonb_array_length(s->'candidates')<>1 OR s->'pin'->>'grantId'<>(SELECT v FROM ids WHERE k='grant')
    OR s->'candidates'->0->'unusable'<>'["grant_revoked","pin_stale"]' OR s->'candidates'->0->>'proofStatus'<>'revoked' THEN
  RAISE EXCEPTION 'Revoked Pin: %', s; END IF;
END $$;
-- Another member, without the Pin, does not see the revoked grant at all.
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a3',true);
DO $$ DECLARE s jsonb; BEGIN
 s:=sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}');
 IF jsonb_array_length(s->'candidates')<>0 OR s->'member'->>'role'<>'viewer' THEN RAISE EXCEPTION 'Viewer: %', s; END IF;
END $$;
RESET ROLE;

-- More than 200: a 201st row makes the snapshot incomplete, listing none.
INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES
 ('a4000000-0000-0000-0000-0000000000c1','a4000000-0000-0000-0000-0000000000a1','synthetic','synthetic','linked');
INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
 SELECT 'a4000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-0000000000a1','a4000000-0000-0000-0000-0000000000c1',
  'codex-native','synthetic','/synthetic','active' FROM generate_series(1,200);
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a3',true);
DO $$ DECLARE s jsonb; BEGIN
 s:=sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}');
 IF NOT (s->>'complete')::boolean OR jsonb_array_length(s->'candidates')<>200 THEN RAISE EXCEPTION '200 is complete: %', s->>'complete'; END IF;
 IF s->'candidates'->0->>'kind'<>'native' OR s->'candidates'->0->>'route'<>'none' OR s->'candidates'->0->'sourcePolicy'<>'null' THEN
  RAISE EXCEPTION 'Native: %', s->'candidates'->0; END IF;
END $$;
SELECT set_config('sophia.actor_id','a4000000-0000-0000-0000-0000000000a2',true);
DO $$ DECLARE s jsonb; BEGIN
 -- The requester's revoked pinned grant is the 201st member of their pool.
 s:=sophia.selection_snapshot('a4000000-0000-0000-0000-000000000001','{}');
 IF (s->>'complete')::boolean OR jsonb_array_length(s->'candidates')<>0 THEN RAISE EXCEPTION '201 is incomplete: %', s->>'complete'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
