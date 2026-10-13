# CON-01 takeover10 — additive conversation runtime API

Mission CON-01; same attempt/session01a1224a-32b4-7222-a017-50a277572d95.
Codex sole source author/operator, Claude stopped; independent reviewer does not implement fixes. Luis integration and Davide product acceptance stay separate.

## Authority and exact recovery

Original r12§3.2 plus approved handoffs5/6, expiry-only renewal198/6142958242 until2026-10-13T18:00Z/20:00Europe-Rome. No operational authority added. Source start recorded198/6143535224. After the Step2 local pin, Davide approved the exact narrow Step3 generator amendment by structuredcall_77431215923e4f7e8a53f5fede118a0d item0, “Approve narrow source amendment”, recorded198/6144168028. It adds only packages/contracts/src/openapi-types.ts oneOf type generation and packages/contracts/src/contracts.test.ts regressions; expiry and all operation restrictions stay unchanged.

Base/current published Step1:7461221e676f46a8645ae33ebca99b1286dbf2db, tree3100c4c9cfa2a4de217bc51782758241ae602279. Actual automatic bot273/6143414491 no major issues on746; stable summary273/6134284110 Completed2026-10-13T10:20:49.153101Z. Step1 publication private receipt renewed-20261013-0953/publication.safe.json and shared198/6143353343,6143428991. Step2 final commit/tree and push/review status belong to step2-20261013-1025/publication.safe.json and stable shared marker CON-01-TAKEOVER10-STEP2-PUBLICATION. A recorded local commit is not an actual push, and pending automatic review is not clearance.

Worktree /Users/davidelaverga/Documents/Codex/2026-10-09/sophia-con01-source-harness-review; branchcodex/con01-takeover-source-20261013; draftPR273. No reset/rebase/merge of authoring base32854caf. Main9d9023f9/tree15ae352e still has eight held Studio conflicts/14blocks, exactpreservation198/6142703180. Fresh fetch13October changes UI/CI branch refs only; no main or shared runtime mutation observed. No Studio conflict-resolution write. New/active-owner overlap, unlisted need or expiry stops affected writes.

## Implemented source binding

A16 adds exactly ten RuntimeConversation schemas and five authenticated /v1/runtime/conversation/{claim,go,reserve,settle,acknowledged} paths. Semantic comparison removes only those additions and exactly reproduces the prior complete OpenAPI object. Existing A04 command/binding and500 hello/ready arrays remain unchanged until Step3. Existing A11/A12/A13/A14, A15/A17, voice/health/schema registration remain intact. Generator changes only SCHEMAS and VALIDATED additions; client validators and specialist generated files unchanged. Pinned standalone Ajv needs inline patterns, so these new native shapes use patterns rather than unsupported format dependencies.

Trusted body: attemptId, create commandId, authorityEpoch, leaseId. Runtime capability and unit/bridge/protocol headers route through existing verifier, callerOf and withService. Actual SQL runtime_lease plus binding/runtime-command joins derive project/resource/identity; no body actor/project/resource authority. Five exported persistence wrappers invoke only the five reviewed SQL functions and return the actual receipt. Reserve/settle keep ordinal1/2, lineage/route/reference/cumulative allowance semantics and safe-integer wire amounts. Credential references are identifiers, never secret bytes. No synthetic test route is a real approved route or grant.

ACK carries complete observation/usage/ordinal/hasTurnEnd journal proof; it returns all eight durable predicates with actual reservation states and capture/receipt/hello/cancellation keys, including handoff6 capture_privacy. It asserts no process death, relay closure, host erasure or useful provider answer. A fresh home/retry never supplies a new request or allowance.

## Artifacts

Recorder pnpm artifacts:record only changes sophia_bundle.archive_sha256/archive_integrity/artifact_digest inconfig/runtime-unit.json and archive integrity inconfig/dsh/profile/pnpm-lock.yaml. BundleSHA256a56e50e12037fa8e2cefed88e4ca22df2b90ec9fb8a1f7b8b246c1244e4c36a7; integritysha512-XcL2QKiOGVKhSHIshuKpfQ37j5rrg5Q4dEpbj+aDVOmruLkizVmLopyorjD3UJi9ZHr8jXp5qyIeMFvs3P9Pzw==. Workspace lock, runtime unit ID, dsh0.2.0-rc.2/commit639ed015 and platform digests unchanged; no competing runtime installation, role or provider.

