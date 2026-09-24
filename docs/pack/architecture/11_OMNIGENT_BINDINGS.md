# 11 — The three-engineer bridge, bound to actual Omnigent interfaces

**Decision-complete integration specification · Part 2.** Source anchor: `omnigent-ai/omnigent@7496d36bde584d0a7d11c1d92a6d126f128bc1cd`. This chapter describes a new Sophia adapter. Source inspection and local protocol tests are not a live account integration.

## 1. What the user connects

Davide connects two resources, `davide-codex` and `davide-claude`; Luis connects `luis-claude`. A resource is an owner-authorized native execution route, not an API key that turns a subscription into general inference. The native applications keep their own vendor authentication on the owner's host. Sophia receives delegated access to **our Omnigent server**, not a Claude or ChatGPT OAuth token.

The technical lead runs on dsh. It chooses a team for a goal and addresses the registered resources through `packages/execution-adapters/src/omnigent/`. Neither a provider name nor the existence of three resources mandates three simultaneous workers. Source isolation and one release operator still apply.

**Connection versus project continuity:** linking a repository and importing selected prior reasoning does not adopt an arbitrary running Claude desktop window. S1's controlled route creates a fresh Omnigent-backed session in the existing repository/worktree. An existing Omnigent-backed session can be selected by its owner after its work scope and continuation configuration are inspected. A vendor UI conversation outside that surface is a context handoff, not a live adopted process.

## 2. The authentication decision that closes cross-owner launch

Use Omnigent **accounts mode**, invitation-only, with a separate operator/admin account that is never connected as an engineer. Davide and Luis have normal accounts. Enable `OMNIGENT_DEVICE_GRANT_ENABLED=1`; set a fixed backend-only `OMNIGENT_DEVICE_CLIENT_SECRET`; leave the grant maximum at an explicitly configured 30 days. Disable public sharing and telemetry in the deployment profile. Keep the current runtime source pin rather than upgrading to search-result HEAD. [OM-08, OM-09, OM-11]

Use one **owner-approved device grant per person**. Do not configure one machine-client subject to impersonate both people. Omnigent's machine-client design has one configured non-admin subject; its host-launch path checks both host and session ownership. EDIT sharing is not permission to launch another person's process. [OM-01, OM-10]

### Authorize once, operate inside the selected mandate

1. An authenticated Sophia user starts `POST /api/v1/execution-connections`. The API creates a short-lived flow bound to that actor and the fixed Omnigent server. The browser never supplies an arbitrary upstream base URL.
2. The adapter sends `POST /oauth/device/authorize` with JSON `{"client_id":"sophia"}` and `X-Omnigent-Client-Secret`. The secret `device_code` stays in backend storage; the browser receives the user code and Omnigent verification link.
3. The user opens that link on Omnigent and authenticates there. Its consent page displays the exact upstream identity and requesting client and requires fresh authentication for this flow. Sophia does not render a vendor login or collect an Omnigent password.
4. The backend polls `POST /oauth/token` with form-encoded device grant type and `device_code`, respecting the returned interval and expiry. Interpret OAuth `error` values; do not assume every pending/error condition has one particular HTTP status. A successfully redeemed device code is single-use.
5. Store access/rotating refresh credentials encrypted with a server-held key, separately from project records. Retain owner, connection revision and expiry metadata, not tokens in event payloads. Tokens never enter model context, browser storage, generated source, traces or downloadable agent bundles.
6. With that credential, `GET /v1/hosts` returns the person's hosts. Selecting a host records the **upstream-returned owner**, not a caller-authored email. A connection without a host remains connected-but-not-ready. `GET /v1/me` is not on the inspected delegated path allowlist; do not build identity verification around that guessed endpoint.
7. The owner explicitly selects repository roots, resource concurrency and routine operations permitted through Sophia. The resulting resource grant is project-scoped. Ordinary in-scope dispatch and steering do not ask again on every message.

The route implementation supports accounts and standard OIDC and excludes the GitHub-OAuth/header variants. Some design prose is older/narrower; **the actual route wins**. This product chooses accounts mode, so implementation does not branch among authentication stacks. [OM-09]

### The exact trust boundary

Omnigent's `sessions` delegated scope is a **path allowlist**, not a project- or host-limited capability. It includes `/v1/hosts`, `/v1/sessions`, `/v1/agents`, `/v1/skills` and `/v1/runners`, with exact-prefix matching. An admin subject can retain broader privilege inside those paths. Sophia must therefore use non-admin engineer accounts and narrow every operation to the selected connection/resource/host/repository/assignment. Do not describe this as upstream-enforced project scoping. [OM-11]

