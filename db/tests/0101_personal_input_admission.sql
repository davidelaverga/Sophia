-- INC03-CC-003 A1 (0101): Personal Answer admission at the SQL boundary. Run against a disposable database with every
-- migration installed (pnpm test:sql). Never use production. Everything below rolls back. Profiles and payers are
-- synthetic: no key, provider or model exists here.
-- * Send decides at once: admitted (the turn becomes pending, asked_at = admitted_at) when the profile's payer is
--   admitted for the owner, otherwise waiting (the turn stays recorded). A replay is the remembered receipt.
-- * Retry and cancel name the seq they expect; a stale seq is 40001, a decided or record-only input 55000.
-- * Decisions are append-only; the profile is closed and for the calling owner only; sophia_api writes nothing directly.
BEGIN;
-- The synthetic payer this owner is admitted for, written as the migration owner (as an operator would).
INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros)
 VALUES('sql-101-payer','00000000-0000-0000-0000-00000000101a',1000);
CREATE TEMP TABLE p101 ON COMMIT DROP AS SELECT jsonb_build_object('version',1,
 'owner','00000000-0000-0000-0000-00000000101a','payer','sql-101-payer','routeId','sql-101-route',
 'roleDigest','sha256:'||repeat('a',64),'provider','sql-101-provider','model','synthetic-model',
 'reasoningEffort',NULL,'maxTokens',256,
 'prices',jsonb_build_object('input',1,'cacheRead',0,'cacheWrite',0,'output',2)) AS admitted;
GRANT SELECT ON p101 TO sophia_api;
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000101a',true);

-- Admitted at send: one decision, the turn pending since the decision, the input itself unchanged.
DO $$ DECLARE r jsonb; d jsonb; t sophia.personal_turns; BEGIN
 r:=sophia.send_personal_answer_input('sql-101-1','personal_answer_v1',0,'Answer me',(SELECT admitted FROM p101));
 d:=r->'decision';
 IF r->>'operation'<>'send_answer_input' OR r->>'answerContract'<>'personal_answer_v1'
  OR r->>'interactionContract'<>'automatic_v1' OR r ? 'profile' OR d ? 'profile' THEN
  RAISE EXCEPTION 'Receipt wrong: %', r; END IF;
 IF d->>'seq'<>'1' OR d->>'operation'<>'send' OR d->>'outcome'<>'admitted' OR d->'reason'<>'null'::jsonb
  OR d->>'late'<>'false' OR d->>'admittedAt' IS NULL THEN RAISE EXCEPTION 'Decision wrong: %', d; END IF;
 SELECT * INTO t FROM sophia.personal_turns WHERE id=(r->>'turnId')::uuid;
 IF t.reply<>'pending' OR t.asked_at<>(SELECT admitted_at FROM sophia.personal_input_decisions
   WHERE input_id=(r->>'inputId')::uuid) OR sophia.next_personal_reply()<>t.id THEN
  RAISE EXCEPTION 'The admitted turn is not the pending one: %', row_to_json(t); END IF;
 IF (SELECT state FROM sophia.personal_inputs WHERE id=(r->>'inputId')::uuid)<>'recorded' THEN
  RAISE EXCEPTION 'The input record changed'; END IF;
 IF sophia.send_personal_answer_input('sql-101-1','personal_answer_v1',0,'Answer me',(SELECT admitted FROM p101))<>r THEN
  RAISE EXCEPTION 'Replay is not the remembered receipt'; END IF;
END $$;

