---
id: critique/anti-slop-review
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/review-against-ai-patterns/references/anti-slop-review.md (blob 536d96aedfd1994fe1cb34ee010985e96a25e59d)
status: Sophia-authored English adaptation for static research HTML; clause map in docs/coordination/SDD-01/RAVEN_PARITY.md
---

# Anti-template render review

Trigger the gates below by operation mode, scope of change and risk; there are no three fixed rounds. Judge only real rendered pixels and real states, never source, component names, test counts or design intent. When no independent review is available, every visual conclusion is marked `SELF_REVIEW_ONLY`: that names the evidence source; it is not an independent pass. [R0.1]

## 1. Build the evidence set

**[R1.1]** Choose the evidence the contract actually needs; do not screenshot mechanically. For an editorial research page the groups are: the opening (first screen), continuous content, the densest section, mixed text and tables, navigation (contents and the sources list), and each target width the contract names (here 390 px and 1280 px). **Deferred:** print and export evidence (no print target in this profile); product, data-graphic, motion, canvas and game evidence (not applicable).

**[R1.2]** Every capture names its source revision, width, state and time; Sophia's render records them. The direction evidence of a Create or a large change includes a representative non-empty working state, not only an empty one. Final evidence shows no test file names, debugging UI or temporary hints. After the last edit, the final evidence is regenerated.

**[R1.3]** Long pages keep two scales: the whole-page view for rhythm, repetition and consistency, and a readable-scale capture of each top-level section for text, tables, citations, boundaries and states. A whole page squeezed into one long thumbnail proves the outline only; it never proves that each part is finished.

**[R1.4]** Look at the whole page and the thumbnail first, not the crops. If the overall structure fails, fixing radii, rules and letter spacing is pointless.

## 2. Gates by risk

These gates have no fixed order or count. A Create or large change may trigger several in turn; a point Edit checks only the affected layer and the final evidence; an Audit uses "reproduce → root cause → read-only recheck" and makes no direction, system or source change for the sake of the process.

### Direction gate: does the direction hold

**[R2.1]** Only for a Create, a new visual direction, a large change, or an Edit with real uncertainty about direction, after the first vertical slice:

- within three seconds, can one say what the artifact is, who it is for, and what matters most right now;
- does the first visual come from the task's own content, data, evidence or objects — not from a component-library demo, a topic skin or a visual reason the model invented;
- are the protected invariants of references the person accepted kept; without references, none may be invented;
- is the mechanism a benchmark was authorized to lend actually visible, or only its name cited;
- does domain specificity come from real objects, data, relations or narrative mechanism, not only from titles, topic colours and industry icons;
- for comparisons and dense evidence, does a simple, clear, task-specific structure carry it, without decoration added to satisfy a general suggestion.

**[R2.2]** If the direction fails, stop expanding and change the composition first. Record the state as in §6; `SELF_REVIEW_ONLY` is never written as `PASS` and never keeps an unrepaired problem.

### System gate: is the system consistent

**[R2.3]** Only when several sections, target widths or shared rules change, once the whole affected range exists:

- hierarchy, grid, spacing, type and colour belong to one system;
- repeated structures come from the same styles and the same content source;
- sections are distinguishable without looking like different projects;
- a target width changes relationships and priority, not just size and stacking;
- the densest, longest, emptiest and error-like sections still have rhythm;
- the main task is not taken over by packaging.

### Final gate: are the changed pixels refined

**[R2.4]** Only when this round actually changed the visible artifact, before delivery:

- alignment, baselines, crops, edges, measure, line breaks and focus rings;
- clean colour: no dirty grey, muddled shadow or unexplained transparency;
- every secondary piece of information is still clear, not hidden by being too small or too light;
- every substantive problem was fixed by impact and rendered again;
- any ornament that does no job is removed; if none, leave things as they are, and never remove necessary content to produce a change.

### Positive completeness gate: no error is not finished

**[R2.5]** The gallery only answers "which known failures did this avoid", never "why is this worth reading". For a Create and a large visible change, also check:

- the editorial direction is a concrete reading of this content (its task, its spine, its density), not a set of style adjectives;
- it enters every section, not only three highlights or the first screen;
- typography (accented letters, numbers, weights, line breaks, orphans) is checked item by item;
- borders and surfaces, link and focus states and target-width behaviour belong to one system;
- the surface manifest covers every top-level section, each checked at readable scale with real content, with no default component, text dump or template leftover remaining;
- the behaviour map covers every link class and disclosure, each target actually followed.

