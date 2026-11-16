# Personal reads bold, code and quotes, as the room does

> 2026-11-16 · The UI evaluation's gap, verified on main `9495c87fc`: Personal shows `**bold**`, `` `code` `` and a
> `> quote` as raw marks, while the room's chat and Conversations draw them (`message-format.md`). Luis 2026-11-16:
> «es imposible que no se pueda avanzar mucho». Studio only; no API, no new words.

## Measured

- `personal/Find.tsx` `Marked` draws a turn with `LinkedText` only, with or without Find's marks. `RichText` is used in
  the room's chat (`conversation/Conversation.tsx`) and Conversations (`OpenConversation.tsx`), never in Personal.
- Why: `message-format.md` says «Personal and Find keep `LinkedText`, so a mark is never split». That is a technical
  reason, Find's marks against the formatting's pieces, not a choice for plain text. No plan asks Personal for plain
  text on purpose; `message-links.md` already treats both voices in Personal like the room.
- Find counts and marks matches in the raw words (`find-view.ts`, `foundIn` on `row.text`), so `**` and `` ` `` are
  part of what it searches.
- Copy on her reply copies `row.text`, the raw words. `personal.spec.ts` already checks that the clipboard holds the
  turn's `innerText`, which is what it says on screen.

## What changes

- **Both voices are drawn with `RichText`**: her replies and your own words, as the room draws its chat. Your own
  turns are formatted too, on purpose, as the room formats your typed turns.
- **Find looks in what is shown.** `shownText` (in `rich-text.ts`) is a message's words as `RichText` draws them:
  - no `**`, no backticks, no «> » before a quote;
  - its lines kept.

  Find counts and marks in those words, so a match may cross a bold edge («one figure you»). `shownText` is kept per
  text (a bounded `Map`, `SHOWN_KEPT`), so Find doesn't read every turn again on each key.
- **Marks and formatting compose.** `RichText` takes Find's marks, cut over the shown words, and hands each piece its
  part (`marksIn`). A match inside bold is a `mark` inside the `strong`. A match inside code is a `mark` inside the
  `code`. A link stays whole.
- **A match across a bold or code edge shows as two highlights and counts as one match**, both current when it is.
- **Copy copies what it says:** `shownText(row.text)`, the words without their marks: no `**`, no backticks, no «> »
  before a quote, as a selection would copy them.
  Conversations' Copy still copies a message as written. That is its own surface and is not changed here.
- **Contrast**: code's plane and a quote's ink are measured inside Personal on paper (light) and dark. They take the
  room's `.msg-code` and `.msg-quote` unless a measure says otherwise.
- The AI line under the field is not touched.

## Checks

- **`rich-text.test.ts`**:
  - `shownText` drops the marks and keeps the lines;
  - `marksIn` cuts Find's pieces to a span;
  - the kept `shownText` gives what a fresh read gives, within its bound.
- **`find-view.test.ts`**: for tricky inputs, each piece's marks rebuilt line by line equal `shownText`, and
  `foundIn`'s count equals the matches drawn.
- **`personal-format.spec.ts`**, on the fixture with `formatted=1` (her answer has bold, code, a quote and a link):
  - her reply reads as `strong`, `code`, a quote and a link, with no `**`, backtick or «> » to see;
  - your own `**bold**` is a `strong`;
  - Find inside bold marks within the `strong`, and a match across the edge counts once;
  - Copy writes the shown words;
  - code and quote are readable in light and dark;
  - at phone width the formatted reply fits its column, with no page scroll.
- The neighbours, `personal.spec.ts`, `message-links.spec.ts` and `message-format.spec.ts`, stay green.
