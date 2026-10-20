# Implementation-session handoff

Goal and attempt: FND-C63-SEARCH-PRIVATE-BOUNDARY-01 (automatic CODE finding 4320587071 on #452), attempt 1
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `551bc38e…`) / Claude Code lane C
(transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-19/sophia-task-revalidation`, branch
`fix/search-private-boundary-20261020-c63`, from Search `3274560cc4d8a2a0ccfec11bad00d3fe180b1e3e` (tree `c1adab56…`)
Writable scope: `packages/persistence/src/search.ts`, `apps/api/src/search.db.test.ts`, this record. No route,
contract, SQL, migration, name, Studio, Task or Personal change.
Runtime unit: own PostgreSQL 17.11 on 127.0.0.1:55499 (fresh, stopped after); synthetic HS256 members. Not pushed.

## Finding, shown

- A message hit's `before` is the next message, the end of the chat page that opens on the hit. It was chosen from
  every contribution of the project, with no regard to whether this reader may read it.
- On 327: member B found B's own message. Its `before` was A's next message, which shared A's private source and is
  hidden from B's chat. So B learned that message's id and its place in the order, instead of B's next visible message.

## Correction

- `before` is now the next message this reader's chat shows, by the discussion page's own rule:
  - withdrawn (its tombstone, kept as before, as the existing case «names the message after a found one, in any state»
    requires); or
  - current, with words this reader may read: its source readable by search's `READABLE` (own, or project scope,
    eligible and ready), with its text.
- Order, ties and null (no later message) are unchanged. Nothing else in the query changes.

## Evidence (P's journal, `C63-logs/`)

- New case «names as the next message only one this reader may read…»:
  - members A and B; B's hit; then A's private-source message and A's project-source message made ineligible (both
    hidden from B's chat, checked first); then B's visible message.
  - B's `before` must be that visible message, and B's chat page before it must end at the hit. A's `before` is A's
    private message, which A reads.
- 327 (10-, 11-: the final test bytes): FAIL. B's `before` was A's hidden private message id.
- Fixed: PASS (20-). Whole `search.db.test.ts` 12/12 (30-), including the withdrawn-boundary case.
- oxlint 0, prettier ok, `tsc` for persistence and API 0.
- Not run: the full DB aggregate, `pnpm check`, browser. The Studio's jump was not exercised in a browser.

## Addendum (R2's sealed triage)

- R2 independently supports the same subquery and the same canonical projection, with withdrawn tombstones kept.
- It names one assertion the first case did not make: no boundary (null) when only messages hidden from the reader
  follow the hit. Added as «names no next message when only messages hidden from this reader follow the hit».
  - On 327 (70-, the same final test bytes): FAIL, B's `before` was A's hidden message id.
  - Fixed: PASS. Whole `search.db.test.ts` 13/13 (71-). oxlint 0, `tsc` API 0.
- Product code is unchanged by this addendum: test only.
- Not added: an explicit equal-microsecond UUID tie-order control. Tie order is unchanged by the fix (same
  `(created_at, id)` comparison and `ORDER BY`), but not separately asserted.

