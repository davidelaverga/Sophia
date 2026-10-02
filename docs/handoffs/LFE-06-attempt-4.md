# Implementation-session handoff: LFE-06, attempt 4 (the Resources view, in the app's own language, with each tool's mark)

- **Goal and attempt:** LFE-06's resource panel. Luis asked for three things:
  - "better UX and quality of life";
  - each resource showing its tool's logo (Codex's, Claude Code's, Grok's…): "subirle al nivel";
  - after a first pass, an excellent result that is visually coherent with the whole app.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/panel-ux` from main `8816d66`, 2026-10-02.
- **End:** the view, checks and docs at `953ab8b` (tree `d4a2c052f9d5`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:**
  - `apps/studio/src/features/resources/`;
  - one slot in `features/studio/ProjectShell.tsx`;
  - the resource fixture and its checks;
  - one dependency (`@lobehub/icons-static-svg`, exact), with its lock and the recorded `workspace_lock_sha256`;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema or API changed. In production the Resources view still says it is coming.**

## Outcome (UI)

- **Where it lives.** The project's navigation already has a Resources view, which says "Coming". `ProjectShell` gains a `resources` slot. When it is filled, the view is a split page like Work; when it is empty, as in production until SCM-01/02 serve resources, the "coming" note stays. The fixture now mounts the Studio's own `ProjectShell` on that view: the panel is seen in the real top bar, navigation and mini dock.
- **The Work view's language.** The first pass was boxed cards with gradients and bordered chips, a dashboard foreign to the app. It is replaced by the Work view's own forms:
  - the view's head: a 20 px title, a mono count and a rule;
  - rows ruled like goals, with 18 px of air;
  - the tool's facts indented as a goal's criteria are;
  - in the side column, what waits on an owner: the pulse's head, its timeline and dots, an amber dot for what waits. It is first in reading order, and first on a phone.
- **Each tool as itself.**
  - Its mark sits on a small tile, with its name and its maker in a mono label, then the owner.
  - The registry knows Claude Code, Codex, Grok, Gemini CLI, GitHub Copilot and Cursor ([`resource.ts`](../../apps/studio/src/features/resources/resource.ts) `TOOL`, `VENDOR`; [`ToolLogo`](../../apps/studio/src/features/resources/ToolLogo.tsx)).
  - The marks come from `@lobehub/icons-static-svg` 1.95.1 (MIT). They are plain SVG, checked before use, and shown as images or masks, never inlined. A one-colour mark takes the text's colour. `simple-icons` no longer carries OpenAI's or Grok's mark.
- **Quality of life.**
  - A row with a waiting request says "1 request waiting" and takes the focus to it.
  - Only the request's owner gets "Copy session id", which says "Copied" for a moment, to find the session in the native tool.
  - Controls are the list's small mono labels with a glyph (✓ / – / ×). Each has a tip that says what it does, and its state is there for screen readers.
  - A meter is drawn only for a percentage known to apply. What isn't known sits over an empty hatched track, and a balance heads as a count.
  - "You" marks the viewer's own resource, and an age shows its exact time on hover.
  - When nothing waits, the column says so ("Nothing is waiting on an owner.") and no row points anywhere. When no tool is enrolled, the list says so.

## Evidence

- **Measured at 1280×720,** before → after: the request waiting on an owner moves from y 489, last on the page, to y 80, at the head of the side column.
- `pnpm --filter @sophia/studio test:browser`: 33 checks, the room's included (`ProjectShell` changed). With `--repeat-each=2` and 4 workers, 66 of 66 pass.
- **Twenty-two resource mutations** each made their check fail, every run on a fresh fixture server. Among them:
  - the requests after the list;
  - the row's link moving no focus;
  - a meter for unknown capacity;
  - no tool mark;
  - a one-colour mark drawn as an image;
  - a balance drawn as unknown;
  - the copy offered to everyone;
  - nothing copied.
- `resource.test.ts`: 12 pass.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: the new tests pass, plus the 5 known failures on Windows, as on main. The runtime unit records the new lock.

## Decisions and changes

- **Coherence over a new look.** The view reuses the Work view's classes (`view-head`, `count`, `pulse`, `pulse-head`, `events`, `event`, `empty`) rather than restyling them.
- **Each brand's mark stays its owner's trademark,** shown only to name the tool, beside its name.
- **`ProjectShell` gains one optional prop.** It is Luis's file in the writer map. PR #32 also changes `ProjectShell` (its report viewer), so whichever merges second resolves a small, separate hunk.

## Remaining obligations

- **Davide:** the resource and action shapes (SCM-01/02).
- **Luis:** evaluate this UI before it merges.

## Next bounded action

- Luis's notes on this pass. LFE-02.2 when PR32 is in `main`.
