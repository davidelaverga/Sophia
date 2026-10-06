# Project conversations: start one, continue one

> 2026-10-06 · Luis · Davide's vision, chapter 2 «Converse», the writes after the reading (#133), behind the vision flag · "Continúa y encola"

## The gap, measured

#133 lists the project's conversations and reads them; nothing there writes. Davide's chapter has «Continue this question with the team» under each conversation and a «New conversation» beside the list: each question gets its own place, and Sophia answers there with the project's context.

## What changes

**Continue a conversation:** under its messages, a field («Continue this question with the team»), «Ask Sophia» (on), and Send.

- Enter sends; Shift+Enter starts a new line. Send is unavailable (aria-disabled) while the field is empty or a message is on its way.
- **Sent:** the message is listed last, as «You», and the conversation moves to the top of the list. The field clears only if it still holds what was sent.
- **Asked Sophia:** «Sophia is answering…» until her answer is listed. It comes later, through the project's feed; the list and the open conversation are read again as the feed moves.
- **Each draft is kept per conversation** while the view is open: opening another and coming back finds it.

**Start a conversation:** «New conversation» above the list opens a form in place of the open conversation:

- «Question» (the title, up to 120 characters) and «First message»;
- «Ask Sophia» (on);
- Start, unavailable until both are written; and Cancel, which returns the focus to New conversation.
- **Started:** the conversation opens, at the top of the list, with the first message.

**A message is one intent with one key** (`useAdmission`):

- With no reply, it says «Not confirmed: “…”», and Send sends that message again under the same key. It is never recorded twice, and never a second message.
- A refusal says why and keeps the words.

**Viewers read; they don't write.** For them, no field and no New conversation, only «Viewers read conversations; members write in them.»

**Only under the vision flag**, as #133.

## The proposed API (A18 writes, issue #105)

- `POST /api/v1/projects/{projectId}/conversations` `{ title, text, askSophia }` → `{ conversation: ConversationSummary, message: ConversationMessage }`. Once per Idempotency-Key; viewers are refused (`forbidden`).
- `POST /api/v1/conversations/{id}/messages` `{ text, askSophia }` → `{ message: ConversationMessage, sophia: 'asked' | 'not_asked' }`. Once per key.
- Sophia's answer is a later message in the same conversation. The project's feed moves when it lands (`conversation.updated`), as for any record.
- Answers are checked against these shapes (`vision.ts`), or they are errors.

## Out of scope

- Renaming, archiving or leaving a conversation.
- Sophia reading another conversation on request («retrieved deliberately»).
- Who has read what (unread marks).

## Checks (written first)

- **Browser** (`e2e/project-conversation-writes.spec.ts`):
  - a message sent is listed last as You, once, and the conversation moves to the top; the field clears;
  - asked, «Sophia is answering…» shows until her answer is listed, after the feed moves;
  - not asked, no answer is waited for;
  - Send is unavailable with an empty field; Enter sends, Shift+Enter doesn't;
  - a lost reply says «Not confirmed», and Send sends it again under the same key: one message recorded;
  - a refusal says why and keeps the words;
  - a draft is kept when another conversation is opened and this one again;
  - New conversation: Start unavailable until both fields are written; started, it opens at the top with its first message; Cancel returns the focus;
  - a viewer has no field and no New conversation, and is told why;
  - controls are at least 24 px and the text keeps to the scale with the form open.
