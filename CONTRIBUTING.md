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
  starting in another project ends the one before (`useCall` in `App.tsx`).
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
- **Admissions** (`useAdmission`). No answer offers Try again with the same
  key (`AdmissionNote`, `retry()`), never a fresh key, so a retry can't
  create a second record. Say what happened in words ("Scheduled: Today ·
  03:30 – 04:30."), and name a conflict before it happens ("Overlaps …").
- **Panels keep their state.** Tabs in a sheet or panel are hidden, not
  unmounted, so a draft or an edit in progress survives switching and
  closing.
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
  shared screen while they are on (`CallSwitches`, the dock's own `Toggle`).
  Someone reading the chat on a phone must not have to close it to see that
  they are heard, or to mute. Beside the room the dock already shows them, so
  the head does not repeat it.
- **A call that ends says why** (`call-end.ts`, with tests; the reason is
  LiveKit's, read in `livekit-room.ts`). Only a lost connection is a failure
  and offers "Try again". The same person joining from another tab or device
  moves the call there: this tab says so and offers the plain "Join the
  room", or two tabs take the call from each other with the same "You were
  disconnected" and nobody knows why. Taken out of the call and a closed room
  have their own sentence. The note shows in the dock, the mini dock and the
  chat's foot; where the room is out of sight (at home, in another place) the
  toast says it (`callEnded` in `notice-view.ts`, with tests), and wherever
  the person is it says when leaving opened the personal space again.
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

## The personal space and the three places

Outside a project a person is in one of three places (`features/personal`,
direction C of Luis's prototype, "Two doors"): home with its two doors, their
personal space with Sophia, and their work. The data side is migration 0021
and contract amendment A10. Keep these when you change either:

- **Private means owner-only, in the database.** Every personal table reads
  `owner_id = actor` (RLS) and has no write grant; the `sophia.*` functions
  are the only writers, each idempotent per owner and key, keeping a digest of
  what they wrote, never the words, and receipts of ids. Each holds the
  owner's space before it reads its key (`personal_hold`), so a retry racing
  its first attempt gets the same receipt, never a conflict. No project role
  reaches a personal row, admins included, and nothing personal is joined into
  a project read. Test a new read path as another person and as a project
  admin (`personal.db.test.ts`): zero rows.
- **The one crossing is a carried note.** `carry_personal_note` copies one
  note, as written, into one project where its owner is an active member;
  members read it attributed to the name its owner shows, and the owner can
  take it back, which deletes the copy. Anything else that would move
  personal words into a project (a summary, a model reading the space) is a
  new decision for the owners, not a feature (goal D5).
- **Sophia never keeps a note on her own.** She suggests one after a reply;
  the person keeps it or lets it go, and one let go is deleted. "Note this"
  keeps a line in the person's own words. Copy everything as text includes
  the suggestions not decided yet. Erasing deletes the conversation,
  suggestions and notes, deletes the requests older than ten minutes and
  redacts the rest (a late retry still writes nothing), and leaves carried
  notes where they were, still the owner's.
- **The companion is behind one interface** (`apps/api/src/companion.ts`):
  `answer` for a pending turn, `greet` for the welcome back. The keyless
  rehearsal (`SOPHIA_COMPANION=rehearse`, refused in production) is for
  development and tests only, and the space says so (`companion:
  'rehearsal'`). Without a companion, sending is refused and nothing is kept:
  never store a message nobody will answer.
- **The padlock is this device's privacy screen** (`lock.ts`, `useLock`), in
  every tab of it: another tab's lock reaches this one, and a tab in a call
  never opens with another (`followed`, with tests). Shut by the person or by
  joining a room (a screen may be shared there), every new call shuts it,
  also one straight after another (`onCallChange`, with tests); a room's lock
  lifts when the room is left, the person's stays. While shut, nothing
  personal is fetched or shown, and opening it asks to confirm it's them
  (`app/reauth.ts`: passkey, the provider they signed in with, or an email
  code, and the same account must come back). In a call no provider is
  offered: signing in again leaves the page and would end the call. A code
  that couldn't be sent, or ways that couldn't load, say so and can be tried
  again. A place that can't be shown (a locked personal space) takes its
  history entry's place, so Back goes on past it.
- **A write that is refused reads the space again.** "That changed a moment
  ago. This is how it is now" (`movedOn`, with tests) must be true: the space
  is read again, so a second press or another tab's change shows. The draft
  stays on this device until its words were sent, and signing out or erasing
  forgets it (`draft.ts`). "Join the room" from Work asks to join on that
  opening only (`joinStands`, with tests): leaving before the room could join
  drops it.
- **Words from the view modules.** `places-view.ts`, `conversation-view.ts`,
  `data-view.ts` and `notice-view.ts` own every sentence the places say (door
  verbs, sessions, rooms, the introduction and when it shows, days, topics,
  facts, the toasts), with tests. The side the person keeps to themselves is
  their "personal space"; Personal is only the place's name.
- **Nothing still loading looks empty** (`readState`, `ReadNotes`). A door
  whose read hasn't come back only opens (no "Start talking", no "Start a
  project"); the personal space offers no introduction, no ways to start and
  no field until it has loaded; a slow read adds the Studio's wait line and a
  failed one says so with Try again. In a private space, what looks empty
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
- **Keys.** H, P and W go to the three places, D opens your data, L the
  padlock, T the notes; Enter at home goes to the side used last and the
  arrows pick a door; in a project, H and W work too. Every key is in a tip,
  never drawn inside a control. Esc closes what opened last (`useEscape`),
  then goes home; a sheet or a popover takes its own Esc first; in the
  composer the first Esc only lets go of the field; the notes take Esc only
  where they are on screen. Arriving in Personal on a desktop puts the cursor
  in the field, and a letter typed with the focus nowhere goes into it
  (`data-typing-sink`), so a message's first L never locks the space. A
  control that goes away when pressed hands the focus on (`focus.ts`: the
  conversation, Note this, the Notes toggle), and Undo hands it back where it
  was (`Toast`). A screen reader hears Sophia writing and then her reply
  (`heard`, with tests), never what was there when the space loaded.

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
