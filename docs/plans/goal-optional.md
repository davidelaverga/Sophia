# A goal's criteria mark the exception: optional, not required

> 2026-10-09 · Luis: «sigue evaluando e iterando», after the «$20» evaluation. Measured on the demo's Goals: «·
> REQUIRED» five times, on every criterion, in the mono capitals the Studio keeps for labels. No API change.

## What is wrong

- A goal's criteria are required unless said otherwise (A-contract `required: boolean`); the demo's five all are. Each
  one still ends «· REQUIRED», so the label carries nothing and the list reads as a form's fine print: 5 labels of the
  page's 6 mono capitals on Goals, 5 of 7 on Tasks.

## What changes

- A required criterion says nothing; an optional one ends «· optional», in the same quiet label. The rule goes
  unsaid, the exception is said.

## Checks (written first)

- `work.spec.ts` (the goal's two lines): opened, its two criteria read «A failed render is retried, then reported»
  (required: no mark) and «The report pane shows the export’s state · optional».
- `views-goals.spec.ts`: on the demo's Goals, every criterion required, the word «required» is nowhere.
