# CON-01 takeover41 — retained Stop receipt delivery

Same mission, worktree and Codex author session. Previous turn corrected and independently verified the Stop evaluator. Approved handoff24 source-only authority ends2026-10-14T10:00Z/noon Rome. Pending27/36 remain unapplied; Q8, current-main/shared integration and operational batches remain held. Claude stays stopped.

## Candidate and current external state

Only listed reply-child.ts and its unit tests changed, from e6deb28f/08d3f2fb. Before-write record198/6158677042. Current source SHA2562e975233bf7595080d5a65163f0ed5bd9cf6074128c9e984bb28c85a22ed8200; tests0cfe09cb9baf3cbde1d79ba2740805949c02495dac6e760ce71a4ccb0f026423. Before copies/logs are in private stop-delivery-20261014-0315. Bridge/plugin/SQL/wire/index/profile unchanged.

Fresh remote refs and GitHub comments confirm mainc1d4d08da0ab393be5f55bfef3c1b8645ad21095, published draft273457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c and no newer PR199 owner handback than6157154591. Automatic review273/6144338846 still reports no major issues for that published commit only. Mission thread contains no new scope/operation approval. No push/merge/rebase/reset/artifact recording occurred.

## Behavior

executeStop validates canonical identity and fences the known attempt synchronously. It installs a retained evaluation record before any callback; concurrent calls join that active evaluation. Once it ends, later replay invokes stopReceipt again and therefore performs fresh proof evaluation. Unknown ownership and unavailable delivery return explicit unresolved; missing transport still fences a known queued admission.

Each command/stage owns one immutable ReplyReceiptDelivery with its original body, finite deadline, retries and acknowledgement facts. An outcome_unknown followed by checked retains two distinct stage deliveries. Later same-stage decisions do not reset an exhausted sender, rewrite its body or infer acknowledgement. Command handling resolves after retaining delivery, without waiting for HTTP.

Failures from accounting, recovery, disposal or supersession return unresolved with no new receipt POST. There is no generic terminal fallback. Existing unsignalled HTTP may still finish after disposal and retain its factual acknowledgement. Disposal cancels all retained stage waiters and pending check evaluation. A content-free status separates active evaluation, latest candidate stage, unresolved evaluation, retained stage and positive HTTP acknowledgement.

Stage retention has no eviction or cleanup authority. A checked stage's acknowledgement does not settle an earlier unacknowledged outcome_unknown stage. An exhausted sender with a lost ACK stays unresolved; the future reconciliation/retirement path must resolve that fact without resetting request allowance or claiming an absent ACK.

The checker is still a synthetic L1 adapter boundary. No real physical verification, serving bridge composition, recovery, retirement, deletion or capacity release is provided by this slice.

## Verification

Author201 focused passes, zero failures/skips/cancellations; ordinary2559passes/70existing skips/zero failures/cancellations. Build, whole-file structural audit and git diff --check pass. Six new groups cover concurrent/reentrant replay, unknown/checked independent ACKs, exhausted same-stage bounds, failed accounting with zero POST, missing transport/unknown ownership, and disposal with pending checks or late HTTP ACK. An initial test fixture incorrectly reused a Stop ID for a different attempt; it now explicitly verifies collision rejection and tests unknown ownership with a distinct ID.

Three actual compiled-source mutations each fail their adverse regression with zero cancellations: caching checked instead of fresh evaluation, recreating the same-stage sender, and posting a fallback after failed accounting. Dist restored and focused tests rerun. Evidence: private stop-delivery-20261014-0315/{focused.log,ordinary.log,mutation-*.log,mutations.json}.

Independent exact-pin review cleared201 focused tests, the separate failed-accounting executeStop adverse probe, source/dist equality and structural audit with no findings. Source hold released. Actual owned Fastify/API/ServiceTransport/PostgreSQL17.6 testing used a real SQL claim, member withdrawal and worker Stop command: the first outcome_unknown POST committed before its response was lost; identical-body retry retained one durable stage. A subsequent checked stage preserved answered_stage=outcome_unknown, settled the binding and created exactly one retirement command/outbox. A later replay ran a fresh check without a new POST. Usage and reservations remained0.

The physical callback was explicitly synthetic L1, and the local registry was a queued fixture with the durable claim separately created through SQL. This proves the receipt/API crossing, not native ownership, physical verification, restart or whole admission composition. Receipt: `/Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover/independent-step3-stop-delivery-20261014/review.safe.json`. The held-settle/disposal adverse probe returned unresolved for joined and repeated calls with zero checks, POSTs or stages. Component locally_verified and independently reviewed only; no whole-Step3 or push clearance.

## Operations and next action

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. No hosted migration/config/deployment, accounts/members/grants/connections, external credential access/transfer, provider/subscription execution or product spend. Product provider use0; assistant/reviewer compute unknown. Author tests are terminal and own synthetic resources; independent cleanup verified PostgreSQL31397 and test31405 absent, ports55312/55323/55324 closed, temporary cluster removed, and app/proxy/pools/test database closed. All reviewer processes are terminal and no product source edits came from the reviewer. Private evidence stays outside Git.

Nothing deployed; no hosted rollback ran. Before-source files and published candidate remain available. Eventual operational rollback must preserve governed data/erasure and cumulative/uncertain accounting. Serving app/API/runtime tuple and actual signed-in two-account app verification remain unproven. The36-case ledger stays18partial_L1/3passed_L1/15not_run, CON01-A30not_run. Ask stays disabled; broader product/other missions remain open.

Next bounded action: assemble terminal lifecycle reporting: failed-after-delivered on timeout/invalid relay/unfinished turn, while completed turns continue through capture. This must preserve the original settlement barrier and must not fence a valid completed answer while waiting. Recovery, retirement and bridge boundaries remain after that. Preserve earlier unacknowledged receipts and all existing physical, journal, accounting and database cleanup predicates. Pending27/36, Q8/shared and operational authority remain separate. No autonomous monitor or background promise.
