# CON-01 takeover39 — control command identity before Stop effects

Same mission, worktree and Codex author session. The previous turn completed the independently reviewed handoff38 checkpoint. Approved handoff24 source-only authority ends 2026-10-14T10:00Z (noon Rome). Pending27/36 remain unapplied; Q8, current-main/shared integration and all operational effects remain held. Claude remains stopped.

## Candidate and finding

Published PR273 is unchanged at `457053b3fe619631f0d2e2fcc1e3edc98cfc5348`, tree `ec71aa3a83e6208ff559d075a881b374fdb8593c`. Fresh remote refs still show main `c1d4d08da0ab393be5f55bfef3c1b8645ad21095`; PR199 has no newer owner handback than the recorded6157154591 correction. Refreshed automatic review273/6144338846 reports no major issues for the published head only. No push, merge, rebase, reset or artifact recording occurred.

Independent integration inspection identified a control-path identity gap in the partial registry: Stop could reuse a create command ID, or a retained Stop ID with a changed epoch. Inspect did not enforce the retained epoch. This matters because RuntimeReceipt carries command/attempt/session but no kind or epoch; the API reads those from its stored command. The local proof calculation must therefore use the same immutable command. This finding concerns unfinished controls, not the earlier create-only delivery clearance. Before-write record:198/6158401309.

Only listed `packages/dsh-bundle/src/reply-child.ts` and `tests/unit/reply-child.test.mjs` changed. Source SHA256 `07b1780ccf870f6bb2252b669253311e4f30307398ece4dbed26dfdfc9f8ba5f`; tests `bc75fd3f67496650d6e2f4fe7aa7152a8c238051ea0fc75ed00938fab0fae7f7`. Before files and logs: private `control-identity-20261014-0255`. Bridge, plugin, SQL, generated wire, profile and index unchanged.

## Changed behavior

Create and control validation share the command namespace across direct admission entries, retained create deliveries and control records. Any reused ID with a different fingerprint is refused before a fence, epoch update, factory or transport effect.

Known attempts retain one canonical Stop identity, matching the SQL's one Stop per attempt. Exact Stop replay still invokes the existing Stop/settlement path; no cached physical proof or receipt is introduced. Inspect records are independently bounded at64, so inspection history cannot consume a known attempt's Stop slot. Accepted inspection advances the retained epoch; stale commands are refused before mutation. An unchanged earlier create can still replay its historical result without new work.

Unknown controls remain null and establish neither ownership, absence nor cleanup. Their receipt path must first acquire trusted recovery ownership; this patch does not invent a recovery tombstone. Physical Stop classification, fresh check, terminal receipt delivery, retirement and bridge integration remain unfinished. In particular, SQL's checked Stop transition settles a binding and schedules retirement, so it must never be inferred from a cached launcher exit alone.

## Verification

Three focused regressions fail against the previous compiled source, with zero cancellations. The new source passes186 focused tests, zero skips/failures/cancellations. The ordinary suite passes2544 tests with70 existing skips, zero failures/cancellations. Bundle build, whole-file structural audit and git diff --check pass. The existing fixture helper now assigns different Stop and inspect command IDs; the older test for a changed epoch under the same Stop ID now expects identity conflict, while a different stale ID is tested separately.

Independent exact-pin review found no remaining actionable finding and released the source hold. Independently186 focused tests pass, source/dist match and structural audit passes. Five private diagnostic groups failed against the original source and pass against this exact candidate, covering identity reuse, epoch handling, delivery-only collisions and both reserved Stop slots after64 inspection plus64 create-delivery records. Receipt: `/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/independent-step3-control-review-20261014/review.safe.json`. The reviewer corrected a private diagnostic fixture's colliding IDs and stale-inspection assertion; no product change was needed. Review processes are terminal, no HTTP/PostgreSQL/provider execution was started, and no repository edits came from the reviewer. SQL was inspected directly and remains unchanged. This component is locally_verified and reviewed; no whole-Step3 or push clearance follows.

## Operations and next action

No hosted database/config/deployment, accounts/members/grants/connections, credential access/transfer, native provider execution or subscription spending occurred. Product provider use is zero; assistant/reviewer compute is not metered here. Local synthetic tests completed; evidence is private. Nothing was deployed, so no hosted rollback ran. Before-source files and published commit remain available; eventual operational rollback must preserve governed data, erasure and cumulative/uncertain accounting.

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. Serving app/API/runtime tuple and actual two-account signed-in app acceptance remain unverified. The36-case ledger remains18partial_L1/3passed_L1/15not_run; CON01-A30not_run. Ask remains disabled. No broader product or other mission is complete.

Next bounded action: connect Stop receipt classification using exact attempt/home/nonce proof and the original settlement barrier, with fresh evaluation on every replay. Do not bypass pending27/36, shared/Q8 ownership or separate operational approvals. No autonomous monitoring or background promise.
