# Control-support matrix — first engineering deliverable

**Design rule:** a configuration field, an upstream function and a live qualified capability are three different things. This table is the starting audit, not a declaration that every row is implemented. SCM-00/01/02 replace “qualify” with exact source symbols, effective settings, test IDs and actual receipts.

## Status vocabulary

`existing_source` means inspected Sophia code; `candidate_source` means an unmerged reviewed candidate; `upstream_contract` means a donor declaration; `planned` means new Sophia work; `unqualified` means no live proof for this composition. Unsupported and unknown remain distinct. All controls must be scoped to project/work/attempt/resource and an immutable configuration revision.

## Matrix

| Control | Scope and change boundary | dsh path | Owner-native path | Enforcement and evidence |
|---|---|---|---|---|
| Provider/model | Recorded attempt identity; new episode or explicitly qualified transition | Merged M02 journals/resumes recorded identity (`existing_source`); PR32 adds per-attempt research routes in `candidate_source`. Live role qualification remains specific to the route. | Set native session override before launch, verify actual route. S08 binding. | Requested, resolved and observed IDs; mismatch holds, no alias-based success. |
| Reasoning effort | Provider-supported value at the same boundary as model config | M02 route includes effort; not a portable universal level. | Per-native route/version; unknown support cannot be silently ignored. | Request/protocol evidence plus effective configuration; never treat “high” as a measured quality result. |
| Output token ceiling | Per model request, not whole work | Bind public supported option in SCM-01. | Native-specific control; may be unavailable. | Exact applied field, returned usage, truncation outcome. Not a project budget. |
| Context selection | Every new packet; narrowing before further use | Extend current mission/eligibility compiler. | Send eligible assignment packet, not full private native history. | Source/version closure, compiler version and eligibility revision; restore must recheck. |
| Preset/skills/tools | Attempt creation; new version at safe episode boundary | Merged M02 introduces the preset registry; its original roster alone grants no new tools. PR32 adds candidate research presets and the single specialist registry. Extend the selected integrated registry, not a second copy. | Session-scoped bundle and MCP installed before host launch. | Definition digest, materialized skill hashes, effective tool allowlist and tool guard tests. |
| Compaction | Native compaction boundary | Reuse native loop; bind configuration separately, retain artifact/source pointers. | Native runtime behavior; record observed versus unavailable evidence. | No reconstruction from summary alone; count summarizer calls/usage when visible. |
| Tool-output budget | Before model receives each result | Source-side paging/bounds; reuse M03 for web/evidence. | Narrow MCP output; native shell output bounds depend on the native agent. | Size cap on success/error, recoverable source reference, failure fallback. |
| Child/delegation budget | Before each child activation | Public native children only where qualified; inherit parent allowance/guard. | Native team child behavior needs separate qualification; off by default. | No unmetered descendants or expanded permissions; record child lineage. |
| Parallelism | Work allocation and writer acquisition | At most admitted independent scopes | Owner-selected concurrency; sessions on one account share entitlement | Dependency checks and actual writer isolation, not “three resources means three workers.” |
| Project allowance | Before chargeable action and continuation | Existing/new shared work allowance, including review and repair | Native quota may not enforce a precise app dollar cap; bound assignment and observe limits | Reserve/account once; unknown charges remain liabilities. Never reset on steer/resume/new attempt. |
| Subscription windows | Owner entitlement, observed updates | Not applicable to an API-funded dsh route unless a separately qualified account route exists | Codex app-server / Claude structured status-line candidate collectors | Owner/account/window binding, age, completeness and unknowns; no provider-side reservation claim. |
| Live steer | After admitted input, next supported boundary | Existing bridge uses native public operations; test real configured role. | S08 native event path; confirm native input evidence | Receipt chain; “delivered” is not “implemented.” No mid-tool config swap. |
| Queue | At idle/eligible continuation | Native follow-up through bridge | Native-specific queued input with serialized dispatch | Durable order; one episode owner; no duplicate Paperclip wake after live delivery. |
| Non-waking context update | No execution while idle | Qualify native injection semantics; use stored context if unavailable | Do not assume a message POST is non-waking | An FYI may remain recorded without any model call. |
| Hold | Local fence first, then native settlement | Existing pre-step/tool fence before cancel; pending input retained | Controlled stop may be needed; no claim of preserving an in-flight model request | Held state and settlement receipt separately; no autonomous resume. |
| Stop/revoke | Immediate software path independent of model/quota | Monotonic guard + native cancel + late-publication fence | Drain old sends + owner stop + observe; stop is not sticky upstream | No new dispatch under old epoch; unknown settlement blocks replacement writer. |
| Adapter cancellation | Paperclip run begins/ends | Register `onCancellationReady`, honor `signal` | Same remote-adapter contract | Await verified stop/unknown disposition; call `onProviderStopped` only with proof. [P02] |
| Owner permissions | Exact pending native request | Domain/effect permissions remain separately enforced | Owner-native action first; qualified resolve endpoint later | Actual child session, request fingerprint, owner, expiry; response evidence distinct from work resumption. |
| Retry/recovery | Paperclip episode disposition | Existing dsh log recovery + same binding where valid | Recover existing native session/nonce before creating another | `executionRecovery` only when P02’s positive evidence is true. Unknown ≠ retry permission. |
| Review/acceptance | Exact candidate and criteria revisions | Independent read-only reviewer; proposer cannot self-accept | Reviewer is another admitted assignment, not pooled credentials | Review result, human acceptance and deployment are separate receipts. |
| Speech/vision controls | Current room/exchange/recipient | Existing guide/media bridge, not Paperclip | External workers never speak directly | Stop Speaking/Looking/End do not automatically stop work; work Stop does not open voice. |

