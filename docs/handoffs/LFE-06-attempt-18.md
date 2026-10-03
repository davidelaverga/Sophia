# Implementation-session handoff: LFE-06, attempt 18 (choosing a session's effort)

- **Goal and attempt:** Luis asked whether the Studio can set a session's effort itself (high, extra, max…, per provider), and to build it with quality of life first: as easy as possible, elegant, and surprising.
  - The pack makes it a launch setting, never a live switch. OMNIGENT sets `reasoning_effort` before the host launches. `02_RUNTIME_AND_RESEARCH` makes any change "a new route/configuration", with no hot switch in an active attempt. `01_CONTROL_SUPPORT_MATRIX` says effort "is not a portable universal level".
  - This is the Studio's side of it, on the fixture.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/effort-picker` from main `12d5dd2`, 2026-10-02.
- **End:** content commit `2deb6e6`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/features/resources/`: the new `EffortPicker.tsx`, plus `effort.ts`, `resource.ts` (the session's `efforts`), the sheet, the panel and the stylesheet;
  - the fixture (each tool's catalog, the requests recorded) and its checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema or API changed.** The panel takes an optional `onEffort` (where a request goes, SCM-01). Without it, every bar stays read-only, as in production today.

## Outcome (UI)

- **The bar is the way in.** For its owner, a session's effort bar opens into a scale right there, in its tool's own look: Claude's dots or GPT's gradient, from Faster to Smarter, with a knob on the level.
  - Sliding previews the look it will have: Claude's dots light up at Ultracode, and GPT's gradient sparkles at Ultra.
  - The level is said above the scale, and "now" marks what the session runs.
  - Keys: the scale takes them as it opens. The arrows move it, Home and End go to the ends, Enter sets it, and Escape closes the scale, not the sheet. On close, the focus goes back to the bar, so J and K keep working.
  - A click or a drag on the scale places the knob.
- **The safe choice is the default:** "Set for its next run".
  - What it already runs can't be asked again ("Already Ultracode").
  - Restarting now is offered only while the session works. It is said plainly, "It stops this session's work and starts it again with Low.", and confirmed, with "Keep it running" as the way back.
- **A request is shown apart from what runs:** "Next run · Max", or "Restarting with Low", with Undo, until its tool reports the change.
- **Only the levels its tool says it takes** (`Session.efforts`, from its native catalog, Claude Code's ultracode last).
  - Gemini CLI and Grok say none in the fixture, so none is offered.
  - Only the owner can choose; anyone else sees the bar, read-only.
- Ultracode now reads "Ultracode" everywhere, including where it has no place on the scale (it is a mode).

## Evidence

- **Browser checks:** `test:browser --repeat-each=2` passes 156 of 156. That is 78 checks, 60 for resources, four of them new:
  - the owner sets it by keys alone (focus, preview, "Already", Enter, request, Undo);
  - restarting now, only while it works, said and confirmed;
  - Escape closes the scale and hands the focus back, and a click places the knob;
  - only the owner, and only the tool's own levels.

  Each check ends by reading the requests the fixture recorded. None reaches the network.
- **Twelve mutations** each made their check fail:
  - anyone can choose;
  - levels offered where the tool says none;
  - Escape closing the sheet;
  - the scale opening without the keys;
  - no live preview;
  - a restart without asking;
  - a restart offered with nothing running;
  - asking for what it runs;
  - Enter asking for what it runs;
  - Undo not told on;
  - a click a stop off;
  - the focus lost when the scale closes.

  Recording the video found that last one: after Escape, the focus was lost and K did nothing. Now fixed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 602 pass, plus the 5 known Windows failures.

## Remaining obligations

- **Davide:**
  - each tool's catalog of levels per session (`efforts`) and its ultracode mode;
  - where a request goes (the session `PATCH` before launch, or a new attempt);
  - reporting the effective setting.

  These are in the comment drafted for him.
- **Luis:** evaluate this UI before it merges.

## Next bounded action

- Luis's notes. Then the API comment to Davide, on his OK.
