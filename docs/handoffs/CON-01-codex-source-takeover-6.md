# CON-01 takeover 6 — capture privacy amendment for approval

Same CON-01 attempt and sole source author: Codex session `01a1224a-32b4-7222-a017-50a277572d95`, branch `codex/con01-takeover-source-20261013`, worktree `sophia-con01-source-harness-review`. Published head remains `07d296ff3c2b58d597b31a2d15de0d48241c2dba`, tree `69592cb3b988c14a282c623821b3b930960f5d4b`. Its exact-head automatic review was checked and cleared at 2026-10-13T00:07:00.894994Z (PR273/6135020999). Current unfinished Step1 source has not been pushed or independently cleared as a whole.

## Demonstrated boundary

The approved [handoff5](CON-01-codex-source-takeover-5.md) permits only replacement of S4 publisher's direct privacy UPDATE, with `conversation_publish_answer` the exclusive `publication_privacy` caller. Frozen S4 validates a nonempty answer of at most 16,000 characters and a result UUID before checking privacy. Its refusal helper writes malformed-answer failure only.

Independent review identified that observation intake must scrub text when the recorded context is no longer eligible, including an audience or membership change, even when no turn end arrives. Once correctly scrubbed, a later completed turn has no answer text to pass to S4. A genuinely empty/invalid/oversized or failed result has the same boundary. Calling the publisher with fabricated or truncated text, naming capture as the publisher, or moving the frozen validation would violate the accepted scope. Independent reviewer `takeover_diff_review` confirmed this incompatibility on 2026-10-13; it did not author or run the tests.

Author-run real PostgreSQL reproduction, disposable owned loopback only:

- `source-phaseb-privacy-before`: SQL SHA256 `4b47356f91c156895a29267367b5b2bae9289bccd0ec5252f621dd728e68489d`; 27 tests, 21 passes, six failures, zero skips. Failures reproduce unprotected observation text, three privacy-versus-invalid-result cases, nested metadata surviving scrubbing, and changed goal-only error ordering.
- `source-phaseb-privacy-fence-after`: SQL SHA256 `a2d414901e3ce7713fa97a06f26df2b5f5037059f34a34d47e2eb44051cc65a8`; 27 tests, 22 passes, five failures, zero skips. Intake privacy/typed projection and goal-only error order are corrected. The remaining five failures demonstrate the capture boundary, including the previously passing audience/member publication cases now correctly fenced at intake. No direct capture cancellation or invented provenance was retained.
- Both PostgreSQL servers stopped, their PIDs absent, ports closed and clusters removed. Private journal: `/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/`. No native process, provider or hosted target was exercised.

## Exact proposed source amendment

1. Add `capture_privacy` as a distinct typed cause and `capture_native_result` as its exclusive caller. Keep `publication_privacy` exclusive to `conversation_publish_answer` and leave all frozen S4 validation unchanged.
2. In the already permitted reply branch of `capture_native_result`, resolve the real recorded context's privacy verdict before classifying completed, malformed or failed output. If ineligible, call the cancellation writer with `capture_privacy`; publish nothing. Eligible context keeps the existing answer/refusal/turn-error paths.
3. Extend the new closed cancellation writer with an eleventh optional argument, the actual `turn/end` observation UUID, NULL for every existing caller. For `capture_privacy` require that observation to belong to the same project, reply-owned attempt, binding and create command, with the actual turn-end sequence. Require the recorded assembly attempt and matching privacy verdict under the existing project/conversation/reply locks. Persist the turn-end UUID and sequence as typed content-free provenance with its FK, along with the same observed revisions and membership fields as publication privacy. Every other cause requires these new fields NULL; no message/source cause is invented.
4. Apply the existing immutable first-cause, epoch fence, single stop, stop-before-retire and cumulative accounting rules. Acknowledgement names the actual cancellation row as terminal writer; the separate actual capture/receipt predicates and all process/host-copy barriers remain required. A later event cannot replace the first cause or regenerate a removed answer.
5. Extend the already permitted new runtime SQL suite with fail-before/after cases for empty/invalid/oversized/failed output across actual recorded privacy failures, absent/wrong-project/wrong-binding/non-turn-end evidence refusal, crossed first causes, and mixed intake preservation. Existing S4 and seven shared-function restore-only equality checks remain binding; this adds no frozen-body exception.

The affected paths are only the new `db/migrations/0049_conversation_runtime.sql`, the already allowed `packages/persistence/src/conversation-runtime.db.test.ts` and CON handoff/progress records. No new file, endpoint, shared helper, role policy or operational writer is proposed. No capture privacy implementation is authorized until this amendment is approved. Independent whole-diff review remains required before any push, followed by the automatic review for that exact head.

R12's stop rule is explicit: “Nothing outside these lists is written. An unlisted need stops the writer, and the list is amended and acknowledged again.” This proposal changes its permitted cancellation cause/caller/signature; it therefore needs renewed approval rather than an inferred engineering exception. Useful tests and other listed Step1 work can continue meanwhile.

## Operations and readiness

The source-only window still expires **2026-10-13T08:00:00Z**; approval of this amendment does not extend it. No deployment, hosted migration/configuration, account creation, grants, privilege mutation, connection termination, credential access/transfer or provider/subscription execution/spend is requested. Ask stays off. OP0002r6 and OP0001r4 remain unapproved and not approval-ready. Serving tuple, two-account live tests, provider answer and subscription quota remain unverified. Luis retains integration/merge and Davide product acceptance. Other missions and the broader product remain open.

Next bounded action: approve this exact capture-provenance amendment, then implement and rerun the affected failing evidence within the existing source window. Step2 still waits for the complete Step1 pin and its required gates.
