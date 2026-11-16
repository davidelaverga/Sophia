-- INC04-R07-C2-DIMENSION-BOUNDS-CORE-001 (0113), sql-run on real PostgreSQL: the C2 codec in SQL equals the frozen
-- TypeScript fixtures; the dedicated operator custody, the derived lifecycle and native-unit policy caps; the replaced
-- request parser; privileges. Every authority, profile, policy and digest here is SYNTHETIC; nothing is a real owner
-- approval, route qualification or live provider fact. The reserve/apply/claim/settle paths need a runtime world and are
-- exercised by packages/persistence/src/research-dimension-bounds.db.test.ts. The file rolls back.
BEGIN;

-- A. Codec parity with the frozen synthetic fixtures (packages/domain/src/research-dimension-bounds.fixtures.json):
--    every positive identity (canonical byte length and sha256), every refusal code, every helper identity.
DO $$ DECLARE v text[]; got text; BEGIN
 v:=sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.profile.register.v1',v))=740 AND sophia.research_c2_digest('sophia.c2.bound.profile.register.v1',v)='9bb80d50910dd5f5f216b65990c78fb06b6215aafdea10c96879e23c0464eeb6', 'positive profile-output';
 v:=sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.model_requests","unit":"requests","enforcement_kind":"dispatch_count","param_name":null,"max_ceiling":"1","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.profile.register.v1',v))=717 AND sophia.research_c2_digest('sophia.c2.bound.profile.register.v1',v)='a1642654b99fb91bb3d842485bb8a0473676802d40a38c8eaca8d18728d06dc1', 'positive profile-requests';
 v:=sophia.research_c2_payload('sophia.c2.bound.profile.event.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","event_key":"activate-1","event_kind":"activate","target_event_digest":null,"reason_code":"qualified","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","cause_ref_digest":null,"evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.profile.event.v1',v))=324 AND sophia.research_c2_digest('sophia.c2.bound.profile.event.v1',v)='664e387ce25528b3d3451171818acea56e3c7a69228b136a1e4cbbe08fe5b9e5', 'positive event-activate';
 v:=sophia.research_c2_payload('sophia.c2.bound.profile.event.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","event_key":"unhold-1","event_kind":"unhold","target_event_digest":"1111111111111111111111111111111111111111111111111111111111111111","reason_code":"qualified","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","cause_ref_digest":null,"evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.profile.event.v1',v))=386 AND sophia.research_c2_digest('sophia.c2.bound.profile.event.v1',v)='f28249183ba483a13bd303d9579e2ac0069dbff3443a511709e9c954425b0ce7', 'positive event-unhold';
 v:=sophia.research_c2_payload('sophia.c2.bound.profile.event.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","event_key":"k4:2222222222222222222222222222222222222222222222222222222222222222","event_kind":"auto_hold","target_event_digest":null,"reason_code":"bound_contradicted","authority_id":null,"approval_ref_digest":null,"cause_ref_digest":"2222222222222222222222222222222222222222222222222222222222222222","evidence_digest":"2222222222222222222222222222222222222222222222222222222222222222"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.profile.event.v1',v))=353 AND sophia.research_c2_digest('sophia.c2.bound.profile.event.v1',v)='de450fc0ca44d536a3ede65a1eb42686fe73e26170018840cd1cae7e62f3f2c2', 'positive event-auto-hold';
 v:=sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","unit":"tokens","cap":"8000","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.policy.register.v1',v))=355 AND sophia.research_c2_digest('sophia.c2.bound.policy.register.v1',v)='0f9f16314606748b10c920118e876ce04a6fa0b0f814c19f6da533dfefbf39e3', 'positive policy';
 v:=sophia.research_c2_payload('sophia.c2.bound.policy.event.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","event_key":"activate-1","event_kind":"activate","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.policy.event.v1',v))=284 AND sophia.research_c2_digest('sophia.c2.bound.policy.event.v1',v)='ed444684f9e70707624d395a392d0712fe7fb3ef04dd5b42112d96f0d2e54244', 'positive policy-event';
 v:=sophia.research_c2_payload('sophia.c2.bound.authorize.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","dimension":"openai.output_tokens","unit":"tokens","bound_kind":"authorized","bound":"8000","enforcement_kind":"output_parameter","profile_id":"00000000-0000-4000-8000-000000000001","profile_revision":"1","policy_set_digest":"3333333333333333333333333333333333333333333333333333333333333333","unsupported_reason":null,"original_runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.authorize.v1',v))=561 AND sophia.research_c2_digest('sophia.c2.bound.authorize.v1',v)='649cf9939aebcabc23f02bc2833f38633b3ce79bbf8960b12888200c3b288aa5', 'positive authorize-authorized';
 v:=sophia.research_c2_payload('sophia.c2.bound.authorize.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","dimension":"openai.input_tokens","unit":"tokens","bound_kind":"unsupported","bound":null,"enforcement_kind":null,"profile_id":null,"profile_revision":null,"policy_set_digest":null,"unsupported_reason":"input_estimate_only","original_runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":null,"route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.bound.authorize.v1',v))=382 AND sophia.research_c2_digest('sophia.c2.bound.authorize.v1',v)='3423e2c48d03f858cd78acbed190add04a239683b6eb0a6596a1765a36fce8a4', 'positive authorize-unsupported';
 v:=sophia.research_c2_payload('sophia.c2.dispatch.apply.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","attempt_id":"00000000-0000-4000-8000-000000000010","call_id":"call-1","runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","outbound_params_digest":"5555555555555555555555555555555555555555555555555555555555555555","authorize_set_digest":"6666666666666666666666666666666666666666666666666666666666666666"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.dispatch.apply.v1',v))=517 AND sophia.research_c2_digest('sophia.c2.dispatch.apply.v1',v)='64047420bf625157dae0a1cab46203f0725c09397843119bf6fa0bcf785c80bb', 'positive apply';
 v:=sophia.research_c2_payload('sophia.c2.dispatch.claim.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":null,"apply_receipt_digest":"7777777777777777777777777777777777777777777777777777777777777777"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.dispatch.claim.v1',v))=264 AND sophia.research_c2_digest('sophia.c2.dispatch.claim.v1',v)='70731092e8f72bf3c7043f439dafa24593507f15767db3561ddb749335bb45db', 'positive claim-null-generation';
 v:=sophia.research_c2_payload('sophia.c2.dispatch.outcome.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","outcome_kind":"sent","evidence_digest":"8888888888888888888888888888888888888888888888888888888888888888","observed_at":"2026-11-16T06:00:00.000000Z"}'::jsonb);
 ASSERT octet_length(sophia.research_c2_frame('sophia.c2.dispatch.outcome.v1',v))=263 AND sophia.research_c2_digest('sophia.c2.dispatch.outcome.v1',v)='dc427258ac1678225191dd70d0d6547315f505ee3e1c95f80116c0694ce492ff', 'positive outcome';
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_incomplete', 'refusal missing-key (key-set)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"x","dimension":"openai.output_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_incomplete', 'refusal missing-key-before-grammar (key-set)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.dispatch.apply.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","attempt_id":"00000000-0000-4000-8000-000000000010","call_id":"call-1","runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","outbound_params_digest":"5555555555555555555555555555555555555555555555555555555555555555","authorize_set_digest":"6666666666666666666666666666666666666666666666666666666666666666","sdk_retries":"0"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal extra-key (key-set)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.dispatch.apply.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","attempt_id":"00000000-0000-4000-8000-000000000010","call_id":"call-1","runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","outbound_params_digest":"5555555555555555555555555555555555555555555555555555555555555555","authorize_set_digest":"6666666666666666666666666666666666666666666666666666666666666666","single_send":"true"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal supplied-single-send-flag (key-set)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":null,"settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal null-not-nullable (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","unit":"tokens","cap":8000,"authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal json-number-int (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.dispatch.claim.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","runtime_id":"ABCDEF00-0000-4000-8000-000000000009","original_generation":null,"apply_receipt_digest":"7777777777777777777777777777777777777777777777777777777777777777"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal uppercase-uuid (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","unit":"tokens","cap":"2147483648","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal int-over-2147483647 (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.dispatch.outcome.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","outcome_kind":"sent","evidence_digest":"8888888888888888888888888888888888888888888888888888888888888888","observed_at":"2026-02-30T00:00:00.000000Z"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal calendar-feb-30 (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.dispatch.outcome.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","outcome_kind":"sent","evidence_digest":"8888888888888888888888888888888888888888888888888888888888888888","observed_at":"2026-11-16T24:00:00.000000Z"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal calendar-hour-24 (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.dispatch.outcome.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","outcome_kind":"sent","evidence_digest":"8888888888888888888888888888888888888888888888888888888888888888","observed_at":"2026-13-01T00:00:00.000000Z"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal calendar-month-13 (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","unit":"usd","cap":"08000","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal grammar-before-cross (grammar)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","unit":"usd","cap":"8000","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='bound_policy_unit_mismatch', 'refusal policy-usd (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.output_tokens","unit":"tokens","cap":"0","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='bound_invalid', 'refusal policy-cap-zero (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.policy.register.v1','{"policy_id":"00000000-0000-4000-8000-000000000004","revision":"1","scope_kind":"allowance","scope_ref":"00000000-0000-4000-8000-000000000005","dimension":"openai.input_tokens","unit":"tokens","cap":"8000","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='bound_dimension_unsupported', 'refusal policy-input-dimension (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"0","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='bound_invalid', 'refusal profile-ceiling-zero (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.input_cached_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='bound_dimension_unsupported', 'refusal profile-input-dimension (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","unit":"tokens","enforcement_kind":"output_parameter","param_name":null,"max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal output-parameter-null-param (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.model_requests","unit":"requests","enforcement_kind":"dispatch_count","param_name":"n","max_ceiling":"1","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal dispatch-count-with-param (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.model_requests","unit":"requests","enforcement_kind":"dispatch_count","param_name":null,"max_ceiling":"2","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal dispatch-count-ceiling-2 (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.register.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","unit":"requests","enforcement_kind":"output_parameter","param_name":"max_output_tokens","max_ceiling":"16000","provider":"openai-research","route_id":"research-sol-medium-v1","endpoint":"responses","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","emitter_identity_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","semantics_evidence_digest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","isolation_evidence_digest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","scope_kind":"project","scope_ref":"00000000-0000-4000-8000-000000000002","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal unit-mismatch (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.authorize.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","dimension":"openai.input_tokens","unit":"tokens","bound_kind":"unsupported","bound":"1","enforcement_kind":null,"profile_id":null,"profile_revision":null,"policy_set_digest":null,"unsupported_reason":"input_estimate_only","original_runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":null,"route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal unsupported-with-bound (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.authorize.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","dimension":"openai.input_tokens","unit":"tokens","bound_kind":"authorized","bound":"8000","enforcement_kind":"output_parameter","profile_id":"00000000-0000-4000-8000-000000000001","profile_revision":"1","policy_set_digest":"3333333333333333333333333333333333333333333333333333333333333333","unsupported_reason":null,"original_runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal authorized-input-dimension (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.authorize.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","dimension":"openai.input_tokens","unit":"tokens","bound_kind":"authorized","bound":"1","enforcement_kind":"dispatch_count","profile_id":"00000000-0000-4000-8000-000000000001","profile_revision":"1","policy_set_digest":"3333333333333333333333333333333333333333333333333333333333333333","unsupported_reason":null,"original_runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal authorized-input-as-dispatch-count (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.authorize.v1','{"project_id":"00000000-0000-4000-8000-000000000006","reservation_id":"00000000-0000-4000-8000-000000000007","dispatch_id":"00000000-0000-4000-8000-000000000008","dimension":"openai.model_requests","unit":"requests","bound_kind":"authorized","bound":"2","enforcement_kind":"dispatch_count","profile_id":"00000000-0000-4000-8000-000000000001","profile_revision":"1","policy_set_digest":"3333333333333333333333333333333333333333333333333333333333333333","unsupported_reason":null,"original_runtime_id":"00000000-0000-4000-8000-000000000009","original_generation":"4444444444444444444444444444444444444444444444444444444444444444","route_id":"research-sol-medium-v1","model":"gpt-6.1-sol","settings_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal dispatch-count-bound-2 (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.event.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","event_key":"unhold-1","event_kind":"unhold","target_event_digest":null,"reason_code":"qualified","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","cause_ref_digest":null,"evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal unhold-without-target (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.event.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","event_key":"k4:2222222222222222222222222222222222222222222222222222222222222222","event_kind":"auto_hold","target_event_digest":null,"reason_code":"bound_contradicted","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":null,"cause_ref_digest":"2222222222222222222222222222222222222222222222222222222222222222","evidence_digest":"2222222222222222222222222222222222222222222222222222222222222222"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal auto-hold-with-authority (cross-field)'||': '||got;
 BEGIN PERFORM sophia.research_c2_payload('sophia.c2.bound.profile.event.v1','{"profile_id":"00000000-0000-4000-8000-000000000001","revision":"1","dimension":"openai.output_tokens","event_key":"activate-1","event_kind":"activate","target_event_digest":null,"reason_code":"qualified","authority_id":"00000000-0000-4000-8000-000000000003","approval_ref_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","cause_ref_digest":"2222222222222222222222222222222222222222222222222222222222222222","evidence_digest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}'::jsonb); got:='accepted';
  EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END;
 ASSERT got='payload_invalid', 'refusal activate-with-cause (cross-field)'||': '||got;
 ASSERT sophia.research_c2_outbound_digest('openai-research','responses','gpt-6.1-sol','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','[["openai.output_tokens", "max_output_tokens", "8000"]]'::jsonb) IS NOT DISTINCT FROM '77368abaec4e8bab9e6e60ac59b6f5ecc536337d4c7d4394bbf2563b1864dbea', 'helper outbound-n1';
 ASSERT sophia.research_c2_outbound_digest('openai-research','responses','gpt-6.1-sol','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','[]'::jsonb) IS NOT DISTINCT FROM 'e15e4d95de78fa2562a35cf73dae656d3fb1b7921f856fd99a92e6f174c56093', 'helper outbound-n0';
 ASSERT sophia.research_c2_authorize_set_digest('00000000-0000-4000-8000-000000000008'::uuid,ARRAY['9999999999999999999999999999999999999999999999999999999999999999','1111111111111111111111111111111111111111111111111111111111111111','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','3333333333333333333333333333333333333333333333333333333333333333']::text[]) IS NOT DISTINCT FROM '96ce3e88041572303c2119229f2f21852e3a4af8c366056dab9673194a5cd5e9', 'helper authorize-set';
 ASSERT sophia.research_c2_policy_item('3333333333333333333333333333333333333333333333333333333333333333','4444444444444444444444444444444444444444444444444444444444444444') IS NOT DISTINCT FROM '501c2a126b122546aff49ba52cb413dc910011ae028687d1b565273e7d9b3464', 'helper policy-item';
 ASSERT sophia.research_c2_policy_set_digest('openai.output_tokens',ARRAY['6666666666666666666666666666666666666666666666666666666666666666','5555555555555555555555555555555555555555555555555555555555555555']::text[]) IS NOT DISTINCT FROM '398526edcc80dc029557f59d4711d5c19142ccde28aa475a808d07e17e1d5e3d', 'helper policy-set-n2';
 ASSERT sophia.research_c2_policy_set_digest('openai.output_tokens','{}'::text[]) IS NOT DISTINCT FROM NULL::text, 'helper policy-set-n0';
END $$;

-- Test helpers (pg_temp: gone with the session; the whole file rolls back).
CREATE FUNCTION pg_temp.h(c text) RETURNS text LANGUAGE sql AS $$ SELECT repeat(c,64) $$;
CREATE FUNCTION pg_temp.outcome(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'accepted'; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;
CREATE FUNCTION pg_temp.auth(p_key text, p_kind text, p_ref uuid, p_dim text) RETURNS uuid LANGUAGE sql AS $$
 SELECT (sophia.record_research_bound_authority(jsonb_build_object('version','research-bound-authority-v1','authorityKey',p_key,
  'kind','bound_profile_qualification','scope',jsonb_build_object('kind',p_kind,'ref',p_ref),'dimension',p_dim,
  'approverRef','synthetic approver','verifierRef','synthetic verifier'))->>'authorityId')::uuid $$;
CREATE FUNCTION pg_temp.prof(p_id uuid, p_rev text, p_scope uuid, p_auth uuid, p_ceiling text DEFAULT '16000', p_settings text DEFAULT 'a')
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('profile_id',p_id,'revision',p_rev,'dimension','openai.output_tokens','unit','tokens',
  'enforcement_kind','output_parameter','param_name','max_output_tokens','max_ceiling',p_ceiling,'provider','openai-research',
  'route_id','research-sol-medium-v1','endpoint','responses','model','gpt-6.1-sol','settings_digest',pg_temp.h(p_settings),
  'emitter_identity_digest',pg_temp.h('b'),'semantics_evidence_digest',pg_temp.h('c'),'isolation_evidence_digest',pg_temp.h('d'),
  'scope_kind','project','scope_ref',p_scope,'authority_id',p_auth,'approval_ref_digest',pg_temp.h('e'),'evidence_digest',pg_temp.h('f')) $$;
CREATE FUNCTION pg_temp.ev(p_id uuid, p_key text, p_kind text, p_auth uuid, p_target text DEFAULT NULL, p_reason text DEFAULT 'operator')
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('profile_id',p_id,'revision','1','dimension','openai.output_tokens','event_key',p_key,'event_kind',p_kind,
  'target_event_digest',p_target,'reason_code',p_reason,'authority_id',p_auth,'approval_ref_digest',pg_temp.h('e'),
  'cause_ref_digest',NULL,'evidence_digest',pg_temp.h('f')) $$;
CREATE FUNCTION pg_temp.st(p_id uuid) RETURNS text LANGUAGE sql AS $$
 SELECT sophia.research_bound_profile_state(p_id,1,'openai.output_tokens') $$;
CREATE FUNCTION pg_temp.pol(p_id uuid, p_scope uuid, p_auth uuid, p_cap text, p_unit text DEFAULT 'tokens') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('policy_id',p_id,'revision','1','scope_kind','project','scope_ref',p_scope,'dimension','openai.output_tokens',
  'unit',p_unit,'cap',p_cap,'authority_id',p_auth,'approval_ref_digest',pg_temp.h('e'),'evidence_digest',pg_temp.h('f')) $$;
CREATE FUNCTION pg_temp.pev(p_id uuid, p_key text, p_kind text, p_auth uuid, p_evidence text DEFAULT 'f') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('policy_id',p_id,'revision','1','event_key',p_key,'event_kind',p_kind,'authority_id',p_auth,
  'approval_ref_digest',pg_temp.h('e'),'evidence_digest',pg_temp.h(p_evidence)) $$;

-- B. Custody: the dedicated C2 authority (approver <> verifier, exact scope and dimension, append-only revocation);
--    unauthorized, wrong-scope, revoked or unknown authority writes nothing; registration is immutable; an authorized
--    competing registration is a sticky conflict whose exact replay is the same receipt (T-C2-76/78/79).
DO $$ DECLARE prj uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid; a2 uuid; a3 uuid; p uuid:=gen_random_uuid(); r jsonb; r2 jsonb; got text;
BEGIN
 got:=pg_temp.outcome(format($q$SELECT sophia.record_research_bound_authority('{"version":"research-bound-authority-v1","authorityKey":"same-refs","kind":"bound_profile_qualification","scope":{"kind":"project","ref":"%s"},"dimension":"openai.output_tokens","approverRef":"x","verifierRef":"x"}')$q$,prj));
 ASSERT got='Invalid bound authority input', 'approver = verifier refused: '||got;
 got:=pg_temp.outcome(format($q$SELECT sophia.record_research_bound_authority('{"version":"research-bound-authority-v1","authorityKey":"k-financial","kind":"provider_billed_attestation","scope":{"kind":"project","ref":"%s"},"dimension":"openai.output_tokens","approverRef":"x","verifierRef":"y"}')$q$,prj));
 ASSERT got='Invalid bound authority input', 'only the dedicated kind: '||got;
 a:=pg_temp.auth('c2-auth-1','project',prj,'openai.output_tokens');
 ASSERT pg_temp.auth('c2-auth-1','project',prj,'openai.output_tokens')=a, 'authority replay';
 a2:=pg_temp.auth('c2-auth-other-scope','project',other,'openai.output_tokens');
 a3:=pg_temp.auth('c2-auth-other-dim','project',prj,'openai.model_requests');
 -- unauthorized: another scope, another dimension, an unknown id: refused, no row
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',prj,a2)));
 ASSERT got='bound_authority_refused', 'wrong-scope authority: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',prj,a3)));
 ASSERT got='bound_authority_refused', 'wrong-dimension authority: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',prj,gen_random_uuid())));
 ASSERT got='bound_authority_refused', 'unknown authority: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',prj,a)||'{"revision":"x"}'));
 ASSERT got='payload_invalid', 'malformed: '||got;
 ASSERT NOT EXISTS(SELECT 1 FROM sophia.research_bound_profiles WHERE profile_id=p), 'no row from any refusal';
 ASSERT NOT EXISTS(SELECT 1 FROM sophia.research_bound_profile_conflicts WHERE profile_id=p), 'no conflict from any refusal';
 -- the first registration; its exact replay; an authorized competing payload; its exact replay
 r:=sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a));
 ASSERT (r->>'replay')::boolean=false AND r->>'digest' ~ '^[0-9a-f]{64}$', 'first registration';
 ASSERT pg_temp.st(p)='inactive', 'registration alone is inactive';
 ASSERT (sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a))->>'replay')::boolean, 'exact replay';
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',prj,a2,'8000')));
 ASSERT got='bound_authority_refused', 'unauthorized competitor writes nothing: '||got;
 ASSERT pg_temp.st(p)='inactive', 'an unauthorized competitor is no conflict';
 r:=sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a,'8000'));
 ASSERT (r->>'conflict')::boolean AND r->>'competingDigest'<>r->>'firstDigest', 'authorized competitor is a conflict';
 r2:=sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a,'8000'));
 ASSERT r2=r, 'competing replay is the same conflict receipt';
 ASSERT (SELECT count(*) FROM sophia.research_bound_profile_conflicts WHERE profile_id=p)=1, 'one sticky conflict row';
 ASSERT (SELECT max_ceiling FROM sophia.research_bound_profiles WHERE profile_id=p)=16000, 'the first immutable fact stays';
 ASSERT pg_temp.st(p)='conflicted', 'the triple is conflicted';
 got:=pg_temp.outcome(format('UPDATE sophia.research_bound_profiles SET max_ceiling=1 WHERE profile_id=%L',p));
 ASSERT got='Bound records are append-only', 'revision content is immutable: '||got;
 got:=pg_temp.outcome(format('DELETE FROM sophia.research_bound_profile_conflicts WHERE profile_id=%L',p));
 ASSERT got='Bound records are append-only', 'conflicts are append-only: '||got;
