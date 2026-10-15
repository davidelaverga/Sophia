# CON-01 takeover 76 — concrete bridge/controller composition

Codex sole implementer; source-only expiry 20:00 Rome14October2026. Before-write198/6169053913. Published HEAD remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. No push or operational effect.

Initial unpublished pins: reply-child ec4dabaa1b4d418c28497bbff1185c559a712f3a682632845011c393bb631e95; control-bridge6b41d12de54536e1fd988e0d6c3bf819be8f573f3e36743a8bfb6257edc0527f; index34119dedaf3eeb3041c320efead8a5e836235cb6a490cbe6b6bb67f859020e9b; tests011f58e11fa45e5b7e6d9ad8573013ee79de2fe74c1fb4df71c2903d44002911. Source/tests frozen for independent review; these are not cleared pins yet.

## Concrete changed path

Bridge connect constructs ReplyController only after authenticated hello and checks shutdown before adoption. Project comes from hello; runtime unit from settings; lease is the private instanceId already used by ServiceTransport. CON hello bindings stay unrecovered and block fresh capacity. execute routes CON outside goal maps/hooks; default-null index remains disabled. The disposer reaches the controller before existing goal teardown/flush. Goal dispatch, poll, constructor, receipt onAck and session callbacks stay unchanged.

Controller latches one resource identity from a validated command, owns one ReplyChildren registry and dedicated transport receipt delivery, and installs create/Stop work synchronously while retaining its promise without blocking the shared serial queue. It snapshots configured route/bounds, generates nonce, binds original create command/epoch/unit and constructs actual ReplyAdmission, ReplyDelivery and ReplyChild. Claim/go/reserve/observe/settle use the actual same ServiceTransport. Start contains original prompt, identity, epoch and approved route/maxTokens; existing parser gates readiness and go. Unknown cleanup is never turned into checked/rejected cleanup acknowledgement. No retirement/deletion/recovery completion is added.

Only owned launcher+fd3 acquisition is injected at this stage. The tests use synthetic ChildProcess/Duplex handles; there is still no production launch adapter, qualified host/profile/route or live provider path. This is concrete controller composition with a synthetic process boundary, not serving/native qualification. Source-owned actual spawn wiring remains next after review.

## Author verification

Build and typecheck pass. Focused reply-child/reply-plugin259pass/0fail/cancel/skip. Six additional tests exercise actual ControlBridge.start/connect/dispatch and HTTP ServiceTransport: held claim then Stop, wrong project/unit/resource with one latch, disabled configuration and shutdown racing hello, source-owned start/parsed readiness/go, Stop before late ready, and unrecovered hello blocking fresh capacity. Provider/model lookup and recurring polling are replaced in fixtures; HTTP responses are synthetic, not PostgreSQL/API authorization evidence.

Whole-file structure initially found execute complexity16; extracted refusal and route checks reduce it within12. Whole-file --no-ignore structure and git diff --check pass after correction. Ordinary suite session60057 completed exit0 against these frozen pins:2618pass/70existing skips/0fail/cancel,34.258seconds. Independent reviewer is rechecking this slice; no clearance yet. Private evidence directory controller-20261014-1305 under the takeover journal retains all author logs.

## Initial independent findings (not yet corrected)

Shared198/6169235689 records two accepted P2 findings at the initial pins. The reviewer recovered the original synthetic canary from retained admission.operations.prepare after both claim refusal and successful parsed-ready/go: the controller closure retains full prompt beyond admission. A source-owned release hook must cover completion/refusal/timeout/Stop/dispose without starting admission inside the registry factory. The second finding is goal-lane isolation: invalid optional reply settings currently stop connect before /ready; they must disable replies while preserving goal readiness. The malformed owned-launch handback probe is still under review and is not a confirmed finding here.

Initial focused/ordinary passes do not clear these findings. Hold remains until reviewer releases the exact source for correction. Production remains disabled; no sensitive real text was used in the reproducer.

## Corrected candidate, recheck pending

After the reviewer released the first hold, ReplyAdmission gained a source-owned releaseInput callback on Stop/dispose and admission finally. The controller removes the original cloned prompt from that retained closure; original authority, refs, unit and caller-owned data remain unchanged. Release failure remains unresolved and fences execution. No eager admission run is introduced. The bridge's invalid optional reply configuration now emits a fixed diagnostic and constructs a disabled CON controller, then continues ordinary goal reconciliation/readiness.

Corrected pins: child64a865bca1e74242103a1f941004a80f24da710b75a939c6f9feb0b1024553e0; bridge6b9cc730990b292a3ae85537606efc4840b70480df9a73584f22ff660a43fbd4; index34119ded unchanged; tests7adbdf1f869569013ca483a6c160de07ac77c19deb22d58f5694b74f11e5d614. Build/typecheck/whole-file structure and261 focused tests pass. Additional tests attempt prompt recovery after refusal, release, Stop, disposal and timeout with an unresolved underlying claim, and check that invalid reply settings preserve actual /ready without a claim. An initial timeout test used too few event-loop ticks for its real20ms timer; it failed260/1 and was corrected to await the original admission promise with the existing5s asserted sentinel, not a relaxed assertion.

Original independent before-review.safe.json read in full. Corrected source/tests frozen again for independent countercases, mutations and remaining lifetime/transport review. Ordinary corrected session8455 completed exit0:2620pass/70existing skips/0fail/cancel,33.501seconds. No independent clearance yet; initial259 and ordinary2618 are historical author evidence, not corrected validation.

## Second independent findings, ownership correction pending

