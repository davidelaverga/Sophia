# A phone's fields and a session's range

> 2026-11-23 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 21 and 24).
> Luis: «Yes, batch F». Studio only, no API change.

## Measured

- **Fields at 13 px (21).** At 390 × 844 with a touch pointer (room fixture, `main` at `d1e6b1410`), the chat's field
  (`.message-bar textarea`) and both of Invite's addresses (`#guest-email`, `#member-email`) were 13 px
  (`--type-body`). iOS Safari zooms the page into a field under 16 px as it takes the focus (inferred, as the
  evaluation says; not tried on iOS). Their heights then: the chat's field 40 px in a 51 px bar, beside its 40 px Send;
  the member's address 29 px in a 36 px row beside its role; the guest's 40 px in a 47 px row beside Send; each centred
  on its neighbour.
- **The session's range breaks (24).** At 390 px the room's line read «Pilot review · Today · 02:57» then «– 03:27 ·
  starts in 10 min» on the next line (`session=soon`): the range broke at its dash. The same label (`sessionLabel`)
  shows in Invite's Calendar and on the door (`JoinFlow`).

## What changes

- **21 · On touch, the fields a person types in here are 16 px** (theme.css, inside `@media (pointer: coarse)`): the
  chat's field, beside the bar's touch sizes, and Invite's addresses (`.sheet-form .field input[type='email']`). Each
  keeps its height: the chat's line keeps its 20 px; the address rows' heights come from their presses (40 px) and
  the role's 28 px, not the type. Measured after: the same heights, still centred, and «name@company.com» fits (156
  of 255 px at 390). A mouse and keyboard see no change.
- **24 · A session's range holds together** (`access-view.ts`, `RANGE_DASH`): start and end are joined by the dash
  between no-break spaces, with a word joiner after it, since a dash may break after itself even before a no-break
  space (UAX #14). The line now breaks before the range where it must: «Pilot review · Today ·» then «02:59 – 03:29 ·
  starts in 10 min». The same in Calendar and on the door. It reads the same; screen readers say nothing more.

## Words

No new words; the range reads as before.

## Checks

- `access-view.test.ts`: the labels with their joined range; a range with no breakable space in it.
- `e2e/touch-fields.spec.ts` (a 390 px touch context; skipped where the browser reports no coarse pointer): the three
  fields 16 px, each as tall, with its row, as at 13 px; the range's start, dash and end on one line.
- Before and after at 390 × 844 (touch) and 1280 × 800, dark and light: the sizes and the line as measured above; at
  1280 the fields stay 13 px and the line has room for the whole range.

## Not done

- Other fields stay under 16 px on touch: measured at 390, the project's search («Search this project») and a mission
  note's field are 13 px. They weren't in the evaluation's list; the same rule would serve them, one by one with their
  heights measured.
- Not tried on an iOS device: whether Safari still zooms is inferred from its documented behaviour.
