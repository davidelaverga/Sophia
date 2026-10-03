# Implementation-session handoff: LFE-06, attempt 20 (acting from Resources; Tasks warned when an account runs short)

- **Goal and attempt:** after attempt 19, Luis asked "what else can we do?" and chose the two first proposals:
  - acting from Resources;
  - Tasks warned when a task's account runs short.

  Design note: `docs/plans/LFE-06.6-act-and-warn.md`.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/act-and-warn` from `lfe-06/live-bridge` (`e5489d1`, PR #64), 2026-10-03.
- **End:** content commit ``0752ffe``; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `SessionActs.tsx`, the sheet, the panel, `room.ts` and the stylesheet;
  - `apps/studio/src/features/work/planning/`: the board, `TaskActions`, the task's sheet and tile, the new `account.ts`, and `board.css`;
  - `packages/ui/src/ConfirmButton.tsx`;
  - both fixtures and their checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema or API changed.** The panel takes an optional `onAct`, and the board an optional `observations`. Production passes neither yet.

## Outcome (UI)

- **Act from Resources.**
  - A session at work has **Act** under its role, level with its task. It is offered to its owner only, and only where its route supports some act. Its tip names those acts ("Hold or Stop").
  - It opens guidance, Hold and Stop under the row, as the route supports each. Stop asks first.
  - Each act is said as it is observed: Recorded, Queued, Delivered ("Not seen acting on it yet"), or not accepted.
  - The task's sheet's "Act on it" is now the same piece (`SessionActs`).
  - **The view keeps each session's last act** (`useActs`, in the panel and on the board):
    - it is still said after the row closes, or after J or K turn the sheet;
    - a late step of an earlier act never speaks over the latest one;
    - guidance stays in its field until it is queued.
- **Tasks warned.**
  - A task whose session is at it says on its tile when its doer's account runs short: "Account out in ~34 min", in amber, after a small gauge.
  - Its sheet says it whole and names where there is room ("Your Codex has room: 5-hour at 42%"), with Show.
  - `account.ts` says nothing for a task that is finished or checked, nor without readings.
  - The pages carry `viewer` and `tight` when a link crosses between them.
- **`ConfirmButton`:** after either answer, the focus comes back to its button at rest, for every use of it. It used to drop to the page.

## Evidence

- **Browser checks:**
  - 3 new in `e2e/resources.spec.ts`:
    - the owner acts from the row: each step, Stop asked, kept or sent, the focus back on Stop, the act still said after closing, only the supported acts, and none for anyone else or for a session with nothing at work;
    - a late step never speaks over the latest act;
    - the phone row with Act open.
  - 1 new in `e2e/work.spec.ts`: the warning, only on the task its session is at, with room and Show (carrying `viewer` and `tight`), and nothing at the usual pace.
  - `test:browser --repeat-each=2` passes 232 of 232.
- **Unit checks:**
  - `room.test.ts`: the few words, in both lengths, and "now";
  - `account.test.ts`: said while at it; nothing once finished or checked, or without readings.
- **Mutations:** 14 each made a check fail.
  - 10 for the slice:
    - anyone may act;
    - Act with nothing at work;
    - the steps never said;
    - acts the route doesn't support;
    - a finished task warned;
    - no tile warned;
    - the sheet silent;
    - Show going nowhere;
    - the query not carried;
    - past the full line said as fine.
  - 3 for the review's fixes:
    - the phone's second column;
    - a late step over the latest act;
    - the focus dropped after Stop.
  - 1 for the finished-task rule, moved into `account.ts`: the first run's "finished task warned" passed, because no fixture had one.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 636 pass, plus the 5 known Windows failures.

## Independent review

One independent review of the whole diff found 1 P1, 3 P2 and 9 P3.

- **P1, fixed:** at phone width, opening Act split the row into two columns. The phone rules came before the new ones, with the same specificity.
- **P2, fixed:**
  - a late step of an earlier act overwrote the latest one;
  - closing Act, or J and K, lost an act's outcome;
  - the focus dropped to the page after Stop was confirmed or kept.
- **P3, fixed:**
  - `aria-controls` is set only while open;
  - the live region is mounted before it speaks;
  - the tip follows the route;
  - a dead attribute removed;
  - the amber dot in the task's sheet noted;
  - two slice numbers;
  - the warning's styles moved to `board.css`;
  - guidance kept until queued.
- **Left as is:** Escape in the guidance field closes the sheet, as anywhere in a sheet.

## Remaining obligations

- **Davide:** both sheets need #63's endpoint 5 (`POST …/assignments/{id}/commands`). The capacity readings are SCM-02's.
- **Production:** wiring `onAct` and `observations` waits for those.
- **Next:**
  - "While you were away" for Resources;
  - a session's recent reports;
  - the type pass (10 sizes to 4 or 5).
