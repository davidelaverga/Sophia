# Writing a note, and finding one, in Personal

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.4): a personal note can only
> be kept from something said to Sophia or suggested by her. A thought you want to keep has to be told to her first,
> and the notes can't be searched, however many there are. Apple Notes, Keep and Notion all start with a blank line and
> a search. The API already keeps a note with no turn (`keepPersonalNote`: `fromTurnId` is optional, 0021). Luis's
> queue, item 3.

## What changes

- **Writing a note:**
  - At the top of the notes, «Write a note…»: one line, up to the API's 90 characters. Enter keeps it.
  - It is kept as a person's note with no turn behind it, and said as any kept note is («Kept», with Undo).
  - The field empties once the note is kept. A refusal leaves the words in the field and is said as other refusals
    are.
  - Nothing is offered while a package is being reviewed, as with the notes' own acts.
- **Finding notes:**
  - From six notes, as Work's find (`FIND_FROM`), «Find in notes» narrows the list by their words, ignoring case and
    accents (`findNotes`, beside `findProjects`).
  - When nothing matches, the list says so.
- **`usePersonal.keep`** takes a null turn.
- **The fixture:** `notes=lots` gives eight notes.

## Checks

- `places-view.test.ts`: `findNotes` ignores case and accents and keeps the order; nothing typed keeps them all.
- `personal-notes-write.spec.ts`:
  - a note written in the field is kept and said, and the field empties;
  - with eight notes, Find narrows them and says when none match;
  - with fewer than six, no Find.