END $$;

-- C. Lifecycle (R2E E1): server event_seq; replay returns the stored receipt; unhold targets exactly one open manual hold;
--    precedence; terminal states; auto_hold is the contradiction writer's only; authority is CURRENT at every action
--    (T-C2-62/71/72/73/74/75/76).
DO $$ DECLARE prj uuid:=gen_random_uuid(); a uuid; a2 uuid; p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid();
 h1 jsonb; h2 jsonb; h3 jsonb; u1 jsonb; r jsonb; got text;
BEGIN
 a:=pg_temp.auth('c2-auth-life','project',prj,'openai.output_tokens');
 PERFORM sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a));
 got:=pg_temp.outcome(format('SELECT sophia.record_research_bound_profile_event(%L)',
  pg_temp.ev(p,'act','activate',a)||jsonb_build_object('revision','2')));
 ASSERT got='lifecycle_target_unknown', 'an event naming another revision: '||got;
 r:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'act','activate',a));
 ASSERT (r->>'eventSeq')::int=1 AND pg_temp.st(p)='active', 'activate';
 h1:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'h1','hold',a));
 h2:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'h2','hold',a));
 ASSERT (h2->>'eventSeq')::int=3 AND pg_temp.st(p)='held', 'two holds';
 u1:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'u1','unhold',a,h1->>'digest'));
 ASSERT pg_temp.st(p)='held', 'H1, H2, unhold(H1): H2 still open (T-C2-71)';
 PERFORM sophia.record_research_bound_profile_event(pg_temp.ev(p,'u2','unhold',a,h2->>'digest'));
 ASSERT pg_temp.st(p)='active', 'unhold(H2): active (T-C2-72)';
 h3:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'h3','hold',a));
 r:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'u1','unhold',a,h1->>'digest'));
 ASSERT (r->>'replay')::boolean AND r->>'eventSeq'=u1->>'eventSeq' AND r->>'targetEventDigest'=h1->>'digest', 'stored unhold receipt (T-C2-73)';
 ASSERT pg_temp.st(p)='held', 'H3 stays open after the old unhold replay';
 got:=pg_temp.outcome(format('SELECT sophia.record_research_bound_profile_event(%L)',pg_temp.ev(p,'u9','unhold',a,h1->>'digest')));
 ASSERT got='lifecycle_target_already_cleared', 'a cleared hold is not targeted again: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.record_research_bound_profile_event(%L)',pg_temp.ev(p,'u8','unhold',a,pg_temp.h('9'))));
 ASSERT got='lifecycle_target_invalid', 'an absent target: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.record_research_bound_profile_event(%L)',pg_temp.ev(p,'u7','unhold',a,r->>'digest')));
 ASSERT got='lifecycle_target_invalid', 'an unhold is no hold: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.record_research_bound_profile_event(%L)',
  jsonb_build_object('profile_id',p,'revision','1','dimension','openai.output_tokens','event_key','auto','event_kind','auto_hold',
   'target_event_digest',NULL,'reason_code','manual','authority_id',NULL,'approval_ref_digest',NULL,'cause_ref_digest',pg_temp.h('2'),
   'evidence_digest',pg_temp.h('2'))));
 ASSERT got='lifecycle_auto_hold_writer_only', 'an operator never writes auto_hold: '||got;
 -- the same key, another payload, authorized and valid: first kept, sticky conflict, L conflicted (T-C2-74)
 r:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'h3','hold',a,NULL,'changed'));
 ASSERT (r->>'conflict')::boolean AND r->>'firstDigest'=h3->>'digest', 'event conflict';
 ASSERT sophia.record_research_bound_profile_event(pg_temp.ev(p,'h3','hold',a,NULL,'changed'))=r, 'competing replay: same receipt';
 ASSERT pg_temp.st(p)='conflicted', 'conflicted outranks held';
 ASSERT (SELECT count(*) FROM sophia.research_bound_profile_events WHERE profile_id=p)=6, 'no event from a refusal or a conflict';
 -- terminal: revoke, then an exact replay of the activate never reactivates (T-C2-62); distrust outranks revoke
 PERFORM sophia.record_research_bound_profile_event(pg_temp.ev(p,'rev','revoke',a));
 r:=sophia.record_research_bound_profile_event(pg_temp.ev(p,'act','activate',a));
 ASSERT (r->>'replay')::boolean AND (r->>'eventSeq')::int=1 AND pg_temp.st(p)='revoke', 'replay never reactivates';
 PERFORM sophia.record_research_bound_profile_event(pg_temp.ev(p,'dis','distrust',a));
 ASSERT pg_temp.st(p)='distrust', 'distrust outranks revoke';
 -- authority CURRENT at each action: revoked before the action refuses it with no row (T-C2-75); history stays
 PERFORM sophia.register_research_bound_profile(pg_temp.prof(q,'1',prj,a));
 PERFORM sophia.record_research_bound_profile_event(pg_temp.ev(q,'act','activate',a));
 PERFORM sophia.revoke_research_bound_authority(a,'synthetic revocation');
 got:=pg_temp.outcome(format('SELECT sophia.record_research_bound_profile_event(%L)',pg_temp.ev(q,'h1','hold',a)));
 ASSERT got='bound_authority_refused', 'registration-time authority is not perpetual: '||got;
 ASSERT pg_temp.st(q)='active' AND (SELECT count(*) FROM sophia.research_bound_profile_events WHERE profile_id=q)=1, 'history immutable';
 got:=pg_temp.outcome(format('DELETE FROM sophia.research_bound_authority_revocations WHERE authority_id=%L',a));
 ASSERT got='Bound records are append-only', 'revocation is append-only: '||got;
 a2:=pg_temp.auth('c2-auth-life-2','project',prj,'openai.output_tokens');
 PERFORM sophia.record_research_bound_profile_event(pg_temp.ev(q,'h1','hold',a2));
 ASSERT pg_temp.st(q)='held', 'a current authority acts';
