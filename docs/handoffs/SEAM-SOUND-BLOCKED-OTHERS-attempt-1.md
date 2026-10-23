# Implementation-session handoff

Goal and attempt: SEAM-SOUND-BLOCKED-OTHERS (costuras.md seam #6, 2026-10-18, with the judge's adjustment: said when
the call is live with others, never the moment someone speaks), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `seams/sound-blocked-others` from
`origin/main` (`e395d63ea`, which holds #466: the orb keeps still while reconnecting with a blocked sound)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` and `.claude-guards/safe-run.ps1`, two
workers); CI as the run on record.
Existing authority: Luis 2026-10-18, «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si
se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»; local only,
nothing pushed; merges on green with no open P1 once pushed. One small PR.
Ending commit/tree: `862d6bf71848` (tree `13bf3b42f174`), the branch's last commit that changes code (the next ones
touch only the plan note and this record). Against `origin/main` at that commit: `e2e/room-people.spec.ts`,
`fixtures/fake-livekit.ts`, `fixtures/fake-people.ts`, `fixtures/room.tsx`, `src/app/theme.css`,
`src/features/voice/RoomDock.tsx`, `src/features/voice/SophiaControls.tsx`, `src/features/voice/sound-view.ts`,
`src/features/voice/sound-view.test.ts`, `src/features/voice/useProjectRoom.ts`, and
`docs/plans/sound-blocked-others.md`.

## Outcome

- When the browser blocks the call's sound and someone else is in the call, the dock says «This browser blocked the
  call’s sound.» with Allow audio and Not now, whoever speaks. Before, only Sophia's own voice offered Allow audio, and
  colleagues speaking lit their tiles with no sound and no word.
- The line is a polite status. It is mounted with the dock, so its words are announced when they come. It never takes
  the focus and blocks nothing. It names no account.
- Allow audio lets every voice through in one press, and the line goes. Not now puts it away for the rest of that
  call: a member speaking, the link coming back or a visit to Tasks brings nothing back. The next call says it again.
- Only one Allow audio ever shows. While the line shows, it holds the only one: one press lets Sophia's voice through
  too, and the line stays put while she starts and stops speaking. Her own pill shows only where the line doesn't (she
  is the only one who could be heard, or the line was put away). Her stage line and the call on her rim are unchanged,
  and so is the orb's still-while-reconnecting rule.
- Each press hands the focus to the microphone, since the control pressed goes with the line.

## Evidence

- Plan: `docs/plans/sound-blocked-others.md` (`e68a30e29`, updated in `4f419d55d`).
- **The report against today's code:** every claim held, at moved lines. `livekit-room.ts` audioBlocked/startAudio
  sit at 485/487, not 480/481. `useProjectRoom.ts` is at 585, not 552. `sophia-view.ts`'s needsAudio is at 107-117, not
  90-98, and since #466 it also stays over a reconnect. `RoomDock.tsx:307` is still the only Allow audio. Two things the
  report didn't say: the fake's `startAudio` wasn't recorded, and livekit-client 2.22.3 can report the block when the
  call connects (an AudioContext still suspended), which is why the line waits for someone else to be in the call.
- **Written first** (`b92d0c7bd`, with the lever `sound=blocked`, `window.fixture.blockSound()` and `audio:start` in
  the fake):
  - unit `sound-view.test.ts`: `ERR_MODULE_NOT_FOUND … sound-view.ts` (the room's sound view didn't exist);
  - browser, `room-people.spec.ts`, grep `sound ·`, detached at `b92d0c7bd`: 4 failed, 1 passed (the control):
    - «blocked with others»: `expect(locator).toContainText(expected) failed`, `Expected substring: "This browser blocked
      the call’s sound."`, `element(s) not found`;
    - «the block arriving in a call already live»: the status region `Expected: 1`, `Received: 0`;
    - «Sophia speaking into the block with others here»: the line, `element(s) not found`;
    - «put away with Not now»: `locator.click: Test timeout of 30000ms exceeded.` on Not now.
