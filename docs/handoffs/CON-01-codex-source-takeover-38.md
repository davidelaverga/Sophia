# CON-01 takeover38 — create-command delivery ownership

Same mission, author session and worktree. Codex remains sole implementer; retained reviewer is independent. Previous turn made verified progress on receipt delivery. Approved24 source-only authority still ends2026-10-14T10:00Z/12:00Rome. Amendments27 and36 remain pending and unapplied. No deployment, shared-main or Q8 authority is inferred.

Published draft PR273 is unchanged at457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Last fresh mainc1d4d08da0ab393be5f55bfef3c1b8645ad21095 and PR199/6157154591 remain the integration references; eleven held conflicts are unresolved. No merge/rebase/reset/push or artifact recording occurred. Automatic review273/6144338846 covers only the published head.

## Implemented behavior

Before-write states:198/6158212629. Only listed new reply-child.ts and its tests changed. Source SHA256e6399e5612666781beb1280fcb15905784e37a56670d4cedaa787938dcc30b70; tests721d4c0c9a73d79de440d0943e694272dfc50d8529e6e940f5b5fbc48f6b7915. Before94a source/tests are retained in private registry-delivery-20261014-0240. Bridge803bfacf, plugin7444b899, SQL/wire/index/profile remain unchanged.

ReplyChildren.executeCreate now owns a bounded retained command record and its ReplyReceiptDelivery. It validates current owner, snapshots the command, and reserves child admission synchronously before returning, so a same-turn Stop fences a queued child before its factory runs. The delivery record is installed before any factory, claim or transport callback can reenter. Exact duplicates join the original command; a changed body/owner, reused command ID for a different attempt, or another create for the same attempt is refused.

Once admission yields its receipt, command handling retains and starts delivery without waiting for HTTP. A slow receipt cannot delay a following Stop. Disabled/runtime-busy denials also retain their original immutable receipt. Content-free deliveryStatus reports queueing and factual acknowledgement separately. A fixed64-record bound refuses new intake before claim/spawn; no record is evicted because it was acknowledged. Physical-retirement pruning remains to be implemented, so this is not a complete long-lived controller.

Disposal stops owned admissions and receipt waiters. A candidate arriving after disposal is not newly published; an existing unsignalled HTTP request may still acknowledge later, with disposed state retained. No cleanup proof, new command, allowance reset or receipt is produced by disposal.

This connects the registry create-command path, **not yet ControlBridge.execute/connect**. The serving bridge's temporary conversation_child_unqualified fence remains. Stop/inspect/retire receipt classification, terminal lifecycle publication, hello recovery, physical verification and full bridge composition remain outstanding.

## Verification

Author183focused pass/0skip/0fail/0cancel; ordinary2541pass/70existing skips/0fail/0cancel. Build/typecheck, whole-file structural audit and git diff --check pass. Eight new cases cover slow HTTP and reentry, same-turn Stop, actual released-child Stop, mutated/foreign identity, retention cap and cached denials, two concurrent asks, disposal before/after admission, and missing/invalid finite delivery configuration.

Three actual compiled mutations fail their adverse tests, zero cancellations: defer child reservation past same-turn Stop; await receipt ACK inside command execution; allow a65th retained command. Compiled output was restored and focused tests rerun. Initial constructor complexity14 was corrected by extracting the named delivery-option snapshot helper; final structure audit passes without suppression. Evidence: private registry-delivery-20261014-0240/{focused.log,ordinary.log,mutation-*.log,mutations.json}.

Independent review cleared these exact source/test pins with no actionable findings: 183 focused passes, structural audit and source/dist identity match. Receipt: `/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/independent-step3-registry-delivery-20261014/review.safe.json`. The reviewer independently exercised executeCreate against the actual Fastify API, ServiceTransport and PostgreSQL 17.6 through an owned loss/delay proxy: command handling returned before HTTP acknowledgement; a lost committed response retried an identical receipt and produced one durable rejected stage, failed reply and scrubbed payload, with zero executions, reservations or usage. A subsequent duplicate joined the retained command without resending. A late acknowledgement after waiter timeout and registry disposal remained recorded without a new POST. A companion lower-level sender received actual HTTP 403 for a wrong attempt; registry identity denials were tested separately and are not represented as that API crossing.

Reviewer cleanup verified processes 25439/25447 absent, ports 53910/53921/53922 closed, temporary cluster absent and app/proxy/pools closed. The disabled factory created no native Agent or provider work. Source hold is released for this create-path component only. No whole-Step3 or push clearance is claimed.

## Operations and handoff

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. No hosted migration/config/deployment, accounts/members/grants/connections, external credential reads/transfers or provider/subscription execution. Product provider use0; assistant/reviewer compute unknown. Author new tests use owned synthetic clocks/streams; registered disposal closes their state. Existing focused HTTP/process fixtures retain their own cleanup. Private evidence remains outside Git. Nothing deployed, so no hosted rollback ran; published and before-source candidates remain available. Eventual rollback must preserve governed conversation records/erasure and cumulative/uncertain accounting.

Serving frontend/API/runtime tuple and actual signed-in app are still unverified. The36-case ledger stays18partial_L1/3passed_L1/15not_run, CON01-A30not_run. This registry component is locally_verified and independently reviewed at the stated pins. Whole source_ready, operational authorized, deployed, app_verified and owner_accepted remain unproven. Ask stays disabled and broader product/other missions remain open.

Next bounded action: implement remaining command/terminal/recovery composition and physical-proof adapter boundaries before replacing bridge fences. Return only truthful Stop/retire classifications, preserve goal dispatch and require every existing cleanup/accounting predicate. Do not bypass pending27/36, Q8/shared integration or separately approved live batches. No autonomous monitor or promise of background work.
