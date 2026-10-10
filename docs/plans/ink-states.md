# Every word reads in the states a page reaches, not only at rest

> 2026-10-10 · Luis: «Sigue con lo siguiente de la cola». Left from `placeholder-ink.md`: words in the faintest ink
> (`--text-4`) seen only once a page moves on, where the contrast check at rest never looks. No API change.

## What was measured

- Each state reached as its specs reach it, its words measured (`lowContrast`, disabled controls left out):
  - a resource sheet: a control the route doesn't support («Requests»), 2.06:1;
  - an act on its way: the steps not reached yet («Queued», «Delivered»), 2.13:1;
  - a review card: what each observation was seen in (the check run, the log read), 1.99:1;
  - an empty lane («Nothing unassigned», `case=closed`, the only fixture with one), 1.99:1.
- Each in the faintest ink, made for marks: words a person reads.

## What changes

- The four read in the third ink (`--text-3`, 4.6:1 or more), each still a step under its sibling: a supported
  control in `--text-2` (and the glyph says which), a reached step in teal with its bar filled.

## Checks (written first)

- `e2e/ink-states.spec.ts`: the four states, each measured (desktop; the inks don't change with the width). Before the
  change, each failed on its words; after, each passes.
- `ink`, `resources`, `work`, `room-work`: unchanged, pass.
- Mutants, with a control that passes: each of the four back in the faintest ink fails its own check.

## Left

- `--text-4` still colours marks only (a separator, a dot before a connection, the disabled send arrow), and the
  placeholder of `.title-input`, a class no component uses (its removal is its own task): no words a page shows.
