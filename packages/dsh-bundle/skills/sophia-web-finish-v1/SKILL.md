---
id: sophia-web-finish-v1
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/build-polished-visual-frontends/SKILL.md (blob 14ff3aeb7b2d888b561e4cb2794c307ec58e7283)
status: Sophia-authored English adaptation, constrained to static research HTML; the clause map, with every deferred and excluded web/app clause, is docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Web finish for static research HTML

## Core goal

**[W0.1]** Let the reader do their task directly, with the visuals and the structure coming from one clear set of decisions. Spend your judgement on what is specific to this report: its task, its composition, its reading experience.

**[W0.2]** Three principles:

1. **The task decides the form.** HTML does not imply an app shell, a dashboard, a landing page, a card grid or 16:9.
2. **One visual language.** Headings, body, tables, citations, the sources list and navigation look like one publication.
3. **Standard capability belongs to standard means.** Semantic HTML elements do what they already do (headings, lists, tables, `details`, links); you design the order, composition and connection.

**[W0.3]** The editorial procedure decides content, semantics and domain gates; the visual foundation decides the shared stages and evidence; this procedure decides the browser direction, the implementation boundary and the final pixels. The person's current request and accepted references come first, then existing brand, platform and domain constraints. A topic association never licenses an arbitrary colour or decoration.

**[W0.4]** What good means (referred to by code below):

- **J1 Protagonist and nerve:** each surface has a protagonist moment, and at least one decision beyond the safe default that you can state in one sentence.
- **J2 Deletion test:** an element whose removal does not make the page worse is removed.
- **J3 One sentence:** the whole artifact can be described in one sentence ("a page that…"); if not, there is no direction.
- **J4 Concrete over rhetoric:** every statement is checkable; facts, real numbers and real objects replace adjectives.
- **J5 Master visual first:** applies to content and marketing websites: **excluded** here (no imagery is admitted).
- **J6 Details form a system:** type, punctuation, borders, states and target-width behaviour realize one direction; "no anti-pattern found" is not the same as finished.
- **J7 Every section finished:** every visible section has a clear job, task-specific content relationships and a finished state; a refined opening above default leftovers is not finished.
- **J8 Honest affordances:** anything that looks clickable, selectable, expandable or switchable does so; static content borrows no button, selected, hover or card-link look.

## 1. Read the task before deciding what to draw

**[W1.1]** Before a new direction or a large change, add a short decision card to the contract:

```yaml
task: who completes which main thing in what situation
main_object: what the reader actually needs to see and read
natural_form: continuous long-form research article
domain_convention: what a real practitioner's research report looks like, and any reasoned deviation
references_and_preferences: references actually seen; what the person explicitly liked or rejected
expression: editorial (type, the job of each element, rhythm and narrative order carry the direction)
visual_system: the type roles, measure, spacing, colour roles and table treatment (the style contract below)
target_frames: the widths, densities and states that decide the direction
```

**[W1.2]** Real references come, in order, from what the person supplied, accepted earlier work of the same project, real production products and mature public systems; first answer the domain convention (what does a real deliverable of this kind look like), then style. Record three to six observable characteristics only after seeing the actual frame; brand impressions, descriptions and memory are not visual evidence. For more, read `web/aesthetic-routing`.

**[W1.3] Excluded:** the content and marketing website routing (`identity_route`, `layout_route`, the template pool, `observed_benchmark`), the build-toolchain probe gate and the master-visual gate. They govern sites with templates, builds and generated imagery; none applies to a static research article.

**[W1.4] Adapted:** when an admitted reference or an accepted earlier design is the main visual basis, record a reference contract in the work record: the reference id, three to six observable relationships (at least one about structure or reading order, one about hierarchy or density, one about the main object), the axes that may transfer, what must not, the target section, and the representative-frame and final-frame evidence. Names and adjectives are hypotheses, not executed references.

## 2. Direction, then one visual system

**[W2.1]** Before any direction decision, read in this fixed order, rule first and risk second:

1. **Precedents:** `web/precedents/page-01` (how to use precedents, and the type index), then the pages for this artifact type: `web/precedents/page-04` (data pages and reports) and `web/precedents/page-06` (long-form publications and articles). A precedent is a yardstick and vocabulary, not a template: learn what it faced, its key decision and how it transfers; never copy its surface features.
2. **Risk route:** the critique procedure's gallery index and the specimen pages your risks route to.