## Verification and independent review

Private journal root /Users/davidelaverga/.codex/operator-journal/CON-01/20261012-takeover. Exact source manifests, commands, stdout and terminal cleanup receipts retained in each child. Source_ready/locally_verified/reviewed/authorized/deployed/app_verified/owner_accepted are separate facts.

- source-step2-http-before-valid-fixture: six genuine HTTP failures on published Step1's absent routes, no skips/cancellations; one earlier fixture-only diagnostic expected ready200instead204 and is not counted as fail-before proof.
- source-step2-http-after-1: six pass against real capability/lease/API/PG.
- source-step2-db-focused-3:17/17 HTTP/wrapper cases pass, no failures/skips/cancellations. Actual capture, failed receipt, lease-loss hello, human withdrawal and capture_privacy ACKs equal full durable SQL receipts; no fixture response substitution. Earlier diagnostic failures came from missing pre-existing observation/receipt wire fields and expected raw PG instead of withService's classified cause; corrected setup/expectations, no runtime criteria weakened.
- tests/unit/routes.test.mjs: seven pass including three new generated-wire/path tests, rejection of claimed member identity, invalid ordinal/amount, all eight predicates, all terminal-writer kinds and complete502 synthetic journal keys without truncation.
- source-step2-ordinary-gate: pnpm check exit0;2356unitpass70explicit skips, ordinary local/stub integrations/artifacts passed. source-step2-db-gate:894/894pass zero skip/cancel. Both unchanged source manifests, before explicit different-unit fixture correction.
- Final source-step2-ordinary-final: pnpm check exit0,2356unitpass/70explicit skips and86integrationpass/twoexplicit skips, all format/lint/build/type/contracts/artifacts gates passed. Final source-step2-db-final:894/894pass, zero failure/skip/cancel. Final source-step2-sql-final:48migrations/fiveSQLfiles passed. Final source-step2-goal-service-mock:5/5actualAPI/PG/worker/pinned-dsh existing-goal LOCAL MOCK pass. All manifests match final corrected source, including explicitly different runtime units. Every original goal case retained.

Independent whole-diff review is REQUIRED before push. Retained reviewer launch hit selected-model capacity twice before any review; neither failure is approval or validation. Third bounded invocation completed actual independent whole-source/whole-PR review with no actionable finding. It confirmed10schemas/fivepaths additive-only, generator list-only changes, exact wrapper/route/export scope, unchanged old contracts/clientvalidators/specialists/runtime.ts and actual archive SHA256/SHA512 matching recorder/profilelock, and reproduced the oneOf incompatibility. Own independent-step2-api-wrappers-20261013 run passed17/17zero fail/skip/cancel; sourceStillMatchestrue. PG64565absent/port51990closed/clusterremoved, cleanup independently rechecked. Code hold released for documentation finalization. Final exact head/tree/docs/terminalgate clearance still precedes publication. Independent final-doc review found one P2: the canonical Next action still described Step1 despite its actual publication/review. Corrected to completed Step2 pin/publication/automatic review then approved Step3; no executable or acceptance criterion changed. Actual automatic review after every pushed head, never an older verdict, follows independently. Current CI746 runtime/database/auth/media/renderer success, Studio browser stillrunning at latest checkpoint; old07d menu-clock failure remains unwaived. CI is not app acceptance.

## Remaining boundary, operations, cleanup and next action

Step3 exclusive goal/reply oneOf reproducibly fails current generic type generation (Unsupported schema); its two source/test paths are outside r12's exact list. Private step2-20261013-1025/STEP3-GENERATOR-AMENDMENT-PROPOSAL.md and step3-oneof-incompatibility.safe.json hold the exact narrow proposal and read-only reproducer. Exact proposalSHA256341406abf3155a7b06dc48583334b33e14f08f0a5cc4e851125c5bd6b3663ad6. The narrow two-file source amendment is APPROVED as recorded above; no generator/test implementation yet and no replacement of exclusive oneOf with broader anyOf. Existing expiry and operational restrictions stay unchanged.

Full CON native context/tool/role composition, throwaway-home containment/accounting/process cleanup/crash recovery, Q13 actual least-privilege target admission and supported subscription-only account/topology/adapter/bounds/credential/quota qualification remain open. Askoff. Retained36acceptance ledger remains18partial_L1/3passed_L1/15not_run; new source checks do not upgrade live cases. Current-main integration/G3/G4, lost Send under actual approved condition, current decision, correlation, withdrawal, denied access and two-account useful native answer in the signed-in app remain incomplete.

