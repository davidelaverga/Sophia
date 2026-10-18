# Bold, code and quotes in messages

> 2026-10-16 · Luis's QoL queue, item 6 (informe-brechas-a-fondo.md §4, la mensajería). Slack, Teams and Discord read
> `**bold**`, `` `code` `` and a `> quote` in a message. The Studio shows them as written. Its own Quote
> (Conversations) puts «> » before the quoted words, which shows as a raw mark. Studio only.

## What changes

- **`rich-text.ts`** (pure) reads a message line by line:
  - a line that starts with «> » is a quote;
  - in a line, `` `code` `` is literal, with nothing read inside it;
  - `**bold**` is bold;
  - a mark that doesn't close is shown as written.
- **`RichText`** draws the pieces as React elements, never as HTML: `<strong>`, `<code class="msg-code">` and a quote
  line (`<span class="msg-quote">`, a block under an edge). Addresses stay links (`LinkedText`). Lines stay lines, as
  `pre-wrap` keeps them.
- **Where:**
  - in the room's chat: the discussion, your typed turns and Sophia's replies;
  - in Conversations: a member's message.
  - Sophia's answers in Conversations keep their own blocks (`sophia-text.ts`). Personal and Find keep `LinkedText`,
    so a mark is never split.

## Follow-ups (Codex P2s on #384)

- **An address whose path holds marks stays one link:** bold is read only where its mark doesn't open inside a web
  address, so `https://example.com/**draft**` links whole, and `**https://example.com/plan**` is still a bold link.
- **A blank line before a quote stays:** a quote's block starts its own line, so a line before it needs no break of
  its own, except an empty one.
- **A quote's blank line keeps a line's height,** so a quoted message's paragraphs stay apart.

## Checks

- **`rich-text.test.ts`:** a quote line; code before bold (`` `**not bold**` `` stays code); an unclosed mark stays as
  written; an empty `****` stays as written.
- **`message-format.spec.ts`:**
  - a room message with `**bold**`, `` `code` `` and an address shows a strong, a code and a link;
  - in Conversations, Quote's «> » line shows as a quote, with no «>» to see.
