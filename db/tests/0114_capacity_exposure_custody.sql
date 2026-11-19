-- INC04-R07 C4/C5 W1 (0114): capacity-exposure custody. Run against a disposable database with every migration
-- installed. Never use production. Everything below rolls back. Every scope, window, issuer, binding, mapping,
-- attribution, finality, reservation and identity is SYNTHETIC: nothing here qualifies a real account, route, provider,
-- issuer, clock, mapping or telemetry source.
-- * Privileges: every new function and table is closed to every application role and PUBLIC; the marker answers 114.
-- * The codec is R2's, byte for byte: the frozen fixture identities of the window, key, issuer, attribution and
--   finality domains; refusals in R2's order (keys, grammar with a real calendar, cross-field).
-- * Each append: replay keeps its receipt; a different payload is one sticky conflict whose retry keeps its receipt.
-- * Binding refusals in order (unregistered window, issuer, reading, scope, unit, window/epoch, time, value, revoked).
-- * Mappings: cache_write and model-request counts are unsupported. Attributions need a binding, a qualified issuer and
--   an effect on the scope's account. Finality FG01-FG05 rows and receipts persist (the fold is the pure module's).
-- * The seal: no update, delete, truncate or direct write.
-- * The read: null without a recorded reading, never_bound, bound with cross-project effects, restricted after a
--   revocation; and selection_api_candidate reads the switch.
-- * B1 (Root88): an account ledger reservation (0094) with no 0109 identity, in ANY project, makes the read's effect set
--   unrepresented (incomplete); a ledger row of another account, or of a search reservation, does not.
-- * W1-F01 (Root89): a mapping's issuer must be qualified in its OWN scope. A new mapping by an issuer whose separate
--   parent scope has conflicted is refused (an exact replay still returns its receipt); at read time such a mapping is
--   carried as ineligible and restrictive, while the bound window's own scope stays valid.
-- Reservation, identity and truth rows are inserted with replication-role triggers suspended, in this transaction only:
-- their foreign-key targets (allowances, evidence guards) are outside this slice's declaration grant. The helpers read
-- only the granted tables. B1's contribution-task and ledger rows (0094, declarations read under Root88) are written the
-- same way: this file has no grant or job fixture, so their grant and job references do not resolve here (the API DB
-- test builds them against a real account and grants, with only the job reference left unresolved).
BEGIN;

