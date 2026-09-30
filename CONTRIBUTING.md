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
