-- 0082: a report version's cited sources offered beside it in the source-review entry (A43,
-- FND-B-REVIEW-CITED-INPUTS-01).
--
-- A review reads only the sources its plan names (0042), and the entry offered report versions alone, so a review of a
-- report could never read the evidence the report cites. The proposal already admits any one to three sources that
-- review_source_readable allows (source_review_request): only the offer changes here.
-- * source_review_availability (0042), replaced with the same signature, owner and grants: every offered report
--   version also lists, as supporting, the sources it cites as recorded when it was published (research_publish writes
--   one source_dependencies row per citation, derived from the version's own source; nothing else is ever derived from
--   it). Each is listed only while the caller may read it and a review may read it: the caller a member of this project
--   (the function runs as its owner, so eligible_sources_read is restated, never assumed), the source this project's,
--   released, eligible and ready, with text, at most the review's 32 KiB, and drawing on nothing withdrawn
--   (review_source_readable, through 0033's closure). A private source, its owner's own included, is never listed.
-- * A cited report version that the offer returns is offered as a report, not again as supporting. One the bounded
--   offer leaves out (it names the newest 50) is listed as supporting, so it can still be chosen beside the report
--   citing it; one the offer never shows (a candidate or a rejected version) is not listed (CODE review on 24df).
--   At most 50 per version, by label then id.
-- * Labels come from what is recorded about the source (a project note's kind, the host of a page the research read,
--   search results, an admitted input, the research question), never from its text; a source is named by its own id,
--   never by a note's or a version's. A page's label carries its host alone, never a user, password, port, path, query
--   or fragment; an authority that is not a plain DNS name gives "Web page" alone.
-- * Nothing else changes: who may propose, the grants, the limits, the proposal and its guards. Everything else in the
--   body is 0042's: the offered report versions keep its predicates, order and bound of 50, named once (offered) so
--   that supporting is compared with what is actually offered. 0001-0081 are not edited.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.source_review_availability(p_project uuid, p_role text, p_route text) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE cg sophia.coordination_grants; rg sophia.research_grants; reason text; ready boolean;
 cap bigint:=(sophia.source_review_limits()->>'maxInputBytes')::bigint;
BEGIN
 IF sophia.actor_id() IS NULL OR NOT sophia.is_member(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cg FROM sophia.coordination_grants WHERE project_id=p_project;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 ready:=EXISTS(SELECT 1 FROM sophia.runtime_instances r WHERE r.project_id=p_project AND r.state='active'
  AND r.roles @> jsonb_build_array(jsonb_build_object('id',p_role,'route',p_route)) AND sophia.runtime_unavailable(r) IS NULL);
 reason:=CASE WHEN cg.project_id IS NULL OR cg.state<>'enabled' THEN 'Source review is not enabled for this project.'
  WHEN rg.project_id IS NULL OR rg.state<>'enabled' THEN 'This project has no spend authority for reviews.'
  WHEN NOT sophia.can_edit(p_project) THEN 'Only members who can edit start reviews.' END;
 RETURN jsonb_build_object('enabled',reason IS NULL,'reason',reason,'runtimeReady',ready,
  'maxAllowanceUsd',CASE WHEN reason IS NULL THEN least(cg.review_cap_usd,rg.task_cap_usd) END,'limits',sophia.source_review_limits(),
  -- What the entry offers to review: report versions whose text can be read, newest first. Manifests, drafts and
  -- other internal sources are not offered.
  'sources',(WITH offered AS (
   SELECT v.id, v.source_id, v.created_at, v.version_number, a.title, s.mime, s.byte_length
   FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
    JOIN sophia.source_objects s ON s.project_id=v.project_id AND s.id=v.source_id
   WHERE v.project_id=p_project AND v.state IN ('stable','superseded','validated')
    AND s.byte_length<=cap
    AND sophia.review_source_readable(p_project,v.source_id)
   ORDER BY v.created_at DESC, v.id LIMIT 50)
  SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') FROM (
   SELECT jsonb_build_object('sourceId',o.source_id,'label',left(o.title||coalesce(' · version '||o.version_number,''),200),'mime',o.mime,
    'byteLength',o.byte_length,'createdAt',to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    -- A43: the sources this version cites, as recorded, that the caller and a review may read now.
    'supporting',(SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',c.id,'label',c.label,'mime',c.mime,'byteLength',c.byte_length)
       ORDER BY c.label, c.id),'[]') FROM (
      SELECT d.source_id AS id, cs.mime, cs.byte_length,
       left(coalesce(
        (SELECT 'Project note · '||replace(me.kind,'_',' ') FROM sophia.mission_entries me
          WHERE me.project_id=p_project AND me.source_id=d.source_id ORDER BY me.recorded_at DESC LIMIT 1),
        -- A page's host, and only a host: the whole authority (up to the first /, ? or #) must be a DNS name, with at
        -- most a port, which is dropped. A user or password (an @), a bracketed or malformed authority, or no URL at
        -- all gives the neutral label: a stored reported URL is not checked for its authority (R2-482-R1).
        (SELECT CASE sp.kind WHEN 'web_read' THEN 'Web page'||coalesce(' · '||lower(substring(
            substring(coalesce(sp.reported_final_url,sp.requested_url) FROM '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)')
            FROM '^([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)(?::[0-9]{1,5})?$')),'')
           WHEN 'search_results' THEN 'Search results' ELSE 'Admitted input' END
          FROM sophia.source_provenance sp WHERE sp.project_id=p_project AND sp.source_id=d.source_id),
        (SELECT 'Research question' FROM sophia.research_tasks q WHERE q.project_id=p_project AND q.question_source_id=d.source_id LIMIT 1),
        'Cited source'),200) AS label
      FROM sophia.source_dependencies d
       JOIN sophia.source_objects cs ON cs.project_id=d.project_id AND cs.id=d.source_id
      WHERE d.project_id=p_project AND d.derived_source_id=o.source_id AND d.source_id<>o.source_id
       -- Readable by the caller now: eligible_sources_read, restated (a member; a released project source), not its
       -- owner's private one.
       AND sophia.is_member(p_project) AND cs.scope='project' AND cs.eligible AND cs.state='ready'
       -- And by a review: with text, nothing it draws on withdrawn, within what a review reads.
       AND sophia.review_source_readable(p_project,d.source_id) AND cs.byte_length<=cap
       -- A cited report version: not again when the offer returns it; listed when the bound leaves it out; never one
       -- the offer does not show (a candidate or a rejected version).
       AND NOT EXISTS(SELECT 1 FROM offered r WHERE r.source_id=d.source_id)
       AND (NOT EXISTS(SELECT 1 FROM sophia.artifact_versions av WHERE av.project_id=p_project AND av.source_id=d.source_id)
        OR EXISTS(SELECT 1 FROM sophia.artifact_versions av WHERE av.project_id=p_project AND av.source_id=d.source_id
         AND av.state IN ('stable','superseded','validated')))
      ORDER BY label, d.source_id LIMIT 50) c)) AS x,
    row_number() OVER (ORDER BY o.created_at DESC, o.id) AS n
   FROM offered o) q));
END $$;

COMMIT;
