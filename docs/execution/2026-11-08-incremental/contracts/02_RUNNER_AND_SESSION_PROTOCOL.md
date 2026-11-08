# C02 — Native runner and session protocol

**Applies to:** INC-01, INC-02, INC-04 and INC-05.  
**Status:** normative requirements for the implementation; operation and record names below are proposed Sophia semantics, not claims about installed endpoints. Map them onto current repository contracts during INC-00.  
**Authority:** [domain, authority and funding](01_DOMAIN_AUTHORITY_AND_FUNDING.md), [intake and events](03_INTAKE_ALLOCATION_AND_EVENTS.md), and the [mission](../MISSION.md).

## 1. Boundary and selected approach

Sophia owns admission, source eligibility, grants, work identities and acceptance. Paperclip owns the enrolled operational dependency and continuation path. The selected native adapter owns provider session/process observation inside a qualified owner environment. None can independently broaden the others' authority.

Implement one `SophiaRunnerPort`. Qualify the narrow T3/native boundary first. Do not import T3's application UI, expose its environment-wide MCP credential to Studio or a model, or build a second direct-provider adapter in parallel. If a required operation fails qualification, record the exact incompatibility and select the smallest substitute behind this port. A research reference is not a deployment pin; INC-00 records the actual version and provenance.

T3's inspected provider adapters and MCP contract justify the qualification work, while its broader environment access and delivery modes require a Sophia gateway. Ordinary follow-ups must request **queue** explicitly: upstream **auto** can steer an active turn, and active Claude steering can interrupt tools. These behaviors cannot be relabeled “non-destructive.” [T1][T2][T3]

## 2. Normative invariants

| ID | Requirement |
|---|---|
| C02-R01 | Every external operation resolves an authenticated owner/actor and its applicable scope: owner-private qualification, or the exact admitted project/repository/workspace and current assignment. Caller-supplied native IDs never establish that mapping. |
| C02-R02 | Qualification distinguishes supported, unqualified and unsupported operations for the exact provider, account route, tool/adapter version and host profile. An unavailable primitive is not emulated by an undisclosed stronger operation. |
| C02-R03 | Native credentials and unrelated histories remain in the owner's qualified environment. A clean per-profile launch proves the selected authentication route; ambient API keys cannot change native funding. |
| C02-R04 | Mutations use durable stable operation/request IDs and canonical payload hashes. Duplicate same-ID/same-payload requests return the existing outcome; different payload under the same ID conflicts. |
| C02-R05 | Persist the execution binding and dispatch intent before sending; revalidate mutable authority at actual send. A timeout after possible send enters reconciliation, not automatic replacement. |
| C02-R06 | Events are bounded, cursor-based, identity-bearing observations. Reconnect reconciles from a durable mapping/snapshot; it never treats replay as new human direction. |
| C02-R07 | Hold/Stop, revocation and source withdrawal fence new work sends immediately while authorized observation/settlement remains available. Requested controls and proven native settlement remain distinct. Lease expiry does not prove an old writer stopped. |
| C02-R08 | Native permission requests return to their actual authorized decision owner. A model, another resource or an expired approval cannot approve them implicitly. |
| C02-R09 | Paperclip is the one enrolled continuation owner. T3 child completion, automatic retries and background model calls cannot create a second unadmitted wake path. |
| C02-R10 | Each writer has an isolated admitted worktree/effect scope. Execution profile isolation must protect unrelated credentials/history; a different directory alone is insufficient. |
| C02-R11 | Result collection preserves exact source/candidate identity, observed settings, known and uncertain usage, and unresolved effects. Native completion never means accepted, merged, deployed or verified. |
| C02-R12 | Retries, follow-ups, repairs and replacement sessions keep cumulative mission allowances and unsettled effects. No alternative account bypasses an operation-level refusal. |
| C02-R13 | Protocol/profile changes are versioned and qualified before activation. Rollback disables new admissions while retaining observation, settlement and evidence. |

