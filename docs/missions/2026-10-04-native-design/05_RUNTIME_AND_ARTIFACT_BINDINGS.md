# Native bindings and artifact contract

**This file defines proposed logical interfaces. It does not assert that these names, endpoints or schema fields exist today.** G0 binds them to the repository's actual services and generated contracts before implementation. No guessed live HTTP URLs or migration numbers appear here.

## 1. Compose roles through the existing registry

Extend `config/specialists.json`, its actual schema and `scripts/generate-specialists.mjs` plus generated consumers. Reserve two new versioned presets, `sophia-html-designer-v1` and `sophia-visual-review-v1`. Keep the existing researcher unchanged. A preset is the scoped tool/prompt/skill composition, not a security sandbox.

A complete execution identity records: preset version, native bundle/artifact, provider/model/effort, effective tool set, required prompt hashes, compiled skill/reference manifest, input/source revision, compaction policy and cumulative allowance. Register the new roles in the actual route guard and runtime hello/readiness contract. Do not infer model-call authority from a role's friendly name.

Follow current profile/package installation and runtime-artifact build rules. No dsh source fork, second root bootstrap, workspace-plugin masking or direct launch from arbitrary node_modules. [SRC-S3, SRC-D1]

## 2. Proposed model-facing tool contract

The literal prompts in `runtime/` use the following names. Implement these public names or submit one explicit binding amendment updating prompts, schema and tests together; do not leave imaginary tools in a prompt.

| Tool | Essential input | Result/authority boundary |
|---|---|---|
| `design_read_context` | No caller-authored actor/goal | Exact admitted task, input package, requested format, limits, current source/candidate, constraints, allowed references and work state |
| `design_read_reference` | Approved `reference_id`, optional bounded page/region | Actual text/image content plus hash/coverage; no arbitrary URL or path |
| `design_record_work` | Expected work revision; contract/stage notes/reference or surface records | Durable working record only; cannot grant approval or declare publication |
| `design_write_source` | Expected draft hash (null only on initial create); bounded HTML/CSS/files; content map | Validated editable-source revision, file hashes and diagnostics; no publication |
| `design_patch_source` | Base source hash; selected sections/files; bounded patch; preservation contract revision | Exact-match/CAS application to working copy; complete diff; reject ambiguous/stale/out-of-scope patch |
| `design_render` | Exact saved source revision/hash; selected admitted targets | Render job/result IDs, source hash, output/capture refs, metrics and warnings; no renderer credentials in model context |
| `design_inspect_render` | Authorized render ID + permitted capture/section refs | Actual readable screenshot content and measured checks, including unavailable/truncated coverage |
| `design_submit_candidate` | Exact source + render IDs/hashes; change summary; limitations | Records a candidate and requests required review through the service; author cannot create review PASS |
| `design_report_blocker` | Bounded reason, missing capability/input, recoverable draft ref | Names remaining work without false completion or new authority |
| `review_read_context` | No actor fields | Original request, frozen semantic package, constraints, exact candidate and reference/render manifests; no author self-rating |
| `review_inspect_render` | Exact authorized capture/ref IDs | Actual images + measurements scoped to the assigned candidate |
| `review_submit_result` | Candidate/source/render/criteria hashes; structured findings and coverage | Writes this review only. Does not edit candidate, approve spend, publish or accept the project outcome |

Use the existing scoped native `skill` mechanism for compiled procedural text where suitable. Restrict available skill IDs and references to the admitted preset; required instructions are loaded explicitly before authoring. The reference/image tool is not a second generic memory or web-search service.

The designer gets no raw host shell, unrestricted file/network tool, self-spawn, deploy capability or researcher source-discovery tool. The reviewer is read-only with respect to candidate source; writing its own findings is allowed. Capability enforcement covers every nested/tool execution path that is actually enabled.

## 3. Research handoff and semantic integrity

The frozen input package contains report artifact/version, Markdown hash, source closure and coverage, citations/data, original request, language/audience, approved references/identity, requested format and limits. The content hash and authorization identity are distinct: a known hash is not permission to read.

For the first baseline, preserve claim wording, numeric values, caveats and citation relationships while allowing semantic grouping, heading/presentation adjustments and section ordering that do not alter meaning. Record each rendered content block's source block/citation map. Missing or changed factual content requires an explicit research/input amendment; it invalidates downstream candidate/review evidence.

Check visible content as well as markup: hidden, zero-size, clipped or off-screen mandatory claims do not satisfy preservation merely because strings remain in the file. Use deterministic coverage checks and source-aware review; neither is proof of general factual truth beyond the supplied research.

