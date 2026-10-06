# Exact Raven import and reproduction contract

## 1. Pin, inventory, provenance

**Donor repository:** `EverMind-AI/Raven`  
**Donor commit:** `3632e6040c7038a60ec418ce39ccae185c72c19f`  
**Root:** `plugins-dist/design-engine/raven_design/`

Acquire the donor in a separate read-only checkout. Do not install Raven or execute donor scripts to perform this import. Do not float to main. Run the supplied `tools/inventory_raven.py` against the pinned checkout; it reads Git objects, verifies the four known entry blobs and writes a file-level inventory with SHA-256. Review the tool before running it. The full corpus is not included in this outline pack.

Preserve original-language donor bytes and applicable LICENSE/NOTICES as comparison evidence. Keep the dsh upstream checkout outside Sophia, as the repository requires. Commit only the deliberately adapted skill assets, provenance, approved reference resources and their manifests in the agreed native design asset locations. If repository guidance disallows a particular vendored directory, use a versioned asset bundle with an equivalent immutable manifest; do not hide it in an untracked developer home.

The root/engine license declarations do not automatically establish redistribution rights for every third-party specimen. Codex verifies the applicable notices and asset source information before production bundling. Unclear rights are a named asset gate. No fonts, credentials, raw user data or unreviewed executable assets go into the pack or runtime bundle. Do not replace a missing/blocked gallery with invented “equivalent” pictures and still claim the same import.

## 2. Exact asset selection

Import the **complete tracked contents** of these four skill directories into the inert donor inventory. This includes `SKILL.md`, their `references/`, and any `examples/`; no wildcard over all Raven skills. The inventory records all files, their roles and later active/deferred disposition. Do not run executable examples. [SRC-R1–R4]

| ID | Exact path below the root | Verified `SKILL.md` Git blob | Active native role |
|---|---|---|---|
| RV-01 | `skills/visual-artifact-design/` | `5f6962e4cf2ed0899dd78a1f89aa2e103c8e7d16` | Designer foundation; reviewer reads applicable criteria |
| RV-02 | `skills/design-editorial-and-presentations/` | `b6edaae4f6b49774d53f3e8c25d26d064152f76b` | Primary domain: continuous research article |
| RV-03 | `skills/build-polished-visual-frontends/` | `14ff3aeb7b2d888b561e4cb2794c307ec58e7283` | Web implementation companion, static-HTML scope |
| RV-04 | `skills/review-against-ai-patterns/` | `cf27ed13b88c0082228fc5db11fcce9e5516d64a` | Designer self-check and separate reviewer |

**These are Git blob IDs, not SHA-256 file hashes.** The inventory tool computes SHA-256 from the actual pinned bytes. Do not substitute one kind for the other.

Mandatory reference dependencies include:

