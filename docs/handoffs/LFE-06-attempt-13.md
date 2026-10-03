# Implementation-session handoff: LFE-06, attempt 13 (the capacity's facts in one line)

- **Goal and attempt:** the second cut Luis asked for ("también el capacity"). Under Capacity, two grey lines sat in a row: the history's caption and the capacity's facts. They become one.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/capacity-line`, stacked on `lfe-06/declutter` (#56) at its tip, 2026-10-02.
- **End:** content commit `b31ea8b`; its checks ran on it.
- **Writable scope:** `CapacityBlock.tsx`, `Sparkline.tsx`, the stylesheet, the checks and LFE-06's records. **No contract, schema or API changed.**

## Outcome (UI)

- **Before:** "6 readings · since 3 h ago" under the drawing, then "shared by 2 sessions · 1 min ago".
- **After,** one line: "shared by 2 sessions · 6 readings in 3 h · 1 min ago".
  - The drawing has no caption of its own. A screen reader still hears its whole range, as before.
  - A capacity without history keeps its line as it was: "shared by 2 sessions · 1 min ago".
- **The first wording wrapped onto two lines** in the sheet's width: "… 6 readings since 3 h ago · latest 1 min ago". It was shortened until it fits, and a check now measures it as one line.
- The headline's history is computed once (`headHistory`): it is drawn under the meter and counted in the line.

## Evidence

- **The history check now says:**
  - the line is "shared by 2 sessions · 6 readings in 3 h · 1 min ago";
  - there is no caption;
  - the line is one line high in the sheet.
- **Two mutations** each made it fail:
  - the readings left out of the line;
  - a wording too long to stay on one line.
- `test:browser --repeat-each=2`: 122 of 122.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 595 pass, plus the 5 known Windows failures.

## Next bounded action

- The list view and grouping by owner. Then every LFE-06 mutation, run together against the top of the stack.