END $$;

-- D. Native-unit policy caps (R1 F05, R2E E1.5, bridge C01): never USD; registration alone never active; the canonical
--    activation is the smallest event_seq; conflict and revoke (T-C2-65/66/77).
DO $$ DECLARE prj uuid:=gen_random_uuid(); a uuid; p uuid:=gen_random_uuid(); r jsonb; a1 jsonb; got text;
BEGIN
 a:=pg_temp.auth('c2-auth-pol','project',prj,'openai.output_tokens');
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_policy(%L)',pg_temp.pol(p,prj,a,'8000','usd')));
 ASSERT got='bound_policy_unit_mismatch', 'a USD cap is refused: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_policy(%L)',pg_temp.pol(p,prj,a,'0')));
 ASSERT got='bound_invalid', 'a zero cap is refused: '||got;
 ASSERT NOT EXISTS(SELECT 1 FROM sophia.research_bound_policies WHERE policy_id=p), 'no row';
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p,prj,a,'8000'));
 ASSERT sophia.research_bound_policy_state(p,1)='inactive', 'registration alone is not active (T-C2-77)';
 a1:=sophia.record_research_bound_policy_event(pg_temp.pev(p,'act-1','activate',a));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p,'act-2','activate',a,'7'));
 ASSERT sophia.research_bound_policy_state(p,1)='active', 'active';
 ASSERT sophia.research_bound_policy_activation(p,1)=a1->>'digest', 'C01: the first activate is canonical, a later one never replaces it';
 r:=sophia.record_research_bound_policy_event(pg_temp.pev(p,'act-1','activate',a));
 ASSERT (r->>'replay')::boolean AND r->>'eventSeq'='1', 'replay keeps seq 1';
 r:=sophia.record_research_bound_policy_event(pg_temp.pev(p,'act-1','activate',a,'9'));
 ASSERT (r->>'conflict')::boolean AND sophia.research_bound_policy_state(p,1)='conflicted', 'same key, other payload: conflicted';
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p,'rev','revoke',a));
 ASSERT sophia.research_bound_policy_state(p,1)='revoke', 'revoke > conflicted';
