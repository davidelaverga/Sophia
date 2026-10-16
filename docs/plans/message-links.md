# A web address in a message is a link

> 2026-10-15 · Point 2 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): links in messages
> couldn't be pressed. Luis: «Sí, hazlos en ese orden».

## What was measured

- The room's chat (`conversation/Conversation.tsx`), Conversations (`conversations/OpenConversation.tsx`, a member's
  message and Sophia's) and Personal (`personal/Conversation.tsx`, through Find's `Marked`) render a message as plain
  text. An address in it can only be copied by hand.

## What changes

- **`app/links.ts`** finds web addresses: `http` and `https` only, and anything else (`javascript:`, `mailto:`, `ftp:`)
  stays text. Trailing punctuation is left out, and a closing bracket stays when the address opened it (Wikipedia's
  `…_(game)`).
- **`spans`** weaves the links with what Find marks. The text is cut at both kinds of boundary, Find's numbering is
  kept, and an address is never cut in two: a mark inside a link stays inside it.
- **`app/LinkedText.tsx`** renders them. A link opens in a new tab with `rel="noopener noreferrer"`, so the page it
  opens gets neither this window nor its address, and it wraps inside the column.
- **Where:** the room's chat, Conversations (members' messages and Sophia's paragraphs and list items) and Personal
  (both voices, under Find). In Personal a tap on a link opens it and doesn't toggle the turn's time.

## Checks

- `links.test.ts`:
  - addresses and their punctuation;
  - a bracket that belongs to an address;
  - nothing from `javascript:` and its kin;
  - the weave with Find's marks.
- `message-links.spec.ts`:
  - a message sent in each of the three places shows its address as a link (a new tab, no opener, no referrer);
  - in Personal, Find's mark inside the link, with the link whole.
