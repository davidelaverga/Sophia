# Personal: detail and access, measured (the "$20" finish)

> 2026-10-04 · Luis · after [personal-twenty](personal-twenty.md) · "Sigue elevando a los 20 dólares. UI/UX, atención al detalle, visuales, accesibilidad"

## Why

An audit measured Personal on its fixture at 1280 and 390 px, with nothing judged by eye alone.

| What was measured | Found | Floor |
|---|---|---|
| Contrast of every visible text | memory dates and message times 1.99:1 (`--text-4`); the memory's footnote 3.79:1 (`--text-3` at 12 px) | 4.5:1 |
| Focus on the field | only its 1 px hairline changed colour | a visible ring |
| Control heights | day dividers 19 px tall | 24 px (WCAG 2.5.8) |
| Type sizes | 8 (10, 10.5, 11, 12, 13, 13.5, 14.5, 15 px) | one scale |
| Reduced motion | the ambient wash's infinite animation, cut to 1 ms by the global rule, flickers every frame | nothing moves |

The visual review found four more:
- a double hairline between the day's answers and the week;
- "Get ready…" wrapping to two lines at a leading of 1 on a phone;
- on a phone, the notes 16 px further in than what she remembers, with no label between them;
- "Talk with her" with no sign it is her voice.

## What changes

- **Meta text** (times, dates, small notes, "Sophia is writing…") uses `--text-sec`, the places' own secondary text at 4.5:1 or more. `theme.css` is untouched.
- **The field's focus:** its hairline grows into a 2 px line of her light (`box-shadow`), as Home's line lights.
- **Day dividers** are at least 24 px tall.
- **One type scale:**
  - 10.5 px for the mono labels;
  - 11 px for mono meta (times, dates, the session's note, themes);
  - 13 px for small text and controls (Note this, memory, notes);
  - 15 px for what is said and the ways in.
- **Reduced motion:** the wash stays still.
- **The day's answers and the week** share one hairline.
- **Ways in that wrap** keep a 44 px floor, not a fixed height, with a 1.35 leading.
- **In the notes:** what she remembers and your notes line up, each under its label ("She remembers", "Your notes"). The notes sit on hairlines at every width.
- **"Talk with her"** carries her half, as her turns do.
- **Finishing:** text you select takes her light, and the conversation's scrollbar is a thin line.

## Checks

On the Personal fixture:
- no visible text under 4.5:1, with times shown by hover;
- the field's focus ring;
- every control at least 24 px tall;
- the type scale is exactly the four sizes;
- nothing runs under reduced motion;
- on a phone, a wrapped way in keeps its leading and stays inside its row;
- the notes line up, each under its label;
- "Talk with her" carries her half.

Each was measured failing before its fix, and mutations follow. Every run goes through the machine's guards (`D:\Descargas\SophiaV4\.claude-guards`).
