# The room's chat reads back past its last 50 messages

> 2026-10-15 · Point 7 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): the room's chat
> held the snapshot's last 50 messages and nothing before them. In Meet's chat, Slack or Teams, scrolling up reads the
> whole conversation. Luis: «Sigue con los puntos del informe que necesitan API».

## What was measured

- `Snapshot.discussion` holds at most 50 entries (`readDiscussion`, `maxItems: 50`). No route reads further back.
- The room's chat (`Conversation.tsx`) shows those 50, and the oldest goes as new ones come.

## What changes

- **Contract amendment A23:** `GET /api/v1/projects/{projectId}/discussion?before={entryId}` returns
  `DiscussionPage` `{ entries, before }`.
  - Entries are the discussion as the snapshot gives it, oldest first, at most 50: the newest without `before`, or the
    ones just older than that entry with it.
  - The page's `before` is its oldest entry's id while older ones remain, and null at the first message. This is the
    paging A18 proposes for conversations.
  - Members only, as the snapshot: an unknown project and a non-member look the same (403). An unknown `before` is 422.
- No migration: the read uses the snapshot's own query, with the anchor added.
- **Studio:**
  - With 50 messages in the window, the chat's top offers «Earlier messages». Each press reads one page and puts it
    above, keeping the reader where they were.
  - At the first message, it says «The start of the room's chat» instead.
  - Once a page is read, every message seen stays: the snapshot's window moves on as new messages come, and no
    message falls into a gap between the pages and the window.
  - A failed read says so, with a way to try again.

## Checks

- `api.db.test.ts`, «reading the room's earlier discussion»:
  - 120 messages read back in pages of 50, 50 and 20, oldest first, the last with `before` null;
  - the newest page equals the snapshot's;
  - an outsider is refused and an unknown anchor is 422.
- `discussion-earlier.spec.ts`:
  - with 60 messages, the chat shows 50 and «Earlier messages»;
  - one press brings the first 10 above, with the reader kept in place, and the start is said;
  - a new message after the press leaves no gap;
  - a failed read is said, and trying again reads it;
  - with fewer than 50, nothing is offered.
