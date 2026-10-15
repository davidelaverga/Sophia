# Implementation-session handoff

Goal and attempt: DISCUSSION-EARLIER (the room's chat reads back past its last 50 messages; point 7 of the gaps
report; Luis: «Sigue con los puntos del informe que necesitan API»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `api/discussion-earlier` from `api/project-leave`
(stacked, so the contract's generated files and amendment numbers stay in one line)
Writable scope: this worktree only (`packages/contracts`, `packages/persistence`, `apps/api`, `apps/studio`,
`docs/plans`, `docs/handoffs`); no migration, no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record (Docker Desktop doesn't start on the host, so the DB suites run in CI only).
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `ac34759b61a4` (tree `c15d70709fb0`), the last commit of `api/discussion-earlier`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 20 files changed against
`api/project-leave` at that commit: `apps/api/src/api.db.test.ts`, `apps/api/src/routes/projections.ts`, `e2e/discussion-earlier.spec.ts`, `fixtures/data.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/api/client.ts`, `src/app/theme.css`, `src/features/conversation/Conversation.tsx`, `src/features/conversation/EarlierDiscussion.tsx`, `docs/plans/discussion-earlier.md`, `packages/contracts/amendments/A23-discussion-earlier.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/native-tasks.ts`. The review notes below name the commit of each later change.

## Outcome

- **A23:** `GET /api/v1/projects/{projectId}/discussion?before={entryId}` returns `DiscussionPage` `{ entries, before }`.
  - Entries come oldest first, at most 50: the newest without `before`, or the ones just older than that entry with
    it.
  - `before` is the page's oldest entry while older ones remain, and null at the first message.
  - It is for members only, as the snapshot is (403). An anchor the discussion doesn't hold is 422.
- **Persistence:**
  - `readDiscussion` and `readDiscussionPage` share one query, with the anchor optional.
  - The page reads one entry more than it returns, to know whether older ones remain.
- **Studio** (`EarlierDiscussion.tsx`):
  - With 50 messages in the window, «Earlier messages» reads a page. The page goes above, and the reader keeps their
    distance from the bottom.
  - Every message seen stays once a page is read, so the snapshot's moving window leaves no gap.
  - At the first message, the chat says «The start of the room's chat».
  - A failed read says so, with Try again.
- **Fixture:** the snapshot holds the last 50, as the API's. `discussion=N` seeds N messages, and
  `window.fixture.failEarlier()` fails the next read.

## Evidence

- Plan: `docs/plans/discussion-earlier.md`.
- Written first and failing (commit `87e52f70`):
  - the API cases in `api.db.test.ts` (120 messages in pages of 50, 50 and 20; refusals);
  - `discussion-earlier.spec.ts`. Run without the change, 3 of its 4 cases failed (no «Earlier messages»); the 4th
    says nothing is offered under 50.
- **After the change, locally:**
  - `discussion-earlier.spec.ts`: 4/4;
  - room chat replies and message links: 21/21 with it;
  - room discussion, voice chat, so far, return, recap, conversation acts and honest room: 74/74 including the
    capture;
  - type-aware lint over the whole repo, typecheck, Prettier and `contracts:check` are clean.
- **Not run locally:** the DB suite. CI runs it.

## Remaining obligations

- CI; Codex with no open P1. It merges after the leave PR, retargeted to `main`.
