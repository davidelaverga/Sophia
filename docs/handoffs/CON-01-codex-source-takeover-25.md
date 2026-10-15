# CON-01 takeover25 — approved reservation identity and settled evidence

Same CON-01 mission/session01a1224a-32b4-7222-a017-50a277572d95; Codex sole implementer/operator, Claude stopped. Retained reviewer supplies independent evidence. Luis retains integration and Davide product acceptance. Worktree `sophia-con01-source-harness-review`, branch `codex/con01-takeover-source-20261013`.

## Approval and identity

Davide's “Approved”, observed2026-10-13T22:13:16Z, accepts exact handoff24 SHA256`fdf215a7670ab6c26d61a8e15363d528bf572b50dd11f775e7268ee7fd451725`: exact handoff13 trusted reserve identity, handoff19 settled-used evidence, and source-only renewal through **2026-10-14T10:00:00Z /12:00 Rome**. Receipt private `amendments-20261014-0013/approval.safe.json`; shared [198/6156319630](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6156319630). No retroactive effects occurred during the gap. Q8/profile/image, current-main Studio/shared integration, merge, hosted migration/config/deploy, accounts/grants/connections, credentials and provider/subscription effects remain excluded. Ask disabled.

Published PR273 remains `457053b3fe619631f0d2e2fcc1e3edc98cfc5348`, tree `ec71aa3a83e6208ff559d075a881b374fdb8593c`. No commit/push/merge/artifact recording. Latest actual automatic review273/6144338846 and all six successful CI checks cover that published head only; its browser fixture annotation reports1556passes/1skip, not production acceptance. Dirty Step3 remains unpublished. Latest observed main240386d5 and its ten held conflicts remain as handoff23; no new integration authority.

## Applied source

The exact reviewed proposal bytes in handoffs13/19 were hash-checked before application. A16 appends the exclusive RuntimeCommand replacement after the existing retire-enum patch, and replaces the ACK schema. Listed OpenAPI/types/native wire companions were regenerated. Goal commands retain their prior payload semantics; CON create requires the closed original credentialRef/ownerResourceRef/unit snapshot. Controls cannot carry that snapshot.

SQL0049 differs from the prior working source in exactly two projections: dispatch reads route and original reserve references together from the current grant under existing project locks; ACK returns actual stored used amounts only for settled rows, null otherwise. No endpoint, role, grant, writer, lock, settlement or allowance behavior changed. The preserved whole-payload privacy scrub also removes the new snapshot.

Recovery accepts a pre-existing settled call only when its complete journaled settlement, normalized by the caller's trusted original unit, equals the read-only stored evidence. It makes no second settlement for that case. It compares amounts again at the final ACK, including a settlement performed in this pass, instead of relying on the former historical proven-ordinal set. Missing, malformed or mismatched amount evidence remains unresolved. It still never reserves or re-executes, and uncertain accounting stays uncertain.

Original-unit provenance remains an explicit caller obligation: this component test does not establish that the future assembled registry can recover it after create-payload scrubbing. The durable minimal metadata/isolated-home composition must satisfy that boundary without consulting latest grant/configuration. Launcher/profile/bridge integration remains incomplete; no receipt or physical-home deletion is performed by this change.

Current pins:

- reply-child.ts `3ba43e05da11320e3e6cd75d6c2e7e53fd85dbfd96b11f2030ebf82d4fc13b6c`.
- reply-child tests `64420ba4c36d6f39b6b10a183ebce51404532464c57d981385e6a2bfa54aa5d3`.
- SQL0049 `4eb2edef55970d983c1bc0bef2df34031cde26525fa183999b56efa4cc3f578a`.
- Canonical formatted A16 `b001599194c2f72295eb007d01360d79b09ec4fe890d12d8c97d748c293fcbe5`.
- API tests `c0f9204628c18b067f32a5bf85951cc0a8bd3afcb6c6ec734b977309f27c02aa`.

## Author evidence and independent boundary

