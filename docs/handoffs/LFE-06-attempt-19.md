# Implementation-session handoff: LFE-06, attempt 19 (Resources live, one with Tasks, capacity that says what comes)

- **Goal and attempt:** Luis judged Resources with his strict test ("would you pay $20 for this?"). The verdict: a fine status panel that only reports.
  - It stood still next to Tasks, which is live since LFE-07.1.
  - It didn't connect to the tasks its sessions run.
  - Its capacity read numbers on a tile without saying what comes, and the tile's line was cut off.

  He asked to build the first three improvements of that review. Design note: `docs/plans/LFE-06.5-live-and-bridge.md`.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/live-bridge`, 2026-10-03, from `lfe-07/plan` (`df4b6f0`, PR #63) with `lfe-06/effort-picker` (`ea0494a`, PR #62) merged in. Both touch the sheet and the tile, and the merge was clean.
- **End:** content commit ``fd6a906``; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: tile, sheet, panel, `resource.ts`, `pace.ts`, `link.ts`, the new `room.ts`, and the stylesheet;
  - `apps/studio/src/features/work/`: the board, the task's sheet and tile, and the goal list;
  - both fixtures and their checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema or API changed.** The panel takes an optional `onOpenTask`, and the board takes an optional `onOpenResource`. Without them, a task is a title and a doer is a name, as in production today.

## Outcome (UI)

- **Live tiles.**
  - While a session works, its tile has a fifth line, quiet: what its tool last reported, and how long ago, to the second ("Reading ReportPane.tsx · 6 s ago").
  - The owner's picture wears the board's freshness ring. It empties over two minutes, and it is amber, like the dot, while the session waits.
  - The sheet says the same under each session at work.
  - **Live** means the host is online and the report is younger than two minutes (`reportsLive`). An older report is still said, with a still grey dot and no ring.
  - The view's clock moves each second only while a report is live, and never steps back when that changes.
  - The ring and the dot are one shared piece (`.live-ring`, `.activity-dot`), used by the board's tiles too.
- **One with Tasks.**
  - In a resource's sheet, a session's task is a link with an arrow when it is on the board (the host says which, `tasks.has`). It opens the task's sheet there. Other work is its title.
  - In a task's sheet, whoever does it is a link: it opens their resource's sheet.
  - A task's sheet puts itself in the address (`#task-<id>`), as a resource's does. Closing it takes it away.
  - An address naming a task chooses its goal in the rail and opens it. It does so when the page opens, when plans arrive later, and when a link is followed within the page (`useAddressed`). A task on no board opens nothing.
  - Closing the sheet takes the address away. So does a new revision without the task, or leaving the board.
  - The links say where they go to a screen reader (", open in Tasks", ", open in Resources").
  - Either link shows only where a host passes the way across.
- **Capacity that says what comes.**
  - The window that runs out first at its pace heads the capacity, even when another is fuller. When a window runs out before it resets, the tile's foot says when, in amber: "5-hour · 81%" then "out in ~34 min". Once the reading says it should have run out, it says "out now".
  - Otherwise the foot says the window and how full, then the reset ("5-hour · 63%", "resets in 55 min"). A balance reads as a count ("820 credits left", "resets in 9 h"). No line is cut off now.
  - The description keeps the whole line for a screen reader.
  - When the account runs short, its sheet names one resource with room ("Davide’s Codex has room: 5-hour at 42%"), with Show. The focus stays in the sheet, so J and K go on working.
  - **The rule** (`room.ts`): to have room, a resource is online, on another account, has a percentage window known to apply that is under 75 %, and isn't running out itself.
  - **The order:** the owner's own resources first, then the emptiest.
  - It only shows. Moving work is the lead's (LFE-07.3), and nothing here assigns.
- **Fixtures:**
  - The resources page plays the same live reports as the plan's page (`work-live.ts`): Codex's reviewer moves on every 9 s.
  - `tight=1` shows an account running short with room elsewhere.
  - Each page links to the other and carries who is looking (`?viewer=davide`).
  - Gemini's session works on "onboarding-copy", which is on no board. It used to carry the plan's `work-3`, a task of Luis's.
- **The ring, at Luis's note.** "The loading circle doesn't look good on the picture":
  - The picture's box was 16 × 21.75 px, stretched by the line's height, so the ring was an oval.
  - The mask measured from the box's corner, so the stroke was thick and ran into the picture.
  - Now the box is a 16 px circle, and the stroke is about 1.5 px at its edge (`closest-side`), with 1.5 px of air.
  - The ring's edge is on the tile's column, and the board's ring is finer too.

## Evidence

- **Browser checks:**
  - 4 new in `e2e/resources.spec.ts`:
    - live tiles and the ring;
    - both links across, as whoever looks;
    - out-in, its amber, and room with Show (and none on pace);
    - each tile's capacity whole in its width.
  - 2 new in `e2e/work.spec.ts`: a task from the address, with its goal and back; the doer's link.
  - 2 updated: a tile's description now includes its live line; the doer's name is a link.
  - `test:browser --repeat-each=2` passes 224 of 224, one of the checks for the phone.
- **Unit checks:** `room.test.ts` (11), covering:
  - when an account runs out, from now and before its reset, and "now";
  - the tile's short capacity, for a percentage and a balance;
  - which session speaks live;
  - when there is room, and whose;
  - when there is none.

  `prefs.test.ts` checks the task address beside the resource address.
- **Mutations:** 27 each made a check fail.
  - 15 for the slice:
    - no session live;
    - a ring that never empties;
    - a waiting ring in teal;
    - ages by the minute;
    - a task only a title;
    - no address;
    - the address choosing no goal;
    - a doer only a name;
    - room offered on pace;
    - no "out in", or not amber;
    - a balance cut off;
    - room ignoring the owner;
    - "now" said as a time;
    - the board's waiting ring in teal.
  - 11 for the review's fixes:
    - the clock restarting with its pace;
    - an old report live;
    - an offline host live;
    - the fullest heading over the first out;
    - Show losing the focus;
    - links not saying where;
    - work on no board as a link;
    - the phone's second column;
    - a followed link not followed;
    - the address choosing no goal;
    - a closed task keeping its address.
  - 1 for the ring's shape: an oval box, or a thick stroke.

  The first batch hit its hour limit after nine runs and left `resource.ts` mutated. It was restored and checked, and the rest ran on their own.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 632 pass, plus the 5 known Windows failures.

## Independent review

One independent review of the whole diff found 2 P1, 8 P2 and 5 P3. All are fixed, each with a check that fails without the fix.

- **P1, fixed:**
  - the clock stepped back when its pace changed;
  - the design note's examples didn't match the code.
- **P2, fixed:**
  - "live" never ended;
  - only the fullest window was weighed;
  - Show lost the focus;
  - the links didn't say where they go;
  - the address was read only at mount;
  - work on no board was a link;
  - the phone sheet's live line made a second column;
  - two checks could pass with the feature broken.
- **P3, fixed:**
  - the board's dot is amber while waiting;
  - reduced motion stills the ring and the arrows;
  - two comments;
  - one `observationOf`;
  - the design note's check list.

## Remaining obligations

- **Davide:** `Session.activity` and the `session.activity` event are the same proposal as LFE-07.1's (PR #63). The links need nothing from the backend.
- **Production:** wiring `onOpenTask` and `onOpenResource` waits for SCM-01/02 to serve resources and SCM-04 to serve plans.
- **Out of this slice:**
  - acting from Resources (LFE-06.4);
  - answering requests in place;
  - "While you were away" for Resources.
