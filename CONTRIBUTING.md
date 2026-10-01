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
  the `aria-label` of a short button (the notes consent's "Agree"). The key
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
  axis, the Work view's two heads one rule and one baseline. Check them as
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
  have nothing to change yet). A hosted API that sat idle can take close to
  a minute to answer; without the line, that minute looks broken.
- **Going home from a call says so first.** Home ends the call (the room
  lives in the project's page). While in the call its name and tip read
  "Home: you leave the room".
- **What a person sends stays in sight.** A microphone, a camera or a shared
  screen that is on shows wherever this person is, with its off switch: the
  dock in the room, the mini dock from every other view (`Sending` in
  `MiniDock`). Nothing keeps sending out of sight because the view changed.
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
- **Admissions** (`useAdmission`). No answer offers Try again with the same
  key (`AdmissionNote`, `retry()`), never a fresh key, so a retry can't
  create a second record. Say what happened in words ("Scheduled: Today ·
  03:30 – 04:30."), and name a conflict before it happens ("Overlaps …").
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
  she is not heard and the microphone is off. The dock, the mini dock and the
  panel's head say so (`TextMode` in `RoomDock`) and one press returns to
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
  shared screen while they are on (`CallSwitches` in `StudioShell`, the
  dock's own `Toggle`). Someone reading the chat on a phone must not have to
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
  A forgotten note's keep keeps no digest of its words either.
- **The companion is behind one interface** (`apps/api/src/companion.ts`):
  `answer` for a pending turn, `greet` for the welcome back. The keyless
  rehearsal (`SOPHIA_COMPANION=rehearse`, refused in production) is for
  development and tests only, and the space says so (`companion:
  'rehearsal'`). Without a companion, sending is refused and nothing is kept:
  never store a message nobody will answer. A companion's failure is logged
  by its name and code only (`companionFailure`): its message may carry a
  person's words.

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