The host snapshot’s `configured_harnesses` is a nullable dictionary, not an array. Preserve `true`, `false`, `binary-missing`, `needs-auth`, and `version-too-low`; absent, malformed or unreported state remains unknown. `true` means the host reported readiness, not that the intended model has executed successfully. [OM-17, OM-18]

One server-controlled adapter constructs all upstream paths. The API does not expose a generic proxy. Creating directories, installing harnesses, reading arbitrary host files and changing native credentials are outside the initial resource grant, even though Omnigent has endpoints for some of them.

### Refresh and disconnection

Refresh and revoke use form encoding (`refresh_token` is the actual revoke field). The configured client-secret header gates authorize and device-code exchange; current refresh/revoke rely on their presented credential rather than that header. Serialize refresh for each connection using a durable lease/revision. Persist the replacement pair atomically before releasing the lease. A lost refresh response is **not** permission to retry the old rotating token indefinitely: its reuse can revoke the grant. Persist `rotation_unknown` and surface reauthorization required after bounded reconciliation fails. The documented default access lifetime is one hour; the 30-day grant life is a deployment choice retained here, not an immutable vendor maximum. [OM-08, OM-09]

Disconnect first revokes Sophia dispatch eligibility, then attempts upstream `/oauth/revoke`, destroys local token material and records revocation outcome. Disconnection cannot promise that an already-running native process was stopped. Offer **Stop active work and disconnect** as the default explicit operation; display any stop whose outcome remains unknown. No silent alternate payer or account is selected.

## 3. Native session construction: one selected sequence

Use a **session-scoped native agent bundle**. It allows an assignment-specific Sophia tool surface without mutating the global built-in agent. The bundle is platform-authored, not arbitrary uploaded executable configuration from a user document.

The sequence is intentionally create → bind tools → launch → observe → prompt:

| Step | Exact Omnigent interface | What Sophia does |
|---|---|---|
| Create the dormant session | `POST /v1/sessions`, multipart parts **`metadata`** and **`bundle`** | Upload a trusted `.tar.gz` with root `config.yaml`; no first message and no host launch yet. |
| Receive identity | multipart response **`{session_id}`**, not JSON-create `{id}` | Persist the returned identity against the operation nonce before further calls. |
| Read its bound agent | `GET /v1/sessions/{id}` | Check session owner, agent identity, expected absence of unrelated work. |
| Install the assignment tool surface | `POST /v1/sessions/{id}/agent/mcp-servers` | Register HTTPS `sophia` MCP with an assignment-only token. This endpoint requires a session-scoped agent and agent ownership. |
| Persist selected native model/effort | `PATCH /v1/sessions/{id}` | Set `model_override` and `reasoning_effort` before launch; observe actual native settings. |
| Launch in an isolated source branch | `POST /v1/hosts/{host_id}/runners` | Send `session_id`, explicit selected `workspace`, and `git` options. |
| Observe readiness | session snapshot and stream | Check runner/native readiness, actual external-session identity and selected model/effort. A `launching` reply is not ready. |
| Deliver the brief | `POST /v1/sessions/{id}/events` | Send a user-message envelope carrying a unique Sophia delivery ID and the immutable brief reference. |

[OM-03, OM-04, OM-06, OM-07, OM-14]

The exact multipart metadata for this route is deliberately small:

```json
{
  "title": "Sophia · G-UI-01 · implementation",
  "labels": {
    "sophia.project_id": "<project UUID>",
    "sophia.attempt_id": "<attempt UUID>",
    "sophia.create_nonce": "<operation UUID>"
  },
  "reasoning_effort": "<owner-selected supported effort>",
  "host_type": "external"
}
```

Do not put a model alias in a field where the multipart schema has no model override. The selected path is `PATCH /v1/sessions/{id}` with `model_override` and `reasoning_effort` **before host launch**, then verify what the native runtime actually chose. The API accepts metadata without enumerating model validity; the native executor must validate and report it. Do not automatically send a live `/model` correction when actual settings disagree—stop the unqualified attempt and repair launch configuration. The alias on a setup screen is not proof of the running route. The JSON-create and multipart response shapes differ. [OM-03, OM-04]

After the session exists, the selected launch request is:

```json
{
  "session_id": "<returned native session>",
  "workspace": "<owner-selected absolute repository path>",
  "git": {
    "branch_name": "sophia/<goal>/<attempt>",
    "base_branch": "<explicit agreed source ref>"
  }
}
```

