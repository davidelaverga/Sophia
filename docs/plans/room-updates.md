# Updates: since you last looked, and the meetings' recaps

> 2026-10-05 · Luis · PR 12 of the room's $20 plan, behind the vision flag (A13 and A12's Updates list, issue #105) · "Construye todo y lo que no tenemos para api que se haga por fixtures"

## The gap, measured

Coming back to a project, nothing says what changed while the person was away. Updates is a «Coming» placeholder. A meeting's recap shows once, on leaving (#115), and then it is gone. Meet, Zoom and Teams keep every recap where the team can find it later. Linear and Notion lead with what changed since you last looked.

## What changes

Under the vision flag, **Updates** stops being a placeholder. It has two parts.

**«Since you last looked»:** a digest of what changed, built the same way as the recap (A13 `GET /since`). It has the same sections, Decided, Made, Kept, Still open and Work, and each line names who.
- When the person has never looked: «You haven’t looked before: this is everything so far.»
- When there is nothing new: «Nothing new since you last looked.»
- **«Mark as seen»:** writes `PUT /seen` with the digest's last sequence, which the server never lowers. The digest is then read again.
  - With no reply: «Not marked. Try again.» A second press resends.
  - The write is idempotent by nature (never lowers), so it carries no key.
- The digest is read again when the project's feed moves, so a note kept elsewhere shows up.

**«Meetings»:** the project's meetings, newest first (A12 `GET /meetings?limit=10`).
- Each row gives when it was and how long it lasted: «Now · started 10:02» for the running one, «Oct 4, 15:00 · 38 minutes» for a closed one.
- Pressing a row opens that meeting's recap in the same sheet as on leaving. A closed one says so and offers no Close.

**API shape (proposed; [refinements posted to #105](https://github.com/davidelaverga/Sophia/issues/105#issuecomment-6010589410)):** `since` takes `after` as optional; without it, the server reads the viewer's own attention.
```ts
type Digest = {
  fromSequence: string | null   // the viewer's attention; null: never looked
  toSequence: string            // what «Mark as seen» writes
  decided; made; noted; open; work  // A12's items, same builder
}
```

**Fixture:**
- Two earlier, closed meetings.
- The running one, built from the page's own records as in #115.
- `seen` is kept by time, so a note kept after «Mark as seen» is new.

## Out of scope

- A dot on Updates in the nav when something is new: it would need the digest read in every view, so it comes later.
- The late joiner's «meeting so far» (A13 `so-far`): the next PR, on joining.
- Search with citations (A13 `search`): the PR after.

## Checks (written first)

- **Browser** (`e2e/room-updates.spec.ts`):
  - Updates shows the digest with the decision and who made it, and the meetings, newest first;
  - «Mark as seen» writes the digest's sequence once, then says nothing is new;
  - a note kept afterwards appears in the digest without a reload;
  - with no reply, «Not marked» and a second press;
  - a past meeting opens its recap, closed, with no Close;
  - the running meeting opens with Close for an admin.
- **Units** (`updates-view.test.ts`): the digest's lead words and a meeting row's words.