- RV-04 `references/anti-slop-gallery/page-1.jpg` (the index), the relevant specimen pages, `references/ledger-format.md`, and `references/anti-slop-review.md`. The source requires reading the index and initially 2–4 relevant pages, adding pages only when actual risks remain uncovered. [SRC-R4](sources/SOURCE_REGISTER.md#src-r4)
- RV-03's `references/aesthetic-routing.md`, `design-system-routing.md`, `stack-routing.md`, `decision-traces.md`, and the relevant image references under `design-precedents/` and `template-pool/`. Those directories are inspectable reference material, not ready website code or blanket permission to copy a third party's design. [SRC-R5](sources/SOURCE_REGISTER.md#src-r5)
- RV-01's referenced asset/vector guidance and examples remain in the inventory. Load only the parts applicable to approved existing assets/static HTML; image generation and new branding are deferred.
- RV-02 `references/patterns.md` and `references/tool-profiles.md` remain available. The approved first compiler/renderer is the qualified Sophia HTML path; listing a commercial tool in a reference does not claim that tool is available.

A dependency-closure check must resolve relative paths and `$skill-name` references in the active compiled text. Every outside-scope reference gets a recorded `deferred` or `excluded` disposition and explicit wording in the compiled procedure. It cannot remain a dead imperative to call a nonexistent tool.

## 3. Native active assets and loading

Proposed native skill IDs are `sophia-visual-foundation-v1`, `sophia-editorial-html-v1`, `sophia-web-finish-v1`, and `sophia-visual-critique-v1`. Their exact source paths are reserved in G0, preferably under the existing dsh bundle's asset conventions; do not create a separate specialist registry.

Keep upstream organization and terminology in the source map. A faithful English adaptation is appropriate for Sophia's runtime, while output language follows the admitted request (EN/IT/ES in this slice). Preserve original Chinese texts as the audit source. Do not summarize a 48 KB procedure into a generic “make it beautiful” instruction and call it a port.

Not every reference body belongs in every model request. The host loads the mandatory compact foundation/editorial obligations before authoring; the scoped native skill/reference capability makes the relevant full sections and specimen images available. Record which versions were loaded and which image bytes reached the model. Required loading is explicit, not dependent on a model spontaneously discovering the skill.

`runtime/` in this pack supplies candidate Sophia system prompts and an HTML execution procedure. They establish the mission's policy and tool names. They do **not** replace the four source-mapped adaptations and visual references that G1 requires.

## 4. Required behavioral reproduction

| ID | Donor behavior to preserve | Native reproduction | Required evidence |
|---|---|---|---|
| RB-01 | Create / Edit / Diagnose-Audit distinction and minimal contract | Record operation mode, primary domain, natural medium, consumer, targets, required outcomes, non-goals and observable checks | Context/contract record; Audit cannot mutate candidate |
| RB-02 | Inspect existing identity before inventing a direction | Read admitted brand/reference assets, record actual observations; preserve identity | Asset IDs/hashes and observed properties; no invented logo |
| RB-03 | One primary domain plus necessary companion | Static research HTML selects editorial + web companion deterministically | Effective recipe; no extra expensive domain-selector model call |
| RB-04 | Actual references, not style labels | Inspect supplied/approved specimens; record 3–6 visible relationships, permitted transfer and protected invariants | Image/text access receipts plus a short reference contract |
| RB-05 | Risk-based anti-pattern gallery and ledger | Read gallery index and relevant pages; retain `ANTI-SLOP-CHECK.md` or equivalent structured record | Current symptoms, specimen, corrective action and re-render refs; no empty checklist padding |
| RB-06 | Representative frame before expanding everything | Render opening/common/densest/exception cases using actual content; combine where appropriate | Exact source hash and readable images at target viewports |
| RB-07 | Distinguish accepted direction from provisional/self-reviewed | Separate author proposal, independent direction review and human acceptance | No author-created approval; provisional marked explicitly |
| RB-08 | Design sequence follows reader's task | Build content order, type relationships, table treatment, navigation and density around the frozen research | Reviewer can follow the argument; citations/values preserved |
| RB-09 | Whole artifact plus readable-scale surface checks | Capture overall rhythm and every top-level section in readable crops, not one tiny long screenshot | Coverage manifest with sections, viewports, states and captures |
| RB-10 | Review after the final visible change | Invalidate stale render/review on source/asset/config changes; rebuild exact candidate | Source→render→review hash chain |
| RB-11 | Independent review excludes the author's self-rating | Separate dsh reviewer session with original request, semantics, refs and rendered candidate | Input manifest excludes rationale/self-score; structured findings |
| RB-12 | Risk-driven review, not a fixed ceremonial pass count | Direction/system/final checks when relevant; at most two repair revisions by default | Findings explain affected level and reason; budgets preserved |
| RB-13 | Narrow edit resumes earliest affected phase | Bind exact base, editable/protected sections and dependencies; patch and rerender | Full diff + protected-content/appearance checks |
| RB-14 | Actual source, output and evidence handoff | Store editable source, final HTML, manifests, render evidence and limitations | Open/download same saved output; build success alone is not delivery |

## 5. Explicit adaptations—not silent fidelity losses

- **Application authority overrides donor role autonomy.** Raven's procedural state is model working guidance, not a source of Sophia permissions. Software enforces scope and exact evidence; it does not infer aesthetic approval from a task-state label.
- **No mandatory new logo.** Preserve the existing-identity inspection. Replace the donor's “design a missing mark” requirement with “new identity work only when explicitly requested.” A research article need not have a logo or hero image.
- **Content-first editorial is a valid deliberate direction.** Preserve the donor's reader/density rationale and positive design checks. Do not import marketing-background requirements into a factual long-form report.
- **No tool installation by the worker.** Donor setup/tool-install references are operator guidance only. The native worker sees actual installed capabilities, not instructions to install packages, browse for paid tools or acquire credentials.
- **No hidden research amendment.** Tables, labels and graphics derive from admitted content/data. Missing facts produce an amendment request; they do not trigger ungoverned searches.
- **No private/team memory expansion.** EverOS identities, capture hooks and host config inheritance are excluded. Reference assets are not personal memories.
- **Independent review is explicit for final ready status.** If unavailable, retain a provisional/self-reviewed candidate and report the missing gate. Do not equate the user's approval of a direction with verification of every later change.
- **Static-only behavior scope.** Preserve semantic anchors, citations and real disclosure/scroll controls. JS frameworks, WebGL, animation, new sites/apps, image generation and deck tooling are deferred, not partially advertised.

## 6. Executable donor code: inspect, reproduce behavior, do not install wholesale

Exact reference paths under `raven_design/`:

| Donor source | Disposition |
|---|---|
| `selector.py` | Reference only. Replace its full-corpus auxiliary model selection with fixed editorial/web selection for this scope. |
| `task_state/` | Inspect as a behavior donor for revisioned task-local work records; bind to Sophia's existing durable state, not an extra local truth store. |
| `tools/`, `plugin/` | Inspect actual render/preview tool and hook semantics; port only needed behavior through native tools. No import of Raven's loop hooks as if they were Cordis plugins. |
| `rendering/service.py`, `pipeline.py`, `models.py`, `result.py`, `bundle.py` | Reproduce structured requests/results, staged output validation, warnings and current-preview lineage in the existing confined render path. |
| `rendering/browser.py`, `browser_runtime.py`, `preview.py`, `paths.py` | Reference HTML screenshot, bounds and path behavior; reuse current qualified Chromium infrastructure rather than adding a second unconfined browser service. |
| `rendering/office.py`, `pdf.py`, spreadsheet/motion modules | Out of the first HTML implementation. No implicit PDF/office dependency or license expansion. |
| `agents/raven-design/config.json`, `run.py` | Inspect behavior/config surface only. Do not inherit its model, 400-iteration ceiling, no-sandbox defaults, memory or launch process. |

Copying a small utility later requires a file-specific source/license/behavior record and independent review. Default is **native reproduction of the needed contracts**, not the complete `design-engine` Python package.

## 7. Fidelity handback

Claude produces `RAVEN_PARITY.md` with a row for every source heading/imperative in the four active adaptations: donor path + blob + heading/range, status (`preserved`, `adapted`, `deferred`, `excluded`), native asset/tool, reason, and test/evidence. Codex independently checks the mapping against the pinned source, including images. Passing G1 means the intended subset is faithfully accounted for—not that future artifacts have already achieved Raven's visual quality.