The base ref is accompanied by the expected commit in Sophia's handoff. The native worker checks the resulting actual base before writing. A remote branch name can move. For a verified existing worktree, use `existing_worktree:true` and omit `base_branch`; do not combine the mutually exclusive git modes. The source server's launch response is `{runner_id,status:"launching"}`. [OM-04, OM-06]

### Bundle and MCP specifics

Polly's actual native bundle is `spec_version:1`, `executor.type:omnigent`, `executor.config.harness:claude-native`, a prompt, and `os_env.type:caller_process`. Its example chooses permissive execution; **do not inherit that choice**. Sophia's installation retains the owner's normal native permission policy and makes it visible. Codex uses the corresponding native harness, not the one-shot batch executor. [OM-14]

The assignment MCP token can read the current brief, send an attributed peer message, report evidence, report a blocker and fetch narrowly authorized source. It cannot launch hosts, answer human permission requests, increase allowances, alter the mission, or choose another sender. The token's database binding—not model-supplied `actor` fields—determines its assignment and epoch.

Use the session MCP API before launch. The inspected Claude executor **ignores per-turn `tools` and `system_prompt`**: its native wrapper installs the author instructions at launch and its transcript forwarder supplies output. Adding tool definitions to a later message POST is not an installation strategy. The registration endpoint persists secret header values in a session bundle; treat that bundle as sensitive, prohibit its export through the product, keep the token assignment-limited, and revoke it on termination. Redaction in a summary is not encryption at rest. [OM-07, OM-12]

Multi-user MCP registration rejects stdio/private-destination servers. Use the fixed, authenticated public HTTPS Sophia MCP route; do not advertise a loopback server the remote native host cannot reach. The full lifecycle still needs the S1-09 live test, including proving custom native bundles boot with the intended tool surface. [OM-07]

## 4. Operation matrix

All native operations execute as the **resource owner's delegated Omnigent principal**, after Sophia authorizes the initiating human/lead/peer. Record both identities in Sophia's audit. Do not populate native `created_by`: the inspected route reserves it to properly bound runner-originated events. [OM-05]

| Operation | Wire operation / body | Upstream and Sophia conditions | Completion evidence |
|---|---|---|---|
| Discover owner hosts | `GET /v1/hosts` | Authenticated owner; restrict selection to registered project roots | `hosts[]`; readiness is not subscription-auth proof. |
| Read native session | `GET /v1/sessions/{sid}` with explicit include flags | Selected binding; accessible owner session | Current snapshot; store observation time separately from work time. |
| Discover recoverable creates | `GET /v1/sessions?visibility=mine&kind=any` with pagination | Same owner; match exact creation nonce locally | Exactly one matching session; zero results are not immediate proof of failed creation. |
| Start/steer text | `POST .../events` with `type:message`, `data.role:user`, `data.content:[{type:input_text,text}]` | Current assignment; no native permission wait; no concurrent human terminal takeover | Accepted reply plus subsequent native input/turn evidence. |
| Soft interrupt | `POST .../events` with `type:interrupt`, `data:{}` | EDIT upstream; specific ongoing turn | A route receipt alone is insufficient; see §6. |
| Stop native session | `POST .../events` with `type:stop_session`, `data:{}` | OWNER upstream; current captured binding | Native process/session settlement after prior sends are drained. |
| Read current permissions | snapshot `pending_elicitations` + event notifications | Resolve target child session, not merely display parent | Request identity/fingerprint and current owner. |
| Answer supported permission, S2 | `POST .../elicitations/{eid}/resolve` with `action:accept|decline|cancel` and schema-valid `content` | EDIT upstream, but **Sophia requires the named owner** and current fingerprint | Resolution response/event; resumed work is separate evidence. |
| Read Codex local goal | `GET .../codex_goal` | Codex-native route only | Native goal status is a claim about pursuit, never project acceptance. |
| Pause local Codex goal | `PATCH .../codex_goal/status`, `{status:"paused"}` | Current admitted local continuation | Confirm persisted state; still inspect running effects. |
| Watch updates | `GET .../stream` | Private backend subscription; no browser admin token | Live tail only; reconcile via snapshots/history. |
| Collect handback | Session items + Sophia `report_result` MCP | Exact source commit/assets/checks/preview tied to attempt | Verified source and check receipts, not final assistant prose. |

The post-events adapter must recognize a successful HTTP response containing `{queued:false,denied:true,reason}` as **policy denial**. A reply with `queued:false` for an interrupt means the control route returned; it does not mean that work is stopped. Unknown body shapes cause `protocol_mismatch`, not optimistic success. [OM-05]

## 5. What “direct peers” means in this release

