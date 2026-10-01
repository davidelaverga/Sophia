# Goal: A personal space with Sophia, beside the work space

> Date: 2026-09-29 · Status: **parked**, team room first (Davide, 2026-09-30). D1–D4 decided, D5 to confirm (§6) · Research: — (context below)

## 1. Goal

Anyone who signs up lands in their own private space with Sophia, where they can talk with her one to one. From there they can move to the work space (projects, rooms, the team's mission) and back, and nothing said privately reaches a project unless they release it.

## 2. Motivation

- Sophia has two functions (Luis, 2026-09-25): an **emotional companion** for each person, and a **studio** where teams build. Sign-up is open for that reason: people shouldn't wait for an organization to start using Sophia.
- Today a new account lands on "What are we building?", which is the work side. There is nothing for a person on their own.
- The pack already draws the line: *"Personal material remains separate until its owner releases the exact contribution"* (`docs/pack/01_SOPHIA_END_TO_END.md`, "What memory means here"). It also keeps the memory guarantees of current Sophia while replacing its companion assembly.
- PR #18 (SMC-M01, Davide) builds the **team** companion: mission ledger, shared notes with consent, decisions. It explicitly leaves out private memory and one-to-one conversation. This goal covers exactly that gap and must not duplicate #18.

## 3. Acceptance criteria

- [ ] **A new account opens its personal space, not the project list.**
  *Verification:* a hosted test account (synthetic `@sophia.test`) signs up. The first screen is the personal space, and the Studio home is one step away.
- [ ] **Personal and Work are two clear places.** Moving between them never starts, stops or changes project work.
  *Verification:* a Studio e2e walk switches Personal → Work → Personal. Project state and its event log are unchanged.
- [ ] **A person can hold a one-to-one conversation with Sophia in the personal space**, answered by the Companion agent on our own runtime (D1), in text.
  *Verification:* a hosted run: a message gets a reply, and the exchange is still there after a reload.
- [ ] **Personal conversations are private to their owner.** No other account, project member, admin, the Studio's project views or the team companion (#18) can read them.
  *Verification:* database tests with the application role. Another actor, including a project admin of a shared project, gets zero rows or a refusal on every personal read path.
- [ ] **Nothing personal reaches a project without an explicit, per-item release by its owner.** A release names the target project and shows exactly what is shared.
  *Verification:* a test without a release shows nothing in the project's ledger or sources. With a release, only that item appears, attributed to its owner.
- [ ] **The owner controls their personal data.** They can see what Sophia keeps, delete a conversation, and delete all personal data.
  *Verification:* API and database tests show that deletion removes the rows and that later reads return nothing.
- [ ] **The published privacy page describes what the personal space actually keeps.**
  *Verification:* reviewed by Luis and Davide against the implemented data (§5).
- [ ] **Clean-code gate.**
  *Verification:* format, strict lint and typecheck are clean, and all tests pass (`pnpm check`).

## 4. Scope

- **In:**
  - the personal space as a place in the Studio app;
  - the Personal ↔ Work switch;
  - one-to-one conversation with Sophia;
  - private storage with owner-only access;
  - per-item release to a project;
  - view and delete controls.
- **Out (non-goals):**
  - the team companion, mission ledger and project notes (PR #18);
  - the research agent, PDFs and images (Davide's M03 work);
  - migrating data from the current Sophia-Agent product;
  - Reflection Cards and other sophia-ei.com features (D4: no);
  - long-term semantic memory or vector search (D3 keeps memory on plain Postgres);
  - voice in the personal space (D2: text first; voice gets its own preset later);
  - billing and plans;
  - a mobile app.

## 5. Constraints and assumptions

- Uses the existing accounts: Supabase Auth with Google, GitHub, email and passkeys; anonymous guests never get a personal space.
- Uses the existing API, database with RLS, and room stack. Personal data lives in its own tables with owner-only policies, never in project tables with a flag.
- Contract changes go through a new amendment (A04 or later), like A01–A03. The frozen pack is not edited.
- **Assumption:** a person's personal space is independent of any organization. If Sophia later needs organization-owned personal spaces (enterprise), this goal changes.
- **Assumption:** the runtime can host a second agent kind, the Companion, with its own presets and an owner-only context, next to the team agents (D1).

## 6. Decisions (Davide, 2026-09-30)

- **D1 · Brain: decided.** The companion is not the current Sophia-Agent. It runs on our own runtime (the DeepSeek harness) as a **Companion agent**, with specific presets for text and for voice.
- **D2 · First channel: decided (with D1).** Text first. Voice comes later with its own preset.
- **D3 · Memory: decided.** Sophia remembers across a person's conversations. That memory reuses the same base machinery as the team projects (simple Postgres), adapted for personal memory. What the person sees and controls is settled in the plan; Luis's prototype proposes:
  - visible notes;
  - Sophia suggests a note and the person keeps it or not;
  - delete everything.
- **D4 · Current users: decided.** No. People from sophia-ei.com don't bring their history, and there is no migration goal.
- **D5 · Where private material may be read: to confirm.** The question was whether the team companion may ever read personal material, even on request. Davide answered "yes", which can be read either way:
  - as agreement with this proposal (it never reads it; only a per-item release reaches a project);
  - as permission for the team companion to read it.

  Until Davide confirms, this goal keeps the proposal: **no**. Only a per-item release by its owner makes something visible to a project.

## 7. Open risks

- Emotional conversations are sensitive data. Retention, deletion and the privacy page must match reality before real users arrive.
- Two companions (personal and team) with different memories can confuse people unless the interface makes clear which Sophia they're talking to and what each one knows.
- Open sign-up without a personal space: while this goal is parked, a person who signs up without an organization lands in an empty Studio. Their first run (create a first project, or join through an invitation) has to be good on its own. That belongs to the team-room work.

## 8. Next step

**Parked**: the project team room comes first (Davide, 2026-09-30). When the personal space is picked up:
1. Davide confirms D5.
2. A plan (`docs/plans/personal-space.md`) splits the work into slices. The first slice would likely be the switch and the personal home, owner-only storage, and a text conversation with the Companion agent.

Luis has an interactive prototype of the personal side (direction C, "two doors"). It covers the privacy line, notes Sophia suggests and the person keeps, carrying a note to a project and taking it back, and locking the personal side. It can serve as the starting point for the plan's interface slice.
