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
- **A request is shown apart from what runs:** "Next run · Max", or "Restart asked · Low", with Undo, until its runtime takes it; then each step it reports (see below).
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

## Luis's note: each tool's own look only at its top

Luis showed both pickers. Claude's is plain below its top: a grey fill, a mark at each stop, a rounded-square knob. GPT's is plain too: a solid blue fill, marks, a round knob. The special look appears only at the top. He asked for the same here.

- **The bars now follow their tools,** in the picker and in the session rows:
  - Claude: a grey fill below Ultracode. The lavender dots, their glint and their twinkle are for Ultracode alone.
  - GPT: a solid blue fill below Ultra. The violet gradient and its sparks are for Ultra alone.
  - The picker marks each stop, which fade where the top look takes over. Claude's knob is a rounded square, GPT's a circle.
- **Checked:**
  - Ultracode draws the dotted, glinting fill and Max a plain one;
  - Ultra draws the gradient, and Extra high a solid fill with no sparks;
  - the stops are drawn.

  Three mutations each made the check fail: Claude's dots below ultracode, GPT's gradient below ultra, and no stops. The last first passed, because the check counted the marks without seeing them; it now sees them. `test:browser --repeat-each=2`: 158 of 158.

## Luis's question: what a restart does

Luis asked what "Restarting" is meant to do, and for a video of the whole flow. Until now the request stayed at "Restarting with Low" forever. Per `bindings/OMNIGENT.md` §6 and `05_CAPACITY_STEERING_HANDOVER` §6, a restart is a new attempt, never a live switch:

1. **Asked.** The line reads "Restart asked · Low", with Undo, until the runtime takes it.
2. **Stopping.** The attempt stops once its admitted writes settle. Its work is kept and queued for the next attempt. The requests it had waiting on its owner are superseded, and the sheet's heading stops saying anything waits ("Earlier requests"). The line reads "Stopping · keeping its work", past undoing.
3. **Starting.** A new attempt starts with the level asked, from that kept work. The bar still shows what really runs.
4. **Running it.** The bar changes. The line reads "Now on Low" in teal for a moment, then goes, and the work is back to Working.
5. **A stop it can't confirm** reads "Stop not confirmed · nothing restarted", in amber. Nothing restarts on its own.

A next-run request moves nothing until the session's next run starts with it.

Each step is said only as the runtime reports it, in a new optional `Session.change: { level, phase: 'stopping' | 'starting' | 'unconfirmed' }`. That is the Studio's proposal for SCM-01, and it is in the comment drafted for Davide. Anyone looking sees the steps; only the owner asks or undoes. The fixture plays the runtime: `advance`, `failStop` and `nextRun`.

- **Checked:**
  - two browser checks, one for the restart step by step and one for the next run and an unconfirmed stop;
  - five unit checks for the line (`change.test.ts`).

  `test:browser --repeat-each=2`: 162 of 162. `pnpm test`: 607 pass, plus the 5 known Windows failures.
- **Nine mutations** each made their check fail:
  - the stop not said;
  - done while still starting;
  - an unconfirmed stop said as done;
  - Undo offered past undoing;
  - a done request never let go;
  - the request let go on a timer that live reads reset;
  - the steps hidden from anyone but the owner;
  - the heading still saying something waits;
  - the line without its tone.

  The live-reads one first passed, because the check had no reads arriving. Now reads arrive while the request is let go.

## Luis's note: the line wasn't aligned

Luis showed "Restart asked · Max" out of line. Measured: its dot sat 6 px left of the model chip's and the work tag's (its halo out of the column), its text 5 px left of theirs, and it was 22 px tall, overlapping the tag below by 1 px. Now it shares their column: dot under dot, text under text, as tall as the chip, and as far from the tag below as from the chip above.

- **Checked:** a browser check measures all four at rest, after the line's entrance animation (measured mid-animation, it read 3 px off). Two mutations each made it fail: the line off the column, and the line closer to the tag below. A third rule (the Undo's own height) changed nothing measurable and was removed.
- `test:browser --repeat-each=2`: 164 of 164.

## Remaining obligations

- **Davide:**
  - each tool's catalog of levels per session (`efforts`) and its ultracode mode;
  - where a request goes (the session `PATCH` before launch, or a new attempt);
  - reporting the effective setting.

  These are in the comment drafted for him.
- **Luis:** evaluate this UI before it merges.

## Next bounded action

- Luis's notes. Then the API comment to Davide, on his OK.
