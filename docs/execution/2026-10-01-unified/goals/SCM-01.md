# SCM-01 — Make one Paperclip-managed dsh outcome real

**Milestone:** A · **Depends on:** SCM-00  
**Human backend/runtime owner:** Davide · **Frontend implementation/integration:** Luis · **Implementation resource:** scoped Claude Code · **Operator/independent reviewer:** Codex under separate authority
**Launch:** [Claude](../launch/SCM-01_CLAUDE.md) · [Codex](../launch/SCM-01_CODEX.md)

## Outcome

One authorized source-review work item is tracked by Paperclip, executed by the existing dsh bridge and returned as source-backed evidence without duplicate execution.

## Entry and existing machinery

SCM-00’s binding matrix is accepted. M02 is already merged with bounded release evidence reported. Qualify only the new managed role and allowance; do not repeat the historical cutover. The first task is not the retired draft_brief.

**Reuse:** Existing mission/project authorization, commands/outbox, runtime service, execution identity, retained events, source readers and role guards. Add only the work-level mapping and required domain tools.

**Required sources:** S03, S04, S05, S12, S13, P01, P02, P03, P04; resolve in [the source register](../sources/REGISTER.md). Read the applicable [architecture](../00_START_HERE.md) and [operations protocol](../operations/WORKING_PROTOCOL.md).

## Destination ownership

- `packages/coordination/`
- `packages/paperclip-plugin/`
- `packages/paperclip-adapters/src/sophia-dsh/`
- `packages/dsh-bundle/src/role-registry.ts`
- `packages/dsh-bundle/src/control-bridge.ts (narrow binding only)`
- `apps/api/src/routes/coordination/`
- `apps/worker/ (delivery/reconciliation only)`
- `packages/contracts/amendments/`
- `db/migrations/ (fresh reserved IDs)`
- `deploy/paperclip/`

New paths above are proposed destinations. Check the actual checkout before creating them. One nominated writer owns shared generated contracts and fresh migration IDs. Keep frozen pack contents and unrelated active branches intact.

## Goal sessions

### SCM-01-G1 — Private backend and actual adapter contract

**Build:** Build the pinned Paperclip server plus self-contained plugin/adapter packages. Configure a separate database, company-scoped integration principal, operator-only admin and fixed internal origin. Prove authenticated route access and rejected cross-project/forged actor input. Bind current core issue create/read/wake/hold/disposition methods; do not infer URLs from service function names.

**Handback:** A local private service with exact build identities, no provider/admin token in Studio and a real supported binding table.

### SCM-01-G2 — Commission and projection

**Build:** Implement durable Sophia commission intent, core issue creation/reconciliation, stable work mapping and versioned projection. Force response loss after core creation; find the same issue by the proven operation binding. Issue state is not separately mutable through old handlers.

**Handback:** One work ID, one actual core issue and a readable pending/queued state across retries. Unknown create outcomes cannot produce a second issue.

### SCM-01-G3 — Existing dsh execution

**Build:** Implement a real bounded read-only review role through the current M02/M03 registry as selected after source handoff and existing control bridge. The adapter opts into cancellation before effects, obtains current effect permission and dispatches an identified native command. Return a source-backed result with correct billing/usage basis; no last-assistant-message-as-product shortcut.

**Handback:** One useful review of selected source/criteria, no unrestricted shell or invented brief admission. Effective recipe identity and evidence recorded.

### SCM-01-G4 — Crash, wait and stop crossings

**Build:** Crash the observer after native creation, recover/attach using the same attempt, exercise pre-aborted and mid-run cancellation, unknown settlement and source revocation. Bind core holds to prevent autonomous duplicate restart.

**Handback:** No duplicate native attempt; no late publication under a stopped or ineligible epoch; unresolved effects remain visible.

### SCM-01-G5 — First bounded release

**Build:** Prepare a reader-first release and one owner-approved pilot task. Keep ordinary voice/text functioning if Paperclip is unavailable. Record the exact candidate, core issue/run and native identity.

**Handback:** Real hosted managed result or honest blocked qualification. Do not mark the whole product accepted from a local mocked adapter.

## Prompt and skill delta

Start with the bounded independent-reviewer role. The technical-lead role is commissioned in SCM-04; carrying its asset does not enable it prematurely. Preserve the actually selected hash-pinned guide; M03 v1.2 is a separate in-flight feature, not an implicit overwrite. Wire only real tools; role labels do not grant absent capabilities.

A tool’s declaration, backend authorization and effective runtime visibility must agree. Adding a prompt mention is not implementing a capability. New role/configuration changes are hashed/versioned and exercised through the current native registry.

## Acceptance cases

| ID | Case | Required result |
|---|---|---|
| SCM-01-T01 | Forged actor/company | A valid service credential plus an invalid/stale Sophia envelope cannot dispatch. |
| SCM-01-T02 | Lost issue-create reply | The same command reconciles the same core issue; no blind duplicate create. |
| SCM-01-T03 | Observer restart | Native process may still live; recovery binds the existing attempt before any new dispatch. |
| SCM-01-T04 | Pre-aborted cancellation | No native/model effect; register signal handling before start. |
| SCM-01-T05 | Stop and delayed result | Epoch fence rejects stale publication; unknown stop cannot be reported as verified. |
| SCM-01-T06 | Review versus acceptance | Useful review completion does not accept the implementation or deploy anything. |
| SCM-01-T07 | Paperclip outage | Conversation/living brief and direct safety controls remain usable; new operational work is honestly unavailable. |
| SCM-01-T08 | Usage scope | Cumulative session totals are not charged repeatedly as per-run totals; unknown cost is not zero. |

All cases start **not run** in this pack. Add exact candidate, configuration, evidence and result when executed. A synthetic fixture proves only its labeled boundary; it is not a real provider/native/hosted result. Existing tests must remain green on the actual combined candidate.

## Operations handoff

Provision only approved private Paperclip/database resources and secret names; calculate actual recurring cost before approval. Build exact artifacts, apply reviewed fresh migrations, verify auth boundaries and run one bounded live source review.

The request must name exact source/artifacts, target, allowed effects, migration hashes/order where applicable, remaining allowance, expiry and recovery. Credentials are secret-store references only. Every effect’s actual result is a receipt, not an optimistic checklist tick.

## No-go / exclusions

No Native Runner migration, no generic CEO, no direct personal memory, no full artifact platform, no second autonomous retry service.

## Stop condition

A single core issue drives one actual dsh attempt, survives observer loss, yields a readable result and obeys Stop. If this requires a pervasive core fork, stop expansion and document the smallest unmet contract.

Use the [handoff template](../operations/HANDOFF_TEMPLATE.md). Keep pending gates explicit and stop the implementation session at a meaningful boundary; no artificial wait to manufacture long-duration evidence.


## v2.0 integration obligations

Use the current source, A10/A11 reservations through 0031 at inspection, and single M03 specialist/byte/report contract. Luis implements the mapped frontend; no second registry or report UI. Personal Bot jobs are not stored in a team Paperclip company. This goal and its LFE package share acceptance evidence, not duplicate operational ownership.
