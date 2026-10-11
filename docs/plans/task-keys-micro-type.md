# A task's sheet by its keys, and the labels off the microscope

> 2026-10-11 · Luis: «sigue con UIKIT-19: hoja de tarea y micro-tipo». Informe-pasada-3 §2 and §5: in a task's sheet
> Hold and Stop have no key (J, K and Esc do); «too much microscopic label»: 10.5 px mono labels head most sections,
> 22 nodes under 11 px in Conversations, 23 in Tasks. The pass also said the sheet's dialog had no name: it has
> (`aria-labelledby` its title); the probe read `aria-label` alone. No API change.

## What was measured

- The sheet (`TaskSheet`): J and K turn to the next task and the one before (a document listener, off inside a
  field); Hold / Resume and Stop are presses in «Act on it» (`SessionActs`), Stop a `ConfirmButton` whose safe answer
  takes the focus. No key reaches them; the foot names only J and K.
- `.field-label` is 10.5 px mono uppercase and heads sections everywhere (lanes, sheets, the brief, Home's index);
  Updates' heads, Home's date and labels, Personal's labels and day marks, Resources' sheet heads, the palette's
  group words and a few notes are written at the same 10.5. The data that belongs small (counts, keys, chips,
  avatars, times) sits at the same size, so nothing tells a label from a count.

## What changes

- **The sheet's keys** (`TaskSheet`, the same listener as J and K, off inside a field): `H` presses Hold, or Resume
  when that is what is offered; `S` presses Stop, which asks first and gives the safe answer the focus, so a second
  Enter never stops by accident, and `S` again while it asks does nothing. The foot says «J K the next and the one
  before · H hold or resume · S stop» while the plan is in force. A decision's choices are buttons already: Enter on
  one answers it.
- **Labels at 12** (`--type-small`), mono, uppercase as before: `.field-label`; Updates' heads; the palette's group
  word; Home's date and labels; Personal's labels, day marks and notes (`c3-label`, `c3-day`, `c3-way-note`,
  `c3-talk-who`, the notes' and packs' heads, the edge label); Resources' sheet heads, sort label, history caption
  and receipt steps; the report's main meta; the room link's text and limits; «or»; the thread's day and «Earlier
  messages»; a task's activity note; a decision's due note.
- **Data stays at 10.5**: keys, counts, chips, avatars and faces, times and «ago», versions, badges, marks, the
  evidence refs.

## States

- The keys act only while the sheet is open and no field has the focus; what is not offered (Hold for a viewer) has
  no press to press, so the key does nothing.
- Light and dark alike; the labels keep their colour and spacing.

## Checks (written first)

- `e2e/task-keys.spec.ts`: H holds then resumes (the steps say so, the tile's chip follows); S asks to stop with the
  focus on Keep; S again adds nothing; in the guidance field `h` is a letter.
- `e2e/micro-type.spec.ts`: on Tasks, Updates, Resources, Home and Personal every section label reads at 12 px; on
  Tasks and Updates nothing under 11 px but keys, counts, chips, avatars, times and the evidence refs.
- `pnpm check` clean; `type-scale.spec.ts` (12 is on the scale) unchanged.

## Left

- «Request review» lives in the goal's head, not the sheet: a key for it belongs to the board (with the goal
  chosen), not here.
- «Davide decides · remind» needs an API to remind.
