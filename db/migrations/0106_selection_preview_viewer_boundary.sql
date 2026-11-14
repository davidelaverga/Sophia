-- INC04-S01b R2 (SOPHIA-INC-2026-11; PR519-950D F01): the selection preview's viewer boundary, in SQL.
-- docs/plans/selection-preview.md "R2".
-- * selection_snapshot (0104) is replaced with the same signature, volatility, definer, search_path, time zone and
--   grants. It now establishes the caller's current membership and role FIRST. A current member who is not an evaluator
--   (a viewer) receives a minimal RESTRICTED form: the instant, the ids and their own membership, and nothing else. It
--   is returned before the project row, research gate, Pin, budget, named sources, the candidate count or any candidate
--   helper is read, so a viewer's answer no longer depends on any of them. It is unevaluated: not an empty pool, not a
--   complete pool, and no budget, source or qualification fact.
-- * An admin or editor receives the 0104 snapshot unchanged, marked `evaluation: full`.
-- * selection_viewer_boundary_0106() is a private installed marker: an API that relies on this boundary requires it,
--   not merely a selection_snapshot of the same signature (which 0104 also has). It is a migration-presence marker
--   only: it does not detect a later hand replacement of the function body.
-- Nothing here promises constant time: a database or installation failure can still answer unavailable.
-- 0001-0104 are not edited.
BEGIN;

CREATE OR REPLACE FUNCTION sophia.selection_snapshot(p_project uuid, p_source_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia SET TimeZone='UTC' AS $$
DECLARE now_ timestamptz:=clock_timestamp(); a uuid:=sophia.actor_id(); m sophia.project_members; pr sophia.projects;
 rg sophia.research_grants; pin sophia.research_funding_pins; budget boolean; n integer; pool jsonb:='[]';
 gr sophia.api_contribution_grants; r sophia.executor_resources;
BEGIN
 IF p_source_ids IS NULL OR cardinality(p_source_ids)>8 OR array_position(p_source_ids,NULL) IS NOT NULL
    OR cardinality(p_source_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_source_ids) x) THEN
  RAISE EXCEPTION 'Invalid request: at most 8 distinct sources' USING ERRCODE='22023'; END IF;
 IF a IS NULL OR p_project IS NULL OR NOT sophia.is_member(p_project) THEN RETURN NULL; END IF;
 SELECT * INTO m FROM sophia.project_members WHERE project_id=p_project AND actor_id=a;
 -- 0106: the role first. A member who cannot evaluate learns nothing the pool, the budget or the sources hold.
 IF NOT m.active OR m.role NOT IN ('admin','editor') THEN
  RETURN jsonb_build_object('evaluation','restricted','evaluatedAt',now_,'projectId',p_project,'actorId',a,
   'member',jsonb_build_object('role',m.role,'active',m.active,'revision',m.revision));
 END IF;
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project;
 SELECT * INTO rg FROM sophia.research_grants WHERE project_id=p_project;
 SELECT * INTO pin FROM sophia.research_funding_pins WHERE project_id=p_project AND requester_id=a;
 budget:=sophia.selection_project_budget(p_project);
 -- The complete pool, or proof (a 201st row) that it is larger than one evaluation may hold.
 SELECT count(*) INTO n FROM (
  SELECT 1 FROM sophia.api_contribution_grants g WHERE g.project_id=p_project AND (g.state<>'revoked' OR g.id IS NOT DISTINCT FROM pin.grant_id)
  UNION ALL SELECT 1 FROM sophia.executor_resources x WHERE x.project_id=p_project AND x.harness IN ('codex-native','claude-native')
  LIMIT 201) z;
 IF n<=200 THEN
  FOR gr IN SELECT * FROM sophia.api_contribution_grants g WHERE g.project_id=p_project
    AND (g.state<>'revoked' OR g.id IS NOT DISTINCT FROM pin.grant_id) ORDER BY g.id LOOP
   pool:=pool||jsonb_build_array(sophia.selection_api_candidate(gr,a,pin,budget,now_));
  END LOOP;
  FOR r IN SELECT * FROM sophia.executor_resources x WHERE x.project_id=p_project AND x.harness IN ('codex-native','claude-native')
    ORDER BY x.id LOOP
   pool:=pool||jsonb_build_array(sophia.selection_native_candidate(r,now_));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('evaluation','full','evaluatedAt',now_,'projectId',p_project,'actorId',a, -- 0106: evaluation
  'member',jsonb_build_object('role',m.role,'active',m.active,'revision',m.revision),
  'audienceRevision',pr.audience_revision,'eligibilityRevision',pr.eligibility_revision,
  'gate',CASE WHEN rg.project_id IS NULL THEN NULL ELSE jsonb_build_object('state',rg.state,'revision',rg.revision) END,
  'projectBudget',budget,
  'pin',CASE WHEN pin.grant_id IS NULL THEN NULL ELSE jsonb_build_object('grantId',pin.grant_id,'grantRevision',pin.grant_revision) END,
  'sources',coalesce((SELECT jsonb_agg(sophia.selection_source(p_project,x.id) ORDER BY x.n)
   FROM unnest(p_source_ids) WITH ORDINALITY AS x(id,n)),'[]'),
  'complete',n<=200,'candidates',pool);
END $$;

-- The installed boundary's private marker (0106). Executable by no application role.
CREATE FUNCTION sophia.selection_viewer_boundary_0106() RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT 106 $$;

REVOKE ALL ON FUNCTION sophia.selection_snapshot(uuid,uuid[]), sophia.selection_viewer_boundary_0106() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.selection_snapshot(uuid,uuid[]) TO sophia_api;

COMMIT;
