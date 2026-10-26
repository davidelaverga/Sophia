-- 0083: a report's published HTML page offered for source review, and each offered source offered once
-- (FND-B-HTML-RENDITION-01; the HTML-review picker blocker found after 0082).
--
-- A design publishes its page as the report's next version (0040 design_publish): the version keeps the previous
-- version's Markdown source and carries the compiled HTML as a rendition (artifact_renditions, format html; its text
-- put by put_text_source, 0039). 0082 offered each version's own source only, so the HTML page could not be chosen,
-- and two versions that keep one Markdown source were offered as two rows of one source, which the picker could only
-- choose together. The proposal, its guards and the frozen manifest already take any readable source by its id; only
-- the offer changes here.
-- * source_review_availability (0082), replaced with the same signature, owner and grants. The sources offered are
--   those the offerable report versions carry (stable, superseded or validated, as before): each version's own text,
--   and the HTML page a design published for it. Each is offered once, however many versions carry it, named after
--   the report and every version that carries it ("Title · versions 1, 2"); an HTML page is named so ("… · HTML page")
--   and keeps that ending however long the title. Newest first (an HTML page before the text it renders when they are
--   as new), then by source id; at most 50.
-- * A source is offered only while a review may read it, as before: released, eligible and ready, with text, at most
--   32 KiB, and drawing on nothing withdrawn (review_source_readable, through 0033's closure). A page is compiled from
--   design files derived from the frozen content of its version, itself derived from the version's Markdown (0039,
--   0040), so a page whose report draws on anything withdrawn is not offered either.
-- * Supporting stays as 0082 states it, for the versions an offered source represents: the sources those versions
--   cite as recorded (their Markdown's source_dependencies), never the page's own design inputs. A page's cited
--   sources are therefore its version's.
-- * Nothing else changes: who may propose, the grants, the limits, the proposal and its guards, the manifest, the
--   labels of cited sources. 0001-0082 are not edited.
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
  -- What the entry offers to review: the sources report versions carry (their text, and a published HTML page),
  -- each once, newest first. Manifests, drafts and other internal sources are not offered.
  'sources',(WITH carried AS (
   -- What each offerable report version carries: its own text, and the HTML page a design published for it.
   SELECT 'text' AS kind, v.source_id, v.source_id AS version_source_id, v.id AS version_id, v.version_number, v.created_at, a.title
    FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
    WHERE v.project_id=p_project AND v.state IN ('stable','superseded','validated')
   UNION ALL
   SELECT 'html', r.source_id, v.source_id, v.id, v.version_number, v.created_at, a.title
    FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
     JOIN sophia.artifact_renditions r ON r.project_id=v.project_id AND r.artifact_version_id=v.id AND r.format='html'
    WHERE v.project_id=p_project AND v.state IN ('stable','superseded','validated')),
  sources AS (
   -- Each readable source once: the newest version that carries it names it, with every version number that does.
   SELECT c.source_id, (array_agg(c.kind ORDER BY c.created_at DESC, c.version_id))[1] AS kind,
    (array_agg(c.title ORDER BY c.created_at DESC, c.version_id))[1] AS title,
    array_agg(DISTINCT c.version_number ORDER BY c.version_number) FILTER (WHERE c.version_number IS NOT NULL) AS numbers,
    array_agg(DISTINCT c.version_source_id) AS cites_from, max(c.created_at) AS created_at
   FROM carried c JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=c.source_id
   WHERE s.byte_length<=cap AND sophia.review_source_readable(p_project,c.source_id)
   GROUP BY c.source_id),
  offered AS (
   SELECT o.source_id, o.kind, o.title, o.numbers, o.cites_from, o.created_at, s.mime, s.byte_length
   FROM sources o JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=o.source_id
   ORDER BY o.created_at DESC, o.kind='html' DESC, o.source_id LIMIT 50)
  SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') FROM (
   SELECT jsonb_build_object('sourceId',o.source_id,
    'label',left(o.title||CASE coalesce(cardinality(o.numbers),0) WHEN 0 THEN '' WHEN 1 THEN ' · version '||o.numbers[1]
      ELSE ' · versions '||array_to_string(o.numbers,', ') END,CASE o.kind WHEN 'html' THEN 188 ELSE 200 END)
     ||CASE o.kind WHEN 'html' THEN ' · HTML page' ELSE '' END,'mime',o.mime,
    'byteLength',o.byte_length,'createdAt',to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    -- A43: the sources the versions it represents cite, as recorded, that the caller and a review may read now.
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
      WHERE d.project_id=p_project AND d.derived_source_id=ANY(o.cites_from) AND d.source_id<>o.source_id
       AND d.source_id<>ALL(o.cites_from)
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
    row_number() OVER (ORDER BY o.created_at DESC, o.kind='html' DESC, o.source_id) AS n
   FROM offered o) q));
END $$;

COMMIT;
