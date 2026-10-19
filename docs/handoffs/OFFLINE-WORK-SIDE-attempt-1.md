# Implementation-session handoff

Goal and attempt: OFFLINE-WORK-SIDE (Luis 2026-10-18: «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»; seam #8 of `evaluacion-2026-10-18/experiencia/costuras.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `seams/offline-work-side` from `origin/main` (`2e151c934`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the guard, `.claude-guards/safe-run.ps1`, two workers); CI as the
run on record.
Existing authority: Luis 2026-10-18, «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»: local only, no push and no PR until he says. One PR.
Ending commit/tree: `3941813cc1f4` (tree `00208594850b`), the last commit of `seams/offline-work-side`'s own that changes code (the later commit touches only this record). 12 files changed against `2e151c934` at that commit: `e2e/project-conversation-writes.spec.ts`, `e2e/room-discussion.spec.ts`, `e2e/room.spec.ts`, `src/features/conversation/Composer.tsx`, `src/features/conversations/ConversationComposer.tsx`, `src/features/personal/online.ts`, `src/features/voice/MiniDock.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/call-end.test.ts`, `src/features/voice/call-end.ts`, `src/features/voice/useProjectRoom.ts`, `docs/plans/offline-work-side.md`.

## Outcome

- Offline, a project conversation's line and the room bar's line used to say «Not confirmed: “…”» after a press that wrote nothing. Now, before any press, they say «You’re offline, so this wasn’t sent. It waits here; send it once you’re back.» Send waits, nothing is written, and the room bar shows no Try again. Back online, the line goes and the next press sends one message.
- A call lost offline used to say «You were disconnected from the room.», and its Try again said «The room isn’t available right now.» Now the note says «You’re offline, so the call ended here. Join again once you’re back.», and Try again asks for nothing while the browser stays offline. When the online event fires, the note says «You’re back online. Try again rejoins the call.» The dock, the mini dock, the chat's foot and the panel's line all show the same note. Both offline notes are polite (`role=status`). These are status lines only: no toast, nothing remembered. Online, everything reads as before.

## Evidence

- Written first (commit `7682e7a99`). The unit file fails to load with «SyntaxError: The requested module './call-end.ts' does not provide an export named 'BACK_ONLINE'». Through the guard at that sha, the three new browser checks fail for the right reason. The conversation and the room bar get «Expected: "You’re offline, so this wasn’t sent. It waits here; send it once you’re back." … element(s) not found». The call gets «Expected: "You’re offline, so the call ended here. Join again once you’re back." Received: "You were disconnected from the room."».
- At the fix (`3941813cc`), `call-end.test.ts` passes 9/9. Studio unit tests pass 1775/1777. The two failures are the Windows path ones (`attention.test.ts`, `browser-imports.test.ts`).
- Playwright through the guard at `3941813cc`: 270/270 across project-conversation-writes, room-discussion, room, personal, project-conversations, project-conversation-follow-ups, room-dock, dock-header, room-basics, voice-chat, room-recap, room-chat-replies, muted-speech, next-ask and conversations-find. A second batch passed 84/84 across app-auth, join, lobby-door, room-return, call-devices, question-asks, next-ask-places, conversations-ask-off, conversations-confirmation-kit, conversation-thread, reconnecting-on-video and two-screens.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the touched files: clean.
- Captures in the session scratchpad, `seams-offline-work-side/`, at 1280×800 dark and 390×844 light: `conversation-offline-*`, `room-bar-offline-*`, `dock-offline-*` and `dock-back-online-*`. Horizontal overflow is 0 in all eight. The conversation's line is 624 × 16 px at 1280 and 370 × 32 px at 390. The room bar's line is 347 × 32 and 358 × 32. The dock's offline note is 350 × 48 at both widths, and its back-online note is 262 × 32.

## Decisions and changes

- Brief against code: the claims hold on `2e151c934`. Only line numbers moved: `client.ts`'s fetch catch is at 333-335, livekit-room's Disconnected at 454-456, and `joinMessage` at useProjectRoom 107-111.
- The words live with the hook (`online.ts`'s `OFFLINE_UNSENT`, as `useSlow.ts` keeps `SLOW_NOTE`) and with the call's ends (`call-end.ts`: `OFFLINE_END`, `BACK_ONLINE`, `noteFor`, `noteRole`). `useRoomNote` (useProjectRoom) stores a lost call's note as offline when it ends offline. It shows the note as `noteFor` reads it with `useOnline`, and fences a join after that loss while offline. That covers Try again and Chat with Sophia. No token is asked for (`asked` gains no `connect`).
- The lever is the one the report names. Playwright's `context.setOffline` moves `navigator.onLine` and fires its events. The fixtures' fake fetch ignores it, so `send=lost` (the conversation) and the fake room show what a send let through would have done. No fixture change was needed.
- Said once: in the chat's foot, the bar's offline line stays out when the room's note above already says the call ended offline. Offline, the conversation's quick asks step aside, as they do while words are written.

## Remaining obligations

- A Join pressed offline with no call lost before it (the dock at rest) still asks for a token. It then says «The room isn’t available right now.» The seam names no line for that moment.
- Offline means `navigator.onLine` only. Behind a captive portal the browser reads online (costuras, «Qué falta» 7).
- Take a call lost while still online, and the browser going offline after. The note reads offline while that lasts. Back online, it says «You were disconnected from the room.» again, unless Try again was pressed while offline. Only a loss seen offline turns into «You’re back online». The usual order is the other way round: Chrome reports offline before LiveKit gives up.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and `evaluacion-2026-10-18/experiencia/costuras.md` (its intro and seam #8).
