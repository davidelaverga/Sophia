-- INC04-R07-C2B-DURABLE-001 (0110): observed call facts at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back.
-- * Privileges and lock order: the 0110 helpers are executable by no application role; the replaced fact writer keeps
--   0109's order (0109's own static checks run on it too).
-- * The opt-in at reserve (SI01), the closed observation and its fixed refusal (SI03), the 13 shared vectors (022d) bound
--   to the actual SQL canonical, the literal v1 / v2 digests, the frozen witnesses (every dimension, the grouped cross_c1p
--   preimage: N1-only, counts-only, simultaneous) and the pure merge (SI02) and cross (SI04) rules.
-- Real reservations, settlements, money, restrictions and the retained pre-0110 rows run in the persistence DB tests.
BEGIN;

-- --- privileges and the fact writer ----------------------------------------------------------------------------------------
DO $$ DECLARE f record; src text; BEGIN
 FOR f IN SELECT p.oid, p.oid::regprocedure AS sig, p.proacl FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND (p.proname LIKE 'research_call_observ%' OR p.proname IN ('research_call_facts_version','research_call_without_observed',
    'research_call_truth_observed','research_call_a57_side','research_call_a57_merged','research_call_cross')) LOOP
  IF has_function_privilege('sophia_api',f.oid,'EXECUTE') OR has_function_privilege('sophia_worker',f.oid,'EXECUTE')
     OR has_function_privilege('sophia_conversation_assembler',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'An application role executes %', f.sig; END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=f.oid)))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION '% is executable by PUBLIC', f.sig; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname LIKE 'research_call_observ%')<>15 THEN
  RAISE EXCEPTION 'the observed helpers changed: %', (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace AND p.proname LIKE 'research_call_observ%'); END IF;
 -- The fact writer and its new helpers touch no account-side row; money is reached only after the classification.
 FOR f IN SELECT p.proname, p.prosrc FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
   AND (p.proname LIKE 'research_call_observ%' OR p.proname IN ('research_call_cross','research_call_settle','research_call_retain')) LOOP
  IF f.prosrc ~* 'api_accounts|api_account_qualifications|api_contribution_claims|api_connections|api_contribution_grants|end_research_reservation' THEN
   RAISE EXCEPTION '% touches an account-side row or money', f.proname; END IF;
 END LOOP;
 SELECT prosrc INTO src FROM pg_proc WHERE oid='sophia.research_call_settle(uuid,uuid,jsonb)'::regprocedure;
 IF position('research_call_observe(' IN src)=0
    OR position('m:=sophia.research_call_observe(sophia.research_call_truth_observed(t)' IN src)
     >position('IF disposition=''extended'' AND (v1 IS NULL OR v1=''extended'') THEN' IN src)
    OR position('UPDATE sophia.research_evidence_guards' IN src)<position('research_call_observed_write(' IN src) THEN
  RAISE EXCEPTION 'the observation is not classified before money, or the guard is not last'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='research_call_truth_observed_monotone' AND tgrelid='sophia.research_call_truth'::regclass) THEN
  RAISE EXCEPTION 'no monotone observed truth'; END IF;
END $$;

