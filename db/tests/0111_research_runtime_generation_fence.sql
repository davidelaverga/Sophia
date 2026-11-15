-- INC04-R07-C3-FENCE-001 (0111): the runtime generation fence, statically. Its canonical snapshot encoding against a
-- literal vector and digest, the bound refused (never truncated), the generation token, the replaced functions' marked
-- re-checks, and that no application role can execute the fence or read or write its tables. Writes nothing.
DO $$
DECLARE o record; v jsonb; n integer;
BEGIN
 -- The literal vector: jsonb's own output, keys by length then bytes; the digest over the kind-prefixed text.
 v:='[{"reservationId":"00000000-0000-4000-8000-000000000001","state":"uncertain","reservedUsd":0.100000},
      {"reservationId":"00000000-0000-4000-8000-000000000002","state":"reserved","reservedUsd":0.250000}]';
 SELECT * INTO o FROM sophia.research_runtime_fence_encode('monetary_open',v);
 IF o.encoding<>'[{"state": "uncertain", "reservedUsd": 0.100000, "reservationId": "00000000-0000-4000-8000-000000000001"}, {"state": "reserved", "reservedUsd": 0.250000, "reservationId": "00000000-0000-4000-8000-000000000002"}]'
  OR o.digest<>'d52baa5abd31242630ba03e5f61121795f9d06332ff1060aab57abb84fe5f624' OR o.row_count<>2 THEN
  RAISE EXCEPTION 'fence encoding: literal vector %', row_to_json(o); END IF;
 SELECT * INTO o FROM sophia.research_runtime_fence_encode('cause','[]');
 IF o.encoding<>'[]' OR o.digest<>'878809635aa93d68a109fd7ef7916c6032bdd334b2d5c64845d7114e13261a23' OR o.row_count<>0 THEN
  RAISE EXCEPTION 'fence encoding: empty cause %', row_to_json(o); END IF;
 SELECT * INTO o FROM sophia.research_runtime_fence_encode('monetary_open','[]');
 IF o.digest<>'6c2ea1aec94b7c8d71c8a4e8ac70f203745bd8d2f7888371d88dd0d2b5358105' THEN
  RAISE EXCEPTION 'fence encoding: empty monetary-open %', o.digest; END IF;
 IF sophia.research_runtime_generation('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333',7)<>'b4adda4c889cbf2ee56296b812f4142f2c46b24389b21273d5c03f6798cce62a' THEN
  RAISE EXCEPTION 'generation token: literal vector'; END IF;

 -- Not canonical: unsorted, duplicate, no id, a non-object, an unknown kind, not an array.
 FOR v IN SELECT x FROM unnest(ARRAY[
   '[{"reservationId":"00000000-0000-4000-8000-000000000002"},{"reservationId":"00000000-0000-4000-8000-000000000001"}]',
   '[{"reservationId":"00000000-0000-4000-8000-000000000001"},{"reservationId":"00000000-0000-4000-8000-000000000001"}]',
   '[{"state":"reserved"}]', '[1]', '{}']::jsonb[]) x LOOP
  BEGIN
   PERFORM sophia.research_runtime_fence_encode('monetary_open',v);
   RAISE EXCEPTION 'fence encoding accepted %', v USING ERRCODE='P0001';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;
 BEGIN
  PERFORM sophia.research_runtime_fence_encode('settled','[]');
  RAISE EXCEPTION 'fence encoding accepted an unknown kind' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;

 -- E01: 256 rows encode; 257 rows, or one row past 262144 bytes, are refused, never truncated.
 SELECT jsonb_agg(jsonb_build_object('reservationId',lpad(to_hex(i),8,'0')||'-0000-4000-8000-000000000000') ORDER BY i) INTO v
  FROM generate_series(1,256) i;
 SELECT * INTO o FROM sophia.research_runtime_fence_encode('cause',v);
 IF o.row_count<>256 THEN RAISE EXCEPTION 'fence encoding: 256 rows %', o.row_count; END IF;
 v:=v||jsonb_build_array(jsonb_build_object('reservationId','ffffffff-0000-4000-8000-000000000000'));
 BEGIN
  PERFORM sophia.research_runtime_fence_encode('cause',v);
  RAISE EXCEPTION 'fence encoding accepted 257 rows' USING ERRCODE='P0001';
 EXCEPTION WHEN program_limit_exceeded THEN NULL;
 END;
 BEGIN
  PERFORM sophia.research_runtime_fence_encode('cause',
   jsonb_build_array(jsonb_build_object('reservationId','00000000-0000-4000-8000-000000000001','pad',repeat('x',262144))));
  RAISE EXCEPTION 'fence encoding accepted 262144+ bytes' USING ERRCODE='P0001';
 EXCEPTION WHEN program_limit_exceeded THEN NULL;
 END;

 -- An unknown target, and a fence naming no valid token, are refused before any effect.
 BEGIN
  PERFORM sophia.fence_contribution_runtime(gen_random_uuid(),gen_random_uuid(),repeat('a',64));
  RAISE EXCEPTION 'fence accepted an unknown target' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM sophia.fence_contribution_runtime(gen_random_uuid(),gen_random_uuid(),NULL);
  RAISE EXCEPTION 'fence accepted no token' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM sophia.retire_contribution_runtime(gen_random_uuid(),gen_random_uuid());
  RAISE EXCEPTION 'retire accepted an unknown target' USING ERRCODE='P0001';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;

