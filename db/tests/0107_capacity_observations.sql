-- INC04-S03a (0107): sealed, scoped capacity observations. Run against a disposable database with every migration
-- installed (pnpm test:sql). Never use production. Everything below rolls back. Every account, connection,
-- qualification and reading is SYNTHETIC: nothing here qualifies a real account, route, provider or telemetry source.
-- * Privileges: the recorder, revoker, read and marker are executable by no application role; the tables by none.
-- * The seal: no update, delete, truncate, direct write or post-seal append; a half reading never commits.
-- * Replay and conflict; the record-time refusals (future, freshness, epoch fence, coverage, qualification identity).
-- * The read at one instant: exact scope, visibility, streams, equal-time conflict, revocation, and the qualification
--   binding, judged FIRST (a revoke and requalification under unchanged credentials makes an old reading unbound, and an
--   old-qualification stream neither masks nor conflicts with a replacement reading in another stream).
-- * A reading observed before its qualification held is refused, whatever holds at record time.
BEGIN;

-- --- privileges and the marker -------------------------------------------------------------------------------------
DO $$ DECLARE f text; r text; BEGIN
 FOREACH f IN ARRAY ARRAY['sophia.record_capacity_observation(jsonb)','sophia.revoke_capacity_observation(uuid,text)',
   'sophia.selection_capacity_observation_at(sophia.api_contribution_grants,sophia.api_connections,timestamptz)',
   'sophia.selection_capacity_observations_0107()','sophia.capacity_observation_insert(uuid,text,jsonb,text)'] LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION '% may execute %', r, f; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=f::regprocedure AND a.grantee=0) THEN RAISE EXCEPTION 'PUBLIC may execute %', f; END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['sophia.capacity_observations','sophia.capacity_observation_windows',
   'sophia.capacity_observation_revocations'] LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker','sophia_conversation_assembler'] LOOP
   IF has_table_privilege(r,f,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION '% may use %', r, f; END IF;
  END LOOP;
 END LOOP;
 IF sophia.selection_capacity_observations_0107()<>107 THEN RAISE EXCEPTION 'The 0107 marker is missing'; END IF;
 -- The replaced candidate keeps 0104's privileges: none for an application role.
 IF has_function_privilege('sophia_api',
   'sophia.selection_api_candidate(sophia.api_contribution_grants,uuid,sophia.research_funding_pins,boolean,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'The candidate helper became executable'; END IF;
END $$;

-- --- SYNTHETIC fixtures ----------------------------------------------------------------------------------------------
INSERT INTO sophia.api_accounts(id,owner_id,provider,label,total_cap_usd) VALUES
 ('a7000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-0000000000e1','openai','synthetic account',20);
INSERT INTO sophia.api_connections(id,owner_id,account_id,label,route_id,model,effort,credential_ref,credential_revision,
 custodian_label,state) VALUES
 ('a7000000-0000-0000-0000-0000000000c1','a7000000-0000-0000-0000-0000000000e1','a7000000-0000-0000-0000-0000000000a1',
  'synthetic','research-sol-medium-v1','gpt-6.1-sol','medium','OPENAI_RESEARCH_API_KEY',1,'synthetic host','connected');
CREATE TEMP TABLE fx(k text PRIMARY KEY, v text) ON COMMIT DROP;
-- The route was qualified a day ago, so a reading observed minutes ago is taken under it.
WITH q AS (INSERT INTO sophia.api_route_qualifications(route_id,model,effort,evidence_ref,qualified_at,expires_at)
 VALUES('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()-interval '1 day',
  now()+interval '1 day') RETURNING id)
INSERT INTO fx SELECT 'route', id::text FROM q;
INSERT INTO fx SELECT 'acq', sophia.qualify_api_account('a7000000-0000-0000-0000-0000000000c1','{research}',
 'operator_verified_call','synthetic: not a live qualification',now()-interval '1 hour',now()+interval '1 day')->>'qualificationId';

-- A reading for the fixture connection: `edits` overwrite the defaults.
CREATE FUNCTION pg_temp.reading(p_key text, edits jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('observationKey',p_key,'connectionId','a7000000-0000-0000-0000-0000000000c1',
  'credentialRevision',1,'accountQualificationId',(SELECT v FROM fx WHERE k='acq'),
  'accountQualificationRevision',(SELECT revision FROM sophia.api_account_qualifications WHERE id=(SELECT v FROM fx WHERE k='acq')::uuid),
  'routeQualificationId',(SELECT v FROM fx WHERE k='route'),'operation','research','verification','operator_verified_console',
  'evidenceRef','synthetic evidence','sourceChannel','synthetic-console','windowSetRef','synthetic-limits','windowSetVersion','v1',
  'coverage','complete','requiredWindowRefs',jsonb_build_array('requests-per-day','tokens-per-minute'),'reflection','unknown',
  'observedAt',now()-interval '10 minutes','freshUntil',now()+interval '10 minutes',
  'windows',jsonb_build_array(
   jsonb_build_object('windowRef','tokens-per-minute','scope','model','modelSelector','gpt-6.1-sol','unit','tokens',
    'value',1.50,'verdict','admits','applicability','known','resetAt',now()+interval '1 hour'),
   jsonb_build_object('windowRef','requests-per-day','scope','account','unit','requests','verdict','admits',
    'applicability','known')))||edits $$;
-- Whether recording `p` is refused with `p_state`.
CREATE FUNCTION pg_temp.refused(p jsonb, p_state text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 PERFORM sophia.record_capacity_observation(p);
 RETURN false;
EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE<>p_state THEN RAISE EXCEPTION 'Expected %, got %: %', p_state, SQLSTATE, SQLERRM; END IF;
 RETURN true;
END $$;
-- The read for the fixture connection and its grant's settings at `p_at`.
CREATE FUNCTION pg_temp.read_at(p_at timestamptz) RETURNS jsonb LANGUAGE sql AS $$
 SELECT sophia.selection_capacity_observation_at(
  jsonb_populate_record(NULL::sophia.api_contribution_grants,
   '{"route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","effort":"medium","operation":"research"}'),
  (SELECT c FROM sophia.api_connections c WHERE id='a7000000-0000-0000-0000-0000000000c1'),p_at) $$;

-- --- the recorder: replay, conflict and refusals ----------------------------------------------------------------------
DO $$ DECLARE a jsonb; b jsonb; BEGIN
 IF pg_temp.read_at(clock_timestamp()) IS NOT NULL THEN RAISE EXCEPTION 'No reading yet is NULL (the baseline)'; END IF;
 a:=sophia.record_capacity_observation(pg_temp.reading('k1'));
 -- The same reading again, its windows in another order and its value spelled 1.5: the original receipt.
 b:=sophia.record_capacity_observation(pg_temp.reading('k1','{}')||jsonb_build_object('windows',
  jsonb_build_array((pg_temp.reading('k1')->'windows'->1),(pg_temp.reading('k1')->'windows'->0)||'{"value":1.5}')));
 IF a<>b THEN RAISE EXCEPTION 'A replay is not the original receipt: % %', a, b; END IF;
 IF (SELECT count(*) FROM sophia.capacity_observations)<>1 OR (SELECT count(*) FROM sophia.capacity_observation_windows)<>2 THEN
  RAISE EXCEPTION 'A replay wrote rows'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k1','{"reflection":"all"}'),'23505') THEN RAISE EXCEPTION 'Changed payload'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2',jsonb_build_object('observedAt',now()+interval '1 hour',
   'freshUntil',now()+interval '2 hours')),'22023') THEN RAISE EXCEPTION 'A future observation'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2',jsonb_build_object('freshUntil',now()-interval '10 minutes')),'22023') THEN
  RAISE EXCEPTION 'Fresh before observed'; END IF;
 -- The epoch fence: fresh past a window's reset.
 IF NOT pg_temp.refused(pg_temp.reading('k2',jsonb_build_object('freshUntil',now()+interval '2 hours')),'22023') THEN
  RAISE EXCEPTION 'Fresh past a reset'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2','{"requiredWindowRefs":["tokens-per-minute"]}'),'22023') THEN
  RAISE EXCEPTION 'Complete coverage missing a window'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2','{"requiredWindowRefs":[],"windows":[]}'),'22023') THEN
  RAISE EXCEPTION 'Empty complete coverage'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2','{"coverage":"none_applicable","requiredWindowRefs":null}'),'0A000') THEN
  RAISE EXCEPTION 'A none-applicable claim'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2','{"credentialRevision":2}'),'22023') THEN RAISE EXCEPTION 'Stale credential'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2','{"accountQualificationRevision":7}'),'22023') THEN
  RAISE EXCEPTION 'Another account qualification revision'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2','{"surprise":1}'),'22023') THEN RAISE EXCEPTION 'An unknown field'; END IF;
 IF NOT pg_temp.refused(pg_temp.reading('k2',jsonb_build_object('windows',jsonb_build_array(
   (pg_temp.reading('k2')->'windows'->0)-'modelSelector',pg_temp.reading('k2')->'windows'->1))),'22023') THEN
  RAISE EXCEPTION 'A model window without its model'; END IF;
 -- Backdated before its account qualification was observed (an hour ago): refused although it is current now.
 IF NOT pg_temp.refused(pg_temp.reading('k2',jsonb_build_object('observedAt',now()-interval '2 hours')),'22023') THEN
  RAISE EXCEPTION 'A reading observed before its account qualification'; END IF;
