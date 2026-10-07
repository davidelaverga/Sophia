# Room: who follows what is shown

> 2026-10-06 · Luis · PR 17 of the room's $20 plan, behind the vision flag (A14, issue #105) · "Construye todo y lo que no tenemos para api que se haga por fixtures"

## The gap, measured

Showing a report to the room, the person showing it can't tell whether anyone is looking. Meet tells a presenter who is watching; A14 proposes «2 following». That needs no table: following stays each device's own (04_FRONTEND:23).

## What changes

**Each member says what they follow:** under the vision flag, while in a call, a member sends the version they follow, or nothing, in a reliable data packet on its own topic (`sophia.following.v1`).
- **To whom:** the members only, never a guest.
- **When:** only when it changes. It is said again to whoever joins, and to all when the connection comes back.
- **How it is read:** by the sender the SFU authenticated, so nobody can speak for another. A guest's packet is ignored, and a sender who leaves is forgotten.

**Not a participant attribute.** A14's note suggested one. Setting one's own attributes needs the token's `canUpdateOwnMetadata`, which also lets a participant rewrite their own metadata: the standing the API signed, which the media bridge trusts. That grant was refused on purpose (SMC-M03 contract binding), and this keeps it refused. Nothing is asked of the API.

**The report on the stage counts them, for whoever shows it:** «Shown by you · 2 following», announced politely as it changes. The count is everyone else in the call who said they follow the version shown. With nobody following, it says nothing. A follower sees no count; for them it would be ambiguous.

**Fixture:** `window.fixture.followers([1, 2])` has those fake people follow the shown version. What the page says is recorded as `following:<version>`, once per change.

## Out of scope

- Who exactly follows, by name: the count is enough for a presenter, and names are already in the people strip.

## Checks (written first)

- **Browser** (`e2e/room-following.spec.ts`):
  - showing a report, two followers show as «2 following», and one leaving it as «1 following»;
  - following someone's report says its version once, and Stop following says nothing once; a follower sees no count.