-- --- privileges and the marker -------------------------------------------------------------------------------------
DO $$ DECLARE f regprocedure; t text; r text; n integer:=0; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='sophia'
   AND (p.proname LIKE 'capacity\_exposure\_%' OR p.proname IN ('capacity_binding_refusal','register_capacity_scope',
    'register_capacity_window','register_capacity_issuer','bind_capacity_observation','revoke_capacity_binding',
    'register_capacity_mapping','append_capacity_attribution','append_capacity_finality','selection_capacity_exposure_at',
    'selection_capacity_exposure_0114')) LOOP
  n:=n+1;
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION '% may execute %', r, f; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=f AND a.grantee=0) THEN RAISE EXCEPTION 'PUBLIC may execute %', f; END IF;
 END LOOP;
 IF n<30 THEN RAISE EXCEPTION 'Expected the 0114 functions, found %', n; END IF;
 FOREACH t IN ARRAY ARRAY['capacity_exposure_scopes','capacity_window_registrations','capacity_exposure_issuers',
   'capacity_observation_bindings','capacity_binding_revocations','capacity_dimension_mappings','capacity_attributions',
   'capacity_effect_finality','capacity_exposure_conflicts'] LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker'] LOOP
   IF has_table_privilege(r,'sophia.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION '% may use %', r, t; END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('sophia.'||t)::regclass) THEN RAISE EXCEPTION 'RLS off on %', t; END IF;
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=('sophia.'||t)::regclass) THEN RAISE EXCEPTION 'A policy on %', t; END IF;
 END LOOP;
 IF sophia.selection_capacity_exposure_0114()<>114 THEN RAISE EXCEPTION 'The 0114 marker is missing'; END IF;
 IF has_function_privilege('sophia_api',
   'sophia.selection_api_candidate(sophia.api_contribution_grants,uuid,sophia.research_funding_pins,boolean,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'The candidate helper became executable'; END IF;
END $$;

-- --- the codec: R2's frozen fixture identities (codec_r2.py) ------------------------------------------------------------
DO $$ DECLARE c text; BEGIN
 c:=sophia.capacity_exposure_canonical('sophia.c4c5.window.register.v1','{"scope_id":"00000000-0000-4000-8000-000000000001",
  "qual_revision":1,"dimension":"openai.output_tokens","unit":"tokens","window_kind":"day","epoch_key":"2026-11-15|-",
  "window_start":"2026-11-15T00:00:00.000000Z","window_end":"2026-11-16T00:00:00.000000Z","window_semantics":"fixed_epoch",
  "measurement_basis":"issuer_local","epoch_basis":"provider_reported",
  "approval_ref_digest":"da838b5e2e528d048f80fd810fd8d85662d369f0523dde572b76b4398986e3a0",
  "evidence_digest":"94359b26afaa82f2bd6546c29ebfd8818b7007ef67551c8c30a8c7d8a9b5bb61"}');
 IF octet_length(c)<>393 OR sophia.capacity_exposure_digest(c)<>'08f1c27eb7c027b41626b98adb289a01dc537bd57b5868b18cac993cbfd07032'
  THEN RAISE EXCEPTION 'window.register.v1 differs from the frozen fixture: %', c; END IF;
 c:=sophia.capacity_exposure_canonical('sophia.c4c5.window.key.v1','{"scope_id":"00000000-0000-4000-8000-000000000001",
  "qual_revision":1,"dimension":"openai.output_tokens","window_kind":"day","epoch_key":"2026-11-15|-"}');
 IF octet_length(c)<>128 OR sophia.capacity_exposure_digest(c)<>'165c1619f82cff1743e425159c8880826ce50fbcdf4da8e24d2053cc6c40d9c5'
  THEN RAISE EXCEPTION 'window.key.v1 differs from the frozen fixture: %', c; END IF;
 c:=sophia.capacity_exposure_canonical('sophia.c4c5.issuer.register.v1','{"issuer_id":"00000000-0000-4000-8000-000000000002",
  "kind":"controlled_fixture","scope_id":"00000000-0000-4000-8000-000000000001","qual_revision":1,
  "registered_at":"2026-11-15T09:00:00.000000Z",
  "approval_ref_digest":"6811ddcedb825557a895ffc72178337472e82082c029dbee780ad5ec3e35149e",
  "evidence_digest":"0db237fed3e06759586a3bdea0096e21d17056d5d31a20f5b80a21575f065e57"}');
 IF octet_length(c)<>316 OR sophia.capacity_exposure_digest(c)<>'c8ffb2c60da41fd6e03198882ccf6c0307e2af601b2d916a567042e52e322df6'
  THEN RAISE EXCEPTION 'issuer.register.v1 differs from the frozen fixture: %', c; END IF;
 c:=sophia.capacity_exposure_canonical('sophia.c4c5.attribution.append.v1','{"observation_id":"00000000-0000-4000-8000-000000000003",
  "project_id":"00000000-0000-4000-8000-000000000004","reservation_id":"00000000-0000-4000-8000-000000000005",
  "dimension":"openai.output_tokens","coverage":"reflected","q":3000,"basis":"controlled_fixture",
  "n1":"s:d193af157149ce5b61fe881710d4954bdfb88a8ac20e3d15f4775e125a38141c","n2":null,
  "evidence_digest":"f56f6846d305a483a5d9e4c599d47ab99d90713648d63340c339418f58ff69a0",
  "issuer_id":"00000000-0000-4000-8000-000000000002","issuer_qual_revision":1}');
 IF octet_length(c)<>415 OR sophia.capacity_exposure_digest(c)<>'e34869b3e6f5449a528878051545431b1445052dafe774890e8cbab716b94824'
  THEN RAISE EXCEPTION 'attribution.append.v1 differs from the frozen fixture: %', c; END IF;
 c:=sophia.capacity_exposure_canonical('sophia.c4c5.finality.append.v1','{"project_id":"00000000-0000-4000-8000-000000000004",
  "reservation_id":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","basis":"provider_terminal_known",
  "final_at":"2026-11-15T09:30:00.000000Z","count_kind":"final_total","final_count":4000,
  "evidence_digest":"e1d5e717caa2a7554cf133e5a59ee4d8a049de66f6788f0ab49e1ea212bc8c2f",
  "approval_ref_digest":"c6f7cd9f8ef353c7295e135f8e475411d9282491177f4e128c2b685344ff921f",
  "issuer_id":"00000000-0000-4000-8000-000000000002","issuer_qual_revision":1}');
 IF octet_length(c)<>408 OR sophia.capacity_exposure_digest(c)<>'ce02de3361699d8b8d843d337310c4b4af188303cd6bc7da2636b414e3944a70'
  THEN RAISE EXCEPTION 'finality.append.v1 differs from the frozen fixture: %', c; END IF;
END $$;

-- The refusal code of one expression (SQLSTATE 22023, message = the code), or 'accepted'.
CREATE FUNCTION pg_temp.code(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE p_sql;
 RETURN 'accepted';
EXCEPTION WHEN SQLSTATE '22023' THEN RETURN SQLERRM;
END $$;
CREATE FUNCTION pg_temp.expect(p_sql text, p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text:=pg_temp.code(p_sql);
BEGIN
 IF got IS DISTINCT FROM p_code THEN RAISE EXCEPTION 'Expected %, got % for %', p_code, got, p_sql; END IF;
END $$;
CREATE FUNCTION pg_temp.canon(p_domain text, p jsonb) RETURNS text LANGUAGE sql AS $$
 SELECT sophia.capacity_exposure_canonical(p_domain,p) $$;
CREATE FUNCTION pg_temp.hex(p_seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(p_seed,'UTF8')),'hex') $$;

-- --- the codec's refusals, in R2's order ---------------------------------------------------------------------------------
DO $$ DECLARE w jsonb:=jsonb_build_object('scope_id','00000000-0000-4000-8000-000000000001','qual_revision',1,
  'dimension','openai.output_tokens','unit','tokens','window_kind','day','epoch_key','e1',
  'window_start','2026-11-15T00:00:00.000000Z','window_end','2026-11-16T00:00:00.000000Z','window_semantics','fixed_epoch',
  'measurement_basis','issuer_local','epoch_basis','provider_reported','approval_ref_digest',pg_temp.hex('a'),
  'evidence_digest',pg_temp.hex('e'));
 f jsonb:=jsonb_build_object('project_id','00000000-0000-4000-8000-000000000004','reservation_id','00000000-0000-4000-8000-000000000005',
  'dimension','openai.output_tokens','basis','provider_terminal_known','final_at','2026-11-15T09:30:00.000000Z',
  'count_kind','final_total','final_count',4000,'evidence_digest',pg_temp.hex('e'),'approval_ref_digest',pg_temp.hex('a'),
  'issuer_id','00000000-0000-4000-8000-000000000002','issuer_qual_revision',1);
 q text:='SELECT pg_temp.canon(%L,%L)';
BEGIN
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w-'evidence_digest'),'payload_incomplete');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"extra":1}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',(w-'evidence_digest')||'{"extra":1}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"window_start":"2026-02-30T00:00:00.000000Z"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"window_start":"2026-11-15T24:00:00.000000Z"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"window_start":"2026-13-15T00:00:00.000000Z"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"window_start":"2026-11-15T00:00:00Z"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"qual_revision":1.0}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"qual_revision":0}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"qual_revision":"1"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"scope_id":"00000000-0000-4000-8000-00000000000A"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"epoch_key":"a b"}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"evidence_digest":null}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"window_kind":"week"}'),'payload_invalid');
 -- Cross-field rules run on already-valid values only.
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"unit":"requests"}'),'window_unit_mismatch');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.window.register.v1',w||'{"window_end":"2026-11-15T00:00:00.000000Z"}'),'window_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.finality.append.v1',f||'{"final_count":null}'),'finality_count_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.finality.append.v1',f||'{"count_kind":"none"}'),'finality_count_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.finality.append.v1',f||'{"basis":"never_left_release"}'),'finality_count_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.finality.append.v1',f||'{"basis":"never_left_release","final_count":0}'),'accepted');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.finality.append.v1',f||'{"final_at":"2026-02-30T00:00:00.000000Z","final_count":null}'),'payload_invalid');
 PERFORM pg_temp.expect(format(q,'sophia.c4c5.attribution.append.v1',jsonb_build_object('observation_id','00000000-0000-4000-8000-000000000003',
  'project_id','00000000-0000-4000-8000-000000000004','reservation_id','00000000-0000-4000-8000-000000000005',
  'dimension','openai.output_tokens','coverage','not_reflected','q',5,'basis','controlled_fixture','n1',null,'n2',null,
  'evidence_digest',pg_temp.hex('e'),'issuer_id','00000000-0000-4000-8000-000000000002','issuer_qual_revision',1)),'att_q_invalid');
