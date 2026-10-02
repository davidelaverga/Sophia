# SCM-02 — Connect three owner-native resources with real capacity state

**Milestone:** B · **Depends on:** SCM-00  
**Human backend/runtime owner:** Davide · **Frontend implementation/integration:** Luis · **Implementation resource:** scoped Claude Code · **Operator/independent reviewer:** Codex under separate authority
**Launch:** [Claude](../launch/SCM-02_CLAUDE.md) · [Codex](../launch/SCM-02_CODEX.md)

## Outcome

Davide’s Codex, Davide’s Claude Code and Luis’s Claude Code each perform a bounded task under their own native login, with truthful readiness, required owner actions and capacity observations.

## Entry and existing machinery

Owner connection and project contribution choices are known. Never create credentials or choose repository roots on behalf of an absent owner. Native adapters can be tested locally while SCM-01 is built.

**Reuse:** Architecture 11 session construction, resource/owner separation and source isolation requirements. The transport remains on its specified source pin unless an explicit narrow change is qualified.

**Required sources:** S08, O01, L02, L03, W01, W02; resolve in [the source register](../sources/REGISTER.md). Read the applicable [architecture](../00_START_HERE.md) and [operations protocol](../operations/WORKING_PROTOCOL.md).

## Destination ownership

- `packages/execution-adapters/src/omnigent/`
- `packages/coordination/src/resources/`
- `apps/api/src/routes/resources/`
- `apps/studio/src/features/work/resources/`
- `packages/contracts/amendments/`
- `db/migrations/ (fresh reserved IDs)`

New paths above are proposed destinations. Check the actual checkout before creating them. One nominated writer owns shared generated contracts and fresh migration IDs. Keep frozen pack contents and unrelated active branches intact.

## Goal sessions

### SCM-02-G1 — Per-owner enrollment

**Build:** Implement backend device-flow initiation/redemption, returned-owner binding, encrypted rotating credentials and a project-scoped contribution grant. Explicitly exclude admin engineer identities and generic proxy paths.

**Handback:** Two owners, three separately identified resources, with correct host/repo boundaries and disconnect behavior.

### SCM-02-G2 — Create, bind, launch and observe

**Build:** Use dormant session → scoped MCP → exact model/effort → selected worktree/host → readiness → identified task ordering. Capture source base and actual native session identity. Preserve unknown configured_harnesses states.

**Handback:** Each resource returns a useful bounded result from its authorized source surface; locked-but-awake programmatic operation does not depend on screenshots/clicks.

### SCM-02-G3 — Owner actions

**Build:** Observe a real supported native permission request, including child-session identity. Surface only to its owner, open the native route safely and reconcile the response. Keep unsupported login/OS prompts explicit.

**Handback:** Correct owner/request shown and resolved on native evidence; “resolved” and “execution resumed” are distinct.

### SCM-02-G4 — Structured quota and contribution policy

**Build:** Bind supported owner-local collectors. Retain all known windows, reset timestamps, runtime versions, incomplete/missing telemetry and consented shared metadata. Add advisory eligibility and the first warning shell with synthetic examples clearly labeled.

**Handback:** No pooled account balance, no context-window confusion, no fabricated telemetry and no paid probe solely to update a meter.

### SCM-02-G5 — Resource degradation

**Build:** Exercise host sleep/disconnection, stale grant, expired/reused refresh response, permission-wait Stop and revoke. Retain unknown effects and never select another payer automatically.

**Handback:** Each resource can be disconnected safely without making false claims about an existing process.

## Prompt and skill delta

Use prompts/worker.md and skills/coordination.md in trusted session-scoped bundles. Do not inherit permissive demo permission modes. No instructions may authorize hidden fallback or claim provider-account ownership.

A tool’s declaration, backend authorization and effective runtime visibility must agree. Adding a prompt mention is not implementing a capability. New role/configuration changes are hashed/versioned and exercised through the current native registry.

## Acceptance cases

| ID | Case | Required result |
|---|---|---|
| SCM-02-T01 | Cross-owner host launch | Editor rights cannot launch another owner’s unenrolled host or repository. |
| SCM-02-T02 | Native bundle ordering | MCP exists before start; late per-turn tool definitions are not treated as installation. |
| SCM-02-T03 | Permission child/owner | Wrong parent, wrong actor and stale fingerprint cannot answer a request. |
| SCM-02-T04 | Host asleep | Reported unavailable/waiting, never fabricated progressing. |
| SCM-02-T05 | Shared entitlement | Two sessions on one account do not provide double capacity; same vendor/different owner stays separate. |
| SCM-02-T06 | Missing window/reset | Unknown not unlimited; passed reset timestamp not fresh balance. |
| SCM-02-T07 | Refresh uncertainty | Lost rotating-refresh reply is reconciled/reauthorized, not retried forever with old token. |
| SCM-02-T08 | Revoke with live process | Dispatch eligibility ends immediately; stop outcome remains pending/unknown until observed. |

All cases start **not run** in this pack. Add exact candidate, configuration, evidence and result when executed. A synthetic fixture proves only its labeled boundary; it is not a real provider/native/hosted result. Existing tests must remain green on the actual combined candidate.

## Operations handoff

Each owner authorizes their own native login/device grant and selected source roots. Codex operates the shared service only under the owner batch, never collects provider passwords, and records exact native versions and observed test sessions.

The request must name exact source/artifacts, target, allowed effects, migration hashes/order where applicable, remaining allowance, expiry and recovery. Credentials are secret-store references only. Every effect’s actual result is a receipt, not an optimistic checklist tick.

## No-go / exclusions

No credential pooling, global desktop adoption, provider API-key conversion, arbitrary host files, auto-installing native tools or broad in-app permission automation.

## Stop condition

All three actual resources return a bounded useful result, a real owner-specific request is observed/resolved, and telemetry truthfully reports either qualified values or precise missing capability. A missing meter may be a recorded limitation, not fabricated success.

Use the [handoff template](../operations/HANDOFF_TEMPLATE.md). Keep pending gates explicit and stop the implementation session at a meaningful boundary; no artificial wait to manufacture long-duration evidence.


## v2.0 integration obligations

Use the current source, A10/A11 reservations through 0031 at inspection, and single M03 specialist/byte/report contract. Luis implements the mapped frontend; no second registry or report UI. Personal Bot jobs are not stored in a team Paperclip company. This goal and its LFE package share acceptance evidence, not duplicate operational ownership.
