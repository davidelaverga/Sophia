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
  the project frozen on screen behind a small "No access".
- **What a person sends stays in sight.** A microphone, a camera or a shared
  screen that is on shows wherever this person is, with its off switch: the
  dock in the room, the mini dock from every other view (`Sending` in
  `MiniDock`). Nothing keeps sending out of sight because the view changed.
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
