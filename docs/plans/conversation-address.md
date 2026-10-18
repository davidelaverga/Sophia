# The open conversation in the address

> 2026-10-16 · Luis's queue, «Later»: the open conversation in the URL. A goal, a task, a resource and a decision
> already have their own address (`#goal-`, `#task-`, `#resource-`, `#decision-`, link.ts). A conversation doesn't, so
> a link to the project's Conversations always opens the newest one. Slack, Linear and Teams put the open thread in
> the address. Studio only: Conversations sits behind the vision flag until A18 is served.

## What changes

- **`link.ts`:** `CONVERSATION = '#conversation-'`.
- **`ConversationsView`:**
  - **Opening one puts it in the address**, without a new history entry: a row pressed, the form that found an
    existing one, or one asked for from another view.
  - **The address follows the screen.** Opening the form for a new conversation takes it away. So does going back to
    the list on a phone.
  - **The newest, open by default, never writes the address.** A plain link stays plain.
  - **An address that names a conversation opens it,** on a phone too, the same way a request from another view does.
    If it isn't in the list, the existing note says so («The conversation asked for isn't here: the newest is open.»).
  - A fragment under another prefix is left alone.

## Checks

`conversation-address.spec.ts`, on the fixture's conversations:

- pressing «Short or long briefs?» puts `#conversation-<id>` in the address, and the history doesn't grow;
- the newest, open on arrival, leaves the address plain;
- an address naming «Short or long briefs?» opens it;
- on a phone (@phone), the same address shows the conversation alone, and «All conversations» takes the fragment away;
- an address naming an unknown id shows the note, with the newest open;
- New conversation takes the fragment away.
