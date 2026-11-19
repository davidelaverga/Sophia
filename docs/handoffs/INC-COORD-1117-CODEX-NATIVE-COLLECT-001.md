# INC-COORD-1117-CODEX-NATIVE-COLLECT-001 — NCOL-F01-R1

State: **HOLD / bounded NCOL-F01-R1 repair, same independent new-candidate review pending.** No commit, publication, S/U integration, schema, write profile, live native inference, activation or release was performed. This handoff describes code; it grants no authority.

## Scope and source identity

N implements a separate optional bounded read-result capability through the existing runner gateway and owner-host channel. Existing observe remains content-free. No existing send envelope/version, digest, receipt, journal record, settings semantics, tool allowlist, create/input/Stop profile or continuation owner changed.

The implementation base for all thirteen leased existing source/test files is their exact blob in private tree `f0b76f0a8c07f7ce021a7c35a0a124dcf277f237`. Those safe named bodies were obtained at published `90a0af7eb3d4d376e9a0d63c0e05def18ee79b36` and checked against the retained f0b full-leaf metadata. No private commit/ref was fetched. Signed local `9dfeba7f96ece540f904dfe3ac58adb988140148` and old native heads remain untouched/unpublished.

The physical owned test checkout is **main `de7a6ab257a98861bb3790dea65f228014a5d2cd` + exact f0b N files + read-only f0b `runner-model-report.ts` dependency + this N delta**. It is not a whole f0b checkout. The dependency blob is `ecee6c5431c6708b9ea9cea91e8ce6cba45b9a55`, copied unchanged for B2 imports; it is not an N edit or part of the exported N delta. Exact actual/prospective trees and all input/output hashes are in `ncol-f01-r1/RESULT.json` and its accompanying manifests outside this checkout (the original `STAGEA-RESULT.json` remains immutable history). No source commit exists.

Correction to the earlier preflight handback: Root subsequently reported the same independent f0b whole SOURCE_CORE complete, **CHANGES_REQUIRED**, with only C011-F01 residual helper-fixture repair (`REVIEW.json` SHA prefix `32b4d9f3`). A separate prospective `7131` startup repair is under that same reviewer. This N candidate neither fixes nor accepts that unrelated slice. The preflight's older incomplete-review observation is historical.

## Exact leased changes

Production files, all under `packages/coordination/src/`: `runner-port.ts`, `t3-port-mapping.ts`, `runner-gateway.ts`, `owner-host-channel.ts`, `owner-host-port-proxy.ts`, `owner-host-agent.ts`, `runner-fake-t3.ts`.

Tests in the same directory: `runner-port.test.ts`, `t3-port-mapping.test.ts`, `runner-gateway.test.ts`, `owner-host-channel.test.ts`, `owner-host-port-proxy.test.ts`, `owner-host-agent.test.ts`.

Documentation: this file only. No index, source map, migration, amendment, generated contract, package/lock, runtime artifact, persistence, worker, API, UI or production configuration edit is included.

## Frozen N interface for review before S consumption

`SophiaRunnerPort.collect?(identity: RunnerIdentity, request: RunnerCollectionRequest): Promise<RunnerCollection>` is optional. `collectRunnerResult(...)` is the explicit boundary for callers: missing capability returns `collection_unavailable/unsupported`; exceptions return unavailable. It never falls back to observe, send, input, attach, inquiry or a model turn.

`RunnerCollectionRequest` has exactly `{v:1, maxPages, maxBytes}`. Limits must be safe integers: pages 1–8, bytes 1–8192. They narrow hard ceilings and confer no authority. Pages are a **total budget including both verification passes**, not per pass. A one-page budget cannot establish two-pass consistency and therefore yields incomplete. Reads always start from the beginning: the caller cannot supply native IDs, a cursor, tool name, URL or output offset.

The gateway opts into this source capability only with `GatewayOptions.collectionVersion:1`; default is unsupported. The worker-side store similarly needs `ExchangeStore.collectionVersion:1` before a collection exchange can be enqueued. Neither declaration proves a qualified host/profile or current authorization.

