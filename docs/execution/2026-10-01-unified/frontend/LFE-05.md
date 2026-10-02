# LFE-05 — Bring existing project context in without silently accepting it

**Track:** Create/continue · **Primary implementation owner:** Luis · **Product:** Davide · **Operator:** Codex only for an approved batch.  
**Status:** new work-package instructions; current source is described below, not reset to “not started.”  
**Launch:** [Luis’s coding session](../launch/LFE-05_LUIS.md).

## User result and current source

The living brief and mission decisions exist. Full prior ChatGPT/Claude project import, scoped review and omission coverage remain separate from the personal-space carried-note feature.

**Required sources:** P07; P15; resolve in [source register](../sources/REGISTER.md). Read the actual latest branch before writing. Historical proposed destinations do not establish that a module exists.

## Dependencies and ownership

**Preparation:** LFE-00. UI fixtures can begin with versioned contract examples and honest simulation labels.

**Live feature prerequisites:** No other LFE feature prerequisite; use the backend capabilities below. Relevant service/data capabilities: **S1-08, B-CONTEXT**, bound in [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md). Real integration, authority and source checks remain required; a mocked service never closes live acceptance.

Luis owns frontend code, interaction logic, client bindings, relevant unit/browser tests and integration review. He may implement an assigned linked API/data slice; this is not a frontend-only prohibition. One writer owns shared contracts/migrations per merge window. Davide owns runtime/authority/provider decisions. Existing PR authors retain their scope until a deliberate handoff. A coding agent’s name does not replace the human owner.

## Existing and proposed code destinations

- `apps/studio/src/features/intake/ [new]`
- `apps/studio/src/features/mission/MissionPanel.tsx [existing]`
- `apps/studio/src/features/artifacts/KnowledgeReports.tsx [PR32 reference, not a generic source importer]`
- `packages/source-connectors/ [backend scope]`

## Goal sessions

### LFE-05.1 — Stage selected context

Let the user select exported conversations/instructions/files or an explicit handoff. Show included, omitted, duplicate, unsupported and unreadable material. Stage privately before an explicit release to the project; do not imply a linked coding resource grants every account conversation.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-05.2 — Propose rather than overwrite

Display the reconstructed direction and conflicting old decisions beside the current accepted mission. An import is evidence, not automatic acceptance. Manual brief edits remain authoritative; accepting a proposal uses its current revision.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-05.3 — Expose use and correction

A compact “Used for this work” surface shows eligible source references and missing coverage. Correction/Forget updates future eligibility and explains cleanup state. Do not present a deleted UI row as proof that every retained runtime copy was purged.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

### LFE-05.4 — Unify explicit crossings

A carried personal note and an imported archive can share source presentation, but retain their distinct permissions/withdrawal contracts. “Send to Sophia” is an explicit selected-context handoff experiment, not promised two-way synchronization with all vendor Projects.

**Session handback:** exact source/tree, changed behavior, checks actually run, remaining dependency and next bounded action. This session alone does not close the underlying product goal.

## API and state contract

Use [05_CODE_AND_INTEGRATION_MAP](../05_CODE_AND_INTEGRATION_MAP.md) and [the interaction contract](../architecture/03_STUDIO_AND_MEDIA.md). Studio uses Sophia’s authenticated API and validated current DTOs; it does not connect to provider/Paperclip/Omnigent administration. Proposed DTO/operation names are binding targets until the assigned backend exposes them. Do not invent a live endpoint from a filename or bypass a missing operation with direct database writes.

Keep server decisions and receipts separate from local view, unsent drafts, media state and viewer attention. Preserve exact work/source/request identities on mutations. Unknown outcome remains unknown and is reconciled with the same operation key. Opening a view, reading a card or holding the microphone grants no work/account authority.

## Acceptance cases

| ID | Scenario | Required observation |
|---|---|---|
| CTX-01 | Import an old assistant plan that conflicts with current mission | It remains a proposal/evidence until a current authorized decision resolves it. |
| CTX-02 | Archive omits attachments or project grouping | Coverage is explicit; no false full-project import badge. |
| CTX-03 | Withdraw a source while work is pending | Future packets and resumed contexts honor narrowed eligibility; UI shows any remaining cleanup. |
| CTX-04 | Member links their coding session | No private native history or personal memories become team-visible by implication. |

All cases in this new track start **not run**. Attach fixture, source-integration, live-native and hosted evidence separately. Every behavioral fix needs a regression that fails without it. Check the actual Studio on desktop and phone; no requirement is satisfied solely by TypeScript compilation.

## Checks, release and stop condition

Follow actual repository checks: `pnpm toolchain:check`, frozen-lock install, affected unit tests, `pnpm lint`, `pnpm format:check`, typecheck/contracts checks and `pnpm --filter @sophia/studio run build`. Run affected DB/native tests through their existing harness when those boundaries change. Do not weaken Linux/Mac runtime identity tests to hide a known Windows-only incompatibility; record platform and reproduce only applicable baselines.

No hosted write, new paid route, deploy or schema mutation is authorized by this file. Prepare the exact Codex operation request in [ownership and handoff](../04_SEQUENCE_AND_OWNERSHIP.md). Preserve existing privacy and versioned guide assets. Stop the implementation session at one useful tested slice or a precise dependency; do not wait indefinitely for another agent.

**Excluded:** No undocumented account scraping, new mandatory memory vendor, or automatic private-to-team retrieval.

**First action:** Create a selected-import manifest fixture and bind its current-decision conflicts to the existing mission tools, not a new brief database.

**Product completion:** the specified real user result is exercised on the intended route, with the cases above and the underlying retained goal’s criteria. Fixture-ready, source-ready, merged, hosted-verified and product-accepted remain different statuses. A frontend work package shares evidence with its parent SCM/S1/S2 goal; it does not create a second operational task controller or demand duplicate acceptance ceremonies.


## Private package addition

Manual import remains useful. [PA-01](../goals/PA-01.md) adds owner-assistant gathering with private bidirectional messaging; [PA-02](../goals/PA-02.md) and [LFE-15](LFE-15.md) own exact human publication. The shared intake only receives the approved snapshot and never queries the private package directly.
