# Raven → Sophia parity matrix (SDD-01 G1)

**Donor:** `EverMind-AI/Raven` at `3632e6040c7038a60ec418ce39ccae185c72c19f`, root `plugins-dist/design-engine/raven_design/skills/`, read from Git objects in a separate read-only checkout outside this repository; nothing was installed or executed. **Inventory:** [raven/INVENTORY.json](raven/INVENTORY.json), written by the pack's `tools/inventory_raven.py` (reviewed before use; its 6 synthetic tests pass): the four entry blobs verified, 68 tracked files (26 text, 42 images; no font, symlink, LFS pointer or other file), each with its Git blob and SHA-256. **Original-language donor text** (all 26 text files, the inert comparison evidence): [raven/donor/](raven/donor/), with the donor's `NOTICES.md` files in `raven/donor/_notices/`; the donor `LICENSE` is `packages/dsh-bundle/skills/RAVEN-LICENSE.txt`. **Native assets:** `packages/dsh-bundle/skills/`, identified by [manifest.json](../../../packages/dsh-bundle/skills/manifest.json) (checked by `tests/unit/design-skills.test.mjs`).

Status words: **preserved** (kept with its meaning; images byte for byte), **adapted** (kept, with a stated change of mechanism or scope), **deferred** (applicable to a later profile; not loaded, and the native text says so where a reader could expect it), **excluded** (not part of this mission). Every row below cites the donor file and line range or heading, the native clause id (in brackets in the native text), and the reason. Codex's independent check of this mapping against the pinned bytes, images included, is the G1 review (pack 04 §7); until then every row is `not_reviewed`.

**Scope claim.** This is a *Raven-derived native HTML design baseline*: the intended subset accounted for. It is not a claim of Raven's output quality, token cost, benchmarks, format coverage or behaviour.

## 1. Files (68)