These are logical invariants, not a requirement to create thirteen independent services or duplicate existing persistence.

## 3. Identity and binding envelope

The server resolves or derives the following restricted execution envelope. Public projections expose safe identifiers only; credential values and personal filesystem locations are excluded.

| Group | Required meaning |
|---|---|
| Protocol | `protocol_version`, `operation_id`, stable `client_request_id`, `payload_digest`, created/deadline timestamps |
| Actor | Authenticated requester, resource owner, project and current membership/authority revision where applicable |
| Work | `mission_id`, `assignment_id`, role, `manager_generation`, `attempt_id`, accepted scope and effect limits |
| Resource | `resource_connection_id`, `entitlement_account_id`, connection/profile/grant revisions, owner-bound `runner_id` |
| Binding | Immutable `execution_binding_id`/digest, actual source manifest/hash, repository/base/worktree identity, requested/accepted settings |
| Native mapping | Provider instance and opaque native session/run/message IDs, once known; never arbitrary client-selected IDs |
| Controls | Current fence/hold generation, permitted control mode, permission-request revision where applicable |
| Accounting | Existing cumulative mission allowance, current commitment, concurrency reservation and permitted background operations |
| Recovery | Dispatch intent, possible-send marker, last acknowledged cursor, prior receipt and unresolved-effect references |

An intake proposal with incomplete context is not an executable binding. Freeze the binding only after authorized context assembly produces its actual manifest. Never fill a placeholder hash or rewrite a frozen binding. If a pre-send recompilation is needed, retain operation lineage and create a new binding revision under current checks.

The native adapter must reject an envelope mapped to another owner, project, repository, provider instance or assignment generation. Do not reveal whether a foreign native session exists. A stale generation may supply evidence for reconciliation but cannot publish a current candidate or start new work.

## 4. Required port operations

Names are semantic. INC-00 binds them to actual TypeScript interfaces and supported native operations; no undocumented upstream endpoint is assumed.

| Operation | Admission and input | Required result |
|---|---|---|
| `qualify_instance` | Owner-authorized runner/profile; declared test allowance if inference is needed | Installed versions, actual auth/account provenance, model/effort catalog and operation support with evidence and limitations |
| `create_or_attach` | Frozen assignment/binding, stable request ID and allowlisted workspace | `created`, `attached`, `waiting`, `denied` or `unknown`; exact native identities when known |
| `read_execution` | Authorized existing mapping, cursor, bounded field/byte/event limits | Incremental observations or snapshot plus cursor, freshness/coverage and any gap |
| `submit_input` | Admitted work message, exact target, stable ID, allowed mode | Durable queued/native-message receipt or explicit uncertain/refused state |
| `request_control` | Current authority and fence; idempotent control ID; explicit qualified hold/stop/resume mode | Recorded request, native acknowledgment if any, and separately observed settlement or continuation |
| `resolve_permission` | Exact pending permission, current authorized decision owner, expected revision | Decision receipt for that request/scope only; stale or foreign decision denied |
| `collect_result` | Exact mapped execution/candidate; no new inference by default | Source/result manifest, actual execution evidence, settings, usage and unresolved effects |
| `reconcile_operation` | Existing operation and all known external identities | Prior effect found/settled, proven not sent, or still unknown; never implicit retry with a fresh key |

`attach` and `read_execution` observe an existing session; they do not launch an extra provider turn. A session already running can continue to accrue usage, which remains accounted for. A project-manager inquiry requiring a new answer is a separately admitted `submit_input`, not a free status read.

Do not accept shell commands, arbitrary MCP tool names, untrusted filesystem paths or provider URLs as substitutes for these operations. The selected profile constrains the tools a native agent can use, including network and GitHub effects.

## 5. Enrollment and credential custody

