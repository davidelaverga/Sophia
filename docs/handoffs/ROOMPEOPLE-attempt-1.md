# Implementation-session handoff

Goal and attempt: the room's fixture shows people and Sophia's states (`docs/plans/room-fixture-people.md`), attempt 1. It is the first PR of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/fixture-people` from `main` at `458f5d7`, 2026-10-05
Ending commit/tree and changed files: these files changed; the product code is untouched.
- in `apps/studio/fixtures/`: `fake-people.ts` (new), `fake-livekit.ts`, `data.ts`, `fixture-api.ts` and `room.tsx`;
- `apps/studio/e2e/room-people.spec.ts` (new);
- `docs/plans/room-fixture-people.md`.

## Outcome

The room's fixture page can now show what its fake LiveKit couldn't. The query string picks each state, and `window.fixture` changes them while the page is open:
- other people: `people=1…5`, synthetic names;
- the floor: `floor=1…N|me|absent`;
- who speaks: `speaking=0…N`;
- Sophia's participant: `sophia=here|listening|settling|answering|speaking|blocked`, with the attributes her bridge sets;
- her voice and a pause: `voice=recovering|unavailable`, `paused=guest|holder_left`;
- video: `video=camera` gives the gallery, from synthetic canvas streams; `video=screen` gives the present layout;
- what she sees: `looking=screen`, only with a shared screen.

The fixture API answers a pass of the floor as the API does:
- a stale room revision is refused (409 `stale_revision`);
- a pass moves the holder, adds one to `inputEpoch` and ends a `holder_left` pause;
- each pass publishes the room's next revision.

A pause and a voice exist only inside an open conversation, as `readSophia` reads them. With none of the new parameters, the page is exactly as before.

**Independent review, round 1:**
- one P1, fixed: `snapshot` was too complex for lint, so the presence is now built by helpers;
- five P2s, fixed:
  - impossible presence states (a pause or a voice outside a conversation);
  - a floor route more lenient than the API;
  - `holder_left` holding the viewer, who is in the room;
  - `sophiaLeaves` leaving her signal;
  - attributes the bridge never sends.

**Round 2:** one P2, fixed: after a reclaimed pause, the bridge admits the new holder, so the check now expects "Sophia is listening to you". One P3, fixed: only `guest` and `holder_left` pause. No P1 or P2 remains.

**Codex on `3beeb8a`:** one P2 and no P1. Allow audio did nothing in `sophia=blocked`; pressed, it now lets her sound through, as LiveKit's playback does. Fixing it also exposed a flaky check: the stale pass failed 1 run in 34, because a snapshot read after `moveRoom()` taught the page the new revision. `moveRoom()` now moves the room just as the next pass reaches the API, the race it stands for. The room specs then passed 99 of 99 over 3 runs, and both new mutants are killed.

## Evidence

**Commands** (browser checks through `pw-safe.ps1`):
- **Tests first:** all 12 of the first checks failed before the change.
- **`room-people.spec.ts`:** 17 checks, run 3 times (48 of 48 before the last check was added).
- **Full suite:** 436 of 440. The 4 failures are `report-page.spec.ts`, which fails the same way on `main` on this Windows machine.
- **Mutations** (`<scratchpad>/mut-room/mutants.py`, run with Git's bash): 19 of 20 product mutants are killed, and the control survives. M18 survives: it is the `input: 'paused'` attribute during a pause. It is kept to match what the bridge sends, but while paused the view decides from the snapshot's presence and never reads it.

**From the repo root:** `pnpm lint` and `typecheck` pass, and Prettier is clean on the changed code.

**Seen once the states could be seen** (captures in the session), for the next PRs:
- on a phone, the people's names cross the light;
- in the present layout, the last tile of the strip is cut off.

**Source-register IDs consulted:** none.

## Remaining obligations

This PR awaits CI and Codex; Luis's standing OK is to merge without a P1.

## Next bounded action

PR 2 of the plan: captions on the stage and Sophia's line, built over these fixture states.
