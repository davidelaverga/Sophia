# The focus stays on a need when Home changes columns

> 2026-10-16 · A Codex P2 on #289 (`evaluacion-2026-10-13/follow-ups-p2.md`). Home mounts «What needs you» in one of
> two places: after the greeting at 860 px or less, or beside the words above that (home-phone-needs.md). Crossing
> 860/861 px, by rotating a tablet or resizing a window, moves the list. The control that had the focus is unmounted,
> and the focus falls to the page. Studio only.

## What changes

- **`Welcome.tsx`:** `useNeedsFocus` remembers which need in «What needs you» last had the focus, by the need's id
  (`data-need` on its row), not its place in the list (Codex P2 on #377): the list is read again every 20 s, and a need
  may come ahead of it or leave. A focus that moves elsewhere in the page forgets it.
- **After the list moves** (`oneColumn` changes), if the focus fell to the page, the same need takes it again. A need
  that left meanwhile is not stood in for by another need: the list's heading («Needs you») takes the focus, and keeps
  it across the next move as a need would (Codex P2 on #442, [focus-handoff-follow-ups](focus-handoff-follow-ups.md)).
- Nothing changes when the focus wasn't in the list.

## Checks

`home-phone-needs.spec.ts`:
- at 1000 px, focus the second need's control, then resize to 800 px: the same control, in the list after the
  greeting, has the focus;
- resize back to 1000 px: it still has it, in the side column;
- with the focus on another control, crossing the width leaves the focus where it was;
- `needs=api`: a need that comes ahead of the focused one (`homeFixture.urgentNeed()`), then 800 px: the same need has
  the focus;
- `needs=api`: the focused need leaves (`homeFixture.dropNeed`), then 800 px: no other need takes the focus, the
  list's heading does; back at 1000 px the side column's heading has it.
