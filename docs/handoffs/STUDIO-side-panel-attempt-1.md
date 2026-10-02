# Implementation-session handoff: the room's side panel (#24), attempt 1

- **Goal and attempt:** the room's chat and brief in a side panel beside the stage, as meeting apps have them, instead of #22's conversation in the centre. Asked by Luis on 2026-09-30 after using #22's room. First attempt; not a pack goal.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `studio/side-chat` from `7d0fd90` (on #22, `codex/living-brief-text`); first commit `3cd7348`. It took main by merging it (`32ca277`), and it carries #23 (merged in at `788f833`, `01b17c7` and `a90e17d`), so the two go in back to back.
- **End:** the PR's head when merged; this file arrives in its last commit. The changes are in `apps/studio/src/features/studio/` (`StudioShell`, `SidePanel`, `side-panel.ts`), `features/conversation/`, `features/voice/` (`RoomDock`, `MiniDock`, `useProjectRoom`, `useTypedChat`, `livekit-room`, `call-end`, `room-keys`), `app/shortcuts.ts`, `app/theme.css` and CONTRIBUTING ("The room's side panel").
- **Writable scope:** this repository. **No hosted service was changed by this attempt.**

## Outcome

What works:
- The stage keeps Sophia's light, the people, the room's line and the dock. A side panel holds the chat and the brief as two tabs. Both tabs stay mounted, and the panel opens from the stage's corner or with C and B and closes with Esc or Close.
- A violet dot marks something new behind a closed panel, told by identity: a new message, a reply's progress, an outcome. It never lights for what was already there at load, and it remembers what arrived while the person read another view.
- The chat's foot offers one thing at a time: Chat with Sophia first, which joins in text mode and opens the exchange; then the message bar with Send inside, with one status line above it. A start whose join fails puts text mode back as it was. Chat with Sophia waits while the dock joins: one join runs at a time, and a call that ends lets go of its join, so the next starts at once. A line that waits on the dock (taking the floor, Resume) offers to show the room where the panel covers it.
- Stray typing goes into the message bar, never to a shortcut, also when typed on the panel's tabs or buttons (Space still presses them). Opening the panel focuses the bar, or the Chat tab before the chat starts: Chat with Sophia is never focused, so a stray Space can't press it.
- Text mode is said in the dock, the mini dock and the panel's head, and ends with voice. It needs the microphone off: when the microphone can't be turned off, text mode rolls back with a note. A join's microphone that comes on after text mode began goes off again; when it can't, text mode goes back to voice, and a chat start stops before Sophia is asked in. A join applies text mode as it is when it gets in, and one asked for in a call changes none of it. Turning the microphone on leaves text mode once the microphone came on, also text mode that began while the browser was asking. Any end of the call ends it but a lost connection; then the pill stays beside Try again, whose tip says the next join is typed. A device change counts by the device, not by LiveKit's answer, and a change whose call went changes nothing in the next. A device that stays on says so, not that it couldn't start.
- Capture takes the command key, as in Meet: Ctrl or ⌘ with D, E, Shift+E and J.
- A call that ends says why: another tab, removed, the room closed, or a lost connection.
- Where the panel covers the room (760 px and below), a row under its head keeps the call's switches, text mode and what Sophia is looking at (it wraps, so the tabs and Close stay on a 390 px phone), and says what stopped a device, or, over the Brief tab, why the call ended. Those copies are for the eye: screen readers hear each note once, from the dock. In the chat's foot, the call's ending comes before an older chat error, and a chat error doesn't come back in the next call.
- With the panel open, someone at the door is shown beside it on a wide screen, and on a phone over it, under its top (never over the tabs or Close).
- Closing the panel hands the focus back to the corner toggle that opened it or last swapped it; a control that goes away when pressed hands the focus to its neighbour.
- The panel lines up with the room (one floor, one top line, one gutter), and the corner never touches the dock.