END $$;

-- D2. R1 (finding A): a registration conflict is bound to the STORED target's first scope (and, for a policy, its
--    dimension) before any effect. An authority valid only for another scope, naming that scope, never poisons an
--    existing revision; neither does the target's own authority naming another scope. Both refuse exactly as an
--    unauthorized request (no row, no conflict, no digest). A same-scope sticky conflict and its replay stay.
DO $$ DECLARE prj uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid; b uuid; am uuid; p uuid:=gen_random_uuid();
 q uuid:=gen_random_uuid(); r jsonb; got text;
BEGIN
 a:=pg_temp.auth('c2-r1-scope-a','project',prj,'openai.output_tokens');
 b:=pg_temp.auth('c2-r1-scope-b','project',other,'openai.output_tokens');
 am:=pg_temp.auth('c2-r1-scope-a-req','project',prj,'openai.model_requests');
 PERFORM sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a));
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',other,b)));
 ASSERT got='bound_authority_refused', 'a scope-B authority naming B never reaches scope A''s revision: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',other,b,'8000')));
 ASSERT got='bound_authority_refused', 'nor with another ceiling: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_profile(%L)',pg_temp.prof(p,'1',other,a)));
 ASSERT got='bound_authority_refused', 'the target''s own authority naming another scope: '||got;
 ASSERT NOT EXISTS(SELECT 1 FROM sophia.research_bound_profile_conflicts WHERE profile_id=p), 'no conflict from a wrong scope';
 ASSERT pg_temp.st(p)='inactive', 'no state change from a wrong scope';
 r:=sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a,'8000'));
 ASSERT (r->>'conflict')::boolean, 'a same-scope authorized competitor is still a sticky conflict';
 ASSERT sophia.register_research_bound_profile(pg_temp.prof(p,'1',prj,a,'8000'))=r, 'its exact replay is the same receipt';
 ASSERT (SELECT count(*) FROM sophia.research_bound_profile_conflicts WHERE profile_id=p)=1, 'one conflict row';
 -- the same for a policy revision, its dimension included
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(q,prj,a,'8000'));
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_policy(%L)',pg_temp.pol(q,other,b,'8000')));
 ASSERT got='bound_authority_refused', 'policy: a scope-B authority naming B: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_policy(%L)',pg_temp.pol(q,other,a,'7000')));
 ASSERT got='bound_authority_refused', 'policy: the target''s authority naming another scope: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.register_research_bound_policy(%L)',
  pg_temp.pol(q,prj,am,'1')||'{"dimension":"openai.model_requests","unit":"requests"}'));
 ASSERT got='bound_authority_refused', 'policy: another dimension''s authority naming that dimension: '||got;
 ASSERT NOT EXISTS(SELECT 1 FROM sophia.research_bound_policy_conflicts WHERE policy_id=q), 'no policy conflict from a wrong scope';
 ASSERT sophia.research_bound_policy_state(q,1)='inactive', 'no policy state change';
 r:=sophia.register_research_bound_policy(pg_temp.pol(q,prj,a,'7000'));
 ASSERT (r->>'conflict')::boolean AND sophia.register_research_bound_policy(pg_temp.pol(q,prj,a,'7000'))=r, 'same-scope policy conflict and replay';
 ASSERT sophia.research_bound_policy_state(q,1)='conflicted', 'the policy revision is conflicted';