`peer_send(targetAssignmentId, kind, contentRef, replyTo)` is an authenticated capability call. Software verifies the current project, goal, assignment, recipients and scope, writes one durable message, and dispatches it promptly. A blocking question is not held for the five-minute lead heartbeat.

For local dsh teammates, use the native durable mailbox and its step-boundary wake. For external recipients, the adapter sends a compact labelled message to the recipient's selected native session. The message links exact evidence and names the sender as an **agent assignment**, not as the owner personally. A worker can answer or challenge its coordinator through the same route. The technical lead observes the exchange without adding a model invocation to forward each message. [DSH-16, BZ-01, QM-01]

Transport state is recorded separately from meaning:

`recorded → dispatching → upstream accepted → native input observed → interpretation/result observed → checked`

Not every adapter exposes every stage. Omnigent's `session.input.consumed` is evidence about delivery, not proof that the model understood or complied. A model-only acknowledgement does not prove that an implementation preserves a component. A useful reply answers the question or supplies new evidence; there is no default model-generated “received” reply loop.

A2A is not an extra S1 dependency. The selected native/MCP adapter is the implementation path for this collaboration; its live behavior remains to be proved. The interoperable protocol extension remains in the extension register, without changing the goal/assignment records.

## 6. Hold and Stop are more than one native event

The inspected `interrupt` route publishes an interruption notification before it finishes trying native delivery, catches some transport failures, and can still return normally. `stop_session` is owner-only but **not sticky**: a later message may launch the terminal again. [OM-05]

For S1, the reliable external **Hold** implementation is a controlled stop of the affected goal's native sessions while keeping their source, transcript references and unfinished goal. It is not billed as a native pause that preserves an in-flight model request. Native dsh Hold keeps its own supported inbox semantics; the common UI says what happened to each route.

1. Commit the goal's control state and new authority epoch. Retire unsent starts/steers/peer wakes from the old epoch. A Stop does this even during a permission wait.
2. Signal the per-binding dispatcher. No new ordinary send can begin. Cancel/drain any send already admitted locally; a timed-out send remains uncertain.
3. Stop the captured native session **after** earlier admitted writes have converged. A cleanup operation is allowed to address the superseded binding; it does not revive its ordinary work authority.
4. Observe process/runner/native settlement and reconcile any deployment or database effect already in progress. A native interruption event is not that settlement.
5. Mark the work `held` or `stopped` only with the corresponding evidence. Otherwise show `stopping — outcome unknown`, preserving native handoff to the owner.

A database epoch cannot prevent a previously accepted request from arriving inside a vendor runtime that does not understand the epoch. This is why order/drain/stop reconciliation is necessary. Native/manual actions outside Sophia remain an explicitly disclosed residual boundary.

Resume is an explicit command for **held** work. The S1 external path creates a fresh configured native session and binding from the held work’s source/context handoff; the goal, completed source and evidence are retained. A stopped goal is not automatically resumed by a late approval. New pursuit after Stop requires a fresh explicit instruction. No automatic replacement worker is dispatched merely because the user stopped the existing one.

## 7. Message idempotency and lost responses

Ordinary native message POSTs do not provide our required end-to-end exactly-once contract. The inspected source-keyed deduplication of imported conversation items must not be confused with idempotency of user-message dispatch. [OM-03, OM-05]

Sophia owns the durable outbox. Each delivery has a unique ID included in a small visible envelope; this is a correlation marker, not a promise that the provider deduplicates it. Persist the dispatch transition before network I/O.

- A pre-send failure is safely retryable under the same active grant.
- A native policy denial is final for that dispatch; do not change account or route around it.
- A lost response after sending is `outcome_unknown`. Reconcile native user items, pending input and subsequent receipts for that exact marker.
- Finding it establishes delivery; not finding it in a temporarily lagging snapshot does not establish non-delivery.
- Without decisive reconciliation, keep the operation blocked and offer an explicit owner-approved retry acknowledging duplicate risk. Never silently resend every expired lease.

The same rule covers session creation and launch. A multipart create nonce is retained in labels and matched in the owner's paginated session inventory. A returned session from a timed-out operation is adopted only when all identity/scope checks match. Repeated launch must not create a second runner beside an unresolved first one.

## 8. Observation without false completeness

Omnigent SSE is live-tail, has no replay cursor, and terminates at `[DONE]`. Sophia opens the stream, buffers incoming data, obtains the current snapshot, then reconciles buffered facts and continues. On reconnect, repeat; periodically reconcile during long runs. Store item identity and payload revision/hash when available, because a tool item can be updated rather than added. [OM-03]

The native pending-input index behind `pending_id` is in memory. It can repair a UI rebind but is not a server-restart durability guarantee. Sophia keeps its own admission/outbox record.

