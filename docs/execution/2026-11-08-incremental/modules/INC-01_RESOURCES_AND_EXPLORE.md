# INC-01 — Real resource connections and API-funded Explore

**Outcome:** Davide and Luis can each connect their own Codex and Claude Code resources, inspect truthful readiness and supported model/effort settings, and use a permitted member API contribution for a retained Explore result.  
**Dependencies:** INC-00's installed scope, current source map, owner routes and shared contracts.  
**Delivers to:** INC-02 can start once one owner's native Codex/Claude Code pair and required recovery/control boundaries are qualified. It does not wait for the other founder or API-sharing slice.  
**Governing contracts:** [C01](../contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md), [C02](../contracts/02_RUNNER_AND_SESSION_PROTOCOL.md), [C03](../contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md).

## 1. Scope and existing implementation

Extend the existing ResourcePanel/ResourceSheet and ProjectShell callback/data seams with real service state. The inspected resource types describe proposed enrollment, owner, capacity, model/effort and control semantics; their fixture interactions are not implemented native connections. Existing API research and retained HTML design paths already supply useful execution and artifact boundaries. Extend their payer/binding admission instead of creating a parallel rendering pipeline. [Source map](../references/BASELINE_AND_SOURCES.md).

Required source seams to inspect before assigning files:

| Existing seam | Reuse or extension |
|---|---|
| `apps/studio/src/features/resources/ResourcePanel.tsx` and `resource.ts` | Serve real authorized data, actions, model/effort choices and truthful waits/errors |
| `apps/studio/src/features/studio/ProjectShell.tsx` | Bind resource service; replace the unavailable/fixture-only seam for qualified capabilities |
| Existing persistence/API/research allowance and dispatch modules | Add owner resource/grant/binding policy while retaining durable admission and cumulative allowance |
| `config/specialists.json` and selected research/design adapters | Qualify supported model/tool/settings combinations for one real API Explore path |
| `apps/execution-host/src/runtime-supervisor.ts` | Reuse lifecycle/isolation patterns; it is not already a Codex/Claude Code runner |

New work is owner-native enrollment, runner transport, native session qualification, member API credential custody, contribution grants and real service projections. Names such as `resource_connection`, `resource_grant` and `capability_profile` are logical records; INC-00 maps them onto existing DTOs/tables and allocates migrations centrally.

## 2. Requirements

| ID | Required behavior |
|---|---|
| INC01-R01 | Separate owner, connection, underlying entitlement account, route qualification, grant, selection and immutable execution binding. |
| INC01-R02 | Qualify four owner/provider connections: Davide Codex, Davide Claude Code, Luis Codex and Luis Claude Code. Each has a real bounded native result and account provenance. |
| INC01-R03 | Use official owner-native sign-in in a qualified owner environment; keep native credentials and unrelated histories there. Prove clean authentication without ambient API billing changes. |
| INC01-R04 | Distinguish authenticated connection from effective readiness, host availability, supported settings, current permission and capacity. Offline or unknown state cannot appear ready by assumption. |
| INC01-R05 | Owner API resources use an explicit credential custodian, route, destination and credential revision. Missing/rotated credentials cannot fall through to another account or Sophia's payer. |
| INC01-R06 | Explore defaults to an eligible API route; repository Build defaults to an eligible native route. An operation's funding default does not depend on the currently selected lens. |
| INC01-R07 | Start new contributions private; support owner-controlled selected-project grants with allowed operations/roles/settings, expiry, limits and active-settlement policy. |
| INC01-R08 | Resource use and source disclosure are separate checks. Current membership, grant revision and destination eligibility are rechecked before dispatch. |
| INC01-R09 | Require one real shared API Explore operation initiated by the other eligible member, with retained output and correct owner/account/grant attribution. |
| INC01-R10 | Preserve distinct API funds, native quota, rate windows, reserves, concurrency and commitments. Account aliases cannot create extra capacity. |
| INC01-R11 | Expose only qualified model/effort combinations and record requested, adapter-accepted and observed settings separately. Unknown effective settings remain unknown. |
| INC01-R12 | Preserve explicit preferences/pins. Initial settings may use approved fixed defaults; default edits apply to future admissions and never silently change active bindings. |
| INC01-R13 | Pause/revoke blocks queued/new effects and initiates declared active settlement; accepted outputs and uncertain usage remain recorded. |
| INC01-R14 | Reconnect/restart reconciles existing native operations without a duplicate paid operation or writer. Control receipts distinguish request from actual settlement. |
| INC01-R15 | Only specifically qualified native cross-member use is eligible. Owner-native work on a shared project does not itself qualify delegation of that owner's subscription. |
| INC01-R16 | Ship actual, accessible resource management in the existing UI; owner contribution edits and teammate visibility are enforceable, not simulated. Significant UI changes require Davide's approval. |
| INC01-R17 | Routine discovery/usage refresh performs no unadmitted inference. Bounded qualification tasks have an explicit authorized allowance. |
| INC01-R18 | Capability activation and rollback are per route/owner/operation; preserve legacy research/source-review behavior and all outstanding effects. |

