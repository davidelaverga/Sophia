# Rich text: follow-up to #429, the blank line in the room's discussion

> 2026-10-18 · Luis · «Procede con los arreglos» · the P2 Codex left on #429 (merged by the no-P1 rule). Studio only.

## What was measured

- `RichText` keeps a message's breaks as `\n` and leaves them to `pre-wrap`; before a quote it keeps one only for an
  empty line, the blank line #429 brought back (docs/plans/message-format.md, «Follow-ups»).
- Three surfaces draw `RichText`. Two set `pre-wrap`: the chat's turns (`.chat-message p`) and Conversations
  (`.conv-msg p`). The room's discussion draws it in `.contribution-text`, which had no rule, so its `white-space`
  was `normal`.
- So in the discussion, `My draft`, a blank line and `> quote` showed the quote right under the draft, with only its
  2 px margin between them. Every other break collapsed there too: the bar's Shift+Enter line ran on as a space.

## What changes

- **`.contribution-text` keeps its lines** (`white-space: pre-wrap`), as the other two surfaces do. The author and
  the time stay outside it, so nothing else in the line changes. Words still wrap at the panel's edge
  (`overflow-wrap: anywhere` comes from `.contribution`).

## Checks (written first)

- **Browser, `message-format.spec.ts`:** «in the room's discussion too, a blank line before a quote stays». It sends
  the draft, a blank line and a quote through the room's chat, and asks for more than half a line between the draft
  and the quote. On main's code the gap is the quote's margin and a little leading; after, it is a line's height.
  The measure is the Conversations test's, now one helper (`quoteGap`).

## Limits

- No unit test: the defect is a style, and the Studio has no CSS tests; the spec measures the drawn page.
- A message sent with a trailing break would now show that break before Reply. The bar trims what it sends, so only
  a message written elsewhere could have one, as in Conversations.
