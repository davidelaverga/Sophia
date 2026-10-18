# CON-01 takeover43 — terminal failure delivery after durable admission acknowledgement

Same mission/session, Codex sole author; Claude stopped. Previous turn completed independently reviewed child terminal classification. Handoff24 source-only authority remains through2026-10-14T10:00Z/noon Rome. Only listed reply-child.ts and its tests changed. Before-write shared record198/6158985749. Pending27/36, Q8/profile, current-main/shared integration and operational authority remain separate.

## Exact source and behavior

Published PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Unpublished child source3224c6014f646c348c63e6891df399c47180849e02a3e973e284d97baece7b81; tests5f6e376672336298fd4708ea7edca251c362d3a528f93749fdc4cad1be62d658. No bridge/plugin/SQL/wire/profile/artifact edits. Private author evidence and before copies: terminal-delivery-20261014-0341.

ReplyAdmission retains one terminal receipt candidate only after its original admission returned released. It waits the owned child's original terminal/accounting result. Completed and explicitly stopped attempts have no autonomous failed receipt. Disposal/accounting failure is unresolved, without a generic terminal fallback. Candidates remain historical; registry checks current authority again.

ReplyChildren starts a background terminal watcher after retaining the delivered sender, without blocking command completion on HTTP. A failure has its own immutable sender/body, deadline, retry allowance and acknowledgement. Its deadline is fixed when that candidate is retained, before waiting for the delivered sender. Failed POST requires actual positive delivered ACK, not dispatch order or a completed local handler. Registry rechecks current epoch, admission, Stop and disposal after waits and immediately before each transport invocation, including retries.

Stop/disposal cancels not-yet-dispatched terminal work and its retries; already dispatched unsignalled HTTP may still commit and its late ACK stays recorded. Delivered and failed senders remain separate for the future retirement barrier. If the delivered waiter ends unconfirmed, a later ACK is a factual update only: it does not create a new watcher, retry budget or deadline. A duplicate create joins its retained original execution. No entry is pruned and no cleanup is inferred from either ACK.

## Evidence

Author219 focused tests pass, ordinary2577pass/70existing skips, zero failures/cancellations. Bundle build, whole-file structural audit and git diff --check pass. New cases cover held delivered ACK, both stage identities/ACKs, completion, explicit Stop, failed accounting, disposal/epoch changes while waiting, expired-waiter late ACK, immutable failed retry, late failed ACK after Stop, autonomous timeout and Stop during retry delay.

Three compiled mutations fail bounded regressions with zero cancellation: bypassing delivered ACK guards, fabricating a terminal result after failed accounting, and removing cancellation for a waiting failed sender. Removing cancellation against the retry POST-count assertion alone survived because the independent transport guard still prevented POST; that sensitivity limitation is retained in mutations.safe.json. The waiting-sender test detects the missing cancellation. Dist restored. Initial fixture errors were corrected: endReceiptChild advanced the fake clock through the primary HTTP deadline, and a changed inspect epoch reused one immutable command ID. No assertion was relaxed.

Independent exact-pin review cleared219 focused tests, dist/source equality and structural audit, with no actionable findings; source hold released. Actual owned PostgreSQL17.6 + Fastify/API + ServiceTransport exercised the real ReplyChild/Admission/registry chain using an owned synthetic Node/fd3 launcher and real claim/go calls:

- Delivered request held before SQL commit: zero failed requests before positive ACK; then exactly one failed stage, answered_stage remains delivered, request failed and one retire command.
- Actual withdrawal and Stop while delivered commit was held: failed POST count0, terminal sender cancelled, late primary ACK retained; request cancelled, no retirement shortcut.
- Delivered waiter expired before late commit/ACK: request remains running with delivered recorded; failed sender unresolved/attempts0 and replay cannot reset it. This is retained uncertainty for later reconciliation, not successful terminalization.

All three scenarios pass; usage/reservations0. The synthetic launcher is L1 only, not native Agent, provider, profile, containment, physical home or serving-bridge proof. Evidence: private independent-step3-terminal-delivery-20261014/{review.safe.json,receipt.safe.json,tests.log}. Component locally_verified and independently reviewed only; no whole-Step3 or publication clearance.

## Browser and integration limits

Read-only IAB tab5 was refreshed at the existing project Resources URL. The rendered app again shows Account/Invite, Studio/Goals/Tasks/Knowledge/Updates/Resources navigation, Resources COMING, and no Conversations navigation. No form, account, invite, room, connection, Ask or other effect was invoked. Tab retained for handoff. This proves browser access and the observed current surface only; it is not a CON acceptance test or proof of the serving app/API/runtime tuple. Private browser.safe.json records it.

Last refreshed main remainsceda3f3eb298a0021ca81d917a1db3ead3c637f4/tree77c2e9dbc9e8006d2b4ce486530e735ad429b2c3. #304 Goals overview joins #287/#299–301 preservation requirements. Eleven published-HEAD merge-tree conflicts remain held; no accepted combined base or shared-file write window inferred. Automatic PR273 review6144338846 covers published457053b3 only. No push, merge, reset, rebase or artifact recording; every future push still requires actual automatic review.

## Operations and handoff

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. No hosted migration/config/deployment, accounts/members/grants/connections, external credential access/transfer or native/provider/subscription execution. Product provider use0; assistant/reviewer compute unknown. Author and independent runners are terminal. Reviewer sessions9054/42355 exited0; PostgreSQL35907/test35915 and stubs35933/35951/35964 absent; ports56361/56377/56378/56397/56398/56414/56415 closed; temporary cluster removed and apps/proxies/pools/test database closed. Reviewer made no repository edits. No hosted effects to roll back. Before-source copies and published HEAD are available; eventual rollback must preserve governed records, privacy state and cumulative/uncertain accounting.

Acceptance ledger unchanged:36cases,18partial_L1/3passed_L1/15not_run; A30not_run. Component locally_verified and independently reviewed, no whole-source_ready/whole-candidate reviewed/operational authorized/deployed/app_verified/owner_accepted promotion. Ask disabled. Broader product and other missions remain open.

Next bounded action: assemble retirement's original-receipt acknowledgement barrier and scoped recovery handoff without claiming host deletion. It must cover primary delivered, failed and every Stop stage separately, preserve late/uncertain HTTP outcomes, close capture, verify complete journal/usage and all API predicates, and require real no-live/no-future-writer and no-follow deletion proofs before any prune. Pending original-unit recovery27 and poll36 amendments, physical host/profile qualification and bridge composition remain owed. No autonomous monitor or promise of work outside this session.