## 3. Connection and contribution flow

### 3.1 Native enrollment

1. The authenticated owner chooses Codex or Claude Code and an owner-controlled runner. Show which environment receives admitted repository/project data.
2. Register the owner-bound runner using C02. Complete the official native sign-in there; use the qualified flow instead of collecting a consumer session token.
3. Read safe account/authentication and version/capability observations. Store actual provenance and its limitations, not an email/display-label guess.
4. Qualify a harmless read-only task on the approved repository. Capture the native session/run, actual output, requested/accepted/observed settings and funding-route evidence. Enforce the read-only profile.
5. Exercise reconnect and supported control behavior. The card becomes usable only for the tested operation/profile; permission to analyze is not automatically permission to write code or push.
6. Keep the connection private by default. The owner may allow its own work in selected shared projects. Enable another member's delegated native use only after separate provider and technical qualification.

A connection waiting for owner sign-in is an explicit, bounded prerequisite. The coordinator can continue unrelated assignments while that owner completes it. Never ask one founder to supply the other's credentials.

### 3.2 API enrollment and sharing

Use a trusted, isolated credential intake with the approved provider destination. Keep key values out of project records, prompts, browser storage, event feeds, diagnostic captures and logs. Validate destination/redirect behavior; untrusted message content cannot select a credential endpoint.

Bind the API connection to its actual account/organization/workspace where supported. An inference key may not expose benefit or billing balance. Separate connection success, linked-benefit evidence and balance observation, labeling owner declarations appropriately. An eligible subscription benefit can fund the linked API account, but this is a different allowance from native Codex/Claude Code usage. Provider eligibility and continuation policy must be rechecked at qualification. [Provider sources](../references/BASELINE_AND_SOURCES.md).

The contribution editor must let its owner select projects and operations, specify allowed models/efforts, a bounded allowance/concurrency policy, expiry and revocation behavior, and preview who can use it. A team administrator may disable team use; it cannot enlarge the owner's grant. Other members can inspect/select only the permitted contribution and cannot change its caps or scope.

Selected-project sharing is the minimum founder release. If a dynamic Team grant is exposed, its preview must disclose that it can include future eligible members/projects, plus exclusions and ceilings; otherwise leave that option unavailable. Do not silently turn a bounded project contribution into a standing team-wide grant.

To qualify sharing, the other member initiates an existing supported Explore operation against authorized project sources. Retain the actual artifact/version and operation/resource receipt. Owner-only execution, fixtures, a successful key validation or a shared green card do not satisfy this case.

## 4. Funding, settings and truthful capacity

### API policy

The owner explicitly selects a bounded API contribution policy. Disclose whether purchased/invoiced funds can continue paying when a subscription-linked benefit ends. Sophia never buys credits, enables recharge, increases a cap or silently switches payer.

Offer “included credits only” only if the selected provider/account setup can actually enforce it. If that cannot be established, show the limit and require a bounded policy the owner can understand; do not promise hard benefit-only enforcement from an estimated balance. Track enforceable request/output/tool/time limits and supported provider controls separately from a monetary estimate.

For the initial founder slice, qualify the chosen API resource(s) needed for a real retained research or HTML design result. Do not delay the route for an exhaustive deck/image/PDF/revision matrix. A successful research producer does not prove every output format or model supports its tools.

### Settings

