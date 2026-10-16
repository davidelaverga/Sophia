# The room's chat never cuts a message

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 2). The room's message bar had
> `maxLength={2000}`, so a longer paste was cut without a word, while the room's discussion takes 4000 characters.
> Studio only.

## What changes

- **No `maxLength`** on the bar: nothing written or pasted is cut. A field's `maxLength` counts UTF-16 units, not the
  characters the API counts, the same reason Personal's field has none.
- **The most a message holds depends on who it goes to** (`bar-length.ts`, pure):
  - **to the room:** 4000 characters, as the API counts them (A05, `Contribution.text`);
  - **to Sophia:** 2000 UTF-16 units, the typed turn's chat packet (`room-chat.ts`), which the bridge refuses past
    that.
- **A count on its own line over the bar** (beside Send it squeezed the field in the chat's narrow panel), from nine
  tenths of the most on, in Personal's words:
  - «3,612 / 4,000»;
  - at the most, «· the most one message holds»;
  - past it, «· 100 over».
    The field names the count in its description.
- **Past the most, Send waits,** and so does Enter. Switching who it goes to recounts.

## Checks

- **`bar-length.test.ts`:** the room counts characters (an emoji is one) and Sophia UTF-16 units; the count shows
  from nine tenths on; a message fits up to its most.
- **`room-discussion.spec.ts`:**
  - 4100 characters inserted for the room stay whole; the count says 100 over; Send waits, and Enter sends nothing;
    at 4000 it sends once;
  - to Sophia, 2100 are 100 over; switched to the room, the same words fit and the count goes.
