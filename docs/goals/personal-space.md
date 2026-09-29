# Goal: A personal space with Sophia, beside the work space

> Date: 2026-09-29 · Status: proposed (needs Davide's decisions in §6) · Research: — (context below)

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
- [ ] **A person can hold a one-to-one conversation with Sophia in the personal space**, answered by the companion brain chosen in §6 (D1).
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
  - Reflection Cards and other sophia-ei.com features, unless D4 brings them in;
  - long-term semantic memory or vector search (see D3);
  - billing and plans;
  - a mobile app.

## 5. Constraints and assumptions

- Uses the existing accounts: Supabase Auth with Google, GitHub, email and passkeys; anonymous guests never get a personal space.
- Uses the existing API, database with RLS, and room stack. Personal data lives in its own tables with owner-only policies, never in project tables with a flag.
- Contract changes go through a new amendment (A04 or later), like A01–A03. The frozen pack is not edited.
- **Assumption:** a person's personal space is independent of any organization. If Sophia later needs organization-owned personal spaces (enterprise), this goal changes.
- **Assumption:** the companion brain (D1) can be reached from sophia-next with an API it controls, without sharing Sophia-Agent's database.

## 6. Decisions needed from Davide

- **D1 · Brain.** Which companion answers in the personal space?
  - (a) the Gemini Live / companion prompt you're building, reused one to one;
  - (b) the current Sophia-Agent companion behind an API;
  - (c) something new.
- **D2 · First channel.** Text first, voice first, or both? Voice would reuse LiveKit in a one-person room.
- **D3 · Memory.** Does Sophia remember across personal conversations in the first version, or only within a conversation? If she remembers, what does the person see and control?
- **D4 · Current users.** Should people from sophia-ei.com (Sophia-Agent) find their history here? If yes, it's a separate migration goal.
- **D5 · Where private material may be read.** May the team companion ever read personal material, even on request? This proposal says no: only a per-item release makes something visible to a project.

## 7. Open risks

- Emotional conversations are sensitive data. Retention, deletion and the privacy page must match reality before real users arrive.
- Two companions (personal and team) with different memories can confuse people unless the interface makes clear which Sophia they're talking to and what each one knows.
- If D1 points to Sophia-Agent, there's a coupling across repos and deploys (another service in the release flow).

## 8. Next step

Davide answers D1–D5. Then a plan (`docs/plans/personal-space.md`) splits the work into slices. The first slice would likely be: the switch and the personal home, owner-only storage, and text conversation with the chosen brain.
