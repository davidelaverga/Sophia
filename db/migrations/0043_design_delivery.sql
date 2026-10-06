-- SDD-01-CX-0019 (CX-0020): a capture counts as seen only once it reached the model, the designer must have seen its
-- candidate's render before submitting it, every overview tile counts, and an edit's replay is the same request.
-- * Delivery (F1). An inspection hands over captures in two steps. The API reads each capture's bytes and checks them
--   against the record first; only then is a delivery issued (design_capture_deliveries: the job, its attempt, the
--   render, each capture's name and hash). The runtime acknowledges it once it saved every image as an attachment the
--   model's next request carries (runtime_capture_delivered): the delivery must be this job's, in this attempt, still
--   issued, its names exactly the delivered set (each once), each attachment `sha256:<that capture's hash>` (the bytes
--   handed over, unchanged). A replay of the same acknowledgement answers the same and counts nothing twice; another
--   job's, attempt's or render's delivery, or other attachments, are refused. Issue and acknowledgement each check the
--   work's authority again after their wait (the byte read, the attachment save): held, stopped, revoked or withdrawn
--   work is refused. Only acknowledged deliveries count: a store or hash failure issues nothing, a failed or altered
--   attachment save acknowledges nothing. A saved attachment is what the model's next request carries; it is not a
--   claim that the provider read it. The reviewer's `inspected` is written at the acknowledgement
--   (runtime_review_capture no longer writes it).
-- * What counts (#117, CX-0033 to CX-0036): only what the submission itself names. A candidate or a review's result
--   carries `seen`, the deliveries its model's receipts stand for (the runtime hands a receipt to the model only with
--   the images); a delivery counts for it only if it is named there, acknowledged, and of this job, attempt and render.
--   An acknowledgement no submission names (its submit never sent, the runtime restarted in between) counts for nothing.
-- * What must be seen (F3, F4): every overview capture the render's receipt names, every tile at every target, and
--   each section, every tile of it, at one target at least (an edit's own sections only, #117), and the margins outside
--   the sections, every capture of them, at one target at least (#117), as design_capture_missing says. A review's pass
--   needs it (review_missing), and so does the designer's candidate, for exactly the render it submits, in its current
--   attempt (design_unseen, in design_submit_candidate). The submit with no reviewer (self_review_only) runs after that
--   gate. A request for revision rests on what was seen too (#117): it names inspected deliveries of the candidate's
--   render, and each blocking or major finding names a capture among them, of the target and the section it names
--   (review_unbacked).
-- * Edit replay (F5). A request key replayed with another version, scope (sections, shell, styles) or instruction is a
--   conflict, never the earlier request's receipt.
-- 0001–0042 are not edited; runtime_review_capture, design_submit_candidate, runtime_review_submit and
-- request_design_edit are replaced with the same signatures, and review_missing with the deliveries a pass names.
BEGIN;

-- --- delivery ---------------------------------------------------------------------------------------------------------------

CREATE TABLE sophia.design_capture_deliveries (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL, attempt_id uuid NOT NULL, render_job_id uuid NOT NULL,
 captures jsonb NOT NULL CHECK(jsonb_typeof(captures)='array' AND jsonb_array_length(captures) BETWEEN 1 AND 4),
 state text NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','delivered')),
 attachments jsonb, issued_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,attempt_id) REFERENCES sophia.work_attempts(project_id,id),
 FOREIGN KEY(project_id,render_job_id) REFERENCES sophia.render_jobs(project_id,job_id),
 CHECK((state='delivered')=(delivered_at IS NOT NULL)), CHECK((state='delivered')=(attachments IS NOT NULL))
);
CREATE INDEX design_capture_deliveries_job ON sophia.design_capture_deliveries(project_id,job_id,render_job_id) WHERE state='delivered';
ALTER TABLE sophia.design_capture_deliveries ENABLE ROW LEVEL SECURITY;

-- The job kind a delivery's role works as: the designer's design, the reviewer's design_review; nothing else.
CREATE FUNCTION sophia.design_kind_of(p_kind text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_kind IN ('design','design_review') THEN RETURN p_kind; END IF;
 RAISE EXCEPTION 'A delivery is the designer''s or the reviewer''s' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION sophia.design_kind_of(text) FROM PUBLIC;

-- The names of a job's captures of one render that reached its model in this attempt, in the deliveries a submission
-- names (p_seen): acknowledged ones only.
CREATE FUNCTION sophia.design_delivered(p_project uuid, p_job uuid, p_attempt uuid, p_render uuid, p_seen uuid[]) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(DISTINCT c->>'name' ORDER BY c->>'name'),'{}') FROM sophia.design_capture_deliveries d, jsonb_array_elements(d.captures) c
 WHERE d.project_id=p_project AND d.job_id=p_job AND d.attempt_id=p_attempt AND d.render_job_id=p_render AND d.state='delivered'
  AND d.id=ANY(coalesce(p_seen,'{}')) $$;
REVOKE ALL ON FUNCTION sophia.design_delivered(uuid,uuid,uuid,uuid,uuid[]) FROM PUBLIC;

-- The deliveries a submission names (`seen`): none when absent; at most 64 delivery ids, or the submission is refused.
CREATE FUNCTION sophia.design_seen_ids(p_seen jsonb) RETURNS uuid[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,sophia AS $$
DECLARE out uuid[];
BEGIN
 IF p_seen IS NULL OR jsonb_typeof(p_seen)='null' THEN RETURN '{}'; END IF;
 IF jsonb_typeof(p_seen)<>'array' OR jsonb_array_length(p_seen)>64 THEN
  RAISE EXCEPTION 'seen names at most 64 deliveries' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(sophia.uuid_or_null(x)),'{}') INTO out FROM jsonb_array_elements_text(p_seen) x;
 IF EXISTS(SELECT 1 FROM unnest(out) u WHERE u IS NULL) THEN RAISE EXCEPTION 'seen names deliveries by id' USING ERRCODE='22023'; END IF;
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.design_seen_ids(jsonb) FROM PUBLIC;

-- POST /v1/runtime/{design,review}/capture, second step: the API checked every capture's bytes against its record and
-- hands them over now. Recorded as issued, not yet seen. The captures must be the render's, with their recorded hashes.
CREATE FUNCTION sophia.runtime_capture_issue(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,sophia.design_kind_of(p_kind),true);
 job uuid:=sophia.design_render_of(s,p_request); caps jsonb; delivery uuid;
BEGIN
 IF jsonb_typeof(p_request->'captures')<>'array' OR jsonb_array_length(p_request->'captures') NOT BETWEEN 1 AND 4 THEN
  RAISE EXCEPTION 'A delivery names 1 to 4 captures' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('name',o.name,'sha256',so.sha256) ORDER BY o.name) INTO caps
  FROM (SELECT DISTINCT x->>'name' AS name, x->>'sha256' AS sha256 FROM jsonb_array_elements(p_request->'captures') x) q
  JOIN sophia.render_job_outputs o ON o.project_id=s.project_id AND o.job_id=job AND o.name=q.name
  JOIN sophia.source_objects so ON so.project_id=o.project_id AND so.id=o.source_id AND so.sha256=q.sha256;
 IF caps IS NULL OR jsonb_array_length(caps)<>jsonb_array_length(p_request->'captures') THEN
  RAISE EXCEPTION 'Capture not found' USING ERRCODE='22023'; END IF;
 INSERT INTO sophia.design_capture_deliveries(project_id,job_id,attempt_id,render_job_id,captures)
 VALUES(s.project_id,s.job_id,s.attempt_id,job,caps) RETURNING id INTO delivery;
 RETURN jsonb_build_object('deliveryId',delivery,'renderJobId',job);
END $$;
REVOKE ALL ON FUNCTION sophia.runtime_capture_issue(bytea,text,text,jsonb,text) FROM PUBLIC;

-- The acknowledgement's attachments in a canonical form, or null unless they are exactly the delivery's captures: each
-- name once, and each attachment the capture's own bytes (`sha256:<the capture's hash>`, as dsh's content-addressed store
-- names a stored image it kept unchanged).
CREATE FUNCTION sophia.design_delivery_attachments(p_captures jsonb, p_attachments jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE out jsonb;
BEGIN
 IF jsonb_typeof(p_attachments)<>'array' OR jsonb_array_length(p_attachments)<>jsonb_array_length(p_captures)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_attachments) a WHERE jsonb_typeof(a)<>'object')
   OR (SELECT count(DISTINCT a->>'name') FROM jsonb_array_elements(p_attachments) a)<>jsonb_array_length(p_captures)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_captures) c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_attachments) a
     WHERE a->>'name'=c->>'name' AND a->>'attachmentId'='sha256:'||(c->>'sha256'))) THEN
  RETURN NULL; END IF;
 SELECT jsonb_agg(jsonb_build_object('name',a->>'name','attachmentId',a->>'attachmentId') ORDER BY a->>'name') INTO out
  FROM jsonb_array_elements(p_attachments) a;
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION sophia.design_delivery_attachments(jsonb,jsonb) FROM PUBLIC;

-- POST /v1/runtime/{design,review}/delivered: the runtime saved every image of a delivery as an attachment for the model.
-- From then on those captures count as seen by this job, in this attempt, for that render (see the header).
CREATE FUNCTION sophia.runtime_capture_delivered(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb, p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,sophia.design_kind_of(p_kind),true);
 d sophia.design_capture_deliveries; v_attachments jsonb;
BEGIN
 SELECT * INTO d FROM sophia.design_capture_deliveries WHERE project_id=s.project_id AND id=sophia.uuid_or_null(p_request->>'deliveryId')
  AND job_id=s.job_id AND attempt_id=s.attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found' USING ERRCODE='22023'; END IF;
 v_attachments:=sophia.design_delivery_attachments(d.captures,p_request->'attachments');
 IF v_attachments IS NULL THEN
  RAISE EXCEPTION 'A delivery is acknowledged with each of its captures once, as the attachment of its own bytes' USING ERRCODE='22023'; END IF;
 IF d.state='delivered' THEN
  IF d.attachments IS DISTINCT FROM v_attachments THEN
   RAISE EXCEPTION 'Delivery already acknowledged with other attachments' USING ERRCODE='23505'; END IF;
 ELSE
  UPDATE sophia.design_capture_deliveries SET state='delivered', attachments=v_attachments, delivered_at=now()
   WHERE project_id=d.project_id AND id=d.id;
  IF s.kind='design_review' THEN
   UPDATE sophia.design_reviews SET inspected=(SELECT array_agg(DISTINCT x ORDER BY x) FROM (SELECT unnest(inspected) AS x UNION
     SELECT c->>'name' FROM jsonb_array_elements(d.captures) c) y)
    WHERE project_id=s.project_id AND job_id=s.job_id;
  END IF;
 END IF;
 RETURN jsonb_build_object('deliveryId',d.id,'renderJobId',d.render_job_id,'state','delivered',
  'captures',(SELECT jsonb_agg(c->>'name' ORDER BY c->>'name') FROM jsonb_array_elements(d.captures) c));
END $$;
REVOKE ALL ON FUNCTION sophia.runtime_capture_delivered(bytea,text,text,jsonb,text) FROM PUBLIC;

-- runtime_review_capture (0039), replaced: the captures' references only. What the reviewer saw is recorded when it
-- reached the model (runtime_capture_delivered), never when it was asked for.
CREATE OR REPLACE FUNCTION sophia.runtime_review_capture(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',true);
BEGIN
 RETURN sophia.design_capture_refs(s,p_request);
END $$;

-- --- what must be seen ------------------------------------------------------------------------------------------------------

-- The captures of a render not yet seen: every overview capture its receipt names (every tile, every target), each
-- section (p_sections, or every section the render captured) whole at one target at least: every tile of it the receipt
-- names at that target (#117), since each tile is a different stretch of the section at full size; and the margins
-- outside the sections (a header, a footer, a gap), whole at one target at least when the render captured any (#117):
-- at overview scale their text may not be readable.
CREATE FUNCTION sophia.design_capture_missing(r sophia.render_jobs, p_seen text[], p_sections text[]) RETURNS text[] LANGUAGE sql STABLE
SET search_path=pg_catalog,sophia AS $$
 SELECT coalesce(array_agg(m ORDER BY n, m),'{}') FROM (
  SELECT 0 AS n, c->>'name' AS m FROM jsonb_array_elements(coalesce(r.receipt->'captures','[]')) c
   WHERE c->>'kind'='overview' AND NOT (c->>'name')=ANY(coalesce(p_seen,'{}'))
  UNION ALL
  SELECT 1, 'section '||sec||' (every tile, at one target)' FROM (
    SELECT DISTINCT jsonb_array_elements_text(x->'coverage'->'captured') AS sec FROM jsonb_array_elements(coalesce(r.receipt->'targets','[]')) x) q
   WHERE (p_sections IS NULL OR q.sec=ANY(p_sections))
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.receipt->'captures','[]')) c
     WHERE c->>'kind'='section' AND c->>'section'=q.sec
     GROUP BY c->>'target' HAVING bool_and((c->>'name')=ANY(coalesce(p_seen,'{}'))))
  UNION ALL
  SELECT 2, 'the margins outside the sections (every margin capture, at one target)'
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.receipt->'captures','[]')) c WHERE c->>'kind'='margin')
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.receipt->'captures','[]')) c
     WHERE c->>'kind'='margin'
     GROUP BY c->>'target' HAVING bool_and((c->>'name')=ANY(coalesce(p_seen,'{}'))))) z $$;
REVOKE ALL ON FUNCTION sophia.design_capture_missing(sophia.render_jobs,text[],text[]) FROM PUBLIC;

-- The sections a design's captures must show: an edit's own, or all.
CREATE FUNCTION sophia.design_seen_sections(t sophia.design_tasks) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN t.mode='edit' THEN ARRAY(SELECT jsonb_array_elements_text(t.scope->'sections')) END $$;
REVOKE ALL ON FUNCTION sophia.design_seen_sections(sophia.design_tasks) FROM PUBLIC;

-- review_missing (0040), replaced: what a pass needs that the deliveries it names, acknowledged in the reviewer's current
-- attempt, do not show (F4: every overview tile; #117: only what the pass names).
CREATE FUNCTION sophia.review_missing(rv sophia.design_reviews, r sophia.render_jobs, p_attempt uuid, p_seen uuid[]) RETURNS text[]
LANGUAGE sql STABLE SET search_path=pg_catalog,sophia AS $$
 SELECT sophia.design_capture_missing(r,sophia.design_delivered(rv.project_id,rv.job_id,p_attempt,r.job_id,p_seen),
  (SELECT sophia.design_seen_sections(t) FROM sophia.design_tasks t WHERE t.project_id=rv.project_id AND t.job_id=rv.design_job_id)) $$;
REVOKE ALL ON FUNCTION sophia.review_missing(sophia.design_reviews,sophia.render_jobs,uuid,uuid[]) FROM PUBLIC;

-- What a request for revision does not rest on, of the captures it names as seen (p_seen) among the render's
-- (p_captures, its receipt's): none at all, or, for a blocking or major finding, the capture it cites, inspected, and
-- showing the target and the section the finding names, when it names one (#117: a finding about a section rests on a
-- capture of that section, not on any capture the reviewer happened to look at).
CREATE FUNCTION sophia.review_unbacked(p_seen text[], p_findings jsonb, p_captures jsonb) RETURNS text[] LANGUAGE sql
IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN cardinality(coalesce(p_seen,'{}'))=0
  THEN ARRAY['an inspected capture of the candidate''s render (its inspection''s receipt in seen)']
  ELSE coalesce((SELECT array_agg(left('finding '||i||': the capture it rests on, inspected, named in seen, and of the '
     ||'target and section it names'||coalesce(' ('||(f->>'capture')||')',''),300) ORDER BY i)
   FROM jsonb_array_elements(coalesce(p_findings,'[]')) WITH ORDINALITY q(f,i)
   WHERE f->>'severity' IN ('blocking','major') AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(p_captures,'[]')) c
     WHERE c->>'name'=f->>'capture' AND (c->>'name')=ANY(p_seen)
      AND (f->>'target' IS NULL OR c->>'target'=f->>'target')
      AND (f->>'section' IS NULL OR c->>'section'=f->>'section'))),'{}') END $$;
REVOKE ALL ON FUNCTION sophia.review_unbacked(text[],jsonb,jsonb) FROM PUBLIC;

-- What the designer has not looked at of the render it submits, in the deliveries the candidate names, as a failure.
CREATE FUNCTION sophia.design_unseen(t sophia.design_tasks, r sophia.render_jobs, p_seen uuid[]) RETURNS text[] LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
 SELECT CASE WHEN cardinality(m)>0 THEN ARRAY[left('you have not looked at these captures of the render you submit (design_inspect_render, '
   ||'then name each inspection''s receipt in seen): '||array_to_string(m,', '),1000)] ELSE '{}' END
 FROM (SELECT sophia.design_capture_missing(r,sophia.design_delivered(t.project_id,t.job_id,j.attempt_id,r.job_id,p_seen),
   sophia.design_seen_sections(t)) m FROM sophia.jobs j WHERE j.project_id=t.project_id AND j.id=t.job_id) q $$;
REVOKE ALL ON FUNCTION sophia.design_unseen(sophia.design_tasks,sophia.render_jobs,uuid[]) FROM PUBLIC;

-- design_submit_candidate (0040), replaced: as before, and the designer must have seen the render it submits, in its
-- current attempt, in the deliveries the candidate names (F3, #117). A submit with no reviewer is published
-- self_review_only only past this gate.
CREATE OR REPLACE FUNCTION sophia.design_submit_candidate(s sophia.design_scope, p_key text, p_candidate jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE t sophia.design_tasks; d sophia.design_sources; r sophia.render_jobs; rj sophia.jobs; c sophia.design_candidates; failures text[];
 latest integer; review uuid; summary text:=nullif(btrim(coalesce(p_candidate->>'summary','')),'');
BEGIN
 SELECT * INTO t FROM sophia.design_tasks WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 IF t.state='reviewing' THEN RAISE EXCEPTION 'Your candidate is under review: wait for its result' USING ERRCODE='40001'; END IF;
 IF t.state<>'designing' THEN RAISE EXCEPTION 'The design has ended (%)', t.state USING ERRCODE='40001'; END IF;
 IF length(summary)>2000 THEN RAISE EXCEPTION 'A candidate''s summary is at most 2000 characters' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=t.job_id AND id=sophia.uuid_or_null(p_candidate->>'revisionId');
 IF NOT FOUND THEN RAISE EXCEPTION 'Design revision not found' USING ERRCODE='22023'; END IF;
 SELECT max(seq) INTO latest FROM sophia.design_sources WHERE project_id=s.project_id AND design_job_id=t.job_id;
 IF d.seq<>latest THEN RAISE EXCEPTION 'Stale source: submit your latest revision' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=s.project_id AND parent_job_id=t.job_id AND kind='capture'
  AND job_id=sophia.uuid_or_null(p_candidate->>'renderJobId');
 IF NOT FOUND THEN RAISE EXCEPTION 'Render not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO rj FROM sophia.jobs WHERE project_id=s.project_id AND id=r.job_id;
 failures:=sophia.design_candidate_failures(t,d,r,rj);
 IF rj.state='succeeded' THEN failures:=(failures||sophia.design_unseen(t,r,sophia.design_seen_ids(p_candidate->'seen')))[1:40]; END IF;
 IF cardinality(failures)>0 THEN RETURN jsonb_build_object('outcome','refused','failures',to_jsonb(failures)); END IF;
 IF (SELECT count(*) FROM sophia.design_candidates WHERE project_id=s.project_id AND design_job_id=t.job_id)>=1+t.max_repairs THEN
  RAISE EXCEPTION 'Design repair limit reached' USING ERRCODE='55000'; END IF;
 UPDATE sophia.design_candidates SET state='superseded' WHERE project_id=s.project_id AND design_job_id=t.job_id AND state='needs_revision';
 INSERT INTO sophia.design_candidates(project_id,design_job_id,source_id,render_job_id,compiled_source_id,round,call_key,summary,gate)
 VALUES(s.project_id,t.job_id,d.id,r.job_id,(SELECT f.source_id FROM sophia.render_job_files f WHERE f.project_id=r.project_id AND f.job_id=r.job_id AND f.role='entry'),
  (SELECT count(*)+1 FROM sophia.design_candidates WHERE project_id=s.project_id AND design_job_id=t.job_id),p_key,summary,
  jsonb_build_object('passed',true,'checks',r.receipt->'checks','targets',to_jsonb(t.targets),'renderer',r.receipt->'renderer'))
 RETURNING * INTO c;
 UPDATE sophia.jobs SET state='running' WHERE project_id=s.project_id AND id=t.job_id AND state='pending';
 review:=sophia.design_admit_review(s.project_id,c.id);
 IF review IS NULL THEN
  UPDATE sophia.design_candidates SET state='self_review_only' WHERE project_id=s.project_id AND id=c.id;
  PERFORM sophia.design_publish(s.project_id,c.id,'self_review_only',
   ARRAY['This page was checked by software but not by a separate visual reviewer']||sophia.design_gate_limitations(r.receipt));
 END IF;
 SELECT * INTO c FROM sophia.design_candidates WHERE project_id=s.project_id AND id=c.id;
 RETURN sophia.design_candidate_view(s.project_id,c);
END $$;

-- runtime_review_submit (0040), replaced: as before, and a pass counts only the deliveries it names; a request for
-- revision rests on deliveries it names too (#117).
CREATE OR REPLACE FUNCTION sophia.runtime_review_submit(p_token_sha256 bytea, p_unit text, p_bridge text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE s sophia.design_scope:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',false);
 key text:=sophia.design_call_key(s,p_request); rv sophia.design_reviews; r sophia.render_jobs; missing text[]; v_findings jsonb; out jsonb;
 j sophia.jobs; src sophia.source_objects; v_summary text; v_reason text:=btrim(p_request->'blocker'->>'reason');
BEGIN
 IF (p_request ? 'result')=(p_request ? 'blocker') THEN RAISE EXCEPTION 'A submit carries a result or a blocker' USING ERRCODE='22023'; END IF;
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=s.project_id AND job_id=s.job_id;
 IF rv.closed_by_call=key THEN
  IF (rv.verdict='blocked')<>(p_request ? 'blocker') THEN RAISE EXCEPTION 'Idempotency key reused for another submit' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('outcome','recorded','verdict',rv.verdict,'candidateId',rv.candidate_id);
 END IF;
 IF rv.closed_by_call IS NOT NULL THEN RAISE EXCEPTION 'The review has already ended' USING ERRCODE='40001'; END IF;
 s:=sophia.design_scope_of(p_token_sha256,p_unit,p_bridge,p_request,'design_review',true);
 SELECT * INTO rv FROM sophia.design_reviews WHERE project_id=s.project_id AND job_id=s.job_id FOR UPDATE;
 IF p_request ? 'result' THEN
  v_findings:=sophia.review_findings(p_request->'result');
  v_summary:=nullif(btrim(coalesce(p_request->'result'->>'summary','')),'');
  IF length(v_summary)>2000 THEN RAISE EXCEPTION 'A review''s summary is at most 2000 characters' USING ERRCODE='22023'; END IF;
  SELECT rj.* INTO r FROM sophia.render_jobs rj WHERE rj.project_id=s.project_id AND rj.job_id=(sophia.review_candidate(s)).render_job_id;
  IF p_request->'result'->>'verdict'='pass' THEN
   missing:=sophia.review_missing(rv,r,s.attempt_id,sophia.design_seen_ids(p_request->'result'->'seen'));
  ELSE
   missing:=sophia.review_unbacked(sophia.design_delivered(rv.project_id,rv.job_id,s.attempt_id,r.job_id,
    sophia.design_seen_ids(p_request->'result'->'seen')),v_findings,r.receipt->'captures');
  END IF;
  IF cardinality(missing)>0 THEN RETURN jsonb_build_object('outcome','coverage_incomplete','missing',to_jsonb(missing[1:40])); END IF;
  UPDATE sophia.design_reviews SET verdict=p_request->'result'->>'verdict', findings=v_findings, summary=v_summary,
   submitted_at=now(), closed_by_call=key WHERE project_id=s.project_id AND job_id=s.job_id RETURNING * INTO rv;
  src:=sophia.put_text_source(s.project_id,s.actor_id,'text/markdown; charset=utf-8','Review verdict: '||rv.verdict
   ||coalesce(E'\n\n'||v_summary,''));
  UPDATE sophia.jobs SET state='succeeded', result_source_id=src.id, result_revision=result_revision+1, reason=NULL
   WHERE project_id=s.project_id AND id=s.job_id RETURNING * INTO j;
  UPDATE sophia.work_attempts SET state='accepted' WHERE project_id=s.project_id AND id=s.attempt_id;
 ELSE
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'A blocker has a reason of 1 to 500 characters' USING ERRCODE='22023'; END IF;
  UPDATE sophia.design_reviews SET verdict='blocked', findings='[]', summary=v_reason, submitted_at=now(), closed_by_call=key
   WHERE project_id=s.project_id AND job_id=s.job_id RETURNING * INTO rv;
  UPDATE sophia.jobs SET state='failed', reason=left('blocked: '||v_reason,2000), result_revision=result_revision+1
   WHERE project_id=s.project_id AND id=s.job_id;
  UPDATE sophia.work_attempts SET state='failed' WHERE project_id=s.project_id AND id=s.attempt_id;
 END IF;
 out:=sophia.design_review_outcome(s.project_id,s.job_id);
 RETURN jsonb_build_object('outcome','recorded','verdict',rv.verdict,'candidateId',rv.candidate_id,'decision',out);
END $$;

-- review_missing's 0040 form read what the reviewer had inspected in any attempt; nothing calls it now.
DROP FUNCTION sophia.review_missing(sophia.design_reviews,sophia.render_jobs);


-- --- edit replay ------------------------------------------------------------------------------------------------------------

-- An edit request's scope as the task records it (sections sorted and distinct, shell and styles), or null when
-- malformed. For comparing a replay only: design_edit_scope checks it against the page.
CREATE FUNCTION sophia.design_edit_request_scope(p_request jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(p_request->'sections')='array'
   AND coalesce(jsonb_typeof(p_request->'shell'),'boolean')='boolean' AND coalesce(jsonb_typeof(p_request->'styles'),'boolean')='boolean'
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'sections') x WHERE jsonb_typeof(x)<>'string')
  THEN jsonb_build_object('sections',(SELECT to_jsonb(array_agg(DISTINCT x ORDER BY x)) FROM jsonb_array_elements_text(p_request->'sections') x),
   'shell',coalesce((p_request->>'shell')::boolean,false),'styles',coalesce((p_request->>'styles')::boolean,false)) END $$;
REVOKE ALL ON FUNCTION sophia.design_edit_request_scope(jsonb) FROM PUBLIC;

-- request_design_edit (0041), replaced: a replay must be the same request in full (F5).
CREATE OR REPLACE FUNCTION sophia.request_design_edit(p_project uuid, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE actor uuid:=sophia.actor_id(); key text:=p_request->>'requestKey'; prior sophia.design_tasks; base record; d sophia.design_sources;
 scope jsonb; instruction text; src uuid:=sophia.uuid_or_null(p_request->>'instructionSourceId'); job uuid:=gen_random_uuid(); manifest jsonb;
 t sophia.design_tasks;
BEGIN
 IF actor IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF key IS NULL OR length(key) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 SELECT * INTO prior FROM sophia.design_tasks WHERE project_id=p_project AND actor_id=actor AND request_key=key;
 IF FOUND THEN
  IF prior.base_version_id IS DISTINCT FROM sophia.uuid_or_null(p_request->>'versionId')
   OR prior.instruction_source_id IS DISTINCT FROM src
   OR prior.scope IS DISTINCT FROM sophia.design_edit_request_scope(p_request) THEN
   RAISE EXCEPTION 'Idempotency key reused with different request' USING ERRCODE='23505'; END IF;
  RETURN sophia.design_edit_receipt(prior);
 END IF;
 SELECT * INTO base FROM sophia.design_edit_base(p_project,sophia.uuid_or_null(p_request->>'versionId'));
 SELECT * INTO d FROM sophia.design_sources WHERE project_id=p_project AND id=(base.c).source_id;
 scope:=sophia.design_edit_scope(d,p_request);
 SELECT x.body INTO instruction FROM sophia.source_objects s JOIN sophia.source_texts x ON x.project_id=s.project_id AND x.source_id=s.id
  WHERE s.project_id=p_project AND s.id=src AND s.eligible AND s.scope='project' AND s.state='ready';
 IF instruction IS NULL THEN RAISE EXCEPTION 'Source not released and eligible for project work: the edit''s instruction' USING ERRCODE='42501'; END IF;
 IF length(btrim(instruction)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'An edit''s instruction is 1 to 2000 characters' USING ERRCODE='22023'; END IF;
 manifest:=jsonb_build_object('schema','sophia.design-manifest.v1','projectId',p_project,'taskId',job,'researchTaskId',(base.bt).research_job_id,
  'role',(base.bt).role,'route',(base.bt).route,'mode','edit','artifactId',(base.v).artifact_id,'versionId',(base.v).id,
  'versionNumber',(base.v).version_number,'markdownSourceId',(base.v).source_id,'markdownSha256',(base.v).source_hash,
  'targets',to_jsonb((base.bt).targets),'language',(base.bt).language,'baseCandidateId',(base.c).id,'baseRevisionId',d.id,
  'baseSha256',d.package_sha256,'scope',scope,'instruction',btrim(instruction));
 UPDATE sophia.goals SET revision=revision+1, state_revision=state_revision+1, status='ready' WHERE project_id=p_project AND id=(base.g).id;
 PERFORM sophia.design_attempt(p_project,(base.g).id,actor,'design',job,base.rt,manifest,ARRAY[(base.v).source_id,(base.x).source_id,src],
  (base.v).artifact_id);
 INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
  mode,language,targets,role,route,package_source_id,package_sha256,scope,base_candidate_id,instruction_source_id,request_key)
 VALUES(p_project,job,(base.bt).research_job_id,(base.bt).root_job_id,(base.bt).allowance_id,actor,(base.v).artifact_id,(base.v).id,
  (base.v).source_hash,'edit',(base.bt).language,(base.bt).targets,(base.bt).role,(base.bt).route,(base.bt).package_source_id,
  (base.bt).package_sha256,scope,(base.c).id,src,key)
 RETURNING * INTO t;
 -- Its first revision is the published candidate's source, as it was.
 INSERT INTO sophia.design_sources(project_id,design_job_id,seq,base_id,call_key,kind,package_sha256,files,sections,complete,findings,finding_count,
  compiled_source_id)
 VALUES(p_project,job,1,NULL,'base:'||(base.c).id,'write',d.package_sha256,d.files,d.sections,d.complete,d.findings,d.finding_count,d.compiled_source_id);
 PERFORM sophia.emit_service_event(p_project,'native_task.admitted','job',job,1,'native_task.design_edit',jsonb_build_array((base.g).id,(base.v).source_id));
 RETURN sophia.design_edit_receipt(t);
END $$;

GRANT EXECUTE ON FUNCTION sophia.runtime_capture_issue(bytea,text,text,jsonb,text),
 sophia.runtime_capture_delivered(bytea,text,text,jsonb,text) TO sophia_api;

COMMIT;