**[W2.2]** Keep two pieces of working evidence in the work record (`design_record_work`), each a short decision ledger, not a report, recording only decisions that change facts, pixels, behaviour or acceptance:

- **brief** (kind `contract` and `stage`): the decision card; any reference contract; direction candidates only when real uncertainty remains (then two or three mutually exclusive ones with their key trade-off; otherwise adopt the locked direction); the precedent decision you took and where it lands in each section; the **detail contract** below.
- **risk ledger** (kind `risk_ledger`): the critique procedure's format.

**[W2.3] Detail contract.** A *surface manifest*: every top-level section (`data-section`) with its job, main object, order and final evidence; and a *behaviour map*: every link class (citation to source, contents to section, source to external page) and every disclosure, with what it does and how it was checked. Repeated instances share visual evidence, but every target is checked.

**[W2.4] Adapted:** Raven chooses a React design system (Appica and others) for product interfaces. A research article uses no component library; the rule that survives is one visual language: a short **style contract** extracted from your own decisions and checked in the captures:

```text
type roles and weights / measure and line height / spacing steps / table treatment
rules and separation strategy / neutral and accent colour roles / citation and link marks / focus and target size
```

Every section, the contents, the tables, the citations and the sources list consume it. If you hide the body text and something still looks like a different publication, unify the system before adding local styles.

**[W2.5] Type selection. Adapted:** Raven installs fonts from npm. Here no font binary and no remote font may be used, so choose explicitly from locally available families with a fallback chain per role (for example a serif reading face such as Charter, Georgia or Iowan Old Style for body; a sans or the same family for headings; a monospace for code), name each role and its reason in the style contract, and check the faces actually rendered in the captures. A bare system-ui stack with no decision is not a selection. Character comes from contrast of weight and size with the right family, not from bolding a default. Check accented EN/IT/ES text, numbers and punctuation.

## 3. Mature means for mature capability

**[W3.1]** Before building anything, ask whether it already exists. Plain HTML gives headings, lists, tables with header cells, `details` and `summary`, links and anchors: use them as they are meant to be used. Do not rebuild any of them from `div`s.

**[W3.2] Excluded:** the tool selection procedure for components, charts, maps and state libraries, the template pool, online acquisition, `THIRD_PARTY_NOTICES` and tool installation: no external library, script or download exists in this profile, and none is to be planned.

**[W3.3] The page shows only product language.** Captions, labels and surrounding text answer only what the reader cares about. Process talk — "designed by", "AI-generated", "verified", "draft", "fixture", template names, source paths, how the page was made — never appears anywhere on the page. That belongs in the work record and the candidate's limitations. Limitations of the *research* that the package states are content, and stay next to the claims they limit.

**[W3.4] Image source discipline. Adapted:** no raster image, generated image, screenshot or SVG is admitted in this profile, so there is no image ladder to climb; a section without images still continues the publication's language and never falls back to a default layout.

## 4. The representative frame decides first

**[W4.1]** Before full expansion, build one representative non-empty frame with real content: the opening with the answer, the typical reading density, the densest part, the main exception. Render it right away with `design_render` and look at the captures with `design_inspect_render`. Do not expand other sections while the frame fails the build, the real pixels or J1/J3; source existing or a render opening is not this step.

**[W4.2]** Look at the actual pixels in this order:

```text
outline and allocation of space → visual centre and main object → reading order
→ type relationships and legibility → colour roles and contrast → system consistency → borders and details
```

If any of the first four fails, recompose; never cover it with shadows, radii, gradients, labels or explanatory text.

**[W4.3]** The frame passes J1 and J3: you can point at the protagonist moment — the most memorable object, composition or expression on the first surface — and describe the whole in one sentence. A frame without one is only free of errors. For research the protagonist comes from the answer and its evidence, never from the deliverable's own steps, categories or framework.

## 5. Finish section by section

**[W5.1]** After the direction holds, list every top-level section in the surface manifest and expand in the same task model. A section moves from built to visually verified only when its real content, main object, reading order, task-specific detail and target widths are in the render, inspected at readable scale, fixed and rendered again. A passing opening, a successful build, complete content or a uniform thumbnail never closes a lower section.

**[W5.2]** Careful finishing does not mean every section gets a different shape. Repeated content reuses the same styles; continuous narrative keeps its rhythm. But every section has the hierarchy, density, boundaries and transitions its own job needs.

