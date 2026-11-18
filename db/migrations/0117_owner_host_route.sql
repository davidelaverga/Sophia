-- H: exact original-journal metadata only. No replacement-host selection or qualification writes.
BEGIN;
CREATE FUNCTION sophia.owner_host_original_route(p_owner uuid, p_environment text, p_journal uuid, p_target jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 WITH matches AS (
  SELECT h.* FROM sophia.owner_hosts h
   WHERE h.owner_id=p_owner AND h.environment_ref=p_environment AND h.journal_id=p_journal
 )
 SELECT jsonb_build_object('hostId',h.id,'journalId',h.journal_id,'accountKey',h.account_key,
  'profileId',h.profile_id,'profileRevision',h.profile_revision,'t3Namespace',h.t3_namespace,
  'state',h.state,'newWorkQualified',h.state='active' AND EXISTS (
   SELECT 1 FROM sophia.owner_runner_qualifications q
   JOIN sophia.executor_resources r ON r.project_id=q.project_id AND r.id=q.resource_id
   WHERE q.owner_id=h.owner_id AND q.connection_id=h.connection_id AND q.environment_ref=h.environment_ref
    AND q.adapter_pin=h.adapter_pin AND q.account_key=h.account_key AND q.profile_id=h.profile_id
    AND q.profile_revision=h.profile_revision AND q.revoked_at IS NULL AND q.expires_at>now()
    AND q.connection_revision=c.revision AND q.resource_revision=r.revision
    AND r.owner_id=h.owner_id AND r.connection_id=c.id AND r.state='active'
    AND q.read_only AND q.source_policy IS NOT NULL AND q.operations && ARRAY['create','input']::text[]
  ))
 FROM matches h JOIN sophia.execution_connections c ON c.id=h.connection_id AND c.owner_id=h.owner_id
 WHERE (SELECT count(*) FROM matches)=1 AND h.state IN ('active','retired') AND h.hello_ok
  AND (p_target IS NULL OR EXISTS (
   SELECT 1 FROM sophia.owner_runner_operations o
   LEFT JOIN sophia.owner_runner_operations original ON original.project_id=o.project_id AND original.id=o.target_operation_id
   WHERE o.project_id=(p_target->>'projectId')::uuid AND o.outbox_id=(p_target->>'outboxId')::uuid
    AND o.owner_id=h.owner_id AND o.environment_ref=h.environment_ref AND o.adapter_pin=h.adapter_pin
    AND o.account_key=h.account_key AND o.profile_id=h.profile_id AND o.profile_revision=h.profile_revision
    AND ((o.kind='create' AND h.state='active') OR (o.kind IN ('input','stop') AND original.gateway_journal_id=h.journal_id))
  ))
  AND c.state='linked' AND (c.expires_at IS NULL OR c.expires_at>now())
$$;
REVOKE ALL ON FUNCTION sophia.owner_host_original_route(uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.owner_host_original_route(uuid,text,uuid,jsonb) TO sophia_worker;
COMMIT;
