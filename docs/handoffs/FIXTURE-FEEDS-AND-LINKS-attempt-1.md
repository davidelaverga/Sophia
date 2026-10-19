# Implementation-session handoff

Goal and attempt: FIXTURE-FEEDS-AND-LINKS (two follow-ups from `evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`:
#369 «Remove stopped tracks from fixture feeds», #413 «Make addressOf the single sheet-link builder»; Luis 2026-10-19:
«Entonces sigue trabajando en lo que viene mientras esperamos»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-8`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-8`, branch `polish/fixture-feeds-and-links` from the
local `group/follow-ups-5` (`56c61c61e`, batch 5, unpushed), which stacks on #468 (`group/seams-4`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19, the quote above; local only, nothing pushed; merges on green with no open P1 once
pushed, after #468 and batch 5.
Ending commit/tree: `9db653cca5cb` (tree `ebddb9dfb812`), the last commit that changes code (the next ones touch only
the plan note and this record). Files changed against `56c61c61e`: `e2e/host-controls.spec.ts`,
`fixtures/fake-people.ts`, `src/features/conversations/OpenConversation.tsx`, `src/features/resources/link.test.ts`,
`docs/plans/fixture-feeds-and-links.md`, and this record.

## Outcome

- **On the room's fixture page a camera turned off or a screen stopped leaves the stage.** Before, People dropped the
  menu item but the stage kept drawing the video. `feeds()` now reads each feed from the people still in the call, a
  camera where `cameraOn`, a screen where `screenOn`. So a person an admin removed, or who left, takes their video too,
  as LiveKit's unpublish does. The product itself is untouched: this is the fixture LiveKit stands in for.
- **A conversation's «Copy link» uses `addressOf(c.id, CONVERSATION)`.** `conversationLink` is gone. The copied link
  is the same string; nothing on screen changes.

## Evidence

- Plan: `docs/plans/fixture-feeds-and-links.md` (`784a1d3c2`).
- **Verified on the branch before writing:** the triage's line numbers hold. `feeds()` is at `fake-people.ts:300-306`,
  `cameraOff`/`screenOff` at `:112-113`, `person()` at `:135-152`, `theirs()` at `fake-livekit.ts:254`;
  `conversationLink` at `OpenConversation.tsx:310-314`, used at `:277`. One thing past the brief: `feeds()` also
  ignored `removed` (and, for screens, `left`). The fix covers them through the same reading.
- **#369 written first** (`e4eaeeabe`, `host-controls.spec.ts`), run through the guard (`pw-logs/feeds-red.txt`, grep
  «leave the stage»): 1 failed, at line 126, after `stop-camera` reached the server:
  `expect(tile(LUCIA).locator('video')).toHaveCount(0)`, «Expected: 0 / Received: 1».
- **#369 fixed** (`9dca2eafb`). Through the guard (`pw-logs/feeds-green.txt`): 140/140 pass across `host-controls`,
  `room-tiles`, `camera-flip`, `room-pin-fullscreen`, `two-screens`, `incoming-video`, `room-people`, `room-present`,
  `room-basics`, `reconnecting-on-video`, `light-stage` and `dock-header`.
- **#413 written first** (`72e3a7861`, `link.test.ts`): `node --test apps/studio/src/features/resources/link.test.ts`
  fails with «actual: [ 'features/conversations/OpenConversation.tsx', 'features/resources/link.ts' ] / expected:
  [ 'features/resources/link.ts' ]».
- **#413 fixed** (`9db653cca`): `link.test.ts` 3/3. Through the guard (`pw-logs/links-green.txt`): 317/317 pass
  across `conversations-polish`, `conversation-moves` (the two that copy a conversation's link), `goals-overview`,
  `work` and `resources`.
- Studio units: 1907/1909. The two failures are the Windows path ones (`attention.test.ts`,
  `browser-imports.test.ts`).
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the four touched code files: clean.
- **No captures:** the product shows nothing new. #369 changes only the fixture, and #413 copies the same link.

## Decisions and changes

- **The feeds follow `person()`, not a second set of rules.** `person()` already says who has a camera or a screen on
  from the address and the admin's acts. Reading the feeds from it keeps one truth, where a filter on `cameraOff` /
  `screenOff` would have left `removed` and `left` out again.
- **The source scan matches the join, not the name.** It looks for `${origin}${pathname}${search}${linkHash(`, read
  from `window.location` or destructured, in every non-test `.ts`/`.tsx` under `src/`. A builder that joins the
  address another way would slip past it. A grep found no other today (the others join a path or a route, not a link
  hash).

## Remaining obligations

- None locally. The API side of #369 (mute-all past a participant who left, a screen's audio before its unpublish) is
  Davide's lane, as the triage says.

## Next bounded action

- Luis: say when to push (with the next group PR, after #468 and batch 5); then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the triage's two rows.
