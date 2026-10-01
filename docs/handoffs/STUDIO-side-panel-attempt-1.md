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
- A violet dot marks something new behind a closed panel, told by identity: a new message, a reply's progress, an outcome. It never lights for what was already there at load.
- The chat's foot offers one thing at a time: Chat with Sophia first, which joins in text mode and opens the exchange; then the message bar with Send inside, with one status line above it. A start whose join fails puts text mode back as it was, so the dock's Try again joins by voice.
- Stray typing goes into the message bar, never to a shortcut, also when typed on the panel's tabs or buttons (Space still presses them). Opening the panel focuses the bar, or the Chat tab before the chat starts: Chat with Sophia is never focused, so a stray Space can't press it.
- Text mode is said in the dock and ends with voice. It needs the microphone off: when the microphone can't be turned off, text mode rolls back with a note. Turning the microphone on leaves it only once the microphone came on.
- Capture takes the command key, as in Meet: Ctrl or ⌘ with D, E, Shift+E and J.
- A call that ends says why: another tab, removed, the room closed, or a lost connection.
- Where the panel covers the room (760 px and below), its head keeps the call's switches and says what stopped a device, or, over the Brief tab, why the call ended. In the chat's foot, the call's ending comes before an older chat error.
- Closing the panel hands the focus back to the toggle that opened it, also after another tab was chosen.
- The panel lines up with the room (one floor, one top line, one gutter), and the corner never touches the dock.

Missing or unverified:
- Sophia's replies need a voice provider, which the local dev stack doesn't have. The ready and send path, and the dot for a reply in progress, are unit-tested only, not exercised end to end.
- Nothing is deployed.

## Evidence

- **Gates on the branch:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, the Studio unit tests (187 pass) and the Studio build. CI was green on every pushed head.
- **Room suites** (local dev stack, synthetic identities): chat entry (16), modes, panel alignment (44), corner (35, in a call, at 17 widths), video corner (6), keys, waits, room endings, sending, screen, safety and guest. They passed on `studio/combined-23-24-28`. The latest fixes were rechecked on 2026-09-30 with keys, sending, chat entry and modes, on this branch's own tree served against the stack.
- **Reviews:** Codex, in seven rounds, and Davide's CX-0017. Every logic finding was fixed with a regression test that fails without its fix (a mutation check). The panel's device note is markup, and it was checked in the browser. Davide reproduced the focus finding and verified its fix independently.
- **Browser checks of the last rounds:**
  - the Chat tab takes the focus, and Space starts nothing;
  - a project loaded with three entries and Chat closed reads "Chat", not "Chat, something new";
  - with the microphone blocked, at 700 px, the panel's head says why;
  - C, B and 2 typed on the focused Chat tab are taken as nothing, and Space still presses Close;
  - after a chat start whose join failed, the dock's Try again joins by voice, with no Text mode;
  - Chat opened from its toggle, Brief chosen, Esc: the focus is back on the Chat toggle;
  - at 700 px, a call taken by another tab says so under the head over Brief, and in the chat's foot over an older start error;
  - in text mode, a microphone press the browser refuses keeps the Text mode pill, and the note says why.

## Decisions and changes

- **Layout:** #22's centre conversation became a side panel, at Luis's request. #22's text mode and live brief are kept: the brief is a tab that updates by itself and marks itself new.
- **Unread:** told by identity, not by counts, because the discussion keeps 50 entries and the typed chat 100.
- **Scope:** no new authorization was needed, and the work stayed in the Studio.

## Remaining obligations

- Davide's production comparison (`SMC-M02-OP-0004`, CX-0018) is prepared for `19a41e0` and waits for his grant. Later commits add review fixes on top of that candidate.
- Nothing was deployed and no data was written outside the local dev stack. No jobs are left running.

## Next bounded action

- Davide re-reviews and merges #24. #23, which it carries, is already in main.
- Then #30 (the personal space) is retargeted to main, and its conflicts with #23's fixes are resolved.