**[W5.3]** Area, contrast and position follow the main task, the main object and the risk of misjudgement. Sources, truth boundaries and method limits sit next to the claim they constrain; unless the risk is the main task, they are not banners and are not stronger than what they qualify.

**[W5.4]** Every link and anchor works and gives the result its look promises; nothing static looks interactive. Check the behaviour map in the captures and by the render's link measurements: every in-page anchor resolves, every external link shows its real address target.

**[W5.5]** Target widths are not proportional scaling: keep the main object and the reading order at 390 px and at 1280 px, changing navigation and adjacency where needed, never the meaning. Do not add targets the contract does not promise.

## 6. Stop and restructure on these signs

**[W6.1]** When any gallery group takes shape in the page, stop and restructure as the critique procedure says, and record it.

**[W6.2]** Continuous secondary text is normally at least 14 CSS px and body text at least 16 CSS px; smaller text is only for a few high-contrast scale marks, units or timestamps, never for field names, status, errors, next steps or key judgements. Distinctiveness comes from the report's own content and relationships, not extra decoration. When it does not feel finished, run the J2 deletion test first: remove duplicate containers, labels, colours, shadows and explanatory text, then adjust relationships.

**[W6.3]** Strong signals (colour bars, top edges, rules beside headings, local `border-left`, corner brackets, pseudo-element rails, icon frames) stay only when they encode a selection, state, progress, scale, real grouping or a locked identity grammar. A CSS property name proves nothing.

## 7. Check by risk; no review loop

**[W7.1]** Visual judgement is not three fixed rounds and not endless re-review:

- **direction check**: for a new direction or a large change, look only at the representative frame, the reference characteristics and the system;
- **system check**: when several sections, widths or shared rules change materially;
- **final check**: after the last visible change, at the target widths. First write, as a first-time viewer, "what someone who has not read the task sees in three seconds" in the work record, then check the precedent anchors and J criteria one by one: the maker sees intent; the first-viewer description shows the effect;
- **audit**: read-only reproduction and location; no production round.

**[W7.2]** The positive detail gate is independent of the gallery. Close the surface manifest row by row: the rhythm and handover between sections in the whole page, then at readable scale each section's typography (accented letters, numbers, weights, line breaks, orphans), alignment and boundaries, density, table treatment and target-width order. Then the behaviour map.

**[W7.3]** Run these rework tests on the final pixels:

- **template distance test:** if replacing only the words and colours would give back the reference or the fixed editorial seed template, the identity has not entered type, structure and rhythm: return to the representative frame;
- **signal duty test:** temporarily remove colour bars, borders, corner marks, pseudo-elements and icon frames; if information, state, grouping and identity are unchanged, delete them;
- **attention ownership test:** the three strongest areas of the page are the answer, the main evidence or the key judgement, never a disclaimer, decoration or metadata.

**Excluded:** Raven's background-dependency and family-continuity tests (they test a master visual this profile does not have).

## 8. Completion conditions

- [ ] When a reference is the main basis, its contract is written and settled in the representative and final frames with real pixel evidence. [W8.1]
- [ ] The surface manifest covers every top-level section; no row is planned, merely built or missing evidence; every row has readable-scale evidence after the last visible change. [W8.2]
- [ ] The behaviour map covers every link class and disclosure; every target resolves; nothing looks interactive without behaving so. [W8.3]
- [ ] A reader can identify the answer, the main evidence and how to find sources within three seconds. [W8.4]
- [ ] The direction traces back to the person, a reference, the precedents or the domain, not a topic association. [W8.5]
- [ ] One visual language runs through every section, table, citation and the sources list. [W8.6]
- [ ] No image, icon or decorative drawing; no CSS imitating imagery; no production-process words on the page. [W8.7]
- [ ] Real density, the target widths and every promised link were checked; no section was skipped for being low on the page, repeated or minor. [W8.8]
- [ ] The final captures come from the exact saved source revision. [W8.9]
- [ ] The work record has its final state: precedent anchors marked held or changed with the reason; the first-viewer description; three things the chosen precedent still does better than this artifact; the manifest, the behaviour map and the rework tests settled on final pixels; no "to be filled" or "to check". [W8.10]
- [ ] The risk ledger is settled per the critique procedure. [W8.11]
- [ ] Only real checks, coverage, `SELF_REVIEW_ONLY` and known limitations are reported. [W8.12]

`web/decision-traces` shows, without templates, how a brief becomes an implementation (read it only to diagnose a choice).
