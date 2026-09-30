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
  closing and switching. Esc or Close shuts the panel; on a phone it covers
  the room below the bar and its toggles sit under the lenses.
- **New is a dot.** A violet dot on a toggle says something changed behind a
  closed panel (`useUnread`, `useBriefUpdates`, the pure `isNew`); the
  toggle's accessible name says so too ("Chat, something new").
- **Focus follows the panel** (`usePanelFocus`): in on open (the message bar
  where a fine pointer suggests a keyboard, the tab on a phone so no keyboard
  jumps up), back to the toggle that opened it on close.
- **The composer** is one message bar with Send inside (Enter sends,
  Shift+Enter breaks a line) and one status line under it (`ChatLine`): the
  step under way, what the chat waits for, and its one action (Chat with
  Sophia, Voice mode). The consent question shows only while one is due.
- **Names stay for the visit** (`mergeNames`): someone who spoke and left
  keeps their name on their lines instead of "A member".
