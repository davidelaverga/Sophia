-- SMC-M03 S5a part 2 (plan §2.7): render jobs and the render runner. A render job is a child of a research task
-- (jobs.kind='render', parent_job_id the task), carrying a source package: one HTML entry and up to 64 images, each
-- a stored source named by a relative path. The trusted supervisor on the renderer host claims jobs with a runner
-- capability, fetches the files and uploads the PDF through the API under the job's lease, and settles with the
-- kernel's receipt. It holds no database URL and no storage key. Nothing here admits a render: S5b's
-- research_render_pdf and render_research call enqueue_render_job.
-- * Runners are registered by the owner (a Codex operation under Davide's approval) by the SHA-256 of their bearer
--   token. A revoked runner claims, reads and settles nothing.
-- * The source package's identity is the kernel's (renderers/web/pdf/source-manifest.mjs): one line per file,
--   `role\tpath\tsha256\n`, the entry first, then the assets by path, hashed. The kernel recomputes it from the
--   bytes it received, so a package that changed on the way fails the receipt check here.
-- * A claim takes the oldest pending job whose goal is working, under a lease (5 minutes, extended by heartbeats). A
--   Hold sends a running render back to the queue at its next heartbeat, so it is claimed again after Resume. A Stop,
--   or a research task that failed or was cancelled, cancels it. A lease that runs out puts the job back, at most
--   three claims in all; after that the job fails as renderer_lost.
-- * The output is a byte-stored source (objects/<project>/<id>), derived from every file of the package, written
--   once. A settle after the lease moved, after a Stop or a Hold, or for another package is refused or recorded
--   as stale; a stale render never becomes the job's result.
BEGIN;

-- The relative path form the kernel accepts: ASCII segments, no dot segments, at most 8 deep.
CREATE FUNCTION sophia.is_render_path(p text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p IS NOT NULL AND length(p)<=512 AND p ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(/[A-Za-z0-9][A-Za-z0-9._-]{0,99}){0,7}$'
  AND p !~ '(^|/)\.\.?(/|$)' $$;
REVOKE ALL ON FUNCTION sophia.is_render_path(text) FROM PUBLIC;

-- The package identity, as the kernel computes it. p_assets: [{path, sha256}].
CREATE FUNCTION sophia.render_manifest_sha256(p_entry_path text, p_entry_sha text, p_assets jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to('entry'||E'\t'||p_entry_path||E'\t'||p_entry_sha||E'\n'
  ||coalesce((SELECT string_agg('asset'||E'\t'||(a->>'path')||E'\t'||(a->>'sha256')||E'\n','' ORDER BY (a->>'path') COLLATE "C")
   FROM jsonb_array_elements(p_assets) a),''),'UTF8')),'hex') $$;
REVOKE ALL ON FUNCTION sophia.render_manifest_sha256(text,text,jsonb) FROM PUBLIC;

CREATE TABLE sophia.render_runners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL UNIQUE CHECK(label ~ '^[a-z][a-z0-9-]{0,62}$'),
 token_sha256 bytea NOT NULL UNIQUE CHECK(length(token_sha256)=32),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CHECK((state='revoked')=(revoked_at IS NOT NULL))
);
-- No policy: only the owner's functions read it.
ALTER TABLE sophia.render_runners ENABLE ROW LEVEL SECURITY;

