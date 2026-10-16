# Your notes, by date, and to a file

> 2026-10-16 · Luis's QoL queue, item 7 (informe-brechas-a-fondo.md §4, Personal). A note keeps its date
> (`createdAt`), but the notes show none and keep the order they came in. «Your data» copies everything as text to the
> clipboard; there is no file of your notes. Keep and Notion date a note, sort it, and export it. Studio only.

## What changes

- **Each note says its day,** quietly, after its words: «15 Oct».
- **«Newest» and «Oldest»** sort the notes, offered from two notes up. It is a small segmented control beside Find,
  Newest by default, and lasts while the notes are open.
- **«Download notes»** in the notes' head saves `sophia-notes-YYYY-MM-DD.md`:
  - a title, then one line a note, oldest first: «- words · 15 Oct 2026», with «(from Sophia)» on hers;
  - offered once the notes are read and there is one.
- **`notes-export.ts`** (pure) does the order and the file.
- **The fixture's eight notes** (`notes=lots`) are a day apart, newest first, as the API keeps them.

## Checks

- **`notes-export.test.ts`:** newest and oldest; the file's title, lines, «(from Sophia)», and its name.
- **`personal-notes-order.spec.ts`:**
  - with eight notes, each says its day; Oldest puts the oldest first and Newest gives the order back;
  - «Download notes» saves the file by its name, with every note in it.