Discover or qualify model IDs and effort values for the exact route/profile. Filter them by grant and operation/tool requirements. Preserve provider-native wire values; similarly named efforts are not assumed equal across vendors. A model's appearance in a catalog is not proof that the account can execute it.

Provide resource, model and effort controls without an intent selector. Owner defaults and per-operation overrides may be manual/fixed in this mission; INC-04 supplies the automatic ranking policy. Pins are enforced now: if unavailable, wait or report incompatibility. Show requested versus effective settings in details when observations exist; do not fabricate observed effort from the request.

### Capacity and readiness

Use the real account-level accounting root across aliases, devices and projects. Separate native and API allowances even if the same subscription funds both benefits. Known usage includes its unit, source, covered account/window/model, observation time and reset where reported. Unknown/stale data says so. A past reset changes the state to refresh-needed, not “full.” Context-window fullness and transcript token counts are not native remaining quota.

Until the owner approves a qualified higher bound, use conservative account-level concurrency of one active inference assignment; no new slot is released while an unresolved possible execution occupies it. Native remaining usage can remain unknown if the owner explicitly approves that bounded policy. Do not turn missing telemetry into a permanently unusable connection or an invented unlimited balance.

Keep private account telemetry out of teammate views unless the owner explicitly allows that aggregation. Teammates need safe contribution availability and limits, not private task names, personal histories or raw billing documents.

## 5. UI, errors and controls

Resource management has two connected purposes: **My connections** for owner authentication/custody and **Team/project contributions** for permitted use. Reuse the production components, provide an obvious Manage use/Edit path, and make the details expandable. Notifications stay in Inbox rather than becoming another team-resource feed.

Every card/detail view distinguishes owner, funding route, scope, applicable model/effort, host/auth readiness and known/unknown quota. Display the relevant next action: connect, sign in, reconnect, edit contribution, refresh observation or inspect a wait. Do not require users to understand adapter internals to decide who may use a resource.

| Condition | Required behavior |
|---|---|
| Runner offline or auth expired | Retain draft/request; show waiting/reconnect with no phantom execution |
| Key missing, destination changed or credential revision stale | Fail the selected route before send; no alternate payer |
| Unsupported strict model/effort | Explain incompatibility and keep pin; permit an explicit new selection |
| Grant revoked/member removed | Invalidate current controls and block queued/new sends; show active settlement separately |
| Provider refusal | Preserve refusal scope; do not retry through another account to bypass it |
| Remaining usage not exposed | Show “Usage not reported” with approved concurrency/assignment policy |
| Lost response after possible start | Show reconciliation; keep account commitment and native mapping |
| Stale UI or concurrent grant edit | Reject stale revision; refresh without enlarging the grant |

The first material resource-management implementation follows [design approval](../operations/DESIGN_APPROVAL.md): concrete working preview and exact source, then `awaiting_design_approval`. Backend work outside that held UI scope can continue. Functional acceptance and technical review remain required after design approval.

## 6. Implementation slices and rollout

| Slice | Work and owned seams | Exit |
|---|---|---|
| INC01-S1 | Logical records, additive schema/RLS/API contract and safe projections | Current-owner/project/grant tests; no activation or fixture claim |
| INC01-S2 | One owner/native route through C02; bind real ResourcePanel data | Real read-only output, identity, settings and status |
| INC01-S3 | Reconnect/control and clean-auth qualification for that route; add same owner's second provider | Native pair sufficient to begin INC-02; no duplicate execution or auth bleed |
| INC01-S4 | Repeat qualification for the other founder/provider matrix | Four separately evidenced native connections |
| INC01-S5 | API credential custody, selected-project contribution and existing Explore binding | Other member obtains real retained output using the contribution |
| INC01-S6 | Resource UX, accessibility, adverse states and approved activation | Davide approval for significant changes; real owner/teammate in-app evidence |

S1 and C02 can be implemented in parallel only after the coordinator freezes shared contracts and assigns file ownership. API connection work may proceed beside the native spike. Allocate migration identifiers centrally; do not race multiple schema writers. Preserve legacy source-review and research routes; backfill only known owner/account relationships.

Release one qualified owner/provider slice without claiming the full mission complete. Full INC-01 closes only after the four native connections and cross-member API Explore operation pass, or Davide explicitly changes that scope. Do not hide a required failed profile behind a generalized “connected” outcome.