The new owner-host request is a separately versioned **v2 `kind:'collect'` exchange**, carrying the existing envelope/digest/journal/project/operation identity plus `collection`. Ordinary send/reconcile/observe exchange requests remain v1 and byte-compatible. A collection request cannot be translated into a send. A legacy host rejects the new request or returns explicit unsupported; absent/lapsed/invalid answers become unavailable at the proxy.

Successful `CollectedContent` has exactly:

```text
v:1, kind:'collected', operationId, bindingId, journalId, envelopeDigest,
threadId, runId, inputMessageId, messageId, itemId, text, textSha256,
byteLength, pages, lastPosition, coverageDigest, resultDigest
```

`inputMessageId` is the accepted create/input message from the journal's original native identity. `messageId`/`itemId` name the selected assistant result. `envelopeDigest` preserves exact admitted provenance; it does not assert an observed repository checkout, effective settings or current source permission. `textSha256` hashes exact UTF-8 bytes without trimming/normalizing. `coverageDigest` hashes the matching bounded scan observations. `resultDigest` hashes every other result field using existing canonical JSON. The complete serialized response is capped at 65,536 UTF-8 bytes. The proxy checks exact keys, own operation/binding/journal/digest, namespace-derived native thread/input identity, byte length, bounds, text hash and result hash before exposing a host answer.

Unsuccessful results are exactly `{v:1, kind:'collection_unavailable', reason}`. Finite reasons: `unsupported`, `invalid_request`, `unavailable`, `scope`, `unaccepted`, `incomplete`, `invalid_result`. They carry no raw provider diagnostic or partial text. They are availability/coverage states, not proof of no prior execution, settlement or permission to retry inference.

## Actual native mapping and result semantics

No native output schema was invented. This code uses the existing public T3 `t3_thread_read` primitive at `ade473018d32003658b7d38693e083ee2e314bd8`, with `view:'messages'`, `afterPosition`, limit 100, runLimit 50 and `maxCharsPerItem` bounded by the requested byte ceiling. Local retained upstream bytes were checked against primary GitHub exact-ref blob metadata:

| Source | Git blob | Relied-on lines/meaning |
|---|---|---|
| `packages/contracts/src/orchestratorMcp.ts` | `c73bbd48e26f5aa16b1a8836852bd900d856429c` | 406–499: read input, thread/run records, position/sourceThread/type/status/text/truncation/message/run fields |
| `packages/contracts/src/orchestrationV2.ts` | `5c430ef75581a165d94ce16c7369c0245bdef5d8` | 1436–1447 and 1630–1647: item statuses; assistant_message distinct from reasoning |
| `apps/server/src/mcp/OrchestratorMcpService.ts` | `9d15408483a3eac9fe4b09ff20c6c987a46711f7` | 978–1013, 3034–3141: message/run provenance, truncation and paging; thread-scoped reads may acknowledge child results |
| `packages/provider-core/src/server/subagentProjection.ts` | `dbd929192e04d4ecd815f1e7455aeb761d264144` | 179–226: select last nonempty assistant turn item for the exact run; no fabricated placeholder accepted by Sophia |

Current main `docs/SOURCE_MAP.md` §2l/2m/2n and pagination sources were read. Its selected T3 contract supersedes the older Omnigent implementation choice in architecture 11; architecture 11's owner/authentication/disclosure restrictions remain relevant. No Omnigent or alternative provider path was added. `UPSTREAM-EVIDENCE.json` outside the checkout records full-file SHA-256 and bytes. No upstream code, helper program, T3 server or provider was executed.

T3 exposes no separate `final_answer` phase in this read API. This capability uses its source-backed last-nonempty-assistant selection rule, restricted to the **exact accepted run in completed state** and a completed, untruncated local assistant item. It does not assert a provider phase absent from the API. Reasoning, user text, tool/shell events, inherited/foreign rows, subagent/forwarded content, failed/interrupted/unknown/running results and terminal-without-useful-output cannot become collected text.