Missing or unverified:
- Two live regions can still both announce text mode and reconnecting: the chat's line ("Typing to Sophia") and the room's line ("Chatting with Sophia"). Left as is: each speaks for its own place.
- Sophia's replies need a voice provider, which the local dev stack doesn't have. The ready and send path, and the dot for a reply in progress, are unit-tested only, not exercised end to end.
- A microphone LiveKit can't turn off isn't reproducible with LiveKit 2.22.3 (its mute of a published track has no step that fails): going back to voice then is unit-tested only (`enterCall`, `arriveWithMicrophone`).
- Only `19a41e0` is deployed (Davide's comparison, below); the later review fixes are not.

## Evidence

- **Gates on the branch:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, the Studio unit tests (206 pass) and the Studio build. CI was green on every pushed head.
- **Room suites** (local dev stack, synthetic identities): chat entry (16), modes, panel alignment (44), corner (35, in a call, at 17 widths), video corner (6), keys, waits, room endings, sending, screen, safety and guest. They passed on `studio/combined-23-24-28`. The latest fixes were rechecked on 2026-09-30 with keys, sending, chat entry and modes, on this branch's own tree served against the stack.
- **Reviews:** Codex, in ten rounds; an independent review of the whole diff before the eighth push, which found ten more (all fixed but one, below); one of the tenth round's fix before its push, which found its siblings (all fixed); and Davide's CX-0017. Every logic finding was fixed with a regression test that fails without its fix (a mutation check), except two reads checked in the browser only, where each fails with its fix undone: text mode as a join gets in, and a call's end letting go of its join. The panel's device note is markup, and it was checked in the browser. Davide reproduced the focus finding and verified its fix independently.
- **Browser checks of the last rounds:**
  - the Chat tab takes the focus, and Space starts nothing;
  - a project loaded with three entries and Chat closed reads "Chat", not "Chat, something new";
  - with the microphone blocked, at 700 px, the panel's head says why;
  - C, B and 2 typed on the focused Chat tab are taken as nothing, and Space still presses Close;
  - after a chat start whose join failed, the dock's Try again joins by voice, with no Text mode;
  - Chat opened from its toggle, Brief chosen, Esc: the focus is back on the Chat toggle;
  - at 700 px, a call taken by another tab says so under the head over Brief, and in the chat's foot over an older start error;
  - Join, then Chat with Sophia at once: one room token; a text-mode call taken by another tab ends text mode; Text mode, pressed, hands the focus to the microphone; a device note at 700 px is announced once; something posted while away on Goals marks Chat; a guest at the door sits beside the open panel when wide and over it on a phone;
  - in text mode, a microphone press the browser refuses keeps the Text mode pill, and the note says why;
  - the panel's top at 390, 600 and 700 px with the microphone, text mode, the camera, a shared screen, Sophia looking and a guest at the door: nothing scrolls sideways, the tabs, Close and every switch are on screen, and the lobby card is under the top; beside the panel at 1280 px;
  - Text mode pressed while Chat with Sophia's join was under way: the join got in by voice, the microphone arrived, and Sophia wasn't asked in;
  - in a call with the microphone off, the microphone turned on with the browser answering after 11.5 s (past LiveKit's wait) and Chat with Sophia meanwhile: once the microphone came on, text mode ended, never Text mode with the microphone sending;
  - a voice join left while its microphone arrived, then Chat with Sophia: a new join in text at once, Sophia asked once, and the left call's microphone changed nothing. Each of the three fails with its fix undone.

## Decisions and changes

- **Layout:** #22's centre conversation became a side panel, at Luis's request. #22's text mode and live brief are kept: the brief is a tab that updates by itself and marks itself new.
- **Unread:** told by identity, not by counts, because the discussion keeps 50 entries and the typed chat 100.
- **Scope:** no new authorization was needed, and the work stayed in the Studio.

## Remaining obligations

- Davide's production comparison (`SMC-M02-OP-0004`) deployed `19a41e0` to studio.sophia-ei.com (CX-0019) and confirmed its synthetic cleanup (CX-0020). The later commits, review fixes, are not deployed.
- This attempt deployed nothing and wrote no data outside the local dev stack. No jobs are left running.

## Next bounded action

- Davide re-reviews and merges #24. #23, which it carries, is already in main.
- Then #30 (the personal space) is retargeted to main, and its conflicts with #23's fixes are resolved.
