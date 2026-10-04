-- SMC-M03 S5b part 3 (plan §2.7): the service judges a printed PDF by its checks. The kernel now reads the printed
-- pages back (renderers/web/pdf/pdf-text.mjs), so blank_pages and short_pages have outcomes; the kernel reports and a
-- PDF that exists is "succeeded" whatever its checks say.
-- * A render whose receipt succeeded but fails a check (overflow past the printable width, a blank page, a broken
--   signature or page count, anything but short_pages) is settled as failed, reason "failed: <checks>". It never
--   becomes a version's PDF, and the next render of the task is its format repair (0031's plan): "1 semantic + 1 format
--   repair, then a truthful failure".
-- * short_pages is advisory: a nearly empty page between the first and the last is named on the rendition as a
--   limitation, as an unknown check is ("could not be confirmed").
-- 0001–0033 are not edited; renderer_settle (0032), research_attach_pdf (0031) and research_rendition_settled (0032)
-- are replaced with the same signatures.
BEGIN;

-- The checks a succeeded receipt fails that the service does not accept: every failed check but the advisory
-- short_pages.
CREATE FUNCTION sophia.render_gate_failures(p_receipt jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(c->>'name' ORDER BY i),'{}') FROM jsonb_array_elements(coalesce(p_receipt->'checks','[]')) WITH ORDINALITY x(c,i)
  WHERE c->>'outcome'='failed' AND c->>'name'<>'short_pages' $$;
REVOKE ALL ON FUNCTION sophia.render_gate_failures(jsonb) FROM PUBLIC;

-- What a published PDF says about itself: each check left unknown, and nearly empty pages, at most eight.
CREATE FUNCTION sophia.render_limitations(p_receipt jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(u.l ORDER BY u.i),'{}') FROM (
  SELECT left(CASE WHEN c->>'outcome'='unknown' THEN 'The PDF check '||(c->>'name')||' could not be confirmed'
    ELSE 'Some pages of the PDF are nearly empty'||coalesce(' ('||(c->>'detail')||')','') END,300) AS l, i
   FROM jsonb_array_elements(coalesce(p_receipt->'checks','[]')) WITH ORDINALITY x(c,i)
   WHERE c->>'outcome'='unknown' OR (c->>'outcome'='failed' AND c->>'name'='short_pages') ORDER BY i LIMIT 8) u $$;
REVOKE ALL ON FUNCTION sophia.render_limitations(jsonb) FROM PUBLIC;

