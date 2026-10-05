# Native design and Paperclip: parallel-execution addendum (as supplied)

> **Provenance.** Davide supplied the text below to the SDD-01 implementation session on 2026-10-05, in the same message as the native design mission pack and the assignment "You are implementing the code and opening the PR. Codex is in charge of independent review, deployment and testing in the app." It is kept here word for word (its tables as Markdown tables) so the SDD-01 and WBC-02 sessions and Codex read the same text at one commit. Its own status line says it is a *proposed* coordination amendment: keeping it here does not install it as policy, post it to a coordination issue, or authorize any effect. How SDD-01 applies it is in [BINDING_MAP.md](BINDING_MAP.md) §9.

---

Native design and Paperclip: parallel-execution addendum

Prepared: 5 October 2026
Status: proposed coordination amendment based on the supplied mission packs. Not installed in the repository or posted to a coordination issue. No current repository, deployment, approval or live test was verified in this pass.

Decision

Run M75 → SDD-01 (native HTML design) and WBC-02 (first Paperclip-managed source review) as parallel implementation tracks. Do not make the whole of either mission a prerequisite for the other. Serialize changes to shared implementation contracts and releases to shared targets.

This is not a split between “frontend design” and “backend Paperclip”: SDD-01 includes runtime, tool, source, rendering, persistence, UI and control changes. Both tracks extend the same existing dsh/application foundation.

1. Retained mission dependencies

• SDD-01 consumes the verified M75 foundation and its HANDOFF_TO_SDD01.md. Source-mapping and isolated tests can prepare while M75 finishes; do not claim integration against an unaccepted foundation.
• WBC-02 can start its private Paperclip/plugin/adapter work before WBC-01 is complete. Its final live board binding consumes WBC-01’s accepted schema/fixture digest.
• WBC-02’s first deliverable is bounded source-review text/Markdown. It does not need SDD-01’s authored HTML, renderer or visual-review capability.
• SDD-01 uses the existing native work/control path. Paperclip is not a new prerequisite for that design mission.
• WBC-01’s v1.1 ownership/review/Studio-release amendment remains applicable to WBC-01 only. The newly attached v1.0 ZIP does not reverse that later amendment. It does not authorize WBC-02 or SDD-01 hosted effects.

2. Distinct roles and outputs

| Track | Owns | Must not absorb |
|---|---|---|
| M75 / SDD-01 | Reader/render foundation, Raven-derived HTML authoring skills/references, exact source/render/candidate identities, independent visual review, saved HTML, design steering and selective revision | Paperclip installation, a second generic scheduler, broad source-review/management mission |
| WBC-02 | Pinned private Paperclip service, first-party coordination plugin, dsh execution adapter, deterministic source-review plan admission, operational mappings/recovery, board projection and result opening | Raven imports, HTML designer, visual-review pipeline, another artifact renderer |
| WBC-01 | Board/receipt/UI contract readiness and its scoped Studio-only release procedure | Native design implementation or Paperclip/backend activation |

Register separate versioned roles: sophia-html-designer-v1 and sophia-visual-review-v1 for SDD-01; sophia-source-review-v1 for WBC-02. The source reviewer is not a substitute for visual inspection, and neither runtime reviewer substitutes for Codex’s code/app review.

3. Shared boundaries: freeze once, integrate through one writer

Both implementers must read the other mission’s interface and publish their shared-change requests before modifying these areas.

| Shared boundary | Coordination rule |
|---|---|
| `config/specialists.json`, its schema, `scripts/generate-specialists.mjs`, generated consumers | One nominated integration writer for the current merge window. Add all qualified new roles without replacing research roles or broadening older preset IDs. Each lane owns its role implementation and tests. |
| dsh bridge, runtime hello/readiness, role guards and runtime-unit artifacts | Reuse the current loop and bridge. Small additive bindings; no upstream dsh upgrade in either mission. Rebuild/qualify the combined role set before shared runtime release. |
| Source/artifact identities, readers and byte-store abstraction | One canonical source/version scheme. WBC-02 uses existing bounded text storage; SDD-01 adds its qualified authored-HTML/rendition needs. Do not force a new renderer or binary store into WBC-02 merely to unify them. |
| Work/attempt binding, control epoch, publication and allowance | One current controller for each work item/attempt. Each lane reuses existing safety and cumulative-budget mechanisms; do not create competing controls/accounting. |
| API registration, events, generated contracts and shared persistence modules | Reserve exact changes and one integrator per shared file at a time. Keep branch-local feature modules independent. Regenerate from the combined accepted schema rather than manually editing generated outputs. |
| Sophia migrations | Reserve unique append-only IDs after reading current reservations. Neither lane renumbers or edits an applied migration. Paperclip’s own database remains separate. |
| Studio shell, task-result opening and report/Knowledge components | M75/SDD-01 owns report/viewer changes; WBC-01/02 owns board behavior/binding. Agree the source/result opening interface; request shared-shell patches rather than parallel rewrites. |
| API, Studio, dsh runtime and shared environment | One active release operator per target. Build/test in isolated environments; serialize deployments and check the previously deployed tuple again before every release or rollback. |