END $$;

-- --- the seal ----------------------------------------------------------------------------------------------------------
DO $$ DECLARE id_ uuid:=(SELECT id FROM sophia.capacity_observations WHERE observation_key='k1'); BEGIN
 BEGIN UPDATE sophia.capacity_observations SET reflection='all' WHERE id=id_; RAISE EXCEPTION 'An update';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN DELETE FROM sophia.capacity_observation_windows WHERE observation_id=id_; RAISE EXCEPTION 'A delete';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN TRUNCATE sophia.capacity_observation_revocations; RAISE EXCEPTION 'A truncate';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 -- A post-seal append, even by the migration owner.
 BEGIN INSERT INTO sophia.capacity_observation_windows(observation_id,window_ref,scope,unit,verdict,applicability)
   VALUES(id_,'extra','account','requests','admits','known'); RAISE EXCEPTION 'A post-seal append';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
-- A half reading (one promised window, none written, inside a forged seal) is refused at commit time.
SAVEPOINT half;
DO $$ DECLARE id_ uuid:=gen_random_uuid(); BEGIN
 PERFORM set_config('sophia.capacity_observation_seal',id_::text,true);
 INSERT INTO sophia.capacity_observations SELECT (jsonb_populate_record(o,jsonb_build_object('id',id_,'observation_key','half',
  'window_count',1))).* FROM sophia.capacity_observations o WHERE observation_key='k1';
