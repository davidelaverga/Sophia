# Implementation-session handoff: LFE-06, attempt 4 (the resource panel's UX, with each tool's own mark)

- **Goal and attempt:** LFE-06's resource panel. Luis asked for "better UX and quality of life", and for each resource to show its tool's logo: Codex's, Claude Code's, Grok's… "subirle al nivel".
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/panel-ux` from main `8816d66`, 2026-10-02.
- **End:** the panel, checks and docs at `668c02b` (tree `efb58e4a2233`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** `apps/studio/src/features/resources/`, its fixture and checks, one dependency (`@lobehub/icons-static-svg`, exact) with its lock and the recorded `workspace_lock_sha256`, CONTRIBUTING and LFE-06's records. **No contract, schema or API changed. The panel isn't in the Studio yet.**

## Outcome (UI)

- **The tool, as itself.** Each card is headed by its tool's mark on a tile, its name, its maker in a mono label ("OPENAI", "ANTHROPIC"…), and the owner with an initial. The tool's colour tints the card's top.
  - The registry knows Claude Code, Codex, Grok, Gemini CLI, GitHub Copilot and Cursor ([`resource.ts`](../../apps/studio/src/features/resources/resource.ts) `TOOL`, `VENDOR`; [`ToolLogo`](../../apps/studio/src/features/resources/ToolLogo.tsx)).
  - The marks come from `@lobehub/icons-static-svg` 1.95.1 (MIT). They are plain SVG with no script or external link, checked before use, and shown as images.
  - A one-colour mark (Grok, Cursor, Copilot) takes the text's colour through a mask, so it reads on the dark theme. `simple-icons` was tried first: it no longer carries OpenAI's mark, nor Grok's.
- **Attention first.** The requests waiting on an owner open the panel. A card with one says "1 request waiting", and that link moves the focus to the request.
- **A summary under the title:** "3 resources · 2 hosts online · 1 request waiting". It shows no capacity total.
- **Capacity shown, not only said.**
  - A meter (`role="meter"`) is drawn for the limiting percentage known to apply; it warms past 80 %.
  - Unknown, expired or pending capacity sits over an empty hatched track, never a number. A balance heads as a count ("Daily requests: 820 credits left") with no track.
  - The windows' disclosure reads "All 3 windows" or "Show window", with a chevron.
- **Controls as chips:** a glyph and a word each (✓ supported, – not qualified yet, × not offered), with the full state for screen readers. They are never buttons.
- **The rest:**
  - The viewer's own resource says "You".
  - An age shows its exact time on hover (`<time title>`).
  - A live host's dot pulses, except under reduced motion.
  - Sessions show the role label and the reported model, then the assignment with its state as a tag.
  - The cards in a row share one height.

## Evidence

- **Measured at 1280×720** on the default fixture, before → after:
  - the waiting request moves from y 489, last on the page, to y 126, first;
  - text styles go from 10 to 7;
  - card heights go from 283/371/279 to 414/414/414;
  - visible words go from 206 to 187. Most of the change is structural, not fewer words.
- `pnpm --filter @sophia/studio test:browser`: 31 checks. With `--repeat-each=2` and 4 workers, 62 of 62 pass.
- **Twenty resource mutations** each made their check fail, every run on a fresh fixture server:
  - the thirteen earlier ones, on today's lines;
  - the requests after the cards;
  - the card's link moving no focus;
  - a meter for unknown capacity;
  - no "You";
  - no exact time;
  - no tool mark;
  - a one-colour mark drawn as an image;
  - a balance drawn as unknown.
- `resource.test.ts`: 12 pass.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: the new tests pass, plus the 5 known failures on Windows, as on main. The runtime unit records the new lock (`workspace_lock_sha256`).

## Decisions and changes

- **The marks are shown as images (and masks), never inlined as markup.** The Studio's CSP already allows `data:` images.
- **Each brand's mark stays its owner's trademark.** It is shown only to name the tool, beside its name.

## Remaining obligations

- **Davide:** the resource and action shapes (SCM-01/02).
- **Luis:** evaluate this UI before it merges.

## Next bounded action

- Luis's notes on this pass. LFE-02.2 when PR32 is in `main`.
