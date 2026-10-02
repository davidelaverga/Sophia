# Implementation-session handoff: LFE-00, attempt 2 (the room's preservation checks, in CI)

- **Goal and attempt:** [LFE-00](../execution/2026-10-01-unified/frontend/LFE-00.md), session 00.3: BASE-01 to BASE-03 as checks in the repository that CI runs. [Attempt 1](LFE-00-attempt-1.md) did 00.1, 00.2 and 00.4.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine. Luis chose Playwright in CI.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-00/preservation-checks` from main `81e48cc`, 2026-10-02.
- **End:** the checks and docs at `9990a71` (tree `54e6f5805c95`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** the Studio's tests and fixtures, CI, CONTRIBUTING and LFE-00's records. **No hosted service, schema or product code was changed.**

## Outcome

- **BASE-01 to BASE-03 run in Chromium on every push** ([`apps/studio/e2e/room.spec.ts`](../../apps/studio/e2e/room.spec.ts), CI job `studio-browser`):
  - **BASE-01:** unsent chat text and a brief edit survive switching tabs, a background update to the project and its brief, closing the panel and reopening it. A message that arrives while the chat is out of view (panel closed, or Brief open) marks Chat "something new" until it is seen; one that arrives while the chat is open doesn't.
  - **BASE-02:** with the panel closed, `d`, `e` and `j` do nothing. With the focus on a panel tab or nowhere, letters reach the message bar. The room is asked for nothing. Leaving text mode asks the room once (`text:off`) and hands the focus to the microphone beside it.
  - **BASE-03, at 390×844 on a touch screen:** in a call with the panel open, mute (pressed: sending), the media error and the room's error are in the viewport. Mute is tapped and turns off. After Close, Leave the room is in reach, and after leaving, Join the room brings the call back.
- **Together they cover the six behaviours LFE-00.3 names:** Chat/Brief switching, drafts, unread state, mobile media controls, text-mode exit and keyboard capture. Unread state and text-mode exit came in after Codex's review of the first push (P2).
- **They drive the real Studio components** (`StudioShell`, the side panel, dock, chat and brief) on a fixture page, [`apps/studio/fixtures/room.html`](../../apps/studio/fixtures/room.html). It is labelled "Fixture — no API, no call" and served by its own Vite config. It has:
  - a fake call that records what the room is asked (`microphone:off`, `text:off`, `leave`, `join`…);
  - a query cache seeded with a fixture snapshot and membership, and a way for another member to write;
  - a fetch that answers only the brief.
- **Nothing reaches a network.** Any other request is recorded, and each check fails if one happened; requests to other origins are aborted.
- **[CONTRIBUTING](../../CONTRIBUTING.md#the-rooms-side-panel)** says how to run the checks and what they cover. [LFE-00 progress](../progress/LFE-00.md#acceptance-cases) records BASE-01 to BASE-03 as fixture evidence in CI.

Missing or unverified:

- **These are fixture checks.** They don't show a live call, LiveKit, the API or a hosted Studio. Those runs wait for a hosted candidate.
- **BASE-04** (research and personal routes in one reviewed candidate) needs PR32's candidate: LFE-02.
- **Only Chromium.** The build targets Safari 16.4; WebKit isn't run.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: 5 of 5 pass locally (Chromium 1.63.0).
- **Each case fails when what it protects breaks.** Ten mutations of the product code each made their case fail, every run on a fresh fixture server:
  - BASE-01: only the open tab mounted; the chat never out of view; the chat never in view;
  - BASE-02: the panel no longer a typing scope; a lone `d` as the microphone key; text mode not turned off; the focus dropped after leaving it;
  - BASE-03: the panel without its call switches; the panel without its device note; Join disabled.
  The code was restored after each one.
- The production build has none of it: `pnpm --filter @sophia/studio run build`, then a search of `dist/` for the fixture's label, identity and token finds nothing.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 559 pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **A fixture page, not the dev stack.** It is the real components with no API, Supabase or LiveKit, so the job needs no secrets and doesn't depend on a hosted service.
- **One new dependency:** `@playwright/test` 1.63.0, exact, in the Studio's devDependencies. The CI job installs Chromium with its system packages.
- **The workspace lock changed with it,** so `config/runtime-unit.json` records its new `workspace_lock_sha256` (`6cd0f40b…`). CI's runtime-unit and PostgreSQL jobs compare it on the first push and failed until it was recorded.
- **Classes from earlier reviews checked before the push:**
  - the regression tests are in the repository and run in CI;
  - the fixtures are labelled and outside the production build;
  - no fixed waits;
  - every case is mutation-checked;
  - the lockfile is in the same commit;
  - each claim here was checked against the code and the runs.

## Remaining obligations

- **The fixture replaced the room controller and bypassed the query cache** (Codex, two P2s on #40's last push). [Attempt 3](LFE-00-attempt-3.md) closes both.
- **Davide confirms the one-writer map** ([attempt 1](LFE-00-attempt-1.md#remaining-obligations)).
- BASE-01 to BASE-03 in a live call, and BASE-04, when a hosted candidate exists.

## Next bounded action

- LFE-02 with PR32's author: the report and PDF UI. Then LFE-03 on fixtures.