END $$;

-- --- SYNTHETIC fixtures: one account, its connection and qualifications, its readings ---------------------------------
INSERT INTO sophia.api_accounts(id,owner_id,provider,label,total_cap_usd) VALUES
 ('a7000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-0000000000e1','openai','synthetic account',20);
INSERT INTO sophia.api_connections(id,owner_id,account_id,label,route_id,model,effort,credential_ref,credential_revision,
 custodian_label,state) VALUES
 ('a7000000-0000-0000-0000-0000000000c1','a7000000-0000-0000-0000-0000000000e1','a7000000-0000-0000-0000-0000000000a1',
  'synthetic','research-sol-medium-v1','gpt-6.1-sol','medium','OPENAI_RESEARCH_API_KEY',1,'synthetic host','connected');
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text) ON COMMIT DROP;
WITH q AS (INSERT INTO sophia.api_route_qualifications(route_id,model,effort,evidence_ref,qualified_at,expires_at)
 VALUES('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()-interval '1 day',
  now()+interval '1 day') RETURNING id)
INSERT INTO fx SELECT 'route', id::text FROM q;
-- A second global route row (a different qualification id), for a scope that is not the reading's.
WITH q AS (INSERT INTO sophia.api_route_qualifications(route_id,model,effort,evidence_ref,qualified_at,expires_at)
 VALUES('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: other row',now()-interval '1 day',
  now()+interval '1 day') RETURNING id)
INSERT INTO fx SELECT 'route2', id::text FROM q;
INSERT INTO fx SELECT 'acq', sophia.qualify_api_account('a7000000-0000-0000-0000-0000000000c1','{research}',
 'operator_verified_call','synthetic: not a live qualification',now()-interval '1 hour',now()+interval '1 day')->>'qualificationId';
