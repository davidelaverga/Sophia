# Project conversations: follow-ups to Codex on #133 and #134

> 2026-10-06 · Luis · the P2s Codex left on #133 (reading) and #134 (writes), under the no-P1 rule, behind the vision flag

## What Codex found, and what changes

**Nothing under way is lost when the view goes.** The view unmounted on a trip to Work or the room, and with it went:

- the drafts;
- the message on its way, or sent with no reply (its key and words);
- a refusal that came back meanwhile;
- «Sophia is answering…»;
- the start's words and intent.

Opening another conversation lost the last three too. All of it is now kept per project and account while the Studio is open (`talk-store.ts`), and forgotten on signing out or switching identity:

- **Coming back:** a message with no reply is sent again under its key, never as a second one; a refusal that came while away is said; Sophia is still awaited where she was asked.
- **A plain message** never ends an earlier wait for her.

**A message the API accepted is shown,** even when reading the conversation again fails: the receipt's message goes into the page at once, then the conversation is read again.

**States that were missing:**

- the project context while it is read: «Reading the project’s context…»;
- a conversation with no messages: «Nobody has written here yet.»;
- a conversation read before whose next read fails: «This may be out of date.», with Try again.

**While a write is on its way, its button says so:** «Sending…», «Starting…». After six seconds the Studio's slow note follows.

**A start that lands after the person moved on** (another row pressed, the form put away) puts the conversation in the list, but never pulls them into it.

**The first conversation of an empty project** can be started (the fixture's timestamp had no base with none listed).

**The feed's first position** learned after the reads counts as a move: what landed before it is read.

## Checks (written first)

- **Browser** (`e2e/project-conversation-follow-ups.spec.ts`):
  - a message with no reply survives a trip to Tasks and back, and is sent again under its key: one message;
  - a refusal that comes while another conversation is open is said on coming back;
  - Sophia is still awaited after another conversation was opened and this one again;
  - a plain message keeps an earlier wait for her;
  - an accepted message shows even when reading the conversation again fails, and says it may be out of date;
  - a conversation with no messages says so;
  - the project context says it is reading;
  - Send says «Sending…» while on its way;
  - the first conversation of an empty project starts;
  - a start that lands after a row was pressed lists it, and the row pressed stays open.
- **Unit:** the receipt's message into the newest page, once.
