# LFE-06.6: acting from Resources, and Tasks warned when an account runs short

The second round of Luis's strict review of Resources ("what else can we do?") chose two things.

## What changes

1. **Act from Resources.**
   - Each session at work has **Act** under its role, level with its task. It is offered only to its owner, and only
     where its route supports some act.
   - It opens the acts under the row: guidance, Hold and Stop, as the route supports each. Stop asks first.
   - Each act is said step by step, as it is observed: Recorded, then Queued, then Delivered. It is never "applied":
     "Delivered to its session. Not seen acting on it yet."
   - It is the task's sheet's "Act on it" (LFE-07.1), now one shared piece (`SessionActs`) that both sheets use.
   - The panel takes an optional `onAct` (session id, act, a report of each step). Without it, nothing is offered.
   - **The view keeps each session's last act** (`useActs`, in the panel and on the board):
     - it is still said after its row closes or the sheet turns (J, K);
     - a late step of an earlier act never speaks over the latest one;
     - guidance stays in its field until it is queued, so one not accepted can be sent again.
   - **Focus:** after Stop is confirmed or kept, it comes back to Stop (`ConfirmButton`, for every use of it), so J and
     K go on working.
   - Act's tip names the acts its route supports ("Hold or Stop").
   - At phone width, the row keeps to one column with its acts open.
   - Escape in the guidance field closes the sheet, as anywhere in a sheet.
2. **Tasks warned when an account runs short.**
   - A task whose session is at it (waiting, working or queued) says on its tile when its doer's account runs short:
     "Account out in ~34 min", in amber, after a small gauge.
   - Its sheet says it whole ("Its account runs out in ~34 min.") and names a resource with room ("Your Codex has
     room: 5-hour at 42%"). Show opens that resource.
   - The words and the rule are Resources' (`room.ts`: `shortWords`, `shortTileWords`, `roomElsewhere`), applied by
     `account.ts`, which says nothing for a finished or checked task, even one its session still holds.
   - The dot of a task's last report is amber while it waits, in its sheet as on its tile.
   - The board takes optional `observations`. Without them, nothing is said. It only shows: moving work is the lead's
     (LFE-07.3).

## States

- **Act:**
  - closed, then open;
  - an act at Recorded, Queued, Delivered or refused;
  - Stop asking, then kept or sent;
  - not the owner, or nothing at work: none offered.
- **A short account:**
  - out in N, out now, or past the full line;
  - fine: nothing said;
  - no readings: nothing said;
  - a task no session is at: nothing said.

## Proposals

- `POST …/assignments/{id}/commands` (#63's endpoint 5) serves both sheets.
- The capacity readings are SCM-02's.

## Checks

- **Browser:**
  - the owner acts from the row, and each step is said;
  - Stop asks;
  - only supported acts, and no Act for anyone else or for a session with nothing at work;
  - a short account said on its task only, with room and Show;
  - nothing said at the usual pace.
- **Unit:** the few words, in both lengths, and "now".
- **Mutations:** each check above must fail when its rule is broken.