END $$;
DO $$ BEGIN
 SET CONSTRAINTS sophia.capacity_observations_whole IMMEDIATE;
 RAISE EXCEPTION 'A half reading was accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
ROLLBACK TO SAVEPOINT half;

-- --- the read at one instant -----------------------------------------------------------------------------------------
DO $$ DECLARE r jsonb; t timestamptz:=clock_timestamp(); BEGIN
 r:=pg_temp.read_at(t);
 IF r->>'state'<>'recorded' OR NOT (r->>'fresh')::boolean OR r->>'coverage'<>'complete' OR jsonb_array_length(r->'windows')<>2
    OR r ? 'evidenceRef' OR r->'windows'->0 ? 'value' OR r::text LIKE '%synthetic evidence%' OR r::text LIKE '%1.5%' THEN
  RAISE EXCEPTION 'The matched reading: %', r; END IF;
 -- Before it was observed, it does not exist; after its freshness, it is stale.
 IF pg_temp.read_at(now()-interval '11 minutes') IS NOT NULL THEN RAISE EXCEPTION 'Visible before observed'; END IF;
 IF (pg_temp.read_at(now()+interval '11 minutes')->>'fresh')::boolean THEN RAISE EXCEPTION 'Fresh after freshUntil'; END IF;
END $$;

-- An older reading recorded later never wins.
DO $$ DECLARE r jsonb; BEGIN
 PERFORM sophia.record_capacity_observation(pg_temp.reading('k-old',jsonb_build_object('observedAt',now()-interval '30 minutes',
  'reflection','none')));
 r:=pg_temp.read_at(clock_timestamp());
 IF r->>'observationId'<>(SELECT id::text FROM sophia.capacity_observations WHERE observation_key='k1') THEN
  RAISE EXCEPTION 'A late older reading won: %', r; END IF;
