# Room: the meeting so far, for whoever joins late

> 2026-10-06 · Luis · PR 14 of the room's $20 plan, behind the vision flag (A13's `so-far`, issue #105) · "Construye todo y lo que no tenemos para api que se haga por fixtures"

## The gap, measured

Joining a meeting twenty minutes in, a person has no way to know what was already decided. The others stop to repeat it, or the person asks later. Catch-up for late joiners is a table stake: Zoom's AI Companion and Teams' Copilot both offer «catch me up». The proposal's A13 has the route: `GET /meetings/{meetingId}/so-far` returns a Digest built as the recap is.

## What changes

**On joining a meeting that began more than two minutes before**, the stage shows one card above the dock: «You joined 12 minutes in.»
- **«Catch up»:** opens «The meeting so far» in a sheet, with the same sections as the recap (Decided, Made, Kept, Still open, Work), each naming who. Closed, the card goes: the person has caught up.
- **«Not now»:** the card goes.
- The card shows only when the digest has something. Leaving the call puts it away.
- On a meeting that begins on joining, or within two minutes of it, nothing shows.

**Read once per join, measured from it:** the room records when the call went live, and the meeting and its digest are read once for that join. Both the card and its state live with the room, not with the room's view, so a visit to another view keeps them, and once put away the card stays away.

**Rejoining is not joining late:** a meeting this person was in on this page offers nothing when they join again (a dropped call, Leave and Join again, a visit home between). That holds whether they were in it on time, late, caught up or not.

**Behind the vision flag.** The fixture's `meeting=earlier` makes the running meeting begin 12 minutes before the page, with the fixture's decision in it.

## Out of scope

- Following along live in the digest while in the call: the brief and the chat already carry what happens next.
- A paragraph written by Sophia (decision 2 of #105).

## Checks (written first)

- **Browser** (`e2e/room-so-far.spec.ts`):
  - joining 12 minutes in shows the card. «Catch up» opens the digest, with the decision and who made it. Closed, the card is gone, and the read was made once;
  - «Not now» puts the card away;
  - a meeting that begins on joining shows no card and reads no digest;
  - leaving puts the card away;
  - «Not now» gives the focus to the call's controls;
  - joined from another view, the card counts from the join;
  - rejoining a meeting the person was in (on time, or after Not now) offers nothing.
- **Units** (`so-far-view.test.ts`): the minutes joined in, and the card's words.