OP0002r6 setup/human-chat and OP0001r4 Ask are still draft_not_authorized/approval_readyfalse with candidate/artifact/approval/expiry fields unresolved. No hosted migration/config/deployment/account/membership/grant/privilege/connection/credential/provider/nativeAsk effect. Actual browser access exists; last actual IAB observation signed out. Serving tuple/cohort immutable subjects/provider answer unknown, no HTTP-only app claim. No new product-provider spending; review compute not metered here, earlier stopped-workflow deductions unknown, no hidden reset. No monitoring task.

All author-run owned resources are settled: final DBPG58086/port63669, SQLPG63851/51443 and crossingPG63860/51444 stopped/absent, portsclosed/clustersremoved, new crossing homesremaining[]. Ordinary58061absent. Earlier focused/diagnostic owned clusters also removed per their receipts. PID/port checks repeated read-only at handoff, all final source hashes match. Independent PG64565/51990 also settled and removed per its own independently checked receipt. Private logs/runners retained, no deletion inferred merely from tests passing. Source rollback is omission/reversion of the draft pin without hosted data mutation. Any later runtime rollback must preserve governed conversations/withdrawals/cumulative and uncertain accounting and use a compatible reader; no DB downgrade/data deletion authorized.

Next bounded action: finalize the local immutable pin, obtain independent exact-head/tree/docs clearance on completed gates, publish Step2 draft and inspect its exact automatic review. Then Step3 under the now-approved narrow generator amendment and fresh ownership check. Luis integration and Davide final product decision, broader product and other missions remain open.

## Final executable/artifact source pins

| Path | SHA256 |
|---|---|
| apps/api/src/app.ts | bc86a50a3d8a4b42268352c0f4649769ca5f5ce2911bd3a0a1714732019bd655 |
| apps/api/src/routes/runtime.ts | 293f79f3bf2e9f328cbc5a42e44ec6be445282e7dd7ddbbd7e683a61990ff510 |
| apps/api/src/runtime.db.test.ts | ab595e64e655ef9942de8bf67c6a9b54f00d01cd2d79696babf457fa5cca0943 |
| config/dsh/profile/pnpm-lock.yaml | c9e11871ed0828a21e3fd24fed6d9d76613d807602c3749c8aaf894959578ceb |
| config/runtime-unit.json | dc6fe13172d8be04b4534aba2097353a701b0a4fa203880b5f8aa554d0295e92 |
| packages/contracts/amendments/A16-project-conversations.json | 04f436f0c2c774a8b7ec6654175db3d45dfbd6923c28be163b347e7a5009f478 |
| packages/contracts/openapi/openapi.json | 82c46782a0ffd2b235acfe4827a702f4f0eb69c8072283688a14a6c1663737aa |
| packages/contracts/scripts/generate-runtime-wire.ts | 403147ac5d76f577ebee7a1cafe1e5396f414ff6729c7e535b02ec1676a69b2e |
| packages/contracts/src/generated-types.ts | cf059d620d65d8db96373d223baf28abb308da66c9767da4b45c7b9ef48eb6f9 |
| packages/dsh-bundle/src/runtime-wire-types.generated.ts | c7390e75d30d0c354f06a4482c387d6260b0cf44d9886cb8687daf54e3702ff9 |
| packages/dsh-bundle/src/runtime-wire.generated.ts | ec2d62a2ac732f6d91998e4d25948cf0a4ca5bf8de22808b948d42d45d641274 |
| packages/persistence/src/conversation-runtime.db.test.ts | a391535ed71999b0369f55791fb1ebf3a2e4c0cc996aa03a0d29e7a299d54c18 |
| packages/persistence/src/conversation-runtime.ts | 125a7dcf2d0a5e8ccfa27470c4b4faf4d2968a15ad01dd2c26eda32c5342bbea |
| packages/persistence/src/index.ts | 64da2a7566e4bf4dd11e2307b6a4ef3eac9602d36135cf1880aeed6743f9be83 |
| tests/unit/routes.test.mjs | 7b4c06c4c3ec24be5c57fdeb1dade2e8fa28e817e3ba228209118ffe9ac7c236 |