END $$;

-- A second stream is a conflict: windows of distinct readings are never merged.
SAVEPOINT streams;
SELECT sophia.record_capacity_observation(pg_temp.reading('k-other-stream','{"sourceChannel":"synthetic-headers"}'));
DO $$ BEGIN
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'conflict' THEN RAISE EXCEPTION 'Two streams are not a conflict'; END IF;
END $$;
ROLLBACK TO SAVEPOINT streams;

-- Equal-time readings: contradictory without an authoritative order is a conflict; two distinct sequences order them.
SAVEPOINT ties;
SELECT sophia.record_capacity_observation(pg_temp.reading('k-tie','{"reflection":"some"}')
 ||jsonb_build_object('observedAt',(SELECT observed_at FROM sophia.capacity_observations WHERE observation_key='k1')));
DO $$ BEGIN
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'conflict' THEN RAISE EXCEPTION 'An equal-time contradiction won'; END IF;
END $$;
ROLLBACK TO SAVEPOINT ties;
SAVEPOINT sequences;
SELECT sophia.record_capacity_observation(pg_temp.reading('k-seq1',jsonb_build_object('observedAt',now()-interval '5 minutes',
 'sourceSequence',1,'reflection','none')));
SELECT sophia.record_capacity_observation(pg_temp.reading('k-seq2',jsonb_build_object('observedAt',now()-interval '5 minutes',
 'sourceSequence',2,'reflection','some')));
DO $$ BEGIN
 IF pg_temp.read_at(clock_timestamp())->>'observationId'<>(SELECT id::text FROM sophia.capacity_observations
   WHERE observation_key='k-seq2') THEN RAISE EXCEPTION 'The higher authoritative sequence did not win'; END IF;
END $$;
SELECT sophia.record_capacity_observation(pg_temp.reading('k-seq-none',jsonb_build_object('observedAt',now()-interval '5 minutes',
 'reflection','all')));
DO $$ BEGIN
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'conflict' THEN
  RAISE EXCEPTION 'A sequence-less equal-time contradiction did not conflict'; END IF;
END $$;
ROLLBACK TO SAVEPOINT sequences;

-- Revocation: the chosen reading revoked by the instant is revoked; the same reason again is a no-op.
SAVEPOINT revoked;
DO $$ DECLARE id_ uuid:=(SELECT id FROM sophia.capacity_observations WHERE observation_key='k1'); BEGIN
 PERFORM sophia.revoke_capacity_observation(id_,'synthetic: wrong evidence');
 PERFORM sophia.revoke_capacity_observation(id_,'synthetic: wrong evidence');
 BEGIN PERFORM sophia.revoke_capacity_observation(id_,'another'); RAISE EXCEPTION 'Another reason';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'revoked' THEN RAISE EXCEPTION 'A revoked reading is current'; END IF;
END $$;
ROLLBACK TO SAVEPOINT revoked;

