# LFE-01 — Integrate personal space as a separate, owner-private lane

**Track:** Parallel candidate · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-01_LUIS.md).

## User result and current source

PR35 supplies personal data/API and PR30 supplies the three-place UI. Both are open. The Companion adapter is rehearsal-only, and the prior team-first priority has not been shown to be rescinded by Davide.

**Required sources:** R10; R11; R03; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **PS-01, B-PERSONAL**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/personal/ [PR30 candidate]`
- `apps/studio/src/app/App.tsx [shared; PR30 candidate changes]`
- `apps/studio/src/app/reauth.ts [PR30 candidate]`
- `apps/api/src/companion.ts [PR35 candidate; runtime owner]`
- `db/migrations/ [PR35 owns migration 0021; use its actual filename]`
- `packages/contracts/amendments/ [PR35 owns A10; use its actual filename]`

## Goal sessions

### LFE-01.1 — Review the existing candidate, do not rebuild

Use PR35’s API/data and PR30’s UI sources. Confirm the owner’s scope/priority disposition. If retained, review data first and retarget UI only after its base lands; do not treat this document as merge authorization.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-01.2 — Keep the privacy promises visible

Preserve explicit note Keep/Let go, exact Carry and Take back, the device privacy curtain, separate reauthentication client and same-person check. Proposed project placement: a small attributed “Carried into this project” source entry in Knowledge with a read-only reference in the brief when relevant; no automatic mission acceptance or private recall.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-01.3 — Qualify navigation and the live boundary

Keep the proposed call visible across Home/Personal/Work and end it on another project exactly as the selected candidate specifies. Hidden project takes no keys and marks no items seen. Davide binds a real owner-scoped Companion and its budget before production messaging is enabled; no synthetic project or rehearsal in production.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-01.4 — Finish the actual product questions

Coordinate displayed member-name persistence and the privacy/data page. Explain that erasing private space does not erase carried project copies; provide the owner’s separate take-back action. Test merge with the report viewer and the project panel.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| PS-01 | Viewer/admin tries to read another person’s private space | No content or metadata leak; project role does not widen personal access. |
| PS-02 | Call begins while personal view is open | Curtain closes and personal cache/requests clear; ending call does not unlock automatically. |
| PS-03 | Carry one note then erase personal space | Only the exact authorized project copy remains, visibly attributed and separately retractable. |
| PS-04 | Live Companion absent | No fake reply or silently retained unanswered message; production never enables rehearsal. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No automatic release of private memories to the room, no billing via a member subscription without a defined route, no priority change by implication.

**First action:** Review PR35 → PR30 with their owners; record the live-runtime and product-priority decisions separately from code readiness.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.


## Personal assistant addition

The selected PA lane now depends on owner-private jobs/storage/review, not a fully live private Companion. Implement that separation through [PA-01](../goals/PA-01.md) and [LFE-14](LFE-14.md). Existing chat without a real Companion remains refused. PA publication extends exact carried notes with its own source type; D5 still forbids ambient private recall.
