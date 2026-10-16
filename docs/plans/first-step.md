# A new project's first step: tell Sophia what it's for, by voice or in writing

> 2026-10-14 · `evaluacion-2026-10-13/informe-primer-proyecto-20.md`, findings 2–3. Luis: «Sí, mergea #310 y empieza con
> la PR 1».

## What was measured

- A project just made opens in its room: «The room is ready · Sophia joins when asked», and one press, «Join the room»:
  a voice call. The way to begin («Nothing recorded yet. Talk the idea through with Sophia») is in the brief's panel,
  closed. Writing to Sophia is in the chat panel, behind a corner toggle. Whoever makes a project alone first meets an
  empty call.

## What changes

- **While the project is new** (`isNew`: the ledger holds nothing, `readState: 'empty'`; no goal; nobody in the call),
  Sophia's line says «A new project» and «Start by telling Sophia what it's for.», with two presses under it:
  «Talk it through» joins the room, as the dock does; «Write to Sophia» opens the chat, where «Chat with Sophia» starts
  the typed conversation.
- Once anything is recorded, a goal exists or the call begins, the room says what it said before.
- The ledger is read with the brief's own query (viewer, cursor), so the step goes as soon as the first note lands.

## Checks

- `first-step.test.ts`: new only with an empty ledger, no goal and no call; not while the ledger is unread.
- `e2e/first-step.spec.ts`: a new project (`fresh=1`) says the step; «Write to Sophia» opens the chat with «Chat with
  Sophia»; «Talk it through» joins and the step goes; a project with records says «The room is ready».
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; CI as the run on
  record.
