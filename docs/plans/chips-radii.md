# One chip, four radii

> 2026-10-10 · Luis: «sigue y encólalas, terminarlas todas». The kit's ninth piece, the last row of informe-30 §2.1:
> «Chip (existe Tag) · estado · persona · tecla · radios: solo `--r-1`…`--r-4` (hoy 3, 9, 10, 14, 16 px sueltos)».
> No API change.

## What was measured

- **Chips.** The tag (`Tag`, 37 uses: 20 px, `--r-1`, 11.5 px at 500, a dot and a tone), the board's task chip
  (`.task-chip`: **18** px, a **999 px** pill, 12 at **400**, its tone by `data-mark`, the plan's mark in it), the
  model chip (`.model-chip`: 18 px, `--r-1`, the mono label type at 500, its family's ink), the key (`kbd`: 18 px,
  `--r-1`, the mono label type, an edge). Three dresses for a word in a small box.
- **Radii.** Four tokens (4 · 6 · 8 · 12) and 39 literal radii in the sheets. Of them: the pills' `999` and the dots'
  `50%` (round, fine); 1 · 1.5 · 2 px on bars no taller than 4 px (hairlines, fine); and the loose ones the informe
  named: 3 (a page thumbnail, two 3 px bars), 4 and 6 and 8 (tokens written by hand), 9 (the conversation's Ask Sophia
  and Send), 10 (the dock's squares, a conversation's row and output, the scrollbar), 14 (the lobby, the composer's
  box), 16 (a message's bubble), 18 (the context sheet's top), a 2 px `mark` on text. On Conversations alone twelve
  boxes stood off the tokens; on Updates, the call, the personal space and Resources none.
- A person's line (a face and a name: the resource's owner, a conversation's contributors) is a row of its own with a
  live ring and a status, not a chip; it stays.

## What changes

- **`Chip` in `@sophia/ui`** (over the pure `chip-class.ts`, which also holds `RADII`): a state chip (the tag's name
  stays, `tag`, for the specs and the sheets that know it) with a `tone` and a `dot`; a data chip (`kind="data"`) in
  the mono label type, tinted by `--chip-ink`; a key (`kind="key"`), a `kbd`. `Tag` is the state chip with its dot.
- **The chip in `theme.css`** (`.chip`): 20 px, `--r-1`, the small type (12, not 11.5) at 500, the five tones;
  `.chip-data`: 18 px, the mono label type, its ink's tint. The task chip moves onto the state chip (18 → 20, the pill
  → `--r-1`, 400 → 500; its tone from its mark, `MARK_TONE`; the plan's mark stays where the dot would be); the model
  chip onto the data chip (its families set `--chip-ink`).
- **Every loose radius onto the tokens**: 3 → `--r-1` (the page thumbnail) or round (the 3 px bars); 4 · 6 · 8 →
  the tokens by name; 9 and 10 → `--r-3`; 14 and 16 → `--r-4` (the bubbles, the composer's box, the lobby); 18 →
  `--r-4` (the context sheet's top); the text `mark` → `--r-1`; the scrollbar's thumb round. The dock's squares go
  from 10 to 8 (`--r-3`).
- `e2e/chips-radii.spec.ts`: on the thirteen fixture pages, every box a person can see stands on 4, 6, 8 or 12 px
  of radius, or is round (half its side or more), or is a hairline (no taller than 4 px); and on Tasks, Resources and
  Goals every chip is the kit's (20 · 4 · 12/500 the state, 18 · 4 · mono 10.5/500 the data, 18 · 4 · mono the key).
  `chip-class.test.ts`: the class, the tones, the four radii.

## States

- A chip has no states of its own; a tone says what the words say. The task chip's mark keeps its own colours and
  its ring (`.plan-mark`).
- The radii change no behaviour: the bubbles, the composer, the dock and the rows keep theirs.

## Checks (written first)

- The spec's measure before the change, on Conversations: twelve boxes off the tokens (10, 10, 3, 16 × 6, 14, 9, 9);
  the task chip 18 px on a pill at 400. With the change, none off; every chip the kit's.
- Mutant, with the control passing: `.chip`'s height set to 18, every state chip measures 18 and the measure reports
  it; a bubble's radius set back to 16, Conversations reports it.
- `pnpm check` clean.

## Left

- Hairlines (1 · 1.5 · 2 px on bars no taller than 4 px) and round things (`999`, `50%`) are not tokens and need
  none: the spec names them so.
- The person line stays a row. The informe's §2.1 kit is complete: Button, Field/Search, Segmented, Tabs, SheetFrame,
  Menu, Card, the states, the chip. Next: §2.2, the type scale (sizes, leadings, weights).