**Excluded:** the master visual, page-family visual roles, asset family and hero-imagery checks (content and marketing web only).

**[R2.6]** Run the rework test that applies: the **template distance test** — if replacing only words, colours and imagery would give back the reference template or the fixed editorial seed, return to the representative frame. **Excluded:** the image replacement test (no master visual).

## 3. Observations

### Composition and hierarchy

- **[R3.1]** At 25% scale, mark the first, second and third points of attention; they match the task's priorities.
- **[R3.2]** Large block outlines are stable, and the protagonist gets enough area.
- **[R3.3]** Every edge and white space is a deliberate pause, not a hole left by components that could not fill it.
- **[R3.4]** Equal columns, equal cards and continuous centring do not form a mechanical rhythm.
- **[R3.5]** Navigation, decoration or metadata do not take attention from what matters.
- **[R3.6]** Each view keeps only the focus its task weight justifies. Comparisons and dense evidence may have several equal objects; do not break a fair comparison to create a climax.

### Text and information

- **[R3.7]** Read headings, body, labels, dates, sources, units, captions and limits at actual reading distance.
- **[R3.8]** Check punctuation, weights, numbers, mixed scripts, long words, orphans and multi-line labels.
- **[R3.9]** Text at one level does one job; do not decorate equivalent content with font changes.
- **[R3.10]** Wording starts from objects and actions the reader knows, not system terms or marketing filler.
- **[R3.11]** Check whether grey small text is covering for an information-architecture problem: promote what matters, delete what does not.
- **[R3.12]** Body text normally from 16 px, persistent secondary text normally from 14 px; 12–13 px only for a few high-contrast, non-critical scale marks, units or timestamps, each with its own reason.

### Colour and material

- **[R3.13]** List the background, text, accent, state and data colours actually used, and find any without a job.
- **[R3.14]** Warm and cool greys are not mixed; black is not dirty; white is not muddied by unneeded transparency.
- **[R3.15]** Gradients, shadows, strokes, textures and blur express hierarchy or material, or they go.
- **[R3.16]** Thin borders, light fills and radii are not stacked on the same container, row and note; one surface uses the fewest signals its job needs.
- **[R3.17]** Check text and control contrast on every background.

### Tables and data

- **[R3.18]** Every number, unit, scope, period and source is present and readable; values are aligned for comparison; header cells stay with their columns at every width; a wide table scrolls in a named, focusable frame and never hides its last column or makes the page overflow.

### Links and states

- **[R3.19]** Every visible link has a real target and a visible focus; nothing static looks clickable; check each instance, not a sample by element type.
- **[R3.20]** Every target width keeps the reading continuity; do not split a side-by-side relationship into context-free fragments.

## 4. Common AI symptoms and repairs

The real specimens of these symptoms are in the gallery. Read the index first, then the specimen pages your high and medium risks route to; at the final state, scan the whole artifact once and add new risks to the ledger. A hit sends you back to its root cause; it does not mean deleting every legitimate capability of that group. [R4.0]

| Visible symptom | Usual root cause | Repair first |
| --- | --- | --- |
| The opening looks like any SaaS page | The page came from components or a requirement list, not from the task's relationships | Rebuild the spatial relationship of answer, evidence, judgement; make the real content the first visual [R4.1] |
| Everything is a card | Containers stand in for information relationships | Move continuous content out of cards; use sections, space, alignment and rules [R4.2] |
| Grey small text everywhere | Priority was never decided | Promote necessary information, merge repeated labels, delete useless metadata [R4.3] |
| Thin borders, light fills and radii appear as a set everywhere | Three weak signals wrap content repeatedly | Keep only the needed signal per job; build hierarchy from type, alignment and space [R4.4] |
| Colour bars, rules or corner marks beside headings | Decoration posing as hierarchy or "brand detail" | Delete them unless they encode selection, state, progress, scale or real grouping [R4.5] |
| Topic colours flood the page | A topic noun translated literally into chrome | Return to colour roles with evidence; keep topic colour for objects that mean it [R4.6] |
| A target width works, the other degrades into a stack of blocks | Proportional scaling or mechanical single column | Redefine the order and adjacency for that width [R4.7] |
| A busy, dirty page | Every problem solved by adding | Delete repeated labels, containers, decoration, colours and shadows first, then recompose [R4.8] |
| **Excluded rows**: product chrome vs component library, icon-as-logo, blue-purple "tech" gradients, irrelevant images | Product, brand and imagery cases | Not applicable to a research article without imagery or components [R4.9] |

