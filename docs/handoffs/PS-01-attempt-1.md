# Implementation-session handoff: PS-01 personal space, attempt 1

- **Goal:** [docs/goals/personal-space.md](../goals/personal-space.md). Anyone who signs up has a private space with Sophia, beside the work space. The goal is parked (Davide, 2026-09-30: team room first). Luis asked on 2026-09-30 to build it anyway, as a draft for Davide's call («La opción C. Debe ser un 1 to 1»).
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `studio/personal-space` from `studio/combined-23-24-28` (`6e5a12f`: main with #23, #24 and #28 merged in); first commit `c3f8968`, 2026-09-30.
- **End:** the PR's head when merged; this file arrived with the fixes for Codex's review of `8bf2acf`, and was updated with an independent review's.
- **Writable scope:** this repository. **No hosted service was changed.** Migration 0021 is on no hosted database.

## Outcome

What works, on the local dev stack with the rehearsal companion:
- **Storage (migration 0021, amendment A10):**
  - owner-only tables for the conversation, Sophia's suggested notes, kept notes and carried notes;
  - every write is a `sophia.*` function, idempotent per person and key, and holds the space before it reads its key (a retry racing its first attempt gets the same receipt);
  - one note at a time is carried to one project, and can be taken back;
  - a suggestion let go is deleted; erasure deletes the requests older than ten minutes and redacts the rest;
  - Sophia's welcome back after an hour of quiet.
- **API:** the personal routes, with a companion seam. Development uses the keyless rehearsal (`SOPHIA_COMPANION=rehearse`); with no companion, a message is refused before anything is kept.
- **Lost replies:** a reply lost with the process answering it reads as failed after two minutes, and can be asked for again (`personal_reply_state`).
- **Studio:**
  - the three places (home, Personal, Work) under one bar;
  - the padlock: passkey, provider or emailed code; a room locks it, every new call again; every tab follows it; in a call no provider is offered (it would end the call); nothing of a locked space is shown, and Back goes on past it;
  - Your data: copy everything (with the suggestions not decided yet; on Safari too), delete everything;
  - a call that goes on across places; "Join the room" from Work joins on that opening only;
  - for the keyboard and screen readers: Sophia's replies are said; a control that goes away hands the focus on; a letter typed from nowhere in Personal is text, never the padlock;
  - the draft stays on the device until it was sent; signing out and erasing forget it.
- **Readiness:** `/ready` fails while a personal function is missing.

Missing or unverified:
- **No live companion.** Sophia's answers in development are scripted. D1, the Companion agent on our runtime, is not built.
- **No real provider round trip.** The provider unlock was checked against local Supabase, with a second sign-in standing in for Google, GitHub or Microsoft.
- **Not deployed**, so the goal's hosted acceptance runs are open, and the privacy page is not written.
- **Copy on Safari:** the clipboard is handed the text as a promise, as WebKit requires; checked in Chromium only.
- **Two tabs, each in its own call:** leaving one opens a third tab that isn't in a call, while the other call goes on (the padlock is one value per device).
- **A draft whose send was under way when the page closed** comes back as the draft, even when the message was stored: it shows in the conversation above it.

## Evidence

- **Gates:**
  - format, lint, typecheck, contracts check and the Studio build;
  - unit tests: 411 pass, plus the 5 known failures on Windows (launch environment and bundle digest tests);
  - Studio tests: 186;
  - database tests: 215 (`pnpm test:db`);
  - the SQL run of the 21 migrations (`pnpm test:sql`).
- **Browser checks** (local stacks, synthetic identities):
  - on `:5176`: flows-places (36), room-flow (13), checks-ui (30), checks-call (6), popovers (8), and the 12 room suites;
  - this round: a lost wait turns into Ask again by itself and asking again gets a reply, and a locked Your data shows nothing (9 checks);
  - the provider return against local Supabase (8 checks).
- **Reviews:** Codex on `8bf2acf` found one P1 and four P2, all fixed. An independent review of the whole diff then found one P1 and eleven P2, all fixed in one push. Every logic fix has a test that fails without it (a mutation check), and the Studio wiring was checked by undoing it in the browser: personal-round5, 34 checks, each fix's scenario failing with the fix undone. The Safari copy can't fail in Chromium, so it has no such check.

## Decisions and changes

- **Direction:** C ("Two doors"), chosen in Luis's prototype rounds.
- **Kept data:** a suggestion the person lets go is deleted, not kept as declined; erasure keeps only the last ten minutes of request records (redacted), which a late retry needs.
- **Open for Davide** (goal §6, PR #21):
  - D5;
  - the Companion on the runtime;
  - where carried notes show inside a project;
  - member names;
  - the privacy page.

## To turn it on (owner actions)

1. Davide decides whether the personal space goes in, since it was parked.
2. Apply migration 0021 before deploying the API; `/ready` refuses otherwise.
3. Configure a companion for the API. Without one, personal messages are refused (503) and nothing is kept.

## Next bounded action

- After #24 merges, retarget #30 to main and resolve its conflicts: `App.tsx`, `route.ts` and its test, `ProjectHome.tsx` and CONTRIBUTING.