END $$;

-- D3. R1 (finding B, bridge C02): ANY sticky conflict of an applicable policy revision refuses before its derived state,
--    in both orders (conflict then revoke, revoke then conflict) and for a registration conflict on a revoked revision;
--    a conflict-free revoked revision neither caps nor refuses; another scope's conflicted revision changes nothing here.
DO $$ DECLARE prj uuid:=gen_random_uuid(); prj2 uuid:=gen_random_uuid(); prj3 uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 a uuid; a2 uuid; a3 uuid; ao uuid; p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid();
 p4 uuid:=gen_random_uuid(); p5 uuid:=gen_random_uuid(); p6 uuid:=gen_random_uuid(); k jsonb;
 dims text[]:=ARRAY['openai.output_tokens'];
BEGIN
 a:=pg_temp.auth('c2-r1-c02-a','project',prj,'openai.output_tokens');
 a2:=pg_temp.auth('c2-r1-c02-a2','project',prj2,'openai.output_tokens');
 a3:=pg_temp.auth('c2-r1-c02-a3','project',prj3,'openai.output_tokens');
 ao:=pg_temp.auth('c2-r1-c02-o','project',other,'openai.output_tokens');
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p1,prj,a,'8000'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p1,'act','activate',a));
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p2,prj,a,'5000'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p2,'act','activate',a));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p2,'rev','revoke',a));
 -- another scope: activated, conflicted, revoked
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p3,other,ao,'100'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p3,'act','activate',ao));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p3,'act','activate',ao,'9'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p3,'rev','revoke',ao));
 k:=sophia.research_bound_policy_lock(prj,gen_random_uuid(),NULL,dims);
 ASSERT NOT (k->>'conflicted')::boolean, 'conflict-free (one active, one revoked; another scope conflicted): no refusal';
 ASSERT jsonb_array_length(k->'items'->'openai.output_tokens')=1 AND k->'items'->'openai.output_tokens'->0->>'cap'='8000',
  'only the active revision caps; a revoked one never does';
 ASSERT (sophia.research_bound_policy_lock(other,gen_random_uuid(),NULL,dims)->>'conflicted')::boolean, 'its own scope is refused';
 -- order 1: conflict, then revoke (derived state revoke)
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p4,prj,a,'6000'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p4,'act','activate',a));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p4,'act','activate',a,'9'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p4,'rev','revoke',a));
 ASSERT sophia.research_bound_policy_state(p4,1)='revoke', 'derived state revoke > conflicted';
 ASSERT (sophia.research_bound_policy_lock(prj,gen_random_uuid(),NULL,dims)->>'conflicted')::boolean,
  'C02: conflict then revoke still refuses (never the no-cap fallback)';
 -- order 2: revoke, then a conflicting event
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p5,prj2,a2,'6000'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p5,'act','activate',a2));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p5,'rev','revoke',a2));
 ASSERT NOT (sophia.research_bound_policy_lock(prj2,gen_random_uuid(),NULL,dims)->>'conflicted')::boolean, 'revoked, no conflict yet';
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p5,'rev','revoke',a2,'9'));
 ASSERT (sophia.research_bound_policy_lock(prj2,gen_random_uuid(),NULL,dims)->>'conflicted')::boolean,
  'C02: revoke then conflict refuses';
 -- a registration conflict on a revoked, never-activated revision
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p6,prj3,a3,'6000'));
 PERFORM sophia.record_research_bound_policy_event(pg_temp.pev(p6,'rev','revoke',a3));
 PERFORM sophia.register_research_bound_policy(pg_temp.pol(p6,prj3,a3,'4000'));
 ASSERT (sophia.research_bound_policy_lock(prj3,gen_random_uuid(),NULL,dims)->>'conflicted')::boolean,
  'C02: a registration conflict on a revoked revision refuses';
 ASSERT NOT (sophia.research_bound_policy_lock(prj,gen_random_uuid(),NULL,ARRAY['openai.model_requests'])->>'conflicted')::boolean,
  'another dimension is not applicable';
