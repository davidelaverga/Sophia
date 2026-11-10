# Delivery and review protocol

**Applies to:** the agents delivering this Sophia programme.  
**Status:** implementation instructions; no work is claimed executed by this document.  
**Related:** [Mission](../MISSION.md), [design approval](DESIGN_APPROVAL.md), [deployment and verification](DEPLOYMENT_AND_VERIFICATION.md), [source baseline](../references/BASELINE_AND_SOURCES.md).

## 1. The delivery team

The user's latest instruction replaces the roadmap's separate reviewer and tester threads with **one independent Codex thread carrying both duties**.

| Role | Thread/tool | Owns | Does not substitute for |
|---|---|---|---|
| Programme coordinator | One Codex thread | Mission ledger, decomposition, assignments, dependencies, reconciliation, bounded operational requests and final closure | Resource-owner consent, Davide's design approval or independent verification |
| Implementation workers | Claude Code threads | Assigned implementation, focused tests and source handback | Their own independent review |
| Design specialist | A dedicated Claude Code thread using the qualified Impeccable setup | Bounded production UI improvements and reviewable design candidates | Davide's approval or technical review |
| Automatic code reviewer | Configured Codex GitHub integration | Automatic review coverage after every PR push, including every newly pushed commit | The independent whole-diff review or in-app test |
| Independent reviewer and in-app tester | **One Codex thread**, distinct from coordinator and authors | Pre-push source review, final candidate review, authorized release verification and actual in-app tests | Product implementation or automatic PR review |
| Davide | Human | Significant Sophia UI approval and decisions for his resources | Luis's resource/merge authority |
| Luis | Human | Decisions for his resources and current merge/integration authority, unless explicitly delegated | Davide's significant-UI approval |

The independent thread may perform deployment operations already authorized for it. It records source review and app verification as different runs/evidence even when they occur in the same thread. Separate threads are not required for those two duties. It must remain separate from authors and must not implement a defect fix and then approve that fix as independent evidence.

This delivery organisation does not require every future Sophia customer to use the same vendors, human approvers or thread count. Product runtime roles are defined in the mission and shared contracts.

## 2. Authority and baseline

**GOV-R01 — Preserve authority.** Read current repository instructions, the installed continuation and active mission ownership before assigning edits. The new pack changes planning scope through the installation amendment; it does not erase repository security, exact toolchain, owner grants, operator limits, active branches or unresolved effects. The repository currently places merge/integration responsibility with Luis. An explicit existing delegation is reusable within its scope; this document is not a new delegation. [G1]

**GOV-R02 — Refresh only what is needed.** At startup record actual repository, main SHA, intended base, owned worktree, open overlapping PRs, deployed tuple relevant to the slice, enabled features and current grants. Refresh these identities before the consequential step that depends on them. Do not replay unrelated historical campaigns or reset source to an audit pin. The source register's snapshot is orientation, not a checkout instruction.

**GOV-R03 — Install without rewriting history.** Use a documentation-only reviewed PR to install the complete pack under the selected execution-pack home, recommended as `docs/execution/2026-11-08-incremental/`. Update navigation and a short supersession record. Preserve frozen older packs byte for byte; operational progress belongs in current ledgers/handoffs outside their frozen contents. No deployment, schedule, provider call or resource enrollment occurs merely because the plan is installed. [G3]

## 3. Assignment contract

**GOV-R04 — One coordinator and explicit write ownership.** Every assignment names:

- Mission and requirement IDs; the user-visible outcome and bounded acceptance cases.
- Actual author thread/session, human owner and allowed resource policy.
- Base commit, branch/worktree, repository and writable files/effects.
- Dependencies and the current owner of every shared contract, migration sequence, generated type set and runtime identity file.
- Existing authority and holds; prohibited effects; expected handback and next reviewer.
- Needed capabilities and whether significant UI review applies.

The coordinator gives workers code, requirements and source evidence, not authority invented through a prompt. One worker owns each writable file/effect at a time. Independent modules can proceed concurrently. Assign one integrator for shared schema/generated types and deliberate conflict resolution. Do not place the designer over a component another worker is concurrently rewriting.

**GOV-R05 — Bounded work and continuity.** An assignment ends with a concrete candidate or exact blocker. New sessions resume the same assignment/mission identities and retained allowance. Retry, repair, compaction, review feedback or restarting a coding thread never clears Stop, approval holds, spending or uncertain external effects. Preserve failed attempts and superseded evidence instead of replacing them with a success narrative.

**GOV-R06 — Current code first.** Implementation extends the inspected TypeScript/dsh seams. An old Python/LangGraph plan is behavioural context, not permission to restore that stack. Do not add a second scheduler/project manager or speculate about endpoints not found in source. Each source addition updates the appropriate destination/source map and normal handoff record. [G1]

## 4. Source-to-release workflow

The normal loop is:

