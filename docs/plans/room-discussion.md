# Room: write to the room, not only to Sophia

> 2026-10-05 · Luis · PR 9 of the room's $20 plan (the plan's "editable discussion") · "Construye todo"

## The gap, measured

The room's Chat reads the project's discussion (`snapshot.discussion`), but nobody can add to it from the Studio. The message bar talks only to Sophia, and only to whoever holds the floor in an open conversation with her. Everyone else in a call has nothing to type into: a link, a "one sec", a question for the others. Meet, Zoom and Teams all have a room chat. The API already records it: `POST /projects/{id}/contributions` (A05), attributed, idempotent, a project source like any other.

## What changes

**The message bar always writes somewhere:**
- **«To the room»:** always offered. The message goes to the project's discussion as `discuss`, attributed, and shows in Chat for every member through the feed.
- **«To Sophia»:** when the person can talk to her now (the conversation is open and they hold the floor), an empty bar starts on her, as it did before. A switch at the bar's start says who it goes to; pressing it flips it. The placeholder says it too: «Message the room…» / «Message Sophia…».
- **A message keeps its target.** Once something is written, it goes only where it was begun for. If Sophia can't take it any more (the call dropped, someone else took the floor), it is held: «Sophia can't take this message now. Send it to the room instead?», with «Move it to the room». Nothing is sent until the person moves it, so a question for her never lands in the team's discussion on its own.
- **«Chat with Sophia»:** before her conversation is open, it stays above the bar as it is today. It no longer takes the bar's place.

**A message to the room:**
- one Idempotency-Key per message (useAdmission), and one send at a time: while it goes Send is off, and Enter sends only what Send would;
- once recorded, the bar clears only if it still holds what was sent; words written meanwhile stay;
- **no reply:** «Not confirmed: “…”» names the message, and Try again (or Enter) resends it with the same key;
- **refused:** the API's words.
- It is never sent to Sophia, and never starts work.

**Who:** members. A guest's room has no Studio chat (GuestRoom), so nothing changes for guests.

## Out of scope

- Threads, and a message about a report version (`threadId`, `artifactVersionId`): later, with the passage bar's «Discuss»;
- editing or deleting a sent message (the API has no such write).

## Checks (written first)

- **Browser** (`e2e/room-discussion.spec.ts`):
  - out of Sophia's conversation, the bar writes to the room: the request (intent, text, key), the message in Chat with its author, the draft cleared;
  - holding the floor in her conversation, the switch picks Sophia or the room, and each message goes only where it says;
  - no reply: «Not confirmed», and Try again resends with the same key, and the message is recorded once;
  - Enter sends; Shift+Enter starts a new line.
- **Units** (`discussion-view.test.ts`): which target the bar offers and starts on, and its words.
