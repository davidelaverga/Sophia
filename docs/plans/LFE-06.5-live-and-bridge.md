# LFE-06.5: Resources live, one with Tasks, and capacity that says what comes

Luis's strict review of Resources ("would you pay $20 for this?") found it a fine status panel that only reports.
Three changes follow from it:

- It stands still next to Tasks, which is now live.
- It doesn't connect to the tasks its sessions run.
- Its capacity reads numbers but doesn't say what comes.

## What changes

1. **Live tiles.**
   - While a session works, its tile says what its tool last reported, under the task: "Reading ReportPane.tsx", then
     "6 s ago" at the line's end.
   - **When a report is live:** while its host is online and the report is younger than two minutes (`reportsLive`).
     Then the dot pings, and the owner's picture wears the board's freshness ring, which empties over those two
     minutes. The dot and the ring are amber while the session waits.
   - **Once it isn't:** the report is still said, with a still grey dot and no ring.
   - The sheet says each session's last report under its row.
   - The view's clock ticks each second only while some report is live, and each minute otherwise. Changing pace never
     moves it back.
   - The words come from the proposed `Session.activity`, and never from the tool's reasoning.
2. **One with Tasks.**
   - In a resource's sheet, a session's task is a link to it on the Tasks board (`#task-<id>`), when it is on the board.
     The host says which tasks are (`tasks.has`). Other work stays a plain title.
   - In a task's sheet, whoever does it is a link that opens their resource (`#resource-<id>`), when the host passes
     the way across (`onOpenResource`).
   - A task's sheet puts itself in the address, as a resource's sheet does. Closing it, a new revision without it, or
     leaving the board takes the address away.
   - An address that names a task chooses its goal and opens the task. That happens:
     - when the page opens;
     - when plans arrive later;
     - each time a link is followed within the page (`hashchange`).

     A goal chosen from the rail holds until then.
   - The links are announced with where they go: ", open in Tasks" and ", open in Resources".
3. **Capacity that says what comes.**
   - A window known to apply that runs out before it resets, at its pace (`pace.ts`), heads the capacity, even when
     another is fuller. The tile says when, in amber: "5-hour · 81%", then "out in ~34 min".
   - When the account runs short, the sheet names a resource with room. A resource has room when:
     - it is online, on another account;
     - its percentage window is under 75 %;
     - it isn't running out itself.

     The owner's own resources come first. Show opens it, and the focus stays in the sheet.
   - It only shows. Moving work is the lead's (LFE-07.3), and nothing here assigns.
4. **The tile's capacity in fewer words, never cut off:**
   - a percentage window reads "5-hour · 63%", then "resets in 55 min";
   - a balance reads "820 credits left", then "resets in 9 h".

   The sheet and the tile's description keep the full line.

## Out of this slice

- Acting from Resources: Hold, Stop and guidance (LFE-06.4).
- Answering requests in place.
- "While you were away" for Resources.

## Proposals

These are the same fields LFE-07.1 asks for:

- `Session.activity {said, observedAt}`;
- `session.activity` events.

The links between views need nothing from the backend. A host only says which tasks are on its board.

## Checks

- **Unit** (`room.test.ts`):
  - when a window runs out, and "now";
  - the window that limits first;
  - the tile's short line, for a percentage and a balance;
  - which session speaks, and when a report is live;
  - which resource has room, and when none does.
- **Browser:**
  - live tiles and the ring: its shape, its fineness and its column;
  - a stale or offline report going still, and the clock never stepping back;
  - each link both ways, and plain titles where no board has the task;
  - a task from the address, when the page opens and when a link is followed;
  - the out-in line, the room line and Show's focus in `tight=1`;
  - the phone sheet with a live line.
- **Mutations:** each check above must fail when its rule is broken.