The gateway checks the exact existing journal/digest/owner/profile lineage before reading, requires a received create/input with its original native input identity and run, and never reads arbitrary caller-selected IDs. Collection checks a configured `client:` namespace label only. That label does not establish authenticated outside-MCP invocation context or absence of child-result acknowledgments. The selected transport/context, actual owner authentication and native qualification remain unproven; pinned thread-scoped reads can acknowledge child results.

Each scan requires coherent complete run summaries, the exact target run completed and `activeRunId === null`, exact input-message→run correlation, strictly progressing page positions, unique item/message identities and bounded cumulative assistant bytes. This does not prove global absence of queued or unsettled runs; no new global settlement restriction was added. Positions may legitimately have gaps because T3 assigns them before its messages filter. Two complete scans must have identical projected content/cursor/run fingerprints within the same hard total page budget. Detected rewrites, changing summaries, nonprogress, malformed data, truncation or exhausted coverage return unavailable without text.

There is no atomic snapshot across T3 pages. Matching repeated reads prove the recorded observations, not global immutable history or that content cannot change later. A run outside the 50-run window or a long timeline can remain unavailable under the fixed bounds. This is deliberate fail-closed availability, not a reason to increase privileges or infer a result.

Each native read has a 2,500 ms local await bound; at most eight reads yields at most 20 seconds of awaited reads plus local decoding. A timeout ends collection with unavailable and no additional read. It cannot cancel an already issued transport read; a late body is discarded, and the selected transport must retain its own network deadline. No timeout is proof of no external effect, and no new inference is attempted.

## States and effects

Disabled/old port → unsupported. Malformed bounds → invalid_request. Foreign/frozen-lineage mismatch → unavailable before native read. No journaled accepted execution → unaccepted. Existing execution → bounded reads only. Completed matching scans plus useful assistant output → collected. Offline/timeout/partial/conflicting/stale observation → unavailable/incomplete/invalid_result. Existing observe remains status/model-report evidence only. No result means accepted, merged, deployed, verified or ready for Build.

No collection body is appended to the runner journal. No create/input/Stop or native write is issued by collection. No second scheduler, Paperclip wake or background inference is added. Existing B2 reportedModels code and tests remain intact, and reported/accepted/observed settings remain distinct.

## Local checks and limits

Toolchain: Node 24.21.0, pnpm 11.7.0; one `pnpm install --frozen-lockfile` in the owned checkout (exit 0). Final R1 focused checks (same physical subset; no new install):

- The six maintained unit suites above: **287 tests / 59 suites / 287 pass / zero fail, cancel, skip or todo**. The original bcf run was 277/277; all original assertions remain.
- `pnpm exec tsc --noEmit -p packages/coordination/tsconfig.json`: exit 0.
- Type-aware oxlint and Prettier check on the thirteen leased source/test files: exit 0.
- `pnpm toolchain:check`: exit 0.

The four original meaningful guard mutations failed their focused regression cases again on R1: foreign source scope, UTF-8 cumulative limit, frozen journal-envelope lineage and matching repeated-scan consistency. Two additional R1 mutants remove store wire identity/limit isolation and likewise fail their intended assertions. Exact source bytes were restored and final focused checks passed. Tests also cover legacy missing capability, default-off hosts/stores, wire version/bounds, namespace/provenance/hashes, no GO or alternate input, journal reopen, missing/failed/interrupted result, malformed/foreign/oversized/nonprogress data, timeout and late reply. Fake outputs are explicitly synthetic, not evidence of installed native schema behavior.

Earlier local rounds exposed implementation/type/lint/test issues and were corrected; their raw red logs remain retained. Original terminal logs remain in `stagea-logs/` and the original Stage A packet. R1 raw terminal/command-exit logs, fail-before inputs, mutation/restoration receipts, hashes and cleanup inventory are in `ncol-f01-r1/`. Final raw filenames containing `accepted` mean local check completion only, not independent source acceptance.

No full ordinary check, SQL/DB test, browser test, actual account/host access, provider inference, release or app qualification ran. Main-plus-N subset checks do not qualify the full prospective f0b composition. Owned test journals/contenders use the maintained suites' cleanup; all launched local command sessions completed. Dependency installation is retained only inside the owned scratch checkout.

## S/U, write-profile and qualification gates