-- --- the opt-in at reserve (SI01) ------------------------------------------------------------------------------------------
DO $$ DECLARE v jsonb; r text; BEGIN
 v:=sophia.research_call_request('{"kind":"model","mode":"tracked_v1","contract":"legacy_report"}');
 IF v IS DISTINCT FROM '{"mode":"tracked_v1","contract":"legacy_report","declared":{}}'::jsonb OR sophia.research_call_facts_version(v)<>1 THEN
  RAISE EXCEPTION 'v1 is unchanged: %', v; END IF;
 v:=sophia.research_call_request('{"kind":"model","mode":"tracked_v1","contract":"legacy_report","facts":"observed_v1"}');
 IF v IS DISTINCT FROM '{"mode":"tracked_v1","contract":"legacy_report","declared":{},"facts":"observed_v1"}'::jsonb OR sophia.research_call_facts_version(v)<>2 THEN
  RAISE EXCEPTION 'opt-in: %', v; END IF;
 FOREACH r IN ARRAY ARRAY['{"kind":"model","facts":"observed_v1"}','{"kind":"model","mode":"tracked_v1","contract":"legacy_report","facts":"observed_v2"}',
   '{"kind":"model","mode":"tracked_v1","contract":"legacy_report","facts":null}','{"kind":"model","mode":"tracked_v1","contract":"legacy_report","facts":["observed_v1"]}',
   '{"kind":"model","mode":"tracked_v1","contract":"legacy_report","factsVersion":2}'] LOOP
  BEGIN
   v:=sophia.research_call_request(r::jsonb);
   IF r LIKE '%factsVersion%' AND sophia.research_call_facts_version(v)=1 THEN CONTINUE; END IF; -- an unknown key is no opt-in
   RAISE EXCEPTION 'accepted: %', r;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
END $$;

