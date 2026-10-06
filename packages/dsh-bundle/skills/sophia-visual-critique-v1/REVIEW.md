---
id: sophia-visual-critique-review-v1
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/review-against-ai-patterns/SKILL.md (blob cf27ed13b88c0082228fc5db11fcce9e5516d64a)
status: Sophia-authored English adaptation, the independent reviewer's view of sophia-visual-critique-v1 (the reviewer loads it); the same gallery route, gates and review clauses, without the maker's ledger, stop rules or tools; the clause map is docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Visual critique against AI patterns: the independent reviewer

Use this when you review one exact candidate. You did not author it and you cannot change, render, submit or publish it; you keep no work record. What you find goes into `review_submit_result` only. [C0.1]

## 1. Route by risk before judging

**[C1.1] Risk route.** Read `critique/gallery-index` and `critique/gallery/page-01`. By the request, the frozen content and what the captures actually show, choose the relevant groups, then read the two to four specimen pages that cover them. If several high-risk groups span pages, keep reading until the risks you see are covered. Do not read unrelated pages to fill a count.

For a research report the groups to consider first are **G** (grey AI micro-text: caveats, sources and method set smallest and greyest), **N** (number cards), **B** (expression blocks: insight cards, coloured left-border summaries), **H** (placeholders for missing evidence), **T** (pill stacks), **O** (bilingual or spaced-caps eyebrows), **S** (numbering rituals) and **W** (template copy); **P** (palette templates) when the colour reads as a template; **D** (illustration style) does not arise because no imagery is admitted.

**[C2.1] Symptoms.** A gallery group that has taken shape in the candidate (G grey micro-text, N number cards, P palette template, B expression blocks, H placeholders, T pill stacks, O bilingual eyebrows, S numbering rituals, W template copy, D illustration style) is a finding: name the group, the capture and the location, and the earliest layer to repair. To judge whether a single element hits, read `critique/anti-slop-review` and look at the group's gallery page itself.

## 2. Gates and what you receive

**[C3.1]** The review gates, evidence groups, observations, common symptoms and repairs, the high-impact protocol and the pass conditions are in `critique/anti-slop-review`.

**[C3.3]** You receive only: the person's original request, the references you may view, the frozen research content and constraints, and the current rendered pixels. Never the author's rationale, design thesis, change summary or self-rating; if any of it reaches you, name the contamination and do not treat it as validation.

## 3. Review

**[C4.1]** Read the original request, frozen content and criteria with `review_read_context`; look at the actual pixels with `review_inspect_render`; read the gallery and the precedents with `review_read_reference`. For positive completeness and template distance the precedents are `web/precedents-index`, then `web/precedents/page-01` (how precedents are used), `web/precedents/page-04` (data pages and reports) and `web/precedents/page-06` (long-form publications): a yardstick and a vocabulary, never a template the candidate must copy. A path, markup, a successful build or a tool count is not visual evidence.

**[C4.2]** Apply the gates by risk (direction for a new or changed direction, system across sections and widths, final after the last visible change, positive completeness beyond the gallery), cover every required section and width at readable scale, and check that every content block, value, caveat and citation is visible and intelligible. Missing targets or image access are blocked or incomplete coverage, never a pass.

**[C4.3]** Submit with `review_submit_result`: the exact candidate, source, render and criteria identities; the captures you inspected and what coverage is missing; the verdict (`pass`, `needs_revision` or `blocked`); concrete findings with severity, location, observed evidence, the requirement, and the earliest layer to repair; unresolved limitations. A pass is scoped to this evidence and version. Return actionable findings, not an unexplained score. For an Edit, judge the declared target, the protected regions and permitted reflow; do not ask for a broad redesign to express a preference when a local correction was requested.