- `1fe39bdc9` (test lint only): the fake's Allow audio moved out of `connectRoom` (61 lines against 60), and an
  optional chain dropped.
- **Fixed** (`1e4993671`): unit 7/7. Browser `room-people` + `orb-presence`: 30 passed, 1 failed. The once-per-call
  check's Join press was taken by «This meeting»'s backdrop, which Leave opens; `f3a2c88a4` closes it first, as the
  captions' check does.
- **The neighbours' run** found that the empty region carried `.dock-note`, so `call-devices` ("a switch the browser
  refuses") hit a strict-mode violation on two `.dock-note`. Fixed in `a11f91bde`: the region takes the class only once
  it has words. Keeping the `.dock-note` rule as it was keeps `material.test.ts` green (it reads that exact selector).
- **Captures** at 1280×800 dark and 390×844 light (`scratchpad/seams-sound-blocked-others/`), through a spec deleted
  after. Horizontal overflow 0 on all four (`others`, and `with-sophia`), with 1 Allow audio on each page. They showed
  Not now alone under the sentence at 44ch. Fixed in `862d6bf71`: one line at 1280 (the note 363 px wide); at 390 the
  sentence, then both answers together (358 px, inside the 16 px gutters).
- **Controls**, built off the branch with commits never on it (`room-people.spec.ts`):
  - `46131b17b`, Sophia's pill not stepping aside: «Sophia speaking into the block with others here» fails, `Expected:
    1`, `Received: 2` Allow audio;
  - `52bf87df2`, the dismissal kept in the dock's own state: «put away with Not now» fails at line 141, the line back
    after Tasks and Studio (`Expected: 0`, `Received: 1`).
- **At the head (`862d6bf71`):** through `pw.ps1`, `room-people`, `orb-presence`, `muted-speech`, `push-to-talk`,
  `room-dock`, `room-basics`, `call-devices`, `call-backgrounds`, `camera-flip`, `dock-header`, `join`,
  `light-room-paper` and `control-heights`: 145 passed. Unit `sound-view.test.ts` 7/7; every `features/voice` unit
  266/266; `src/app` units 283/284 (the one failure is `attention.test.ts`, Windows path separators). Type-aware lint
  (whole repo), typecheck and Prettier on every touched file are clean.

## Decisions and changes

- **The rule is pure** (`soundView` in `sound-view.ts`). The line shows when the person is in the call (live or coming
  back: the block is this browser's own), the sound is blocked, someone else is here and the line wasn't put away. Her
  pill shows when she needs it and the line isn't showing.
- **The memory lives in the room controller**, with the call's other one-call choices (`useCallChoices`: volumes,
  others' cameras), and resets when the call ends. The dock mounts again on every visit to another view, and the
  control above shows a memory kept there forgets.
- **A state line, not a one-shot.** It goes when the sound plays, or when nobody else is left. If the browser blocks
  the sound again in the same call, and the line wasn't put away, it says so again: that is the same silence, and Allow
  audio is still the only way out. Put away, it never comes back in that call.
- **The single Allow audio is the line's** while it shows: it names the cause (the whole call's sound) and stays put,
  where her pill comes and goes with each answer.
- **The empty status is out of the layout** (clipped, absolute) rather than `display: none`, so a screen reader has the
  region before the words arrive. The `blockSound()` check shows that the words land in the region that was already
  there.

## Remaining obligations

- From another view the mini dock doesn't say it; back in the room the line is there unless it was put away.
- Where the side panel covers the dock (760 px and below), the line waits under it, as the dock's other notes do; a
  screen reader still hears it.
- Whether a real browser reports `canPlaybackAudio` false while only colleagues speak wasn't observed on a device (the
  report's medium confidence). The fixture reports it, as LiveKit's event would.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1. Nothing is owed locally.
- Source IDs consulted: none from the source register; the work read this repository and the seam report only.
