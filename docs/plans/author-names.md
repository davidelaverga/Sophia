# An author is a name, not an address

> 2026-10-14 · `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md`, Q1. Luis: «Arregla los puntos mencionados».

## What was measured

- On the real dev stack, Luis saw Davide's messages in the room's chat signed «davide@sophia.test». The names a room
  knows come from its participants (`useKnownNames`), whose name is the token's email when the account has no display
  name. The stage already shows «Davide» (`shortName`); the chat, the notes and the brief's «decided by» line
  (`authorLabel`) showed the address.

## What changes

- **`authorLabel` names a person, not an address**: a known name that is an email reads as the stage reads it — the
  address's first word, capitalised («davide@sophia.test» → «Davide»). A name given (a display name, a guest's own) stays
  whole. «You» and «A member» are unchanged.
- One place, so every author line follows: the chat, its replies' quotes, the captions, the notes and the decisions.

## Checks

- `conversation-view.test.ts`, «names the author as the room knows them»: an address reads «Luis», a given name stays
  «Ana López», «You», «A member».
- Prettier, type-aware lint, typecheck; unit tests; CI for the browser specs.
