# Three owner-bound engineers, a lead and real peer dialogue

**Chosen integration:** pinned Omnigent native bridge, with native sessions on each owner's machine. **Sources:** OM-01/02, DSH-16, BZ-01/03, QM-01/02. The exact selected endpoint/principal/recovery inventory is now in [architecture 11](11_OMNIGENT_BINDINGS.md). This chapter remains the role and communication overview.

## 1. Resource registration

Register three resources: `davide-codex`, `davide-claude` and `luis-claude`. Each records owner actor ID, host identity, native harness mode/version, repository root/worktree, native session ID, current availability, supported controls, permitted project operations and the owner's active grant. These display names are not credentials or native IDs.

The owner signs into the native vendor binary, links Omnigent by an owner-approved device grant, and permits the selected resource mandate. Sophia creates the controlled native session using that owner delegation; existing Omnigent-backed sessions require explicit owner selection and inspection. Sophia verifies the binding and current visibility/control grant. It does not launch a process on Luis's host using Davide's identity. Omnigent's inspected launch resolver requires host ownership and session-owner authority; an editor grant is not an owner grant. [OM-01]

Use native binaries and their own owner-completed sign-in. The product does not collect Claude/ChatGPT session tokens, expose vendor credential files or move one member's usage to another silently. Account-specific support and terms must be verified for the exact commercial deployment; source inspection is not legal certification.

## 2. Roles and scheduling

The technical lead chooses a goal arrangement from a small initial menu: solo engineer; coordinator plus worker; coordinator plus two disjoint workers; implementer plus independent reviewer. Record one writer per worktree/candidate and one authorized shared deployment operator.

A first founder arrangement can give Davide's Codex coordination/review, Davide's Claude a backend area and Luis's Claude a frontend area. The next goal can reverse coordinator/vendor roles. A sequential dependency is not made parallel just to use every resource. High model reasoning is reserved for decisions that need it, and subscription quotas/availability are displayed as observed or unknown, never fictional dollar balances.

A native session can continue its own admitted goal. Sophia's scheduler must not also send automatic continuation prompts to it. Record the continuation owner and re-evaluate eligibility after a new instruction, Stop, authority change or accepted predecessor result.

## 3. Native adapter contract

Each adapter implements these Sophia operations: `inspect`, `bind`, `observe`, `deliver`, `hold`, `stop`, `reconcile` and `collectResult`; S2 adds supported `answerHumanAction`. Every operation names the exact resource, native session, current attempt and expected authority epoch.

The capability result distinguishes `active_turn_steer`, `next_boundary_delivery`, `controlled_interrupt`, `native_permission_response`, `source_snapshot`, `usage_observation` and `resume`. Unsupported is explicit. Codex-native has a documented active-turn RPC route; Claude-native in the audited Omnigent implementation uses managed terminal input with best-effort timing. Do not normalize those into a false guarantee of identical interruption-free timing. [OM-02]

S1 accepts owner-managed sessions with verified steering and status. Taking over an unrelated existing GUI conversation is not implicit. A session that cannot be observed/control-bound remains an import-only context source until it has a supported binding.

## 4. Peer messaging

Expose narrow MCP tools `sophia_peer_send`, `sophia_peer_read` and `sophia_peer_handback` to registered native sessions. A session-scoped transport credential maps to a trusted sender; tool arguments cannot impersonate another resource. The recipient must be a member of the admitted goal team and eligible to receive the supplied source references.

A peer envelope contains message ID, goal/assignment revision, sender binding, recipient binding, reply-to ID, kind, bounded text and evidence references. Kinds initially: question, finding, challenge, answer, handback and blocker. Do not copy full transcripts into every message.

**Lifecycle:** durable queued → adapter delivered → recipient incorporation observed where available → response/evidence. A transport acknowledgement does not prove the model acted. Retries dedupe message IDs. Peer messages are task data, not human authorization. Untrusted source text inside a handback remains untrusted source text.

The worker routes a message immediately through the adapter. A busy recipient gets supported input delivery; an idle recipient gets one authorized wake. Acknowledging receipt does not recursively wake the sender. A returned result or question does. Causal IDs and a per-assignment message allowance stop acknowledgement storms; hitting the allowance creates a lead review, not silent message loss.

For native dsh peers, reuse its native Team mailbox and task views, retaining the application goal's identity. Its native task write scopes are advisory; the workspace and publication rules enforce actual writes. dsh native peers are not a substitute for the distributed external binding. [DSH-16]

**Donor adaptation:** Buzz's recipient/callback/no-empty-ack rules become the short peer skill and fixtures. QM's separation of durable mail and explicit follow-up wake becomes our delivery state machine. Neither entire runtime is installed. [BZ-01, QM-01]

## 5. Periodic and manual lead review

A five-minute project review reads the accepted goal/criteria, resource availability, changed source/check evidence, compact worker progress and prior interventions. It can run a bounded read-only probe or obtain a fresh reviewer. Possible decisions: continue, request evidence, steer, fresh alignment spec, hold affected goal for replanning or required human decision.

The review stores what was observed, what was inferred, why an intervention is useful and its source/goal revision. Significant decisions are visible in the app and can be corrected. A new commit, tool activity or fluent completion sentence alone is not verified progress. No event for several minutes is not proof of a login request.

Fresh alignment specifications preserve the original outcome and surviving work. They do not silently lower acceptance to end a mission. New scope, increased cost or a changed product promise goes to its authorized human resolver.

## 6. Owner-specific human actions

An actual native permission event creates one durable HumanAction: resource, owner, native request ID, fingerprint of operation/target, work attempt, requested action, expiry and current state. A team-safe explanation can omit sensitive command content for other members.

S1 opens the precise native session or gives an exact instruction to find it. The owner's action is verified from the native response/state before resuming. A design amendment received meanwhile is separate; it is not an approval answer. Stop/revocation outranks both. A late approval cannot restart stopped work.

S2 exposes supported native approvals in Sophia/mobile with fresh authentication and an exact request fingerprint. OS dialogs and vendor login flows remain native where no supported response API exists.

## 7. Source and shared effects

Workers use separate worktrees/source candidates. Shared database/deploy operations require the currently assigned operator and target environment. The lead may queue another task but cannot make the other agent's production operation safe through a message alone.

Because the owners already have broad native tool credentials, Sophia cannot absolutely lock out independent actions performed outside its routes. For founder dogfood, require the paired native project skill and shared-operation ownership record, avoid simultaneous production tasks and retain the observed limit. Strong enforced deployment mediation is a later connector improvement, not a false S1 guarantee.

## 8. Proof before the three-resource release

All three resources perform actual work under the same project. A worker asks the coordinator a question before completion. The reply changes its next action without desktop screenshots. One real owner-specific request is surfaced and resolved. A controlled disconnect preserves pending mail. Stop races a delayed response without reviving work. The team receives a functioning app preview and source/check evidence.

S1-09 implements the audited paths and request/response contracts in architecture 11, then records the actual installed versions and live limitations. The architecture is fixed; missing endpoint evidence is not permission to guess.
