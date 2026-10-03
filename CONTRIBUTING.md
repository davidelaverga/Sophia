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
  by reverting the fix once (a mutation check), and say so in the PR. A test
  that can hang is not a check: `pnpm test` sets no timeout, so
  `node --test` waits on it for good, and even with `--test-timeout` it
  counts as cancelled, not failed. Race what is awaited against a sentinel,
  and assert that the sentinel lost: a timer that settles after the
  operation should have, or, under mocked timers, a `setImmediate` (it isn't
  among the mocked timers), which settles once every pending promise
  callback has run (`now` in `deadline.test.ts`). A race whose winner isn't
  asserted checks nothing.
- **Before writing a feature, write down its states.** Most review findings
  were states and crossings nobody had listed: text mode after each way a call
  ends, everything a panel covers on a phone, a view that unmounts, a second
  join while one runs. Before the code, put a few lines in the PR:
  - each state and transition, and how the screen, the keyboard and a screen
    reader meet it, on a phone and wide;
  - what the change covers, unmounts or replaces, and everything that lived
    there;
  - the failures: slow, refused, pressed twice, interleaved, a reload in the
    middle;
  - the platforms the build targets: an API missing from Safari 16.4 broke
    every shortcut there.

  Test those transitions, not only the happy path.
- **One concern per PR.** Each request added to a PR crosses the ones before
  it: #24 grew to 33 files, and most of its findings were crossings.
- **Before a PR is ready, read it to break it.** Happy paths and screens
  checked by eye miss what a review finds. For each function the PR changes:
  - walk the states it can meet: not loaded yet (null, never `[]`), empty,
    full at a cap (a history kept at 50 or 100 entries), slow (every network
    wait has a limit), failed (an error caught is reported to whoever needs
    it), pressed twice, and the next key once the focus moves;
  - a new state or a new way to fail (a status, a timeout) is checked in
    every branch and caller that can meet it, and a protocol (retry with the
    same key) lives in the API, not in each caller;
  - a finding is fixed as a class: list its siblings (the same feature, the
    same way to fail) and fix them in one push, since each push starts a new
    review round;
  - every `{ error }` a call returns is read, and a wrapper that swallows
    one says why;
  - a race or a state that is hard to fence is removed rather than fenced;
  - before each push, one independent review of the whole diff: a reviewer
    given the code and this list, not your conclusions;
  - a rule written here names its mechanism and its test, and is checked
    against the code before it is written.
- **Merge after the last push's review.** Codex reviews each push within
  minutes. #23 was merged two minutes before its last review, and that
  review's two findings needed a follow-up PR.
- **Tests use `node --test`** with `node:assert/strict`. A test that needs
  PostgreSQL is `*.db.test.ts`; one that needs a Supabase stack is
  `*.live.test.ts`. `pnpm test` runs neither.

## Studio UI

Reviewed rather than tool-enforced, but not a matter of taste either: each
rule names the mechanism that already does it. Use that mechanism before
writing a new one, and keep the rule when you change the code around it.

