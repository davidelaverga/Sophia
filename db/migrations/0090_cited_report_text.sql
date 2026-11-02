-- FND-HTML-SOURCE-REMAINDER-03: the text of a project input a published report cites, read from that report's Sources
-- (amendment A11, getCitedReportText). P's allocation 0090 (record P-HTML-REMAINDER-0090-ALLOCATION-01).
-- Until now a report's reader could see that a version cites one of the project's own inputs ("A source from the
-- project") but never what it says: getSourceContent serves a report's own source or rendition only (readReportSource),
-- by design. A member repairing a report's provenance needs to read the supporting text it cites.
-- * cited_report_text(p_artifact, p_version, p_source): the source's identity, hash, type, size and text, as one row,
--   when all of these hold at the read; otherwise no row, whatever the reason, so a refusal names nothing:
--   - the caller (sophia.actor_id(), as the API sets it) is an active member of the version's project, checked here;
--   - the version is that artifact's, and published (stable or superseded), never a candidate or a rejected one;
--   - the caller may read the report itself now, exactly as getSourceContent reads the version's own source: that
--     source is ready, and the caller owns it or it is a released project source (eligible_sources_read, 0002). A
--     report whose own text was blocked, deleted, made private or unreleased reads no cited text through it, except
--     for its owner while that report text stays readable to them. Nothing else about the report's other sources is asked: a report another
--     of whose sources was withdrawn stays readable (0033 keeps published history), and so does a cited text still
--     released;
--   - the version records the source as one it cites (source_dependencies from its own source, the rows
--     listReportSources shows), so a source id alone, or one cited elsewhere, reads nothing;
--   - the source is a project input (no provenance, or admitted_input): never a web page or a search result here;
--   - it is a released, ready project source (scope project, eligible, ready): another member's private source and the
--     caller's own private one alike read nothing (source_withdrawn's closure holds the source itself too, so this is
--     said twice on purpose: it stays true whatever the withdrawal rule later becomes);
--   - nothing it draws on was withdrawn (source_withdrawn, research's own rule: forgotten, erased, no longer released);
--   - it is plain text or Markdown kept inline (source_texts), at most 256 KiB as A11 keeps inline texts, and the text
--     held is exactly the bytes its record counts.
-- * Read only: no lock, no write. SECURITY DEFINER because the withdrawal rule reads what the API login may not
--   (source_withdrawn and the closure behind it are not the API's to execute); it therefore checks membership itself
--   and answers only this one contextual question. No table, helper or other function is opened to any login.
BEGIN;

CREATE FUNCTION sophia.cited_report_text(p_artifact uuid, p_version uuid, p_source uuid)
RETURNS TABLE(source_id uuid, sha256 text, mime text, byte_length bigint, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT s.id, s.sha256, s.mime, s.byte_length, t.body
   FROM sophia.artifact_versions v
   JOIN sophia.source_objects own ON own.project_id=v.project_id AND own.id=v.source_id
   JOIN sophia.source_dependencies d ON d.project_id=v.project_id AND d.derived_source_id=v.source_id AND d.source_id=p_source
   JOIN sophia.source_objects s ON s.project_id=d.project_id AND s.id=d.source_id
   JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id
  WHERE v.id=p_version AND v.artifact_id=p_artifact AND v.state IN ('stable','superseded')
   AND sophia.actor_id() IS NOT NULL AND sophia.is_member(v.project_id)
   AND own.state='ready' AND (own.owner_id=sophia.actor_id() OR (own.scope='project' AND own.eligible))
   AND s.scope='project' AND s.eligible AND s.state='ready'
   AND NOT EXISTS(SELECT 1 FROM sophia.source_provenance p
    WHERE p.project_id=s.project_id AND p.source_id=s.id AND p.kind<>'admitted_input')
   AND split_part(lower(s.mime),';',1) IN ('text/plain','text/markdown')
   AND s.byte_length<=262144 AND octet_length(t.body)=s.byte_length
   AND NOT sophia.source_withdrawn(v.project_id,s.id) $$;
REVOKE ALL ON FUNCTION sophia.cited_report_text(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.cited_report_text(uuid,uuid,uuid) TO sophia_api;

COMMIT;