-- renderer_settle (0032), replaced: the same, and a succeeded receipt that fails a check the service does not accept
-- settles as failed.
CREATE OR REPLACE FUNCTION sophia.renderer_settle(p_token_sha256 bytea, p_job text, p_lease text, p_receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs; g sophia.goals; p sophia.jobs; o sophia.source_objects; status text:=p_receipt->>'status'; outcome text; why text;
BEGIN
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 IF j.state<>'running' THEN
  IF r.receipt IS NOT NULL AND r.receipt=p_receipt THEN RETURN jsonb_build_object('state',j.state,'reason',j.reason); END IF;
  RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001';
 END IF;
 IF jsonb_typeof(p_receipt)<>'object' OR status NOT IN ('succeeded','failed','cancelled') OR octet_length(p_receipt::text)>65536 THEN
  RAISE EXCEPTION 'A render settles with its receipt' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM sophia.goals WHERE project_id=j.project_id AND id=r.goal_id;
 SELECT * INTO p FROM sophia.jobs WHERE project_id=j.project_id AND id=r.parent_job_id;
 IF g.status IN ('holding','held') AND (p.state IN ('pending','running') OR r.kind='rendition') THEN
  UPDATE sophia.jobs SET state='pending', lease_token=NULL, lease_until=NULL WHERE project_id=j.project_id AND id=j.id;
  UPDATE sophia.render_jobs SET claims=greatest(claims-1,0), runner_id=NULL, output_source_id=NULL
   WHERE project_id=j.project_id AND job_id=j.id;
  RETURN jsonb_build_object('state','pending','reason','held: queued again for after Resume');
 END IF;
 IF status='succeeded' THEN
  SELECT * INTO o FROM sophia.source_objects WHERE project_id=j.project_id AND id=r.output_source_id;
  IF NOT FOUND OR p_receipt->'output'->>'sha256' IS DISTINCT FROM o.sha256
   OR p_receipt->'source'->>'manifestSha256' IS DISTINCT FROM r.manifest_sha256 THEN
   RAISE EXCEPTION 'A succeeded render names its package and its recorded output' USING ERRCODE='22023'; END IF;
 END IF;
 IF g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled') THEN
  outcome:='cancelled'; why:='stale: the work was stopped or ended while it rendered';
 ELSIF status='succeeded' AND cardinality(sophia.render_gate_failures(p_receipt))>0 THEN
  outcome:='failed'; why:=left('failed: '||array_to_string(sophia.render_gate_failures(p_receipt),', '),200);
 ELSE
  outcome:=status;
  why:=CASE WHEN status='succeeded' THEN NULL ELSE left(coalesce(status||': '||(p_receipt->'error'->>'code'),status),200) END;
 END IF;
 UPDATE sophia.jobs SET state=outcome, reason=why, lease_until=NULL, result_source_id=CASE WHEN outcome='succeeded' THEN r.output_source_id END
  WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.render_jobs SET receipt=p_receipt, settled_at=now() WHERE project_id=j.project_id AND job_id=j.id RETURNING * INTO r;
 IF r.kind='rendition' THEN PERFORM sophia.research_rendition_settled(j,r); END IF;
 RETURN jsonb_build_object('state',j.state,'reason',j.reason);
END $$;

-- research_attach_pdf (0031), replaced: the same, with the limitations above.
CREATE OR REPLACE FUNCTION sophia.research_attach_pdf(s sophia.research_scope, p_version uuid) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE v sophia.artifact_versions; r sophia.render_jobs; j sophia.jobs; last sophia.jobs; why text;
BEGIN
 IF NOT sophia.research_outputs(s) ? 'pdf' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=s.project_id AND id=p_version;
 SELECT r2.* INTO r FROM sophia.render_jobs r2 JOIN sophia.jobs j2 ON j2.project_id=r2.project_id AND j2.id=r2.job_id
  WHERE r2.project_id=s.project_id AND r2.parent_job_id=s.job_id AND j2.state='succeeded' AND r2.draft_sha256=v.source_hash
  ORDER BY r2.created_at DESC LIMIT 1;
 IF FOUND THEN
  SELECT * INTO j FROM sophia.jobs WHERE project_id=s.project_id AND id=r.job_id;
  INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations)
  VALUES(s.project_id,v.id,'pdf',j.result_source_id,nullif((r.receipt->'output'->>'pageCount')::integer,0),j.id,
   sophia.render_limitations(r.receipt));
  UPDATE sophia.research_tasks SET pdf_state='produced', pdf_reason=NULL WHERE project_id=s.project_id AND job_id=s.job_id;
  RETURN jsonb_build_object('state','produced','sourceId',j.result_source_id,'renderJobId',j.id);
 END IF;
 SELECT j2.* INTO last FROM sophia.render_jobs r2 JOIN sophia.jobs j2 ON j2.project_id=r2.project_id AND j2.id=r2.job_id
  WHERE r2.project_id=s.project_id AND r2.parent_job_id=s.job_id ORDER BY r2.created_at DESC LIMIT 1;
 why:=CASE WHEN last.id IS NULL THEN 'The PDF was not rendered'
  WHEN last.state='succeeded' THEN 'The PDF was rendered from an earlier draft, not from this version'
  ELSE left('The PDF could not be produced ('||coalesce(last.reason,last.state)||')',300) END;
 UPDATE sophia.research_tasks SET pdf_state='not_produced', pdf_reason=why WHERE project_id=s.project_id AND job_id=s.job_id;
 RETURN jsonb_build_object('state','not_produced','reason',why);
END $$;