-- Waiting at send (no payer admission for this payer); retry names its seq; cancel is terminal.
DO $$ DECLARE w jsonb; r2 jsonb; c jsonb; prof jsonb:=(SELECT admitted||'{"payer":"sql-101-none"}' FROM p101); BEGIN
 w:=sophia.send_personal_answer_input('sql-101-w','personal_answer_v1',0,'Later',prof);
 IF w->'decision'->>'outcome'<>'waiting' OR w->'decision'->>'reason'<>'payer_unavailable'
  OR w->'decision'->'admittedAt'<>'null'::jsonb
  OR (SELECT reply FROM sophia.personal_turns WHERE id=(w->>'turnId')::uuid)<>'recorded' THEN
  RAISE EXCEPTION 'Waiting wrong: %', w; END IF;
 BEGIN
  PERFORM sophia.retry_personal_answer_input('sql-101-r0',(w->>'inputId')::uuid,2,0,prof);
  RAISE EXCEPTION 'A stale expected seq was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 r2:=sophia.retry_personal_answer_input('sql-101-r1',(w->>'inputId')::uuid,1,0,prof);
 IF r2->'decision'->>'seq'<>'2' OR r2->'decision'->>'outcome'<>'waiting' OR r2->>'operation'<>'retry_answer_input' THEN
  RAISE EXCEPTION 'Retry wrong: %', r2; END IF;
 c:=sophia.cancel_personal_answer_input('sql-101-c1',(w->>'inputId')::uuid,2,0);
 IF c->'decision'->>'seq'<>'3' OR c->'decision'->>'outcome'<>'cancelled'
  OR c->'decision'->>'reason'<>'cancelled_by_owner'
  OR (SELECT reply FROM sophia.personal_turns WHERE id=(w->>'turnId')::uuid)<>'recorded' THEN
  RAISE EXCEPTION 'Cancel wrong: %', c; END IF;
 IF sophia.retry_personal_answer_input('sql-101-r1',(w->>'inputId')::uuid,1,0,prof)<>r2
  OR sophia.send_personal_answer_input('sql-101-w','personal_answer_v1',0,'Later',prof)<>w THEN
  RAISE EXCEPTION 'A replay after later decisions is not its own receipt'; END IF;
 BEGIN
  PERFORM sophia.retry_personal_answer_input('sql-101-r2',(w->>'inputId')::uuid,3,0,prof);
  RAISE EXCEPTION 'A cancelled input was retried';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;

-- A record-only input (0098) has no decision and can never be retried into an answer; keys never cross operations.
DO $$ DECLARE h jsonb; BEGIN
 h:=sophia.send_personal_input('sql-101-h','automatic_v1',0,'Held only');
 BEGIN
  PERFORM sophia.retry_personal_answer_input('sql-101-hr',(h->>'inputId')::uuid,1,0,(SELECT admitted FROM p101));
  RAISE EXCEPTION 'A record-only input was retried';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN
  PERFORM sophia.send_personal_answer_input('sql-101-h','personal_answer_v1',0,'Held only',(SELECT admitted FROM p101));
  RAISE EXCEPTION 'A record-only key was reused by the Answer operation';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM sophia.send_personal_input('sql-101-1','automatic_v1',0,'Answer me');
  RAISE EXCEPTION 'An Answer key was reused by the record-only operation';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM sophia.send_personal_answer_input('sql-101-x','automatic_v1',0,'x',(SELECT admitted FROM p101));
  RAISE EXCEPTION 'The old contract name was accepted by the Answer operation';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

-- The profile: closed, for the calling owner only; nothing is written when it is refused.
DO $$ DECLARE n bigint:=(SELECT count(*) FROM sophia.personal_turns); bad jsonb; BEGIN
 FOREACH bad IN ARRAY ARRAY[NULL::jsonb,'[]'::jsonb,(SELECT admitted-'owner' FROM p101),
  (SELECT admitted||'{"extra":1}' FROM p101),(SELECT admitted||'{"maxTokens":0}' FROM p101),
  (SELECT admitted||'{"maxTokens":"256"}' FROM p101),(SELECT admitted||'{"maxTokens":1.5}' FROM p101),
  (SELECT admitted||'{"owner":"00000000-0000-0000-0000-00000000101A"}' FROM p101),
  (SELECT admitted||'{"prices":{"input":1}}' FROM p101)] LOOP
  BEGIN
   PERFORM sophia.send_personal_answer_input('sql-101-bad','personal_answer_v1',0,'x',bad);
   RAISE EXCEPTION 'A malformed profile was accepted: %', bad;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM sophia.send_personal_answer_input('sql-101-bad','personal_answer_v1',0,'x',
   (SELECT admitted||'{"owner":"00000000-0000-0000-0000-00000000101b"}' FROM p101));
  RAISE EXCEPTION 'Another owner''s profile was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM sophia.personal_turns)<>n THEN RAISE EXCEPTION 'A refused profile wrote a turn'; END IF;
END $$;

