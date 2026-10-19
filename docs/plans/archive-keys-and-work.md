# Archive writes and Work's «Archived»: follow-ups to #368

> 2026-10-19 · three P2s left on #368 (archiving a project), verified still open by the triage
> (`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`): «Keep the archive retry key beyond the sheet lifetime»
> with «Reuse the unarchive key after a lost reply» (one store answers both), «Track the Work-side unarchive mutation»
> and «Surface failures from the archived-project read». Luis 2026-10-19: «Entonces sigue trabajando en lo que viene
> mientras esperamos». Studio only; no API, no contract.

## What was read

- **The keys live with what pressed.** `useArchiveWrite` keeps its keys in a `useRef` Map owned by the sheet or the
  line (`Archive.tsx`). Closing the sheet after a write with no reply and opening it again draws a new key.
  `useUnarchive` draws a new one on every press, and Work calls it per press (`Places.tsx`, `Work`). The API keeps one
  receipt per actor and key (migration 0059), so the same key is what makes a retry the same write.
- **Work forgets its Unarchive.** `Places.tsx` fires `void unarchive(id).catch(toast)`. `onUnarchive` returns nothing
  (`WorkSpace.tsx`), and the row's button always says Unarchive, with no wait: each press is one more POST.
  «Bringing back…» already exists in the line inside the project.
- **A failed read looks like none.** `useArchivedProjects` returns `read.data?.projects`, so a failure is `undefined`.
  Work passes only that to `WorkSpace`, and `ArchivedFold` draws nothing, as if none were archived. Inside the
  project, `useIsArchived` reads it as not archived and the line draws nothing, which claims nothing.

## What changes

- **`archive-keys.ts`, one store for the page:** a key per account, project and choice (archive, or bring back),
  shaped like `removal-keys.ts` but kept by the page, not by a component. A write with no reply keeps its key, so the
  next press of the same choice, from the sheet opened again, the line or Work's row, sends it under the same key.
  Once answered, landed or refused, the key goes: the rule of `api/README` and `held-write.ts` (kept after
  `retry: same_admission_key`, let go otherwise). `useArchiveWrite(identity)` takes the project and the choice at the
  press. `ArchiveSheet` and `ArchivedLine` use it as before.
- **`useArchivedWork(identity)`, Work's side in `Archive.tsx`:** what Places hands `WorkSpace` as `archived`.
  - Unarchive goes through `usePresses` (`presses.ts`), as Take back does. While it's on its way, the row says
    «Bringing back…» with `aria-disabled`, and a second press sends nothing.
  - A failure is said on the row, in the line's words (`failure`: the API's words, else «Couldn’t bring the project
    back. Try again.»), as a failed removal is said on its row in «In this project». It stays until the next press.
    The toast goes.
- **The read's failure, where «Archived» goes:** the hook also hands a `Read` (`READ_FAILED.archived`, «Couldn’t load
  your archived projects.»). `ArchivedFold` draws it with Try again, through `FailedReads`, the failed half of
  `ReadNotes`, taken out so the fold doesn't add a second slow note. Inside the project nothing changes: no line, and
  no claim either way.
- **`fixtures/work-space.tsx`:** `WorkSpace` handed by the Studio's own hooks, over an API answered in the page, with
  levers for the checks (`unarchive=lost|hold|fails`, `archivedFails=1`). `workSpaceFixture.keys` records each POST's
  key.

## Checks, written first (browser)

`archive-project.spec.ts`:

- **Keys:** the archive POST's reply lost, Cancel, the sheet opened again, Archive → the same Idempotency-Key. In
  Work, Unarchive's reply lost, pressed again → the same key.
- **Tracking:** the reply held → the row says «Bringing back…», a second press sends no second POST, and the row
  goes once it's answered. The reply refused (503) → the row says «That didn’t go through. Try again.» and offers
  Unarchive again.
- **The read:** `GET /api/v1/projects/archived` answering 503 → after the list, «Couldn’t load your archived
  projects.» with Try again, which brings the fold. Inside an archived project whose read fails, no line claims
  anything (a guard: it already holds).

`archive-keys.test.ts` (unit) pins the store's rule.

## Limits

- The store lasts as long as the page and is keyed by account, so a retry after signing out and back in is the same
  write. A reload starts afresh, as a held write's does.
- A reply lost after the write landed, then another admin brings the project back, then this person presses Archive
  again: the API answers the first receipt and nothing is archived. The lists are read again, so the page shows the
  truth. The sheet's own key worked the same way before; it now lives longer.
- After Unarchive lands, its row leaves the fold and the focus falls to the page, as before. Take back sends the focus
  to Work's heading; Unarchive could do the same.
- The sheet's Cancel during «Archiving…» and Work's empty state with archived projects wait for Luis's answers.