**[R4.10]** The table locates root causes; it does not impose one minimal style on every task. Density and richness can be refined when content and domain justify them.

## 5. High-impact protocol

**[R5.1]** When a Create or Edit actually changed the visible artifact, before delivery (an Audit only records high-impact problems in existing evidence):

1. on the whole render, point at every concrete place that materially harms the main task, credibility, legibility or completeness; if none, record the basis of the same-size recheck;
2. describe only the visible symptom ("the caption on the right reads like forgotten grey text"); do not defend the intent first;
3. decide the root cause: content, hierarchy, composition, type, colour, component, state or technique;
4. prefer one set of changes that improves several symptoms;
5. after the change, render again at the same width and state and compare;
6. if the fix makes another place worse, keep adjusting; a local crop is never pass evidence.

**[R5.2]** Record each as: location and symptom / why it lowers quality / root cause / change / re-render evidence / whether a new problem appeared.

**[R5.3]** These are blockers; any one returns the candidate for change, and no other merit, feature count or test count offsets it:

- the first visual is unrelated to the reader's main task or the main content;
- the direction lives only in the opening or a few highlights and does not reach every section in final pixels, or the work record still says "to be filled", "to check" or "planned";
- the opening or representative frame is refined while lower sections remain default layout, template leftovers or text dumps, or lack readable-scale evidence after the last change;
- an element borrows the look of a button, link, selection, disclosure, tab or clickable card without the behaviour, or a real link gives no visible feedback;
- the main object has no area to match its importance, or the page holds only when zoomed;
- information hierarchy depends on low-contrast micro-text, repeated eyebrows or labels with no job;
- decorative rails, accent bars, local borders, corner brackets, pseudo-element lines or rules beside headings encode nothing;
- one colour carries conflicting meanings;
- domain specificity comes mainly from topic colour, industry icons and decorative copy;
- protected invariants of an accepted reference degraded without authority;
- a content block, value, caveat or citation is missing, altered, hidden, clipped or unreadable;
- the final evidence shows test names, debugging UI or temporary states, or predates the last change.

## 6. Independent review input

**[R6.1] Adaptation.** In Sophia the service admits the independent reviewer after a candidate is submitted, within the ceilings admitted with the task (at most two repair revisions after the first complete candidate, at most three review rounds for its lineage). Neither role may split its focus to get round them.

**[R6.2]** The reviewer receives: the person's original request and fixed requirements; the references it may view and the mechanisms it may compare; protected invariants of accepted references with their evidence; the frozen research content; the latest complete render and its captures. Never the author's visual thesis, rationale, change summary, effort, test count, self-rating or a hint of the expected verdict.

**[R6.3]** The reviewer looks first for visible defects, mismatches, wrong information and broken links. Being called is not passing: its `pass`, `needs_revision` or `blocked` is stored and acted on. After `needs_revision` the designer changes and renders again first; a new review happens only within the ceilings.

**[R6.4]** When no reviewer is available, nobody simulates one or forges a `pass`. The designer runs an isolated self-check by risk on the latest render, recording each item as problem / evidence / finding / change / re-render, and the result stays `SELF_REVIEW_ONLY`: "pixel self-check complete; independent review not done".

## 7. Final pass conditions

**[R7.1]** Hard conditions, all of them:

- no wrong content, broken links, illegible text, clipping, overlap or false state;
- actual evidence for each target width and the key states;
- the meaning of sources and data is trustworthy;
- the final evidence was produced after the last change.

**[R7.2]** Judgement conditions, forming one conclusion:

- the opening clearly does one job;
- the direction comes from the task, the content and authorized evidence, not from the model's topic associations;
- every top-level section has reached a finished state with readable-scale final evidence; there is no "automatically finished below the fold" area and no long thumbnail covering local roughness;
- every link and disclosure was classified and followed; static things do not pose as controls;
- comparisons and evidence get their identity from objects and structure, not a topic skin;
- type, colour, space and structure belong to one publication;
- the template distance test and the positive detail check were settled on final pixels;
- what resembles a benchmark is its mechanism and finish, not a recognizable copy;
- every substantive problem was found, fixed and rendered again by impact, or there is recheck evidence of none.

**[R7.3]** Any hard-condition or blocker failure returns the candidate for change. When the judgement conditions cannot agree, do not report "perfect": keep the disagreement and ask for a decision. Only an independent review can report its `PASS`; without one, even after every self-found problem is fixed, the final review source stays `SELF_REVIEW_ONLY`.