S is unleased. Existing database/API transports do not support v2 collect yet and cannot be activated by this code. S must implement current owner/grant/source/read authorization and expiry checks, bind the returned run to Sophia's persisted accepted native mapping, protect result audience and withdrawal/revocation, retain exact content/version/digest idempotently, and link it to the originating work. Static gateway profile checks are not that authorization. No migration/amendment identifier is allocated here.

U is unleased. No explicit Sophia request/start-to-result reader wiring or significant UI candidate is implemented by N. The same-work journey, current serving source/config/artifact identity, independent source/app review, automatic coverage/current CI, Luis integration, Davide's UI gate and RTA/owner release path remain open.

Write-capable Build remains a separate versioned admission/profile candidate. Existing v2 read_only semantics were not broadened. The prepared Davide/Claude read qualification episode remains non-executable until exact owner account/host/disclosure/funding/allowance/profile and operational authority are bound and the engineering/release gates pass. Sign-in does not need repeating. D1 off, VoiceLab suspended, default-off flags/scope erratum, Personal9e approval and all outstanding effects are retained.

**End HOLD.** Root receives this exact bounded N delta for the same independent reviewer before freezing S/U consumers. No blanket permission request or further source work is implied.


## NCOL-F01-R1 repair record

The complete independent bcf review was CHANGES_REQUIRED for NCOL-F01 (P2), SHA-256 `ce1b832087b331733403975e22c8f701283622ae436a5fcf44c522d9967cf8f6`. Root froze its operative references before R1 edits. The original bcf source/export packet, hashes, test logs and four causal controls remain unchanged outside this mutable owned checkout. This R1 receives a distinct prospective tree and export; it does not replace historical evidence.

Gateway, proxy and optional public collection wrapper capture detached, fully validated value snapshots of identity and scalar bounds before asynchronous work. The identity is copied recursively through canonical JSON, then the exact copy's envelope/digest/journal are checked; nested v2 settings/options cannot remain aliases. Caller objects are neither frozen nor mutated. The gateway copies its accepted native mapping and uses the captured environment reference for every later read. The proxy captures its namespace before enqueue and sends the store a separate deep wire copy, so store-side request mutation cannot alter its private response-checking identity or limits. No public DTO/version, send/observe/Stop behavior, journal/digest semantics or capability default changed.

Deterministic deferred-read regressions reproduce the original 8→10 page and 8192→16384 byte witnesses, plus narrower original budgets. Deferred proxy enqueue/answer and store-side mutation cases exercise original operation/binding/digest/journal and nested model/options/manifest identity. CREATE and accepted INPUT tests retain the original input-message→run→assistant mapping, with exact same-read replay; this is synthetic mapping evidence, not new provider input-causality qualification. An additional v2 CREATE case and direct nested-snapshot check cover settings aliases. Original 277 tests, two-pass conflict refusal/default-off paths and the four original causal assertions remain.

The R1 packet under `workers/codex-native-1117/ncol-f01-r1/` records exact final counts, old-candidate red assertion controls, final source restoration/checks, all hashes, delta versus bcf and full delta versus f0b, and prospective versus physical test composition. No whole f0b/coherent/PRE/SQL/DB/provider/browser acceptance is implied. S/U and the N interface remain unfrozen pending this same independent review. All programme history, denied-body restrictions, unknown effects and downstream holds remain.


Final R1 outcomes: 287/287 owning tests, typecheck/lint/format/toolchain exit 0; nine new deferred assertions fail on the original bcf production bodies with no import/type/runtime failure standing in for the cause. That fail-before control includes separate v1 CREATE, accepted INPUT and v2 CREATE lineage cases. The original four and two additional wire-isolation mutants exit nonzero on their intended assertions and are restored byte-for-byte. Raw final and red results, exact test-input hashes and restoration hashes are retained in the R1 packet. All local command sessions completed; no live native process, provider call, database, production effect, source commit or publication was introduced. Scratch test data is removed by the maintained cleanup hooks; the owned checkout/dependencies and all original evidence remain retained. Programme-level unknown effects are preserved, not settled by these local checks.
