-- SDD-01 (binding map §1, §5): the records of native HTML design and its independent visual review. Nothing here
-- admits a design, calls a model or renders: 0039 adds the runtime operations, 0040 the flow that writes these rows.
-- * A design task is one job (jobs.kind='design') on the goal of the research report it designs, with its own
--   attempt, binding and command, like a research task. It designs exactly one published version: the version's
--   Markdown is frozen as a content package (blocks, citations, sources, limitations; @sophia/design), written once.
--   It draws on the research lineage's allowance (0024): nothing new is granted.
-- * A source revision is immutable: a package of `index.html` and an optional `styles.css`, each a text source, its
--   identity the package hash (@sophia/design packageSha256), its sections, and whether it covers the frozen content
--   (complete). A revision is never stored when it breaks the static profile; the API checks that before 0039 writes.
-- * A render of a revision is a capture job: a render job (kind 'capture', format 'png') of the revision's compiled
--   page, at the task's targets. Its outputs are the PNG captures the receipt names, each a byte-stored source.
-- * A candidate is a revision whose render passed the hard gate, submitted by the designer. A review is a separate
--   job (jobs.kind='design_review') with its own attempt and session, bound to one candidate and the criteria it was
--   given; it never edits. The candidate's state follows the review: published reviewed, needs revision, or published
--   with its label (self_review_only, review_unresolved).
-- * The published HTML is a rendition (format 'html') of the next version of the report: the same Markdown, with the
--   review state it was published with.
-- 0001–0037 are not edited.
BEGIN;

-- --- what exists, widened -----------------------------------------------------------------------------------------

