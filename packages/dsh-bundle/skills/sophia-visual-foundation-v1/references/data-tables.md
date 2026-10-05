---
id: foundation/data-tables
source: EverMind-AI/Raven@3632e6040c7038a60ec418ce39ccae185c72c19f plugins-dist/design-engine/raven_design/skills/visual-artifact-design/references/data-visualization.md (blob 9e93f55ce8d44691c403e23eabc92b117ddcd127)
status: Sophia adaptation: tables and numbers of a research report; data graphics are deferred (no SVG or canvas in this profile)
---

# Tables and numbers

## Data integrity [T1.1–T1.4]

- Data lives once, in the package. Every table cell, value in prose and summary derives from it; never type a separate value beside the source.
- Totals, percentages, units, dates, rankings and prose claims stay exactly as the package states them.
- Do not exaggerate magnitude with size, colour weight or position.
- Missing, zero, estimated and not-applicable values stay distinct; never collapse them into one look.

## Reading experience [T2.1–T2.4]

- Choose the table form by the question: comparison, trend, distribution or lookup.
- The table is readable without interaction: header cells, units, scope, period and source are visible.
- Values are aligned for comparison (numbers right-aligned or on a tabular figure; text left). Long labels wrap; meaningful labels are never silently cut.
- A wide table at 390 px keeps every column in a horizontally scrollable region that is focusable and named (`role="region"`, `tabindex="0"`, `aria-label`); it never hides a column or makes the page overflow.

## Validation matrix [T3.1]

Check the densest table, the extreme values, the missing and empty cells, units and precision in the rendered captures at both widths. **Deferred:** charts, maps, series toggles and filters.
