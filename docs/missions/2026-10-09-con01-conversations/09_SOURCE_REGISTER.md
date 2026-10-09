# Sources, precedence and limits

## Requested basis

This mission uses the user-provided Unified Continuation v3.0 ZIP and the current conversation's assignment. The old v2 reader and historical Python/DeerFlow maps are not substituted for that plan. No external product recommendation or provider API research is required for this bounded mission.

The exact actual-source read anchor is `695fe4424ad268111357553cf60a99e7f1523dea`. Native/runtime/library details not demonstrated by the inspected paths remain G0 binding obligations. Repository links require the reader's GitHub access. They are pinned evidence, not orders to reset a worktree.

| ID | Source | Read scope and permitted use |
|---|---|---|
| S01 | [Main ref](https://api.github.com/repos/davidelaverga/Sophia/git/ref/heads/main) | Main ref read; recorded source identity only, not deployed state. |
| S02 | [Open PR collection](https://api.github.com/repos/davidelaverga/Sophia/pulls?state=open&per_page=50) | Read-only open-PR snapshot; draft #190 observed. Refresh at kickoff. |
| S03 | [AGENTS.md](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/AGENTS.md) | Returned repository entry/rules, through file end; precise toolchain and artifact/handoff requirements. Earlier missing documentation paths are not treated as source. |
| S04 | [Conversation UI contract](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/apps/studio/src/api/vision.ts) | Read lines 1–230 and 370–720. A18 proposal shapes, later response, members/viewers, artifact references; unrelated APIs remain out of scope. |
| S05 | [ConversationsView.tsx](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/apps/studio/src/features/conversations/ConversationsView.tsx) | Read lines 1–170. Existing feature, accountOf query key, membership gate, feed invalidation and panels. Not a complete file audit. |
| S06 | [Project conversations](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/docs/plans/project-conversations.md) | Full returned plan: separate histories/shared project, contributors, pagination, explicit retention gap and tests. |
| S07 | [Project conversation writes](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/docs/plans/project-conversation-writes.md) | Full returned plan: Ask on/off, once-per-key writes, per-conversation drafts, later answer and current timestamp-oriented waiting behavior. |
| S08 | [Conversation panes](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/docs/plans/conversations-panes.md) | Full returned plan: chosen desktop/tablet/mobile behavior and focus/scroll expectations. |
| S09 | [Conversation quick answers](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/docs/plans/conversations-answers.md) | Full returned C6 plan: fixture demonstrations explicitly leave real answers to the runtime. |
| S10 | [Conversation decisions](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/docs/plans/conversations-decide.md) | Full returned C7 plan: existing A08 operations and revision/idempotency rules, not new decision store. |
| S11 | [Destination map](https://github.com/davidelaverga/Sophia/blob/695fe4424ad268111357553cf60a99e7f1523dea/docs/DESTINATION_MAP.md) | Requested lines 1–150; response truncated after core package map. Claims limited to visible map entries: persistence, mission context, contracts, registry, native bridge, Paperclip and design. |
| S12 | [Conversation directory](https://github.com/davidelaverga/Sophia/tree/695fe4424ad268111357553cf60a99e7f1523dea/apps/studio/src/features/conversations) | Directory/tree metadata only: existing components, stores and tests; not proof their behavior passes. |

## Retained original plan excerpts

Parent ZIP SHA-256: `cafb22928ab298e4691b38377671bbdbfa2f4cd79a30e50288bdd36be93efb80`.

| Original member inside v3 | Included original bytes | SHA-256 |
|---|---|---|
| `goals/CON-01.md` | [goals__CON-01.md.original.txt](references/v3/goals__CON-01.md.original.txt) | `be28f583eac72a0252928db120f48930600b15dde8ec7d82e9cf7e7fce83b759` |
| `architecture/07_CONVERSATIONS_AND_TASK_CONTEXT.md` | [architecture__07_CONVERSATIONS_AND_TASK_CONTEXT.md.original.txt](references/v3/architecture__07_CONVERSATIONS_AND_TASK_CONTEXT.md.original.txt) | `0ce6629c3f18c9cb9f94374d3a78efd42e45594100bd379a6af93f355bd7f9ea` |
| `architecture/06_OPERATIONS_AND_RELEASES.md` | [architecture__06_OPERATIONS_AND_RELEASES.md.original.txt](references/v3/architecture__06_OPERATIONS_AND_RELEASES.md.original.txt) | `ab1337a332d91f1c41fbc0dde5150fb800008d45cae2b210a223d45246f2922f` |

## Precedence

Current applicable repository security and effect controls, the actual installed contract and explicitly approved owner decisions remain binding. The user-selected v3 product direction and this mission determine the requested scope, subject to the G0 source/retention amendment. Actual accepted implementation and in-flight ownership are not undone by a document label. A conflict is recorded and resolved in the smallest affected contract, not silently guessed.

No whole-repository source build or active production inspection was performed. No live model, SQL, runtime, browser or deployment tests were run in authoring. The separate VALIDATION.md concerns only package integrity and its authored checklist.

## Research issues deliberately not converted into claims

A18 remains the UI proposal label until properly allocated in the backend contract. A successful UI fixture is not evidence of a saved conversation. A native context chosen by a tab is not acceptable routing. A saved summary is not a decision or proof of complete coverage. Named-conversation retention does not backfill live voice or Personal history. Draft PR #190 is an observed coordination input, not an assertion about its state at implementation time.
