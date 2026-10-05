---
id: sophia-visual-foundation-v1
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/visual-artifact-design/SKILL.md (blob 5f6962e4cf2ed0899dd78a1f89aa2e103c8e7d16)
status: Sophia-authored English adaptation for the static research HTML profile; the clause map is docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Visual foundation

Apply this procedure because a person will read the deliverable you are making. It defines the shared working stages, what counts as evidence, how capability is chosen, and how the final consumer is checked. The editorial procedure owns the report's content order and page types; the web finish procedure owns the browser implementation and the final pixels; the critique procedure owns the anti-pattern risk route and review. Sophia's service records objective facts (sources, renders, captures, reviews, publication). It enforces scope and evidence; it never judges aesthetics, and it never infers an aesthetic approval from a stage name you record. A document is not a runtime fact, and a runtime state is not a design judgement. [F0.1–F0.3]

## 1. Establish the minimal contract

**[F1.1]** Work in the mode the task was admitted with: Create, Edit or Audit. Audit is read-only: it never writes source unless a separate repair has been admitted.

**[F1.2]** Before making anything, record the contract with `design_record_work` (kind `contract`). Write only what changes the result:

```yaml
primary_domain: the one primary domain procedure (here: editorial long-form research)
natural_medium: what the reader actually needs, and its editable master (here: a static HTML document; the source revision is the master)
consumer: who receives, reads or acts on it (the person who asked, and their team)
target_contexts: sizes, devices, states and reading conditions the task promises (here: 390 px and 1280 px, light)
required_outcomes: the content, behaviour and output the reader must get
non_goals: what is not promised, cannot be verified, or must not be faked
acceptance_checks: one observable check for each explicit requirement
```

**[F1.3]** HTML, tables, colour or layout are implementation forms; they never decide the primary domain. A domain is primary when the artifact loses its meaning without that domain's core objects, relations or task. For an admitted research report the primary domain is editorial long-form research and the web finish procedure is its companion: that selection is deterministic for this profile and needs no extra model call.

**[F1.4] Existing identity.** When the task admits identity material (a project logo, a brand page, an earlier accepted design), inspect it with `design_read_reference` before forming any direction, record what you actually observed, and use it as it is: no redrawing, no "improving", no substitute. **Adaptation:** Raven requires designing a new mark when none is found. Here a research report needs no logo, hero or mark; new identity work happens only when explicitly requested, and that capability is not offered by this profile. Do not fetch marks from the web, and do not leave an empty logo slot or a text placeholder pretending to be one. Subject and publisher identities stay separate when both are admitted.

## 2. Use lightweight working states, not a completion story

**[F2.1]** Create, and an Edit that establishes a new direction, may use these states. Merge or skip a state that genuinely does not apply; do not manufacture paperwork or extra iterations to walk through them.

```text
CONTRACT → REFERENCE_LOCKED → VISUAL_THESIS_LOCKED → REPRESENTATIVE_FRAME
→ DIRECTION_ACCEPTED | DIRECTION_PROVISIONAL → FUNCTIONAL_BUILD → SURFACES_CLOSED → FINAL_VERIFIED → DELIVERED
```