INSERT INTO fx SELECT 'acqrev', revision::text FROM sophia.api_account_qualifications WHERE id=(SELECT v FROM fx WHERE k='acq')::uuid;
INSERT INTO fx VALUES ('start', to_char((now()-interval '2 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
 ('end', to_char((now()+interval '22 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
CREATE FUNCTION pg_temp.fx(p text) RETURNS text LANGUAGE sql AS $$ SELECT v FROM fx WHERE k=p $$;

-- A reading of the fixture connection with one token window (value, epoch, unit as given).
CREATE FUNCTION pg_temp.reading(p_key text, p_window jsonb DEFAULT '{}') RETURNS uuid LANGUAGE sql AS $$
 SELECT (sophia.record_capacity_observation(jsonb_build_object('observationKey',p_key,
  'connectionId','a7000000-0000-0000-0000-0000000000c1','credentialRevision',1,
  'accountQualificationId',pg_temp.fx('acq'),'accountQualificationRevision',pg_temp.fx('acqrev')::bigint,
  'routeQualificationId',pg_temp.fx('route'),'operation','research','verification','operator_verified_console',
  'evidenceRef','synthetic evidence','sourceChannel','synthetic-console','windowSetRef','synthetic-limits','windowSetVersion','v1',
  'coverage','complete','requiredWindowRefs',jsonb_build_array('tokens-day'),'reflection','unknown',
  'observedAt',clock_timestamp()-interval '10 minutes','freshUntil',now()+interval '10 minutes',
  'windows',jsonb_build_array(jsonb_build_object('windowRef','tokens-day','windowEpoch','e1','scope','account',
   'unit','tokens','value',800,'verdict','admits','applicability','known')||p_window)))->>'observationId')::uuid $$;
INSERT INTO fx SELECT 'obs', pg_temp.reading('k1');
INSERT INTO fx SELECT 'obsfrac', pg_temp.reading('k-frac','{"value":1.5}');
INSERT INTO fx SELECT 'obsnull', pg_temp.reading('k-null','{"value":null}');
INSERT INTO fx SELECT 'obsrev', pg_temp.reading('k-rev');
SELECT sophia.revoke_capacity_observation(pg_temp.fx('obsrev')::uuid,'synthetic revocation');

-- Payload builders for this account's custody: `edits` overwrite the defaults.
CREATE FUNCTION pg_temp.scope(p_scope text, edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('scope_id',p_scope,'account_id','a7000000-0000-0000-0000-0000000000a1',
  'connection_id','a7000000-0000-0000-0000-0000000000c1','credential_revision',1,'route_id','research-sol-medium-v1',
  'model','gpt-6.1-sol','effort','medium','operation','research','account_qualification_id',pg_temp.fx('acq'),
  'account_qualification_revision',pg_temp.fx('acqrev')::bigint,'route_qualification_id',pg_temp.fx('route'),
  'approval_ref_digest',pg_temp.hex('approval'),'evidence_digest',pg_temp.hex('evidence'))||edits $$;
CREATE FUNCTION pg_temp.win(p_scope text, edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('scope_id',p_scope,'qual_revision',pg_temp.fx('acqrev')::bigint,'dimension','openai.output_tokens',
  'unit','tokens','window_kind','day','epoch_key','e1','window_start',pg_temp.fx('start'),'window_end',pg_temp.fx('end'),
  'window_semantics','fixed_epoch','measurement_basis','issuer_local','epoch_basis','provider_reported',
  'approval_ref_digest',pg_temp.hex('approval'),'evidence_digest',pg_temp.hex('evidence'))||edits $$;
CREATE FUNCTION pg_temp.issuer(p_issuer text, p_scope text, edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('issuer_id',p_issuer,'kind','controlled_fixture','scope_id',p_scope,
  'qual_revision',pg_temp.fx('acqrev')::bigint,'registered_at','2026-11-15T09:00:00.000000Z',
  'approval_ref_digest',pg_temp.hex('approval'),'evidence_digest',pg_temp.hex('evidence'))||edits $$;
CREATE FUNCTION pg_temp.bind(p_obs text, p_scope text, p_issuer text, edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('observation_id',p_obs,'window_ref','tokens-day','scope_id',p_scope,
  'qual_revision',pg_temp.fx('acqrev')::bigint,'dimension','openai.output_tokens','window_kind','day','epoch_key','e1',
  'kind','remaining_at','issuer_id',p_issuer,'issuer_seq',1,'measurement_id',null,'evidence_kind','controlled_fixture',
  'evidence_digest',pg_temp.hex('evidence'))||edits $$;

-- --- scopes, windows and issuers: receipts, replay, sticky conflicts, refusals ----------------------------------------
DO $$ DECLARE S text:='5c000000-0000-4000-8000-000000000001'; S2 text:='5c000000-0000-4000-8000-000000000002';
 SX text:='5c000000-0000-4000-8000-0000000000ff'; a jsonb; b jsonb; c jsonb; d jsonb;
BEGIN
 a:=sophia.register_capacity_scope(pg_temp.scope(S));
 b:=sophia.register_capacity_scope(pg_temp.scope(S));
 IF a->>'outcome'<>'recorded' OR a->>'replay'<>'false' OR b<>(a||'{"replay":true}') THEN
  RAISE EXCEPTION 'A scope replay is not its receipt: % %', a, b; END IF;
 -- A different payload under a recorded key: one sticky conflict; its retry keeps the receipt; nothing is updated.
 PERFORM sophia.register_capacity_scope(pg_temp.scope(SX));
 c:=sophia.register_capacity_scope(pg_temp.scope(SX,jsonb_build_object('evidence_digest',pg_temp.hex('other'))));
 d:=sophia.register_capacity_scope(pg_temp.scope(SX,jsonb_build_object('evidence_digest',pg_temp.hex('other'))));
 IF c->>'outcome'<>'conflict' OR c->>'replay'<>'false' OR d<>(c||'{"replay":true}') THEN
  RAISE EXCEPTION 'A scope conflict receipt is not stable: % %', c, d; END IF;
 IF (SELECT count(*) FROM sophia.capacity_exposure_conflicts WHERE kind='scope')<>1
    OR (SELECT count(*) FROM sophia.capacity_exposure_scopes WHERE scope_id=SX::uuid)<>1 THEN
  RAISE EXCEPTION 'A conflict must be kept once, and the first record unchanged'; END IF;
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_scope(%L)',
  pg_temp.scope('5c000000-0000-4000-8000-000000000003','{"account_id":"a7000000-0000-0000-0000-0000000000a2"}')),'scope_unknown');
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_scope(%L)',
  pg_temp.scope('5c000000-0000-4000-8000-000000000003','{"model":"other-model"}')),'scope_unknown');
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_scope(%L)',
  pg_temp.scope('5c000000-0000-4000-8000-000000000003',jsonb_build_object('account_qualification_revision',
   pg_temp.fx('acqrev')::bigint+1))),'scope_qualification_unknown');
 -- A second scope of the same connection under another route qualification row: not the reading's scope.
 PERFORM sophia.register_capacity_scope(pg_temp.scope(S2,jsonb_build_object('route_qualification_id',pg_temp.fx('route2'))));
 -- Windows and issuers.
 a:=sophia.register_capacity_window(pg_temp.win(S));
 IF sophia.register_capacity_window(pg_temp.win(S))<>(a||'{"replay":true}') THEN RAISE EXCEPTION 'A window replay differs'; END IF;
 PERFORM sophia.register_capacity_window(pg_temp.win(S,'{"epoch_key":"e2"}'));
 PERFORM sophia.register_capacity_window(pg_temp.win(S,'{"epoch_key":"e-req","dimension":"openai.model_requests","unit":"requests"}'));
 PERFORM sophia.register_capacity_window(pg_temp.win(S,jsonb_build_object('epoch_key','e-late',
  'window_start',to_char((now()+interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
 PERFORM sophia.register_capacity_window(pg_temp.win(S2));
 c:=sophia.register_capacity_window(pg_temp.win(S,'{"epoch_key":"e2","window_semantics":"rolling"}'));
 IF c->>'outcome'<>'conflict' THEN RAISE EXCEPTION 'A window registered twice differently must conflict: %', c; END IF;
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_window(%L)',pg_temp.win(SX)),'window_scope_unregistered');
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_window(%L)',
  pg_temp.win('5c000000-0000-4000-8000-0000000000aa')),'window_scope_unregistered');
 PERFORM sophia.register_capacity_issuer(pg_temp.issuer('15000000-0000-4000-8000-000000000001',S));
 PERFORM sophia.register_capacity_issuer(pg_temp.issuer('15000000-0000-4000-8000-000000000002',S2));
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_issuer(%L)',
  pg_temp.issuer('15000000-0000-4000-8000-000000000003',SX)),'issuer_scope_unregistered');
END $$;

-- --- bindings: R2 §1.4 refusals in order, then W1's own --------------------------------------------------------------
DO $$ DECLARE S text:='5c000000-0000-4000-8000-000000000001'; S2 text:='5c000000-0000-4000-8000-000000000002';
 I text:='15000000-0000-4000-8000-000000000001'; I2 text:='15000000-0000-4000-8000-000000000002';
 o text:=pg_temp.fx('obs'); q text:='SELECT sophia.bind_capacity_observation(%L)'; a jsonb; c jsonb; d jsonb;
BEGIN
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I,'{"epoch_key":"e-none"}')),'obs_window_unregistered');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I,'{"epoch_key":"e2"}')),'obs_window_unregistered'); -- its window conflicts
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I2)),'issuer_unqualified');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,'15000000-0000-4000-8000-0000000000ff')),'issuer_unqualified');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I,'{"window_ref":"no-such-window"}')),'binding_reading_unknown');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(gen_random_uuid()::text,S,I)),'binding_reading_unknown');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S2,I2)),'binding_scope_mismatch');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I,'{"epoch_key":"e-req","dimension":"openai.model_requests"}')),'obs_unit_mismatch');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I,'{"epoch_key":"e-late"}')),'obs_window_mismatch'); -- reading epoch e1
 PERFORM pg_temp.expect(format(q,pg_temp.bind(pg_temp.fx('obsfrac'),S,I)),'obs_value_invalid');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(pg_temp.fx('obsnull'),S,I)),'obs_value_invalid');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(o,S,I,'{"kind":"verdict_only"}')),'obs_value_invalid');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(pg_temp.fx('obsnull'),S,I,'{"kind":"verdict_only"}')),'accepted');
 PERFORM pg_temp.expect(format(q,pg_temp.bind(pg_temp.fx('obsrev'),S,I)),'binding_reading_revoked');
 -- The accepted binding; its replay; a different payload conflicts (sticky, stable receipt).
 a:=sophia.bind_capacity_observation(pg_temp.bind(o,S,I));
 IF sophia.bind_capacity_observation(pg_temp.bind(o,S,I))<>(a||'{"replay":true}') THEN RAISE EXCEPTION 'A binding replay differs'; END IF;
 c:=sophia.bind_capacity_observation(pg_temp.bind(pg_temp.fx('obsnull'),S,I,'{"kind":"remaining_at"}'));
 d:=sophia.bind_capacity_observation(pg_temp.bind(pg_temp.fx('obsnull'),S,I,'{"kind":"remaining_at"}'));
 IF c->>'outcome'<>'conflict' OR d<>(c||'{"replay":true}') THEN RAISE EXCEPTION 'A binding conflict is not stable: % %', c, d; END IF;
 -- The binding names the registration and issuer records it relied on (derived approval custody).
 IF NOT EXISTS(SELECT 1 FROM sophia.capacity_observation_bindings b JOIN sophia.capacity_window_registrations w
   ON w.key_sha256=b.window_key_sha256 AND w.payload_sha256=b.registration_payload_sha256
   JOIN sophia.capacity_exposure_issuers i ON i.issuer_id=b.issuer_id AND i.payload_sha256=b.issuer_payload_sha256
   WHERE b.observation_id=o::uuid) THEN RAISE EXCEPTION 'A binding must name its registration and issuer'; END IF;
