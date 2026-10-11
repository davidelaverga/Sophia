# Source baseline and binding map

## Inspected snapshot

Repository: `davidelaverga/Sophia`  
Main returned by the connector: `695fe4424ad268111357553cf60a99e7f1523dea`  
Read date: 9 October 2026. This is an evidence anchor, **not an instruction to reset a checkout**. No deployed tuple was discovered or tested while authoring this pack.

The open-PR read in this review returned **draft #190, “docs: install unified continuation v3,”** on `docs/install-unified-v3`, head `17cd6e91d7652f65a40e7fe2653c3227748a165`. Refresh its state at kickoff. Do not duplicate that installation, edit its frozen files in another branch, or describe its review as completed. User v3 direction and this assigned mission remain inputs while installed navigation is reconciled.

## Verified source observations

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| `apps/studio/src/api/vision.ts` | A18 proposal names, runtime-checked shapes, Ask Sophia flag, later-message reply model | Production endpoints, persistence or native reply execution |
| `features/conversations/ConversationsView.tsx` | Existing separate conversation feature; subject-keyed list cache; feed-driven refresh; membership writer gate | Server authorization or cross-process durability |
| `docs/plans/project-conversations.md` | Project-shared context, local histories, actual contributors, retention requirement | Approval to retain old voice or ambient data |
| `docs/plans/project-conversation-writes.md` | One intent/key, preserved drafts, create/send forms, response-pending UX | Exactly-once model execution from UI retry behavior |
| `docs/plans/conversations-answers.md` | C6 demonstration bar; quick answers are fixture answers pending real runtime | Live intelligence already present |
| `docs/plans/conversations-decide.md` | C7 uses existing A08 writes, expected revision, one decision/retry identity | Automatic acceptance from prose |
| `docs/plans/conversations-panes.md` | Luis's accepted responsive three-pane direction and focus/scroll rules | A reason to redesign Studio |
| `docs/DESTINATION_MAP.md` | Current package families, native bridge, one specialist registry, existing mission-context reader, API/contracts/persistence | Every later path listed as unbuilt already exists |
| `AGENTS.md` | Exact toolchain, native artifact gate, current source/assignment precedence, independent review and durable handoff obligations | Permission to spend or deploy without the relevant operation authorization |

The map shows current dsh/persistence/mission services to reuse. It describes the combined design/source-review runtime; their own latest progress and deployment records must be reread by the executors. This pack does not close WBC-02 or SDD-01.

## Concrete edit anchors

| Existing area | Mission work | Ownership |
|---|---|---|
| `apps/studio/src/features/conversations/` | Wire reads/writes/reply state/coverage; preserve layout, held writes, drafts and subject identity | Claude implements; Luis coordinates visual/shared surfaces; Codex reviews |
| `apps/studio/src/api/vision.ts` | Promote only qualified conversation operations to generated real contracts; leave unrelated vision proposals gated | Shared API writer nominated at G0 |
| `packages/contracts/` | Reviewed OpenAPI amendment, generated types/validators and response identities | One contracts writer; no handwritten competing type authority |
| `packages/persistence/` | Actor-scoped durable records, idempotency, conversation reads and existing mission-context integration | Claude, in reserved files/migrations |
| `apps/api/` | Authenticated routes, current eligibility, feature capability and native request bridge | Claude, bounded routes |
| `packages/dsh-bundle/`, `config/specialists.json`, `config/runtime-unit.json` | Minimal scoped responder/context/result binding only if needed | Shared runtime writer; integrate additively after explicit handoff |
| Existing project feed/snapshot | Emit and consume truthful invalidation updates from committed records | Extend existing path, do not replace the entire event system |
| `e2e/project-conversations.spec.ts`, `e2e/project-conversation-writes.spec.ts` | Retain UI tests; add real-backed cases in the appropriate discovered test harness | Paths named in the source plans; confirm actual checkout before edits |
| Existing auth, membership, privacy and mission tests | Add adversarial cases; preserve prior account-keying and decision behavior | Claude implements; Codex independently exercises |
| `docs/handoffs/`, current progress/coordination records | Exact candidate, observations, unresolved effects and operation handoff | Each executor owns its own report |

New files under these families are proposed destinations until G0 assigns actual paths. Do not create historical `frontend/`, Python, LangGraph, Hydra, Graphiti or LoopRun replacements. `packages/context/` is listed as unbuilt; a broad new context platform is not a dependency for CON-01.

## G0: binding questions to close from actual source

Claude writes the binding record; Codex independently checks it:

- Which installed OpenAPI/privacy amendment currently controls saved text, and which fresh amendment/migration IDs are unreserved? **A18 is a UI proposal label, not a reserved backend amendment number.**
- Which actor/RLS/idempotency helpers and real project event cursor are already in use? Identify exact functions and negative tests.
- Which current API endpoint supplies MissionContext and how does withdrawal invalidate its readers?
- Which native admission/binding path can own a conversational reply without creating a work-board issue or reusing a retired brief operation?
- Can the selected role safely receive conversation-local input without loading another conversation's native history? Identify the actual per-agent scope and recovery key.
- What exact retention/erasure interface implements §3 of [the contract](03_CONTRACT_AND_RETENTION.md)? What are the backup and external-provider limits?
- Which source, application and runtime releases are currently live, and which other mission owns the next combined bundle? Record rather than assume.

G0 is a bounded source/binding task, not framework research. Unresolved optional features stay unavailable. A genuinely missing necessary contract gets a focused amendment; unrelated work continues.

## Evidence limitations

Inspection covered selected files and directory metadata through the GitHub connector, not a full cloned source build. An anonymous container clone was unavailable. Several earlier guessed documentation paths were not found; this pack uses the verified `docs/plans/project-conversations*` paths instead. There was no paid model call, database test, browser session, migration, account connection, deployment or repository write in this authoring process.

Current checkout instructions override any stale path example. If a required file moved, find and record the replacement; do not invent its contents or silently revert to an older architecture map.
