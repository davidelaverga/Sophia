-- Run against a disposable database with the four migrations installed.
-- psql -v ON_ERROR_STOP=1 -f db/tests/0001_scope_and_commands.sql
-- Never use production. Everything below rolls back.
BEGIN;
INSERT INTO sophia.projects(id,title,created_by) VALUES
 ('10000000-0000-0000-0000-000000000001','Project A','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','Project B','00000000-0000-0000-0000-000000000002');
INSERT INTO sophia.project_members(project_id,actor_id,role) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','admin'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','editor'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','admin');
INSERT INTO sophia.project_revisions(project_id,revision,frame,accepted_by) VALUES
 ('10000000-0000-0000-0000-000000000001',1,'{}','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002',1,'{}','00000000-0000-0000-0000-000000000002');
INSERT INTO sophia.goals(project_id,id,title,outcome,criteria,status,mission_revision) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Goal','Outcome','[]','running',1);
INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state) VALUES
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','private',repeat('a',64),'text/plain','private-fixture',1,true,'ready'),
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','project',repeat('b',64),'text/plain','project-fixture',1,true,'ready');
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sophia.projects)<>1 THEN RAISE EXCEPTION 'Cross-project RLS failed'; END IF;
END $$;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sophia.source_objects)<>1 THEN RAISE EXCEPTION 'Private source RLS failed'; END IF;
END $$;
DO $$ BEGIN
 BEGIN
  PERFORM sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','steer','private-steer',1,1,'30000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Private source was used in project work';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DO $$ DECLARE a jsonb;b jsonb; BEGIN
 a:=sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','request_review','dedupe',1,1,NULL);
 b:=sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','request_review','dedupe',1,1,NULL);
 IF a<>b THEN RAISE EXCEPTION 'Duplicate receipt differs'; END IF;
 BEGIN
  PERFORM sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','hold','dedupe',1,1,NULL);
  RAISE EXCEPTION 'Changed request reused an idempotency key';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','hold','hold-1',1,1,NULL);
DO $$ BEGIN
 BEGIN
  PERFORM sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','resume','resume-too-soon',1,2,NULL);
  RAISE EXCEPTION 'Resume overtook settlement';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF EXISTS(SELECT 1 FROM sophia.outbox WHERE NOT cleanup AND state='pending') THEN RAISE EXCEPTION 'Hold left unsent normal work pending'; END IF;
END $$;
RESET ROLE;
UPDATE sophia.project_members SET active=false WHERE project_id='10000000-0000-0000-0000-000000000001' AND actor_id='00000000-0000-0000-0000-000000000002';
SET LOCAL ROLE sophia_api;
DO $$ BEGIN
 BEGIN
  PERFORM sophia.admit_goal_command('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','request_review','dedupe',1,1,NULL);
  RAISE EXCEPTION 'Revoked membership recovered a receipt';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
