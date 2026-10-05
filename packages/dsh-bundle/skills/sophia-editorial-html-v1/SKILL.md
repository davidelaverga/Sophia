---
id: sophia-editorial-html-v1
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/design-editorial-and-presentations/SKILL.md (blob b6edaae4f6b49774d53f3e8c25d26d064152f76b)
status: Sophia-authored English adaptation for the static research HTML profile; the clause map is docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Editorial research HTML

## Core goal

**[E0.1]** Edit the research into a publication a person can read, find their way in, cite and keep: quality comes from content order, type relationships, the job each element does, layout rhythm and fit to the medium, never from more cards, borders or templates.

**[E0.2]** Work in this order:

```text
reader's task → natural medium → content spine → visual system
            → representative page types → complete sequence → final consumer
```

**[E0.3]** This procedure owns editorial structure, the medium and the domain quality. The browser is the final consumer, so it is combined with the web finish procedure, which owns the HTML/CSS implementation and visual system; this one keeps the content order, page types and publication meaning. Safety, rendering, review and delivery follow the visual foundation and are not repeated here.

## 1. The natural medium

**[E1.1]** Choose the main contract by how the reader uses the content, not by file extension. Raven distinguishes paginated publication, live presentation, continuous long-form, automated report and accessible PDF. **This profile admits one: continuous long-form on screen** (read, locate, return, reflow; its master is the semantic source with stable anchors). It is also an automated report in one respect: its words, numbers and citations come from one frozen research package (§7).

**[E1.2] Deferred:** paginated print, slides, accessible PDF and a separate handout are other contracts with their own masters; they are not offered by this profile and are never imitated by squeezing a screen layout.

**[E1.3]** Do not stretch the report into something else: ongoing columns, search or a CMS belong to a content website; free data exploration to data visualization; persistent editing to a product tool. None of those is this task.

## 2. The editorial card

**[E2.1]** Before working, add these lines to the contract you record with `design_record_work` (only decisions that change the result):

```yaml
reader_and_scene: who reads it, when, and what they are trying to find
main_task: what they should understand, find or decide after reading
medium: continuous long-form HTML; target widths; language (EN, IT or ES as admitted)
content_spine: argument, chronology, comparison, process or lookup structure
content_state: supplied, verifiable, missing, restricted, and what must not be inferred
visual_direction: actual references, type relationships, density and rhythm
representative_pages: the units that best expose direction, density and exception risk
```

**[E2.2]** Sources, rights, versions, tool comparisons and build records are internal evidence, not layout content. The page shows only the sources, status and limits a reader needs to understand the content in front of them; the ledger stays in your work record. Never turn governance into banners, card walls or grey micro-text.

## 3. Visual system and tools

**[E3.1]** First settle the editorial visual system: type families and roles, grid and measure, heading rhythm, colour roles, navigation. Then the tool. Both must hold together in the representative pages; a tool's default template never becomes the design by itself.

**[E3.2] Adaptation:** Raven compares InDesign, Affinity, Vivliostyle, Paged.js, Typst, Quarto and Astro. The one qualified tool here is Sophia's static HTML path: you write semantic HTML and scoped CSS with `design_write_source` and see it through `design_render`. Do not claim, imitate or plan for a tool you did not run.

**[E3.3]** Use the medium's native structure: semantic sections and headings, stable `id`s and anchors, a sources list the citations link to, real tables. Do not keep the real page in one place and an export in another.

## 4. Edit the content spine first

**[E4.1]** Choose the structure that best serves the reader's task:

- **judgement → evidence → decision**: decision briefs, recommendations;
- **question → findings → reframing**: investigations, research answers;
- **time or process**: histories, tutorials, retrospectives;
- **comparison → trade-off**: option, product or policy comparisons;
- **browse and look up**: catalogues, guides, reference material.

