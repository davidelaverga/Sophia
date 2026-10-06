# Implementation-session handoff

Goal and attempt: follow-ups to Codex on #133 and #134 (`docs/plans/project-conversation-follow-ups.md`), attempt 1, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `project/conversation-follow-ups` on `project/conversation-writes` (#134) `c27dc64`, 2026-10-06
Ending commit/tree: three commits on `project/conversation-follow-ups`, read one by one (a merge ref or a squash folds them into one):

- `5786579` «Project conversations: follow-ups to Codex on #133 and #134»;
- `98c084e` «Conversation follow-ups: Sophia's wait by this page's clock»;
- this handoff's own commit.

## Outcome

**Nothing under way is lost when the view goes.** It is kept per project and account while the Studio is open (`talk-store.ts`):

- drafts;
- a message on its way, or with no reply (its key and words);
- a refusal that answered it meanwhile;
- the wait for Sophia;
- the start's words, intent and refusal.

On returning from Tasks, from the room or from another conversation:

- a message with no reply goes again under its key;
- a refusal that came meanwhile is said;
- Sophia is still awaited where she was asked.

A plain message never ends an earlier wait. Everything kept is forgotten whenever the account changes (leaving, switching, another tab, an ended session).

**An accepted message shows at once** (the receipt's, in the newest page), and stays should reading the conversation again fail.

**The missing states:**

- reading the context;
- a conversation nobody has written in;
- a transcript gone out of date.

**On its way:** Send says «Sending…» and Start «Starting…», with the slow note after six seconds.

**Starts and the feed:**

- A start that lands after the person moved on is listed, but never pulls them into it.
- The fixture can start an empty project's first conversation.
- The first feed position learned counts as a move.

**Sophia's wait counts by this page's clock:** her answer is matched by the server's time, how long she has taken by the page's own, never the two mixed.

**Independent review:**

- **First pass:**
  - one P1, fixed: the late note compared the server's time with the browser's, so it showed at once (in the fixture, and with any clock skew);
  - P3s fixed: forgetting on any account change, and the form's open state set after commit;
  - P3 left: the first defined cursor costs one extra read when the view mounts before the snapshot.
- **Second pass:** the P1 fix and the P3s confirmed; no new P1, P2 or P3.

## Evidence

- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.
- **Unit:** `conversation-list.test.ts` (with `withMessage`), 14 of 14.
- **Browser:** `project-conversation-follow-ups.spec.ts`, 8 of 9 locally before a game opened.
  - The 9th failed on the review's P1 (not on timing, as first thought), and is fixed.
  - The full run (this spec, writes and reading) is CI's: the guard refuses beside the game (5.7 GB free, under its 8 GB floor), and the floor isn't lowered.
  - The first full run here found a fixture constant read before it was defined (the room page didn't load), fixed.
- **Mutations:** deferred to a free machine.

**Source-register IDs consulted:** none.

## Remaining obligations

- Mutants, with a control, when the machine is free:
  - the kept intent forgotten on a trip away;
  - a refusal not kept;
  - a plain message ending the wait;
  - the receipt not put in the page;
  - the empty and out-of-date states;
  - a start pulling the person in;
  - the late timer by the server's clock.

## Next bounded action

Merge the open stack as CI and Codex allow (#134, #136, #137), then this.
