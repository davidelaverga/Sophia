---
id: editorial/patterns
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/design-editorial-and-presentations/references/patterns.md (blob bb65eed93175fac22d8bf77b068e7fccec9255e5)
status: Sophia-authored English adaptation of the sections that apply to continuous long-form research HTML; paginated print (§5), live presentation (§6) and accessible PDF (§9) are deferred; clause map in docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Editorial patterns

Read only the sections the contract needs. These are structure and check patterns, not a list of pages to fill. [P0.1]

## 1. Medium contract card [P1.1]

| Field | Question |
|---|---|
| `contract_id` | continuous long-form HTML (the only contract of this profile) |
| `consumer_task` | does the reader follow, look up, cite or keep it? |
| `context` | reading width, device, language, time available |
| `content_authority` | the frozen research package owns words, data, sources and states |
| `layout_authority` | your source revision |
| `required_capabilities` | stable anchors, citations linked to the sources list, readable tables at both widths |
| `deliverables` | the source revision, the compiled HTML, the captures |
| `claims/non_goals` | what this contract proves and explicitly does not |

## 2. Content authority [P2.1–P2.3]

- **Claim and data ledger. Adapted:** the package's content blocks are the ledger: each block has an id, its exact text and its citations. Visual emphasis never changes a block's status; a missing value is never filled by a placeholder number or a "reasonable" guess.
- **Asset and rights ledger. Deferred:** no image, chart source or font file is admitted in this profile.
- **Authority layers:** content authority (the package), layout authority (your source revision), derived outputs (compiled HTML, captures), review index (the reviewer's captures and findings, which own neither content nor layout).

## 3. Editorial spines [P3.1–P3.5]

- **judgement → evidence → decision:** define the decision, establish who it affects, prove the key differences one by one, state limits and trade-offs, end with responsibility, resources, time and the next review.
- **question → findings → reframing:** enter through a concrete contradiction, let the evidence change the first understanding, place the turn that really changes the judgement, return to the opening question with the new understanding.
- **time or process:** keep only the points that change state; mark cause, waiting, branches and parallels. If removing a point changes nothing, merge it.
- **comparison → trade-off:** freeze a common baseline, unit, scope and missing-value rule first; compare only comparable variables; state benefits, costs, the incomparable and the recommendation; never let colour make the conclusion.
- **browse and look up:** mutually exclusive groups by the reader's real questions; stable field order and return paths; important entries may get more space.

## 4. Flatplan: the job of each unit [P4.1–P4.2]

For each natural unit (section) record: `unit_id`, `primary_job` (state, prove, explain, compare, navigate, look up, turn, decide), `claim/question` (what must be understood at first sight), `evidence_object` (the body, table or quotation carrying the proof), `before/after` (what it continues, where it sends the reader), `density`, and how its source, status and limits appear.

Check: can the headings and the contents alone retell the argument; would swapping neighbours lose nothing; is each claim supported by evidence on the same screen or nearby. Common jobs: opening, contents, chapter opening, claim, evidence, data evidence, method and limits, comparison, action, sources. Make a pattern only for a real job.

## 5. Paginated publication — deferred [P5.0]

## 6. Live presentation — deferred [P6.0]

## 7. Continuous long-form [P7.1–P7.5]

- The semantic order lives in the content structure; nothing depends on a left/right position to be understood.
- Section headings, contents, anchors, the current position and the way back serve continuous reading. No sticky element, snap or scroll effect may block natural reading.
- Captions, side notes, comparisons and tables re-decide their adjacency at narrow widths; never stack columns mechanically or shrink to a picture.
- Check the longest heading, the densest table, footnote-like caveats and the sources at the narrowest, typical and widest width.
- If the task becomes ongoing publication, sections, search, subscription or CMS editing, stop: that is a content website.

## 8. Automated report [P8.1–P8.3]

- The authoritative bundle is the frozen package; the compiled HTML and captures are derived.
- Values, quotations, citations and tables derive from the package; never copy a result into the layout and maintain it separately.
- A stable build proves neither editorial choices, nor visual quality, nor statistical conclusions: check structure, final pixels and data evidence separately.

## 9. Accessible PDF — deferred [P9.0]

## 10. Text and image judgement [P10.1–P10.5]

For each visual object answer: which question it answers / the first thing seen / which content it connects to / its source / so what / how it changes at each width. If the answers are incomplete, delete it, add evidence, or move it later.

- Hierarchy uses scale, weight, position, alignment and space first; necessary sources, status and limits are never reduced to low-contrast micro-text.
- Type roles come from medium, language, distance and content; test with the real longest and densest content; do not invent roles for "editorial feel".
- Tables serve exact lookup and comparison; header semantics are kept; at narrow widths the field relationships are kept (a named horizontal scroll region is allowed; a hidden last column is not).
- White space and expression may carry pause, mood or identity; cut them only when their job is unobservable or competes with the core task.

## 11. Representative proof [P11.1]

Choose the smallest sufficient vertical slice by risk, not a fixed page count: the opening and overall voice; the most common unit; the densest unit (text, table, many citations); the exception that most exposes the method (a missing or unread source, a limitation); the narrow-width version. Use real content and check it in the target consumer. An opening alone never qualifies.

## 12. Symptoms and returns [P12.1]

| Symptom | Usual root cause | Return to |
|---|---|---|
| One layout claims to serve screen, print and slides at once | Consumer contracts not separated | Natural medium |
| Conclusions, numbers or sources contradict each other | Split content authority | Content state |
| Sections are interchangeable; chapter openings only enlarge a number | Spine or unit jobs not designed | Content spine |
| A capture or the compiled HTML is treated as the source | Wrong master | Tool |
| Every section is a big heading with cards | Representative pages missed the real risks | Representative pages |
| Grey micro-text carries sources, limits or the next step | Hierarchy faked by hiding information | Editorial visual quality |
| The narrow width is a shrunken or stacked desktop page | No native adaptation | Medium |
| Self-check described as a professional visual pass | Evidence wording overreaches | Completion check |

Return to the earliest falsified assumption and keep unrelated evidence that still holds; never patch governance labels with more pages, decoration or explanatory text.
