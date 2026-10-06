# Implementation-session handoff

Goal and attempt: start a conversation, continue one (`docs/plans/project-conversation-writes.md`), attempt 1. It is Davide's vision, chapter 2 «Converse», the writes after the reading (#133), behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `project/conversation-writes` on `project/conversations` (#133), rebased onto its `1d92163`, 2026-10-06
Ending commit/tree: six commits on `project/conversation-writes`, read one by one (a merge ref or a squash folds them into one):

- `3a85747` «Project conversations: start one, continue one (Davide's chapter 2)», the content;
- `5327e22` «Conversation writes: the review's findings»;
- `44ff04a` «Conversation writes: the view clears a draft, not the field»;
- this handoff's own commit;
- `c47e6d5` «Conversation writes: what the first local run found»;
- «Conversation writes: mutants run», the slow-send check and this evidence.

## Outcome

**Continue a conversation:** a field under its messages, with «Ask Sophia» (on) and Send.

- Enter sends; Shift+Enter starts a line, and the message keeps its lines.
- **Sent:** the message is listed last as «You», and the conversation goes to the top.
- **Sophia asked:** «Sophia is answering…» shows until an answer of hers written after then is listed (read as the feed moves). After two minutes it says her answer will show when it comes.
- **Drafts:** kept per conversation.

**Start a conversation:** «New conversation» toggles a form: question, first message, «Ask Sophia».

- Start is unavailable until both are written. Started, the conversation opens at the top, and the focus moves to its title once.
- A row pressed with the form open opens that conversation; the form's words wait for it.

**One intent, one key:** the key and words of a message or a start are held by the view (`held-write.ts`), not by the field or the form. With no reply it says «Not confirmed», and the press sends it again under its key: one record, even after another conversation was opened or the form put away meanwhile.

- A refusal says why and keeps the words.
- The view clears a draft only if it still holds what was sent.

**Viewers:** no field and no New conversation; one line says they read. Until the membership is read, neither shows.

**Proposed A18 writes:**

- `POST …/projects/{id}/conversations`;
- `POST …/conversations/{id}/messages`.
- Sophia's answer is a later message, as the feed moves.

**Independent review, three passes:**

- **First pass:**
  - One P1, fixed: a spec clicked an `aria-disabled` button, which Playwright waits on.
  - Three P2s, fixed:
    - an unconfirmed message or start lost its key when its part unmounted (switching, Cancel);
    - rows did nothing with the form open;
    - the checkbox took the app's 36 px field style.
  - P3s fixed: the fields' height, multi-line messages, a racy test, the membership's unknown state, the arrival focus, «Sophia is answering…» matched by time with a limit and shown for a start, focus kept on an unknown start (read-only, not disabled), and the fixture requiring a key and the same words for a replay.
  - P3 left: a list read that lags the write could move the open conversation (the fixture's list is consistent).
- **Second pass:**
  - One P2, fixed: a slow send could clear words written after coming back, because the field compared its last words.
  - P3s left:
    - a send or start that finishes after its part is gone loses «Sophia is answering…» or the start's refusal;
    - any later answer of Sophia's ends the wait (matching the message she answers needs an API field).
- **Third pass:** the P2 fix confirmed; no new P1 or P2.

## Evidence

- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.
- **Unit:** `conversation-list.test.ts` and `route.test.ts`: 20 of 20.
- **Browser:** `project-conversation-writes.spec.ts` and `project-conversations.spec.ts`, 24 of 24 under the guard once the machine was free. The first local run found three things CI would have:
  - the room fixture read its send option before defining it, so the page didn't load;
  - its refusal's request id wasn't one the client accepts;
  - the reading spec's 24 px rule counted the new checkbox.
  - All three are fixed in «Conversation writes: what the first local run found».
- **Mutations:** 7 of 7 killed, and the control survives:
  - a second key after no reply;
  - viewers given the field;
  - «Sophia is answering…» never ending;
  - a row pressed leaving the form;
  - Start with a field empty;
  - the held intent forgotten on a remount;
  - the draft cleared with words written since.
  - The last survived at first: no check wrote while a message was on its way. A slow send (`send=slow`) and that check were added.

**Source-register IDs consulted:** none.

## Remaining obligations

- Davide: A18's writes on issue #105 (asked first), and the retention contract.

## Next bounded action

Davide's chapter 7 «Connect»: a read-only grant to an external assistant, and a project-safe update to Slack, shown before anything goes.
