-- A09: typed and voice turns use the same permission, consent, source and confirmation paths.
-- The bridge supplies inputMode outside model arguments. Older bridges omit it and remain voice.
-- Applied migrations stay immutable. New text-origin data requires the A09 reader during recovery.
BEGIN;
ALTER TABLE sophia.mission_entries
 DROP CONSTRAINT mission_entries_origin_check,
 DROP CONSTRAINT mission_entries_check,
 DROP CONSTRAINT mission_entries_check1,
 ADD CONSTRAINT mission_entries_origin_check CHECK(origin IN ('voice','text','studio')),
 ADD CONSTRAINT mission_entries_turn_check CHECK((origin IN ('voice','text'))=(exchange_id IS NOT NULL AND input_epoch IS NOT NULL)),
 ADD CONSTRAINT mission_entries_author_check CHECK((origin IN ('voice','text'))=(authored_by='sophia'));
ALTER TABLE sophia.decisions
 DROP CONSTRAINT decisions_origin_check,
 DROP CONSTRAINT decisions_decided_via_check,
 DROP CONSTRAINT decisions_voice_turn,
 ADD CONSTRAINT decisions_origin_check CHECK(origin IS NULL OR origin IN ('voice','text','studio')),
 ADD CONSTRAINT decisions_decided_via_check CHECK(decided_via IS NULL OR decided_via IN ('voice','text','studio')),
 ADD CONSTRAINT decisions_turn_check CHECK((origin IN ('voice','text'))=(exchange_id IS NOT NULL AND input_epoch IS NOT NULL));