**[E4.2]** Give each natural unit one job: it states, proves, explains, compares, navigates, turns or leads to a decision. Reading only the headings and the contents should retell the argument. If two neighbouring units could be swapped with no loss, the order has not been designed yet.

**[E4.3] Adaptation (frozen research).** The research package owns the claims, values, caveats and citations. You may reorder sections, group content, adjust headings and presentation when the meaning does not change. You may not reword a content block, drop one, or move a caveat away from the claim it limits. Every block of the package appears in the page as an element with `data-block="<id>"` holding its exact text, and every citation as an element with `data-cite="<sourceId>"` inside that block. Missing or changed facts need a research amendment, which you request through `design_report_blocker`; you never search, invent or "fix" facts.

## 5. Make the representative page types first

**[E5.1]** Do not lay the report out mechanically from the top. Using real content, first make the smallest sufficient slice:

1. the opening, proving the overall voice and the answer's place;
2. the most common section type, proving the reading rhythm;
3. the densest section: long headings, a wide table, many citations, dense numbers;
4. the real exception: a missing or partial source, an unread source, a limitation;
5. the narrow screen (390 px), proving it is not a mechanically shrunken desktop page.

**[E5.2]** Look at the final pixels at the target widths with `design_render` and `design_inspect_render`. Extend to the full sequence only after the direction is stable, using shared styles, not by copying and patching section after section.

## 6. Editorial visual quality

- **[E6.1]** Hierarchy comes from size, weight, position, alignment, space and content length, not from many borders, fills and labels.
- **[E6.2]** Rules, colour bars, column lines, borders and corner marks serve grid, order, grouping or navigation. A one-off rule beside a heading whose removal changes no reading relationship is decoration. "Emphasis" is not an editorial job.
- **[E6.3]** Few typefaces with clear relationships; test with the longest heading, the densest paragraph, numbers, punctuation and the actual language.
- **[E6.4]** Section types differ because their jobs differ. Do not make every section a big heading over three rounded cards.
- **[E6.5]** Do not reach for beige, paper texture, hairline frames or low-contrast grey text because something should feel "cultured" or "editorial".
- **[E6.6]** Necessary sources, status and limits sit next to the content they affect and stay readable: never shrunk, greyed or pushed into a footer, and never inflated into a banner that outranks the body. Visual area follows narrative importance, not the requirement list.
- **[E6.7]** Continuous long-form keeps the semantic order. When the width changes, re-plan adjacency and navigation; do not stack a two-column layout mechanically.
- **[E6.8] Deferred:** distance-reading rules for slides and separate handout layouts.
- **[E6.9]** Background imagery is not part of this profile (no images are admitted).

## 7. Content, assets and missing states are true

**[E7.1]** Words, numbers and citations come from the frozen package. When a fact, a source or rights information is missing, keep a semantic gap and say who needs to supply what. Never invent numbers, sources, people, places or rights. A missing state still obeys the editorial system: no giant dashed boxes, stock icons or repeated warnings that make the gap the visual centre (gallery group H).

**[E7.2]** Numbers in prose, tables and citations derive from one source: the package. Captures and compiled HTML are derivatives and never become the content or layout master.

## 8. Completion checks

- [ ] The content order supports the reader's task; sections are not interchangeable templates. [E8.1]
- [ ] The visual system and the tool are both really used and form one language in type, colour, spacing and output. [E8.2]
- [ ] The sequence covers typical, dense, missing and exceptional sections without drifting. [E8.3]
- [ ] The medium is verified in its own consumer: the rendered captures at each target width. [E8.4]
- [ ] The final output is newer than the last visible change and can be regenerated from the source revision. [E8.5]
- [ ] Without an independent reviewer the result is only `SELF_REVIEW_ONLY`; no editorial, visual or accessibility pass is claimed. [E8.6]

For more detailed page-type, narrative and medium checks read `editorial/patterns`. Raven's tool capability profiles are not loaded: no such tool is available here.
