# CON-01 takeover36 — proposed poll-supersession scope amendment

Same source-takeover mission/session; Codex is sole implementer and retained reviewer is independent. Last turn was progress: handoff35 fixed owned disposal and independently qualified it. This turn prepares a concrete prerequisite for full controller integration; it changes no product source. Published draft PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Current main last freshly fetchedc1d4d08da0ab393be5f55bfef3c1b8645ad21095; eleven held integration conflicts are not resolved. Child79ca293e/plugin7444b899/bridge803bfacf remain unchanged.

## Demonstrated failure

Q7 requires a superseded bridge to cancel its replies and stop polling. The actual commands endpoint raises SQLSTATE40001 when another bridge instance owns its runtime lease (0016 runtime_poll). Persistence maps this case to invalid_state and the API returns409. Existing ControlBridge.pollLoop catches it and retries indefinitely. The independent design probe already established two polls before its own cutoff. This proposal repeats that crossing through actual ServiceTransport and an owned loopback HTTP server; it does not assert that a synthetic server is PostgreSQL or live-app proof.

The r12 source manifest lists execute/connect/disposer insertions. It does not list pollLoop. Section3 states: “Nothing outside these lists is written. An unlisted need stops the writer, and the list is amended and acknowledged again.” Therefore product source remains unchanged while this exact amendment is reviewed.

## Requested source amendment

Approve only the following additional locations in packages/dsh-bundle/src/control-bridge.ts:

1. One nullable CON-controller cancellation callback field.
2. One small classifier/cancellation method, invoked from the existing pollLoop error catch before its retry.
3. The new catch call itself.

The classifier applies only when the actual CON controller has installed its callback and the error is a TransportError with HTTP409 and code invalid_state. It aborts the bridge polling signal, synchronously disposes the exact owned CON controller, marks readiness not_ready with a fixed lease-supersession token, and returns without another poll. Cancellation failure cannot resume polling or become cleanup proof. The controller callback must be installed by the actual controller in the already-listed connect insertion; an environment flag or a no-op callback is insufficient. This proposal does not implement or qualify that future composition.

On a mixed CON+goal instance, aborting the shared stopping signal stops **all further polling and retained-queue retry scheduling**. It does not cancel or mutate native goal Agents or their attempt/session maps. Already-scheduled queue drains may still run and in-flight HTTP operations may still settle; this cancellation is not positive delivery or cleanup proof. The effect is conditional on a CON controller but is not isolated from mixed-instance polling.

Without a CON controller, or for other errors, the existing retry path is unchanged. No global transport wrapper, second poller, automatic hello, provider switch, restart or allowance reset. Existing dispatch and goal native execution paths are unchanged. The listed bridge-core tests gain the positive and adverse crossings; existing reply tests exercise actual owned cancellation when controller composition is implemented.

Exact private proposal: `/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/poll-amendment-20261014-0220/proposal.json`, SHA256dde140139edcf040aec2fdda66d5b8c6f973f61cb060ebb4645d77ddb32f5e24; adjacent proposal.patch is the exact14-line addition. Base bridge SHA256803bfacf0340d6fe793c045bbedc61f4647f518803f940f91657a16adc72e850; proposed candidate SHA2565cfcee85e1e502cdd08fffd24d3907d2d868c09775b478bb443429a570646a23. The private candidate includes no controller wiring and stays unapplied until owner approval. Any intervening source change requires reapplying/reviewing the exact delta against its new pin rather than overwriting the file.

Approval does not extend the current handoff24 source-only expiry:2026-10-14T10:00Z /12:00Rome14October. Pending27 original accounting-unit provenance remains separately unapproved. No Q8/profile/image, current-main integration, merge or operational authorization is added.

## Actual evidence

The private probe loads the actual compiled ControlBridge and ServiceTransport, serving only synthetic errors on an owned ephemeral loopback listener. Eight cases: CON supersession; throwing cancellation callback; absent CON controller;500/invalid_state;409/stale_revision;400/invalid_state;429/rate_limited; already-aborted bridge. Baseline6pass/2fail, zero skips/cancellations; proposed candidate8pass, zero skips/cancellations. Negative cases are stopped by an explicit second-poll test cutoff, never promoted to a product fence. A separate asserted four-second sentinel prevents hanging tests. Candidate projected package typecheck passes. No repository tests or gates were weakened.

Initial private candidate import failed because the private root dependency link lacked dsh-brand. The link was corrected to the existing bundle dependencies; no installation or dependency change. Logs retain that failure and the final result. Each server closes connections and awaits close; each owned scratch journal is removed; sentinels are cleared. No child launcher/process, provider, credential or hosted resource was used. Private source/compiled proposal remains as review evidence.

Independent review found no actionable candidate finding:9/9 actual ServiceTransport/owned synthetic HTTP cases (the8 author cases plus mixed goal-map preservation), projected full bundle typecheck, exact private candidate/compiled equality and original mapping review pass. All9 test ports were independently closed and temp resources removed. Receipt: private independent-step3-poll-proposal-20261014/review.safe.json. The proposal is suitable for an owner approval request only; real controller installation, combined-pin tests and real API/PostgreSQL supersession remain owed. No implementation or full-Step3 clearance follows.

## Operations and acceptance handoff

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. No migration/config/deployment, account/membership/grant/connection, credential or provider/subscription effect; product provider use0, assistant/reviewer compute unknown. No new push: automatic273/6144338846 still covers published457053b3fe only, as actually checked at handoff35. Before any push, independent whole-diff review remains required; every push still requires actual automatic Codex review.

No serving frontend/API/runtime tuple or actual-app acceptance is verified this turn. The36-case ledger remains18partial_L1/3passed_L1/15not_run, CON01-A30not_run. Handoff35 remains the latest implemented and independently reviewed component. This amendment is proposal_ready only; no whole source_ready, operational authorized, deployed, app_verified or owner_accepted promotion. Ask remains disabled. Nothing deployed, so no hosted rollback was needed. Omission of this unapplied proposal is reversible; eventual runtime rollback must retain governed text/erasure and cumulative/uncertain accounting.

Next bounded action: obtain exact source-amendment approval after independent proposal review, and continue the separately permitted CON receipt/controller assembly. Apply the hook only with its real controller, then test actual dispatch, cancellation and no repoll at the combined source pin. Do not bypass pending27, physical cleanup/Q8, shared integration or live batch approval. Broader product and other missions remain open; no autonomous monitor or promise of background work.