Register a runner through an authenticated owner-bound, expiring pairing flow. Bind proof of the runner to that owner; consume the pairing credential once and store only the resulting operational identity where possible. The runner initiates an authenticated channel to Sophia. It must not expose an unauthenticated local control API on a public interface.

Use the official native sign-in on the owner's environment. Sophia can display a safe status or initiate the qualified sign-in flow; it must not ask the user to paste a consumer login-session token into a project. Account provenance records the supported native observation or explicitly qualified owner confirmation and its limitations.

Native Codex and Claude Code profiles keep separate account/config/history boundaries between owners. Launch processes from an allowlisted environment, excluding unintended API credentials and alternate endpoint settings. Do not change shared process-global keys between concurrent users. Where billing provenance cannot be established well enough to distinguish native from API execution, the route is unqualified rather than guessed.

A saved enrollment can be authenticated but unavailable because its runner is offline, its profile is stale, its grant is revoked or capacity is unknown. Heartbeat and lease expiry affect readiness; they do not claim native process settlement. Owner-controlled hosted environments use this same protocol after isolation qualification, rather than a new generic pooled-account service.

## 6. Dispatch, acknowledgments and recovery

Normal dispatch proceeds as follows:

1. Commit accepted work, binding, commitment and pending outbox operation in Sophia.
2. Create/reconcile the mapped Paperclip operational issue and dependencies through supported APIs. A lost response must resolve the prior commission before creating another issue.
3. On an eligible wake, atomically validate the current grant, source, assignment/fence, model/settings, capacity and workspace ownership. Register cancellation before the external send.
4. Mark the possible-send boundary and call the runner with the stable request ID and immutable digest.
5. The runner persists its command/native mapping and returns the strongest receipt it can support. Native input delivery is acknowledged as durable only after its selected provider/session persistence has been observed or qualified.
6. Store the returned identities and observations. A lost reply leads to `reconcile_operation` using the same key.
7. Collect existing result evidence; advance dependencies only after Sophia validates the appropriate candidate/review/test gate.

There is no atomic transaction spanning Sophia, Paperclip, T3, the provider and GitHub. Explicitly test the crash windows before send, after native accept, before receipt persistence and after a control request. If the upstream route lacks a lookup strong enough to prove whether an effect occurred, preserve `unknown`, fence replacement work and assign a bounded diagnostic task. Do not claim universal exactly-once provider execution. The contract is durable deduplication and no unsafe blind replay.

Command identity must survive process restart and reconnection. Reinstalling a runner cannot silently create a fresh namespace for an old outstanding operation. Retire or migrate its mappings explicitly. A same-ID/different-payload conflict is a client/coordination error, never an instruction to overwrite native history.

## 7. Observations, queueing and controls

Retain bounded provider events with assignment, session/run, operation and cursor provenance. Native storage retention may be shorter than Sophia's mission evidence needs; retain necessary receipts, candidate manifests and decisions in Sophia. A cursor gap causes a bounded snapshot/reconciliation and a visible coverage limitation, not a fabricated continuous history. Exclude private reasoning and unrelated personal sessions from retrieval.

| Condition | Honest projection | Permitted next behavior |
|---|---|---|
| Offline before send | Waiting for runner | Retain input; refresh/reconnect without new inference |
| Send possibly accepted | Outcome unknown | Reconcile existing operation; no duplicate writer |
| Native active | Running | Observe and admit scoped input/control |
| Native waiting on limit/permission | Waiting, with active/settled status separate | Resolve allowed decision or wait; do not assume exit |
| Hold/Stop requested | Holding/stopping | Fence future sends; obtain supported settlement evidence |
| Settlement observed | Held/stopped | Retain results/accounting; explicit permitted resume required for held work |
| Native ended | Collecting/awaiting verification | Validate result; do not declare mission completion |
| Observation conflict/gap | Reconciliation required | Bounded inspection; preserve both conflicting observations |

