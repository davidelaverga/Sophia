# CON-01 takeover15 — child control and request guards

Same session01a1224a-32b4-7222-a017-50a277572d95, owned branch codex/con01-takeover-source-20261013. Codex authors; Claude remains stopped; retained reviewer independently checks components. Luis integration and Davide acceptance remain separate. Previous goal turn was progress, not a wait or no-progress turn: journal source changed and independently reproduced failures were corrected.

## Authority and current identities

Approved r12 plus listed amendments remains source-only until2026-10-13T18:00Z/20:00Rome. Handoff11 is approved. Handoff13 reserve-identity amendment is still pending/unapplied, exact request198/6148392843 and frozen SHA25685476cfd700c75e98220a839b8d9195edcdf7c64980c01255efee1113169c02d. This continuation adds only already-listed child-module/test code; no wire/SQL amendment is inferred from the goal continuation.

Published PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. No new commit or push; its automatic review was actually inspected previously. Main observed3633f5f1/treecde6b113; eight held Studio conflicts remain as handoff14 records. No accepted combined tree, merge or final Step3 artifact. Current dirty source is not a deployed candidate.

## Actual implementation and evidence

States and adverse crossings were recorded before writing in198/6148642694. ReplyControlReader now enforces awaiting_start -> started -> ready -> running, with stopped/failed terminal states. It validates the closed start against the supplied attempt/session/nonce and exact template route/ceiling, validates UTF8 incrementally within a2MiB first-line and4KiB later-line buffer, permits go only once after readiness, and does not process the tail after stop. Malformed/truncated/oversize/extra-field/wrong-identity frames fail with a fixed error. Its owner still must wire EOF/stop/failure to actual cancellation/exit and match accounting replies to pending ordinals.

At source de7de45105db9b5173125263189773e48a8bfb304823758466f7fa15958cee40/tests5cabdf3fddccf1133c1820f8525443edbe97772df091a7124685567add30d555, build and author17/17 pass. Independent17/17 plus a200,000-code-point prompt, splitUTF8, copied scope, malformed counts/codes, stop-tail and EOF probes pass, no further component finding. Earlier projector/journal bytes are unchanged. Evidence independent-step3-control-reader-20261013/receipt.safe.json records hashes and cleanup.

Then checkReplyCall was appended for the future global stream hook. It checks the actual GenerateOptions session, running state, abort, exact provider/model/effort, finite positive output ceiling, absence of tool schemas and only ordinary/compaction purposes; title/other auxiliary calls are refused before adapter invocation. This helper is not yet installed into a live hook and does not demonstrate native composition or useful answers.

Independent review at source22f30a14/testsdd62caf0 found P2: empty current tools did not prevent `toolHistory.tools` or historical additions from restoring provider declarations. The actual pinned `projectToolUpdates` reproduced both, without a provider request. Author added a real fail-before regression (18pass/1fail), then required omitted history or the exact empty `{tools:[],updates:[]}`. Malformed or nonempty history is refused; no declarations can be restored by that path. Independent19/19 and both original history probes pass, with prior projector/journal/control bytes unchanged. Evidence independent-step3-call-gate-20261013/after.safe.json; no further component finding.

Current reply-plugin.ts SHA256a7f955c9755880daf8044a83c2b4590e7070e82a0214de9bf7913a1969c7b1c3; tests SHA256e6aaee6e69ebd7bac7cc87df4e1aed86960ef7a00c339d23b8bfcd9cd7d9b04f. `pnpm --filter @sophia/dsh-bundle build` exit0; `node --test --test-timeout=15000 tests/unit/reply-plugin.test.mjs`19/19,0skip/fail/cancel. Private step3-child-controls-20261013-1506/tool-history-{before,after}.log. `git diff --check` exit0. Final ordinary `pnpm test`:2462total/2392pass/70existing explicit skips/0fail/cancel,33.44s,exit0; ordinary-unit.log. Initial receipt.safe.json retains the pre-correction18-case pin; final.safe.json binds the correction and independent result.

Upstream source inspected under already registered DSH08/09/10/12/28: installed pinned dsh-agent CreateAgentOptions/setup and AgentOptions, dsh-tools restrict/guard implementation, dsh-llm GenerateOptions/TokenUsage. `restrict({allow:[]})` is supported and masks inherited global tools, unlike the rejected empty object; scoped tools remain visible, so the monotonic execution guard and actual assembled request check remain necessary. This is source evidence, not a native composition test. No upstream or goal module was changed.

## Readiness, operations, cleanup and next action

Current ordinary gate is recorded above. Full SQL/PG907/907 and independent137/137 remain at unchanged handoff12 hashes. A final assembled Step3 still needs complete ReplyChildren, child Cordis lifecycle, real stop/EOF and journal recovery, no-tool context, settlement deadlines, launcher/containment, artifact recording, full checks and independent whole-diff/exact-pin review before publication. Every later push still requires inspecting actual automatic Codex review.

No operational batch approved: OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not approval-ready. No hosted migration/configuration, deployment, accounts/membership, grants/privileges/connections, credential read/copy/use/transfer, native Ask or provider/subscription execution occurred. Product provider use0; Codex/review compute unknown. Local test scratch cleaned; no external effect introduced. Unpublished source may be omitted; no hosted rollback owed. Future rollback must preserve governed data, erasure and cumulative/uncertain accounting.

Serving app/API/runtime tuple, immutable two-account cohort, supported subscription route/requester/credential lifecycle/quota/finite cap and expiry, Q13 hosted admission and actual app verification remain unqualified. Last built-in browser read was signed out. Ask stays disabled. OptionC/disposable homes, conservative withdrawal/no regeneration and conversation-text-v1 stay settled.

Every acceptance verdict remains exactly as handoff14's36-row table and retained ledger SHA256b25c7f8c8ceb002c8139e1ec3ee5d8a08842a06ac9bc0493bb23fb79d48c1c3f:18partial_L1/3passed_L1/15not_run. Components locally_verified/reviewed only as above; whole Step3 source_ready/reviewed, operational authorized, deployed, app_verified and owner_accepted are not established. Broader product/other missions remain open.

Next bounded action: connect the reviewed child control/journal/guard components to the native lifecycle and pending-ordinal accounting. Apply handoff13 only after its exact approval arrives. Current source-only expiry and all operational restrictions remain unchanged.
