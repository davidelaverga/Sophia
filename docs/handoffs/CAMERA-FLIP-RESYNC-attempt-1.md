# Implementation-session handoff

Goal and attempt: CAMERA-FLIP-RESYNC (Codex P2 on #464, `camera-flip.ts:82`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-7`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-7`, branch `room/camera-flip-resync` from `origin/main`
(`4db3fb91b`, which holds #464)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` and `.claude-guards/safe-run.ps1`, two
workers); CI as the run on record.
Existing authority: Luis 2026-10-18, «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si
se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»; merges on green
with no open P1. One small PR: two source files and one CSS rule.
Ending commit/tree: `6054f8dcb094` (tree `5a58a1966fd6`), the branch's last commit that changes code, after the
review round of 2026-10-19 (later commits touch only the plan note and this record). Against `origin/main` at that
commit: `e2e/call-devices.spec.ts`, `e2e/camera-flip.spec.ts`, `src/app/theme.css`,
`src/features/voice/camera-flip.test.ts`, `src/features/voice/camera-flip.ts`, `src/features/voice/useProjectRoom.ts`,
and the docs (`docs/plans/camera-flip-resync.md`, `docs/plans/camera-flip.md`, this record).

## Outcome

- On a phone, a camera chosen in Video settings (which the dock shows with the phone turned sideways) is where your
  tile's next Switch camera goes on from: back in portrait the press no longer asks for the camera already on.
- Where nothing can be kept on the device, a camera chosen in Video settings before any press counts too.
- After Video settings couldn't switch the camera (kept for the next call all the same), your tile's first press goes
  on from the call's own camera, not the one refused.
- On a phone turned sideways, Video settings scrolls inside the screen, so its cameras can be pressed at all; before,
  they sat above the stage's top, out of reach (the review's P1). A menu that fits, as on a computer, is unchanged.
- What #464 proved stays: with nothing kept the presses go round; a refused press is asked again; quick presses go
  round; «In the call» switches your camera.

## Evidence

