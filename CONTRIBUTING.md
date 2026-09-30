# Clean code

Every rule below is enforced by a tool (`pnpm check`, CI) or by review.
None is a matter of taste. [AGENTS.md](AGENTS.md) holds the repository
contract; this file holds the code rules.

- **Scope.** The gate covers the product code (`apps/api`, `apps/studio`,
  `packages/contracts`, `domain`, `persistence`, `test-support`, `ui`) and the
  TypeScript scripts. The runtime-unit areas (the S1-01 scripts and tests, the
  S1-03 bridge in `packages/dsh-bundle` and `apps/execution-host`) are outside
  it until their owner opts them in: remove their lines from `.prettierignore`
  and `ignorePatterns`, then fix what the tools report.
- **Formatting is Prettier's** (`pnpm format`; `.prettierrc.json`: no
  semicolons, single quotes, 120 columns). It is never discussed in review.
  Recorded identities are excluded (`.prettierignore`): `docs/`, `config/`,
  the dsh bundle and runtime packages, generated files.
- **Lint is strict and type-aware** (`pnpm lint`, `.oxlintrc.json`, the
  strict rule set of the pinned dsh repository). Zero findings. A suppression
  is one line with a reason:
  `// oxlint-disable-next-line <rule> -- why`.
- **Small, named pieces.** Functions ≤ 60 lines, complexity ≤ 12, nesting ≤ 3,
  parameters ≤ 5. When something grows, split it by responsibility and name
  each piece for what it does (`readSnapshot` → `readGoals`,
  `readResources`…).
- **Types tell the truth.** No `any` (use `unknown` and narrow), no non-null
  `!` where narrowing can do it, `catch (err: unknown)`, and no type
  assertions (`typescript/no-unsafe-type-assertion`). JSON from the wire goes
  through `@sophia/contracts/validate`; any other `unknown` through a type
  guard. The few trusted local reads that keep a cast say why on the line.
- **Pure logic apart from I/O and React.** Protocol, ordering and retry logic
  live in plain modules with unit tests (`projection.ts`, `feed-loop.ts`,
  `@sophia/contracts/sse`); components and routes only wire them.
- **One definition.** Extract repeated logic the second time it appears.
  Shared contract code goes in `@sophia/contracts`, UI primitives in
  `@sophia/ui`, script helpers in `scripts/lib/`.
- **Errors are explicit.** Domain errors carry a stable code and retry
  disposition. Database messages never reach users unfiltered. An ignored
  error needs a comment saying why.
- **Comments explain why**, not what. Each module opens with what it
  guarantees and what it does not.
- **Every fix gets a regression test that fails without the fix.** Check it
  by reverting the fix once (a mutation check), and say so in the PR.
- **Tests use `node --test`** with `node:assert/strict`. A test that needs
  PostgreSQL is `*.db.test.ts`; one that needs a Supabase stack is
  `*.live.test.ts`. `pnpm test` runs neither.

## The room's side panel

The room's chat and brief live beside the stage, as meeting apps have them
(`SidePanel.tsx`; its rules are in `side-panel.ts`, with tests). Keep these
when you change the room:

- **The stage's centre** holds Sophia's light, the people, the room's line
  and the dock. Nothing else sits under the light: the Converse lens puts its
  conversation in the panel, not in `stage-body`.
- **One panel, two tabs** (Chat, Brief), opened from the stage's corner
  (`RoomStage`'s `corner` slot, `PanelToggles`) or with C and B. Both tabs
  stay mounted while hidden, so an unsent message or a brief edit survives
  closing and switching. Esc or Close shuts the panel, Esc with the focus
  inside it or on no control at all (`useEscFromNowhere`); on a phone it
  covers the room below the bar and its toggles sit under the lenses.
- **New is a dot.** A violet dot on a toggle says something changed behind a
  closed panel (`useUnread`, `useBriefUpdates`, the pure `isNew`); the
  toggle's accessible name says so too ("Chat, something new").
- **Focus follows the panel** (`usePanelFocus`): in on open (the message bar
  where a fine pointer suggests a keyboard, the tab on a phone so no keyboard
  jumps up), back to the toggle that opened it on close.
- **The chat's foot offers one thing at a time** (`chatEntry` in
  `chat-view.ts`, with tests): Chat with Sophia until this person is in the
  room and Sophia's exchange exists, then the message bar with Send inside
  (Enter sends, Shift+Enter breaks a line). Never both: a bar that cannot
  send, beside a button that starts, reads as two ways to do one thing.
  The control comes last and never moves; what comes and goes sits above it:
  the consent question (with the bar, and only while one is due), one status
  line (`chatLine`: why Send waits, one reason at a time, or that typing
  reaches Sophia, with Voice mode), an error. The room's own line names the
  state, "Chatting with Sophia", and only once typing reaches her. A start
  that fails says why here too (the room's own note: `room.error`), and asks
  Sophia into nothing: on a phone this panel covers the dock, and a button
  that falls back to "Chat with Sophia" without a word reads as broken.
  Voice mode is offered in the call only.
- **Stray typing is text.** While the chat's foot is on screen (it marks
  itself `data-typing-sink`), a key typed with the focus on no control goes
  into the message bar and is never a shortcut (`shortcuts.ts`: `stray`,
  `typesText`, with tests). Someone who starts a message without clicking the
  bar must not turn on a camera with its first letter. Before the chat
  starts, the foot is "Chat with Sophia", which takes the key as nothing:
  typing "vamos" there once turned on the camera (V), the microphone (M) and
  a screen share (S). Esc closes the panel. A new field that invites typing
  marks itself the same way.
