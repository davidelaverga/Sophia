# Implementation-session handoff

Goal and attempt: HELD-PAGES-EVENT-PROVENANCE-CAP (Codex review 5575972065 on `6a629426f`: 4317389238, 4317389250),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session B in worktree `sophia-mentions-common`
Starting commit: `6a629426f`, branch `fix/common-event-provenance-cap-20261019-b60`
Writable scope: `useProjectFeed.ts` (producer), `held-pages.ts` (store and consumer), their checks, the fixture's event
fields, this handoff. No API, schema or contract change.

## What was wrong

- 4317389238: a chat let go (another view) while the feed took a correction and read the snapshot since learned that
  event again when it came back, and took what it showed (already the corrected revision and its new source) for the
  erased words: the corrected message was hidden.
- 4317389250: the change that went past KEPT (200) was let go with the earlier ones, so a correction or withdrawal that
  was itself the 201st change was never told: its message and aliases kept the erased words while the snapshot lagged.

## Change

- Producer: the feed forwards the event's `entityRevision` (0068: the message's revision after the act) with its
  cursor.
- Store: `Changes.erasedRevision` keeps it per message; past KEPT the earlier changes go but the one that went past is
  kept (one entry), the resync still counted.
- Consumer: `goneOf` takes a message shown at the event's revision or later as already what the act left: its source is
  not erased (unknown, so a held page is let go rather than trusted). Older ones are erased as before.
- Fixture: corrections and withdrawals elsewhere name the revision after the act, as the API's events do.
- The unit check that pinned the cap dropping every change now expects only the last change kept.

## Evidence

On `6a629426f` with the final test and fixture bytes: the four 201st-change cases (correction, withdrawal; lagging,
503) failed with A and B showing the erased words, and the remount case with a fresh snapshot failed with the corrected
words hidden; the lagging remount case and the four at 200 changes passed. After: the whole discussion spec 46 of 46.
The remount uses Knowledge (Work is shown as Tasks); any view but the Studio lets the chat go.
