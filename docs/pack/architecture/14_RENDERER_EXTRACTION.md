# 14 — Exact legacy renderer extraction and the new creation job

**Source pin:** `davidelaverga/Sophia-Agent@d467ab97464908b4e7c7752701eee9d24db7faf6`. This is a selective extraction design; the scripts have not been copied, modified or executed as a new renderer in this installment.

## 1. The discovered closure changes the implementation choice

The rich PDF kernel and the deck kernels are standalone **JavaScript `.mjs` files**, not the Python LangGraph wrappers. The selected runtime calls those kernels directly from the isolated render-job supervisor. Do not retain Python/ToolRuntime orchestration merely because Part 1 anticipated a Python wrapper. This is a source-based refinement of the format-donor decision, not a rewrite of mature formatting logic into TypeScript. [OLD-03, OLD-04, OLD-05, OLD-06, OLD-07]

The first release ships two concrete format paths:

1. **Static HTML report + local assets → Chromium PDF.** Preserve HTML source for future edits and exact text/source review.
2. **One HTML source per slide + local assets → slide PNGs → PPTX.** Preserve source and PNG previews; the exported PPTX contains full-slide pictures.

The PPTX path has **zero native text runs and one picture per slide** in the inspected compiler. It is editable through Sophia's HTML source, not a promise of editable PowerPoint text boxes/charts. S2 exact editing modifies that source and recompiles it. Native-object PPTX export is a separate extension. [OLD-07]

## 2. Exact source map

| Legacy file | Actual function | New destination / action |
|---|---|---|
| `.../sophia/js/render_html_to_pdf.mjs` | `installRenderRequestPolicy`, `main`, A4 printing and footer | `renderers/web/pdf/render-html.mjs`; extract/adapt. |
| `.../sophia/js/render_html_to_png.mjs` | Static slide rasterization, local-image allowlist, canvas and CDP overflow probe | `renderers/web/deck/render-slide.mjs`; extract/adapt. |
| `.../sophia/js/compile_pptx.mjs` | `renderImageForward`, `addNotes`, `compilePptx` | `renderers/web/deck/compile-pptx.mjs`; extract/adapt. |
| `.../sophia/js/package.json` | Exact existing dependency list | Start with `playwright-core@1.56.1`, `pptxgenjs@4.0.1` as the audited reproduction baseline; lock/test the chosen production browser+library unit. Do not import unused React/Mermaid merely from the old shared manifest. |
| `.../sophia/tools/build_deck_from_slides.py` | Sorts slides, orchestrates temporary rendering, fabricates compiler plan, parses stderr | Rewrite only this orchestration as a plain job; do not import `ToolRuntime`/thread mapping. |
| `.../sophia/tools/render_html_to_pdf.py` | Thread paths, source/report checks, error shaping, PDF inspection | Preserve useful checks as explicit source-bound validation jobs; do not copy the full wrapper graph. |
| `.../sophia/tools/create_pdf_artifact.py` | Small deterministic smoke PDF | Retain as historical smoke knowledge, not the rich report implementation. |
| Root `LICENSE` | MIT copyright/permission notice | Include in renderer third-party notices and extracted source distribution. |

The exact blob IDs are in [extraction manifest](../renderers/extraction-manifest.json). The extraction helper reads from a local clone at the recorded commit, verifies Git blob IDs and copies only the approved files plus notice into a staging directory. It does not silently install code or mark the resulting service usable.

## 3. What the old deck wrapper actually does

