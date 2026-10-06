# Implementation-session handoff

Goal and attempt: several conversations, one project (`docs/plans/project-conversations.md`), attempt 1. It is Davide's vision, chapter 2 «Converse», behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `project/conversations` on `main` `5281915`, 2026-10-06
Ending commit/tree: five commits on `project/conversations`, read one by one (a merge ref or a squash folds them into one):

- `2ab4ed7` «Project: several conversations, one project (Davide's chapter 2)», the content;
- `ffa54b5` «Conversations: the review's findings»;
- `a479ea3` «Conversations: the context keeps what it read when a later read fails»;
- this handoff's own commit;
- «Project conversations: mutants run», the filter's check and this evidence.

## Outcome

**«Conversations»,** a project view after Studio, under the vision flag only. Without the flag the tab isn't there (`viewsShown`, unit-tested), and its address says «Coming».

- **The list:**
  - newest activity first;
  - who actually wrote there («Lucía, You · Sophia»), and the open questions;
  - a filter by title that takes every word.
  - Each row is named by its title; the rest describes it.
- **The open conversation:**
  - It is the newest at first, then kept: another moving to the top never takes its place (nor after one leaves the list).
  - Sophia's summary («No summary yet.» without one).
  - Its messages, oldest first, a page at a time. Earlier messages reads the page before, and when it goes the focus moves to the first message.
  - The report it made, opening in the document viewer.
  - How its context works, as a disclosure.
- **Project context,** from the brief Sophia reads (`getMission`, the same read as the room's mission panel):
  - the mission and its purpose;
  - the three newest accepted decisions, then «and N more»;
  - what is still open, apart.
  - One query, read again as the feed moves: a later read that fails keeps what was read and says it may be out of date.
- **Reads fail separately:** the list, a conversation and the context each say so, with Try again.
- **Reading only:** starting and continuing a conversation come next.

**The proposed API, A18** (in `src/api/vision.ts`, each answer checked against its shape):

- `GET /api/v1/projects/{id}/conversations`;
- `GET /api/v1/conversations/{id}/messages?before=`.

**For Davide:** saved text conversations need their own retention contract.

**Independent review, two passes:**

- **First pass:**
  - One P1, fixed: the spec expected the wrong first message of the newest page.
  - Three P2s, all fixed:
    - the open conversation changed as another moved to the top;
    - the focus fell to the page after the last earlier page;
    - the context went stale silently after a later read failed.
  - P3s fixed: 24 px text buttons, the filter's every word, short row names, what is still open capped, the views shown tested, the fixture refusing cursors it never gave and serving the view only when asked, comment drift, a locale-free unit test, the sort hoisted.
  - P3 left: the view's head uses its own `h2` rather than `.view-head`.
- **Second pass:**
  - One P1, fixed: with the feed's cursor in the context's query key, a later read that failed lost the context entirely (TanStack v5 keeps placeholder data only while pending). The context is one query, read again as the feed moves.
  - No P2.
  - P3s fixed: the open conversation is kept after one leaves the list, work.html keeps off the view it doesn't serve, the pending order is tested, and the fixture's clock is fixed.
- **Third pass:** the P1 fix confirmed; no new P1, P2 or P3.

## Evidence

- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.
- **Unit:** `conversation-list.test.ts` and `route.test.ts`: 18 of 18.
- **Browser:** `project-conversations.spec.ts`, 11 of 11 under the guard, once the machine was free (at first the guard wouldn't start beside a game, and the floor wasn't lowered).
- **Mutations:** 8 of 8 killed, and the controls survive. In the browser:
  - the list oldest first;
  - Sophia named where she didn't answer;
  - mine not said as «You»;
  - the open one following the top;
  - Earlier messages dropping the focus;
  - the context keyed by the cursor (the second pass's P1).
  - The filter taking any word survived the browser checks at first: «briefs short» finds the same either way. The unit test killed it, and the spec now also tries «short release» (one word in each of two titles), which kills it.
- **Unit:** the tab shown without the flag (`viewsShown`).

**Source-register IDs consulted:** none.

## Remaining obligations

- Davide: A18 on issue #105 (asked first), and the retention contract.

## Next bounded action

Starting and continuing a conversation, with Sophia's answer (A18's writes).
