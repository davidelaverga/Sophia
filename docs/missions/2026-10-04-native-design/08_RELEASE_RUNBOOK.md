# Release preparation, deployment and recovery

**Operator:** one authorized Codex session per mission/environment. **Default:** no production effects until an exact batch is reviewed and approved. Templates intentionally contain null authority/target fields. This outline is not an executable release ticket.

## R0 — read-only reconciliation

Before planning effects, read the actual deployment provider, service identities, current commits/images, auto-deploy settings, runtime/guide readiness, active bindings, current schema/migration checksums, storage backing, renderer availability and credential-presence statuses. Do not expose secret values.

Do not treat `config/runtime-unit.json`'s `built_not_ready` or earlier PR progress text as today's production truth. Source metadata and deployed state are separate. Verify the intended Sophia URL and routing. Identify whether merging either PR would auto-deploy before merging.

A provider call with billing, creating a synthetic app project, writing a storage object or running a model is not read-only. Prepare a separate approved pilot scope for those actions.

## R1 — release candidate identity

Claude hands off final reviewed source plus reproduced runtime/bundle/asset artifacts, exact migration files/hashes and current compatibility notes. Codex checks the final commit and records `templates/EXECUTION_REQUEST.json` with real targets and approval.

Record the complete tuple: Git candidate/merge identity, API deployment, Studio deployment, dsh runtime artifact/preset/skill bundle, renderer image/browser/assets, database schema/checksum set, guide version and relevant configuration revisions. The same Git commit alone does not identify every deployed component.

No new billing provider or larger paid hosting plan is authorized by this pack. If the renderer/model cannot fit the approved environment/allowance, state the measured requirement and request the smallest amendment. Do not disable confinement or silently use another member's payer.

## R2 — staged candidate verification

Prefer an approved disposable/staging environment. Run migration compatibility, old-reader/old-guide behavior, artifact hashes, storage access controls, renderer confinement, native role/readiness and model-image probes. Ensure new admission is closed until all required components can operate together.

M75 alone may be tested locally/in preview as the fixed-template control. Its reader improvements must not be advertised as a completed native-design feature. Default public rollout combines the qualified foundations and SDD-01 route; a separate reader-only release requires its own explicit approval.

## R3 — proposed ordered deployment, to be bound to actual services

1. Record authorization and current preconditions; close new-design admission for the affected scope. Preserve existing MD and historical rendition reads.
2. Apply only approved missing append-only migrations after checksums/preconditions match. Never replay old batches or push local Supabase configuration wholesale.
3. Deploy the compatible API/schema-contract changes while keeping the new feature closed. Old clients and historical artifacts still read correctly.
4. Deploy/qualify the renderer and immutable reference/asset backing. Verify output bounds, network denial, screenshot identity and storage retrieval.
5. Deploy the exact new dsh runtime bundle with its two versioned roles, prompt/skill hashes and metering. Drain/preserve existing bindings according to actual compatibility; do not kill active work just to simplify rollout.
6. Deploy the guide/client changes and Studio viewer/download integration. Confirm there is no newly requested HTML path invoking the old browser converter. New formats are offered only from actual backend readiness.
7. Enable the approved synthetic pilot scope, run the end-to-end app cases, collect hashes/captures/usage, then enable wider scope only if that is included in the approval.

This sequence is a planning default. Codex must bind/review it against actual dependencies at G0/R0; any altered order records its reason and retains the same authority/compatibility guarantees.

## R4 — what in-app verification must prove

The real new task reaches the native designer, receives real images for inspection, produces a review result for the latest candidate, and yields the exact saved HTML. Source and work controls remain enforced. Mid-work steer changes the result; section-only revision does not mutate protected work; returning after browser disconnect shows current records. A stopped/stale result cannot publish.

Compare the candidate opened in Studio with downloaded bytes. Capture actual deployment/runtime/role/artifact identities, not just screenshots. Verify stored evidence and private-source boundaries; redact before any public handback.

## R5 — rollback and uncertain effects

On serious failure: close new admission first; stop further dispatch under the correct control epoch; reconcile in-flight renders/reviews/model calls and any published outputs. Preserve outputs/logs required for diagnosis within retention policy. Do not run destructive down-migrations or overwrite published artifact bytes.

Rollback components only to a tuple that can read current data and handle existing preset/binding identities. An older runtime missing the new preset must not resume new-role sessions under another role. Drain, hold or pin those sessions safely. Disable only the new capability; keep compatible legacy readers usable.

If a provider response is lost, inspect real deployment/schema/object state and reconcile the same operation before retrying. A timeout is not proof of no effect, and a cancelled model may still be billed. Preserve unknowns in the operation journal and budget.

## R6 — release result

Return executed source/artifacts and actual deployment IDs, owner approval reference, migration before/after hashes, configuration keys changed, test steps/outcomes, actual spend, residual risks, cleanup and rollback readiness. Claude verifies the handback and updates progress from evidence. Davide's product acceptance remains a separate field.

Never mark `app_verified` from a fixture, a passing CI badge, a default branch name, a completed code review or a model's final message.
