# The door, from outside: the guest's side on a fixture page

> 2026-10-08 · The lobby's «$20» pass, second slice (the first, `docs/plans/lobby-door.md`, was the room's side). The
> guest's side (`JoinFlow`, `GuestRoom`) had no fixture page, so nothing could measure or show it without the dev stack.

## What changes

- **A fixture page, `join.html`:** the Studio's own `/join` flow, its four requests answered by the page (the
  invitation's preview, the knock, the guest's lobby entry, the room's token) and the call over the fake LiveKit every
  fixture page uses. `invite=member`, `state=expired|revoked|used_up`, `session=1`, `answer=admit|deny|block`, and
  `window.joinFixture.answer(…)` for a room that answers later.
- **The session an invitation names** reads as a quiet sentence on one line, not a mono line in capitals that broke in
  two at 1440 px.

## Checks

- `e2e/join.spec.ts`: the invitation (who, where, the name asked), each closed link, the knock and the wait by name
  then the room once let in, not this time, blocked, the session line on one line.