1. Coordinator assigns a bounded slice with written states, dependencies and acceptance.
2. Claude Code worker/designer implements it in the owned worktree, validates the relevant boundary and returns the exact candidate.
3. The independent Codex thread reviews the **whole relevant diff before each push**, including the contract and failure transitions. The author repairs findings and requests review of the revised candidate.
4. Authorized author pushes the reviewed revision. The automatic Codex integration reviews every pushed PR revision; its coverage and findings are recorded against actual commits.
5. Independent reviewer checks final source, resolved findings, checks and material changes against the current head. Design review runs at the concrete-candidate boundary when applicable.
6. Current merge authority admits the exact candidate. Release/deployment and actual app verification follow the separate protocol.
7. Coordinator closes only the accepted capability after the required release evidence exists; otherwise it assigns the repair or records the blocked boundary.

The gates are evidence conditions, not a requirement for multiple approval conversations. A single scoped authorization can cover related ordinary operations; do not ask again when the existing instruction already covers them. Current repository rules require independent pre-push review, final-push Codex review and browser verification of Studio changes. [G2]

## 5. Independent review

**GOV-R07 — Review the code independently.** Supply the reviewer the assignment, base and candidate identities, complete relevant diff, governing contracts and test entry points. Author notes are useful context but cannot substitute for inspection. The reviewer examines positive and adverse states, authorization/identity boundaries, idempotency, current grants, privacy, late results, error paths and existing callers affected by a changed contract.

Review disposition is `accepted`, `changes_required`, `blocked` or `insufficient_evidence`, with stable finding IDs and severity based on the actual effect. A review completing successfully is not the same as accepting the candidate. Fix ordinary findings through the author; do not escalate routine implementation decisions to Davide. A genuine product decision or significant UI revision follows its own approval rule.

**GOV-R08 — Keep review independence.** The reviewer/tester can reproduce defects, inspect source, run checks, operate an authorized release and test it. Production source or test changes fixing the candidate belong to a Claude Code author. Read-only diagnosis or a throwaway reproduction does not make the reviewer an author of the production candidate. If it materially authors a fix, it must not approve that fix as independent; return the change to the coordinator for an actual independent review arrangement. Do not silently accept self-review to preserve a thread count.

**GOV-R09 — Bind evidence to the candidate.** Record reviewer thread ID, review run ID, base SHA, candidate SHA/tree, reviewed scope, findings, commands/results and limitations. A new push makes prior current-head evidence stale. Reuse unchanged evidence only with a recorded delta analysis showing its scope remains valid; final review disposition names the exact latest head. A rebase, conflict resolution or changed dependency can alter behaviour even without a visible feature change.

## 6. Automatic Codex review on every pushed commit

**GOV-R10 — Qualify the existing integration first.** INC-00 records the installed Codex review configuration, supported trigger events, draft-PR behaviour, account/allowance and how completion is observed. Do not add a duplicate review bot when the existing integration satisfies this contract. A missing webhook/comment is a review coverage gap, not proof that no findings exist.

**GOV-R11 — Retain coverage for every push and commit.** Persist a compact review record containing PR, push identity or observed push sequence, previous head, new head, all newly introduced commit SHAs, review request/run IDs, reviewed commit coverage, result and findings. A multi-commit push is covered by one automatic run only if that run actually covers those introduced commits. If the integration only reviews a single head/diff, qualify that coverage explicitly or trigger the missing per-commit reviews; do not claim unseen intermediate commits were reviewed. Initially using one reviewed commit per push can keep the mapping simple.

Every push must trigger automatic Codex review. Closely spaced pushes must not silently cancel or discard earlier required coverage. An older review may be marked superseded for merge eligibility, while its coverage/finding record is retained. A skipped, errored or cancelled review remains incomplete until the missing coverage is resolved through the qualified integration. Keep any real provider limit visible; it is not an exception to review.

Qualify initial PR creation as well as later pushes. Commits first published before the PR exists must be covered by its initial automatic review; opening or marking a PR ready cannot leave those commits unreviewed. Record the actual trigger behavior for draft PRs instead of assuming it.

**GOV-R12 — Merge uses the latest head.** Immediately before merge compare actual PR head with the independent review, automatic review coverage, CI and design approval lineage. `review_requested`, a queued run, silence, an old-head “no findings,” or a generic “meaningful head” label cannot satisfy the gate. Review coverage for intermediate commits does not replace an integrated latest-head assessment. Every unresolved finding has a disposition; accepted limitations cannot conceal a failed required capability.

**GOV-R13 — Preserve findings through repairs.** The coordinator records automatic and independent findings in the same bounded queue, deduplicating overlapping defects without deleting either source. Claude Code repairs the affected class in one coherent slice. Each resulting push restarts its required automatic coverage and pre-push/final review evidence. Do not issue repeated speculative pushes to solicit the bot as a substitute for local inspection.

## 7. Checks, UI approval and merge gate

