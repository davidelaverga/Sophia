# LFE-09 — Deliver selective cooperation, mobile actions and useful return

**Track:** Cooperate · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-09_LUIS.md).

## User result and current source

Required actions and basic progress belong earlier in LFE-06/07. This package refines attention, milestone opportunities, PWA mobile and standing-work return rather than introducing a second inbox.

**Required sources:** C01; P12; P13; P16; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** LFE-06, LFE-07 Relevant service/data capabilities: **SCM-06, SCM-07, B-PUSH**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/work/attention/ [extend]`
- `apps/studio/src/features/mobile/ [new]`
- `apps/studio/src/features/return/ [new]`
- `apps/studio/src/features/voice/ [existing media switches]`

## Goal sessions

### LFE-09.1 — Use four semantic surfaces

Quiet Work Pulse, persistent required HumanAction, optional source-linked CooperationOpportunity and always-reachable control/Inspector. A shared action ID appears in every place; viewer dismissal/seen is never task resolution.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-09.2 — Offer milestones worth inspecting

The existing lead review can return no opportunity or a concrete captured source/choice with intended audience, relevance window and no-response continuation. Show why a person’s taste or knowledge matters now. An expired/stale screenshot cannot replace a newer candidate.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-09.3 — Qualify mobile control

Responsive web/PWA first. Fetch current action after authentication; bind supported native answers to owner and request fingerprint. Native login/OS/2FA stays a named handoff. Minimal opt-in push carries no secret or operation body; denied push leaves the durable inbox usable.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-09.4 — Return without replaying the whole conversation

Show accepted changes, pending owner decisions, useful candidate and mandate state from eligible records. Permit manual review, comment, steer, Hold/Stop and revoke within current authority. No raw chat retention is added merely for a return summary.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| ATT-01 | Decline optional milestone invitation | Only attention changes; separate required permission stays pending. |
| ATT-02 | Tap a push after Stop or request supersession | Fetch current state and refuse stale effect; no offline queued approval. |
| ATT-03 | No browser push permission or offline device | In-app action and current details remain recoverable; no false delivered/read claim. |
| ATT-04 | Return after a quota reset and a member removal | Current eligibility governs visible context and suggested work; reset never reopens cancelled work. |
| ATT-05 | Panel covers mobile call controls | Visible sending, mute and leaving remain accessible throughout action resolution. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No native mobile rewrite or guaranteed remote control of a sleeping owner computer. No model wake merely for a percent-bar change.

**First action:** Build the three distinct card types over shared action IDs and current UI rules; extend to one real opt-in notification path after its backend is qualified.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
