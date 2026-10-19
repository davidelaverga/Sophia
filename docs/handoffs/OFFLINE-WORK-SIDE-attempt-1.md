# Implementation-session handoff

Goal and attempt: OFFLINE-WORK-SIDE (Luis 2026-10-18: «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»; seam #8 of `evaluacion-2026-10-18/experiencia/costuras.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `seams/offline-work-side` from `origin/main` (`2e151c934`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the guard, `.claude-guards/safe-run.ps1`, two workers); CI as the
run on record.
Existing authority: Luis 2026-10-18, «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando»: local only, no push and no PR until he says. One PR.
Ending commit/tree: `3bc2be546769` (tree `cd8d817f3b11`), the last commit of `seams/offline-work-side`'s own that changes code (the later commit touches only this record and the plan note). 15 files changed against `2e151c934` at that commit: `e2e/project-conversation-writes.spec.ts`, `e2e/room-discussion.spec.ts`, `e2e/room.spec.ts`, `src/features/conversation/Composer.tsx`, `src/features/conversation/useRoomMessage.ts`, `src/features/conversations/ConversationComposer.tsx`, `src/features/conversations/conversations.css`, `src/features/personal/PersonalComposer.tsx`, `src/features/personal/online.test.ts`, `src/features/personal/online.ts`, `src/features/voice/MiniDock.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/call-end.test.ts`, `src/features/voice/call-end.ts`, `src/features/voice/useProjectRoom.ts`; with `docs/plans/offline-work-side.md` and this record.

## Outcome

- Offline, a project conversation's line and the room bar's line used to say «Not confirmed: “…”» after a press that
  wrote nothing. Now, before any press, they say what waits, and claim nothing they don't know:
  - words written: «You’re offline, so this wasn’t sent. It waits here; send it once you’re back.»
  - an empty field: Personal's own line, «You’re offline. Your words wait here.»
  - a message held with no reply, which may have landed: «You’re offline, so “…” isn’t confirmed. Send it again once
    you’re back; it won’t be written twice.»

  Send waits, nothing is written, and the room bar shows no Try again. Back online, the line goes (or «Not confirmed»
  comes back for a held message) and the next press sends one message.
- A call lost offline used to say «You were disconnected from the room.», and its Try again said «The room isn’t
  available right now.» Now the note says «You’re offline, so the call ended here. Join again once you’re back.» The
  call stays lost until a join gets back in: while the browser is offline, Try again asks for nothing, even after a
  rejoin failed online, and a join that fails offline keeps the offline note. When the online event fires, the note
  says «You’re back online. Try again rejoins the call.» The dock, the mini dock, the chat's foot and the panel's line
  all show the same note.
- Both offline notes, and the conversation's offline line, are polite (`role=status`) and speak from a line that is in
  the page before their words come, out of sight while empty. Failures stay alerts. Status lines only: no toast,
  nothing remembered. Online, everything reads as before.

## Evidence

- Written first (commit `7682e7a99`). The unit file fails to load with «SyntaxError: The requested module './call-end.ts' does not provide an export named 'BACK_ONLINE'». Through the guard at that sha, the three new browser checks fail for the right reason. The conversation and the room bar get «Expected: "You’re offline, so this wasn’t sent. It waits here; send it once you’re back." … element(s) not found». The call gets «Expected: "You’re offline, so the call ended here. Join again once you’re back." Received: "You were disconnected from the room."».
- At the fix (`3941813cc`), `call-end.test.ts` passes 9/9. Studio unit tests pass 1775/1777. The two failures are the Windows path ones (`attention.test.ts`, `browser-imports.test.ts`).
- Playwright through the guard at `3941813cc`: 270/270 across project-conversation-writes, room-discussion, room, personal, project-conversations, project-conversation-follow-ups, room-dock, dock-header, room-basics, voice-chat, room-recap, room-chat-replies, muted-speech, next-ask and conversations-find. A second batch passed 84/84 across app-auth, join, lobby-door, room-return, call-devices, question-asks, next-ask-places, conversations-ask-off, conversations-confirmation-kit, conversation-thread, reconnecting-on-video and two-screens.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on the touched files: clean.
- Captures in the session scratchpad, `seams-offline-work-side/`, at 1280×800 dark and 390×844 light: `conversation-offline-*`, `room-bar-offline-*`, `dock-offline-*` and `dock-back-online-*`. Horizontal overflow is 0 in all eight. The conversation's line is 624 × 16 px at 1280 and 370 × 32 px at 390. The room bar's line is 347 × 32 and 358 × 32. The dock's offline note is 350 × 48 at both widths, and its back-online note is 262 × 32.
- **Review round (2026-10-18), written first (commit `4363f1201`):**
  - Unit: `online.test.ts` fails to load («does not provide an export named 'OFFLINE_WAITS'»), and so does
    `call-end.test.ts` («… named 'keptNote'»).
  - Through the guard at that sha (`-Detach`, log `pw-logs/offline-review-red.txt`), all 7 new browser checks fail for
    the right reason:
    - the empty bar: «Expected: "You’re offline. Your words wait here." Received: "You’re offline, so this wasn’t sent. It waits here; send it once you’re back."»;
    - the held message, in the conversation and in the bar: «Expected: "You’re offline, so “Did this one land?” isn’t confirmed. …" Received: "You’re offline, so this wasn’t sent. …"» (and the same for “Once only.”);
    - Try again offline after a rejoin that failed online: «Expected: "You’re offline, so the call ended here. Join again once you’re back." Received: "The room isn’t available right now. Try again in a moment."»;
    - the polite line before it speaks, in the dock, the header's mini dock and the conversation: «Expected: 1 Received: 0». The conversation's empty-field check stops there, before its «wasn’t sent» assertion; the bar's check shows that half.
- **At the review fix (`3bc2be546`):**
  - `online.test.ts` 4/4 and `call-end.test.ts` 14/14. Studio unit tests: 1784/1786; the two failures are the Windows path ones.
  - Whole-repo `pnpm exec oxlint --type-aware .` exits 0; `tsc --noEmit -p apps/studio` exits 0; Prettier `--check` on every touched non-docs file is clean.
  - Playwright through the guard, `pw-logs/offline-review-green.txt`: 255/255 across project-conversation-writes, room-discussion, room, personal, dock-header, room-dock, call-backgrounds, call-devices, device-check, muted-speech, voice-chat, next-ask, conversations-find, project-conversations and opening. `pw-logs/offline-review-green-2.txt`: 168/168 across app-auth, join, lobby-door, room-return, question-asks, next-ask-places, conversations-ask-off, conversations-confirmation-kit, conversation-thread, reconnecting-on-video, two-screens, conversation-acts, conversations-panes, room-basics, room-recap, room-chat-replies and project-conversation-follow-ups.
  - Captures, `seams-offline-work-side/review/`, at 1280×800 dark and 390×844 light (`&theme=light`), horizontal overflow 0 in all twelve:
    - the conversation's empty field offline (624 × 16, 370 × 16) and its held message offline (624 × 16, 370 × 32);
    - the room bar empty offline (347 × 16, 358 × 16) and with a held message (347 × 32, 358 × 32);
    - the dock offline after a failed rejoin (350 × 48 at both widths);
    - the header's mini dock offline (240 × 48, and 350 × 48 floating at 390).

    The empty polite lines measure 1 × 1 in the conversation, the dock and the mini dock, and the mini dock's empty notes stack 0 × 0.

## Decisions and changes

- Brief against code: the claims hold on `2e151c934`. Only line numbers moved: `client.ts`'s fetch catch is at 333-335, livekit-room's Disconnected at 454-456, and `joinMessage` at useProjectRoom 107-111.
- The words live with the hook (`online.ts`'s `OFFLINE_UNSENT`, as `useSlow.ts` keeps `SLOW_NOTE`) and with the call's ends (`call-end.ts`: `OFFLINE_END`, `BACK_ONLINE`, `noteFor`, `noteRole`). `useRoomNote` (useProjectRoom) stores a lost call's note as offline when it ends offline. It shows the note as `noteFor` reads it with `useOnline`, and fences a join after that loss while offline. That covers Try again and Chat with Sophia. No token is asked for (`asked` gains no `connect`).
- The lever is the one the report names. Playwright's `context.setOffline` moves `navigator.onLine` and fires its events. The fixtures' fake fetch ignores it, so `send=lost` (the conversation) and the fake room show what a send let through would have done. No fixture change was needed.
- Said once: in the chat's foot, the bar's offline line stays out when the room's note above already says the call ended offline. Offline, the conversation's quick asks step aside, as they do while words are written.
- **Review round, each finding verified against the code first:**
  - **P1, real:** `ConversationComposer`'s line and the bar's `useFootWords` said `OFFLINE_UNSENT` whatever the field held. Now `offlineWords` (`online.ts`, unit-tested) picks the line from what waits: words written, an empty field (Personal's `OFFLINE_WAITS`, moved into `online.ts`; `PersonalComposer.tsx` reads it from there, words unchanged) or a held message. Nothing of its own while a message is on its way.
  - **P2, the held message, real:** a held message offline was called unsent although `send=lost` lands it. It now says it isn't confirmed, and won't be written twice. These are new words, and a choice for Luis: the reviewers' other option was to keep «Not confirmed…» with Send waiting. In the bar, when the room's note above already says the call ended offline, a held message says only «Not confirmed: “…”», with no Try again.
  - **P2, the fence, real:** the old fence compared the note's words with `OFFLINE_END`, and a rejoin that failed online replaced them. `useRoomNote` now keeps whether the call is lost in a ref: set by the drop, cleared when a join gets back in. Offline while it is lost, a join asks nothing. `keptNote` (`call-end.ts`, unit-tested) keeps the offline note for a join that fails offline after the loss, which is the race the reviewers describe (the fixture can't run it, since its fetch ignores `setOffline`).
  - **P2, the announcement, real:** the drop note had turned from an alert into a `role=status` added with its words. `DockNote` (`RoomDock.tsx`, used by `MiniDock.tsx`) keeps failures as alerts. The two connection notes go in a status line that is always there, carrying `sr-only` while empty. The conversation's offline line does the same: this change had turned it from an alert into a status line too. `.conv-compose > .sr-only` keeps that empty line 1 px wide against the column's `width: 100%`.
  - A shared-stash slip while proving red: `git stash pop` took another worktree's newer entry («seam5-back fix») into this one. The pop conflicted and kept the entry, and its two files were restored here. That entry was left alone and later taken by its owner. Only this session's own stash was applied (by its commit id) and dropped. No other worktree was touched.

## Remaining obligations

- A Join pressed offline with no call lost before it (the dock at rest) still asks for a token. It then says «The room isn’t available right now.», and so does its Try again while offline. The seam names no line for that moment, and «the call ended here» would be wrong, since no call began. Luis to choose a line.
- The held message's offline words (above) are for Luis to keep, or to trade for «Not confirmed» with Send waiting.
- The room bar's line is still a `role=status` added with its words, as its «Not confirmed» line already was before this branch.
- Offline means `navigator.onLine` only. Behind a captive portal the browser reads online (costuras, «Qué falta» 7).
- Take a call lost while still online, and the browser going offline after. The note reads offline while that lasts. Back online, it says «You were disconnected from the room.» again, unless Try again was pressed while offline. Only a loss seen offline turns into «You’re back online». The usual order is the other way round: Chrome reports offline before LiveKit gives up.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, `evaluacion-2026-10-18/experiencia/costuras.md` (its intro and seam #8) and the review findings of 2026-10-18.
