# Room: approve a version, or ask for changes

> 2026-10-06 · Luis · PR 18 of the room's $20 plan, behind the vision flag (a proposed A16, issue #105) · "Construye todo y lo que no tenemos para api que se haga por fixtures"

## The gap, measured

A report Sophia made is read, discussed and shown, but the team has no way to say «this one is good» or «not yet: change this». Today an approval is a chat message, and a change is a new request typed from scratch, which loses which version it was about. Docs, Figma and Linear all close the loop where the work is.

## What changes

**A review row in the report pane, under its head,** for the version on screen. It shows only under the vision flag, and it is mounted once per version, so nothing of one version's review (its key, an open ask, its words) reaches another.
- **Editors and admins** see «Approve v2» and «Request changes». After a review, they keep the other choice: «Request changes» after an approval, «Approve» after a request.
- **Approve** records it at once: «Approved by you.»
- **Request changes** opens one field, «What should change?».
  - Send records it with the words, and the row says: «Changes requested by you: “Shorten the conclusion”. Sophia is revising.»
  - «Sophia is revising» is said only on the newest version.
  - Send needs words; without them, the field says so.
  - Cancel closes the field and keeps the words, and the focus goes back to Request changes.
- **Each version's latest review** shows to every member who opens it, read again as the feed moves. Viewers see it, but not the buttons.
- **One key per press** (useAdmission). A recorded review moves the focus to the row's words.
- **With no reply,** the row says «Not confirmed. Try again.», and only that same press is offered: «Try again», which resends the same request.
  - Its own record arriving with the feed settles it.
  - Another member's review doesn't, because it says nothing of whether mine landed.
- **A refusal** says the API's words, until a review arrives.

**What follows a request:** Sophia revises. Her next version arrives live, as any version does (#109), and that version has no review yet.

**API (proposed as A16, [posted to #105](https://github.com/davidelaverga/Sophia/issues/105#issuecomment-6010589410)):**
```ts
POST /api/v1/artifacts/{artifactId}/versions/{versionId}/reviews   Idempotency-Key
     { verdict: 'approved' | 'changes_requested'; note?: string }   → 201 VersionReview
GET  /api/v1/artifacts/{artifactId}/versions/{versionId}/reviews    → { reviews: VersionReview[] }   // newest first
type VersionReview = { reviewId; verdict; note: string | null; by: string; at: string }
// changes_requested admits a revision task for Sophia (her research's revise); editors and admins only; guests 403
```

**Fixture:** reviews are kept per version, once per key (on that version).
- `loseNextReviewReply()`: the review lands, but its reply and event don't arrive.
- `dropNextReview()`: it never reaches the API.
- `reviewAs()`: another member reviews.
- `reviseLive()`: publishes the next version (#109).

## Out of scope

- Undoing a review, and a review's history beyond the latest: the API keeps them all, and the row shows the latest.
- Reviewing from Knowledge's list: the pane is where the version is read.

## Checks (written first)

- **Browser** (`e2e/room-review.spec.ts`):
  - Approve records it once and says so; the buttons go;
  - Request changes needs words, records them, and says Sophia is revising; her next version is then offered live;
  - a viewer sees the latest review, and no buttons;
  - with no reply, only Try again is offered, and it records once;
  - another member's review never settles a press that had no reply; its own record, coming with the feed, does;
  - each version has its own row: an ask left open on v2 doesn't follow to v1;
  - Cancel keeps the words, and gives the focus back.