END $$;

-- E. The request parser (0110 replaced): absent opt-in is byte-identical; boundProfile only on a tracked model request;
--    never a caller number (T-C2-03).
DO $$ DECLARE t jsonb:='{"mode":"tracked_v1","kind":"model","contract":"c1p_complete_report","declared":{"routeId":"research-sol-medium-v1","model":"gpt-6.1-sol"}}';
 got text;
BEGIN
 ASSERT sophia.research_call_request('{"kind":"model"}') IS NULL, 'legacy is NULL';
 ASSERT sophia.research_call_request(t)='{"mode":"tracked_v1","contract":"c1p_complete_report","declared":{"routeId":"research-sol-medium-v1","model":"gpt-6.1-sol"}}'::jsonb,
  'tracked v1 normalized exactly as 0110';
 ASSERT sophia.research_call_request(t||'{"facts":"observed_v1"}')=sophia.research_call_request(t)||'{"facts":"observed_v1"}', 'observed_v1 as 0110';
 ASSERT sophia.research_call_request(t||'{"maxTokens":16000}')=sophia.research_call_request(t), 'without the opt-in an unknown member is ignored as before';
 ASSERT sophia.research_call_request(t||'{"boundProfile":{"profileId":"00000000-0000-4000-8000-000000000001","revision":"1"}}')
  =sophia.research_call_request(t)||'{"boundProfile":{"profileId":"00000000-0000-4000-8000-000000000001","revision":"1"}}', 'opt-in';
 got:=pg_temp.outcome($q$SELECT sophia.research_call_request('{"kind":"model","boundProfile":{"profileId":"00000000-0000-4000-8000-000000000001","revision":"1"}}')$q$);
 ASSERT got='bound_profile_untracked', 'untracked: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.research_call_request(%L)',t||'{"boundProfile":{"profileId":"00000000-0000-4000-8000-000000000001","revision":"1","bound":"16000"}}'));
 ASSERT got='bound_caller_supplied', 'a bound inside the reference: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.research_call_request(%L)',t||'{"maxTokens":16000,"boundProfile":{"profileId":"00000000-0000-4000-8000-000000000001","revision":"1"}}'));
 ASSERT got='bound_caller_supplied', 'a caller ceiling beside the opt-in: '||got;
 got:=pg_temp.outcome(format('SELECT sophia.research_call_request(%L)',t||'{"boundProfile":{"profileId":"00000000-0000-4000-8000-000000000001","revision":1}}'));
 ASSERT got='bound_profile_invalid', 'a JSON number revision: '||got;