CREATE FUNCTION sophia.mission_turn_origin(p_turn jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
BEGIN
 IF p_turn IS NULL THEN RETURN 'studio'; END IF;
 IF p_turn ? 'inputMode' AND p_turn->>'inputMode' IS DISTINCT FROM 'text' AND p_turn->>'inputMode' IS DISTINCT FROM 'voice'
  THEN RAISE EXCEPTION 'Invalid turn input mode' USING ERRCODE='22023'; END IF;
 RETURN coalesce(p_turn->>'inputMode','voice');
END $$;
REVOKE ALL ON FUNCTION sophia.mission_turn_origin(jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION sophia.record_mission_entry(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); body text; semantic jsonb; prior jsonb; turn jsonb:=p_request->'turn';
 corrects sophia.mission_entries; src sophia.source_objects; eid uuid:=gen_random_uuid(); receipt_value jsonb;
 observed timestamptz; related uuid:=(p_request->>'relatedEntryId')::uuid; goal uuid:=(p_request->>'goalId')::uuid;
 decision uuid:=(p_request->>'decisionId')::uuid; corrects_id uuid:=(p_request->>'correctsEntryId')::uuid;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_request->>'kind' IS NULL OR p_request->>'kind' NOT IN ('observation','expectation','outcome','blocker','explanation','lesson_candidate','continuity') THEN
  RAISE EXCEPTION 'Invalid note kind' USING ERRCODE='22023'; END IF;
 IF p_request->>'epistemic' IS NULL OR p_request->>'epistemic' NOT IN ('reported','observed','inferred') THEN
  RAISE EXCEPTION 'Invalid epistemic status' USING ERRCODE='22023'; END IF;
 body:=sophia.mission_text(p_request->'text',2000,true);
 observed:=CASE WHEN turn IS NULL AND p_request ? 'observedAt' AND jsonb_typeof(p_request->'observedAt')='string'
  THEN (p_request->>'observedAt')::timestamptz ELSE now() END;
 IF observed>now()+interval '1 minute' THEN RAISE EXCEPTION 'An observation cannot be in the future' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind',p_request->'kind','epistemic',p_request->'epistemic','text',encode(sha256(convert_to(body,'UTF8')),'hex'),
  'relatedEntryId',related,'goalId',goal,'decisionId',decision,'correctsEntryId',corrects_id,
  'observedAt',CASE WHEN turn IS NULL THEN p_request->'observedAt' END,'turn',turn);
 prior:=sophia.mission_prior(p_project,p_key,'record_note',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF turn IS NOT NULL THEN
  PERFORM sophia.mission_turn(p_project,turn);
  IF sophia.mission_capture(p_project)<>'automatic' THEN
   RAISE EXCEPTION 'Note capture is off for this project' USING ERRCODE='42501'; END IF;
  IF sophia.mission_consent(p_project)<>'accepted' THEN
   RAISE EXCEPTION 'Consent to keep notes from this speaker is not given' USING ERRCODE='42501'; END IF;
 END IF;
 IF related IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.mission_entries WHERE project_id=p_project AND id=related AND state<>'withdrawn') THEN
  RAISE EXCEPTION 'Related note not found' USING ERRCODE='22023'; END IF;
 IF goal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.goals WHERE project_id=p_project AND id=goal) THEN
  RAISE EXCEPTION 'Goal not found' USING ERRCODE='22023'; END IF;
 IF decision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.decisions WHERE project_id=p_project AND id=decision) THEN
  RAISE EXCEPTION 'Decision not found' USING ERRCODE='22023'; END IF;
 IF corrects_id IS NOT NULL THEN
  SELECT * INTO corrects FROM sophia.mission_entries WHERE project_id=p_project AND id=corrects_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='22023'; END IF;
  IF corrects.state<>'current' THEN RAISE EXCEPTION 'Stale note: it is already %', corrects.state USING ERRCODE='40001'; END IF;
  -- A correction keeps what the note was about: its links carry over unless the correction names its own.
  related:=coalesce(related,corrects.related_entry_id); goal:=coalesce(goal,corrects.goal_id);
  decision:=coalesce(decision,corrects.decision_id);
 END IF;
 src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',body);
 IF corrects_id IS NOT NULL THEN
  UPDATE sophia.mission_entries SET state='superseded', changed_by=a, changed_at=now() WHERE project_id=p_project AND id=corrects_id;
  INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES(p_project,corrects.source_id,src.id);
 END IF;
 receipt_value:=sophia.mission_commit(p_project,CASE WHEN corrects_id IS NULL THEN 'mission.entry_recorded' ELSE 'mission.entry_corrected' END,
  'mission_entry',eid,'mission.entry_'||(p_request->>'kind'));
 INSERT INTO sophia.mission_entries(project_id,id,kind,epistemic,source_id,authored_by,actor_id,origin,exchange_id,input_epoch,
  related_entry_id,supersedes_entry_id,goal_id,decision_id,ledger_revision,observed_at)
 VALUES(p_project,eid,p_request->>'kind',p_request->>'epistemic',src.id,CASE WHEN turn IS NULL THEN 'member' ELSE 'sophia' END,a,
  sophia.mission_turn_origin(turn),(turn->>'exchangeId')::uuid,(turn->>'inputEpoch')::bigint,
  related,corrects_id,goal,decision,(receipt_value->>'ledgerRevision')::bigint,observed);
 receipt_value:=receipt_value||jsonb_build_object('status','committed','operation',CASE WHEN corrects_id IS NULL THEN 'record_note' ELSE 'correct_note' END,
  'entryId',eid,'decisionId',NULL,'decisionRevision',NULL,'decision',NULL,'sourceId',src.id,'sha256',src.sha256,
  'affected',CASE WHEN corrects_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(corrects_id) END);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'record_note',semantic,receipt_value);
 RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION sophia.propose_mission_change(p_project uuid, p_key text, p_request jsonb) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); kind text:=p_request->>'kind'; turn jsonb:=p_request->'turn'; proposal jsonb; semantic jsonb;
 prior jsonb; pr sophia.projects; src sophia.source_objects; did uuid:=gen_random_uuid(); d sophia.decisions; receipt_value jsonb;
 supersedes uuid:=(p_request->>'supersedesDecisionId')::uuid; supporting uuid[]; cited uuid[]; bad uuid;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF kind IS NULL OR kind NOT IN ('mission','constraint','lesson') THEN RAISE EXCEPTION 'Invalid proposal kind' USING ERRCODE='22023'; END IF;
 proposal:=jsonb_strip_nulls(jsonb_build_object('statement',sophia.mission_text(p_request->'statement',2000,true),
  'purpose',sophia.mission_text(p_request->'purpose',1000,false),'destination',sophia.mission_text(p_request->'destination',1000,false),
  'origin',sophia.mission_text(p_request->'origin',1000,false)));
 SELECT coalesce(array_agg(DISTINCT v::uuid),'{}') INTO supporting FROM jsonb_array_elements_text(coalesce(p_request->'supportingEntryIds','[]')) AS x(v);
 IF cardinality(supporting)>8 THEN RAISE EXCEPTION 'At most 8 supporting notes' USING ERRCODE='22023'; END IF;
 SELECT * INTO pr FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('kind',kind,'proposal',encode(sha256(convert_to(proposal::text,'UTF8')),'hex'),
  'supersedesDecisionId',supersedes,'supportingEntryIds',to_jsonb((SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM unnest(supporting) x)),'turn',turn);
 prior:=sophia.mission_prior(p_project,p_key,'propose',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF turn IS NOT NULL THEN
  PERFORM sophia.mission_turn(p_project,turn);
  IF sophia.mission_consent(p_project)<>'accepted' THEN
   RAISE EXCEPTION 'Consent to keep proposals from this speaker is not given' USING ERRCODE='42501'; END IF;
 END IF;
 -- A proposal replaces only an accepted decision of its own kind: a constraint or a lesson never retires the mission,
 -- whose projection only a mission acceptance moves.
 IF supersedes IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sophia.decisions s WHERE s.project_id=p_project AND s.id=supersedes
   AND s.state='accepted' AND s.kind=(p_request->>'kind')) THEN
  RAISE EXCEPTION 'A proposal can replace only an accepted decision of its own kind' USING ERRCODE='22023'; END IF;
 SELECT x INTO bad FROM unnest(supporting) x WHERE NOT EXISTS(
  SELECT 1 FROM sophia.mission_entries e WHERE e.project_id=p_project AND e.id=x AND e.state<>'withdrawn') LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Supporting note not found' USING ERRCODE='22023'; END IF;
 -- It cites the notes it names, and every note whose words one of its fields repeats, named or not (mission_repeats):
 -- forgetting any of them forgets it too. A run split across two fields is not a repeat, and a paraphrase that names
 -- nothing cites nothing.
 SELECT supporting||coalesce(array_agg(e.id ORDER BY e.recorded_at),'{}') INTO cited
  FROM sophia.mission_entries e JOIN sophia.source_texts t ON t.project_id=e.project_id AND t.source_id=e.source_id
  WHERE e.project_id=p_project AND e.state<>'withdrawn' AND NOT e.id=ANY(supporting)
   AND (sophia.mission_repeats(t.body,proposal->>'statement') OR sophia.mission_repeats(t.body,proposal->>'purpose')
    OR sophia.mission_repeats(t.body,proposal->>'destination') OR sophia.mission_repeats(t.body,proposal->>'origin'));
 IF cardinality(cited)>64 THEN RAISE EXCEPTION 'A proposal can rest on at most 64 notes' USING ERRCODE='22023'; END IF;
 src:=sophia.put_text_source(p_project,a,'text/plain; charset=utf-8',sophia.proposal_text(kind,proposal));
 INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id)
  SELECT p_project,e.source_id,src.id FROM sophia.mission_entries e WHERE e.project_id=p_project AND e.id=ANY(cited);
 receipt_value:=sophia.mission_commit(p_project,'mission.proposal_created','decision',did,'mission.proposal_'||kind);
 INSERT INTO sophia.decisions(project_id,id,revision,kind,state,body_source_id,proposal,proposed_by,origin,exchange_id,input_epoch,
  base_mission_revision,supersedes_decision_id,supporting_entry_ids,ledger_revision)
 VALUES(p_project,did,1,kind,'proposed',src.id,proposal,a,sophia.mission_turn_origin(turn),
  (turn->>'exchangeId')::uuid,(turn->>'inputEpoch')::bigint,CASE WHEN kind='mission' THEN pr.mission_revision END,supersedes,cited,
  (receipt_value->>'ledgerRevision')::bigint) RETURNING * INTO d;
 IF turn IS NOT NULL THEN PERFORM sophia.mission_present(p_project,d,turn); END IF;
 receipt_value:=receipt_value||jsonb_build_object('status','proposed','operation','propose','entryId',NULL,'decisionId',did,
  'decisionRevision',1,'decision',NULL,'sourceId',src.id,'sha256',src.sha256,'affected','[]'::jsonb);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'propose',semantic,receipt_value);
 RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION sophia.decide_mission_change(p_project uuid, p_decision uuid, p_key text, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $$
DECLARE a uuid:=sophia.actor_id(); choice text:=p_request->>'decision'; turn jsonb:=p_request->'turn'; semantic jsonb; prior jsonb;
 d sophia.decisions; affected jsonb:='[]'; receipt_value jsonb;
BEGIN
 IF a IS NULL OR NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF choice IS NULL OR choice NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_request->'expectedRevision')<>'number' THEN RAISE EXCEPTION 'Missing expected revision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM sophia.projects WHERE id=p_project FOR UPDATE;
 IF NOT sophia.can_edit(p_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 semantic:=jsonb_build_object('decisionId',p_decision,'decision',choice,'expectedRevision',p_request->'expectedRevision','turn',turn);
 prior:=sophia.mission_prior(p_project,p_key,'decide',semantic);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO d FROM sophia.decisions WHERE project_id=p_project AND id=p_decision FOR UPDATE;
 -- A withdrawn proposal's content is erased; it is still that proposal, and deciding it is stale.
 IF NOT FOUND OR (d.proposal IS NULL AND d.state<>'withdrawn') THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE='22023'; END IF;
 IF d.state<>'proposed' THEN RAISE EXCEPTION 'Stale proposal: it is already %', d.state USING ERRCODE='40001'; END IF;
 IF d.revision<>(p_request->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'Stale proposal revision' USING ERRCODE='40001'; END IF;
 IF turn IS NOT NULL THEN PERFORM sophia.mission_bound(p_project,d,turn); END IF;
 IF choice='accept' THEN affected:=sophia.mission_accept(p_project,d); END IF;
 UPDATE sophia.decisions SET state=CASE choice WHEN 'accept' THEN 'accepted' ELSE 'rejected' END, revision=revision+1,
  accepted_by=CASE choice WHEN 'accept' THEN a END, decided_by=a, decided_at=now(),
  decided_via=sophia.mission_turn_origin(turn)
  WHERE project_id=p_project AND id=p_decision RETURNING * INTO d;
 DELETE FROM sophia.mission_confirmation_targets WHERE project_id=p_project AND decision_id=p_decision;
 receipt_value:=sophia.mission_commit(p_project,'mission.decision_'||d.state,'decision',d.id,'mission.'||d.kind||'_'||d.state);
 receipt_value:=receipt_value||jsonb_build_object('status','committed','operation','decide','entryId',NULL,'decisionId',d.id,
  'decisionRevision',d.revision,'decision',d.state,'sourceId',d.body_source_id,'sha256',NULL,'affected',affected);
 INSERT INTO sophia.mission_requests(project_id,actor_id,idempotency_key,operation,semantic_request,receipt)
 VALUES(p_project,a,p_key,'decide',semantic,receipt_value);
 RETURN receipt_value;
END $$;
COMMIT;
