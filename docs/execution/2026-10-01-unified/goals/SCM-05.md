# SCM-05 — Allocate around capacity and transfer remaining work safely

**Milestone:** C · **Depends on:** SCM-04  
**Human backend/runtime owner:** Davide · **Frontend implementation/integration:** Luis · **Implementation resource:** scoped Claude Code · **Operator/independent reviewer:** Codex under separate authority
**Launch:** [Claude](../launch/SCM-05_CLAUDE.md) · [Codex](../launch/SCM-05_CODEX.md)

## Outcome

Sophia uses real owner/window information to recommend work allocation, warns about risky large steers and can transfer only remaining work without double execution or secret paid fallback.

## Entry and existing machinery

Account-bound observations and contribution policies from SCM-02 exist; the technical lead and explicit decision/control path are qualified. Design fixtures and warning UI may be prepared earlier.

**Reuse:** Resource grants, quota observations, project decisions, core operational holds/wakes, exact source versions and current effect fences.

**Required sources:** L02, L03, S08, P02; resolve in [the source register](../sources/REGISTER.md). Read the applicable [architecture](../00_START_HERE.md) and [operations protocol](../operations/WORKING_PROTOCOL.md).

## Destination ownership

- `packages/coordination/src/capacity/`
- `packages/coordination/src/handover/`
- `packages/paperclip-plugin/src/`
- `apps/api/src/routes/coordination/`
- `apps/studio/src/features/work/resources/`
- `apps/studio/src/features/work/guidance/`

New paths above are proposed destinations. Check the actual checkout before creating them. One nominated writer owns shared generated contracts and fresh migration IDs. Keep frozen pack contents and unrelated active branches intact.

## Goal sessions

### SCM-05-G1 — Headroom and commitments

**Build:** Track same-window estimates, reserves, applicable limits and unreflected demand. Reconcile new observations without charging both observed consumption and the old full commitment. Preserve unknowns.

**Handback:** Two sessions share one entitlement; all applicable windows constrain allocation; calculations are deterministic and source-linked.

### SCM-05-G2 — Exact steer choice

**Build:** Implement Confirm steer / Let project lead reassign / cancel bound to one pending amendment, current candidate/work/grant/quota revisions and named actor. Tiny corrections avoid needless ceremony.

**Handback:** Double/stale/conflicting clicks settle one branch; confirmation never overrides an owner reserve, hard limit or extra-spend requirement.

### SCM-05-G3 — Source-preserving handover

**Build:** Implement proposal, provisional destination, checkpoint/source capture, old-send retirement, actual writer settlement, outstanding-effect reconciliation and new attempt binding. Recipient verifies base/patch and continues remaining work only.

**Handback:** A quota-exhausted worker can hand over from maintained source evidence without one last model response; unknown old writer prevents transfer.

### SCM-05-G4 — Reset-aware reconsideration

**Build:** On an observed reset or material threshold/policy change, reconsider queued/next checkpoint work. Use fake time for multi-day cases and hysteresis to avoid churn.

**Handback:** Reset time alone does not create quota or revive Stop; no task moves just to balance usage bars.

### SCM-05-G5 — Founder capacity episode

**Build:** Demonstrate one advisory allocation, one risky steer decision and one transfer on actual enrolled sources. Use synthetic shortage injection where needed; do not deliberately exhaust a personal account.

**Handback:** Retained work/source/acceptance history and correct payer identity, with measured interruption/user effort and clear telemetry limitations.

## Prompt and skill delta

Technical lead consumes window facts and deterministic eligibility, not invented balances. Add no arithmetic/classifier authority to the conversational model. Worker/coordinator always preserve a useful checkpoint and report limitations.

A tool’s declaration, backend authorization and effective runtime visibility must agree. Adding a prompt mention is not implementing a capability. New role/configuration changes are hashed/versioned and exercised through the current native registry.

## Acceptance cases

| ID | Case | Required result |
|---|---|---|
| SCM-05-T01 | Unknown arithmetic | Missing values remain unknown, never zero usage/full headroom. |
| SCM-05-T02 | Double counting | New observation reconciles only unreflected demand; private concurrent use invalidates estimates. |
| SCM-05-T03 | All windows | Healthy weekly capacity cannot bypass exhausted short or applicable scoped window. |
| SCM-05-T04 | Choice race | Duplicate Confirm and Reassign resolve once against one exact command. |
| SCM-05-T05 | Hard-limit override | Risk confirmation cannot authorize overage, change reserve or use another owner’s token. |
| SCM-05-T06 | Old writer still active | No new writer lease on a database status change alone. |
| SCM-05-T07 | Outstanding side effect | Unknown migration/deploy/upload is inspected, not repeated after handover. |
| SCM-05-T08 | Reset and Stop | Fake-clock reset triggers refresh; only observed reset changes availability and stopped work stays stopped. |

All cases start **not run** in this pack. Add exact candidate, configuration, evidence and result when executed. A synthetic fixture proves only its labeled boundary; it is not a real provider/native/hosted result. Existing tests must remain green on the actual combined candidate.

## Operations handoff

Observe sanitized owner telemetry under consent. Run handover against a disposable scoped branch and controlled fault injection; no account exhaustion campaign, overage purchase or plan change.

The request must name exact source/artifacts, target, allowed effects, migration hashes/order where applicable, remaining allowance, expiry and recovery. Credentials are secret-store references only. Every effect’s actual result is a receipt, not an optimistic checklist tick.

## No-go / exclusions

No global scheduler optimum, dollar conversion of unlike quota bars, hidden account switching or mandatory paid capacity.

## Stop condition

One exact steer choice and one source-preserving transfer complete without duplicate writer/charge/acceptance. Unknown telemetry is visibly honest; advanced consumption forecasting remains gated.

Use the [handoff template](../operations/HANDOFF_TEMPLATE.md). Keep pending gates explicit and stop the implementation session at a meaningful boundary; no artificial wait to manufacture long-duration evidence.


## v2.0 integration obligations

Use the current source, A10/A11 reservations through 0031 at inspection, and single M03 specialist/byte/report contract. Luis implements the mapped frontend; no second registry or report UI. Personal Bot jobs are not stored in a team Paperclip company. This goal and its LFE package share acceptance evidence, not duplicate operational ownership.
