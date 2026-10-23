# Claude–Codex coordination and parallel boundaries

## Roles and independent review

Claude Code is the main code executor for this mission. That includes database/API, minimal dsh changes, generated contracts, tests and existing Studio integration within the agreed scope. Luis does not become a mandatory second programmer for every UI file; preserve his design and coordinate shared edits.

Codex follows from the beginning: independently reviews G0, exercises the persistence/privacy crossing after G1, inspects actual runtime context after G2, performs pre-merge review, prepares deployment, executes specifically authorized batches and tests the app. Codex does not merely sign Claude's final narrative.

Each has a separate worktree and recorded native session/attempt. Codex may write its review/evidence/runbook files. Feature corrections normally go back to Claude. If Codex must author an urgent fix under an explicit assignment, it creates a new candidate requiring independent review; it cannot both author and supply the only independent acceptance of that fix.

## Coordination home

Use one existing assigned issue/thread if a CON-01 thread exists. Otherwise the implementer may propose a mission issue and a draft PR under the normal repository assignment; record actual numbers after creation, never assume #105 is the new mission. #105 is historical proposal/design evidence, not an automatically granted operational queue.

Proposed mission documents are `docs/coordination/CON-01/` and a current mission progress record. Confirm with current repository practice before creating them. Existing `docs/handoffs/` remains the inspected source's attempt-handoff location. Follow any newer mandatory workflow/logging instructions found at kickoff.

Use unique actual IDs for attempts and messages. Suggested prefix convention: `CON-01-CC-*` for implementer messages and `CON-01-CX-*` for Codex. These are proposed names, not reserved IDs. Every review request names the exact commit/tree, changed boundary, checks actually run and questions for the reviewer.

## Practical handoff protocol

| Message | Sender → recipient | Minimum payload |
|---|---|---|
| Binding review | Claude → Codex | Current base, source paths, A18-to-real-contract map, privacy policy proposal, ownership and tests |
| Review finding | Codex → Claude | Severity, exact source/version, observed/expected behavior, reproducer, smallest correction |
| Candidate handoff | Claude → Codex | Exact commit/tree/runtime identities, acceptance status, commands and evidence, unresolved effects |
| Operation request | Claude/Codex → Davide | Exact target and effects, reviewed candidate, credentials by reference, payer/cap/expiry, preconditions and rollback |
| Operator receipt | Codex → both | What actually ran, observed targets/digests, resulting state, cost/uncertainty, cleanup and next action |
| Closeout | Both → Davide | Independent source/app verdicts, remaining limitations, capability now usable and no broadened milestone claim |

Written handoffs are durable records, not a promise of asynchronous monitoring. Each executor checks the shared record at the beginning of a session and at the stated gate. No polling model, automation, or new notification service is installed for coordination.

## Parallel work ownership

| Surface | Rule |
|---|---|
| Design mission: new assets/formats, capture kernels, design prompts, renderers | Outside CON-01. Only consume existing exact output references. |
| WBC-02: Paperclip plugin/adapter, commission/effect settlement, deployment | Preserve; do not upgrade or reinterpret its status. Conversation asks never use its work issue merely to obtain a runtime. |
| v3 installation PR #190 | Refresh current status; do not install a second copy or edit frozen historical packs. |
| `config/specialists.json`, generated specialists, shared bridge, runtime/unit digests and locks | One nominated writer at a time; CON-01 supplies a minimal additive delta and tests. Rebuild one combined candidate retaining all other roles. |
| OpenAPI/generated validators and migration roster | Reserve actual IDs in the shared record before writing. No independent generator runs that delete another lane's change. |
| Studio shell/navigation/room/call/viewer store | Luis coordinates integration; no visual rewrite or account-key regression. |
| New bounded conversation source and tests | Claude owns implementation; Codex independently reviews. |
| Hosted database/runtime/app operations | Codex under the actual authorized batch and deployment coordination. One current live reference; no extra production stack merely to bypass another lane. |

Two additive migrations can coexist only when their actual dependencies and replacements are known. In particular, a `CREATE OR REPLACE` must preserve other lanes' branches. Shared SQL/runtime changes land in an agreed order; rebasing refreshes affected independent evidence.

## Work that can start immediately

Source inspection, binding proposals, tests against controlled local records, persistence/UI code in reserved paths and local integration can proceed before WBC-02/design live acceptance. Real native or deployed activation waits for the necessary current runtime and authority only. Do not invent a dependency on image generation, Omnigent enrollment or a cloud sandbox.

## Merge discipline

Target one focused feature PR. Keep contract/privacy, persistence, native replies, UI integration and evidence in reviewable commits. A draft PR can appear early. Codex's approval is bound to an exact candidate; materially changed auth, schema, prompt, runtime or integration invalidates the affected approval. Rebase onto current main without resetting another person's worktree. Do not merge solely because all unit tests are green; preserve the specific changed-crossing evidence required by the repository.
