-- INC04-R07-C2-MAINTAINED-BOUND-OUTPUT-001 (0115), sql-run on real PostgreSQL: the nine public bound-output wrappers by
-- EXPLICIT name (never through a prefix that could let a later name escape): each is SECURITY DEFINER with the fixed
-- search_path, executed by sophia_api only (never PUBLIC, the worker or the assembler); the five helpers are the
-- migration owner's; the nine private 0113 entries stay ungranted; the feature selection refuses before anything else
-- when the transaction-local setting is absent, empty or not v1, for every wrapper, and is never authority (an unknown
-- capability is refused after it). The runtime worlds (opted dispatch, scope, operation, revocation, races) are exercised
-- by packages/persistence/src/research-dimension-bounds.db.test.ts. The file rolls back.
BEGIN;

CREATE FUNCTION pg_temp.outcome(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'accepted'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||':'||SQLERRM; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.outcome(text) TO sophia_api, sophia_worker;

CREATE TEMP TABLE wrappers(fn text PRIMARY KEY, scope text NOT NULL, step text NOT NULL, private text NOT NULL) ON COMMIT DROP;
INSERT INTO wrappers VALUES
 ('sophia.runtime_bound_output_apply(bytea,text,text,jsonb)','research','apply','sophia.runtime_research_bound_apply(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_claim(bytea,text,text,jsonb)','research','claim','sophia.runtime_research_bound_claim(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_outcome(bytea,text,text,jsonb)','research','outcome','sophia.runtime_research_bound_outcome(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_apply_design(bytea,text,text,jsonb)','design','apply','sophia.runtime_research_bound_apply_design(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_claim_design(bytea,text,text,jsonb)','design','claim','sophia.runtime_research_bound_claim_design(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_outcome_design(bytea,text,text,jsonb)','design','outcome','sophia.runtime_research_bound_outcome_design(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_apply_review(bytea,text,text,jsonb)','source_review','apply','sophia.runtime_research_bound_apply_review(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_claim_review(bytea,text,text,jsonb)','source_review','claim','sophia.runtime_research_bound_claim_review(bytea,text,text,jsonb)'),
 ('sophia.runtime_bound_output_outcome_review(bytea,text,text,jsonb)','source_review','outcome','sophia.runtime_research_bound_outcome_review(bytea,text,text,jsonb)');
GRANT SELECT ON wrappers TO sophia_api, sophia_worker;
CREATE TEMP TABLE helpers(fn text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO helpers VALUES ('sophia.runtime_bound_output_enabled()'),('sophia.runtime_bound_output_members(text)'),
 ('sophia.runtime_bound_output_shape(text,jsonb)'),('sophia.runtime_bound_output_opted(uuid,uuid)'),
 ('sophia.runtime_bound_output_request(text,jsonb,uuid,uuid,uuid)');

-- A. Definitions and privileges, each by its exact signature.
DO $$ DECLARE w record; o oid:=(SELECT proowner FROM pg_proc WHERE oid='sophia.runtime_research_bound_apply(bytea,text,text,jsonb)'::regprocedure);
 grantees text[];
BEGIN
 ASSERT (SELECT count(*) FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND proname ~ '^runtime_bound_output_')=14,
  'exactly the nine wrappers and five helpers carry the new prefix';
 FOR w IN SELECT * FROM wrappers LOOP
  ASSERT (SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog, sophia'] AND proowner=o FROM pg_proc WHERE oid=w.fn::regprocedure),
   w.fn||' is a definer with the fixed search_path, owned like the private entries';
  ASSERT has_function_privilege('sophia_api',w.fn,'EXECUTE'), 'the API executes '||w.fn;
  ASSERT NOT has_function_privilege('sophia_worker',w.fn,'EXECUTE'), 'the worker never executes '||w.fn;
  ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=w.fn::regprocedure AND a.grantee=0), 'PUBLIC never executes '||w.fn;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sophia_conversation_assembler') THEN
   ASSERT NOT has_function_privilege('sophia_conversation_assembler',w.fn,'EXECUTE'), 'the assembler never executes '||w.fn;
  END IF;
  SELECT array_agg(g ORDER BY g) INTO grantees FROM (SELECT DISTINCT CASE WHEN a.grantee=p.proowner THEN 'owner' ELSE a.grantee::regrole::text END g
   FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid=w.fn::regprocedure) z;
  ASSERT grantees=ARRAY['owner','sophia_api'], w.fn||' grants exactly owner and sophia_api: '||grantees::text;
  -- The private entry it calls stays the owner's alone (0113 unchanged).
  ASSERT NOT has_function_privilege('sophia_api',w.private,'EXECUTE') AND NOT has_function_privilege('sophia_worker',w.private,'EXECUTE')
   AND NOT EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=w.private::regprocedure AND a.grantee=0),
   w.private||' stays ungranted';
 END LOOP;
 FOR w IN SELECT * FROM helpers LOOP
  ASSERT (SELECT NOT prosecdef FROM pg_proc WHERE oid=w.fn::regprocedure), w.fn||' is invoker rights';
  ASSERT NOT has_function_privilege('sophia_api',w.fn,'EXECUTE') AND NOT has_function_privilege('sophia_worker',w.fn,'EXECUTE')
   AND NOT EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=w.fn::regprocedure AND a.grantee=0),
   w.fn||' is the owner''s only';
 END LOOP;
 -- 0115 creates no table and grants nothing on one.
 ASSERT NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='sophia'::regnamespace AND c.relname ~ '^runtime_bound_output'), 'no new relation';