-- Prices are JavaScript-finite (A1-LOCAL-F01): 1e400 reads Infinity in JavaScript and is refused at every price key,
-- by send and by retry, writing nothing; the largest finite double is accepted.
DO $$ DECLARE k text; n bigint; w jsonb; d bigint; s sophia.personal_spaces; BEGIN
 w:=sophia.send_personal_answer_input('sql-101-pw','personal_answer_v1',0,'Price',
  (SELECT admitted||'{"payer":"sql-101-none"}' FROM p101));
 FOREACH k IN ARRAY ARRAY['input','cacheRead','cacheWrite','output'] LOOP
  n:=(SELECT count(*) FROM sophia.personal_turns); d:=(SELECT count(*) FROM sophia.personal_input_decisions);
  SELECT * INTO s FROM sophia.personal_spaces WHERE owner_id='00000000-0000-0000-0000-00000000101a';
  BEGIN
   PERFORM sophia.send_personal_answer_input('sql-101-inf-'||k,'personal_answer_v1',0,'x',
    (SELECT jsonb_set(admitted,ARRAY['prices',k],'1e400'::jsonb) FROM p101));
   RAISE EXCEPTION 'A send with %=1e400 was accepted', k;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
   PERFORM sophia.retry_personal_answer_input('sql-101-infr-'||k,(w->>'inputId')::uuid,1,0,
    (SELECT jsonb_set(admitted,ARRAY['prices',k],'1e400'::jsonb) FROM p101));
   RAISE EXCEPTION 'A retry with %=1e400 was accepted', k;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT count(*) FROM sophia.personal_turns)<>n OR (SELECT count(*) FROM sophia.personal_input_decisions)<>d
   OR (SELECT row(revision,turn_seq) FROM sophia.personal_spaces WHERE owner_id=s.owner_id)<>row(s.revision,s.turn_seq) THEN
   RAISE EXCEPTION 'A refused price at % wrote something', k; END IF;
  PERFORM sophia.send_personal_answer_input('sql-101-max-'||k,'personal_answer_v1',0,'x',
   (SELECT jsonb_set(admitted,ARRAY['prices',k],'1.7976931348623157e308'::jsonb) FROM p101));
 END LOOP;
END $$;

-- sophia_api: no direct write to the decisions, no internal helper.
DO $$ DECLARE s text; BEGIN
 FOREACH s IN ARRAY ARRAY['DELETE FROM sophia.personal_input_decisions',
  'UPDATE sophia.personal_input_decisions SET late=true',
  'SELECT sophia.personal_answer_profile(''{}''::jsonb)'] LOOP
  BEGIN
   EXECUTE s;
   RAISE EXCEPTION 'sophia_api could run: %', s;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;

-- As the table owner: a decision is never changed, nor removed except by the erasure's cascade.
RESET ROLE;
DO $$ BEGIN
 BEGIN
  UPDATE sophia.personal_input_decisions SET late=NOT late;
  RAISE EXCEPTION 'A decision was changed';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN
  DELETE FROM sophia.personal_input_decisions;
  RAISE EXCEPTION 'A decision was removed directly';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 IF has_function_privilege('sophia_worker','sophia.send_personal_answer_input(text,text,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('public','sophia.cancel_personal_answer_input(text,uuid,integer,bigint)','EXECUTE')
  OR NOT has_function_privilege('sophia_api','sophia.retry_personal_answer_input(text,uuid,integer,bigint,jsonb)','EXECUTE')
  OR has_table_privilege('sophia_api','sophia.personal_input_decisions','INSERT') THEN
  RAISE EXCEPTION 'Grants wrong'; END IF;
END $$;
SET LOCAL ROLE sophia_api;
SELECT set_config('sophia.actor_id','00000000-0000-0000-0000-00000000101a',true);
DO $$ BEGIN
 PERFORM sophia.erase_personal_space('sql-101-erase','delete');
 IF (SELECT count(*) FROM sophia.personal_input_decisions)<>0 OR (SELECT count(*) FROM sophia.personal_inputs)<>0 THEN
  RAISE EXCEPTION 'Erasure left decisions or inputs'; END IF;
 BEGIN
  PERFORM sophia.send_personal_answer_input('sql-101-1','personal_answer_v1',1,'Answer me',(SELECT admitted FROM p101));
  RAISE EXCEPTION 'An erased key came back';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
ROLLBACK;
