# SDD-01 G6: the controlled comparison's bundle

Pack 03 G6 and pack 06 ("Controlled design comparison"): the same frozen inputs, designed by the native designer on the actual model route, compared with #75's fixed editorial page (html-report-v2), each dimension recorded on its own. This directory is the reusable bundle; `scripts/g6-control.mjs` writes it.

| File | What it holds |
|---|---|
| `inputs.json` | The four frozen inputs (M75's labelled fixtures, `apps/studio/fixtures/report-pages.ts`): the role each plays, its Markdown's SHA-256, its sources and stored limitations, and the control page's profile, SHA-256 and size. `node scripts/g6-control.mjs --check` fails if a fixture or the control printer moved |
| `results.json` | Per input and arm: the control's capture in the confined capture kernel (the same kernel and targets a candidate goes through: 390 px and 1280 px, light), its renderer identity, sandbox verdict, per-target overflow and coverage, captures by hash, the kernel's checks as they came, wall time and cost; the native arm's state |

## State at this candidate

| Arm | State | Level |
|---|---|---|
| Control (html-report-v2) | Measured on all four inputs; every kernel check passed | L1: source fixture, confined Chromium, no model |
| Native designer + reviewer | `not_run`: needs the paid research route (decision O-5) and Davide's scoped approval; nothing stands in for it | — |
| Raven | Not run in this mission (pack 03 G6) | — |

No combined score is computed, and none of the dimensions a person or a model judges (content fidelity, readability, hierarchy, consistency, accessibility, coverage, correction effort) is filled in for either arm: the control's capture measures only what the kernel measures. The control is a test control, never a delivery path.

## The native arm (Codex, under approval)

1. On an approved stack (API, database, renderer with a capture runner, runtime unit `sophia-runtime-sdd01-dev` on the research route), publish each input's Markdown as a report version with its sources, then admit its design with targets `w390-light` and `w1280-light`.
2. Record per input: the design task's model calls and their settled cost, wall time, revisions, renders, candidates, the review verdicts and findings, the published rendition's SHA-256 and review state, and the capture receipts of the published candidate.
3. Run `scripts/g6-control.mjs --check` on the same commit, so both arms provably used these inputs.
4. Collect blinded labels for the judged dimensions where feasible (pack 06), and keep each dimension separate. A missing citation or a clipped table is a finding whatever the other dimensions say.
