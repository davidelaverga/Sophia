# M02 — Qualified DeepSeek Harness upgrade and native preset binding

**Proposed PR title:** `chore(runtime): qualify newer dsh unit and immutable preset binding`  
**Mission ID:** `SMC-M02` · **Implementer:** Claude Code · **Operator/support:** Codex  
**Depends on:** R00 integrated foundation; integrate M01 before default final merge/release. M01 and M02 development may run in parallel under file ownership.  
**Launch:** [Claude](../launch/M02_CLAUDE.md) · [Codex](../launch/M02_CODEX.md)

## 1. Outcome

Sophia runs one reproducible, newer, qualified dsh release unit with the existing voice/mission/control experience intact. Native presets can be bound and recovered with explicit configuration identity, without broadening tools or changing provider/payer implicitly. M03 can add real research composition on this tested foundation.

**Correction:** presets already exist in rc.1. This mission is an upgrade, compatibility and binding task, not the creation of a second preset engine. Research tools and active research-product presets are M03's work. [Prior qualified design](../references/pass2/DSH_UPGRADE_STRATEGY.md)

## 2. Candidate policy

Historical candidates carried from the preceding audit:

| Candidate | Exact source | Use |
|---|---|---|
| A | `46a7f68b0922371ce7144b668b90e377d8e799f4` / `0.1.7-rc.1` | Current configured-source comparison baseline. |
| B | `477b4f420553e8a52c2fbccc464d7561b239c443` / `0.1.7-rc.2` | First tagged prerelease candidate. |
| C | `21638c56315ae6a2b552d6091945d3144c9af32e` | Prior observed newer source candidate. |

Refresh tags/releases and the actual installed unit once at M02-G1. Select one exact candidate, record why its changes matter, and freeze it for qualification. A later upstream release is not a reason to restart the mission unless it fixes a demonstrated blocker. Do not follow a floating branch during build/release.

The prior comparison reports 346 commits between A and B; inspect the full relevant dependency/API/log delta. The newer failed-step tool-result recovery at `6a6f350b9437cf24e34a34f39ee4dfd107897d0c` deserves an explicit test: it distinguishes unknown outcomes and never-started tools while preserving the original failure and committed results. Its presence in a source tree does not prove it shipped in a particular npm tarball. [Source audit and limits](../references/pass2/SOURCE_AUDIT.md)

Choose B if it passes required behavior. If it fails a required recovery case fixed by C or a later exact release, qualify that coherent unit. Do not splice private main-branch loop files into rc.2 packages. If no newer unit can yet meet the tests, return a bounded blocker/failed candidate with preserved A; do not report an upgrade by relabeling the old runtime.

## 3. Non-goals

No model/provider/payer change, broad package refresh, Gemini/LiveKit/React upgrade, new app scheduler, native Desktop transplant, autonomous self-editing, personal account import, general shell tool, enabled web egress or user-facing research admission. Any dependency change genuinely forced by compatibility is isolated and explained.

M02 can install a strictly inert/synthetic preset in test composition to prove the seam. It must not add a production capability description claiming research exists.

## 4. Release-unit identity

Extend the existing runtime manifest/release evidence, not a second independent registry. Bind the runtime's source/tag/package closure; frozen locks and package integrity; Sophia bundle bytes and patch digest; toolchain/platform; role/preset/skill/prompt/guard identities; provider/model/effort selection; runtime wire/context schema; supported journal/log version; test evidence and valid fallback.

Mutable readiness and credential availability are observations separate from immutable artifact identity. Fix stale S1-03 qualification notes with dated evidence, not by indiscriminately setting every pending flag true. A missing image digest remains missing until a real image is built.

Inspect both root/runtime and profile lockfiles, runtime package manifests, bundle archive identities and launcher behavior. Reproduce artifacts on the actual target platform with the supported build path. If source-build egress fails, Codex may run the bounded build on an approved capable host; do not bypass an organizational network prohibition or remove dependency integrity checks.

## 5. Composition and safety

### 5.1 Use the public setup/mount seam

Extend the current `ctx.agents.create` / `resume` setup path through the public `agentPresets` registry. Confirm selection/mount persistence and Sophia's recorded role agree before first input. Preserve the existing native handle owner, journal-before-effect ordering, deterministic session identity, delivery after flush, incorporation receipts and service lease.

Native selection is limited to an unstarted session. Do not change a running task's output format by hot-recomposing it. M03's rendition-only operation will use a new restricted episode or deterministic renderer.

### 5.2 Immutable identity across restart

A released preset ID and its tool/prompt/skill closure are immutable inside a recorded runtime unit. Native retention of live composition generations is not a durable archive of old plugin code. Record the resolved identity with each attempt/binding and restore only compatible eligible definitions. Missing or mismatching definitions produce an explicit held/incompatible state, never broad default fallback.

Retain old `sophia-brief-v1` definitions as long as existing sessions require them, even though M01 removes new brief admission. M01's shared guide skill is versioned content, not an excuse to mutate all active native session histories.

### 5.3 Guard execution, not only declarations

Preserve monotonic root and child/workflow tool guards. A plugin preset is not a sandbox. Ensure missing project binding, stale grant or disallowed operation is rejected at the application adapter as well as hidden from the model. No new global web, settings, account, telemetry or shell surface becomes available by installing the new base.