The new recovery tests genuinely failed before implementation: matching pre-existing amounts were refused, and changed final amounts could inherit a previous settlement's verdict. Both pass after; wrong values in either amount field fail for both units, with no duplicate settlement. The updated wire tests reject missing/extra/forged snapshot fields and metadata on goal/control commands. Actual local HTTP plus PostgreSQL tests prove dispatch's stored references, denied forged credential/owner references, null reserved evidence, and exact settled amounts matching the database.

Commands: `pnpm --filter @sophia/contracts generate`, bundle build, bounded node child tests, `pnpm test`, `pnpm typecheck`, `pnpm contracts:check`, `pnpm lint`, targeted Prettier and diff check. Owned PostgreSQL17.6 runners invoke bounded actual API/persistence tests, the full DB suite and `scripts/db-test.ts` without reading a hosted credential.

Results:68/68focused;138/138PG/API;908/908fullDB;2473ordinary passes/70existing skips/0fail/cancel;48migrations/fiveSQLfiles; build/typecheck/lint/generation/format/diff pass. Before/after logs, exact SQL delta and author receipt are under private `amendments-20261014-0013/`. All three author-owned PG clusters stopped, PIDs absent, ports closed and directories removed; no test process remains from those runs.

Independent affected review is complete and the source hold released: no actionable defect at the exact pins above;68/68focused and138/138realPG/HTTP pass. Exact entire approved schema objects, full ACK SQL body and dispatch expression equal the proposals. The initial138-case run completed before A16 formatting; the reviewer verified semantic equality and reran focused tests against the canonical pin. No code result is attributed to an unmatched source hash.

Independent actual PostgreSQL parent recovery crossed both same and replacement leases. Actual emitted create metadata supplies synthetic reservation refs/unit; forged credential/owner references are denied42501, wrong unit22023, with full grant/reservation/usage/observation snapshots unchanged. Terminal captured answered+reserved makes exactly one actual API settlement, all eight ACK predicates true; replaying the matching pre-existing settled record makes zero additional settlement/observation writes, including without a journaled settled acknowledgement. Mismatched journal amounts fail with zero writes; wrong-command ACK is denied42501. A controlled perturbation of the final actual ACK body rejects changed amounts. Separately, an owner attempt to change settled database amounts was denied `outcome_conflict` by the preserved ledger trigger; recovery stayed conservative. That diagnostic exits1 and is not claimed as a successful mutable-database race. An earlier private expectation for wrong-unit SQLSTATE was corrected from42501 to the existing22023 contract, with no product edit. All four reviewer-owned clusters/PIDs/ports were independently confirmed cleaned. Consolidated evidence: private `independent-step3-amendments-20261014/review.safe.json`.

The supplied originalunit is retained pre-scrub synthetic caller metadata in these probes. It does not qualify assembled restart provenance, actual native execution, Q13 containment or home cleanup. This is affected-component clearance only, not whole-Step3 or publication clearance.

## Operations, acceptance, cleanup and next action

No operational batch ran; product provider requests0, credential reads0, hosted effects0. Assistant/reviewer compute unknown. Actual serving app/API/runtime tuple remains unverified. OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved and not approval-ready. The browser access observation in handoff23 remains available but is not the designated two-account/provider episode; CON01-A30 remains not_run.

The36-case ledger remains18partial_L1/3passed_L1/15not_run. These results establish local component verification only, not full source_ready/reviewed, operational authorized, deployed, app_verified or owner_accepted. Preserve OptionC, disposable homes, Q13A, conversation-text-v1 and conservative withdrawal without regeneration. Broader product and other missions remain open.

No hosted rollback is needed. Unpublished source can be omitted; no data downgrade, erasure, reconciliation or allowance reset is authorized. The ACK schema changes require a compatible combined API/runtime tuple; an old closed reader rejects the new used field. Do not activate mixed versions. Eventual rollback must preserve governed data and cumulative/uncertain accounting.

Next bounded action: assemble the permitted registry/delivery path using trusted original metadata, including explicit restart provenance after payload scrubbing. The affected amendments are independently cleared; new composition changes require fresh affected review. Q8/profile/launcher and shared integration handbacks remain separate. Independent whole-diff review before publication and actual automatic review after every push remain required. No autonomous monitor or promise of work outside the session.