Ordinary follow-ups target the one project manager with `queue`. A queue receipt means retained for delivery/processing; it does not mean accepted into the plan or applied. `steer`, `interrupt` and `restart` are distinct capabilities and require separately qualified intervention policy and current authority. An unsupported mode is refused instead of translated silently.

Held/stopped missions permit authorized reads of retained evidence. They do not permit a new native inquiry turn, hidden resume or a fresh child. If evidence cannot answer a question, retain a waiting question. Speech barge-in, call ending and browser closure do not invoke mission Hold/Stop.

Resume is a separately qualified control with a stable operation ID, current grant/source/authority checks, and an observed held/settled precondition. It preserves the admitted account, settings, source scope, session mapping where supported, and cumulative allowance. Attach remains observation-only. Do not translate Resume into restart, a new session, or a stronger native intervention. Unknown settlement, a stopped generation, or an unsupported/unqualified profile returns an explicit unavailable/conflict state instead of continuing. Test the held-to-running transition before exposing the control.

Current revocation fences new work sends and invokes the active settlement policy. Authorized observation, control and result reconciliation remain available. A running process that cannot be stopped must remain pending/isolated with its exact unsettled effects. Do not release writer ownership, remaining commitments or permit a replacement writer merely because the observer ended or a lease expired.

## 8. Workspace, permissions and result evidence

Each writer operates on its admitted repository/base and isolated worktree. Read-only qualification/review profiles must enforce their declared source/effect boundary, not merely request it in a prompt: no target-repository or external mutations beyond the approved profile. Necessary native session journals and isolated test scratch are declared separately; they do not grant write authority over the candidate. Native permission requests include a safe summary, exact requested capability/scope, session, expiry and authority owner; project text cannot approve them.

Result handback contains the actual base/head/tree identity, changed paths, permitted untracked assets with hashes, source manifest, commands/checks actually run, native settings observation, usage uncertainty, candidate URL where applicable and unresolved effects. Hash-check transferred source/assets. Never transfer home directories, raw native login files or unfiltered transcript archives.

Reviewer and tester are logical obligations with separate evidence. The delivery programme uses one independent Codex thread for these stages. Runtime role reuse requires its qualified profile and preserves independent execution records; an author cannot become independent by changing the role label.

No native completion, Paperclip `done`, tool success or final model sentence accepts a candidate. Apply the exact-candidate and exact-deployment gates in [delivery/review](../operations/DELIVERY_AND_REVIEW.md) and [deployment/verification](../operations/DEPLOYMENT_AND_VERIFICATION.md).

## 9. Qualification and rollback

INC-01 proves account/auth/model identity and one bounded result per required connection. INC-02 adds effectful create/read/queue/control, crash-window reconciliation, one continuation owner, worktree isolation and a complete verified repository release. Use deterministic fault injection for difficult timing/limit states; use bounded live cases to prove the selected native route actually operates. Do not deliberately exhaust subscriptions to manufacture a failure.

Roll out per owner/provider/profile and operation. Disable new admissions independently of observation, controls and result collection. Keep old mappings and all known/uncertain accounting while reverting compatible runtime code. No database downgrade or record deletion may strand a live process. An operation-level provider refusal, task Stop or source prohibition cannot be bypassed through another resource; a resource-specific capacity/authentication failure is separately classified under the permitted new-assignment policy.

## 10. Source references

- [Current Sophia baseline and implementation seams](../references/BASELINE_AND_SOURCES.md).
- **T1:** [T3 Claude adapter](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts) and [provider behavior](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/user/providers-claude.md).
- **T2:** [T3 outside-agent access](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/user/outside-agents.md).
- **T3:** [T3 orchestration/MCP contract](https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/orchestration-v2/orchestrator-mcp-server.md).

[T1]: https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/user/providers-claude.md
[T2]: https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/user/outside-agents.md
[T3]: https://github.com/pingdotgg/t3code/blob/ade473018d32003658b7d38693e083ee2e314bd8/docs/orchestration-v2/orchestrator-mcp-server.md