`build_deck_from_slides.py` validates virtual output paths, obtains thread data, enumerates slide HTML lexically, renders each at **1920×1080** (the PNG script's default scale is **2**), writes a temporary `_deck_plan.json`, and invokes `compile_pptx.mjs`. The slide HTML and `assets/` are its editable source. [OLD-03]

Four details must not disappear in extraction:

**Explicit order:** the old lexical filename order works only with names such as `01-…`. The new manifest carries a unique ordered slide list; duplicate/missing IDs fail validation.

**Notes preservation:** the compiler supports notes, but `_wrap_slide_pngs` constructs a plan with only per-slide indexes. The new job passes the actual title, language and speaker notes from the manifest; it does not drop them at the orchestration boundary. [OLD-03, OLD-07]

**Preview retention:** the old wrapper's temporary PNG directory is removed after compile. The new job uploads/checksums its selected PNG previews before cleanup and ties them to the exact source version. A returned path to deleted scratch files is not a preview.

**Quality state:** the old PNG probe catches CDP measurement failures and leaves overflow at zero. In the new receipt, `overflowPx:null` plus `measurement:"unavailable"` is distinct from a measured zero. Mandatory layout checks cannot pass solely because the probe failed. [OLD-06]

## 4. PDF behavior and what to retain

The PDF script opens static HTML, disables page JavaScript, blocks nonlocal subresources, allows intended local visual assets, sets print media and A4 margins, prints backgrounds and a page-number footer, and reports output size plus a visible-vector count. It imports only Node modules and `playwright-core`; no LangGraph import reaches this kernel. [OLD-05]

Do not rely on old comments saying inline SVG necessarily becomes a PDF image XObject: the wrapper and kernel already have separate vector-count handling. Preserve actual rendered/source evidence instead of treating `image_count > 0` as a universal visual-quality test. [OLD-04, OLD-05]

The report recipe preserves original language, citations, figures and readable body content. Quantitative charts use actual supplied values and deterministic source. Image generation supports illustration, not fabricated chart data. A technical Pandoc/XeLaTeX report is not an implicit fallback when the HTML path fails; it is a separately evaluated format extension.

## 5. Required adaptations before the kernels ship

### A. Explicit roots and immutable inputs

Replace `outputRootForHtml`/`inferOutputsRoot` directory-name guessing and legacy `/mnt/user-data/outputs/` translation with an explicit immutable `sourceRoot`, asset manifest and separate writable output directory. Only enumerated asset hashes are eligible. Resolve realpaths and reject escaping symlinks, absolute user-supplied asset paths, `..`, missing assets and duplicate destinations before browser launch.

The old PPTX compiler accepts some absolute paths. The new supervisor never passes arbitrary model-supplied absolute paths to it. The extracted kernel receives only verified paths inside its job root. The browser request policy still blocks unexpected network/file reads. [OLD-05, OLD-06, OLD-07]

### B. Browser confinement

The legacy scripts launch with `--no-sandbox`. The new deployment runs non-root, no Docker socket, no provider/application credentials, read-only source, bounded writable output/scratch, denied network after dependency preparation, process/memory/time limits, and a tested Chromium sandbox configuration. Remove `--no-sandbox`; a browser that cannot start under the required confinement fails the job. Do not silently retry with weaker isolation. [OLD-05, OLD-06]

The Docker execution host is not itself a model tool. The trusted supervisor starts constrained jobs; generated code cannot ask for arbitrary host mounts or privileged mode. Fonts are installed from licensed packages in the image; font files are not included in this documentation pack or in arbitrary source handoffs.

### C. Structured receipts instead of parsing prose

Keep human stderr for diagnostics, but emit one JSON result file with job ID, source-manifest hash, renderer/browser versions, output hashes/bytes, slide/page count, asset coverage, measurements and check outcomes. `missingAssets` is a list; `overflow` and checks can be unknown. An output file existing is necessary, not sufficient.

The job supervisor honors cancel, terminates its managed process group, waits for settlement, then cleans scratch. A timeout limits execution, not necessarily total cleanup time. Stale completion cannot publish a candidate after Stop or a newer source revision.

### D. Explicit language, canvas and assets

Pass deck language instead of the compiler's hardcoded `en-US`. Keep 16:9 as the first supported format. A different page aspect is a later explicit template, not implicit image stretching. The selected image version/hash is copied into the source package, and image failure preserves the last accepted asset.

## 6. New render-job contract

Input is `sophia.render-job.v1` with `jobId`, `projectId`, `artifactId`, `sourceVersionId`, `sourceManifestHash`, `format`, `language`, `entry` or `slides`, approved assets, expected authority epoch and the required checks. It contains no native credential or arbitrary shell command.

A report entry names one HTML file. A slide entry names its ID, ordered HTML path, title and notes. Files use relative paths and hashes. The trusted supervisor resolves them, verifies the snapshot, then starts the appropriate fixed kernel command.

Output is `sophia.render-result.v1`: `succeeded|failed|cancelled`, renderer identity, output references, preview references, `checks[]` with `passed|failed|unknown`, structured warnings and elapsed/resource observations. Output status is not artifact acceptance. See [render contract](../renderers/render-contract.schema.json).

## 7. Candidate checks

Before publication: verify actual file signature/parseability, nonzero declared page/slide count, exact expected source/asset closure, no missing required visuals, readable content/critical strings from source and supported extraction, a measured layout result or an explicitly unresolved check, and manual inspection of representative render pages.

For PPTX, inspect the ZIP structure/slide/image relationships and note the image-only export capability. For PDF, inspect page structure and content appropriate to the format; a visually correct export may still have accessibility limitations. State those rather than claiming a complete accessibility audit.

S2 protected editing compares non-target **source components** and the declared visual/behavior invariants. Entire ZIP/PDF byte equality is not the preservation test: packaging metadata and pagination can legitimately differ. A requested cross-cutting layout change obtains an expanded edit scope.

## 8. Extraction sessions and completion evidence

S1-13A verifies/copies the three kernels and license into staging, records dependency closure and makes the required boundary patches. S1-13B builds the isolated renderer image and runs positive and adverse fixtures. S1-13C connects source publication, generated assets, preview storage and the dsh creation tool. These are normal product work sessions, not a separate long qualification campaign.

The final proof is one useful report and one useful deck created from current project content, with a generated selected image, retained source/notes, in-app preview and a subsequent revision. Also run one missing-asset failure, one path-escape refusal, one unavailable-measurement case and one cancelled job. Keep the previous stable artifact in each failure case.

**Coverage:** the rich PDF and deck kernel files and the complete deck wrapper are source-audited here. The full old report-quality middleware, the Markdown/LaTeX stack and every legacy renderer test were not audited or adopted. That is an explicit extraction boundary, not a claim that the whole old artifact system is portable.
