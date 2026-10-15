# CON-01 takeover14 — journal correction and current checkpoint

Session01a1224a-32b4-7222-a017-50a277572d95; Codex sole author/operator, Claude stopped. Same owned worktree/branch codex/con01-takeover-source-20261013. Luis owns integration; Davide product acceptance. This is partial Step3, not complete native or product acceptance.

## Authority and pending request

Handoff11 recovery metadata is explicitly approved and locally implemented (198/6146624582). Original r12 plus approved amendments and expiry renewal remain source-only until2026-10-13T18:00Z/20:00Rome. Handoff13 is frozen SHA25685476cfd700c75e98220a839b8d9195edcdf7c64980c01255efee1113169c02d and pending approval (198/6148392843): exact trusted reserve identity snapshot addition, not yet applied. Its SQL/wire proposal digests and independent preflight are in that document. Private reserve-amendment-request.safe.json records the request. No elapsed time or shared comment is approval.

No deployment, hosted migration/configuration, account/member/grant/privilege/connection, credential read/copy/use/transfer, provider/native Ask or subscription spending is authorized or performed. OP0002r6 setup/human-chat and OP0001r4 Ask remain separate unapproved, not approval-ready batches. No new approval scope is inferred from the journal correction, which is inside the listed child module.

## Exact source, main and review

Published PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Last published automatic Codex review was inspected and clear; no new commit/push this continuation. Dirty Step3 is unpublished and has no final artifact identity or whole-diff clearance.

Fresh remote main3633f5f12a082cd6f438f3a3bc4f957f46cdc95a/treecde6b11372dd2d01ed7ba898b0fcb8a42e1e923b adds Luis's sign-in hierarchy from prior9d9023f9. `git diff --name-status 9d9023f9 origin/main` shows only Studio sign-in/theme/tests and its docs, no native/database source overlap. `git merge-tree --write-tree origin/main HEAD` exits1 with eight held Studio conflicts, diagnostic objectf75fdcbfb5c4fe1b79229b9293d316f0c3bf6d58; it is not a combined accepted tree and excludes current uncommitted Step3. No reset/rebase/merge/conflict-resolution writes. Fresh comments198/199/190/14/31 show no new owner handback; historical acknowledgements remain exact-pin only.

## Journal failure, correction and actual verification

Independent review of47990683 reproduced P2 raw filesystem errors escaping the fixed-code boundary: exclusive creation revealed its full path, and cleanup close errors replaced the intended creation/write failure. Directclose had the same class. Short writes preserved durability. Author added three real fail-before regressions (9pass/3fail), then wrapped open and cleanup errors with fixed codes and disabled reuse after close failure. A fourth directclose regression covers the sibling. The first after-run exposed a test mock affecting readFileSync; restored the mock before observing file bytes, without weakening assertions.

Current reply-plugin.ts SHA256ed705716a0ffec1dd2456dc1d242d7b71b2bd80dab1dd253091e158b8c8c1c0e; tests/unit/reply-plugin.test.mjs SHA256e9e4a9a1ce0a58227c3dd3934eb9089a0bc4a634cc9af7b8b85bddd7ee0b0349. `node --test --test-timeout=15000 tests/unit/reply-plugin.test.mjs`:13/13, zero fail/skip/cancel. `pnpm --filter @sophia/dsh-bundle build`:exit0. Independent own13/13 plus original short-write/path-canary/fsync-close probes pass on those same hashes; private independent-step3-journal-20261013/after.safe.json confirms unchanged source and cleanup. No component finding remains; no complete lifecycle/push clearance.

Current `pnpm test`:2456total,2386pass,70existing explicit skips,0fail/cancel,33.96s,exit0. Log step3-relay-20261013-1400/ordinary-unit-current.log. Earlier3100 collision cleared without intervention; no unrelated process killed. Current relay independent15/15 and transport5/5 remain component evidence. Full DB907/907, SQL48/five and independent PG/HTTP137/137 are retained at handoff12's unchanged SQL/contract hashes. Final pnpm check/artifact/native/whole-diff gates remain due after assembly.

ReplyChildren, complete Cordis child/launcher lifecycle, journal recovery, assembled no-tool context and actual containment are not yet qualified. Temporary bridge guards are not final functionality. Ask remains disabled. No source/runtime capability flag is a useful answer verdict.

## Operation, cleanup and readiness

Serving app/API/runtime tuple remains unobserved for this candidate; actual browser last signed out. Immutable two-account cohort, compatible subscription route/requesting identity/credential lifecycle/quota/finite allowance and expiry, Q13 hosted admission and Linux containment remain unqualified. No HTTP-only app verdict. Product provider use0 for this continuation; Codex/review compute use unknown. All owned journal test descriptors/files and earlier PG probes cleaned; logs retained privately. No unresolved external effect was introduced. Close/durability failures remain unresolved executions, not deletion receipts.