-- --- the 13 shared vectors (022d), on the actual SQL canonical ----------------------------------------------------------------
DO $$ DECLARE o jsonb; BEGIN
 -- V01-absent: no observation (absent): the v1 fallback
 IF sophia.research_call_observed_of('{"contract": "c1p_complete_report"}'::jsonb) IS NOT NULL THEN RAISE EXCEPTION 'V01-absent'; END IF;
 -- V02-optedin-all-unknown
 o:=sophia.research_call_observed('{"deliveryUnknownReason":"no_frame_delivered"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=unknown|status=-|n1=-|n2=-|term=-|in=-|cr=-|out=-|cf=-|dr=no_frame_delivered'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'78feaf2fe3d9361fc53e9ca7361b6ea8453466b63212eada3e30d85f9cdc0c85' THEN
  RAISE EXCEPTION 'V02-optedin-all-unknown: %', sophia.research_call_observed_canonical(o); END IF;
 IF sophia.research_call_observed_of(jsonb_build_object('observed','{"deliveryUnknownReason": "no_frame_delivered"}'::jsonb)) IS NOT NULL THEN RAISE EXCEPTION 'V02-optedin-all-unknown keeps v1'; END IF;
 -- V03-zero
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_Z"},"sources":["completed"]},"n2":{"id":{"status":"supported","value":"req_Z"},"sources":["response_header"]},"providerTerminal":"completed","rawCounts":{"inputTotal":0,"cacheRead":0,"output":0},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:5a8d4bcde7c03888156a2f566fd44ccfcef2e7a7c81cf1edfbe6e9406c3025ce@completed|n2=s:af887c14d9ee6d3215f95e83b45e6f9648ee671eaff652008bab0e6e2129e262@response_header|term=completed|in=0|cr=0|out=0|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'e8f48bdd8569629f5ac1703255a1ec331533f1f23d64bd376859219d4436f406' THEN
  RAISE EXCEPTION 'V03-zero: %', sophia.research_call_observed_canonical(o); END IF;
 -- V04-complete
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["created","completed"]},"n2":{"id":{"status":"supported","value":"req_X"},"sources":["response_header"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":200,"output":50},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca@created,completed|n2=s:be836566264d01df9977f9730737cfa2d1b951decd3aab95ffc89af09004fdd6@response_header|term=completed|in=1000|cr=200|out=50|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'05087a64b446df98659c5c293cf5ce044cd395876f00bb75099397439d785f35' THEN
  RAISE EXCEPTION 'V04-complete: %', sophia.research_call_observed_canonical(o); END IF;
 -- V05-partial-failed
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_F"},"sources":["created","failed"]},"providerTerminal":"failed","rawCounts":{"inputTotal":1000,"output":7},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:f00378e4bc7d498bd81f54091754e75b3ba9ebdff23ad22b584d73b8141fbfce@created,failed|n2=-|term=failed|in=1000|cr=-|out=7|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'8fe12a77efa6ef2b3cc9fb7fa293dee7059d9e3da55fa61544b764d563054bef' THEN
  RAISE EXCEPTION 'V05-partial-failed: %', sophia.research_call_observed_canonical(o); END IF;
 -- V06-provenance-union-order-a
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["created","completed"]},"n2":{"id":{"status":"supported","value":"req_X"},"sources":["response_header","typed_error"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":200,"output":50},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca@created,completed|n2=s:be836566264d01df9977f9730737cfa2d1b951decd3aab95ffc89af09004fdd6@response_header,typed_error|term=completed|in=1000|cr=200|out=50|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'94a2788737e208b6a24f7b1457131d3fb8a260ac1c8fb38ca86cfee7ceeae0aa' THEN
  RAISE EXCEPTION 'V06-provenance-union-order-a: %', sophia.research_call_observed_canonical(o); END IF;
 -- V07-provenance-union-order-b
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["completed","created"]},"n2":{"id":{"status":"supported","value":"req_X"},"sources":["typed_error","response_header"]},"providerTerminal":"completed","rawCounts":{"output":50,"cacheRead":200,"inputTotal":1000},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca@created,completed|n2=s:be836566264d01df9977f9730737cfa2d1b951decd3aab95ffc89af09004fdd6@response_header,typed_error|term=completed|in=1000|cr=200|out=50|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'94a2788737e208b6a24f7b1457131d3fb8a260ac1c8fb38ca86cfee7ceeae0aa' THEN
  RAISE EXCEPTION 'V07-provenance-union-order-b: %', sophia.research_call_observed_canonical(o); END IF;
 -- V08-sticky-conflict
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["created","completed"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":200,"output":50},"conflicts":[{"dimension":"n1","witness":"1a9396ba4fbed4ec880b51dc13662e999f4a67606472ef7febcaa9c52cfed79c"}],"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca@created,completed|n2=-|term=completed|in=1000|cr=200|out=50|cf=n1:1a9396ba4fbed4ec880b51dc13662e999f4a67606472ef7febcaa9c52cfed79c|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'cffc214ced450bcb94df3946b1b78cf9238b6631bb5e21fd49d1bf2a3fb81756' THEN
  RAISE EXCEPTION 'V08-sticky-conflict: %', sophia.research_call_observed_canonical(o); END IF;
 -- V09-same-terminal-gain-and-terminal-conflict
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"providerTerminal":"failed","rawCounts":{"inputTotal":1000,"output":7},"conflicts":[{"dimension":"provider_terminal","witness":"babe463ef39e1d02efc4be5abf686937852a9476d2276e87b1d920ca2da0ee58"}],"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=-|n2=-|term=failed|in=1000|cr=-|out=7|cf=provider_terminal:babe463ef39e1d02efc4be5abf686937852a9476d2276e87b1d920ca2da0ee58|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'c4bffc31ad85042339fa2fe93eea18b13b47d1793dad1635da42d309a85ef6ea' THEN
  RAISE EXCEPTION 'V09-same-terminal-gain-and-terminal-conflict: %', sophia.research_call_observed_canonical(o); END IF;
 -- V10-delivery-unknown
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n2":{"id":{"status":"supported","value":"req_X"},"sources":["response_header"]},"deliveryUnknownReason":"closed_before_terminal_frame"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=-|n2=s:be836566264d01df9977f9730737cfa2d1b951decd3aab95ffc89af09004fdd6@response_header|term=-|in=-|cr=-|out=-|cf=-|dr=closed_before_terminal_frame'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'24f9c250bc05fcac27f81945b965ca7e091d6e9f5227e4b0a3c92181422381c8' THEN
  RAISE EXCEPTION 'V10-delivery-unknown: %', sophia.research_call_observed_canonical(o); END IF;
 -- V11-cross-c1p-conflict
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["completed"]},"providerTerminal":"completed","rawCounts":{"inputTotal":900,"cacheRead":200,"output":50},"conflicts":[{"dimension":"cross_c1p","witness":"bbaf1a54ca9e55c89f28cadd408942857f261b195866ff12905aa21e7283867f"}],"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca@completed|n2=-|term=completed|in=900|cr=200|out=50|cf=cross_c1p:bbaf1a54ca9e55c89f28cadd408942857f261b195866ff12905aa21e7283867f|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'84b413f5a83da4c2c19875acaa2590cffbd912dfab1228932aad224eed6d6ec7' THEN
  RAISE EXCEPTION 'V11-cross-c1p-conflict: %', sophia.research_call_observed_canonical(o); END IF;
 -- V12-unsupported-n2
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["completed"]},"n2":{"id":{"status":"identity_unsupported","reason":"over_bound"},"sources":["response_header"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":200,"output":50},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=200|n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca@completed|n2=u:over_bound@response_header|term=completed|in=1000|cr=200|out=50|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'65a7de7a365038b064a1379b8f7fc9a22aa1c488fad6e183b6136dc4f10016f6' THEN
  RAISE EXCEPTION 'V12-unsupported-n2: %', sophia.research_call_observed_canonical(o); END IF;
 -- V13-http-error
 o:=sophia.research_call_observed('{"sent":"observable_transport_response","httpStatus":500,"n2":{"id":{"status":"supported","value":"req_E"},"sources":["typed_error"]},"deliveryUnknownReason":"none"}'::jsonb);
 IF sophia.research_call_observed_canonical(o)<>'c2b-facts-v2|sent=observable_transport_response|status=500|n1=-|n2=s:a2dc8b3acd0451a989f7b6e70d4aec518157bb88ca72298cd8863ff434596253@typed_error|term=-|in=-|cr=-|out=-|cf=-|dr=none'
    OR encode(sha256(convert_to(sophia.research_call_observed_canonical(o),'UTF8')),'hex')<>'64f58a0b17a83d3979cd16a9a0d4fda9df7d2dbcd428cba8851a80c1bb5b61c1' THEN
  RAISE EXCEPTION 'V13-http-error: %', sophia.research_call_observed_canonical(o); END IF;
 -- V07 (the same facts in another order) equals V06: the sources and counts are normalized, not echoed in wire order.
END $$;

-- --- the closed observation: one fixed message, no echo (SI03) ------------------------------------------------------------------
DO $$ DECLARE d text; m text; ok jsonb:='{"deliveryUnknownReason":"none"}'; BEGIN
 FOREACH d IN ARRAY ARRAY['null','[]','"none"','{}','{"deliveryUnknownReason":null}','{"deliveryUnknownReason":"consumer_closed"}',
  '{"deliveryUnknownReason":"none","sent":null}','{"deliveryUnknownReason":"none","sent":"sent"}','{"deliveryUnknownReason":"none","extra":"CANARY-7f3e"}',
  '{"deliveryUnknownReason":"none","httpStatus":99}','{"deliveryUnknownReason":"none","httpStatus":600}','{"deliveryUnknownReason":"none","httpStatus":200.5}',
  '{"deliveryUnknownReason":"none","httpStatus":"200"}','{"deliveryUnknownReason":"none","httpStatus":null}',
  '{"deliveryUnknownReason":"none","n1":null}','{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":[]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["completed","completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["created","completed","incomplete","failed","created"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["response_header"]}}',
  '{"deliveryUnknownReason":"none","n2":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["response_header","typed_error","response_header"]}}',
  '{"deliveryUnknownReason":"none","n2":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":""},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":null},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":1},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"unknown"},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"identity_unsupported","reason":"long"},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"identity_unsupported","reason":"over_bound","value":"CANARY-7f3e"},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","n1":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["completed"],"x":1}}',
  '{"deliveryUnknownReason":"none","n3":{"id":{"status":"supported","value":"CANARY-7f3e"},"sources":["completed"]}}',
  '{"deliveryUnknownReason":"none","rawCounts":{"inputTotal":1}}','{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":null}',
  '{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":{"inputTotal":9007199254740992}}',
  '{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":{"inputTotal":-1}}',
  '{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":{"inputTotal":1.5}}',
  '{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":{"inputTotal":1e400}}',
  '{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":{"cacheWrite":1}}',
  '{"deliveryUnknownReason":"none","providerTerminal":"completed","rawCounts":{"reasoning":1}}',
  '{"deliveryUnknownReason":"none","providerTerminal":"stream_completed"}','{"deliveryUnknownReason":"none","providerTerminal":null}',
  '{"deliveryUnknownReason":"none","conflicts":null}','{"deliveryUnknownReason":"none","conflicts":{}}',
  '{"deliveryUnknownReason":"none","conflicts":[{"dimension":"n1","witness":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]}',
  '{"deliveryUnknownReason":"none","conflicts":[{"dimension":"n3","witness":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}',
  '{"deliveryUnknownReason":"none","conflicts":[{"dimension":"n1","witness":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","x":1}]}',
  '{"deliveryUnknownReason":"none","conflicts":[{"dimension":"n1","witness":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"dimension":"n1","witness":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}',
  '{"deliveryUnknownReason":"none","c2b":{}}','{"deliveryUnknownReason":"none","factsVersion":2}'] LOOP
  BEGIN
   PERFORM sophia.research_call_observed(d::jsonb);
   RAISE EXCEPTION 'accepted: %', d;
  EXCEPTION WHEN invalid_parameter_value THEN
   GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
   IF m<>'Invalid observed facts' THEN RAISE EXCEPTION 'echo or another message: %', m; END IF;
  END;
 END LOOP;
 -- Bounds that pass: an 8192-byte id (4096 two-byte characters), every source, eight dimensions, 2^53-1, status 100/599.
 PERFORM sophia.research_call_observed(jsonb_build_object('deliveryUnknownReason','none','httpStatus',100,'n1',jsonb_build_object('id',
  jsonb_build_object('status','supported','value',repeat('é',4096)),'sources',jsonb_build_array('failed','incomplete','completed','created'))));
 PERFORM sophia.research_call_observed(jsonb_build_object('deliveryUnknownReason','none','httpStatus',599,'providerTerminal','completed',
  'rawCounts',jsonb_build_object('inputTotal',9007199254740991,'cacheRead',0,'output',0),'conflicts',(SELECT jsonb_agg(jsonb_build_object(
  'dimension',x.dim,'witness',repeat('a',64))) FROM unnest(sophia.research_call_observed_dimensions()) AS x(dim))));
 BEGIN PERFORM sophia.research_call_observed(jsonb_build_object('deliveryUnknownReason','none','n1',jsonb_build_object('id',
   jsonb_build_object('status','supported','value',repeat('é',4096)||'x'),'sources',jsonb_build_array('completed'))));
  RAISE EXCEPTION 'an 8193-byte id'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF (SELECT count(*) FROM jsonb_object_keys(sophia.research_call_observed(ok)))<>10 THEN RAISE EXCEPTION 'every key normalized'; END IF;
END $$;

-- --- literal digests (v1 exact, all-unknown fallback, v2) ---------------------------------------------------------------------
DO $$ DECLARE c1p sophia.research_call_identities; f sophia.research_call_fact; g sophia.research_call_fact; complete jsonb; v04 jsonb; BEGIN
 c1p:=jsonb_populate_record(NULL::sophia.research_call_identities,'{"evidence_id":"a6000000-0000-4000-8000-000000000001","mode":"tracked_v1","contract":"c1p_complete_report","facts_version":2}');
 complete:=jsonb_build_object('outcome','settled','costUsd',0.000046,'evidence',jsonb_build_object('contract','c1p_complete_report',
  'report','complete_report','counts','{"nonCachedInput":{"class":"known","value":3},"cacheRead":{"class":"known","value":2},"cacheWrite":{"class":"no_separate_reported_class"},"output":{"class":"known","value":4}}'::jsonb,
  'ending','stream_completed','responseId','{"status":"supported","value":"resp_1"}'::jsonb));
 -- research-call-facts-v1|a6000000-…-0001|tracked_v1|c1p_complete_report|complete_report|known|3|known|2|
 -- no_separate_reported_class|-|known|4|stream_completed|provider_terminal=unknown|settled|0.000046|supported|sha(resp_1)|-|-|header=unknown
 f:=sophia.research_call_facts(c1p,complete);
 IF f.observed IS NOT NULL OR f.digest<>'7e26643059c5130e2e12ca4b7b6c6929471c5943200471f05b2417defcebb8bb' THEN
  RAISE EXCEPTION 'the literal v1 digest: %', f.digest; END IF;
 -- An opted-in settlement with only an all-unknown observation keeps that exact digest.
 IF sophia.research_call_observed_of(jsonb_set(complete->'evidence','{observed}','{"deliveryUnknownReason":"no_frame_delivered","sent":"unknown"}')) IS NOT NULL THEN
  RAISE EXCEPTION 'an all-unknown observation is not v1'; END IF;
 IF (sophia.research_call_facts(c1p,sophia.research_call_without_observed(jsonb_set(complete,'{evidence,observed}','{"deliveryUnknownReason":"no_frame_delivered"}')))).digest<>f.digest THEN
  RAISE EXCEPTION 'the v1 fallback digest'; END IF;
 -- research-call-facts-v2 over the same field list plus V04's canonical (800/200/50, resp_A, $0.000046).
 v04:='{"sent":"observable_transport_response","httpStatus":200,"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["created","completed"]},"n2":{"id":{"status":"supported","value":"req_X"},"sources":["response_header"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":200,"output":50},"deliveryUnknownReason":"none"}';
 g:=sophia.research_call_facts(c1p,jsonb_set(jsonb_set(jsonb_set(jsonb_set(complete,'{evidence,counts,nonCachedInput,value}','800'),
  '{evidence,counts,cacheRead,value}','200'),'{evidence,counts,output,value}','50'),'{evidence,responseId,value}','"resp_A"'));
 g.observed:=sophia.research_call_observed_canonical(sophia.research_call_observed(v04));
 IF sophia.research_call_fact_digest(c1p,g)<>'e44f69ee76b84209e9f10d27c1fed07ca1dc003977af40a67381ccf2c770f814' THEN
  RAISE EXCEPTION 'the literal v2 digest: %', sophia.research_call_fact_digest(c1p,g); END IF;
END $$;

-- --- witnesses: every dimension and the frozen grouped cross_c1p preimage -----------------------------------------------------
DO $$ DECLARE a jsonb; o jsonb; x text; m jsonb; t jsonb; BEGIN
 IF sophia.research_call_observed_witness('n1','s:'||encode(sha256(convert_to('resp_B','UTF8')),'hex'))<>'1a9396ba4fbed4ec880b51dc13662e999f4a67606472ef7febcaa9c52cfed79c'
    OR sophia.research_call_observed_witness('provider_terminal','completed')<>'babe463ef39e1d02efc4be5abf686937852a9476d2276e87b1d920ca2da0ee58' THEN
  RAISE EXCEPTION 'the V08 / V09 witnesses'; END IF;
 a:=sophia.research_call_a57_side('supported','resp_A',NULL,800,200,50);
 -- Counts only: 800+200 against 900 (exact integers; the same N1 on both sides).
 o:=sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["completed"]},"providerTerminal":"completed","rawCounts":{"inputTotal":900,"cacheRead":200,"output":50},"deliveryUnknownReason":"none"}');
 x:=sophia.research_call_cross(a,o);
 IF x<>'a57_n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca|observed_n1=s:ec703a88658a37077b84de06a7653b50faf6912bc2ce17daac42d3a293af5eca|a57_noncached_input=800|a57_cache_read=200|a57_output=50|observed_input_total=900|observed_cache_read=200|observed_output=50'
    OR sophia.research_call_observed_witness('cross_c1p',x)<>'9ce3de671a4befe7586585f7835a4c2732234e52278e5d558f2bd21babed95c9' THEN RAISE EXCEPTION 'counts only: %', x; END IF;
 -- N1 only: the same namespace, counts unknown on both sides.
 x:=sophia.research_call_cross(sophia.research_call_a57_side('supported','resp_A',NULL,NULL,NULL,NULL),
  sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_B"},"sources":["created"]},"deliveryUnknownReason":"closed_before_terminal_frame"}'));
 IF sophia.research_call_observed_witness('cross_c1p',x)<>'4f570038e82f3cff2e3e908a38bf8c9268a9b58ba9b67c6810a18d36156b1ff1' THEN RAISE EXCEPTION 'N1 only: %', x; END IF;
 -- Simultaneous.
 x:=sophia.research_call_cross(a,sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_B"},"sources":["completed"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":201,"output":51},"deliveryUnknownReason":"none"}'));
 IF sophia.research_call_observed_witness('cross_c1p',x)<>'fbbd5df6cc67cb3cb066ecd128d43e5af26e59d3325039d49c198e16939b3476' THEN RAISE EXCEPTION 'simultaneous: %', x; END IF;
 -- SI04: consistent sides, an unknown side, an unsupported A57 id, and R3 (an unknown cacheRead is never zero).
 IF sophia.research_call_cross(a,sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["completed"]},"providerTerminal":"completed","rawCounts":{"inputTotal":1000,"cacheRead":200,"output":50},"deliveryUnknownReason":"none"}')) IS NOT NULL
    OR sophia.research_call_cross(sophia.research_call_a57_side('unknown',NULL,NULL,NULL,NULL,NULL),
     sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_B"},"sources":["created"]},"deliveryUnknownReason":"none"}')) IS NOT NULL
    OR sophia.research_call_cross(sophia.research_call_a57_side('identity_unsupported',NULL,'over_bound',NULL,NULL,NULL),
     sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_B"},"sources":["created"]},"deliveryUnknownReason":"none"}')) IS NOT NULL
    OR sophia.research_call_cross(sophia.research_call_a57_side('supported','resp_A',NULL,800,NULL,50),
     sophia.research_call_observed('{"providerTerminal":"failed","rawCounts":{"inputTotal":1000,"output":50},"deliveryUnknownReason":"none"}')) IS NOT NULL THEN
  RAISE EXCEPTION 'no contradiction where a side is unknown or consistent'; END IF;
 -- The pure merge: first-known, provenance union, one witness per dimension, the delivery stage, no counts across terminals.
 t:=sophia.research_call_truth_observed(jsonb_populate_record(NULL::sophia.research_call_truth,
  '{"sent":"unknown","n1_status":"unknown","header_id_status":"unknown","provider_terminal":"unknown"}'));
 m:=sophia.research_call_observed_merge(t,sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["completed"]},"providerTerminal":"failed","rawCounts":{"output":7},"deliveryUnknownReason":"closed_before_terminal_frame"}'));
 m:=sophia.research_call_observed_merge(m->'o',sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_A"},"sources":["created"]},"providerTerminal":"failed","rawCounts":{"inputTotal":1000,"output":7},"deliveryUnknownReason":"none"}'));
 IF m->'o'->'n1'->'sources'<>'["created","completed"]' OR m->'o'->'in'<>'1000' OR m->'o'->>'dr'<>'none' OR m->'w'<>'{}' OR NOT (m->>'gained')::boolean THEN
  RAISE EXCEPTION 'gain: %', m; END IF;
 m:=sophia.research_call_observed_merge(m->'o',sophia.research_call_observed('{"providerTerminal":"completed","rawCounts":{"inputTotal":5,"output":5},"deliveryUnknownReason":"no_frame_delivered"}'));
 IF m->'o'->>'term'<>'failed' OR m->'o'->'in'<>'1000' OR m->'o'->>'dr'<>'none' OR NOT m->'w' ? 'provider_terminal' OR m->'w' ? 'input_total' THEN
  RAISE EXCEPTION 'another terminal: %', m; END IF;
END $$;

-- --- R1 F02: an integral count or status from its validated numeric value; R1 F01: every cross witness kept ----------------
DO $$ DECLARE v text; d text; m text; t jsonb; o jsonb; BEGIN
 FOREACH d IN ARRAY ARRAY['1.0','1','200.0','1e3','0.0','9007199254740991.0','9007199254740991'] LOOP
  v:=sophia.research_call_observed_count(d::jsonb)::text;
  IF v<>(CASE d WHEN '1.0' THEN '1' WHEN '1' THEN '1' WHEN '200.0' THEN '200' WHEN '1e3' THEN '1000' WHEN '0.0' THEN '0'
     ELSE '9007199254740991' END) THEN RAISE EXCEPTION 'F02 % -> %', d, v; END IF;
 END LOOP;
 FOREACH d IN ARRAY ARRAY['1.5','-1','-0.5','9007199254740992','1e16','"1"','null','true','{}','[1]'] LOOP
  BEGIN
   PERFORM sophia.research_call_observed_count(d::jsonb);
   RAISE EXCEPTION 'F02 accepted %', d;
  EXCEPTION WHEN invalid_parameter_value THEN
   GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
   IF m<>'Invalid observed facts' THEN RAISE EXCEPTION 'F02 echo: %', m; END IF;
  END;
 END LOOP;
 IF sophia.research_call_observed_canonical(sophia.research_call_observed('{"httpStatus":200.0,"providerTerminal":"completed","rawCounts":{"inputTotal":1000.0,"cacheRead":2e2,"output":5.0E1},"deliveryUnknownReason":"none"}'))
    <>'c2b-facts-v2|sent=unknown|status=200|n1=-|n2=-|term=completed|in=1000|cr=200|out=50|cf=-|dr=none' THEN
  RAISE EXCEPTION 'F02: one canonical for the same integers'; END IF;
 -- F01: a producer-only cross witness is a witness like any other.
 t:=sophia.research_call_truth_observed(jsonb_populate_record(NULL::sophia.research_call_truth,
  '{"sent":"unknown","n1_status":"unknown","header_id_status":"unknown","provider_terminal":"unknown"}'));
 o:=sophia.research_call_observed('{"conflicts":[{"dimension":"cross_c1p","witness":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}],"deliveryUnknownReason":"none"}');
 IF sophia.research_call_observe(t,o,sophia.research_call_a57_side('unknown',NULL,NULL,NULL,NULL,NULL),true)->'w'
    <>'{"cross_c1p":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}' THEN RAISE EXCEPTION 'F01 producer-only cross'; END IF;
 -- F01: another dimension and a service cross in one input; the service cross precedes the producer's.
 o:=sophia.research_call_observed('{"n1":{"id":{"status":"supported","value":"resp_B"},"sources":["completed"]},"httpStatus":500,"conflicts":[{"dimension":"cross_c1p","witness":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},{"dimension":"n2","witness":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}],"deliveryUnknownReason":"none"}');
 IF sophia.research_call_observe(t,o,sophia.research_call_a57_side('supported','resp_A',NULL,NULL,NULL,NULL),true)->'w'
    <>jsonb_build_object('n2',repeat('b',64),'cross_c1p','4f570038e82f3cff2e3e908a38bf8c9268a9b58ba9b67c6810a18d36156b1ff1') THEN
  RAISE EXCEPTION 'F01 service cross beside another dimension: %',
   sophia.research_call_observe(t,o,sophia.research_call_a57_side('supported','resp_A',NULL,NULL,NULL,NULL),true)->'w'; END IF;
END $$;

ROLLBACK;