END $$;

-- A window that opens after the reading was observed: the reading cannot speak for it (time).
DO $$ BEGIN
 PERFORM sophia.register_capacity_window(pg_temp.win('5c000000-0000-4000-8000-000000000001',jsonb_build_object(
  'epoch_key','e1','window_kind','hour','window_start',
  to_char((now()-interval '5 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
 -- (A reading of its own: a binding key is one reading window, and k1's is already bound.)
 PERFORM pg_temp.expect(format('SELECT sophia.bind_capacity_observation(%L)',pg_temp.bind(pg_temp.reading('k-time')::text,
  '5c000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','{"window_kind":"hour"}')),'obs_time_invalid');
END $$;

-- --- mappings ---------------------------------------------------------------------------------------------------------
CREATE FUNCTION pg_temp.mapping(edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('provider','openai','route_id','research-sol-medium-v1','contract','c1p_complete_report',
  'source_field','output','dimension','openai.output_tokens','unit','tokens','semantics','reported_lower_bound',
  'revision',1,'issuer_id','15000000-0000-4000-8000-000000000001','approval_ref_digest',pg_temp.hex('approval'),
  'evidence_digest',pg_temp.hex('evidence'))||edits $$;
DO $$ DECLARE q text:='SELECT sophia.register_capacity_mapping(%L)'; a jsonb; c jsonb; BEGIN
 PERFORM pg_temp.expect(format(q,pg_temp.mapping('{"source_field":"cache_write"}')),'mapping_unsupported');
 PERFORM pg_temp.expect(format(q,pg_temp.mapping('{"dimension":"openai.model_requests","unit":"requests"}')),'mapping_unsupported');
 PERFORM pg_temp.expect(format(q,pg_temp.mapping('{"unit":"requests"}')),'mapping_unit_mismatch');
 PERFORM pg_temp.expect(format(q,pg_temp.mapping('{"issuer_id":"15000000-0000-4000-8000-0000000000ff"}')),'issuer_unqualified');
 a:=sophia.register_capacity_mapping(pg_temp.mapping());
 IF sophia.register_capacity_mapping(pg_temp.mapping())<>(a||'{"replay":true}') THEN RAISE EXCEPTION 'A mapping replay differs'; END IF;
 c:=sophia.register_capacity_mapping(pg_temp.mapping('{"revision":2}'));
 IF c->>'outcome'<>'conflict' THEN RAISE EXCEPTION 'A remapped key must conflict, never update: %', c; END IF;
END $$;

-- --- effects: two model reservations on the account in two projects; one without an identity; one search -------------
SET LOCAL session_replication_role = replica;
INSERT INTO sophia.research_reservations(project_id,id,allowance_id,reservation_key,kind,provider,reserved_usd,created_at) VALUES
 ('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',gen_random_uuid(),'k-e1','model','openai',1,now()-interval '30 minutes'),
 ('a1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002',gen_random_uuid(),'k-e2','model','openai',1,now()-interval '20 minutes'),
 ('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003',gen_random_uuid(),'k-e3','model','openai',1,now()-interval '15 minutes'),
 ('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',gen_random_uuid(),'k-e4','search','openai',1,now()-interval '15 minutes');
INSERT INTO sophia.research_call_identities(project_id,reservation_id,mode,contract,operation,runtime_id,runtime_unit_id,
 resource_id,binding_id,attempt_id,native_session_id,call_id,job_id,allowance_id,route_id,provider,payer,account_id,
 grant_id,grant_revision,connection_id,credential_revision,qualification_id,qualification_revision)
SELECT r.project_id,r.id,'tracked_v1','c1p_complete_report','research',gen_random_uuid(),'synthetic-unit',gen_random_uuid(),
 gen_random_uuid(),gen_random_uuid(),'synthetic-session','synthetic-call',gen_random_uuid(),r.allowance_id,
 'research-sol-medium-v1','openai','contributor_api_account','a7000000-0000-0000-0000-0000000000a1',gen_random_uuid(),1,
 'a7000000-0000-0000-0000-0000000000c1',1,gen_random_uuid(),1
FROM sophia.research_reservations r WHERE r.id IN ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002');
INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,
 cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,response_id_status)
VALUES('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',pg_temp.hex('t1'),'complete_report',
 'known',10,'known',0,'no_separate_reported_class',NULL,'known',700,'stream_completed','settled',0.01,'unknown');
-- e3 is a model reservation with no identity and (so far) no ledger row: the read neither counts nor flags it.
SET LOCAL session_replication_role = origin;

-- --- attributions and finality ----------------------------------------------------------------------------------------
CREATE FUNCTION pg_temp.att(p_res text, edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('observation_id',pg_temp.fx('obs'),'project_id','a1000000-0000-4000-8000-000000000001',
  'reservation_id',p_res,'dimension','openai.output_tokens','coverage','reflected','q',400,'basis','controlled_fixture',
  'n1',null,'n2',null,'evidence_digest',pg_temp.hex('evidence'),'issuer_id','15000000-0000-4000-8000-000000000001',
  'issuer_qual_revision',pg_temp.fx('acqrev')::bigint)||edits $$;
CREATE FUNCTION pg_temp.fin(edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('project_id','a1000000-0000-4000-8000-000000000001','reservation_id','e1000000-0000-4000-8000-000000000001',
  'dimension','openai.output_tokens','basis','provider_terminal_known',
  'final_at',to_char((now()-interval '25 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'count_kind','none','final_count',null,'evidence_digest',pg_temp.hex('fin-evidence'),'approval_ref_digest',pg_temp.hex('approval'),
  'issuer_id','15000000-0000-4000-8000-000000000001','issuer_qual_revision',pg_temp.fx('acqrev')::bigint)||edits $$;
DO $$ DECLARE e1 text:='e1000000-0000-4000-8000-000000000001'; qa text:='SELECT sophia.append_capacity_attribution(%L)';
 f text:='SELECT sophia.append_capacity_finality(%L)'; a jsonb; c jsonb; r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; r5 jsonb;
BEGIN
 PERFORM pg_temp.expect(format(qa,pg_temp.att(e1,'{"dimension":"openai.input_tokens"}')),'attribution_unbound');
 PERFORM pg_temp.expect(format(qa,pg_temp.att(e1,'{"issuer_id":"15000000-0000-4000-8000-000000000002"}')),'issuer_unqualified');
 PERFORM pg_temp.expect(format(qa,pg_temp.att('e1000000-0000-4000-8000-000000000003')),'attribution_effect_unknown');
 PERFORM pg_temp.expect(format(qa,pg_temp.att('e1000000-0000-4000-8000-000000000004')),'attribution_effect_unknown');
 a:=sophia.append_capacity_attribution(pg_temp.att(e1));
 IF sophia.append_capacity_attribution(pg_temp.att(e1))<>(a||'{"replay":true}') THEN RAISE EXCEPTION 'An attribution replay differs'; END IF;
 c:=sophia.append_capacity_attribution(pg_temp.att(e1,'{"q":500}'));
 IF c->>'outcome'<>'conflict' OR sophia.append_capacity_attribution(pg_temp.att(e1,'{"q":500}'))<>(c||'{"replay":true}') THEN
  RAISE EXCEPTION 'An attribution conflict is not stable: %', c; END IF;
 IF (SELECT q FROM sophia.capacity_attributions WHERE key_sha256=a->>'key')<>400 THEN RAISE EXCEPTION 'A conflict updated q'; END IF;
 -- Finality FG01-FG05 persisted: none, then known (extension), a replay, provenance, a count conflict, a terminal
 -- conflict: every distinct payload a new immutable row in order; a replay its own receipt.
 PERFORM pg_temp.expect(format(f,pg_temp.fin('{"issuer_id":"15000000-0000-4000-8000-0000000000ff"}')),'issuer_unqualified');
 PERFORM pg_temp.expect(format(f,pg_temp.fin(jsonb_build_object('issuer_qual_revision',pg_temp.fx('acqrev')::bigint+1))),'issuer_unqualified');
 PERFORM pg_temp.expect(format(f,pg_temp.fin('{"reservation_id":"e1000000-0000-4000-8000-000000000003"}')),'finality_effect_unknown');
 r1:=sophia.append_capacity_finality(pg_temp.fin());
 r2:=sophia.append_capacity_finality(pg_temp.fin('{"count_kind":"final_total","final_count":1000}'));
 IF sophia.append_capacity_finality(pg_temp.fin())<>(r1||'{"replay":true}') THEN RAISE EXCEPTION 'A finality replay differs'; END IF;
 r3:=sophia.append_capacity_finality(pg_temp.fin(jsonb_build_object('count_kind','final_total','final_count',1000,
  'evidence_digest',pg_temp.hex('more evidence'))));
 r4:=sophia.append_capacity_finality(pg_temp.fin('{"count_kind":"final_total","final_count":900}'));
 r5:=sophia.append_capacity_finality(pg_temp.fin(jsonb_build_object('final_at',
  to_char((now()-interval '24 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
 IF ARRAY[(r1->>'seq')::int,(r2->>'seq')::int,(r3->>'seq')::int,(r4->>'seq')::int,(r5->>'seq')::int]<>ARRAY[1,2,3,4,5] THEN
  RAISE EXCEPTION 'Finality receipts out of order: % % % % %', r1, r2, r3, r4, r5; END IF;
 IF (SELECT count(*) FROM sophia.capacity_effect_finality)<>5 THEN RAISE EXCEPTION 'Finality rows: expected 5'; END IF;
END $$;

-- --- the seal ---------------------------------------------------------------------------------------------------------
DO $$ DECLARE t text; s text; BEGIN
 FOREACH t IN ARRAY ARRAY['capacity_exposure_scopes','capacity_window_registrations','capacity_exposure_issuers',
   'capacity_observation_bindings','capacity_dimension_mappings','capacity_attributions','capacity_effect_finality',
   'capacity_exposure_conflicts'] LOOP
  FOREACH s IN ARRAY ARRAY[format('UPDATE sophia.%I SET recorded_at=now()',t),format('DELETE FROM sophia.%I',t),
    format('TRUNCATE sophia.%I CASCADE',t),format('INSERT INTO sophia.%I SELECT * FROM sophia.%I LIMIT 1',t,t)] LOOP
   BEGIN
    EXECUTE s;
    RAISE EXCEPTION 'Not sealed: %', s;
   EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
   END;
  END LOOP;
 END LOOP;
END $$;

-- --- the read --------------------------------------------------------------------------------------------------------
-- B1 (Root88): one reservation without a 0109 identity, its contribution task and its account ledger row (0094), written
-- under the same explicit replication-role exception as the research rows above (no grant or job fixture here).
CREATE FUNCTION pg_temp.ledger(p_project text, p_reservation text, p_account text, p_kind text, p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE job uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('session_replication_role','replica',true);
 INSERT INTO sophia.research_reservations(project_id,id,allowance_id,reservation_key,kind,provider,reserved_usd,created_at)
  VALUES(p_project::uuid,p_reservation::uuid,gen_random_uuid(),'k-'||p_reservation,p_kind,'openai',1,p_at)
  ON CONFLICT (project_id,id) DO NOTHING; -- e4 (search) is already a fixture reservation
 INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,
  credential_revision,account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort)
  VALUES(p_project::uuid,job,gen_random_uuid(),g,1,'a7000000-0000-0000-0000-0000000000c1',1,p_account::uuid,
   'a7000000-0000-0000-0000-0000000000e1','a7000000-0000-0000-0000-0000000000e1',gen_random_uuid(),
   'research-sol-medium-v1','gpt-6.1-sol','medium');
 INSERT INTO sophia.api_contribution_reservations(project_id,reservation_id,job_id,grant_id,grant_revision,account_id,
  connection_id,credential_revision)
  VALUES(p_project::uuid,p_reservation::uuid,job,g,1,p_account::uuid,'a7000000-0000-0000-0000-0000000000c1',1);
 PERFORM set_config('session_replication_role','origin',true);
END $$;
CREATE FUNCTION pg_temp.exposure() RETURNS jsonb LANGUAGE sql AS $$
 SELECT sophia.selection_capacity_exposure_at(
  jsonb_populate_record(NULL::sophia.api_contribution_grants,
   '{"route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","effort":"medium","operation":"research"}'),
  (SELECT c FROM sophia.api_connections c WHERE id='a7000000-0000-0000-0000-0000000000c1'),clock_timestamp()) $$;
DO $$ DECLARE x jsonb; w jsonb; k text; BEGIN
 -- The latest reading (k-time) revoked: no recorded reading, so no exposure fact (0107 decides alone).
 PERFORM sophia.revoke_capacity_observation((SELECT id FROM sophia.capacity_observations ORDER BY observed_at DESC LIMIT 1),
  'synthetic revocation');
 x:=pg_temp.exposure();
 IF x<>'null'::jsonb THEN RAISE EXCEPTION 'Without a recorded reading the exposure is JSON null: %', x; END IF;
 -- A newer reading, never bound: the 0107 baseline.
 PERFORM pg_temp.reading('k2');
 x:=pg_temp.exposure();
 IF x<>'{"v":1,"state":"never_bound"}'::jsonb THEN RAISE EXCEPTION 'A never-bound reading: %', x; END IF;
END $$;
DO $$ DECLARE o text; x jsonb; w jsonb; one jsonb; m jsonb; BEGIN
 -- Bind the newest reading; its facts carry both projects' effects, and neither the identity-less one nor the search.
 o:=(SELECT id::text FROM sophia.capacity_observations ORDER BY observed_at DESC, recorded_at DESC LIMIT 1);
 PERFORM sophia.bind_capacity_observation(pg_temp.bind(o,'5c000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001'));
 x:=pg_temp.exposure();
 IF x->>'state'<>'bound' OR jsonb_array_length(x->'windows')<>1 THEN RAISE EXCEPTION 'A bound reading: %', x; END IF;
 w:=x->'windows'->0;
 IF (w->>'unrepresented')::boolean OR (w->>'truncated')::boolean OR jsonb_array_length(w->'effects')<>2
    OR w->'registration'->>'dimension'<>'openai.output_tokens' OR (w->>'partitionConflict')::boolean THEN
  RAISE EXCEPTION 'Effects of the account: %', w; END IF;
 IF (SELECT count(DISTINCT el->>'projectId') FROM jsonb_array_elements(w->'effects') el)<>2 THEN
  RAISE EXCEPTION 'Effects of every project on the account must be read'; END IF;
 one:=(SELECT el FROM jsonb_array_elements(w->'effects') el WHERE el->>'reservationId'='e1000000-0000-4000-8000-000000000001');
 IF jsonb_array_length(one->'finality')<>5 OR one->'truth'->>'output'<>'700' OR (one->'truth'->>'conflict')::boolean THEN
  RAISE EXCEPTION 'One effect''s facts: %', one; END IF;
 IF jsonb_array_length(w->'mappings')<>1 OR (w->'mappings'->0->>'conflict')::boolean IS NOT TRUE THEN
  RAISE EXCEPTION 'The conflicted mapping must be carried as conflicted: %', w->'mappings'; END IF;
 -- The partition holds the k1 reading too (same window key and kind), with its attribution and its conflict.
 IF jsonb_array_length(w->'observations')<>2 OR jsonb_array_length(w->'attributions')<>1
    OR (w->'attributions'->0->>'conflict')::boolean IS NOT TRUE OR (w->'attributions'->0->>'issuerQualified')::boolean IS NOT TRUE THEN
  RAISE EXCEPTION 'The partition: %', w; END IF;
 -- B1 (Root88): account ledger rows (0094) for reservations without a 0109 identity. Another account's, and a search
 -- reservation's, change nothing; a model reservation of ANOTHER project on this account makes the set unrepresented.
 PERFORM pg_temp.ledger('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',
  'a7000000-0000-0000-0000-0000000000a1','search',now()-interval '12 minutes');
 PERFORM pg_temp.ledger('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008',
  'a7000000-0000-0000-0000-0000000000a9','model',now()-interval '12 minutes');
 w:=pg_temp.exposure()->'windows'->0;
 IF (w->>'unrepresented')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'An irrelevant ledger row flagged the set: %', w; END IF;
 IF jsonb_array_length(w->'effects')<>2 THEN RAISE EXCEPTION 'An irrelevant ledger row became an effect'; END IF;
 PERFORM pg_temp.ledger('a1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000006',
  'a7000000-0000-0000-0000-0000000000a1','model',now()-interval '12 minutes');
 w:=pg_temp.exposure()->'windows'->0;
 IF (w->>'unrepresented')::boolean IS NOT TRUE THEN
  RAISE EXCEPTION 'B1: an unrepresented ledger obligation of another project on the account must flag the set: %', w; END IF;
 IF jsonb_array_length(w->'effects')<>2 THEN RAISE EXCEPTION 'An unrepresented obligation is never a counted effect'; END IF;
 -- W1-F01: a mapping issuer of a SEPARATE scope S3. Eligible while S3 holds; once S3 conflicts the mapping is carried
 -- as ineligible (restrictive), the bound window of scope S stays valid, a NEW mapping by that issuer is refused, and an
 -- exact replay of the recorded one still returns its receipt.
 PERFORM sophia.register_capacity_scope(pg_temp.scope('5c000000-0000-4000-8000-000000000003'));
 PERFORM sophia.register_capacity_issuer(pg_temp.issuer('15000000-0000-4000-8000-000000000003','5c000000-0000-4000-8000-000000000003'));
 m:=sophia.register_capacity_mapping(pg_temp.mapping('{"source_field":"raw_output","issuer_id":"15000000-0000-4000-8000-000000000003"}'));
 IF m->>'outcome'<>'recorded' THEN RAISE EXCEPTION 'W1-F01: an eligible issuer''s mapping is recorded: %', m; END IF;
 w:=pg_temp.exposure()->'windows'->0;
 IF (SELECT el FROM jsonb_array_elements(w->'mappings') el WHERE el->>'sourceField'='raw_output')
    <>jsonb_build_object('provider','openai','routeId','research-sol-medium-v1','contract','c1p_complete_report',
     'sourceField','raw_output','eligible',true,'conflict',false) THEN
  RAISE EXCEPTION 'W1-F01: a currently eligible mapping is usable: %', w->'mappings'; END IF;
 IF (SELECT (el->>'eligible')::boolean FROM jsonb_array_elements(w->'mappings') el WHERE el->>'sourceField'='output') IS NOT TRUE THEN
  RAISE EXCEPTION 'W1-F01: a conflicted mapping of a qualified issuer stays eligible (and conflicted)'; END IF;
 PERFORM sophia.register_capacity_scope(pg_temp.scope('5c000000-0000-4000-8000-000000000003',
  jsonb_build_object('evidence_digest',pg_temp.hex('another'))));
 x:=pg_temp.exposure();
 IF x->>'state'<>'bound' THEN RAISE EXCEPTION 'W1-F01: the window''s own scope is still valid (not vacuous): %', x; END IF;
 w:=x->'windows'->0;
 IF (SELECT el FROM jsonb_array_elements(w->'mappings') el WHERE el->>'sourceField'='raw_output')
    <>jsonb_build_object('provider','openai','routeId','research-sol-medium-v1','contract','c1p_complete_report',
     'sourceField','raw_output','eligible',false,'conflict',true) THEN
  RAISE EXCEPTION 'W1-F01: an ineligible mapping is carried as restrictive, never dropped or qualified: %', w->'mappings'; END IF;
 PERFORM pg_temp.expect(format('SELECT sophia.register_capacity_mapping(%L)',pg_temp.mapping(
  '{"source_field":"raw_input_total","dimension":"openai.input_tokens","issuer_id":"15000000-0000-4000-8000-000000000003"}')),
  'issuer_unqualified');
 IF sophia.register_capacity_mapping(pg_temp.mapping('{"source_field":"raw_output","issuer_id":"15000000-0000-4000-8000-000000000003"}'))
    <>(m||'{"replay":true}') THEN RAISE EXCEPTION 'W1-F01: an exact replay keeps its receipt'; END IF;
 -- No value of the custody is a 0107 field: the reading itself is unchanged.
 IF (SELECT count(*) FROM sophia.capacity_observation_windows WHERE observation_id=o::uuid)<>1 THEN RAISE EXCEPTION 'reading changed'; END IF;
 -- Revoking the binding is restrictive, never the never-bound baseline; a conflicting revocation stays restrictive.
 PERFORM sophia.revoke_capacity_binding(jsonb_build_object('observation_id',o,'window_ref','tokens-day',
  'reason_digest',pg_temp.hex('reason'),'approval_ref_digest',pg_temp.hex('approval'),'evidence_digest',pg_temp.hex('evidence')));
 x:=pg_temp.exposure();
 IF x<>'{"v":1,"state":"restricted"}'::jsonb THEN RAISE EXCEPTION 'A revoked binding: %', x; END IF;
 PERFORM pg_temp.expect(format('SELECT sophia.revoke_capacity_binding(%L)',jsonb_build_object('observation_id',gen_random_uuid(),
  'window_ref','tokens-day','reason_digest',pg_temp.hex('reason'),'approval_ref_digest',pg_temp.hex('approval'),
  'evidence_digest',pg_temp.hex('evidence'))),'binding_unknown');
END $$;

-- --- the candidate: 'exposure' only under the switch ---------------------------------------------------------------
DO $$ BEGIN
 IF position('sophia.capacity_exposure' IN pg_get_functiondef(
   'sophia.selection_api_candidate(sophia.api_contribution_grants,uuid,sophia.research_funding_pins,boolean,timestamptz)'::regprocedure))=0
  THEN RAISE EXCEPTION 'The candidate does not read the switch'; END IF;
 IF current_setting('sophia.capacity_exposure',true) IS NOT NULL AND current_setting('sophia.capacity_exposure',true)<>'' THEN
  RAISE EXCEPTION 'The switch is set by default'; END IF;
END $$;

ROLLBACK;