Proposed owner allocation: two Claude implementation sessions in separate worktrees; one Codex integration/release coordinator. Codex may apply shared-file integration changes only under an explicit path-scoped handoff, with Claude reviewing the integration patch. Codex is not an unannounced second feature writer. Keep an early interface record and a short shared-file reservation table instead of a new orchestration system.

4. Work ownership during coexistence

During these missions, only the explicitly admitted WBC-02 source-review work is Paperclip-managed. Existing/native research/design work continues under its existing controller. Scope Paperclip commissioning and observers to enrolled work; do not automatically import every native task.

Per work/attempt, retain the logical controller, operation identity, native session, source revision and allowance. Installing Paperclip never hands it authority over an already running design attempt.

Future Paperclip-managed design should be a separate integration over the same designer API and artifact contracts. That later path must admit work through the chosen controller, not leave two schedulers both entitled to retry it. No new design rewrite is required by this proposal.

5. Suggested work sequence

1. Two short startup handoffs: actual base/open work, owned paths, role additions, source/result shape, control mapping and migration reservations. Bind the contracts before overlapping edits; do not require a full feature to finish.
2. Finish M75’s reusable foundation while WBC-02 performs G1/private-service qualification and independent mapping/admission work.
3. Develop SDD-01 design/render/review modules and WBC-02 adapter/source-review/projection modules in parallel using separate local databases/processes and explicit test scopes.
4. Integrate shared registry/runtime/contract changes in small reviewed windows. The second lane rebases and tests against each accepted shared change. If a shared change cannot remain backward-compatible, settle that seam first, not both entire missions.
5. Qualify each feature independently, then run a combined regression check: source-review works with design unavailable; design works with Paperclip unavailable; Stop/result/source withdrawal stay scoped; no duplicate writer or conflicting publication; ordinary conversation and historical artifacts remain usable.
6. Release the first qualified capability that is compatible with the actually deployed tuple. No fixed SDD-01-before-WBC-02 or WBC-02-before-SDD-01 production order is required. The design pack’s default remains one coordinated M75+SDD-01 product rollout. That is not a requirement to bundle Paperclip into the same release.

6. Communication and operations

Retain one real coordination thread per mission; cross-link only relevant shared-boundary messages. The design pack assigns M75 to #31 with M75-prefixed messages; recheck that state on launch. WBC-01 retains #74 under its v1.1 policy. Discover/create separately authorized actual SDD-01 and WBC-02 threads; do not invent IDs or repurpose #74 as a blanket backend release authorization.

Both lanes use the same nominated Codex operator for shared targets. Independent review sessions may run concurrently, but only the target’s current operator may perform its approved effects. Production requests bind the exact cumulative deployment delta, artifact/schema/configuration tuple, approved payer/test limits, verification and compatible rollback. One mission’s release must not remove roles or schema/readers introduced by the other.

No real deployment, paid probe, schema application or new infrastructure is authorized by this note. Comments do not wake idle coding sessions; preserve each mission’s existing bounded handoff procedure.

Source basis

Read directly from these supplied archive members:

• Sophia_Native_Design_Mission_Pack_v0.1_2026-10-04/00_START_HERE.md: M75 → SDD-01 sequence and coordinated design rollout.
• .../01_DECISIONS_AND_SCOPE.md: native design without a new orchestration backend, existing research preserved, one continuation owner.
• .../02_M75_CLOSEOUT.md: retained report/reader files and handoff surface.
• .../03_SDD01_MISSION.md: G0/G1 registry/contract binding; G2–G5 design, source, app and control changes.
• .../05_RUNTIME_AND_ARTIFACT_BINDINGS.md: registry paths, new role IDs, source/render/review identities, existing control state.
• .../07_COMMUNICATION_PROTOCOL.md and .../08_RELEASE_RUNBOOK.md: writers, scoped operations, compatible release tuples and recovery.
• Sophia_Workboard_Connection_Missions_v1.0_2026-10-03/02_SEQUENCE_AND_SCOPE.md: parallel preparation, WBC-01 contract dependency and retained creative lane.
• .../missions/WBC-02_PAPERCLIP_FIRST_OUTCOME.md: G1 private service; G2 admission; G3 source-review role; G4 controls/recovery; G5 board; §6 shared code/data.
• Retained Sophia_Workboard_Connection_Missions_v1.1_2026-10-03/operations/WBC-01_POLICY.md and operations/CLAUDE_CODEX_PROTOCOL.md: later WBC-01 ownership/review/deployment amendment only.

The concurrency assignment above is a proposed synthesis of the packs, not a claim that either original pack already contains this exact cross-mission agreement. The archived legacy Sophia-Agent/DeerFlow maps were not used as the implementation basis for this assessment.
