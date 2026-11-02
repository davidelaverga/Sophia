-- FND-CON-ASK-CAPABILITY-01: whether Sophia would answer an ask in a project now, for the conversation list's advisory
-- capability (A33 ConversationCapability.ask / askReason; no contract change). P's allocation 0089 (record 81830a2e).
-- The list said `unavailable` / `replies_not_enabled` always, because the grant, its cohort and the runtime that decide
-- an ask are closed to every login (0064) and conversation_ask (0071) locks the project and writes rows, so neither can
-- serve a read.
-- * conversation_ask_capability(p_project): NULL when conversation_ask would admit an ask by the calling actor now,
--   otherwise one reason code. Read only: no lock, no write, no reservation, no outbox, no provider. It answers reason
--   codes alone, never an amount, cap, count, id, subject, expiry or runtime.
-- * Who it answers. The caller (sophia.actor_id(), as the API sets it) must be an active member of the project, checked
--   here, not left to the API; anyone else is refused (42501, as the list's own check). A member who cannot write, and a
--   writer outside the current grant's cohort (with no current grant there is none), is told only
--   'replies_not_enabled', before any grant or spending reason (P's privacy decision). Only a writer in the current
--   cohort gets conversation_ask's reasons, in its order: replies_disabled, grant_disabled, grant_expired,
--   calls_exhausted (spent, reserved and uncertain calls), context_assembler_unbound, runtime_unavailable (0071's A40
--   runtime choice and runtime_unavailable, unchanged) and cleanup_capacity. Those privacy cases differ from the reason
--   conversation_ask records (no_grant, asker_not_authorized, ...) on purpose.
-- * Not here: conversation_erased and the message's own checks, which belong to one conversation and one send.
-- * Advisory only. Nothing here admits, reserves or proves funding or execution: Send and Start still run
--   conversation_ask, whose body and order are unchanged, in their own transaction, and a grant or runtime that changes
--   in between is decided there.
BEGIN;

CREATE FUNCTION sophia.conversation_ask_capability(p_project uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); g sophia.conversation_grants; rt sophia.runtime_instances;
BEGIN
 IF actor IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'; END IF;
 IF NOT sophia.can_edit(p_project) THEN RETURN 'replies_not_enabled'; END IF;
 SELECT * INTO g FROM sophia.conversation_grants WHERE project_id=p_project AND current;
 IF g.lineage_id IS NULL OR NOT EXISTS(SELECT 1 FROM sophia.conversation_grant_subjects s
   WHERE s.project_id=p_project AND s.lineage_id=g.lineage_id AND s.actor_id=actor) THEN
  RETURN 'replies_not_enabled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sophia.conversation_settings WHERE project_id=p_project AND state='enabled') THEN
  RETURN 'replies_disabled'; END IF;
 IF g.state<>'enabled' THEN RETURN 'grant_disabled'; END IF;
 IF g.expires_at<=clock_timestamp() THEN RETURN 'grant_expired'; END IF;
 IF g.spent_calls+g.reserved_calls+g.uncertain_calls>=g.total_call_cap THEN RETURN 'calls_exhausted'; END IF;
 IF NOT sophia.conversation_assembler_admitted() THEN RETURN 'context_assembler_unbound'; END IF;
 -- 0071's runtime choice, as conversation_ask makes it.
 SELECT ri.* INTO rt FROM sophia.runtime_instances ri JOIN sophia.executor_resources er ON er.project_id=ri.project_id AND er.id=ri.resource_id
  WHERE ri.project_id=p_project AND ri.state='active' AND er.state='active'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(ri.roles) x WHERE x->>'id'='sophia-conversation-v1' AND x->>'route'=g.route_id
    AND CASE WHEN g.execution='service' THEN x->'executor'=jsonb_build_object('execution','service','routeId',g.route_id,
      'executorArtifactDigest',g.executor_artifact_digest)
     ELSE (NOT x ? 'executor' OR x->'executor'='{"execution":"native"}'::jsonb) END)
   AND sophia.runtime_unavailable(ri) IS NULL ORDER BY ri.seen_at DESC,ri.id LIMIT 1;
 IF rt.id IS NULL THEN RETURN 'runtime_unavailable'; END IF;
 IF (SELECT count(*) FROM sophia.execution_bindings eb JOIN sophia.work_attempts wa ON wa.project_id=eb.project_id AND wa.id=eb.attempt_id
  WHERE eb.project_id=p_project AND eb.resource_id=rt.resource_id AND eb.runtime_unit_id=rt.runtime_unit_id
   AND eb.state<>'retired' AND wa.conversation_reply_id IS NOT NULL)>=2 THEN RETURN 'cleanup_capacity'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sophia.conversation_ask_capability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.conversation_ask_capability(uuid) TO sophia_api;

COMMIT;
