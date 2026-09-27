---
id: sophia-dsh-upgrade-strategy
version: 0.1
date: 2026-09-27
status: proposed_not_executed
installed_dsh_source: 46a7f68b0922371ce7144b668b90e377d8e799f4
tagged_candidate: 477b4f420553e8a52c2fbccc464d7561b239c443
latest_source_candidate: 21638c56315ae6a2b552d6091945d3144c9af32e
---

# DeepSeek Harness upgrade strategy for Sophia
## Coherent runtime upgrade, separate capability activation

**Recommendation:** qualify the tagged `0.1.7-rc.2` release as the first bounded upgrade candidate, and qualify the specifically relevant newer failed-step recovery change against the same tests. Promote one exact coherent runtime unit. Do not treat a floating main branch, a tag, an npm package and a locally built bundle as interchangeable identities.

**Crucial correction:** native declarative presets are already present at the installed `0.1.7-rc.1` source pin. The research-agent design does not need a bespoke preset engine and does not need to wait indefinitely for an upstream upgrade. Activating presets is a separate application integration change. [D01–D03](SOURCE_AUDIT.md#d01)

This is an implementation strategy, not an executed upgrade. Read [the research amendment](RESEARCH_AGENT_IMPLEMENTATION_PLAN.md) and [source audit](SOURCE_AUDIT.md) for detailed evidence boundaries.

## 1. Three baselines, not “old versus latest”

| Baseline | Exact source | Purpose |
|---|---|---|
| A — installed-source baseline | `46a7f68b0922371ce7144b668b90e377d8e799f4` / `0.1.7-rc.1` | Control/regression baseline; preserve working unit. |
| B — tagged candidate | `477b4f420553e8a52c2fbccc464d7561b239c443` / `0.1.7-rc.2` | First release-artifact qualification target. It is a prerelease. |
| C — latest observed source | `21638c56315ae6a2b552d6091945d3144c9af32e` | Separate source-build candidate for required newer fixes. |

The rc.1→rc.2 compare reports 346 commits ahead. The full diff/file list was not audited in this pass. Consecutive rc numbers must not be treated as evidence of a tiny behavioral change. [D15–D16](SOURCE_AUDIT.md#d15)

The Sophia source head is still `2911b037c9703703f2ae33955123d434797e3155`. The PR's reported hosted baseline and pending release are separate evidence. Refresh actual branch, lockfiles, deployment and active work before implementation. Do not use old manifest `not_ready` notes as the sole current deployment report, and do not overwrite them with invented live verification.

## 2. Why upgrade, and what actually needs activation

### 2.1 Existing native mechanisms to activate or reuse

Native presets, Agent setup, tools/skills, web services, compaction/spill, goals, workflow and file delivery should be treated as available source mechanisms whose use by Sophia still needs binding and tests. Their existence is not automatically a new rc.2 feature or a shipped Sophia capability.

| Mechanism | Decision | Sophia-specific work that remains |
|---|---|---|
| Declarative presets | Reuse now; explicitly bind research roles | Exact preset ID/version, startup health, scope/guard parity, restart integrity |
| Public Agent API | Preserve | Existing journal, outbox, authority and control semantics stay above it |
| Native web search/fetch | Reuse below a thin adapter | Project/provider egress, source IDs, evidence capture, unsupported PDF handling |
| Skills | Reuse approved versioned catalog/loading | No discovery of arbitrary user/home/workspace instructions into a trusted worker |
| Compaction/spill | Reuse and tune | Hard result ceilings, durable evidence and current-state precedence |
| Native `present` | Optional candidate evidence | Cloud publication, viewer and human acceptance remain application work |
| Workflow/children | Keep disabled in the first research preset | Later independent work only; inherited permissions and cumulative caps |
| Native scheduler/jobs | Do not adopt as a second product scheduler | Existing durable application jobs/commands remain the work authority |
| Native Office conversion | Defer for this PDF-report slice | The selected report path is HTML→PDF, not Office→PDF |
| Native UI/Desktop capabilities | Do not transplant | Sophia keeps its existing Studio and LiveKit/Gemini presentation |

Relevant source: [D03–D14](SOURCE_AUDIT.md#d03). This matrix is selective, not a statement that every listed package changed in rc.2.

### 2.2 Release-note benefits to measure, not promise

The retrieved rc.2 release notes describe dynamic tool additions that preserve cache behavior for explicitly supporting models, long-conversation/tool-output fixes, and other reliability/configuration changes. Treat each as a source-reported capability or fix until the exact release and Sophia route reproduce it. Do not use a README cache claim to turn on dynamic tool mutation in every provider.

The first research profile can keep a stable tool set throughout a task. That is simpler to audit and does not require proving every new cache optimization before producing a useful report.

### 2.3 A concrete post-tag change matters for research

Selected newer source includes commit `6a6f350b9437cf24e34a34f39ee4dfd107897d0c`, “settle pending tool results before failed steps close.” The code change and its accompanying note address a failed scheduler/step that otherwise leaves tool-call history unpaired. Recovery preserves committed results, distinguishes `TOOL_OUTCOME_UNKNOWN` from `TOOL_NOT_STARTED`, waits for started dispatches to settle and retains the original failure rather than claiming success. [D17–D19](SOURCE_AUDIT.md#d17)

This is relevant to a tool-using research worker and to safe continuation after an error. The retrieved rc.2 and latest-main AgentLoop source blobs differ, including the newer recovery import. Do not assume installing rc.2 includes a change merely because its release page was updated later.

The change does not authorize automatic replay of possibly effectful work; it does not repair all already-closed inconsistent histories; it cannot guarantee recovery when the log itself cannot accept an append. Those cases still require explicit repair/reconciliation evidence.

### 2.4 Candidate selection rule

Run the same focused compatibility suite on A and B. Run the failed-step/tool-pairing cases against C as well, with a coherent reproducible source-built unit when needed.

- **B passes required behavior and relevant failures:** B can be the first upgrade. Record C-only improvements and their actual relevance; do not claim them shipped.
- **B fails a required tool-history/recovery case addressed by C:** qualify C, or a later exact tagged release that contains the fix, before enabling the affected research behavior. Do not waive the failure because B boots.
- **C cannot be reproduced or introduces unresolved regressions:** do not hot-patch private loop internals into Sophia. Keep A for the known episode and either use a qualified B with documented supported limits or fix the build/qualification issue in a bounded work session. Native preset work can continue independently where compatible.

No candidate is selected by version number alone. The output of this session is a recorded target, tests, compatibility limits and reproducible artifacts—not an instruction to “use latest.” There is no calendar waiting period.

## 3. Upgrade the complete runtime unit

### 3.1 Identity manifest

Extend/reconcile the existing `config/runtime-unit.json` and associated release evidence rather than invent a competing deployment authority. Record:

```text
runtime unit ID
Sophia source commit and bundle source/version/hash
dsh source commit, tag/package versions, package integrity and build mode
Cordis and related package closure through the frozen lock
Node/pnpm/platform identity
profile and resolved bundle-patch digest
native preset catalog digest
role/tool guard policy digest
base prompt and skill digests
provider/model/effort route and source of authorization
context/compiler and wire-schema versions
renderer unit/digests, if enabled
supported persisted-log and bridge-journal versions
compatibility evidence and rollback unit
```

Do not populate missing container/image hashes with example values. Use null plus a pending status until actual build evidence exists. Keep mutable readiness/availability observations out of an immutable artifact identity, or explicitly distinguish those fields.

### 3.2 Files to change deliberately

Inspect and update together as required:

- `config/runtime-unit.json`;
- the root and `config/dsh/profile/` lockfiles;
- the runtime package manifest used by the current `runtime/dsh` build;
- `packages/dsh-bundle/package.json` and generated archive identity;
- `packages/dsh-bundle/cordis.patch.yml`;
- recorded source-verification, artifact-reproduction and patch-lint outputs;
- protocol/type bindings only if the native API actually changed;
- relevant integration tests and release/handoff documentation.

Do not run a broad dependency update that changes Google SDK, LiveKit, React, renderer browser and native model route at the same time. Changes required by actual dependency compatibility are explicit and separately explained.

### 3.3 Patch semantics and silent-default risks

The actual Sophia patch states that a row `config` replacement replaces the whole config, not a deep merge. Its linter fails missing upstream target IDs because the native loader may only warn and continue. Retain that stricter check against the selected new base. [S01, D14](SOURCE_AUDIT.md#s01)

For every overridden row, compare the new complete default and the full intentional override. Review added or renamed telemetry, credential, settings, automatic title-generation and configuration surfaces; suppress unauthorized new egress, not only the old named rows.

Maintain the existing deliberate controls: no session-log export, no plugin-inventory export, no OTel feedback export, no HMR and no unnecessary title-generation model call. A new package declaration must not silently re-enable equivalent behavior through another path.

The newer base has credential/account and saved-selection machinery. Use a clean authorized runtime home and explicit credential references; do not inherit a developer's Desktop defaults, stored account or home-directory `.env` by accident.

### 3.4 Harness version is not model choice

Today's Sophia patch deliberately selects OpenAI `gpt-6-luna` at high reasoning through the pi-ai adapter; the product plan's DeepSeek route is a separate baseline choice. Preserve the owner-selected development route during native-runtime parity qualification. [S01](SOURCE_AUDIT.md#s01)

The current bridge reads `agentDefaultModel.currentSelection()` for both create and resume. When per-task research configuration is introduced, bind the resolved provider/model/effort to the admitted execution envelope so resuming after a global-default change does not silently change payer, data destination or performance behavior. [S02](SOURCE_AUDIT.md#s02)

A later provider/effort experiment is a separate bounded decision with actual route availability and source-disclosure rights. No model or account is selected simply because it appears in the new upstream catalog.

## 4. Bind native presets without weakening the bridge

### 4.1 Correct insertion point

Use the existing `ctx.agents.create()` / `.resume()` `setup` path and the public native preset registry. At the selected source, `agentPresets.mount(agentCtx, presetId)` binds an unpublished scoped agent. Prove the native selection/recovery record and the Sophia role record agree before delivering the first input. Do not merely attach an arbitrary label and assume the composition changed. [D03–D04, S02](SOURCE_AUDIT.md#d03)

The bridge remains the owner of each Agent handle and the adapter between application commands and native execution. Keep journal-before-effect ordering, deterministic session IDs, pending incorporation receipts, native flush before delivery acknowledgement, retained observations, and the existing service-bound lease.

### 4.2 Immutable preset identities

The native registry retains old composition generations for existing live references, but after restart resolves the persisted ID using the currently installed definition. Native generation retention is not a long-term historical-code archive. [D01–D03](SOURCE_AUDIT.md#d01)

Therefore:

1. A released Sophia preset ID has an immutable definition, prompt/skill closure and tool policy inside its runtime unit.
2. A behavior change produces a new definition identity/version; do not edit `sophia-research-md-v1` in place and call old-session recovery equivalent.
3. Persist the resolved runtime/preset/prompt/skill/policy digests with the attempt and handoff.
4. Restore only a matching permitted definition. A missing old definition produces a visible incompatibility, not a broad fallback.
5. A sanctioned migration reconstructs from canonical source/evidence into a fresh compatible attempt with explicit lineage; it does not erase failed attempts or reset allowance.

Keep `sophia-brief-v1` available for historical compatibility until its work is settled. It can be removed from new admission without invalidating old records.

### 4.3 No live preset switching to change document format

Native `select()` is explicitly limited to a blank session before its first turn. The PDF rendition recipe must either be selected at admission or run as a fresh restricted episode over the existing research record. Do not bypass this with lower-level recompose or hot-reload an active tool call. [D03](SOURCE_AUDIT.md#d03)

Changing only an eligible model effort may use a separately verified supported boundary. It is not permission to change tools, data audience or stored mission authority.

### 4.4 Keep security enforcement independent

Preset YAML and plugins can execute host code; composition is not a sandbox. Keep host isolation, service authorization, path/egress checks, per-tool guards, request-budget admission and publication fencing in software. [D01–D03](SOURCE_AUDIT.md#d01)

Test the same guard for child/workflow paths even if those tools are initially hidden. A later feature must not inherit a previously untested escape route. A narrowed tool catalog must also restrict the actual service operation, not merely remove a button or tool description.

## 5. Persisted state and cutover

### 5.1 Use copied fixtures, not production state experiments

Create consented synthetic/disposable fixtures covering native logs, bridge journals, queued inputs, held work, source dependencies, finished candidates and lost acknowledgements. Store these under separate runtime homes. Do not open the same writable `DSH_HOME` concurrently with two native versions.

A candidate reads a copy, not the only live log. Compare parsed history, message IDs, sequence identity, pending inboxes, fences, source links, tool pairs and observed receipt stages. Generated prose need not be byte-identical across real model calls; protocol and authority outcomes must match their contract.

### 5.2 Active work policy

Default to admission pause plus bounded drain/checkpoint before release. Do not kill an expensive research task merely to complete an upgrade quickly. Identify whether it can finish under the old unit, be held with durable state, or needs an explicit migration.

After the old writer has settled, transfer the runtime lease/registration to the selected new unit and run health/readiness/reconciliation. The current architecture uses bound runtime instances; do not promise two versions can simultaneously consume the same project's queue. A side-by-side test must use separate disposable project/runtime bindings unless a multi-runtime routing extension is explicitly implemented.

If recovery cannot be established, keep the work held/blocked with its source and remaining-work record. No automatic new run under uncertain old effects. Stop remains a durable admission fence, not merely a call to native `cancel()`.

### 5.3 Source and audience changes during migration

Recheck current mission/goal revision, audience, eligible sources and authority at restore and dispatch. A preserved raw session may contain material no longer allowed. In that case use an eligible reconstruction or stop; a prompt asking the model to ignore removed data is insufficient.

Compaction summaries do not outrank corrected sources. Old research remains historical evidence with its original scope and limits; a new current-state projection decides what may influence the next turn.

## 6. Compatibility tests

Every test below runs as a bounded case; no multi-day waiting requirement. Start with deterministic fixtures, then the specifically authorized real-model/voice episode. Do not infer live behavior from test names alone.

| ID | Case | Required invariant |
|---|---|---|
| U-T01 | Frozen install/build on target platform | Reproducible source/package/bundle identities; exact selected unit. |
| U-T02 | Patch targets and complete configs | No ignored renamed rows, accidental default restoration or partial config assumption. |
| U-T03 | Egress and credentials | Telemetry stays disabled; no inherited account/model/credential leakage. |
| U-T04 | Create / duplicate create / crash before ack | Same session and command effect; replay does not commission duplicate work. |
| U-T05 | Steer at active tool boundary | Existing work preserved, message incorporated once at supported boundary. |
| U-T06 | Hold / queued input / explicit Resume | No new request/tool under Hold; valid pending input survives. |
| U-T07 | Stop / late completion / restart | Stop fence survives; old result cannot publish or reopen work. |
| U-T08 | Role and nested-tool escape | Actual root and child operations denied outside admitted tool/source scope. |
| U-T09 | Source correction/revocation | Old eligible context not blindly resumed under new authority. |
| U-T10 | Native log + bridge journal restart | Message IDs, event sequence, pending receipts and duplicate suppression preserved. |
| U-T11 | Compaction and spill | Evidence handles survive; hard result bounds still hold if spill storage fails. |
| U-T12 | Provider route and reasoning | Exact admitted provider/model/effort and unsupported-setting refusal. |
| U-T13 | Preset activation failure | No fallback to a broader/default preset; startup/readiness diagnostic explicit. |
| U-T14 | Preset generation/restart drift | Same ID cannot silently change instructions/tools after restart. |
| U-T15 | Started-session format switch | Rejected or routed to a fresh restricted rendition episode, not live recompose. |
| U-T16 | Failed scheduler after assistant tool calls | History remains valid; committed results preserved; unknown/not-started are not success. |
| U-T17 | Side effect with missing result | No blind automatic replay; explicit reconciliation state retained. |
| U-T18 | Old closed malformed turn / failed log append | Limitation reported; no fabricated recovery guarantee. |
| U-T19 | Native result vs product publication | File presentation alone does not certify object storage or acceptance. |
| U-T20 | Two-user voice-to-research episode | No regression in admission, speech interruption, attribution and one shared output. |
| U-T21 | Upgrade/rollback | Old and new data remain readable; no concurrent writers or loss of new events. |

Retain existing Sophia unit/database/native/LiveKit suites and their outstanding live acceptance requirements. This list adds targeted cases; it does not replace the project's existing gates or claim those gates were executed in this review.

For U-T16–18, compare the selected rc.2 behavior and current source containing D17. Include the upstream focused tests only after validating that they test the actual release code. A passing snapshot from an authored fixture is not evidence of an actual provider's acceptance of tool history; add the bounded real-route check where warranted.

## 7. Rollout and rollback are different before and after research data

### 7.1 Runtime-only parity release

Before enabling new task kinds, a runtime-only release preserves the application's existing data contract. Rollback can return to the prior compatible runtime unit after admission pause and writer settlement, provided the tested persisted-log compatibility allows it.

Keep the prior immutable image/archive, profile, lockfile and original pre-upgrade state copy. Do not assume a downgrade can parse every event written by a newer native version. If it cannot, do not point the old reader at mutated logs; reconstruct an eligible new attempt from canonical state or keep the work held for reconciliation.

### 7.2 After research publication exists

The unmodified brief-only API/Studio/runtime is **not automatically a valid full rollback** once new research kinds and artifact records exist. It may not understand their schema or projection. Do not lose usable research just to return to an old build.

Deploy read compatibility first. Prepare a research-compatible fallback unit: the new Sophia feature code against a proven older native release, where feasible. Qualify it using the same data and control cases. If no such fallback exists, the safe rollback is to disable new research admission while retaining compatible readers, controls and publication records—not blindly downgrade the whole application.

Keep append-only migrations. No destructive down-migration, task renaming, research-history deletion, allowance reset or replay of unknown effects is part of rollback.

### 7.3 Rollback trigger examples

Rollback or hold rollout for repeated duplicate admission, broken pairing/history after the required error case, broadened source/tool access, inability to restore held work, old results publishing after Stop, unbounded model input, unintended provider/payer switch, or unreadable artifacts. Mere higher response diversity is not a regression by itself; compare the accepted behavioral and quality criteria.

## 8. Work-session plan

### DSHU-01 — Exact delta and target decision

**Inputs:** actual Sophia head, installed artifact unit, A/B/C pins and this source map.

**Work:** inspect the complete relevant dependency/diff closure in the coding environment; build A/B reproducibly; inspect C and the missing-result fix; run U-T01/02/03/12/16–18 as relevant; identify actual API/log changes. Reconcile stale runtime-manifest status notes without fabricating tests.

**Deliver:** selected target, source/package/lock manifest, bounded diff report, tested versus pending cases, reason for choosing B or C, and fallback identity. No production deployment in this session.

### DSHU-02 — Parity adapter and recovery

**Work:** adapt only what the new public API requires; keep default model, role visibility, application schemas and user experience unchanged. Preserve current guards/journal/order/receipts. Run current suites plus U-T04–11, 17–19, 21 on disposable state copies.

**Deliver:** a reproducible parity unit and compatibility report. If a public-native API is insufficient, document the gap instead of reaching into private loop internals.

### DSHU-03 — Native research composition

**Work:** add immutable research preset declarations, approved skill catalog and explicit mount on create/resume; derive capability descriptions and enforcement mapping from the role definition; bind resolved provider/effort/allowance in the task envelope.

**Deliver:** U-T08/12–15 and minimal research-tool fixtures. This session can be developed against A while DSHU-01 is running, but the exact unit used in live research must be qualified. It does not enable arbitrary workers, HMR or all native tools.

### DSHU-04 — Controlled cutover and founder evidence

**Work:** under a separate actual release allowance, record active work, drain/hold safely, switch the single writer/lease, verify readiness/reconciliation, then run the short two-user voice/research episode and targeted failure case. Verify the rollback reader/unit on the same supported data class.

**Deliver:** actual deployed tuple, migration state, resource use, test results and explicit unresolved items. Run promptly when ready; no scheduled idle waiting and no automatic provider spend merely because this plan exists.

## 9. Parallel development and ownership

The runtime/source qualification can run alongside Luis's brief-removal/generic-result UI and the minimal mission-read/write work, provided actual mutable file ownership is coordinated. The PDF fixed-kernel work is largely independent of native model-route qualification. Integrate through the frozen contracts rather than parallel incompatible task schemas.

Suggested accountability: Davide/implementation agent for native bridge and source policy; Luis for presentation/viewer and interaction proof; joint review for context, authority and the two-person episode. This is a proposed allocation, not a change to existing repository ownership.

## 10. Ongoing upstream maintenance

Use a small **manual or explicitly scheduled** upstream review process, not runtime auto-update. Each review records a candidate pin, relevant changed surfaces, why the update is useful, regression evidence and rollback route. No monitoring task is created by this document.

Prioritize fixes to tool history, cancellation/settlement, source handling, compatible model routing and context limits. Defer unrelated Desktop/UI, account-management and experimental self-modification changes unless Sophia has a demonstrated need. Periodically rebase the coherent unit rather than accumulate permanent patches to private internals.

Pin updates at release-unit boundaries. Keep short-lived code-composition generations, durable application authority and long-lived project learning as distinct lifetimes. The upgrade should improve Sophia's research and continuity—not restart the project or replace its architecture.
