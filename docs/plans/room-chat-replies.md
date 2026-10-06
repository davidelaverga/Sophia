# The room's chat: reply to a message

> 2026-10-06 · Luis · "en el chat lateral, ¿se le puede hacer reply a las personas?" · proposed to Davide as A20 on #105 (comment 6025357439) · behind the vision flag

## The gap, measured

The chat's recent discussion lists each member's messages; nothing answers a particular one:

- **Writing:** the contributions API takes a `threadId`, and the Studio always sends `null`.
- **Reading:** `DiscussionEntry` (in the snapshot's discussion, a strict schema) doesn't say what an entry answers. A reply sent today would show as a plain message.

## What changes (under the vision flag)

- **«Reply»** on each message of the recent discussion: «Reply to Lucía».
- **While replying,** above the message bar: «Replying to Lucía: “first words…”», with ✕ («Stop replying»).
  - The bar writes to the room: a reply is the room's, so the switch moves to «To the room» and the field takes the focus.
  - Sent, the reply is recorded with the message it answers (`threadId`), and the chip goes.
  - Escape in the field, or ✕, stops replying and keeps the words.
- **In the discussion,** a reply carries a quote line above its words: «↪ Lucía: “first words…”».
  - Pressing it scrolls to the message it answers and gives that message the focus, when it is still in the recent discussion.
  - When it isn't, the quote is plain text.
- **One level:** a reply to a reply quotes the message it answers, never a chain.

## The proposed API (A20, issue #105)

- **Writes:** `Contribution.threadId` (already accepted) carries the id of the `DiscussionEntry` answered (or a new `replyTo`, Davide's choice). An id that isn't in the project's discussion is refused (`invalid_state`).
- **Reads:** until `DiscussionEntry` carries `replyTo`, the Studio reads the links from `GET /api/v1/projects/{projectId}/discussion/replies` → `{ replies: { entryId, replyTo: { id, actorId, excerpt } }[] }`, read again as the feed moves.
  - `excerpt` is the original's first words, recorded with the reply.
  - It is checked against its shape (`vision.ts`).

## Out of scope

- Replying to Sophia's turns or to captions: the room's messages only, for now.
- Threads, reactions and mentions.

## Checks (written first)

- **Browser** (`e2e/room-chat-replies.spec.ts`):
  - «Reply» on a message shows «Replying to …» above the bar, the bar writes to the room, and the field has the focus;
  - sent, the reply is recorded with the message it answers, shows its quote, and the chip goes;
  - the quote scrolls to the original and focuses it;
  - ✕ and Escape stop replying and keep the words;
  - a reply to a message no longer in the discussion is refused, and says so;
  - the measured rules hold with the chip shown.
- **Unit** (`replies.test.ts`): the excerpt (first words, cut by graphemes, with «…»).