-- A design is a task a member's reader describes (A12 adds it to the task kinds); a review is internal, never listed.
CREATE OR REPLACE FUNCTION sophia.is_task_kind(p_kind text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_kind IN ('draft_brief','research','design') $$;

-- The HTML of a version, with the review state it was published with and the candidate it came from.
ALTER TABLE sophia.artifact_renditions DROP CONSTRAINT artifact_renditions_format_check,
 ADD CONSTRAINT artifact_renditions_format_check CHECK(format IN ('pdf','html')),
 ADD COLUMN review_state text CHECK(review_state IS NULL OR review_state IN ('reviewed','self_review_only','review_unresolved')),
 ADD COLUMN candidate_id uuid,
 ADD CONSTRAINT artifact_renditions_html_review CHECK((format='html')=(review_state IS NOT NULL));

-- The HTML a research task was asked for, recorded at admission (0040 request_research_design), and what became of
-- it at publication: designing, then published, failed or not started, with the design task.
ALTER TABLE sophia.research_tasks
 ADD COLUMN design_request jsonb CHECK(design_request IS NULL OR (jsonb_typeof(design_request)='object'
  AND octet_length(design_request::text)<=4096)),
 ADD COLUMN design_state text CHECK(design_state IS NULL OR design_state IN ('designing','published','failed','not_started')),
 ADD COLUMN design_reason text CHECK(design_reason IS NULL OR length(design_reason) BETWEEN 1 AND 300),
 ADD COLUMN design_job_id uuid,
 ADD CONSTRAINT research_tasks_design_job_fk FOREIGN KEY(project_id,design_job_id) REFERENCES sophia.jobs(project_id,id),
 ADD CONSTRAINT research_tasks_design_state CHECK(design_state IS NULL OR design_request IS NOT NULL);

-- The formats a render runner renders, as its last claim named them (a runner that names none renders PDF only).
ALTER TABLE sophia.render_runners ADD COLUMN formats text[] NOT NULL DEFAULT '{pdf}'
 CHECK(formats <@ ARRAY['pdf','png'] AND cardinality(formats) BETWEEN 1 AND 2);

-- A capture job: format png, kind capture, the targets it captures and, when not all, the sections. Its receipt
-- names every capture and the measures of every block, so it may be larger than a PDF's.
ALTER TABLE sophia.render_jobs DROP CONSTRAINT render_jobs_format_check,
 DROP CONSTRAINT render_jobs_kind_check,
 DROP CONSTRAINT render_jobs_receipt_check,
 ADD CONSTRAINT render_jobs_format_check CHECK(format IN ('pdf','png')),
 ADD CONSTRAINT render_jobs_kind_check CHECK(kind IN ('task','rendition','capture')),
 ADD CONSTRAINT render_jobs_receipt_check CHECK(receipt IS NULL OR (jsonb_typeof(receipt)='object'
  AND octet_length(receipt::text)<=CASE format WHEN 'png' THEN 1048576 ELSE 65536 END)),
 ADD COLUMN targets text[] CHECK(targets IS NULL OR (targets <@ ARRAY['w390-light','w1280-light'] AND cardinality(targets) BETWEEN 1 AND 2)),
 ADD COLUMN sections text[] CHECK(sections IS NULL OR (cardinality(sections) BETWEEN 1 AND 64)),
 ADD COLUMN design_source_id uuid,
 ADD CONSTRAINT render_jobs_capture CHECK((kind='capture')=(format='png') AND (kind='capture')=(targets IS NOT NULL)
  AND (kind='capture')=(design_source_id IS NOT NULL));

-- Every PNG a capture produced, by the name its receipt gives it. Written once each, under the job's lease.
CREATE TABLE sophia.render_job_outputs (
 project_id uuid NOT NULL, job_id uuid NOT NULL,
 name text NOT NULL CHECK(name ~ '^[a-z0-9][a-z0-9.-]{0,150}\.png$'),
 source_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,job_id,name),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.render_jobs(project_id,job_id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.source_objects(project_id,id)
);

-- --- design records -----------------------------------------------------------------------------------------------

CREATE TABLE sophia.design_tasks (
 project_id uuid NOT NULL, job_id uuid NOT NULL,
 research_job_id uuid NOT NULL, root_job_id uuid NOT NULL, allowance_id uuid NOT NULL, actor_id uuid NOT NULL,
 artifact_id uuid NOT NULL, base_version_id uuid NOT NULL,
 markdown_sha256 text NOT NULL CHECK(markdown_sha256 ~ '^[0-9a-f]{64}$'),
 mode text NOT NULL DEFAULT 'create' CHECK(mode IN ('create','edit','audit')),
 language text NOT NULL CHECK(length(language)<=35 AND language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
 targets text[] NOT NULL CHECK(targets <@ ARRAY['w390-light','w1280-light'] AND cardinality(targets) BETWEEN 1 AND 2),
 role text NOT NULL CHECK(role ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$'),
 route text NOT NULL CHECK(route ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 -- The frozen content package (a JSON source) and its hash; written once, in the transaction that admits the task.
 package_source_id uuid, package_sha256 text CHECK(package_sha256 IS NULL OR package_sha256 ~ '^[0-9a-f]{64}$'),
 -- What an edit may change (@sophia/design EditScope). A create may change everything.
 scope jsonb NOT NULL DEFAULT '{"sections":["*"],"shell":true,"styles":true}' CHECK(jsonb_typeof(scope)='object'),
 -- At most two repairs after the first complete candidate, three reviews in all; a restart resets neither.
 max_repairs integer NOT NULL DEFAULT 2 CHECK(max_repairs BETWEEN 0 AND 2),
 max_rounds integer NOT NULL DEFAULT 3 CHECK(max_rounds BETWEEN 1 AND 3),
 state text NOT NULL DEFAULT 'designing' CHECK(state IN ('designing','reviewing','published','failed','cancelled','superseded')),
 reason text CHECK(reason IS NULL OR length(reason) BETWEEN 1 AND 500),
 nudge_command_id uuid,
 closed_by_call text CHECK(closed_by_call IS NULL OR closed_by_call ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 published_version_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,job_id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,research_job_id) REFERENCES sophia.research_tasks(project_id,job_id),
 FOREIGN KEY(project_id,root_job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id),
 FOREIGN KEY(project_id,artifact_id) REFERENCES sophia.artifacts(project_id,id),
 FOREIGN KEY(project_id,base_version_id) REFERENCES sophia.artifact_versions(project_id,id),
 FOREIGN KEY(project_id,package_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,nudge_command_id) REFERENCES sophia.commands(project_id,id),
 FOREIGN KEY(project_id,published_version_id) REFERENCES sophia.artifact_versions(project_id,id),
 CHECK((package_source_id IS NULL)=(package_sha256 IS NULL))
);
-- One design at a time per version: a second request while one is under way is the same work.
CREATE UNIQUE INDEX design_tasks_one_live ON sophia.design_tasks(project_id,base_version_id) WHERE state IN ('designing','reviewing');
CREATE INDEX design_tasks_research ON sophia.design_tasks(project_id,research_job_id);

-- The source revisions of a design task, in order. Each file is a text source; the package hash names them all.
CREATE TABLE sophia.design_sources (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 design_job_id uuid NOT NULL, seq integer NOT NULL CHECK(seq>0),
 base_id uuid,
 call_key text NOT NULL CHECK(call_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 kind text NOT NULL CHECK(kind IN ('write','patch')),
 package_sha256 text NOT NULL CHECK(package_sha256 ~ '^[0-9a-f]{64}$'),
 -- [{path, sourceId, sha256, bytes}], index.html first.
 files jsonb NOT NULL CHECK(jsonb_typeof(files)='array' AND jsonb_array_length(files) BETWEEN 1 AND 2),
 -- [{id, line, sha256}] in page order.
 sections jsonb NOT NULL CHECK(jsonb_typeof(sections)='array' AND jsonb_array_length(sections)<=256),
 complete boolean NOT NULL,
 findings jsonb NOT NULL CHECK(jsonb_typeof(findings)='array' AND jsonb_array_length(findings)<=200),
 finding_count integer NOT NULL CHECK(finding_count>=jsonb_array_length(findings)),
 diff_source_id uuid,
 -- The page this revision compiles to (@sophia/design compile), written by its first render.
 compiled_source_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,design_job_id,seq), UNIQUE(project_id,design_job_id,call_key),
 FOREIGN KEY(project_id,design_job_id) REFERENCES sophia.design_tasks(project_id,job_id),
 FOREIGN KEY(project_id,base_id) REFERENCES sophia.design_sources(project_id,id),
 FOREIGN KEY(project_id,diff_source_id) REFERENCES sophia.source_objects(project_id,id),
 FOREIGN KEY(project_id,compiled_source_id) REFERENCES sophia.source_objects(project_id,id),
 CHECK((seq=1)=(base_id IS NULL))
);
ALTER TABLE sophia.render_jobs ADD CONSTRAINT render_jobs_design_source_fk
 FOREIGN KEY(project_id,design_source_id) REFERENCES sophia.design_sources(project_id,id);

-- The designer's work record: its contract, stages, the references it read, its risks, surfaces and notes. Append
-- only; each call names the entry count it read. It grants nothing.
CREATE TABLE sophia.design_work_entries (
 project_id uuid NOT NULL, design_job_id uuid NOT NULL, seq integer NOT NULL CHECK(seq>0),
 call_key text NOT NULL CHECK(call_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 kind text NOT NULL CHECK(kind IN ('contract','stage','reference','risk','surface','note')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body) IN ('object','string') AND octet_length(body::text)<=16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,design_job_id,seq),
 FOREIGN KEY(project_id,design_job_id) REFERENCES sophia.design_tasks(project_id,job_id)
);
CREATE INDEX design_work_entries_call ON sophia.design_work_entries(project_id,design_job_id,call_key);

CREATE TABLE sophia.design_candidates (
 project_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 design_job_id uuid NOT NULL, source_id uuid NOT NULL, render_job_id uuid NOT NULL, compiled_source_id uuid NOT NULL,
 -- 1 for the first complete candidate, then one more for each repair.
 round integer NOT NULL CHECK(round BETWEEN 1 AND 3),
 call_key text NOT NULL CHECK(call_key ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 -- The author's own account of the candidate: never shown to its reviewer.
 summary text CHECK(summary IS NULL OR length(summary) BETWEEN 1 AND 2000),
 -- The hard gate's record: the checks it read and what they said.
 gate jsonb NOT NULL CHECK(jsonb_typeof(gate)='object'),
 state text NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','reviewing','needs_revision','self_review_only',
  'review_unresolved','reviewed','published','superseded','failed')),
 review_state text CHECK(review_state IS NULL OR review_state IN ('reviewed','self_review_only','review_unresolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,design_job_id,round), UNIQUE(project_id,design_job_id,call_key),
 FOREIGN KEY(project_id,design_job_id) REFERENCES sophia.design_tasks(project_id,job_id),
 FOREIGN KEY(project_id,source_id) REFERENCES sophia.design_sources(project_id,id),
 FOREIGN KEY(project_id,render_job_id) REFERENCES sophia.render_jobs(project_id,job_id),
 FOREIGN KEY(project_id,compiled_source_id) REFERENCES sophia.source_objects(project_id,id)
);
ALTER TABLE sophia.artifact_renditions ADD CONSTRAINT artifact_renditions_candidate_fk
 FOREIGN KEY(project_id,candidate_id) REFERENCES sophia.design_candidates(project_id,id);

-- One independent review of one candidate, by its own job and session.
CREATE TABLE sophia.design_reviews (
 project_id uuid NOT NULL, job_id uuid NOT NULL,
 candidate_id uuid NOT NULL, design_job_id uuid NOT NULL, allowance_id uuid NOT NULL, actor_id uuid NOT NULL,
 role text NOT NULL CHECK(role ~ '^sophia-[a-z]+(-[a-z]+)*-v[0-9]+$'),
 route text NOT NULL CHECK(route ~ '^[a-z][a-z0-9-]{0,62}[a-z0-9]$'),
 criteria_sha256 text NOT NULL CHECK(criteria_sha256 ~ '^[0-9a-f]{64}$'),
 -- The captures this review actually looked at, as the service handed them over (never the reviewer's own claim).
 inspected text[] NOT NULL DEFAULT '{}' CHECK(cardinality(inspected)<=160),
 verdict text CHECK(verdict IS NULL OR verdict IN ('pass','needs_revision','blocked')),
 findings jsonb CHECK(findings IS NULL OR (jsonb_typeof(findings)='array' AND jsonb_array_length(findings)<=40)),
 summary text CHECK(summary IS NULL OR length(summary) BETWEEN 1 AND 2000),
 nudge_command_id uuid,
 closed_by_call text CHECK(closed_by_call IS NULL OR closed_by_call ~ '^[A-Za-z0-9][A-Za-z0-9._:#-]{0,239}$'),
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
 PRIMARY KEY(project_id,job_id),
 FOREIGN KEY(project_id,job_id) REFERENCES sophia.jobs(project_id,id),
 FOREIGN KEY(project_id,candidate_id) REFERENCES sophia.design_candidates(project_id,id),
 FOREIGN KEY(project_id,design_job_id) REFERENCES sophia.design_tasks(project_id,job_id),
 FOREIGN KEY(project_id,allowance_id) REFERENCES sophia.research_allowances(project_id,id),
 FOREIGN KEY(project_id,nudge_command_id) REFERENCES sophia.commands(project_id,id),
 CHECK((verdict IS NULL)=(submitted_at IS NULL))
);
CREATE UNIQUE INDEX design_reviews_one_per_candidate ON sophia.design_reviews(project_id,candidate_id);

ALTER TABLE sophia.render_job_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.design_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.design_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.design_work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.design_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia.design_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_read ON sophia.render_job_outputs FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.design_tasks FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.design_sources FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.design_work_entries FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.design_candidates FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
CREATE POLICY members_read ON sophia.design_reviews FOR SELECT TO sophia_api USING(sophia.is_member(project_id));
GRANT SELECT ON sophia.render_job_outputs, sophia.design_tasks, sophia.design_sources, sophia.design_work_entries,
 sophia.design_candidates, sophia.design_reviews TO sophia_api;

COMMIT;
