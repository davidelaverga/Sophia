# Implementation-session handoff

Goal and attempt: OFFLINE-JOIN-FROM-REST (the three questions asked after #467, costuras seam #8; Luis 2026-10-19:
«Pon tus sugerencias a esas preguntas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `seams/offline-join-from-rest` from
`origin/group/seams-4` (`fc61e4301`, PR #468, open: main `b89a5a962` with #467, the blocked-sound line, the toast
width and Home's since sentence)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19, the quote above, applying the three suggestions; local only, nothing pushed;
merges on green with no open P1 once pushed. It stacks on #468, which merges first.
Ending commit/tree: `b7c5f53babb2` (tree `f13af1dc1c32`), the branch's last commit that changes code (the next ones
touch only plan notes and this record). Against `fc61e4301`: `e2e/room.spec.ts`, `fixtures/fixture-api.ts`,
`src/features/conversation/Composer.tsx`, `src/features/voice/RoomDock.tsx` (a comment),
`src/features/voice/call-end.ts`, `src/features/voice/call-end.test.ts`, `src/features/voice/useProjectRoom.ts`, and
`docs/plans/offline-join-from-rest.md`.

## Outcome

- **Built (question 1).** While the browser is offline, no Join asks for a token: the dock, the check sheet, the
  header's mini dock, Work's Join the room, a toast's Rejoin, the join key, Talk it through and Chat with Sophia.
  - With no call lost before it, the dock says «You’re offline. Join once you’re back.» from the polite line #467
    mounted. It is a status, never an alert, and never takes the focus. Join keeps its words («Joining…» never shows).
  - When the online event comes, the line goes and nothing joins on its own. The next press joins.
  - Before, the press asked for a token and the dock said «The room isn’t available right now. Try again in a
    moment.» as an alert, with Try again.
  - #467's lost-call lines keep their words exactly, and the blocked-sound line beside them is untouched.
  - A join that began online and failed offline says the new line too. Chat with Sophia's foot says offline once:
    the bar's «Your words wait here.» steps aside, as it already did for the lost call.
- **Recorded (question 2), no code.** A message held with no reply, offline, keeps «You’re offline, so “…” isn’t
  confirmed. Send it again once you’re back; it won’t be written twice.» (`offline-work-side.md`, «Decided»).
- **Recorded (question 3), no code.** Home keeps the held empty line under the greeting when Sophia has nothing to
  say (`home-no-false-claim.md`, «Decided»).

## Evidence

- Plan: `docs/plans/offline-join-from-rest.md` (`5eb00edad`), committed before the tests.
- **The claims against today's code:** `joinOnline` fenced only `!navigator.onLine && lost.current`
  (`useProjectRoom.ts` 604). The token fetch's failure becomes an `ApiError` with status 0 (`api/client.ts` 330), so
  `joinMessage` said «The room isn’t available». `keptNote`'s own check asserted «offline with no call lost (a Join
  from rest), the note is kept as said». Every Join calls `room.join`, which is that fence.
- **Written first** (`a6381d4f5`; the fixture now records each token asked for, `served: room-token`):
  - unit `call-end.test.ts`: `SyntaxError: The requested module './call-end.ts' does not provide an export named
    'OFFLINE_JOIN'`.
  - The same file against today's behaviour behind the new names (an uncommitted stub): 5 of 21 fail.
    - The race: `actual: 'The room isn’t available right now. Try again in a moment.'`.
    - `joinHeld` from rest: `actual: null`.
    - Back online: `actual: 'You’re offline. Join once you’re back.'`, `expected: null`.
    - `noteRole`: `actual: 'alert'`.
    - `saysOffline`: `actual: false`.
  - Browser, `room.spec.ts`, the three new checks (log `pw-logs/offline-join-red.txt`): 3 failed, each at «no token is
    asked offline», `Received: ["room-token"]` (the fixture's fetch ignores `setOffline`, so the join went through).
- **Fixed** (`b7c5f53ba`): `joinHeld` and `OFFLINE_JOIN` in `call-end.ts`; `noteFor` reads the line as nothing once
  online; `keptNote` turns a failed join offline into it and keeps the three ends the server said; `noteRole` makes it
  `status`; `saysOffline` lets the message bar step aside. `useRoomNote` asks `joinHeld` before any token.
- **Controls**, built off the branch with commits never on it (branches deleted), the three new checks each:
  - `65fdb34a8`, the bar stepping aside only for the lost call: «Chat with Sophia» fails, the foot holds two lines
    (`"You’re offline. Join once you’re back."`, `"You’re offline. Your words wait here. "`);
  - `da267635b`, the line said as an alert: the dock's and the mini dock's checks fail, the polite line `Received: ""`;
  - `a101f44e5`, the line kept once online: all three fail (the line still there; the foot `Expected: 0`,
    `Received: 1`).
- **At the head (`b7c5f53ba`):** through `pw.ps1`, `room`, `room-dock`, `dock-header`, `call-devices`, `room-basics`
  and `room-people`: 85 passed. Then `room-discussion`, `voice-chat`, `room-chat-replies`, `join` and
  `project-conversation-writes`: 71 passed. Unit `call-end.test.ts` 21/21. Every `features/voice` and
  `features/conversation` unit, plus `online.test.ts`, 353/353. Type-aware lint (whole repo, exit 0), typecheck and
  Prettier on every touched non-docs file are clean.
- **Captures** at 1280×800 dark and 390×844 light (`scratchpad/offline-join-from-rest/`), through a spec deleted after.
  Horizontal overflow 0 on all four, no alert on any. The line is 221 px wide: centred over Join at a desk (530–750)
  and on a phone (85–305), and inside the 16 px gutters in the phone's header dock (152–373). Chat with Sophia's foot
  holds one line. In the first desk capture Join's tip covered the line while the pointer rested on Join. The
  capture was taken again with the pointer moved off.

## Decisions and changes

- **The decision is pure** (`joinHeld`), so the fence and its words are unit-tested: online, nothing; offline after a
  lost call, the lost call's line; offline from rest, the new line.
- **A view, not a timer:** the stored note stays; `noteFor` reads it as nothing online. So offline again before any
  join, the line comes back, as the lost call's lines move with the connection.
- **The race says offline too:** a refusal offline would be the same false claim #467 removed for a lost call. The
  three ends the server said (another tab, taken out, closed) stay true offline and keep their words.
- **Said once:** the room's two offline notes share `saysOffline`, which the message bar reads.

## Remaining obligations

- Join's tip covers the dock's note while the pointer rests on Join, as it does for every note there (unchanged here).
- A refusal the server sent just before the network went is said as the new line if the browser reads offline by
  then. The next press, online, hears it again.
- Offline means `navigator.onLine` only, as in #467: behind a captive portal a join goes as before.

## Next bounded action

- Luis: say when to push; it stacks on #468, so it opens after #468 merges, then merges on green with no open P1.
  Nothing is owed locally.
- Source IDs consulted: none from the source register; the work read this repository and its plan notes only.