CREATE TABLE sophia.render_jobs (
 project_id uuid NOT NULL, job_id uuid NOT NULL, parent_job_id uuid NOT NULL, goal_id uuid NOT NULL,
 format text NOT NULL CHECK(format='pdf'),
 language text NOT NULL CHECK(length(language)<=35 AND language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 runner_id uuid REFERENCES sophia.render_runners(id),
 claims integer NOT NULL DEFAULT 0 CHECK(claims BETWEEN 0 AND 3),
 output_source_id uuid,
 receipt jsonb CHECK(receipt IS NULL OR (jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=65536)),
 created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 PRIMARY KEY(project_id,job_id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,parent_job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,goal_id) REFERENCES sophia.goals(project_id,id),
 FOREIGN KEY(project_id,output_source_id) REFERENCES sophia.source_objects(project_id,id)
);
CREATE INDEX render_jobs_parent ON sophia.render_jobs(project_id,parent_job_id);
CREATE INDEX jobs_pending_renders ON sophia.jobs(available_at,id) WHERE kind='render' AND state='pending';

CREATE TABLE sophia.render_job_files (
 project_id uuid NOT NULL, job_id uuid NOT NULL, path text NOT NULL CHECK(sophia.is_render_path(path)),
 role text NOT NULL CHECK(role IN ('entry','asset')), source_id uuid NOT NULL,
 PRIMARY KEY(project_id,job_id,path),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.render_jobs(project_id,job_id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id),
 -- The kernel's allowlists: the entry is HTML, an asset a raster image.
 CHECK((role='entry' AND path ~* '\.html?$') OR (role='asset' AND path ~* '\.(png|jpe?g|webp|gif)$'))
);
CREATE UNIQUE INDEX render_job_one_entry ON sophia.render_job_files(project_id,job_id) WHERE role='entry';

ALTER TABLE sophia.render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.render_job_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.render_jobs FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.render_job_files FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.render_jobs, sophia.render_job_files TO sophia_api;

-- The owner's switches (Codex operations under Davide's approval).
CREATE FUNCTION sophia.register_render_runner(p_label text, p_token_sha256 bytea) RETURNS sophia.render_runners
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.render_runners;
BEGIN
 INSERT INTO sophia.render_runners(label,token_sha256) VALUES(p_label,p_token_sha256) RETURNING * INTO r;
 RETURN r;
END $$;
CREATE FUNCTION sophia.revoke_render_runner(p_label text) RETURNS sophia.render_runners
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.render_runners;
BEGIN
 UPDATE sophia.render_runners SET state='revoked', revoked_at=coalesce(revoked_at,now()) WHERE label=p_label RETURNING * INTO r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Render runner not found' USING ERRCODE='22023'; END IF;
 RETURN r;
END $$;

-- Queue one render of a research task's source package. p_files: [{path, role, sourceId}], one entry and at most
-- 64 assets, each a ready, eligible project source. At most three renders per task, whatever became of them.
CREATE FUNCTION sophia.enqueue_render_job(p_project uuid, p_parent_job uuid, p_language text, p_files jsonb)
RETURNS sophia.render_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE parent sophia.jobs; goal uuid; job uuid:=gen_random_uuid(); r sophia.render_jobs; entry record; assets jsonb; n integer;
BEGIN
 SELECT * INTO parent FROM sophia.jobs WHERE project_id=p_project AND id=p_parent_job FOR UPDATE;
 IF NOT FOUND OR parent.kind<>'research' THEN RAISE EXCEPTION 'Research task not found' USING ERRCODE='22023'; END IF;
 IF parent.state NOT IN ('pending','running') THEN RAISE EXCEPTION 'Research work is not active: the task has ended' USING ERRCODE='40001'; END IF;
 SELECT a.goal_id INTO goal FROM sophia.work_attempts a WHERE a.project_id=p_project AND a.id=parent.attempt_id;
 SELECT count(*) INTO n FROM sophia.render_jobs WHERE project_id=p_project AND parent_job_id=p_parent_job;
 IF n>=3 THEN RAISE EXCEPTION 'Research render limit reached' USING ERRCODE='55000'; END IF;
 IF jsonb_typeof(p_files)<>'array' OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 65
  OR (SELECT count(*) FROM jsonb_array_elements(p_files) f WHERE f->>'role'='entry')<>1
  OR (SELECT count(DISTINCT f->>'path') FROM jsonb_array_elements(p_files) f)<>jsonb_array_length(p_files) THEN
  RAISE EXCEPTION 'A render package is one entry and at most 64 assets, each path once' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_files) f WHERE NOT sophia.is_render_path(f->>'path')
   OR coalesce(f->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS(SELECT 1 FROM sophia.source_objects s WHERE s.project_id=p_project AND s.id=(f->>'sourceId')::uuid
    AND s.scope='project' AND s.eligible AND s.state='ready')) THEN
  RAISE EXCEPTION 'A render package names ready, eligible project sources by relative paths' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_files) f WHERE NOT ((f->>'role'='entry' AND f->>'path' ~* '\.html?$')
   OR (f->>'role'='asset' AND f->>'path' ~* '\.(png|jpe?g|webp|gif)$'))) THEN
  RAISE EXCEPTION 'A render package''s entry is HTML and its assets are raster images' USING ERRCODE='22023'; END IF;
 SELECT f->>'path' AS path, s.sha256 INTO entry FROM jsonb_array_elements(p_files) f
  JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=(f->>'sourceId')::uuid WHERE f->>'role'='entry';
 SELECT coalesce(jsonb_agg(jsonb_build_object('path',f->>'path','sha256',s.sha256)),'[]') INTO assets FROM jsonb_array_elements(p_files) f
  JOIN sophia.source_objects s ON s.project_id=p_project AND s.id=(f->>'sourceId')::uuid WHERE f->>'role'='asset';
 INSERT INTO sophia.jobs(project_id,id,kind,state,parent_job_id) VALUES(p_project,job,'render','pending',p_parent_job);
 INSERT INTO sophia.render_jobs(project_id,job_id,parent_job_id,goal_id,format,language,manifest_sha256)
 VALUES(p_project,job,p_parent_job,goal,'pdf',p_language,sophia.render_manifest_sha256(entry.path,entry.sha256,assets)) RETURNING * INTO r;
 INSERT INTO sophia.render_job_files(project_id,job_id,path,role,source_id)
 SELECT p_project,job,f->>'path',f->>'role',(f->>'sourceId')::uuid FROM jsonb_array_elements(p_files) f;
 RETURN r;