Audit whole-object bundle patch replacements and renamed target IDs. Retain the stricter patch linter: a native warning plus exit 0 is not safe configuration success. Compare every affected upstream default with its full override. Suppress equivalent newly named telemetry/export/HMR paths as needed rather than only old row names.

### 5.4 Resolved execution configuration

The current bridge's global default selection at resume must not silently change a task's provider, payer, model or effort. Introduce/backfill a bound execution-configuration identity where missing. For old tasks, resolve only from recorded supported evidence or the explicit unchanged baseline and mark the migration; never invent which provider was historically used.

M02 preserves the currently authorized model route during parity. New research-specific route choices are M03 policy choices within actual grants, not automatically DeepSeek-model calls because the harness is named DeepSeek.

## 6. Work goals

| Goal | Work and deliverable | Codex support/operation |
|---|---|---|
| M02-G1 Exact delta and target | A/B/newer closure, changed public API/log/defaults, selected immutable candidate, unsupported features | Bounded upstream audit or reproducible build on approved host; returned findings with source ranges. |
| M02-G2 Parity adapter | Minimal public-API adaptation, patch/lock/unit update, existing control and mission behavior | Isolated independent regression run/review; no live upgrade. |
| M02-G3 Preset identity | Mount/create/resume, synthetic strict preset, failure/no-fallback tests, pinned execution envelope | Negative/restart test support; verify secrets remain inaccessible. |
| M02-G4 Recovery and rollback | Copy-log/journal compatibility, failed-step pairing, lease settlement, fallback evidence | Restore rehearsal on disposable state; read-only actual active-work plan. |
| M02-G5 Exact cutover | Candidate PR and release manifest with proofs and explicit remaining limits | Approved admission pause/drain or Hold, old writer settlement, lease/unit switch, smoke and rollback readiness. |

Each support request names the exact source, test commands, allowed files and output. Claude integrates Codex's findings instead of importing an unreviewed large patch.

## 7. Acceptance

Retain the full [U-T01–21 suite](../references/pass2/DSH_UPGRADE_STRATEGY.md), with M02 ownership refined here:

| ID | Test |
|---|---|
| M02-T01 | Clean frozen build reproduces source/package/bundle/profile identities on the intended host. |
| M02-T02 | Missing/renamed patch target, wrong complete config, unknown or broadened preset fails readiness. |
| M02-T03 | New base does not enable hidden telemetry, credentials, global web, HMR or title/model calls. |
| M02-T04 | Duplicate create and crash before acknowledgement yield one session/effect and reconciled receipt. |
| M02-T05 | Steer at a supported boundary preserves work and incorporates once; Hold retains pending input until explicit Resume. |
| M02-T06 | Stop survives restart and rejects late output/admission under stale authority. |
| M02-T07 | Root and nested operations outside role/source policy remain denied. |
| M02-T08 | Exact preset/skill/prompt/guard and provider/effort identities restore; incompatible old identity never silently defaults. |
| M02-T09 | Compaction and spill keep recoverable evidence; spill failure cannot create unbounded next-model input. |
| M02-T10 | Failed step with pending tools produces valid paired history, preserves committed results and original failure, and distinguishes unknown from not-started. |
| M02-T11 | Unknown external effects are not blindly replayed; failed log append/old malformed history is reported honestly. |
| M02-T12 | Copied old logs/journals are tested; old/new units never concurrently write one runtime home. |
| M02-T13 | Downgrade/read compatibility or a safe held reconstruction is proven rather than assumed. |
| M02-T14 | M01 mission read/write/correction/returning-session behavior and existing shared voice controls do not regress. |
| M02-T15 | Native-present/turn completion does not become product publication or acceptance. |

M02-T14 proves current voice/mission continuity without research. The original U-T20 research episode is carried into M03, not falsely counted as done here. Any baseline-reproduced failure is recorded and triaged; it is not automatically waived when the new task would expose it.

## 8. Cutover and recovery

Codex starts by reading actual deployment tuple, active bindings, queues, writer/home location and grants. No same-home two-version canary. Rehearsal uses a separate disposable project/runtime home with synthetic permitted data.

Default release: pause new admission, finish bounded old work or Hold with retained state, prove old process/writer settled, transfer the registered lease to the new immutable unit, verify readiness/reconciliation, then enable admission and run a short approved episode. Do not kill an expensive active task merely to avoid a wait. If an old effect is uncertain, hold that binding and reconcile it; do not start a duplicate under a fresh identity.

Before cutover preserve the old unit and authorized rollback state copy. A downgrade must not read new log events it cannot parse. When that is unsupported, use a defined reconstruction into a fresh compatible attempt from current canonical sources with lineage and remaining budget, or keep held for resolution. Do not reset allowance.

The exact deployed source may differ by service only under an explicit compatibility matrix. Usually this PR need not restart Studio or media bridge unless those bytes changed. New hosted schema/settings are Codex operations only under a bounded approval; Claude still authors their source and tests.

## 9. Handoff

Return selected target and rejected alternatives, exact runtime/lock/artifact identities, observed versus pending tests, compatibility of old tasks and M01 state, actual provider identity unchanged, source/hosted readiness, rollback route, and the frozen mount/configuration seam for M03. No claims about speed/cost improvements without measurements. End after the bounded deliverable, not after a calendar soak.
