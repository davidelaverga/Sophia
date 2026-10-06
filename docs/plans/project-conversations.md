# Project: several conversations, one project

> 2026-10-06 · Luis · Davide's vision, chapter 2 «Converse» («More conversations. One shared project.»), behind the vision flag · "Continúa y encola"

## The gap, measured

A project has one place to talk today: the room, live, and its meetings' recaps after. Davide's chapter asks for the text conversations in between:

- each question in its own place, with its own history and summary;
- the people who actually wrote in it named, never every member;
- the project's accepted direction close at hand, the same for all of them.

«A new thread is not a new team.» Different local histories; the same mission, eligible sources and accepted decisions.

## What changes

**«Conversations»,** a project view after Studio (vision flag only; without it the tab isn't there, and its address says «Coming»).

**The list,** newest activity first. Each conversation shows:

- its title and the start of its summary;
- who wrote in it: «Davide, You · Sophia» (mine is «You»; Sophia only when she answered there);
- what is open: «1 open question», «No open questions».

A filter narrows the list by title, for a project with many. The first conversation is open at first; pressing another opens it (aria-pressed).

**The open conversation:**

- its title, and «Contributors: …» as in the list;
- **«Summary»:** Sophia's, from this conversation's records only;
- its messages, oldest first, each with who wrote it and when. «Earlier messages» reads the page before, when there is one;
- **its output,** when it made one: the report's title and version, which opens the report (the document viewer, as search does);
- **«How conversation context works»,** a disclosure: a conversation keeps its own messages and summary; Sophia's next answer there can also read the project's current mission, decisions and eligible sources; other conversations are read only when asked, never merged.

**«Project context»,** beside it (below it on a narrow screen). It is the same for every conversation, read from the mission (`GET …/mission`, the MissionContext Sophia reads):

- the accepted mission, and its purpose;
- **«Accepted decisions»:** the decided constraints, newest first, three, then «and 2 more»;
- **«Still open»:** what is proposed and not decided, never said as decided.

**Reads that fail** say so, with Try again. The list, a conversation's messages and the context fail separately: one failing leaves the others.

**Only reading here.** Starting a conversation and continuing one (with Sophia's answer) come in the next PR; nothing here offers them.

## The proposed API (A18, issue #105)

- `GET /api/v1/projects/{projectId}/conversations` → `{ conversations: ConversationSummary[] }`, newest activity first.
- `ConversationSummary`:
  - `id`, `title`, `summary` (string or null: none yet), `lastAt`;
  - `contributors: { actorId, name }[]`: who wrote there, not who read;
  - `sophia: boolean`: she answered there;
  - `openQuestions: number`;
  - `output: { artifactId, versionId, versionNumber, title } | null`.
- `GET /api/v1/conversations/{id}/messages?before=` → `{ messages: ConversationMessage[], before: string | null }`, a page, oldest first; `before` reads the page before it.
- `ConversationMessage`: `{ id, author: 'member' | 'sophia', actorId: string | null, name: string | null, text, at }`.
- Every answer is checked against this shape (`vision.ts`, as A12–A17), or it is an error.

**For Davide:** saved text conversations need their own retention contract (how long, who erases); this never records voice or ambient audio.

## Out of scope

- Starting and continuing a conversation, and Sophia's answer there: the next PR.
- Reading other conversations from one (Sophia's «retrieved deliberately»): with the writes.
- Unread marks per conversation.

## Checks (written first)

- **Browser** (`e2e/project-conversations.spec.ts`):
  - the tab is there under the vision flag; the list is newest first, with contributors («You» for mine, Sophia only where she answered) and open questions;
  - the first conversation is open; pressing another opens it, with its summary and messages, oldest first;
  - Earlier messages reads the page before, kept above;
  - the output opens its report;
  - the filter narrows by title, and says when nothing matches;
  - Project context: the mission, three accepted decisions then «and N more», what is still open apart;
  - the list failing says so with Try again, and reads again; a conversation's messages failing leaves the list;
  - no conversations says so;
  - the measured rules (control heights, the type scale) hold.
- **Unit** (`conversation-list.test.ts`): contributors' words, open questions' words, the filter.
