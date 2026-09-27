# Operations, approvals and release sequencing

## 1. Scope

This is a runbook contract for Codex, not a pre-authorized command to change production. The current source report names the new Sophia API, Studio, worker, media bridge and runtime host; Codex resolves their actual IDs/accounts, deployment commits and database before acting. Do not touch legacy Sophia-Agent infrastructure while inspecting it as a donor.

## 2. Preflight for every mission

Read current code/PR/base and active work; identify owner-approved services/database/project; compare source and hosted schema checksums; inspect actual deploy branches/auto-deploy; verify required settings by presence only; confirm runtime lease/home, API role and migration role, provider allowance, source-note policy and rollback compatibility.

Use existing diagnostics and runbooks, sanitized and pinned to the candidate. Never infer success merely from `/health`; verify what `/ready` actually checks. A service status page is not proof of the intended build or model configuration. New accounts/services/plan upgrades are not implicit in a readiness fix.

## 3. Three approval categories

| Category | Typical coverage |
|---|---|
| Implementation/support | Authorized repository edits, branches, PRs and local/disposable tests; bounded read/test tasks on allowed hosts. |
| Live qualification | Named synthetic/test project, specific providers, limited model/source calls, data/retention scope, explicit resource/spend ceiling. |
| Release batch | Exact reviewed commit/artifacts, missing migration list/hashes, named configuration changes, service subset, ordered deploy, smoke and bounded recovery. |

The user can approve a complete batch rather than individual harmless commands. Do not ask for irrelevant permissions early. Coding and fixture tests can proceed while a paid-test or release allowance is unresolved. Before the relevant effects, approval must be real, scoped and current.

No universally valid monetary amount is supplied by this pack. Paid tests without an actual cap are blocked, not unlimited. Existing funded service use is still governed by the applicable owner allowance. A new renderer host, credit purchase, paid overage or account migration is an explicit additional decision.

## 4. General safe order

1. Verify candidate and baseline; stop an unsafe auto-deploy race under approval.
2. Snapshot/backup or confirm recovery for affected data using the existing approved mechanism; do not exfiltrate raw production data to the repo.
3. Apply compatible append-only schema/read changes before feature writers. Validate actual missing migrations and hashes.
4. Deploy the minimal affected service set with admission/features appropriately disabled; verify compatible reads and cleanup.
5. For runtime changes, pause/drain or Hold, settle the old writer, transfer the lease and validate restore/readiness before enabling work.
6. Enable the narrow authorized pilot scope; run bounded actual tests; return source/deployment/schema/usage evidence.
7. Record acceptance or disable the unqualified admission path while keeping existing records readable.

These are ordering principles; Claude's exact request names commands and the source-bound existing runbook. Do not execute generic placeholder shell instructions.

## 5. Mission-specific batches

**R00:** reconcile stack/auto-deploy before merge. Settle existing OP-0009 only if still needed and approved. Do not reapply already-applied 0017 or substitute a new integrated SHA under the old approval without reconciliation.

**M01:** compatible notes/mission schema and read/use-case API first; bridge note/context behavior and UI next; scoped note policy last. Capture consent is not automatically enabled for every current project/member. Verify corrections, guest transitions and fresh exchange.

**M02:** qualify build and copied logs away from live; preserve model route; safe single-writer cutover. No need to redeploy unchanged Studio/media processes. Current native tasks either drain, remain held safely, or have an explicitly tested migration.

**M03:** Markdown format/schema plus artifact readers/projectors first; runtime worker/source providers and fixed renderer next; UI/viewer then voice declarations/admission. Use actual source/output tests. A renderer host that cannot meet confinement must not silently weaken isolation to produce a PDF.

## 6. Configuration

Use the repository's existing configuration system. Avoid a new env variable for every design noun. M01 needs note-policy/rollout state; M02 needs exact runtime/profile identity; M03 needs selected search/extraction provider, source limits, scoped storage/render configuration and actual provider credentials.

Expected secret names from the legacy/provider direction are `TAVILY_API_KEY` and `JINA_API_KEY`; confirm the selected new implementation's names in the reviewed env manifest. `FIRECRAWL_API_KEY` is optional and not a first-release dependency. Never put secrets in `VITE_*`, browser bundles, screenshots or GitHub comments. Keep application/provider secrets out of the renderer process. Presence ≠ valid credentials ≠ authorized egress ≠ working provider.

Do not copy credentials from a different account/service by assumption. An owner may authorize provisioning a new scoped key through a secure path; report only the reference/status.

## 7. Fallback and rollback

Disabling a writer is safer than discarding new data. M01 rollback preserves mission/notes readers and source revocation; M02 preserves logs or held reconstruction and single-writer fencing; M03 preserves new research/Markdown/PDF readers and controls. Old brief-only code is not assumed compatible with new artifact data.

Retain immutable prior artifacts and a tested compatibility matrix. If new native logs cannot be read by the old unit, do not point the old process at them. If an external operation is unknown, reconcile it rather than replay it on a different unit. Scope/cost changes never reset cumulative allowance.

No destructive schema rollback, cleanup that erases useful results, secret rotation, new services, wider recording or paid upgrades without matching authority. A partial release is explicitly reported; it is not made green by concealing the failing step.

## 8. Finite tests and exit

Run tests as soon as their dependencies and allowance exist. Use controllable clocks/synthetic fixtures for deterministic expiry races, plus a real short timing check where necessary. Do not impose day/week-long idle waits. Observe genuinely asynchronous provider deployment/cleanup until its bounded outcome is known; do not claim instant settlement.

Return the actual tuple, migration state, changed configuration keys/status, runtime/preset/model identity, smoke results, usage, cleanup and unresolved items. The mission's final table separates source-ready, merged, released, hosted-verified and product-accepted.
