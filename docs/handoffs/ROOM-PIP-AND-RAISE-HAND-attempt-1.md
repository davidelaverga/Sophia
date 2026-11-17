# Handoff: Room · keep the call in view, and raise hand

Goal and attempt: lote 18 (evaluacion-2026-11-16/textos-lote-18.md), points 11 and 12, attempt 1  
Human owner / executor resource: Luis (owner, the lines approved word for word on 2026-11-16); the Claude Code
session that built it  
Starting worktree/commit: `D:/Descargas/SophiaV4/Sophia-paper-base`, local branch `room/pip-and-raise-hand` from main
`9495c87fc` (through #513)  
Changed files: `apps/studio/src/features/voice/CallPip.tsx`, `pip-view.ts`, `hand-signal.ts`, `livekit-room.ts`,
`useProjectRoom.ts`, `RoomDock.tsx`, `ReactMenu.tsx`, `VideoStage.tsx`, `Presences.tsx`, `room-view.ts` (and their
tests `pip-view.test.ts`, `hand-signal.test.ts`, `room-view.test.ts`), `apps/studio/src/app/theme.css`,
`packages/ui/src/Icon.tsx` (`pip`, `handRaise`), `apps/studio/fixtures/fake-livekit.ts`, `fixtures/room.tsx`,
`apps/studio/e2e/call-pip.spec.ts`, `call-raise-hand.spec.ts`, `docs/plans/call-picture-in-picture.md`,
`docs/plans/raise-hand.md`, this file.

## Outcome

Both were open on main: nothing asked for picture in picture or raised a hand.

- **Keep the call in view** (help «Picture in picture») in the dock, after React. With Document Picture-in-Picture
  (Chromium) a 400×225 window shows the stage's one view (`pipShows`): a shared screen, else another who speaks, else
  another with a camera, else another, you last and only when alone; their video or initial, with the stage's own
  caption. It is a React portal of the dock's render, so it follows the call; the page's styles and theme go with it.
  Elsewhere the stage's video goes into the browser's picture in picture; without a video there, or with neither API,
  no button. Closing the small window turns the button off; leaving the call (the live controls unmount) closes it.
  On a phone (≤ 600 px) it isn't offered, so the dock keeps its one row of seven.
- **Raise hand** for members, beside React (one name, pressed while raised, tip «Lower hand»); on a phone, first in React's menu. «Hand raised» shows on the
  person's tile for everyone (the gallery chip after the name, a phone's strip shows the hand alone; in the light's
  seats, their line, before any other).
- **The token, checked first:** `issueRoomToken` grants `canPublishData` to members only and `canUpdateOwnMetadata:
  false` to everyone, so attributes were out and the data channel works for members, not guests. No API change. The
  hand is state on its own topic `sophia.hand.v1` (`hand-signal.ts`, modelled on `following-signal.ts`): kept per
  sender as LiveKit authenticated it; told to whoever joins; an ask answered only while raised; forgotten when its
  sender leaves; after a reconnect this person's own hand is lowered and said so, and what was heard before is
  forgotten once the room is asked. Leaving lowers it (the hand lives in the connection). A guest isn't offered it,
  as React (guest-reactions.md). No keyboard key: the plans define none.

## Review round (independent review: no P1, three P2s, P3s)

- **P2-1, orphaned PiP window:** a press while a request is under way asks nothing more; a window that arrives after
  the call was left (the button unmounted) is closed at once; `pagehide` clears only its own window.
- **P2-2, a lowering lost after a reconnect:** `hand-signal.ts` now keeps each change's turn; back from a drop the
  lowering is sent again every 2 s until it goes, and stops when a newer press or the call's end comes, so a raise
  pressed meanwhile is never overtaken.
- **P2-3, a 1:1 flipping to you:** `pipShows` ranks you last, only when alone.
- **P3s:** only a member's hand or ask is heard (`isMember`, as following-signal.ts); an ask answered at most once a
  second per asker; `decodeHand` reads own keys only (arrays and `__proto__` payloads let go), tested with a packet
  naming another identity; `exitPictureInPicture` caught in cleanup; video PiP offered only while the stage has a video
  (followed with a MutationObserver, only where Document PiP is absent); the hand button keeps one name with
  `aria-pressed`, as Microphone and Camera do, its tip saying «Lower hand» while raised; the page's root attributes
  are watched while the window is open, so a theme switch reaches it.
