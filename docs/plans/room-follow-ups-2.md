# Room: follow-ups to #114, #115 and #116

> 2026-10-05 · Luis · PR 13 of the room's $20 plan · the P2s Codex left on #114 and #115, merged or awaiting by the no-P1 rule, and the P3 #116's review left

## What changes

**The show's focus marker (#114, `focus-arrival.ts`):**
- **Kept on no reply, for a minute.** A «Show everyone» that got no reply may have been committed, so the marker stays. A refusal of that version forgets it, and a minute without its arrival forgets it too. A show never committed must not take the focus later, when someone else shows the same version. When the report does arrive on the stage, from the feed, it takes the focus as a confirmed show would.
- **Bound to the version.** The marker remembers which version was shown from here. A different report that arrives first, from another tab of the same person, doesn't take the focus.

**Leave pressed twice (#115):** while a slow disconnect is under way, a second press of Leave does nothing. The first press ends the call and says so: the recap opens once and is read once. Join shows only then, so no new call can be ended by the first press's late finish.

**Open from a recap over another sheet (#115):** leaving from a sheet's call row (Invite, a task) opens the recap on top. «Open» on a report it made now puts away every open sheet before the report opens, so the report is never hidden behind one. `useDialog` keeps the open dialogs' Close for this.

**Each leave reads its own recap (#115):** the recap's read is keyed by the leave, so a sheet put away while its read waits leaves nothing for the next one. Updates' reads take the query's signal.

**A press being answered keeps its focus (#115):** «Close the meeting» and «Mark as seen» use `aria-disabled`, never `disabled`, and are drawn as disabled.

**Pending and slow reads say so (#116):** the recap, the digest and the meetings show their words while read, and the Studio's slow note after six seconds (`Waiting`, `useSlow`).

**Leaving from an older meeting's recap (#116 review, P3):** only a sheet showing the running meeting stops the recap on leaving. Leaving from the sheet of an older meeting, opened in Updates, opens the recap of the meeting left, on top.

## Checks (written first)

- **Units** (`focus-arrival.test.ts`): the marker is for its version only, taken once, forgotten on its own refusal, and expired after a minute.
- **Browser:**
  - `room-present.spec.ts`: a show whose reply was lost still takes the focus when the report arrives on the stage (from the made card, the focus has nowhere else to go, so this checks the outcome; the marker itself is unit-tested);
  - `room-recap.spec.ts`:
    - two presses of Leave during a slow disconnect: the second does nothing, then one recap, read once;
    - a sheet put away while its read waits: the next leave reads its own recap;
    - Open from a recap over the Invite sheet: no sheet is left, and the report is in view;
  - `room-updates.spec.ts`: leaving from an older meeting's sheet opens the left meeting's recap on top.
