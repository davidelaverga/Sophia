# CON-01 source takeover 4 — automatic-review ACL corrections

Davide owns product/operational acceptance; Codex session `01a1224a-32b4-7222-a017-50a277572d95` remains sole source author in `sophia-con01-source-harness-review`, branch `codex/con01-takeover-source-20261013`. The [source-only approval and GO](CON-01-codex-source-takeover-2.md) (#198 comments 6133920949 / 6133983482) expire 2026-10-13T08:00:00Z. They authorize local source and reviewable draft publication, not merge or hosted/provider effects. Historical owner ACKs retain their original pins.

## Candidate and findings

Draft [#273](https://github.com/davidelaverga/Sophia/pull/273) second push was `9aad383c26bcefea42d33a07ab94fa1d3483a3e3`, tree `e947f7808bfe9e85aee5f0b584ce7d730e74606e`, against main `32854caf01e7d5e493e096baead019506b1d1de3`. Its mandatory exact-head automatic review completed 2026-10-12T23:29:39Z with [P1 unintended callable grantees](https://github.com/davidelaverga/Sophia/pull/273#discussion_r4253232472) and [P2 missing required grants](https://github.com/davidelaverga/Sophia/pull/273#discussion_r4253232476). These invalidated the affected Q13 activation readiness, despite prior pre-push clearance. Both were reproduced before correction on unchanged published SQL: three controls passed, two new regressions failed, zero skips. The fresh owned cluster was removed.

Corrected executable source is `1d8ac7501f8362d104c86988ee9bbf49030c0ef1`, tree `cce32c16bdb87cd8686bff7341942336a829ad21`. It changes only the read-only activation query, owned-cluster admission tests and [Q13 states](../coordination/CON-01/Q13_SOURCE_STATES.md). Complete ACL equality covers all 27 reviewed callables, owner and expected assembler/API/worker grants, grantors and grant options. NULL ACL expands to PostgreSQL's default, including PUBLIC EXECUTE. Positive checks additionally require the assembler's 20 relation SELECT privileges and schema USAGE. Installed grants, function bodies, policies, runtime/bundle/host/configuration, locks and generated contracts are unchanged.

The independent reviewer cleared this exact executable pin against main, with no actionable findings; it ran no operations or tests. This handoff/README/progress delta requires final review. The publication receipt names the final documentation head/tree, and a fresh automatic review must be checked after that push. The earlier automatic clear applies only to first push `d06f98a1`; no clear is inferred for either later head.

## Actual verification

On clean `1d8ac750`, fresh exclusively owned loopback PostgreSQL 17.6:

```text
node --test --test-concurrency=1 --test-timeout=120000
  packages/persistence/src/conversation-assembler-admission.db.test.ts
  packages/persistence/src/conversations.db.test.ts
  apps/api/src/conversations.db.test.ts
  packages/persistence/src/conversation-reply-states.db.test.ts
  packages/persistence/src/conversation-ledger.db.test.ts
  packages/persistence/src/conversation-assembly.db.test.ts
  packages/persistence/src/conversation-fences.db.test.ts
  packages/persistence/src/runtime.db.test.ts
node scripts/db-test.ts
pnpm check
```

181/181 PostgreSQL tests passed, zero failure/cancellation/skip; 47 migrations and five SQL files passed. The activation check rejects unreviewed API grants on all five assembly entry points; API/worker/PUBLIC/login/peer/extra-role grants, private-helper exposure, grant options and NULL ACLs hold activation. Removing each of ten callable grants, each of 20 relation reads, schema USAGE and preserved API/worker helper grants also holds. Earlier actual admission/old-connection settlement, role/writer, semantic/trigger/privacy and S4 controls remain passing.

`pnpm check` exited 0: 2,353 unit passes / 70 explicit skips and 86 integration passes / two explicit skips. Pinned runtime artifacts reproduced unchanged. These are local L1 checks; the native integration tests use their labelled loopback stub, not a qualified subscription provider or CON native answer.

Each diagnostic/final PostgreSQL cluster was stopped, PID absent, port closed and directory removed. The temporary browser fixture tab 32 was closed, viewport restored, owned Vite session stopped and port 5219 confirmed closed. Prior desktop/phone fixture proof remains in the private journal; no hosted app action, account change or Send/Ask occurred. Logs and failures stay private under the CON-01 operator journal.

## Readiness and held operations

Source checks and reviews apply only to the named source. G0 decisions remain accepted. G1/G3 retain local persistence/API and 73 affected / 119 preservation browser fixture checks; neither is hosted acceptance. G2 remains incomplete: shared Phase B reply execution/correlation/cleanup, subscription-only topology/identity/bounds/quota, host-copy accounting and withdrawal/restart must be implemented and qualified. G4 requires final pushed-head review and Luis integration review. No serving app/API/runtime tuple is newly observed; `deployed`, `app_verified` and `owner_accepted` remain unestablished. Ask stays disabled.

OP0002r6 setup/human-chat (SHA256 `4ea475e83a44410c541f5e1f346545480faabc503c8c06d6b295672f44779206`) and OP0001r4 Ask (SHA256 `661b196bb87f23bd52a683ad34921a3030010d6f9763a8d666b0d431bd3abdbf`) remain draft_not_authorized, not approval-ready. They require exact combined candidate/artifacts/target, two immutable account identities/roles, credential references, finite payer/allowances/expiry, ordered effects, concurrent-live-work handling and recovery. No hosted migration/config/deployment, account/member/grant creation, shared privilege mutation/connection termination, credential transfer, provider/native Ask execution or spending was performed. Provider/native Ask resource use this slice is zero; earlier stopped-workflow subscription deduction stays unknown.

The accepted synthetic `conversation-text-v1`, conservative same-conversation withdrawal and throwaway-home policies remain binding. Backup/provider/host-copy erasure limits are not newly qualified. The retained 36-case ledger is unchanged: 18 partial_L1 / three passed_L1 / 15 not_run. No broader product/other-mission completion is claimed. Source rollback is a reviewed revert; governed hosted data was untouched. Future live rollback must stop new Ask admission, retain compatible readers and preserve governed data/cleanup/uncertain accounting.

## One next bounded action

Phase B step 1 SQL under the remaining source window, starting with a fresh overlap/number census and preservation tests around seven shared functions. The preparatory census at `9aad383c` read 482 published refs / 290 unique candidates: no 0049 or 0050; 0053 only the dispatcher and this composed branch, byte-identical. A fresh owned database captured seven exact function definitions/security metadata after the current 47 migrations, then was removed. Baseline SHA256 `05dc1e3f99f1c16b81a673106c458617cee0c998bdf7faf66f894d25d262a092` is retained privately.

Promotion must follow r12's frozen S1–S4 manifest and named exclusions/insertions. Do not accidentally fold the separately scoped Q13 role/read-policy additions into role-free Phase B 0049, or restore broad API inheritance. No Phase B migration was authored by this checkpoint. Stop affected writes at expiry/collision; a future continuation needs a fresh census and a valid window, not an inferred standing operational approval. No monitor or future-session promise is created.
