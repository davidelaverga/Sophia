-- Structural least-privilege check for the additive original-journal metadata lookup only.
BEGIN;
DO $$
DECLARE p pg_proc;
BEGIN
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='sophia.owner_host_original_route(uuid,text,uuid,jsonb)'::regprocedure;
 IF NOT p.prosecdef OR p.provolatile<>'s' THEN RAISE EXCEPTION 'lookup must be stable and definer'; END IF;
 IF NOT p.proconfig @> ARRAY['search_path=pg_catalog, sophia'] THEN RAISE EXCEPTION 'lookup search path'; END IF;
 IF has_function_privilege('sophia_api',p.oid,'EXECUTE') THEN RAISE EXCEPTION 'API must not use worker route lookup'; END IF;
 IF NOT has_function_privilege('sophia_worker',p.oid,'EXECUTE') THEN RAISE EXCEPTION 'worker lookup missing'; END IF;
 IF EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC execute'; END IF;
END $$;
ROLLBACK;
