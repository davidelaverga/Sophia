# Implementation-session handoff: LFE-00, attempt 3 (the checks drive the real room controller and query cache)

- **Goal and attempt:** [LFE-00](../execution/2026-10-01-unified/frontend/LFE-00.md), session 00.3, follow-up. Codex left two P2s on #40 ([attempt 2](LFE-00-attempt-2.md)): the fixture replaced the room controller, and it pushed snapshots past the query cache. LFE-00.3 says to replace neither. Luis asked for both to be fixed.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-00/real-controller` from main `55ddc1e`, 2026-10-02.
- **End:** the checks and docs at `c34cf69` (tree `c85a1b165ac2`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** the Studio's browser checks and fixtures, CONTRIBUTING and LFE-00's records. **No product code, schema, dependency or hosted service was changed.**

## Outcome

- **The fixture page mounts the Studio's own `ProjectShell`** ([`apps/studio/fixtures/room.tsx`](../../apps/studio/fixtures/room.tsx)). It runs as the app runs it, inside a `QueryClient` and the shortcut scope: the project feed (`useProjectFeed`), the TanStack query cache, the room controller (`useProjectRoom`, `useTypedChat`) and `StudioShell`. The fake room (`fixtures/fake-room.ts`) is gone.
- **Only two boundaries are faked:**
  - **The API, at fetch** ([`fixture-api.ts`](../../apps/studio/fixtures/fixture-api.ts)): snapshot, membership, brief, room token, and a live event stream. The stream replays the events after the page's cursor, as the API does, and fails its read when the page drops it, as a fetch does. A background update is an event on that stream. The Studio's own feed applies it, invalidates the snapshot and refetches it and the brief. Any other request fails the check.
  - **LiveKit, at the module the controller loads** ([`fake-livekit.ts`](../../apps/studio/fixtures/fake-livekit.ts)). The fixtures' Vite config resolves `useProjectRoom`'s `import('./livekit-room.ts')` to it. It records what the call is asked, can refuse a device as a blocked permission does (`NotAllowedError`), and can lose the connection (`dropped`). The Studio's own build config is unchanged.
- **The checks now use the controller's own words and transitions** ([`room.spec.ts`](../../apps/studio/e2e/room.spec.ts)), across six checks:
  - **BASE-01, the update:** the check waits until the page has fetched snapshot 2 and brief 2, and only then reads the drafts.
  - **BASE-01, unread state:** the message arrives through the feed.
  - **BASE-02, text mode:** it begins by typing to Sophia, and ends by pressing the pill. The call is told `text:off`, and the focus moves to the microphone.
  - **BASE-03 on a phone:**
    - a camera the browser refuses says "Camera blocked. Allow it in the address bar." inside the open panel;
    - mute stays in reach;
    - Leave and Join the room work;
    - a lost connection says "You were disconnected from the room.", and Try again brings the call back.

Missing or unverified:

- **These are still fixture checks.** They don't show a live call, LiveKit, the API or a hosted Studio.
- **BASE-04** waits for PR32's candidate (LFE-02). Only Chromium runs.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: 6 of 6 pass locally, and 18 of 18 with `--repeat-each=3`.
- **Each check fails when what it protects breaks.** Fourteen mutations of product code each made their case fail, every run on a fresh fixture server. The code was restored after each one.
  - The ten from attempt 2.
  - The feed: an applied event that refreshes nothing.
  - The controller:
    - text mode that never reaches the call;
    - a refused device that says nothing;
    - a lost call that says nothing.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. The Studio's production build has no fixture string. `pnpm test`: 559 pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **The fake LiveKit is chosen at module resolution, not with a flag in product code.** The controller's code is the same code the Studio ships. Only the fixtures' Vite config knows the fake exists.
- **The fake event stream behaves as fetch does when it is dropped.** Without that, the feed waited on a read that never failed, and no update after the first gap arrived. Found while building this, before any check relied on it.

## Remaining obligations

- **Davide confirms the one-writer map** ([attempt 1](LFE-00-attempt-1.md#remaining-obligations)).
- BASE-01 to BASE-03 in a live call, and BASE-04, when a hosted candidate exists.

## Next bounded action

- LFE-02 with PR32's author: the report and PDF UI. Then LFE-03 on fixtures.
