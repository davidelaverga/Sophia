# Shared contract and source-binding rules

## 1. Binding before implementation, not a new architecture project

At each mission's G1 checkpoint create `docs/progress/<mission>-contract-binding.md` listing actual source paths, existing operation/schema, intended delta and owning PR. Preserve the repository's canonical OpenAPI/types/validators and append-only amendment mechanism. Exact names below are target semantics; an equivalent existing operation is preferable to a duplicate.

| Boundary | M01 | M02 | M03 |
|---|---|---|---|
| Current context | Mission/notes/decisions and read-state; source-bound packet | Restore current eligible packet under matching unit/preset | Task-specific research manifest and evidence/source links |
| Write | Note/proposal/decision receipt with revisions | Configuration/binding identity only where required | Research admission, budget reservation, draft/result publication |
| Read compatibility | Preserve historical brief and missing-mission states | Preserve older eligible task/log formats or explicitly hold unsupported ones | Add Markdown/artifact types and readers before publication |
| Controls | Reuse current work controls | Preserve native delivery/journal/lease semantics | Apply same controls to source/render/work effects |

## 2. Canonical record mapping

Use existing `projects`, `project_revisions`, `decisions`, `source_objects`/source text, `source_dependencies`, `goals`, `work_attempts`, `execution_bindings`, `commands`, `jobs`/outbox, `project_events`, `artifacts` and `artifact_versions` where their actual schema fits. Read current migrations, not just the historical initial definition. [SRC-16](../SOURCE_REGISTER.md#src-16)

M01 may add mission entries, note-policy metadata and an independent ledger revision. M02 may extend composition/configuration identity. M03 may add a research record/manifest, resource reservations and artifact MIME/format mapping. Do not create a separate source store, queue, accepted-mission file or duplicate work-state machine.

Original expected outcomes and immutable source revisions remain inspectable. A current projection can select newer state but must not rewrite evidence of what was expected before the outcome.

## 3. Context packet semantics

Minimum fields, represented using current wire conventions:

```text
projectId, audience/eligibility revision
readState: empty | present | unavailable
missionRevision, ledgerRevision
accepted mission/constraints + explicit missing fields
current focus, relevant decisions/entries/work/results
source refs: actual id/version/hash/locator/coverage
pending human decisions + actual capability availability
compiler version, skill/prompt version, packet digest
```

`empty` requires a successful permitted read. `unavailable` is not a blank project. Domain data is quoted as data, not elevated to instructions. Packet selection cannot widen source/provider rights. A ledger note revision is not automatically a mission authority change or an instruction to restart every job.

Changes are propagated at a tested safe boundary; source/audience narrowing may require a clean context rebuild before further affected work. Resumption convenience does not override eligibility.

## 4. Mutation receipt semantics

All model-facing mutations resolve actual identity and project scope server-side. Required concepts: stable operation identity, semantic payload hash, expected relevant revisions, actor/grant, actual source/turn references, outcome, committed IDs/new revisions, and retry/conflict semantics.

`proposed`, `admitted`, `queued`, `running`, `written`, `published`, `checked`, and `accepted` are not synonyms. The receipt must describe what actually occurred. No model field `approved: true`, a teammate's quoted statement, or a provider success code establishes human authorization.

For mission proposals, a decision references a specific content revision and a real confirmation binding. For research, an admission references an exact context/configuration envelope. A lost receipt is reconciled with the same operation identity before any effect is repeated.

## 5. Execution configuration

The admitted attempt records a resolved configuration identity, not only a moving role label:

```text
runtimeUnitId + digest
nativePresetId + definition digest
role/guard policy digest
base prompt + skill closure versions/digests
provider/model/effort and allowed provider routes
source/mission/eligibility binding
resource envelope / remaining cumulative allowance
supported persisted-state version
```

Neither the model nor a tool argument chooses arbitrary plugin paths, host directories, credentials, database actors or runtime epochs. A user preference is resolved against eligible offerings. A missing/changed preset definition fails closed or triggers an explicit compatible reconstruction, never silently broadens.

## 6. Research source and output contract

A captured source separates request URL, provider, retrieval/extraction method, provider-request ID, provider HTTP status, actual origin status if known, actual final URL if known, title/publication date if supplied, retrieval time, content kind, stored source ID/hash, extraction coverage and pagination.

Provider-extracted Markdown can be faithfully quoted as the stored extraction, but is not labelled byte-exact original HTML/PDF. The source hash identifies the retained bytes, not unobserved origin bytes. Citation references resolve to actual retained passages/pages, with unsupported/missing coverage explicit.

A research result links a question and evidence record to immutable authored source and requested renditions. Every output has format/MIME, byte hash/size, source lineage, current authority, validation receipt and limitations. Native `present` and last assistant text can be evidence of a candidate, not final publication authority.

Database upload/publication uses pending state and stable IDs so partial failure is reconcilable. The published event is emitted only after the authorized checks and committed source/result state. Artifact-ready does not auto-accept a mission decision.

## 7. Feature gates and historical readers

Separate admission/mutation gates from read paths. Disabling notes/research/PDF stops new relevant work but does not hide previously created records, erase controls or disable cleanup obligations. Old briefs remain old briefs. New Markdown must have a real format value, not masquerade as HTML. Read-compatible snapshots ship before new artifact rows.

Capabilities distinguish configured, authorized, healthy and enabled. Missing keys, unavailable runtime, denied source scope and renderer-not-qualified have different explanations. Do not declare tools that only return placeholders; do not claim stale readiness is a successful probe.

## 8. Conflict and source rules

Use current lock ordering and actor-scoped transactions. Check sources before dispatch/publication and invalidate dependent queued/current contexts on relevant revocation. Two writes with the same base revision produce an explicit conflict. Source text that includes operational commands remains untrusted content; neither retrieval nor import becomes an execution grant.

Do not assign future migration numbers in this packet. Reserve the actual next append-only numbers after R00/current branch reconciliation. Run generation and drift checks after amendments; all aliases/field changes are recorded in the binding report.
