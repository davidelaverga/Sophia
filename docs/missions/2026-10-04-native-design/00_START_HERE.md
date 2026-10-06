# Sophia native design — mission outline and launch pack

**Version:** 0.1 · **Prepared:** 4 October 2026 · **Status:** proposed implementation contract, not implemented or deployed.

## The outcome

Complete PR #75 without throwing away its useful reader, citation and rendering work. Then implement and test a **native dsh HTML designer and independent visual reviewer**, using an explicitly pinned subset of Raven's methods and visual references. The researcher remains the current baseline during this comparison.

The rule for newly admitted deliverables is simple: **Markdown may finish after content checks; every non-Markdown deliverable requires its applicable design lifecycle.** This mission implements static research HTML first. It does not pretend to implement slides, PDFs, covers or interactive websites by adding their names to a format list.

The target experience is: research finishes → Sophia designs the report → the user can inspect a representative frame and steer → the latest candidate is rendered and reviewed → Open and Download refer to the same saved HTML → a later section-only revision preserves protected content and appearance, or is refused with evidence.

## Two missions, two coding harnesses

| Mission | Work | Implementation owner | Review/operations owner |
|---|---|---|---|
| **M75** | Finish existing PR #75 as the reader/rendering foundation and fixed-template control | Claude Code | Codex |
| **SDD-01** | New PR: native dsh HTML authoring, render/inspect/review, persisted delivery, steering and selective revision | Claude Code | Codex |

Codex's independent code/app review is **not** the runtime visual-review preset. The former qualifies the software; the latter reviews individual generated artifacts. Neither is Davide's product/release approval.

## Observed source baseline

| Item | Observed identity |
|---|---|
| Sophia repository | `davidelaverga/Sophia` |
| Inspected main/base | `2712f2c2cb06f2ce7fbd4fb9cc437671c41577e7` |
| PR #32 | Merged; PR #75's description records the merge on 4 October 2026 |
| PR #75 | Open draft; branch `claude/smc-m03-report-v2`; head `86f70aa3a7e205f305e8a126995fc6ec0ee472dc` |
| Existing M03 coordination | Issue #31; reuse it for M75 with the separate M75 message namespace |
| dsh baseline | `0.2.0-rc.2`, `639ed015397290b3745d163aafe02ffee4aa3f84` |
| Raven donor | `3632e6040c7038a60ec418ce39ccae185c72c19f` |
| Runtime unit record | `sophia-runtime-m03-dev`; source metadata is not a current deployment receipt |

Sources: [source register](sources/SOURCE_REGISTER.md). Re-read actual refs, issue state and deployed tuple on launch. Do not overwrite newer work, switch to a newer donor, or deploy these observed SHAs simply because this pack names them.

**No new PR, new issue, merge, deployment or paid test has been performed by creating this pack.** SDD-01's actual PR/issue IDs are unallocated. The pack and launch prompts do not create a production release approval.

## Reading order

1. [Decisions and boundaries](01_DECISIONS_AND_SCOPE.md).
2. [M75 closeout](02_M75_CLOSEOUT.md), then [SDD-01 mission](03_SDD01_MISSION.md).
3. [Exact Raven import/reproduction contract](04_RAVEN_IMPORT_CONTRACT.md).
4. [Runtime and artifact bindings](05_RUNTIME_AND_ARTIFACT_BINDINGS.md).
5. [Acceptance/evidence](06_ACCEPTANCE_AND_EVIDENCE.md), [communication protocol](07_COMMUNICATION_PROTOCOL.md), [release runbook](08_RELEASE_RUNBOOK.md).
6. The launch prompt for the assigned harness and mission in [launch/INDEX.md](launch/INDEX.md).

`runtime/` contains literal **Sophia-authored candidate** prompts/procedures. They are not claimed to be byte-for-byte translations of Raven's full corpus and are not a substitute for the source-mapped import gate. `sources/RAVEN_IMPORT_MANIFEST.json` and `tools/inventory_raven.py` define and inventory the donor boundary. The full upstream corpus, gallery images, fonts and runtime are **not bundled** in this pack.

## Completion labels

Keep `source_ready`, `locally_verified`, `release_prepared`, `authorized`, `deployed`, `app_verified`, and `owner_accepted` distinct. A fixture screenshot, a code-review pass, a renderer exit code and a production artifact are different evidence.

M75 can become merge-ready independently. Default rollout is **one coordinated product release after SDD-01 qualifies**; do not present #75's fixed conversion as satisfying the design requirement. A separately authorized emergency reader-only fix remains a different bounded operation.
