# Implementation-session handoff: LFE-06, attempt 10 (usage history, model colours, a visible tool colour)

- **Goal and attempt:** Luis looked at the live preview and said he didn't see the history or the colours per model. The tools' colours were there but too faint to notice. After the first pass he asked for the colours to be "a little more subtle".
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/history-models`, stacked on `lfe-06/live` (#53) at `e16ad0f`, 2026-10-02.
- **End:** content commit `b404611`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `models.ts`, `ModelChip`, `history.ts` and `Sparkline`, with their tests; the tile, sheet, capacity block, panel and stylesheet;
  - the resource fixture (models on more sessions, earlier readings) and its checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema, API or dependency changed.** The panel gains an optional `history` (earlier observations), which the Studio proposes for SCM-02. It shows nothing when the API keeps only the latest reading.

## Outcome (UI)

- **A model as people say it, in its family's colour** (`models.ts`, `ModelChip`).
  - "claude-opus-5-5" is "Opus 5.5", Anthropic's deep orange; Sonnet and Haiku are lighter. GPT is blue, Gemini Pro violet, Gemini Flash bright blue, Grok silver.
  - A model the view doesn't know keeps its id, in a neutral grey. The exact id shows on hover.
  - The tile shows the working session's model before what it does. The sheet shows each session's model, with its effort beside it.
  - A session that reported no model shows none; Codex's tile has no chip.
- **The tool's colour, visible and quiet.** A 1 px rim along the tile's top in the tool's colour, and a slightly stronger tint behind its mark. Luis asked for less after the first pass: the rim went from 2 px at 55 % to 1 px at 35 %, the mark's tint to 10 %, and the chips to a 7 % ground with near-neutral text, the dot keeping the colour.
- **A window's readings over time** (`history.ts`, `Sparkline`), in the sheet.
  - It sits under the headline's meter, and with each window when they are open. A thin line and a faint area show the readings, the latest marked, in the colour its use reached.
  - The words say "6 readings · since 3 h ago", and assistive technology hears "5-hour window: 19% to 63% used, since 3 h ago".
  - One window means the same id and the same reset: the window before a reset isn't its history. Only observed values for a window known to apply are drawn, and nothing is filled in between. Two readings at least, or nothing.

## Evidence

- **Unit tests:** `models.test.ts` (the families, an unknown model) and `history.test.ts` (oldest first, one per moment; the window before the reset, other windows, unknown, may-not-apply and balances left out). With the others, 28 pass.
- **Browser checks:** `test:browser --repeat-each=2` passes 120 of 120. That is 60 checks, 42 for resources, three of them new:
  - each model as people say it, in four distinct colours, none the neutral grey, none guessed;
  - each tile's rim in its tool's colour;
  - the history under the headline and with its window, not for a window whose reset is due, nothing for a single reading.

  Two older checks now read the model in the tile's description and in the sheet.
- **Nine mutations** each made their check fail (on fresh fixture servers or the unit tests):
  - no chip;
  - a model guessed;
  - Gemini Pro with no colour of its own;
  - model ids not translated;
  - no rim;
  - no history under the headline;
  - the window before the reset counted in;
  - a window that may not apply drawn;
  - no earlier readings given to the sheet.

  "Gemini Pro with no colour" first survived: the grey it fell to was still distinct from the other three. The check now also refuses the neutral grey.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 591 pass, plus the 5 known Windows failures.

## Remaining obligations

- **Luis:** evaluate this UI before it merges.
- **Davide:** keep earlier readings readable (the history), and each window's duration (Codex's pace). Both are in the comment drafted for him, sent once Luis approves.

## Next bounded action

- Attempt 11: a dense list view and grouping by owner. Then attempts 5 to 10's mutations, run together against the top of the stack.