**GOV-R14 — Run the actual required checks.** At the inspected baseline the repository pins Node 24.21.0 and pnpm 11.7.0, frozen-lockfile installation, ordinary `pnpm check`, and browser qualification for Studio. SQL/live tests have separate entry points; a unit test run does not include them. Changed runtime bundle/lock/package identity requires the repository's artifact-recording checks. Read current scripts again when executing; do not treat this list as immutable tooling. [G1][G2]

Required verification covers the changed cross-component boundary and adverse state. Existing repo bug-fix rules require a regression check that actually fails without the fix. Keep tests proportional to the risk and normal gates; do not repeatedly run unrelated suites once the specific remaining risk is resolved. Record skips/cancellations accurately.

**GOV-R15 — Design hold is independent.** Significant Sophia UI changes require [Davide's design decision](DESIGN_APPROVAL.md). A green technical review, green CI or automatic reviewer praise cannot release `awaiting_design_approval`. Conversely, design approval does not accept correctness, privacy, resources or deployability.

**GOV-R16 — Atomic merge eligibility.** The coordinator's final checklist evaluates the current head and current authority together: required checks, automatic coverage, independent acceptance, applicable design decision, resolved effects, supported migration/deployment plan and merge authorization. Refresh after a changed head or grant. If branch protection does not encode a requirement, the coordinator/operator still must enforce it; absence of a platform blocker is not permission to bypass the contract.

## 8. Blockers, handbacks and completion

**GOV-R17 — Useful escalation.** A blocker states the exact unavailable capability, relevant evidence, affected mission cases, responsible actor and smallest next action. Continue unrelated authorized work. Authentication or owner consent is requested only after everything resolvable without it is ready. Do not create fallback spending, adopt another owner's credentials or broaden scope to avoid a genuine boundary.

**GOV-R18 — Close with evidence.** A code worker's “done” means source handback, not mission completion. Each release-bearing mission requires accepted current source, authorized merge, exact deployed identity, actual app verification and retained limitations. The same independent thread supplies separate source-review and app-verification records. The coordinator reports remaining deferred product capabilities separately, without claiming the October eighteen-capability umbrella has closed.

## 9. Acceptance examples

All cases begin `not_run`. These are protocol acceptance requirements, not claims that the pack itself ran them.

| ID | Scenario | Required observation | Evidence |
|---|---|---|---|
| AC-GOV-01 | Resume coordinator after a session restart | Same mission, active author scopes, allowance, Stop/holds and unknown effects recovered; no duplicate assignment dispatch | Prior/resumed ledger and dispatch IDs |
| AC-GOV-02 | Assign two workers overlapping the same contract file | Overlap is resolved before writes; one writer/integrator owns the effect | Assignments and ownership record |
| AC-GOV-03 | Prepare a push without independent whole-diff review | Push remains blocked by delivery procedure; reviewer inspects the actual candidate | Candidate tree and pre-push review |
| AC-GOV-04 | Push a new PR revision after earlier green reviews | Automatic review is triggered and old current-head acceptance is stale until the latest head is covered | Push/head identities and review runs |
| AC-GOV-05 | Push multiple commits or push again during a review | Every introduced commit/push has explicit coverage; cancellation or net-diff-only coverage cannot be misreported as complete | Commit coverage ledger and actual review scope |
| AC-GOV-06 | Automatic review is queued, skipped or errors | Merge remains pending; no assumption that silence means approval | Review state and merge gate disposition |
| AC-GOV-07 | Independent reviewer/tester finds an app defect | It records evidence and returns the repair to a Claude Code author; it does not fix and self-approve | Defect record, repair ownership and review IDs |
| AC-GOV-08 | Same independent Codex thread reviews and then tests | Separate source-review and app-verification records are accepted with actual identities; no artificial second-tester-thread requirement | Thread/run IDs and separate verdicts |
| AC-GOV-09 | Ordinary code review passes while design hold remains | Affected UI work/merge/promotion remains held; unrelated authorized backend work may continue | Design state and affected/unaffected assignment outcomes |
| AC-GOV-10 | PR is merged but deployed app verification is absent/failed | Mission stays open and next action is assigned to the existing release/repair path | Merge/deployment/app records and closure state |

## Sources

- [G1 — Repository agent contract at inspected main](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/AGENTS.md).
- [G2 — Code and Studio rules](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/CONTRIBUTING.md).
- [G3 — Installed planning authority and historical installation discipline](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/docs/execution/README.md).
- [G4 — Existing operation and evidence protocol](https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/docs/execution/2026-10-01-unified/operations/WORKING_PROTOCOL.md).

[G1]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/AGENTS.md
[G2]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/CONTRIBUTING.md
[G3]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/docs/execution/README.md
[G4]: https://github.com/davidelaverga/Sophia/blob/953e5dc3d4c88e491517f3f0d0eaa18216fea98f/docs/execution/2026-10-01-unified/operations/WORKING_PROTOCOL.md
