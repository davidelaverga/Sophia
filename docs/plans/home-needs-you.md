# Home's right half: what needs you

> 2026-10-11 · Luis: «sigue con los pendientes: … Home F2». Informe-30 F2: «Una columna “Needs you”: decisiones por
> vencer, permisos de agentes, revisiones pedidas, invitados en el lobby, respuestas de Sophia sin leer; el emblema se
> encoge a ~96 px como cabecera de la columna». No API exists for it yet: it ships behind the vision flag
> (`VISION`, fixture pages only), on fixture data, as `room-present.md` did.

## What was measured

- Home at 1440: a 560 px column of words on the left; on the right, Sophia's light alone in a 480 px square. Half the
  page carries nothing a person can act on.
- What needs a person today is spread over four places: a decision in Tasks (`1 decision for Davide`), a permission in
  a task's sheet, a review asked in Knowledge, a guest in the room's lobby, Sophia's reply in Personal. A power user
  starting the day visits each to learn nothing is waiting.

## What changes

- **`needs-you.ts`** (pure): a `Need` (`kind`: decision · permission · review · guest · reply; `title`; `project` or
  null for Sophia's own; `expiresAt` or null; `detail` or null); `needsOrder(needs, now)`: the expiring ones first,
  soonest first, then the rest as given; `needNote(need, now)`: «Product launch · expires in 20 min» (tone `soon`
  within the hour, `late` once expired, `quiet` else); `needsLabel(n)`; `NEED_WORDS` (Decide · Allow or refuse ·
  Review · Let in · Read), the row's action for screen readers and touch.
- **`NeedsYou.tsx`**: the same index rows as the projects' (`hw-index` / `hw-row`: a glyph for the kind where the number
  is, the title, the note, the arrow), ↑ and ↓ between them, one press opens it (`actions.need(need)`); empty, one
  quiet line «Nothing needs you right now».
- **Welcome**: a `needs` prop. Undefined (the Studio today), Home is as it was: her light alone on the right. Given, the
  right half is a column: her light smaller at its head (220 px, the mark 48 px as on a phone), the list under it.
- **The fixture** (`home.tsx`): `needs=some` (five, one per kind; the decision expiring in 20 min first) · `none` ·
  absent (the Studio's own Home, so no existing check moves); the demo shows them. `window.homeFixture.pressed`
  records «need <id>».
- `e2e/home-needs.spec.ts`: the order, the notes and tones, the press, the keys, the empty line, the light's size;
  without `needs`, no column and the light at its 480.

## States

- No needs given (the app): unchanged. Given and empty: the light and the quiet line. Given: the rows in urgency order;
  an expired one reads «expired», rose.
- Phone: the column follows the left one, after the projects; the light keeps the phone's rule (absolute, 220 px, top
  right).

## Checks (written first)

- `needs-you.test.ts`: order (expiring first, soonest first, the rest as given), the note's words and tones (20 min,
  2 h, expired, a detail, Sophia's own with no project), the label.
- The spec above; the mutant with `needsOrder` returning the needs as given fails the order check.
- `pnpm check` clean; the existing `home.spec.ts` unchanged.

## Left

- The API: a `GET /me/needs` (or each source's own read) proposed in issue #105's line; the badge in the bar, email and
  push are out of this scope.
- Marking a need read, or dismissing it, needs the API too: a row only opens where the need is.