Shared198/6169363798: on corrected child64a865bc, the original prompt/configuration countercases pass, but two further P2s reproduce. Mutating the launch callback's returned wrapper after start redirects disposal to foreign handles. A valid launcher with stream:null receives no immediate EOF after construction fails, and later disposal throws TypeError. The independent adverse-corrected probes reproduce these with owned synthetic handles and loopback HTTP, no native/provider operation; probe68673 terminal and fixture cleanup reported. Exact immutable handle snapshots, valid partial-resource retention/cancellation and exception-contained cleanup are required before clearance.

Read-only checkpoint refreshed origin/main e2da7d89/tree930c188b unchanged, PR199 latest preservation6165765212 and owner14/6132091412,31/6132091149 unchanged; no new handback or combined integration authority inferred. No source edit while waiting for the second hold release.

## Ownership correction, final recheck pending

Reviewer focused29741 completed261pass before explicit hold release; full ownership-before-review.safe.json read. The controller now snapshots exact acquired launcher, control and stream references into immutable records. It reads only own data properties, never caller getters. Valid partial acquisitions receive immediate EOF/destroy if the other handle is invalid. Child adoption failure also closes the acquired resources. Disposal contains registry and per-resource failures independently, records fixed unresolved codes and never signals by PID or claims physical settlement. Caller wrapper mutations cannot redirect its retained references.

Current child141bfe46d5c6229632bf2f000cbf1335a10540bb9869142b150a6fd45b119e1f; testsb4c5cd3bac021aeb1b988b8ebb8c9bf933912900574b67a34bc68dd2f7286a35. Bridge6b9cc730/index34119ded unchanged. Build/typecheck/whole-file structure/diff pass;265 focused pass. Four additional tests cover wrapper mutation, both partial acquisition directions, one cleanup failure without skipping the other resource, and a throwing accessor without invoking it. Actual owned launch remains a synthetic seam; no real launcher qualification inferred.

Source/tests frozen for independent original-countercase/mutation/ownership and actual API/PG recheck where appropriate. Ordinary suite43190 completed exit0 against these exact pins:2624pass/70existing skips/0fail/cancel,33.363seconds. No author test handles remain. No component clearance yet.

## Handle-classification sibling correction

Independent ownership-proxy-before-review.safe.json was read in full. It confirmed original ownership fixes and265 focused passes, then reproduced P2: a stream Proxy throwing from getPrototypeOf escaped instanceof before retaining its valid launcher counterpart. No acquired record or EOF remained even on disposal. Reviewer released the hold after all probes/tests and fixture cleanup.

Each launcher/stream/control classification now independently catches failures and returns unavailable, allowing valid partial resources to be retained and cancelled. Both throwing launcher and throwing stream directions are tested. Current child04466006041405d32a5a0e449dfdd342b76c8df51bec69d8b8cb227c7448fde2; tests15b4a17a886ba7888439c79c5b53a9f48989ad9d6841e0d8471d2f48690fb0d2. Bridge/index unchanged. Build/whole-file structure/diff and266 focused pass. Source/tests frozen again for independent recheck and mutation. Ordinary29551 completed exit0 on these pins:2625pass/70existing skips/0fail/cancel,33.447seconds. Typecheck also passes; no author handles remain. No actual API/PG or production qualification is inferred from synthetic loopback/handle tests.

## Limits and handoff

Pending27 original-unit erased-payload recovery,36 supersession,Q8/profile/actual Linux qualification and current-main shared integration remain held. Unqualified inspect/retire stays explicit. No deployment, hosted schema/configuration, account/grant changes, credentials or provider execution. Setup/human-chat and Ask batches remain unapproved/not-ready. Product-provider use0; coding consumption unknown. Ask disabled; actual app/API/runtime tuple and two-account native answer unverified. Prior acceptance ledger18partialL1/3passedL1/15not_run unchanged.

No governed data changed or live rollback required. Local source and receipts preserve recovery. The ordinary suite is terminal. Independent reviewer remains active; source stays frozen until review release. Author also flagged prompt retention in controller admission closures for the independent review; no clearance is inferred from green handshake tests. Next bounded action: resolve concrete review findings, complete actual API/PG crossing if needed, then assemble owned process acquisition without bypassing target/profile/operation gates.

## Final independent component clearance

The independent after-review.safe.json (independent-step3-controller-20261014, 2026-10-14T13:36:01Z) was read in full. Exact child04466006/tests15b4a17a/bridge6b9cc730/index34119ded pins are cleared for this bounded component. Independent266 focused tests, original ownership/proxy countercases, assertion-failing catch-removal mutation and whole-file structure pass. Source/test hold released; no remaining actionable finding in this slice.

Two actual local Fastify/PostgreSQL17.6 crossings pass in runner55800: authenticated hello/poll and original private-instance claim → parsed synthetic ready → go → one durable delivered receipt despite identical-body lost-response retry → Stop outcome_unknown; and Stop while the committed claim response is held, followed by zero launches/go after release, create outcome_unknown and no false Stop receipt. Both have zero usage/reservations. Native handles remain synthetic and background polling is replaced by explicit dispatch. Initial runner51657 failed only because its private script called nonexistent registry.inspect; corrected predicate retained original criteria. Both disposable clusters/homes, test processes and eight ports are cleaned.

Author ordinary2625pass/70existing skips remains separate evidence. No whole-Step3/4, push/merge, Linux/profile, provider or live acceptance is claimed. Acceptance ledger unchanged. Next bounded source action: fixed owned-process acquisition adapter with real local pipe/EOF tests, production disabled and existing pending27/36/Q8/shared/operation restrictions intact.
