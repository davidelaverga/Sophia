-- HQUOTA-F01: identity for bounded HTTP admission only. Domain operations reauthenticate current rights.
BEGIN;
CREATE FUNCTION sophia.owner_host_admission_allowed(p_capability_sha256 bytea) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN sophia.actor_id() IS NOT NULL OR p_capability_sha256 IS NULL
   OR length(p_capability_sha256)<>32 THEN false
 ELSE EXISTS(SELECT 1 FROM sophia.owner_hosts
   WHERE capability_sha256=p_capability_sha256 AND state<>'revoked') END
$$;
REVOKE ALL ON FUNCTION sophia.owner_host_admission_allowed(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.owner_host_admission_allowed(bytea) TO sophia_api;
COMMIT;