- **[F2.2] CONTRACT**: §1 holds; sources, assumptions and non-goals are kept apart.
- **[F2.3] REFERENCE_LOCKED**: admitted references, brand or platform constraints, or observed production benchmarks have become a few visible invariants; anything you inferred is still a candidate hypothesis. When the direction depends on a reference, record the actual source frame (reference id), the observable relationships, what may transfer, what must not, where it lands in the artifact and the final-frame check. A name or style label is not reference evidence.
- **[F2.4] VISUAL_THESIS_LOCKED**: for a research report this is the editorial direction: the reader's task, the content spine, type relationships and density, written so each top-level section's final pixels can be checked against it. Adjectives and topic associations do not lock it. A content-first report is a valid, deliberate direction. **Adaptation:** Raven's master-asset stage (MASTER_ASSET_LOCKED) for content and marketing web is not applicable: record it as not applicable rather than faking it.
- **[F2.5] REPRESENTATIVE_FRAME**: using the real supplied content, build the one target frame that decides success before laying out everything: the opening, a typical reading section, the densest section and the real exceptions (see the editorial procedure). Each reference relationship points at a place in that frame. No placeholder imagery, decorative CSS or invented assets fix the direction.
- **[F2.6] DIRECTION_ACCEPTED**: a person or the independent reviewer passed the current frame for an explicit scope. **[F2.7] DIRECTION_PROVISIONAL**: independent judgement is unavailable and the task may continue; it is marked `SELF_REVIEW_ONLY` and never claimed as an independent visual pass.
- **[F2.8] FUNCTIONAL_BUILD**: only after the direction holds, extend to every section, state and target width the contract requires.
- **[F2.9] SURFACES_CLOSED**: every visible section is complete with real content: its job, hierarchy, detail and each target width checked. Every real control, and every visual signal a reader could take for one, is either honoured and verified or turned into a plainly static expression. A representative frame, a successful build or a whole-page thumbnail never closes the sections.
- **[F2.10] FINAL_VERIFIED**: after the last visible change the source was rendered again and the current captures inspected; a reference-dependent task settles each observable relationship again, deviating only under a hard constraint with evidence.
- **[F2.11] DELIVERED**: the candidate is submitted with its master, derived output and limitations. Publication and acceptance are never derived from this state: the service and people decide them.

**[F2.12]** A small Edit enters at the earliest affected state. Audit runs only "reproduce → evidence → cause → impact"; it builds no production stages and never edits source to get better-looking evidence.

**[F2.13]** These states are your working protocol, not an approval flow. Never report a reference check, review, render or verification that did not happen. A file existing, a build succeeding, a render opening or an author statement does not replace the fact it names.

## 3. Visual direction accepts only authorized evidence

**[F3.1]** Resolve conflicts in this order: the person's current request > references the person accepted > brand, platform, data or other authoritative constraints (including the frozen research content) > the primary domain procedure > the web finish procedure > your own hypothesis.

**[F3.2]** Never claim what a reference looks like from its name, a brand impression, a genre or memory before you have seen it. Record three to six invariants that the final frame can verify; do not write a long design story that licenses arbitrary colour, decoration or exceptions. Without a viewable reference, propose the lowest-assumption direction derived from the task, content, reader and hard constraints, and disclose the evidence gap. "Restrained neutral" is not a default skin you may reuse across tasks.

**[F3.3] Gallery check before any direction (mandatory).** Follow the critique procedure: read the anti-pattern gallery index and the specimen pages your actual risks route to, and keep the risk ledger in your work record (`design_record_work`, kind `risk_ledger`). **Adaptation:** Raven keeps it as `ANTI-SLOP-CHECK.md` in the working directory; here the work record is the durable equivalent.

**[F3.4] Texture gate. Adaptation:** imagery whose quality depends on material and light (metal, glass, volumetric light, depth of field, rendering) needs real image generation in Raven. Image generation is not a capability of this profile, and a research report does not need such imagery. Never simulate it with CSS gradients, glowing arcs or abstract geometry (gallery group D).

**[F3.5] Web master-visual gate.** Applies to content and marketing websites only: **excluded** for research HTML.

### Visual signals, weight and background

**[F3.6]** Colour bars, top or side borders, rules beside headings, partial borders, corner brackets, pseudo-element rails and icon frames are strong signals. Keep one only when it encodes a stable selection, state, progress, scale, real grouping, or a locked identity grammar repeated across the artifact. "Emphasis", "layering" and "refinement" are not jobs; a one-off `border-left` does not prove its own meaning by being called a guardrail. If removing it changes no understanding, operation or identity, remove it.

**[F3.7]** Give area, contrast and position according to the reader's main task and semantic importance, not according to "the request said it must appear". Sources, limits, provenance and caveats sit next to the claim they affect and stay readable. Unless the risk itself is the main task, do not promote them into full-width banners, and do not repeat them so they compete in several places.

**[F3.8]** A large background builds an opening; later sections continue the identity through type, structure and rhythm without repeating it. CSS does layout, typography, necessary separation and real state feedback. It does not invent decorative assets from gradients, borders or pseudo-elements, and the page must not degrade into "background image plus translucent text panel".

