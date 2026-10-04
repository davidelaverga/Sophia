# Personal: a conversation with Sophia, not a chat template (the "$20" pass)

> 2026-10-04 · Luis · design note before code · after [home-welcome](home-welcome.md) and [home-light-mark](home-light-mark.md)

## Why

Home's main action leads here, so the whole experience drops to Personal's level. Measured on the real app (a new `@sophia.test` account, four turns, 1280 and 390 px):

- **It reads as any chat.** Your words sit in grey boxes on the right, with a border and a fill. Hers have a 7 px dot. Nothing of the brand is there.
- **It isn't Home's language.** The field is a box with a violet ring, while Home's line has no box. The title is a bold 20 px heading, while Home's labels are mono and quiet.
- **The ways to start are bordered pills.**
- **On a phone her dot sits 6 px from the screen's edge,** outside the 16 px gutter.

## What changes

- **Speakers marked by Umbral's halves.** Her small, light half begins each of her turns; your warm half begins each of yours. The conversation is the mark, split into its two voices.
  - Both are drawn from the mark's own paths (`UMBRAL` in `threshold.ts`), at one scale: half a pixel to the mark's 48 grid. Hers is 8.6 px tall, yours 15.2.
  - While she writes, her half breathes, and "Sophia is writing…" shows quietly where her words will be. Under reduced motion the half is still and the words stay.
- **No bubbles.** Both sides start on the same column, like a transcript.
  - Her words are full-contrast text, 15 px on a 1.6 line.
  - Yours are in your warm colour, a step quieter. No box, border or fill.
  - A change of speaker gets room (24 px); turns from the same side stay close.
  - The time and "Note this" show on hover (a tap on touch), after the words on both sides.
  - "Note this" opens its form under your turn, on the left.
- **The head is Home's.** A warm mono label ("You and Sophia") on a hairline.
  - The notes are a quiet text button with their count, as Home's "3 notes" ("No notes" when none are left).
  - It is 40 px tall on touch.
- **The notes, beside the conversation, are a column on a hairline,** with no card. Where they can't clear it (a window under about 1250 px), they keep their opaque ground and cover what they overlap.
- **The ways to start are Home's rows.** Hairline rows, each a sentence and an arrow.
- **The field is Home's line,** grown to fit a message. Its parts:
  - no box: a hairline above it that turns violet while you write;
  - her padlock on the left. "Only she hears this" is the field's description, for everyone;
  - the microphone and send as small icon buttons, then Enter's key.
- **Phone:** the halves sit inside the 16 px gutter, the text starts 22 px in, and nothing goes past the screen.
- **Unchanged:**
  - the behaviour: sending, suggestions, notes, carry, erasure, dictation, read-back;
  - the ambient wash from above;
  - the edge to Work;
  - the room's `.message-bar` (`theme.css`): Personal's look is scoped to `.ps-composer` in `personal.css`.

## Not in this slice

- A live voice conversation in the personal space (Davide's side: a media bridge).
- The Codex P2 follow-ups on #85–#87.
- Davide's #76 files stay untouched (`theme.css`, `Sheet.tsx` and the others).

## Checks

- **A fixture page** with the real `PersonalSpace` over labelled simulated turns (`fixtures/personal.html`). It covers:
  - a new conversation, a long one, Sophia writing, a reply that failed, a suggestion;
  - the notes open, and Sophia unavailable.
- **Browser checks:**
  - each speaker's first turn carries its half, and no turn has a box (no border, a transparent background);
  - the ways to start are rows with an arrow, and one press sends it;
  - the field is a line (no side borders), and its hairline turns violet on focus;
  - "Note this" shows on hover, and the time too;
  - while she writes, her half breathes, and under reduced motion it is still;
  - phone at 360 and 390 px: every half is inside the gutter, and nothing goes past the screen.
- **Mutations with controls,** and Git's bash (see the harness trap).
- **Real app:** captures and a video for Luis.