-- The qualification binding (C01), judged before streams: a revoke and requalification under the SAME credential and
-- settings makes the old reading unbound, never current under the replacement; a reading recorded under the replacement
-- in ANOTHER stream and window set is current, unmasked by the old stream and in no conflict with it.
SAVEPOINT requalified;
DO $$ DECLARE old uuid:=(SELECT id FROM sophia.capacity_observations WHERE observation_key='k1'); r jsonb; BEGIN
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'recorded' THEN RAISE EXCEPTION 'The paired positive is not recorded'; END IF;
 PERFORM sophia.revoke_api_account_qualification((SELECT v FROM fx WHERE k='acq')::uuid,'synthetic: requalify');
 UPDATE fx SET v=sophia.qualify_api_account('a7000000-0000-0000-0000-0000000000c1','{research}','operator_verified_call',
  'synthetic: not a live qualification',now()-interval '1 hour',now()+interval '1 day')->>'qualificationId' WHERE k='acq';
 r:=pg_temp.read_at(clock_timestamp());
 IF r IS DISTINCT FROM '{"state":"unbound"}'::jsonb THEN
  RAISE EXCEPTION 'Only old-qualification readings must be unbound (never the baseline): %', r; END IF;
 PERFORM sophia.record_capacity_observation(pg_temp.reading('k-new',jsonb_build_object('observedAt',now()-interval '1 minute',
  'sourceChannel','synthetic-headers','windowSetRef','synthetic-limits-2')));
 r:=pg_temp.read_at(clock_timestamp());
 IF r->>'state'<>'recorded' OR (r->>'observationId')::uuid=old
    OR r->>'observationId'<>(SELECT id::text FROM sophia.capacity_observations WHERE observation_key='k-new') THEN
  RAISE EXCEPTION 'The replacement reading in another stream: %', r; END IF;
 -- Two streams both bound to the CURRENT qualification are still a real conflict.
 PERFORM sophia.record_capacity_observation(pg_temp.reading('k-new-2',jsonb_build_object('observedAt',now()-interval '1 minute',
  'sourceChannel','synthetic-console-2')));
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'conflict' THEN RAISE EXCEPTION 'Current-bound streams did not conflict'; END IF;
 -- The old identity is refused at record time too.
 IF NOT pg_temp.refused(pg_temp.reading('k-stale-id',jsonb_build_object('accountQualificationId',
   (SELECT id FROM sophia.api_account_qualifications WHERE revoked_at IS NOT NULL LIMIT 1))),'22023') THEN
  RAISE EXCEPTION 'A revoked account qualification was accepted'; END IF;
END $$;
ROLLBACK TO SAVEPOINT requalified;
SAVEPOINT route_requalified;
DO $$ DECLARE r jsonb; BEGIN
 PERFORM sophia.revoke_api_route_qualification((SELECT v FROM fx WHERE k='route')::uuid);
 UPDATE fx SET v=sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: requalified',
  now()+interval '1 day')::text WHERE k='route';
 r:=pg_temp.read_at(clock_timestamp());
 IF r IS DISTINCT FROM '{"state":"unbound"}'::jsonb THEN RAISE EXCEPTION 'An old reading under a replacement route: %', r; END IF;
 -- The replacement route row was qualified at this transaction's start: a reading observed before it is refused, one
 -- observed at it is current, in another window set.
 IF NOT pg_temp.refused(pg_temp.reading('k-before-route'),'22023') THEN
  RAISE EXCEPTION 'A reading observed before its route qualification'; END IF;
 PERFORM sophia.record_capacity_observation(pg_temp.reading('k-route-new',jsonb_build_object('observedAt',now(),
  'windowSetRef','synthetic-limits-2')));
 r:=pg_temp.read_at(clock_timestamp());
 IF r->>'state'<>'recorded' OR r->>'observationId'<>(SELECT id::text FROM sophia.capacity_observations
   WHERE observation_key='k-route-new') THEN RAISE EXCEPTION 'The replacement route reading: %', r; END IF;
END $$;
ROLLBACK TO SAVEPOINT route_requalified;

-- A revoked latest reading answers revoked: the older bound positive is not resurrected.
SAVEPOINT no_resurrection;
DO $$ BEGIN
 -- k-old (30 minutes old, bound, admits) exists; revoke the latest, k1.
 PERFORM sophia.revoke_capacity_observation((SELECT id FROM sophia.capacity_observations WHERE observation_key='k1'),'synthetic');
 IF pg_temp.read_at(clock_timestamp())->>'state'<>'revoked' THEN RAISE EXCEPTION 'An older positive was resurrected'; END IF;
END $$;
ROLLBACK TO SAVEPOINT no_resurrection;

-- A grant whose settings are not the connection's (another model) sees no reading.
DO $$ BEGIN
 IF sophia.selection_capacity_observation_at(jsonb_populate_record(NULL::sophia.api_contribution_grants,
   '{"route_id":"research-sol-medium-v1","model":"another-model","effort":"medium","operation":"research"}'),
   (SELECT c FROM sophia.api_connections c WHERE id='a7000000-0000-0000-0000-0000000000c1'),clock_timestamp()) IS NOT NULL THEN
  RAISE EXCEPTION 'A reading crossed to another model'; END IF;
END $$;
ROLLBACK;
