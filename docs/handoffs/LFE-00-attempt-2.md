# Implementation-session handoff: LFE-00, attempt 2 (the room's preservation checks, in CI)

- **Goal and attempt:** [LFE-00](../execution/2026-10-01-unified/frontend/LFE-00.md), session 00.3: BASE-01 to BASE-03 as checks in the repository that CI runs. [Attempt 1](LFE-00-attempt-1.md) did 00.1, 00.2 and 00.4.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine. Luis chose Playwright in CI.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-00/preservation-checks` from main `81e48cc`, 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:** the Studio's tests and fixtures, CI, CONTRIBUTING and LFE-00's records. **No hosted service, schema or product code was changed.**

## Outcome

- **BASE-01 to BASE-03 run in Chromium on every push** ([`apps/studio/e2e/room.spec.ts`](../../apps/studio/e2e/room.spec.ts), CI job `studio-browser`):
  - **BASE-01:** unsent chat text and a brief edit survive switching tabs, a background update to the project and its brief, closing the panel and reopening it.
  - **BASE-02:** with the panel closed, `d`, `e` and `j` do nothing. With the focus on a panel tab or nowhere, letters reach the message bar. The room is asked for nothing.
  - **BASE-03, at 390×844 on a touch screen:** in a call with the panel open, mute (pressed: sending), the media error and the room's error are in the viewport. Mute is tapped and turns off. After Close, Leave the room is in reach, and after leaving, Join the room brings the call back.
- **They drive the real Studio components** (`StudioShell`, the side panel, dock, chat and brief) on a fixture page, [`apps/studio/fixtures/room.html`](../../apps/studio/fixtures/room.html). It is labelled "Fixture — no API, no call" and served by its own Vite config. It has:
  - a fake call that records what the room is asked (`microphone:off`, `leave`, `join`…);
  - a query cache seeded with a fixture snapshot and membership;
  - a fetch that answers only the brief.
- **Nothing reaches a network.** Any other request is recorded, and each check fails if one happened; requests to other origins are aborted.
- **[CONTRIBUTING](../../CONTRIBUTING.md#the-rooms-side-panel)** says how to run the checks and what they cover. [LFE-00 progress](../progress/LFE-00.md#acceptance-cases) records BASE-01 to BASE-03 as fixture evidence in CI.

Missing or unverified:

- **These are fixture checks.** They don't show a live call, LiveKit, the API or a hosted Studio. Those runs wait for a hosted candidate.
- **BASE-04** (research and personal routes in one reviewed candidate) needs PR32's candidate: LFE-02.
- **Only Chromium.** The build targets Safari 16.4; WebKit isn't run.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: 3 of 3 pass locally (Chromium 1.63.0).
- **Each case fails when what it protects breaks.** Six mutations of the product code each made their case fail, every run on a fresh fixture server:
  - BASE-01: only the open tab mounted;
  - BASE-02: the panel no longer a typing scope; a lone `d` as the microphone key;
  - BASE-03: the panel without its call switches; the panel without its device note; Join disabled.
  The code was restored after each one.
- The production build has none of it: `pnpm --filter @sophia/studio run build`, then a search of `dist/` for the fixture's label, identity and token finds nothing.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 559 pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **A fixture page, not the dev stack.** It is the real components with no API, Supabase or LiveKit, so the job needs no secrets and doesn't depend on a hosted service.
- **One new dependency:** `@playwright/test` 1.63.0, exact, in the Studio's devDependencies. The CI job installs Chromium with its system packages.
- **Classes from earlier reviews checked before the push:**
  - the regression tests are in the repository and run in CI;
  - the fixtures are labelled and outside the production build;
  - no fixed waits;
  - every case is mutation-checked;
  - the lockfile is in the same commit;
  - each claim here was checked against the code and the runs.

## Remaining obligations

- **Davide confirms the one-writer map** ([attempt 1](LFE-00-attempt-1.md#remaining-obligations)).
- BASE-01 to BASE-03 in a live call, and BASE-04, when a hosted candidate exists.

## Next bounded action

- LFE-02 with PR32's author: the report and PDF UI. Then LFE-03 on fixtures.
