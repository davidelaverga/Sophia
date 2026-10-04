# Implementation-session handoff

Goal and attempt: the "$20" pass on the Personal space (`docs/plans/personal-pass.md`), attempt 1 (#88)  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/pass` from main `2712f2c`, 2026-10-04  
Ending commit/tree and changed files: content commit `484e390` (tree `0c3b163cd03b`); these files changed:
- `apps/studio/src/features/personal/Conversation.tsx`, `PersonalSpace.tsx`, `PersonalComposer.tsx`, `personal.css`
- `apps/studio/fixtures/personal.html` and `personal.tsx` (new)
- `apps/studio/e2e/personal.spec.ts` (new)
- `docs/plans/personal-pass.md` (new)

## Outcome

**What a person sees in Personal:**
- each speaker's first turn is marked by its half of Umbral;
- there are no bubbles: both voices start on one column;
- the head, the ways to start and the field follow Home's language;
- her suggestion is a line, not a card;
- the notes are a hairline column where they sit beside the conversation, and opaque where they overlap it;
- while she writes, her half breathes and "Sophia is writing…" shows;
- on a phone, the halves stay inside the gutter.

**Acceptance with evidence:** every check listed in the design note (see Evidence).

**Unverified:** Safari and Firefox. Only Chromium (Playwright) and real Chrome were run.

**Found, not fixed here (belongs to #85):** while the opening is still up, about 5 s after Home is ready, letters reach the app's keys. In a recording a "D" opened Your data.

## Evidence

**Commands** (from `apps/studio` unless noted), with results:
- `pnpm exec playwright test e2e/personal.spec.ts`:
  - before the change: 8 of 10 failed (the design checks), 2 passed (behaviour);
  - after the change and the review's fixes: 14 of 14 passed;
  - with `--repeat-each=3`: 42 of 42 passed.
- **Mutations:** `python <scratchpad>/mutate-personal.py`, using Git's bash: 18 of 18 killed, and 2 control mutants survive.
- **From the repo root:**
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm contracts:check`: pass;
  - `pnpm --filter @sophia/studio build`: pass;
  - `node --test apps/studio/src/features/personal/*.test.ts apps/studio/src/features/light/*.test.ts`: 114 of 114 passed.
- **Browser suite:** `pnpm exec playwright test`: 301 of 302 passed. The one failure, `resources.spec.ts:1485`, is untouched by this change and passed 4 of 4 alone.

**Live route exercised:** the local stack (Studio :5179, API :8797, local Supabase), in real Chrome, with a new `@sophia.test` account:
- sign-in, then the opening, then Home;
- "/" and a message on Home, handed to Personal and answered;
- a second message, then Note this, then the notes opened.

Desktop and phone recordings went to Luis (not in Git).

**Source-register IDs consulted:** none.

## Decisions and changes

**Changed:**
- the speakers are now marked by `Who`, an SVG of each half drawn from `UMBRAL` in `threshold.ts`;
- your turns lost their bubble and start on the left;
- the head and the toggle were restyled. The toggle's class is `c3-notes-toggle`, because `.c3-notes` is the notes panel's own class;
- the starters are now rows;
- the composer is a line, with `.c3-private`, and `aria-describedby` on the field;
- the notes column is see-through only with `data-beside`, which `useShift` sets.

**Preserved:**
- all the behaviour;
- the room's `.message-bar`: every override is under `.ps-composer`;
- Davide's #76 files: `theme.css`, `Sheet.tsx` and the others are untouched.

**Brief:** Luis's "Aplica la pasada" (2026-10-04), after the Welcome. No new authorization was needed, and the scope stays within Personal.

## Remaining obligations

- **#88:** awaits CI, Codex, and Luis's merge OK.
- **Local servers this session left running** (local only, no data outside the machine): the API on :8797, the Studio on :5179, the fixture pages on :5199, and the Docker containers of the local Supabase (`sophia-next`).
- **Synthetic accounts:** `@sophia.test` accounts were created in the local Supabase only.
- **Follow-ups not done:**
  - Codex's P2s on #85–#87;
  - #85's keys reaching the app during the opening.

## Next bounded action

Luis reviews #88 and gives the merge OK once CI is green and Codex has no P1.
