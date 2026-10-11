# Updates: a destination on every line, narrowed by kind and by person

> 2026-10-11 · Luis: «sigue con UIKIT-17: Updates y Conversations». Informe-pasada-3 §2 and §5: in Updates only the
> lines of what was made had a destination («Open»); nothing narrowed the digest by kind or by person. (The pass also
> counted «Mark as seen» as one press per item: it is one press per digest already, and stays.) No API change.

## What was measured

- The digest («Since you last looked») lists Decided · Made · Kept · Still open · Work as `recapSections` builds them;
  a line of what was made has «Open» (the report at its version); the other four kinds have no press, though each
  lives somewhere: a decision, a kept note and an open proposal in the brief, work in Tasks.
- Nothing narrows the digest: a person who wants only what Lucía did, or only what was decided, reads it all.

## What changes

- **A destination on every line** (`recap-view.ts`: each line says where it lives, `to: 'brief' | 'task'`;
  `RecapPart` takes `go`): Decided, Kept and Still open press «In the brief» (the Studio view with the brief open);
  Work presses «Open the task» (Tasks with the task's sheet open, named in the address as a link followed:
  `showInAddress(taskId, TASK)`); Made keeps «Open». The meeting's recap sheet gives no `go`: as before there.
- **One way across views** (`project-go.tsx`): the `Arrival` union grows by `{ view: 'studio'; brief: true }`,
  consumed by the project's sheets (which hold the panel), and `{ view: 'work'; taskId }`, which names the task in the
  address and shows Tasks.
- **Narrowed** (`updates-view.ts`, pure): `narrowRecords(records, { kind, person })` keeps a line when its kind is
  asked and the person proposed, decided, asked or kept it; what names nobody (an open proposal, work) stays only for
  everyone. `kindCounts` for the presses, `peopleOf` for the menu (who appears, in order, «You» for the viewer).
- **The row** under the lead, shown only with something in the digest: the kit's Segmented (a radio group «Kind»:
  All · Decided · Made · Kept · Still open · Work, each with its count, only the kinds that have lines) and a person
  menu (the kit's Menu on a small press «By everyone» / «By Lucía», radio items). Narrowed to nothing: one line says
  so. «Mark as seen» marks the whole digest as before, whatever is narrowed.

## States

- Narrowing is the view's for this digest (reset with the next digest, as the sequence keys the body).
- A line's press gives the focus the way the view's own openers do (the arrival opens the brief or the sheet).
- Phone: the row wraps; the Segmented scrolls as the kit's does.

## Checks (written first)

- `updates-narrow.test.ts`: `narrowRecords` by kind, by person (proposer or decider, asker, keeper; open and work
  only for everyone), both; `kindCounts`; `peopleOf` order, names and «You».
- `e2e/updates-narrow.spec.ts` on the room fixture: the kinds offered with their counts; «Still open» alone; «By
  Lucía» keeps the decision and drops what names nobody; «In the brief» → the Studio view current with the brief open.
- `pnpm check` clean; `room-updates.spec.ts` unchanged.

## Left

- Grouping the digest by day (informe-30) needs each line's `at`; decided and kept carry one, made and open do not.
- A person filter across the meetings' list: the list shows no people.
