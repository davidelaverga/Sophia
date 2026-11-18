-- Structural least privilege; actual SCRAM roles/capability/state/race crossing is in owner-host.db.test.ts.
BEGIN;
DO $$ DECLARE f pg_proc; BEGIN
 SELECT * INTO STRICT f FROM pg_proc WHERE oid='sophia.owner_host_admission_allowed(bytea)'::regprocedure;
 ASSERT f.prorettype='boolean'::regtype AND f.prosecdef AND f.provolatile='s';
 ASSERT f.proconfig=ARRAY['search_path=pg_catalog, sophia'];
 ASSERT has_function_privilege('sophia_api',f.oid,'EXECUTE'), 'HQUOTA API must have boolean admission EXECUTE';
 ASSERT NOT has_function_privilege('sophia_worker',f.oid,'EXECUTE');
 ASSERT NOT EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
 ASSERT NOT has_function_privilege('sophia_api','sophia.owner_host_authenticate(bytea)','EXECUTE');
 ASSERT NOT has_table_privilege('sophia_api','sophia.owner_hosts','SELECT');
 ASSERT NOT sophia.owner_host_admission_allowed(NULL);
 ASSERT NOT sophia.owner_host_admission_allowed(decode('00','hex'));
 ASSERT NOT sophia.owner_host_admission_allowed(decode(repeat('00',32),'hex'));
END $$;
ROLLBACK;
