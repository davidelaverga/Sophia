# CON-01 takeover44 — original receipt acknowledgement barrier

Same mission/session; Codex sole implementer, Claude stopped. Handoff24 approval remains source-only through 2026-10-14T10:00Z/noon Rome. Before-write record: issue198/6159131147. Only approved reply-child source/tests changed; pending27/36, Q8/profile, shared integration and operations remain separate.

## Candidate and behavior

Published PR273 remains `457053b3fe619631f0d2e2fcc1e3edc98cfc5348`, tree `ec71aa3a83e6208ff559d075a881b374fdb8593c`. Unpublished child SHA256 `6001bf09d813ad98f6a8c3c8a3ac1b0ae3541ff49cfa10b31b83bc76d7ff5fd9`; tests `d6cb47c605e01cdef74a642031b579ddaa7ee5554a1be51514f51b65df08144c`. Plugin, bridge, SQL, wire, profile and artifacts unchanged from handoff43.

`awaitReceiptAcknowledgements` observes the original primary sender, terminal sender and every retained Stop stage, within a finite cancellable wait. It never sends, retries or resets any allowance. A missing owner/primary, pending or unresolved terminal watcher, pending/unresolved Stop evaluation, or any missing positive ACK prevents proof. A cancelled terminal candidate is excluded only with the registry Stop fence, disposed sender, zero transport attempts and no in-flight request. This is exclusion of a provably never-dispatched candidate, never a fabricated ACK; primary and Stop senders are never excluded.

The returned frozen token is privately bound to its registry and exact receipt snapshot. `receiptAcknowledgementsCurrent` rejects clones, other registries, changed authority, disposal, changed stages and even a repeated same-stage Stop evaluation. Generation increments before invoking the evaluator. The token is receipts-only evidence: it grants no host deletion authority. Future deletion still needs per-attempt serialization and fresh revalidation after awaits. Future inspect/retire senders must join the barrier before composition; none is assembled here.

## Actual verification

Author: bundle build; whole-file structural oxlint; focused child/plugin tests **228 passed**; ordinary `pnpm test` **2586 passed, 70 existing skipped, zero failed/cancelled**; `git diff --check` passed. Initial structural complexity15 was corrected by extracting `receiptOwner`, retaining all predicates. Four compiled mutations each cause an actual bounded assertion failure, zero cancellation: omit earlier Stop stages; omit Stop evaluation generation; omit the Stop fence; accept a cloned proof. Dist restored after each sequence. Private evidence: `receipt-barrier-20261014-0354/{author.safe.json,mutations.safe.json,focused.log,ordinary.log}`.

Independent reviewer cleared the exact source/tests and released its source hold. Original focused suite228/228, restored source/dist equality and structural audit pass. An initial private copied-suite run had219 passes/9 module-import errors from one remaining relative dynamic import; logs retained and the original suite rerun without source/assertion changes. This infrastructure failure is not counted as product evidence.

Three independent real local PostgreSQL17.6/Fastify/ServiceTransport crossings use actual ReplyChild/Admission/registry and an owned synthetic Node/fd3 launcher:

- Held primary receipt before commit blocks proof; delivered and failed ACKs subsequently yield count2 and a current token. Cloned/forged tokens are refused.
- Actual withdrawal/Stop cancels the never-dispatched failed candidate; primary ACK yields count1 without pretending the cancelled candidate was acknowledged. Fresh Stop evaluation invalidates that proof; its actual acknowledged stage yields fresh count2.
- Expired primary waiter followed by late commit/ACK leaves the terminal watcher unresolved and proof unconfirmed. No allowance reset or observer POST occurs.

These are L1 synthetic-runtime crossings with actual local database/API, not native Agent/provider/profile/physical cleanup qualification. Reviewer evidence: `independent-step3-receipt-barrier-20261014/{review.safe.json,receipt.safe.json,tests.log}`.

## Effects, cleanup and readiness

Owned PG37688/test37696/stubs37721/37734/37749 are absent; ports56833/56850/56851/56867/56868/56885/56886 closed; temporary cluster removed; apps/proxies/pools/test database closed. Author runner42558 terminal exit0. Reviewer made no repository edits. No hosted migration/config/deployment, account/member/grant/connection effects, external credential access or native/provider/subscription execution. Product provider use0; assistant/reviewer compute unknown. Source before-copies and published HEAD remain available; no hosted rollback needed. Eventual rollback must preserve governed data and cumulative/uncertain accounting.

Last observed main remains `ceda3f3eb298a0021ca81d917a1db3ead3c637f4`, tree `77c2e9dbc9e8006d2b4ce486530e735ad429b2c3`; eleven published-HEAD integration conflicts remain held. Preserve #287/#299–301/#304. No main refresh or merge in this slice. No push: actual automatic review273/6144338846 still covers published457053b3 only. Whole-diff independent review before publication and automatic review after every future push remain mandatory.

Component locally_verified and independently reviewed only. No whole-source_ready, whole-candidate reviewed, operational authorized, deployed, app_verified or owner_accepted promotion. OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. Browser access was established in handoff43; no new app test here, serving tuple still unverified. The36-case ledger remains18partial_L1/3passed_L1/15not_run; A30not_run. Ask stays disabled. Broader product and other missions remain open.

Next bounded action: assemble the scoped retirement/recovery preflight using this receipt barrier, complete journal/usage and the eight real API predicates. Require fresh no-live/no-future-writer, closed relay, no-link deletion and ENOENT proof before pruning. Pending27 original-unit recovery, pending36 poll supersession, physical host/profile qualification and bridge composition remain owed. No autonomous monitoring or promise of work outside this session.