- **Capture takes the command key** (`room-keys.ts`; ⌘ on a Mac, Ctrl
  elsewhere, as in Meet): D the microphone, E the camera, Shift+E a screen
  share, J to join. No single letter turns on a microphone, a camera or a
  share, or joins a call, wherever the focus is; a command combination types
  nothing, so it acts from a field too (`shortcutKey`, `keyLabel`, with
  tests). The tips show the combination as the platform writes it. Keys that
  only change the view (C, B, 1 to 3, I) stay single letters.
- **Text mode is said in the room.** Typing to Sophia is text mode: she is
  not heard and the microphone is off. The dock says so (`TextMode` in
  `RoomDock`) and one press returns to voice; so does turning the microphone
  on, and leaving the room. It never rewrites the microphone choice the
  person made (`silence` in `useProjectRoom`), so the next join is as they
  left it.
- **The call's switches follow the panel.** Where the panel covers the room
  (up to 760 px wide), its head shows the microphone, and the camera and the
  shared screen while they are on (`CallSwitches` in `StudioShell`, the
  dock's own `Toggle`). Someone reading the chat on a phone must not have to
  close it to see that they are heard, or to mute. Beside the room the dock
  already shows them, so the head does not repeat it.
- **A call that ends says why** (`call-end.ts`, with tests; the reason is
  LiveKit's, read in `livekit-room.ts`). Only a lost connection is a failure
  and offers "Try again". The same person joining from another tab or device
  moves the call there: this tab says so and offers the plain "Join the
  room", or two tabs take the call from each other with the same "You were
  disconnected" and nobody knows why. Taken out of the call and a closed room
  have their own sentence. The note shows in the dock, the mini dock and the
  chat's foot.
- **Nothing offers to join before it can.** Until the project has loaded
  there is no room to join (`room.ready`): the room's line says "Opening the
  project…", and Join, J, the mini dock's Join and Chat with Sophia wait. A
  stage that said "The room is ready" over a button that did nothing was a
  guess and a dead control, for as long as a slow server took.
- **Nothing circles the room.** While work runs the stage's edge is faintly
  lit and still (`drawWorkLine` in `trace.ts`, with a test). A light that
  travels the edge pulls the eye from the people; the room's line already
  says work is running. Motion in the room is for events (a floor handoff),
  not for states.
- **The panel lines up with the room.** Measure these when you touch either
  side; they are what makes the two read as one screen:
  - the bottom: the dock, the corner toggles and the message bar rest on one
    floor (`--floor`) and share one height, 48 px. The bar is built like the
    dock, 5 px around 36 px controls, and grows upward from that floor;
  - the top: the panel's tabs sit in the lens bar's band (16 px down, 36 px
    tall), so "Chat" and "Converse" share a line;
  - the sides: one gutter inside the panel (`--panel-pad`) for the tabs, the
    messages, the message bar and the brief. Close's mark ends on it.
- **The corner never touches the dock.** The stage narrows when the panel
  opens, so the stage's own width decides (container queries on
  `.room-stage`), never the window's: from 800 px the corner is level with
  the dock, which keeps `--corner-room` free on each side; from 561 to 799 px
  it goes up to the lenses' line; up to 560 px it sits under the lenses, or on
  their empty line when video fills the stage, so it never covers a tile. The
  dock wraps rather than run past the stage or under the corner. Check it in
  a call (the dock is widest there) at 1024 px wide with the panel open, and
  with a camera on at a phone's width. On a phone the lobby card (someone at
  the door) goes under the corner, never over it.
- **`hidden` always hides** (`[hidden]` in `theme.css`). Without that rule a
  class that sets `display` wins over the browser's own, and a hidden tab
  stays on screen.
- **Names stay for the visit** (`mergeNames`): someone who spoke and left
  keeps their name on their lines instead of "A member".
