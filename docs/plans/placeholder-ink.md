# A placeholder reads as the words it is

> 2026-10-09 · Luis: «Sigue con lo siguiente de la cola». Left from `ink-every-page.md`: words in the faintest ink
> (`--text-4`) the contrast check never measured. A placeholder is one, on most pages at rest. No API change.

## What was measured

- The contrast check (`e2e/contrast.ts`, `lowContrast`) measured text nodes only: a placeholder never. Measured, every
  field's placeholder read at about 2:1 (1.99–2.15): the searches on Knowledge, Tasks, Resources and the work space,
  sign-in's address, the door's name, Conversations' filter and the line that continues a question. Only Home's and
  the personal space's read, in the third ink of their own.

## What changes

- A placeholder reads in the third ink (`--text-3`, 4.6:1 or more), as Home's and the personal space's already do:
  the rule for every field's, in `theme.css`. What is typed stays brighter (`--text`).
- `lowContrast` measures the placeholder of each empty field, from `::placeholder`, over the field's grounds: every
  check that measures a page measures its placeholders too.
- `.title-input`'s own placeholder rule is left as it is: no component uses the class (its removal is its own task).

## Checks (written first)

- With placeholders measured, 17 checks failed (`ink` on seven pages, desktop and phone; Knowledge's filters;
  Conversations' thread and start): each a placeholder near 2:1. With the change, every contrast check passes.
- Mutants, with a control that passes: the placeholder back in the faintest ink fails. With it faint, a measure that
  reads the field's own ink, or skips placeholders, passes: the checks catch it by reading `::placeholder`, nothing else.