-- research_rendition_settled (0032), replaced: the same, with the limitations above.
CREATE OR REPLACE FUNCTION sophia.research_rendition_settled(j sophia.jobs, r sophia.render_jobs) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE v sophia.artifact_versions; a sophia.artifacts; nv sophia.artifact_versions; g sophia.goals; body text; vnum integer;
BEGIN
 SELECT * INTO v FROM sophia.artifact_versions WHERE project_id=j.project_id AND id=r.base_version_id;
 SELECT * INTO a FROM sophia.artifacts WHERE project_id=j.project_id AND id=v.artifact_id FOR UPDATE;
 IF j.state='succeeded' AND a.stable_version_id=v.id THEN
  SELECT x.body INTO body FROM sophia.source_texts x WHERE x.project_id=v.project_id AND x.source_id=v.source_id;
  SELECT coalesce(max(version_number),0)+1 INTO vnum FROM sophia.artifact_versions WHERE project_id=v.project_id AND artifact_id=a.id;
  SELECT * INTO g FROM sophia.goals WHERE project_id=j.project_id AND id=r.goal_id;
  UPDATE sophia.artifact_versions SET state='superseded' WHERE project_id=v.project_id AND id=v.id;
  INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,authority_epoch,state,
   validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,job_id,limitations)
  VALUES(v.project_id,a.id,v.id,v.source_id,v.source_hash,g.id,g.revision,g.authority_epoch,'stable',v.validation_source_id,v.checks_passed,vnum,
   'Adds the PDF that could not be produced in v'||v.version_number,'Everything in v'||v.version_number||' is kept',
   jsonb_build_object('versionNumber',vnum,'previousVersionId',v.id,'cited',v.change_facts->'cited','added','[]'::jsonb,'dropped','[]'::jsonb,
    'bytes',v.change_facts->'bytes','previousBytes',v.change_facts->'bytes','sections',sophia.section_facts(body,body),
    'notesFromFacts',true,'renditionOnly',true),
   jsonb_build_object('kind','rendition','taskId',r.parent_job_id,'renderJobId',j.id),j.id,
   (SELECT coalesce(array_agg(l ORDER BY i),'{}') FROM unnest(v.limitations) WITH ORDINALITY x(l,i) WHERE l !~* '\mpdf\M'))
  RETURNING * INTO nv;
  UPDATE sophia.artifacts SET stable_version_id=nv.id WHERE project_id=a.project_id AND id=a.id;
  INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id,limitations)
  VALUES(nv.project_id,nv.id,'pdf',j.result_source_id,nullif((r.receipt->'output'->>'pageCount')::integer,0),j.id,
   sophia.render_limitations(r.receipt));
  UPDATE sophia.research_tasks SET pdf_state='produced', pdf_reason=NULL WHERE project_id=j.project_id AND job_id=r.parent_job_id;
  PERFORM sophia.emit_service_event(j.project_id,'artifact.rendition_ready','artifact',a.id,vnum,'artifact.rendition_ready',
   jsonb_build_array(nv.source_id,j.result_source_id));
 ELSIF j.state<>'succeeded' THEN
  UPDATE sophia.research_tasks SET pdf_reason=left('The PDF could not be produced again ('||coalesce(j.reason,j.state)||')',300)
   WHERE project_id=j.project_id AND job_id=r.parent_job_id;
 END IF;
 IF r.reopened_goal THEN
  UPDATE sophia.goals g2 SET status='completed', state_revision=state_revision+1
   WHERE g2.project_id=j.project_id AND g2.id=r.goal_id AND g2.status IN ('ready','running','checking')
    AND NOT EXISTS(SELECT 1 FROM sophia.jobs oj JOIN sophia.work_attempts wa ON wa.project_id=oj.project_id AND wa.id=oj.attempt_id
     WHERE oj.project_id=j.project_id AND wa.goal_id=r.goal_id AND oj.state IN ('pending','running'))
    AND NOT EXISTS(SELECT 1 FROM sophia.render_jobs o JOIN sophia.jobs oj ON oj.project_id=o.project_id AND oj.id=o.job_id
     WHERE o.project_id=j.project_id AND o.goal_id=r.goal_id AND o.job_id<>j.id AND oj.state IN ('pending','running'));
 END IF;
END $$;

COMMIT;