- Plan: `docs/plans/camera-flip-resync.md`.
- The finding, read in the code before any change: `cameraPresses` kept its own camera from the call's first press,
  and a switch from Video settings (`RoomDock.tsx` → the room's `switchDevice` → `deviceSwitch`) never reached it.
- **Written first** (`deadb5146`): unit `camera-flip.test.ts` 6 passed, 2 failed on `TypeError: press.took is not a
  function` (the presses had no way to hear of a switch made elsewhere). The two browser checks on this commit:
  not run yet (below).
- **A control fix** (not committed): `took` setting the press's camera alone, as the old code moved it. The three
  quick presses check caught it: `['back', 'front', 'front']` for `['back', 'front', 'back']`, the first press's own
  answer, told back, pulling the third back.
- **Fixed** (`93d43ae69`): unit 8/8.
- **The refusal, written first** (`e89e1673e`, found while reading `deviceSwitch`): a browser check only; not run yet.
- **Fixed** (`7f2065aa6`).
- **At `7f2065aa6`:** unit `camera-flip.test.ts` 8/8 and every `features/voice` unit 242/242; type-aware lint (whole
  repo), typecheck and Prettier clean.
- **Browser checks not run in the first round.** The guard would not start any Playwright run (free RAM 8.4 to 8.6 GB
  against its 9 GB floor). They ran in the review round, below; the REDs planned at `deadb5146` and `e89e1673e` would
  have failed on the press on a camera row (the review's P1), so they ran on controls instead.

### Review round (2026-10-19)

Four findings, all verified in the code and then in the browser.

- **P1 and P2 (the same cause): at 844 × 390 the camera rows of Video settings sit above the stage's top.** Read in
  `theme.css`: `.room-stage` is 460 px (`min-height`) with `overflow: hidden`, `.menu-top` has no height limit, touch
  rows are 44 px. Measured in the fixture (`@phone`, 844 × 390): the menu 576 px, from −228 to 348 px down the stage;
  FaceTime HD Camera at −180..−136, Desk camera at −134..−90, None at −36..8. The three Video settings checks could not
  press a camera at any commit.
  - **Written first** (`82fd261d8`): `@phone · devices · turned sideways in a call, every row of Video settings is
    within a finger’s reach` (`call-devices.spec.ts`). Run at `82fd261d8`, grep `sideways|Video settings`: 4 failed,
    3 passed. The new check listed `FaceTime HD Camera`, `Desk camera`, `None` as rows a press at their middle doesn't
    reach; the three Video settings checks in `camera-flip.spec.ts` timed out on the camera row, «element is outside
    of the viewport» (the review's P1, seen in the browser).
  - **Fixed** (`6054f8dcb`): `.device-menu > .menu` takes at most the room above the dock (the stage's height, or the
    screen's where the stage runs past it, less the floor, `--dock-h`, the 6 px between and a margin) and scrolls.
    Measured after: the dock wraps to two rows (96 px) and the menu is 260 px, 88..348 px down the stage, its top
    18 px from the screen's with the page at its end; the cameras at 136..180 and 182..226.
  - Not a taller viewport in the checks: the checks keep a phone's own size, and the product had the same gap.
- **P2: the seam (`switchCamera`, `tellingCamera`) and the refusal fix had no check that ran.**
  - **Unit** (`5d0f8b618`, after the fix they cover; `callPresses` exported for them): a switch that took through
    `switchCamera` is where the call's next press goes on from; a camera Video settings couldn't switch to, kept all
    the same, is asked again by the call's first press. 10/10 here. Controls, not committed: the taken switch left
    untold failed the first (`['back']` for `['front']`); the presses begun after the switch, as at `93d43ae69`,
    failed the second (`['front']` for `['back']`).
  - **Browser REDs on controls** built on `6054f8dcb` (menu fix included) with `git commit-tree`, kept off the
    branch; `camera-flip.spec.ts`, grep `Video settings`:
    - `7c7b310b0`, `camera-flip.ts` and `useProjectRoom.ts` as on `main` (no resync): 3 failed, each on the switches
      asked: the next press asked `cam-built-in`, the camera already on; the nothing-kept first press asked
      `cam-desk`, already on; after the refusal the first press asked `cam-built-in` for `cam-desk`.
    - `35f174a61`, both files as at `93d43ae69` (presses begun after the switch): only the refusal check failed,
      `cam-built-in` for `cam-desk`.
    - `8a2412042`, head with `tellingCamera` unwired from the room's `switchDevice`: the same 3 failures as on
      `main`, so the wiring at `useProjectRoom.ts:634` is held by the browser checks.
- **At the head (`6054f8dcb`):** `camera-flip`, `call-devices` and `room-tiles` through `pw.ps1`: 52 passed (with a
  measurement spec run beside them and deleted, 53). Unit `camera-flip.test.ts` 10/10, every `features/voice` unit
  244/244, `src/app` units 276/277 (the one failure is `attention.test.ts`, Windows path separators); type-aware lint
  (whole repo), typecheck and Prettier on the touched files clean.

## Decisions and changes

- **The presses keep the call's camera as the last switch that took** (`cameraPresses(...).took`), and the camera the
  latest waiting press asked for, which leads the next press: quick presses go round even though the call's own
  switches come back through the room too.
- **One place for every camera switch** (`switchCamera` in `camera-flip.ts`, called from the room's `switchDevice` in
  `useProjectRoom.ts`), not a hook in each control: Video settings, your tile and «In the call» all reach it. It
  begins the call's presses before the switch, from the camera kept for calls (the switch replaces that choice even if
  refused), and tells them the camera once it took.
- **Not LiveKit's `getActiveDevice`:** in livekit-client 2.22.3 it starts as `'default'` and is set on publish and when
  a track restarts, from the track's own report, awaited apart from the switch; the fixture would have to fake it too.
- **The refusal case** was not in the finding; it is the same gap (the presses not following the call's camera across a
  switch made elsewhere), closed by the same entry point, with its own check written first.
- **The menu's height in this branch, not a follow-up** (review round): the path the resync fixes runs through Video
  settings on a phone turned sideways, which couldn't be taken without it, and Luis asked for one PR where one will do.
  It is one CSS rule on the dock's device menus (`.device-menu > .menu`), with its own check written first.

## Remaining obligations

- A switch made elsewhere while a press of your tile still waits for its answer is counted, but the waiting press still
  leads the next one (two controls at once, which a phone's two layouts never show together).
- A camera the system changes under the call (unplugged, taken by another app) isn't told to the presses.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1. Nothing is owed locally.
- Source IDs consulted: none from the source register; the work read this repository only.
