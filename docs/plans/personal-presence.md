# Personal: her voice, close to you (the "$20" presence)

> 2026-10-04 · Luis · after [personal-detail](personal-detail.md) · "Otro pass de 20. Aún no me siento satisfecho"

## Why

Personal passes its checks yet still reads as a log, not as someone answering. Measured on the fixture:

| What was measured | Found | Wanted |
|---|---|---|
| Empty space between the last turn and the field | 394 px on a phone's first visit; 206 px at 1440 × 900, 106 px at 1280 × 800 | the conversation rests on the field |
| Her words and yours | both 15 px; only the colour differs | her voice reads first |
| Space between turns | 24 px everywhere: an answer sits as far from its question as the next question | an exchange reads as one |
| "Write to Sophia…" | `rgba(236,235,241,.26)`, about 2:1 | 4.5:1, as every word in Personal |

## What changes

- **The conversation rests on the field.** The list settles at its end (`align-content: safe end`): a short conversation, or her first greeting and the ways in, sit just above where you write. The space above stays empty under her light. A long one still scrolls to its first turn (`safe`).
- **Her voice is the reading voice:** 17 px for her turns (her greeting included), 15 px for yours, the ways in and the field. Her set-apart pieces (the look back at the week, a suggestion) stay at 15: they are asides, not her turn. Her half moves a pixel down to stay centred on the taller line. The scale becomes five sizes: 10.5, 11, 13, 15, 17.
- **Exchanges read as one:** an answer sits 12 px under what you said; the next thing you say starts 28 px after her. Turns from the same side stay 8 px apart. Rows tied to a turn keep their distance from it: a failed reply stands where her answer would (12 px), and Note this, her suggestion, the kept note and the ways in keep the space they had.
- **The field's placeholder** takes `--text-sec` at full opacity, as the rest of Personal's quiet text.

Not in this pass: the three Codex P2s on #89 and #90 (they change behaviour, not presence). They are the next small PR.

## Checks (written first, each failing before its change unless marked a guard)

- On a phone's first visit and at 1280 × 800, a conversation that fits ends 48 px or less above the field.
- A long conversation still scrolls to its first day (a guard: it fails under an unsafe `end`).
- A failed reply stands 12 px under your turn; her half stays centred on her first line (from the review).
- Her turns are 17 px, yours 15 px; the type scale test reads the five sizes in every state.
- Under one exchange, the answer's gap is under half the gap before the next thing you say.
- The placeholder's contrast is 4.5:1 or more.

`theme.css` stays untouched (Davide's #76): every change is in `personal.css`.