END $$;

-- F. Privileges: no application, worker or assembler role executes a new function or touches a new table; the replaced
--    reserve keeps its grant (T-C2-39).
DO $$ DECLARE f regprocedure; t text; r text;
BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia'
   AND p.proname ~ '^(research_c2_|research_bound_|record_research_bound_|revoke_research_bound_|register_research_bound_|runtime_research_bound_)' LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker'] LOOP
   ASSERT NOT has_function_privilege(r,f,'EXECUTE'), r||' executes '||f::text;
  END LOOP;
 END LOOP;
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sophia' AND c.relkind='r'
   AND c.relname LIKE 'research_bound_%' LOOP
  FOREACH r IN ARRAY ARRAY['sophia_api','sophia_worker'] LOOP
   ASSERT NOT has_table_privilege(r,'sophia.'||t,'SELECT,INSERT,UPDATE,DELETE'), r||' touches '||t;
  END LOOP;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid=('sophia.'||t)::regclass), 'row security on '||t;
 END LOOP;
 ASSERT has_function_privilege('sophia_api','sophia.runtime_research_reserve(bytea,text,text,jsonb)','EXECUTE'), 'the reserve keeps its grant';
 ASSERT has_function_privilege('sophia_api','sophia.runtime_design_reserve(bytea,text,text,jsonb)','EXECUTE'), 'R1: the design reserve keeps its grant';
 ASSERT has_function_privilege('sophia_api','sophia.runtime_source_review_reserve(bytea,text,text,jsonb)','EXECUTE'), 'R1: the review reserve keeps its grant';
 -- R2 (C2R1B-F01): nine dispatch entries (research, design, review x apply, claim, outcome), each SECURITY DEFINER over
 -- its own maintained scope; the shared cores, lock and fence are invoker-rights helpers (owner-only, as above).
 ASSERT (SELECT count(*) FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND prosecdef AND proname IN
  ('runtime_research_bound_apply','runtime_research_bound_claim','runtime_research_bound_outcome',
   'runtime_research_bound_apply_design','runtime_research_bound_claim_design','runtime_research_bound_outcome_design',
   'runtime_research_bound_apply_review','runtime_research_bound_claim_review','runtime_research_bound_outcome_review'))=9,
  'R2: nine security-definer dispatch entries';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND prosecdef AND proname IN
  ('research_bound_apply_core','research_bound_claim_core','research_bound_outcome_core','research_bound_dispatch_lock',
   'research_bound_fence')), 'R2: the shared cores never run as definer on their own';
 ASSERT (SELECT count(*) FROM pg_proc WHERE pronamespace='sophia'::regnamespace AND proname IN
  ('research_bound_apply_core','research_bound_claim_core','research_bound_outcome_core','research_bound_dispatch_lock',
   'research_bound_fence'))=5, 'R2: one of each shared core';
END $$;

ROLLBACK;
