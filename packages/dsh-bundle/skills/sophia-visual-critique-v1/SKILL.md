---
id: sophia-visual-critique-v1
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/review-against-ai-patterns/SKILL.md (blob cf27ed13b88c0082228fc5db11fcce9e5516d64a)
status: Sophia-authored English adaptation; the clause map is docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Visual critique against AI patterns

Use this when creating, editing or reviewing any human-visible artifact. Before the direction is decided, read the anti-pattern gallery specimens your risks route to and open the risk ledger; while making, stop and restructure the moment a gallery group takes shape, and record it; before delivery, scan the whole artifact and review its render against templates. It does not replace the domain procedures' own gates, and it does not rule on aesthetic stages. [C0.1]

**[C0.2]** This procedure keeps the gallery, the ledger contract and the anti-template render review in one place; the domain procedures keep their own stop signals and rework tests.

## 1. Before the direction is decided: the gallery check (mandatory)

**[C1.1] Risk route.** Read the gallery index, `critique/gallery/page-01` (and `critique/gallery-index`, which lists every group and its pages in English). By the task, the reference route and the actual risks of the representative frame, choose the relevant groups, then read the two to four specimen pages that cover them. If the direction cannot be classified, or several high-risk groups span pages, keep reading until the risks are covered. Do not read unrelated pages to fill a count.

For a research report the groups to consider first are **G** (grey AI micro-text: caveats, sources and method set smallest and greyest), **N** (number cards), **B** (expression blocks: insight cards, coloured left-border summaries), **H** (placeholders for missing evidence), **T** (pill stacks), **O** (bilingual or spaced-caps eyebrows), **S** (numbering rituals) and **W** (template copy); **P** (palette templates) when you choose colour; **D** (illustration style) does not arise because no imagery is admitted.

**[C1.2] The ledger.** Keep it in the work record (`design_record_work`, kind `risk_ledger`), written in the format of `critique/ledger-format`. **Adaptation:** Raven writes `ANTI-SLOP-CHECK.md` in the working directory; the work record is Sophia's durable equivalent and is part of the candidate's evidence.

**[C1.3]** The ledger records only the high and medium risk groups you routed to, the current visible symptoms, the matching specimen, the positive benchmark mechanism, the change and the re-render evidence. Low-risk and inapplicable groups get no empty section. Before delivery, scan the whole artifact once more and add newly found risks. Missing a group that actually occurs means the work is unfinished; length and a verdict per group are not quality evidence.

## 2. While making

**[C2.1]** The moment any gallery group takes shape in the artifact — G grey micro-text, N number cards, P palette template, B expression blocks, H placeholders, T pill stacks, O bilingual eyebrows, S numbering rituals, W template copy, D illustration style — stop, restructure, and update that group's ledger entry. To judge whether a single element hits, read `critique/anti-slop-review` and look at the group's gallery page itself.

## 3. Checking and delivery

**[C3.1]** The review gates, evidence groups, observations, common symptoms and repairs, the high-impact protocol and the pass conditions are in `critique/anti-slop-review`.

**[C3.2] Adaptation (who decides).** In Raven the model decides whether and when to call an independent reviewer within the user's limits. In Sophia the service admits the independent reviewer after you submit a candidate, within the repair and review ceilings the task was admitted with; you do not call it, and you never stand in for it. You still decide, by risk, what to check and repair before submitting.

**[C3.3]** The reviewer receives only: the person's original request, the references it may view, the frozen research content and constraints, and the current rendered pixels. Never your rationale, your design thesis, your change summary or a self-rating. Sophia's service builds that input; nothing you write can enter it.

**[C3.4]** Without an independent reviewer, run an isolated self-check and mark the result `SELF_REVIEW_ONLY`. That is an evidence source, not an independent pass.

## For the independent reviewer

**[C4.1]** You did not author the candidate. Read the original request, frozen content and criteria with `review_read_context`; look at the actual pixels with `review_inspect_render`; read the gallery and precedents with `review_read_reference`. A path, markup, a successful build or a tool count is not visual evidence.

**[C4.2]** Apply the gates by risk (direction for a new or changed direction, system across sections and widths, final after the last visible change, positive completeness beyond the gallery), cover every required section and width at readable scale, and check that every content block, value, caveat and citation is visible and intelligible. Missing targets or image access are blocked or incomplete coverage, never a pass.

**[C4.3]** Submit with `review_submit_result`: the exact candidate, source, render and criteria identities; the captures you inspected and what coverage is missing; the verdict (`pass`, `needs_revision` or `blocked`); concrete findings with severity, location, observed evidence, the requirement, and the earliest layer to repair; unresolved limitations. A pass is scoped to this evidence and version. Return actionable findings, not an unexplained score. For an Edit, judge the declared target, the protected regions and permitted reflow; do not ask for a broad redesign to express a preference when a local correction was requested.
