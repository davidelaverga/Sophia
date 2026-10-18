# The board, exported

> 2026-10-16 · Luis's QoL queue, item 8 (informe-brechas-a-fondo.md §4, Trabajo y documentos). Asana, Linear and
> Notion export a board to CSV and Markdown, to paste into a report or open in a sheet. Tasks has no way out but a
> screenshot. Studio only.

## What changes

- **«Export»** in the board's bar, after its pills, opens the kit's menu with «Download CSV» and «Download Markdown».
- **`board-export.ts`** (pure):
  - **The rows:** every task on the board, in the board's order (lane by lane, then closed), each with its lane, its
    words, who does it and its status.
  - **CSV:** a header row (`Lane,Task,Who,Status`), then one row a task. A field with a comma, a quote or a line break
    is quoted, with its quotes doubled. A field that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a sheet
    never runs it as a formula.
  - **Markdown:** a title (`# Tasks · plan r2 · 16 Oct 2026`), then a heading per lane with its tasks, `- [x]` for a
    complete one and `- [ ]` for the rest, each with «who · status».
  - **The file's name:** `tasks-plan-r2-2026-10-16.csv` or `.md`.

## Follow-ups (Codex P2s on #397)

- **The CSV starts with a byte-order mark,** without which Excel reads the file in its local code page, not UTF-8: «Marco’s»
  turned into mojibake. The download says `charset=utf-8` too.
- **Markdown keeps each value inside its line:** line breaks fold to spaces, and the marks that format (`\` `` ` ``
  `*` `_` `[` `]` `<` `>` `~` `|` `#`) are escaped. A task's words can't open a heading, an item, a link or a tag of
  their own.

## Checks

- **`board-export.test.ts`:** CSV quoting, the formula guard and the byte-order mark; Markdown lanes and checkboxes,
  and a task's words kept in its item; the file names.
- **`board-export.spec.ts`:** on the work fixture, «Export» → «Download CSV» saves the file by its name, with the
  header and a row a task. «Download Markdown» saves one with the lanes as headings.
