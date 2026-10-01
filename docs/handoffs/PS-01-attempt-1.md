# Implementation-session handoff: PS-01 personal space, attempt 1

- **Goal:** [docs/goals/personal-space.md](../goals/personal-space.md). Anyone who signs up has a private space with Sophia, beside the work space. The goal is parked (Davide, 2026-09-30: team room first). Luis asked on 2026-09-30 to build it anyway, as a draft for Davide's call («La opción C. Debe ser un 1 to 1»).
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** first commit `c3f8968` on `studio/personal-space` (#30), 2026-09-30. On 2026-10-01 Luis asked to split it: the data and API on `personal/data` (from main `860a01a`), and the Studio's places on top of it (#30).
- **End:** each PR's head when merged, the data side first.
- **Writable scope:** this repository. **No hosted service was changed.** Migration 0021 is on no hosted database.

## Outcome

What works, on the local dev stack with the rehearsal companion:
- **Storage (migration 0021, amendment A10):**
  - owner-only tables for the conversation, Sophia's suggested notes, kept notes and carried notes;
  - every write is a `sophia.*` function, idempotent per person and key; each holds the person's space before it reads its key, so a retry racing its first attempt gets the same receipt;
  - one note at a time is carried to one project where its owner is a member, and can be taken back;
  - a suggestion let go is deleted;
  - a reply lost with the process answering it reads as failed after two minutes, and can be asked for again (`personal_reply_state`);
  - Sophia's welcome back after an hour of quiet.
- **Erasure:** the conversation, suggestions and notes are deleted; every request keeps only its key, dated at the erasure, so a retry from before writes nothing however late it comes; carried notes stay in their projects, still the person's. The space's revision and its turn order go on.
- **Limits:** a space keeps at most 2000 notes and a person carries at most 2000 (each refused by its own code), so every one is listed; the lists are bounded as the contract says, and a project's carried notes list the reader's own first.
- **Who may write:** only the API role can call the personal writers.
- **API:** the personal routes, the project list with who is in each room (one question finds the occupied rooms; only those are asked, a few at a time), readiness that requires every personal function, and the companion behind one interface: the keyless rehearsal in development (`SOPHIA_COMPANION=rehearse`); none in production, where a message is refused before anything is kept. A companion's failure is logged by its name and code only. The API claims a turn, and a welcome under its key, before it asks the companion, so one process asks.
- **Studio** (#30, on top of the data side):
  - the three places (home, Personal, Work) under one bar, built from the Studio's own controls;
  - the padlock: one value per device and account (never the address, which can change); the person shuts it and so does every call; a call's end opens nothing; only the person opens it, by confirming it's them (a passkey or an emailed code on a client of its own, so the app's session is never touched; or the provider they signed in with, as a new sign-in);
  - Your data: copy everything (with the suggestions not decided yet), delete everything;
  - a call that goes on across the places, with its switches, text mode, what Sophia is looking at and what stopped a device in the places' bar; opening another project leaves it, and says so; "Join the room" from Work joins on that opening only;
  - for the keyboard and screen readers: Sophia's replies are said once; a letter typed with the focus nowhere in Personal goes into the message bar (never the padlock), and never into a field the notes cover; a modal sheet takes every key; the focus is handed on wherever a control goes away;
  - a message's words stay on the device until they were sent, also while they are on their way, and come back when a send fails or gets no answer; not when the space was erased.

Missing or unverified:
- **No live companion.** Sophia's answers in development are scripted. D1, the Companion agent on our runtime, is not built.
- **No real provider round trip.** The provider unlock was checked against local Supabase, with a second sign-in standing in for Google, GitHub or Microsoft.
- **No real passkey.** Passkeys aren't offered on a local host; the passkey check's outcomes are unit-tested, and it runs on the same client as the email code, which was checked against local Supabase.
- **The code in the email.** The local Supabase template sends a link without the code, so the local check used a code from the local Auth admin API. Unlocking with a code needs the code in the hosted template, as the sign-in screen's code already does.
- **Not deployed**, so the goal's hosted acceptance runs are open, and the privacy page is not written.
- **Copy on Safari:** the clipboard is handed the text as a promise, as WebKit requires; checked in Chromium only.
- **Unlocking opens every tab of the device**, also one in a call that may be sharing its screen (accepted: the person asked for it).

## Evidence

- **Gates:** format, lint, typecheck, contracts check and the Studio build; unit tests: 492 pass, plus the 5 known failures on Windows (launch environment and bundle digest tests); Studio tests: 271; database tests: 225 (`pnpm test:db`); the SQL run of the 21 migrations (`pnpm test:sql`).
- **Browser checks** (local stacks, synthetic identities and accounts, this branch's own Studio):
  - the second review round (`personal-round6`): the padlock across a call, stray typing with a project kept for its call, the notes covering the conversation, touch, the focus handed on, another tab's unlock, a send with no answer and one refused as erased, the places' bar in a call, a check under way when another tab unlocks;
  - the code review's fixes (`personal-round7`): another project leaves the call, nothing personal in memory while locked in a project, the focus after a menu's sheet and after Leave, the notes while loading, a waiting press, a sheet in a project out of sight, a refused keep, the draft while a message is on its way, a lock and the screen reader;
  - unlocking against local Supabase (`unlock-supabase`): the code checked on its own client (the app's session untouched, nothing stored, the check's session ended), a wrong code, a lost connection, a check and ways with no answer (20 s), another account;
  - the earlier suites on this Studio: the previous rounds (31 checks), the places’ keys and flows (37), a call across the places (13), the call and interface checks (6, 33 and 8), and the room’s suites from #24 (43).
- **Mutation checks:** every logic fix has a unit or database test that fails without it; every fix the tests can't reach was undone in the browser to see its scenario fail (this round, 4 Studio rules, 7 database rules and 4 API rules each failed their test before the fix, and of 10 browser fixes undone 9 were caught by their scenario, the tenth being backed by a second mechanism the scenario also exercises; the second round, 14 rules and 22 browser fixes, all caught).
- **Reviews:**
  - Codex on `8bf2acf`: one P1 and four P2, all fixed;
  - an independent review of #30's whole diff: one P1 and eleven P2, all fixed;
  - the second round's design, reviewed three times before any code;
  - independent code reviews of both halves (data: one P1, four P2, six P3; Studio: one P1, four P2, eleven P3), all fixed after a review of the fixes' design.
  - Codex on #35's `d3c98de`: four P2 (one process per answer, the welcome's key, the room server asked about every room, a suggestion of another turn), and on #30's `462c60e`: three P2 (a copy after a lock, overlapping sends, signing out where storage is blocked), all fixed, each undone once to see its test fail.

## Decisions and changes

- **Direction:** C ("Two doors"), chosen in Luis's prototype rounds.
- **The padlock (Luis, 2026-10-01):** a call shuts it and only the person opens it. The prototype's "a room's lock lifts on leaving" is dropped, so no tab ever has to decide whether another tab's call goes on.
- **Split (Luis, 2026-10-01):** the data and API in their own PR, the Studio on top.
- **One call in sight:** opening another project leaves the call, and the toast says so. A project's bar has no room for another room's call (measured: it breaks the bar at 360–390 px and squeezes the views at 800 px), and nothing may keep sending out of sight.
- **Kept data:** a suggestion the person lets go is deleted, not kept as declined. Erasure keeps the key of every request (a retry needs it, however late), the space's revision and turn order, and its own receipt; a forgotten note's keep keeps no digest of it.
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
4. Keep the code in the hosted email template: unlocking with an emailed code types it, as signing in with one does.

## Next bounded action

- Review and merge the data side, then the Studio (#30); then Davide's decisions above.