| Donor file (below the root) | Git blob | SHA-256 | Bytes | Status | Native asset | Reason |
|---|---|---|---|---|---|---|
| `build-polished-visual-frontends/SKILL.md` | `14ff3aeb7b2d` | `c402d34c02d1` | 48628 | adapted | `sophia-web-finish-v1/SKILL.md` | Clause map §4 |
| `build-polished-visual-frontends/references/aesthetic-routing.md` | `b0e663bb55d3` | `43b0329f0d5f` | 17362 | adapted | `web/aesthetic-routing` | Benchmarks are the admitted references and bundled precedents; product component rules excluded |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-1.jpg` | `70972152d445` | `f660b74fb45e` | 265135 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-10.jpg` | `44eab9eac32e` | `365d529cfb48` | 207445 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-11.jpg` | `9d7b88d7f6a4` | `5357ab127006` | 400944 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-2.jpg` | `c7d3a2629417` | `e0798e6355b4` | 187334 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-3.jpg` | `fa506088cabc` | `1adc6f5b681e` | 271140 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-4.jpg` | `52e7a26d60fa` | `34a3623da9a4` | 158973 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-5.jpg` | `db45fb4c60cb` | `c340c04dcea1` | 257840 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-6.jpg` | `15c3c875524b` | `d317123e4767` | 309014 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-7.jpg` | `288a83bc1098` | `6c23de845ac4` | 253778 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-8.jpg` | `06c16cbe9106` | `1745de5ffadf` | 192967 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/anti-slop-gallery/page-9.jpg` | `f32db5262d9e` | `dfc084293a77` | 231916 | excluded | — | An older 44-specimen copy of the gallery; superseded by RV-04's 51-specimen gallery, which RV-04 states it moved out of RV-01 and RV-03 losslessly |
| `build-polished-visual-frontends/references/assets-and-imagegen.md` | `ac0ed680896e` | `836aaf0421a3` | 18763 | deferred | — | As the RV-01 copy: image generation not available |
| `build-polished-visual-frontends/references/decision-traces.md` | `a9c22e8db312` | `c410f3821b76` | 9970 | adapted | `web/decision-traces` | Editorial (§2) and data story (§3) traces and §5 kept; product tool (§1) and explainer (§4) excluded |
| `build-polished-visual-frontends/references/design-precedents/page-1.jpg` | `c8c775638d86` | `ee368b18de05` | 125963 | preserved | `web/precedents/page-01` | Bundled byte for byte; rules and type index |
| `build-polished-visual-frontends/references/design-precedents/page-2.jpg` | `eb190e4c8f03` | `a027f801dc66` | 184936 | deferred | — | Precedents for product and marketing pages: not this artifact type |
| `build-polished-visual-frontends/references/design-precedents/page-3.jpg` | `46df5fab3039` | `dfc2e54aed29` | 231678 | deferred | — | Precedents for product and marketing pages: not this artifact type |
| `build-polished-visual-frontends/references/design-precedents/page-4.jpg` | `94d847e23098` | `a23fe3e5ec71` | 186273 | preserved | `web/precedents/page-04` | Bundled byte for byte; data pages and reports |
| `build-polished-visual-frontends/references/design-precedents/page-5.jpg` | `dcec77afd1b2` | `1def54e3e172` | 347507 | deferred | — | Precedents for component systems, docs sites and maps: not this artifact type |
| `build-polished-visual-frontends/references/design-precedents/page-6.jpg` | `2706107ae980` | `5e392145a9cd` | 255258 | preserved | `web/precedents/page-06` | Bundled byte for byte; long-form publications and articles |
| `build-polished-visual-frontends/references/design-precedents/page-7.jpg` | `fe1f13db59fb` | `8cc7a42efbd2` | 122044 | deferred | — | Precedents for posters and single visuals: not this artifact type |
| `build-polished-visual-frontends/references/design-system-routing.md` | `5693ff4eaa0b` | `a17845537a8f` | 10831 | excluded | — | Choosing a React component system (Appica, shadcn/ui, MUI…): no components or React; "one visual language" kept in W2.4 |
| `build-polished-visual-frontends/references/stack-routing.md` | `be19ff703254` | `7b3518138a76` | 17509 | excluded | — | Framework, library and engine selection: one static HTML file, no build; the medium gate is reflected in E1.3 and W1.3 |
| `build-polished-visual-frontends/references/template-pool/POOL.md` | `56d7bf8b4250` | `7dd329f3a317` | 8444 | excluded | — | Template pool for content and marketing sites (clone and customize): not applicable; third-party templates |
| `build-polished-visual-frontends/references/template-pool/atelier-ko.jpg` | `a44fe861a979` | `52ddb2e198c0` | 118806 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/bento.jpg` | `b1d7296da7ac` | `6d99c16f7e75` | 139938 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/datanova.jpg` | `9caf16d9c871` | `1ffadb7be502` | 143161 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/keel.jpg` | `420fd65f5fb3` | `cb66cd8ba106` | 107565 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/ombra.jpg` | `40f8a2ac2731` | `de73c1af2134` | 133597 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/quietpages.jpg` | `88ecfa6ae96b` | `b4cdd03f5a02` | 268744 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/scholars.jpg` | `3edec77ba401` | `13e7b03191a3` | 139077 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/screwfast.jpg` | `b8100059bf61` | `8f0e66b0974a` | 147132 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/starlight.jpg` | `b0f3838fa4b2` | `1939762ed405` | 191316 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/template-pool/tailcast.jpg` | `1e9caf9097c2` | `92d9caa454ac` | 95251 | excluded | — | Template-pool screenshot of a third-party site template: not applicable |
| `build-polished-visual-frontends/references/tool-install.md` | `1efe5eb33d24` | `e0c172e211f1` | 4180 | excluded | — | Worker tool installation: the worker sees installed capability only (pack 04 §5) |
| `design-editorial-and-presentations/SKILL.md` | `b6edaae4f6b4` | `4a4be10915be` | 9227 | adapted | `sophia-editorial-html-v1/SKILL.md` | Clause map §3 |
| `design-editorial-and-presentations/references/patterns.md` | `bb65eed93175` | `e9fe2ec4e290` | 11014 | adapted | `editorial/patterns` | §5 paginated, §6 presentation and §9 accessible PDF deferred |
| `design-editorial-and-presentations/references/tool-profiles.md` | `9cd5a1bf2004` | `7564993f3dea` | 17779 | deferred | — | Profiles of InDesign, Affinity, Scribus, PowerPoint, Keynote, Slidev, Astro, Quarto, Paged.js, Vivliostyle, Typst and Acrobat: none is available; the one qualified tool is Sophia's static HTML path (E3.2) |
| `review-against-ai-patterns/SKILL.md` | `cf27ed13b88c` | `789fa7320722` | 3213 | adapted | `sophia-visual-critique-v1/SKILL.md` | Clause map §5 |
| `review-against-ai-patterns/agents/openai.yaml` | `5ef6b19e3462` | `e03646ae89c8` | 383 | excluded | — | Raven host agent display metadata; Sophia composes presets itself |
| `review-against-ai-patterns/references/anti-slop-gallery/page-1.jpg` | `5369b41a9d34` | `b7773bdedb9e` | 218437 | preserved | `critique/gallery/page-01` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-10.jpg` | `1478b83d1d08` | `b61d90dee449` | 189322 | preserved | `critique/gallery/page-10` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-11.jpg` | `e179046ab21d` | `aa7f7c7cbabb` | 233171 | preserved | `critique/gallery/page-11` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-12.jpg` | `a6e0fe124d8d` | `1dbe9f147c08` | 176686 | preserved | `critique/gallery/page-12` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-13.jpg` | `3f5789c6991f` | `c5db820505d0` | 147468 | preserved | `critique/gallery/page-13` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-14.jpg` | `def36a07b4ca` | `33f7e79f4e90` | 205292 | preserved | `critique/gallery/page-14` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-2.jpg` | `b4bf19602115` | `f5d8dcd63508` | 234326 | preserved | `critique/gallery/page-02` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-3.jpg` | `a7b91da1e072` | `cd55bf5deda2` | 259130 | preserved | `critique/gallery/page-03` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-4.jpg` | `48f658259cd3` | `534ca31292ba` | 172373 | preserved | `critique/gallery/page-04` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-5.jpg` | `24cf73a1e13f` | `05250d4ca258` | 264021 | preserved | `critique/gallery/page-05` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-6.jpg` | `ea028ffacf09` | `82e96ab2e29a` | 235415 | preserved | `critique/gallery/page-06` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-7.jpg` | `dadb967a1554` | `e195d0c342ad` | 310059 | preserved | `critique/gallery/page-07` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-8.jpg` | `d781a7c49126` | `02b2fda54470` | 229547 | preserved | `critique/gallery/page-08` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-gallery/page-9.jpg` | `38fb238464f0` | `0ca7688212bd` | 221162 | preserved | `critique/gallery/page-09` | Bundled byte for byte; groups in `critique/gallery-index` |
| `review-against-ai-patterns/references/anti-slop-review.md` | `536d96aedfd1` | `04d7aec742fa` | 21446 | adapted | `critique/anti-slop-review` | Clause map §6 |
| `review-against-ai-patterns/references/ledger-format.md` | `0233bfc219c2` | `02e733f5da1e` | 1321 | adapted | `critique/ledger-format` | The ledger is kept in the work record |
| `visual-artifact-design/SKILL.md` | `5f6962e4cf2e` | `d73c09819761` | 17534 | adapted | `sophia-visual-foundation-v1/SKILL.md` | Clause map §2 |
| `visual-artifact-design/examples/chart-page.md` | `4896919eba6c` | `f7f4e2bf4e20` | 8766 | deferred | — | Data graphics are deferred (no SVG or canvas; no data-integrity check for graphics yet). Contains executable code: not run |
| `visual-artifact-design/examples/computed-geometry.md` | `f3e36f16f562` | `cbf34d5d3d9a` | 11645 | excluded | — | Parameterized geometry generated by a Python script: an executable example, never run; not a research-report need |
| `visual-artifact-design/examples/design-brief.md` | `aa4bbaf725ce` | `84bb7792a381` | 13879 | excluded | — | An interactive JavaScript page example: this profile has no scripts or controls. Its method (request → contract → checks) is preserved in F1.2 and W1.1 |
| `visual-artifact-design/examples/svg-scene.md` | `0ddecd75284a` | `58dd8ab779b1` | 9509 | excluded | — | An animated SVG illustration scene: no SVG, motion or illustration in this profile |
| `visual-artifact-design/references/assets-and-imagegen.md` | `9df680ada590` | `c225e2619b02` | 18515 | deferred | — | Image generation and asset production are not capabilities of this profile (F3.4, F4.2) |
| `visual-artifact-design/references/data-visualization.md` | `9e93f55ce8d4` | `6d762587a15f` | 2037 | adapted | `foundation/data-tables` | Tables and numbers kept; charts, maps and series controls deferred |
| `visual-artifact-design/references/evidence-governance.md` | `2cda4ea74159` | `c006272ac50d` | 7616 | excluded | — | Raven runner promotion, canonical and release records; Sophia's service owns records and publication (F6.4) |
| `visual-artifact-design/references/fixed-media.md` | `4eebc5054fa8` | `33b7b822121c` | 2456 | deferred | — | Pages, slides, posters and raster exports are not in this profile (E1.2) |
| `visual-artifact-design/references/html-and-canvas.md` | `6a0f09958b47` | `71b982b4c628` | 2730 | adapted | `foundation/html-static` | Static, script-free subset; canvas, animation and preview actions excluded |
| `visual-artifact-design/references/svg-and-vector.md` | `16ebaad9a50c` | `7196c2dd13d2` | 7569 | deferred | — | No SVG in this profile; its existing-marks rule is reflected in F1.4 |

## 2. RV-01 `visual-artifact-design/SKILL.md` → `sophia-visual-foundation-v1`

| Donor lines / heading | Imperative | Status | Native | Reason / evidence |
|---|---|---|---|---|
| 1–5 front matter | applies to create, edit, diagnose or verify any human-visible artifact; owns medium, domain, stages, capability, consumer pixels, earliest failed step | adapted | F0.1 | Applied to the admitted HTML deliverable only |
| 7–9 | only for artifacts a person will see; no visual flow for non-visual tasks | adapted | F0.1 | The preset exists only for admitted design tasks |
| 10–15 | ownership split: domain skill, web companion, runner records facts and never judges aesthetics; documents ≠ runtime facts | adapted | F0.2–F0.3 | Runner → Sophia's service, which also enforces scope and evidence (pack 04 §5 "application authority") |
| 18–20 | Create / Edit / Diagnose-Audit; Audit read-only unless repair authorized | preserved | F1.1 | Mode is admitted by the service; Audit cannot write source (tool policy) |
| 20–32 | write the minimal contract (7 fields) into Task State or equivalent | adapted | F1.2 | Task State → `design_record_work` kind `contract` (RB-01) |
| 33–34 | HTML/SVG/etc. are forms, not domains; primary-domain test | preserved | F1.3 | Deterministic editorial + web selection (RB-03) |
| 36–44 | identity inventory from official sources incl. web, GitHub avatars; download via exec | adapted | F1.4 | Only admitted identity assets; no web fetch or exec |
| 46–49 | found → must use it, three rungs, no redraw | preserved | F1.4 | Use as is; no redraw (RB-02) |
| 50–51 | not found → must design a new mark | excluded | F1.4 | Pack 04 §5 "No mandatory new logo"; identity work only when requested, not offered |
| 52–56 | subject vs publisher identity layers; extraction limits; new shapes via brand skill + image_generate | adapted / deferred | F1.4 | Layers kept; brand skill and generation not available |
| 58–64 | lightweight states; merge or skip, no paperwork | preserved | F2.1 | |
| 66–71 | state chain incl. MASTER_ASSET_LOCKED | adapted | F2.1, F2.4 | MASTER_ASSET_LOCKED recorded not applicable |
| 73 | CONTRACT | preserved | F2.2 | |
| 74–77 | REFERENCE_LOCKED with source frame, relations, transfer axes, targets, final check | preserved | F2.3 | Reference ids are bundle or admitted references (RB-04) |
| 78–81 | VISUAL_THESIS_LOCKED; N/A recorded for non-web/work surfaces | adapted | F2.4 | Editorial direction for research; content-first valid (pack 04 §5) |
| 82–85 | MASTER_ASSET_LOCKED for content/marketing web | excluded | F2.4 | No imagery in this profile |
| 86–88 | REPRESENTATIVE_FRAME with real content, no placeholders | preserved | F2.5 | RB-06 |
| 89–91 | DIRECTION_ACCEPTED / PROVISIONAL + SELF_REVIEW_ONLY | preserved | F2.6–F2.7 | RB-07 |
| 92 | FUNCTIONAL_BUILD after direction | preserved | F2.8 | |
| 93–96 | SURFACES_CLOSED: every section, every affordance | preserved | F2.9 | Static affordances = links and disclosures |
| 97–98 | FINAL_VERIFIED after last change | preserved | F2.10 | RB-10 |
| 99 | DELIVERED; publication not derived from stage | adapted | F2.11 | Service and people decide publication |
| 101–102 | small Edit from earliest stage; Audit = reproduce → evidence → cause → impact | preserved | F2.12 | RB-13 |
| 104–108 | states are working protocol, not runner approval; never misreport | preserved | F2.13 | |
| 110–122 | evidence authority order | preserved | F3.1 | |
| 124–126 | no claims before seeing; 3–6 invariants; lowest-assumption direction; no default skin | preserved | F3.2 | |
| 128–130 | gallery check, ANTI-SLOP-CHECK.md in working dir | adapted | F3.3 | Ledger in the work record (RB-05) |
| 131–134 | texture gate: material/light imagery must be generated | deferred | F3.4 | No image generation; CSS imitation still forbidden |
| 135–138 | web master-visual gate | excluded | F3.5 | Content/marketing web only |
| 140–145 | strong signals need a stable job; delete if no loss | preserved | F3.6 | |
| 146–148 | area by importance; sources and caveats adjacent and readable; no banners | preserved | F3.7 | |
| 149–151 | backgrounds open page families; CSS limits; no image + translucent panel | adapted | F3.8 | No imagery admitted |
| 153–156 | capabilities before tools; installed ≠ used | adapted | F4.1 | The capability list is the preset's tools |
| 158–167 | image/icon slot routes; no manual SVG or decorative CSS; image_generate output dir | adapted / deferred | F4.2 | No images, icons, SVG or generation in this profile |
| 168–172 | asset semantic jobs, families, vectorization from generated masters | deferred | F4.2 | |
| 174–179 | read implementation-format references only when they add a contract | adapted | F4.4 | html-static and data-tables apply |
| 181–182 | one authoritative owner per fact; derivatives; external HTML active content isolated | preserved | F4.3 | Parser validation and confined render (pack 05 §5) |
| 184–195 | failure returns: RETURN_TO_CONTRACT / REFERENCE / FRAME / IMPLEMENTATION / FINAL_VERIFIED; keep valid masters | preserved | F5.1–F5.2 | |
| 197–201 | engineering ≠ visual; whole thumbnail ≠ sections; readable-scale checks | preserved | F6.1 | RB-09 |
| 203–206 | every affordance honoured on the main path and every instance | adapted | F6.2 | Links and anchors |
| 208–210 | independent review covers what it checked; SELF_REVIEW_ONLY | preserved | F6.3 | RB-11 |
| 212–215 | evidence governance only for promotion/release | excluded | F6.4 | Runner governance; Sophia service owns records |
| 217–218 | deliver: master, derivatives, tools, consumer state, assurance, limits; no "pro" claims | preserved | F6.5 | RB-14 |
| 221–234 | final checklist | adapted | F7.1–F7.8 | Imagery and content-web lines adapted |

## 3. RV-02 `design-editorial-and-presentations/SKILL.md` → `sophia-editorial-html-v1`

| Donor lines / heading | Imperative | Status | Native | Reason / evidence |
|---|---|---|---|---|
| 8–11 core goal | readable, citable publication; quality from order, type, image jobs, rhythm, medium | preserved | E0.1 | |
| 13–17 | work order reader → medium → spine → system → pages → sequence → consumers | preserved | E0.2 | |
| 19–22 | ownership: editorial structure here; web skill for browser implementation | preserved | E0.3 | |
| 24–34 | choose the main contract by use: five contracts | adapted | E1.1 | One contract admitted: continuous long-form |
| 36–37 | mixed delivery: separate layouts per consumer | deferred | E1.2 | Other consumers not offered |
| 39–40 | route away columns, search, CMS, exploration, tools, single visuals | preserved | E1.3 | |
| 42–56 | editorial card | adapted | E2.1 | Recorded with the contract |
| 58–60 | governance is internal evidence; show readers only what they need; no banners, card walls, grey micro-text | preserved | E2.2 | |
| 61–64 | visual system first, then tool; template ≠ design | preserved | E3.1 | |
| 66–75 | tool table (InDesign … Slidev) | adapted | E3.2 | Only Sophia's static HTML path is qualified |
| 77–79 | inspect real specimens, minimal capability proof; no claim of unrun tools | adapted | E3.2 | |
| 81–82 | adopt the tool's native structure | adapted | E3.3 | Semantic HTML structure and anchors |
| 83–92 | content spines (5) | preserved | E4.1 | |
| 93–95 | one job per unit; headings retell the argument; swap test | preserved | E4.2 | RB-08 |
| (new) | frozen research blocks, citations, amendments | adapted | E4.3 | Pack 05 §3; enforced by `@sophia/design` (B-06) |
| 97–106 | representative page types (5) | adapted | E5.1 | Item 5 → the 390 px width |
| 107–108 | inspect final pixels, then extend by styles | preserved | E5.2 | `design_render`, `design_inspect_render` |
| 110–124 | editorial visual quality (10 bullets) | preserved / adapted / deferred | E6.1–E6.9 | Presentation bullet deferred (E6.8); background imagery N/A (E6.9) |
| 126–130 | true content, assets and missing states | preserved | E7.1 | |
| 131–133 | automated report: one data source; derivatives never masters | preserved | E7.2 | |
| 135–142 | completion checks | adapted | E8.1–E8.6 | Print/projection consumers deferred |
| 144–145 | read patterns / tool-profiles | adapted / deferred | footer | patterns adapted; tool profiles not loaded |

## 4. RV-03 `build-polished-visual-frontends/SKILL.md` → `sophia-web-finish-v1`

| Donor lines / heading | Imperative | Status | Native | Reason / evidence |
|---|---|---|---|---|
| 1–4 front matter | high-finish browser frontends of every kind | adapted | header | Constrained to static research HTML |
| 8–11 core goal | task first; mature tools for solved problems | preserved | W0.1 | |
| 13–17 | three principles | adapted | W0.2 | Standard capability = semantic HTML elements |
| 19–22 | ownership and evidence order | preserved | W0.3 | |
| 25–36 | J1–J8 | preserved (J5 excluded) | W0.4 | J5 is the master-visual rule for content/marketing web |
| 38–54 | decision card | adapted | W1.1 | Fields bound to research; expression = editorial |
| 55–61 | real references, domain convention first, 3–6 observed features | adapted | W1.2 | Viewable references and bundled precedents |
| 62–68 | expression strength quiet / editorial / expressive | adapted | W1.1 | Editorial |
| 70–96 | content/marketing reference routing (identity/layout routes, pool, benchmarks, reference contract) | excluded / adapted | W1.3–W1.4 | Routing excluded; the reference contract kept for admitted references |
| 98–105 | web toolchain prebuild gate | excluded | W1.3 | No build |
| 107–179 | master visual gate, VISUAL-THESIS, MASTER-VISUAL-CONTRACT, page families, image_generate | excluded | W1.3 | Content/marketing imagery |
| 181–188 | read precedents then gallery, fixed order | preserved | W2.1 | `web/precedents/page-01/04/06` bundled (RB-04) |
| 189–206 | DESIGN-BRIEF.md and ANTI-SLOP-CHECK.md as working evidence; detail contract with manifest and behaviour map | adapted | W2.2–W2.3 | Work record entries |
| 212–213 | reuse a qualified existing system | adapted | W2.4 | No component system |
| 215–219 | React product UI: Appica first, candidates | excluded | W2.4 | No React or components |
| 221–224 | visual system vs domain engine are two choices | excluded | W2.4 | No engine |
| 226–233 | extract a style contract (type, controls, spacing, radii, surfaces, colour, icons, focus) | adapted | W2.4 | Research style contract |
| 235–241 | the main system governs every surface; map engine styling | adapted | W2.4 | One visual language |
| 243–259 | explicit type selection; npm fonts; CJK table | adapted | W2.5 | No remote or bundled fonts; local stacks per role; EN/IT/ES |
| 261–283 | mature tools first; online acquisition; no reinventing; tool list in brief | adapted / excluded | W3.1–W3.2 | Semantic HTML; no acquisition or installation |
| 284–320 | how to choose tools (7 steps, decision card) | excluded | W3.2 | No tools to choose |
| 321–325 | internal evidence stays off the page; product language only | preserved | W3.3 | |
| 327–342 | worked example (offline photo culling) | excluded | — | Product tool example |
| 344–352 | template pool | excluded | W3.2 | |
| 354–383 | visual asset routing before the frame | deferred | W3.4 | No assets |
| 385–417 | image source ladder | adapted | W3.4 | No images |
| 418–424 | page shows only product language; no production-process words | preserved | W3.3 | |
| 425–439 | bitmap clarity at 2× | deferred | — | No bitmaps |
| 441–451 | representative frame; build and preview from the delivery entry before expanding | adapted | W4.1 | `design_render` on the exact saved revision |
| 452–462 | pixel review order | preserved | W4.2 | |
| 465–469 | J1/J3 protagonist moment; from the task's world | preserved | W4.3 | |
| 470–476 | SURFACE-MANIFEST; built → visually verified | preserved | W5.1 | |
| 477–481 | reuse vs per-section jobs | preserved | W5.2 | |
| 482–486 | area by task; sources next to claims | preserved | W5.3 | |
| 488–491 | every control real; affordance audit | adapted | W5.4 | Links and anchors |
| 492–497 | COMPONENT-BEHAVIOR-MAP traversal; crawl internal links | adapted | W5.4, W2.3 | Behaviour map of links; the render measures anchors |
| 498–502 | target environments are not scaling | preserved | W5.5 | |
| 506–514 | stop signs; 14/16 px; J2 | preserved | W6.1–W6.2 | |
| 516–519 | strong signals need jobs | preserved | W6.3 | |
| 521–533 | risk checks; first-viewer description | preserved | W7.1 | |
| 534–538 | positive detail gate | adapted | W7.2 | |
| 539–550 | five rework tests | adapted | W7.3 | Template distance (vs the html-report-v2 seed too), signal duty, attention kept; background dependency and family continuity excluded |
| 552–592 | completion conditions | adapted | W8.1–W8.12 | Imagery and content-web conditions excluded |
| 593–594 | read decision traces | adapted | footer | `web/decision-traces` |

## 5. RV-04 `review-against-ai-patterns/SKILL.md` → `sophia-visual-critique-v1`

| Donor lines / heading | Imperative | Status | Native | Reason / evidence |
|---|---|---|---|---|
| 1–5 front matter | always-on for visual artifacts: gallery before direction, stop on hit, global scan | preserved | C0.1 | Loaded explicitly for both roles (not by discovery) |
| 9–11 | central home of gallery, ledger, review | preserved | C0.2 | |
| 13–17 | risk route: index page, 2–4 relevant pages, keep reading to cover, no padding | preserved | C1.1 | Group index in `critique/gallery-index`; research risk groups named (RB-05) |
| 18–21 | ledger file ANTI-SLOP-CHECK.md in the session working dir | adapted | C1.2 | Work record kind `risk_ledger` |
| 22–25 | ledger content; global scan; missing a group is unfinished | preserved | C1.3 | |
| 26–31 | stop and restructure on any group | preserved | C2.1 | |
| 33–35 | gates and protocols in anti-slop-review | preserved | C3.1 | |
| 37–39 | model decides reviewer calls within limits; runner does not judge | adapted | C3.2 | The service admits the reviewer within admitted ceilings (pack 03 G3) |
| 39–40 | reviewer input: request, refs, semantics, pixels; no rationale or self-rating | preserved | C3.3 | Enforced by the service's review context (B-10) |
| 40–41 | no reviewer → isolated self-check, SELF_REVIEW_ONLY | preserved | C3.4 | |
| (new) | reviewer's own procedure | adapted | C4.1–C4.3 | From the pack's `runtime/VISUAL_REVIEWER_SYSTEM.v1.md` and anti-slop-review §6–§7 |

## 6. RV-04 `references/anti-slop-review.md` → `critique/anti-slop-review`

| Donor lines / heading | Imperative | Status | Native | Reason / evidence |
|---|---|---|---|---|
| 1–3 | risk-triggered gates, not three rounds; pixels only; SELF_REVIEW_ONLY | preserved | R0.1 | |
| 15–25 evidence groups | evidence by artifact class | adapted | R1.1 | Editorial groups kept; print, product, data-graphic, motion, canvas deferred or excluded |
| 27 | label every capture; non-empty direction evidence; no test names; regenerate after last edit | preserved | R1.2 | The render records revision, width and time |
| 29–31 | two scales for long pages | preserved | R1.3 | RB-09 |
| 33 | whole first, then crops | preserved | R1.4 | |
| 35–37 | gates by mode; Audit read-only | preserved | §2 intro | |
| 39–51 direction gate | six checks | adapted | R2.1–R2.2 | Component-system check excluded |
| 53–64 system gate | consistency checks | adapted | R2.3 | Component-library checks excluded |
| 66–75 final gate | refinement checks | adapted | R2.4 | Motion excluded |
| 77–100 positive completeness | thesis, master visual, page families, assets, typography, manifest, behaviour map; replacement and template-distance tests | adapted | R2.5–R2.6 | Master visual, families and image replacement excluded; template distance kept |
| 104–111 composition | six observations | preserved | R3.1–R3.6 | |
| 113–120 text | six observations incl. 16/14/12 px | preserved | R3.7–R3.12 | |
| 122–129 colour and material | six observations | preserved | R3.13–R3.17 | Greyscale simulation merged into R3.17 |
| 131–140 images, graphics, data | image, map and technical-graphic checks | adapted | R3.18 | Tables and data only; imagery excluded |
| 142–155 UI, interaction, states | component and control checks | adapted | R3.19–R3.20 | Links and widths; controls excluded |
| 157–175 symptoms table | twelve symptoms | adapted | R4.1–R4.10 | Product, icon, tech-gradient and image rows excluded (R4.9) |
| 180–193 high-impact protocol | six steps; record format | preserved | R5.1–R5.2 | |
| 195–212 blockers | fifteen blockers | adapted | R5.3 | Master-visual, component-system and image blockers excluded; content-fidelity blocker added (pack 05 §3) |
| 214–228 independent review input | call by model within caps; inputs exclude rationale; pass/revise/blocked; no forged pass | adapted | R6.1–R6.4 | Service-admitted reviewer; ceilings two repairs and three rounds (pack 03 G3) |
| 230–252 final pass conditions | hard and judgement conditions; disagreement kept; only independent PASS | adapted | R7.1–R7.3 | |

## 7. Adapted text references (section level)

| Donor file | Sections | Status | Native | Reason |
|---|---|---|---|---|
| file `review-against-ai-patterns/references/ledger-format.md` | entry format, rules, global scan, example | adapted | L0.1–L2.1 | Work record instead of a file; example rewritten for a research page |
| file `design-editorial-and-presentations/references/patterns.md` | §1 card, §2 authority, §3 spines, §4 flatplan, §7 long-form, §8 automation, §10 judgement, §11 proof, §12 symptoms | adapted | P1.1–P12.1 | Kept for continuous long-form |
| same | §5 paginated, §6 presentation, §9 accessible PDF | deferred | P5.0, P6.0, P9.0 | Other contracts |
| file `build-polished-visual-frontends/references/aesthetic-routing.md` | §1–§11 | adapted | A1.1–A11.1 | External browsing replaced by admitted references and bundled precedents; component rules excluded |
| file `build-polished-visual-frontends/references/decision-traces.md` | §2 editorial, §3 data story, §5 rules | adapted | D2.1–D5.1 | |
| same | §1 product tool, §4 explainer | excluded | — | Not this artifact type |
| file `visual-artifact-design/references/html-and-canvas.md` | structure, interaction, runtime, validation | adapted | H1.1–H4.1 | Static profile enforced by parser; canvas and actions excluded |
| file `visual-artifact-design/references/data-visualization.md` | integrity, encoding, validation | adapted | T1.1–T3.1 | Tables only; graphics deferred |
| file `design-precedents/page-1.jpg`, `page-4.jpg`, `page-6.jpg` | images | preserved | `web/precedents-index` (Q0.1–Q0.3) | English guide to the images; the images themselves are what the model reads |
| file `anti-slop-gallery/page-1.jpg` … `page-14.jpg` | images | preserved | `critique/gallery-index` (I0.1) | English guide to the groups and pages |

## 8. Required behaviour (pack 04 §4)

| Id | Donor behaviour | Native reproduction | Evidence (filled as built) |
|---|---|---|---|
| RB-01 | Create / Edit / Audit; minimal contract | Admitted mode; `design_record_work` kind `contract`; Audit refused any source write | `docs/progress/SDD-01.md` §3 |
| RB-02 | Inspect existing identity first | F1.4; admitted assets only | not applicable at this profile (no identity assets admitted); stated |
| RB-03 | One primary domain + companion, no selector call | F1.3; both roles load the same four skills explicitly | registry `skills`; bridge prompt sections |
| RB-04 | Actual references | `design_read_reference` returns the image bytes; access recorded | progress §3 |
| RB-05 | Risk gallery and ledger | C1.1–C1.3; work record kind `risk_ledger` | progress §3 |
| RB-06 | Representative frame | F2.5, E5.1, W4.1; captures at 390/1280 | progress §3 |
| RB-07 | Accepted vs provisional | Review verdict, `self_review_only`, labels in Studio | progress §3 |
| RB-08 | Design follows the reader's task | E4.1–E4.3; reviewer checks | L2 (paid) |
| RB-09 | Whole plus readable sections | Capture plan: overview plus section crops; coverage required for review | progress §3 |
| RB-10 | Review after the final change | Source → render → candidate → review hash chain; stale results refused | progress §3 |
| RB-11 | Independent review without self-rating | Separate session; review context omits author text | progress §3 |
| RB-12 | Risk-driven review, bounded repair | Two repairs, three rounds | progress §3 |
| RB-13 | Narrow edit resumes earliest phase | Scoped patch with protected sections | progress §3 |
| RB-14 | Source, output and evidence handoff | Source revision, compiled HTML rendition, captures, review | progress §3 |

## 9. Executable donor code (pack 04 §6)

| Donor path | Disposition |
|---|---|
| `selector.py` | Reference only, not read into this repository: replaced by the fixed editorial + web selection (F1.3) |
| `task_state/` | Reference only: Sophia's durable design records are the work state (binding map §5) |
| `tools/`, `plugin/` | Reference only: the native tools are `design_*` and `review_*` in the bridge; no Raven hook is imported |
| `rendering/` (`service.py`, `pipeline.py`, `models.py`, `result.py`, `bundle.py`, `browser.py`, `browser_runtime.py`, `preview.py`, `paths.py`) | Reference only: structured render requests and results, staged validation and capture lineage are reproduced in the confined kernel's capture mode (binding map §7); no Python is copied |
| `rendering/office.py`, `pdf.py`, spreadsheet and motion modules | Excluded: not in the first HTML implementation |
| `agents/raven-design/config.json`, `run.py`, `plugins-dist/design-engine/pyproject.toml` | Reference only: their model, 400-iteration ceiling, no-sandbox defaults, memory and launch are not inherited |