-- The replaced functions carry their marked re-checks (and hello keeps RETIRE-HELLO); retire keeps its signature.
DO $$
BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='sophia.runtime_lease(bytea,text,text)'::regprocedure) NOT LIKE '%FENCE-LEASE%' THEN
  RAISE EXCEPTION 'runtime_lease lacks FENCE-LEASE'; END IF;
 IF (SELECT prosrc FROM pg_proc WHERE oid='sophia.runtime_hello(bytea,text,text,jsonb)'::regprocedure) NOT LIKE '%FENCE-HELLO%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='sophia.runtime_hello(bytea,text,text,jsonb)'::regprocedure) NOT LIKE '%RETIRE-HELLO%' THEN
  RAISE EXCEPTION 'runtime_hello lacks FENCE-HELLO or RETIRE-HELLO'; END IF;
 IF (SELECT prorettype FROM pg_proc WHERE oid='sophia.retire_contribution_runtime(uuid,uuid)'::regprocedure)<>'jsonb'::regtype THEN
  RAISE EXCEPTION 'retire_contribution_runtime changed its result type'; END IF;
END $$;

-- No application role (whatever it sets) executes the fence or touches its tables; both are RLS-enabled and frozen.
DO $$
DECLARE r text; f text;
BEGIN
 FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker'] LOOP
  FOREACH f IN ARRAY ARRAY['sophia.fence_contribution_runtime(uuid,uuid,text)','sophia.research_runtime_fence(uuid,uuid,text,text)',
    'sophia.retire_contribution_runtime(uuid,uuid)','sophia.contribution_runtime_generation(uuid,uuid)',
    'sophia.research_runtime_fence_rows(uuid,uuid,text)','sophia.research_runtime_fence_encode(text,jsonb)',
    'sophia.research_runtime_generation(uuid,uuid,uuid,bigint)'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION '% can execute %', r, f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['sophia.research_runtime_fences','sophia.research_runtime_fence_snapshots'] LOOP
   IF has_table_privilege(r,f,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '% has a privilege on %', r, f; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('sophia.research_runtime_fences'::regclass,'sophia.research_runtime_fence_snapshots'::regclass)
   AND NOT relrowsecurity) THEN RAISE EXCEPTION 'fence tables without RLS'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('sophia.research_runtime_fences'::regclass,'sophia.research_runtime_fence_snapshots'::regclass)
   AND tgfoid='sophia.research_runtime_fence_frozen()'::regprocedure AND tgenabled='O')<>4 THEN
  RAISE EXCEPTION 'fence tables are not frozen'; END IF;
 -- No new foreign key from the fence reaches an account row (E03).
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f'
   AND conrelid IN ('sophia.research_runtime_fences'::regclass,'sophia.research_runtime_fence_snapshots'::regclass)
   AND confrelid NOT IN ('sophia.api_contribution_runtimes'::regclass,'sophia.research_runtime_fences'::regclass)) THEN
  RAISE EXCEPTION 'a fence foreign key reaches another table'; END IF;
END $$;
