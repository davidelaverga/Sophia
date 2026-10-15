# A note kept can be forgotten later

> 2026-10-15 · Point 4 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): a personal note,
> once kept, could only be removed through the «Kept» notice's Undo, for its few seconds. Luis: «Sí, hazlos en ese
> orden».

## What was measured

- A note in the notes offers only Carry (`NotesPanel.tsx`). Forgetting it is the notice's Undo
  (`PersonalSpace.tsx`, `writes.forget`), as slice 1 left it («notes deleted by undo», `personal-space.md`). The API's
  forget (`POST /api/v1/personal/notes/{id}/forget`) is already wired in `usePersonal.ts`.
- What she remembers, just above, already offers Correct and Forget per item (`Memory.tsx`).

## What changes

- **Beside Carry, Forget.** Forgetting erases the note's words for good, so it asks first, in place, with the kit's
  `ConfirmButton`: «Her copy of this note is erased.», with «Forget it» or «Keep it», the focus on «Keep it».
- **Confirmed:** the note goes through the forget the Undo already used, the toast says «Forgotten» (with no Undo,
  since nothing is left to bring back), and the focus goes to the next note's Carry, or to the notes when none is left.
  A failure is said as any other write's.
- **Editing a note** needs an API the space doesn't have yet, so it stays for later.

## Checks

- `personal-forget-note.spec.ts`:
  - Forget asks with the focus on «Keep it», and «Keep it» forgets nothing;
  - confirmed, the note goes, the fixture records it, the toast says so, and the focus is on the next note's Carry;
  - the last note forgotten leaves the empty state.

## Left

- Editing a kept note (API).