Rollback availability: local unpublished source may be omitted; no hosted rollback owed from this continuation. Future rollout and rollback must preserve governed data, erasure, current readers and cumulative/uncertain accounting. No old command identity or allowance is rewritten. OptionC, disposable homes, conservative withdrawal/no automatic regeneration and conversation-text-v1 remain settled.

Current readiness: components locally_verified/reviewed only as named; whole Step3 source_ready/reviewed false, operational authorized false, deployed/app_verified/owner_accepted unproven. Broader product and other missions remain open.

## Each retained acceptance verdict

No verdict promoted. Exact retained ledger SHA256b25c7f8c8ceb002c8139e1ec3ee5d8a08842a06ac9bc0493bb23fb79d48c1c3f:18partial_L1/3passed_L1/15not_run. These retain their original evidence pins; no L2/L3/L4 inference.

| Case | Verdict | Required evidence |
|---|---|---|
| CON-01-T01 — Separate conversations | partial_L1 | PostgreSQL + native/context tests + actual app |
| CON-01-T02 — Correct authorship | partial_L1 | Database + UI + actual app |
| CON-01-T03 — Retention boundary | partial_L1 | Policy review + database + app |
| CON-01-T04 — Current eligibility | partial_L1 | Database + native race test + app |
| CON-01-T05 — Account isolation | partial_L1 | Auth/browser regression |
| CON01-A01 — Atomic start | passed_L1 | PostgreSQL transaction test |
| CON01-A02 — Lost create reply | partial_L1 | Database + real HTTP/browser adverse test |
| CON01-A03 — Lost send reply | partial_L1 | Database + browser + app |
| CON01-A04 — Changed payload same key | passed_L1 | API/database negative test |
| CON01-A05 — Current membership | partial_L1 | Authenticated API + RLS + app spot check |
| CON01-A06 — Forged author | passed_L1 | Schema/API negative test |
| CON01-A07 — Ordering and pagination | partial_L1 | Database concurrency + browser |
| CON01-A08 — No implicit invocation | partial_L1 | Database + runtime/provider-call spy |
| CON01-A09 — Exact response correlation | not_run | Native/API + browser |
| CON01-A10 — Runtime unavailable | partial_L1 | Local runtime fault + UI |
| CON01-A11 — Original destination | not_run | Concurrent browser + native |
| CON01-A12 — Restart after admission | partial_L1 | Controlled native/service restart |
| CON01-A13 — Uncertain inference | not_run | Native adverse test + accounting |
| CON01-A14 — Current mission | not_run | Database + native + app |
| CON01-A15 — Real quick answers | not_run | Pinned native stub integration + separately real provider/app |
| CON01-A16 — No mutation from conversation answer | not_run | Effective tool inspection + hostile prompt tests |
| CON01-A17 — Summary coverage | not_run | Database + UI + inference counter |
| CON01-A18 — Projection race | not_run | Database/native race test |
| CON01-A19 — Source injection | not_run | Prompt boundary + API negative tests |
| CON01-A20 — Decision actions retained | partial_L1 | Existing decision tests + browser |
| CON01-A21 — Output identity | not_run | Source/reader integration + browser |
| CON01-A22 — Draft and held write | partial_L1 | Browser adverse test |
| CON01-A23 — Read errors independently | partial_L1 | Browser/API fault test |
| CON01-A24 — Mobile and accessibility | partial_L1 | Actual browser at 390, 900/1000 and 1440 widths |
| CON01-A25 — Privacy during read/stream | partial_L1 | API/replay/native + browser |
| CON01-A26 — Partial and cancelled replies | not_run | Native/result/API test |
| CON01-A27 — No collateral regression | not_run | Existing relevant suites + smoke app checks |
| CON01-A28 — Bounded context and spending | not_run | Long-context fixture + request/accounting inspection |
| CON01-A29 — Rollback and erasure continuity | partial_L1 | Release rehearsal + operator evidence |
| CON01-A30 — Actual app non-fixture proof | not_run | Codex app/browser + authorized provider evidence |
| CON01-A31 — Parallel ownership | not_run | Diff/artifact/coordination inspection |

Next bounded action: receive the exact handoff13 source-amendment disposition, then apply and qualify only its approved additions; permitted child lifecycle work can continue within the existing expiry. Final combined independent review, every-push automatic review, separately approved effect batches, deployment and actual-app testing remain required.