A snapshot can repair current state. It cannot reconstruct every lost transient event. The adapter records an observation gap with its time interval and coverage. Do not report a complete history or infer “nothing happened” from the gap. Native readback failure is different from work failure.

Sophia's **own** event stream is durable and cursor-based. Its project sequence is not the vendor's event sequence. Raw upstream payloads remain scope-controlled evidence, not arbitrary React props or text broadcast to every member.

Usage is equally explicit: actual reported tokens, estimated dollar equivalent and subscription quota are different fields. An unavailable quota/cost is `null` with coverage, never zero. A native terminal being installed or configured is not evidence that its login is valid. A test that does one real permitted call on each resource settles that question for that installed version.

## 9. Permission cards

Create a HumanAction from the actual request, exact native target session, assignment, command/schema fingerprint and owner. A child-session request may be displayed in a parent's stream: route resolution to the actual child, after verifying it belongs to the assignment. [OM-03]

S1 cards provide the correct native-session destination and operation summary. Opening, reading or dismissing the card does not approve it. The owner acts in the original native application; Sophia observes resolution.

A native resolution event may omit the actual verdict. Store **`resolved_unknown`**, not `approved`. Observing subsequent work can establish a separate continuation fact; it cannot retrospectively invent the exact permission response. Claude's PermissionRequest hook also does not cover every network prompt and lacks `tool_use_id`; preserve the source's correlation limitations. [OM-03, CC-01]

S2 enables in-app `accept/decline/cancel` for supported elicitation schemas, owner-only, with an expected fingerprint and binding. No broad `_meta.persist`, edited command, permission update or “always allow” is forwarded by the initial approval UI. Those require a separately displayed grant change. OS prompts, login and unsupported requests stay native.

## 10. Model changes and native human use

Choose model and effort from the actual native catalog at launch. Log desired and observed settings separately. The inspected Claude implementation applies a model switch by typing `/model`; its own comment says this also changes the person's global default for future sessions. **S1/S2 do not issue automatic mid-session `/model` changes.** Adaptive resource selection uses a new configured attempt, or a deliberately authorized native change that explains this side effect. [OM-12]

A person can take over the selected native session. Sophia holds automatic input until takeover ends; the adapter never sends a prompt into a native permission/login dialog to simulate approval. Authentication commands remain a native owner task, not a steering message. A locked but awake host is not assumed broken merely because desktop automation would fail; the live runner connection determines availability. Sleeping/disconnected hosts are unavailable regardless of whether the app is still open.

## 11. Files to implement and finite proof

| New Sophia file | Responsibility |
|---|---|
| `packages/execution-adapters/src/omnigent/client.ts` | Fixed-origin HTTP, credential injection, bounded reads and typed failures; never a generic user URL proxy. |
| `.../device-grant.ts` | Start/poll/revoke and serialized rotation; owner-flow correlation. |
| `.../session-factory.ts` | Trusted bundle → dormant session → MCP → owner host launch → readiness. |
| `.../observe.ts` | Snapshot/live-tail reconciliation, item updates, permission and coverage normalization. |
| `.../dispatch.ts` | Per-binding serial dispatch, uncertain outcome, epoch fencing and stop settlement. |
| `.../capabilities.ts` | Installed native capabilities and actual model/effort visibility. |
| `apps/api/src/services/resources.ts` | Sophia member-to-Omnigent owner binding and project resource grants. |
| `apps/api/src/services/peer-mailbox.ts` | Attributed, durable, scoped peer delivery without a PM model hop. |
| `apps/worker/src/jobs/lead-review.ts` | Coalesced semantic review; separate from transport. |

S1-09 and S1-10 prove one permitted call on each of the three resources, a question/reply while work runs, a native owner permission, Stop racing a pending send, a disconnected host, and recovery from a lost reply. Fixed fixtures can prove normalization and state transitions but do not satisfy these live conditions. See [binding fixtures](../api/omnigent-wire-fixtures.json), [local reference tests](../implementation/README.md), and [session plan](../delivery/sessions/S1_BINDING_SESSIONS.md).

## Native host permissions remain a separate boundary

Sophia’s project grant controls operations through its adapter; it does not retroactively sandbox every command a broadly authorized native CLI can execute on the owner’s computer. The launch profile uses the owner’s normal native permission controls and approved repository scope. Verify that native credential files and unrelated projects are not exposed through Sophia tools or returned handoffs. Independent native/manual operations and already-granted powerful deployment tools remain an explicit residual risk in S1; neither a prompt nor a database lock is described as OS enforcement.