- The «mini dock closes PiP» limit is now an open question for Luis in `call-picture-in-picture.md`. The
  landscape-phone note was skipped, as asked.
- Red on `1425e4787` (tests only): units 4 fail (a guest's hand heard; the second ask from Marco answered; the lowering
  never sent again, `[hand:true, ask]`; the 1:1 window showing `a`, not `m`); the «raise not overtaken» case passes
  before the fix and guards it. Browser, 7 new cases fail: the 1:1 window showed «F» (the viewer); two windows asked
  for; no `close` after leaving while pending; theme `undefined`, expected `light`; the button still offered with the
  tile hidden; no button named «Raise hand» pressed; hand sends `up, down!, ask` with no retry.
- Green on `b27b5757f`: units 387/387 (`voice/*.test.ts`), `oxlint --type-aware .`, `tsc`, prettier clean; browser,
  the room set below plus the new cases: 107/107 (pw-direct, Wow.exe running and no Aion 2, checked before each run).

## Evidence

- Red, item 11, on `9b36951f0` (tests only): `pip-view.test.ts` with the two names stubbed locally (never committed),
  6 of 7 fail (e.g. `pipWay` actual `null`, expected `'document'`). Browser, through the guard (run 31 of the retry):
  3 of 4 fail waiting for «Keep the call in view»; «neither» passes, as it should without the button.
- Red, item 12, on the test commit (then `e1bb01721`, now `a3abe3dee` after folding in the Close step below):
  `hand-signal.test.ts` with a local stub, 7 of 8 fail (e.g. `decodeHand` actual `undefined`, expected
  `{ hand: true }`). Browser: 5 of 6 fail waiting for «Raise hand» (the 390 px case waiting for the menu item); the
  guest case passes, as it should.
- Green on `a0d603159`: `oxlint --type-aware .` clean, `tsc` clean, prettier clean on every non-docs file touched;
  `node --test apps/studio/src/features/voice/*.test.ts` 381/381. Browser: `call-raise-hand`, `call-pip`, `room-dock`,
  `call-reactions`, `room-people`, `room-tiles`, `room-pin-fullscreen`, `reconnecting-on-video`, `room-following`,
  `room-phone-floor`, `room-basics`, `orb-presence`: 101/101.
- The browser runs from the green on went through `pw-direct.ps1` (one worker, below normal): the guard refused for
  memory for over an hour (free RAM 5–7 GB), and then Wow.exe was running and Aion 2 was not (tasklist checked before
  each run).

## Deviations

- **The phone row.** Chromium has Document PiP natively, so the PiP square and Raise hand made the 390 px dock wrap
  (`room-dock.spec.ts` «one row» and «hugs the row» failed). PiP is hidden at ≤ 600 px (folded into the PiP commit),
  and on a phone the hand is the first item of React's menu (`useMedia`), as Meet's phone has it. A case for it was
  added to the test commit before the fix, and seen red.
- **«In a second participant's view».** The fixture is one page. `window.fixture.echoHand(n)` delivers the exact bytes
  this page sent as from the `n`th other person, read by the Studio's own `hand-signal.ts`, which the fake LiveKit now
  runs. That is what a second participant's page receives; two real browsers aren't exercised.
- **The leave case** first failed after the fix on the «This meeting» sheet covering Join (not a product fault); the
  test now closes it, as `room-people.spec.ts` does. Folded into the test commit.
- The fake LiveKit now emits `Reconnected` on `linkLost(false)`; nothing else in it listened for that event.
- The fake LiveKit's `failHandSends(n)` refuses the next hand sends (recorded with «!»), and `echoHand` now sends as a
  member, as only a member's hand is heard.
- My own unpushed commits were rebuilt (reset and cherry-pick) to fold those changes into their pairs; nothing pushed.

## Remaining limits

- PiP lives while the dock does (open question for Luis in the plan). No controls inside the small window; a refused `requestWindow` leaves the page as it was, silently.
- No line said to a screen reader when someone raises a hand (a new line, not approved); the tile's words are read.
- A guest can't raise a hand (the API's data grant); hands have no order, and none lowers itself when its person
  speaks.
- A reconnect's ask that can't be sent forgets nothing and isn't retried (the lowering is; the ask isn't).

## Next bounded action

Merge into the group (the coordinator's; no rebase needed): three test-first pairs and this handoff on
`room/pip-and-raise-hand`.