END $$;

-- The runner behind a token, or 28000 (an unknown capability, like a runtime's). Marks it seen.
CREATE FUNCTION sophia.render_runner_of(p_token_sha256 bytea) RETURNS sophia.render_runners
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE r sophia.render_runners;
BEGIN
 UPDATE sophia.render_runners SET seen_at=now() WHERE token_sha256=p_token_sha256 AND state='active' RETURNING * INTO r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Render runner not authorized' USING ERRCODE='28000'; END IF;
 RETURN r;
END $$;

-- Before each claim: renders whose goal stopped or whose task failed or was cancelled are cancelled; a running
-- render whose lease ran out goes back to the queue, or fails once it has been claimed three times.
CREATE FUNCTION sophia.render_sweep() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
BEGIN
 UPDATE sophia.jobs j SET state='cancelled', lease_until=NULL,
  reason=CASE WHEN g.status IN ('stopping','stopped') THEN 'stopped: the work was stopped' ELSE 'cancelled: the research task ended without it' END
  FROM sophia.render_jobs r, sophia.goals g, sophia.jobs p
  WHERE j.kind='render' AND j.state IN ('pending','running') AND r.project_id=j.project_id AND r.job_id=j.id
   AND g.project_id=r.project_id AND g.id=r.goal_id AND p.project_id=r.project_id AND p.id=r.parent_job_id
   AND (g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled'));
 UPDATE sophia.jobs j SET lease_until=NULL,
  state=CASE WHEN r.claims<3 THEN 'pending' ELSE 'failed' END,
  reason=CASE WHEN r.claims<3 THEN j.reason ELSE 'renderer_lost: the render runner stopped answering' END
  FROM sophia.render_jobs r WHERE j.kind='render' AND j.state='running' AND j.lease_until<now()
   AND r.project_id=j.project_id AND r.job_id=j.id;
END $$;

-- The job a request names, under the lease the runner holds; locked.
CREATE FUNCTION sophia.render_leased(p_runner uuid, p_job text, p_lease text) RETURNS sophia.jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE j sophia.jobs;
BEGIN
 IF coalesce(p_job,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR coalesce(p_lease,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Render job not found' USING ERRCODE='22023'; END IF;
 SELECT j2.* INTO j FROM sophia.jobs j2 JOIN sophia.render_jobs r ON r.project_id=j2.project_id AND r.job_id=j2.id
  WHERE j2.id=p_job::uuid AND j2.kind='render' AND r.runner_id=p_runner AND j2.lease_token=p_lease::uuid FOR UPDATE OF j2;
 IF NOT FOUND THEN RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001'; END IF;
 RETURN j;
END $$;

-- The job as the runner sees it: what to fetch and how it is identified.
CREATE FUNCTION sophia.render_job_view(j sophia.jobs) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,sophia AS $$
 SELECT jsonb_build_object('jobId',j.id,'leaseToken',j.lease_token,'leaseUntil',j.lease_until,'format',r.format,'language',r.language,
  'sourceManifestHash',r.manifest_sha256,'timeoutMs',120000,
  'files',(SELECT jsonb_agg(jsonb_build_object('path',f.path,'role',f.role,'sha256',s.sha256,'byteLength',s.byte_length) ORDER BY f.role DESC, f.path COLLATE "C")
   FROM sophia.render_job_files f JOIN sophia.source_objects s ON s.project_id=f.project_id AND s.id=f.source_id
   WHERE f.project_id=r.project_id AND f.job_id=r.job_id))
 FROM sophia.render_jobs r WHERE r.project_id=j.project_id AND r.job_id=j.id $$;

-- POST /v1/renderer/claim: the oldest pending render whose goal is working, under a new lease; null when none.
CREATE FUNCTION sophia.renderer_claim(p_token_sha256 bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs;
BEGIN
 PERFORM sophia.render_sweep();
 SELECT j2.* INTO j FROM sophia.jobs j2 JOIN sophia.render_jobs r ON r.project_id=j2.project_id AND r.job_id=j2.id
  JOIN sophia.goals g ON g.project_id=r.project_id AND g.id=r.goal_id
  WHERE j2.kind='render' AND j2.state='pending' AND j2.available_at<=now() AND g.status IN ('ready','running','checking')
  ORDER BY j2.available_at, j2.id FOR UPDATE OF j2 SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE sophia.jobs SET state='running', lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes'
  WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.render_jobs SET runner_id=rn.id, claims=claims+1 WHERE project_id=j.project_id AND job_id=j.id;
 RETURN sophia.render_job_view(j);
END $$;

-- POST /v1/renderer/jobs/{id}/heartbeat: extend the lease, or say to stop. A Stop, or a task that ended, cancels
-- the render; a Hold puts it back in the queue (not counted as a claim), to be claimed again after Resume.
CREATE FUNCTION sophia.renderer_heartbeat(p_token_sha256 bytea, p_job text, p_lease text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs; g sophia.goals; p sophia.jobs;
BEGIN
 IF j.state<>'running' THEN RETURN jsonb_build_object('state','cancel'); END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 SELECT * INTO g FROM sophia.goals WHERE project_id=j.project_id AND id=r.goal_id;
 SELECT * INTO p FROM sophia.jobs WHERE project_id=j.project_id AND id=r.parent_job_id;
 IF g.status IN ('stopping','stopped') OR p.state IN ('failed','cancelled') THEN
  UPDATE sophia.jobs SET state='cancelled', lease_until=NULL,
   reason=CASE WHEN g.status IN ('stopping','stopped') THEN 'stopped: the work was stopped' ELSE 'cancelled: the research task ended without it' END
  WHERE project_id=j.project_id AND id=j.id;
  RETURN jsonb_build_object('state','cancel');
 END IF;
 IF g.status IN ('holding','held') THEN
  UPDATE sophia.jobs SET state='pending', lease_token=NULL, lease_until=NULL WHERE project_id=j.project_id AND id=j.id;
  UPDATE sophia.render_jobs SET claims=greatest(claims-1,0), runner_id=NULL WHERE project_id=j.project_id AND job_id=j.id;
  RETURN jsonb_build_object('state','cancel');
 END IF;
 UPDATE sophia.jobs SET lease_until=now()+interval '5 minutes' WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('state','continue','leaseUntil',j.lease_until);
END $$;

-- GET /v1/renderer/jobs/{id}/files/{path}: where one file of the package is (the API reads it and sends the bytes).
CREATE FUNCTION sophia.renderer_file(p_token_sha256 bytea, p_job text, p_lease text, p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 s sophia.source_objects; body text;
BEGIN
 IF j.state<>'running' THEN RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001'; END IF;
 SELECT so.* INTO s FROM sophia.render_job_files f JOIN sophia.source_objects so ON so.project_id=f.project_id AND so.id=f.source_id
  WHERE f.project_id=j.project_id AND f.job_id=j.id AND f.path=p_path;
 IF NOT FOUND THEN RAISE EXCEPTION 'Render file not found' USING ERRCODE='22023'; END IF;
 IF s.state<>'ready' OR NOT s.eligible THEN RAISE EXCEPTION 'Source not released and eligible for project work' USING ERRCODE='42501'; END IF;
 SELECT t.body INTO body FROM sophia.source_texts t WHERE t.project_id=s.project_id AND t.source_id=s.id;
 RETURN jsonb_build_object('projectId',s.project_id,'sourceId',s.id,'sha256',s.sha256,'mime',s.mime,'byteLength',s.byte_length,
  'storageKey',s.storage_key,'text',body);
END $$;

-- PUT /v1/renderer/jobs/{id}/output, step 1: where the PDF goes (a new source id in the job's project). Once only.
CREATE FUNCTION sophia.renderer_output_slot(p_token_sha256 bytea, p_job text, p_lease text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs;
BEGIN
 IF j.state<>'running' THEN RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 IF r.output_source_id IS NOT NULL THEN RAISE EXCEPTION 'The render already has its output' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('projectId',j.project_id,'sourceId',gen_random_uuid());
END $$;

-- PUT .../output, step 2, after the bytes are stored at objects/<project>/<source>: record them as the render's
-- output, a project source derived from every file of the package.
CREATE FUNCTION sophia.renderer_record_output(p_token_sha256 bytea, p_job text, p_lease text, p_source uuid, p_sha256 text, p_bytes bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE rn sophia.render_runners:=sophia.render_runner_of(p_token_sha256); j sophia.jobs:=sophia.render_leased(rn.id,p_job,p_lease);
 r sophia.render_jobs; owner uuid;
BEGIN
 IF j.state<>'running' THEN RAISE EXCEPTION 'Render lease lost' USING ERRCODE='40001'; END IF;
 IF coalesce(p_sha256,'') !~ '^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 33554432 THEN
  RAISE EXCEPTION 'A render output is 1 byte to 32 MiB, with its SHA-256' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM sophia.render_jobs WHERE project_id=j.project_id AND job_id=j.id;
 IF r.output_source_id IS NOT NULL THEN RAISE EXCEPTION 'The render already has its output' USING ERRCODE='40001'; END IF;
 SELECT t.actor_id INTO owner FROM sophia.research_tasks t WHERE t.project_id=j.project_id AND t.job_id=r.parent_job_id;
 INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
 VALUES(j.project_id,p_source,owner,'project',p_sha256,'application/pdf','objects/'||j.project_id||'/'||p_source,p_bytes,true,'ready');
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
 SELECT f.project_id,f.source_id,p_source FROM sophia.render_job_files f WHERE f.project_id=j.project_id AND f.job_id=j.id;
 UPDATE sophia.render_jobs SET output_source_id=p_source WHERE project_id=j.project_id AND job_id=j.id;
 RETURN jsonb_build_object('sourceId',p_source,'sha256',p_sha256,'byteLength',p_bytes);
END $$;

-- POST /v1/renderer/jobs/{id}/settle: end the render with the kernel's receipt. A succeeded render must name the
-- package it was given and the output recorded for it. A render that ends after a Stop or the task's end is stale:
-- kept as evidence, never the job's result. One that ends under a Hold goes back to the queue, to run again after
-- Resume. Repeating the same settle returns the same state.
CREATE FUNCTION sophia.renderer_settle(p_token_sha256 bytea, p_job text, p_lease text, p_receipt jsonb) RETURNS jsonb
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
 IF g.status IN ('holding','held') AND p.state IN ('pending','running') THEN
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
 ELSE
  outcome:=status;
  why:=CASE WHEN status='succeeded' THEN NULL ELSE left(coalesce(status||': '||(p_receipt->'error'->>'code'),status),200) END;
 END IF;
 UPDATE sophia.jobs SET state=outcome, reason=why, lease_until=NULL, result_source_id=CASE WHEN outcome='succeeded' THEN r.output_source_id END
  WHERE project_id=j.project_id AND id=j.id RETURNING * INTO j;
 UPDATE sophia.render_jobs SET receipt=p_receipt, settled_at=now() WHERE project_id=j.project_id AND job_id=j.id;
 RETURN jsonb_build_object('state',j.state,'reason',j.reason);
END $$;

REVOKE ALL ON FUNCTION sophia.register_render_runner(text,bytea), sophia.revoke_render_runner(text),
 sophia.enqueue_render_job(uuid,uuid,text,jsonb), sophia.render_runner_of(bytea), sophia.render_sweep(),
 sophia.render_leased(uuid,text,text), sophia.render_job_view(sophia.jobs),
 sophia.renderer_claim(bytea), sophia.renderer_heartbeat(bytea,text,text), sophia.renderer_file(bytea,text,text,text),
 sophia.renderer_output_slot(bytea,text,text), sophia.renderer_record_output(bytea,text,text,uuid,text,bigint),
 sophia.renderer_settle(bytea,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sophia.renderer_claim(bytea), sophia.renderer_heartbeat(bytea,text,text),
 sophia.renderer_file(bytea,text,text,text), sophia.renderer_output_slot(bytea,text,text),
 sophia.renderer_record_output(bytea,text,text,uuid,text,bigint), sophia.renderer_settle(bytea,text,text,jsonb) TO sophia_api;

COMMIT;
