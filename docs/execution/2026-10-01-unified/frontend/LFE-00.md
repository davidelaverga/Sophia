# LFE-00 — Preserve the merged room and reconcile active frontend work

**Track:** Now · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-00_LUIS.md).

## User result and current source

Main already includes the room, Chat/Brief side panel, input/capture controls and runtime reconciliation. Research and personal-space branches are separate candidates; yesterday’s blanket deferral and runtime-blocker notes are stale.

**Required sources:** R01; R02; R03; R04; R05; R06; R07; R10; R11; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** Current read and scope claim; no future product gate.. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **BASE**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/studio/StudioShell.tsx [existing]`
- `apps/studio/src/features/studio/SidePanel.tsx [existing]`
- `apps/studio/src/app/route.ts [existing; PR30 modifies]`
- `apps/studio/src/app/App.tsx [existing; PR30 modifies]`
- `CONTRIBUTING.md [existing]`
- `docs/execution/2026-10-01-unified/ [new documentation home]`

## Goal sessions

### LFE-00.1 — Bind without restarting

Refresh main and PR29/24/30/32/35. Record which source is merged, which is open and which deployment evidence is merely reported. Consume PR29’s existing outcome; do not ask Codex to repeat its settled work.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-00.2 — Agree the two shared integrations

Assign one writer for route.ts, useProjectRoute.ts, App.tsx, SidePanel and the shared call switches in each merge window. The research author owns its new report components until an explicit handoff; Luis owns their visual integration. Retain original ancestry rather than cherry-picking arbitrary selected UI files.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-00.3 — Make preservation executable

Build a small labeled browser fixture suite for Chat/Brief switching, drafts, unread state, mobile media controls, text-mode exit and keyboard capture. Reuse existing pure helpers. Do not replace the query cache, room controller or theme.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-00.4 — Publish the next work ticket

Install the index and scope map; launch LFE-02 review with the research author and LFE-03 creative UI preparation independently. LFE-01 remains a separate candidate-review lane, not a prerequisite for team work.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| BASE-01 | Chat and Brief switch/close/reopen | Unsent text and a manual brief edit survive; no background update overwrites either. |
| BASE-02 | Type normal words with panel focus or nowhere | Text reaches the typing sink; no microphone/camera/screen activation from a letter. |
| BASE-03 | Open mobile panel in an active call | Mute, visible sending state, errors and leave/return controls remain reachable. |
| BASE-04 | Research and personal route changes coexist in a reviewed combined candidate | Report identity/parameters and call ownership are retained; no unreviewed merge is claimed. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No room redesign, production deploy, reimplementation of PR24, or reopening the harness choice. This is a short integration setup, not weeks of infrastructure approval.

**First action:** Open main’s actual StudioShell and the three active PR summaries; claim shared-file scopes before writing.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.
