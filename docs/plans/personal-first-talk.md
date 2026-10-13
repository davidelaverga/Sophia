# Personal: a new conversation starts at the page's optical centre

> 2026-10-13 · Luis: «Sí, hazlo así», after `informe-espacios-20.md` finding 6 and the mock in
> `evaluacion-2026-10-13/personal-mock/`: centre only the new conversation, the one in progress stays at the bottom.

## What was measured

- `personal.html?talk=new` at 1440×900: the conversation (`.msgs`, `align-content: safe end`) rests on the field, so
  Sophia's introduction and the three ways to start begin at y 577 of 900: 470 px empty above them (64 % of the
  screen). The same after «Delete everything» on the real stack: the space starts fresh at the bottom of an empty page.
- In a conversation in progress the bottom is right: the last thing said sits by where you answer. Centred (the mock),
  it opens a gap between the last message and the field.

## What changes

- **While the ways to start are shown** (nothing said yet: a new space, or one erased), the conversation starts from
  the top with the page's optical centre as its first line: `align-content: start` and a top space of 22 % of the
  view (`data-begins` on `.msgs`). At 1440×900 the introduction moves from y 577 to y 361.
- **It keeps that start for the rest of the visit**: the first message sent does not throw the thread to the bottom;
  it grows downward from there, and once it fills the view it scrolls to the latest turn as every conversation does.
  The next visit opens as a conversation in progress, at the bottom.
- **On a wide screen only (from 861 px).** On a phone the ways to start keep resting on the field, where the thumb is:
  personal.spec «her first greeting and the ways in sit just above where you write» pins that, and the reason holds.
- A conversation that opens with something said (yesterday's talk, her line of the day) is unchanged.

## Checks

- `conversation-view.test.ts`: `opensHere` holds while the rows offer the ways to start, and not once something is
  said.
- `e2e/personal-first-talk.spec.ts` (1440×900): the introduction's top between 25 % and 45 % of the view; sending the
  first message leaves it where it was (±2 px); in a conversation in progress the last turn still sits within 64 px of
  the field.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`, the Personal specs
  through the guard.
