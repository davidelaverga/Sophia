# Sophia — Workboard connection missions
**Version 1.0 · 3 October 2026**

## Two missions, not another platform plan

**Mission 1 — WBC-01:** finish the semantics and integration-facing behavior of Luis's existing Tasks view in one follow-up PR. Preserve its design and recent fixes. It remains fixture-backed until the service exists.

**Mission 2 — WBC-02:** connect that view to one real, authorized Paperclip-managed dsh source-review task. Deliver a retained review result, current state, human plan admission and verified Hold/Stop/recovery. Do not bundle the three native accounts, intelligent resource allocation or the full project lead into this first crossing.

These are delivery slices of the installed **v2.0 unified continuation**, not substitutes for its full SCM/LFE goal graph. Mission 1 completes the current board slice, **not every part of Luis's frontend track**. Mission 2 starts SCM-01 and a narrow SCM-04-G2 plan/projection slice; it does not close all coordination goals.

## Start by role

| Reader | Read | Start |
|---|---|---|
| Davide | [current source and decisions](01_CURRENT_LEDGER.md), [Mission 2](missions/WBC-02_PAPERCLIP_FIRST_OUTCOME.md) | Allocate the contract owner; preserve the active M03 lane. |
| Luis | [standalone explanation](LUIS_CHANGE_GUIDE.html), [Mission 1](missions/WBC-01_UI_READINESS.md) | [Mission 1 launch](launch/WBC-01_LUIS_CLAUDE.md). |
| Backend implementation agent | [shared interface](contracts/01_WORKBOARD_BINDING.md), [Mission 2](missions/WBC-02_PAPERCLIP_FIRST_OUTCOME.md) | [Mission 2 launch](launch/WBC-02_CLAUDE.md). |
| Codex reviewer/operator | [operator protocol](operations/CLAUDE_CODEX_PROTOCOL.md) | [operator launch](launch/CODEX_REVIEW_AND_OPERATIONS.md). |

Both implementation lanes receive this complete packet. Each session reads its mission and referenced sections, rather than loading every historical pack. Luis remains a human implementation owner; the coding tool does not replace him.

## Important baseline change

PR #63 is **merged**, at merge commit `1bb40f0c0d932420b9fe75fc3f80d8fc850b37b5`. Inspected main is `c8dd5aa975fb8f0a872e32a89d7d674a356e79f2`, including later follow-ups and the typography consolidation. Create a **new follow-up branch from current main**, not a duplicate version of #63. Re-fetch before implementation; apply the remaining delta, not the old review's stale list of defects. [Source register](sources/REGISTER.md).

Final main recheck: `2c13747cbea08f937ca133769dab17f5d559f5c0` (PR #70). Its inspected diff adds the existing type token to the Resources/Tasks search fields, counts form-field text in the type-scale check, and updates the handoff/rules. It does not change the work, decision or action contracts inspected at `c8dd5aa975fb8f0a872e32a89d7d674a356e79f2`. Preserve this follow-up too; start from current main, not an old review branch. [S19]

## Deliverables and where they belong

Install this packet unchanged under `docs/missions/2026-10-03-workboard-connection/`, with its source status and file hashes. Add a link in current execution/navigation documents without overwriting the frozen v2.0 archive or any earlier pack. Implementation progress belongs outside the frozen packet, for example `docs/progress/WBC-01.md` and `docs/progress/WBC-02.md`.

The schemas/examples here are **proposed binding contracts and synthetic fixtures**, not existing API endpoints or proof of runtime integration. WBC-01 validates the UI against them. WBC-02 promotes the agreed subset through the repository's reviewed amendment/generator process and implements the actual service.

## Release order

1. WBC-01: merge the fixture-backed readiness improvement after Luis's review and the relevant regression checks. No production feature activation, migration, provider call or deployment is part of this PR.
2. WBC-02: one focused integration PR with ordered implementation commits and a separate, approved reader-first deployment batch. Its frontend integration consumes WBC-01; private Paperclip setup can be developed in parallel after the interface is agreed.
3. Continue the retained SCM/LFE sequence for owner-native resources, peer guidance, contextual Ask, technical-lead review, capacity warnings and candidate co-review. [Continuation map](02_SEQUENCE_AND_SCOPE.md).

## Evidence

[Validation](VALIDATION.md) distinguishes packet validation, source inspection, application tests, real-provider tests and hosted evidence. No repository, database, provider account or production service was modified in preparing this packet. The HTML is explanatory documentation, not a live Sophia interface.