## Required machine record

For each route write a `CapabilityBinding` with: route ID; source/runtime/adapter versions; operation; supported scope; allowed transition boundary; effective control field; enforcement owner; observation channel; evidence references; unknowns; qualification date; invalidation trigger. The starting rows are in [the machine-readable matrix](../planning/control-support.json).

An execution snapshot names the work and attempt, controller generation, runtime unit, preset definition digest, policy version, selected model and effort, capability-set version, context manifest/eligibility revision, resource grant and cumulative allowance. Hash a canonical serialization. Never include a token or account credential in this snapshot.

The compiler rejects unavailable controls that are required for the task. Optional controls may be omitted only with a recorded limitation; omission cannot widen permissions or spending. On a mismatch, hold the attempt and explain the exact capability gap.

## Efficiency priorities

First reduce unnecessary work with deterministic source filtering, bounded outputs, duplicate wake coalescing and reuse of unchanged evidence. Then use phase-stable model/effort/context configurations and early budget reservation. Include planning, review, compaction, retries and permitted children in the accounting; one visible main-model request is not total cost.

Do not hot-swap the harness to change a reasoning setting. Do not invoke Jev to count tokens, compare timestamps, inspect a known permission event or choose whether Stop is allowed. A later classifier may annotate ambiguous work and select among already eligible recipes; it cannot grant authority or suppress an explicit review.

**First measured comparison:** same model, same bounded tasks, with versus without source-output budgeting and duplicate-wake suppression. Then test a small alternate recipe. Report outcome quality, user correction, completed work, cost and latency; no assumed percentage savings.


## Current continuation binding

This is the v2.0 normative integration specification. The current M02 runtime, PR32 registry/artifact work and Luis-owned side-panel implementation are described in [current baseline](../02_CURRENT_BASELINE.md). Local source/fixture work can proceed while only the relevant live dependency remains gated. Paperclip is not the first private Bot job store: owner-private messages/packages remain in Sophia until an exact human share. [Source namespace SCM](../sources/REGISTER.md); new code and provider behavior still require the listed goal acceptance.
