# Plan: A personal space with Sophia, beside the work space

> Date: 2026-09-30 · Status: **in progress** (slice 1 done, in review) · Goal: [docs/goals/personal-space.md](../goals/personal-space.md) · Design: Luis's prototype, direction C "Two doors" (artifact "Sophia Personal Space")

## Approach

Build direction C one to one in the Studio, on real data, and keep the one open
architectural question (how our runtime hosts a companion that belongs to a
person, not a project) behind a single interface, so the product, the privacy
model and the design can be reviewed now and the runtime binding lands without
touching them.

- Personal data lives in its own owner-only tables (0021), never in project
  tables with a flag. The functions are the only writers; RLS decides every
  read. The only crossing is one note carried to one project, taken back at will.
- Sophia's side comes from a `Companion` (`apps/api/src/companion.ts`). Slice 1
  ships a keyless rehearsal (the prototype's scripted lines, development only);
  where no companion runs, nothing is kept.
- The Studio gains three places outside a project (home, personal, work) with
  the prototype's layout, words, motion and keys; a call goes on across them.
- D5 stays "no": nothing personal is readable by a project or the team's Sophia
  unless its owner carries it, one note at a time.

## Steps

### 1. The three places and owner-only storage · done (this PR)

- **Files:** `db/migrations/0021_personal_space.sql`;
  `packages/contracts/amendments/A10-personal-space.json`;
  `packages/persistence/src/personal.ts`, `project-list.ts`;
  `apps/api/src/routes/personal.ts`, `routes/projects.ts`, `companion.ts`,
  `companion-rehearsal.ts`; `apps/studio/src/features/personal/`,
  `app/App.tsx`, `app/route.ts`, `app/reauth.ts`, `features/studio/ProjectShell.tsx`.
- **Verification:** `personal.db.test.ts` in persistence (9) and the API (5);
  the Studio's view modules (`conversation-view`, `places-view`, `data-view`,
  `lock`, `route`) with unit tests; side-by-side captures against the prototype
  at its stage size and on a phone; browser walks of the keys and flows (38
  checks) and of a call across the places (13 checks); the room's existing
  browser suites on this branch.
- **Done when:** the gate is clean (`pnpm check`), every screen of direction C
  is reachable and matches the prototype, and another person or a project admin
  reads zero personal rows on every path.

### 2. The Companion on our runtime (goal D1) · needs Davide

- **What:** a second agent kind next to the team agents, owned by a person:
  presets for text and later voice, an owner-only context (the conversation and
  the person's notes, nothing from projects), replies written through
  `record_personal_reply` / `record_personal_greeting`. It replaces the
  rehearsal behind the same interface; the Studio does not change.
- **Open:** today every runtime record is project-scoped (`runtime_instances`,
  outbox, dispatch). Options: a runtime instance keyed by owner, or a
  service-level companion runtime with owner-only commands. The role would be
  new (`sophia-companion-v1`, no native tools), so the bundle's recorded
  identities move. Live model calls are billable and need an allowance.
- **Verification:** a hosted run where a message gets a reply and the
  exchange is there after a reload (goal criterion 3).

### 3. Carried notes inside the project · decision

- **What:** members see a carried note in Work today. Inside the project it
  could join the mission notes (with its owner as author and a "from their
  personal space" mark) or a list of its own. The team companion reading it is
  covered by D5: only once carried.
- **Verification:** a test without a carry shows nothing in the project's
  ledger or sources; with one, only that note, attributed (goal criterion 5).

### 4. Names of the people in a project · decision

- **What:** the prototype says "You and Luis"; the system keeps no member
  names, so Work says "You and 1 other". Keeping the name each member shows
  (as the room already shows it) needs a small owner-readable record.

### 5. The privacy page · with Luis and Davide

- **What:** a published page that says what the personal space keeps, for how
  long, who can read it, and how to erase it, matching 0021 (goal criterion 7).

## Coverage of the goal's acceptance criteria

| Criterion | Where it stands |
|---|---|
| A new account opens its personal space | Adapted to direction C: the first screen is home, "Welcome, <name>", with the Personal door first and "Start talking" one press away (slice 1) |
| Personal and Work are two clear places | Slice 1: three places, one switch, a call that goes on across them |
| A one-to-one conversation answered by the Companion | Slice 1 with the rehearsal; slice 2 for the runtime's Companion |
| Private to its owner | Slice 1: owner-only RLS, database tests as another person and a project admin |
| Nothing reaches a project without a per-item release | Slice 1: carry and take back; slice 3 for where it shows inside the project |
| The owner controls their data | Slice 1: your data (facts, copy everything, erase); notes deleted by undo |
| The privacy page | Slice 5 |
| Clean-code gate | Slice 1: format, lint, types, contracts, tests |

## Risks

- A person reads "Sophia" in two places with two memories. The places say
  which side you are on (the chip, the doors, the edges); the team's Sophia
  never reads the personal side.
- Emotional conversations are sensitive. Erasure is real (rows deleted,
  requests redacted); retention and backups must be stated on the privacy page
  before real people arrive.
- Until slice 2, production has no companion: sending is refused with a
  sentence, so the space is a design and privacy review, not a service.

## Out of this plan

Reflection cards and other sophia-ei.com features, migrating their users (D4),
semantic memory or vectors (D3 keeps plain Postgres), a voice companion (D2 later;
dictation on the device already fills the field), billing, a mobile app.

## Final verification

`pnpm check` clean; `pnpm test:db` with the personal suites; the browser walks
and the side-by-side comparison on a fresh dev stack; then, after slice 2, a
hosted run with a synthetic `@sophia.test` account through sign-up, a first
conversation, a carried note seen by a teammate, and erasure.
