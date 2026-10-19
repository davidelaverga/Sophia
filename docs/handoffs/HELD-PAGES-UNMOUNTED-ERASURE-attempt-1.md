# Implementation-session handoff

Goal and attempt: HELD-PAGES-UNMOUNTED-ERASURE (R-B60-P1 on `83c168498`; P's bounded-safety addendum), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session B in worktree `sophia-mentions-common`
Starting commit: `83c168498`, branch `fix/common-event-provenance-cap-20261019-b60`
Writable scope: `held-pages.ts`, the snapshot cursor passed by `Conversation.tsx` through `EarlierDiscussion.tsx`, their
checks, this handoff. No API, schema or contract change.

## What was wrong

With the chat let go (another view), an erasure taken by the feed was kept only in the store. When 200 other changes
followed, the store let everything go but the last one, the erasure with it, before any chat learned its source. Back
in the Studio, with the snapshot's reads failing, the old snapshot's words of the message and its alias showed.

## Change

- Past KEPT the store lets the other changes go but keeps the erasures (the newest KEPT), with the ids they name; a
  resync is still counted. Their sources are still owed to the next chat.
- If erasures themselves go past KEPT, the store keeps one value, `lostAt`: the latest cursor of one let go. Until the
  chat shows a snapshot at that cursor or later (`untrusted`), it shows none of the window's messages; a snapshot as new
  as the lost erasure releases it. `Conversation` now passes the snapshot's cursor (`useEarlierDiscussion`'s fifth
  argument is `{ withdrawn, cursor }`).
- Checks: the R-B60-P1 and R-B57-P1 cases proved the overflow by the erasure being gone from the store, which is what the
  fix keeps; they now prove it by the resync counted and the earlier mentions let go (a separate test-only commit, run
  on both products with the same final bytes).

## Evidence

On `83c168498` with the final test bytes: the two cases with the snapshot failing (correction, withdrawal) showed the
erased words; their fresh-snapshot controls and the R-B57-P1 guards passed. After: the whole discussion spec 50 of 50;
units, among them the store's bound and `lostAt`/`untrusted` past more than KEPT erasures.
