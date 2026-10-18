# Focus hand-offs: the follow-ups to Codex on #431 and #442

> 2026-10-18 · Luis · "Procede con los arreglos" · two Codex P2s still open on merged PRs. Studio only.

| Follow-up | Measured in the code and the fixtures | Change |
|---|---|---|
| #431: a note forgotten as Find goes away | Find is offered from six notes. With six and Find narrowed, a forget leaves five: Find goes and all five are shown. `useForget` picked the next note from what Find held before the forget. With one match there was no next one, so the focus landed on the panel. With several, it went to the next match, not to the next note shown. | `nextShown` (`places-view.ts`, pure) gives the nearest note after the one forgotten, in the order chosen, among the notes shown once it is gone, else the nearest before it. `useForget` keeps the order from the press and reads what is shown (the Carry buttons on screen) once the forget settles. |
| #442: a need that left, then crossing 860 px | The 20 s read takes the focused need away and the focus falls to the page. Crossing 860 px then finds no row with its id and leaves the focus there. The check asserted the page. | The list's heading («Needs you», `tabIndex={-1}` like «You and Sophia») takes the focus. No other need stands in. Once the heading has the focus, the next crossing gives it back, as it does for a need. |

## Checks (written first)

- **`personal-notes-order.spec.ts`** (eight notes, two forgotten to reach six):
  - Find narrowed to one note («venue»), that note forgotten: five shown, Find gone, and the focus on the next note's
    Carry («Ask finance for the March close»), not the panel;
  - Find narrowed to five («the»), the first forgotten: the focus on the note now first («Revisar el número de
    marzo»), not the next match («Call Ana about the venue»).
- **`home-phone-needs.spec.ts`:** the focused need leaves (`homeFixture.dropNeed`), then 800 px: the heading in the
  column has the focus and the other three needs are still listed. Back at 1000 px, the side column's heading has it.
- **`places-view.test.ts`** (with the fix): `nextShown` with Find gone, with Find still narrowing, for the last note,
  and with nothing shown.

## Limits

- Between the read that takes a need away and a crossing, the focus is still on the page, as before. That read is not a
  press. To hand the focus on there, the hook would need to tell a focus that fell with its need from a click on
  nothing, and no `focusin` marks the second. The finding asks about the crossing only.
- `nextShown` ranks only the notes there were at the press. A note that arrives in the same read is not a candidate.
  If no candidate is shown, the panel takes the focus.