Rollback disables new selection/admission for the affected profile while leaving observation, controls, source access and reconciliation available. Preserve credential revision references, receipts and unresolved commitments. Retiring a card cannot delete a live session's authority/accounting trail.

## 7. Acceptance cases

Record each result with source/build, environment, owner-safe identity, profile/grant/binding, observed settings and evidence links. Use deterministic fault injection for races/unknown quota and bounded real tasks for actual native/API qualification. No case below is already passed by this pack.

| ID | Procedure and required observation | Covers |
|---|---|---|
| AC-01-01 | Qualify Davide Codex, Davide Claude Code, Luis Codex and Luis Claude Code separately; each has real native task output, actual session/account provenance and supported settings | R01–R04, R11 |
| AC-01-02 | Seed unintended API/endpoint environment values around a native profile, and test concurrent owners; the clean launch preserves the selected native route or refuses before call, with no credential/history crossing | R03, R05 |
| AC-01-03 | Disconnect/restart runner and browser around native acknowledgment; reconnect attaches/reconciles the same operation, with no duplicate result, writer or commitment | R14 |
| AC-01-04 | Exercise supported Hold/Stop and lost control response; distinguish request/ack/settlement and retain unknown effects until resolved | R04, R13, R14 |
| AC-01-05 | Owner connects an API resource, grants selected-project use, and the other member initiates a real Explore result; retained version, payer/account/grant and source eligibility are correct | R05–R09 |
| AC-01-06 | Attempt use before sharing, from an excluded project/nonmember, or after membership removal; refuse before dispatch without foreign metadata leakage or fallback | R07, R08 |
| AC-01-07 | Race owner grant edits, admin disable and queued dispatch; expected revision/current admission wins, administrator cannot enlarge grant, and revoked work is not newly sent | R07, R08, R13 |
| AC-01-08 | Remove/rotate the named API credential while ambient credentials exist; fail selected binding rather than calling another payer or destination | R05 |
| AC-01-09 | Review benefits/unknown balance and paid continuation configuration; no universal wallet, plan-price balance, unsupported included-only guarantee, purchase or auto top-up | R06, R10 |
| AC-01-10 | Enroll aliases for one underlying account and admit competing work across projects; one accounting root and atomic concurrency/commitments prevent doubled capacity | R01, R10 |
| AC-01-11 | Feed unknown/stale/past-reset quota observations; show provenance/freshness and apply the approved conservative policy without false remaining percentage | R04, R10 |
| AC-01-12 | Request supported/unsupported settings, preserve a pin, and change a future default while a run exists; accepted/observed settings are truthful and active binding does not change | R11, R12 |
| AC-01-13 | Resource is available but selected project source cannot reach its host; deny disclosure independently of the contribution grant | R08 |
| AC-01-14 | Attempt unqualified cross-member native selection; refuse delegation while permitted owner-native project work and shared API use remain available | R15 |
| AC-01-15 | Inspect API responses, logs, prompts, event feeds, browser state and teammate views; no secret values, unrelated histories or unauthorized private usage detail | R03, R05, R08 |
| AC-01-16 | Owner and teammate exercise real connect/reconnect/manage-use/selection controls at desktop and narrow widths, including keyboard/error/loading/revoked states; design candidate is held and explicitly approved where required | R04, R12, R16 |
| AC-01-17 | Refresh discovery/usage without an inference grant; no paid inference occurs. Qualification call requires its declared allowance and produces an execution record | R17 |
| AC-01-18 | Disable the new capability after an admitted operation; old routes still work, no new native send occurs, and existing settlement/result evidence survives reload | R18 |

## 8. Worker handback and module gate

Return the exact base/head/tree, changed paths and migrations; served contract/version; qualification matrix with evidence per owner/provider; configured API custodian and safe identity; actual shared-operation receipt/artifact; controls/model limitations; relevant automated test output; screenshots or preview for affected UX; and any unsettled effects. Include no credentials or private native histories.

The coordinator uses [delivery/review](../operations/DELIVERY_AND_REVIEW.md) and [deployment/verification](../operations/DEPLOYMENT_AND_VERIFICATION.md). The one independent Codex delivery thread performs source review and then in-app testing as distinct stages. A fixture demo, successful build or green connection badge is not this mission's completion evidence.
