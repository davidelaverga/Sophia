# Implementation-session handoff: LFE-06, attempt 15 (the windows, each said once)

- **Goal and attempt:** Luis didn't like that opening the windows repeated part of what the headline says. The 5-hour window showed twice, with its value, reset, meter and history.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/windows-once`, stacked on `lfe-06/polish` (#58) at its tip, 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:** `resource.ts` (the capacity says which window its line comes from), `CapacityBlock.tsx`, the checks and LFE-06's records. **No contract, schema or API changed.**

## Outcome (UI)

- **The headline's window isn't listed again.** The capacity knows which window its line comes from (`windowId`: the limiting one, or a balance). The list holds only the others.
- **The toggle names them:** "2 more windows", "1 more window". When the headline says none of the windows (a reading past its `valid_until`, or capacity unknown), it stays "All 2 windows" or "Show window".
- **When nothing is left to show** (one window, and it is the headline, as Gemini's balance), there is no toggle.

## Evidence

- **Checks:**
  - Claude Code's list holds 7-day and the one-model window, not the 5-hour;
  - one meter and one history drawing, not two;
  - Codex's "1 more window";
  - no toggle for Gemini's single balance;
  - the expired reading keeps "All 2 windows".
- **Three mutations** each made their check fail:
  - the headline's window listed again;
  - a toggle with nothing to show;
  - the others not called "more".

  Two first "survived" because their run named a test title that doesn't exist. The runner filtered on "refresh pending", which isn't in the title. They ran again against the right check.
- `test:browser --repeat-each=2`: 132 of 132.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 598 pass, plus the 5 known Windows failures.

## Next bounded action

- Arranging the tiles by hand (drag and drop, Alt + arrows), Luis's other ask.
