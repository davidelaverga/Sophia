# Authority, work identity and lifecycle

## 1. One operational owner; distinct kinds of truth

| Record/effect | Authority | Allowed copies |
|---|---|---|
| Mission, accepted constraints, authored observations and consent | Sophia’s existing mission ledger/use cases | Eligibility-filtered context and user views |
| Work contract: intended deliverable, criteria, source scope, accepted changes | Sophia work/domain records | Versioned operational input in Paperclip |
| Operational assignment, dependencies, waiting path, continuation/retry episode | Paperclip for work enrolled to it | Read-only versioned projection in Sophia |
| Native session events and actual execution | dsh or the owner-native runtime | Bounded attributed observations |
| Resource use and owner contribution limits | Sophia grant + native owner authentication | Capability/availability metadata |
| Candidate bytes, source versions and publication | Sophia artifact/source service | Review refs, immutable downloads, Paperclip metadata |
| Independent review | Reviewer’s recorded verdict and evidence | UI summary; not automatic human acceptance |
| Product acceptance and reserved deployment | Named authorized person/standing decision policy | Attributed decision and release receipt |

Existing `goals` are not renamed into a second Paperclip task engine. Preserve stable identity, criteria, accepted meaning and local controls. For enrolled work, operational status/assignment is imported from Paperclip and is not independently editable through old handlers. Project controls can restrict an execution immediately; they do not secretly launch a new continuation.

## 2. Mapping and ownership

Add a small binding record (proposed fields):

```text
project_id, work_id, work_revision
controller_kind = sophia_native | paperclip
controller_generation
paperclip_company_id, paperclip_project_id, paperclip_issue_id
paperclip_run_id (nullable), assignment_id, attempt_id
native_binding_id (nullable), resource_grant_revision
context_manifest_id, eligibility_revision, recipe_snapshot_id
last_upstream_revision, last_native_cursor, observation_time
```

Uniqueness must prevent two live operational bindings for the same work/controller generation and two attempts claiming one writer surface. Where an ID is not yet known, use a durable creation intent and `outcome_unknown`; do not fill it with a generated guess. The lifecycle mapping is not a new task scheduler.

**Pilot tenancy:** one dedicated Paperclip company per Sophia project, with a bounded founder roster. This minimizes accidental cross-project work visibility; it is not proof of general multi-tenant isolation. Broader sharing requires its own qualification.

## 3. Commission protocol across stores

1. Under the Sophia project lock validate actor, accepted work scope, current revisions and resource policy. Commit an identified commission intent and outbox event. UI may now say “request recorded”, not “running”.
2. The trusted control plugin validates the authenticated integration principal and a signed, expiring command envelope. Create/find one actual Paperclip issue under a stable origin/operation identity; keep operational work in core issue records.
3. Persist the returned issue binding. If the response was lost, reconcile by the original operation identity before retrying. The SCM-01 binding test must prove the selected core create/recovery path; a non-unique search result or zero early results is unknown, not authority to create again.
4. Paperclip admits an eligible run. The adapter obtains an effect permit from Sophia, rechecking current grant, controller generation, source eligibility and allowance. It does not make its own scheduling choice.
5. Reuse the same identified native command/attempt on delivery or restart. Write/read receipts around the existing dsh/Omnigent transport.
6. Publish candidate/result evidence through Sophia’s source/artifact service. Set the operational disposition only on verified evidence and the chosen review policy.

There is no cross-store exactly-once transaction. The guarantee is stable identity, idempotent local effects, compare-and-set transitions and explicit reconciliation. A crash after a remote effect is not permission to replay it blindly.

## 4. Run, wait and completion mapping

Paperclip has one assignee per issue. Parent-child structure does not itself block execution; use real blocker edges. A cancelled prerequisite is terminal but does not satisfy a dependency. [P03]

| Sophia observation | Operational treatment |
|---|---|
| Command durable, issue creation unresolved | Keep commission pending/unknown; no native work |
| Issue eligible, no native start evidence | Queued/preparing; never show executing |
| Live native execution observed | Active episode and scoped checkout |
| Native permission waits, process remains live | Retain the one live binding; show required owner action; do not create a replacement heartbeat |
| Native turn ended awaiting an external action | Finish the execution episode with honest outcome; use a core routable blocked/review path and one resume trigger |
| Native terminal result ready | Verify and capture candidate; not accepted work by default |
| Independent review complete with adverse findings | Review task is done; implementation needs changes; no success promotion |
| Hold/Stop requested, native outcome uncertain | Fence locally, show settlement pending; do not give another writer access |
| Source eligibility narrowed | Fence affected use/publication and rebuild permitted context; old history is not a fallback |
| User accepted current candidate | Record exact acceptance; reconcile operational task completion under its designated policy |

SCM-01 must bind actual Paperclip status/hold/interaction APIs for these cases. Do not invent `paused` as a stock issue status. A local control latch can coexist with a core reconciliation hold; both must prevent new episodes. Long permission waits may keep a passive adapter observer alive initially, with no model polling, rather than misreporting an unattended native process as stopped.

## 5. Review and dependencies without native-only assumptions

The Native Runner review flow described upstream is not automatically available to external legacy adapters. Initial Sophia policy uses an ordinary, separately assigned review issue and an explicit result/decision binding. The reviewer reports on its own review issue; the lead or named human receives its findings through the normal dependency/decision path. Required implementation acceptance remains unresolved until its own gate is satisfied.

Do not make the review task depend on implementation being fully `done` while implementation waits for review: use candidate-ready as the input trigger and an explicit reviewer obligation. Test this cycle directly. A review verdict of “changes required” is a completed review deliverable, not a blocked reviewer. [P03]

## 6. Hold, Stop, cancellation and recovery

Commit a higher control epoch before attempting external stop. Retire unsent commands from the previous epoch, cancel/drain in-flight delivery and forbid new native starts. Reconcile native settlement and late output. A stop request and a stopped runtime are separate facts.

An Omnigent Stop is not assumed sticky: later native input can restart a session. Thus an old peer message must never reach it after Stop. dsh retains its existing monotonic pre-step/tool guard. Stop/withdrawal works even when Paperclip or a classifier is down; retries cannot bypass the local latch. [S08/S13]

Paperclip cancellation uses `onCancellationReady` before provider work and `signal` afterward. The adapter settles before returning; `onProviderStopped` is only valid after actual termination is verified. `executionRecovery` is returned only when its exact positive evidence holds. Budget expiry, unknown charges, unknown stop and lost responses do not qualify by analogy. [P02]

## 7. Cutover, not live takeover

Default: pre-existing work completes or is semantically settled under `sophia_native`; new work is admitted to `paperclip` only after its gates pass. Do not flip the controller for a running work item. A deliberate transfer requires quiescence, captured source and effects, a new controller generation, the old queue retired, and one new attempt retaining work identity and cumulative allowance.

This applies directly to PR29’s two old bindings. Preserve their real results; correct execution settlement using an authored, reviewed semantic operation. Do not claim product acceptance or reset their history to get through a preflight.


## Current continuation binding

This is the v2.0 normative integration specification. The current M02 runtime, PR32 registry/artifact work and Luis-owned side-panel implementation are described in [current baseline](../02_CURRENT_BASELINE.md). Local source/fixture work can proceed while only the relevant live dependency remains gated. Paperclip is not the first private Bot job store: owner-private messages/packages remain in Sophia until an exact human share. [Source namespace SCM](../sources/REGISTER.md); new code and provider behavior still require the listed goal acceptance.
