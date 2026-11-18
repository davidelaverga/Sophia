-- Targeted 0116 structural/role boundary test; complete migrations must already be installed.
-- Safe-integer boundaries are exercised through real delivered/digested answers and consume
-- in packages/persistence/src/runner-results.db.test.ts; no scalar-only acceptance surrogate.
BEGIN;
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='sophia' AND c.relname IN ('owner_runner_collections','owner_runner_results',
 'owner_runner_result_dependencies','owner_runner_result_contexts') AND c.relrowsecurity;
 IF n<>4 THEN RAISE EXCEPTION '0116 missing RLS boundary'; END IF;
 IF has_table_privilege('sophia_api','sophia.owner_runner_results','SELECT')
 OR has_table_privilege('sophia_worker','sophia.owner_runner_collections','UPDATE') THEN
  RAISE EXCEPTION '0116 table privilege leak'; END IF;
 IF has_function_privilege('sophia_api','sophia.consume_runner_result(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
 OR has_function_privilege('sophia_worker','sophia.request_runner_result(uuid,uuid,text,bigint,integer,integer)','EXECUTE')
 OR has_function_privilege('public','sophia.read_runner_result_exchange(uuid,uuid,uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION '0116 function privilege leak'; END IF;
 IF has_function_privilege('sophia_api','sophia.runner_result_capture_fence(uuid,uuid)','EXECUTE')
 OR has_function_privilege('sophia_api','sophia.runner_result_relevant(uuid)','EXECUTE')
 OR has_function_privilege('sophia_api','sophia.source_closure(uuid,uuid[])','EXECUTE')
 OR has_function_privilege('sophia_api','sophia.source_withdrawn(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION '0116 internal capture fence privilege leak'; END IF;
 IF sophia.runner_result_canonical('{"z":[1,"x"],"a":true}'::jsonb)<>'{"a":true,"z":[1,"x"]}' THEN
  RAISE EXCEPTION '0116 canonical digest encoding differs'; END IF;
END $$;
ROLLBACK;