END $$;

-- B. Feature selection first: absent, empty and any other value refuse every wrapper as the API role, before the
--    capability is even looked at (a garbage token gets the same refusal). The setting is never authority: with v1 the
--    same garbage token is refused by the maintained scope instead.
SET LOCAL ROLE sophia_api;
DO $$ DECLARE w record; got text; req jsonb;
BEGIN
 FOR w IN SELECT * FROM wrappers LOOP
  req:=jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,'{}'::jsonb);
  ASSERT current_setting('sophia.bound_output',true) IS NULL OR current_setting('sophia.bound_output',true)='', 'absent at start';
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b',req));
  ASSERT got='55000:bound_output_disabled', w.fn||' absent: '||got;
  PERFORM set_config('sophia.bound_output','',true);
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b',req));
  ASSERT got='55000:bound_output_disabled', w.fn||' empty: '||got;
  PERFORM set_config('sophia.bound_output','V1',true);
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b',req));
  ASSERT got='55000:bound_output_disabled', w.fn||' other value: '||got;
  -- v1: the closed request is next (a step body without its members is refused before the scope).
  PERFORM set_config('sophia.bound_output','v1',true);
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b',req));
  ASSERT got='22023:payload_invalid', w.fn||' shape: '||got;
  PERFORM set_config('sophia.bound_output',NULL,true);
 END LOOP;
END $$;

-- C. The closed public request: every member exactly, strings only (originalGeneration may be null), a uuid reservation;
--    a caller-chosen project or runtime is refused, never trusted.
DO $$ DECLARE w record; got text; good jsonb; bad jsonb; m text;
 v jsonb:=jsonb_build_object('reservationId','00000000-0000-4000-8000-000000000001','dispatchId','00000000-0000-4000-8000-000000000002',
  'callId','llm-x','originalGeneration',NULL,'emitterIdentityDigest',repeat('a',64),'outboundParamsDigest',repeat('b',64),
  'authorizeSetDigest',repeat('c',64),'applyReceiptDigest',repeat('d',64),'outcomeKind','sent','evidenceDigest',repeat('e',64),
  'observedAt','2026-11-16T12:00:00.000000Z');
BEGIN
 PERFORM set_config('sophia.bound_output','v1',true);
 FOR w IN SELECT * FROM wrappers LOOP
  good:=(SELECT jsonb_object_agg(k,v->k) FROM unnest(CASE w.step
    WHEN 'apply' THEN ARRAY['authorizeSetDigest','callId','dispatchId','emitterIdentityDigest','originalGeneration','outboundParamsDigest','reservationId']
    WHEN 'claim' THEN ARRAY['applyReceiptDigest','dispatchId','originalGeneration','reservationId']
    ELSE ARRAY['dispatchId','evidenceDigest','observedAt','outcomeKind','reservationId'] END) k);
  FOREACH bad IN ARRAY ARRAY[
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good,'projectId','00000000-0000-4000-8000-000000000003'),
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good||jsonb_build_object('runtimeId','00000000-0000-4000-8000-000000000004')),
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good||jsonb_build_object('project_id','00000000-0000-4000-8000-000000000003')),
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good-'dispatchId'),
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good||jsonb_build_object('reservationId','not-a-uuid')),
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good||jsonb_build_object('dispatchId',1)),
    jsonb_build_object('attemptId',1,'nativeSessionId','s',w.step,good),
    jsonb_build_object('nativeSessionId','s',w.step,good),
    jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,to_jsonb(ARRAY[good]))] LOOP
   got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b',bad));
   ASSERT got='22023:payload_invalid', w.fn||' closed request '||bad::text||': '||got;
  END LOOP;
  -- A well-formed request with an unknown capability passes the selection and the shape, then is refused by the
  -- maintained scope (not by anything the setting grants).
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b',
   jsonb_build_object('attemptId','a','nativeSessionId','s',w.step,good)));
  ASSERT got NOT LIKE '%bound_output%' AND got NOT LIKE '22023:payload_invalid' AND got<>'accepted', w.fn||' scope refusal: '||got;
 END LOOP;
 PERFORM set_config('sophia.bound_output',NULL,true);
END $$;

-- D. The setting never opens a private entry: as the API, with v1, every private entry is still refused by privilege.
DO $$ DECLARE w record; got text;
BEGIN
 PERFORM set_config('sophia.bound_output','v1',true);
 FOR w IN SELECT * FROM wrappers LOOP
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.private,'(',1),'\x00','u','b','{}'));
  ASSERT got LIKE '42501:permission denied%', w.private||' as the API: '||got;
 END LOOP;
 PERFORM set_config('sophia.bound_output',NULL,true);
END $$;
RESET ROLE;

-- E. The worker never executes a wrapper, with or without the setting.
SET LOCAL ROLE sophia_worker;
DO $$ DECLARE w record; got text;
BEGIN
 PERFORM set_config('sophia.bound_output','v1',true);
 FOR w IN SELECT * FROM wrappers LOOP
  got:=pg_temp.outcome(format('SELECT %s(%L::bytea,%L,%L,%L::jsonb)',split_part(w.fn,'(',1),'\x00','u','b','{}'));
  ASSERT got LIKE '42501:permission denied%', w.fn||' as the worker: '||got;
 END LOOP;
END $$;
RESET ROLE;

ROLLBACK;
