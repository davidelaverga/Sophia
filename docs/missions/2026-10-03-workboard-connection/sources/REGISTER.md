# Source register and reading limits
**Inspected on 3 October 2026. All repository links below are exact source pins except live PR discussions.**

| ID | Source | Use and limit |
|---|---|---|
| S01 | [PR #63 status and original UI proposal](https://github.com/davidelaverga/Sophia/pull/63) | Re-read as merged; merge 1bb40f0c0d932420b9fe75fc3f80d8fc850b37b5. Description contains fixture claims and proposed endpoints, not backend implementation. |
| S02 | [Current main source identity](https://github.com/davidelaverga/Sophia/commit/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2) | Inspected c8dd5aa; includes #69 work type-scale follow-up. Source identity is not deployment identity. |
| S03 | [Installed unified continuation](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/docs/execution/2026-10-01-unified/00_START_HERE.md) | v2.0 forward planning baseline, not the older Python/DeerFlow maps. |
| S04 | [Plan model and current corrections](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/work/planning/plan.ts) | Recursive rows; decision revision/actionability; improved assignee and wait lookup; still limited outcome states. |
| S05 | [Shared session actions](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/resources/SessionActs.tsx) | Sending state and stale-action suppression already exist. Stop confirmation and incomplete settlement/owner semantics need the selected extension. |
| S06 | [Task action wrapper](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/work/planning/TaskActions.tsx) | Still owner-only for shared task actions; this is narrower than SCM-03 policy. |
| S07 | [Decision UI](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/work/planning/Decision.tsx) | Expiry and same-choice unknown retry improved; lead-records-choice copy and full receipt binding remain. |
| S08 | [Ask UI](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/work/planning/AskSophia.tsx) | Latest-answer guard exists; full-answer Promise plus 45 ms word reveal remains. |
| S09 | [Task sheet and board](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/work/planning/TaskSheet.tsx) | Task keyed actions/Ask and resource links are already present. Add exact result entry; preserve current resource capacity display. |
| S10 | [Active M03 PR](https://github.com/davidelaverga/Sophia/pull/32) | Latest PR collection inspected: open; description reserves A11/0022-0035 and reports Markdown-first release direction. Refresh at launch; no hosted verification here. |
| S11 | [Current packages](https://github.com/davidelaverga/Sophia/tree/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/packages) | No coordination/plugin/adapter package in the inspected main directory listing; new paths are proposed. |
| S12 | [Runtime unit](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/config/runtime-unit.json) | dsh 0.2.0-rc.2, pinned development route; historic readiness text is not current hosted evidence. |
| S13 | [SCM-01 first managed outcome](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/docs/execution/2026-10-01-unified/goals/SCM-01.md) | One source-review item; not retired draft_brief; real cancellation/reconciliation and source-backed result required. |
| S14 | [SCM-03 shared guidance and controls](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/docs/execution/2026-10-01-unified/goals/SCM-03.md) | Cross-owner shared builders, scoped peers and fenced controls. These are plan requirements, not deployed proof. |
| S15 | [SCM-04 technical lead](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/docs/execution/2026-10-01-unified/goals/SCM-04.md) | Plan, review and replan decomposition; WBC-02 deliberately consumes only a narrow source-review plan template. |
| S16 | [Selected Paperclip integration](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/docs/execution/2026-10-01-unified/coordination/03_PAPERCLIP_INTEGRATION.md) | Separate service/database, integration identity, plugin and adapter targets; retained normative mapping. |
| S17 | [LFE-07 retained scope](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/docs/execution/2026-10-01-unified/frontend/LFE-07.md) | Board, lead review, capacity warning and handover remain distinct sessions. |
| S18 | [Current board lanes](https://github.com/davidelaverga/Sophia/blob/c8dd5aa975fb8f0a872e32a89d7d674a356e79f2/apps/studio/src/features/work/planning/PlanBoard.tsx) | Read lines 1-143; existing In motion/Up next/Open/Done mapping and improved per-viewer seen state. |
| P01 | [Implemented plugin surface at selected pin](https://github.com/paperclipai/paperclip/blob/5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb/doc/plugins/PLUGIN_AUTHORING_GUIDE.md) | Read implemented alpha guide, not speculative PLUGIN_SPEC. Namespace routes, host issue APIs and namespace-only DB mutation. |
| P02 | [External-adapter cancellation contract at selected pin](https://github.com/paperclipai/paperclip/blob/5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb/packages/adapter-utils/src/types.ts) | Read relevant context sections: signal, onCancellationReady, onDispatch, session and event contracts. Does not qualify every runtime behavior. |
| P03 | [Current official external-adapter documentation](https://docs.paperclip.ing/reference/adapters/external-adapters/) | External package/factory installation; independently versioned. Checked 3 October; pin-specific source wins on an API discrepancy. |
| P04 | [Current official Adapter Manager documentation](https://docs.paperclip.ing/guides/org/adapters/) | Alpha version pinning; menu hiding is not execution revocation. |

**S19 — final head recheck:** [PR #70 merge `2c13747cbea08f937ca133769dab17f5d559f5c0`](https://github.com/davidelaverga/Sophia/commit/2c13747cbea08f937ca133769dab17f5d559f5c0). The diff was inspected: search-field typography, its test helper and supporting records only. Core semantic source observations remain pinned above.

## Attached review basis

The two prior generated files were read in full: `Sophia_Luis_Demo_Review_and_Backend_Handoff_2026-10-03.md` and `Sophia_Reply_to_Luis_Demo_Review_2026-10-03.md`. Their product recommendations informed the selected delta. Their pre-merge source findings were refreshed against current main; fixed cases were not silently repeated as current defects.

The previous review recorded frame-based inspection of Luis's three demo videos. This packet did not re-review the recordings in full or run the Sophia UI. One still around 0:07 of the supplied Tasks recording was extracted and viewed for illustration in the HTML; it is labeled as the original fixture demonstration, not evidence of new live behavior.

## Source versus design

Current code/PR facts are recorded in `01_CURRENT_LEDGER.md`. The mission scopes, schema v2/v1, lane mapping, bounded source-review template, response copy and delivery sequence are **new proposed implementation decisions** for the requested missions. They are not claims that upstream ships those names or that the selected integration is live.

Legacy Sophia-Agent maps/specs supplied in context were intentionally excluded as implementation authority. Their Python, Next.js and older provider details must not replace the current Sophia TypeScript/dsh/Studio sources.

## Validation boundaries

No application suite, real Paperclip service, dsh provider call, native coding account, migration, production deployment or hosted endpoint was exercised during document creation. Packet validators only check the generated documentation and synthetic examples. The implementation missions separately require real source, local integrated, provider and hosted evidence.