## 4. Choose real capability

**[F4.1]** List capabilities before choosing tools. The capabilities you have are the design tools this preset gives you: `design_read_context`, `design_read_reference`, `design_record_work`, `design_write_source`, `design_patch_source`, `design_render`, `design_inspect_render`, `design_submit_candidate`, `design_report_blocker`. A name in an instruction does not make a capability real; when you need one you do not have, record the exact missing requirement instead of simulating it.

**[F4.2] Image and graphic roles. Adaptation:** Raven routes every image slot to `truth_asset`, `standard_symbol`, `generated_visual` or `exact_graphic`. This profile admits no raster assets, no image generation, no icon family, no SVG and no canvas: a research report's evidence is its text, its tables and its citations. So: no images, no icons, no decorative drawing. Data that needs comparison goes in a real table built from the frozen content. Exact data graphics are deferred until a data-integrity check exists for them. Never draw a fake chart, diagram or illustration in CSS.

**[F4.3]** Each fact has one authoritative owner. The source revision you saved is the master; the compiled HTML, the captures and the measurements are derived from it. Never edit a derivative to hide a problem in the master. Any HTML is treated as active content: Sophia validates it with a parser and renders it in an isolated, network-denied browser with scripts disabled.

**[F4.4]** Read the relevant reference only when it adds to the consumer contract: `foundation/html-static` (structure, layout and the static validation matrix) and `foundation/data-tables` (tables and numbers) apply to this profile.

## 5. A failure returns to its earliest failed step

**[F5.1]** Use only these directions; never route around a failure by adding features, documentation or decoration:

- request, reader, medium or domain wrong → `RETURN_TO_CONTRACT`
- reference not visible, evidence does not support the direction → `RETURN_TO_REFERENCE`
- composition, hierarchy, type, colour, main object or system language fails → `RETURN_TO_FRAME`
- markup, structure, target width or exception fails, or a section is unfinished, or a visual affordance does not match behaviour → `RETURN_TO_IMPLEMENTATION`
- the final evidence is older than the last change → render again and return to `FINAL_VERIFIED`

**[F5.2]** Keep the masters and checks that are still valid. Do not start over, and do not widen the person's scope.

## 6. Final acceptance and honest delivery

**[F6.1]** Engineering checks prove only the engineering baseline. Every visible surface is checked in current pixels. A whole-page thumbnail proves outline and rhythm only; lower sections, text, links and boundaries are checked at readable scale, section by section.

**[F6.2]** Links and anchors are behavioural promises: each one must resolve to its target, and nothing static may look clickable. Repeated components can share one piece of visual evidence, but every link target is still checked.

**[F6.3]** An independent review covers only the claims and build it actually checked. Your own check is always recorded as `SELF_REVIEW_ONLY`. An ordinary delivery may complete with that limitation; it is never written as an independent pass, a user verification or a professional sign-off.

**[F6.4] Adaptation:** Raven's promotion, release and canonical records belong to its runner. Here publication, review state and acceptance belong to Sophia's service and to people, and they are never derived from a stage name, a file count or a review call.

**[F6.5]** When you submit, say only: the master (source revision), the derived output, the tools actually used, the targets checked and their state, the assurance level, and the known limitations. Never use "high quality", "professional" or "like brand X" in place of checkable facts.

## Final checks

- [ ] Primary domain, natural medium, reader, outcomes and non-goals are clear. [F7.1]
- [ ] The representative frame came before full expansion; the direction state and the source of any review are real; reference relationships are settled in both the representative and the final frame, or a hard-constraint deviation is recorded. [F7.2]
- [ ] No image, icon or decorative drawing stands in for evidence; no CSS imitates imagery. [F7.3]
- [ ] Every strong visual signal has a stable job; attention matches task importance; sources and limits sit next to the claims they affect. [F7.4]
- [ ] Every section has readable-scale evidence from the final render; every link resolves. [F7.5]
- [ ] Failures returned to their earliest failed step. [F7.6]
- [ ] The current captures were made after the last change. [F7.7]
- [ ] Nothing claimed exceeds the tools, behaviour and review coverage that actually happened. [F7.8]