- **Say less.** Nothing repeats what a control already says (no "Floor ·
  Open" beside "Take the floor", no "Sophia" beside "Speak with Sophia"). A
  sentence that explains a control goes into its tip. What isn't there isn't
  announced (no "No direction accepted yet."). When a screen feels heavy,
  count its visible words per zone and cut the repeats first.
- **Tips and keys.** Every single-key shortcut (`useShortcuts`) is also a
  visible control whose tip shows the key: `className="has-tip"` plus
  `<Tip label keys side align />` from `@sophia/ui`. Tips are `aria-hidden`,
  so when visible text moves into a tip, keep it for assistive technology:
  `aria-describedby` on the group (`LensSwitcher`), or the full sentence as
  the `aria-label` of a short button (the notes consent's "Agree"). A control
  whose press changes with its state is named for what it does now (the
  padlock: lock, or unlock), never pressed or not. The key
  lives in the tip, never as a hidden element inside the control: a child
  that cannot be seen still takes its room and pushes the label off center.
- **A disabled primary waits as an outline** (`.pill.primary:disabled` in
  `theme.css`); a key inside it drops its ink look. Disable a primary until
  it can run (an empty field, a wait); never grey it out or hide it.
- **Touch** (`@media (pointer: coarse)`): pills and round buttons are at
  least 40 px, ghosts and segmented buttons 36 px. An inline `.text-button`
  gets its target from an empty `::after` reaching 7 px past its words,
  never from `min-height`, which pushes the paragraph's lines apart. A
  field's input stretches to the height of the button beside it.
- **Layout contracts.** The dock measures itself (a device note, a second
  row on a phone) and sets `--dock-h` on the room (`RoomDock`); the stage's
  words and video end at `--dock-h` + 40 px, so never hard-code an offset
  above the dock. Grids that hold fields and lists use `minmax(0, 1fr)`, so
  a wide control shrinks instead of pushing the rest past the edge. A screen
  without a room passes `screen` to `SophiaLight`, which rests the light
  higher and smaller when the words would not fit under it (`screen-rest.ts`,
  with tests) and marks the screen `data-rest-high`; `.screen-body` starts
  by the same numbers. Keep the two in step.
- **Alignment is measured.** A label sits at the center of its control.
  Things that belong together share a line: the room's blocks one center
  axis, the Tasks view's two heads one rule and one baseline. Check them as
  numbers (label center minus control center, the y of each rule) at desktop
  and phone widths, and look first for children that cannot be seen and
  still take room.
- **Every screen can be left.** A wait (a guest in the lobby), a refusal,
  the end of a visit: each offers the way out or the way back in place
  ("Stop waiting", "Ask again"). A screen with no control is a trap, even
  when all it does is wait. Where the server cannot undo something yet (a
  knock stays in the lobby), the screen says what stays behind.
- **The room's controls outlive trouble.** A snapshot that stops answering
  keeps a loaded project on screen, stale, with its dock, and the bar says
  Reconnecting (`project-door.ts`, with tests): nobody is left in a call
  with an open microphone behind a notice that has no mute and no leave. A
  closed door (401, 403) shows its notice and ends the call. A refused event
  stream asks the snapshot before it gives up (`refused` in `feed-loop.ts`,
  with tests): refused too, the door is closed and the notice shows; not,
  and the stream is tried again. Giving up on the stream's word alone left
  the project frozen on screen behind a small "No access". Behind a closed
  door nothing acts on the project's last snapshot: Invite, its sheet and I
  go with it.
- **No wait is endless, and a long one says so.** Every API call has a
  limit (`inTime` in `api/client.ts`, with tests): 30 s for a read, which
  whoever needs it asks again; 90 s for a write, which may be the call that
  wakes an idle server. A write with no reply in time is an unknown outcome,
  retried with the same key, like any lost reply. A wait that lasts six
  seconds adds one line (`useSlow`, `SLOW_NOTE`): under Creating…, on
  "Opening the room…" (`SlowNote`), and over a project that is slow to open
  (`.wait-note`, where the lobby floats; on a phone over the lenses, which
  have nothing to change yet), and over a place whose read is slow
  (`ReadNotes`). A hosted API that sat idle can take close to a minute to
  answer; without the line, that minute looks broken.
- **One bar.** The places' bar and a project's are the same `.topbar` (48 px,
  `--gutter`): the mark goes home (H) and never moves between the two, and the
  account is one control at the end of both (`AccountMenu`: who is signed in,
  your data, how privacy works, passkeys, Sign out). In a project, Work
  between the mark and the name goes back to the projects (W).
- **A task that takes the whole attention is a sheet** (`app/Sheet.tsx`: the
  Studio's side panel, modal through `useDialog`, closed with Esc, Close or
  the veil). There are no centered dialogs. One sheet at a time: a sheet that
  needs another (your data asking to unlock) closes and comes back after.
- **A menu or a popover closes itself** (`usePopover`): a press anywhere
  outside it, or Esc inside it, which gives the focus back to its control.
  It listens for `pointerdown`, so the click that opened it from elsewhere
  can't close it.
- **A result out of sight is a toast** (`app/Toast.tsx`, one for the whole
  app, above the floor). Say a result where it happened when that place stays
  on screen (the lobby's "Declined … · Let in instead"); when it doesn't (a
  note carried away, the padlock shut, a call that ended out of sight), the
  toast says it, one at a time, with Undo when it can be undone. Its words
  come from a view module (`notice-view.ts`).
- **Going home keeps the call.** The project whose room holds the call stays
  mounted out of sight (`background`, taking no keys through `ShortcutScope`)
  and reports the call upward (`onCall`); the places' bar shows the room with
  the call's switches and Leave (`CallSwitches`). One call at a time: a call
  starting in another project ends the one before (`useCall` in `App.tsx`),
  and opening another project leaves it, the toast saying so
  (`useOneCallInSight`): a project's bar has no room for another room's call,
  and nothing may keep sending out of sight. The call's project stays on
  screen, with its controls, until the call has left (`projectOnScreen`);
  the other opens, and joins if asked, only then.
- **What a person sends stays in sight.** A microphone, a camera or a shared
  screen that is on shows wherever this person is, with its off switch: the
  dock in the room, and everywhere else the dock's own toggles
  (`CallSwitches`: the chat panel's head, the mini dock, the places' bar).
  Nothing keeps sending out of sight because the view changed.
- **A guest is always marked as one** (`presenceRole`, `screenCaption` in
  `room-view.ts`, with tests). A visitor chooses their own name, so the word
  "guest" is what tells them from a member of the same name: it stays while
  they speak ("guest · speaking"), on their tile and on a screen they share.
- **Every press answers, and an error reads as one.** A button that sends
  says so while it works and what happened after ("We sent a new code… Only
  the newest one works."), and a refusal is said where it was asked, in
  words a person can act on (`sendFailure` in `auth-words.ts`, with tests:
  how long to wait, that the last email still works, a lost connection).
  On the quiet screens (sign-in, invitations) an error is rose, not the
  body's grey (`.screen-body .form-error`).
- **A sign-in link is followed, not chosen** (`auth-callback.ts`, with
  tests). The words a failed link carries are never shown: the notice comes
  from Supabase's `error_code`, in the Studio's words. A link that carries a
  session (`linkDecision`) never replaces another account signed in here,
  and with nobody signed in it asks first (`LinkOffer`), naming the account
  as the Auth service reads it from the token (`getUser`), never as the
  token's own payload says. The session waits in memory until then.
  Continue is the person's word that the account is theirs, so nothing
  declines it while it is under way: a decline that raced a late sign-in
  could not keep that session off the device (other tabs, a reload). A slow
  one says so (`SlowNote`), and past the read limit offers Start over, which
  leaves the page and the attempt with it (`link-accept.ts`, with tests). A
  guest's session or none never replaces the offer (`offerStands`).
- **Admissions** (`useAdmission`). No answer offers Try again with the same
  key (`AdmissionNote`, `retry()`), never a fresh key, so a retry can't
  create a second record. Say what happened in words ("Scheduled: Today ·
  03:30 – 04:30."), and name a conflict before it happens ("Overlaps …"),
  both when both are true: an overlap never hides a receipt
  (`scheduleLines`, with tests).
- **Tabs keep their state.** A sheet's tabs are hidden, not unmounted
  (`TabPanel` in `InviteSheet`), so an address or a session half typed
  survives switching between them. Closing a sheet unmounts it: what was
  typed and not sent goes with it.
- **Copy** is English, short, one spelling per word ("cancelled"). A pure
  helper in a `*-view.ts` module owns the words (`doorNote`, `ago`,
  `summaryLabel`, `pulseRows`) and has tests; components only render them.
- **Verify in a browser before calling it done.** The root `pnpm build`
  doesn't build the Studio: run `pnpm --filter @sophia/studio run build`.
  Check the real page on the dev stack at desktop and phone widths, with
  measurements (positions, sizes, word counts), not impressions. After many
  quick edits Vite can serve a stale module: touch the file and confirm the
  served code before trusting a check.

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
  toggle's accessible name says so too ("Chat, something new"). The panel's
  state lives in the project's body (`useRoomPanel`), so what arrives while
  the person reads Goals still marks Chat when they come back.
- **Focus follows the panel** (`usePanelFocus`): in on open (the message bar
  where a fine pointer suggests a keyboard, the tab on a phone so no keyboard
  jumps up), back on close to the corner toggle that opened the panel or last
  swapped it, whatever tab was chosen inside (`focusStep`, with tests). A
  control that goes away when pressed (Text mode, a head's camera or screen
  switch, Voice mode) hands the focus to its neighbour, never to the page.
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
  that falls back to "Chat with Sophia" without a word reads as broken. The
  room's note comes before the chat's own errors (`footError`, with tests): a
  send that failed earlier must not hide that the call ended. A failed send
  belongs to its call (`room.call`), and a failed start to the way in, so
  neither comes back in the next call or over the bar. The room's note is
  announced by the dock; the foot shows it for the eye. A line that waits on
  the dock (taking the floor, Resume: `waitsOnRoom`) offers "Show the room"
  where the panel covers it. One join runs at a time (`useJoin`): Chat with
  Sophia waits while the dock joins, since a second connection for the same
  person makes LiveKit drop the first. A call that ends lets go of its join,
  which may still be settling (its microphone arriving): the next join starts
  at once, and a join answers whether the person is in the call once it
  settled (`holds` in `call-fence.ts`, with tests).
  Voice mode is offered in the call only, so a start whose join doesn't get
  in puts text mode back as it was, unless the pill went back to voice
  meanwhile (`startChat` in `chat-start.ts`, with tests): out of the call
  nobody could turn it off, and the dock's Try again would join in it, with
  the microphone off and Sophia muted.
- **Stray typing is text.** While the chat's foot is on screen (it marks
  itself `data-typing-sink`), a key typed with the focus on no control goes
  into the message bar and is never a shortcut (`shortcuts.ts`: `stray`,
  `strayFrom`, `typesText`, with tests). So does a key typed on a control of
  the panel (`data-typing-scope`: its tabs, Close, Send), except Space, which
  presses it: opening Chat focuses its tab, and the message typed next must
  not close the panel with its first C. Someone who starts a message without
  clicking the bar must not turn on a camera with its first letter. Before the
  chat starts, the foot is "Chat with Sophia", which takes the key as nothing:
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
- **Text mode is said wherever it holds.** Typing to Sophia is text mode:
  she is not heard and the microphone is off. The dock, the mini dock, the
  panel's head and the places' bar say so (`TextMode` in `RoomDock`, beside
  the microphone in `CallSwitches`) and one press returns to
  voice; so does turning the microphone on, once it did come on, also when
  text mode began while the browser was asking (`switchMicrophone` reads it
  then, with tests: a refused press keeps text mode and Sophia muted). Any end
  of the call ends it but a lost connection (`keepsTextMode`, with tests):
  then the pill stays beside Try again and Join's tip says the next join is
  typed. The microphone a join turns on that comes on after text mode began
  (the browser still asking, past LiveKit's own 10 s wait) goes off again;
  when it can't, text mode goes back to voice, the note says the microphone
  couldn't be turned off, and a chat start stops before Sophia is asked in
  (`arriveWithMicrophone`, `enterCall`, `startChat`, with tests). A join
  applies text mode as it is when it gets in, not as it began: its pill can
  go back to voice meanwhile (`textModeNow`); a join asked for in a call
  changes nothing of it. Text mode never rewrites the microphone choice the
  person made (`silence` in `useProjectRoom`), so the next join is as they
  left it. A device change counts by the device, not by LiveKit's answer: an
  off whose pending publication failed left it off (`deviceChange`, with
  tests); a change whose call went changes nothing in the next one. A device
  that stays on says so, never that it couldn't start (`mediaMessage` in
  `room-view.ts`, with tests).
- **The call's switches follow the panel.** Where the panel covers the room
  (up to 760 px wide), a row under its head shows the microphone, and the camera and the
  shared screen while they are on (`CallSwitches`, the dock's own
  `Toggle`). Someone reading the chat on a phone must not have to
  close it to see that they are heard, or to mute. Beside the room the dock
  already shows them, so the head does not repeat it. The row also shows
  text mode, and what Sophia is looking at, and it wraps: the head keeps its
  tabs and Close on a 390 px phone with everything on. Under the head the panel says what
  the covered dock would: what stopped a device, or, while Brief is in view,
  why the call ended (`panelNote`, with tests). These copies are for the eye
  (`aria-hidden`): the dock, still in the accessibility tree under the panel,
  is the one announced, so a screen reader hears each note once.
- **A call that ends says why** (`call-end.ts`, with tests; the reason is
  LiveKit's, read in `livekit-room.ts`). Only a lost connection is a failure
  and offers "Try again". The same person joining from another tab or device
  moves the call there: this tab says so and offers the plain "Join the
  room", or two tabs take the call from each other with the same "You were
  disconnected" and nobody knows why. Taken out of the call and a closed room
  have their own sentence. The note shows in the dock, the mini dock and the
  chat's foot; where the room is out of sight (at home, in another place) the
  toast says it (`callEnded` in `notice-view.ts`, with tests).
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
  the door) goes under the corner, never over it. With the panel open, the
  lobby card sits beside it on a wide screen (its tabs and Close stay in
  reach), and over it on a phone, where someone at the door would otherwise
  wait until the chat was closed: under the panel's top (`--panel-top`,
  measured in `SidePanel`), never over its tabs, Close or switches.
- **On screen is `onScreen`** (`shortcuts.ts`, with tests), not
  `checkVisibility` alone: Safari before 17.4 doesn't have it, the build
  targets Safari 16.4, and calling it threw on every key.
- **`hidden` always hides** (`[hidden]` in `theme.css`). Without that rule a
  class that sets `display` wins over the browser's own, and a hidden tab
  stays on screen.
- **Names stay for the visit** (`mergeNames`): someone who spoke and left
  keeps their name on their lines instead of "A member".
- **The preservation checks run in a browser** (`apps/studio/e2e/`, LFE-00's
  BASE-01 to BASE-03): drafts survive switching, closing and a background
  update; a message out of view marks Chat until it is seen; letters never
  turn a device on; leaving text mode hands the focus to the microphone; on
  a phone, mute, a refused device, leave, a lost connection and the way back
  (the dock's Try again, or Chat with Sophia in the open panel) stay in reach. They drive the Studio's own `ProjectShell`, with its feed,
  query cache and room controller, on a fixture page (`fixtures/room.html`,
  labelled "Fixture — no API, no call"). Only two boundaries are faked: the
  API, answered at fetch with a live event stream, and LiveKit, whose module
  the fixtures' Vite config swaps for `fixtures/fake-livekit.ts`. Any request
  the page doesn't answer fails the check, and other origins are aborted. CI
  runs them in Chromium (`studio-browser`); locally,
  `pnpm --filter @sophia/studio test:browser` (once:
  `pnpm --filter @sophia/studio exec playwright install chromium`). Change
  the room and they must still pass; a check that changes with it says why
  in the PR. The fixtures never reach the production build.
- **Explore's direction gallery has its own checks** (`e2e/explore.spec.ts`,
  LFE-03): on `fixtures/explore.html`, labelled "Simulated — no image
  service", the real `DirectionGallery` over a direction whose jobs went four
  ways. Choosing asks for that choice only; an image is drawn only from bytes
  that match its record, read once and only when its tile nears the screen,
  and read again on Try again after a failed read; one choice is saved at a
  time; a viewer sees who chooses; the keyboard and a phone reach everything.
  Explore in the Studio still says it is coming: it shows the gallery once
  S1-06 serves real candidates.
- **The resource panel has its own checks** (`e2e/resources.spec.ts`,
  LFE-06): on `fixtures/resources.html`, labelled "Simulated — no tool, host
  or account read" (`more=1` adds Grok and Gemini CLI, `quiet=1` leaves
  nothing waiting), the Studio's own `ProjectShell` on its Resources view,
  with the real `ResourcePanel` in it (`ProjectShell`'s `resources`;
  production keeps the view's "coming" note until SCM-01/02 serve resources).
  Each resource is a tile of four lines; its detail opens in the app's sheet
  and Escape returns to the tile. A search (`/` reaches it) and four filters
  (All, Waiting, Online, Mine, each with its count) find one among tens. One
  line on top says what waits on an owner, only while something does. Each
  tool shows as itself (`ToolLogo`, marks from `@lobehub/icons-static-svg`).
  Capacity that isn't observed, or a reading past its `valid_until`, says
  "Capacity unknown" over an empty track, never a number; a meter is drawn
  only for a percentage known to apply; a balance heads as a count; providers
  are never added up. Only a request's owner is told where to answer it and
  gets its session's id to copy; controls are shown, never offered. Its
  motion is small and checked: a filter glides the tiles (View Transitions),
  tiles arrive in turn, a tile's light follows the pointer, and what waits
  keeps a slow pulse. With reduced motion asked for, nothing moves. A meter
  turns amber from 75 % used and red from 90 % (`usageTone`; `busy=1` shows
  both). A tile's name is whose tool it is; its lines are its description.
- **The report viewer has its own checks** (`e2e/report.spec.ts`, SMC-M03): on
  the room's fixture page, whose API also answers the fixture report
  (`fixtures/report-data.ts`), Knowledge and a research notice. A report
  being read is never swapped for a newer version; over the room on a phone
  or as a full page it keeps mute, the door and the top bar's menus in
  reach; Esc keeps to the shortcut scope; a notice marks Chat; the focus is
  handed back and never taken; a description never overwrites a newer one;
  a failed read is said, with a way to try again, and a refusal as one.
  Every report downloads as an HTML page (html-report-v1) from its work card,
  the pane's Document tab and its Knowledge card: the saved file equals the
  page `@sophia/report/page` prints from the version's checked Markdown, and
  text that does not match its record (`tamper=text`) saves nothing.
  Change the viewer and they must still pass.

## The personal space

A person's private space with Sophia: one conversation, the notes they keep
from it, and the notes they carry to one of their projects. Its data side is
migration 0021 and contract amendment A10, served by the API's personal
routes; the Studio's places are a separate change. Keep these when you change
either:

- **Private means owner-only, in the database.** Every personal table reads
  `owner_id = actor` (RLS) and has no write grant; the `sophia.*` functions
  are the only writers, each idempotent per owner and key, keeping a digest of
  what they wrote, never the words, and receipts of ids. Each holds the
  owner's space before it reads its key (`personal_hold`), so a retry racing
  its first attempt gets the same receipt, never a conflict. No project role
  reaches a personal row, admins included, and nothing personal is joined into
  a project read. Test a new read path as another person and as a project
  admin (`personal.db.test.ts`): zero rows. Every writer is revoked from
  PUBLIC before it is granted to the API role (no schema default does it):
  a test checks that no `sophia` function is executable by PUBLIC.
- **Nothing kept is out of reach.** A space keeps at most 2000 notes and a
  person carries at most 2000 (`notes_full`, `carried_full`, each its own
  code), the bounds A10 lists them by, so every note and every carried note
  is listed; a list read is bounded too, newest first, and a project's
  carried notes list the reader's own first.
- **The one crossing is a carried note.** `carry_personal_note` copies one
  note, as written, into one project where its owner is an active member;
  members read it attributed to the name its owner shows, and the owner can
  take it back, which deletes the copy. Anything else that would move
  personal words into a project (a summary, a model reading the space) is a
  new decision for the owners, not a feature (goal D5).
- **Sophia never keeps a note on her own.** She suggests one after a reply;
  the person keeps it or lets it go, and one let go is deleted. "Note this"
  keeps a line in the person's own words. The export carries every turn with
  its suggestion still open. Erasing deletes the conversation, suggestions
  and notes, keeps only the key of every request, dated at the erasure (a
  retry from before, however late, writes nothing), and leaves carried notes
  where they were, still the owner's; the revision and the turn order go on.
  It also moves the space's epoch: every other personal write names the
  epoch it was made against (`x-sophia-personal-epoch`, from the space or the
  Work list) and is fenced to it in its transaction (`personal_fence`), so a
  write issued before an erasure, however late its first attempt arrives,
  writes nothing. A forgotten note's keep keeps no digest of its words
  either.
- **The companion is behind one interface** (`apps/api/src/companion.ts`):
  `answer` for a pending turn, `greet` for the welcome back. The keyless
  rehearsal (`SOPHIA_COMPANION=rehearse`, refused in production) is for
  development and tests only, and the space says so (`companion:
  'rehearsal'`). Without a companion, sending is refused and nothing is kept:
  never store a message nobody will answer. A retry still gets the receipt
  its key keeps where no companion runs (a deploy rolling out): only new
  work is refused there. A companion's failure is logged
  by its name and code only (`companionFailure`): its message may carry a
  person's words. The API claims a turn before it asks the companion
  (`claim_personal_reply`), and a welcome under its request's key
  (`begin_personal_greeting`), so only one process asks, whichever process a
  retry reaches; a claim lapses after two minutes, as a wait does. Every
  write of the answer carries its claim, so an attempt that lapsed writes
  nothing over a later one, neither a reply nor a failure. A welcome not
  written yet, because the companion failed (its claim goes) or the same
  request is still writing it, answers `outcome_unknown`: the client asks
  again under the same key. A welcome's request is its key and whom it
  greets (a digest): the same key with another name is refused, also after
  an attempt that failed. Each companion call is given a signal that aborts
  when its time is up, and is waited for: a turn fails, or a welcome lets
  its claim go, only once the call has stopped. The welcome's write is
  fenced to the request's epoch too: an erasure meanwhile refuses it. What
  the companion answers or welcomes from is read only under the claim that
  holds it, renewing its lease as it goes and every few seconds while the
  companion answers (`WATCH_MS`), so a stalled attempt asks nothing and
  nobody takes the claim over meanwhile; a reply reads as lost two minutes
  after it was asked for or last claimed, whichever is later. A call is
  known to every API process while it runs, with the space's epoch then
  (`begin_companion_call`): an erasure tells this process's calls for the
  person to stop, every other process stops its own once it finds its claim
  gone, and the erasure is acknowledged only once none begun before it is in
  flight anywhere (`stoppedEverywhere`, at most 65 seconds); then they are
  forgotten, with any a process that went away left behind. Should one
  still run then, or the wait fail after the erasure committed, it answers
  `outcome_unknown`: asked again under its key, it gets its receipt and
  waits again (a call a process that went away left counts no longer after
  two minutes), and stops no call of the conversation after it (each call
  keeps the epoch it began in). The companion answers a conversation one
  turn at a time, in order (`next_personal_reply`): a turn is claimed only
  as the person's oldest one waiting, while none is being answered; the
  process that answered one takes up the next, and each is asked with the
  answers before it, read from the newest turns only (never the whole
  conversation). The turns queued behind one being answered go on waiting
  with it (its renewal renews them), so none lapses in the queue. What the
  companion gave is never lost to a database away for a moment: a reply or a
  welcome is written again a few times (`again`), the turn is never marked
  failed for it, and a welcome that still can't be written keeps its claim,
  so nothing asks the companion twice.
- **A long conversation is read back a page at a time.** A space read lists
  the newest 500 turns; earlier ones come a page at a time
  (`/personal/turns/earlier`), and the space's `days` count the whole
  conversation, in the reader's time zone. The export comes a page of at
  most 1000 turns at a time (`after`, `next`), so one read stays bounded,
  each read against the epoch the copy began in: a page asked for after an
  erasure is refused (`request_erased`), so a copy never mixes an erased
  space with what came after it.
- **One read of the Work list stays small.** It holds at most 4000 carried
  notes in all (`PROJECT_LIST_BOUNDS`), the reader's own first, then the
  newest; each project's own bound still holds. The database reads no more
  than that either: the reader's own (a person carries at most 2000), and
  per project the newest of the others' within its bound, by index, however
  many they carried.
- **One read of the Work list asks the room server little.** One question
  finds the rooms that exist (`liveRooms`); only those are asked who is in
  them, a few at a time and within the list's time (`lookupAll`). Never by a
  room's count of participants: the server refreshes it every few seconds,
  and someone who just joined would read as nobody.

## The three places

Outside a project a person is in one of three places (`features/personal`,
direction C of Luis's prototype, "Two doors"): home with its two doors, their
personal space with Sophia (its data side is "The personal space" above), and
their work. Keep these when you change them:

- **The padlock is this device's privacy screen** (`lock.ts`, `useLock`,
  with tests), the same in every tab: one stored value per account (open,
  shut by the person, shut by a call), read again whenever a tab comes back.
  It is kept, as the draft is, by the account (`accountOf`), never by the
  address, which can change.
  The person shuts it (L, the padlock, the bar's chip), and so does every
  call that begins, also one that moves to another project without a pause
  (`onCallStart`); nothing else writes it but the person's own unlock, so
  writes from any number of tabs leave it shut once a call shut it. A call's
  end opens nothing: only the person opens it, after confirming it's them.
  Where storage can't be read it starts shut. Every lock closes the notes and
  drops what was read of the space, wherever the person is (`SignedIn`), and
  any change of who is signed in clears the cache: nothing personal is
  fetched, shown or kept in memory while it is shut. A place that can't be shown (a locked
  personal space) takes its history entry's place, so Back goes on past it.
  A copy of the space reads the padlock as stored when its export arrives,
  and copies nothing once it shut or its sheet went; an export still paging
  then stops at once (the page on its way too), asks for no page more and
  lets what came go (`exportPersonalSpace`'s signal). Its pages are read
  against the epoch the copy began in (one asked for after an erasure is
  refused), and erasing from the sheet, or an epoch that moves, calls it off
  too: nothing of an erased space reaches the clipboard. One copy goes at a
  time (Copy waits, "Copying…"), so an erasure waits for the only clipboard
  write there can be. A write the browser already has can't be called off:
  one that settles after the padlock shut or the sheet went is taken back
  (the clipboard emptied, as far as the browser lets a page), and nothing
  says it was copied. Dictation stops when the
  space goes out of sight, and a start still waiting for the device's
  language is called off (`useDictation`): the microphone never turns on out
  of sight. What it heard lands only while its composer is there: never
  after signing out, an erasure or the padlock, so no words come back to
  the device after its draft went. The focus goes with them to the field
  once the field is back on screen (it gives way to the listening line).
- **Unlocking checks the same person** (`app/reauth.ts`; `unlock-check.ts`,
  with tests). A passkey or an email code is checked on a client of its own,
  off the app's session, that stores and refreshes nothing;
  the user it returns must be the one in the app's own token, and its
  session is ended at once. A provider's check crosses a page load, so it
  must come back as a new sign-in of the same account (on the app's own
  client: it crosses a page load), and one that answers after a call began
  opens nothing. It leaves for the provider only while its sheet is there
  (`leaveFor`, with tests): closed meanwhile, the page stays; and only once
  this tab has noted which sign-in left (a browser that keeps nothing for
  the page is told to try another way). Back as
  another account than the one that left, that sign-in ends here and
  nobody is signed in (`refuseOtherAccount`, with tests): unlocking never
  opens another account, not even for a moment. Its check stays until that
  session is really gone, so a reload refuses it again; a sign-in or a
  sign-out of the person's own forgets it (`forgetPendingUnlock`, with
  tests), so it never refuses them later. Anyone else is
  "another account"; a check that returns nobody never is. Only the network
  has a deadline, each request on its own (20 s), never the passkey prompt:
  a prompt the person closes leaves the sheet waiting. The passkey works
  while the other ways load, and ways that failed or came late say so at
  once, with Try again (`orLate`, with tests). In a call no provider is
  offered, since signing in again leaves the page: the sheet says to leave
  the call first. Another tab's unlock closes this tab's sheet and nothing
  else: only the tab whose check passed goes where it was asked.
- **A write that is refused reads the space again.** "That changed a moment
  ago. This is how it is now" (`movedOn`, with tests) must be true: the space
  is read again, so a second press or another tab's change shows. A write
  that went through settles once what it changed can show: the space is
  read again until a read works, less and less often while reads fail
  (`readUntilRead`), and the Work list too when the write changed it (a
  note carried or taken back); a message stays on its way until then. A write
  with no answer is retried under its key only within two minutes of its
  first attempt (`once`, with tests); later it is said as not confirmed, and
  the space is read again. A message's words stay on this device until they
  were sent, and come back to the field, ahead of anything typed meanwhile,
  when the send failed ("Not sent") or got no answer ("Not confirmed: check
  the conversation"), never when the space was erased (`request_erased`) or
  the field went with a sign-out (`restoredDraft`, `unsent`, with tests).
  The device keeps only the draft of the account signed in (`draftsOnlyOf`,
  with tests): once the app knows who that is, anyone else's goes, and all
  go once it knows nobody is (signed out here or in another tab, a session
  that ended, also while the page was closed, a provider's return
  refused). Signing out forgets them at once and again once it has
  settled, also when it failed (`signOutForgetting`, with tests), so
  nothing written meanwhile stays; erasing forgets the draft as soon as it is confirmed, before the space is
  read afresh (`draft.ts`). One message is on its way at a time, from the
  field or a way to start (`OnItsWay`), and from any tab of the device: a
  send holds the browser's lock across tabs until it settles
  (`oneAtATime`, with tests), and a tab's words on their way stay on the
  device (`waitsFor`, with tests) and stay that tab's while it still sends
  them, however long: another tab takes them back only once the browser
  has let go of that tab's lock (`sendingNow`, with tests); nothing
  rewrites them meanwhile. They go once sent, also when the field went
  meanwhile. A way to start goes the same way, under its own
  key, the field left as it is. The field waits meanwhile, so no tab's
  words on their way are lost and they arrive in order. Every write but
  erasure names the epoch of the space as this page last read it (`epochNow`: the space's when it is
  shown, else the Work list's), and its retry names the same one, so
  nothing sent before an erasure lands after it, nor anything a space shown
  from before one writes, though the Work list may already name the newer
  epoch. The field follows the one draft the device keeps:
  another tab's change at once, and an erasure anywhere (it moves the epoch;
  also one whose answer was lost) takes the words written before it. The
  draft keeps the epoch it was written in (`draftIn`), so words from before
  an erasure never come back, also when it happened on another device while
  this one was locked; the field reads the draft only once the space's epoch
  is known. Each version of the draft keeps the admission key it is sent
  under (`Draft`), so the same draft sent from two tabs, or again from one
  that hadn't heard it went, is one message; a message that settles leaves
  the device's draft as it is then, without its words (`afterSent`), so
  words another tab wrote meanwhile stay. Words on their way are kept apart
  from the draft (`Kept`): no other tab shows them in its field or sends
  them again, and what is typed after them is a message of its own; they
  come back to the field only if the tab that sent them went away (its time
  for them is up), said so; an open field takes them back when that time
  comes. Words going out take only their own draft with them: another
  tab's newer one stays. An erasure on another device reaches an open
  tab within the Work list's next read (every 20 s) (`erasedElsewhere`).
  After any erasure (from this page, confirmed or with its answer lost;
  from another device; from another tab of this one, whose words are kept
  in a newer epoch; or a write refused as erased, `refusedAsErased`)
  everything read of the space goes at once, the turns waited for
  included, and the space is read afresh (`readAfresh`): a read that fails
  then says so, with Try again, and shows none of it. A read that fails says
  so with Try again wherever what it reads is used (`ReadNotes`): each place,
  the notes' carry menu (the projects) and Your data (the space's counts,
  never bare dashes). A message on its way
  shows only over the space of the epoch it was sent in. Until the space is read the
  field goes by the epoch the Work list names, so a draft from before the
  erasure leaves the field and the device at once (one written after it
  stays). Waiting for a reply never stops
  reading:
  after failed reads, less and less often (`pollEvery`). The device never
  keeps words in an older epoch than it already holds (`keptEpoch`), and a
  tab whose space is behind the draft it shows reads the space afresh before
  sending it. Every personal read takes its query's signal: the padlock
  shutting stops the reads on their way (the space, the wait for a reply, a
  page read back); the account leaving stops the Work list's and a page
  read back, which a project opened over the places stops too. A long conversation reads back from the Earlier days menu
  ("Show earlier days"); turns that leave the space's window as new ones
  come stay with what was read, also while a page is on its way (it joins
  what was read by the time it arrives), and an erasure lets all of it go; Your data's copy reads the export a page at a time, so it
  carries every turn, and an erasure waits for a copy's clipboard write to
  settle, so nothing erased lands there after; while an erasure is under
  way no copy starts (Copy waits, aria-disabled). Your data's days are the server's count, over the whole
  conversation, in this device's time zone (UTC where the server doesn't
  know it). While the padlock is shut the field is off the page and the
  page keeps none of the space's words: neither a message on its way nor
  what was read back, nor a page of it that arrives after (the device keeps
  the draft). The conversation's days
  follow the clock: past midnight, Today becomes Yesterday. "Join the room"
  from Work asks to join on that opening only (`joinStands`, with tests):
  leaving before the room could join drops it. Of several sessions about to
  start, the soonest comes first, and is the one the Home door joins
  (`workOrder`, with tests).
- **Words from the view modules.** `places-view.ts`, `conversation-view.ts`,
  `data-view.ts` and `notice-view.ts` own the sentences that depend on what
  the places read (door verbs, sessions, rooms, the introduction and when it
  shows, days, topics, facts, the toasts), with tests; a fixed line may live
  in its component. They promise only what is offered: unlocking asks the
  person to confirm it's them, never for a passkey that may not exist. The side the person keeps to themselves is
  their "personal space"; Personal is only the place's name.
- **Nothing still loading looks empty** (`readState`, `ReadNotes`). A door
  whose read hasn't come back only opens (no "Start talking", no "Start a
  project"); the personal space offers no introduction, no ways to start and
  no field to type in until it has loaded (it waits, disabled), no ways to
  start where Sophia can't answer (the field says why), and its notes
  say nothing and count nothing before; a slow read adds the Studio's wait
  line and a failed one says so with Try again. In a private space, what looks empty
  reads as deleted.
- **The places are built from the Studio.** The layout is the prototype's
  (direction C: the doors, the line with the padlock, the edges, the
  conversation); the bar, buttons (`.pill`, `.ghost`, `.round`,
  `.text-button`), fields (`.field`), the message bar, tips, sheets, the
  toast and the account are the Studio's own, unchanged. `personal.css`
  holds only the places' layout, scoped to `.places` with `ps-` keyframes; it
  adds two tokens and redefines none. Compare a change side by side with the
  artifact at the stage's size (1238 x 708) and on a phone before calling it
  done.
- **The call in the places' bar.** The bar shows the call kept out of sight
  (`ProjectCall`): the room's own switches (`CallSwitches`), text mode, what
  Sophia is looking at and what stopped a device. These are the copies a
  screen reader hears (status and alert); the room's own are in the hidden
  project. A call that ends out of sight says so in the toast (`callEnded`),
  never that the space opened.
- **Keys.** H, P and W go to the three places, D opens your data, L the
  padlock, T the notes; Enter at home goes to the side used last and the
  arrows pick a door; in a project, H and W work too. Every key is in a tip,
  never drawn inside a control. Esc closes what opened last (`useEscape`),
  then goes home; a sheet or a popover takes its own Esc first; in the
  composer the first Esc only lets go of the field; the notes take Esc only
  where they are on screen.
- **Typing goes to the message bar.** The conversation column is the typing
  scope (`data-typing-scope`): a letter typed with the focus nowhere, on the
  conversation or on one of its controls goes into the message bar, the
  first sink on screen and not inert (`typingSink`, with tests), so a
  message's first L never locks the space. Where the notes cover the column
  (860 px and narrower, the CSS's own width) it is inert. Arriving in
  Personal puts the cursor in the field on a desktop, and the focus on the
  conversation on touch, so no keyboard pops up uninvited.
- **The focus is never dropped.** A control that goes away when pressed
  hands the focus on (`focus.ts`: the conversation, Note this, the note's
  Carry, the Notes toggle; in a sheet, its Close or the first control of
  what replaced it), a sheet whose opener is gone gives it to the place
  (`returnTo` in `useDialog`), and Undo hands it back where it was (`Toast`).
  The days' menu gives it to the day chosen, and keeps it when the last page
  read back takes its "Show earlier days" away.
  A menu that opens a sheet hands the focus to its own button first; the
  call's pill gives it to the bar's mark when it goes, however the call ends;
  a lock from anywhere gives it to the bar's Personal switch. A press that
  is being answered keeps the focus as it waits ("Sending…", "Checking…",
  "Deleting…": `aria-disabled`, never `disabled`), and starts no second
  write for the same thing (`presses.ts`: Keep and No thanks on a
  suggestion, Ask again, Take back, a carry; Copy has its own wait): a
  second would be refused as stale, and its notice would replace the
  first's, Undo and all. A note carried stays crossed, out of reach, until
  its write settles (back within reach if it failed), never only for its
  slide. A modal sheet on screen
  takes every key and every stray letter (`modalOnScreen`); one left open in
  a project out of sight takes none, and takes the focus again when the
  project is back on screen. A screen reader hears Sophia writing and then
  her reply (`heard`, with tests), never what was there when the space
  loaded, nor earlier days read back.
- **An answer never moves the person.** What comes back after a wait (an
  answer, the voice heard) moves the focus only if the person left it where
  the act did, or it was dropped (`focusLater`, with tests: Take back,
  dictation). A note carried hands the focus to the notes as it starts to
  cross, before it goes out of reach, and nothing moves it after the slide;
  a control that appears in place of the
  focused one takes it only from nobody (`focusIfDropped`: a refused note's
  form). The conversation keeps its latest turn in sight as it grows while
  the person reads at its end (also when they come back from another
  place), and always as they send: whoever reads further up stays there. A
  project made opens only while its form is in sight, and a provider's
  check that passes late goes to Personal only while the person is still
  where the return put them.

## The Studio's hosting headers

`apps/studio/public/vercel.json` sets them for the hosted Studio.

- **Permissions-Policy.** The camera, the microphone and screen capture are
  for the Studio's own page only, and nothing else the page never uses
  (location, payment, USB and the like) can be asked for.
- **Content-Security-Policy, report-only for now.** Scripts, styles and
  fonts come only from the Studio itself (the build has no inline script or
  style); pictures also from the account providers' avatar hosts;
  connections go to the API, the Supabase project and LiveKit Cloud, each
  named. A violation shows in the browser's console and blocks nothing.
  When the API, the Supabase project or the LiveKit project moves, move
  `connect-src` with it. To enforce the policy, rename the header to
  `Content-Security-Policy` once real use shows no violation.
- **Check a change** by serving a build with the policy enforced and
  walking the app, a call with camera and screen included: every blocked
  resource fires `securitypolicyviolation`.