A useful default authoring package is `index.html`, scoped CSS, admitted assets, and a section/content/dependency manifest. Stable section IDs survive a local revision. This is an authored package, not mandatory reuse of the #75 document layout.

## 4. Draft, render, review and delivery identities

Logical records must distinguish:

- **Design attempt:** current role/runtime, source package, work authority, allowance and control epoch.
- **Editable source revision:** immutable package manifest plus file hashes, base revision and allowed change scope.
- **Render:** exact source/asset/compiler/profile/viewport identities and actual captures/checks.
- **Review:** candidate + source + render + criteria + reviewer identity and actual inspection coverage.
- **HTML deliverable:** content-addressed final HTML and lineage to the accepted candidate/input package.
- **Attention/discussion:** viewer-specific seen/dismissed state and attributed messages; never review resolution by itself.

Reuse the repository's existing artifact/rendition storage and task/attempt records when their semantics fit. New fields/records must have one authoritative owner, generated contracts, idempotent writes and current access checks. No extra local `task_state` authority from Raven.

Every mutation carries an operation ID, expected base revision and current server-authorized actor/binding. Repeated delivery with the same identity and payload returns the prior outcome; conflicting reuse is rejected. Do not claim exactly-once external effects across stores.

## 5. Render and preview safety

Keep the initial exported report self-contained and static. Validate HTML and CSS using appropriate parsers, not the trusted-template regex pass from #75. Block scripts/event handlers, forms, external resource loading, uncontrolled CSS imports/URLs and embedded executable contexts. Bundle only approved raster assets through a bounded manifest; reject unknown assets. Do not introduce font binaries in this pack or harvest host fonts.

Preview authored HTML in an isolated document with no application credentials or executable privileges. Never insert it into Studio's main DOM or relax Studio's own CSP. Enforce network denial and resource/time/size bounds at the renderer as well as in the document. Screenshots and print views run on exact saved bytes. Record fonts/browser/runtime actually used and actual measurement availability.

Output staging is temporary until manifest/hash checks pass. A missing capture, clipped region, renderer timeout, disconnected renderer or stale completion remains a failed/partial result. A cancellation receipt is not proof that child processes or external effects settled.

Whole-page views prove rhythm; readable section crops prove local details. For long reports, maintain a coverage plan and bounded batches. If the allowance cannot inspect the required range, record incomplete review instead of silently covering only the first six sections.

## 6. Scope-preserving edit contract

An edit binds `base_candidate`, allowed component IDs/files, protected component/content hashes, permitted shared-style/asset dependencies and any supplied replacement text. Software verifies the expected base before applying the patch. Limitations of fuzzy matching are not a reason to silently expand an edit; the native edit path must be unambiguous.

Check unchanged source outside scope. For protected appearance, compare relevant fixed-layout regions under the same rendering conditions; distinguish expected downstream reflow from a visual change and define permitted reflow in the task. A local CSS edit cannot silently become a global restyle. Human-guidance conflicts become decisions, not last-message-wins writes.

A failed edit never overwrites the previous published candidate. It can produce a repair candidate or a scope-amendment request. After a final edit, rerender and rereview the affected range plus required global checks. Old review results remain history, not current PASS.

## 7. Completion and controls

Content-stage completion does not complete an HTML goal. The service admits design atomically with the corresponding work transition or through an idempotent durable outbox. A crash between the stages must not lose or duplicate the designer.

The existing application control state is authoritative. dsh steer/inbox delivery is the native mechanism, not a new scheduling system. Hold/Stop closes dispatch before cancellation; late render/review results cannot publish. Source revocation invalidates all descendants that consumed it, including reference/content caches, renders and resumable contexts under the current policy.

Browser unmount/disconnect affects presentation only. Persisted work still requires a live/available host and current mandate. Resume restores the correct preset implementation and cumulative allowance; it never reloads revoked history or resets pending spending.

## 8. Readiness and format cutover

Readiness requires preset assets, real authoring tools, storage, renderer, image-capable inspection/reviewer, metering and necessary API/schema compatibility. Expose HTML design only when the required path is ready. Frontend flags do not authorize execution.

Replace browser-side conversion callers only with real generated API bindings. Open pins a candidate; Download retrieves that exact byte identity. While design runs, show a designing/reviewing state with Markdown available as content/partial work, not a ready HTML label.

The application may render Markdown for reading without claiming it is a designed HTML-file deliverable. No fresh model invocation or conversion should occur merely because the user downloads a completed HTML version again.
