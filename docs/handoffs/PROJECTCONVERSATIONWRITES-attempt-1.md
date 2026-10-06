# Implementation-session handoff

Goal and attempt: start a conversation, continue one (`docs/plans/project-conversation-writes.md`), attempt 1. It is Davide's vision, chapter 2 «Converse», the writes after the reading (#133), behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `project/conversation-writes` on `project/conversations` (#133) `7a9d030`, 2026-10-06
Ending commit/tree: four commits on `project/conversation-writes`, read one by one (a merge ref or a squash folds them into one):

- `fc6cd42` «Project conversations: start one, continue one (Davide's chapter 2)», the content;
- `c8cf524` «Conversation writes: the review's findings»;
- `207262c` «Conversation writes: the view clears a draft, not the field»;
- this handoff's own commit.

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
- **Browser:** `project-conversation-writes.spec.ts` (13 tests) runs in CI. The guard wouldn't start here (6.5 GB free beside a game, under its 8 GB floor), and the floor isn't lowered.
- **Mutations:** deferred to a day with no game open.

**Source-register IDs consulted:** none.

## Remaining obligations

- Mutants, with a control:
  - a second key after no reply;
  - the draft cleared with words written since;
  - viewers given the field;
  - «Sophia is answering…» never ending;
  - a row pressed leaving the form;
  - Start available with a field empty.
- Davide: A18's writes on issue #105 (asked first), and the retention contract.

## Next bounded action

Davide's chapter 7 «Connect»: a read-only grant to an external assistant, and a project-safe update to Slack, shown before anything goes.
